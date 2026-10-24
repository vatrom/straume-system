import { employmentWindow, selectCurrentEmployees } from "./employment";
import {
  planEmployeeImports,
  planProjectImports,
  type EmployeeChange,
  type LocalProject,
  type LocalResource,
  type ProjectChange,
} from "./import";
import {
  classifyEntries,
  incompleteWeekCount,
  publicSyncError,
  syncWindow,
  weekYearsBetween,
  type SyncLinks,
} from "./sync";
import type {
  TripletexEmployee,
  TripletexEmployment,
  TripletexEntry,
  TripletexProject,
  TripletexWeek,
} from "./types";
import type { ClassifiedEntry } from "./sync";

export type SyncReport = {
  ok: boolean;
  disabled?: boolean;
  inserted: number;
  updated: number;
  unchanged: number;
  unmapped: number;
  incompleteWeeks: number;
  projectsCreated: number;
  projectsUpdated: number;
  projectsArchived: number;
  projectsSkipped: number;
  projectsKeptInternal: number;
  entriesSkipped: number;
  entriesWithoutProject: number;
  employeesLinked: number;
  employeesCreated: number;
  employeesDeactivated: number;
  employeesRemoved: number;
  employeesReactivated: number;
  warnings: string[];
  message: string;
};

export const emptyCounts = {
  inserted: 0,
  updated: 0,
  unchanged: 0,
  unmapped: 0,
  incompleteWeeks: 0,
  projectsCreated: 0,
  projectsUpdated: 0,
  projectsArchived: 0,
  projectsSkipped: 0,
  projectsKeptInternal: 0,
  entriesSkipped: 0,
  entriesWithoutProject: 0,
  employeesLinked: 0,
  employeesCreated: 0,
  employeesDeactivated: 0,
  employeesRemoved: 0,
  employeesReactivated: 0,
  warnings: [] as string[],
};

export type EmployeeApplyResult = {
  linked: number;
  created: number;
  deactivated: number;
  removed: number;
  reactivated: number;
  error?: string;
};

export type ProjectApplyResult = {
  created: number;
  updated: number;
  archived: number;
  error?: string;
};

export type SyncDeps = {
  today: string;
  employees: () => Promise<TripletexEmployee[]>;
  employments: () => Promise<TripletexEmployment[]>;
  projects: () => Promise<TripletexProject[]>;
  entries: (dateFrom: string, dateTo: string) => Promise<TripletexEntry[]>;
  weeks: (employeeIds: number[], weekYear: string) => Promise<TripletexWeek[]>;
  loadResources: () => Promise<LocalResource[]>;
  loadProjects: () => Promise<LocalProject[]>;
  applyEmployees: (changes: EmployeeChange[]) => Promise<EmployeeApplyResult>;
  applyProjects: (changes: ProjectChange[]) => Promise<ProjectApplyResult>;
  loadLinks: () => Promise<{ links: SyncLinks; ignoredProjectIds: number[] }>;
  writeEntry: (entry: ClassifiedEntry) => Promise<"inserted" | "updated" | "unchanged">;
  saveState: (ok: boolean, message: string) => Promise<void>;
};

export function syncSummary(report: Omit<SyncReport, "ok" | "disabled" | "message"> & { warnings: string[] }): string {
  return [
    `Hentet ${report.inserted + report.updated + report.unchanged} timer.`,
    `${report.inserted} nye, ${report.updated} oppdatert, ${report.unchanged} uendret.`,
    report.unmapped > 0 ? `${report.unmapped} uten kobling.` : "Alle timer er koblet.",
    `${report.projectsCreated} nye prosjekter, ${report.projectsUpdated} oppdatert.`,
    report.projectsArchived > 0 ? `${report.projectsArchived} lukkede eller interne prosjekter arkivert.` : "",
    report.projectsKeptInternal > 0
      ? `${report.projectsKeptInternal} interne prosjekter beholdt fordi de har tildeling.`
      : "",
    report.projectsSkipped > 0 ? `${report.projectsSkipped} prosjekter hoppet over.` : "",
    report.entriesSkipped > 0 ? `${report.entriesSkipped} timer hoppet over fordi prosjektet er ignorert.` : "",
    report.entriesWithoutProject > 0 ? `${report.entriesWithoutProject} timer uten importert prosjekt.` : "",
    `${report.employeesLinked} ansatte koblet, ${report.employeesCreated} nye ressurser.`,
    report.employeesRemoved > 0 ? `${report.employeesRemoved} uten aktiv ansettelse fjernet.` : "",
    report.employeesDeactivated > 0 ? `${report.employeesDeactivated} skjult fordi ansettelsen er avsluttet.` : "",
    report.employeesReactivated > 0 ? `${report.employeesReactivated} tatt inn igjen.` : "",
    report.incompleteWeeks > 0 ? `${report.incompleteWeeks} uker er ikke markert fullført i Tripletex.` : "",
    ...report.warnings.map((warning) => `Feil: ${warning}`),
  ]
    .filter(Boolean)
    .join(" ");
}

export async function runSyncPipeline(deps: SyncDeps): Promise<SyncReport> {
  const warnings: string[] = [];
  const report = { ...emptyCounts, warnings, ok: false, message: "" };
  const fetchedEntries: TripletexEntry[] = [];

  try {
    const [remoteEmployees, jobs, localResources] = await Promise.all([
      deps.employees(),
      deps.employments(),
      deps.loadResources(),
    ]);
    if (remoteEmployees.length > 0 && jobs.length === 0) {
      warnings.push("Ansettelser manglet i svaret fra Tripletex. Ingen ressurser ble endret.");
    } else {
      const period = employmentWindow(deps.today);
      const current = selectCurrentEmployees(remoteEmployees, jobs, period.from, period.to);
      const applied = await deps.applyEmployees(planEmployeeImports(current, localResources));
      report.employeesLinked = applied.linked;
      report.employeesCreated = applied.created;
      report.employeesDeactivated = applied.deactivated;
      report.employeesRemoved = applied.removed;
      report.employeesReactivated = applied.reactivated;
      if (applied.error) warnings.push(`Ansatte: ${applied.error}`);
    }
  } catch (error) {
    warnings.push(`Ansatte: ${publicSyncError(error)}`);
  }

  try {
    const [remoteProjects, localProjects] = await Promise.all([deps.projects(), deps.loadProjects()]);
    const plan = planProjectImports(remoteProjects, localProjects, deps.today);
    const applied = await deps.applyProjects(plan);
    report.projectsCreated = applied.created;
    report.projectsUpdated = applied.updated;
    report.projectsArchived = applied.archived;
    report.projectsSkipped = plan.filter((change) => change.kind === "skip").length;
    report.projectsKeptInternal = plan.filter((change) => change.kind === "keep").length;
    if (applied.error) warnings.push(`Prosjekter: ${applied.error}`);
  } catch (error) {
    warnings.push(`Prosjekter: ${publicSyncError(error)}`);
  }

  try {
    const window = syncWindow(deps.today);
    const [entries, loaded] = await Promise.all([
      deps.entries(window.dateFrom, window.dateTo),
      deps.loadLinks(),
    ]);
    fetchedEntries.push(...entries);
    const ignoredProjectIds = new Set(loaded.ignoredProjectIds);
    report.entriesSkipped = entries.filter(
      (entry) => entry.projectId != null && ignoredProjectIds.has(entry.projectId),
    ).length;
    const classified = classifyEntries(entries, loaded.links, ignoredProjectIds);
    for (const entry of classified) {
      const outcome = await deps.writeEntry(entry);
      if (outcome === "inserted") report.inserted += 1;
      else if (outcome === "updated") report.updated += 1;
      else report.unchanged += 1;
    }
    report.unmapped = classified.filter((entry) => entry.unmappedReason).length;
    report.entriesWithoutProject = classified.filter(
      (entry) => !entry.projectId && (entry.tripletexProjectId != null || entry.projectLabel.trim().length > 0),
    ).length;
  } catch (error) {
    warnings.push(`Timer: ${publicSyncError(error)}`);
  }

  try {
    const window = syncWindow(deps.today);
    const employeeIds = [...new Set(fetchedEntries.map((entry) => entry.employeeId))];
    const weeks = (
      await Promise.all(weekYearsBetween(window.dateFrom, window.dateTo).map((weekYear) => deps.weeks(employeeIds, weekYear)))
    ).flat();
    report.incompleteWeeks = incompleteWeekCount(weeks);
  } catch (error) {
    warnings.push(`Uke-status: ${publicSyncError(error)}`);
  }

  report.ok = warnings.length === 0;
  report.message = syncSummary(report);
  try {
    await deps.saveState(report.ok, report.message);
  } catch (error) {
    warnings.push(`Lagring: ${publicSyncError(error)}`);
    report.ok = false;
    report.message = syncSummary(report);
  }
  return report;
}
