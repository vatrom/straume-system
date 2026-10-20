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
  absences: AbsenceInput[];
};

export type ProjectStatus = "planlagt" | "pågår" | "ferdig";

export type ProjectInput = {
  id: string;
  name: string;
  startDate: IsoDate;
  endDate: IsoDate | null;
  estimatedHours: number;
  status: ProjectStatus;
  color: string;
  resourceIds: string[];
};

export type ProjectSlice = {
  id: string;
  name: string;
  color: string;
  hours: number;
};

export type DayCell = {
  date: IsoDate;
  capacityHours: number;
  bookedHours: number;
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

function assignedResources(project: ProjectInput, resources: ResourceInput[]): ResourceInput[] {
  const ids = new Set(project.resourceIds);
  return resources.filter((resource) => ids.has(resource.id) && resource.active);
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

  if (project.status === "ferdig" || project.estimatedHours <= HOURS_EPSILON) {
    return { schedule, warnings };
  }

  const requested = resources.filter((resource) => project.resourceIds.includes(resource.id));
  const inactive = requested.filter((resource) => !resource.active);
  const team = assignedResources(project, resources);
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

  const totalWeekly = team.reduce((sum, resource) => sum + resource.weeklyCapacityHours, 0);
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
    for (const resource of team) {
      const share = project.estimatedHours * (resource.weeklyCapacityHours / totalWeekly);
      const days = eachDate(project.startDate, project.endDate).filter((iso) =>
        isWorkingDay(resource, iso),
      );
      if (days.length === 0) {
        schedule.unallocatedHours += share;
        warnings.push({
          projectId: project.id,
          projectName: project.name,
          message: `${resource.name} har ingen arbeidsdager mellom oppstart og slutt, så ${formatWarningHours(share)} timer ble ikke lagt inn.`,
        });
        continue;
      }
      const perDay = share / days.length;
      for (const iso of days) {
        addBooking(bookings, resource.id, iso, perDay);
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
        .map((resource) => ({
          resource,
          capacity: absenceReasonOn(resource, cursor) ? 0 : dailyCapacity(resource.weeklyCapacityHours),
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
    level: loadLevel(0, capacity),
    holidayName: holiday,
    absenceReason: absence,
    projects: [],
  };
}

export function buildPlan(
  resources: ResourceInput[],
  projects: ProjectInput[],
  from: IsoDate,
  to: IsoDate,
): Plan {
  const schedules = new Map<string, ScheduledProject>();
  const warnings: PlanWarning[] = [];
  for (const project of projects) {
    const result = scheduleProject(project, resources);
    schedules.set(project.id, result.schedule);
    warnings.push(...result.warnings);
  }

  const projectById = new Map(projects.map((project) => [project.id, project]));
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
        cell.projects.push({
          id: project.id,
          name: project.name,
          color: project.color,
          hours,
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
  let absenceDays = 0;
  let hasOverloadedDay = false;
  const projectHours = new Map<string, ProjectSlice>();

  for (const day of dayCells) {
    capacityHours += day.capacityHours;
    bookedHours += day.bookedHours;
    if (day.absenceReason) absenceDays += 1;
    if (day.level === "over") hasOverloadedDay = true;
    for (const project of day.projects) {
      const current = projectHours.get(project.id);
      if (current) current.hours += project.hours;
      else projectHours.set(project.id, { ...project });
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
    let absenceDays = 0;
    let hasOverloadedDay = false;
    const projectHours = new Map<string, ProjectSlice>();
    for (const cell of cells) {
      capacityHours += cell.capacityHours;
      bookedHours += cell.bookedHours;
      absenceDays += cell.absenceDays;
      if (cell.level === "over" || cell.hasOverloadedDay) hasOverloadedDay = true;
      for (const project of cell.projects) {
        const current = projectHours.get(project.id);
        if (current) current.hours += project.hours;
        else projectHours.set(project.id, { ...project });
      }
    }
    return {
      ...sample,
      capacityHours,
      bookedHours,
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

  const { schedule } = scheduleProject(draft, resources);
  const peakEnd = schedule.finishDate && schedule.finishDate > to ? schedule.finishDate : to;
  const peakPlan = peakEnd === to ? existing : buildPlan(resources, others, from, peakEnd);

  let peak: AssignmentPreview["peak"] = null;
  for (const [resourceId, byDate] of schedule.bookings) {
    for (const [date, hours] of byDate) {
      const cell = peakPlan.byResource.get(resourceId)?.get(date);
      const capacityHours = cell?.capacityHours ?? dailyCapacity(
        resources.find((resource) => resource.id === resourceId)?.weeklyCapacityHours ?? 0,
      );
      const bookedHours = (cell?.bookedHours ?? 0) + hours;
      if (!peak || worseLoad(bookedHours, capacityHours, peak)) {
        peak = { resourceId, date, bookedHours, capacityHours };
      }
    }
  }

  return {
    from,
    to,
    perResource,
    finishDate: schedule.finishDate,
    unallocatedHours: schedule.unallocatedHours,
    peak,
  };
}

export type GanttBar = {
  projectId: string;
  name: string;
  color: string;
  startWeekIndex: number;
  endWeekIndex: number;
  finishDate: IsoDate | null;
  openEnded: boolean;
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
  for (const project of projects) {
    if (project.status === "ferdig") continue;
    const schedule = schedules.get(project.id);
    const finish = project.endDate ?? schedule?.finishDate ?? null;
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
      projectId: project.id,
      name: project.name,
      color: project.color,
      startWeekIndex,
      endWeekIndex,
      finishDate: schedule?.finishDate ?? project.endDate,
      openEnded: !project.endDate,
    });
  }
  return bars;
}
