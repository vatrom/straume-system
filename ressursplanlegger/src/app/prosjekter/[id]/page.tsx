import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectForm } from "@/components/project-form";
import { loadInputs } from "@/lib/data";
import { dateToIso } from "@/lib/dates";
import { formatHours } from "@/lib/format";

export default async function EndreProsjektPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { projects, resourceInputs } = await loadInputs();
  const project = projects.find((item) => item.id === id);
  if (!project) notFound();

  return (
    <>
      <header className="page-head">
        <div>
          <p className="eyebrow">
            <Link href="/prosjekter">Prosjekter</Link>
          </p>
          <h1>Endre prosjekt</h1>
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
        }}
        resources={resourceInputs.map((resource) => ({
          id: resource.id,
          name: resource.name,
          role: resource.role,
          weeklyCapacityHours: resource.weeklyCapacityHours,
          active: resource.active,
        }))}
      />
    </>
  );
}
