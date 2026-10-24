"use client";

import { useActionState, useEffect, useState } from "react";
import { createProject, getAssignmentPreview, updateProject, type FormState, type PreviewPayload } from "@/lib/actions";
import { formatNorwegian, weekdayLabel } from "@/lib/dates";
import { PROJECT_COLORS, STATUS_LABEL, formatHours, formatPercent } from "@/lib/format";
import { loadLevel, type PhaseInput } from "@/lib/planning";

export type ResourceChoice = {
  id: string;
  name: string;
  role: string;
  weeklyCapacityHours: number;
  active: boolean;
};

type PersonPick = { resourceId: string; allocationPercent: number };

export type PhaseFormValue = {
  name: string;
  startDate: string;
  endDate: string;
  estimatedHours: string;
  assignments: PersonPick[];
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
  assignments?: PersonPick[];
  phases?: PhaseFormValue[];
};

function parseHours(value: string): number {
  const number = Number(value.trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(number) ? number : 0;
}

function picksFrom(ids: string[], assignments?: PersonPick[]): PersonPick[] {
  return ids.map((resourceId) => ({
    resourceId,
    allocationPercent: assignments?.find((item) => item.resourceId === resourceId)?.allocationPercent ?? 100,
  }));
}

export function ProjectForm({ project, resources }: { project?: ProjectFormValues; resources: ResourceChoice[] }) {
  const action = project?.id ? updateProject.bind(null, project.id) : createProject;
  const [state, formAction, pending] = useActionState(action, null as FormState);
  const [startDate, setStartDate] = useState(project?.startDate ?? "");
  const [endDate, setEndDate] = useState(project?.endDate ?? "");
  const [hours, setHours] = useState(project?.estimatedHours ?? "");
  const [selected, setSelected] = useState<PersonPick[]>(picksFrom(project?.resourceIds ?? [], project?.assignments));
  const [color, setColor] = useState(project?.color ?? PROJECT_COLORS[0]);
  const [usePhases, setUsePhases] = useState((project?.phases?.length ?? 0) > 0);
  const [phases, setPhases] = useState<PhaseFormValue[]>(project?.phases ?? []);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    if (!startDate && !usePhases) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoadingPreview(true);
      const phaseInput: PhaseInput[] = usePhases
        ? phases.map((phase, index) => ({
            id: `fase-${index}`,
            name: phase.name || `Fase ${index + 1}`,
            startDate: phase.startDate,
            endDate: phase.endDate || null,
            estimatedHours: parseHours(phase.estimatedHours),
            assignments: phase.assignments,
          }))
        : [];
      const result = await getAssignmentPreview({
        startDate: usePhases ? phases.find((phase) => phase.startDate)?.startDate || startDate : startDate,
        endDate: usePhases ? "" : endDate,
        estimatedHours: usePhases ? phases.reduce((sum, phase) => sum + parseHours(phase.estimatedHours), 0) : parseHours(hours),
        resourceIds: usePhases ? [] : selected.map((item) => item.resourceId),
        assignments: usePhases ? undefined : selected,
        phases: phaseInput.filter((phase) => phase.startDate),
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
  }, [startDate, endDate, hours, selected, project?.id, usePhases, phases]);

  function toggle(id: string) {
    setSelected((current) =>
      current.some((item) => item.resourceId === id)
        ? current.filter((item) => item.resourceId !== id)
        : [...current, { resourceId: id, allocationPercent: 100 }],
    );
  }

  const selectedIds = selected.map((item) => item.resourceId);
  const choices = resources
    .filter((resource) => resource.active || selectedIds.includes(resource.id))
    .map((resource) => ({ resource, stats: preview?.perResource.find((entry) => entry.id === resource.id) }))
    .sort((a, b) => (b.stats?.freeHours ?? 0) - (a.stats?.freeHours ?? 0) || a.resource.name.localeCompare(b.resource.name, "nb"));

  const needed = usePhases ? phases.reduce((sum, phase) => sum + parseHours(phase.estimatedHours), 0) : parseHours(hours);
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
            <input type="date" name="startDate" required={!usePhases} value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label className="field">
            Slutt / frist (valgfritt)
            <input type="date" name="endDate" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            <span className="hint">Tomt felt: folk jobber full dag til timene er brukt opp.</span>
          </label>
          <label className="field">
            Beregnede timeverk
            <input name="estimatedHours" inputMode="decimal" required={!usePhases} value={hours} onChange={(event) => setHours(event.target.value)} placeholder="F.eks. 240" />
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
            <span className="hint">Tilbud vises skravert. Ferdig tas ut av planen.</span>
          </label>
          <div className="field span-2">
            Farge
            <input type="hidden" name="color" value={color} />
            <div className="swatches">
              {PROJECT_COLORS.map((swatch) => (
                <button key={swatch} type="button" className={swatch === color ? "selected" : undefined} style={{ background: swatch }} aria-label={`Velg farge ${swatch}`} onClick={() => setColor(swatch)} />
              ))}
            </div>
          </div>
        </div>

        <label className="check-line">
          <input
            type="checkbox"
            checked={usePhases}
            onChange={(event) => {
              const on = event.target.checked;
              setUsePhases(on);
              if (on && phases.length === 0) {
                setPhases([
                  {
                    name: "Fase 1",
                    startDate,
                    endDate,
                    estimatedHours: hours,
                    assignments: selected,
                  },
                ]);
              }
            }}
          />
          Del opp i faser
        </label>
        <input type="hidden" name="phasesJson" value={usePhases ? JSON.stringify(phases) : "[]"} />

        {usePhases ? (
          <div className="stack">
            {phases.map((phase, index) => (
              <fieldset key={index} className="phase-card">
                <legend>Fase {index + 1}</legend>
                <div className="form-grid">
                  <label className="field">
                    Navn
                    <input value={phase.name} onChange={(event) => updatePhase(index, { name: event.target.value })} />
                  </label>
                  <label className="field">
                    Timer
                    <input value={phase.estimatedHours} onChange={(event) => updatePhase(index, { estimatedHours: event.target.value })} />
                  </label>
                  <label className="field">
                    Oppstart
                    <input type="date" value={phase.startDate} onChange={(event) => updatePhase(index, { startDate: event.target.value })} />
                  </label>
                  <label className="field">
                    Slutt
                    <input type="date" value={phase.endDate} onChange={(event) => updatePhase(index, { endDate: event.target.value })} />
                  </label>
                </div>
                <div className="pick-list">
                  {resources.filter((resource) => resource.active).map((resource) => {
                    const chosen = phase.assignments.find((item) => item.resourceId === resource.id);
                    return (
                      <label key={resource.id} className={chosen ? "pick picked" : "pick"}>
                        <input
                          type="checkbox"
                          checked={Boolean(chosen)}
                          onChange={() => {
                            const assignments = chosen
                              ? phase.assignments.filter((item) => item.resourceId !== resource.id)
                              : [...phase.assignments, { resourceId: resource.id, allocationPercent: 100 }];
                            updatePhase(index, { assignments });
                          }}
                        />
                        <span>
                          <strong>{resource.name}</strong>
                          <small> · {resource.role}</small>
                          {chosen ? (
                            <select
                              value={chosen.allocationPercent}
                              onChange={(event) =>
                                updatePhase(index, {
                                  assignments: phase.assignments.map((item) =>
                                    item.resourceId === resource.id ? { ...item, allocationPercent: Number(event.target.value) } : item,
                                  ),
                                })
                              }
                            >
                              <option value={100}>100 %</option>
                              <option value={50}>50 %</option>
                            </select>
                          ) : null}
                        </span>
                      </label>
                    );
                  })}
                </div>
                {phases.length > 1 ? (
                  <button className="btn-secondary" type="button" onClick={() => setPhases(phases.filter((_, item) => item !== index))}>
                    Fjern fase
                  </button>
                ) : null}
              </fieldset>
            ))}
            <button
              className="btn-secondary"
              type="button"
              onClick={() =>
                setPhases([
                  ...phases,
                  { name: `Fase ${phases.length + 1}`, startDate, endDate, estimatedHours: "", assignments: [] },
                ])
              }
            >
              Ny fase
            </button>
          </div>
        ) : (
          <>
            <h2 style={{ margin: "1.1rem 0 0.4rem" }}>Hvem skal på prosjektet?</h2>
            <p className="hint">100 % er vanlig fordeling. 50 % teller som halv kapasitet.</p>
            <div className="pick-list" style={{ marginTop: "0.7rem" }}>
              {choices.map(({ resource, stats }) => {
                const chosen = selected.find((item) => item.resourceId === resource.id);
                const ratio = stats && stats.capacityHours > 0 ? stats.freeHours / stats.capacityHours : 0;
                return (
                  <label key={resource.id} className={chosen ? "pick picked" : "pick"}>
                    <input type="checkbox" name="resourceIds" value={resource.id} checked={Boolean(chosen)} onChange={() => toggle(resource.id)} />
                    <span>
                      <strong>
                        {resource.name}
                        {!resource.active ? " (ikke aktiv)" : ""}
                      </strong>
                      <small>
                        {" "}
                        · {resource.role} · {formatHours(resource.weeklyCapacityHours)} t/uke
                      </small>
                      {chosen ? (
                        <select
                          name={`allocation-${resource.id}`}
                          value={chosen.allocationPercent}
                          onChange={(event) =>
                            setSelected((current) =>
                              current.map((item) =>
                                item.resourceId === resource.id ? { ...item, allocationPercent: Number(event.target.value) } : item,
                              ),
                            )
                          }
                        >
                          <option value={100}>100 %</option>
                          <option value={50}>50 %</option>
                        </select>
                      ) : null}
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
          </>
        )}
        <div className="actions" style={{ marginTop: "1rem" }}>
          <button className="btn" type="submit" disabled={pending}>
            {pending ? "Lagrer …" : project?.id ? "Lagre prosjekt" : "Opprett prosjekt"}
          </button>
        </div>
      </div>

      <aside className="card stack">
        <h2>Slik blir belastningen</h2>
        {preview?.error ? <p className="error">{preview.error}</p> : null}
        {preview?.overloads.map((overload) => (
          <p key={`${overload.resourceId}-${overload.label}`} className="error">
            {overload.resourceName} er overbooket i {overload.label}.
            {preview.suggestions
              .filter((suggestion) => suggestion.forResourceId === overload.resourceId)
              .map((suggestion) => ` Ledig ${suggestion.role.toLocaleLowerCase("nb")}: ${suggestion.name} (${formatHours(suggestion.freeHours)} t).`)}
          </p>
        ))}
        {!startDate && !usePhases ? <p className="hint">Velg oppstart for å se hvem som er ledig.</p> : null}
        {selected.length > 0 && preview && !preview.error ? (
          <>
            <p>
              Prosjektet trenger <strong>{formatHours(needed)} timer</strong>.
            </p>
            {!endDate && !usePhases && preview.finishDate ? (
              <p>
                <strong>Beregnet ferdig:</strong> {formatNorwegian(preview.finishDate)}
              </p>
            ) : null}
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

  function updatePhase(index: number, patch: Partial<PhaseFormValue>) {
    setPhases((current) => current.map((phase, item) => (item === index ? { ...phase, ...patch } : phase)));
  }
}
