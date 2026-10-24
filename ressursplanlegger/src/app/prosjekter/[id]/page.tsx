import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectForm } from "@/components/project-form";
import { TimePanel } from "@/components/time-panel";
import { convertTentative } from "@/lib/actions";
import { loadInputs } from "@/lib/data";
import { prisma } from "@/lib/db";
import { dateToIso, todayIso } from "@/lib/dates";
import { formatHours } from "@/lib/format";
import { plannedHours, progressStatus } from "@/lib/progress";

export default async function EndreProsjektPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { projects, resourceInputs, projectInputs } = await loadInputs();
  const project = projects.find((item) => item.id === id);
  if (!project) notFound();
  const input = projectInputs.find((item) => item.id === id);
  const entries = await prisma.timeEntry.findMany({
    where: { projectId: id, unmappedReason: "" },
    orderBy: { date: "desc" },
  });
  const today = todayIso();
  const planned = input ? plannedHours(input, resourceInputs, today) : { plannedToDate: 0, plannedTotal: 0 };
  const actualToDate = entries.filter((entry) => dateToIso(entry.date) <= today).reduce((sum, entry) => sum + entry.hours, 0);
  const actualTotal = entries.reduce((sum, entry) => sum + entry.hours, 0);

  return (
    <>
      <header className="page-head">
        <div>
          <p className="eyebrow">
            <Link href="/prosjekter">Prosjekter</Link>
          </p>
          <h1>Endre prosjekt</h1>
          {project.status === "tentativ" ? (
            <form action={convertTentative.bind(null, project.id)}>
              <button className="btn" type="submit">
                Gjør om til prosjekt
              </button>
            </form>
          ) : null}
          <p className="lede">
            {project.name} · {formatHours(project.estimatedHours)} timer
            {project.isExample ? " · eksempeldata" : ""}
          </p>
        </div>
      </header>
      <ProjectForm
        project={{
          id: project.id,
          name: project.name,
          customer: project.customer,
          address: project.address,
          startDate: dateToIso(project.startDate),
          endDate: project.endDate ? dateToIso(project.endDate) : "",
          estimatedHours: formatHours(project.estimatedHours),
          status: project.status,
          color: project.color,
          resourceIds: project.assignments.map((assignment) => assignment.resourceId),
          assignments: project.assignments.map((assignment) => ({
            resourceId: assignment.resourceId,
            allocationPercent: assignment.allocationPercent,
          })),
          phases: project.phases.map((phase) => ({
            name: phase.name,
            startDate: dateToIso(phase.startDate),
            endDate: phase.endDate ? dateToIso(phase.endDate) : "",
            estimatedHours: formatHours(phase.estimatedHours),
            assignments: phase.assignments.map((assignment) => ({
              resourceId: assignment.resourceId,
              allocationPercent: assignment.allocationPercent,
            })),
          })),
        }}
        resources={resourceInputs.map((resource) => ({
          id: resource.id,
          name: resource.name,
          role: resource.role,
          weeklyCapacityHours: resource.weeklyCapacityHours,
          active: resource.active,
        }))}
      />
      <TimePanel
        projectId={project.id}
        resources={resourceInputs.filter((resource) => resource.active).map((resource) => ({ id: resource.id, name: resource.name }))}
        entries={entries.map((entry) => ({
          id: entry.id,
          date: dateToIso(entry.date),
          hours: entry.hours,
          comment: entry.comment,
          name: entry.employeeName || resourceInputs.find((resource) => resource.id === entry.resourceId)?.name || "Ukjent",
          source: entry.source,
        }))}
        progress={{
          plannedToDate: planned.plannedToDate,
          actualToDate,
          actualTotal,
          remaining: Math.max(0, project.estimatedHours - actualTotal),
          status: progressStatus(actualToDate, planned.plannedToDate),
        }}
      />
    </>
  );
}
