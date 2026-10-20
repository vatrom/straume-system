"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "./auth";
import { loadInputs } from "./data";
import { prisma } from "./db";
import { isoToDate, isValidIso } from "./dates";
import { PROJECT_COLORS, parseDecimal } from "./format";
import { previewAssignment, type ProjectInput, type ProjectStatus } from "./planning";

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
    statusRaw === "pågår" || statusRaw === "ferdig" || statusRaw === "planlagt" ? statusRaw : "planlagt";
  const color = PROJECT_COLORS.includes(String(formData.get("color")))
    ? String(formData.get("color"))
    : PROJECT_COLORS[0];
  const resourceIds = [...new Set(formData.getAll("resourceIds").map(String).filter(Boolean))];

  if (!name) return { error: "Skriv inn prosjektnavn." };
  if (!isValidIso(startDate)) return { error: "Velg oppstartsdato." };
  if (endDate && !isValidIso(endDate)) return { error: "Sluttdato er ikke gyldig." };
  if (endDate && endDate < startDate) return { error: "Sluttdato kan ikke være før oppstart." };
  if (estimatedHours == null || estimatedHours <= 0 || estimatedHours > 100000) {
    return { error: "Skriv inn beregnede timeverk, for eksempel 240." };
  }

  const data = {
    name,
    customer,
    address,
    startDate: isoToDate(startDate),
    endDate: endDate ? isoToDate(endDate) : null,
    estimatedHours,
    status,
    color,
  };

  const saved = await prisma.$transaction(async (tx) => {
    const project = id
      ? await tx.project.update({ where: { id }, data })
      : await tx.project.create({ data });
    await tx.assignment.deleteMany({ where: { projectId: project.id } });
    if (resourceIds.length > 0) {
      await tx.assignment.createMany({
        data: resourceIds.map((resourceId) => ({ projectId: project.id, resourceId })),
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
  await requireUser();
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
};

export async function getAssignmentPreview(input: {
  startDate: string;
  endDate: string;
  estimatedHours: number;
  resourceIds: string[];
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
  };
  const preview = previewAssignment(resourceInputs, projectInputs, draft);
  return {
    from: preview.from,
    to: preview.to,
    perResource: preview.perResource,
    finishDate: preview.finishDate,
    unallocatedHours: preview.unallocatedHours,
    peak: preview.peak,
  };
}
