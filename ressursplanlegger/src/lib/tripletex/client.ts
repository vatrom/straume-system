import { readTripletexConfig } from "./config";
import {
  employmentsOnEmployee,
  normalizeEmployee,
  normalizeEntry,
  normalizeProject,
  normalizeWeek,
  pageIsLast,
  readPageValues,
  readToken,
  staffEmployees,
} from "./parse";
import type {
  SessionRequest,
  TripletexConfig,
  TripletexEmployee,
  TripletexEmployment,
  TripletexEntry,
  TripletexProject,
  TripletexWeek,
} from "./types";

/**
 * Property names that exist on the Tripletex v2 DTOs. weekYear is a query param, not a Week field.
 * Employments are nested on /employee. GET /employee/employment without employeeId returns an empty list.
 */
export const NESTED_EMPLOYMENT_FIELDS = "startDate,endDate,noEmploymentRelationship";
export const EMPLOYEE_FIELDS = `id,firstName,lastName,isContact,isProxy,allowInformationRegistration,employments(${NESTED_EMPLOYMENT_FIELDS})`;
export const PROJECT_FIELDS = "id,number,name,startDate,endDate,isClosed,isInternal,customer(id,name)";
export const ENTRY_FIELDS = "id,date,hours,comment,employee(id,firstName,lastName),project(id,number,name),activity(name)";
export const WEEK_FIELDS = "employee(id),year,week,completed";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const PAGE = 1000;

export function sessionRequest(config: TripletexConfig): SessionRequest {
  if (config.mode === "refresh") {
    return {
      url: `${config.baseUrl}/token/session/:createFromRefreshToken`,
      method: "POST",
      body: { refreshToken: config.refreshToken, ttlSeconds: 3600 },
    };
  }
  const expirationDate = new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 19);
  return {
    url: `${config.baseUrl}/token/session/:create`,
    method: "POST",
    body: {
      consumerToken: config.consumerToken,
      employeeToken: config.employeeToken,
      expirationDate,
    },
  };
}

export function basicAuthHeader(username: string, sessionToken: string): string {
  return `Basic ${Buffer.from(`${username}:${sessionToken}`).toString("base64")}`;
}

export async function openSession(config: TripletexConfig, fetchImpl: FetchLike = fetch): Promise<string> {
  const request = sessionRequest(config);
  const response = await fetchImpl(request.url, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(request.body),
  });
  if (!response.ok) {
    throw new Error(`Tripletex avviste innlogging (${response.status}).`);
  }
  const token = readToken(await response.json());
  if (!token) throw new Error("Tripletex svarte uten sesjonstoken.");
  return token;
}

async function getPage(
  config: TripletexConfig,
  sessionToken: string,
  path: string,
  params: Record<string, string>,
  fetchImpl: FetchLike,
): Promise<unknown> {
  const url = new URL(`${config.baseUrl}${path.startsWith("/") ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetchImpl(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: basicAuthHeader(config.username, sessionToken),
    },
  });
  if (!response.ok) throw new Error(await tripletexError(response));
  return response.json();
}

async function tripletexError(response: Response): Promise<string> {
  let detail = "";
  try {
    const body = (await response.json()) as {
      message?: unknown;
      developerMessage?: unknown;
      validationMessages?: { message?: unknown }[];
    };
    const parts = [body.developerMessage, body.message, body.validationMessages?.[0]?.message].filter(
      (part): part is string => typeof part === "string" && part.trim().length > 0,
    );
    detail = parts[0]?.replace(/\s+/g, " ").slice(0, 240) ?? "";
  } catch {
    detail = "";
  }
  if (/token|password|authorization|bearer/i.test(detail)) detail = "";
  return detail
    ? `Tripletex svarte med status ${response.status}: ${detail}`
    : `Tripletex svarte med status ${response.status}.`;
}

async function getAll(
  config: TripletexConfig,
  sessionToken: string,
  path: string,
  params: Record<string, string>,
  fetchImpl: FetchLike,
): Promise<unknown[]> {
  const values: unknown[] = [];
  let from = 0;
  for (let guard = 0; guard < 50; guard += 1) {
    const payload = await getPage(config, sessionToken, path, { ...params, from: String(from), count: String(PAGE) }, fetchImpl);
    const page = readPageValues(payload);
    values.push(...page);
    if (pageIsLast(payload, values.length, PAGE) || page.length === 0) break;
    from += page.length;
  }
  return values;
}

export type TripletexApi = {
  employees: () => Promise<TripletexEmployee[]>;
  employments: () => Promise<TripletexEmployment[]>;
  projects: () => Promise<TripletexProject[]>;
  entries: (dateFrom: string, dateTo: string) => Promise<TripletexEntry[]>;
  weeks: (employeeIds: number[], weekYear: string) => Promise<TripletexWeek[]>;
};

export async function createTripletexApi(
  config: TripletexConfig = readTripletexConfig(),
  fetchImpl: FetchLike = fetch,
): Promise<TripletexApi | null> {
  if (!config.configured) return null;
  const sessionToken = await openSession(config, fetchImpl);
  let staffRequest: Promise<{ employees: TripletexEmployee[]; employments: TripletexEmployment[] }> | null = null;
  const loadStaff = () => {
    staffRequest ??= (async () => {
      const rows = await getAll(config, sessionToken, "/employee", { fields: EMPLOYEE_FIELDS }, fetchImpl);
      const employees: TripletexEmployee[] = [];
      const employments: TripletexEmployment[] = [];
      for (const raw of rows) {
        const employee = normalizeEmployee(raw);
        if (!employee) continue;
        employees.push(employee);
        employments.push(...employmentsOnEmployee(raw, employee.id));
      }
      return { employees: staffEmployees(employees), employments };
    })();
    return staffRequest;
  };
  return {
    employees: async () => (await loadStaff()).employees,
    employments: async () => {
      const staff = await loadStaff();
      const visible = new Set(staff.employees.map((employee) => employee.id));
      return staff.employments.filter((job) => visible.has(job.employeeId));
    },
    projects: async () => {
      const rows = await getAll(config, sessionToken, "/project", { fields: PROJECT_FIELDS }, fetchImpl);
      return rows.map(normalizeProject).filter((row): row is TripletexProject => Boolean(row));
    },
    entries: async (dateFrom, dateTo) => {
      const rows = await getAll(
        config,
        sessionToken,
        "/timesheet/entry",
        { dateFrom, dateTo, fields: ENTRY_FIELDS },
        fetchImpl,
      );
      return rows.map(normalizeEntry).filter((row): row is TripletexEntry => Boolean(row));
    },
    weeks: async (employeeIds, weekYear) => {
      if (employeeIds.length === 0) return [];
      const rows = await getAll(
        config,
        sessionToken,
        "/timesheet/week",
        {
          employeeIds: employeeIds.join(","),
          weekYear,
          fields: WEEK_FIELDS,
        },
        fetchImpl,
      );
      return rows.map(normalizeWeek).filter((row): row is TripletexWeek => Boolean(row));
    },
  };
}
