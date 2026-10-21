"use server";

import { redirect } from "next/navigation";
import { clearSession, createSession, requireAdmin, requireUser } from "./auth";
import { prisma } from "./db";
import { hashPassword, randomPassword, verifyPassword } from "./password";
import type { FormState } from "./actions";

function emailOf(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim().toLowerCase().slice(0, 120);
}

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = emailOf(formData.get("email"));
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("neste") ?? "");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return { error: "Feil e-post eller passord." };
  }
  await createSession(user.id);
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  await clearSession();
  redirect("/logg-inn");
}

export async function changePassword(_prev: FormState | undefined, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const stored = await prisma.user.findUnique({ where: { id: user.id } });
  if (!stored || !verifyPassword(current, stored.passwordHash)) return { error: "Nåværende passord stemmer ikke." };
  if (next.length < 8) return { error: "Nytt passord må ha minst 8 tegn." };
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(next) } });
  return null;
}

export async function createUser(_prev: FormState, formData: FormData): Promise<FormState & { password?: string }> {
  await requireAdmin();
  const email = emailOf(formData.get("email"));
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  const role = formData.get("role") === "admin" ? "admin" : "bruker";
  if (!name) return { error: "Skriv inn navn." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Skriv inn en gyldig e-post." };
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: "E-posten er allerede i bruk." };
  const password = randomPassword();
  await prisma.user.create({ data: { email, name, role, passwordHash: hashPassword(password) } });
  return { error: `Bruker opprettet. Engangspassord: ${password}` };
}

export async function deleteUser(id: string) {
  const admin = await requireAdmin();
  if (admin.id === id) return;
  await prisma.session.deleteMany({ where: { userId: id } });
  await prisma.user.delete({ where: { id } });
  redirect("/brukere");
}
