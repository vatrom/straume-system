import { StageEditor } from "@/components/StageEditor";
import { currentUser } from "@/server/auth";
import { listPipelines } from "@/server/crm";
import { redirect } from "next/navigation";
import { NewPipeline } from "./new-pipeline";

export default async function EditPipelinesPage() {
  const user = await currentUser();
  if (user?.role !== "admin") redirect("/pipeline");
  const pipelines = await listPipelines();
  return (
    <>
      <div className="top">
        <div>
          <h1>Pipeliner og faser</h1>
          <p className="muted">Administrator kan opprette pipeliner og endre navn, rekkefølge, sannsynlighet og stagnasjonsdager.</p>
        </div>
      </div>
      <NewPipeline />
      <div className="stack" style={{ marginTop: 16 }}>
        {pipelines.map((pipeline) => (
          <section key={pipeline.id}>
            <p className="muted">{pipeline.dealProbabilityEnabled ? "Sannsynlighet kan settes per avtale." : "Sannsynlighet følger fasen."}</p>
            <StageEditor
              title={pipeline.name}
              apiBase={`/api/pipelines/${pipeline.id}`}
              withProbability
              initial={pipeline.stages.map((stage) => ({
                id: stage.id,
                name: stage.name,
                probability: stage.probability,
                rottenDays: stage.rottenDays,
                sortOrder: stage.sortOrder,
              }))}
            />
          </section>
        ))}
      </div>
    </>
  );
}
