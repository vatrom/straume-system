import { readTripletexConfig } from "./config";
import {
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
  TripletexEntry,
  TripletexProject,
  TripletexWeek,
} from "./types";

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
  if (!response.ok) throw new Error(`Tripletex svarte med status ${response.status}.`);
  return response.json();
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
  return {
    employees: async () => {
      const rows = await getAll(
        config,
        sessionToken,
        "/employee",
        { fields: "id,firstName,lastName,isContact" },
        fetchImpl,
      );
      return staffEmployees(rows.map(normalizeEmployee).filter((row): row is TripletexEmployee => Boolean(row)));
    },
    projects: async () => {
      const rows = await getAll(
        config,
        sessionToken,
        "/project",
        { fields: "id,number,name,startDate,endDate,isClosed,customer(id,name)" },
        fetchImpl,
      );
      return rows.map(normalizeProject).filter((row): row is TripletexProject => Boolean(row));
    },
    entries: async (dateFrom, dateTo) => {
      const rows = await getAll(
        config,
        sessionToken,
        "/timesheet/entry",
        {
          dateFrom,
          dateTo,
          fields: "id,date,hours,comment,employee(id,firstName,lastName),project(id,number,name),activity(name)",
        },
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
          fields: "employee(id),weekYear,completed",
        },
        fetchImpl,
      );
      return rows.map(normalizeWeek).filter((row): row is TripletexWeek => Boolean(row));
    },
  };
}
