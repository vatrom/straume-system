import type { SyncMutation } from "@straume/domain";
import { api, uploadMedia } from "./api";
import { loadDb, saveDb, type PendingFile, type ProjectRow, type SyncRow } from "./db";

type Pull = {
  serverTime: string;
  projects: ProjectRow[];
  records: { entity: string; id: string; updatedAt: string; deletedAt: string | null; payload: Record<string, unknown> }[];
  checklist: unknown;
};

type Push = { results: { id: string; entity: string; ok: boolean; error?: string; conflicts: { reason: string }[]; record: { updatedAt: string } | null }[] };

export async function syncNow(token: string): Promise<string> {
  const snapshot = await loadDb();
  const mutations: SyncMutation[] = snapshot.rows
    .filter((row) => row.dirty)
    .map((row) => ({
      entity: row.entity as SyncMutation["entity"],
      op: row.deletedAt ? "delete" : "upsert",
      id: row.id,
      updatedAt: row.updatedAt,
      baseUpdatedAt: row.baseUpdatedAt,
      payload: row.payload,
    }));
  let conflicts = 0;
  if (mutations.length) {
    const pushed = await api<Push>("/api/sync/push", token, { method: "POST", body: JSON.stringify({ mutations }) });
    for (const result of pushed.results) {
      conflicts += result.conflicts.length;
      snapshot.rows = snapshot.rows.map((row) => {
        if (row.entity !== result.entity || row.id !== result.id) return row;
        if (!result.ok) return row;
        return { ...row, dirty: false, baseUpdatedAt: result.record?.updatedAt ?? row.updatedAt, updatedAt: result.record?.updatedAt ?? row.updatedAt };
      });
    }
  }
  const since = snapshot.since ? `?since=${encodeURIComponent(snapshot.since)}` : "";
  const pulled = await api<Pull>(`/api/sync/pull${since}`, token);
  snapshot.projects = pulled.projects;
  snapshot.checklist = pulled.checklist;
  snapshot.since = pulled.serverTime;
  for (const remote of pulled.records) {
    const local = snapshot.rows.find((row) => row.entity === remote.entity && row.id === remote.id);
    if (local?.dirty && Date.parse(local.updatedAt) > Date.parse(remote.updatedAt)) continue;
    const merged: SyncRow = {
      entity: remote.entity,
      id: remote.id,
      updatedAt: remote.updatedAt,
      deletedAt: remote.deletedAt,
      payload: remote.payload,
      dirty: false,
      baseUpdatedAt: remote.updatedAt,
    };
    snapshot.rows = local ? snapshot.rows.map((row) => (row === local ? merged : row)) : [...snapshot.rows, merged];
  }
  const remaining: PendingFile[] = [];
  for (const file of snapshot.files) {
    try {
      await uploadMedia(token, { uri: file.uri, name: file.name, mimeType: file.mimeType }, {
        id: file.id,
        projectId: file.projectId,
        kind: file.kind,
        internal: String(file.internal),
        roomId: file.roomId,
        floorId: file.floorId,
        wallId: file.wallId,
        inspectionId: file.inspectionId,
      });
    } catch {
      remaining.push(file);
    }
  }
  snapshot.files = remaining;
  await saveDb(snapshot);
  const pending = snapshot.rows.filter((row) => row.dirty).length + remaining.length;
  return pending ? `Synket med ${conflicts} konflikter. ${pending} venter fortsatt.` : conflicts ? `Synket. ${conflicts} felt ble løst.` : "Synket med kontoret.";
}
