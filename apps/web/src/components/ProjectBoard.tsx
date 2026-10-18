"use client";

import { nok } from "@/lib/format";
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import Link from "next/link";
import { useMemo, useState } from "react";

export type ProjectCard = {
  id: string;
  title: string;
  phaseId: string;
  sellerName: string;
  projectManagerName: string;
  contractSumNok: number | null;
  address: string;
  personName: string | null;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  delayed: boolean;
  stagnant: boolean;
};

function dato(iso: string | null) {
  if (!iso) return "–";
  const [year, month, day] = iso.split("-");
  return `${day}.${month}.${year}`;
}

export function ProjectBoard({ phases, initial }: { phases: { id: string; name: string; sortOrder: number }[]; initial: ProjectCard[] }) {
  const [projects, setProjects] = useState(initial);
  const [error, setError] = useState("");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const grouped = useMemo(() => {
    const map = new Map(phases.map((phase) => [phase.id, [] as ProjectCard[]]));
    for (const project of projects) map.get(project.phaseId)?.push(project);
    return map;
  }, [phases, projects]);

  async function onDragEnd(event: DragEndEvent) {
    const projectId = String(event.active.id);
    const phaseId = event.over ? String(event.over.id) : "";
    const project = projects.find((item) => item.id === projectId);
    if (!project || !phaseId || project.phaseId === phaseId) return;
    setProjects((current) => current.map((item) => (item.id === projectId ? { ...item, phaseId } : item)));
    const response = await fetch(`/api/projects/${projectId}/phase`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phaseId }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error ?? "Kunne ikke flytte prosjektet");
      setProjects(initial);
    }
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      {error ? <p className="error">{error}</p> : null}
      <div className="board">
        {phases.map((phase) => {
          const cards = grouped.get(phase.id) ?? [];
          return (
            <PhaseColumn key={phase.id} id={phase.id}>
              <div className="col-head">
                <h3>{phase.name}</h3>
                <span className="badge">{cards.length}</span>
              </div>
              <div className="col-sum">{nok(cards.reduce((sum, card) => sum + (card.contractSumNok ?? 0), 0))}</div>
              {cards.map((project) => (
                <ProjectCardView key={project.id} project={project} />
              ))}
            </PhaseColumn>
          );
        })}
      </div>
    </DndContext>
  );
}

function PhaseColumn({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section ref={setNodeRef} className={isOver ? "col over" : "col"}>
      {children}
    </section>
  );
}

function ProjectCardView({ project }: { project: ProjectCard }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: project.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.7 : 1 } : undefined;
  const marked = project.delayed || project.stagnant;
  const missingStart = !project.plannedStartDate;
  const className = ["deal", marked ? "rotten" : "", missingStart ? "missing-start" : ""].filter(Boolean).join(" ");
  return (
    <article ref={setNodeRef} className={className} style={style} {...listeners} {...attributes}>
      <Link href={`/prosjekter/${project.id}`}>{project.title}</Link>
      <div>{nok(project.contractSumNok)}</div>
      <div className="muted">
        Prosjektleder {project.projectManagerName}
        <br />
        Selger {project.sellerName}
      </div>
      <div className="muted">
        Oppstart {dato(project.plannedStartDate)}
        <br />
        Ferdig {dato(project.plannedEndDate)}
      </div>
      {project.personName ? <div className="muted">{project.personName}</div> : null}
      {project.address ? <div className="muted">{project.address}</div> : null}
      {missingStart || project.delayed || project.stagnant ? (
        <div className="deal-flags">
          {missingStart ? <span className="badge missing">Mangler oppstartsdato</span> : null}
          {project.delayed ? <span className="badge rot">Forsinket</span> : null}
          {project.stagnant ? <span className="badge warn">Stagnert</span> : null}
        </div>
      ) : null}
    </article>
  );
}
