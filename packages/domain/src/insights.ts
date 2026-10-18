export type DealStatus = "open" | "won" | "lost";

export type InsightDeal = {
  id: string;
  title: string;
  value: number;
  ownerId: string;
  ownerName: string;
  pipelineId: string;
  pipelineName: string;
  stageId: string;
  stageName: string;
  stageOrder: number;
  status: DealStatus;
  source: string;
  lostReason: string;
  area: string;
  postalCode: string;
  probability: number;
  createdAt: string;
  wonAt: string | null;
  lostAt: string | null;
  custom: Record<string, string>;
};

export type StageMove = {
  dealId: string;
  fromStageName: string | null;
  toStageName: string;
  toStageOrder: number;
  at: string;
  userId: string | null;
  userName: string;
};

export type InsightActivity = {
  id: string;
  dealId: string | null;
  ownerId: string;
  ownerName: string;
  type: string;
  at: string;
};

export type StageCatalogItem = { pipelineId: string; name: string; sortOrder: number };

type AggCell = { label: string; values: number[]; ids: string[] };
type AggRow = AggCell & { segments: Map<string, AggCell> };

function emptyRow(label: string): AggRow {
  return { label, values: [], ids: [], segments: new Map() };
}

function emptyCell(label: string): AggCell {
  return { label, values: [], ids: [] };
}

export type ReportKind =
  | "won"
  | "lost"
  | "started"
  | "funnel"
  | "movement"
  | "forecast"
  | "average"
  | "cycle"
  | "lost_reasons"
  | "activity"
  | "quotes"
  | "quote_margin"
  | "quote_hit"
  | "planned_hours";

export type InsightQuote = {
  id: string;
  dealId: string | null;
  status: "draft" | "pending_approval" | "approved" | "sent" | "accepted" | "rejected";
  valueIncVat: number;
  marginExVat: number;
  createdAt: string;
  decidedAt: string | null;
  ownerId: string;
  ownerName: string;
  source: string;
  area: string;
  hoursByTrade?: Record<string, number>;
};

export type Measure = "sum" | "count" | "avg";
export type GroupBy = "none" | "seller" | "pipeline" | "stage" | "source" | "lostReason" | "area" | "month" | "quarter" | "year";
export type PeriodPreset = "this_month" | "last_month" | "this_quarter" | "this_year" | "last_year" | "last_12" | "custom";
export type ChartView = "bar" | "line" | "donut" | "funnel" | "table" | "kpi";
export type InsightUnit = "nok" | "count" | "days" | "percent";

export type InsightSpec = {
  kind: ReportKind;
  measure: Measure;
  groupBy: GroupBy;
  segmentBy: GroupBy;
  period: PeriodPreset;
  from?: string | null;
  to?: string | null;
  compare: "none" | "previous" | "year";
  sellerId?: string | null;
  pipelineId?: string | null;
  stageId?: string | null;
  status?: DealStatus | "" | null;
  source?: string | null;
  valueMin?: number | null;
  valueMax?: number | null;
  area?: string | null;
  customKey?: string | null;
  customValue?: string | null;
  view: ChartView;
};

export type InsightBucket = {
  key: string;
  label: string;
  value: number;
  dealIds: string[];
  rate?: number;
  segments?: { key: string; label: string; value: number; dealIds: string[] }[];
};

export type InsightResult = {
  title: string;
  unit: InsightUnit;
  total: number;
  compareTotal: number | null;
  delta: number | null;
  dealIds: string[];
  buckets: InsightBucket[];
  compareBuckets: InsightBucket[] | null;
};

export type GoalInput = {
  ownerId: string | null;
  start: string;
  end: string;
  metric: "sum" | "count";
  target: number;
};

const KINDS: ReportKind[] = ["won", "lost", "started", "funnel", "movement", "forecast", "average", "cycle", "lost_reasons", "activity", "quotes", "quote_margin", "quote_hit", "planned_hours"];
const MEASURES: Measure[] = ["sum", "count", "avg"];
const GROUPS: GroupBy[] = ["none", "seller", "pipeline", "stage", "source", "lostReason", "area", "month", "quarter", "year"];
const PERIODS: PeriodPreset[] = ["this_month", "last_month", "this_quarter", "this_year", "last_year", "last_12", "custom"];
const VIEWS: ChartView[] = ["bar", "line", "donut", "funnel", "table", "kpi"];

export function areaFromPostal(postalCode: string | null | undefined, city: string | null | undefined): string {
  if (city?.trim()) return city.trim();
  if (!postalCode) return "Ukjent";
  const code = Number(postalCode);
  if (!Number.isFinite(code)) return "Ukjent";
  if (code >= 5000 && code < 5100) return "Bergen";
  if (code >= 5200 && code < 5300) return "Os";
  if (code >= 5300 && code < 5400) return "Øygarden";
  return "Annet";
}

export function normalizeSpec(input: Partial<InsightSpec> | null | undefined): InsightSpec {
  const raw = input ?? {};
  const kind = KINDS.includes(raw.kind as ReportKind) ? (raw.kind as ReportKind) : "won";
  const measure = MEASURES.includes(raw.measure as Measure) ? (raw.measure as Measure) : defaultMeasure(kind);
  const groupBy = GROUPS.includes(raw.groupBy as GroupBy) ? (raw.groupBy as GroupBy) : defaultGroup(kind);
  const segmentBy = GROUPS.includes(raw.segmentBy as GroupBy) ? (raw.segmentBy as GroupBy) : "none";
  return {
    kind,
    measure,
    groupBy: kind === "funnel" ? "stage" : groupBy,
    segmentBy: segmentBy === groupBy ? "none" : segmentBy,
    period: PERIODS.includes(raw.period as PeriodPreset) ? (raw.period as PeriodPreset) : "this_year",
    from: raw.from ?? null,
    to: raw.to ?? null,
    compare: raw.compare === "previous" || raw.compare === "year" ? raw.compare : "none",
    sellerId: raw.sellerId || null,
    pipelineId: raw.pipelineId || null,
    stageId: raw.stageId || null,
    status: raw.status === "open" || raw.status === "won" || raw.status === "lost" ? raw.status : null,
    source: raw.source || null,
    valueMin: numberOrNull(raw.valueMin),
    valueMax: numberOrNull(raw.valueMax),
    area: raw.area || null,
    customKey: raw.customKey || null,
    customValue: raw.customValue || null,
    view: VIEWS.includes(raw.view as ChartView) ? (raw.view as ChartView) : defaultView(kind),
  };
}

function defaultMeasure(kind: ReportKind): Measure {
  if (kind === "average" || kind === "cycle" || kind === "quote_margin") return "avg";
  if (kind === "planned_hours") return "sum";
  if (kind === "forecast") return "sum";
  if (kind === "activity" || kind === "movement" || kind === "funnel" || kind === "lost_reasons" || kind === "quotes" || kind === "quote_hit") return "count";
  return "sum";
}

function defaultGroup(kind: ReportKind): GroupBy {
  if (kind === "funnel" || kind === "movement") return "stage";
  if (kind === "lost_reasons") return "lostReason";
  if (kind === "activity") return "seller";
  return "month";
}

function defaultView(kind: ReportKind): ChartView {
  if (kind === "funnel") return "funnel";
  if (kind === "cycle" || kind === "average" || kind === "forecast" || kind === "quote_margin" || kind === "quote_hit") return "kpi";
  return "bar";
}

function numberOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function periodBounds(spec: Pick<InsightSpec, "period" | "from" | "to">, now: Date): { start: Date; end: Date } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const dayEnd = new Date(Date.UTC(y, m, now.getUTCDate() + 1));
  if (spec.period === "custom") {
    const start = spec.from ? new Date(`${spec.from}T00:00:00.000Z`) : new Date(Date.UTC(y, 0, 1));
    const end = spec.to ? new Date(`${spec.to}T00:00:00.000Z`) : dayEnd;
    const inclusiveEnd = new Date(end.getTime() + 24 * 60 * 60 * 1000);
    return { start, end: inclusiveEnd };
  }
  if (spec.period === "this_month") return { start: new Date(Date.UTC(y, m, 1)), end: dayEnd };
  if (spec.period === "last_month") return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
  if (spec.period === "this_quarter") {
    const q = Math.floor(m / 3) * 3;
    return { start: new Date(Date.UTC(y, q, 1)), end: dayEnd };
  }
  if (spec.period === "this_year") return { start: new Date(Date.UTC(y, 0, 1)), end: dayEnd };
  if (spec.period === "last_year") return { start: new Date(Date.UTC(y - 1, 0, 1)), end: new Date(Date.UTC(y, 0, 1)) };
  const start = new Date(Date.UTC(y, m - 11, 1));
  return { start, end: dayEnd };
}

export function shiftBounds(bounds: { start: Date; end: Date }, compare: InsightSpec["compare"]): { start: Date; end: Date } | null {
  if (compare === "none") return null;
  if (compare === "year") {
    return {
      start: new Date(Date.UTC(bounds.start.getUTCFullYear() - 1, bounds.start.getUTCMonth(), bounds.start.getUTCDate())),
      end: new Date(Date.UTC(bounds.end.getUTCFullYear() - 1, bounds.end.getUTCMonth(), bounds.end.getUTCDate())),
    };
  }
  const length = bounds.end.getTime() - bounds.start.getTime();
  return { start: new Date(bounds.start.getTime() - length), end: new Date(bounds.start.getTime()) };
}

function inBounds(iso: string | null | undefined, bounds: { start: Date; end: Date }): boolean {
  if (!iso) return false;
  const time = new Date(iso).getTime();
  return time >= bounds.start.getTime() && time < bounds.end.getTime();
}

function matches(deal: InsightDeal, spec: InsightSpec): boolean {
  if (spec.sellerId && deal.ownerId !== spec.sellerId) return false;
  if (spec.pipelineId && deal.pipelineId !== spec.pipelineId) return false;
  if (spec.stageId && deal.stageId !== spec.stageId) return false;
  if (spec.status && deal.status !== spec.status) return false;
  if (spec.source && deal.source !== spec.source) return false;
  if (spec.area && deal.area !== spec.area) return false;
  if (spec.valueMin != null && deal.value < spec.valueMin) return false;
  if (spec.valueMax != null && deal.value > spec.valueMax) return false;
  if (spec.customKey && (deal.custom[spec.customKey] ?? "") !== (spec.customValue ?? "")) return false;
  return true;
}

function kindDate(deal: InsightDeal, kind: ReportKind): string | null {
  if (kind === "won" || kind === "average" || kind === "cycle") return deal.wonAt;
  if (kind === "lost" || kind === "lost_reasons") return deal.lostAt;
  if (kind === "forecast") return deal.status === "open" ? deal.createdAt : null;
  return deal.createdAt;
}

function bucketOf(deal: InsightDeal, groupBy: GroupBy, when: string | null): { key: string; label: string } {
  if (groupBy === "none") return { key: "total", label: "Totalt" };
  if (groupBy === "seller") return { key: deal.ownerId, label: deal.ownerName };
  if (groupBy === "pipeline") return { key: deal.pipelineId, label: deal.pipelineName };
  if (groupBy === "stage") return { key: deal.stageName, label: deal.stageName };
  if (groupBy === "source") return { key: deal.source || "Ukjent", label: deal.source || "Ukjent" };
  if (groupBy === "lostReason") return { key: deal.lostReason || "Uten grunn", label: deal.lostReason || "Uten grunn" };
  if (groupBy === "area") return { key: deal.area || "Ukjent", label: deal.area || "Ukjent" };
  const date = when ? new Date(when) : null;
  if (!date || Number.isNaN(date.getTime())) return { key: "uten-dato", label: "Uten dato" };
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  if (groupBy === "year") return { key: String(year), label: String(year) };
  if (groupBy === "quarter") {
    const quarter = Math.floor(month / 3) + 1;
    return { key: `${year}-Q${quarter}`, label: `${year} K${quarter}` };
  }
  const label = new Date(Date.UTC(year, month, 1)).toLocaleDateString("nb-NO", { month: "short", year: "numeric", timeZone: "UTC" });
  return { key: `${year}-${String(month + 1).padStart(2, "0")}`, label };
}

function aggregate(values: number[], measure: Measure): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((total, value) => total + value, 0);
  if (measure === "count") return values.length;
  if (measure === "avg") return sum / values.length;
  return sum;
}

function amountFor(deal: InsightDeal, kind: ReportKind, measure: Measure): number {
  if (kind === "cycle" && deal.wonAt) {
    const days = (new Date(deal.wonAt).getTime() - new Date(deal.createdAt).getTime()) / 86400000;
    return measure === "count" ? 1 : Math.max(0, days);
  }
  if (kind === "forecast") {
    const weighted = (deal.value * deal.probability) / 100;
    return measure === "count" ? 1 : weighted;
  }
  if (kind === "activity" || kind === "movement" || kind === "funnel") return 1;
  if (measure === "count") return 1;
  return deal.value;
}

const TITLES: Record<ReportKind, string> = {
  won: "Vunne avtaler",
  lost: "Tapte avtaler",
  started: "Startede avtaler",
  funnel: "Trakt",
  movement: "Fasebevegelser",
  forecast: "Vektet prognose",
  average: "Gjennomsnittlig ordreverdi",
  cycle: "Salgssyklus",
  lost_reasons: "Tapsgrunner",
  activity: "Aktivitet per selger",
  quotes: "Tilbud",
  quote_margin: "Margin på tilbud",
  quote_hit: "Hit rate tilbud til vunnet",
  planned_hours: "Planlagte timer",
};

function effectiveMeasure(spec: InsightSpec): Measure {
  if (spec.kind === "average" || spec.kind === "quote_margin") return "avg";
  if (spec.kind === "cycle") return spec.measure === "count" ? "count" : "avg";
  if (spec.kind === "activity" || spec.kind === "movement" || spec.kind === "funnel" || spec.kind === "quote_hit") return "count";
  return spec.measure;
}

function unitFor(kind: ReportKind, measure: Measure): InsightUnit {
  if (kind === "quote_margin" || kind === "quote_hit") return "percent";
  if (kind === "planned_hours") return "count";
  if (kind === "cycle") return measure === "count" ? "count" : "days";
  if (kind === "funnel") return "count";
  if (measure === "count" || kind === "activity" || kind === "movement" || kind === "lost_reasons") return "count";
  return "nok";
}

export function runInsight(
  deals: InsightDeal[],
  moves: StageMove[],
  activities: InsightActivity[],
  stages: StageCatalogItem[],
  specInput: Partial<InsightSpec>,
  now: Date,
  quotes: InsightQuote[] = [],
): InsightResult {
  const spec = normalizeSpec(specInput);
  const bounds = periodBounds(spec, now);
  const compareBounds = spec.kind === "forecast" ? null : shiftBounds(bounds, spec.compare);
  if (spec.kind === "quotes" || spec.kind === "quote_margin" || spec.kind === "quote_hit" || spec.kind === "planned_hours") {
    return quoteReport(quotes, spec, bounds, compareBounds);
  }
  if (spec.kind === "funnel") return funnelReport(deals, moves, stages, spec, bounds, compareBounds);
  if (spec.kind === "movement") return movementReport(deals, moves, spec, bounds, compareBounds);
  if (spec.kind === "activity") return activityReport(deals, activities, spec, bounds, compareBounds);
  const filtered = deals.filter((deal) => matches(deal, spec) && includeDeal(deal, spec.kind, bounds));
  const compared = compareBounds ? deals.filter((deal) => matches(deal, spec) && includeDeal(deal, spec.kind, compareBounds)) : [];
  const current = groupDeals(filtered, spec);
  const previous = compareBounds ? groupDeals(compared, spec) : null;
  return finish(spec, current, previous);
}

function quoteReport(
  quotes: InsightQuote[],
  spec: InsightSpec,
  bounds: { start: Date; end: Date },
  compareBounds: { start: Date; end: Date } | null,
): InsightResult {
  const filtered = (window: { start: Date; end: Date }) =>
    quotes.filter((quote) => quoteMatches(quote, spec) && quoteInWindow(quote, spec.kind, window));
  if (spec.kind === "planned_hours") {
    const collect = (window: { start: Date; end: Date }) => {
      const groups = new Map<string, AggRow>();
      for (const quote of filtered(window)) {
        const entries = Object.entries(quote.hoursByTrade ?? {}).filter(([, hours]) => hours > 0);
        const rows = entries.length ? entries : [["uten-fag", 0] as const];
        for (const [trade, hours] of rows) {
          const row = groups.get(trade) ?? emptyRow(tradeNameFromCode(trade));
          row.values.push(hours);
          const id = quote.dealId || quote.id;
          if (!row.ids.includes(id)) row.ids.push(id);
          groups.set(trade, row);
        }
      }
      return groups;
    };
    return finish({ ...spec, measure: "sum" }, collect(bounds), compareBounds ? collect(compareBounds) : null);
  }
  if (spec.kind === "quote_hit") {
    const current = filtered(bounds);
    const previous = compareBounds ? filtered(compareBounds) : [];
    const rate = (rows: InsightQuote[]) => (rows.length ? round((rows.filter((quote) => quote.status === "accepted").length / rows.length) * 100) : 0);
    const groups = new Map<string, InsightQuote[]>();
    for (const quote of current) {
      const bucket = bucketOf(quoteAsDeal(quote), spec.groupBy, quote.decidedAt ?? quote.createdAt);
      groups.set(bucket.key, [...(groups.get(bucket.key) ?? []), quote]);
    }
    const buckets = [...groups.entries()].map(([key, rows]) => ({
      key,
      label: bucketOf(quoteAsDeal(rows[0]!), spec.groupBy, rows[0]!.decidedAt ?? rows[0]!.createdAt).label,
      value: rate(rows),
      dealIds: rows.map((quote) => quote.dealId || quote.id),
    }));
    sortBuckets(buckets, spec.groupBy);
    return {
      title: TITLES.quote_hit,
      unit: "percent",
      total: rate(current),
      compareTotal: compareBounds ? rate(previous) : null,
      delta: compareBounds && rate(previous) !== 0 ? round(((rate(current) - rate(previous)) / rate(previous)) * 100) : null,
      dealIds: current.map((quote) => quote.dealId || quote.id),
      buckets,
      compareBuckets: null,
    };
  }
  const collect = (window: { start: Date; end: Date }) => {
    const groups = new Map<string, AggRow>();
    for (const quote of filtered(window)) {
      const when = quote.createdAt;
      const standIn = quoteAsDeal(quote);
      const primary = bucketOf(standIn, spec.groupBy, when);
      const row = groups.get(primary.key) ?? emptyRow(primary.label);
      row.values.push(spec.kind === "quote_margin" ? quote.marginExVat * 100 : quote.valueIncVat);
      const id = quote.dealId || quote.id;
      if (!row.ids.includes(id)) row.ids.push(id);
      groups.set(primary.key, row);
    }
    return groups;
  };
  return finish(spec, collect(bounds), compareBounds ? collect(compareBounds) : null);
}

function tradeNameFromCode(code: string): string {
  const names: Record<string, string> = {
    riving: "Riving",
    tomrer: "Tømrer",
    rorlegger: "Rørlegger",
    elektriker: "Elektriker",
    murer: "Murer",
    maler: "Maler",
    annet: "Øvrig",
  };
  return names[code] ?? code;
}

function quoteMatches(quote: InsightQuote, spec: InsightSpec): boolean {
  if (spec.sellerId && quote.ownerId !== spec.sellerId) return false;
  if (spec.source && quote.source !== spec.source) return false;
  if (spec.area && quote.area !== spec.area) return false;
  return true;
}

function quoteInWindow(quote: InsightQuote, kind: ReportKind, bounds: { start: Date; end: Date }): boolean {
  if (kind === "quote_hit") return (quote.status === "accepted" || quote.status === "rejected") && inBounds(quote.decidedAt, bounds);
  if (kind === "planned_hours") return ["approved", "sent", "accepted"].includes(quote.status) && inBounds(quote.createdAt, bounds);
  return quote.status !== "draft" && inBounds(quote.createdAt, bounds);
}

function quoteAsDeal(quote: InsightQuote): InsightDeal {
  return {
    id: quote.dealId || quote.id,
    title: quote.id,
    value: quote.valueIncVat,
    ownerId: quote.ownerId,
    ownerName: quote.ownerName,
    pipelineId: "tilbud",
    pipelineName: "Tilbud",
    stageId: quote.status,
    stageName: quote.status,
    stageOrder: 0,
    status: quote.status === "accepted" ? "won" : quote.status === "rejected" ? "lost" : "open",
    source: quote.source,
    lostReason: "",
    area: quote.area,
    postalCode: "",
    probability: 0,
    createdAt: quote.createdAt,
    wonAt: quote.status === "accepted" ? quote.decidedAt : null,
    lostAt: quote.status === "rejected" ? quote.decidedAt : null,
    custom: {},
  };
}

function includeDeal(deal: InsightDeal, kind: ReportKind, bounds: { start: Date; end: Date }): boolean {
  if (kind === "forecast") return deal.status === "open";
  if (kind === "won" || kind === "average" || kind === "cycle") return deal.status === "won" && inBounds(deal.wonAt, bounds);
  if (kind === "lost" || kind === "lost_reasons") return deal.status === "lost" && inBounds(deal.lostAt, bounds);
  return inBounds(deal.createdAt, bounds);
}

function groupDeals(deals: InsightDeal[], spec: InsightSpec): Map<string, AggRow> {
  const groups = new Map<string, AggRow>();
  for (const deal of deals) {
    const when = kindDate(deal, spec.kind);
    const primary = bucketOf(deal, spec.groupBy, when);
    const row = groups.get(primary.key) ?? emptyRow(primary.label);
    row.values.push(amountFor(deal, spec.kind, spec.measure));
    row.ids.push(deal.id);
    if (spec.segmentBy !== "none") {
      const segment = bucketOf(deal, spec.segmentBy, when);
      const current = row.segments.get(segment.key) ?? emptyCell(segment.label);
      current.values.push(amountFor(deal, spec.kind, spec.measure));
      current.ids.push(deal.id);
      row.segments.set(segment.key, current);
    }
    groups.set(primary.key, row);
  }
  return groups;
}

function finish(
  spec: InsightSpec,
  groups: Map<string, AggRow>,
  compare: Map<string, AggRow> | null,
): InsightResult {
  const usedMeasure = effectiveMeasure(spec);
  const buckets = [...groups.entries()].map(([key, row]) => ({
    key,
    label: row.label,
    value: round(aggregate(row.values, usedMeasure)),
    dealIds: row.ids,
    segments:
      spec.segmentBy === "none"
        ? undefined
        : [...row.segments.entries()].map(([segmentKey, segment]) => ({
            key: segmentKey,
            label: segment.label,
            value: round(aggregate(segment.values, usedMeasure)),
            dealIds: segment.ids,
          })),
  }));
  sortBuckets(buckets, spec.groupBy);
  const shown = usedMeasure === "avg" ? buckets : fillTimeGaps(buckets, spec.groupBy);
  const allValues = [...groups.values()].flatMap((row) => row.values);
  const total = round(aggregate(allValues, usedMeasure));
  const compareBuckets = compare
    ? [...new Set([...groups.keys(), ...compare.keys()])].map((key) => {
        const row = compare.get(key);
        return { key, label: row?.label ?? groups.get(key)?.label ?? key, value: round(aggregate(row?.values ?? [], usedMeasure)), dealIds: row?.ids ?? [] };
      })
    : null;
  if (compareBuckets) sortBuckets(compareBuckets, spec.groupBy);
  const compareTotal = compare ? round(aggregate([...compare.values()].flatMap((row) => row.values), usedMeasure)) : null;
  const dealIds = [...new Set([...groups.values()].flatMap((row) => row.ids))];
  return {
    title: TITLES[spec.kind],
    unit: unitFor(spec.kind, usedMeasure),
    total,
    compareTotal,
    delta: compareTotal == null || compareTotal === 0 ? null : round(((total - compareTotal) / compareTotal) * 100),
    dealIds,
    buckets: shown,
    compareBuckets,
  };
}

function fillTimeGaps(buckets: InsightBucket[], groupBy: GroupBy): InsightBucket[] {
  if (groupBy !== "month" && groupBy !== "quarter" && groupBy !== "year") return buckets;
  const timed = buckets.filter((bucket) => bucket.key !== "uten-dato");
  if (timed.length < 2) return buckets;
  const byKey = new Map(timed.map((bucket) => [bucket.key, bucket]));
  const first = timed[0]?.key;
  const last = timed[timed.length - 1]?.key;
  if (!first || !last) return buckets;
  const filled = keysBetween(first, last, groupBy).map(
    (key) => byKey.get(key) ?? { key, label: labelForTimeKey(key, groupBy), value: 0, dealIds: [] },
  );
  return [...filled, ...buckets.filter((bucket) => bucket.key === "uten-dato")];
}

function keysBetween(first: string, last: string, groupBy: GroupBy): string[] {
  const keys: string[] = [];
  if (groupBy === "year") {
    for (let year = Number(first); year <= Number(last); year += 1) keys.push(String(year));
    return keys;
  }
  if (groupBy === "quarter") {
    let [year, quarter] = first.split("-Q").map(Number) as [number, number];
    const [endYear, endQuarter] = last.split("-Q").map(Number) as [number, number];
    while (year < endYear || (year === endYear && quarter <= endQuarter)) {
      keys.push(`${year}-Q${quarter}`);
      quarter += 1;
      if (quarter > 4) {
        quarter = 1;
        year += 1;
      }
    }
    return keys;
  }
  let [year, month] = first.split("-").map(Number) as [number, number];
  const [endYear, endMonth] = last.split("-").map(Number) as [number, number];
  while (year < endYear || (year === endYear && month <= endMonth)) {
    keys.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return keys;
}

function labelForTimeKey(key: string, groupBy: GroupBy): string {
  if (groupBy === "year") return key;
  if (groupBy === "quarter") {
    const [year, quarter] = key.split("-Q");
    return `${year} K${quarter}`;
  }
  const [year, month] = key.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("nb-NO", { month: "short", year: "numeric", timeZone: "UTC" });
}

function funnelReport(
  deals: InsightDeal[],
  moves: StageMove[],
  stages: StageCatalogItem[],
  spec: InsightSpec,
  bounds: { start: Date; end: Date },
  compareBounds: { start: Date; end: Date } | null,
): InsightResult {
  const cohort = (window: { start: Date; end: Date }) => deals.filter((deal) => matches(deal, spec) && inBounds(deal.createdAt, window));
  const base = cohort(bounds);
  const pipelineId = spec.pipelineId || mostCommon(base.map((deal) => deal.pipelineId));
  const current = pipelineId ? base.filter((deal) => deal.pipelineId === pipelineId) : base;
  const catalog = stages.filter((stage) => !pipelineId || stage.pipelineId === pipelineId).sort((a, b) => a.sortOrder - b.sortOrder);
  const names = catalog.length > 0 ? catalog.map((stage) => stage.name) : uniqueStageNames(current, moves);
  const buckets = names.map((name, index) => {
    const ids = current.filter((deal) => reached(deal, name, index, names, moves, catalog)).map((deal) => deal.id);
    return { key: name, label: name, value: ids.length, dealIds: ids, rate: current.length ? round((ids.length / current.length) * 100) : 0 };
  });
  const previousBase = compareBounds ? cohort(compareBounds) : [];
  const previous = pipelineId ? previousBase.filter((deal) => deal.pipelineId === pipelineId) : previousBase;
  const compareBuckets = compareBounds
    ? names.map((name, index) => {
        const ids = previous.filter((deal) => reached(deal, name, index, names, moves, catalog)).map((deal) => deal.id);
        return { key: name, label: name, value: ids.length, dealIds: ids };
      })
    : null;
  const total = buckets[0]?.value ?? 0;
  const compareTotal = compareBuckets ? compareBuckets[0]?.value ?? 0 : null;
  return {
    title: TITLES.funnel,
    unit: "count",
    total,
    compareTotal,
    delta: compareTotal == null || compareTotal === 0 ? null : round(((total - compareTotal) / compareTotal) * 100),
    dealIds: current.map((deal) => deal.id),
    buckets,
    compareBuckets,
  };
}

function reached(deal: InsightDeal, name: string, index: number, names: string[], moves: StageMove[], catalog: StageCatalogItem[]): boolean {
  const stage = catalog.find((item) => item.name === name);
  const order = stage?.sortOrder ?? index;
  const samePipeline = !stage || stage.pipelineId === deal.pipelineId;
  if (samePipeline && deal.stageOrder >= order) return true;
  const later = new Set(names.slice(index));
  return moves.some((move) => move.dealId === deal.id && (later.has(move.toStageName) || (move.fromStageName != null && later.has(move.fromStageName))));
}

function uniqueStageNames(deals: InsightDeal[], moves: StageMove[]): string[] {
  const names = new Set<string>();
  for (const deal of deals) names.add(deal.stageName);
  for (const move of moves) if (deals.some((deal) => deal.id === move.dealId)) names.add(move.toStageName);
  return [...names];
}

function mostCommon(ids: string[]): string | null {
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function movementReport(
  deals: InsightDeal[],
  moves: StageMove[],
  spec: InsightSpec,
  bounds: { start: Date; end: Date },
  compareBounds: { start: Date; end: Date } | null,
): InsightResult {
  const byId = new Map(deals.filter((deal) => matches(deal, spec)).map((deal) => [deal.id, deal]));
  const collect = (window: { start: Date; end: Date }) => {
    const groups = new Map<string, AggRow>();
    for (const move of moves) {
      const deal = byId.get(move.dealId);
      if (!deal || !inBounds(move.at, window)) continue;
      const actor = { ...deal, ownerId: move.userId || deal.ownerId, ownerName: move.userName || deal.ownerName, stageName: move.toStageName };
      const primary = bucketOf(actor, spec.groupBy === "stage" ? "stage" : spec.groupBy, move.at);
      const row = groups.get(primary.key) ?? emptyRow(primary.label);
      row.values.push(1);
      if (!row.ids.includes(deal.id)) row.ids.push(deal.id);
      groups.set(primary.key, row);
    }
    return groups;
  };
  return finish({ ...spec, measure: "count", kind: "movement" }, collect(bounds), compareBounds ? collect(compareBounds) : null);
}

function activityReport(
  deals: InsightDeal[],
  activities: InsightActivity[],
  spec: InsightSpec,
  bounds: { start: Date; end: Date },
  compareBounds: { start: Date; end: Date } | null,
): InsightResult {
  const byId = new Map(deals.filter((deal) => matches(deal, spec)).map((deal) => [deal.id, deal]));
  const collect = (window: { start: Date; end: Date }) => {
    const groups = new Map<string, AggRow>();
    for (const activity of activities) {
      if (!inBounds(activity.at, window)) continue;
      if (spec.sellerId && activity.ownerId !== spec.sellerId) continue;
      const deal = activity.dealId ? byId.get(activity.dealId) : undefined;
      if (activity.dealId && !deal) continue;
      const standIn: InsightDeal = deal ?? {
        id: activity.id,
        title: activity.type,
        value: 0,
        ownerId: activity.ownerId,
        ownerName: activity.ownerName,
        pipelineId: "",
        pipelineName: "",
        stageId: "",
        stageName: "",
        stageOrder: 0,
        status: "open",
        source: "",
        lostReason: "",
        area: "",
        postalCode: "",
        probability: 0,
        createdAt: activity.at,
        wonAt: null,
        lostAt: null,
        custom: {},
      };
      const primary = bucketOf({ ...standIn, ownerId: activity.ownerId, ownerName: activity.ownerName }, spec.groupBy, activity.at);
      const row = groups.get(primary.key) ?? emptyRow(primary.label);
      row.values.push(1);
      if (deal && !row.ids.includes(deal.id)) row.ids.push(deal.id);
      groups.set(primary.key, row);
    }
    return groups;
  };
  return finish({ ...spec, measure: "count", kind: "activity" }, collect(bounds), compareBounds ? collect(compareBounds) : null);
}

function sortBuckets(buckets: InsightBucket[], groupBy: GroupBy) {
  const timed = groupBy === "month" || groupBy === "quarter" || groupBy === "year";
  buckets.sort((a, b) => (timed || groupBy === "stage" ? a.key.localeCompare(b.key, "nb") : b.value - a.value));
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

export function measureGoal(deals: InsightDeal[], goal: GoalInput): { actual: number; target: number; ratio: number; dealIds: string[] } {
  const end = new Date(`${goal.end}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  const hits = deals.filter(
    (deal) =>
      deal.status === "won" &&
      !!deal.wonAt &&
      new Date(deal.wonAt).getTime() >= new Date(`${goal.start}T00:00:00.000Z`).getTime() &&
      new Date(deal.wonAt).getTime() < end.getTime() &&
      (!goal.ownerId || deal.ownerId === goal.ownerId),
  );
  const actual = goal.metric === "count" ? hits.length : hits.reduce((sum, deal) => sum + deal.value, 0);
  return { actual, target: goal.target, ratio: goal.target ? actual / goal.target : 0, dealIds: hits.map((deal) => deal.id) };
}
