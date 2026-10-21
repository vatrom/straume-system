"use client";

import { useActionState } from "react";
import type { FormState } from "@/lib/actions";

export function UserForm({ action }: { action: (prev: FormState, formData: FormData) => Promise<FormState> }) {
  const [state, formAction, pending] = useActionState(action, null as FormState);
  const created = state?.error?.startsWith("Bruker opprettet");
  return (
    <form action={formAction} className="card stack">
      {state?.error ? <p className={created ? "callout ok" : "error"}>{state.error}</p> : null}
      <div className="form-grid">
        <label className="field">
          Navn
          <input name="name" required />
        </label>
        <label className="field">
          E-post
          <input name="email" type="email" required />
        </label>
        <label className="field">
          Rolle
          <select name="role" defaultValue="bruker">
            <option value="bruker">Bruker</option>
            <option value="admin">Administrator</option>
          </select>
        </label>
      </div>
      <button className="btn" type="submit" disabled={pending}>
        Opprett bruker
      </button>
    </form>
  );
}
