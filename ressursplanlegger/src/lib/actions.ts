"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireUser } from "./auth";
import { loadInputs } from "./data";
import { prisma } from "./db";
import { addDays, dateToIso, isoToDate, isValidIso } from "./dates";
import { PROJECT_COLORS, parseDecimal } from "./format";
import { previewAssignment, type AssignmentInput, type PhaseInput, type ProjectInput, type ProjectStatus } from "./planning";

export type FormState = { error: string } | null;

function text(value: FormDataEntryValue | null, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, max);
}

function checked(formData: FormData, name: string): boolean {
  return formData.getAll(name).map(String).includes("true");
}

function refresh() {
  revalidatePath("/", "layout");
}

export async function createResource(_prev: FormState, formData: FormData): Promise<FormState> {
  return saveResource(null, formData);
}

export async function updateResource(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  return saveResource(id, formData);
}

async function saveResource(id: string | null, formData: FormData): Promise<FormState> {
  await requireUser();
  const name = text(formData.get("name"), 80);
  const role = text(formData.get("role"), 60);
  const weekly = parseDecimal(formData.get("weeklyCapacityHours"));
  const active = checked(formData, "active");
  if (!name) return { error: "Skriv inn navnet." };
  if (!role) return { error: "Skriv inn fag, for eksempel tømrer." };
  if (weekly == null || weekly <= 0 || weekly > 80) {
    return { error: "Ukekapasitet må være et tall mellom 0 og 80." };
  }

  const data = { name, role, weeklyCapacityHours: weekly, active };
  if (id) {
    await prisma.resource.update({ where: { id }, data });
  } else {
    await prisma.resource.create({ data });
  }
  refresh();
  redirect("/ressurser");
}

export async function deleteResource(id: string) {
  await requireUser();
  await prisma.resource.delete({ where: { id } });
  refresh();
  redirect("/ressurser");
}

export async function addAbsence(
  resourceId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireUser();
  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");
  const reason = text(formData.get("reason"), 40) || "Ferie";
  if (!isValidIso(startDate) || !isValidIso(endDate)) {
    return { error: "Velg både fra-dato og til-dato." };
  }
  if (endDate < startDate) return { error: "Til-dato kan ikke være før fra-dato." };
  await prisma.absence.create({
    data: {
      resourceId,
      startDate: isoToDate(startDate),
      endDate: isoToDate(endDate),
      reason,
    },
  });
  refresh();
  return null;
}

export async function deleteAbsence(id: string) {
  await requireUser();
  const absence = await prisma.absence.delete({ where: { id } });
  refresh();
  redirect(`/ressurser/${absence.resourceId}`);
}

export async function createProject(_prev: FormState, formData: FormData): Promise<FormState> {
  return saveProject(null, formData);
}

export async function updateProject(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  return saveProject(id, formData);
}

async function saveProject(id: string | null, formData: FormData): Promise<FormState> {
  await requireUser();
  const name = text(formData.get("name"), 100);
  const customer = text(formData.get("customer"), 100);
  const address = text(formData.get("address"), 140);
  const startDate = String(formData.get("startDate") ?? "");
  const endRaw = String(formData.get("endDate") ?? "");
  const endDate = endRaw ? endRaw : null;
  const estimatedHours = parseDecimal(formData.get("estimatedHours"));
  const statusRaw = String(formData.get("status") ?? "planlagt");
  const status: ProjectStatus =
    statusRaw === "pågår" || statusRaw === "ferdig" || statusRaw === "planlagt" || statusRaw === "tentativ"
      ? statusRaw
      : "planlagt";
  const color = PROJECT_COLORS.includes(String(formData.get("color")))
    ? String(formData.get("color"))
    : PROJECT_COLORS[0];
  const resourceIds = [...new Set(formData.getAll("resourceIds").map(String).filter(Boolean))];
  const phases = parsePhases(formData.get("phasesJson"));
  if (phases === "invalid") return { error: "Fasene kunne ikke leses. Prøv igjen." };

  if (!name) return { error: "Skriv inn prosjektnavn." };
  const usingPhases = Array.isArray(phases) && phases.length > 0;
  if (!usingPhases) {
    if (!isValidIso(startDate)) return { error: "Velg oppstartsdato." };
    if (endDate && !isValidIso(endDate)) return { error: "Sluttdato er ikke gyldig." };
    if (endDate && endDate < startDate) return { error: "Sluttdato kan ikke være før oppstart." };
  }
  const phaseHours = usingPhases ? phases.reduce((sum, phase) => sum + phase.estimatedHours, 0) : estimatedHours;
  if (phaseHours == null || phaseHours <= 0 || phaseHours > 100000) {
    return { error: "Skriv inn beregnede timeverk, for eksempel 240." };
  }
  if (usingPhases) {
    for (const phase of phases) {
      if (!phase.name) return { error: "Hver fase trenger et navn." };
      if (!isValidIso(phase.startDate)) return { error: `Velg oppstart for fasen «${phase.name || "uten navn"}».` };
      if (phase.endDate && phase.endDate < phase.startDate) return { error: `Slutt er før oppstart i fasen «${phase.name}».` };
      if (phase.assignments.length === 0) return { error: `Fasen «${phase.name}» har ingen personer.` };
    }
  }

  const phaseStart = usingPhases ? phases.map((phase) => phase.startDate).sort()[0] : startDate;
  const phaseEnds = usingPhases ? phases.map((phase) => phase.endDate) : [];
  const phaseEnd = usingPhases ? (phaseEnds.some((value) => !value) ? null : phaseEnds.sort().at(-1) ?? null) : endDate;

  const data = {
    name,
    customer,
    address,
    startDate: isoToDate(phaseStart),
    endDate: phaseEnd ? isoToDate(phaseEnd) : null,
    estimatedHours: phaseHours,
    status,
    color,
  };

  const saved = await prisma.$transaction(async (tx) => {
    const project = id
      ? await tx.project.update({ where: { id }, data })
      : await tx.project.create({ data });
    await tx.assignment.deleteMany({ where: { projectId: project.id } });
    await tx.phase.deleteMany({ where: { projectId: project.id } });
    if (usingPhases) {
      for (const [index, phase] of phases.entries()) {
        await tx.phase.create({
          data: {
            projectId: project.id,
            name: phase.name,
            startDate: isoToDate(phase.startDate),
            endDate: phase.endDate ? isoToDate(phase.endDate) : null,
            estimatedHours: phase.estimatedHours,
            sortOrder: index,
            assignments: {
              create: phase.assignments.map((assignment) => ({
                resourceId: assignment.resourceId,
                allocationPercent: assignment.allocationPercent,
              })),
            },
          },
        });
      }
    } else if (resourceIds.length > 0) {
      await tx.assignment.createMany({
        data: resourceIds.map((resourceId) => ({
          projectId: project.id,
          resourceId,
          allocationPercent: allocationOf(formData, resourceId),
        })),
      });
    }
    return project;
  });

  refresh();
  redirect(`/prosjekter/${saved.id}`);
}

export async function deleteProject(id: string) {
  await requireUser();
  await prisma.project.delete({ where: { id } });
  refresh();
  redirect("/prosjekter");
}

export async function deleteExampleData() {
  await requireAdmin();
  await prisma.$transaction([
    prisma.project.deleteMany({ where: { isExample: true } }),
    prisma.resource.deleteMany({ where: { isExample: true } }),
  ]);
  refresh();
  redirect("/");
}

export type PreviewPayload = {
  error?: string;
  from: string;
  to: string;
  perResource: {
    id: string;
    capacityHours: number;
    bookedHours: number;
    freeHours: number;
  }[];
  finishDate: string | null;
  unallocatedHours: number;
  peak: {
    resourceId: string;
    date: string;
    bookedHours: number;
    capacityHours: number;
  } | null;
  overloads: { resourceId: string; resourceName: string; role: string; label: string }[];
  suggestions: { forResourceId: string; id: string; name: string; role: string; freeHours: number }[];
};

export async function getAssignmentPreview(input: {
  startDate: string;
  endDate: string;
  estimatedHours: number;
  resourceIds: string[];
  assignments?: AssignmentInput[];
  phases?: PhaseInput[];
  excludeProjectId?: string;
}): Promise<PreviewPayload | null> {
  await requireUser();
  if (!isValidIso(input.startDate)) return null;
  const endDate = input.endDate && isValidIso(input.endDate) ? input.endDate : null;
  if (endDate && endDate < input.startDate) {
    return {
      error: "Sluttdato kan ikke være før oppstart.",
      from: input.startDate,
      to: input.startDate,
      perResource: [],
      finishDate: null,
      unallocatedHours: 0,
      peak: null,
      overloads: [],
      suggestions: [],
    };
  }

  const { resourceInputs, projectInputs } = await loadInputs();
  const draft: ProjectInput = {
    id: input.excludeProjectId || "utkast",
    name: "Utkast",
    startDate: input.startDate,
    endDate,
    estimatedHours: input.estimatedHours > 0 ? input.estimatedHours : 0,
    status: "planlagt",
    color: PROJECT_COLORS[0],
    resourceIds: input.resourceIds,
    assignments: input.assignments,
    phases: input.phases,
  };
  const preview = previewAssignment(resourceInputs, projectInputs, draft);
  return {
    from: preview.from,
    to: preview.to,
    perResource: preview.perResource,
    finishDate: preview.finishDate,
    unallocatedHours: preview.unallocatedHours,
    peak: preview.peak,
    overloads: preview.overloads.map((span) => ({
      resourceId: span.resourceId,
      resourceName: span.resourceName,
      role: span.role,
      label: span.label,
    })),
    suggestions: preview.suggestions,
  };
}

function allocationOf(formData: FormData, resourceId: string): number {
  const value = parseDecimal(formData.get(`allocation-${resourceId}`));
  if (value == null) return 100;
  return Math.min(100, Math.max(1, value));
}

type ParsedPhase = {
  name: string;
  startDate: string;
  endDate: string | null;
  estimatedHours: number;
  assignments: AssignmentInput[];
};

function parsePhases(value: FormDataEntryValue | null): ParsedPhase[] | "invalid" | null {
  if (typeof value !== "string" || !value.trim() || value.trim() === "[]") return null;
  let raw: unknown;
  try {
    raw = JSON.parse(value);
  } catch {
    return "invalid";
  }
  if (!Array.isArray(raw)) return "invalid";
  if (raw.length === 0) return null;
  const phases: ParsedPhase[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return "invalid";
    const row = item as Record<string, unknown>;
    const hours = typeof row.estimatedHours === "number" ? row.estimatedHours : Number(String(row.estimatedHours ?? "").replace(",", "."));
    const assignments = Array.isArray(row.assignments) ? row.assignments : [];
    phases.push({
      name: String(row.name ?? "").trim().slice(0, 80),
      startDate: String(row.startDate ?? ""),
      endDate: row.endDate ? String(row.endDate) : null,
      estimatedHours: Number.isFinite(hours) ? hours : 0,
      assignments: assignments
        .map((assignment) => {
          const record = assignment as Record<string, unknown>;
          const percent = Number(record.allocationPercent ?? 100);
          return {
            resourceId: String(record.resourceId ?? ""),
            allocationPercent: Number.isFinite(percent) ? Math.min(100, Math.max(1, percent)) : 100,
          };
        })
        .filter((assignment) => assignment.resourceId),
    });
  }
  return phases;
}

export async function convertTentative(id: string) {
  await requireUser();
  await prisma.project.update({ where: { id }, data: { status: "planlagt" } });
  refresh();
  redirect(`/prosjekter/${id}`);
}

export async function shiftSchedule(input: { projectId: string; phaseId: string | null; days: number }) {
  await requireUser();
  const days = Math.round(input.days);
  if (!Number.isFinite(days) || days === 0 || Math.abs(days) > 370) return { error: "Ugyldig flytting." };
  const project = await prisma.project.findUnique({ where: { id: input.projectId }, include: { phases: true } });
  if (!project) return { error: "Fant ikke prosjektet." };
  const move = (date: Date) => isoToDate(addDays(dateToIso(date), days));
  if (input.phaseId) {
    const phase = project.phases.find((item) => item.id === input.phaseId);
    if (!phase) return { error: "Fant ikke fasen." };
    await prisma.phase.update({
      where: { id: phase.id },
      data: { startDate: move(phase.startDate), endDate: phase.endDate ? move(phase.endDate) : null },
    });
  } else {
    await prisma.$transaction([
      prisma.project.update({
        where: { id: project.id },
        data: { startDate: move(project.startDate), endDate: project.endDate ? move(project.endDate) : null },
      }),
      ...project.phases.map((phase) =>
        prisma.phase.update({
          where: { id: phase.id },
          data: { startDate: move(phase.startDate), endDate: phase.endDate ? move(phase.endDate) : null },
        }),
      ),
    ]);
  }
  refresh();
  return { ok: true as const };
}

export async function movePersonBetweenProjects(input: { fromProjectId: string; toProjectId: string; resourceId: string }) {
  await requireUser();
  if (input.fromProjectId === input.toProjectId) return { error: "Personen er allerede på prosjektet." };
  const from = await prisma.project.findUnique({
    where: { id: input.fromProjectId },
    include: { phases: true, assignments: true },
  });
  const to = await prisma.project.findUnique({
    where: { id: input.toProjectId },
    include: { phases: true, assignments: true },
  });
  if (!from || !to) return { error: "Fant ikke prosjektet." };
  if (from.phases.length > 0 || to.phases.length > 0) return { error: "Prosjekter med faser endres i skjemaet." };
  const current = from.assignments.find((assignment) => assignment.resourceId === input.resourceId);
  if (!current) return { error: "Personen er ikke på prosjektet." };
  await prisma.$transaction(async (tx) => {
    await tx.assignment.delete({ where: { id: current.id } });
    if (!to.assignments.some((assignment) => assignment.resourceId === input.resourceId)) {
      await tx.assignment.create({
        data: {
          projectId: to.id,
          resourceId: input.resourceId,
          allocationPercent: current.allocationPercent,
        },
      });
    }
  });
  refresh();
  return { ok: true as const };
}

export async function reassignPerson(input: { projectId: string; fromResourceId: string; toResourceId: string }) {
  await requireUser();
  if (input.fromResourceId === input.toResourceId) return { error: "Velg en annen person." };
  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    include: { phases: true, assignments: true },
  });
  if (!project) return { error: "Fant ikke prosjektet." };
  if (project.phases.length > 0) return { error: "Prosjekt med faser endres i skjemaet." };
  const current = project.assignments.find((assignment) => assignment.resourceId === input.fromResourceId);
  if (!current) return { error: "Personen er ikke på prosjektet." };
  const target = await prisma.resource.findUnique({ where: { id: input.toResourceId } });
  if (!target?.active) return { error: "Personen er ikke aktiv." };
  await prisma.$transaction(async (tx) => {
    const existing = project.assignments.find((assignment) => assignment.resourceId === input.toResourceId);
    if (existing) {
      await tx.assignment.delete({ where: { id: current.id } });
    } else {
      await tx.assignment.update({ where: { id: current.id }, data: { resourceId: input.toResourceId } });
    }
  });
  refresh();
  return { ok: true as const };
}
