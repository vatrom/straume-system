import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyDraft, mockDraft, type DraftAnswer, type DraftRequest } from "./ai-draft";
import { calculateQuote, priceLineToCalc } from "./calc";
import { evaluateChecklist, fieldVisible, missingPriceLinks, type ChecklistAnswerInput } from "./checklist";
import { DEFAULT_COMMERCIAL, priceListFromCsv, VIDAR_PRICE_LINES, type PriceLineInput } from "./pricing";
import { quantityContext } from "./quantities";
import { TILBUDSBEFARING } from "./tilbudsbefaring";

const csv = readFileSync(new URL("../../db/prisma/data/prisposter.csv", import.meta.url), "utf8");
const list = priceListFromCsv(csv, { id: "mal", name: "Mal", validFrom: "2026-08-11" });
const room = quantityContext({ perimeterM: 11, ceilingHeightM: 2.4, floorAreaM: 5.5 });

function spec(key: string) {
  for (const section of TILBUDSBEFARING) {
    const item = section.items.find((row) => row.key === key);
    if (item) return { section, item };
  }
  throw new Error(key);
}

function answer(key: string, value: unknown): DraftAnswer {
  const found = spec(key);
  const row: ChecklistAnswerInput = {
    key,
    prompt: found.item.prompt,
    tradeCode: found.section.tradeCode,
    questionType: found.item.questionType,
    value,
    config: found.item.config ?? null,
  };
  return { ...row, freeText: null, priceItemCode: null, internalNote: null };
}

const catalog = [...list.lines, ...VIDAR_PRICE_LINES];

describe("tilbudsbefaring", () => {
  it("viser betingede felt bare når valget er gjort", () => {
    const values = new Map<string, unknown>();
    expect(fieldVisible(spec("tomrer.himling").item, values)).toBe(false);
    expect(fieldVisible(spec("tomrer.gips_vat").item, values)).toBe(false);
    expect(fieldVisible(spec("tomrer.gips_ekstra").item, values)).toBe(false);
    expect(fieldVisible(spec("tomrer.vindu_tekst").item, values)).toBe(false);
    expect(fieldVisible(spec("mur.delvis").item, values)).toBe(false);
    expect(fieldVisible(spec("mal.annet_m2").item, values)).toBe(false);
    values.set("tomrer.arbeid", ["Annen type himling", "Gipsvegger inne på våtrom"]);
    values.set("tomrer.vindu", true);
    values.set("mur.arbeid", ["Delvis flislagte vegger"]);
    expect(fieldVisible(spec("tomrer.himling").item, values)).toBe(true);
    expect(fieldVisible(spec("tomrer.gips_vat").item, values)).toBe(true);
    expect(fieldVisible(spec("tomrer.gips_ekstra").item, values)).toBe(false);
    expect(fieldVisible(spec("tomrer.vindu_tekst").item, values)).toBe(true);
    expect(fieldVisible(spec("mur.delvis").item, values)).toBe(true);
    values.set("mal.arbeid", ["Annet malerarbeid"]);
    expect(fieldVisible(spec("mal.annet_m2").item, values)).toBe(true);
  });

  it("lager poster fra mapping og hopper over fag som ikke er valgt", () => {
    const built = evaluateChecklist({
      answers: [
        answer("maal.gulv", 5.5),
        answer("maal.hoyde", 2.4),
        answer("maal.omkrets", 11),
        answer("fag.valg", ["Riving", "Elektro", "Murerarbeid"]),
        answer("maal.tilkomst", "Vanskelig"),
        answer("riving.hva", ["Pigge påstøp", "Innredning demonteres"]),
        answer("el.downlight", 5),
        answer("el.stikk_enkel", 2),
        answer("mur.arbeid", ["Delvis flislagte vegger"]),
        answer("mur.delvis", 16),
        answer("mal.arbeid", ["Sparkling og maling av himling"]),
        answer("mal.tekst", "Ønsker også noe ekstra sparkling og maling ca 20m2 vegg"),
        answer("tomrer.dor_ny", 1),
        answer("annet.kilde", "MittAnbud XL"),
        answer("annet.rund", 15000),
      ],
      catalog,
      room,
    });
    expect(built.lines.find((line) => line.code === "EL-002")?.quantity).toBe(5);
    expect(built.lines.find((line) => line.code === "EL-006")?.quantity).toBe(2);
    expect(built.lines.find((line) => line.code === "RIV-001")).toBeUndefined();
    expect(built.lines.find((line) => line.code === "MUR-008")?.quantity).toBe(16);
    expect(built.lines.find((line) => line.code === "MAL-005")).toBeUndefined();
    expect(built.lines.find((line) => line.code === "TOM-009")).toBeUndefined();
    expect(built.manualItems.some((item) => item.prompt.includes("Innredning demonteres"))).toBe(false);
    expect(built.manualItems.some((item) => item.prompt.includes("Stikkontakt Enkel"))).toBe(false);
    expect(built.manualItems.some((item) => item.prompt.includes("Tilkomst"))).toBe(true);
    expect(built.flags.some((flag) => flag.startsWith("Må prises manuelt:"))).toBe(true);
    expect(built.channel).toBe("mittanbud");
    expect(built.extraProfitNok).toBe(15000);
    const priced = calculateQuote({
      lines: built.lines.map((line) => priceLineToCalc(catalog.find((item) => item.code === line.code) as PriceLineInput, line.quantity, { optional: line.optional, included: !line.optional })),
      rates: list.rates,
      commercial: DEFAULT_COMMERCIAL,
      channel: built.channel ?? "none",
      extraProfitNok: built.extraProfitNok ?? 0,
    });
    const downlights = priced.lines.find((line) => line.code === "EL-002");
    expect(downlights?.quantity).toBe(5);
    expect(downlights?.lineSumExVat).toBeGreaterThan(0);
    expect(priced.channelName).toBe("MittAnbud XL");
    expect(priced.channelExVat).toBeCloseTo(priced.workExVat * 0.05, 2);
  });

  it("tolker fritekst som tillegg og holder skjulte felt ute", () => {
    const hidden = evaluateChecklist({
      answers: [answer("fag.valg", ["Tømrerarbeid", "Malerarbeid"]), answer("tomrer.gips_vat", 25), answer("tomrer.vindu_tekst", "Toppsving 100x130")],
      catalog,
      room,
    });
    expect(hidden.lines.find((line) => line.code === "TOM-005")).toBeUndefined();
    expect(hidden.manualItems.some((item) => item.prompt.includes("vindu"))).toBe(false);

    const shown = evaluateChecklist({
      answers: [
        answer("fag.valg", ["Riving", "Tømrerarbeid", "Elektro", "Murerarbeid", "Malerarbeid", "Rør"]),
        answer("tomrer.arbeid", ["Gipsvegger inne på våtrom"]),
        answer("tomrer.gips_vat", 25),
        answer("tomrer.vindu", true),
        answer("tomrer.vindu_tekst", "Toppsving 100x130 med frostet glass"),
        answer("el.tekst", "Kunde ønsker Plejd på alle brytere, dimmere og termostat"),
        answer("mur.tekst", "Ønsker epoxyfuger på gulv"),
        answer("mal.tekst", "Ønsker også noe ekstra sparkling og maling ca 20m2 vegg"),
        answer("riving.tekst", "2 lag med påstøp som skal pigges opp"),
      ],
      catalog,
      room,
    });
    expect(shown.lines.find((line) => line.code === "TOM-005")?.quantity).toBe(25);
    expect(shown.lines.find((line) => line.code === "MAL-005")?.quantity).toBe(20);
    expect(shown.lines.find((line) => line.code === "MAL-005")?.optional).toBe(true);
    expect(shown.manualItems.map((item) => item.prompt).join(" ")).toMatch(/Plejd/);
    expect(shown.manualItems.map((item) => item.prompt).join(" ")).toMatch(/Epoxyfuger/);
    expect(shown.manualItems.map((item) => item.prompt).join(" ")).toMatch(/påstøp/);
    expect(shown.manualItems.some((item) => item.prompt.includes("vindu"))).toBe(true);
    expect(shown.lines.find((line) => line.code === "RIV-001")).toBeUndefined();
  });

  it("peker ut skjemafelt uten varekode", () => {
    const gaps = missingPriceLinks(TILBUDSBEFARING);
    const label = (choice: string) => gaps.some((gap) => gap.choice === choice || gap.prompt === choice);
    expect(label("Downlights, stk")).toBe(false);
    expect(label("Delvis flislagte vegger, m2")).toBe(false);
    expect(label("Pigge påstøp")).toBe(false);
    expect(label("Stikkontakt Enkel, stk")).toBe(false);
    expect(label("Ekstra 50 mm avløp, stk")).toBe(false);
    expect(label("Lite")).toBe(false);
    expect(label("Bygge toalettkasse")).toBe(false);
    expect(label("Nedsenk i dusj")).toBe(false);
    expect(label("Hovedstoppekran")).toBe(true);
    expect(label("Annen type himling")).toBe(true);
    expect(label("Trangt")).toBe(true);
    expect(label("Vanskelig")).toBe(true);
    expect(label("Lang bæring")).toBe(true);
    expect(label("Må det betales for parkering?")).toBe(true);
    expect(label("Nytt vindu, beskrivelse")).toBe(true);
    expect(gaps).toHaveLength(7);
  });

  it("priser tildekking med felles oppmøte 490 kr og hopper over rivevalg", () => {
    expect(list.lines.find((line) => line.code === "RIV-004")?.salePriceOverride).toBe(490);
    const totals = { Lite: 17468, Middels: 28000, Mye: 39600 } as const;
    const quantities = {
      Lite: { "RIV-001": 12, "RIV-002": 1200, "RIV-004": 2, "RIV-003": 1 },
      Middels: { "RIV-001": 20, "RIV-002": 2000, "RIV-004": 4, "RIV-003": 1 },
      Mye: { "RIV-001": 30, "RIV-002": 2500, "RIV-004": 6, "RIV-003": 1 },
    } as const;
    for (const level of ["Lite", "Middels", "Mye"] as const) {
      const built = evaluateChecklist({
        answers: [
          answer("maal.gulv", 5.5),
          answer("fag.valg", ["Riving"]),
          answer("riving.tildekking", level),
          answer("riving.hva", ["Pigge påstøp", "Innredning demonteres"]),
          answer("riving.omfang", "5+ dager"),
        ],
        catalog,
        room,
      });
      for (const [code, quantity] of Object.entries(quantities[level])) {
        expect(built.lines.find((line) => line.code === code)?.quantity).toBe(quantity);
      }
      expect(built.manualItems).toEqual([]);
      const priced = calculateQuote({
        lines: built.lines.map((line) => priceLineToCalc(catalog.find((item) => item.code === line.code) as PriceLineInput, line.quantity)),
        rates: list.rates,
        commercial: DEFAULT_COMMERCIAL,
        channel: "none",
        extraProfitNok: 0,
      });
      expect(priced.lines.find((line) => line.code === "RIV-004")?.unitPriceExVat).toBe(490);
      expect(priced.workExVat).toBe(totals[level]);
    }
  });

  it("priser enkel stikk som EL-006 og VVB uten egne timer", () => {
    const built = evaluateChecklist({
      answers: [answer("fag.valg", ["Elektro"]), answer("el.stikk_enkel", 2), answer("el.vvb", true)],
      catalog,
      room,
    });
    expect(built.lines.find((line) => line.code === "EL-006")?.quantity).toBe(2);
    expect(built.lines.find((line) => line.code === "EL-016")?.quantity).toBe(1);
    expect(built.manualItems).toEqual([]);
    const priced = calculateQuote({
      lines: built.lines.map((line) => priceLineToCalc(catalog.find((item) => item.code === line.code) as PriceLineInput, line.quantity)),
      rates: list.rates,
      commercial: DEFAULT_COMMERCIAL,
      channel: "none",
      extraProfitNok: 0,
    });
    const socket = priced.lines.find((line) => line.code === "EL-006");
    const heater = priced.lines.find((line) => line.code === "EL-016");
    expect(socket?.unitPriceExVat).toBe(1390);
    expect(socket?.lineSumExVat).toBe(2780);
    expect(heater?.lineSumExVat).toBe(1725);
    expect(heater?.hours).toBe(0);
    expect(priced.hoursTotal).toBe(0);
  });

  it("priser toalettkasse, 50 mm avløp og lar nedsenk og hovedstoppekran følge regelen", () => {
    const carpenter = evaluateChecklist({
      answers: [answer("fag.valg", ["Tømrerarbeid"]), answer("tomrer.arbeid", ["Bygge toalettkasse", "Annen type himling"])],
      catalog,
      room,
    });
    expect(carpenter.lines.find((line) => line.code === "TOM-020")?.quantity).toBe(1);
    expect(carpenter.manualItems.some((item) => item.prompt.includes("Annen type himling"))).toBe(true);
    const kasse = calculateQuote({
      lines: [priceLineToCalc(VIDAR_PRICE_LINES[0]!, 1)],
      rates: list.rates,
      commercial: DEFAULT_COMMERCIAL,
      channel: "none",
      extraProfitNok: 0,
    }).lines[0];
    expect(kasse?.lineSumExVat).toBe(3770);
    expect(kasse?.hours).toBe(3);

    const shower = evaluateChecklist({
      answers: [answer("fag.valg", ["Murerarbeid"]), answer("mur.arbeid", ["Nedsenk i dusj"])],
      catalog,
      room,
    });
    expect(shower.lines).toEqual([]);
    expect(shower.manualItems).toEqual([]);
    expect(shower.flags.some((flag) => flag.startsWith("Må prises manuelt:"))).toBe(false);

    const pipes = evaluateChecklist({
      answers: [answer("fag.valg", ["Rør"]), answer("ror.avlop50", 2), answer("ror.utstyr", ["Hovedstoppekran"])],
      catalog,
      room,
    });
    expect(pipes.lines.find((line) => line.code === "ROR-017")?.quantity).toBe(2);
    expect(pipes.lines.some((line) => /stoppekran/i.test(line.code))).toBe(false);
    expect(pipes.manualItems.some((item) => item.prompt.includes("Hovedstoppekran"))).toBe(true);
    const drain = calculateQuote({
      lines: [priceLineToCalc(catalog.find((item) => item.code === "ROR-017") as PriceLineInput, 2)],
      rates: list.rates,
      commercial: DEFAULT_COMMERCIAL,
      channel: "none",
      extraProfitNok: 0,
    }).lines[0];
    expect(drain?.lineSumExVat).toBeCloseTo(4924.72, 2);
  });

  it("tar sparkling og maling én gang og bruker gipsmålt m2", () => {
    const painted = evaluateChecklist({
      answers: [
        answer("maal.gulv", 5.5),
        answer("maal.hoyde", 2.4),
        answer("maal.omkrets", 11),
        answer("fag.valg", ["Tømrerarbeid", "Malerarbeid"]),
        answer("tomrer.gips_vat", 10),
        answer("tomrer.gips_ekstra", 5),
        answer("mal.arbeid", ["Sparkling og maling av himling", "Sparkling og maling av gipsede vegger", "Annet malerarbeid"]),
        answer("mal.annet_m2", 8),
      ],
      catalog,
      room,
    });
    expect(painted.lines.find((line) => line.code === "MAL-004")?.quantity).toBe(1);
    expect(painted.lines.find((line) => line.code === "MAL-005")?.quantity).toBe(28.5);

    const fallback = evaluateChecklist({
      answers: [
        answer("maal.gulv", 5.5),
        answer("maal.hoyde", 2.4),
        answer("maal.omkrets", 11),
        answer("fag.valg", ["Malerarbeid"]),
        answer("mal.arbeid", ["Sparkling og maling av gipsede vegger"]),
      ],
      catalog,
      room,
    });
    expect(fallback.lines.find((line) => line.code === "MAL-004")?.quantity).toBe(1);
    expect(fallback.lines.find((line) => line.code === "MAL-005")?.quantity).toBe(26.4);
    expect(fallback.manualItems).toEqual([]);
  });
});

describe("utkast fra sjekkliste", () => {
  it("bruker kildetillegg og rund sum, og tar ikke med interne notater", () => {
    const secret = "Intern: sjekk adkomst med vaktmester før oppstart.";
    const request: DraftRequest = {
      mode: "quote",
      rooms: [{ ...room, name: "Bad" }],
      answers: [
        answer("maal.gulv", 5.5),
        answer("fag.valg", ["Elektro"]),
        answer("el.downlight", 4),
        { ...answer("el.tekst", "Kunde ønsker Plejd"), internalNote: secret },
        answer("annet.kilde", "Byggstart"),
        answer("annet.rund", 1000),
      ],
      notes: [{ body: secret, internal: true }],
      media: [],
      catalog,
      templates: [{ key: "intro", name: "Innledning", kind: "intro", tradeCode: null, body: "Tilbud." }],
      rates: list.rates,
      commercial: DEFAULT_COMMERCIAL,
      channel: "none",
    };
    const draft = mockDraft(request);
    expect(draft.lines.some((line) => line.code === "EL-002")).toBe(true);
    expect(draft.channel).toBe("byggstart");
    expect(draft.extraProfitNok).toBe(1000);
    expect(draft.customerText.toLowerCase()).not.toContain("vaktmester");
    const applied = applyDraft(request, draft);
    expect(applied.totals.channelName).toBe("Byggstart");
    expect(applied.totals.extraProfitExVat).toBe(1000);
    expect(applied.customerText.toLowerCase()).not.toContain("vaktmester");
    expect(applied.customerText.toLowerCase()).not.toContain("plejd");
  });
});
