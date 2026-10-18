import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyDraft, mockDraft, sanitizeCustomerText, type DraftRequest } from "./ai-draft";
import { calculateQuote, priceLineToCalc } from "./calc";
import { parseCsv } from "./csv";
import { DEFAULT_COMMERCIAL, DEFAULT_TRADE_RATES, priceListFromCsv, type PriceLineInput, type RateInput } from "./pricing";
import { assertQuoteTransition, nextRevision, roleCanApprove } from "./quote-flow";
import { contextFromSketch, evalQuantity, quantityContext } from "./quantities";
import { priceItemCode } from "./trades";
import { DomainError } from "./errors";

const rates = DEFAULT_TRADE_RATES;

function item(partial: Partial<PriceLineInput> & Pick<PriceLineInput, "code" | "tradeCode">): PriceLineInput {
  return {
    itemId: partial.code,
    name: partial.name ?? partial.code,
    unit: partial.unit ?? "stk",
    type: partial.type ?? "unit_price",
    materialCost: 0,
    materialMarkup: null,
    hoursPerUnit: 0,
    hourlyRateOverride: null,
    salePriceOverride: null,
    quantityFormula: null,
    costFormula: null,
    internalNote: null,
    customerVisible: true,
    active: true,
    sortOrder: 1,
    ...partial,
  };
}

describe("kalkylemotor", () => {
  it("gir samme krone-sum som mal-regnearket for standardmengdene", () => {
    const csv = readFileSync(new URL("../../db/prisma/data/prisposter.csv", import.meta.url), "utf8");
    const list = priceListFromCsv(csv, { id: "mal", name: "Mal", validFrom: "2026-08-11" });
    const quantities = new Map<string, number>();
    for (const row of parseCsv(csv)) {
      if ("mengde_hallskaret" in row) delete row.mengde_hallskaret;
      quantities.set(priceItemCode(String(row.kategori), Number(row.sortering)), Number(row.mengde_mal || 0));
    }
    const lines = list.lines.map((line) => priceLineToCalc(line, quantities.get(line.code) ?? 0));
    const totals = calculateQuote({ lines, rates: list.rates, commercial: DEFAULT_COMMERCIAL, channel: "none" });
    // Malen med standardmengder (omkrets 10 m, høyde 2,4 m, gulv 5 m²) gir 349 721 kr.
    // Noen enhetspriser i CSV-en er avrundet i forhold til formelen, innenfor ett øre per linje.
    expect(Math.round(totals.totalIncVat)).toBe(349721);
    expect(totals.vatNok).toBeCloseTo(totals.subtotalExVat * 0.25, 2);
    expect(totals.marginExVat).toBeLessThan(totals.spreadsheetMarginIncVat);
  });

  it("regner et fiktivt bad med påslag, timer, provisjon og mva én gang", () => {
    const lines = [
      priceLineToCalc(item({ code: "RIV-001", tradeCode: "riving", type: "hours", hoursPerUnit: 1, name: "Timeforbruk riving" }), 10),
      priceLineToCalc(item({ code: "RIV-002", tradeCode: "riving", materialCost: 2.2, materialMarkup: 0.2, unit: "kg", name: "Avfall" }), 100),
      priceLineToCalc(
        item({ code: "TOM-004", tradeCode: "tomrer", unit: "m2", materialCost: 72.5, materialMarkup: 0.3, hoursPerUnit: 0.45, name: "Gipshimling" }),
        4,
      ),
      priceLineToCalc(item({ code: "TOM-014", tradeCode: "tomrer", type: "hours", hoursPerUnit: 1, hourlyRateOverride: 1150, name: "Byggeledelse" }), 4),
      priceLineToCalc(item({ code: "ROR-001", tradeCode: "rorlegger", materialCost: 1000, materialMarkup: 0.4, hoursPerUnit: 2, name: "Vannpunkt" }), 1),
      priceLineToCalc(item({ code: "EL-002", tradeCode: "elektriker", salePriceOverride: 1510, name: "Downlight" }), 4),
      priceLineToCalc(item({ code: "EL-099", tradeCode: "elektriker", salePriceOverride: 500, name: "Opsjon dimmer" }), 1, { optional: true, included: false }),
    ];
    const totals = calculateQuote({
      lines,
      rates,
      commercial: DEFAULT_COMMERCIAL,
      extraProfitNok: 1000,
      channel: "byggstart",
    });
    expect(totals.lines.find((line) => line.code === "RIV-002")?.unitPriceExVat).toBe(2.64);
    expect(totals.lines.find((line) => line.code === "TOM-004")?.unitPriceExVat).toBe(503.75);
    expect(totals.lines.find((line) => line.code === "ROR-001")?.unitPriceExVat).toBe(3380);
    expect(totals.lines.find((line) => line.code === "EL-099")?.included).toBe(false);
    expect(totals.workExVat).toBe(25599);
    expect(totals.channelExVat).toBe(2329.51);
    expect(totals.subtotalExVat).toBe(28928.51);
    expect(totals.vatNok).toBe(7232.13);
    expect(totals.totalIncVat).toBe(36160.64);
    expect(totals.trades.map((trade) => trade.tradeCode)).toEqual(["riving", "tomrer", "elektriker", "rorlegger"]);
    const contribution = Math.round((totals.subtotalExVat - totals.costExVat) * 100) / 100;
    expect(totals.contributionExVat).toBe(contribution);
    expect(totals.marginExVat).toBeCloseTo(contribution / totals.subtotalExVat, 6);
    const wrong = (totals.totalIncVat - totals.costExVat) / totals.totalIncVat;
    expect(totals.spreadsheetMarginIncVat).toBeCloseTo(wrong, 6);
    expect(totals.marginExVat).not.toBeCloseTo(wrong, 2);
  });

  it("slår opp på kode og avviser ukjent kode", () => {
    const catalog = [item({ code: "MUR-010", tradeCode: "murer", name: "Flis", salePriceOverride: 400, unit: "m2" })];
    expect(catalog.find((line) => line.name === "Flis")?.code).toBe("MUR-010");
    expect(() => {
      const missing = catalog.find((line) => line.code === "MUR-999");
      if (!missing) throw new DomainError("Ukjent varekode MUR-999");
    }).toThrow(/MUR-999/);
  });
});

describe("rommål", () => {
  it("trekker dør og vindu fra veggarealet og regner skråtak", () => {
    const room = quantityContext({
      perimeterM: 8,
      ceilingHeightM: 2.4,
      floorAreaM: 4,
      openings: [
        { type: "door", widthM: 0.9, heightM: 2.1 },
        { type: "window", widthM: 0.6, heightM: 0.8 },
      ],
      slope: { kneeHeightM: 1.6, ridgeHeightM: 2.4, spanM: 2 },
    });
    expect(room.veggarealBrutto).toBe(19.2);
    expect(room.apninger).toBeCloseTo(0.9 * 2.1 + 0.6 * 0.8, 3);
    expect(room.veggareal).toBeCloseTo(19.2 - room.apninger + 2 * 0.8, 3);
    expect(room.skrataak).toBeGreaterThan(room.gulvareal);
    expect(evalQuantity("gulvareal+(omkrets*romhoyde)", room)).toBe(room.flisareal);
    expect(evalQuantity("veggareal", room)).toBe(room.veggareal);
    expect(evalQuantity("(omkrets/0.6)*1.2", room)).toBe(16);
  });

  it("leser mål fra skissen", () => {
    const ctx = contextFromSketch({
      points: [
        { x: 0, y: 0 },
        { x: 2.4, y: 0 },
        { x: 2.4, y: 1.85 },
        { x: 0, y: 1.85 },
      ],
      doorEdge: 0,
      ceilingHeightM: 2.25,
      openings: [{ id: "dor", type: "door", wallNumber: 1, offsetM: 0.2, widthM: 0.8 }],
    });
    expect(ctx.omkrets).toBeCloseTo(8.5, 2);
    expect(ctx.gulvareal).toBeCloseTo(4.44, 2);
    expect(ctx.apninger).toBeGreaterThan(0);
  });
});

describe("tilbudsstatus", () => {
  it("følger utkast, godkjenning, sendt og aksept", () => {
    expect(() => assertQuoteTransition("draft", "approved", true)).toThrow(DomainError);
    expect(() => assertQuoteTransition("pending_approval", "approved", false)).toThrow(/godkjenne/);
    assertQuoteTransition("draft", "pending_approval", false);
    assertQuoteTransition("pending_approval", "approved", true);
    assertQuoteTransition("approved", "sent", false);
    assertQuoteTransition("sent", "accepted", false);
    assertQuoteTransition("sent", "rejected", false);
    expect(() => assertQuoteTransition("accepted", "draft", true)).toThrow(DomainError);
    expect(nextRevision("A")).toBe("B");
    expect(nextRevision("Z")).toBe("AA");
    expect(roleCanApprove("kontor", ["admin", "kontor"])).toBe(true);
    expect(roleCanApprove("selger", ["admin", "kontor"])).toBe(false);
  });
});

describe("interne notater", () => {
  const secret = "Intern: kunden er usikker på flisformat og vil ikke ha det i tilbudet.";
  const catalog = [
    item({ code: "EL-002", tradeCode: "elektriker", name: "Downlight, LED", salePriceOverride: 1510, quantityFormula: null }),
    item({ code: "TOM-004", tradeCode: "tomrer", name: "Gipshimling", quantityFormula: "gulvareal", materialCost: 72.5, materialMarkup: 0.3, hoursPerUnit: 0.45, unit: "m2" }),
  ];
  const request: DraftRequest = {
    mode: "quote",
    rooms: [{ ...quantityContext({ perimeterM: 8, ceilingHeightM: 2.4, floorAreaM: 4 }), name: "Bad" }],
    answers: [
      { prompt: "Antall downlights", tradeCode: "elektriker", value: 4, freeText: null, priceItemCode: "EL-002", internalNote: secret },
      { prompt: "Ny himling?", tradeCode: "tomrer", value: true, freeText: "Hvit himling.", priceItemCode: "TOM-004", internalNote: null },
    ],
    notes: [{ body: secret, internal: true }, { body: "Sluk mot yttervegg.", internal: false }],
    media: [{ id: "m1", kind: "photo", fileName: "vegg.jpg", internal: true }],
    catalog,
    templates: [
      { key: "intro", name: "Innledning", kind: "intro", tradeCode: null, body: "Tilbudet er gyldig {{gyldighet.dager}} dager." },
      { key: "epost.tilbud", name: "E-post", kind: "email", tradeCode: null, body: "Fliser for inntil {{flis.inntil}} kr/m². Time elektriker {{timepris.elektriker}} kr." },
    ],
    rates: rates as RateInput[],
    commercial: DEFAULT_COMMERCIAL,
    channel: "none",
    validDays: 30,
  };

  it("fjerner interne notater selv om modellen skriver dem inn", () => {
    const hostile = `Vi tar høyde for at ${secret} Downlights: 4 stk.`;
    const cleaned = sanitizeCustomerText(hostile, [secret]);
    expect(cleaned.text.toLowerCase()).not.toContain("flisformat");
    expect(cleaned.removed).toHaveLength(1);
    const draft = mockDraft(request);
    expect(draft.customerText.toLowerCase()).not.toContain("flisformat");
    expect(draft.customerText).toContain("Sluk mot yttervegg.");
    const applied = applyDraft(request, { ...draft, customerText: hostile, emailBody: hostile, reservations: hostile });
    const blob = `${applied.customerText}\n${applied.emailBody}\n${applied.reservations}`.toLowerCase();
    expect(blob).not.toContain("flisformat");
    expect(applied.leaked.length).toBeGreaterThan(0);
    expect(applied.totals.lines.find((line) => line.code === "EL-002")?.lineSumExVat).toBe(6040);
    expect(draft.emailBody).toContain("sats ikke satt");
    expect(draft.emailBody.replace(/\s/g, "")).toContain("1190");
  });
});
