import Link from "next/link";
import { ProjectForm } from "@/components/project-form";
import { loadInputs } from "@/lib/data";
import { todayIso } from "@/lib/dates";

export default async function NyttProsjektPage() {
  const { resourceInputs } = await loadInputs();
  return (
    <>
      <header className="page-head">
        <div>
          <p className="eyebrow">
            <Link href="/prosjekter">Prosjekter</Link>
          </p>
          <h1>Nytt prosjekt</h1>
          <p className="lede">Fyll inn oppstart og timer, og velg folk som har ledig kapasitet.</p>
        </div>
      </header>
      <ProjectForm
        project={{
          name: "",
          customer: "",
          address: "",
          startDate: todayIso(),
          endDate: "",
          estimatedHours: "",
          status: "planlagt",
          color: "#1f6b4a",
          resourceIds: [],
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
