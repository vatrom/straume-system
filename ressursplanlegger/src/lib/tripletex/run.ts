import { prisma } from "../db";
import { dateToIso, isoToDate, todayIso } from "../dates";
import { applyEmployeeImports, applyProjectImports } from "./apply";
import { createTripletexApi } from "./client";
import { readTripletexConfig } from "./config";
import type { LocalProject, LocalResource } from "./import";
import { emptyCounts, runSyncPipeline, type SyncReport } from "./pipeline";
import type { SyncLinks } from "./sync";

export type { SyncReport };

function linksFromRows(
  resources: { id: string; tripletexEmployeeId: number | null }[],
  projects: { id: string; tripletexProjectId: number | null; tripletexProjectNumber: string }[],
): SyncLinks {
  const employeeToResource = new Map<number, string>();
  for (const resource of resources) {
    if (resource.tripletexEmployeeId != null) employeeToResource.set(resource.tripletexEmployeeId, resource.id);
  }
  const projectIdToProject = new Map<number, string>();
  const projectNumberToProject = new Map<string, string>();
  for (const project of projects) {
    if (project.tripletexProjectId != null) projectIdToProject.set(project.tripletexProjectId, project.id);
    if (project.tripletexProjectNumber) projectNumberToProject.set(project.tripletexProjectNumber, project.id);
  }
  return { employeeToResource, projectIdToProject, projectNumberToProject };
}

async function loadResources(): Promise<LocalResource[]> {
  const rows = await prisma.resource.findMany({
    select: {
      id: true,
      name: true,
      tripletexEmployeeId: true,
      innleid: true,
      planExcluded: true,
      active: true,
      _count: { select: { assignments: true, phaseAssignments: true, timeEntries: true, absences: true } },
    },
  });
  return rows.map((resource) => ({
    id: resource.id,
    name: resource.name,
    tripletexEmployeeId: resource.tripletexEmployeeId,
    innleid: resource.innleid,
    planExcluded: resource.planExcluded,
    active: resource.active,
    hasHistory:
      resource._count.assignments +
        resource._count.phaseAssignments +
        resource._count.timeEntries +
        resource._count.absences >
      0,
  }));
}

async function loadProjects(): Promise<LocalProject[]> {
  const rows = await prisma.project.findMany({
    select: {
      id: true,
      name: true,
      customer: true,
      tripletexProjectId: true,
      tripletexProjectNumber: true,
      startDate: true,
      endDate: true,
      status: true,
      archived: true,
      syncIgnored: true,
      _count: { select: { assignments: true } },
      phases: { select: { _count: { select: { assignments: true } } } },
    },
  });
  return rows.map((project) => ({
    id: project.id,
    name: project.name,
    customer: project.customer,
    tripletexProjectId: project.tripletexProjectId,
    tripletexProjectNumber: project.tripletexProjectNumber,
    startDate: dateToIso(project.startDate),
    endDate: project.endDate ? dateToIso(project.endDate) : null,
    status: project.status,
    archived: project.archived,
    syncIgnored: project.syncIgnored,
    hasAllocations:
      project._count.assignments > 0 || project.phases.some((phase) => phase._count.assignments > 0),
  }));
}

export async function runTripletexSync(): Promise<SyncReport> {
  const config = readTripletexConfig();
  if (!config.configured) {
    return {
      ok: false,
      disabled: true,
      ...emptyCounts,
      warnings: [],
      message: "Tripletex er ikke satt opp. Legg inn nøkkel i miljøvariablene.",
    };
  }

  let api: Awaited<ReturnType<typeof createTripletexApi>>;
  try {
    api = await createTripletexApi(config);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kunne ikke logge på Tripletex.";
    await prisma.integrationState.upsert({
      where: { id: "tripletex" },
      create: { id: "tripletex", lastSyncAt: new Date(), lastSyncOk: false, lastSyncMessage: message },
      update: { lastSyncAt: new Date(), lastSyncOk: false, lastSyncMessage: message },
    });
    return { ok: false, ...emptyCounts, warnings: [message], message };
  }
  if (!api) {
    return {
      ok: false,
      disabled: true,
      ...emptyCounts,
      warnings: [],
      message: "Tripletex er ikke satt opp.",
    };
  }

  return runSyncPipeline({
    today: todayIso(),
    employees: () => api.employees(),
    employments: () => api.employments(),
    projects: () => api.projects(),
    entries: (dateFrom, dateTo) => api.entries(dateFrom, dateTo),
    weeks: (employeeIds, weekYear) => api.weeks(employeeIds, weekYear),
    loadResources,
    loadProjects,
    applyEmployees: (changes) => applyEmployeeImports(changes),
    applyProjects: (changes) => applyProjectImports(changes),
    loadLinks: async () => {
      const [resources, projects] = await Promise.all([
        prisma.resource.findMany({ select: { id: true, tripletexEmployeeId: true } }),
        prisma.project.findMany({
          select: { id: true, tripletexProjectId: true, tripletexProjectNumber: true, syncIgnored: true },
        }),
      ]);
      return {
        links: linksFromRows(
          resources,
          projects.filter((project) => !project.syncIgnored),
        ),
        ignoredProjectIds: projects
          .filter((project) => project.syncIgnored && project.tripletexProjectId != null)
          .map((project) => project.tripletexProjectId as number),
      };
    },
    writeEntry: async (entry) => {
      const data = {
        date: isoToDate(entry.date),
        hours: entry.hours,
        comment: entry.comment,
        source: "tripletex",
        tripletexEmployeeId: entry.tripletexEmployeeId,
        tripletexProjectId: entry.tripletexProjectId,
        employeeName: entry.employeeName,
        projectLabel: entry.projectLabel,
        resourceId: entry.resourceId,
        projectId: entry.projectId,
        unmappedReason: entry.unmappedReason,
      };
      const existing = await prisma.timeEntry.findUnique({ where: { externalId: entry.externalId } });
      if (!existing) {
        await prisma.timeEntry.create({ data: { ...data, externalId: entry.externalId } });
        return "inserted";
      }
      const same =
        dateToIso(existing.date) === entry.date &&
        existing.hours === entry.hours &&
        existing.comment === entry.comment &&
        existing.resourceId === entry.resourceId &&
        existing.projectId === entry.projectId &&
        existing.unmappedReason === entry.unmappedReason;
      if (same) return "unchanged";
      await prisma.timeEntry.update({ where: { externalId: entry.externalId }, data });
      return "updated";
    },
    saveState: async (ok, message) => {
      await prisma.integrationState.upsert({
        where: { id: "tripletex" },
        create: { id: "tripletex", lastSyncAt: new Date(), lastSyncOk: ok, lastSyncMessage: message },
        update: { lastSyncAt: new Date(), lastSyncOk: ok, lastSyncMessage: message },
      });
    },
  });
}
