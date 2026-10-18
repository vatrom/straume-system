import { ProjectBoard } from "@/components/ProjectBoard";
import { StageEditor } from "@/components/StageEditor";
import { currentUser } from "@/server/auth";
import { dashboard, listBoards } from "@/server/projects";
import Link from "next/link";

export default async function ProjectBoardPage({ searchParams }: { searchParams: Promise<{ boardId?: string }> }) {
  const query = await searchParams;
  const user = await currentUser();
  const boards = await listBoards();
  const current = boards.find((board) => board.id === query.boardId) ?? boards[0];
  const data = current ? await dashboard({ boardId: current.id, status: "open" }) : null;
  return (
    <>
      <div className="top">
        <div>
          <h1>Prosjekttavle</h1>
          <p className="muted">Dra åpne prosjekter mellom faser. Selger og prosjektleder er egne felt.</p>
        </div>
        <Link className="btn" href="/prosjekter">
          Til liste og nøkkeltall
        </Link>
      </div>
      <form className="filters" method="get">
        <select name="boardId" defaultValue={current?.id}>
          {boards.map((board) => (
            <option key={board.id} value={board.id}>
              {board.name}
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
          }))}
        />
      ) : (
        <p>Ingen tavle er opprettet.</p>
      )}
      {user?.role === "admin" && current ? (
        <div style={{ marginTop: 24 }}>
          <StageEditor title={`Faser · ${current.name}`} apiBase={`/api/boards/${current.id}`} initial={current.phases} withProbability={false} />
        </div>
      ) : null}
    </>
  );
}
