import { currentUser } from "@/server/auth";
import { insightMeta } from "@/server/insights";
import { normalizeSpec, type InsightSpec } from "@straume/domain";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ReportBuilder } from "./builder";

export default async function BuilderPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const query = await searchParams;
  const meta = await insightMeta(user);
  const initial = normalizeSpec({
    kind: (query.kind as InsightSpec["kind"]) || "won",
    measure: (query.measure as InsightSpec["measure"]) || "sum",
    groupBy: (query.groupBy as InsightSpec["groupBy"]) || "month",
    segmentBy: "none",
    period: (query.period as InsightSpec["period"]) || "this_year",
    compare: (query.compare as InsightSpec["compare"]) || "year",
    source: query.source || null,
    area: query.area || null,
    sellerId: query.sellerId || null,
    pipelineId: query.pipelineId || null,
    view: (query.view as InsightSpec["view"]) || "bar",
  });
  return (
    <>
      <div className="top">
        <div>
          <h1>Rapportbygger</h1>
          <p className="muted">Velg rapport, mål, gruppering og filter. Sammenlign med forrige periode eller i fjor.</p>
        </div>
        <Link className="btn" href="/innsikt">Til dashbordet</Link>
      </div>
      <ReportBuilder meta={meta} initial={initial} />
    </>
  );
}
