import { parseCsv } from "./csv";
import { DomainError } from "./errors";
import { addDays, round4, roundMoney } from "./money";
import { priceItemCode, TRADE_CODES, type TradeCode } from "./trades";

export type PriceItemType = "unit_price" | "hours" | "callout" | "package" | "freetext" | "percent_addon";

export type PriceLineInput = {
  itemId: string;
  code: string;
  tradeCode: string;
  name: string;
  unit: string;
  type: PriceItemType;
  materialCost: number;
  materialMarkup: number | null;
  hoursPerUnit: number;
  hourlyRateOverride: number | null;
  salePriceOverride: number | null;
  quantityFormula: string | null;
  costFormula: string | null;
  internalNote: string | null;
  customerVisible: boolean;
  active: boolean;
  sortOrder: number;
};

export type RateInput = {
  tradeCode: string;
  hourlyRateSale: number;
  hourlyRateInternal: number;
  calloutPrice: number;
  defaultMaterialMarkup: number;
};

export type PriceListInput = {
  id: string;
  name: string;
  validFrom: string;
  validTo: string | null;
  status: "draft" | "active" | "archived";
  lines: PriceLineInput[];
  rates: RateInput[];
};

export const DEFAULT_TRADE_RATES: RateInput[] = [
  { tradeCode: "riving", hourlyRateSale: 930, hourlyRateInternal: 395, calloutPrice: 450, defaultMaterialMarkup: 0.2 },
  { tradeCode: "tomrer", hourlyRateSale: 910, hourlyRateInternal: 395, calloutPrice: 450, defaultMaterialMarkup: 0.3 },
  { tradeCode: "elektriker", hourlyRateSale: 1190, hourlyRateInternal: 395, calloutPrice: 550, defaultMaterialMarkup: 0 },
  { tradeCode: "rorlegger", hourlyRateSale: 990, hourlyRateInternal: 395, calloutPrice: 450, defaultMaterialMarkup: 0.4 },
  { tradeCode: "murer", hourlyRateSale: 910, hourlyRateInternal: 395, calloutPrice: 450, defaultMaterialMarkup: 0.4 },
  { tradeCode: "maler", hourlyRateSale: 910, hourlyRateInternal: 395, calloutPrice: 450, defaultMaterialMarkup: 0.4 },
  { tradeCode: "annet", hourlyRateSale: 0, hourlyRateInternal: 0, calloutPrice: 0, defaultMaterialMarkup: 0 },
];

const TYPE_MAP: Record<string, PriceItemType> = {
  timer: "hours",
  enhetspris: "unit_price",
  oppmote: "callout",
  pakke: "package",
  fritekst: "freetext",
  prosent_tillegg: "percent_addon",
};

const FORMULA_MAP: Record<string, string> = {
  "=(B1/0.6)*1.2": "(omkrets/0.6)*1.2",
  "=B3": "gulvareal",
  "=B3+(B1*B2)": "gulvareal+(omkrets*romhoyde)",
  "=B1": "omkrets",
  "=D101*1.3": "flisareal*1.3",
  "=D16+D17": "gipshimling+gipsvegger",
};

export function normalizeUnit(unit: string): string {
  const value = unit.trim().toLowerCase();
  if (value === "stk" || value === "st") return "stk";
  if (value === "m2" || value === "m²") return "m2";
  if (value === "lm") return "lm";
  if (value === "t" || value === "time" || value === "timer") return "t";
  if (value === "kg") return "kg";
  if (value === "km") return "km";
  if (value === "rs") return "rs";
  return value || "stk";
}

function num(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function translateQuantityFormula(formula: string): string | null {
  const trimmed = formula.trim();
  if (!trimmed) return null;
  return FORMULA_MAP[trimmed] ?? (trimmed.startsWith("=") ? `excel:${trimmed}` : trimmed);
}

export function computeSalePrice(line: PriceLineInput, rates: RateInput[]): number {
  if (line.type === "percent_addon") return roundMoney(line.salePriceOverride ?? 0);
  if (line.salePriceOverride != null) return roundMoney(line.salePriceOverride);
  const rate = rates.find((item) => item.tradeCode === line.tradeCode);
  if (!rate) throw new DomainError(`Mangler fagsats for ${line.tradeCode}`);
  const markup = line.materialMarkup ?? rate.defaultMaterialMarkup;
  const hourly = line.hourlyRateOverride ?? rate.hourlyRateSale;
  return roundMoney(line.materialCost * (1 + markup) + line.hoursPerUnit * hourly);
}

export type SpreadsheetPriceRow = {
  kategori: string;
  kategori_navn: string;
  sortering: string;
  navn: string;
  type: string;
  enhet: string;
  salgspris_eks_mva: string;
  materialkost_pr_enhet: string;
  paslag_material: string;
  timer_pr_enhet: string;
  timesats: string;
  mengdeformel_mal: string;
  merknad: string;
  materialkost_formel: string;
};

export function lineFromSpreadsheetRow(row: SpreadsheetPriceRow, rates: RateInput[] = DEFAULT_TRADE_RATES): PriceLineInput {
  const tradeCode = row.kategori.trim();
  if (!TRADE_CODES.includes(tradeCode as TradeCode)) {
    throw new DomainError(`Ukjent fag i prisrad: ${tradeCode}`);
  }
  const sortOrder = Number(row.sortering);
  const type = TYPE_MAP[row.type.trim()];
  if (!type || !Number.isInteger(sortOrder)) throw new DomainError(`Ugyldig prisrad: ${row.navn}`);
  const rate = rates.find((item) => item.tradeCode === tradeCode);
  if (!rate) throw new DomainError(`Mangler fagsats for ${tradeCode}`);
  const sheetPrice = num(row.salgspris_eks_mva);
  const timesats = num(row.timesats);
  const draft: PriceLineInput = {
    itemId: priceItemCode(tradeCode, sortOrder),
    code: priceItemCode(tradeCode, sortOrder),
    tradeCode,
    name: row.navn.trim(),
    unit: normalizeUnit(row.enhet),
    type,
    materialCost: num(row.materialkost_pr_enhet) ?? 0,
    materialMarkup: num(row.paslag_material),
    hoursPerUnit: num(row.timer_pr_enhet) ?? 0,
    hourlyRateOverride: timesats != null && timesats !== rate.hourlyRateSale ? timesats : null,
    salePriceOverride: null,
    quantityFormula: translateQuantityFormula(row.mengdeformel_mal),
    costFormula: row.materialkost_formel.trim() || null,
    internalNote: row.merknad.trim() || null,
    customerVisible: type !== "freetext" && type !== "percent_addon",
    active: true,
    sortOrder,
  };
  if (type === "percent_addon" || type === "freetext") {
    draft.salePriceOverride = sheetPrice ?? 0;
    return draft;
  }
  const computed = computeSalePrice(draft, rates);
  if (sheetPrice != null && Math.abs(computed - sheetPrice) > 0.02) {
    draft.salePriceOverride = roundMoney(sheetPrice);
  }
  return draft;
}

export function priceListFromCsv(csv: string, meta: { id: string; name: string; validFrom: string }): PriceListInput {
  const rows = parseCsv(csv) as SpreadsheetPriceRow[];
  const lines = rows.map((row) => lineFromSpreadsheetRow(row));
  const codes = new Set(lines.map((line) => line.code));
  if (codes.size !== lines.length) throw new DomainError("Prispostkoder er ikke unike");
  return {
    id: meta.id,
    name: meta.name,
    validFrom: meta.validFrom,
    validTo: null,
    status: "active",
    lines,
    rates: DEFAULT_TRADE_RATES.map((rate) => ({ ...rate })),
  };
}

function inScope(tradeCode: string, tradeCodes: string[] | undefined): boolean {
  return !tradeCodes || tradeCodes.length === 0 || tradeCodes.includes(tradeCode);
}

/**
 * Årlig justering: kopier prislisten til et nytt utkast og juster valgte fag med en prosent.
 * Materialkost og eventuell overstyrt salgspris skaleres. Timer og (som standard) timesatser beholdes.
 * Prosenttillegg og fritekstlinjer justeres ikke. Forrige liste beholder status, men får gyldig-til.
 */
export function createAdjustedVersion(
  source: PriceListInput,
  opts: {
    id: string;
    name: string;
    validFrom: string;
    percent: number;
    tradeCodes?: string[];
    includeLaborRates?: boolean;
  },
): { previous: PriceListInput; next: PriceListInput } {
  const name = opts.name.trim();
  if (!name) throw new DomainError("Ny prisliste må ha et navn");
  if (!Number.isFinite(opts.percent) || opts.percent <= -100 || opts.percent > 500) {
    throw new DomainError("Prosent må være over -100 og høyst 500");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.validFrom) || opts.validFrom <= source.validFrom) {
    throw new DomainError("Ny prisliste må gjelde fra en senere dato");
  }
  const factor = 1 + opts.percent / 100;
  const dayBefore = addDays(opts.validFrom, -1);
  const validTo = !source.validTo || source.validTo > dayBefore ? dayBefore : source.validTo;
  const previous: PriceListInput = { ...source, validTo, lines: source.lines, rates: source.rates };
  const next: PriceListInput = {
    id: opts.id,
    name,
    validFrom: opts.validFrom,
    validTo: null,
    status: "draft",
    lines: source.lines.map((line) => {
      if (!inScope(line.tradeCode, opts.tradeCodes)) return { ...line };
      if (line.type === "percent_addon" || line.type === "freetext") return { ...line };
      return {
        ...line,
        materialCost: round4(line.materialCost * factor),
        salePriceOverride: line.salePriceOverride == null ? null : roundMoney(line.salePriceOverride * factor),
        hourlyRateOverride:
          opts.includeLaborRates && line.hourlyRateOverride != null
            ? roundMoney(line.hourlyRateOverride * factor)
            : line.hourlyRateOverride,
      };
    }),
    rates: source.rates.map((rate) => {
      if (!opts.includeLaborRates || !inScope(rate.tradeCode, opts.tradeCodes)) return { ...rate };
      return {
        ...rate,
        hourlyRateSale: roundMoney(rate.hourlyRateSale * factor),
        hourlyRateInternal: roundMoney(rate.hourlyRateInternal * factor),
        calloutPrice: roundMoney(rate.calloutPrice * factor),
      };
    }),
  };
  return { previous, next };
}

export function addPriceLine(list: PriceListInput, line: PriceLineInput): PriceListInput {
  const name = line.name.trim();
  const code = line.code.trim();
  if (!name || !code) throw new DomainError("Prisposten må ha kode og navn");
  if (list.lines.some((existing) => existing.code === code || existing.itemId === line.itemId)) {
    throw new DomainError("Prisposten finnes allerede i prislisten");
  }
  if (!list.rates.some((rate) => rate.tradeCode === line.tradeCode)) {
    throw new DomainError("Ukjent fag");
  }
  if (!TRADE_CODES.includes(line.tradeCode as TradeCode)) throw new DomainError("Ukjent fag");
  return { ...list, lines: [...list.lines, { ...line, name, code }] };
}

export function activatePriceList<T extends { id: string; status: PriceListInput["status"] }>(lists: T[], id: string): T[] {
  if (!lists.some((list) => list.id === id)) throw new DomainError("Fant ikke prislisten");
  return lists.map((list) => {
    if (list.id === id) return { ...list, status: "active" };
    if (list.status === "active") return { ...list, status: "archived" };
    return list;
  });
}
