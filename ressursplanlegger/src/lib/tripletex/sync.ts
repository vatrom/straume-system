import { addDays, eachDate, isoWeek, type IsoDate } from "../dates";
import type { TripletexEntry } from "./types";

export type SyncLinks = {
  employeeToResource: Map<number, string>;
  projectIdToProject: Map<number, string>;
  projectNumberToProject: Map<string, string>;
};

export type ClassifiedEntry = {
  externalId: string;
  date: string;
  hours: number;
  comment: string;
  tripletexEmployeeId: number;
  tripletexProjectId: number | null;
  employeeName: string;
  projectLabel: string;
  resourceId: string | null;
  projectId: string | null;
  unmappedReason: string;
};

export function syncWindow(today: IsoDate): { dateFrom: IsoDate; dateTo: IsoDate } {
  return { dateFrom: addDays(today, -60), dateTo: addDays(today, 1) };
}

export function weekYearsBetween(from: IsoDate, toInclusive: IsoDate): string[] {
  const seen = new Set<string>();
  const end = addDays(toInclusive, -1);
  if (end < from) return [];
  for (const iso of eachDate(from, end)) {
    const week = isoWeek(iso);
    seen.add(`${week.weekYear}-${week.week}`);
  }
  return [...seen];
}

export function classifyEntry(entry: TripletexEntry, links: SyncLinks): ClassifiedEntry {
  const resourceId = links.employeeToResource.get(entry.employeeId) ?? null;
  const projectId =
    (entry.projectId != null ? links.projectIdToProject.get(entry.projectId) : undefined) ??
    (entry.projectNumber ? links.projectNumberToProject.get(entry.projectNumber) : undefined) ??
    null;
  let unmappedReason = "";
  if (entry.projectId == null && !entry.projectNumber) {
    unmappedReason = "Timen har ikke prosjekt i Tripletex.";
  } else if (!resourceId && !projectId) {
    unmappedReason = "Verken ansatt eller prosjekt er koblet.";
  } else if (!resourceId) {
    unmappedReason = "Ansatt er ikke koblet til en ressurs.";
  } else if (!projectId) {
    unmappedReason = "Prosjekt er ikke koblet.";
  }
  return {
    externalId: `tt:${entry.id}`,
    date: entry.date,
    hours: entry.hours,
    comment: entry.comment,
    tripletexEmployeeId: entry.employeeId,
    tripletexProjectId: entry.projectId,
    employeeName: entry.employeeName,
    projectLabel: [entry.projectNumber, entry.projectName].filter(Boolean).join(" "),
    resourceId,
    projectId,
    unmappedReason,
  };
}

export function classifyEntries(
  entries: TripletexEntry[],
  links: SyncLinks,
  ignoredProjectIds: ReadonlySet<number> = new Set(),
): ClassifiedEntry[] {
  const kept: ClassifiedEntry[] = [];
  for (const entry of entries) {
    if (entry.projectId != null && ignoredProjectIds.has(entry.projectId)) continue;
    kept.push(classifyEntry(entry, links));
  }
  return kept;
}

export type StoredEntry = ClassifiedEntry & { id: string };

export function mergeByExternalId(existing: StoredEntry[], incoming: ClassifiedEntry[]): {
  rows: StoredEntry[];
  inserted: number;
  updated: number;
  unchanged: number;
} {
  const rows = existing.map((row) => ({ ...row }));
  const index = new Map(rows.map((row, position) => [row.externalId, position]));
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  for (const entry of incoming) {
    const position = index.get(entry.externalId);
    if (position == null) {
      rows.push({ ...entry, id: entry.externalId });
      index.set(entry.externalId, rows.length - 1);
      inserted += 1;
      continue;
    }
    const current = rows[position];
    const same =
      current.date === entry.date &&
      current.hours === entry.hours &&
      current.comment === entry.comment &&
      current.resourceId === entry.resourceId &&
      current.projectId === entry.projectId &&
      current.unmappedReason === entry.unmappedReason &&
      current.employeeName === entry.employeeName &&
      current.projectLabel === entry.projectLabel;
    if (same) {
      unchanged += 1;
      continue;
    }
    rows[position] = { ...current, ...entry };
    updated += 1;
  }
  return { rows, inserted, updated, unchanged };
}

export function incompleteWeekCount(weeks: { completed: boolean }[]): number {
  return weeks.filter((week) => !week.completed).length;
}

export function publicSyncError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Ukjent feil fra Tripletex.";
  if (/token|password|authorization|bearer/i.test(message)) return "Tripletex svarte med en feil.";
  return message.replace(/\s+/g, " ").slice(0, 300);
}
