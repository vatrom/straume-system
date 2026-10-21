import Link from "next/link";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { deleteProject } from "@/lib/actions";
import { loadInputs } from "@/lib/data";
import { todayIso, formatNorwegian } from "@/lib/dates";
import { STATUS_LABEL, formatHours } from "@/lib/format";
import { TRIPLETEX_SETUP_LABEL, needsTripletexSetup } from "@/lib/tripletex/import";
import { prisma } from "@/lib/db";
import { buildPlan } from "@/lib/planning";

export default async function ProsjekterPage() {
  const { resources, projects, resourceInputs, projectInputs } = await loadInputs();
  const logged = await prisma.timeEntry.groupBy({
    by: ["projectId"],
    where: { projectId: { not: null }, unmappedReason: "" },
    _sum: { hours: true },
  });
  const loggedHours = new Map(logged.map((row) => [row.projectId, row._sum.hours ?? 0]));
  const today = todayIso();
  const plan = buildPlan(resourceInputs, projectInputs, today, today);
  const names = new Map(resources.map((resource) => [resource.id, resource.name]));

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

      {projects.length === 0 ? (
        <section className="card empty">Ingen prosjekter ennå.</section>
      ) : (
        projects.map((project) => {
          const input = projectInputs.find((item) => item.id === project.id);
          const schedule = plan.schedules.get(project.id);
          const warnings = plan.warnings.filter((warning) => warning.projectId === project.id);
          const finish = input?.endDate ?? schedule?.finishDate;
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
                  {project.isExample ? <span className="pill example">Eksempel</span> : null}
                  {needsTripletexSetup(project) ? <span className="pill setup">{TRIPLETEX_SETUP_LABEL}</span> : null}
                </div>
                {warnings.map((warning) => (
                  <p key={warning.message} className="meta">
                    {warning.message}
                  </p>
                ))}
              </div>
              <div className="actions" style={{ alignSelf: "start" }}>
                <Link className="btn-secondary" href={`/prosjekter/${project.id}`}>
                  Endre
                </Link>
                <form action={deleteProject.bind(null, project.id)}>
                  <ConfirmSubmit label="Slett" confirm={`Slette prosjektet «${project.name}»?`} />
                </form>
              </div>
            </article>
          );
        })
      )}
    </>
  );
}
