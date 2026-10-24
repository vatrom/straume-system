"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "./auth";
import { prisma } from "./db";
import { isoToDate, isValidIso } from "./dates";
import { parseDecimal } from "./format";
import type { FormState } from "./actions";

function refresh(projectId: string) {
  revalidatePath(`/prosjekter/${projectId}`);
  revalidatePath("/prosjekter");
}

export async function addTimeEntry(projectId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const date = String(formData.get("date") ?? "");
  const resourceId = String(formData.get("resourceId") ?? "");
  const hours = parseDecimal(formData.get("hours"));
  const comment = String(formData.get("comment") ?? "").trim().slice(0, 200);
  if (!isValidIso(date)) return { error: "Velg dato." };
  if (!resourceId) return { error: "Velg person." };
  if (hours == null || hours <= 0 || hours > 24) return { error: "Timer må være mellom 0 og 24." };
  const resource = await prisma.resource.findUnique({ where: { id: resourceId } });
  if (!resource) return { error: "Fant ikke personen." };
  await prisma.timeEntry.create({
    data: {
      projectId,
      resourceId,
      date: isoToDate(date),
      hours,
      comment,
      source: "manuell",
      employeeName: resource.name,
    },
  });
  refresh(projectId);
  return null;
}

export async function deleteTimeEntry(id: string, projectId: string) {
  await requireUser();
  await prisma.timeEntry.delete({ where: { id } });
  refresh(projectId);
}

export async function importTimeCsv(projectId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Velg en CSV-fil." };
  if (file.size > 1_000_000) return { error: "Filen er for stor." };
  const text = (await file.text()).replace(/^\uFEFF/, "");
  const resources = await prisma.resource.findMany();
  const byName = new Map(resources.map((resource) => [resource.name.toLocaleLowerCase("nb"), resource]));
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return { error: "Filen trenger en overskriftsrad og minst én time." };
  const delimiter = lines[0].includes(";") ? ";" : ",";
  const rows = lines.slice(1);
  const created: {
    projectId: string;
    resourceId: string;
    date: Date;
    hours: number;
    comment: string;
    source: string;
    employeeName: string;
  }[] = [];
  const errors: string[] = [];
  rows.forEach((line, index) => {
    const cells = line.split(delimiter).map((cell) => cell.trim().replace(/^"|"$/g, ""));
    const [date, name, hoursRaw, comment = ""] = cells;
    const resource = byName.get((name ?? "").toLocaleLowerCase("nb"));
    const hours = Number((hoursRaw ?? "").replace(/\s/g, "").replace(",", "."));
    if (!isValidIso(date ?? "")) errors.push(`Rad ${index + 2}: ugyldig dato.`);
    else if (!resource) errors.push(`Rad ${index + 2}: fant ikke «${name ?? ""}».`);
    else if (!Number.isFinite(hours) || hours <= 0 || hours > 24) errors.push(`Rad ${index + 2}: ugyldig timetall.`);
    else {
      created.push({
        projectId,
        resourceId: resource.id,
        date: isoToDate(date),
        hours,
        comment: comment.slice(0, 200),
        source: "csv",
        employeeName: resource.name,
      });
    }
  });
  if (errors.length > 0) return { error: errors.slice(0, 4).join(" ") };
  if (created.length === 0) return { error: "Ingen timer å importere." };
  await prisma.timeEntry.createMany({ data: created });
  refresh(projectId);
  return { error: `La inn ${created.length} timer fra CSV.` };
}
