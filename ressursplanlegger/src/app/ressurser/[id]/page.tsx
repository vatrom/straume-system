import Link from "next/link";
import { notFound } from "next/navigation";
import { AbsenceForm } from "@/components/absence-form";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { ResourceForm } from "@/components/resource-form";
import { deleteAbsence, deleteResource } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { dateToIso, formatNorwegian } from "@/lib/dates";

export default async function EndreRessursPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resource = await prisma.resource.findUnique({
    where: { id },
    include: { absences: { orderBy: { startDate: "asc" } } },
  });
  if (!resource) notFound();

  return (
    <>
      <header className="page-head">
        <div>
          <p className="eyebrow">
            <Link href="/ressurser">Ressurser</Link>
          </p>
          <h1>{resource.name}</h1>
          <p className="lede">
            {resource.role}
            {resource.isExample ? " · eksempeldata" : ""}
          </p>
        </div>
        <form action={deleteResource.bind(null, resource.id)}>
          <ConfirmSubmit
            label="Slett ressurs"
            confirm={`Slette ${resource.name}? Personen fjernes også fra prosjekter.`}
          />
        </form>
      </header>

      <ResourceForm
        resource={{
          id: resource.id,
          name: resource.name,
          role: resource.role,
          weeklyCapacityHours: resource.weeklyCapacityHours,
          active: resource.active,
        }}
      />

      <section className="split" style={{ marginTop: "0.9rem" }}>
        <div className="panel">
          <h2>Fravær</h2>
          {resource.absences.length === 0 ? <p>Ingen fravær registrert.</p> : null}
          {resource.absences.map((absence) => (
            <div className="person" key={absence.id}>
              <div>
                <strong>{absence.reason}</strong>
                <div className="meta">
                  {formatNorwegian(dateToIso(absence.startDate))}–{formatNorwegian(dateToIso(absence.endDate))}
                </div>
              </div>
              <form action={deleteAbsence.bind(null, absence.id)}>
                <ConfirmSubmit label="Fjern" confirm="Fjerne dette fraværet?" className="btn-quiet" />
              </form>
            </div>
          ))}
        </div>
        <AbsenceForm resourceId={resource.id} />
      </section>
    </>
  );
}
