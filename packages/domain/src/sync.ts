import { DomainError } from "./errors";

export type SyncEntityName =
  | "inspection"
  | "floor"
  | "room"
  | "wall"
  | "media"
  | "note"
  | "checklist_answer"
  | "deal";

export const APPEND_ONLY: ReadonlySet<SyncEntityName> = new Set(["media", "note"]);

export const SYNC_FIELDS: Record<SyncEntityName, readonly string[]> = {
  inspection: ["projectId", "dealId", "status", "templateVersionId", "visitedAt"],
  floor: ["projectId", "dealId", "inspectionId", "name", "sortOrder"],
  room: ["floorId", "name", "sortOrder", "perimeterM", "ceilingHeightM", "floorAreaM", "measurementSource", "sketch"],
  wall: ["roomId", "number", "edgeIndex", "lengthM"],
  media: ["projectId", "dealId", "inspectionId", "floorId", "roomId", "wallId", "answerId", "kind", "internal", "textContent", "mimeType", "fileName", "storageKey"],
  note: ["projectId", "dealId", "inspectionId", "floorId", "roomId", "wallId", "answerId", "sectionKey", "body", "internal"],
  checklist_answer: ["inspectionId", "itemId", "value", "freeText", "internalNote"],
  deal: ["customerName", "phone", "email", "street", "houseNumber", "postalCode", "city", "title"],
};

export type SyncRecord = {
  entity: SyncEntityName;
  id: string;
  updatedAt: string;
  deletedAt: string | null;
  fields: Record<string, { value: unknown; updatedAt: string }>;
};

export type SyncMutation = {
  entity: SyncEntityName;
  op: "upsert" | "delete";
  id: string;
  updatedAt: string;
  baseUpdatedAt?: string | null;
  payload?: Record<string, unknown>;
};

export type SyncConflict = {
  entity: SyncEntityName;
  id: string;
  field: string | null;
  clientValue: unknown;
  serverValue: unknown;
  winner: "client" | "server";
  reason: "field_lww" | "append_only" | "stale_delete" | "equal_timestamp";
};

const ID_PATTERN = /^[a-zA-Z0-9:_-]{8,120}$/;

export function assertSyncId(id: string): void {
  if (!ID_PATTERN.test(id)) throw new DomainError("Ugyldig id");
}

function time(value: string): number {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw new DomainError("Ugyldig tidsstempel");
  return parsed;
}

function stable(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) sorted[key] = sortKeys(source[key]);
    return sorted;
  }
  return value;
}

export function defaultInternalFlag(
  entity: SyncEntityName,
  payload: Record<string, unknown>,
  isCreate: boolean,
): Record<string, unknown> {
  if (!isCreate || (entity !== "media" && entity !== "note")) return payload;
  if (payload.internal === undefined) return { ...payload, internal: true };
  return payload;
}

export function applyMutation(existing: SyncRecord | null, mutation: SyncMutation): { record: SyncRecord | null; conflicts: SyncConflict[] } {
  if (!SYNC_FIELDS[mutation.entity]) throw new DomainError("Ukjent entitet");
  assertSyncId(mutation.id);
  time(mutation.updatedAt);
  const allowed = SYNC_FIELDS[mutation.entity];

  if (mutation.op === "delete") {
    if (APPEND_ONLY.has(mutation.entity)) {
      return {
        record: existing,
        conflicts: [
          {
            entity: mutation.entity,
            id: mutation.id,
            field: null,
            clientValue: "delete",
            serverValue: existing ? "beholdt" : null,
            winner: "server",
            reason: "append_only",
          },
        ],
      };
    }
    if (!existing || existing.deletedAt) return { record: existing, conflicts: [] };
    if (mutation.baseUpdatedAt && time(existing.updatedAt) > time(mutation.baseUpdatedAt)) {
      return {
        record: existing,
        conflicts: [
          {
            entity: mutation.entity,
            id: mutation.id,
            field: null,
            clientValue: "delete",
            serverValue: existing.updatedAt,
            winner: "server",
            reason: "stale_delete",
          },
        ],
      };
    }
    return {
      record: { ...existing, deletedAt: mutation.updatedAt, updatedAt: mutation.updatedAt },
      conflicts: [],
    };
  }

  const payload = defaultInternalFlag(mutation.entity, mutation.payload ?? {}, !existing);
  if (!existing) {
    const fields: SyncRecord["fields"] = {};
    for (const key of allowed) {
      if (key in payload) fields[key] = { value: payload[key], updatedAt: mutation.updatedAt };
    }
    return {
      record: {
        entity: mutation.entity,
        id: mutation.id,
        updatedAt: mutation.updatedAt,
        deletedAt: null,
        fields,
      },
      conflicts: [],
    };
  }

  const fields = { ...existing.fields };
  const conflicts: SyncConflict[] = [];
  for (const key of allowed) {
    if (!(key in payload)) continue;
    const incoming = payload[key];
    const current = fields[key];
    if (!current) {
      fields[key] = { value: incoming, updatedAt: mutation.updatedAt };
      continue;
    }
    const delta = time(mutation.updatedAt) - time(current.updatedAt);
    const changed = stable(incoming) !== stable(current.value);
    if (delta > 0) {
      if (changed) {
        conflicts.push({
          entity: mutation.entity,
          id: mutation.id,
          field: key,
          clientValue: incoming,
          serverValue: current.value,
          winner: "client",
          reason: "field_lww",
        });
      }
      fields[key] = { value: incoming, updatedAt: mutation.updatedAt };
    } else if (changed) {
      conflicts.push({
        entity: mutation.entity,
        id: mutation.id,
        field: key,
        clientValue: incoming,
        serverValue: current.value,
        winner: "server",
        reason: delta < 0 ? "field_lww" : "equal_timestamp",
      });
    }
  }

  let deletedAt = existing.deletedAt;
  if (deletedAt && time(mutation.updatedAt) > time(deletedAt) && !APPEND_ONLY.has(mutation.entity)) {
    deletedAt = null;
  }
  const times = [existing.updatedAt, mutation.updatedAt, ...Object.values(fields).map((field) => field.updatedAt)];
  const updatedAt = times.reduce((latest, value) => (time(value) > time(latest) ? value : latest));
  return { record: { ...existing, fields, deletedAt, updatedAt }, conflicts };
}

export function applyMutations(records: SyncRecord[], mutations: SyncMutation[]): { records: SyncRecord[]; conflicts: SyncConflict[] } {
  const map = new Map(records.map((record) => [`${record.entity}:${record.id}`, record]));
  const conflicts: SyncConflict[] = [];
  for (const mutation of mutations) {
    const key = `${mutation.entity}:${mutation.id}`;
    const result = applyMutation(map.get(key) ?? null, mutation);
    conflicts.push(...result.conflicts);
    if (result.record) map.set(key, result.record);
  }
  return { records: [...map.values()], conflicts };
}
