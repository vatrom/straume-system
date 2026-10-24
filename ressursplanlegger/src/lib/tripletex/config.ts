import type { TripletexConfig } from "./types";

const DEFAULT_BASE = "https://tripletex.no/v2";

export function readTripletexConfig(env: Record<string, string | undefined> = process.env): TripletexConfig {
  const baseUrl = (env.TRIPLETEX_BASE_URL?.trim() || DEFAULT_BASE).replace(/\/$/, "");
  const refreshToken = env.TRIPLETEX_REFRESH_TOKEN?.trim() ?? "";
  const consumerToken = env.TRIPLETEX_CONSUMER_TOKEN?.trim() ?? "";
  const employeeToken = env.TRIPLETEX_EMPLOYEE_TOKEN?.trim() ?? "";
  const configured = Boolean(refreshToken || (consumerToken && employeeToken));
  return {
    baseUrl,
    refreshToken,
    consumerToken,
    employeeToken,
    companyId: env.TRIPLETEX_COMPANY_ID?.trim() ?? "",
    username: env.TRIPLETEX_USERNAME?.trim() || "0",
    configured,
    mode: refreshToken ? "refresh" : "consumer",
  };
}

export function isTripletexConfigured(env?: Record<string, string | undefined>): boolean {
  return readTripletexConfig(env).configured;
}
