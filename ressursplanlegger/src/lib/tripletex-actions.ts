"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "./auth";
import { prisma } from "./db";
import { dateToIso, todayIso } from "./dates";
import { applyEmployeeImports, applyProjectImports } from "./tripletex/apply";
import { createTripletexApi } from "./tripletex/client";
import { readTripletexConfig } from "./tripletex/config";
import { employmentWindow, selectCurrentEmployees } from "./tripletex/employment";
import { planEmployeeImports, planProjectImports, type LocalProject, type LocalResource } from "./tripletex/import";
import { runTripletexSync, type SyncReport } from "./tripletex/run";

function refresh() {
  revalidatePath("/");
  revalidatePath("/tripletex");
  revalidatePath("/prosjekter");
  revalidatePath("/ressurser");
}

export async function syncTripletex(): Promise<SyncReport> {
  await requireUser();
  const report = await runTripletexSync();
  refresh();
  return report;
}

export async function saveTripletexLinks(_prev: { error?: string; ok?: string } | null, formData: FormData) {
  await requireUser();
  const resources = await prisma.resource.findMany({ select: { id: true } });
  const projects = await prisma.project.findMany({ select: { id: true } });
  await prisma.$transaction(async (tx) => {
    for (const resource of resources) {
      const raw = String(formData.get(`employee-${resource.id}`) ?? "");
      const id = raw ? Number(raw) : null;
      await tx.resource.update({
        where: { id: resource.id },
        data: { tripletexEmployeeId: id != null && Number.isFinite(id) ? id : null },
      });
    }
    for (const project of projects) {
      const raw = String(formData.get(`project-${project.id}`) ?? "");
      if (!raw) {
        await tx.project.update({
          where: { id: project.id },
          data: { tripletexProjectId: null, tripletexProjectNumber: "" },
        });
        continue;
      }
      const [idRaw, number = ""] = raw.split("|");
      const id = Number(idRaw);
      await tx.project.update({
        where: { id: project.id },
        data: {
          tripletexProjectId: Number.isFinite(id) ? id : null,
          tripletexProjectNumber: number,
        },
      });
    }
  });
  refresh();
  return { ok: "Koblingene er lagret." };
}

export async function importTripletexCatalog(kind: "ansatte" | "prosjekter") {
  await requireUser();
  const config = readTripletexConfig();
  if (!config.configured) return { error: "Tripletex er ikke satt opp." };
  try {
    const api = await createTripletexApi(config);
    if (!api) return { error: "Tripletex er ikke satt opp." };
    if (kind === "ansatte") {
      const [employees, jobs] = await Promise.all([api.employees(), api.employments()]);
      if (employees.length > 0 && jobs.length === 0) {
        return { error: "Tripletex returnerte ansatte uten ansettelser. Ingen ressurser ble endret." };
      }
      const period = employmentWindow(todayIso());
      const current = selectCurrentEmployees(employees, jobs, period.from, period.to);
      const resources = await prisma.resource.findMany({
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
      const local: LocalResource[] = resources.map((resource) => ({
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
      const plan = planEmployeeImports(current, local);
      const result = await applyEmployeeImports(plan);
      const skipped = plan.filter((change) => change.kind === "skip" && change.reason === "possible-duplicate").length;
      refresh();
      return {
        ok: `Koblet ${result.linked} og la inn ${result.created} ressurser. ${result.removed} uten ansettelse fjernet, ${result.deactivated} skjult.${skipped ? ` ${skipped} mulige dubletter ble ikke opprettet.` : ""} Fag er ikke hentet fra aktiviteten.`,
      };
    }
    const remote = await api.projects();
    const projects = await prisma.project.findMany({
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
    const local: LocalProject[] = projects.map((project) => ({
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
    const plan = planProjectImports(remote, local, todayIso());
    const result = await applyProjectImports(plan);
    const skipped = plan.filter((change) => change.kind === "skip").length;
    const kept = plan.filter((change) => change.kind === "keep").length;
    refresh();
    return {
      ok: `La inn ${result.created} prosjekter og oppdaterte ${result.updated}.${result.archived ? ` ${result.archived} arkivert.` : ""}${kept ? ` ${kept} interne med tildeling beholdt.` : ""}${skipped ? ` ${skipped} hoppet over.` : ""} Fyll inn timer og ressurser før de belaster planen.`,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Kunne ikke hente fra Tripletex." };
  }
}
