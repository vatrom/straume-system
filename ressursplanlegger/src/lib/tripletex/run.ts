import { prisma } from "../db";
import { dateToIso, todayIso } from "../dates";
import { isoToDate } from "../dates";
import { createTripletexApi } from "./client";
import { readTripletexConfig } from "./config";
import {
  classifyEntries,
  incompleteWeekCount,
  syncWindow,
  weekYearsBetween,
  type SyncLinks,
} from "./sync";

export type SyncReport = {
  ok: boolean;
  disabled?: boolean;
  inserted: number;
  updated: number;
  unchanged: number;
  unmapped: number;
  incompleteWeeks: number;
  message: string;
};

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

export async function runTripletexSync(): Promise<SyncReport> {
  const config = readTripletexConfig();
  if (!config.configured) {
    return {
      ok: false,
      disabled: true,
      inserted: 0,
      updated: 0,
      unchanged: 0,
      unmapped: 0,
      incompleteWeeks: 0,
      message: "Tripletex er ikke satt opp. Legg inn nøkkel i miljøvariablene.",
    };
  }

  try {
    const api = await createTripletexApi(config);
    if (!api) {
      return {
        ok: false,
        disabled: true,
        inserted: 0,
        updated: 0,
        unchanged: 0,
        unmapped: 0,
        incompleteWeeks: 0,
        message: "Tripletex er ikke satt opp.",
      };
    }

    const today = todayIso();
    const window = syncWindow(today);
    const [resources, projects, entries] = await Promise.all([
      prisma.resource.findMany({ select: { id: true, tripletexEmployeeId: true } }),
      prisma.project.findMany({
        select: { id: true, tripletexProjectId: true, tripletexProjectNumber: true },
      }),
      api.entries(window.dateFrom, window.dateTo),
    ]);
    const classified = classifyEntries(entries, linksFromRows(resources, projects));
    const employeeIds = [...new Set(entries.map((entry) => entry.employeeId))];
    const weeks = (
      await Promise.all(weekYearsBetween(window.dateFrom, window.dateTo).map((weekYear) => api.weeks(employeeIds, weekYear)))
    ).flat();
    const incompleteWeeks = incompleteWeekCount(weeks);

    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    for (const entry of classified) {
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
        inserted += 1;
        continue;
      }
      const same =
        dateToIso(existing.date) === entry.date &&
        existing.hours === entry.hours &&
        existing.comment === entry.comment &&
        existing.resourceId === entry.resourceId &&
        existing.projectId === entry.projectId &&
        existing.unmappedReason === entry.unmappedReason;
      if (same) {
        unchanged += 1;
        continue;
      }
      await prisma.timeEntry.update({ where: { externalId: entry.externalId }, data });
      updated += 1;
    }

    const unmapped = classified.filter((entry) => entry.unmappedReason).length;
    const message = [
      `Hentet ${classified.length} timer.`,
      `${inserted} nye, ${updated} oppdatert, ${unchanged} uendret.`,
      unmapped > 0 ? `${unmapped} uten kobling.` : "Alle er koblet.",
      incompleteWeeks > 0 ? `${incompleteWeeks} uker er ikke markert fullført i Tripletex.` : "",
    ]
      .filter(Boolean)
      .join(" ");

    await prisma.integrationState.upsert({
      where: { id: "tripletex" },
      create: { id: "tripletex", lastSyncAt: new Date(), lastSyncOk: true, lastSyncMessage: message },
      update: { lastSyncAt: new Date(), lastSyncOk: true, lastSyncMessage: message },
    });

    return { ok: true, inserted, updated, unchanged, unmapped, incompleteWeeks, message };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kunne ikke hente timer fra Tripletex.";
    await prisma.integrationState.upsert({
      where: { id: "tripletex" },
      create: { id: "tripletex", lastSyncAt: new Date(), lastSyncOk: false, lastSyncMessage: message },
      update: { lastSyncAt: new Date(), lastSyncOk: false, lastSyncMessage: message },
    });
    return {
      ok: false,
      inserted: 0,
      updated: 0,
      unchanged: 0,
      unmapped: 0,
      incompleteWeeks: 0,
      message,
    };
  }
}
