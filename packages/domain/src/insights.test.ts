import { describe, expect, it } from "vitest";
import { areaFromPostal, measureGoal, normalizeSpec, runInsight, type InsightDeal, type InsightQuote, type StageCatalogItem, type StageMove } from "./insights";

const now = new Date("2026-10-18T12:00:00.000Z");
const stages: StageCatalogItem[] = [
  { pipelineId: "salg", name: "Innkommende", sortOrder: 0 },
  { pipelineId: "salg", name: "Tilbud", sortOrder: 1 },
  { pipelineId: "salg", name: "Slutt", sortOrder: 2 },
];

function deal(patch: Partial<InsightDeal> & Pick<InsightDeal, "id">): InsightDeal {
  return {
    title: patch.id,
    value: 100000,
    ownerId: "a",
    ownerName: "Ada Berg",
    pipelineId: "salg",
    pipelineName: "Salgspipe",
    stageId: "s0",
    stageName: "Innkommende",
    stageOrder: 0,
    status: "open",
    source: "Google",
    lostReason: "",
    area: "Straume",
    postalCode: "5353",
    probability: 40,
    createdAt: "2026-03-01T12:00:00.000Z",
    wonAt: null,
    lostAt: null,
    custom: {},
    ...patch,
  };
}

describe("salgsstatistikk", () => {
  const deals = [
    deal({ id: "w1", status: "won", value: 100000, wonAt: "2026-03-10T12:00:00.000Z", ownerId: "a", ownerName: "Ada Berg", source: "Byggstart", stageName: "Slutt", stageOrder: 2, createdAt: "2026-03-01T12:00:00.000Z" }),
    deal({ id: "w2", status: "won", value: 300000, wonAt: "2026-05-02T12:00:00.000Z", ownerId: "n", ownerName: "Noah Lien", source: "MittAnbud", stageName: "Slutt", stageOrder: 2, createdAt: "2026-04-01T12:00:00.000Z" }),
    deal({ id: "old", status: "won", value: 50000, wonAt: "2025-05-02T12:00:00.000Z", ownerId: "a", ownerName: "Ada Berg", createdAt: "2025-04-01T12:00:00.000Z", stageOrder: 2, stageName: "Slutt" }),
    deal({ id: "lost", status: "lost", value: 999000, lostAt: "2026-06-01T12:00:00.000Z", lostReason: "Pris (konkurrent)", source: "Byggstart" }),
    deal({ id: "open", status: "open", value: 200000, probability: 50, stageName: "Tilbud", stageOrder: 1, createdAt: "2026-09-01T12:00:00.000Z" }),
  ];

  it("summerer vunnet i år per selger og sammenligner med i fjor", () => {
    const result = runInsight(deals, [], [], stages, { kind: "won", measure: "sum", groupBy: "seller", period: "this_year", compare: "year", view: "bar" }, now);
    expect(result.total).toBe(400000);
    expect(result.compareTotal).toBe(50000);
    expect(result.delta).toBe(700);
    expect(result.buckets.map((bucket) => [bucket.label, bucket.value])).toEqual([
      ["Noah Lien", 300000],
      ["Ada Berg", 100000],
    ]);
    expect(result.buckets[0]?.dealIds).toEqual(["w2"]);
  });

  it("tar med egendefinert periode, kilde og verdiintervall", () => {
    const result = runInsight(
      deals,
      [],
      [],
      stages,
      { kind: "won", measure: "count", groupBy: "source", period: "custom", from: "2026-01-01", to: "2026-04-30", source: "Byggstart", valueMin: 80000, valueMax: 150000, view: "table" },
      now,
    );
    expect(result.total).toBe(1);
    expect(result.dealIds).toEqual(["w1"]);
  });

  it("bygger en trakt ut fra høyeste fase som er nådd", () => {
    const moves: StageMove[] = [
      { dealId: "w1", fromStageName: null, toStageName: "Innkommende", toStageOrder: 0, at: "2026-03-01T12:00:00.000Z", userId: "a", userName: "Ada Berg" },
      { dealId: "back", fromStageName: "Slutt", toStageName: "Innkommende", toStageOrder: 0, at: "2026-02-01T12:00:00.000Z", userId: "a", userName: "Ada Berg" },
    ];
    const cohort = [
      deal({ id: "w1", stageOrder: 2, stageName: "Slutt", createdAt: "2026-03-01T12:00:00.000Z" }),
      deal({ id: "early", stageOrder: 0, stageName: "Innkommende", createdAt: "2026-04-01T12:00:00.000Z" }),
      deal({ id: "back", stageOrder: 0, stageName: "Innkommende", createdAt: "2026-01-15T12:00:00.000Z" }),
    ];
    const result = runInsight(cohort, moves, [], stages, { kind: "funnel", period: "this_year", pipelineId: "salg", view: "funnel" }, now);
    expect(result.buckets.map((bucket) => [bucket.label, bucket.value])).toEqual([
      ["Innkommende", 3],
      ["Tilbud", 2],
      ["Slutt", 2],
    ]);
    expect(result.buckets[2]?.dealIds.sort()).toEqual(["back", "w1"]);
  });

  it("vekter åpne avtaler med sannsynlighet og regner salgssyklus", () => {
    const forecast = runInsight(deals, [], [], stages, { kind: "forecast", measure: "sum", groupBy: "none", view: "kpi" }, now);
    expect(forecast.total).toBe(100000);
    expect(forecast.dealIds).toEqual(["open"]);
    const cycle = runInsight(deals, [], [], stages, { kind: "cycle", measure: "avg", period: "this_year", view: "kpi" }, now);
    expect(cycle.total).toBe(20);
    expect(cycle.unit).toBe("days");
  });

  it("grupperer tapsgrunner og aktiviteter", () => {
    const reasons = runInsight(deals, [], [], stages, { kind: "lost_reasons", measure: "count", period: "this_year", view: "donut" }, now);
    expect(reasons.buckets).toEqual([expect.objectContaining({ label: "Pris (konkurrent)", value: 1, dealIds: ["lost"] })]);
    const activity = runInsight(
      deals,
      [],
      [{ id: "act", dealId: "w1", ownerId: "a", ownerName: "Ada Berg", type: "call", at: "2026-03-02T12:00:00.000Z" }],
      stages,
      { kind: "activity", groupBy: "seller", period: "this_year", view: "bar" },
      now,
    );
    expect(activity.total).toBe(1);
    expect(activity.buckets[0]?.label).toBe("Ada Berg");
  });

  it("teller fasebevegelser i perioden og måler mål", () => {
    const moves: StageMove[] = [
      { dealId: "w1", fromStageName: "Innkommende", toStageName: "Tilbud", toStageOrder: 1, at: "2026-03-05T12:00:00.000Z", userId: "a", userName: "Ada Berg" },
      { dealId: "w1", fromStageName: "Tilbud", toStageName: "Slettet fase", toStageOrder: 9, at: "2026-03-08T12:00:00.000Z", userId: "a", userName: "Ada Berg" },
    ];
    const movement = runInsight(deals, moves, [], stages, { kind: "movement", groupBy: "stage", period: "this_year", view: "bar" }, now);
    expect(movement.total).toBe(2);
    expect(movement.buckets.map((bucket) => bucket.label)).toContain("Slettet fase");
    const goal = measureGoal(deals, { ownerId: "a", start: "2026-01-01", end: "2026-12-31", metric: "sum", target: 200000 });
    expect(goal.actual).toBe(100000);
    expect(goal.ratio).toBe(0.5);
  });

  it("regner antall, snitt, margin og hit rate for tilbud", () => {
    const quotes: InsightQuote[] = [
      { id: "q1", dealId: "w1", status: "accepted", valueIncVat: 400000, marginExVat: 0.4, createdAt: "2026-03-01T12:00:00.000Z", decidedAt: "2026-03-20T12:00:00.000Z", ownerId: "a", ownerName: "Ada Berg", source: "Byggstart", area: "Straume" },
      { id: "q2", dealId: "lost", status: "rejected", valueIncVat: 200000, marginExVat: 0.2, createdAt: "2026-04-01T12:00:00.000Z", decidedAt: "2026-04-20T12:00:00.000Z", ownerId: "n", ownerName: "Noah Lien", source: "MittAnbud", area: "Straume" },
      { id: "q3", dealId: "open", status: "sent", valueIncVat: 300000, marginExVat: 0.5, createdAt: "2026-05-01T12:00:00.000Z", decidedAt: null, ownerId: "a", ownerName: "Ada Berg", source: "Byggstart", area: "Straume" },
      { id: "q4", dealId: null, status: "draft", valueIncVat: 999999, marginExVat: 0.9, createdAt: "2026-05-02T12:00:00.000Z", decidedAt: null, ownerId: "a", ownerName: "Ada Berg", source: "Byggstart", area: "Straume" },
    ];
    const count = runInsight(deals, [], [], stages, { kind: "quotes", measure: "count", groupBy: "seller", period: "this_year", view: "bar" }, now, quotes);
    expect(count.total).toBe(3);
    const average = runInsight(deals, [], [], stages, { kind: "quotes", measure: "avg", groupBy: "none", period: "this_year", view: "kpi" }, now, quotes);
    expect(average.total).toBe(300000);
    const margin = runInsight(deals, [], [], stages, { kind: "quote_margin", period: "this_year", view: "kpi" }, now, quotes);
    expect(margin.unit).toBe("percent");
    expect(margin.total).toBeCloseTo((40 + 20 + 50) / 3, 1);
    const hit = runInsight(deals, [], [], stages, { kind: "quote_hit", period: "this_year", view: "kpi" }, now, quotes);
    expect(hit.total).toBe(50);
    expect(hit.dealIds).toEqual(["w1", "lost"]);
  });

  it("normaliserer ukjent rapport og utleder område fra postnummer", () => {
    expect(normalizeSpec({ kind: "won" }).groupBy).toBe("month");
    expect(normalizeSpec({}).kind).toBe("won");
    expect(areaFromPostal(null, "Askøy")).toBe("Askøy");
    expect(areaFromPostal("5008", null)).toBe("Bergen");
    expect(areaFromPostal(null, null)).toBe("Ukjent");
  });
});
