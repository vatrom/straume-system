"use client";

import { useActionState } from "react";
import { login } from "@/lib/auth-actions";
import type { FormState } from "@/lib/actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(login, null as FormState);
  return (
    <form action={action} className="card stack login-card">
      <h1>Logg inn</h1>
      <p className="lede">Ressursplanlegger for Straume Bygg og Betong.</p>
      {state?.error ? <p className="error">{state.error}</p> : null}
      <input type="hidden" name="neste" value={next ?? ""} />
      <label className="field">
        E-post
        <input name="email" type="email" autoComplete="username" required />
      </label>
      <label className="field">
        Passord
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Logger inn …" : "Logg inn"}
      </button>
    </form>
  );
}
