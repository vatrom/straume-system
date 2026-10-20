import { prisma } from "@straume/db";
import {
  DomainError,
  measureGoal,
  normalizeSpec,
  runInsight,
  type GoalInput,
  type InsightActivity,
  type InsightDeal,
  type InsightQuote,
  type InsightResult,
  type InsightSpec,
  type StageMove,
} from "@straume/domain";
import { dec, isoDate } from "./dates";
import { assertAdmin } from "./roles";

type Actor = { id: string; role: string };

const PEERS = "insights_sellers_see_peers";

export async function sellersSeePeers() {
  const row = await prisma.appSetting.findUnique({ where: { key: PEERS } });
  return row?.value === "1";
}

export function canSeeAllInsights(user: { role: string }, peers: boolean) {
  if (user.role === "selger") return peers;
  return true;
}

type Bundle = {
  seeAll: boolean;
  deals: InsightDeal[];
  moves: StageMove[];
  activities: InsightActivity[];
  stages: { pipelineId: string; name: string; sortOrder: number }[];
};

async function loadBundle(user: Actor): Promise<Bundle> {
  const seeAll = canSeeAllInsights(user, await sellersSeePeers());
  const deals = await prisma.deal.findMany({
    where: seeAll ? {} : { ownerId: user.id },
    include: { owner: true, pipeline: true, stage: true, fieldValues: { include: { field: true } } },
  });
  const ids = deals.map((deal) => deal.id);
  const [events, activities, stages] = await Promise.all([
    prisma.dealStageEvent.findMany({ where: ids.length ? { dealId: { in: ids } } : { id: "none" } }),
    prisma.activity.findMany({
      where: seeAll ? {} : { ownerId: user.id },
      include: { owner: true },
    }),
    prisma.stage.findMany({ select: { pipelineId: true, name: true, sortOrder: true } }),
  ]);
  return {
    seeAll,
    deals: deals.map((deal) => {
      const custom: Record<string, string> = {};
      for (const value of deal.fieldValues) custom[value.field.key] = value.value;
      return {
        id: deal.id,
        title: deal.title,
        value: dec(deal.valueNok) ?? 0,
        ownerId: deal.ownerId,
        ownerName: deal.owner.name,
        pipelineId: deal.pipelineId,
        pipelineName: deal.pipeline.name,
        stageId: deal.stageId,
        stageName: deal.stage.name,
        stageOrder: deal.stage.sortOrder,
        status: deal.status,
        source: deal.sourceChannel ?? "",
        lostReason: deal.lostReason ?? "",
        area: deal.area || "Ukjent",
        postalCode: deal.postalCode ?? "",
        probability: deal.probabilityOverride ?? deal.stage.probability,
        createdAt: deal.createdAt.toISOString(),
        wonAt: deal.wonAt?.toISOString() ?? null,
        lostAt: deal.lostAt?.toISOString() ?? null,
        custom,
      };
    }),
    moves: events.map((event) => ({
      dealId: event.dealId,
      fromStageName: event.fromStageName,
      toStageName: event.toStageName,
      toStageOrder: 0,
      at: event.at.toISOString(),
      userId: event.userId,
      userName: event.userName,
    })),
    activities: activities.map((activity) => ({
      id: activity.id,
      dealId: activity.dealId,
      ownerId: activity.ownerId,
      ownerName: activity.owner.name,
      type: activity.type,
      at: (activity.dueAt ?? activity.createdAt).toISOString(),
    })),
    stages,
  };
}

async function loadInsightQuotes(user: Actor, seeAll: boolean): Promise<InsightQuote[]> {
  const quotes = await prisma.quote.findMany({
    where: seeAll ? {} : { createdById: user.id },
    include: { deal: { include: { owner: true } }, project: { include: { seller: true } } },
  });
  return quotes.map((quote) => {
    const owner = quote.deal?.owner ?? quote.project?.seller;
    const status = quote.status;
    const flow = ["draft", "pending_approval", "approved", "sent", "accepted", "rejected"].includes(status)
      ? (status as InsightQuote["status"])
      : "draft";
    return {
      id: quote.id,
      dealId: quote.dealId,
      status: flow,
      valueIncVat: dec(quote.totalIncVat) ?? 0,
      marginExVat: dec(quote.marginExVat) ?? 0,
      createdAt: quote.createdAt.toISOString(),
      decidedAt: quote.decidedAt?.toISOString() ?? null,
      ownerId: owner?.id ?? quote.createdById ?? "",
      ownerName: owner?.name ?? "",
      source: quote.deal?.sourceChannel ?? "",
      area: quote.deal?.area || quote.project?.city || "",
      hoursByTrade: (quote.hoursByTrade ?? {}) as Record<string, number>,
    };
  });
}

export async function queryInsights(user: Actor, specInput: Partial<InsightSpec>, bundle?: Bundle): Promise<InsightResult> {
  const data = bundle ?? (await loadBundle(user));
  const spec = normalizeSpec(specInput);
  if (!data.seeAll) spec.sellerId = user.id;
  const quotes = await loadInsightQuotes(user, data.seeAll);
  return runInsight(data.deals, data.moves, data.activities, data.stages, spec, new Date(), quotes);
}

export async function insightMeta(user: Actor) {
  const bundle = await loadBundle(user);
  const [sellers, pipelines, fields, reports] = await Promise.all([
    bundle.seeAll
      ? prisma.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } })
      : prisma.user.findMany({ where: { id: user.id }, select: { id: true, name: true } }),
    prisma.pipeline.findMany({ include: { stages: { orderBy: { sortOrder: "asc" } } }, orderBy: { sortOrder: "asc" } }),
    prisma.customField.findMany({ orderBy: { name: "asc" } }),
    prisma.savedReport.findMany({
      where: user.role === "admin" ? {} : { OR: [{ ownerId: user.id }, { shared: true }] },
      orderBy: { updatedAt: "desc" },
      include: { owner: { select: { name: true } } },
    }),
  ]);
  return {
    seeAll: bundle.seeAll,
    peers: await sellersSeePeers(),
    sellers,
    pipelines: pipelines.map((pipeline) => ({ id: pipeline.id, name: pipeline.name, stages: pipeline.stages.map((stage) => ({ id: stage.id, name: stage.name })) })),
    sources: [...new Set(bundle.deals.map((deal) => deal.source).filter(Boolean))].sort((a, b) => a.localeCompare(b, "nb")),
    areas: [...new Set(bundle.deals.map((deal) => deal.area).filter(Boolean))].sort((a, b) => a.localeCompare(b, "nb")),
    fields: fields.map((field) => ({ key: field.key, name: field.name, options: Array.isArray(field.options) ? field.options.filter((item): item is string => typeof item === "string") : [] })),
    reports: reports.map((report) => ({
      id: report.id,
      name: report.name,
      shared: report.shared,
      ownerName: report.owner.name,
      spec: normalizeSpec(report.spec as Partial<InsightSpec>),
    })),
  };
}

export async function dashboardView(user: Actor, slug: string) {
  const dashboard = await prisma.insightDashboard.findUnique({
    where: { slug },
    include: { tiles: { orderBy: { sortOrder: "asc" } } },
  });
  if (!dashboard) return null;
  if (!dashboard.shared && dashboard.ownerId !== user.id && user.role !== "admin") throw new DomainError("Ingen tilgang til dashbordet");
  const bundle = await loadBundle(user);
  const tiles = [];
  for (const tile of dashboard.tiles) {
    const spec = normalizeSpec(tile.spec as Partial<InsightSpec>);
    tiles.push({ id: tile.id, title: tile.title, view: tile.view || spec.view, spec, result: await queryInsights(user, spec, bundle) });
  }
  return { name: dashboard.name, slug: dashboard.slug, tiles, goals: await goalBoard(user, bundle) };
}

export async function drilldown(user: Actor, specInput: Partial<InsightSpec>, bucket: string) {
  const result = await queryInsights(user, specInput);
  const ids = bucket === "__all" ? result.dealIds : result.buckets.find((item) => item.key === bucket)?.dealIds ?? result.buckets.flatMap((item) => item.segments?.find((segment) => segment.key === bucket)?.dealIds ?? []);
  const unique = [...new Set(ids)];
  const deals = unique.length
    ? await prisma.deal.findMany({
        where: { id: { in: unique } },
        include: { owner: true, stage: true, pipeline: true },
        orderBy: { updatedAt: "desc" },
      })
    : [];
  return {
    title: result.title,
    bucket: bucket === "__all" ? "Alle" : result.buckets.find((item) => item.key === bucket)?.label ?? bucket,
    deals: deals.map((deal) => ({
      id: deal.id,
      title: deal.title,
      status: deal.status,
      value: dec(deal.valueNok) ?? 0,
      ownerName: deal.owner.name,
      stageName: deal.stage.name,
      pipelineName: deal.pipeline.name,
      source: deal.sourceChannel,
      area: deal.area,
      lostReason: deal.lostReason,
      wonAt: isoDate(deal.wonAt),
      lostAt: isoDate(deal.lostAt),
      createdAt: isoDate(deal.createdAt),
    })),
  };
}

export async function saveReport(user: Actor, input: { name?: string; shared?: boolean; spec?: Partial<InsightSpec> }) {
  const name = input.name?.trim();
  if (!name) throw new DomainError("Rapporten må ha et navn");
  return prisma.savedReport.create({
    data: { name, shared: Boolean(input.shared), ownerId: user.id, spec: normalizeSpec(input.spec) },
  });
}

export async function deleteReport(user: Actor, id: string) {
  const report = await prisma.savedReport.findUnique({ where: { id } });
  if (!report) throw new DomainError("Fant ikke rapporten");
  if (report.ownerId !== user.id && user.role !== "admin") throw new DomainError("Bare eier eller administrator kan slette rapporten");
  await prisma.savedReport.delete({ where: { id } });
}

export async function goalBoard(user: Actor, bundle?: Bundle) {
  const data = bundle ?? (await loadBundle(user));
  const goals = await prisma.salesGoal.findMany({ include: { owner: true }, orderBy: [{ periodStart: "desc" }] });
  const visible = goals.filter((goal) => data.seeAll || goal.ownerId === user.id);
  return visible.map((goal) => {
    const metric: GoalInput["metric"] = goal.metric === "count" ? "count" : "sum";
    const progress = measureGoal(data.deals, {
      ownerId: goal.ownerId,
      start: isoDate(goal.periodStart) ?? "2026-01-01",
      end: isoDate(goal.periodEnd) ?? "2026-12-31",
      metric,
      target: dec(goal.target) ?? 0,
    });
    return {
      id: goal.id,
      ownerId: goal.ownerId,
      ownerName: goal.owner?.name ?? "Hele selskapet",
      metric,
      periodStart: isoDate(goal.periodStart),
      periodEnd: isoDate(goal.periodEnd),
      ...progress,
    };
  });
}

export async function saveGoal(
  user: Actor,
  input: { ownerId?: string | null; periodStart?: string; periodEnd?: string; metric?: string; target?: number },
) {
  assertAdmin(user);
  if (!input.periodStart || !input.periodEnd) throw new DomainError("Målet må ha en periode");
  const target = Number(input.target);
  if (!Number.isFinite(target) || target <= 0) throw new DomainError("Målet må være et tall over null");
  return prisma.salesGoal.create({
    data: {
      id: crypto.randomUUID(),
      ownerId: input.ownerId || null,
      periodStart: new Date(`${input.periodStart}T00:00:00.000Z`),
      periodEnd: new Date(`${input.periodEnd}T00:00:00.000Z`),
      metric: input.metric === "count" ? "count" : "sum",
      target,
    },
  });
}

export async function deleteGoal(user: Actor, id: string) {
  assertAdmin(user);
  await prisma.salesGoal.delete({ where: { id } });
}

export async function setPeerVisibility(user: Actor, input: { enabled?: boolean }) {
  assertAdmin(user);
  await prisma.appSetting.upsert({
    where: { key: PEERS },
    update: { value: input.enabled ? "1" : "0" },
    create: { key: PEERS, value: input.enabled ? "1" : "0" },
  });
  return { enabled: Boolean(input.enabled) };
}

export async function exportInsights(user: Actor, specInput: Partial<InsightSpec>) {
  const result = await queryInsights(user, specInput);
  const rows = await drilldown(user, specInput, "__all");
  const header = ["Tittel", "Status", "Selger", "Pipeline", "Fase", "Verdi", "Kilde", "Område", "Tapsgrunn", "Opprettet", "Vunnet", "Tapt"];
  const body = rows.deals.map((deal) => [
    deal.title,
    deal.status,
    deal.ownerName,
    deal.pipelineName,
    deal.stageName,
    String(deal.value),
    deal.source ?? "",
    deal.area ?? "",
    deal.lostReason ?? "",
    deal.createdAt ?? "",
    deal.wonAt ?? "",
    deal.lostAt ?? "",
  ]);
  return { title: result.title, header, body };
}

export function toCsv(header: string[], body: string[][]) {
  const lines = [header, ...body].map((row) => row.map(csvCell).join(";"));
  return `\uFEFF${lines.join("\n")}`;
}

export function toExcelXml(header: string[], body: string[][]) {
  const rows = [header, ...body]
    .map(
      (row) =>
        `<Row>${row
          .map((cell) => {
            const numeric = cell !== "" && /^-?\d+(\.\d+)?$/.test(cell);
            return `<Cell><Data ss:Type="${numeric ? "Number" : "String"}">${escapeXml(cell)}</Data></Cell>`;
          })
          .join("")}</Row>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Innsikt"><Table>${rows}</Table></Worksheet>
</Workbook>`;
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
