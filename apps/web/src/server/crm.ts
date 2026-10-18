import { prisma, type ActivityType } from "@straume/db";
import {
  areaFromPostal,
  assertCanDeletePipeline,
  createStage,
  deleteStage,
  DomainError,
  fullDaysInStage,
  isDealRotten,
  reorderStages,
  updateStage,
} from "@straume/domain";
import type { DealStatus } from "@straume/db";
import { audit } from "./audit";
import { asDate, dec, isoDate } from "./dates";
import { HttpError } from "./http";
import { assertAdmin } from "./roles";

const actor = (user: { id: string; role: string }) => user;

export async function listPipelines() {
  return prisma.pipeline.findMany({
    orderBy: { sortOrder: "asc" },
    include: { stages: { orderBy: { sortOrder: "asc" } } },
  });
}

export async function createPipeline(user: { id: string; role: string }, input: { name: string; dealProbabilityEnabled?: boolean }) {
  assertAdmin(user);
  const name = input.name.trim();
  if (!name) throw new DomainError("Pipelinen må ha et navn");
  const last = await prisma.pipeline.aggregate({ _max: { sortOrder: true } });
  const pipeline = await prisma.pipeline.create({
    data: {
      name,
      dealProbabilityEnabled: Boolean(input.dealProbabilityEnabled),
      sortOrder: (last._max.sortOrder ?? -1) + 1,
      stages: { create: { name: "Ny fase", sortOrder: 0, probability: 10, rottenDays: null } },
    },
    include: { stages: true },
  });
  await audit(user.id, "pipeline.create", "pipeline", pipeline.id, { name });
  return pipeline;
}

export async function updatePipeline(
  user: { id: string; role: string },
  id: string,
  input: { name?: string; dealProbabilityEnabled?: boolean },
) {
  assertAdmin(user);
  const name = input.name?.trim();
  if (name !== undefined && !name) throw new DomainError("Pipelinen må ha et navn");
  const pipeline = await prisma.pipeline.update({
    where: { id },
    data: {
      name: name || undefined,
      dealProbabilityEnabled: input.dealProbabilityEnabled,
    },
  });
  await audit(user.id, "pipeline.update", "pipeline", id, input);
  return pipeline;
}

export async function removePipeline(user: { id: string; role: string }, id: string) {
  assertAdmin(user);
  const dealCount = await prisma.deal.count({ where: { pipelineId: id } });
  assertCanDeletePipeline(dealCount);
  await prisma.pipeline.delete({ where: { id } });
  await audit(user.id, "pipeline.delete", "pipeline", id);
}

export async function addStage(
  user: { id: string; role: string },
  pipelineId: string,
  input: { name: string; probability: number; rottenDays: number | null },
) {
  assertAdmin(user);
  const existing = await prisma.stage.findMany({ where: { pipelineId } });
  const id = crypto.randomUUID();
  const next = createStage(
    existing.map((stage) => ({ ...stage, rottenDays: stage.rottenDays })),
    { id, pipelineId, name: input.name, probability: input.probability, rottenDays: input.rottenDays },
  );
  const created = next.find((stage) => stage.id === id);
  if (!created) throw new DomainError("Kunne ikke opprette fasen");
  await prisma.stage.create({ data: created });
  await audit(user.id, "stage.create", "stage", id, created);
  return created;
}

export async function editStage(
  user: { id: string; role: string },
  id: string,
  patch: { name?: string; probability?: number; rottenDays?: number | null },
) {
  assertAdmin(user);
  const current = await prisma.stage.findUnique({ where: { id } });
  if (!current) throw new DomainError("Fant ikke fasen");
  const existing = await prisma.stage.findMany({ where: { pipelineId: current.pipelineId } });
  const next = updateStage(existing, id, patch);
  const updated = next.find((stage) => stage.id === id)!;
  await prisma.stage.update({ where: { id }, data: updated });
  await audit(user.id, "stage.update", "stage", id, patch);
  return updated;
}

export async function removeStage(user: { id: string; role: string }, id: string) {
  assertAdmin(user);
  const current = await prisma.stage.findUnique({ where: { id } });
  if (!current) throw new DomainError("Fant ikke fasen");
  const existing = await prisma.stage.findMany({ where: { pipelineId: current.pipelineId } });
  const dealCount = await prisma.deal.count({ where: { stageId: id } });
  const next = deleteStage(existing, id, dealCount);
  await prisma.$transaction([
    prisma.stage.delete({ where: { id } }),
    ...next.map((stage) => prisma.stage.update({ where: { id: stage.id }, data: { sortOrder: stage.sortOrder } })),
  ]);
  await audit(user.id, "stage.delete", "stage", id);
}

export async function orderStages(user: { id: string; role: string }, pipelineId: string, orderedIds: string[]) {
  assertAdmin(user);
  const existing = await prisma.stage.findMany({ where: { pipelineId } });
  const next = reorderStages(existing, orderedIds);
  await prisma.$transaction(next.map((stage) => prisma.stage.update({ where: { id: stage.id }, data: { sortOrder: stage.sortOrder } })));
  await audit(user.id, "stage.reorder", "pipeline", pipelineId, { orderedIds });
  return next;
}

export async function dealsForBoard(pipelineId: string | undefined, ownerId?: string) {
  const pipelines = await listPipelines();
  const current = pipelines.find((pipeline) => pipeline.id === pipelineId) ?? pipelines[0];
  if (!current) return { pipelines, current: null, deals: [] as DealCard[], users: await staff() };
  const now = new Date();
  const deals = await prisma.deal.findMany({
    where: { pipelineId: current.id, status: "open", ...(ownerId ? { ownerId } : {}) },
    include: { owner: true, person: true, stage: true },
    orderBy: { updatedAt: "desc" },
  });
  return {
    pipelines,
    current,
    users: await staff(),
    deals: deals.map((deal) => toCard(deal, now)),
  };
}

export type DealCard = ReturnType<typeof toCard>;

function toCard(
  deal: {
    id: string;
    title: string;
    valueNok: { toNumber(): number };
    ownerId: string;
    owner: { name: string };
    stageId: string;
    pipelineId: string;
    status: "open" | "won" | "lost";
    sourceChannel: string | null;
    plannedStartDate: Date | null;
    stageEnteredAt: Date;
    stage: { rottenDays: number | null; name: string; probability: number };
    person: { firstName: string; lastName: string } | null;
    probabilityOverride: number | null;
  },
  now: Date,
) {
  return {
    id: deal.id,
    title: deal.title,
    valueNok: dec(deal.valueNok) ?? 0,
    ownerId: deal.ownerId,
    ownerName: deal.owner.name,
    stageId: deal.stageId,
    stageName: deal.stage.name,
    pipelineId: deal.pipelineId,
    status: deal.status,
    sourceChannel: deal.sourceChannel,
    plannedStartDate: isoDate(deal.plannedStartDate),
    stageEnteredAt: deal.stageEnteredAt.toISOString(),
    daysInStage: fullDaysInStage(deal.stageEnteredAt, now),
    rotten: isDealRotten({
      status: deal.status,
      stageEnteredAt: deal.stageEnteredAt,
      rottenDays: deal.stage.rottenDays,
      now,
    }),
    personName: deal.person ? `${deal.person.firstName} ${deal.person.lastName}` : null,
    probability: deal.probabilityOverride ?? deal.stage.probability,
  };
}

export async function staff() {
  return prisma.user.findMany({
    where: { active: true },
    select: { id: true, name: true, role: true, email: true },
    orderBy: { name: "asc" },
  });
}

export async function getDeal(id: string) {
  const deal = await prisma.deal.findUnique({
    where: { id },
    include: {
      owner: true,
      person: true,
      organization: true,
      stage: true,
      pipeline: { include: { stages: { orderBy: { sortOrder: "asc" } } } },
      activities: { include: { owner: true }, orderBy: { dueAt: "asc" } },
      project: true,
    },
  });
  if (!deal) throw new DomainError("Fant ikke salgsavtalen");
  return deal;
}

type DealInput = {
  title?: string;
  valueNok?: number;
  ownerId?: string;
  personId?: string | null;
  organizationId?: string | null;
  pipelineId?: string;
  stageId?: string;
  sourceChannel?: string | null;
  expectedCloseDate?: string | null;
  plannedStartDate?: string | null;
  label?: string | null;
  probabilityOverride?: number | null;
  newPerson?: {
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    street?: string;
    houseNumber?: string;
    postalCode?: string;
    city?: string;
  };
};

export async function createDeal(user: { id: string; role: string }, input: DealInput) {
  const title = input.title?.trim();
  if (!title) throw new DomainError("Avtalen må ha en tittel");
  const pipelineId = input.pipelineId;
  const stageId = input.stageId;
  const ownerId = input.ownerId || user.id;
  if (!pipelineId || !stageId) throw new DomainError("Velg pipeline og fase");
  const stage = await prisma.stage.findFirst({ where: { id: stageId, pipelineId } });
  if (!stage) throw new DomainError("Fasen hører ikke til pipelinen");
  const personId = await resolvePerson(user.id, input);
  const place = await placeOf(personId);
  const deal = await prisma.deal.create({
    data: {
      title,
      valueNok: input.valueNok ?? 0,
      ownerId,
      personId,
      organizationId: input.organizationId || null,
      pipelineId,
      stageId,
      sourceChannel: input.sourceChannel || null,
      expectedCloseDate: asDate(input.expectedCloseDate),
      plannedStartDate: asDate(input.plannedStartDate),
      label: input.label || null,
      probabilityOverride: input.probabilityOverride ?? null,
      stageEnteredAt: new Date(),
      postalCode: place.postalCode,
      area: place.area,
    },
  });
  await recordStage(user.id, deal.id, null, null, stage.id, stage.name);
  await recordValue(user.id, deal.id, 0, input.valueNok ?? 0);
  await audit(user.id, "deal.create", "deal", deal.id, { title });
  return deal;
}

async function resolvePerson(ownerId: string, input: DealInput): Promise<string | null> {
  if (input.newPerson) {
    const firstName = input.newPerson.firstName.trim();
    const lastName = input.newPerson.lastName.trim();
    if (!firstName || !lastName) throw new DomainError("Personen må ha fornavn og etternavn");
    const person = await prisma.person.create({
      data: { ...input.newPerson, firstName, lastName, ownerId, country: "Norge" },
    });
    return person.id;
  }
  return input.personId || null;
}

export async function updateDeal(user: { id: string; role: string }, id: string, input: DealInput) {
  const deal = await prisma.deal.findUnique({ where: { id } });
  if (!deal) throw new DomainError("Fant ikke salgsavtalen");
  if (deal.status !== "open" && (input.stageId || input.pipelineId)) {
    throw new DomainError("Lukkede avtaler kan ikke flyttes i pipelinen");
  }
  let stageId = input.stageId ?? deal.stageId;
  let pipelineId = input.pipelineId ?? deal.pipelineId;
  if (input.stageId && input.stageId !== deal.stageId) {
    const stage = await prisma.stage.findUnique({ where: { id: input.stageId } });
    if (!stage) throw new DomainError("Fant ikke fasen");
    pipelineId = stage.pipelineId;
    stageId = stage.id;
  }
  if (pipelineId !== deal.pipelineId && !input.stageId) {
    const first = await prisma.stage.findFirst({ where: { pipelineId }, orderBy: { sortOrder: "asc" } });
    if (!first) throw new DomainError("Pipelinen har ingen faser");
    stageId = first.id;
  }
  const personId = input.newPerson ? await resolvePerson(user.id, input) : input.personId === undefined ? undefined : input.personId;
  const place = personId === undefined ? null : await placeOf(personId);
  const updated = await prisma.deal.update({
    where: { id },
    data: {
      title: input.title?.trim() || undefined,
      valueNok: input.valueNok,
      ownerId: input.ownerId,
      personId,
      organizationId: input.organizationId === undefined ? undefined : input.organizationId,
      pipelineId,
      stageId,
      stageEnteredAt: stageId !== deal.stageId ? new Date() : undefined,
      sourceChannel: input.sourceChannel === undefined ? undefined : input.sourceChannel,
      expectedCloseDate: input.expectedCloseDate === undefined ? undefined : asDate(input.expectedCloseDate),
      plannedStartDate: input.plannedStartDate === undefined ? undefined : asDate(input.plannedStartDate),
      label: input.label === undefined ? undefined : input.label,
      probabilityOverride: input.probabilityOverride === undefined ? undefined : input.probabilityOverride,
      postalCode: place ? place.postalCode : undefined,
      area: place ? place.area : undefined,
    },
  });
  if (stageId !== deal.stageId) {
    const from = await prisma.stage.findUnique({ where: { id: deal.stageId } });
    const to = await prisma.stage.findUnique({ where: { id: stageId } });
    await recordStage(user.id, id, deal.stageId, from?.name ?? "Slettet fase", stageId, to?.name ?? "Ukjent fase");
  }
  if (input.valueNok !== undefined && input.valueNok !== (dec(deal.valueNok) ?? 0)) {
    await recordValue(user.id, id, dec(deal.valueNok) ?? 0, input.valueNok ?? 0);
  }
  await audit(user.id, "deal.update", "deal", id, { stageId, pipelineId });
  return updated;
}

async function actorName(userId: string) {
  const actor = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  return actor?.name ?? "Ukjent";
}

async function placeOf(personId: string | null | undefined) {
  if (!personId) return { postalCode: null, area: "Ukjent" };
  const person = await prisma.person.findUnique({ where: { id: personId } });
  return { postalCode: person?.postalCode ?? null, area: areaFromPostal(person?.postalCode, person?.city) };
}

async function recordStage(userId: string, dealId: string, fromStageId: string | null, fromStageName: string | null, toStageId: string | null, toStageName: string) {
  await prisma.dealStageEvent.create({
    data: { dealId, fromStageId, fromStageName, toStageId, toStageName, userId, userName: await actorName(userId) },
  });
}

async function recordValue(userId: string, dealId: string, fromValue: number, toValue: number) {
  await prisma.dealValueEvent.create({
    data: { dealId, fromValue, toValue, userId, userName: await actorName(userId) },
  });
}

export async function winDeal(
  user: { id: string; role: string },
  id: string,
  options?: { createProject?: boolean; plannedStartDate?: string | null },
) {
  const deal = await prisma.deal.findUnique({ where: { id }, include: { project: true } });
  if (!deal) throw new DomainError("Fant ikke salgsavtalen");
  if (deal.status !== "open") throw new DomainError("Avtalen er allerede lukket");
  if (deal.project) throw new DomainError("Avtalen har allerede et prosjekt");
  const won = await prisma.deal.update({ where: { id }, data: { status: "won", wonAt: new Date() } });
  await audit(user.id, "deal.win", "deal", id);
  const project = options?.createProject
    ? await createProjectFromDeal(
        user,
        id,
        options.plannedStartDate !== undefined ? { plannedStartDate: options.plannedStartDate } : undefined,
      )
    : null;
  return { deal: won, project };
}

export async function createProjectFromDeal(
  user: { id: string; role: string },
  dealId: string,
  options?: { plannedStartDate?: string | null },
) {
  const deal = await prisma.deal.findUnique({ where: { id: dealId }, include: { person: true, project: true } });
  if (!deal) throw new DomainError("Fant ikke salgsavtalen");
  if (deal.status !== "won") throw new DomainError("Bare en vunnet salgsavtale kan bli et prosjekt");
  if (deal.project) throw new DomainError("Salgsavtalen har allerede et prosjekt");
  const board = await prisma.projectBoard.findFirst({
    where: { name: "Rehabiliteringsprosjekter" },
    include: { phases: { orderBy: { sortOrder: "asc" } } },
  });
  const phase = board?.phases[0];
  if (!board || !phase) throw new DomainError("Fant ikke prosjekttavlen Rehabiliteringsprosjekter");
  const project = await prisma.$transaction(async (tx) => {
    const created = await tx.project.create({
      data: {
        title: deal.title,
        dealId: deal.id,
        personId: deal.personId,
        organizationId: deal.organizationId,
        boardId: board.id,
        phaseId: phase.id,
        sellerId: deal.ownerId,
        projectManagerId: deal.ownerId,
        street: deal.person?.street,
        houseNumber: deal.person?.houseNumber,
        postalCode: deal.person?.postalCode,
        city: deal.person?.city,
        municipality: deal.person?.municipality,
        contractSumNok: deal.valueNok,
        plannedStartDate: options ? asDate(options.plannedStartDate) : deal.plannedStartDate,
        phaseEnteredAt: new Date(),
      },
    });
    const link = { projectId: created.id };
    await tx.document.updateMany({ where: { dealId: deal.id, projectId: null }, data: link });
    await tx.inspection.updateMany({ where: { dealId: deal.id, projectId: null }, data: link });
    await tx.floor.updateMany({ where: { dealId: deal.id, projectId: null }, data: link });
    await tx.media.updateMany({ where: { dealId: deal.id, projectId: null }, data: link });
    await tx.note.updateMany({ where: { dealId: deal.id, projectId: null }, data: link });
    return created;
  });
  await audit(user.id, "project.create", "project", project.id, { dealId });
  return project;
}

export async function listDeals(filter: { pipelineId?: string; ownerId?: string; status?: DealStatus | "" | "all"; q?: string }) {
  const q = filter.q?.trim();
  const status = !filter.status || filter.status === "all" ? undefined : filter.status;
  const deals = await prisma.deal.findMany({
    where: {
      pipelineId: filter.pipelineId || undefined,
      ownerId: filter.ownerId || undefined,
      status,
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { person: { is: { firstName: { contains: q, mode: "insensitive" } } } },
              { person: { is: { lastName: { contains: q, mode: "insensitive" } } } },
              { organization: { is: { name: { contains: q, mode: "insensitive" } } } },
            ],
          }
        : {}),
    },
    include: { owner: true, person: true, organization: true, stage: true, pipeline: true, project: true },
    orderBy: { updatedAt: "desc" },
  });
  return {
    pipelines: await listPipelines(),
    users: await staff(),
    deals: deals.map((deal) => ({
      ...toCard(deal, new Date()),
      pipelineName: deal.pipeline.name,
      organizationName: deal.organization?.name ?? null,
      projectId: deal.project?.id ?? null,
      lostReason: deal.lostReason,
    })),
  };
}

export async function loseDeal(user: { id: string; role: string }, id: string, lostReason: string, lostComment?: string) {
  const reason = lostReason.trim();
  if (!reason) throw new DomainError("Velg tapsårsak");
  const deal = await prisma.deal.findUnique({ where: { id } });
  if (!deal) throw new DomainError("Fant ikke salgsavtalen");
  if (deal.status !== "open") throw new DomainError("Avtalen er allerede lukket");
  const updated = await prisma.deal.update({
    where: { id },
    data: { status: "lost", lostAt: new Date(), lostReason: reason, lostComment: lostComment?.trim() || null },
  });
  await audit(user.id, "deal.lose", "deal", id, { lostReason: reason });
  return updated;
}

export async function addActivity(
  user: { id: string; role: string },
  input: { dealId?: string; projectId?: string; type: ActivityType; subject: string; note?: string; dueAt?: string },
) {
  const subject = input.subject.trim();
  if (!subject) throw new DomainError("Aktiviteten må ha et emne");
  if (!input.dealId && !input.projectId) throw new DomainError("Aktiviteten må høre til en avtale eller et prosjekt");
  const activity = await prisma.activity.create({
    data: {
      dealId: input.dealId,
      projectId: input.projectId,
      type: input.type,
      subject,
      note: input.note?.trim() || null,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      ownerId: user.id,
      internal: true,
    },
  });
  await audit(user.id, "activity.create", "activity", activity.id);
  return activity;
}

export async function toggleActivity(user: { id: string; role: string }, id: string, done: boolean) {
  return prisma.activity.update({
    where: { id },
    data: { done, doneAt: done ? new Date() : null },
  });
}

export async function listPeople() {
  return prisma.person.findMany({
    include: { organization: true, owner: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
}

export async function savePerson(
  user: { id: string; role: string },
  id: string | null,
  input: {
    firstName: string;
    lastName: string;
    email?: string | null;
    phone?: string | null;
    organizationId?: string | null;
    ownerId?: string | null;
    label?: string | null;
    street?: string | null;
    houseNumber?: string | null;
    postalCode?: string | null;
    city?: string | null;
    municipality?: string | null;
  },
) {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName || !lastName) throw new DomainError("Personen må ha fornavn og etternavn");
  const data = { ...input, firstName, lastName, country: "Norge" };
  const person = id
    ? await prisma.person.update({ where: { id }, data })
    : await prisma.person.create({ data: { ...data, ownerId: data.ownerId || user.id } });
  await audit(user.id, id ? "person.update" : "person.create", "person", person.id);
  return person;
}

export async function listOrganizations() {
  return prisma.organization.findMany({ include: { owner: true, _count: { select: { people: true } } }, orderBy: { name: "asc" } });
}

export async function saveOrganization(
  user: { id: string; role: string },
  id: string | null,
  input: { name: string; orgNumber?: string | null; address?: string | null; ownerId?: string | null; label?: string | null },
) {
  const name = input.name.trim();
  if (!name) throw new DomainError("Organisasjonen må ha et navn");
  const data = { ...input, name };
  const org = id
    ? await prisma.organization.update({ where: { id }, data })
    : await prisma.organization.create({ data: { ...data, ownerId: data.ownerId || user.id } });
  await audit(user.id, id ? "organization.update" : "organization.create", "organization", org.id);
  return org;
}

export async function listOptions() {
  return prisma.optionList.findMany({ include: { items: { orderBy: { sortOrder: "asc" } } }, orderBy: { name: "asc" } });
}

export async function addOption(user: { id: string; role: string }, key: string, label: string) {
  assertAdmin(user);
  const list = await prisma.optionList.findUnique({ where: { key } });
  if (!list) throw new DomainError("Fant ikke listen");
  const cleaned = label.trim();
  if (!cleaned) throw new DomainError("Valget må ha en tekst");
  const last = await prisma.optionItem.aggregate({ where: { listId: list.id }, _max: { sortOrder: true } });
  const item = await prisma.optionItem.create({
    data: { listId: list.id, label: cleaned, sortOrder: (last._max.sortOrder ?? -1) + 1 },
  });
  await audit(user.id, "option.create", "option", item.id, { key, label: cleaned });
  return item;
}

export async function editOption(user: { id: string; role: string }, id: string, input: { label?: string; active?: boolean }) {
  assertAdmin(user);
  const label = input.label?.trim();
  if (label !== undefined && !label) throw new DomainError("Valget må ha en tekst");
  return prisma.optionItem.update({ where: { id }, data: { label: label || undefined, active: input.active } });
}

export async function removeOption(user: { id: string; role: string }, id: string) {
  assertAdmin(user);
  await prisma.optionItem.delete({ where: { id } });
  await audit(user.id, "option.delete", "option", id);
}

void actor;
void HttpError;
