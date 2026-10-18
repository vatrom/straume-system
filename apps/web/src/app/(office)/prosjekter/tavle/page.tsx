import { ProjectBoard } from "@/components/ProjectBoard";
import { StageEditor } from "@/components/StageEditor";
import { nok } from "@/lib/format";
import { currentUser } from "@/server/auth";
import { dashboard, listBoards } from "@/server/projects";
import Link from "next/link";

export default async function ProjectBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ boardId?: string; sellerId?: string; projectManagerId?: string }>;
}) {
  const query = await searchParams;
  const user = await currentUser();
  const boards = await listBoards();
  const current = boards.find((board) => board.id === query.boardId) ?? boards[0];
  const data = current
    ? await dashboard({ boardId: current.id, sellerId: query.sellerId, projectManagerId: query.projectManagerId, status: "active" })
    : null;
  const delayed = data?.projects.filter((project) => project.delayed).length ?? 0;
  const stagnant = data?.projects.filter((project) => project.stagnant).length ?? 0;
  const contract = data?.projects.reduce((sum, project) => sum + (project.contractSumNok ?? 0), 0) ?? 0;
  return (
    <>
      <div className="top">
        <div>
          <h1>Prosjekttavle</h1>
          <p className="muted">Planlagte og pågående prosjekter. Fullførte vises ikke her. De søkes opp i prosjektlisten.</p>
        </div>
        <Link className="btn" href="/prosjekter">
          Historikk og søk
        </Link>
      </div>
      {data ? (
        <div className="kpis">
          <div className="card kpi">
            <div className="label">I tavlen</div>
            <strong>{data.projects.length}</strong>
          </div>
          <div className="card kpi">
            <div className="label">Kontraktsum</div>
            <strong>{nok(contract)}</strong>
          </div>
          <div className="card kpi">
            <div className="label">Forsinket</div>
            <strong>{delayed}</strong>
          </div>
          <div className="card kpi">
            <div className="label">Stagnert</div>
            <strong>{stagnant}</strong>
          </div>
        </div>
      ) : null}
      <form className="filters" method="get">
        <select name="boardId" defaultValue={current?.id}>
          {boards.map((board) => (
            <option key={board.id} value={board.id}>
              {board.name}
            </option>
          ))}
        </select>
        <select name="sellerId" defaultValue={query.sellerId ?? ""}>
          <option value="">Alle selgere</option>
          {data?.users.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
        <select name="projectManagerId" defaultValue={query.projectManagerId ?? ""}>
          <option value="">Alle prosjektledere</option>
          {data?.users.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
        <button className="btn" type="submit">
          Vis
        </button>
      </form>
      {current && data ? (
        <ProjectBoard
          phases={current.phases}
          initial={data.projects.map((project) => ({
            id: project.id,
            title: project.title,
            phaseId: project.phaseId,
            sellerName: project.sellerName,
            projectManagerName: project.projectManagerName,
            contractSumNok: project.contractSumNok,
            address: project.address,
            personName: project.personName,
            plannedStartDate: project.plannedStartDate,
            plannedEndDate: project.plannedEndDate,
            delayed: project.delayed,
            stagnant: project.stagnant,
          }))}
        />
      ) : (
        <p>Ingen tavle er opprettet.</p>
      )}
      {user?.role === "admin" && current ? (
        <div style={{ marginTop: 24 }}>
          <StageEditor
            title={`Faser · ${current.name}`}
            apiBase={`/api/boards/${current.id}`}
            initial={current.phases}
            withProbability={false}
            withRotting
          />
        </div>
      ) : null}
    </>
  );
}
