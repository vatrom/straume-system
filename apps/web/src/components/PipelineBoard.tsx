"use client";

import { nok } from "@/lib/format";
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import Link from "next/link";
import { useMemo, useState } from "react";

export type DealCard = {
  id: string;
  title: string;
  valueNok: number;
  ownerName: string;
  stageId: string;
  sourceChannel: string | null;
  plannedStartDate: string | null;
  daysInStage: number;
  rotten: boolean;
  personName: string | null;
};

type Stage = { id: string; name: string; probability: number; rottenDays: number | null; sortOrder: number };

export function PipelineBoard({ stages, initialDeals }: { stages: Stage[]; initialDeals: DealCard[] }) {
  const [deals, setDeals] = useState(initialDeals);
  const [error, setError] = useState("");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const grouped = useMemo(() => {
    const map = new Map(stages.map((stage) => [stage.id, [] as DealCard[]]));
    for (const deal of deals) map.get(deal.stageId)?.push(deal);
    return map;
  }, [deals, stages]);

  async function onDragEnd(event: DragEndEvent) {
    const dealId = String(event.active.id);
    const stageId = event.over ? String(event.over.id) : "";
    const deal = deals.find((item) => item.id === dealId);
    if (!deal || !stageId || deal.stageId === stageId) return;
    setDeals((current) => current.map((item) => (item.id === dealId ? { ...item, stageId, daysInStage: 0, rotten: false } : item)));
    const response = await fetch(`/api/deals/${dealId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stageId }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error ?? "Kunne ikke flytte avtalen");
      setDeals(initialDeals);
    }
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      {error ? <p className="error">{error}</p> : null}
      <div className="board">
        {stages.map((stage) => {
          const cards = grouped.get(stage.id) ?? [];
          const sum = cards.reduce((total, card) => total + card.valueNok, 0);
          return (
            <Column key={stage.id} id={stage.id}>
              <div className="col-head">
                <h3>{stage.name}</h3>
                <span className="badge">{stage.probability} %</span>
              </div>
              <p className="muted" style={{ marginTop: 0 }}>
                {cards.length} · {nok(sum)}
                {stage.rottenDays ? ` · stagnerer etter ${stage.rottenDays} d` : ""}
              </p>
              {cards.map((deal) => (
                <Deal key={deal.id} deal={deal} />
              ))}
            </Column>
          );
        })}
      </div>
    </DndContext>
  );
}

function Column({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section ref={setNodeRef} className={isOver ? "col over" : "col"}>
      {children}
    </section>
  );
}

function Deal({ deal }: { deal: DealCard }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.7 : 1 } : undefined;
  return (
    <article ref={setNodeRef} className={deal.rotten ? "deal rotten" : "deal"} style={style} {...listeners} {...attributes}>
      <Link href={`/avtaler/${deal.id}`}>{deal.title}</Link>
      <div>{nok(deal.valueNok)}</div>
      <div className="muted">
        {deal.ownerName}
        {deal.personName ? ` · ${deal.personName}` : ""}
      </div>
      <div className="row" style={{ marginTop: 6 }}>
        {deal.sourceChannel ? <span className="badge">{deal.sourceChannel}</span> : null}
        {deal.rotten ? <span className="badge rot">Stagnert · {deal.daysInStage} d</span> : <span className="badge">{deal.daysInStage} d i fasen</span>}
      </div>
      {deal.plannedStartDate ? <div className="muted">Oppstart {deal.plannedStartDate.split("-").reverse().join(".")}</div> : null}
    </article>
  );
}
