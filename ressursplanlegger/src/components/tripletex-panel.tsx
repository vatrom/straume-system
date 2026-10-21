"use client";

import { useActionState, useState } from "react";
import { importTripletexCatalog, saveTripletexLinks, syncTripletex } from "@/lib/tripletex-actions";
import { formatNorwegian } from "@/lib/dates";
import { formatHours } from "@/lib/format";

type Option = { id: number; name: string };
type RemoteProject = { id: number; number: string; name: string };

export function TripletexPanel({
  configured,
  companyId,
  catalogError,
  lastSyncAt,
  lastSyncMessage,
  lastSyncOk,
  resources,
  projects,
  employees,
  remoteProjects,
  unmapped,
}: {
  configured: boolean;
  companyId: string;
  catalogError: string;
  lastSyncAt: string | null;
  lastSyncMessage: string;
  lastSyncOk: boolean;
  resources: { id: string; name: string; tripletexEmployeeId: number | null; suggestion: number | null }[];
  projects: { id: string; name: string; tripletexProjectId: number | null; tripletexProjectNumber: string; suggestion: number | null }[];
  employees: Option[];
  remoteProjects: RemoteProject[];
  unmapped: { id: string; date: string; hours: number; employeeName: string; projectLabel: string; reason: string }[];
}) {
  const [syncState, setSyncState] = useState(lastSyncMessage);
  const [syncOk, setSyncOk] = useState(lastSyncOk);
  const [pending, setPending] = useState(false);
  const [linkState, linkAction, linkPending] = useActionState(saveTripletexLinks, null);
  const [note, setNote] = useState("");

  if (!configured) {
    return (
      <section className="card">
        <h2>Ikke satt opp</h2>
        <p>
          Tripletex-import er avslått til miljøvariablene er fylt inn. Firmaet bør lage en egen API-nøkkel til denne appen.
          Se README for <code>TRIPLETEX_REFRESH_TOKEN</code>
          {companyId ? ` og firma ${companyId}` : ""}.
        </p>
      </section>
    );
  }

  return (
    <div className="stack">
      <section className="card stack">
        <p>{syncState || "Ingen synk ennå."}</p>
        {lastSyncAt ? <p className="hint">Sist hentet {formatNorwegian(lastSyncAt.slice(0, 10))}.</p> : null}
        {!syncOk && syncState ? <p className="error">{syncState}</p> : null}
        {catalogError ? <p className="error">{catalogError}</p> : null}
        <div className="actions">
          <button
            className="btn"
            type="button"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              const report = await syncTripletex();
              setSyncState(report.message);
              setSyncOk(report.ok);
              setPending(false);
            }}
          >
            {pending ? "Henter …" : "Hent timer fra Tripletex"}
          </button>
          <button
            className="btn-secondary"
            type="button"
            onClick={async () => {
              const result = await importTripletexCatalog("ansatte");
              setNote(result.ok ?? result.error ?? "");
            }}
          >
            Hent ansatte
          </button>
          <button
            className="btn-secondary"
            type="button"
            onClick={async () => {
              const result = await importTripletexCatalog("prosjekter");
              setNote(result.ok ?? result.error ?? "");
            }}
          >
            Hent prosjekter
          </button>
        </div>
        {note ? <p className="hint">{note}</p> : null}
        <p className="hint">
          Synken oppretter også nye prosjekter og ansatte. Lukkede prosjekter som aldri er importert, hoppes over.
          Timeverk, ressurser, faser, farge og tilbud endres ikke. Planlagt jobb kan kalle POST /api/tripletex/sync med
          SYNC_SECRET.
        </p>
      </section>

      <form action={linkAction} className="card stack">
        <h2>Kobling</h2>
        {linkState?.ok ? <p className="hint">{linkState.ok}</p> : null}
        <h3>Ansatte</h3>
        {resources.map((resource) => (
          <label key={resource.id} className="field">
            {resource.name}
            <select name={`employee-${resource.id}`} defaultValue={resource.tripletexEmployeeId ? String(resource.tripletexEmployeeId) : ""}>
              <option value="">Ikke koblet</option>
              {employees
                .slice()
                .sort((a, b) => Number(b.id === resource.suggestion) - Number(a.id === resource.suggestion) || a.name.localeCompare(b.name, "nb"))
                .map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                    {employee.id === resource.suggestion ? " (foreslått)" : ""}
                  </option>
                ))}
            </select>
          </label>
        ))}
        <h3>Prosjekter</h3>
        {projects.map((project) => (
          <label key={project.id} className="field">
            {project.name}
            <select
              name={`project-${project.id}`}
              defaultValue={project.tripletexProjectId ? `${project.tripletexProjectId}|${project.tripletexProjectNumber}` : ""}
            >
              <option value="">Ikke koblet</option>
              {remoteProjects
                .slice()
                .sort((a, b) => Number(b.id === project.suggestion) - Number(a.id === project.suggestion) || a.name.localeCompare(b.name, "nb"))
                .map((remote) => (
                  <option key={remote.id} value={`${remote.id}|${remote.number}`}>
                    {remote.number ? `${remote.number} ` : ""}
                    {remote.name}
                    {remote.id === project.suggestion ? " (foreslått)" : ""}
                  </option>
                ))}
            </select>
          </label>
        ))}
        <button className="btn" type="submit" disabled={linkPending}>
          Lagre koblinger
        </button>
      </form>

      <section className="card stack">
        <h2>Timer uten kobling</h2>
        {unmapped.length === 0 ? <p className="hint">Ingen ukoblede timer.</p> : null}
        {unmapped.map((entry) => (
          <div className="project-line" key={entry.id}>
            <span>
              {formatNorwegian(entry.date)} · {entry.employeeName || "Ukjent"} · {entry.projectLabel || "Uten prosjekt"}
              <div className="meta">{entry.reason}</div>
            </span>
            <strong>{formatHours(entry.hours)} t</strong>
          </div>
        ))}
      </section>
    </div>
  );
}
