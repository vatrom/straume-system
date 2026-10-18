import { DomainError } from "./errors";
import { roundMoney } from "./money";
import { round4 } from "./money";
import { DEFAULT_COMMERCIAL, type CommercialSettings, type PriceItemType, type PriceLineInput, type RateInput } from "./pricing";
import { TRADES } from "./trades";

export type ChannelCode = "none" | "byggstart" | "mittanbud";
export type { CommercialSettings };
export { DEFAULT_COMMERCIAL };

export type CalcLine = {
  code: string;
  tradeCode: string;
  name: string;
  unit: string;
  type: PriceItemType;
  quantity: number;
  materialCost: number;
  materialMarkup: number | null;
  hoursPerUnit: number;
  hourlyRateOverride: number | null;
  salePriceOverride: number | null;
  /** Manuell enhetspris på tilbudet. Motoren regner ellers prisen selv. */
  unitPriceOverride?: number | null;
  optional?: boolean;
  included?: boolean;
  internal?: boolean;
};

export type PricedLine = {
  code: string;
  tradeCode: string;
  name: string;
  unit: string;
  type: PriceItemType;
  quantity: number;
  unitPriceExVat: number;
  materialCostPerUnit: number;
  hoursPerUnit: number;
  hours: number;
  hourlyRate: number;
  lineSumExVat: number;
  lineCostExVat: number;
  included: boolean;
  optional: boolean;
  internal: boolean;
  priceSource: "formula" | "list" | "manual";
};

export type TradeTotal = {
  tradeCode: string;
  name: string;
  sumExVat: number;
  hours: number;
  costExVat: number;
};

export type CalcTotals = {
  lines: PricedLine[];
  trades: TradeTotal[];
  workExVat: number;
  extraProfitExVat: number;
  channelCode: ChannelCode;
  channelName: string;
  channelPercent: number;
  channelFactor: number;
  channelExVat: number;
  addonsExVat: number;
  subtotalExVat: number;
  vatRate: number;
  vatNok: number;
  totalIncVat: number;
  costExVat: number;
  contributionExVat: number;
  /** Dekningsgrad mot sum eks. mva. Regnearket deler på sum inkl. mva. */
  marginExVat: number;
  hoursTotal: number;
  spreadsheetMarginIncVat: number;
};

const CHANNEL_NAME: Record<ChannelCode, string> = {
  none: "Ingen kanal",
  byggstart: "Byggstart",
  mittanbud: "MittAnbud",
};

export function channelFromSource(source: string | null | undefined): ChannelCode {
  const value = (source ?? "").toLowerCase();
  if (value.includes("byggstart")) return "byggstart";
  if (value.includes("mittanbud") || value.includes("mitt anbud")) return "mittanbud";
  return "none";
}

export function priceLineToCalc(line: PriceLineInput, quantity: number, patch?: Partial<CalcLine>): CalcLine {
  return {
    code: line.code,
    tradeCode: line.tradeCode,
    name: line.name,
    unit: line.unit,
    type: line.type,
    quantity,
    materialCost: line.materialCost,
    materialMarkup: line.materialMarkup,
    hoursPerUnit: line.hoursPerUnit,
    hourlyRateOverride: line.hourlyRateOverride,
    salePriceOverride: line.salePriceOverride,
    ...patch,
  };
}

export function lookupLine(lines: PriceLineInput[], code: string): PriceLineInput {
  const found = lines.find((line) => line.code === code);
  if (!found) throw new DomainError(`Ukjent varekode ${code}`);
  return found;
}

function commercialOf(partial?: Partial<CommercialSettings>): CommercialSettings {
  return { ...DEFAULT_COMMERCIAL, ...partial };
}

function isIncluded(line: CalcLine): boolean {
  if (line.internal) return false;
  if (line.type === "percent_addon" || line.type === "freetext") return false;
  if (!(line.quantity > 0)) return false;
  if (line.optional) return line.included === true;
  return line.included !== false;
}

function hourly(line: CalcLine, rates: RateInput[]): number {
  const rate = rates.find((item) => item.tradeCode === line.tradeCode);
  return line.hourlyRateOverride ?? rate?.hourlyRateSale ?? 0;
}

function internalHourly(line: CalcLine, rates: RateInput[]): number {
  const rate = rates.find((item) => item.tradeCode === line.tradeCode);
  return rate?.hourlyRateInternal ?? 0;
}

export function calculateQuote(input: {
  lines: CalcLine[];
  rates: RateInput[];
  commercial?: Partial<CommercialSettings>;
  extraProfitNok?: number;
  channel?: ChannelCode;
}): CalcTotals {
  const commercial = commercialOf(input.commercial);
  if (!(commercial.vatRate >= 0) || commercial.vatRate > 1) throw new DomainError("MVA-sats må være mellom 0 og 1");
  if (!(commercial.electricianCostFactor > 0)) throw new DomainError("Kostfaktor for elektriker må være større enn 0");
  const channel = input.channel ?? "none";
  const priced: PricedLine[] = input.lines.map((line) => priceOne(line, input.rates, commercial));
  const workExVat = roundMoney(priced.filter((line) => line.included).reduce((sum, line) => sum + line.lineSumExVat, 0));
  const extraProfitExVat = roundMoney(Math.max(0, input.extraProfitNok ?? 0));
  const channelRule =
    channel === "byggstart"
      ? { percent: commercial.byggstartPercent, factor: commercial.byggstartFactor }
      : channel === "mittanbud"
        ? { percent: commercial.mittanbudPercent, factor: commercial.mittanbudFactor }
        : { percent: 0, factor: 1 };
  const channelExVat = roundMoney(workExVat * channelRule.percent * channelRule.factor);
  const addonsExVat = roundMoney(extraProfitExVat + channelExVat);
  const subtotalExVat = roundMoney(workExVat + addonsExVat);
  const vatNok = roundMoney(subtotalExVat * commercial.vatRate);
  const totalIncVat = roundMoney(subtotalExVat + vatNok);
  const lineCost = roundMoney(priced.filter((line) => line.included).reduce((sum, line) => sum + line.lineCostExVat, 0));
  const costExVat = lineCost;
  const contributionExVat = roundMoney(subtotalExVat - costExVat);
  const marginExVat = subtotalExVat === 0 ? 0 : contributionExVat / subtotalExVat;
  const spreadsheetBase = totalIncVat;
  const spreadsheetMarginIncVat = spreadsheetBase === 0 ? 0 : (spreadsheetBase - costExVat) / spreadsheetBase;
  const trades = TRADES.map((trade) => {
    const rows = priced.filter((line) => line.included && line.tradeCode === trade.code);
    return {
      tradeCode: trade.code,
      name: trade.name,
      sumExVat: roundMoney(rows.reduce((sum, line) => sum + line.lineSumExVat, 0)),
      hours: roundMoney(rows.reduce((sum, line) => sum + line.hours, 0)),
      costExVat: roundMoney(rows.reduce((sum, line) => sum + line.lineCostExVat, 0)),
    };
  }).filter((trade) => trade.sumExVat !== 0 || trade.hours !== 0);
  return {
    lines: priced,
    trades,
    workExVat,
    extraProfitExVat,
    channelCode: channel,
    channelName: CHANNEL_NAME[channel],
    channelPercent: channelRule.percent,
    channelFactor: channelRule.factor,
    channelExVat,
    addonsExVat,
    subtotalExVat,
    vatRate: commercial.vatRate,
    vatNok,
    totalIncVat,
    costExVat,
    contributionExVat,
    marginExVat,
    hoursTotal: roundMoney(trades.reduce((sum, trade) => sum + trade.hours, 0)),
    spreadsheetMarginIncVat,
  };
}

function priceOne(line: CalcLine, rates: RateInput[], commercial: CommercialSettings): PricedLine {
  const included = isIncluded(line);
  const hours = roundMoney(Math.max(0, line.quantity) * Math.max(0, line.hoursPerUnit));
  let exact = 0;
  let priceSource: PricedLine["priceSource"] = "formula";
  if (line.unitPriceOverride != null) {
    exact = line.unitPriceOverride;
    priceSource = "manual";
  } else if (line.type === "percent_addon" || line.salePriceOverride != null) {
    exact = line.salePriceOverride ?? 0;
    priceSource = "list";
  } else {
    const rate = rates.find((item) => item.tradeCode === line.tradeCode);
    if (!rate) throw new DomainError(`Mangler fagsats for ${line.tradeCode}`);
    const markup = line.materialMarkup ?? rate.defaultMaterialMarkup;
    const hourlyRate = line.hourlyRateOverride ?? rate.hourlyRateSale;
    exact = line.materialCost * (1 + markup) + line.hoursPerUnit * hourlyRate;
    priceSource = "formula";
  }
  const unitPrice = round4(exact);
  const lineSumExVat = included ? roundMoney(exact * line.quantity) : 0;
  const lineCostExVat = included ? lineCost(line, hours, lineSumExVat, rates, commercial) : 0;
  return {
    code: line.code,
    tradeCode: line.tradeCode,
    name: line.name,
    unit: line.unit,
    type: line.type,
    quantity: line.quantity,
    unitPriceExVat: unitPrice,
    materialCostPerUnit: line.materialCost,
    hoursPerUnit: line.hoursPerUnit,
    hours,
    hourlyRate: hourly(line, rates),
    lineSumExVat,
    lineCostExVat,
    included,
    optional: Boolean(line.optional),
    internal: Boolean(line.internal),
    priceSource,
  };
}

function lineCost(line: CalcLine, hours: number, lineSumExVat: number, rates: RateInput[], commercial: CommercialSettings): number {
  const material = Math.max(0, line.quantity) * Math.max(0, line.materialCost);
  const labor = hours * internalHourly(line, rates);
  if (material === 0 && line.hoursPerUnit === 0 && lineSumExVat !== 0) {
    return roundMoney(lineSumExVat / commercial.electricianCostFactor);
  }
  return roundMoney(material + labor);
}
