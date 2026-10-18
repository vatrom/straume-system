import { nok } from "@/lib/format";
import { getDeal, listOptions } from "@/server/crm";
import { dec, isoDate } from "@/server/dates";
import Link from "next/link";
import { CreateProjectButton, DealActions } from "./actions";

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deal = await getDeal(id);
  const options = await listOptions();
  const reasons = options.find((list) => list.key === "tapsarsak")?.items.filter((item) => item.active).map((item) => item.label) ?? [];
  return (
    <>
      <div className="top">
        <div>
          <p className="muted"><Link href="/pipeline">Pipeline</Link> · {deal.pipeline.name}</p>
          <h1>{deal.title}</h1>
          <p>{nok(dec(deal.valueNok) ?? 0)} · {deal.owner.name} · {deal.stage.name}</p>
        </div>
        {deal.project ? <Link className="btn" href={`/prosjekter/${deal.project.id}`}>Åpne prosjekt</Link> : null}
        {deal.status === "won" && !deal.project ? <CreateProjectButton id={deal.id} /> : null}
      </div>
      <div className="grid-2">
        <section className="card stack">
          <p>Status: {deal.status === "open" ? "Åpen" : deal.status === "won" ? "Vunnet" : "Tapt"}</p>
          <p>Kildekanal: {deal.sourceChannel ?? "–"}</p>
          <p>Planlagt oppstart: {isoDate(deal.plannedStartDate) ?? "–"}</p>
          <p>Forventet inngåelse: {isoDate(deal.expectedCloseDate) ?? "–"}</p>
          <p>Person: {deal.person ? `${deal.person.firstName} ${deal.person.lastName}` : "–"}</p>
          <p>Organisasjon: {deal.organization?.name ?? "–"}</p>
          {deal.lostReason ? <p>Tapsårsak: {deal.lostReason}</p> : null}
          <h2>Aktiviteter</h2>
          {deal.activities.length === 0 ? <p className="muted">Ingen aktiviteter.</p> : null}
          {deal.activities.map((activity) => (
            <div key={activity.id}>
              <strong>{activity.subject}</strong>
              <div className="muted">{activity.type} · {activity.owner.name}{activity.done ? " · utført" : ""}</div>
            </div>
          ))}
        </section>
        <DealActions
          id={deal.id}
          status={deal.status}
          stages={deal.pipeline.stages.map((stage) => ({ id: stage.id, name: stage.name }))}
          stageId={deal.stageId}
          reasons={reasons}
          plannedStartDate={isoDate(deal.plannedStartDate) ?? ""}
        />
      </div>
    </>
  );
}
