import { PipelineBoard } from "@/components/PipelineBoard";
import { dealsForBoard } from "@/server/crm";
import Link from "next/link";

export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ pipelineId?: string; ownerId?: string }> }) {
  const query = await searchParams;
  const data = await dealsForBoard(query.pipelineId, query.ownerId);
  const current = data.current;
  return (
    <>
      <div className="top">
        <div>
          <h1>Salgsavtaler</h1>
          <p className="muted">Bare åpne salgsavtaler. Vunne og tapte forsvinner herfra og ligger i avtalelisten. Stagnerte avtaler er merket.</p>
        </div>
        <div className="row">
          <Link className="btn" href="/avtaler/liste">
            Avtaleliste
          </Link>
          <Link className="btn" href="/pipeline/rediger">
            Rediger faser
          </Link>
          <Link className="btn primary" href={`/avtaler/ny?pipelineId=${current?.id ?? ""}`}>
            Ny avtale
          </Link>
        </div>
      </div>
      <form className="filters" method="get">
        <select name="pipelineId" defaultValue={current?.id}>
          {data.pipelines.map((pipeline) => (
            <option key={pipeline.id} value={pipeline.id}>
              {pipeline.name}
            </option>
          ))}
        </select>
        <select name="ownerId" defaultValue={query.ownerId ?? ""}>
          <option value="">Alle selgere</option>
          {data.users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </select>
        <button className="btn" type="submit">
          Vis
        </button>
      </form>
      {current ? (
        <PipelineBoard
          stages={current.stages}
          initialDeals={data.deals.map((deal) => ({
            id: deal.id,
            title: deal.title,
            valueNok: deal.valueNok,
            ownerName: deal.ownerName,
            stageId: deal.stageId,
            sourceChannel: deal.sourceChannel,
            plannedStartDate: deal.plannedStartDate,
            daysInStage: deal.daysInStage,
            rotten: deal.rotten,
            personName: deal.personName,
          }))}
        />
      ) : (
        <p>Ingen pipeline er opprettet.</p>
      )}
    </>
  );
}
