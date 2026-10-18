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

type Column = readonly [string, "string" | "number" | "bool" | "json" | "date"];

const COLUMNS: Record<SyncEntityName, readonly Column[]> = {
  inspection: [
    ["projectId", "string"],
    ["status", "string"],
    ["templateVersionId", "string"],
    ["visitedAt", "date"],
  ],
  floor: [
    ["projectId", "string"],
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

function delegate(tx: Prisma.TransactionClient, entity: SyncEntityName) {
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

async function loadRecord(tx: Prisma.TransactionClient, entity: SyncEntityName, id: string): Promise<SyncRecord | null> {
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
  const data: Record<string, unknown> = {
    updatedAt: new Date(record.updatedAt),
    deletedAt: record.deletedAt ? new Date(record.deletedAt) : null,
    fieldUpdatedAt: Object.fromEntries(Object.entries(record.fields).map(([key, field]) => [key, field.updatedAt])),
  };
  for (const [name, kind] of COLUMNS[record.entity]) {
    if (!(name in record.fields)) continue;
    data[name] = inValue(kind, record.fields[name]?.value);
  }
  if (record.entity === "media" && data.kind) data.kind = data.kind as MediaKind;
  return data;
}

async function assertParents(tx: Prisma.TransactionClient, entity: SyncEntityName, fields: SyncRecord["fields"]) {
  const need = async (model: "project" | "floor" | "room" | "inspection" | "checklistItem", id: unknown, label: string) => {
    if (typeof id !== "string" || !id) throw new DomainError(`${label} mangler`);
    const found = await (tx[model] as unknown as { findUnique(args: { where: { id: string } }): Promise<{ id: string } | null> }).findUnique({ where: { id } });
    if (!found) throw new DomainError(`${label} finnes ikke på serveren`);
  };
  if (entity === "inspection") await need("project", fields.projectId?.value, "Prosjekt");
  if (entity === "floor") await need("project", fields.projectId?.value, "Prosjekt");
  if (entity === "room") await need("floor", fields.floorId?.value, "Etasje");
  if (entity === "wall") await need("room", fields.roomId?.value, "Rom");
  if (entity === "media" || entity === "note") await need("project", fields.projectId?.value, "Prosjekt");
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
      const saved = await prisma.$transaction(async (tx) => {
        const existing = await loadRecord(tx, mutation.entity, mutation.id);
        const applied = applyMutation(existing, mutation);
        if (applied.record && mutation.op === "upsert" && !existing) await assertParents(tx, mutation.entity, applied.record.fields);
        if (applied.record) {
          const data = toData(applied.record);
          if (existing) await delegate(tx, mutation.entity).update({ where: { id: mutation.id }, data });
          else await delegate(tx, mutation.entity).create({ data: { id: mutation.id, ...data } });
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
  const [projects, inspections, floors, rooms, walls, media, notes, answers, checklist] = await Promise.all([
    prisma.project.findMany({
      include: { phase: true, board: true, seller: true, projectManager: true },
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
  const pack = (entity: SyncEntityName, rows: Record<string, unknown>[]) =>
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
  projectId: string;
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
  const key = `projects/${input.projectId}/media/${input.id}-${input.fileName.replace(/[^\w.\-]+/g, "_")}`;
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
        projectId: input.projectId,
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
