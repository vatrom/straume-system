import { prisma } from "./db";
import { needsTripletexSetup } from "./tripletex/import";
import { dateToIso, todayIso, addDays, mondayOf, sundayOf, formatShort, isoWeek } from "./dates";
import { holidaysBetween } from "./holidays";
import {
  buildPlan,
  firmResources,
  isHiddenProject,
  ganttBars,
  INNLEID_LABEL,
  loadLevel,
  overloadSpans,
  previewAssignment,
  sumCells,
  totalWeekCells,
  weekRangeLabel,
  weekRows,
  type OverloadSpan,
  type DayCell,
  type GanttBar,
  type PlanWarning,
  type ProjectInput,
  type ProjectStatus,
  type ResourceInput,
  type WeekCell,
  type WeekRow,
} from "./planning";

const STATUSES = new Set<ProjectStatus>(["planlagt", "pågår", "ferdig", "tentativ"]);

export async function loadInputs() {
  const [resourceRows, projectRows] = await Promise.all([
    prisma.resource.findMany({ include: { absences: true } }),
    prisma.project.findMany({
      include: {
        assignments: true,
        phases: { include: { assignments: true }, orderBy: { sortOrder: "asc" } },
      },
    }),
  ]);
  const resources = resourceRows.sort((a, b) => a.name.localeCompare(b.name, "nb"));
  const projects = projectRows.sort(
    (a, b) => a.startDate.getTime() - b.startDate.getTime() || a.name.localeCompare(b.name, "nb"),
  );

  const resourceInputs: ResourceInput[] = resources.map((resource) => ({
    id: resource.id,
    name: resource.name,
    role: resource.role,
    weeklyCapacityHours: resource.weeklyCapacityHours,
    active: resource.active,
    innleid: resource.innleid,
    absences: resource.absences.map((absence) => ({
      startDate: dateToIso(absence.startDate),
      endDate: dateToIso(absence.endDate),
      reason: absence.reason,
    })),
  }));

  const projectInputs: ProjectInput[] = projects.map((project) => ({
    id: project.id,
    name: project.name,
    startDate: dateToIso(project.startDate),
    endDate: project.endDate ? dateToIso(project.endDate) : null,
    estimatedHours: project.estimatedHours,
    status: STATUSES.has(project.status as ProjectStatus) ? (project.status as ProjectStatus) : "planlagt",
    color: project.color,
    resourceIds: project.assignments.map((assignment) => assignment.resourceId),
    assignments: project.assignments.map((assignment) => ({
      resourceId: assignment.resourceId,
      allocationPercent: assignment.allocationPercent,
    })),
    phases: project.phases.map((phase) => ({
      id: phase.id,
      name: phase.name,
      startDate: dateToIso(phase.startDate),
      endDate: phase.endDate ? dateToIso(phase.endDate) : null,
      estimatedHours: phase.estimatedHours,
      assignments: phase.assignments.map((assignment) => ({
        resourceId: assignment.resourceId,
        allocationPercent: assignment.allocationPercent,
      })),
    })),
    archived: project.archived,
    syncIgnored: project.syncIgnored,
  }));

  return { resources, projects, resourceInputs, projectInputs };
}

export type DashboardData = {
  today: string;
  activeResources: number;
  activeProjects: number;
  exampleCount: number;
  freeHours: number;
  capacityHours: number;
  overloadWeeks: {
    id: string;
    monday: string;
    label: string;
    range: string;
    names: string[];
  }[];
  overloadSpans: OverloadSpan[];
  roles: { role: string; freeHours: number; capacityHours: number }[];
  fag: string;
  nextWeekLabel: string;
  nextWeekPeople: {
    id: string;
    name: string;
    role: string;
    freeHours: number;
    bookedHours: number;
    capacityHours: number;
    level: ReturnType<typeof loadLevel>;
    note: string | null;
  }[];
  hiredPeople: {
    id: string;
    name: string;
    role: string;
    bookedHours: number;
    capacityHours: number;
  }[];
  personell: "" | "innleid";
  newFromTripletex: { id: string; name: string }[];
};

export async function getDashboard(fag = "", personell: "" | "innleid" = ""): Promise<DashboardData> {
  const { resources, projects, resourceInputs, projectInputs } = await loadInputs();
  const today = todayIso();
  const thisMonday = mondayOf(today);
  const horizonEnd = addDays(thisMonday, 16 * 7 - 1);
  const fourWeekEnd = addDays(thisMonday, 4 * 7 - 1);
  const nextMonday = addDays(thisMonday, 7);
  const nextSunday = addDays(nextMonday, 6);
  const plan = buildPlan(
    resourceInputs,
    projectInputs.filter((project) => !isHiddenProject(project)),
    thisMonday,
    horizonEnd,
  );
  const active = resourceInputs.filter((resource) => resource.active);
  const staff = firmResources(active);
  const visibleStaff = fag ? staff.filter((resource) => resource.role === fag) : staff;
  const visibleHired = active.filter((resource) => resource.innleid && (!fag || resource.role === fag));

  const roleNames = [...new Set(staff.map((resource) => resource.role))].sort((a, b) => a.localeCompare(b, "nb"));
  const roles = roleNames.map((role) => {
    let roleFree = 0;
    let roleCapacity = 0;
    for (const resource of staff.filter((item) => item.role === role)) {
      const cells = [...(plan.byResource.get(resource.id)?.values() ?? [])].filter(
        (cell) => cell.date >= today && cell.date <= fourWeekEnd,
      );
      const sums = sumCells(cells);
      roleFree += sums.freeHours;
      roleCapacity += sums.capacityHours;
    }
    return { role, freeHours: roleFree, capacityHours: roleCapacity };
  });

  let freeHours = 0;
  let capacityHours = 0;
  for (const resource of visibleStaff) {
    const cells = [...(plan.byResource.get(resource.id)?.values() ?? [])].filter(
      (cell) => cell.date >= today && cell.date <= fourWeekEnd,
    );
    const sums = sumCells(cells);
    freeHours += sums.freeHours;
    capacityHours += sums.capacityHours;
  }

  const rows = weekRows(plan, visibleStaff, thisMonday, horizonEnd);
  const spans = overloadSpans(rows, visibleStaff);
  const overloadWeeks: DashboardData["overloadWeeks"] = [];
  if (rows[0]) {
    rows[0].cells.forEach((cell, index) => {
      const names = rows
        .filter((row) => row.cells[index].level === "over")
        .map((row) => staff.find((resource) => resource.id === row.resourceId)?.name ?? "")
        .filter(Boolean);
      if (names.length === 0) return;
      overloadWeeks.push({
        id: cell.id,
        monday: cell.monday,
        label: `Uke ${cell.week}`,
        range: weekRangeLabel(cell.monday, cell.sunday),
        names,
      });
    });
  }

  const nextWeekPeople = visibleStaff
    .map((resource) => {
      const cells = [...(plan.byResource.get(resource.id)?.values() ?? [])].filter(
        (cell) => cell.date >= nextMonday && cell.date <= nextSunday,
      );
      const sums = sumCells(cells);
      const absence = cells.find((cell) => cell.absenceReason)?.absenceReason ?? null;
      const level = loadLevel(sums.bookedHours, sums.capacityHours);
      return {
        id: resource.id,
        name: resource.name,
        role: resource.role,
        freeHours: sums.freeHours,
        bookedHours: sums.bookedHours,
        capacityHours: sums.capacityHours,
        level,
        note: absence && sums.capacityHours === 0 ? absence : null,
      };
    })
    .sort((a, b) => b.freeHours - a.freeHours || a.name.localeCompare(b.name, "nb"));

  const hiredPeople = visibleHired
    .map((resource) => {
      const cells = [...(plan.byResource.get(resource.id)?.values() ?? [])].filter(
        (cell) => cell.date >= nextMonday && cell.date <= nextSunday,
      );
      const sums = sumCells(cells);
      return {
        id: resource.id,
        name: resource.name,
        role: resource.role,
        bookedHours: sums.bookedHours,
        capacityHours: sums.capacityHours,
      };
    })
    .sort((a, b) => b.bookedHours - a.bookedHours || a.name.localeCompare(b.name, "nb"));

  return {
    today,
    activeResources: staff.length,
    activeProjects: projectInputs.filter((project) => !isHiddenProject(project) && project.status !== "ferdig").length,
    exampleCount:
      resources.filter((resource) => resource.isExample).length +
      projects.filter((project) => project.isExample).length,
    freeHours,
    capacityHours,
    overloadWeeks,
    overloadSpans: spans,
    roles,
    fag,
    nextWeekLabel: `Uke ${isoWeek(nextMonday).week} · ${formatShort(nextMonday)}–${formatShort(nextSunday)}`,
    nextWeekPeople,
    hiredPeople,
    personell,
    newFromTripletex: projects
      .filter((project) => !project.archived && !project.syncIgnored)
      .filter((project) =>
        needsTripletexSetup({
          tripletexProjectId: project.tripletexProjectId,
          estimatedHours: project.estimatedHours,
          assignments: project.assignments,
          phases: project.phases,
        }),
      )
      .map((project) => ({ id: project.id, name: project.name })),
  };
}

export async function getExampleCount() {
  const [resources, projects] = await Promise.all([
    prisma.resource.count({ where: { isExample: true } }),
    prisma.project.count({ where: { isExample: true } }),
  ]);
  return resources + projects;
}

export type CapacityView = {
  mode: "uke" | "dag";
  weekCount: number;
  from: string;
  to: string;
  today: string;
  resources: ResourceInput[];
  projects: ProjectInput[];
  rows: WeekRow[];
  totals: WeekCell[];
  dayRows: { resource: ResourceInput; days: DayCell[] }[];
  dayColumns: DayCell[];
  gantt: GanttBar[];
  warnings: PlanWarning[];
  holidays: { date: string; name: string }[];
  fag: string;
  showTentative: boolean;
  personell: "" | "innleid";
  roleNames: string[];
  groups: { label: string; resourceIds: string[]; innleid?: boolean }[];
  everyone: ResourceInput[];
};

export async function getCapacityView(search: {
  visning?: string;
  fra?: string;
  antall?: string;
  fag?: string;
  tilbud?: string;
  personell?: string;
}): Promise<CapacityView> {
  const { resourceInputs, projectInputs } = await loadInputs();
  const today = todayIso();
  const mode = search.visning === "dag" ? "dag" : "uke";
  const weekCount = search.antall === "12" ? 12 : search.antall === "26" ? 26 : 16;
  const requested = search.fra && /^\d{4}-\d{2}-\d{2}$/.test(search.fra) ? search.fra : today;
  const from = mondayOf(requested);
  const span = mode === "dag" ? 4 : weekCount;
  const to = sundayOf(addDays(from, (span - 1) * 7));
  const showTentative = search.tilbud !== "av";
  const personell = search.personell === "innleid" ? "innleid" : "";
  const active = resourceInputs.filter((resource) => resource.active);
  const roleNames = [...new Set(firmResources(active).map((resource) => resource.role))].sort((a, b) =>
    a.localeCompare(b, "nb"),
  );
  const fag = search.fag && roleNames.includes(search.fag) ? search.fag : "";
  const roleFiltered = fag ? active.filter((resource) => resource.role === fag) : active;
  const visible = personell === "innleid" ? roleFiltered.filter((resource) => resource.innleid) : roleFiltered;
  const own = firmResources(visible);
  const hired = visible.filter((resource) => resource.innleid);
  const planningProjects = projectInputs.filter((project) => !isHiddenProject(project));
  const plan = buildPlan(active, planningProjects, from, to, { includeTentative: showTentative });
  const rows = weekRows(plan, visible, from, to);
  const grouped = new Map<string, string[]>();
  for (const resource of own) {
    const list = grouped.get(resource.role) ?? [];
    list.push(resource.id);
    grouped.set(resource.role, list);
  }
  const groups: CapacityView["groups"] = [...grouped.entries()].map(([label, resourceIds]) => ({ label, resourceIds }));
  if (hired.length > 0) {
    groups.push({ label: INNLEID_LABEL, resourceIds: hired.map((resource) => resource.id), innleid: true });
  }
  const ownIds = new Set(own.map((resource) => resource.id));
  const dayColumns: DayCell[] = [];
  const first = visible[0] ?? active[0];
  if (first) {
    for (const cell of plan.byResource.get(first.id)?.values() ?? []) {
      const day = new Date(`${cell.date}T00:00:00Z`).getUTCDay();
      if (day !== 0 && day !== 6) dayColumns.push(cell);
    }
  }
  const dayRows = visible.map((resource) => ({
    resource,
    days: dayColumns.map((column) => {
      const cell = plan.byResource.get(resource.id)?.get(column.date);
      return (
        cell ?? {
          date: column.date,
          capacityHours: 0,
          bookedHours: 0,
          level: "off" as const,
          holidayName: column.holidayName,
          absenceReason: null,
          tentativeHours: 0,
          projects: [],
        }
      );
    }),
  }));

  return {
    mode,
    weekCount,
    from,
    to,
    today,
    resources: visible,
    projects: planningProjects,
    rows,
    totals: totalWeekCells(rows.filter((row) => ownIds.has(row.resourceId))),
    dayRows,
    dayColumns,
    gantt: ganttBars(
      showTentative ? planningProjects : planningProjects.filter((project) => project.status !== "tentativ"),
      plan.schedules,
      from,
      to,
    ),
    warnings: plan.warnings,
    fag,
    showTentative,
    personell,
    roleNames,
    groups,
    everyone: active,
    holidays: holidaysBetween(from, to).filter((holiday) => {
      const day = new Date(`${holiday.date}T00:00:00Z`).getUTCDay();
      return day !== 0 && day !== 6;
    }),
  };
}

export async function getProjectSchedule(projectId: string) {
  const loaded = await loadInputs();
  const project = loaded.projectInputs.find((item) => item.id === projectId);
  if (!project) return null;
  const preview = previewAssignment(loaded.resourceInputs, loaded.projectInputs, project);
  return { stored: loaded, project, preview };
}
