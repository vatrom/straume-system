"use client";

import { useActionState } from "react";
import { addTimeEntry, deleteTimeEntry, importTimeCsv } from "@/lib/time-actions";
import type { FormState } from "@/lib/actions";
import { formatNorwegian } from "@/lib/dates";
import { formatHours } from "@/lib/format";
import { PROGRESS_LABEL, type ProgressStatus } from "@/lib/progress";

export function TimePanel({
  projectId,
  resources,
  entries,
  progress,
}: {
  projectId: string;
  resources: { id: string; name: string }[];
  entries: { id: string; date: string; hours: number; comment: string; name: string; source: string }[];
  progress: {
    plannedToDate: number;
    actualToDate: number;
    actualTotal: number;
    remaining: number;
    status: ProgressStatus;
  };
}) {
  const [manual, manualAction, manualPending] = useActionState(addTimeEntry.bind(null, projectId), null as FormState);
  const [csv, csvAction, csvPending] = useActionState(importTimeCsv.bind(null, projectId), null as FormState);

  return (
    <section className="card stack" id="timer">
      <h2>Timer ført</h2>
      <div className="stat-grid">
        <div>
          <span>Planlagt til i dag</span>
          <strong>{formatHours(progress.plannedToDate)} t</strong>
        </div>
        <div>
          <span>Ført til i dag</span>
          <strong>{formatHours(progress.actualToDate)} t</strong>
        </div>
        <div>
          <span>Gjenstår av estimatet</span>
          <strong>{formatHours(progress.remaining)} t</strong>
        </div>
        <div>
          <span>Status</span>
          <strong>{PROGRESS_LABEL[progress.status]}</strong>
        </div>
      </div>
      <p className="hint">Ført totalt {formatHours(progress.actualTotal)} t. Aktivitet i Tripletex brukes ikke som fag.</p>
      {manual?.error ? <p className={manual.error.startsWith("La inn") ? "hint" : "error"}>{manual.error}</p> : null}
      <form action={manualAction} className="inline-form">
        <label>
          Dato
          <input type="date" name="date" required />
        </label>
        <label>
          Person
          <select name="resourceId" required defaultValue="">
            <option value="" disabled>
              Velg
            </option>
            {resources.map((resource) => (
              <option key={resource.id} value={resource.id}>
                {resource.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Timer
          <input name="hours" inputMode="decimal" required placeholder="7,5" />
        </label>
        <label>
          Kommentar
          <input name="comment" />
        </label>
        <button className="btn" type="submit" disabled={manualPending}>
          Legg inn
        </button>
      </form>
      <form action={csvAction} className="inline-form">
        <label>
          CSV med kolonnene dato, navn, timer, kommentar
          <input type="file" name="file" accept=".csv,text/csv" required />
        </label>
        <button className="btn-secondary" type="submit" disabled={csvPending}>
          Importer CSV
        </button>
      </form>
      {csv?.error ? <p className={csv.error.startsWith("La inn") ? "hint" : "error"}>{csv.error}</p> : null}
      <p className="hint">Semikolon fungerer også. Importerer du samme fil på nytt, legges radene inn en gang til.</p>
      {entries.length === 0 ? <p className="hint">Ingen timer ført på prosjektet ennå.</p> : null}
      {entries.map((entry) => (
        <div className="project-line" key={entry.id}>
          <span>
            {formatNorwegian(entry.date)} · {entry.name}
            {entry.comment ? ` · ${entry.comment}` : ""} <small>({entry.source})</small>
          </span>
          <span>
            <strong>{formatHours(entry.hours)} t</strong>{" "}
            <form action={deleteTimeEntry.bind(null, entry.id, projectId)} style={{ display: "inline" }}>
              <button className="btn-secondary" type="submit">
                Slett
              </button>
            </form>
          </span>
        </div>
      ))}
    </section>
  );
}
