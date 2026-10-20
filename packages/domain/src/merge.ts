import { groupedMoney, roundMoney } from "./money";
import type { CommercialSettings, RateInput } from "./pricing";

export type MergeContext = {
  rates: RateInput[];
  commercial: CommercialSettings;
  totalIncVat?: number | null;
  validDays?: number | null;
  rivingSumIncVat?: number | null;
  windowSize?: string | null;
  windowGlass?: string | null;
  paymentStartPercent?: number | null;
  paymentFinishPercent?: number | null;
  paymentDueDays?: number | null;
  startDate?: string | null;
  endDate?: string | null;
};

function money(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return roundMoney(value).toLocaleString("nb-NO", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function rate(ctx: MergeContext, trade: string, field: "hourlyRateSale" | "calloutPrice"): number | null {
  const found = ctx.rates.find((item) => item.tradeCode === trade);
  if (!found) return null;
  return found[field];
}

function plain(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  const rounded = roundMoney(value);
  if (Number.isInteger(rounded)) return String(Math.trunc(rounded));
  return money(rounded);
}

function valueOf(key: string, ctx: MergeContext): string | null {
  const [group, name] = key.split(".");
  if (key === "flis.inntil.ink") {
    const ex = ctx.commercial.tileAllowanceExVat;
    if (ex == null) return null;
    return plain(ex * (1 + ctx.commercial.vatRate));
  }
  if (key === "flis.inntil") return plain(ctx.commercial.tileAllowanceExVat);
  if (group === "timepris" && name === "montering") return plain(ctx.commercial.assemblyHourlyNok);
  if (group === "timepris" && name) return plain(rate(ctx, name, "hourlyRateSale"));
  if (group === "oppmote" && name === "ekstra") return plain(ctx.commercial.extraCalloutNok);
  if (group === "oppmote" && name) {
    const found = ctx.rates.find((item) => item.tradeCode === name);
    return plain(found?.calloutPrice ?? ctx.commercial.extraCalloutNok);
  }
  if (key === "mva.prosent") return ctx.commercial.vatRate != null ? String(Math.round(ctx.commercial.vatRate * 1000) / 10) : null;
  if (key === "provisjon.byggstart") return String(Math.round(ctx.commercial.byggstartPercent * 1000) / 10);
  if (key === "provisjon.mittanbud") return String(Math.round(ctx.commercial.mittanbudPercent * 1000) / 10);
  if (key === "provisjon.faktor") return String(ctx.commercial.byggstartFactor);
  if (key === "total.ink") return ctx.totalIncVat == null ? null : groupedMoney(ctx.totalIncVat);
  if (key === "riving.sum.ink") return ctx.rivingSumIncVat == null ? null : groupedMoney(ctx.rivingSumIncVat);
  if (key === "gyldighet.dager") return ctx.validDays != null ? String(ctx.validDays) : null;
  if (key === "betaling.oppstart") return ctx.paymentStartPercent != null ? String(ctx.paymentStartPercent) : null;
  if (key === "betaling.ferdig") return ctx.paymentFinishPercent != null ? String(ctx.paymentFinishPercent) : null;
  if (key === "betaling.forfall") return ctx.paymentDueDays != null ? String(ctx.paymentDueDays) : null;
  if (key === "vindu.storrelse") return ctx.windowSize?.trim() ? ctx.windowSize.trim() : null;
  if (key === "vindu.glass") return ctx.windowGlass?.trim() ? ctx.windowGlass.trim() : null;
  if (key === "oppstart.dato") return ctx.startDate?.trim() ? ctx.startDate.trim() : null;
  if (key === "slutt.dato") return ctx.endDate?.trim() ? ctx.endDate.trim() : null;
  return null;
}

const MISSING = "sats ikke satt";

/** Flettefelt fra prislistens satser. Ukjent eller tom sats blir «sats ikke satt», aldri et gjettet tall. */
export function mergeTemplate(template: string, ctx: MergeContext): string {
  const withBlocks = template.replace(/\{\{#([\w.]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_all, key: string, inner: string) => {
    return valueOf(key, ctx) == null ? "" : inner;
  });
  return withBlocks.replace(/\{\{([\w.]+)\}\}/g, (_all, key: string) => valueOf(key, ctx) ?? MISSING);
}
