import { CustomerPreview, ChangeForm, DocumentForm, ProjectForm, WinnerButton } from "./actions";
import { nok } from "@/lib/format";
import { staff } from "@/server/crm";
import { dec, isoDate } from "@/server/dates";
import { projectDetail } from "@/server/projects";
import { sectionToSvg, sketchToSvg, type Sketch } from "@straume/domain";
import Link from "next/link";

const STATUS: Record<string, string> = { open: "Åpen", completed: "Ferdig", cancelled: "Kansellert" };
const CHANGE: Record<string, string> = { draft: "Utkast", sent: "Sendt", approved: "Godkjent", rejected: "Avvist" };

function asSketch(value: unknown): Sketch | null {
  if (!value || typeof value !== "object" || !("points" in value)) return null;
  const sketch = value as Sketch;
  if (!Array.isArray(sketch.points) || sketch.points.length < 3) return null;
  return sketch;
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project, conflicts } = await projectDetail(id);
  const users = await staff();
  const person = project.person ? `${project.person.firstName} ${project.person.lastName}` : "Ingen person";
  const approved = project.changes.filter((change) => change.status === "approved").reduce((sum, change) => sum + (dec(change.amountNok) ?? 0), 0);
  return (
    <>
      <div className="top">
        <div>
          <p className="muted">
            <Link href="/prosjekter">Prosjekter</Link> · {project.board.name}
          </p>
          <h1>{project.title}</h1>
          <p>
            {person}
            {project.organization ? ` · ${project.organization.name}` : ""} · {STATUS[project.status] ?? project.status}
          </p>
        </div>
        <div className="row">
          {project.deal ? <Link className="btn" href={`/avtaler/${project.deal.id}`}>Avtale</Link> : null}
          <WinnerButton projectId={project.id} />
        </div>
      </div>
      <div className="kpis">
        <div className="card kpi">
          <div className="label">Kontraktsum</div>
          <strong>{nok(dec(project.contractSumNok))}</strong>
        </div>
        <div className="card kpi">
          <div className="label">Godkjente endringer</div>
          <strong>{nok(approved)}</strong>
        </div>
        <div className="card kpi">
          <div className="label">Fase</div>
          <strong style={{ fontSize: "1.2rem" }}>{project.phase.name}</strong>
        </div>
        <div className="card kpi">
          <div className="label">Befaringer</div>
          <strong>{project.inspections.length}</strong>
        </div>
      </div>
      <div className="grid-2">
        <section className="card">
          <h2>Oppdrag</h2>
          <ProjectForm
            projectId={project.id}
            users={users.map((user) => ({ id: user.id, name: user.name }))}
            phases={project.board.phases}
            initial={{
              sellerId: project.sellerId,
              projectManagerId: project.projectManagerId,
              status: project.status,
              phaseId: project.phaseId,
              contractSumNok: dec(project.contractSumNok),
              plannedStartDate: isoDate(project.plannedStartDate) ?? "",
              street: project.street ?? "",
              houseNumber: project.houseNumber ?? "",
              postalCode: project.postalCode ?? "",
              city: project.city ?? "",
            }}
          />
        </section>
        <section className="card stack">
          <h2>Endringsordre</h2>
          {project.changes.map((change) => (
            <div key={change.id}>
              <strong>{change.title}</strong> · {CHANGE[change.status] ?? change.status} · {nok(dec(change.amountNok))}
              {change.description ? <div>{change.description}</div> : null}
              {change.internalNote ? (
                <div className="note-internal muted">
                  <span className="badge warn">Internt</span> {change.internalNote}
                </div>
              ) : null}
            </div>
          ))}
          <ChangeForm projectId={project.id} />
        </section>
      </div>
      <section className="card stack" style={{ marginTop: 16 }}>
        <h2>Dokumenter</h2>
        {project.documents.map((document) => (
          <div key={document.id}>
            <a href={`/api/files/documents/${document.id}`}>{document.name}</a>
            <span className="muted"> · {document.visibility} · {document.uploadedBy.name}</span>
          </div>
        ))}
        {project.documents.length === 0 ? <p className="muted">Ingen dokumenter ennå.</p> : null}
        <DocumentForm projectId={project.id} />
      </section>
      <section className="card stack" style={{ marginTop: 16 }}>
        <h2>Befaring</h2>
        {project.inspections.map((inspection) => (
          <div key={inspection.id}>
            <strong>{inspection.templateVersion ? `Sjekkliste v${inspection.templateVersion.version}` : "Befaring"}</strong>
            <span className="muted"> · {inspection.inspector?.name ?? "Ukjent"} · {inspection.status}</span>
            <div className="muted">{inspection.answers.filter((answer) => !answer.deletedAt).length} svar</div>
          </div>
        ))}
        {project.floors.map((floor) => (
          <div key={floor.id}>
            <h3>{floor.name}</h3>
            {floor.rooms.map((room) => {
              const sketch = asSketch(room.sketch);
              const width = sketch ? Math.max(...sketch.points.map((point) => point.x)) - Math.min(...sketch.points.map((point) => point.x)) : 0;
              return (
                <div key={room.id} className="stack" style={{ marginBottom: 16 }}>
                  <strong>{room.name}</strong>
                  <div className="muted">
                    Omkrets {dec(room.perimeterM)?.toLocaleString("nb-NO") ?? "–"} m · høyde {dec(room.ceilingHeightM)?.toLocaleString("nb-NO") ?? "–"} m · gulv{" "}
                    {dec(room.floorAreaM)?.toLocaleString("nb-NO") ?? "–"} m²
                  </div>
                  <div>Vegger: {room.walls.map((wall) => `V${wall.number} ${dec(wall.lengthM)?.toFixed(2)} m`).join(" · ") || "ingen"}</div>
                  {sketch ? <div className="sketch" dangerouslySetInnerHTML={{ __html: sketchToSvg(sketch, room.name) }} /> : null}
                  {sketch ? (
                    <div className="row">
                      <a className="btn" href={`/api/projects/${project.id}/rooms/${room.id}/sketch.png`}>
                        Last ned PNG
                      </a>
                      <a className="btn" href={`/api/projects/${project.id}/rooms/${room.id}/sketch.pdf`}>
                        Last ned PDF
                      </a>
                    </div>
                  ) : null}
                  {sketch?.slope ? (
                    <div className="sketch" dangerouslySetInnerHTML={{ __html: sectionToSvg({ widthM: width, kneeHeightM: sketch.slope.kneeHeightM, ridgeHeightM: sketch.slope.ridgeHeightM }) }} />
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
        <h3>Notater</h3>
        {project.notes.map((note) => (
          <p key={note.id} className={note.internal ? "note-internal" : ""}>
            {note.internal ? <span className="badge warn">Internt</span> : <span className="badge ok">Kan vises</span>} {note.body}
          </p>
        ))}
        <h3>Media</h3>
        {project.media.map((item) => (
          <div key={item.id}>
            {item.storageKey ? <a href={`/api/files/media/${item.id}`}>{item.fileName ?? item.kind}</a> : item.textContent}
            <span className="muted"> · {item.kind}{item.internal ? " · internt" : ""}</span>
          </div>
        ))}
        {conflicts.length > 0 ? (
          <p className="muted">{conflicts.length} synkroniseringskonflikter er logget for dette prosjektet.</p>
        ) : null}
        <CustomerPreview projectId={project.id} />
      </section>
    </>
  );
}
