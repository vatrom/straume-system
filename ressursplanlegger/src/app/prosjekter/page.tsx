import Link from "next/link";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { deleteProject, restoreProject } from "@/lib/actions";
import { loadInputs } from "@/lib/data";
import { todayIso, formatNorwegian } from "@/lib/dates";
import { STATUS_LABEL, formatHours } from "@/lib/format";
import { TRIPLETEX_SETUP_LABEL, needsTripletexSetup } from "@/lib/tripletex/import";
import { prisma } from "@/lib/db";
import { buildPlan, isHiddenProject } from "@/lib/planning";

export default async function ProsjekterPage({
  searchParams,
}: {
  searchParams: Promise<{ vis?: string }>;
}) {
  const vis = (await searchParams).vis;
  const mode = vis === "arkiv" ? "arkiv" : vis === "ignorert" ? "ignorert" : "aktive";
  const { resources, projects, resourceInputs, projectInputs } = await loadInputs();
  const logged = await prisma.timeEntry.groupBy({
    by: ["projectId"],
    where: { projectId: { not: null }, unmappedReason: "" },
    _sum: { hours: true },
  });
  const loggedHours = new Map(logged.map((row) => [row.projectId, row._sum.hours ?? 0]));
  const today = todayIso();
  const plan = buildPlan(
    resourceInputs,
    projectInputs.filter((project) => !isHiddenProject(project)),
    today,
    today,
  );
  const names = new Map(resources.map((resource) => [resource.id, resource.name]));
  const shown = projects.filter((project) => {
    if (mode === "arkiv") return project.archived && !project.syncIgnored;
    if (mode === "ignorert") return project.syncIgnored;
    return !project.archived && !project.syncIgnored;
  });

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Prosjekter</h1>
          <p className="lede">Et prosjekt fordeler timeverkene på folkene som er tildelt, fra oppstart.</p>
        </div>
        <Link className="btn" href="/prosjekter/ny">
          Nytt prosjekt
        </Link>
      </header>

      <div className="chips">
        <Link className={mode === "aktive" ? "chip selected" : "chip"} href="/prosjekter">
          Aktive
        </Link>
        <Link className={mode === "arkiv" ? "chip selected" : "chip"} href="/prosjekter?vis=arkiv">
          Arkiv
        </Link>
        <Link className={mode === "ignorert" ? "chip selected" : "chip"} href="/prosjekter?vis=ignorert">
          Slettede/ignorerte Tripletex-prosjekter
        </Link>
      </div>

      {shown.length === 0 ? (
        <section className="card empty">
          {mode === "arkiv"
            ? "Ingen arkiverte prosjekter."
            : mode === "ignorert"
              ? "Ingen slettede Tripletex-prosjekter."
              : "Ingen prosjekter ennå."}
        </section>
      ) : (
        shown.map((project) => {
          const input = projectInputs.find((item) => item.id === project.id);
          const schedule = plan.schedules.get(project.id);
          const warnings = plan.warnings.filter((warning) => warning.projectId === project.id);
          const finish = input?.endDate ?? schedule?.finishDate;
          const fromTripletex = project.tripletexProjectId != null;
          return (
            <article className="card project-card" key={project.id}>
              <div className="stripe" style={{ background: project.color }} />
              <div>
                <h2>{project.name}</h2>
                <p className="meta">
                  {[project.customer, project.address].filter(Boolean).join(" · ") || "Uten kunde"}
                </p>
                <p className="meta">
                  Oppstart <strong>{formatNorwegian(input?.startDate ?? "")}</strong>
                  {finish ? (
                    <>
                      {" "}
                      · {input?.endDate ? "Slutt" : "Beregnet ferdig"} <strong>{formatNorwegian(finish)}</strong>
                    </>
                  ) : null}{" "}
                  · <strong>{formatHours(project.estimatedHours)} t</strong>
                  {loggedHours.get(project.id) ? ` · ført ${formatHours(loggedHours.get(project.id) ?? 0)} t` : ""}
                </p>
                <p className="meta">
                  {project.assignments.length === 0
                    ? "Ingen ressurser tildelt"
                    : project.assignments.map((assignment) => names.get(assignment.resourceId) ?? "Ukjent").join(", ")}
                </p>
                <div className="pills">
                  <span className={`pill ${project.status}`}>{STATUS_LABEL[project.status] ?? project.status}</span>
                  {fromTripletex ? <span className="pill tripletex">Tripletex</span> : <span className="pill manuell">Manuell</span>}
                  {project.archived ? <span className="pill off">Arkivert</span> : null}
                  {project.isExample ? <span className="pill example">Eksempel</span> : null}
                  {!project.archived && !project.syncIgnored && needsTripletexSetup(project) ? (
                    <span className="pill setup">{TRIPLETEX_SETUP_LABEL}</span>
                  ) : null}
                </div>
                {warnings.map((warning) => (
                  <p key={warning.message} className="meta">
                    {warning.message}
                  </p>
                ))}
              </div>
              <div className="actions" style={{ alignSelf: "start" }}>
                {mode === "ignorert" ? (
                  <form action={restoreProject.bind(null, project.id)}>
                    <button className="btn-secondary" type="submit">
                      Gjenopprett
                    </button>
                  </form>
                ) : (
                  <>
                    <Link className="btn-secondary" href={`/prosjekter/${project.id}`}>
                      Endre
                    </Link>
                    <form action={deleteProject.bind(null, project.id)}>
                      <ConfirmSubmit
                        label="Slett"
                        confirm={
                          fromTripletex
                            ? `Skjule «${project.name}»? Prosjektet hentes ikke inn igjen fra Tripletex før du gjenoppretter det.`
                            : `Slette prosjektet «${project.name}»?`
                        }
                      />
                    </form>
                  </>
                )}
              </div>
            </article>
          );
        })
      )}
    </>
  );
}
