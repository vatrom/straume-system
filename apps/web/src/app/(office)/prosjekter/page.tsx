import { nok } from "@/lib/format";
import { dashboard } from "@/server/projects";
import type { ProjectStatus } from "@straume/db";
import Link from "next/link";

const STATUSES: { value: ProjectStatus | ""; label: string }[] = [
  { value: "", label: "Alle statuser" },
  { value: "open", label: "Åpne" },
  { value: "completed", label: "Ferdige" },
  { value: "cancelled", label: "Kansellerte" },
];

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ sellerId?: string; projectManagerId?: string; phaseId?: string; boardId?: string; status?: string }>;
}) {
  const query = await searchParams;
  const status = (query.status ?? "") as ProjectStatus | "";
  const data = await dashboard({
    sellerId: query.sellerId,
    projectManagerId: query.projectManagerId,
    phaseId: query.phaseId,
    boardId: query.boardId,
    status,
  });
  const phases = data.boards.flatMap((board) => board.phases.map((phase) => ({ ...phase, boardName: board.name })));
  return (
    <>
      <div className="top">
        <div>
          <h1>Prosjekter</h1>
          <p className="muted">Filtrer på selger, prosjektleder, fase og status.</p>
        </div>
        <Link className="btn" href="/prosjekter/tavle">
          Åpne tavle
        </Link>
      </div>
      <div className="kpis">
        <div className="card kpi">
          <div className="label">Åpne prosjekter</div>
          <strong>{data.kpis.openProjects}</strong>
        </div>
        <div className="card kpi">
          <div className="label">Kontraktsum</div>
          <strong>{nok(data.kpis.contractSumNok)}</strong>
        </div>
        <div className="card kpi">
          <div className="label">Godkjente endringer</div>
          <strong>{nok(data.kpis.approvedChangesNok)}</strong>
        </div>
        <div className="card kpi">
          <div className="label">Åpen pipeline</div>
          <strong>{nok(data.kpis.openDealValueNok)}</strong>
        </div>
      </div>
      <form className="filters" method="get">
        <select name="sellerId" defaultValue={query.sellerId ?? ""}>
          <option value="">Alle selgere</option>
          {data.users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </select>
        <select name="projectManagerId" defaultValue={query.projectManagerId ?? ""}>
          <option value="">Alle prosjektledere</option>
          {data.users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </select>
        <select name="boardId" defaultValue={query.boardId ?? ""}>
          <option value="">Alle tavler</option>
          {data.boards.map((board) => (
            <option key={board.id} value={board.id}>
              {board.name}
            </option>
          ))}
        </select>
        <select name="phaseId" defaultValue={query.phaseId ?? ""}>
          <option value="">Alle faser</option>
          {phases.map((phase) => (
            <option key={phase.id} value={phase.id}>
              {phase.boardName}: {phase.name}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={status}>
          {STATUSES.map((item) => (
            <option key={item.value || "all"} value={item.value}>
              {item.label}
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
              <th>Prosjekt</th>
              <th>Kunde</th>
              <th>Fase</th>
              <th>Selger</th>
              <th>Prosjektleder</th>
              <th>Kontrakt</th>
              <th>Endringer</th>
            </tr>
          </thead>
          <tbody>
            {data.projects.map((project) => (
              <tr key={project.id}>
                <td>
                  <Link href={`/prosjekter/${project.id}`}>{project.title}</Link>
                  <div className="muted">{project.address || "Ingen adresse"}</div>
                </td>
                <td>{project.personName ?? "–"}</td>
                <td>
                  {project.phaseName}
                  <div className="muted">{project.boardName}</div>
                </td>
                <td>{project.sellerName}</td>
                <td>{project.projectManagerName}</td>
                <td>{nok(project.contractSumNok)}</td>
                <td>{nok(project.approvedChangesNok)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.projects.length === 0 ? <p className="muted">Ingen prosjekter treffer filteret.</p> : null}
      </div>
    </>
  );
}
