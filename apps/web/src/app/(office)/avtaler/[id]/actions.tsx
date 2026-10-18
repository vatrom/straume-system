"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CreateProjectButton({ id }: { id: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <div className="stack">
      <button
        className="btn primary"
        type="button"
        onClick={async () => {
          const response = await fetch(`/api/deals/${id}/project`, { method: "POST" });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            setError(data.error ?? "Kunne ikke opprette prosjekt");
            return;
          }
          router.push(`/prosjekter/${data.id}`);
          router.refresh();
        }}
      >
        Opprett prosjekt fra avtalen
      </button>
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}

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
  const router = useRouter();
  const [error, setError] = useState("");
  const [confirmWin, setConfirmWin] = useState(false);
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
    if (data.project?.id) {
      router.push(`/prosjekter/${data.project.id}`);
      router.refresh();
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
          <h2>Avslutt salgsavtale</h2>
          <p className="muted">Vunnet eller tapt avtale forsvinner fra salgspipen. Den kan søkes opp i avtalelisten.</p>
          <button className="btn primary" type="button" onClick={() => setConfirmWin(true)}>
            Merk som vunnet
          </button>
          {confirmWin ? (
            <div className="card stack" role="dialog" aria-labelledby="vinn-tittel">
              <h3 id="vinn-tittel">Opprette prosjekt?</h3>
              <p>Avtalen markeres som vunnet. Et prosjekt med samme navn kan opprettes nå. Kunde, kontraktssum, selger, befaring og dokumenter følger med. En avtale kan bare ha ett prosjekt.</p>
              <div className="row">
                <button className="btn" type="button" onClick={() => void send(`/api/deals/${id}/win`, { createProject: false })}>
                  Bare marker som vunnet
                </button>
                <button className="btn primary" type="button" onClick={() => void send(`/api/deals/${id}/win`, { createProject: true })}>
                  Marker som vunnet og opprett prosjekt
                </button>
              </div>
            </div>
          ) : null}
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
