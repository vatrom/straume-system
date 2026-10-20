import { Platform } from "react-native";

export type ProjectRow = {
  id: string;
  title: string;
  status: string;
  phaseName: string;
  boardName: string;
  address: string;
  sellerName: string;
  projectManagerName: string;
};

export type SyncRow = {
  entity: string;
  id: string;
  updatedAt: string;
  deletedAt: string | null;
  payload: Record<string, unknown>;
  dirty: boolean;
  baseUpdatedAt: string | null;
};

export type DealRow = {
  id: string;
  title: string;
  status: string;
  stageName: string;
  pipelineName: string;
  address: string;
  customerName: string;
  phone: string;
  email: string;
  ownerName: string;
};

export type PendingFile = {
  id: string;
  uri: string;
  name: string;
  mimeType: string;
  projectId: string;
  dealId?: string;
  kind: string;
  internal: boolean;
  roomId: string;
  floorId: string;
  wallId: string;
  inspectionId: string;
};

export type Snapshot = {
  projects: ProjectRow[];
  deals: DealRow[];
  rows: SyncRow[];
  files: PendingFile[];
  checklist: unknown;
  since: string | null;
};

const EMPTY: Snapshot = { projects: [], deals: [], rows: [], files: [], checklist: null, since: null };
const KEY = "straume.db.v1";

async function sqlite() {
  const sqlite = await import("expo-sqlite");
  const db = await sqlite.openDatabaseAsync("straume.db");
  await db.execAsync("create table if not exists kv (key text primary key, value text not null)");
  return db;
}

export async function loadDb(): Promise<Snapshot> {
  if (Platform.OS === "web") {
    const raw = globalThis.localStorage?.getItem(KEY);
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : { ...EMPTY, rows: [], files: [], projects: [] };
  }
  const db = await sqlite();
  const row = await db.getFirstAsync<{ value: string }>("select value from kv where key = ?", KEY);
  return row ? { ...EMPTY, ...JSON.parse(row.value) } : { ...EMPTY, rows: [], files: [], projects: [] };
}

export async function saveDb(snapshot: Snapshot): Promise<void> {
  const value = JSON.stringify(snapshot);
  if (Platform.OS === "web") {
    globalThis.localStorage.setItem(KEY, value);
    return;
  }
  const db = await sqlite();
  await db.runAsync("insert into kv (key, value) values (?, ?) on conflict(key) do update set value = excluded.value", KEY, value);
}

export function localId(prefix: string): string {
  const body = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${body}`.replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 80);
}

export function parentOf(snapshot: Snapshot, id: string): { kind: "project" | "deal"; title: string } | null {
  const project = snapshot.projects.find((item) => item.id === id);
  if (project) return { kind: "project", title: project.title };
  const deal = snapshot.deals.find((item) => item.id === id);
  if (deal) return { kind: "deal", title: deal.title };
  const row = snapshot.rows.find((item) => item.entity === "deal" && item.id === id && !item.deletedAt);
  if (row) return { kind: "deal", title: String(row.payload.title || row.payload.customerName || "Salgsavtale") };
  return null;
}

export function parentPayload(kind: "project" | "deal", id: string): { projectId?: string; dealId?: string } {
  return kind === "deal" ? { dealId: id } : { projectId: id };
}

export function rowsOf(snapshot: Snapshot, entity: string): SyncRow[] {
  return snapshot.rows.filter((row) => row.entity === entity && !row.deletedAt);
}

export function touch(snapshot: Snapshot, entity: string, id: string, payload: Record<string, unknown>): Snapshot {
  const now = new Date().toISOString();
  const existing = snapshot.rows.find((row) => row.entity === entity && row.id === id);
  const next: SyncRow = {
    entity,
    id,
    updatedAt: now,
    deletedAt: null,
    payload: { ...(existing?.payload ?? {}), ...payload },
    dirty: true,
    baseUpdatedAt: existing?.baseUpdatedAt ?? existing?.updatedAt ?? null,
  };
  const rows = existing ? snapshot.rows.map((row) => (row.entity === entity && row.id === id ? next : row)) : [...snapshot.rows, next];
  return { ...snapshot, rows };
}
