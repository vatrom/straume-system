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
  /** known = timer og materiell fra underarket. derived = utledet fra totalpris eller formel. uncertain = må kontrolleres. */
  splitConfidence?: "known" | "derived" | "uncertain";
  splitNote?: string | null;
};

export type RateInput = {
  tradeCode: string;
  hourlyRateSale: number;
  hourlyRateInternal: number;
  /** Null bruker den felles satsen for ekstra oppmøte. Et tall er overstyring for dette faget. */
  calloutPrice: number | null;
  defaultMaterialMarkup: number;
  /** Underleverandør prises uten egne timer. */
  subcontractor?: boolean;
};

/** Satser som følger prislisten, ikke den enkelte varelinjen. */
export type CommercialSettings = {
  vatRate: number;
  byggstartPercent: number;
  byggstartFactor: number;
  mittanbudPercent: number;
  mittanbudFactor: number;
  /** Felles ekstra oppmøte eks. mva. Per fag kan overstyres med calloutPrice. */
  extraCalloutNok: number | null;
  /** Standardpris for flis eks. mva per m². Inkl. mva er dette ganger (1 + mva). */
  tileAllowanceExVat: number | null;
  /** Etterkalkylen antar elektriker-kost = salgspris / denne faktoren når linjen mangler kostoppdeling. */
  electricianCostFactor: number;
  /** Timesats for montering av innredning kunden leverer selv. Null betyr ikke avklart. */
  assemblyHourlyNok: number | null;
};

export const DEFAULT_COMMERCIAL: CommercialSettings = {
  vatRate: 0.25,
  byggstartPercent: 0.08,
  byggstartFactor: 1,
  mittanbudPercent: 0.05,
  mittanbudFactor: 1,
  extraCalloutNok: 490,
  tileAllowanceExVat: 400,
  electricianCostFactor: 1.15,
  assemblyHourlyNok: 1450,
};

export type PriceListInput = {
  id: string;
  name: string;
  validFrom: string;
  validTo: string | null;
  status: "draft" | "active" | "archived";
  lines: PriceLineInput[];
  rates: RateInput[];
  commercial?: CommercialSettings;
};

/**
 * Poster Vidar la til etter regnearket. Seed oppretter dem bare når koden mangler.
 * TOM-020: materiell 800 kr i kost med tømrerpåslag 0,3, pluss 3 timer à 910 kr.
 * EL-016: underleverandør, 1,5 time × 1 150 kr, uten egne timer.
 */
export const VIDAR_PRICE_LINES: PriceLineInput[] = [
  {
    itemId: "TOM-020",
    code: "TOM-020",
    tradeCode: "tomrer",
    name: "Bygge toalettkasse (arbeid og materiell)",
    unit: "stk",
    type: "unit_price",
    materialCost: 800,
    materialMarkup: 0.3,
    hoursPerUnit: 3,
    hourlyRateOverride: null,
    salePriceOverride: null,
    quantityFormula: null,
    costFormula: null,
    internalNote: "3 timer tømrer à 910 kr og materiellkost 800 kr med tømrerpåslag 30 %.",
    customerVisible: true,
    active: true,
    sortOrder: 20,
    splitConfidence: "known",
    splitNote: "3 t × 910 kr pluss materiell 800 kr × 1,3.",
  },
  {
    itemId: "EL-016",
    code: "EL-016",
    tradeCode: "elektriker",
    name: "Tilkobling av VVB",
    unit: "stk",
    type: "unit_price",
    materialCost: 0,
    materialMarkup: 0,
    hoursPerUnit: 0,
    hourlyRateOverride: null,
    salePriceOverride: 1725,
    quantityFormula: null,
    costFormula: null,
    internalNote: "Underleverandør. 1,5 time × 1 150 kr eks. mva. Ingen egne timer.",
    customerVisible: true,
    active: true,
    sortOrder: 16,
    splitConfidence: "known",
    splitNote: "Underleverandør. Fast salgspris uten egne timer.",
  },
];

export const DEFAULT_TRADE_RATES: RateInput[] = [
  { tradeCode: "riving", hourlyRateSale: 930, hourlyRateInternal: 395, calloutPrice: null, defaultMaterialMarkup: 0.2, subcontractor: false },
  { tradeCode: "tomrer", hourlyRateSale: 910, hourlyRateInternal: 395, calloutPrice: null, defaultMaterialMarkup: 0.3, subcontractor: false },
  { tradeCode: "elektriker", hourlyRateSale: 1150, hourlyRateInternal: 395, calloutPrice: null, defaultMaterialMarkup: 0, subcontractor: true },
  { tradeCode: "rorlegger", hourlyRateSale: 990, hourlyRateInternal: 395, calloutPrice: null, defaultMaterialMarkup: 0.4, subcontractor: false },
  { tradeCode: "murer", hourlyRateSale: 910, hourlyRateInternal: 395, calloutPrice: null, defaultMaterialMarkup: 0.4, subcontractor: false },
  { tradeCode: "maler", hourlyRateSale: 910, hourlyRateInternal: 395, calloutPrice: null, defaultMaterialMarkup: 0.4, subcontractor: false },
  { tradeCode: "annet", hourlyRateSale: 0, hourlyRateInternal: 0, calloutPrice: null, defaultMaterialMarkup: 0, subcontractor: false },
];

/** Timepris som stod i de gamle tekstmalene og i regnearkets elektrikerlinjer. Erstattes av fagsatsen. */
const LEGACY_ELECTRICIAN_HOUR = 1190;
const LEGACY_CALLOUTS = new Set([450, 500, 550]);

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
  if (rate.subcontractor) return roundMoney(line.materialCost * (1 + markup));
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
  const materialRaw = num(row.materialkost_pr_enhet);
  const hoursRaw = num(row.timer_pr_enhet);
  const hasSplit = materialRaw != null || hoursRaw != null || timesats != null;
  const notes = [row.merknad.trim()].filter(Boolean);
  let splitConfidence: "known" | "derived" | "uncertain" = hasSplit ? "known" : "uncertain";
  const draft: PriceLineInput = {
    itemId: priceItemCode(tradeCode, sortOrder),
    code: priceItemCode(tradeCode, sortOrder),
    tradeCode,
    name: row.navn.trim(),
    unit: normalizeUnit(row.enhet),
    type,
    materialCost: materialRaw ?? 0,
    materialMarkup: num(row.paslag_material),
    hoursPerUnit: hoursRaw ?? 0,
    hourlyRateOverride: timesats != null && timesats !== rate.hourlyRateSale ? timesats : null,
    salePriceOverride: null,
    quantityFormula: translateQuantityFormula(row.mengdeformel_mal),
    costFormula: row.materialkost_formel.trim() || null,
    internalNote: row.merknad.trim() || null,
    customerVisible: type !== "freetext" && type !== "percent_addon",
    active: true,
    sortOrder,
    splitConfidence,
    splitNote: null,
  };
  const backward = row.materialkost_formel.trim().match(/^=\s*([0-9]+(?:[.,][0-9]+)?)\s*\/\s*([0-9]+(?:[.,][0-9]+)?)\s*$/);
  if (materialRaw == null && backward && type !== "freetext" && type !== "percent_addon") {
    const target = Number(backward[1]!.replace(",", "."));
    const divisor = Number(backward[2]!.replace(",", "."));
    if (divisor > 0) {
      draft.materialCost = round4(target / divisor);
      draft.materialMarkup = round4(divisor - 1);
      splitConfidence = "derived";
      notes.push(`Materiell utledet fra formelen ${row.materialkost_formel.trim()}.`);
    }
  }
  if (rate.subcontractor && type !== "freetext" && type !== "percent_addon" && type !== "callout") {
    draft.hoursPerUnit = 0;
    draft.hourlyRateOverride = null;
    const price = type === "hours" && sheetPrice === LEGACY_ELECTRICIAN_HOUR ? rate.hourlyRateSale : sheetPrice;
    if (price != null) draft.salePriceOverride = roundMoney(price);
    draft.splitConfidence = "known";
    draft.splitNote = [...notes, "Underleverandør. Fast salgspris uten egne timer."].filter(Boolean).join(" ");
    return draft;
  }
  if (type === "callout") {
    const common = rate.calloutPrice ?? DEFAULT_COMMERCIAL.extraCalloutNok;
    if (common != null && (sheetPrice == null || LEGACY_CALLOUTS.has(sheetPrice))) draft.salePriceOverride = common;
    draft.splitConfidence = "known";
    draft.splitNote = [...notes, "Oppmøte bruker felles sats, med mindre faget har en overstyring."].filter(Boolean).join(" ");
    return draft;
  }
  if (!hasSplit && type === "hours" && sheetPrice != null) {
    draft.hoursPerUnit = 1;
    draft.materialCost = 0;
    draft.hourlyRateOverride = sheetPrice !== rate.hourlyRateSale ? sheetPrice : null;
    splitConfidence = "derived";
    notes.push("Utledet som én time fra totalpris. Kontroller timepris.");
  } else if (!hasSplit && type !== "freetext" && type !== "percent_addon") {
    splitConfidence = "uncertain";
    notes.push("Kun totalpris i regnearket. Timer og materiell må kontrolleres manuelt.");
  }
  draft.splitConfidence = splitConfidence;
  draft.splitNote = notes.join(" ") || null;
  if (type === "percent_addon" || type === "freetext") {
    draft.salePriceOverride = sheetPrice ?? 0;
    draft.splitConfidence = "known";
    return draft;
  }
  const computed = computeSalePrice(draft, rates);
  if (sheetPrice != null && Math.abs(computed - sheetPrice) > 0.02) {
    draft.salePriceOverride = roundMoney(sheetPrice);
    if (draft.splitConfidence === "known") {
      draft.splitNote = [draft.splitNote, "Salgspris i regnearket avviker fra timer + materiell og er lagret som overstyring."].filter(Boolean).join(" ");
    }
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
    commercial: { ...DEFAULT_COMMERCIAL },
    lines,
    rates: DEFAULT_TRADE_RATES.map((rate) => ({ ...rate })),
  };
}

function scaleCommercial(
  commercial: CommercialSettings | undefined,
  factor: number,
  includeLaborRates: boolean | undefined,
): CommercialSettings | undefined {
  if (!commercial) return undefined;
  return {
    ...commercial,
    tileAllowanceExVat: commercial.tileAllowanceExVat == null ? null : roundMoney(commercial.tileAllowanceExVat * factor),
    extraCalloutNok:
      includeLaborRates && commercial.extraCalloutNok != null ? roundMoney(commercial.extraCalloutNok * factor) : commercial.extraCalloutNok,
    assemblyHourlyNok:
      includeLaborRates && commercial.assemblyHourlyNok != null ? roundMoney(commercial.assemblyHourlyNok * factor) : commercial.assemblyHourlyNok,
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
    commercial: scaleCommercial(source.commercial, factor, opts.includeLaborRates),
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
        calloutPrice: rate.calloutPrice == null ? null : roundMoney(rate.calloutPrice * factor),
      };
    }),
  };
  return { previous, next };
}

/**
 * Ny prisversjon der materiell og timepris justeres hver for seg.
 * Fastpris uten komponenter (usikker splitt) følger materialprosenten.
 * Rene timeposter med overstyring følger timeprosenten. Oppmøte følger timepris.
 */
export function adjustComponents(
  source: PriceListInput,
  opts: {
    id: string;
    name: string;
    validFrom: string;
    materialPercent: number;
    laborPercent: number;
    tradeCodes?: string[];
  },
): { previous: PriceListInput; next: PriceListInput } {
  const name = opts.name.trim();
  if (!name) throw new DomainError("Ny prisliste må ha et navn");
  for (const percent of [opts.materialPercent, opts.laborPercent]) {
    if (!Number.isFinite(percent) || percent <= -100 || percent > 500) throw new DomainError("Prosent må være over -100 og høyst 500");
  }
  if (opts.materialPercent === 0 && opts.laborPercent === 0) throw new DomainError("Oppgi prosent for materiell, timepris eller begge");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.validFrom) || opts.validFrom <= source.validFrom) {
    throw new DomainError("Ny prisliste må gjelde fra en senere dato");
  }
  const materialFactor = 1 + opts.materialPercent / 100;
  const laborFactor = 1 + opts.laborPercent / 100;
  const dayBefore = addDays(opts.validFrom, -1);
  const validTo = !source.validTo || source.validTo > dayBefore ? dayBefore : source.validTo;
  const previous: PriceListInput = { ...source, validTo };
  const next: PriceListInput = {
    id: opts.id,
    name,
    validFrom: opts.validFrom,
    validTo: null,
    status: "draft",
    commercial: source.commercial
      ? {
          ...source.commercial,
          tileAllowanceExVat:
            source.commercial.tileAllowanceExVat == null ? null : roundMoney(source.commercial.tileAllowanceExVat * materialFactor),
          extraCalloutNok: source.commercial.extraCalloutNok == null ? null : roundMoney(source.commercial.extraCalloutNok * laborFactor),
          assemblyHourlyNok:
            source.commercial.assemblyHourlyNok == null ? null : roundMoney(source.commercial.assemblyHourlyNok * laborFactor),
        }
      : undefined,
    lines: source.lines.map((line) => {
      if (!inScope(line.tradeCode, opts.tradeCodes)) return { ...line };
      if (line.type === "percent_addon" || line.type === "freetext") return { ...line };
      const pureFixed = line.materialCost === 0 && line.hoursPerUnit === 0;
      const pureLabor = line.materialCost === 0 && line.hoursPerUnit > 0;
      let override = line.salePriceOverride;
      if (override != null && pureFixed && line.type !== "callout") override = roundMoney(override * materialFactor);
      if (override != null && (line.type === "callout" || pureLabor)) override = roundMoney(override * laborFactor);
      return {
        ...line,
        materialCost: round4(line.materialCost * materialFactor),
        hourlyRateOverride: line.hourlyRateOverride == null ? null : roundMoney(line.hourlyRateOverride * laborFactor),
        salePriceOverride: override,
      };
    }),
    rates: source.rates.map((rate) => {
      if (!inScope(rate.tradeCode, opts.tradeCodes)) return { ...rate };
      return {
        ...rate,
        hourlyRateSale: roundMoney(rate.hourlyRateSale * laborFactor),
        hourlyRateInternal: roundMoney(rate.hourlyRateInternal * laborFactor),
        calloutPrice: rate.calloutPrice == null ? null : roundMoney(rate.calloutPrice * laborFactor),
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
