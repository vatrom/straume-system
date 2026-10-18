import { nok } from "@/lib/format";
import { currentUser } from "@/server/auth";
import { drilldown } from "@/server/insights";
import type { InsightSpec } from "@straume/domain";
import Link from "next/link";
import { redirect } from "next/navigation";

const STATUS: Record<string, string> = { open: "Åpen", won: "Vunnet", lost: "Tapt" };

export default async function InsightDealsPage({ searchParams }: { searchParams: Promise<{ spec?: string; bucket?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const query = await searchParams;
  let spec: Partial<InsightSpec> = {};
  try {
    spec = JSON.parse(query.spec ?? "{}") as Partial<InsightSpec>;
  } catch {
    spec = {};
  }
  const data = await drilldown(user, spec, query.bucket ?? "__all");
  return (
    <>
      <div className="top">
        <div>
          <p className="muted"><Link href="/innsikt">Innsikt</Link> · {data.title}</p>
          <h1>{data.bucket}</h1>
          <p className="muted">{data.deals.length} avtaler i utvalget.</p>
        </div>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Avtale</th>
              <th>Status</th>
              <th>Selger</th>
              <th>Fase</th>
              <th>Kilde</th>
              <th>Område</th>
              <th>Verdi</th>
            </tr>
          </thead>
          <tbody>
            {data.deals.map((deal) => (
              <tr key={deal.id}>
                <td><Link href={`/avtaler/${deal.id}`}>{deal.title}</Link></td>
                <td>{STATUS[deal.status] ?? deal.status}</td>
                <td>{deal.ownerName}</td>
                <td>{deal.stageName}</td>
                <td>{deal.source ?? "–"}</td>
                <td>{deal.area ?? "–"}</td>
                <td>{nok(deal.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.deals.length === 0 ? <p className="muted">Ingen avtaler.</p> : null}
      </div>
    </>
  );
}
