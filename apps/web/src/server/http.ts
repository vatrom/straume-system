import { DomainError } from "@straume/domain";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function allowedOrigin(origin: string | null): string | null {
  if (!origin) return null;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  const extra = (process.env.CORS_ORIGINS ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  return extra.includes(origin) ? origin : null;
}

export function applyCors(headers: Headers, req?: Request): void {
  const origin = allowedOrigin(req?.headers.get("origin") ?? null);
  if (!origin) return;
  headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-headers", "authorization, content-type");
  headers.set("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");
  headers.set("vary", "origin");
}

export function json(data: unknown, status = 200, req?: Request): Response {
  const headers = new Headers({ "content-type": "application/json; charset=utf-8" });
  applyCors(headers, req);
  return new Response(JSON.stringify(data), { status, headers });
}

export function jsonError(error: unknown, req?: Request): Response {
  if (error instanceof DomainError) return json({ error: error.message }, 400, req);
  if (error instanceof HttpError) return json({ error: error.message }, error.status, req);
  console.error(error);
  return json({ error: "Uventet feil" }, 500, req);
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Ugyldig JSON");
  }
}
