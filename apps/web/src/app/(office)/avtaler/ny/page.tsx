import { listOptions, listPeople, listPipelines, staff } from "@/server/crm";
import { listOrganizations } from "@/server/crm";
import { NewDealForm } from "./form";

export default async function NewDealPage({ searchParams }: { searchParams: Promise<{ pipelineId?: string }> }) {
  const query = await searchParams;
  const [pipelines, people, orgs, users, options] = await Promise.all([
    listPipelines(),
    listPeople(),
    listOrganizations(),
    staff(),
    listOptions(),
  ]);
  const channels = options.find((list) => list.key === "kildekanal")?.items.filter((item) => item.active) ?? [];
  return (
    <>
      <h1>Ny salgsavtale</h1>
      <NewDealForm
        pipelineId={query.pipelineId}
        pipelines={pipelines.map((pipeline) => ({
          id: pipeline.id,
          name: pipeline.name,
          stages: pipeline.stages.map((stage) => ({ id: stage.id, name: stage.name })),
        }))}
        people={people.map((person) => ({ id: person.id, name: `${person.firstName} ${person.lastName}` }))}
        organizations={orgs.map((org) => ({ id: org.id, name: org.name }))}
        users={users.map((user) => ({ id: user.id, name: user.name }))}
        channels={channels.map((item) => item.label)}
      />
    </>
  );
}
