import { describe, expect, it } from "vitest";
import { applyMutation, applyMutations, type SyncRecord } from "./sync";

const room = (fields: SyncRecord["fields"], updatedAt = "2026-10-18T10:00:00.000Z"): SyncRecord => ({
  entity: "room",
  id: "room-1001",
  updatedAt,
  deletedAt: null,
  fields,
});

describe("synk", () => {
  it("oppretter lokalt og lar nyere felt vinne, felt for felt", () => {
    const created = applyMutation(null, {
      entity: "room",
      op: "upsert",
      id: "room-1001",
      updatedAt: "2026-10-18T09:00:00.000Z",
      payload: { floorId: "floor-1", name: "Bad", sortOrder: 0, ceilingHeightM: 2.4 },
    });
    expect(created.conflicts).toEqual([]);
    expect(created.record?.fields.name?.value).toBe("Bad");

    const serverNewer = room(
      {
        floorId: { value: "floor-1", updatedAt: "2026-10-18T12:00:00.000Z" },
        name: { value: "Bad mot gangen", updatedAt: "2026-10-18T12:00:00.000Z" },
        ceilingHeightM: { value: 2.4, updatedAt: "2026-10-18T09:00:00.000Z" },
      },
      "2026-10-18T12:00:00.000Z",
    );
    const merged = applyMutation(serverNewer, {
      entity: "room",
      op: "upsert",
      id: "room-1001",
      updatedAt: "2026-10-18T11:00:00.000Z",
      payload: { name: "Bad", ceilingHeightM: 2.55 },
    });
    expect(merged.record?.fields.name?.value).toBe("Bad mot gangen");
    expect(merged.record?.fields.ceilingHeightM?.value).toBe(2.55);
    expect(merged.conflicts.map((conflict) => conflict.field).sort()).toEqual(["ceilingHeightM", "name"]);
    expect(merged.conflicts.find((conflict) => conflict.field === "name")?.winner).toBe("server");
    expect(merged.conflicts.find((conflict) => conflict.field === "ceilingHeightM")?.winner).toBe("client");
  });

  it("beholder serververdien ved likt tidsstempel og logger konflikten", () => {
    const existing = room({ name: { value: "Bad", updatedAt: "2026-10-18T10:00:00.000Z" } });
    const merged = applyMutation(existing, {
      entity: "room",
      op: "upsert",
      id: "room-1001",
      updatedAt: "2026-10-18T10:00:00.000Z",
      payload: { name: "Vaskerom" },
    });
    expect(merged.record?.fields.name?.value).toBe("Bad");
    expect(merged.conflicts[0]?.reason).toBe("equal_timestamp");
  });

  it("sletter aldri bilder eller notater", () => {
    const media: SyncRecord = {
      entity: "media",
      id: "media-1001",
      updatedAt: "2026-10-18T10:00:00.000Z",
      deletedAt: null,
      fields: {
        projectId: { value: "p1", updatedAt: "2026-10-18T10:00:00.000Z" },
        kind: { value: "photo", updatedAt: "2026-10-18T10:00:00.000Z" },
        internal: { value: true, updatedAt: "2026-10-18T10:00:00.000Z" },
      },
    };
    const note: SyncRecord = {
      entity: "note",
      id: "note-1001",
      updatedAt: "2026-10-18T10:00:00.000Z",
      deletedAt: null,
      fields: { body: { value: "Internt", updatedAt: "2026-10-18T10:00:00.000Z" }, internal: { value: true, updatedAt: "2026-10-18T10:00:00.000Z" } },
    };
    const batch = applyMutations([media, note], [
      { entity: "media", op: "delete", id: "media-1001", updatedAt: "2026-10-18T11:00:00.000Z" },
      { entity: "note", op: "delete", id: "note-1001", updatedAt: "2026-10-18T11:00:00.000Z" },
    ]);
    expect(batch.records).toHaveLength(2);
    expect(batch.records.every((record) => record.deletedAt == null)).toBe(true);
    expect(batch.conflicts).toHaveLength(2);
    expect(batch.conflicts.every((conflict) => conflict.reason === "append_only")).toBe(true);
  });

  it("sletter et rom når basen er kjent, og avviser en utdatert sletting", () => {
    const existing = room({ name: { value: "Bad", updatedAt: "2026-10-18T10:00:00.000Z" } });
    const removed = applyMutation(existing, {
      entity: "room",
      op: "delete",
      id: "room-1001",
      updatedAt: "2026-10-18T11:00:00.000Z",
      baseUpdatedAt: "2026-10-18T10:00:00.000Z",
    });
    expect(removed.record?.deletedAt).toBe("2026-10-18T11:00:00.000Z");
    const stale = applyMutation(existing, {
      entity: "room",
      op: "delete",
      id: "room-1001",
      updatedAt: "2026-10-18T11:00:00.000Z",
      baseUpdatedAt: "2026-10-18T09:00:00.000Z",
    });
    expect(stale.record?.deletedAt).toBeNull();
    expect(stale.conflicts[0]?.reason).toBe("stale_delete");
  });

  it("setter interne notater og media til interne når flagget mangler", () => {
    const created = applyMutation(null, {
      entity: "note",
      op: "upsert",
      id: "note-2002",
      updatedAt: "2026-10-18T10:00:00.000Z",
      payload: { projectId: "p1", body: "Usikker på flis" },
    });
    expect(created.record?.fields.internal?.value).toBe(true);
  });
});
