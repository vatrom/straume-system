import "./env";
import { prisma, type Role } from "@straume/db";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { HttpError, jsonError } from "./http";
import { assertAdmin } from "./roles";

export { assertAdmin };

export type SessionUser = { id: string; email: string; name: string; role: Role };

const COOKIE = "straume_session";

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET ?? "dev-only-not-a-secret-change-in-prod-32b";
  return new TextEncoder().encode(value);
}

export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({ email: user.email, name: user.name, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());
}

export async function verifySession(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    const id = payload.sub;
    const role = payload.role;
    if (!id || typeof payload.email !== "string" || typeof payload.name !== "string") return null;
    if (role !== "admin" && role !== "selger" && role !== "prosjektleder" && role !== "kontor") return null;
    return { id, email: payload.email, name: payload.name, role };
  } catch {
    return null;
  }
}

export async function readUser(req: Request): Promise<SessionUser | null> {
  const header = req.headers.get("authorization");
  const bearer = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  let token = bearer;
  if (!token) {
    const jar = await cookies();
    token = jar.get(COOKIE)?.value ?? "";
  }
  if (!token) return null;
  const session = await verifySession(token);
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user?.active) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const session = await verifySession(token);
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user?.active) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "1",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function withUser(
  req: Request,
  roles: Role[] | null,
  fn: (user: SessionUser) => Promise<Response>,
): Promise<Response> {
  try {
    const user = await readUser(req);
    if (!user) throw new HttpError(401, "Ikke innlogget");
    if (roles && !roles.includes(user.role)) throw new HttpError(403, "Ingen tilgang");
    return await fn(user);
  } catch (error) {
    return jsonError(error, req);
  }
}
