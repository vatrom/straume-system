"use client";

import { useActionState, useEffect, useState } from "react";
import {
  createProject,
  getAssignmentPreview,
  updateProject,
  type FormState,
  type PreviewPayload,
} from "@/lib/actions";
import { formatNorwegian, weekdayLabel } from "@/lib/dates";
import { PROJECT_COLORS, STATUS_LABEL, formatHours, formatPercent } from "@/lib/format";
import { loadLevel } from "@/lib/planning";

export type ResourceChoice = {
  id: string;
  name: string;
  role: string;
  weeklyCapacityHours: number;
  active: boolean;
};

export type ProjectFormValues = {
  id?: string;
  name: string;
  customer: string;
  address: string;
  startDate: string;
  endDate: string;
  estimatedHours: string;
  status: string;
  color: string;
  resourceIds: string[];
};

function parseHours(value: string): number {
  const number = Number(value.trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(number) ? number : 0;
}

export function ProjectForm({
  project,
  resources,
}: {
  project?: ProjectFormValues;
  resources: ResourceChoice[];
}) {
  const action = project?.id ? updateProject.bind(null, project.id) : createProject;
  const [state, formAction, pending] = useActionState(action, null as FormState);
  const [startDate, setStartDate] = useState(project?.startDate ?? "");
  const [endDate, setEndDate] = useState(project?.endDate ?? "");
  const [hours, setHours] = useState(project?.estimatedHours ?? "");
  const [selected, setSelected] = useState<string[]>(project?.resourceIds ?? []);
  const [color, setColor] = useState(project?.color ?? PROJECT_COLORS[0]);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    if (!startDate) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoadingPreview(true);
      const result = await getAssignmentPreview({
        startDate,
        endDate,
        estimatedHours: parseHours(hours),
        resourceIds: selected,
        excludeProjectId: project?.id,
      });
      if (!cancelled) {
        setPreview(result);
        setLoadingPreview(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [startDate, endDate, hours, selected, project?.id]);

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  const choices = resources
    .filter((resource) => resource.active || selected.includes(resource.id))
    .map((resource) => {
      const stats = preview?.perResource.find((entry) => entry.id === resource.id);
      return { resource, stats };
    })
    .sort((a, b) => (b.stats?.freeHours ?? 0) - (a.stats?.freeHours ?? 0) || a.resource.name.localeCompare(b.resource.name, "nb"));

  const selectedStats = preview?.perResource.filter((entry) => selected.includes(entry.id)) ?? [];
  const selectedFree = selectedStats.reduce((sum, entry) => sum + entry.freeHours, 0);
  const selectedCapacity = selectedStats.reduce((sum, entry) => sum + entry.capacityHours, 0);
  const needed = parseHours(hours);
  const peakResource = resources.find((resource) => resource.id === preview?.peak?.resourceId);
  const peakLevel = preview?.peak ? loadLevel(preview.peak.bookedHours, preview.peak.capacityHours) : null;

  return (
    <form action={formAction} className="form-layout">
      <div className="card">
        {state?.error ? <p className="error">{state.error}</p> : null}
        <div className="form-grid">
          <label className="field span-2">
            Prosjektnavn
            <input name="name" required defaultValue={project?.name ?? ""} placeholder="F.eks. Tilbygg Strandveien" />
          </label>
          <label className="field">
            Kunde (valgfritt)
            <input name="customer" defaultValue={project?.customer ?? ""} />
          </label>
          <label className="field">
            Adresse (valgfritt)
            <input name="address" defaultValue={project?.address ?? ""} />
          </label>
          <label className="field">
            Oppstart
            <input type="date" name="startDate" required value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label className="field">
            Slutt / frist (valgfritt)
            <input type="date" name="endDate" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            <span className="hint">Tomt felt: folk jobber full dag til timene er brukt opp.</span>
          </label>
          <label className="field">
            Beregnede timeverk
            <input
              name="estimatedHours"
              inputMode="decimal"
              required
              value={hours}
              onChange={(event) => setHours(event.target.value)}
              placeholder="F.eks. 240"
            />
          </label>
          <label className="field">
            Status
            <select name="status" defaultValue={project?.status ?? "planlagt"}>
              {Object.entries(STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <span className="hint">Ferdig tas ut av kapasitetsplanen.</span>
          </label>
          <div className="field span-2">
            Farge
            <input type="hidden" name="color" value={color} />
            <div className="swatches">
              {PROJECT_COLORS.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  className={swatch === color ? "selected" : undefined}
                  style={{ background: swatch }}
                  aria-label={`Velg farge ${swatch}`}
                  onClick={() => setColor(swatch)}
                />
              ))}
            </div>
          </div>
        </div>

        <h2 style={{ margin: "1.1rem 0 0.4rem" }}>Hvem skal på prosjektet?</h2>
        <p className="hint">
          {endDate
            ? "Ledig kapasitet i perioden, etter andre prosjekter, fravær og helligdager."
            : "Ledig kapasitet de første 8 ukene fra oppstart."}
        </p>
        <div className="pick-list" style={{ marginTop: "0.7rem" }}>
          {choices.map(({ resource, stats }) => {
            const checked = selected.includes(resource.id);
            const ratio = stats && stats.capacityHours > 0 ? stats.freeHours / stats.capacityHours : 0;
            return (
              <label key={resource.id} className={checked ? "pick picked" : "pick"}>
                <input
                  type="checkbox"
                  name="resourceIds"
                  value={resource.id}
                  checked={checked}
                  onChange={() => toggle(resource.id)}
                />
                <span>
                  <strong>
                    {resource.name}
                    {!resource.active ? " (ikke aktiv)" : ""}
                  </strong>
                  <small>
                    {" "}
                    · {resource.role} · {formatHours(resource.weeklyCapacityHours)} t/uke
                  </small>
                  <div className="meter" aria-hidden="true">
                    <span className="free" style={{ width: `${Math.max(0, Math.min(100, ratio * 100))}%` }} />
                  </div>
                  <small>
                    {stats
                      ? `Ledig ${formatHours(stats.freeHours)} av ${formatHours(stats.capacityHours)} t`
                      : loadingPreview
                        ? "Regner kapasitet …"
                        : "Fyll inn oppstart for å se ledig tid"}
                  </small>
                </span>
              </label>
            );
          })}
        </div>
        <div className="actions" style={{ marginTop: "1rem" }}>
          <button className="btn" type="submit" disabled={pending}>
            {pending ? "Lagrer …" : project?.id ? "Lagre prosjekt" : "Opprett prosjekt"}
          </button>
        </div>
      </div>

      <aside className="card stack">
        <h2>Slik blir belastningen</h2>
        {preview?.error ? <p className="error">{preview.error}</p> : null}
        {!startDate ? <p className="hint">Velg oppstart for å se hvem som er ledig.</p> : null}
        {startDate && selected.length === 0 ? (
          <p className="hint">Kryss av minst én person. Uten tildeling blir ikke timene lagt i planen.</p>
        ) : null}
        {selected.length > 0 && preview && !preview.error ? (
          <>
            <div className={needed > selectedFree && endDate ? "callout warn" : "callout ok"}>
              <strong>
                {formatHours(selectedFree)} ledige timer
              </strong>
              Valgte har {formatHours(selectedFree)} ledige av {formatHours(selectedCapacity)} i{" "}
              {endDate ? "perioden" : "de første 8 ukene"}. Prosjektet trenger {formatHours(needed)} timer.
            </div>
            {!endDate && preview.finishDate ? (
              <p>
                <strong>Beregnet ferdig:</strong> {formatNorwegian(preview.finishDate)}
              </p>
            ) : null}
            {endDate ? (
              <p className="hint">Med sluttdato spres timene jevnt på arbeidsdagene i perioden. Det kan gi overbelastning.</p>
            ) : (
              <p className="hint">Uten sluttdato jobber de valgte full arbeidsdag til timene er brukt opp.</p>
            )}
            {peakResource && preview.peak && peakLevel ? (
              <p>
                Høyeste belastning: {peakResource.name} {formatPercent(preview.peak.bookedHours, preview.peak.capacityHours)}{" "}
                {weekdayLabel(preview.peak.date, "long")} {formatNorwegian(preview.peak.date)}.
              </p>
            ) : null}
            {preview.unallocatedHours > 0.1 ? (
              <p className="error">{formatHours(preview.unallocatedHours)} timer får ikke plass på arbeidsdagene som er valgt.</p>
            ) : null}
          </>
        ) : null}
        {loadingPreview ? <p className="hint">Oppdaterer ledig kapasitet …</p> : null}
      </aside>
    </form>
  );
}
