"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const showDemo = process.env.NEXT_PUBLIC_SHOW_DEMO_LOGIN === "1";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
    });
    const data = await response.json();
    setPending(false);
    if (!response.ok) {
      setError(data.error ?? "Innlogging feilet");
      return;
    }
    router.push("/pipeline");
    router.refresh();
  }

  return (
    <div className="login">
      <section className="login-hero">
        <p>Straume Våtrom AS</p>
        <h1>Fra første henvendelse til ferdig bad.</h1>
        <p>Salgspipeline, prosjekter og befaring i ett system.</p>
      </section>
      <section className="login-panel">
        <form onSubmit={onSubmit}>
          <h2>Logg inn</h2>
          <label className="field">
            <span>E-post</span>
            <input name="email" type="email" autoComplete="username" required defaultValue={showDemo ? "ada.berg@straume.test" : ""} />
          </label>
          <label className="field">
            <span>Passord</span>
            <input name="password" type="password" autoComplete="current-password" required defaultValue={showDemo ? "bytt-meg-lokalt" : ""} />
          </label>
          {error ? <div className="error">{error}</div> : null}
          <button className="btn primary" disabled={pending} type="submit">
            {pending ? "Logger inn …" : "Logg inn"}
          </button>
          {showDemo ? <p className="muted">Lokal demo. Passordet står i README og gjelder bare denne maskinen.</p> : null}
        </form>
      </section>
    </div>
  );
}
