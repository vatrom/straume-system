"use client";

import { useActionState } from "react";
import { changePassword } from "@/lib/auth-actions";
import type { FormState } from "@/lib/actions";

export default function KontoPage() {
  const [state, action, pending] = useActionState(changePassword, undefined as FormState | undefined);
  return (
    <>
      <header className="page-head">
        <div>
          <h1>Konto</h1>
          <p className="lede">Bytt passordet ditt. Det lagres kryptert, ikke som klartekst.</p>
        </div>
      </header>
      <form action={action} className="card stack" style={{ maxWidth: 420 }}>
        {state === null ? <p className="hint">Passordet er oppdatert.</p> : null}
        {state?.error ? <p className="error">{state.error}</p> : null}
        <label className="field">
          Nåværende passord
          <input name="current" type="password" required />
        </label>
        <label className="field">
          Nytt passord
          <input name="next" type="password" required minLength={8} />
        </label>
        <button className="btn" type="submit" disabled={pending}>
          Lagre passord
        </button>
      </form>
    </>
  );
}
