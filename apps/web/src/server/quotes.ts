import { prisma, type QuoteStatus } from "@straume/db";
import {
  applyDraft,
  asItemConfig,
  assertQuoteTransition,
  calculateQuote,
  canEditQuote,
  channelFromSource,
  contextFromSketch,
  DomainError,
  lookupLine,
  nextRevision,
  parseApproverRoles,
  priceLineToCalc,
  QUOTE_STATUS_LABEL,
  roleCanApprove,
  AI_SUGGESTION_HEADING,
  sanitizeCustomerText,
  TRADES,
  type CalcLine,
  type ChannelCode,
  type DraftRequest,
  type QuoteFlowStatus,
  type Sketch,
} from "@straume/domain";
import { completeDraft } from "./ai";
import { audit } from "./audit";
import { dec } from "./dates";
import { mailProvider } from "./mail";
import { loadList } from "./price-admin";
import { pagesPdf } from "./sketch-files";
import { publishedTextBlocks, quoteTerms } from "./text-blocks";

type Actor = { id: string; role: string; name?: string };

const FLOW = new Set<string>(["draft", "pending_approval", "approved", "sent", "accepted", "rejected"]);

function asFlow(status: QuoteStatus): QuoteFlowStatus {
  if (!FLOW.has(status)) throw new DomainError("Tilbudet har en status som ikke kan brukes i flyten");
  return status as QuoteFlowStatus;
}

function asSketch(value: unknown): Sketch | null {
  if (!value || typeof value !== "object" || !("points" in value)) return null;
  const sketch = value as Sketch;
  return Array.isArray(sketch.points) && sketch.points.length >= 3 ? sketch : null;
}

async function approverRoles() {
  const row = await prisma.appSetting.findUnique({ where: { key: "quote_approver_roles" } });
  return parseApproverRoles(row?.value);
}

async function actorName(user: Actor) {
  if (user.name) return user.name;
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { name: true } });
  return row?.name ?? user.id;
}

async function templates() {
  const rows = await prisma.textTemplate.findMany({ orderBy: { sortOrder: "asc" } });
  return rows.map((row) => ({ key: row.key, name: row.name, kind: row.kind, tradeCode: row.tradeCode, body: row.body, sortOrder: row.sortOrder }));
}

export async function listTemplates() {
  return prisma.textTemplate.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
}

export async function saveTemplate(user: Actor, key: string, body: string) {
  if (user.role !== "admin") throw new DomainError("Bare administrator kan endre tekstmaler");
  const template = await prisma.textTemplate.update({ where: { key }, data: { body } });
  await audit(user.id, "template.update", "template", key);
  return template;
}

async function inspectionBundle(input: { dealId?: string | null; projectId?: string | null }) {
  const inspection = await prisma.inspection.findFirst({
    where: {
      deletedAt: null,
      OR: [
        input.projectId ? { projectId: input.projectId } : { id: "none" },
        input.dealId ? { dealId: input.dealId } : { id: "none" },
        input.dealId ? { project: { dealId: input.dealId } } : { id: "none" },
      ],
    },
    include: {
      answers: { where: { deletedAt: null }, include: { item: { include: { section: true } } } },
      notes: { where: { deletedAt: null } },
      media: { where: { deletedAt: null } },
      floors: { where: { deletedAt: null }, include: { rooms: { where: { deletedAt: null } } } },
      deal: true,
      project: { include: { deal: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return inspection;
}

async function draftRequest(input: { dealId?: string | null; projectId?: string | null; mode: "quote" | "change"; changeDescription?: string }): Promise<{ request: DraftRequest; inspectionId: string | null; priceListId: string; dealId: string | null; projectId: string | null; title: string }> {
  const inspection = await inspectionBundle(input);
  if (input.mode === "quote" && !inspection) throw new DomainError("Lag tilbudsutkast krever en befaring");
  const active = await prisma.priceList.findFirst({ where: { status: "active" }, orderBy: { validFrom: "desc" } });
  if (!active) throw new DomainError("Ingen aktiv prisliste");
  const list = await loadList(active.id);
  const deal = inspection?.deal ?? inspection?.project?.deal ?? null;
  const rooms = (inspection?.floors ?? []).flatMap((floor) => floor.rooms).map((room) => {
    const sketch = asSketch(room.sketch);
    if (sketch && sketch.doorEdge == null) sketch.doorEdge = 0;
    const measures = sketch
      ? contextFromSketch(sketch)
      : contextFromSketch({
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 1, y: 1 },
            { x: 0, y: 1 },
          ],
          doorEdge: 0,
          ceilingHeightM: dec(room.ceilingHeightM) ?? 2.4,
        });
    if (!sketch) {
      measures.omkrets = dec(room.perimeterM) ?? measures.omkrets;
      measures.gulvareal = dec(room.floorAreaM) ?? measures.gulvareal;
      measures.romhoyde = dec(room.ceilingHeightM) ?? measures.romhoyde;
      measures.takhoyde = measures.romhoyde;
    }
    return { name: room.name, ...measures };
  });
  const request: DraftRequest = {
    mode: input.mode,
    changeDescription: input.changeDescription,
    rooms,
    answers: (inspection?.answers ?? []).map((answer) => ({
      prompt: answer.item.prompt,
      tradeCode: answer.item.section.tradeCode,
      value: answer.value,
      freeText: answer.freeText,
      priceItemCode: answer.item.priceItemCode,
      internalNote: answer.internalNote,
      key: answer.item.itemKey,
      questionType: answer.item.questionType,
      unit: answer.item.unit,
      config: asItemConfig(answer.item.config),
    })),
    notes: (inspection?.notes ?? []).map((note) => ({ body: note.body, internal: note.internal })),
    media: (inspection?.media ?? []).map((item) => ({ id: item.id, kind: item.kind, fileName: item.fileName, internal: item.internal })),
    catalog: list.lines,
    templates: await templates(),
    rates: list.rates,
    commercial: list.commercial!,
    channel: channelFromSource(deal?.sourceChannel),
    validDays: 30,
  };
  if (input.mode === "quote") {
    const terms = await quoteTerms();
    const project = inspection?.project;
    request.validDays = terms.validDays;
    request.paymentStartPercent = terms.paymentStartPercent;
    request.paymentFinishPercent = terms.paymentFinishPercent;
    request.paymentDueDays = terms.paymentDueDays;
    request.startDate = nbDate(project?.plannedStartDate ?? project?.startDate);
    request.endDate = nbDate(project?.plannedEndDate ?? project?.endDate);
    request.textBlocks = await publishedTextBlocks();
  }
  return {
    request,
    inspectionId: inspection?.id ?? null,
    priceListId: list.id,
    dealId: input.dealId ?? inspection?.dealId ?? inspection?.project?.dealId ?? null,
    projectId: input.projectId ?? inspection?.projectId ?? null,
    title: input.mode === "change" ? "Tilleggsarbeid" : "Tilbud",
  };
}

function nbDate(value: Date | null | undefined): string | null {
  if (!value) return null;
  const day = String(value.getUTCDate()).padStart(2, "0");
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${value.getUTCFullYear()}`;
}

function hoursMap(trades: { tradeCode: string; hours: number }[]) {
  const map: Record<string, number> = {};
  for (const trade of trades) if (trade.hours) map[trade.tradeCode] = trade.hours;
  return map;
}

export async function createQuoteDraft(user: Actor, input: { dealId?: string; projectId?: string }) {
  const built = await draftRequest({ ...input, mode: "quote" });
  const completion = await completeDraft(built.request);
  const applied = applyDraft(built.request, completion.draft);
  const choiceByCode = new Map(completion.draft.lines.map((line) => [line.code, line]));
  const manual = completion.draft.manualItems ?? [];
  const quote = await prisma.quote.create({
    data: {
      projectId: built.projectId,
      dealId: built.dealId,
      familyId: crypto.randomUUID(),
      revision: "A",
      priceListId: built.priceListId,
      inspectionId: built.inspectionId,
      status: "draft",
      title: built.title,
      channelCode: applied.totals.channelCode,
      extraProfitNok: applied.totals.extraProfitExVat,
      vatRate: applied.totals.vatRate,
      customerText: applied.customerText,
      reservations: applied.reservations,
      emailSubject: applied.emailSubject,
      emailBody: applied.emailBody,
      aiSuggestion: applied.aiSuggestion,
      validDays: built.request.validDays ?? 30,
      sumExVat: applied.totals.subtotalExVat,
      addonsExVat: applied.totals.addonsExVat,
      vatNok: applied.totals.vatNok,
      totalIncVat: applied.totals.totalIncVat,
      costExVat: applied.totals.costExVat,
      contributionExVat: applied.totals.contributionExVat,
      marginExVat: applied.totals.marginExVat,
      hoursTotal: applied.totals.hoursTotal,
      hoursByTrade: hoursMap(applied.totals.trades),
      flags: applied.flags,
      createdById: user.id,
      lines: {
        create: [
          ...applied.totals.lines.map((line, index) => {
            const choice = choiceByCode.get(line.code);
            const source = applied.lines[index];
            return {
              priceItemId: line.code as string | null,
              tradeCode: line.tradeCode,
              code: line.code as string | null,
              description: line.name,
              unit: line.unit,
              quantity: line.quantity,
              quantitySource: "ai",
              unitPriceExVat: line.unitPriceExVat,
              materialCost: source?.materialCost ?? line.materialCostPerUnit,
              hours: line.hours,
              lineSumExVat: line.lineSumExVat,
              optional: line.optional,
              included: line.included,
              uncertain: Boolean(choice?.uncertain),
              uncertaintyNote: choice?.uncertaintyNote,
              rationale: choice?.rationale ?? "",
              sortOrder: index + 1,
            };
          }),
          ...manual.map((item, index) => ({
            priceItemId: null as string | null,
            tradeCode: "annet",
            code: null as string | null,
            description: `Må prises manuelt: ${item.prompt}`,
            unit: "stk",
            quantity: 1,
            quantitySource: "checklist",
            unitPriceExVat: 0,
            materialCost: 0,
            hours: 0,
            lineSumExVat: 0,
            optional: false,
            included: false,
            uncertain: true,
            uncertaintyNote: "Må prises manuelt",
            rationale: item.detail,
            sortOrder: applied.totals.lines.length + index + 1,
          })),
        ],
      },
      events: { create: { action: "draft", toStatus: "draft", actorId: user.id, actorName: await actorName(user), note: completion.provider === "mock" ? "Utkast uten API-nøkkel" : "Utkast fra Claude" } },
      aiLogs: {
        create: {
          provider: completion.provider,
          model: completion.model,
          prompt: completion.prompt,
          response: completion.response,
          inputTokens: completion.inputTokens,
          outputTokens: completion.outputTokens,
          costUsd: completion.costUsd,
          actorId: user.id,
        },
      },
    },
  });
  await audit(user.id, "quote.draft", "quote", quote.id);
  return { id: quote.id };
}

type StoredLine = {
  id: string;
  code: string | null;
  tradeCode: string;
  description: string;
  unit: string;
  quantity: { toNumber(): number };
  unitPriceExVat: { toNumber(): number };
  materialCost: { toNumber(): number };
  hours: { toNumber(): number };
  optional: boolean;
  included: boolean;
  internal: boolean;
  sortOrder: number;
};

function lineToCalc(line: StoredLine, patch?: Partial<CalcLine>): CalcLine {
  const quantity = dec(line.quantity) ?? 0;
  const hours = dec(line.hours) ?? 0;
  return {
    code: line.code ?? "",
    tradeCode: line.tradeCode,
    name: line.description,
    unit: line.unit,
    type: "unit_price",
    quantity,
    materialCost: dec(line.materialCost) ?? 0,
    materialMarkup: 0,
    hoursPerUnit: quantity > 0 ? hours / quantity : 0,
    hourlyRateOverride: null,
    salePriceOverride: null,
    unitPriceOverride: dec(line.unitPriceExVat) ?? 0,
    optional: line.optional,
    included: line.included,
    internal: line.internal,
    ...patch,
  };
}

async function recalc(quoteId: string, lines: CalcLine[], extra: { extraProfitNok?: number; channel?: ChannelCode } = {}) {
  const quote = await prisma.quote.findUnique({ where: { id: quoteId }, include: { priceList: { include: { rates: true } } } });
  if (!quote) throw new DomainError("Fant ikke tilbudet");
  const list = await loadList(quote.priceListId);
  const totals = calculateQuote({
    lines,
    rates: list.rates,
    commercial: list.commercial,
    extraProfitNok: extra.extraProfitNok ?? (dec(quote.extraProfitNok) ?? 0),
    channel: extra.channel ?? (quote.channelCode as ChannelCode),
  });
  await prisma.quote.update({
    where: { id: quoteId },
    data: {
      channelCode: totals.channelCode,
      extraProfitNok: totals.extraProfitExVat,
      vatRate: totals.vatRate,
      sumExVat: totals.subtotalExVat,
      addonsExVat: totals.addonsExVat,
      vatNok: totals.vatNok,
      totalIncVat: totals.totalIncVat,
      costExVat: totals.costExVat,
      contributionExVat: totals.contributionExVat,
      marginExVat: totals.marginExVat,
      hoursTotal: totals.hoursTotal,
      hoursByTrade: hoursMap(totals.trades),
    },
  });
  return totals;
}

export async function quoteView(id: string) {
  const quote = await prisma.quote.findUnique({
    where: { id },
    include: {
      lines: { orderBy: { sortOrder: "asc" } },
      events: { orderBy: { createdAt: "asc" } },
      aiLogs: { orderBy: { createdAt: "desc" }, take: 1 },
      priceList: true,
      deal: { include: { person: true } },
      project: true,
    },
  });
  if (!quote) throw new DomainError("Fant ikke tilbudet");
  const family = await prisma.quote.findMany({ where: { familyId: quote.familyId }, select: { id: true, revision: true, status: true }, orderBy: { createdAt: "asc" } });
  const trades = await prisma.trade.findMany({ orderBy: { sortOrder: "asc" } });
  const rank = new Map(trades.map((trade) => [trade.code, trade.sortOrder]));
  const subcontractor = new Map(trades.map((trade) => [trade.code, trade.subcontractor]));
  const storedHours = (quote.hoursByTrade ?? {}) as Record<string, number>;
  const lines = [...quote.lines].sort((a, b) => (rank.get(a.tradeCode) ?? 99) - (rank.get(b.tradeCode) ?? 99) || a.sortOrder - b.sortOrder);
  const ownHours = lines.reduce((sum, line) => {
    if (!line.included || line.internal || subcontractor.get(line.tradeCode)) return sum;
    return sum + (dec(line.hours) ?? 0);
  }, 0);
  return {
    id: quote.id,
    title: quote.title,
    revision: quote.revision,
    status: quote.status,
    statusLabel: FLOW.has(quote.status) ? QUOTE_STATUS_LABEL[quote.status as QuoteFlowStatus] : quote.status,
    family,
    priceListName: quote.priceList.name,
    dealId: quote.dealId,
    projectId: quote.projectId,
    channelCode: quote.channelCode,
    customerText: quote.customerText ?? "",
    reservations: quote.reservations ?? "",
    aiSuggestion: quote.aiSuggestion ?? "",
    emailSubject: quote.emailSubject ?? "",
    emailBody: quote.emailBody ?? "",
    validDays: quote.validDays,
    sumExVat: dec(quote.sumExVat) ?? 0,
    addonsExVat: dec(quote.addonsExVat) ?? 0,
    vatNok: dec(quote.vatNok) ?? 0,
    totalIncVat: dec(quote.totalIncVat) ?? 0,
    costExVat: dec(quote.costExVat) ?? 0,
    contributionExVat: dec(quote.contributionExVat) ?? 0,
    marginExVat: dec(quote.marginExVat) ?? 0,
    hoursTotal: ownHours,
    hoursByTrade: storedHours,
    tradeHours: trades
      .filter((trade) => lines.some((line) => line.tradeCode === trade.code))
      .map((trade) => ({
        code: trade.code,
        name: trade.name,
        subcontractor: trade.subcontractor,
        hours: trade.subcontractor
          ? 0
          : lines
              .filter((line) => line.included && !line.internal && line.tradeCode === trade.code)
              .reduce((sum, line) => sum + (dec(line.hours) ?? 0), 0),
      })),
    flags: Array.isArray(quote.flags) ? quote.flags.filter((flag): flag is string => typeof flag === "string") : [],
    ai: quote.aiLogs[0] ? { provider: quote.aiLogs[0].provider, model: quote.aiLogs[0].model, costUsd: dec(quote.aiLogs[0].costUsd) ?? 0 } : null,
    personEmail: quote.deal?.person?.email ?? null,
    lines: lines.map((line) => ({
      id: line.id,
      code: line.code,
      tradeCode: line.tradeCode,
      tradeName: trades.find((trade) => trade.code === line.tradeCode)?.name ?? TRADES.find((trade) => trade.code === line.tradeCode)?.name ?? line.tradeCode,
      description: line.description,
      unit: line.unit,
      quantity: dec(line.quantity) ?? 0,
      unitPriceExVat: dec(line.unitPriceExVat) ?? 0,
      hours: subcontractor.get(line.tradeCode) ? 0 : (dec(line.hours) ?? 0),
      lineSumExVat: dec(line.lineSumExVat) ?? 0,
      optional: line.optional,
      included: line.included,
      internal: line.internal,
      uncertain: line.uncertain,
      uncertaintyNote: line.uncertaintyNote,
      rationale: line.rationale,
    })),
    events: quote.events.map((event) => ({
      id: event.id,
      action: event.action,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      actorName: event.actorName,
      note: event.note,
      createdAt: event.createdAt.toISOString(),
    })),
  };
}

export async function updateQuote(
  user: Actor,
  id: string,
  input: {
    title?: string;
    customerText?: string;
    reservations?: string;
    aiSuggestion?: string;
    emailSubject?: string;
    emailBody?: string;
    extraProfitNok?: number;
    channelCode?: ChannelCode;
    validDays?: number;
    lines?: { id: string; description?: string; quantity?: number; unitPriceExVat?: number; included?: boolean; optional?: boolean }[];
  },
) {
  const quote = await prisma.quote.findUnique({ where: { id }, include: { lines: true } });
  if (!quote) throw new DomainError("Fant ikke tilbudet");
  if (!canEditQuote(asFlow(quote.status))) throw new DomainError("Tilbudet kan bare endres som utkast eller til godkjenning");
  const secrets = await internalSecrets(quote.inspectionId);
  const text = (value: string | undefined) => (value === undefined ? undefined : sanitizeCustomerText(value, secrets).text);
  await prisma.quote.update({
    where: { id },
    data: {
      title: input.title?.trim() || undefined,
      customerText: text(input.customerText),
      reservations: text(input.reservations),
      aiSuggestion: text(input.aiSuggestion),
      emailSubject: text(input.emailSubject),
      emailBody: text(input.emailBody),
      validDays: input.validDays,
    },
  });
  const patches = new Map((input.lines ?? []).map((line) => [line.id, line]));
  for (const line of quote.lines) {
    const patch = patches.get(line.id);
    if (!patch) continue;
    const quantity = patch.quantity ?? (dec(line.quantity) ?? 0);
    const unitPrice = patch.unitPriceExVat ?? (dec(line.unitPriceExVat) ?? 0);
    const hoursPer = (dec(line.quantity) ?? 0) > 0 ? (dec(line.hours) ?? 0) / (dec(line.quantity) ?? 1) : 0;
    await prisma.quoteLine.update({
      where: { id: line.id },
      data: {
        description: patch.description?.trim() || undefined,
        quantity,
        unitPriceExVat: unitPrice,
        hours: hoursPer * quantity,
        included: patch.included,
        optional: patch.optional,
        lineSumExVat: patch.included === false ? 0 : quantity * unitPrice,
      },
    });
  }
  const fresh = await prisma.quoteLine.findMany({ where: { quoteId: id }, orderBy: { sortOrder: "asc" } });
  await recalc(id, fresh.map((line) => lineToCalc(line)), { extraProfitNok: input.extraProfitNok, channel: input.channelCode });
  await audit(user.id, "quote.update", "quote", id);
  return quoteView(id);
}

async function internalSecrets(inspectionId: string | null) {
  if (!inspectionId) return [];
  const notes = await prisma.note.findMany({ where: { inspectionId, internal: true, deletedAt: null } });
  const answers = await prisma.checklistAnswer.findMany({ where: { inspectionId, deletedAt: null } });
  return [...notes.map((note) => note.body), ...answers.map((answer) => answer.internalNote ?? "")].filter((text) => text.trim().length >= 12);
}

export async function addQuoteLine(user: Actor, quoteId: string, input: { code: string; quantity: number }) {
  const quote = await prisma.quote.findUnique({ where: { id: quoteId }, include: { lines: true } });
  if (!quote) throw new DomainError("Fant ikke tilbudet");
  if (!canEditQuote(asFlow(quote.status))) throw new DomainError("Tilbudet kan bare endres som utkast eller til godkjenning");
  const list = await loadList(quote.priceListId);
  const item = lookupLine(list.lines, input.code.trim());
  const calc = priceLineToCalc(item, input.quantity);
  const priced = calculateQuote({ lines: [calc], rates: list.rates, commercial: list.commercial, channel: "none" }).lines[0]!;
  const sortOrder = Math.max(0, ...quote.lines.map((line) => line.sortOrder)) + 1;
  await prisma.quoteLine.create({
    data: {
      quoteId,
      priceItemId: item.code,
      tradeCode: item.tradeCode,
      code: item.code,
      description: item.name,
      unit: item.unit,
      quantity: input.quantity,
      quantitySource: "manual",
      unitPriceExVat: priced.unitPriceExVat,
      materialCost: item.materialCost,
      hours: priced.hours,
      lineSumExVat: priced.lineSumExVat,
      rationale: "Lagt til manuelt fra prislisten.",
      sortOrder,
    },
  });
  const fresh = await prisma.quoteLine.findMany({ where: { quoteId }, orderBy: { sortOrder: "asc" } });
  await recalc(quoteId, fresh.map((line) => lineToCalc(line)));
  await audit(user.id, "quote.line", "quote", quoteId, { code: item.code });
  return quoteView(quoteId);
}

export async function removeQuoteLine(user: Actor, quoteId: string, lineId: string) {
  const quote = await prisma.quote.findUnique({ where: { id: quoteId } });
  if (!quote) throw new DomainError("Fant ikke tilbudet");
  if (!canEditQuote(asFlow(quote.status))) throw new DomainError("Tilbudet kan bare endres som utkast eller til godkjenning");
  await prisma.quoteLine.delete({ where: { id: lineId } });
  const fresh = await prisma.quoteLine.findMany({ where: { quoteId }, orderBy: { sortOrder: "asc" } });
  await recalc(quoteId, fresh.map((line) => lineToCalc(line)));
  return quoteView(quoteId);
}

export async function transitionQuote(user: Actor, id: string, to: QuoteFlowStatus) {
  const quote = await prisma.quote.findUnique({ where: { id } });
  if (!quote) throw new DomainError("Fant ikke tilbudet");
  const from = asFlow(quote.status);
  const allowed = roleCanApprove(user.role, await approverRoles());
  assertQuoteTransition(from, to, allowed);
  const name = await actorName(user);
  const now = new Date();
  await prisma.quote.update({
    where: { id },
    data: {
      status: to,
      submittedAt: to === "pending_approval" ? now : undefined,
      approvedAt: to === "approved" ? now : undefined,
      approvedById: to === "approved" ? user.id : undefined,
      sentAt: to === "sent" ? now : undefined,
      decidedAt: to === "accepted" || to === "rejected" ? now : undefined,
    },
  });
  await prisma.quoteEvent.create({
    data: { quoteId: id, action: to, fromStatus: from, toStatus: to, actorId: user.id, actorName: name },
  });
  if (to === "accepted") {
    const total = dec(quote.totalIncVat) ?? 0;
    if (quote.dealId) await prisma.deal.update({ where: { id: quote.dealId }, data: { valueNok: total } });
    if (quote.projectId) await prisma.project.update({ where: { id: quote.projectId }, data: { contractSumNok: total } });
  }
  await audit(user.id, "quote.transition", "quote", id, { from, to });
  return quoteView(id);
}

export async function reviseQuote(user: Actor, id: string) {
  const quote = await prisma.quote.findUnique({ where: { id }, include: { lines: true } });
  if (!quote) throw new DomainError("Fant ikke tilbudet");
  const revision = nextRevision(quote.revision);
  const copy = await prisma.quote.create({
    data: {
      projectId: quote.projectId,
      dealId: quote.dealId,
      familyId: quote.familyId,
      revision,
      priceListId: quote.priceListId,
      inspectionId: quote.inspectionId,
      status: "draft",
      title: quote.title,
      channelCode: quote.channelCode,
      extraProfitNok: quote.extraProfitNok,
      channelFeeFactor: quote.channelFeeFactor,
      vatRate: quote.vatRate,
      customerText: quote.customerText,
      reservations: quote.reservations,
      emailSubject: quote.emailSubject,
      emailBody: quote.emailBody,
      aiSuggestion: quote.aiSuggestion,
      validDays: quote.validDays,
      sumExVat: quote.sumExVat,
      addonsExVat: quote.addonsExVat,
      vatNok: quote.vatNok,
      totalIncVat: quote.totalIncVat,
      costExVat: quote.costExVat,
      contributionExVat: quote.contributionExVat,
      marginExVat: quote.marginExVat,
      hoursTotal: quote.hoursTotal,
      hoursByTrade: quote.hoursByTrade ?? {},
      flags: quote.flags ?? [],
      createdById: user.id,
      lines: {
        create: quote.lines.map((line) => ({
          priceItemId: line.priceItemId,
          tradeCode: line.tradeCode,
          code: line.code,
          description: line.description,
          unit: line.unit,
          quantity: line.quantity,
          quantitySource: line.quantitySource,
          unitPriceExVat: line.unitPriceExVat,
          materialCost: line.materialCost,
          hours: line.hours,
          lineSumExVat: line.lineSumExVat,
          internal: line.internal,
          optional: line.optional,
          included: line.included,
          uncertain: line.uncertain,
          uncertaintyNote: line.uncertaintyNote,
          rationale: line.rationale,
          sortOrder: line.sortOrder,
        })),
      },
      events: { create: { action: "revision", toStatus: "draft", actorId: user.id, actorName: await actorName(user), note: `Kopi av rev. ${quote.revision}` } },
    },
  });
  return { id: copy.id };
}

export async function emailQuote(user: Actor, id: string) {
  const quote = await prisma.quote.findUnique({ where: { id }, include: { deal: { include: { person: true } }, lines: true } });
  if (!quote) throw new DomainError("Fant ikke tilbudet");
  const status = asFlow(quote.status);
  if (status !== "approved" && status !== "sent") throw new DomainError("Tilbudet må være godkjent før det legges i utboksen");
  const to = quote.deal?.person?.email;
  if (!to) throw new DomainError("Personen mangler e-postadresse");
  const secrets = await internalSecrets(quote.inspectionId);
  const body = sanitizeCustomerText(quote.emailBody ?? "", secrets).text;
  if (secrets.some((secret) => body.includes(secret))) throw new DomainError("E-posten inneholder intern tekst");
  const sent = await mailProvider().send({ to, subject: quote.emailSubject || quote.title, text: body });
  if (status === "approved") await transitionQuote(user, id, "sent");
  await audit(user.id, "quote.email", "quote", id, { mailId: sent.id });
  return { mailId: sent.id };
}

function wrapPdfLines(text: string, width = 88): string[] {
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    let rest = raw;
    if (rest.length <= width) {
      out.push(rest);
      continue;
    }
    while (rest.length > width) {
      let cut = rest.lastIndexOf(" ", width);
      if (cut < 24) cut = width;
      out.push(rest.slice(0, cut));
      rest = rest.slice(cut).trimStart();
    }
    if (rest) out.push(rest);
  }
  return out;
}

export async function quotePdf(id: string): Promise<{ name: string; body: Buffer }> {
  const quote = await quoteView(id);
  const lines = [
    `Revisjon ${quote.revision} · ${quote.statusLabel}`,
    `Sum eks. mva: ${quote.sumExVat} kr`,
    `Mva: ${quote.vatNok} kr`,
    `Totalt inkl. mva: ${quote.totalIncVat} kr`,
    "",
    ...wrapPdfLines(quote.customerText),
    "",
    "Poster",
    ...quote.lines.filter((line) => !line.internal && line.included).map((line) => `${line.description}  ${line.quantity} ${line.unit}`),
  ];
  const reservationHead = quote.reservations.trim().slice(0, 80);
  if (quote.reservations.trim() && !quote.customerText.includes(reservationHead)) {
    lines.push("", "Forbehold", ...quote.reservations.split("\n"));
  }
  if (quote.aiSuggestion.trim()) {
    lines.push("", AI_SUGGESTION_HEADING, ...quote.aiSuggestion.split("\n"));
  }
  const pages = [];
  for (let index = 0; index < lines.length; index += 40) {
    pages.push({ title: index === 0 ? quote.title : `${quote.title} forts.`, lines: lines.slice(index, index + 40) });
  }
  return { name: `${quote.title}-rev-${quote.revision}.pdf`, body: pagesPdf(pages) };
}

export async function createChangeDraft(user: Actor, projectId: string, description: string) {
  const text = description.trim();
  if (!text) throw new DomainError("Beskriv endringen");
  const project = await prisma.project.findUnique({ where: { id: projectId }, include: { deal: true } });
  if (!project) throw new DomainError("Fant ikke prosjektet");
  const built = await draftRequest({ projectId, dealId: project.dealId, mode: "change", changeDescription: text });
  const completion = await completeDraft(built.request);
  const applied = applyDraft(built.request, completion.draft);
  const choiceByCode = new Map(completion.draft.lines.map((line) => [line.code, line]));
  const change = await prisma.changeOrder.create({
    data: {
      projectId,
      title: text.slice(0, 80),
      description: text,
      amountNok: applied.totals.totalIncVat,
      status: "draft",
      priceListId: built.priceListId,
      customerText: applied.customerText,
      assumptions: applied.reservations,
      sumExVat: applied.totals.subtotalExVat,
      totalIncVat: applied.totals.totalIncVat,
      marginExVat: applied.totals.marginExVat,
      hoursTotal: applied.totals.hoursTotal,
      portalStatus: "internal",
      lines: {
        create: applied.totals.lines.map((line, index) => ({
          priceItemId: line.code,
          tradeCode: line.tradeCode,
          code: line.code,
          description: line.name,
          unit: line.unit,
          quantity: line.quantity,
          unitPriceExVat: line.unitPriceExVat,
          hours: line.hours,
          lineSumExVat: line.lineSumExVat,
          rationale: choiceByCode.get(line.code)?.rationale ?? "",
          uncertain: Boolean(choiceByCode.get(line.code)?.uncertain),
          sortOrder: index + 1,
        })),
      },
    },
  });
  await prisma.aiDraftLog.create({
    data: {
      changeOrderId: change.id,
      provider: completion.provider,
      model: completion.model,
      prompt: completion.prompt,
      response: completion.response,
      inputTokens: completion.inputTokens,
      outputTokens: completion.outputTokens,
      costUsd: completion.costUsd,
      actorId: user.id,
    },
  });
  await audit(user.id, "change.draft", "change", change.id);
  return { id: change.id, totalIncVat: applied.totals.totalIncVat, flags: applied.flags };
}

export async function decideChange(user: Actor, id: string, status: "approved" | "rejected" | "sent") {
  if (status === "approved" && !roleCanApprove(user.role, await approverRoles())) throw new DomainError("Du kan ikke godkjenne endringen");
  const change = await prisma.changeOrder.update({
    where: { id },
    data: {
      status,
      approvedById: status === "approved" ? user.id : undefined,
      approvedAt: status === "approved" ? new Date() : undefined,
      portalStatus: "internal",
    },
  });
  await audit(user.id, "change.decide", "change", id, { status });
  return change;
}

export async function plannedHours(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { dealId: true } });
  if (!project) throw new DomainError("Fant ikke prosjektet");
  const quotes = await prisma.quote.findMany({
    where: {
      status: { in: ["approved", "sent", "accepted"] },
      OR: [{ projectId }, project.dealId ? { dealId: project.dealId } : { id: "none" }],
    },
  });
  const changes = await prisma.changeOrder.findMany({ where: { projectId, status: "approved" } });
  const subcontractors = new Set((await prisma.trade.findMany({ where: { subcontractor: true }, select: { code: true } })).map((trade) => trade.code));
  const byTrade: Record<string, number> = {};
  for (const quote of quotes) {
    const map = (quote.hoursByTrade ?? {}) as Record<string, number>;
    for (const [trade, hours] of Object.entries(map)) {
      if (subcontractors.has(trade)) continue;
      byTrade[trade] = (byTrade[trade] ?? 0) + Number(hours || 0);
    }
  }
  const changeHours = changes.reduce((sum, change) => sum + (dec(change.hoursTotal) ?? 0), 0);
  return {
    quotes: quotes.map((quote) => ({ id: quote.id, revision: quote.revision, status: quote.status, hoursTotal: dec(quote.hoursTotal) ?? 0 })),
    byTrade,
    hoursTotal: Object.values(byTrade).reduce((sum, hours) => sum + hours, 0),
    approvedChangeHours: changeHours,
    approvedChangeSum: changes.reduce((sum, change) => sum + (dec(change.totalIncVat) ?? dec(change.amountNok) ?? 0), 0),
  };
}

const QUOTE_STATUSES = ["draft", "pending_approval", "internally_approved", "approved", "sent", "signed", "accepted", "rejected"] as const;

export async function listQuotes(status?: string) {
  const selected = status && (QUOTE_STATUSES as readonly string[]).includes(status) ? (status as QuoteStatus) : undefined;
  const rows = await prisma.quote.findMany({
    where: selected ? { status: selected } : {},
    orderBy: { createdAt: "desc" },
    include: {
      deal: { select: { id: true, title: true } },
      project: { select: { id: true, title: true } },
    },
  });
  return rows.map((quote) => ({
    id: quote.id,
    title: quote.title,
    revision: quote.revision,
    status: quote.status,
    totalIncVat: dec(quote.totalIncVat) ?? 0,
    createdAt: quote.createdAt.toISOString(),
    dealId: quote.dealId,
    dealTitle: quote.deal?.title ?? null,
    projectId: quote.projectId,
    projectTitle: quote.project?.title ?? null,
  }));
}

export async function quotesFor(input: { dealId?: string | null; projectId?: string | null }) {
  return prisma.quote.findMany({
    where: {
      OR: [input.dealId ? { dealId: input.dealId } : { id: "none" }, input.projectId ? { projectId: input.projectId } : { id: "none" }],
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, revision: true, status: true, totalIncVat: true, hoursTotal: true, createdAt: true },
  });
}
