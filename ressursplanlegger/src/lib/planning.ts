import {
  addDays,
  eachDate,
  formatShort,
  isWeekend,
  weeksCovering,
  type IsoDate,
} from "./dates";
import { holidayName } from "./holidays";

export type LoadLevel = "free" | "tight" | "over" | "off";

export type AbsenceInput = {
  startDate: IsoDate;
  endDate: IsoDate;
  reason: string;
};

export type ResourceInput = {
  id: string;
  name: string;
  role: string;
  weeklyCapacityHours: number;
  active: boolean;
  /** Hired-in. Their spare time is not firm free capacity. */
  innleid?: boolean;
  absences: AbsenceInput[];
};

export const INNLEID_LABEL = "Innleid personell";

export function firmResources<T extends { innleid?: boolean }>(resources: T[]): T[] {
  return resources.filter((resource) => !resource.innleid);
}

/** Empty hired-in time is a possibility, not green free capacity. Load still uses the normal colours. */
export function cellTone(
  innleid: boolean | undefined,
  cell: { level: LoadLevel; bookedHours: number },
): LoadLevel | "possible" {
  if (!innleid) return cell.level;
  if (cell.level === "over" || cell.level === "tight" || cell.level === "off") return cell.level;
  if (cell.bookedHours > 0.05) return cell.level;
  return "possible";
}

export type ProjectStatus = "planlagt" | "pågår" | "ferdig" | "tentativ";

export function isHiddenProject(project: { archived?: boolean; syncIgnored?: boolean }): boolean {
  return project.archived === true || project.syncIgnored === true;
}

export type AssignmentInput = {
  resourceId: string;
  allocationPercent: number;
};

export type PhaseInput = {
  id: string;
  name: string;
  startDate: IsoDate;
  endDate: IsoDate | null;
  estimatedHours: number;
  assignments: AssignmentInput[];
};

export type ProjectInput = {
  id: string;
  name: string;
  startDate: IsoDate;
  endDate: IsoDate | null;
  estimatedHours: number;
  status: ProjectStatus;
  color: string;
  resourceIds: string[];
  assignments?: AssignmentInput[];
  phases?: PhaseInput[];
  parentId?: string;
  phaseName?: string;
  archived?: boolean;
  syncIgnored?: boolean;
};

export type ProjectSlice = {
  id: string;
  name: string;
  color: string;
  hours: number;
  tentative?: boolean;
  phaseName?: string;
  parentId?: string;
};

export type DayCell = {
  date: IsoDate;
  capacityHours: number;
  bookedHours: number;
  tentativeHours: number;
  level: LoadLevel;
  holidayName: string | null;
  absenceReason: string | null;
  projects: ProjectSlice[];
};

export type PlanWarning = {
  projectId: string;
  projectName: string;
  message: string;
};

export type ScheduledProject = {
  projectId: string;
  finishDate: IsoDate | null;
  unallocatedHours: number;
  /** resourceId -> date -> hours */
  bookings: Map<string, Map<IsoDate, number>>;
};

export type Plan = {
  days: IsoDate[];
  byResource: Map<string, Map<IsoDate, DayCell>>;
  schedules: Map<string, ScheduledProject>;
  warnings: PlanWarning[];
};

const HOURS_EPSILON = 0.001;
const OPEN_ENDED_LIMIT_DAYS = 366 * 2;

export function dailyCapacity(weeklyCapacityHours: number): number {
  return weeklyCapacityHours / 5;
}

export function roundHours(value: number): number {
  return Math.round(value * 10) / 10;
}

export function loadLevel(bookedHours: number, capacityHours: number): LoadLevel {
  const booked = roundHours(bookedHours);
  const capacity = roundHours(capacityHours);
  if (capacity <= 0) return booked > 0 ? "over" : "off";
  const ratio = booked / capacity;
  if (ratio > 1) return "over";
  if (ratio >= 0.8) return "tight";
  return "free";
}

export function loadRatio(bookedHours: number, capacityHours: number): number | null {
  const capacity = roundHours(capacityHours);
  const booked = roundHours(bookedHours);
  if (capacity <= 0) return booked > 0 ? Number.POSITIVE_INFINITY : 0;
  return booked / capacity;
}

export function absenceReasonOn(resource: ResourceInput, iso: IsoDate): string | null {
  const match = resource.absences.find(
    (absence) => iso >= absence.startDate && iso <= absence.endDate,
  );
  return match?.reason ?? null;
}

export function isWorkingDay(resource: ResourceInput, iso: IsoDate): boolean {
  if (!resource.active) return false;
  if (isWeekend(iso)) return false;
  if (holidayName(iso)) return false;
  if (absenceReasonOn(resource, iso)) return false;
  return true;
}

function formatWarningHours(value: number): string {
  return new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 1 }).format(
    Math.round(value * 10) / 10,
  );
}

function addBooking(
  bookings: Map<string, Map<IsoDate, number>>,
  resourceId: string,
  iso: IsoDate,
  hours: number,
) {
  if (hours <= HOURS_EPSILON) return;
  let byDate = bookings.get(resourceId);
  if (!byDate) {
    byDate = new Map();
    bookings.set(resourceId, byDate);
  }
  byDate.set(iso, (byDate.get(iso) ?? 0) + hours);
}

type Member = {
  resource: ResourceInput;
  allocation: number;
  weight: number;
};

export function assignmentList(project: ProjectInput): AssignmentInput[] {
  if (project.assignments && project.assignments.length > 0) return project.assignments;
  return project.resourceIds.map((resourceId) => ({ resourceId, allocationPercent: 100 }));
}

function membersOf(project: ProjectInput, resources: ResourceInput[]) {
  const requested: ResourceInput[] = [];
  const members: Member[] = [];
  for (const assignment of assignmentList(project)) {
    const resource = resources.find((item) => item.id === assignment.resourceId);
    if (!resource) continue;
    requested.push(resource);
    const allocation = Math.min(100, Math.max(0, assignment.allocationPercent)) / 100;
    if (!resource.active || allocation <= 0) continue;
    members.push({
      resource,
      allocation,
      weight: resource.weeklyCapacityHours * allocation,
    });
  }
  return { requested, members };
}

/** A project with phases becomes one planning unit per phase. Without phases, nothing changes. */
export function expandProjects(projects: ProjectInput[]): ProjectInput[] {
  const units: ProjectInput[] = [];
  for (const project of projects) {
    if (!project.phases || project.phases.length === 0) {
      units.push(project);
      continue;
    }
    for (const phase of project.phases) {
      units.push({
        ...project,
        id: phase.id,
        parentId: project.id,
        phaseName: phase.name,
        name: `${project.name} · ${phase.name}`,
        startDate: phase.startDate,
        endDate: phase.endDate,
        estimatedHours: phase.estimatedHours,
        resourceIds: phase.assignments.map((assignment) => assignment.resourceId),
        assignments: phase.assignments,
        phases: [],
      });
    }
  }
  return units;
}

export function scheduleProject(
  project: ProjectInput,
  resources: ResourceInput[],
): { schedule: ScheduledProject; warnings: PlanWarning[] } {
  const warnings: PlanWarning[] = [];
  const bookings: Map<string, Map<IsoDate, number>> = new Map();
  const schedule: ScheduledProject = {
    projectId: project.id,
    finishDate: null,
    unallocatedHours: 0,
    bookings,
  };

  if (isHiddenProject(project) || project.status === "ferdig" || project.estimatedHours <= HOURS_EPSILON) {
    return { schedule, warnings };
  }

  const { requested, members } = membersOf(project, resources);
  const inactive = requested.filter((resource) => !resource.active);
  const team = members;
  if (inactive.length > 0 && team.length > 0) {
    warnings.push({
      projectId: project.id,
      projectName: project.name,
      message: `${inactive.map((resource) => resource.name).join(", ")} er ikke aktiv og får ingen timer.`,
    });
  }
  if (team.length === 0) {
    schedule.unallocatedHours = project.estimatedHours;
    warnings.push({
      projectId: project.id,
      projectName: project.name,
      message: "Ingen aktive ressurser er tildelt, så timene blir ikke lagt i planen.",
    });
    return { schedule, warnings };
  }

  const totalWeekly = team.reduce((sum, member) => sum + member.weight, 0);
  if (totalWeekly <= HOURS_EPSILON) {
    schedule.unallocatedHours = project.estimatedHours;
    warnings.push({
      projectId: project.id,
      projectName: project.name,
      message: "De tildelte ressursene har ingen ukekapasitet.",
    });
    return { schedule, warnings };
  }

  if (project.endDate && project.endDate >= project.startDate) {
    let last: IsoDate | null = null;
    for (const member of team) {
      const share = project.estimatedHours * (member.weight / totalWeekly);
      const days = eachDate(project.startDate, project.endDate).filter((iso) =>
        isWorkingDay(member.resource, iso),
      );
      if (days.length === 0) {
        schedule.unallocatedHours += share;
        warnings.push({
          projectId: project.id,
          projectName: project.name,
          message: `${member.resource.name} har ingen arbeidsdager mellom oppstart og slutt, så ${formatWarningHours(share)} timer ble ikke lagt inn.`,
        });
        continue;
      }
      const perDay = share / days.length;
      for (const iso of days) {
        addBooking(bookings, member.resource.id, iso, perDay);
        if (!last || iso > last) last = iso;
      }
    }
    schedule.finishDate = last ?? project.endDate;
    return { schedule, warnings };
  }

  let remaining = project.estimatedHours;
  let cursor = project.startDate;
  let guard = 0;
  let idleDays = 0;
  while (remaining > HOURS_EPSILON && guard < OPEN_ENDED_LIMIT_DAYS) {
    guard += 1;
    const holiday = holidayName(cursor);
    if (!isWeekend(cursor) && !holiday) {
      const available = team
        .map((member) => ({
          resource: member.resource,
          capacity: absenceReasonOn(member.resource, cursor)
            ? 0
            : dailyCapacity(member.resource.weeklyCapacityHours) * member.allocation,
        }))
        .filter((entry) => entry.capacity > HOURS_EPSILON);
      const dayCapacity = available.reduce((sum, entry) => sum + entry.capacity, 0);
      if (dayCapacity > HOURS_EPSILON) {
        const bookedToday = Math.min(remaining, dayCapacity);
        for (const entry of available) {
          addBooking(
            bookings,
            entry.resource.id,
            cursor,
            bookedToday * (entry.capacity / dayCapacity),
          );
        }
        remaining -= bookedToday;
        schedule.finishDate = cursor;
        idleDays = 0;
      } else {
        idleDays += 1;
      }
    }
    if (remaining > HOURS_EPSILON) cursor = addDays(cursor, 1);
  }

  if (remaining > HOURS_EPSILON) {
    schedule.unallocatedHours = remaining;
    warnings.push({
      projectId: project.id,
      projectName: project.name,
      message:
        idleDays > 20
          ? "Fant ikke nok arbeidsdager de neste to årene. Sjekk fravær og om noen er aktive."
          : "Kunne ikke plassere alle timene innen to år.",
    });
  }

  return { schedule, warnings };
}

function emptyCell(resource: ResourceInput, iso: IsoDate): DayCell {
  const holiday = isWeekend(iso) ? null : holidayName(iso);
  const absence = isWeekend(iso) || holiday ? null : absenceReasonOn(resource, iso);
  const capacity =
    resource.active && !isWeekend(iso) && !holiday && !absence
      ? dailyCapacity(resource.weeklyCapacityHours)
      : 0;
  return {
    date: iso,
    capacityHours: capacity,
    bookedHours: 0,
    tentativeHours: 0,
    level: loadLevel(0, capacity),
    holidayName: holiday,
    absenceReason: absence,
    projects: [],
  };
}

export type PlanOptions = {
  includeTentative?: boolean;
};

export function buildPlan(
  resources: ResourceInput[],
  projects: ProjectInput[],
  from: IsoDate,
  to: IsoDate,
  options?: PlanOptions,
): Plan {
  const includeTentative = options?.includeTentative !== false;
  const visible = projects.filter((project) => includeTentative || project.status !== "tentativ");
  const units = expandProjects(visible);
  const schedules = new Map<string, ScheduledProject>();
  const warnings: PlanWarning[] = [];
  for (const project of units) {
    const result = scheduleProject(project, resources);
    schedules.set(project.id, result.schedule);
    warnings.push(...result.warnings);
  }

  const projectById = new Map(units.map((project) => [project.id, project]));
  const days = eachDate(from, to);
  const byResource = new Map<string, Map<IsoDate, DayCell>>();

  for (const resource of resources) {
    const cells = new Map<IsoDate, DayCell>();
    for (const iso of days) cells.set(iso, emptyCell(resource, iso));
    byResource.set(resource.id, cells);
  }

  for (const [projectId, schedule] of schedules) {
    const project = projectById.get(projectId);
    if (!project) continue;
    for (const [resourceId, byDate] of schedule.bookings) {
      const cells = byResource.get(resourceId);
      if (!cells) continue;
      for (const [iso, hours] of byDate) {
        const cell = cells.get(iso);
        if (!cell) continue;
        cell.bookedHours += hours;
        if (project.status === "tentativ") cell.tentativeHours += hours;
        cell.projects.push({
          id: project.parentId ?? project.id,
          parentId: project.parentId,
          phaseName: project.phaseName,
          name: project.name,
          color: project.color,
          hours,
          tentative: project.status === "tentativ",
        });
      }
    }
  }

  for (const cells of byResource.values()) {
    for (const cell of cells.values()) {
      cell.projects.sort((a, b) => b.hours - a.hours);
      cell.level = loadLevel(cell.bookedHours, cell.capacityHours);
    }
  }

  return { days, byResource, schedules, warnings };
}

export type WeekCell = {
  id: string;
  week: number;
  weekYear: number;
  monday: IsoDate;
  sunday: IsoDate;
  capacityHours: number;
  bookedHours: number;
  tentativeHours: number;
  level: LoadLevel;
  hasOverloadedDay: boolean;
  absenceDays: number;
  projects: ProjectSlice[];
};

export type WeekRow = {
  resourceId: string;
  cells: WeekCell[];
};

function aggregateWeek(
  id: string,
  week: number,
  weekYear: number,
  monday: IsoDate,
  sunday: IsoDate,
  dayCells: DayCell[],
): WeekCell {
  let capacityHours = 0;
  let bookedHours = 0;
  let tentativeHours = 0;
  let absenceDays = 0;
  let hasOverloadedDay = false;
  const projectHours = new Map<string, ProjectSlice>();

  for (const day of dayCells) {
    capacityHours += day.capacityHours;
    bookedHours += day.bookedHours;
    tentativeHours += day.tentativeHours;
    if (day.absenceReason) absenceDays += 1;
    if (day.level === "over") hasOverloadedDay = true;
    for (const project of day.projects) {
      const key = `${project.id}:${project.phaseName ?? ""}`;
      const current = projectHours.get(key);
      if (current) current.hours += project.hours;
      else projectHours.set(key, { ...project });
    }
  }

  return {
    id,
    week,
    weekYear,
    monday,
    sunday,
    capacityHours,
    bookedHours,
    tentativeHours,
    level: loadLevel(bookedHours, capacityHours),
    hasOverloadedDay,
    absenceDays,
    projects: [...projectHours.values()].sort((a, b) => b.hours - a.hours),
  };
}

export function weekRows(plan: Plan, resources: ResourceInput[], from: IsoDate, to: IsoDate): WeekRow[] {
  const weeks = weeksCovering(from, to);
  return resources.map((resource) => {
    const cells = plan.byResource.get(resource.id);
    return {
      resourceId: resource.id,
      cells: weeks.map((week) => {
        const dayCells = eachDate(week.monday, week.sunday)
          .map((iso) => cells?.get(iso))
          .filter((cell): cell is DayCell => Boolean(cell));
        return aggregateWeek(week.id, week.week, week.weekYear, week.monday, week.sunday, dayCells);
      }),
    };
  });
}

export function totalWeekCells(rows: WeekRow[]): WeekCell[] {
  if (rows.length === 0) return [];
  return rows[0].cells.map((sample, index) => {
    const cells = rows.map((row) => row.cells[index]);
    let capacityHours = 0;
    let bookedHours = 0;
    let tentativeHours = 0;
    let absenceDays = 0;
    let hasOverloadedDay = false;
    const projectHours = new Map<string, ProjectSlice>();
    for (const cell of cells) {
      capacityHours += cell.capacityHours;
      bookedHours += cell.bookedHours;
      tentativeHours += cell.tentativeHours;
      absenceDays += cell.absenceDays;
      if (cell.level === "over" || cell.hasOverloadedDay) hasOverloadedDay = true;
      for (const project of cell.projects) {
        const key = `${project.id}:${project.phaseName ?? ""}`;
        const current = projectHours.get(key);
        if (current) current.hours += project.hours;
        else projectHours.set(key, { ...project });
      }
    }
    return {
      ...sample,
      capacityHours,
      bookedHours,
      tentativeHours,
      absenceDays,
      hasOverloadedDay,
      level: loadLevel(bookedHours, capacityHours),
      projects: [...projectHours.values()].sort((a, b) => b.hours - a.hours),
    };
  });
}

export function sumCells(cells: DayCell[], predicate?: (cell: DayCell) => boolean) {
  let capacityHours = 0;
  let bookedHours = 0;
  for (const cell of cells) {
    if (predicate && !predicate(cell)) continue;
    capacityHours += cell.capacityHours;
    bookedHours += cell.bookedHours;
  }
  return {
    capacityHours,
    bookedHours,
    freeHours: Math.max(0, capacityHours - bookedHours),
  };
}

export function weekRangeLabel(monday: IsoDate, sunday: IsoDate): string {
  return `${formatShort(monday)}–${formatShort(sunday)}`;
}

export type AssignmentPreview = {
  from: IsoDate;
  to: IsoDate;
  perResource: {
    id: string;
    capacityHours: number;
    bookedHours: number;
    freeHours: number;
  }[];
  finishDate: IsoDate | null;
  unallocatedHours: number;
  peak: {
    resourceId: string;
    date: IsoDate;
    bookedHours: number;
    capacityHours: number;
  } | null;
  overloads: OverloadSpan[];
  suggestions: ReplacementSuggestion[];
};

function worseLoad(
  booked: number,
  capacity: number,
  current: { bookedHours: number; capacityHours: number },
): boolean {
  const nextRatio = capacity <= HOURS_EPSILON ? (booked > HOURS_EPSILON ? 999 : 0) : booked / capacity;
  const currentRatio =
    current.capacityHours <= HOURS_EPSILON
      ? current.bookedHours > HOURS_EPSILON
        ? 999
        : 0
      : current.bookedHours / current.capacityHours;
  return nextRatio > currentRatio + 0.0001;
}

/** Free capacity around a draft project, plus the load that project would create. */
export function previewAssignment(
  resources: ResourceInput[],
  projects: ProjectInput[],
  draft: ProjectInput,
): AssignmentPreview {
  const others = projects.filter((project) => project.id !== draft.id);
  const from = draft.startDate;
  const to =
    draft.endDate && draft.endDate >= draft.startDate ? draft.endDate : addDays(draft.startDate, 55);
  const existing = buildPlan(resources, others, from, to);
  const perResource = resources
    .filter((resource) => resource.active)
    .map((resource) => {
      const cells = [...(existing.byResource.get(resource.id)?.values() ?? [])];
      return { id: resource.id, ...sumCells(cells) };
    });

  const draftUnits = expandProjects([draft]);
  let finishDate: IsoDate | null = null;
  let unallocatedHours = 0;
  const draftBookings = new Map<string, Map<IsoDate, number>>();
  for (const unit of draftUnits) {
    const { schedule } = scheduleProject(unit, resources);
    unallocatedHours += schedule.unallocatedHours;
    if (schedule.finishDate && (!finishDate || schedule.finishDate > finishDate)) {
      finishDate = schedule.finishDate;
    }
    for (const [resourceId, byDate] of schedule.bookings) {
      for (const [date, hours] of byDate) addBooking(draftBookings, resourceId, date, hours);
    }
  }
  const peakEnd = finishDate && finishDate > to ? finishDate : to;
  const combined = buildPlan(
    resources,
    [...others.filter((project) => project.id !== draft.id), draft],
    from,
    peakEnd,
  );

  let peak: AssignmentPreview["peak"] = null;
  for (const [resourceId, byDate] of draftBookings) {
    for (const date of byDate.keys()) {
      const cell = combined.byResource.get(resourceId)?.get(date);
      const capacityHours = cell?.capacityHours ?? 0;
      const bookedHours = cell?.bookedHours ?? 0;
      if (!peak || worseLoad(bookedHours, capacityHours, peak)) {
        peak = { resourceId, date, bookedHours, capacityHours };
      }
    }
  }

  const assignedIds = new Set(assignmentList(draft).map((assignment) => assignment.resourceId));
  for (const phase of draft.phases ?? []) {
    for (const assignment of phase.assignments) assignedIds.add(assignment.resourceId);
  }
  const relevant = resources.filter((resource) => assignedIds.has(resource.id));
  const rows = weekRows(combined, relevant, from, peakEnd);
  const overloads = overloadSpans(rows, relevant);
  const suggestions = suggestReplacements(resources, weekRows(combined, resources.filter((resource) => resource.active), from, peakEnd), overloads);

  return {
    from,
    to,
    perResource,
    finishDate,
    unallocatedHours,
    peak,
    overloads,
    suggestions,
  };
}

export type OverloadSpan = {
  resourceId: string;
  resourceName: string;
  role: string;
  fromWeek: number;
  toWeek: number;
  monday: IsoDate;
  label: string;
};

export function overloadSpans(rows: WeekRow[], resources: ResourceInput[]): OverloadSpan[] {
  const spans: OverloadSpan[] = [];
  for (const row of rows) {
    const resource = resources.find((item) => item.id === row.resourceId);
    if (!resource) continue;
    let open: OverloadSpan | null = null;
    for (const cell of row.cells) {
      if (cell.level === "over") {
        if (!open) {
          open = {
            resourceId: resource.id,
            resourceName: resource.name,
            role: resource.role,
            fromWeek: cell.week,
            toWeek: cell.week,
            monday: cell.monday,
            label: "",
          };
        } else if (cell.week === open.toWeek + 1 || (open.toWeek >= 52 && cell.week === 1)) {
          open.toWeek = cell.week;
        } else {
          spans.push(finishSpan(open));
          open = {
            resourceId: resource.id,
            resourceName: resource.name,
            role: resource.role,
            fromWeek: cell.week,
            toWeek: cell.week,
            monday: cell.monday,
            label: "",
          };
        }
      } else if (open) {
        spans.push(finishSpan(open));
        open = null;
      }
    }
    if (open) spans.push(finishSpan(open));
  }
  return spans;
}

function finishSpan(span: OverloadSpan): OverloadSpan {
  const label = span.fromWeek === span.toWeek ? `uke ${span.fromWeek}` : `uke ${span.fromWeek}–${span.toWeek}`;
  return { ...span, label };
}

export type ReplacementSuggestion = {
  forResourceId: string;
  id: string;
  name: string;
  role: string;
  freeHours: number;
};

export function suggestReplacements(
  resources: ResourceInput[],
  rows: WeekRow[],
  spans: OverloadSpan[],
): ReplacementSuggestion[] {
  const suggestions: ReplacementSuggestion[] = [];
  const seen = new Set<string>();
  for (const span of spans) {
    const person = resources.find((resource) => resource.id === span.resourceId);
    if (!person) continue;
    const indexes = rows[0]?.cells
      .map((cell, index) => ({ cell, index }))
      .filter(({ cell }) => {
        if (span.fromWeek <= span.toWeek) return cell.week >= span.fromWeek && cell.week <= span.toWeek;
        return cell.week >= span.fromWeek || cell.week <= span.toWeek;
      })
      .map(({ index }) => index) ?? [];
    const candidates = resources
      .filter((resource) => resource.active && !resource.innleid && resource.id !== person.id && resource.role === person.role)
      .map((resource) => {
        const row = rows.find((item) => item.resourceId === resource.id);
        const freeHours = indexes.reduce((sum, index) => {
          const cell = row?.cells[index];
          if (!cell) return sum;
          return sum + Math.max(0, cell.capacityHours - cell.bookedHours);
        }, 0);
        const overloaded = indexes.some((index) => row?.cells[index]?.level === "over");
        return { resource, freeHours, overloaded };
      })
      .filter((candidate) => !candidate.overloaded && candidate.freeHours > 0.5)
      .sort((a, b) => b.freeHours - a.freeHours)
      .slice(0, 3);
    for (const candidate of candidates) {
      const key = `${span.resourceId}:${candidate.resource.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      suggestions.push({
        forResourceId: span.resourceId,
        id: candidate.resource.id,
        name: candidate.resource.name,
        role: candidate.resource.role,
        freeHours: candidate.freeHours,
      });
    }
  }
  return suggestions;
}

export type GanttBar = {
  projectId: string;
  phaseId: string | null;
  name: string;
  color: string;
  startWeekIndex: number;
  endWeekIndex: number;
  finishDate: IsoDate | null;
  openEnded: boolean;
  tentative: boolean;
  resourceIds: string[];
};

export function ganttBars(
  projects: ProjectInput[],
  schedules: Map<string, ScheduledProject>,
  from: IsoDate,
  to: IsoDate,
): GanttBar[] {
  const weeks = weeksCovering(from, to);
  if (weeks.length === 0) return [];
  const bars: GanttBar[] = [];
  for (const project of expandProjects(projects)) {
    if (project.status === "ferdig" || isHiddenProject(project)) continue;
    const schedule = schedules.get(project.id);
    if (!schedule) continue;
    const finish = project.endDate ?? schedule.finishDate ?? null;
    if (!finish) continue;
    const start = project.startDate;
    if (finish < from || start > to) continue;
    const startWeekIndex = Math.max(
      0,
      weeks.findIndex((week) => start <= week.sunday),
    );
    let endWeekIndex = weeks.findIndex((week) => finish <= week.sunday && finish >= week.monday);
    if (endWeekIndex < 0) endWeekIndex = finish > to ? weeks.length - 1 : 0;
    bars.push({
      projectId: project.parentId ?? project.id,
      phaseId: project.phaseName ? project.id : null,
      name: project.name,
      color: project.color,
      startWeekIndex,
      endWeekIndex,
      finishDate: schedule.finishDate ?? project.endDate,
      openEnded: !project.endDate,
      tentative: project.status === "tentativ",
      resourceIds: assignmentList(project).map((assignment) => assignment.resourceId),
    });
  }
  return bars;
}
