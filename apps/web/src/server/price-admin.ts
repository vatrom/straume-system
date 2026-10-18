import { prisma, type PriceItemType } from "@straume/db";
import {
  activatePriceList,
  addPriceLine,
  computeSalePrice,
  createAdjustedVersion,
  DomainError,
  TRADE_CODES,
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
  };
}

async function loadList(id: string): Promise<PriceListInput> {
  const list = await prisma.priceList.findUnique({
    where: { id },
    include: { lines: { include: { priceItem: true } }, rates: true },
  });
  if (!list) throw new DomainError("Fant ikke prislisten");
  return {
    id: list.id,
    name: list.name,
    validFrom: list.validFrom.toISOString().slice(0, 10),
    validTo: list.validTo ? list.validTo.toISOString().slice(0, 10) : null,
    status: list.status,
    lines: list.lines.map(toLine),
    rates: list.rates.map((rate) => ({
      tradeCode: rate.tradeId,
      hourlyRateSale: dec(rate.hourlyRateSale) ?? 0,
      hourlyRateInternal: dec(rate.hourlyRateInternal) ?? 0,
      calloutPrice: dec(rate.calloutPrice) ?? 0,
      defaultMaterialMarkup: dec(rate.defaultMaterialMarkup) ?? 0,
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
  const lines = list.lines
    .map((line) => ({ ...line, salePriceExVat: computeSalePrice(line, list.rates) }))
    .sort((a, b) => a.tradeCode.localeCompare(b.tradeCode) || a.sortOrder - b.sortOrder);
  return { ...list, lines };
}

export async function adjustPriceList(
  user: { id: string; role: string },
  id: string,
  input: { name: string; validFrom: string; percent: number; tradeCodes?: string[]; includeLaborRates?: boolean },
) {
  assertAdmin(user);
  const source = await loadList(id);
  const nextId = crypto.randomUUID();
  const { previous, next } = createAdjustedVersion(source, { ...input, id: nextId });
  await prisma.$transaction(async (tx) => {
    await tx.priceList.update({ where: { id }, data: { validTo: new Date(`${previous.validTo}T00:00:00.000Z`) } });
    await tx.priceList.create({
      data: {
        id: next.id,
        name: next.name,
        validFrom: new Date(`${next.validFrom}T00:00:00.000Z`),
        status: "draft",
        createdFromId: id,
        adjustmentPercent: input.percent,
        comment: `Justert ${input.percent} % fra ${source.name}`,
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
  });
  await audit(user.id, "pricelist.version", "pricelist", nextId, { from: id, percent: input.percent });
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
  input: Partial<Pick<PriceLineInput, "name" | "materialCost" | "materialMarkup" | "hoursPerUnit" | "hourlyRateOverride" | "salePriceOverride" | "quantityFormula" | "active" | "internalNote">>,
) {
  assertAdmin(user);
  if (input.name || input.quantityFormula !== undefined || input.active !== undefined || input.internalNote !== undefined) {
    await prisma.priceItem.update({
      where: { id: itemId },
      data: {
        name: input.name?.trim() || undefined,
        quantityFormula: input.quantityFormula,
        active: input.active,
        internalNote: input.internalNote,
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
  await audit(user.id, "priceline.update", "priceline", itemId, { priceListId });
}
