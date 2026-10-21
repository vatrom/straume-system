"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "./auth";
import { prisma } from "./db";
import { todayIso, isoToDate } from "./dates";
import { createTripletexApi } from "./tripletex/client";
import { readTripletexConfig } from "./tripletex/config";
import { bestEmployeeMatch, bestProjectMatch } from "./tripletex/match";
import { runTripletexSync, type SyncReport } from "./tripletex/run";

function refresh() {
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
      const employees = await api.employees();
      const resources = await prisma.resource.findMany();
      let created = 0;
      for (const employee of employees) {
        if (resources.some((resource) => resource.tripletexEmployeeId === employee.id)) continue;
        const name = `${employee.firstName} ${employee.lastName}`.trim();
        const suggested = bestEmployeeMatch(name, [employee]);
        const existing = resources.find((resource) => resource.tripletexEmployeeId == null && bestEmployeeMatch(resource.name, [employee]) === suggested && suggested === employee.id);
        if (existing) {
          await prisma.resource.update({ where: { id: existing.id }, data: { tripletexEmployeeId: employee.id } });
          existing.tripletexEmployeeId = employee.id;
          continue;
        }
        await prisma.resource.create({
          data: {
            name: name || `Ansatt ${employee.id}`,
            role: "Ukjent",
            weeklyCapacityHours: 37.5,
            tripletexEmployeeId: employee.id,
          },
        });
        created += 1;
      }
      refresh();
      return { ok: created > 0 ? `La inn ${created} nye ressurser. Fag er ikke hentet fra aktiviteten.` : "Ingen nye ansatte å legge inn." };
    }
    const remote = await api.projects();
    const projects = await prisma.project.findMany();
    let created = 0;
    for (const project of remote) {
      if (projects.some((item) => item.tripletexProjectId === project.id)) continue;
      const matchId = bestProjectMatch(project.name, [project]);
      const existing = projects.find((item) => !item.tripletexProjectId && bestProjectMatch(item.name, [project]) === matchId);
      if (existing) {
        await prisma.project.update({
          where: { id: existing.id },
          data: { tripletexProjectId: project.id, tripletexProjectNumber: project.number },
        });
        existing.tripletexProjectId = project.id;
        continue;
      }
      await prisma.project.create({
        data: {
          name: project.name || `Prosjekt ${project.number || project.id}`,
          startDate: isoToDate(todayIso()),
          estimatedHours: 0,
          status: "planlagt",
          tripletexProjectId: project.id,
          tripletexProjectNumber: project.number,
        },
      });
      created += 1;
    }
    refresh();
    return { ok: created > 0 ? `La inn ${created} prosjekter uten timeverk. Fyll inn timer før de belaster planen.` : "Ingen nye prosjekter å legge inn." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Kunne ikke hente fra Tripletex." };
  }
}
