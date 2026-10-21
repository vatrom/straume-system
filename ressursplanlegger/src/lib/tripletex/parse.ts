import type { TripletexEmployee, TripletexEntry, TripletexProject, TripletexWeek } from "./types";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function nestedId(value: unknown): number | null {
  if (typeof value === "number") return value;
  const row = record(value);
  return row ? num(row.id) : null;
}

export function readToken(payload: unknown): string | null {
  const row = record(payload);
  if (!row) return null;
  if (typeof row.token === "string" && row.token) return row.token;
  const value = record(row.value);
  if (value && typeof value.token === "string" && value.token) return value.token;
  return null;
}

export function readPageValues(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const row = record(payload);
  if (!row) return [];
  if (Array.isArray(row.values)) return row.values;
  if (Array.isArray(row.value)) return row.value;
  return [];
}

export function pageIsLast(payload: unknown, fetched: number, pageSize: number): boolean {
  const row = record(payload);
  const full = row ? num(row.fullResultSize) : null;
  if (full != null) return fetched >= full;
  return readPageValues(payload).length < pageSize;
}

export function normalizeEmployee(raw: unknown): TripletexEmployee | null {
  const row = record(raw);
  const id = row ? num(row.id) : null;
  if (!row || id == null) return null;
  return {
    id,
    firstName: text(row.firstName),
    lastName: text(row.lastName),
    isContact: row.isContact === true,
  };
}

export function staffEmployees(rows: TripletexEmployee[]): TripletexEmployee[] {
  return rows.filter((row) => !row.isContact);
}

function isoDay(value: unknown): string | null {
  const raw = text(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function customerName(row: Record<string, unknown>): string {
  const nested = record(row.customer);
  if (nested) {
    const name = text(nested.name).trim();
    if (name) return name;
  }
  return text(row.customerName).trim();
}

export function normalizeProject(raw: unknown): TripletexProject | null {
  const row = record(raw);
  const id = row ? num(row.id) : null;
  if (!row || id == null) return null;
  return {
    id,
    number: text(row.number),
    name: text(row.name) || text(row.displayName),
    customer: customerName(row),
    startDate: isoDay(row.startDate),
    endDate: isoDay(row.endDate),
    closed: row.isClosed === true || row.closed === true,
  };
}

export function normalizeEntry(raw: unknown): TripletexEntry | null {
  const row = record(raw);
  const id = row ? num(row.id) : null;
  if (!row || id == null) return null;
  const employee = record(row.employee);
  const project = record(row.project);
  const activity = record(row.activity);
  const employeeId = nestedId(row.employee);
  const hours = num(row.hours);
  const date = text(row.date).slice(0, 10);
  if (employeeId == null || hours == null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const first = employee ? text(employee.firstName) : "";
  const last = employee ? text(employee.lastName) : "";
  return {
    id,
    date,
    hours,
    comment: text(row.comment),
    employeeId,
    employeeName: `${first} ${last}`.trim() || `Ansatt ${employeeId}`,
    projectId: nestedId(row.project),
    projectNumber: project ? text(project.number) : "",
    projectName: project ? text(project.name) || text(project.displayName) : "",
    activityName: activity ? text(activity.name) : text(row.activity),
  };
}

export function normalizeWeek(raw: unknown): TripletexWeek | null {
  const row = record(raw);
  if (!row) return null;
  const employeeId = nestedId(row.employee) ?? num(row.employeeId);
  if (employeeId == null) return null;
  return {
    employeeId,
    weekYear: text(row.weekYear),
    completed: row.completed === true,
  };
}
