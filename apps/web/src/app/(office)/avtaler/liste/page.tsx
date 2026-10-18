import { nok } from "@/lib/format";
import { listDeals } from "@/server/crm";
import type { DealStatus } from "@straume/db";
import Link from "next/link";

const STATUSES: { value: DealStatus | "all"; label: string }[] = [
  { value: "all", label: "Alle statuser" },
  { value: "open", label: "Åpne" },
  { value: "won", label: "Vunne" },
  { value: "lost", label: "Tapte" },
];

export default async function DealListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; ownerId?: string; pipelineId?: string }>;
}) {
  const query = await searchParams;
  const status = (query.status || "all") as DealStatus | "all";
  const data = await listDeals({ q: query.q, status, ownerId: query.ownerId, pipelineId: query.pipelineId });
  return (
    <>
      <div className="top">
        <div>
          <h1>Avtaleliste</h1>
          <p className="muted">Søk i åpne, vunne og tapte salgsavtaler. Pipen viser bare de åpne.</p>
        </div>
        <Link className="btn" href="/pipeline">
          Til salgspipen
        </Link>
      </div>
      <form className="filters" method="get">
        <input name="q" defaultValue={query.q ?? ""} placeholder="Søk tittel eller kunde" />
        <select name="status" defaultValue={status}>
          {STATUSES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <select name="pipelineId" defaultValue={query.pipelineId ?? ""}>
          <option value="">Alle piper</option>
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
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Avtale</th>
              <th>Status</th>
              <th>Fase</th>
              <th>Selger</th>
              <th>Verdi</th>
              <th>Prosjekt</th>
            </tr>
          </thead>
          <tbody>
            {data.deals.map((deal) => (
              <tr key={deal.id}>
                <td>
                  <Link href={`/avtaler/${deal.id}`}>{deal.title}</Link>
                  <div className="muted">{deal.personName ?? deal.organizationName ?? ""}</div>
                </td>
                <td>{deal.status === "open" ? "Åpen" : deal.status === "won" ? "Vunnet" : "Tapt"}</td>
                <td>
                  {deal.stageName}
                  <div className="muted">{deal.pipelineName}</div>
                </td>
                <td>{deal.ownerName}</td>
                <td>{nok(deal.valueNok)}</td>
                <td>{deal.projectId ? <Link href={`/prosjekter/${deal.projectId}`}>Prosjekt</Link> : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.deals.length === 0 ? <p className="muted">Ingen salgsavtaler treffer filteret.</p> : null}
      </div>
    </>
  );
}
