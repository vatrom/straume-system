import { GoalList, InsightTile } from "@/components/InsightCharts";
import { currentUser } from "@/server/auth";
import { dashboardView } from "@/server/insights";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function InsightHomePage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const data = await dashboardView(user, "salg-totalt");
  return (
    <>
      <div className="top">
        <div>
          <h1>Innsikt</h1>
          <p className="muted">Salg totalt. Historikken blir stående selv om faser endres. Klikk et tall for å se avtalene.</p>
        </div>
        <div className="row">
          <Link className="btn" href="/innsikt/selger">Per selger</Link>
          <Link className="btn" href="/innsikt/bygg">Rapportbygger</Link>
          <Link className="btn" href="/innsikt/maal">Mål</Link>
        </div>
      </div>
      {data ? (
        <>
          <GoalList goals={data.goals} />
          <div className="insight-grid">
            {data.tiles.map((tile) => (
              <InsightTile key={tile.id} title={tile.title} spec={tile.spec} result={tile.result} />
            ))}
          </div>
        </>
      ) : (
        <p>Dashbordet er ikke seedet ennå.</p>
      )}
    </>
  );
}
