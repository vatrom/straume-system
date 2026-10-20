import { prisma, type PriceItemType } from "@straume/db";
import {
  activatePriceList,
  addPriceLine,
  adjustComponents,
  computeSalePrice,
  createAdjustedVersion,
  DomainError,
  rollupBom,
  TRADE_CODES,
  tableToXlsx,
  type BomLineInput,
  type CommercialSettings,
  type PriceLineInput,
  type PriceListInput,
  type RateInput,
} from "@straume/domain";
import { audit } from "./audit";
import { dec } from "./dates";
import { assertAdmin } from "./roles";

function toLine(row: {
  priceItem: {
    id: string;
    code: string;
    tradeId: string;
    name: string;
    unit: string;
    type: PriceItemType;
    sortOrder: number;
    active: boolean;
    customerVisible: boolean;
    internalNote: string | null;
    quantityFormula: string | null;
    splitConfidence: string;
    splitNote: string | null;
  };
  materialCost: { toNumber(): number };
  materialMarkup: { toNumber(): number } | null;
  hoursPerUnit: { toNumber(): number };
  hourlyRateOverride: { toNumber(): number } | null;
  salePriceOverride: { toNumber(): number } | null;
  costFormula: string | null;
}): PriceLineInput {
  return {
    itemId: row.priceItem.id,
    code: row.priceItem.code,
    tradeCode: row.priceItem.tradeId,
    name: row.priceItem.name,
    unit: row.priceItem.unit,
    type: row.priceItem.type,
    materialCost: dec(row.materialCost) ?? 0,
    materialMarkup: dec(row.materialMarkup),
    hoursPerUnit: dec(row.hoursPerUnit) ?? 0,
    hourlyRateOverride: dec(row.hourlyRateOverride),
    salePriceOverride: dec(row.salePriceOverride),
    quantityFormula: row.priceItem.quantityFormula,
    costFormula: row.costFormula,
    internalNote: row.priceItem.internalNote,
    customerVisible: row.priceItem.customerVisible,
    active: row.priceItem.active,
    sortOrder: row.priceItem.sortOrder,
    splitConfidence: row.priceItem.splitConfidence === "derived" || row.priceItem.splitConfidence === "uncertain" ? row.priceItem.splitConfidence : "known",
    splitNote: row.priceItem.splitNote,
  };
}

function commercialOf(list: {
  vatRate: { toNumber(): number };
  byggstartPercent: { toNumber(): number };
  byggstartFactor: { toNumber(): number };
  mittanbudPercent: { toNumber(): number };
  mittanbudFactor: { toNumber(): number };
  extraCalloutNok: { toNumber(): number } | null;
  tileAllowanceExVat: { toNumber(): number } | null;
  electricianCostFactor: { toNumber(): number };
  assemblyHourlyNok: { toNumber(): number } | null;
}): CommercialSettings {
  return {
    vatRate: dec(list.vatRate) ?? 0.25,
    byggstartPercent: dec(list.byggstartPercent) ?? 0.08,
    byggstartFactor: dec(list.byggstartFactor) ?? 1,
    mittanbudPercent: dec(list.mittanbudPercent) ?? 0.05,
    mittanbudFactor: dec(list.mittanbudFactor) ?? 1,
    extraCalloutNok: dec(list.extraCalloutNok) ?? 490,
    tileAllowanceExVat: dec(list.tileAllowanceExVat) ?? 400,
    electricianCostFactor: dec(list.electricianCostFactor) ?? 1.15,
    assemblyHourlyNok: dec(list.assemblyHourlyNok),
  };
}

function commercialData(commercial: CommercialSettings | undefined) {
  if (!commercial) return {};
  return {
    vatRate: commercial.vatRate,
    byggstartPercent: commercial.byggstartPercent,
    byggstartFactor: commercial.byggstartFactor,
    mittanbudPercent: commercial.mittanbudPercent,
    mittanbudFactor: commercial.mittanbudFactor,
    extraCalloutNok: commercial.extraCalloutNok,
    tileAllowanceExVat: commercial.tileAllowanceExVat,
    electricianCostFactor: commercial.electricianCostFactor,
    assemblyHourlyNok: commercial.assemblyHourlyNok,
  };
}

export async function loadList(id: string): Promise<PriceListInput> {
  const list = await prisma.priceList.findUnique({
    where: { id },
    include: { lines: { include: { priceItem: true } }, rates: { include: { trade: true } } },
  });
  if (!list) throw new DomainError("Fant ikke prislisten");
  return {
    id: list.id,
    name: list.name,
    validFrom: list.validFrom.toISOString().slice(0, 10),
    validTo: list.validTo ? list.validTo.toISOString().slice(0, 10) : null,
    status: list.status,
    commercial: commercialOf(list),
    lines: list.lines.map(toLine),
    rates: list.rates.map((rate) => ({
      tradeCode: rate.tradeId,
      hourlyRateSale: dec(rate.hourlyRateSale) ?? 0,
      hourlyRateInternal: dec(rate.hourlyRateInternal) ?? 0,
      calloutPrice: dec(rate.calloutPrice),
      defaultMaterialMarkup: dec(rate.defaultMaterialMarkup) ?? 0,
      subcontractor: rate.trade.subcontractor,
    })),
  };
}

export async function listPriceLists() {
  const lists = await prisma.priceList.findMany({ orderBy: { validFrom: "desc" }, include: { _count: { select: { lines: true } } } });
  return lists.map((list) => ({
    id: list.id,
    name: list.name,
    validFrom: list.validFrom.toISOString().slice(0, 10),
    validTo: list.validTo ? list.validTo.toISOString().slice(0, 10) : null,
    status: list.status,
    comment: list.comment,
    lines: list._count.lines,
    adjustmentPercent: dec(list.adjustmentPercent),
  }));
}

export async function priceListView(id: string) {
  const list = await loadList(id);
  const bomRows = await prisma.bomLine.findMany({
    where: { priceItemId: { in: list.lines.map((line) => line.itemId) } },
    include: { product: true },
    orderBy: { sortOrder: "asc" },
  });
  const grouped = new Map<string, BomLineInput[]>();
  for (const row of bomRows) {
    const bucket = grouped.get(row.priceItemId) ?? [];
    bucket.push({
      id: row.id,
      kind: row.kind === "product" ? "product" : "amount",
      label: row.label,
      amountNok: dec(row.amountNok),
      quantity: dec(row.quantity) ?? 1,
      product: row.product
        ? {
            id: row.product.id,
            sku: row.product.sku,
            name: row.product.name,
            unit: row.product.unit,
            costPrice: dec(row.product.costPrice),
            listPrice: dec(row.product.listPrice),
            discontinued: row.product.discontinued,
          }
        : null,
    });
    grouped.set(row.priceItemId, bucket);
  }
  const lines = list.lines
    .map((line) => {
      const rollup = rollupBom(grouped.get(line.itemId) ?? []);
      return {
        ...line,
        salePriceExVat: computeSalePrice(line, list.rates),
        hasBom: Boolean(rollup),
        bomFlags: rollup?.flags.map((flag) => flag.message) ?? [],
      };
    });
  const trades = await prisma.trade.findMany({ orderBy: { sortOrder: "asc" } });
  const rank = new Map(trades.map((trade) => [trade.code, trade.sortOrder]));
  lines.sort((a, b) => (rank.get(a.tradeCode) ?? 99) - (rank.get(b.tradeCode) ?? 99) || a.sortOrder - b.sortOrder);
  const hoursByTrade = trades
    .map((trade) => ({
      tradeCode: trade.code,
      name: trade.name,
      subcontractor: trade.subcontractor,
      hours: trade.subcontractor ? 0 : lines.filter((line) => line.active && line.tradeCode === trade.code).reduce((sum, line) => sum + line.hoursPerUnit, 0),
    }))
    .filter((trade) => (trade.subcontractor ? lines.some((line) => line.active && line.tradeCode === trade.tradeCode) : trade.hours > 0));
  return { ...list, lines, hoursByTrade };
}

async function persistVersion(
  sourceId: string,
  previousValidTo: string | null,
  next: PriceListInput,
  meta: { comment: string; adjustmentPercent?: number | null; actorId: string; actorName: string; action: string; detail: unknown },
) {
  await prisma.$transaction(async (tx) => {
    if (previousValidTo) {
      await tx.priceList.update({ where: { id: sourceId }, data: { validTo: new Date(`${previousValidTo}T00:00:00.000Z`) } });
    }
    await tx.priceList.create({
      data: {
        id: next.id,
        name: next.name,
        validFrom: new Date(`${next.validFrom}T00:00:00.000Z`),
        status: "draft",
        createdFromId: sourceId,
        adjustmentPercent: meta.adjustmentPercent ?? null,
        comment: meta.comment,
        ...commercialData(next.commercial),
        rates: {
          create: next.rates.map((rate: RateInput) => ({
            tradeId: rate.tradeCode,
            hourlyRateSale: rate.hourlyRateSale,
            hourlyRateInternal: rate.hourlyRateInternal,
            calloutPrice: rate.calloutPrice,
            defaultMaterialMarkup: rate.defaultMaterialMarkup,
          })),
        },
        lines: {
          create: next.lines.map((line) => ({
            priceItemId: line.itemId,
            materialCost: line.materialCost,
            materialMarkup: line.materialMarkup,
            hoursPerUnit: line.hoursPerUnit,
            hourlyRateOverride: line.hourlyRateOverride,
            salePriceOverride: line.salePriceOverride,
            costFormula: line.costFormula,
          })),
        },
      },
    });
    await tx.priceChangeLog.create({
      data: {
        priceListId: next.id,
        actorId: meta.actorId,
        actorName: meta.actorName,
        action: meta.action,
        detail: meta.detail as object,
      },
    });
  });
}

export async function adjustPriceList(
  user: { id: string; role: string },
  id: string,
  input: { name: string; validFrom: string; percent: number; tradeCodes?: string[]; includeLaborRates?: boolean },
) {
  assertAdmin(user);
  const source = await loadList(id);
  const actor = await prisma.user.findUnique({ where: { id: user.id }, select: { name: true } });
  const nextId = crypto.randomUUID();
  const { previous, next } = createAdjustedVersion(source, { ...input, id: nextId });
  await persistVersion(id, previous.validTo, next, {
    comment: `Justert ${input.percent} % fra ${source.name}`,
    adjustmentPercent: input.percent,
    actorId: user.id,
    actorName: actor?.name ?? user.id,
    action: "version.percent",
    detail: { from: id, percent: input.percent, tradeCodes: input.tradeCodes ?? [], includeLaborRates: Boolean(input.includeLaborRates) },
  });
  await audit(user.id, "pricelist.version", "pricelist", nextId, { from: id, percent: input.percent });
  return { id: nextId };
}

export async function adjustComponentVersion(
  user: { id: string; role: string; name?: string },
  id: string,
  input: { name: string; validFrom: string; materialPercent: number; laborPercent: number; tradeCodes?: string[] },
) {
  assertAdmin(user);
  const source = await loadList(id);
  const actor = await prisma.user.findUnique({ where: { id: user.id }, select: { name: true } });
  const nextId = crypto.randomUUID();
  const { previous, next } = adjustComponents(source, { ...input, id: nextId });
  await persistVersion(id, previous.validTo, next, {
    comment: `Materiell ${input.materialPercent} %, timer ${input.laborPercent} % fra ${source.name}`,
    adjustmentPercent: null,
    actorId: user.id,
    actorName: actor?.name ?? user.id,
    action: "version.components",
    detail: input,
  });
  await audit(user.id, "pricelist.components", "pricelist", nextId, input);
  return { id: nextId };
}

export async function activateList(user: { id: string; role: string }, id: string) {
  assertAdmin(user);
  const lists = await prisma.priceList.findMany({ select: { id: true, status: true } });
  const next = activatePriceList(lists, id);
  const ops = next
    .filter((list) => list.status !== lists.find((item) => item.id === list.id)?.status)
    .map((list) => prisma.priceList.update({ where: { id: list.id }, data: { status: list.status } }));
  if (ops.length) await prisma.$transaction(ops);
  await audit(user.id, "pricelist.activate", "pricelist", id);
}

export async function addItem(
  user: { id: string; role: string },
  priceListId: string,
  input: {
    code: string;
    name: string;
    tradeCode: string;
    unit: string;
    type: PriceItemType;
    materialCost?: number;
    materialMarkup?: number | null;
    hoursPerUnit?: number;
    hourlyRateOverride?: number | null;
    salePriceOverride?: number | null;
    quantityFormula?: string | null;
    internalNote?: string | null;
  },
) {
  assertAdmin(user);
  if (!TRADE_CODES.includes(input.tradeCode as (typeof TRADE_CODES)[number])) throw new DomainError("Ukjent fag");
  const list = await loadList(priceListId);
  const sortOrder = Math.max(0, ...list.lines.filter((line) => line.tradeCode === input.tradeCode).map((line) => line.sortOrder)) + 1;
  const line: PriceLineInput = {
    itemId: input.code.trim(),
    code: input.code.trim(),
    tradeCode: input.tradeCode,
    name: input.name,
    unit: input.unit.trim() || "stk",
    type: input.type,
    materialCost: input.materialCost ?? 0,
    materialMarkup: input.materialMarkup ?? null,
    hoursPerUnit: input.hoursPerUnit ?? 0,
    hourlyRateOverride: input.hourlyRateOverride ?? null,
    salePriceOverride: input.salePriceOverride ?? null,
    quantityFormula: input.quantityFormula ?? null,
    costFormula: null,
    internalNote: input.internalNote ?? null,
    customerVisible: input.type !== "freetext" && input.type !== "percent_addon",
    active: true,
    sortOrder,
  };
  addPriceLine(list, line);
  await prisma.priceItem.upsert({
    where: { id: line.code },
    update: { name: line.name, unit: line.unit, type: line.type, internalNote: line.internalNote, quantityFormula: line.quantityFormula },
    create: {
      id: line.code,
      code: line.code,
      tradeId: line.tradeCode,
      name: line.name,
      unit: line.unit,
      type: line.type,
      sortOrder,
      customerVisible: line.customerVisible,
      internalNote: line.internalNote,
      quantityFormula: line.quantityFormula,
      splitConfidence: line.materialCost > 0 || line.hoursPerUnit > 0 ? "known" : "uncertain",
      splitNote: line.materialCost > 0 || line.hoursPerUnit > 0 ? null : "Ny post uten oppdeling av timer og materiell.",
    },
  });
  const existing = await prisma.priceLine.findUnique({ where: { priceListId_priceItemId: { priceListId, priceItemId: line.code } } });
  if (existing) throw new DomainError("Prisposten finnes allerede i prislisten");
  await prisma.priceLine.create({
    data: {
      priceListId,
      priceItemId: line.code,
      materialCost: line.materialCost,
      materialMarkup: line.materialMarkup,
      hoursPerUnit: line.hoursPerUnit,
      hourlyRateOverride: line.hourlyRateOverride,
      salePriceOverride: line.salePriceOverride,
    },
  });
  await audit(user.id, "priceitem.create", "priceitem", line.code, { priceListId });
  return line;
}

export async function editLine(
  user: { id: string; role: string },
  priceListId: string,
  itemId: string,
  input: Partial<Pick<PriceLineInput, "name" | "unit" | "materialCost" | "materialMarkup" | "hoursPerUnit" | "hourlyRateOverride" | "salePriceOverride" | "quantityFormula" | "active" | "internalNote">> & { customerText?: string | null },
) {
  assertAdmin(user);
  const bomCount = await prisma.bomLine.count({ where: { priceItemId: itemId } });
  if (bomCount > 0 && input.materialCost !== undefined) {
    throw new DomainError("Materialkost styres av stykklisten. Endre linjene der, så regnes kostnaden på nytt.");
  }
  if (input.name || input.unit || input.quantityFormula !== undefined || input.active !== undefined || input.internalNote !== undefined || input.customerText !== undefined) {
    await prisma.priceItem.update({
      where: { id: itemId },
      data: {
        name: input.name?.trim() || undefined,
        unit: input.unit?.trim() || undefined,
        quantityFormula: input.quantityFormula,
        active: input.active,
        internalNote: input.internalNote,
        customerText: input.customerText,
      },
    });
  }
  await prisma.priceLine.update({
    where: { priceListId_priceItemId: { priceListId, priceItemId: itemId } },
    data: {
      materialCost: input.materialCost,
      materialMarkup: input.materialMarkup,
      hoursPerUnit: input.hoursPerUnit,
      hourlyRateOverride: input.hourlyRateOverride,
      salePriceOverride: input.salePriceOverride,
    },
  });
  const actor = await prisma.user.findUnique({ where: { id: user.id }, select: { name: true } });
  await prisma.priceChangeLog.create({
    data: {
      priceListId,
      priceItemId: itemId,
      actorId: user.id,
      actorName: actor?.name ?? user.id,
      action: "line.update",
      detail: JSON.parse(JSON.stringify(input)),
    },
  });
  await audit(user.id, "priceline.update", "priceline", itemId, { priceListId });
}

export async function archiveItem(user: { id: string; role: string }, priceListId: string, itemId: string) {
  assertAdmin(user);
  await prisma.priceItem.update({ where: { id: itemId }, data: { active: false } });
  const actor = await prisma.user.findUnique({ where: { id: user.id }, select: { name: true } });
  await prisma.priceChangeLog.create({
    data: { priceListId, priceItemId: itemId, actorId: user.id, actorName: actor?.name ?? user.id, action: "item.archive", detail: {} },
  });
  await audit(user.id, "priceitem.archive", "priceitem", itemId, { priceListId });
}

export async function priceChangeLog(priceListId: string) {
  const rows = await prisma.priceChangeLog.findMany({ where: { priceListId }, orderBy: { createdAt: "desc" }, take: 40 });
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    actorName: row.actorName,
    priceItemId: row.priceItemId,
    detail: row.detail,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function priceListExcel(id: string): Promise<{ name: string; body: Buffer }> {
  const list = await priceListView(id);
  const header = ["Kode", "Fag", "Navn", "Enhet", "Type", "Materialkost", "Påslag", "Timer per enhet", "Timepris overstyrt", "Salgspris eks. mva", "Splitt", "Merknad", "Aktiv", "Stykkliste"];
  const rows = list.lines.map((line) => [
    line.code,
    line.tradeCode,
    line.name,
    line.unit,
    line.type,
    String(line.materialCost),
    line.materialMarkup == null ? "" : String(line.materialMarkup),
    String(line.hoursPerUnit),
    line.hourlyRateOverride == null ? "" : String(line.hourlyRateOverride),
    String(line.salePriceExVat),
    line.splitConfidence ?? "",
    line.splitNote ?? "",
    line.active ? "ja" : "nei",
    line.hasBom ? "ja" : "nei",
  ]);
  return { name: `${list.name}.xlsx`, body: tableToXlsx([header, ...rows]) };
}

function percentPoints(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100) throw new DomainError(`${label} må være mellom 0 og 100`);
  return Math.round(number * 100) / 10000;
}

function moneyAmount(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1000000) throw new DomainError(`${label} må være et beløp eks. mva`);
  return Math.round(number * 100) / 100;
}

export async function updateCommercial(
  user: { id: string; role: string },
  id: string,
  input: { byggstartPercent?: unknown; mittanbudPercent?: unknown; extraCalloutNok?: unknown; tileAllowanceExVat?: unknown },
) {
  assertAdmin(user);
  const list = await prisma.priceList.findUnique({ where: { id } });
  if (!list) throw new DomainError("Fant ikke prislisten");
  const data = {
    byggstartPercent: percentPoints(input.byggstartPercent, "Byggstart"),
    mittanbudPercent: percentPoints(input.mittanbudPercent, "MittAnbud XL"),
    byggstartFactor: 1,
    mittanbudFactor: 1,
    extraCalloutNok: moneyAmount(input.extraCalloutNok, "Ekstra oppmøte"),
    tileAllowanceExVat: moneyAmount(input.tileAllowanceExVat, "Flis"),
  };
  await prisma.priceList.update({ where: { id }, data });
  const actor = await prisma.user.findUnique({ where: { id: user.id }, select: { name: true } });
  await prisma.priceChangeLog.create({
    data: { priceListId: id, actorId: user.id, actorName: actor?.name ?? user.id, action: "commercial.update", detail: data },
  });
  await audit(user.id, "pricelist.commercial", "pricelist", id, data);
  return data;
}

export async function updateTradeRate(
  user: { id: string; role: string },
  id: string,
  tradeCode: string,
  input: { hourlyRateSale?: unknown; calloutPrice?: unknown },
) {
  assertAdmin(user);
  if (!TRADE_CODES.includes(tradeCode as (typeof TRADE_CODES)[number])) throw new DomainError("Ukjent fag");
  const hourlyRateSale = moneyAmount(input.hourlyRateSale, "Timepris");
  const rawCallout = input.calloutPrice;
  const calloutPrice = rawCallout == null || rawCallout === "" ? null : moneyAmount(rawCallout, "Oppmøte");
  const rate = await prisma.tradeRate.findUnique({ where: { priceListId_tradeId: { priceListId: id, tradeId: tradeCode } } });
  if (!rate) throw new DomainError("Fant ikke fagsatsen");
  await prisma.tradeRate.update({ where: { id: rate.id }, data: { hourlyRateSale, calloutPrice } });
  const actor = await prisma.user.findUnique({ where: { id: user.id }, select: { name: true } });
  await prisma.priceChangeLog.create({
    data: {
      priceListId: id,
      actorId: user.id,
      actorName: actor?.name ?? user.id,
      action: "rate.update",
      detail: { tradeCode, hourlyRateSale, calloutPrice },
    },
  });
  await audit(user.id, "pricelist.rate", "pricelist", id, { tradeCode, hourlyRateSale, calloutPrice });
  return { tradeCode, hourlyRateSale, calloutPrice };
}
