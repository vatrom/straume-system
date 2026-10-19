import type { PrismaClient } from "@prisma/client";
import { areaFromPostal } from "@straume/domain";

const id = (n: number, group: string) => `${group}-0000-4000-8000-${String(n).padStart(12, "0")}`;

const USERS = {
  ada: id(1, "00000000"),
  noah: id(2, "00000000"),
  mia: id(3, "00000000"),
  eirik: id(4, "00000000"),
};
const NAMES: Record<string, string> = {
  [USERS.ada]: "Ada Berg",
  [USERS.noah]: "Noah Lien",
  [USERS.mia]: "Mia Solberg",
  [USERS.eirik]: "Eirik Dahl",
};
const PIPE = id(1, "10000000");
const STAGES = [
  { id: id(1, "11000000"), name: "Innkommende henvendelse" },
  { id: id(2, "11000000"), name: "Befaring avtalt" },
  { id: id(3, "11000000"), name: "Tilbud sendt" },
  { id: id(4, "11000000"), name: "Tilbud fulgt opp av oss" },
  { id: id(5, "11000000"), name: "Tilbud fulgt opp av kunde" },
  { id: id(6, "11000000"), name: "Har hatt kundemøte hos oss" },
  { id: id(7, "11000000"), name: "Sluttforhandlinger" },
];
const SOURCES = ["Byggstart", "MittAnbud", "Google", "Anbefalt via venner/bekjente", "Tok direkte kontakt på tlf/mail", "Instagram/Facebook"];
const REASONS = ["Pris (konkurrent)", "Oppstartstidspunkt", "Konkurrent", "Ukjent årsak", "Pris (for dyrt å gjennomføre)"];
const HOMES = ["Enebolig", "Leilighet", "Rekkehus"];
const PLACES = [
  { city: "Straume", postal: "5353", street: "Fiktivveien" },
  { city: "Bergen", postal: "5008", street: "Modellalléen" },
  { city: "Sotra", postal: "5363", street: "Prøvekaia" },
  { city: "Askøy", postal: "5300", street: "Demobakken" },
  { city: "Os", postal: "5200", street: "Eksempelsvingen" },
];
const SELLERS = [USERS.noah, USERS.noah, USERS.ada, USERS.mia, USERS.eirik];

function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const totalTiles = [
  { title: "Vunnet i år", view: "kpi", spec: { kind: "won", measure: "sum", groupBy: "none", segmentBy: "none", period: "this_year", compare: "year", view: "kpi" } },
  { title: "Antall vunnet", view: "kpi", spec: { kind: "won", measure: "count", groupBy: "none", segmentBy: "none", period: "this_year", compare: "year", view: "kpi" } },
  { title: "Snittordre", view: "kpi", spec: { kind: "average", measure: "avg", groupBy: "none", segmentBy: "none", period: "this_year", compare: "year", view: "kpi" } },
  { title: "Salgssyklus", view: "kpi", spec: { kind: "cycle", measure: "avg", groupBy: "none", segmentBy: "none", period: "this_year", compare: "none", view: "kpi" } },
  { title: "Vektet prognose", view: "kpi", spec: { kind: "forecast", measure: "sum", groupBy: "none", segmentBy: "none", period: "this_year", compare: "none", view: "kpi" } },
  { title: "Vunnet per måned", view: "line", spec: { kind: "won", measure: "sum", groupBy: "month", segmentBy: "none", period: "last_12", compare: "none", view: "line" } },
  { title: "Trakt siste 12 måneder", view: "funnel", spec: { kind: "funnel", measure: "count", groupBy: "stage", segmentBy: "none", period: "last_12", compare: "none", pipelineId: PIPE, view: "funnel" } },
  { title: "Kildekanal", view: "donut", spec: { kind: "won", measure: "count", groupBy: "source", segmentBy: "none", period: "this_year", compare: "none", view: "donut" } },
  { title: "Tapsgrunner", view: "bar", spec: { kind: "lost_reasons", measure: "count", groupBy: "lostReason", segmentBy: "none", period: "this_year", compare: "none", view: "bar" } },
  { title: "Startet per område", view: "bar", spec: { kind: "started", measure: "count", groupBy: "area", segmentBy: "none", period: "this_year", compare: "none", view: "bar" } },
];

const sellerTiles = [
  { title: "Vunnet per selger", view: "bar", spec: { kind: "won", measure: "sum", groupBy: "seller", segmentBy: "none", period: "this_year", compare: "year", view: "bar" } },
  { title: "Antall vunnet", view: "bar", spec: { kind: "won", measure: "count", groupBy: "seller", segmentBy: "none", period: "this_year", compare: "none", view: "bar" } },
  { title: "Aktivitet", view: "bar", spec: { kind: "activity", measure: "count", groupBy: "seller", segmentBy: "none", period: "this_year", compare: "none", view: "bar" } },
  { title: "Vunnet per kilde", view: "table", spec: { kind: "won", measure: "sum", groupBy: "seller", segmentBy: "source", period: "this_year", compare: "none", view: "table" } },
];

export async function ensureInsights(prisma: PrismaClient) {
  await prisma.appSetting.upsert({
    where: { key: "insights_sellers_see_peers" },
    update: {},
    create: { key: "insights_sellers_see_peers", value: "0" },
  });
  await prisma.customField.upsert({
    where: { id: "felt-boligtype" },
    update: {},
    create: { id: "felt-boligtype", key: "boligtype", name: "Boligtype", kind: "choice", options: HOMES },
  });

  const bare = await prisma.deal.findMany({ where: { area: null }, include: { person: true } });
  for (const deal of bare) {
    await prisma.deal.update({
      where: { id: deal.id },
      data: { postalCode: deal.person?.postalCode ?? null, area: areaFromPostal(deal.person?.postalCode, deal.person?.city) },
    });
  }
  const withoutHistory = await prisma.deal.findMany({ where: { stageEvents: { none: {} } }, include: { stage: true, owner: true } });
  for (const deal of withoutHistory) {
    await prisma.dealStageEvent.create({
      data: {
        dealId: deal.id,
        toStageId: deal.stageId,
        toStageName: deal.stage.name,
        userId: deal.ownerId,
        userName: deal.owner.name,
        at: deal.createdAt,
      },
    });
  }

  for (let n = 1; n <= 12; n += 1) {
    const place = PLACES[n % PLACES.length]!;
    await prisma.person.upsert({
      where: { id: id(n, "42000000") },
      update: {},
      create: {
        id: id(n, "42000000"),
        firstName: ["Kari", "Ola", "Nora", "Even", "Liv", "Per", "Sigrid", "Tone", "Ivar", "Frida", "Henrik", "Maren"][n - 1]!,
        lastName: "Fiktivsen",
        email: `innsikt.${n}@example.com`,
        phone: `410000${String(n).padStart(2, "0")}`,
        street: place.street,
        houseNumber: String(n),
        postalCode: place.postal,
        city: place.city,
        country: "Norge",
        label: "Kunde",
        ownerId: SELLERS[n % SELLERS.length],
      },
    });
  }

  for (let n = 1; n <= 108; n += 1) {
    const dealId = id(n, "51000000");
    const exists = await prisma.deal.findUnique({ where: { id: dealId }, select: { id: true } });
    if (exists) continue;
    const random = rng(9000 + n);
    const absolute = 2024 * 12 + 10 + ((n - 1) % 24);
    const year = Math.floor(absolute / 12);
    const month = absolute % 12;
    const created = new Date(Date.UTC(year, month, 1 + Math.floor(random() * 26), 10, 0, 0));
    const sellerId = SELLERS[n % SELLERS.length]!;
    const place = PLACES[n % PLACES.length]!;
    const value = 280000 + Math.floor(random() * 46) * 10000;
    const recent = created.getTime() >= Date.UTC(2026, 5, 1);
    const roll = random();
    const status = recent && roll < 0.42 ? "open" : roll < 0.74 ? "won" : "lost";
    const depth = status === "open" ? 1 + Math.floor(random() * 4) : STAGES.length - 1;
    const stage = STAGES[Math.min(depth, STAGES.length - 1)]!;
    const closed = new Date(created.getTime() + (12 + Math.floor(random() * 45)) * 86400000);
    await prisma.deal.create({
      data: {
        id: dealId,
        title: `Fiktivbad ${n}`,
        valueNok: value,
        ownerId: sellerId,
        personId: id((n % 12) + 1, "42000000"),
        pipelineId: PIPE,
        stageId: stage.id,
        status,
        sourceChannel: SOURCES[n % SOURCES.length],
        postalCode: place.postal,
        area: place.city,
        stageEnteredAt: created,
        createdAt: created,
        wonAt: status === "won" ? closed : null,
        lostAt: status === "lost" ? closed : null,
        lostReason: status === "lost" ? REASONS[n % REASONS.length] : null,
        lostComment: status === "lost" && n % 3 === 0 ? "Fiktiv kommentar: kunden utsatte badet." : null,
      },
    });
    let at = created.getTime();
    for (let step = 0; step <= Math.min(depth, STAGES.length - 1); step += 1) {
      const from = step === 0 ? null : STAGES[step - 1]!;
      const to = STAGES[step]!;
      await prisma.dealStageEvent.create({
        data: {
          id: id(n * 20 + step, "52000000"),
          dealId,
          fromStageId: from?.id ?? null,
          fromStageName: from?.name ?? null,
          toStageId: to.id,
          toStageName: to.name,
          userId: sellerId,
          userName: NAMES[sellerId] ?? "Selger",
          at: new Date(at),
        },
      });
      at += (3 + Math.floor(random() * 6)) * 86400000;
    }
    if (n % 4 === 0) {
      await prisma.dealValueEvent.create({
        data: {
          id: id(n, "53000000"),
          dealId,
          fromValue: Math.max(0, value - 25000),
          toValue: value,
          userId: sellerId,
          userName: NAMES[sellerId] ?? "Selger",
          at: new Date(created.getTime() + 2 * 86400000),
        },
      });
    }
    await prisma.dealFieldValue.create({ data: { dealId, fieldId: "felt-boligtype", value: HOMES[n % HOMES.length]! } });
    await prisma.activity.create({
      data: {
        id: id(n, "54100000"),
        dealId,
        type: n % 2 === 0 ? "call" : "meeting",
        subject: "Oppfølging av fiktivt bad",
        ownerId: sellerId,
        dueAt: new Date(created.getTime() + 4 * 86400000),
        done: status !== "open",
        internal: true,
      },
    });
  }

  const horizon = new Date();
  const late = await prisma.deal.findMany({
    where: { title: { startsWith: "Fiktivbad " }, OR: [{ wonAt: { gt: horizon } }, { lostAt: { gt: horizon } }] },
    select: { id: true, wonAt: true, lostAt: true },
  });
  for (const deal of late) {
    await prisma.deal.update({
      where: { id: deal.id },
      data: {
        wonAt: deal.wonAt && deal.wonAt > horizon ? horizon : deal.wonAt,
        lostAt: deal.lostAt && deal.lostAt > horizon ? horizon : deal.lostAt,
      },
    });
  }
  await prisma.dealStageEvent.updateMany({
    where: { at: { gt: horizon }, deal: { title: { startsWith: "Fiktivbad " } } },
    data: { at: horizon },
  });
  await prisma.activity.updateMany({
    where: { dueAt: { gt: horizon }, subject: "Oppfølging av fiktivt bad" },
    data: { dueAt: horizon },
  });

  const goals = [
    { id: id(1, "54000000"), ownerId: null, metric: "sum", target: 12000000 },
    { id: id(2, "54000000"), ownerId: USERS.noah, metric: "sum", target: 4500000 },
    { id: id(3, "54000000"), ownerId: USERS.ada, metric: "sum", target: 3500000 },
    { id: id(4, "54000000"), ownerId: USERS.mia, metric: "count", target: 12 },
    { id: id(5, "54000000"), ownerId: USERS.eirik, metric: "sum", target: 2000000 },
  ];
  for (const goal of goals) {
    await prisma.salesGoal.upsert({
      where: { id: goal.id },
      update: {},
      create: { ...goal, periodStart: new Date("2026-01-01T00:00:00.000Z"), periodEnd: new Date("2026-12-31T00:00:00.000Z") },
    });
  }

  const reportId = id(1, "55000000");
  await prisma.savedReport.upsert({
    where: { id: reportId },
    update: {},
    create: {
      id: reportId,
      name: "Vunnet per måned",
      ownerId: USERS.ada,
      shared: true,
      spec: totalTiles[5]!.spec,
    },
  });

  await upsertDashboard(prisma, id(1, "56000000"), "salg-totalt", "Salg totalt", totalTiles, "56100000");
  await upsertDashboard(prisma, id(2, "56000000"), "per-selger", "Per selger", sellerTiles, "56200000");
}

async function upsertDashboard(
  prisma: PrismaClient,
  dashboardId: string,
  slug: string,
  name: string,
  tiles: { title: string; view: string; spec: object }[],
  group: string,
) {
  await prisma.insightDashboard.upsert({
    where: { id: dashboardId },
    update: {},
    create: { id: dashboardId, name, slug, ownerId: USERS.ada, shared: true },
  });
  for (let index = 0; index < tiles.length; index += 1) {
    const tile = tiles[index]!;
    await prisma.dashboardTile.upsert({
      where: { id: id(index + 1, group) },
      update: {},
      create: { id: id(index + 1, group), dashboardId, title: tile.title, view: tile.view, spec: tile.spec, sortOrder: index },
    });
  }
}
