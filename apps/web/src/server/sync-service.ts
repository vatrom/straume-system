import { prisma, type MediaKind, type Prisma } from "@straume/db";
import {
  applyMutation,
  assertSyncId,
  DomainError,
  SYNC_FIELDS,
  type SyncEntityName,
  type SyncMutation,
  type SyncRecord,
} from "@straume/domain";
import { audit } from "./audit";
import { publishedChecklist } from "./checklists";
import { createDeal } from "./crm";

type Column = readonly [string, "string" | "number" | "bool" | "json" | "date"];
type PersistedEntity = Exclude<SyncEntityName, "deal">;

const COLUMNS: Record<PersistedEntity, readonly Column[]> = {
  inspection: [
    ["projectId", "string"],
    ["dealId", "string"],
    ["status", "string"],
    ["templateVersionId", "string"],
    ["visitedAt", "date"],
  ],
  floor: [
    ["projectId", "string"],
    ["dealId", "string"],
    ["inspectionId", "string"],
    ["name", "string"],
    ["sortOrder", "number"],
  ],
  room: [
    ["floorId", "string"],
    ["name", "string"],
    ["sortOrder", "number"],
    ["perimeterM", "number"],
    ["ceilingHeightM", "number"],
    ["floorAreaM", "number"],
    ["measurementSource", "string"],
    ["sketch", "json"],
  ],
  wall: [
    ["roomId", "string"],
    ["number", "number"],
    ["edgeIndex", "number"],
    ["lengthM", "number"],
  ],
  media: [
    ["projectId", "string"],
    ["dealId", "string"],
    ["inspectionId", "string"],
    ["floorId", "string"],
    ["roomId", "string"],
    ["wallId", "string"],
    ["answerId", "string"],
    ["kind", "string"],
    ["internal", "bool"],
    ["textContent", "string"],
    ["mimeType", "string"],
    ["fileName", "string"],
    ["storageKey", "string"],
  ],
  note: [
    ["projectId", "string"],
    ["dealId", "string"],
    ["inspectionId", "string"],
    ["floorId", "string"],
    ["roomId", "string"],
    ["wallId", "string"],
    ["answerId", "string"],
    ["sectionKey", "string"],
    ["body", "string"],
    ["internal", "bool"],
  ],
  checklist_answer: [
    ["inspectionId", "string"],
    ["itemId", "string"],
    ["value", "json"],
    ["freeText", "string"],
    ["internalNote", "string"],
  ],
};

function delegate(tx: Prisma.TransactionClient, entity: PersistedEntity) {
  const map = {
    inspection: tx.inspection,
    floor: tx.floor,
    room: tx.room,
    wall: tx.wall,
    media: tx.media,
    note: tx.note,
    checklist_answer: tx.checklistAnswer,
  };
  return map[entity] as unknown as {
    findUnique(args: { where: { id: string } }): Promise<Record<string, unknown> | null>;
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  };
}

function outValue(kind: Column[1], value: unknown): unknown {
  if (value == null) return null;
  if (kind === "date") return value instanceof Date ? value.toISOString() : value;
  if (kind === "number" && typeof value === "object" && value && "toNumber" in value) return (value as { toNumber(): number }).toNumber();
  return value;
}

function inValue(kind: Column[1], value: unknown): unknown {
  if (value == null) return null;
  if (kind === "date") return new Date(String(value));
  if (kind === "number") return Number(value);
  if (kind === "bool") return Boolean(value);
  return value;
}

async function loadRecord(tx: Prisma.TransactionClient, entity: PersistedEntity, id: string): Promise<SyncRecord | null> {
  const row = await delegate(tx, entity).findUnique({ where: { id } });
  if (!row) return null;
  const stamps = (row.fieldUpdatedAt as Record<string, string> | null) ?? {};
  const updatedAt = (row.updatedAt as Date).toISOString();
  const fields: SyncRecord["fields"] = {};
  for (const [name, kind] of COLUMNS[entity]) {
    if (row[name] == null && !(name in stamps)) continue;
    fields[name] = { value: outValue(kind, row[name]), updatedAt: stamps[name] ?? updatedAt };
  }
  return {
    entity,
    id,
    updatedAt,
    deletedAt: row.deletedAt ? (row.deletedAt as Date).toISOString() : null,
    fields,
  };
}

function toData(record: SyncRecord): Record<string, unknown> {
  const entity = record.entity as PersistedEntity;
  const data: Record<string, unknown> = {
    updatedAt: new Date(record.updatedAt),
    deletedAt: record.deletedAt ? new Date(record.deletedAt) : null,
    fieldUpdatedAt: Object.fromEntries(Object.entries(record.fields).map(([key, field]) => [key, field.updatedAt])),
  };
  for (const [name, kind] of COLUMNS[entity]) {
    if (!(name in record.fields)) continue;
    const raw = record.fields[name]?.value;
    data[name] = name.endsWith("Id") && (raw == null || raw === "") ? null : inValue(kind, raw);
  }
  if (entity === "media" && data.kind) data.kind = data.kind as MediaKind;
  return data;
}

async function assertParents(tx: Prisma.TransactionClient, entity: PersistedEntity, fields: SyncRecord["fields"]) {
  const need = async (model: "project" | "deal" | "floor" | "room" | "inspection" | "checklistItem", id: unknown, label: string) => {
    if (typeof id !== "string" || !id) throw new DomainError(`${label} mangler`);
    const found = await (tx[model] as unknown as { findUnique(args: { where: { id: string } }): Promise<{ id: string } | null> }).findUnique({ where: { id } });
    if (!found) throw new DomainError(`${label} finnes ikke på serveren`);
  };
  const parent = async () => {
    const projectId = fields.projectId?.value;
    const dealId = fields.dealId?.value;
    const hasProject = typeof projectId === "string" && projectId.length > 0;
    const hasDeal = typeof dealId === "string" && dealId.length > 0;
    if (!hasProject && !hasDeal) throw new DomainError("Befaringen må høre til en salgsavtale eller et prosjekt");
    if (hasProject) await need("project", projectId, "Prosjekt");
    if (hasDeal) await need("deal", dealId, "Salgsavtale");
  };
  if (entity === "inspection" || entity === "floor" || entity === "media" || entity === "note") await parent();
  if (entity === "room") await need("floor", fields.floorId?.value, "Etasje");
  if (entity === "wall") await need("room", fields.roomId?.value, "Rom");
  if (entity === "checklist_answer") {
    await need("inspection", fields.inspectionId?.value, "Befaring");
    await need("checklistItem", fields.itemId?.value, "Sjekklistepunkt");
  }
  if (entity === "media") {
    const kind = fields.kind?.value;
    if (kind !== "photo" && kind !== "video" && kind !== "voice" && kind !== "text") throw new DomainError("Ukjent medietype");
  }
}

export async function pushMutations(userId: string, mutations: SyncMutation[]) {
  const results: { id: string; entity: SyncEntityName; ok: boolean; error?: string; conflicts: ReturnType<typeof applyMutation>["conflicts"]; record: SyncRecord | null }[] = [];
  for (const mutation of mutations) {
    try {
      assertSyncId(mutation.id);
      if (!SYNC_FIELDS[mutation.entity]) throw new DomainError("Ukjent entitet");
      if (mutation.entity === "deal") {
        await saveSyncedDeal(userId, mutation);
        results.push({ id: mutation.id, entity: mutation.entity, ok: true, conflicts: [], record: null });
        continue;
      }
      const entity = mutation.entity;
      const saved = await prisma.$transaction(async (tx) => {
        const existing = await loadRecord(tx, entity, mutation.id);
        const applied = applyMutation(existing, mutation);
        if (applied.record && mutation.op === "upsert" && !existing) await assertParents(tx, entity, applied.record.fields);
        if (applied.record) {
          const data = toData(applied.record);
          if (existing) await delegate(tx, entity).update({ where: { id: mutation.id }, data });
          else await delegate(tx, entity).create({ data: { id: mutation.id, ...data } });
        }
        if (applied.conflicts.length) {
          await tx.syncConflict.createMany({
            data: applied.conflicts.map((conflict) => ({
              entityType: conflict.entity,
              entityId: conflict.id,
              field: conflict.field,
              clientValue: conflict.clientValue as Prisma.InputJsonValue,
              serverValue: conflict.serverValue as Prisma.InputJsonValue,
              winner: conflict.winner,
              reason: conflict.reason,
              userId,
            })),
          });
        }
        return applied;
      });
      results.push({ id: mutation.id, entity: mutation.entity, ok: true, conflicts: saved.conflicts, record: saved.record });
    } catch (error) {
      results.push({
        id: mutation.id,
        entity: mutation.entity,
        ok: false,
        error: error instanceof Error ? error.message : "Feil",
        conflicts: [],
        record: null,
      });
    }
  }
  await audit(userId, "sync.push", "sync", null, { count: mutations.length, failed: results.filter((item) => !item.ok).length });
  return { results };
}

export async function pullChanges(since?: string | null) {
  const cursor = since ? new Date(since) : new Date(0);
  const where = { updatedAt: { gt: cursor } };
  const [projects, deals, inspections, floors, rooms, walls, media, notes, answers, checklist] = await Promise.all([
    prisma.project.findMany({
      where: { status: "open" },
      include: { phase: true, board: true, seller: true, projectManager: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.deal.findMany({
      where: { status: "open" },
      include: { stage: true, owner: true, person: true, pipeline: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.inspection.findMany({ where }),
    prisma.floor.findMany({ where }),
    prisma.room.findMany({ where }),
    prisma.wall.findMany({ where }),
    prisma.media.findMany({ where }),
    prisma.note.findMany({ where }),
    prisma.checklistAnswer.findMany({ where }),
    publishedChecklist(),
  ]);
  const pack = (entity: PersistedEntity, rows: Record<string, unknown>[]) =>
    rows.map((row) => {
      const stamps = (row.fieldUpdatedAt as Record<string, string> | null) ?? {};
      const updatedAt = (row.updatedAt as Date).toISOString();
      const payload: Record<string, unknown> = {};
      for (const [name, kind] of COLUMNS[entity]) payload[name] = outValue(kind, row[name]);
      return {
        entity,
        id: row.id as string,
        updatedAt,
        deletedAt: row.deletedAt ? (row.deletedAt as Date).toISOString() : null,
        payload,
        fieldUpdatedAt: stamps,
      };
    });
  return {
    serverTime: new Date().toISOString(),
    projects: projects.map((project) => ({
      id: project.id,
      title: project.title,
      status: project.status,
      phaseName: project.phase.name,
      boardName: project.board.name,
      address: [project.street, project.houseNumber, project.postalCode, project.city].filter(Boolean).join(" "),
      sellerName: project.seller.name,
      projectManagerName: project.projectManager.name,
      updatedAt: project.updatedAt.toISOString(),
    })),
    deals: deals.map((deal) => ({
      id: deal.id,
      title: deal.title,
      status: deal.status,
      stageName: deal.stage.name,
      pipelineName: deal.pipeline.name,
      address: [deal.person?.street, deal.person?.houseNumber, deal.person?.postalCode, deal.person?.city].filter(Boolean).join(" "),
      customerName: deal.person ? `${deal.person.firstName} ${deal.person.lastName}`.trim() : "",
      phone: deal.person?.phone ?? "",
      email: deal.person?.email ?? "",
      ownerName: deal.owner.name,
      updatedAt: deal.updatedAt.toISOString(),
    })),
    records: [
      ...pack("inspection", inspections as unknown as Record<string, unknown>[]),
      ...pack("floor", floors as unknown as Record<string, unknown>[]),
      ...pack("room", rooms as unknown as Record<string, unknown>[]),
      ...pack("wall", walls as unknown as Record<string, unknown>[]),
      ...pack("media", media as unknown as Record<string, unknown>[]),
      ...pack("note", notes as unknown as Record<string, unknown>[]),
      ...pack("checklist_answer", answers as unknown as Record<string, unknown>[]),
    ],
    checklist,
  };
}

export async function saveMediaFile(userId: string, input: {
  id: string;
  projectId?: string | null;
  dealId?: string | null;
  kind: MediaKind;
  internal: boolean;
  bytes: Buffer;
  mimeType: string;
  fileName: string;
  roomId?: string | null;
  floorId?: string | null;
  wallId?: string | null;
  inspectionId?: string | null;
}) {
  assertSyncId(input.id);
  const projectId = input.projectId || null;
  const dealId = input.dealId || null;
  if (!projectId && !dealId) throw new DomainError("Befaringen må høre til en salgsavtale eller et prosjekt");
  const folder = projectId ? `projects/${projectId}` : `deals/${dealId}`;
  const key = `${folder}/media/${input.id}-${input.fileName.replace(/[^\w.\-]+/g, "_")}`;
  const { putObject } = await import("./store");
  await putObject(key, input.bytes, input.mimeType);
  const now = new Date().toISOString();
  await pushMutations(userId, [
    {
      entity: "media",
      op: "upsert",
      id: input.id,
      updatedAt: now,
      payload: {
        projectId,
        dealId,
        kind: input.kind,
        internal: input.internal,
        mimeType: input.mimeType,
        fileName: input.fileName,
        storageKey: key,
        roomId: input.roomId ?? null,
        floorId: input.floorId ?? null,
        wallId: input.wallId ?? null,
        inspectionId: input.inspectionId ?? null,
      },
    },
  ]);
  return { storageKey: key };
}

function textField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function saveSyncedDeal(userId: string, mutation: SyncMutation) {
  if (mutation.op === "delete") throw new DomainError("Salgsavtaler slettes ikke fra appen");
  const existing = await prisma.deal.findUnique({ where: { id: mutation.id }, select: { id: true } });
  if (existing) return;
  const payload = mutation.payload ?? {};
  const customerName = textField(payload.customerName);
  if (!customerName) throw new DomainError("Kunden må ha et navn");
  const parts = customerName.split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? "Ukjent";
  const lastName = parts.slice(1).join(" ") || "Kunde";
  const street = textField(payload.street);
  const houseNumber = textField(payload.houseNumber);
  const title = textField(payload.title) || [street, houseNumber].filter(Boolean).join(" ") || customerName;
  const pipeline = await prisma.pipeline.findFirst({
    orderBy: { sortOrder: "asc" },
    include: { stages: { orderBy: { sortOrder: "asc" }, take: 1 } },
  });
  const stage = pipeline?.stages[0];
  if (!pipeline || !stage) throw new DomainError("Fant ikke salgspipeline");
  await createDeal(
    { id: userId, role: "selger" },
    {
      id: mutation.id,
      title,
      pipelineId: pipeline.id,
      stageId: stage.id,
      ownerId: userId,
      newPerson: {
        firstName,
        lastName,
        email: textField(payload.email),
        phone: textField(payload.phone),
        street,
        houseNumber,
        postalCode: textField(payload.postalCode),
        city: textField(payload.city),
      },
    },
  );
}
