"use client";

import { useEffect, useRef, useState } from "react";
import { formatNorwegian, formatShort, weekId, weekdayLabel, weekdayShort } from "@/lib/dates";
import { LEVEL_LABEL, formatHours, formatPercent } from "@/lib/format";
import { loadLevel, type DayCell, type GanttBar, type LoadLevel, type ProjectSlice, type WeekCell, type WeekRow } from "@/lib/planning";

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
  rows,
  totals,
  dayRows,
  gantt,
}: {
  mode: "uke" | "dag";
  resources: Person[];
  rows: WeekRow[];
  totals: WeekCell[];
  dayRows: { resourceId: string; days: DayCell[] }[];
  gantt: GanttBar[];
}) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const names = new Map(resources.map((resource) => [resource.id, resource]));

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
                            setSelection({
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
            </tbody>
          </table>
        ) : (
          <DayTable
            resources={resources}
            dayRows={dayRows}
            onSelect={(selection) => setSelection(selection)}
          />
        )}

        {mode === "uke" && gantt.length > 0 ? (
          <table className="heat gantt-table">
            <tbody>
              {gantt.map((bar) => (
                <tr key={bar.projectId}>
                  <th className="name-col" title={bar.name}>
                    {bar.name}
                    {bar.openEnded && bar.finishDate ? (
                      <div className="meta">Ferdig ca. {formatShort(bar.finishDate)}</div>
                    ) : null}
                  </th>
                  {weeks.map((week, index) => {
                    const inside = index >= bar.startWeekIndex && index <= bar.endWeekIndex;
                    const alone = bar.startWeekIndex === bar.endWeekIndex;
                    return (
                      <td key={week.id}>
                        <div className="gantt-cell">
                          {inside ? (
                            <div
                              className="gantt-seg"
                              style={{
                                background: bar.color,
                                borderRadius: alone
                                  ? "999px"
                                  : index === bar.startWeekIndex
                                    ? "999px 0 0 999px"
                                    : index === bar.endWeekIndex
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
              ))}
            </tbody>
          </table>
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
              <div className="project-line" key={project.id}>
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
    </>
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
    <button type="button" className={`cell-btn tone-${cell.level}`} onClick={onClick}>
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
  dayRows,
  onSelect,
}: {
  resources: Person[];
  dayRows: { resourceId: string; days: DayCell[] }[];
  onSelect: (selection: Selection) => void;
}) {
  const days = dayRows[0]?.days ?? [];
  const names = new Map(resources.map((resource) => [resource.id, resource]));
  const groups: { id: string; label: string; count: number }[] = [];
  for (const day of days) {
    const id = weekId(day.date);
    const current = groups[groups.length - 1];
    if (current?.id === id) current.count += 1;
    else {
      const week = Number(id.slice(6));
      groups.push({ id, label: `Uke ${week}`, count: 1 });
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
          {groups.map((group) => (
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
        {dayRows.map((row) => {
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
                    className={`cell-btn tone-${day.level}`}
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
      </tbody>
    </table>
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
