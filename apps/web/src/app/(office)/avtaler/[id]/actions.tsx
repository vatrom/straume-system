"use client";

import { useState } from "react";

export function DealActions({
  id,
  status,
  stages,
  stageId,
  reasons,
}: {
  id: string;
  status: string;
  stages: { id: string; name: string }[];
  stageId: string;
  reasons: string[];
}) {
  const [error, setError] = useState("");
  async function send(path: string, body?: unknown, method = "POST") {
    const response = await fetch(path, {
      method,
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error ?? "Feil");
      return;
    }
    window.location.reload();
  }
  return (
    <div className="stack">
      {status === "open" ? (
        <form
          className="card stack"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void send(`/api/deals/${id}`, { stageId: form.get("stageId") }, "PATCH");
          }}
        >
          <h2>Flytt fase</h2>
          <select name="stageId" defaultValue={stageId}>
            {stages.map((stage) => (
              <option key={stage.id} value={stage.id}>{stage.name}</option>
            ))}
          </select>
          <button className="btn" type="submit">Oppdater fase</button>
        </form>
      ) : null}
      <form
        className="card stack"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void send(`/api/deals/${id}/activities`, {
            type: form.get("type"),
            subject: form.get("subject"),
            dueAt: form.get("dueAt") || undefined,
            note: form.get("note") || undefined,
          });
        }}
      >
        <h2>Ny aktivitet</h2>
        <select name="type">
          <option value="call">Telefonsamtale</option>
          <option value="meeting">Møte</option>
          <option value="task">Oppgave</option>
          <option value="deadline">Tidsfrist</option>
          <option value="email">E-post</option>
          <option value="lunch">Lunsj</option>
        </select>
        <input name="subject" placeholder="Emne" required />
        <input name="dueAt" type="datetime-local" />
        <textarea name="note" placeholder="Notat (internt)" />
        <button className="btn" type="submit">Lagre aktivitet</button>
      </form>
      {status === "open" ? (
        <div className="card stack">
          <h2>Avslutt</h2>
          <button className="btn primary" type="button" onClick={() => void send(`/api/deals/${id}/win`)}>
            Merk som vunnet og opprett prosjekt
          </button>
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void send(`/api/deals/${id}/lose`, { lostReason: form.get("lostReason"), lostComment: form.get("lostComment") });
            }}
          >
            <select name="lostReason" required>
              <option value="">Tapsårsak</option>
              {reasons.map((reason) => <option key={reason}>{reason}</option>)}
            </select>
            <input name="lostComment" placeholder="Kommentar" />
            <button className="btn danger" type="submit">Merk som tapt</button>
          </form>
        </div>
      ) : null}
      {error ? <div className="error">{error}</div> : null}
    </div>
  );
}
