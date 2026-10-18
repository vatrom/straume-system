"use client";

import { useState } from "react";

async function send(path: string, method: string, body?: unknown) {
  const response = await fetch(path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Feil");
  return data;
}

export function ProjectForm({
  projectId,
  users,
  phases,
  initial,
}: {
  projectId: string;
  users: { id: string; name: string }[];
  phases: { id: string; name: string }[];
  initial: {
    sellerId: string;
    projectManagerId: string;
    status: string;
    phaseId: string;
    contractSumNok: number | null;
    plannedStartDate: string;
    street: string;
    houseNumber: string;
    postalCode: string;
    city: string;
  };
}) {
  const [message, setMessage] = useState("");
  return (
    <form
      className="stack"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const contract = String(form.get("contractSumNok") ?? "");
        try {
          await send(`/api/projects/${projectId}`, "PATCH", {
            sellerId: form.get("sellerId"),
            projectManagerId: form.get("projectManagerId"),
            status: form.get("status"),
            phaseId: form.get("phaseId"),
            contractSumNok: contract === "" ? null : Number(contract),
            plannedStartDate: String(form.get("plannedStartDate") || "") || null,
            street: form.get("street"),
            houseNumber: form.get("houseNumber"),
            postalCode: form.get("postalCode"),
            city: form.get("city"),
          });
          setMessage("Lagret");
          window.location.reload();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Feil");
        }
      }}
    >
      <div className="row">
        <label className="field">
          <span>Selger</span>
          <select name="sellerId" defaultValue={initial.sellerId}>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Prosjektleder</span>
          <select name="projectManagerId" defaultValue={initial.projectManagerId}>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Status</span>
          <select name="status" defaultValue={initial.status}>
            <option value="open">Åpen</option>
            <option value="completed">Ferdig</option>
            <option value="cancelled">Kansellert</option>
          </select>
        </label>
        <label className="field grow">
          <span>Fase</span>
          <select name="phaseId" defaultValue={initial.phaseId}>
            {phases.map((phase) => (
              <option key={phase.id} value={phase.id}>
                {phase.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="row">
        <label className="field">
          <span>Kontraktsum</span>
          <input name="contractSumNok" type="number" defaultValue={initial.contractSumNok ?? ""} />
        </label>
        <label className="field">
          <span>Planlagt oppstart</span>
          <input name="plannedStartDate" type="date" defaultValue={initial.plannedStartDate} />
        </label>
        <label className="field grow">
          <span>Gate</span>
          <input name="street" defaultValue={initial.street} />
        </label>
        <label className="field">
          <span>Nr</span>
          <input name="houseNumber" defaultValue={initial.houseNumber} />
        </label>
        <label className="field">
          <span>Postnr</span>
          <input name="postalCode" defaultValue={initial.postalCode} />
        </label>
        <label className="field">
          <span>Sted</span>
          <input name="city" defaultValue={initial.city} />
        </label>
      </div>
      <button className="btn primary" type="submit">
        Lagre prosjekt
      </button>
      {message ? <p>{message}</p> : null}
    </form>
  );
}

export function ChangeForm({ projectId }: { projectId: string }) {
  const [message, setMessage] = useState("");
  return (
    <form
      className="stack"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const amount = String(form.get("amountNok") ?? "");
        try {
          await send(`/api/projects/${projectId}/changes`, "POST", {
            title: form.get("title"),
            description: form.get("description"),
            amountNok: amount === "" ? null : Number(amount),
            status: form.get("status"),
            internalNote: form.get("internalNote"),
          });
          window.location.reload();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Feil");
        }
      }}
    >
      <div className="row">
        <label className="field grow">
          <span>Tittel</span>
          <input name="title" required />
        </label>
        <label className="field">
          <span>Beløp</span>
          <input name="amountNok" type="number" />
        </label>
        <label className="field">
          <span>Status</span>
          <select name="status" defaultValue="draft">
            <option value="draft">Utkast</option>
            <option value="sent">Sendt</option>
            <option value="approved">Godkjent</option>
            <option value="rejected">Avvist</option>
          </select>
        </label>
      </div>
      <label className="field">
        <span>Beskrivelse til kunde</span>
        <textarea name="description" rows={2} />
      </label>
      <label className="field">
        <span>Internt notat (vises ikke mot kunde)</span>
        <textarea name="internalNote" rows={2} />
      </label>
      <button className="btn" type="submit">
        Legg til endring
      </button>
      {message ? <p>{message}</p> : null}
    </form>
  );
}

export function DocumentForm({ projectId }: { projectId: string }) {
  const [message, setMessage] = useState("");
  return (
    <form
      className="row"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const response = await fetch(`/api/projects/${projectId}/documents`, { method: "POST", body: form });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setMessage(data.error ?? "Opplasting feilet");
          return;
        }
        window.location.reload();
      }}
    >
      <input name="file" type="file" required />
      <select name="visibility" defaultValue="internal">
        <option value="internal">Internt</option>
        <option value="customer">Kunde</option>
        <option value="craftsman">Håndverker</option>
      </select>
      <button className="btn" type="submit">
        Last opp
      </button>
      {message ? <span>{message}</span> : null}
    </form>
  );
}

export function WinnerButton({ projectId }: { projectId: string }) {
  const [message, setMessage] = useState("");
  return (
    <div className="stack">
      <button
        className="btn primary"
        type="button"
        onClick={async () => {
          setMessage("Sender …");
          try {
            const data = await send(`/api/projects/${projectId}/winner-mail`, "POST");
            setMessage(`Logget e-post til ${data.to}. Interne notater utelatt: ${data.internalNotesOmitted}.`);
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Feil");
          }
        }}
      >
        Send til Winner-tegner
      </button>
      {message ? <p className="muted">{message}</p> : null}
    </div>
  );
}

export function CustomerPreview({ projectId }: { projectId: string }) {
  const [text, setText] = useState("");
  return (
    <div className="stack">
      <button
        className="btn"
        type="button"
        onClick={async () => {
          const data = await send(`/api/projects/${projectId}/customer-view`, "GET");
          setText(JSON.stringify(data, null, 2));
        }}
      >
        Vis kundeutsikt
      </button>
      {text ? <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{text}</pre> : null}
    </div>
  );
}
