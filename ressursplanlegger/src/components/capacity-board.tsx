"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { movePersonBetweenProjects, shiftSchedule } from "@/lib/actions";
import { formatNorwegian, formatShort, weekId, weekdayLabel, weekdayShort } from "@/lib/dates";
import { LEVEL_LABEL, formatHours, formatPercent } from "@/lib/format";
import { loadLevel, totalWeekCells, type DayCell, type GanttBar, type LoadLevel, type ProjectSlice, type WeekCell, type WeekRow } from "@/lib/planning";

type Person = {
  id: string;
  name: string;
  role: string;
};

type Selection = {
  title: string;
  subtitle: string;
  capacityHours: number;
  bookedHours: number;
  level: LoadLevel;
  projects: ProjectSlice[];
  people?: { name: string; bookedHours: number; capacityHours: number; level: LoadLevel }[];
  note?: string;
  dayHref?: string;
};

export function CapacityBoard({
  mode,
  resources,
  directory,
  rows,
  totals,
  groups,
  dayRows,
  gantt,
}: {
  mode: "uke" | "dag";
  resources: Person[];
  directory: Person[];
  rows: WeekRow[];
  totals: WeekCell[];
  groups: { label: string; resourceIds: string[] }[];
  dayRows: { resourceId: string; days: DayCell[] }[];
  gantt: GanttBar[];
}) {
  const router = useRouter();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [undo, setUndo] = useState<{ text: string; run: () => Promise<{ error?: string } | { ok: true }> } | null>(null);
  const [move, setMove] = useState<{
    fromProjectId: string;
    fromProjectName: string;
    toProjectId: string;
    toProjectName: string;
    resourceId: string;
    resourceName: string;
  } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const names = new Map(directory.map((resource) => [resource.id, resource]));

  async function moveBar(bar: GanttBar, days: number) {
    const result = await shiftSchedule({ projectId: bar.projectId, phaseId: bar.phaseId, days });
    if ("error" in result && result.error) {
      setNote(result.error);
      return;
    }
    setUndo({
      text: `Flyttet ${bar.name}.`,
      run: () => shiftSchedule({ projectId: bar.projectId, phaseId: bar.phaseId, days: -days }),
    });
    router.refresh();
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (selection && !dialog.open) dialog.showModal();
    if (!selection && dialog.open) dialog.close();
  }, [selection]);

  if (resources.length === 0) {
    return (
      <section className="card empty">
        <p>Ingen aktive ressurser ennå. Legg inn håndverkerne først, så vises kapasiteten her.</p>
      </section>
    );
  }

  const weeks = rows[0]?.cells ?? [];

  return (
    <>
      <div className="plan-scroll">
        {mode === "uke" ? (
          <table className="heat">
            <thead>
              <tr>
                <th className="name-col">Ressurs</th>
                {weeks.map((week) => (
                  <th key={week.id}>
                    <a className="week-link" href={`/kapasitet?visning=dag&fra=${week.monday}`}>
                      <strong>Uke {week.week}</strong>
                      <span>{formatShort(week.monday)}</span>
                    </a>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => {
                const groupRows = rows.filter((row) => group.resourceIds.includes(row.resourceId));
                const groupTotals = totalWeekCells(groupRows);
                return (
                  <GroupRows
                    key={group.label}
                    label={`Sum ${group.label.toLocaleLowerCase("nb")}`}
                    rows={groupRows}
                    totals={groupTotals}
                    names={names}
                    resources={resources}
                    onSelect={setSelection}
                  />
                );
              })}
              {groups.length > 1 ? (
              <tr className="total-row">
                <th className="name-col">Hele firmaet</th>
                {totals.map((cell, index) => (
                  <td key={cell.id}>
                    <CellButton
                      cell={cell}
                      onClick={() =>
                        setSelection({
                          title: "Hele firmaet",
                          subtitle: `Uke ${cell.week} · ${formatNorwegian(cell.monday)}–${formatNorwegian(cell.sunday)}`,
                          capacityHours: cell.capacityHours,
                          bookedHours: cell.bookedHours,
                          level: cell.level,
                          projects: cell.projects,
                          people: rows.map((row) => ({
                            name: names.get(row.resourceId)?.name ?? "",
                            bookedHours: row.cells[index].bookedHours,
                            capacityHours: row.cells[index].capacityHours,
                            level: row.cells[index].level,
                          })),
                          dayHref: `/kapasitet?visning=dag&fra=${cell.monday}`,
                        })
                      }
                    />
                  </td>
                ))}
              </tr>
              ) : null}
            </tbody>
          </table>
        ) : (
          <DayTable
            resources={resources}
            roleGroups={groups}
            dayRows={dayRows}
            onSelect={(selection) => setSelection(selection)}
          />
        )}

        {mode === "uke" && gantt.length > 0 ? (
          <GanttTable
            bars={gantt}
            weeks={weeks}
            names={names}
            directory={directory}
            onShift={moveBar}
            onMove={setMove}
          />
        ) : null}
      </div>

      <dialog
        ref={dialogRef}
        className="modal"
        onClose={() => setSelection(null)}
        onClick={(event) => {
          if (event.target === dialogRef.current) setSelection(null);
        }}
      >
        {selection ? (
          <div className="modal-card">
            <p className="eyebrow">{selection.subtitle}</p>
            <h2>{selection.title}</h2>
            <p>
              <span className={`pill ${selection.level}`}>{LEVEL_LABEL[selection.level]}</span>
            </p>
            <p>
              Booket <strong>{formatHours(selection.bookedHours)} t</strong> av{" "}
              <strong>{formatHours(selection.capacityHours)} t</strong> (
              {formatPercent(selection.bookedHours, selection.capacityHours)})
            </p>
            {selection.note ? <p className="hint">{selection.note}</p> : null}
            <h3>Prosjekter</h3>
            {selection.projects.length === 0 ? <p className="hint">Ingen prosjekter denne perioden.</p> : null}
            {selection.projects.map((project) => (
              <div className="project-line" key={`${project.id}-${project.phaseName ?? ""}`}>
                <span>
                  <i className="dot" style={{ background: project.color }} />
                  {project.name}
                </span>
                <strong>{formatHours(project.hours)} t</strong>
              </div>
            ))}
            {selection.people ? (
              <>
                <h3>Per person</h3>
                {selection.people.map((person) => (
                  <div className="project-line" key={person.name}>
                    <span>
                      {person.name} <span className={`pill ${person.level}`}>{LEVEL_LABEL[person.level]}</span>
                    </span>
                    <strong>
                      {formatHours(person.bookedHours)} / {formatHours(person.capacityHours)}
                    </strong>
                  </div>
                ))}
              </>
            ) : null}
            <div className="actions" style={{ marginTop: "0.8rem" }}>
              {selection.dayHref ? (
                <a className="btn" href={selection.dayHref}>
                  Vis dagene
                </a>
              ) : null}
              <button className="btn-secondary" type="button" onClick={() => setSelection(null)}>
                Lukk
              </button>
            </div>
          </div>
        ) : null}
      </dialog>
      {move ? (
        <div className="toast confirm-toast">
          <p>
            Flytte {move.resourceName} fra {move.fromProjectName} til {move.toProjectName}?
          </p>
          <div className="actions">
            <button
              className="btn"
              type="button"
              onClick={async () => {
                const pending = move;
                const result = await movePersonBetweenProjects({
                  fromProjectId: pending.fromProjectId,
                  toProjectId: pending.toProjectId,
                  resourceId: pending.resourceId,
                });
                if ("error" in result && result.error) setNote(result.error);
                else {
                  setUndo({
                    text: `Flyttet ${pending.resourceName} til ${pending.toProjectName}.`,
                    run: () =>
                      movePersonBetweenProjects({
                        fromProjectId: pending.toProjectId,
                        toProjectId: pending.fromProjectId,
                        resourceId: pending.resourceId,
                      }),
                  });
                  router.refresh();
                }
                setMove(null);
              }}
            >
              Flytt
            </button>
            <button className="btn-secondary" type="button" onClick={() => setMove(null)}>
              Avbryt
            </button>
          </div>
        </div>
      ) : null}
      {undo ? (
        <div className="toast">
          <p>{undo.text}</p>
          <button
            className="btn-secondary"
            type="button"
            onClick={async () => {
              const result = await undo.run();
              if ("error" in result && result.error) setNote(result.error);
              setUndo(null);
              router.refresh();
            }}
          >
            Angre
          </button>
        </div>
      ) : null}
      {note ? <p className="error">{note}</p> : null}
    </>
  );
}

function GroupRows({
  label,
  rows,
  totals,
  names,
  resources,
  onSelect,
}: {
  label: string;
  rows: WeekRow[];
  totals: WeekCell[];
  names: Map<string, Person>;
  resources: Person[];
  onSelect: (selection: Selection) => void;
}) {
  return (
    <>
      {rows.map((row) => {
        const person = names.get(row.resourceId);
        return (
          <tr key={row.resourceId}>
            <th className="name-col">
              {person?.name}
              <div className="meta">{person?.role}</div>
            </th>
            {row.cells.map((cell) => (
              <td key={cell.id}>
                <CellButton
                  cell={cell}
                  onClick={() =>
                    onSelect({
                      title: person?.name ?? "Ressurs",
                      subtitle: `Uke ${cell.week} · ${formatNorwegian(cell.monday)}–${formatNorwegian(cell.sunday)}`,
                      capacityHours: cell.capacityHours,
                      bookedHours: cell.bookedHours,
                      level: cell.level,
                      projects: cell.projects,
                      note: cell.absenceDays > 0 ? `Fravær ${cell.absenceDays} av 5 arbeidsdager.` : undefined,
                      dayHref: `/kapasitet?visning=dag&fra=${cell.monday}`,
                    })
                  }
                />
              </td>
            ))}
          </tr>
        );
      })}
      <tr className="total-row">
        <th className="name-col">{label}</th>
        {totals.map((cell, index) => (
          <td key={cell.id}>
            <CellButton
              cell={cell}
              onClick={() =>
                onSelect({
                  title: label,
                  subtitle: `Uke ${cell.week} · ${formatNorwegian(cell.monday)}–${formatNorwegian(cell.sunday)}`,
                  capacityHours: cell.capacityHours,
                  bookedHours: cell.bookedHours,
                  level: cell.level,
                  projects: cell.projects,
                  people: rows.map((row) => ({
                    name: names.get(row.resourceId)?.name ?? "",
                    bookedHours: row.cells[index].bookedHours,
                    capacityHours: row.cells[index].capacityHours,
                    level: row.cells[index].level,
                  })),
                  dayHref: `/kapasitet?visning=dag&fra=${cell.monday}`,
                })
              }
            />
          </td>
        ))}
      </tr>
    </>
  );
}

function GanttTable({
  bars,
  weeks,
  names,
  directory,
  onShift,
  onMove,
}: {
  bars: GanttBar[];
  weeks: WeekCell[];
  names: Map<string, Person>;
  directory: Person[];
  onShift: (bar: GanttBar, days: number) => void;
  onMove: (move: {
    fromProjectId: string;
    fromProjectName: string;
    toProjectId: string;
    toProjectName: string;
    resourceId: string;
    resourceName: string;
  }) => void;
}) {
  const drag = useRef<{ bar: GanttBar; x: number; width: number } | null>(null);
  const [offset, setOffset] = useState<{ key: string; weeks: number } | null>(null);

  return (
    <table className="heat gantt-table">
      <tbody>
        {bars.map((bar) => {
          const key = `${bar.projectId}:${bar.phaseId ?? ""}`;
          const shift = offset?.key === key ? offset.weeks : 0;
          return (
            <tr
              key={key}
              onDragOver={(event) => {
                if (bar.phaseId) return;
                event.preventDefault();
              }}
              onDrop={(event) => {
                if (bar.phaseId) return;
                event.preventDefault();
                const raw = event.dataTransfer.getData("text/plain");
                if (!raw) return;
                const data = JSON.parse(raw) as { projectId: string; projectName: string; resourceId: string; name: string };
                if (data.projectId === bar.projectId || bar.resourceIds.includes(data.resourceId)) return;
                onMove({
                  fromProjectId: data.projectId,
                  fromProjectName: data.projectName,
                  toProjectId: bar.projectId,
                  toProjectName: bar.name,
                  resourceId: data.resourceId,
                  resourceName: data.name,
                });
              }}
            >
              <th className="name-col" title={bar.name}>
                <a href={`/prosjekter/${bar.projectId}`}>{bar.name}</a>
                {bar.openEnded && bar.finishDate ? <div className="meta">Ferdig ca. {formatShort(bar.finishDate)}</div> : null}
                <div className="chips">
                  {bar.resourceIds.map((id) => {
                    const person = names.get(id);
                    if (!person) return null;
                    return (
                      <span
                        key={id}
                        className={bar.phaseId ? "chip" : "chip draggable"}
                        draggable={!bar.phaseId}
                        title={bar.phaseId ? "Endre folk i skjemaet" : "Dra til et annet prosjekt"}
                        onDragStart={(event) => {
                          event.dataTransfer.setData(
                            "text/plain",
                            JSON.stringify({ projectId: bar.projectId, projectName: bar.name, resourceId: id, name: person.name }),
                          );
                          event.dataTransfer.effectAllowed = "move";
                        }}
                      >
                        {person.name}
                      </span>
                    );
                  })}
                </div>
              </th>
              {weeks.map((week, index) => {
                const start = bar.startWeekIndex + shift;
                const end = bar.endWeekIndex + shift;
                const inside = index >= start && index <= end;
                const alone = start === end;
                return (
                      <td key={week.id}>
                    <div
                      className="gantt-cell"
                      onPointerDown={(event) => {
                        if (event.pointerType === "touch" || event.button !== 0) return;
                        event.preventDefault();
                        const width = event.currentTarget.getBoundingClientRect().width || 48;
                        const origin = event.clientX;
                        const handle = event.currentTarget;
                        drag.current = { bar, x: origin, width };
                        setOffset({ key, weeks: 0 });
                        const move = (ev: PointerEvent) => {
                          if (ev.pointerId !== event.pointerId) return;
                          setOffset({ key, weeks: Math.round((ev.clientX - origin) / width) });
                        };
                        const up = (ev: PointerEvent) => {
                          if (ev.pointerId !== event.pointerId) return;
                          handle.removeEventListener("pointermove", move);
                          window.removeEventListener("pointerup", up);
                          window.removeEventListener("pointercancel", up);
                          drag.current = null;
                          const weeksDelta = Math.round((ev.clientX - origin) / width);
                          setOffset(null);
                          if (weeksDelta !== 0) onShift(bar, weeksDelta * 7);
                        };
                        handle.addEventListener("pointermove", move);
                        window.addEventListener("pointerup", up);
                        window.addEventListener("pointercancel", up);
                        try {
                          handle.setPointerCapture(event.pointerId);
                        } catch {
                          // Slipp utenfor cellen fanges av window.
                        }
                      }}
                    >
                      {inside ? (
                        <div
                          className={bar.tentative ? "gantt-seg tentative" : "gantt-seg"}
                          title="Dra med musen for å flytte. På nettbrett bruker du Endre."
                          style={{
                            background: bar.color,
                            borderRadius: alone
                              ? "999px"
                              : index === start
                                ? "999px 0 0 999px"
                                : index === end
                                  ? "0 999px 999px 0"
                                  : "0",
                          }}
                        />
                      ) : null}
                    </div>
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function CellButton({ cell, onClick }: { cell: WeekCell; onClick: () => void }) {
  const offLabel =
    cell.absenceDays >= 5 && cell.bookedHours < 0.05
      ? "Fravær"
      : cell.capacityHours < 0.05
        ? "–"
        : null;
  return (
    <button type="button" className={`cell-btn tone-${cell.level}${cell.tentativeHours > 0.05 ? " has-tentative" : ""}`} onClick={onClick}>
      {cell.hasOverloadedDay && cell.level !== "over" ? <i className="hot-dot" title="Minst én dag er overbelastet" /> : null}
      {offLabel && cell.bookedHours < 0.05 ? (
        <b>{offLabel}</b>
      ) : (
        <>
          <b>{formatHours(cell.bookedHours)}</b>
          <small>av {formatHours(cell.capacityHours)}</small>
        </>
      )}
    </button>
  );
}

function DayTable({
  resources,
  roleGroups,
  dayRows,
  onSelect,
}: {
  resources: Person[];
  roleGroups: { label: string; resourceIds: string[] }[];
  dayRows: { resourceId: string; days: DayCell[] }[];
  onSelect: (selection: Selection) => void;
}) {
  const days = dayRows[0]?.days ?? [];
  const names = new Map(resources.map((resource) => [resource.id, resource]));
  const weekGroups: { id: string; label: string; count: number }[] = [];
  for (const day of days) {
    const id = weekId(day.date);
    const current = weekGroups[weekGroups.length - 1];
    if (current?.id === id) current.count += 1;
    else {
      const week = Number(id.slice(6));
      weekGroups.push({ id, label: `Uke ${week}`, count: 1 });
    }
  }

  const totals = days.map((day, index) => {
    let capacityHours = 0;
    let bookedHours = 0;
    const projects = new Map<string, ProjectSlice>();
    for (const row of dayRows) {
      const cell = row.days[index];
      capacityHours += cell.capacityHours;
      bookedHours += cell.bookedHours;
      for (const project of cell.projects) {
        const existing = projects.get(project.id);
        if (existing) existing.hours += project.hours;
        else projects.set(project.id, { ...project });
      }
    }
    return {
      date: day.date,
      capacityHours,
      bookedHours,
      level: loadLevel(bookedHours, capacityHours),
      projects: [...projects.values()].sort((a, b) => b.hours - a.hours),
    } as {
      date: string;
      capacityHours: number;
      bookedHours: number;
      level: LoadLevel;
      projects: ProjectSlice[];
    };
  });

  return (
    <table className="heat">
      <thead>
        <tr>
          <th className="name-col" rowSpan={2}>
            Ressurs
          </th>
          {weekGroups.map((group) => (
            <th key={group.id} colSpan={group.count}>
              <span className="week-link">
                <strong>{group.label}</strong>
              </span>
            </th>
          ))}
        </tr>
        <tr>
          {days.map((day) => (
            <th key={day.date}>
              <span className="day-head">
                <strong>{weekdayShort(day.date)}</strong>
                <span>{formatShort(day.date)}</span>
                {day.holidayName ? <span>{day.holidayName}</span> : null}
              </span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {roleGroups.map((group) => {
          const groupRows = dayRows.filter((row) => group.resourceIds.includes(row.resourceId));
          return (
            <DayGroup
              key={group.label}
              label={`Sum ${group.label.toLocaleLowerCase("nb")}`}
              rows={groupRows}
              names={names}
              onSelect={onSelect}
            />
          );
        })}
        {roleGroups.length > 1 ? (
        <tr className="total-row">
          <th className="name-col">Hele firmaet</th>
          {totals.map((total, index) => (
            <td key={total.date}>
              <button
                type="button"
                className={`cell-btn tone-${total.level}`}
                onClick={() =>
                  onSelect({
                    title: "Hele firmaet",
                    subtitle: `${weekdayLabel(total.date, "long")} ${formatNorwegian(total.date)}`,
                    capacityHours: total.capacityHours,
                    bookedHours: total.bookedHours,
                    level: total.level,
                    projects: total.projects,
                    people: dayRows.map((row) => ({
                      name: names.get(row.resourceId)?.name ?? "",
                      bookedHours: row.days[index].bookedHours,
                      capacityHours: row.days[index].capacityHours,
                      level: row.days[index].level,
                    })),
                  })
                }
              >
                {total.capacityHours < 0.05 && total.bookedHours < 0.05 ? (
                  <b>–</b>
                ) : (
                  <>
                    <b>{formatHours(total.bookedHours)}</b>
                    <small>av {formatHours(total.capacityHours)}</small>
                  </>
                )}
              </button>
            </td>
          ))}
        </tr>
        ) : null}
      </tbody>
    </table>
  );
}

function DayGroup({
  label,
  rows,
  names,
  onSelect,
}: {
  label: string;
  rows: { resourceId: string; days: DayCell[] }[];
  names: Map<string, Person>;
  onSelect: (selection: Selection) => void;
}) {
  const days = rows[0]?.days ?? [];
  const totals = days.map((day, index) => {
    let capacityHours = 0;
    let bookedHours = 0;
    const projects = new Map<string, ProjectSlice>();
    for (const row of rows) {
      const cell = row.days[index];
      capacityHours += cell.capacityHours;
      bookedHours += cell.bookedHours;
      for (const project of cell.projects) {
        const key = `${project.id}:${project.phaseName ?? ""}`;
        const existing = projects.get(key);
        if (existing) existing.hours += project.hours;
        else projects.set(key, { ...project });
      }
    }
    return {
      date: day.date,
      capacityHours,
      bookedHours,
      level: loadLevel(bookedHours, capacityHours),
      projects: [...projects.values()].sort((a, b) => b.hours - a.hours),
    };
  });
  return (
    <>
      {rows.map((row) => {
        const person = names.get(row.resourceId);
        return (
          <tr key={row.resourceId}>
            <th className="name-col">
              {person?.name}
              <div className="meta">{person?.role}</div>
            </th>
            {row.days.map((day) => (
              <td key={day.date}>
                <button
                  type="button"
                  className={`cell-btn tone-${day.level}${day.tentativeHours > 0.05 ? " has-tentative" : ""}`}
                  onClick={() =>
                    onSelect({
                      title: person?.name ?? "Ressurs",
                      subtitle: `${weekdayLabel(day.date, "long")} ${formatNorwegian(day.date)}`,
                      capacityHours: day.capacityHours,
                      bookedHours: day.bookedHours,
                      level: day.level,
                      projects: day.projects,
                      note: day.holidayName ?? day.absenceReason ?? undefined,
                    })
                  }
                >
                  <DayLabel day={day} />
                </button>
              </td>
            ))}
          </tr>
        );
      })}
      <tr className="total-row">
        <th className="name-col">{label}</th>
        {totals.map((total) => (
          <td key={total.date}>
            <button
              type="button"
              className={`cell-btn tone-${total.level}`}
              onClick={() =>
                onSelect({
                  title: label,
                  subtitle: `${weekdayLabel(total.date, "long")} ${formatNorwegian(total.date)}`,
                  capacityHours: total.capacityHours,
                  bookedHours: total.bookedHours,
                  level: total.level,
                  projects: total.projects,
                })
              }
            >
              {total.capacityHours < 0.05 && total.bookedHours < 0.05 ? (
                <b>–</b>
              ) : (
                <>
                  <b>{formatHours(total.bookedHours)}</b>
                  <small>av {formatHours(total.capacityHours)}</small>
                </>
              )}
            </button>
          </td>
        ))}
      </tr>
    </>
  );
}

function DayLabel({ day }: { day: DayCell }) {
  if (day.holidayName && day.bookedHours < 0.05) return <b>Helligdag</b>;
  if (day.absenceReason && day.bookedHours < 0.05) return <b>{day.absenceReason}</b>;
  if (day.capacityHours < 0.05 && day.bookedHours < 0.05) return <b>–</b>;
  return (
    <>
      <b>{formatHours(day.bookedHours)}</b>
      <small>av {formatHours(day.capacityHours)}</small>
    </>
  );
}
