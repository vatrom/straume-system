import { InsightTile } from "@/components/InsightCharts";
import { currentUser } from "@/server/auth";
import { dashboardView } from "@/server/insights";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function SellerInsightPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const data = await dashboardView(user, "per-selger");
  return (
    <>
      <div className="top">
        <div>
          <h1>Per selger</h1>
          <p className="muted">Sammenligning av vunnet, aktivitet og fordeling. Selgere ser egne tall med mindre administrator åpner for alle.</p>
        </div>
        <Link className="btn" href="/innsikt">Salg totalt</Link>
      </div>
      {data ? (
        <div className="insight-grid">
          {data.tiles.map((tile) => (
            <InsightTile key={tile.id} title={tile.title} spec={tile.spec} result={tile.result} />
          ))}
        </div>
      ) : (
        <p>Dashbordet er ikke seedet ennå.</p>
      )}
    </>
  );
}
