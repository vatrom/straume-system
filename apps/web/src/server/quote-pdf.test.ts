import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AI_SUGGESTION_HEADING,
  composeQuoteDocument,
  DEFAULT_COMMERCIAL,
  DEFAULT_QUOTE_LETTERHEAD,
  DEFAULT_TRADE_RATES,
  MAL_BLOCKS,
  type DocumentAnswer,
  type DocumentLine,
  type RateInput,
} from "@straume/domain";
import { describe, expect, it } from "vitest";
import { renderCustomerQuotePdf } from "./quote-pdf";

const rates = DEFAULT_TRADE_RATES as RateInput[];

const answers: DocumentAnswer[] = [
  { key: "fag.valg", value: ["Riving", "Tømrerarbeid", "Elektro", "Rør", "Murerarbeid", "Malerarbeid"] },
  { key: "riving.tildekking", value: "Mye" },
  { key: "riving.hva", value: ["Innredning demonteres", "Pigge påstøp"] },
  { key: "tomrer.arbeid", value: ["Oppretting av vegger", "Bygge toalettkasse", "Våtromsplater på vegger", "Ny gipshimling"] },
  { key: "tomrer.dor_ny", value: 1 },
  { key: "tomrer.vindu", value: true },
  { key: "tomrer.vindu_tekst", value: "Toppsving 120x60cm med frostet glass" },
  { key: "mur.arbeid", value: ["Støping av gulv", "Helfliset bad"] },
  { key: "mal.arbeid", value: ["Sparkling og maling av himling"] },
];

const lines: DocumentLine[] = [
  { code: "RIV-001", tradeCode: "riving", description: "Pigge påstøp", unit: "m2", quantity: 5, included: true, lineSumExVat: 21696 },
  { code: "EL-011", tradeCode: "elektriker", description: "Termostat, SG", unit: "stk", quantity: 1, included: true, lineSumExVat: 800 },
  { code: "EL-002", tradeCode: "elektriker", description: "Downlights LED, Junistar Eco hvit", unit: "stk", quantity: 6, included: true, lineSumExVat: 9000 },
  { code: "EL-020", tradeCode: "elektriker", description: "Stikkontakt dobbel", unit: "stk", quantity: 4, included: true, lineSumExVat: 1200 },
  { code: "EL-021", tradeCode: "elektriker", description: "Bryter", unit: "stk", quantity: 2, included: true, lineSumExVat: 600 },
  { code: "EL-022", tradeCode: "elektriker", description: "Varmekabel", unit: "m2", quantity: 8.8, included: true, lineSumExVat: 4000 },
  { code: "EL-023", tradeCode: "elektriker", description: "Speilskap, tilkobling", unit: "stk", quantity: 1, included: true, lineSumExVat: 400 },
  { code: "EL-024", tradeCode: "elektriker", description: "Uttak for vaskemaskin", unit: "stk", quantity: 1, included: true, lineSumExVat: 400 },
  { code: "ROR-018", tradeCode: "rorlegger", description: "Vannpunkt kald, rør i rør", unit: "stk", quantity: 4, included: true, lineSumExVat: 4000 },
  { code: "ROR-019", tradeCode: "rorlegger", description: "Vannpunkt varm, rør i rør", unit: "stk", quantity: 3, included: true, lineSumExVat: 3000 },
  { code: "ROR-030", tradeCode: "rorlegger", description: "Servantbatteri", unit: "stk", quantity: 1, included: true, lineSumExVat: 2000 },
  { code: "ROR-031", tradeCode: "rorlegger", description: "Dusjbatteri", unit: "stk", quantity: 1, included: true, lineSumExVat: 2000 },
  { code: "ROR-032", tradeCode: "rorlegger", description: "Gulvsluk", unit: "stk", quantity: 1, included: true, lineSumExVat: 1500 },
  { code: "ROR-033", tradeCode: "rorlegger", description: "Avløp 50 mm", unit: "stk", quantity: 2, included: true, lineSumExVat: 1200 },
  { code: "ROR-034", tradeCode: "rorlegger", description: "Innebygget sisterne", unit: "stk", quantity: 1, included: true, lineSumExVat: 2500 },
  { code: "ROR-035", tradeCode: "rorlegger", description: "Toalettsete", unit: "stk", quantity: 1, included: true, lineSumExVat: 800 },
  { code: "MAN-1", tradeCode: "rorlegger", description: "Må prises manuelt: hovedstoppekran", unit: "stk", quantity: 1, included: true, lineSumExVat: 0 },
];

function exampleDocument() {
  return composeQuoteDocument({
    blocks: MAL_BLOCKS,
    lines,
    answers,
    merge: {
      rates,
      commercial: DEFAULT_COMMERCIAL,
      totalIncVat: 499999,
      validDays: 30,
      paymentStartPercent: 70,
      paymentFinishPercent: 30,
      paymentDueDays: 10,
      startDate: null,
      endDate: null,
    },
  });
}

function pdfText(body: Buffer): string {
  const dir = mkdtempSync(join(tmpdir(), "tilbud-"));
  const file = join(dir, "tilbud.pdf");
  writeFileSync(file, body);
  try {
    return execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function render(approvedNote = "") {
  return renderCustomerQuotePdf({
    document: exampleDocument(),
    customer: { name: "Fornavn Etternavn", email: "post@mail.no", address: "Adresse 99", phone: "999 99 999" },
    letterhead: DEFAULT_QUOTE_LETTERHEAD,
    date: "04.08.26",
    quoteNumber: "260804",
    approvedNote,
  });
}

describe("kundens tilbuds-PDF", () => {
  it("følger malen og utelater intern informasjon", async () => {
    const body = await render();
    expect(body.subarray(0, 5).toString()).toBe("%PDF-");
    const text = pdfText(body);
    expect(text).toContain("Fornavn Etternavn");
    expect(text).toContain("post@mail.no");
    expect(text).toContain("Adresse 99");
    expect(text).toContain("999 99 999");
    expect(text).toContain("Tilbud / Kontrakt");
    expect(text).toContain("Bergen 04.08.26");
    expect(text).toContain("Straume Våtrom As takker for invitasjonen");
    expect(text).toContain("LOV 1989-06-16 nr 63");
    expect(text).toContain("Sum Investering");
    expect(text).toContain("Kr 499 999,-");
    expect(text).toContain("Alle beløp er inkludert mva.");
    expect(text).toContain("Termostat, SG");
    expect(text).toContain("8,8 m2");
    expect(text).toContain("bakenforliggende konstruksjoner");
    expect(text).toContain("Tilbudet aksepteres.");
    expect(text).toContain("Håndverker:");
    expect(text).toContain("Oppdragsgiver:");
    expect(text).toContain("Straume Våtrom AS");
    expect(text).toContain("Org nr 911838346");
    expect(text).toContain("Side 1 av");
    expect(text).toContain("Tilbudsnr 260804");
    expect(text).not.toContain("Revisjon");
    expect(text).not.toContain("Sum eks. mva");
    expect(text).not.toContain(AI_SUGGESTION_HEADING);
    expect(text).not.toMatch(/\bAI-forslag\b/);
    expect(text).not.toMatch(/^Poster$/m);
    expect(text).not.toContain("hovedstoppekran");
    expect(text).not.toContain("Må prises manuelt");
    const pages = text.split("\f").filter((page) => page.trim());
    expect(pages.length).toBeGreaterThanOrEqual(4);
    expect(pages[0]).toContain("Tilbud / Kontrakt");
    expect(pages[0]).toContain("Tilbudet inneholder følgende poster:");
    expect(pages[0]).not.toContain("bakenforliggende konstruksjoner");
    expect(pages[0]).not.toContain("Sum Investering");
    const terms = pages.findIndex((page) => page.includes("Oppstartsfaktura"));
    const contract = pages.findIndex((page) => page.includes("Tilbudet aksepteres."));
    expect(terms).toBeGreaterThan(0);
    expect(contract).toBe(terms + 1);
    expect(pages[terms]).not.toContain("Tilbudet aksepteres.");
    expect(pages[contract]).not.toContain("Oppstartsfaktura");
  });

  it("tar med godkjent tilleggstekst som vanlig tekst", async () => {
    const hidden = pdfText(await render(""));
    expect(hidden).not.toContain("nisje i dusjen");
    const shown = pdfText(await render(`${AI_SUGGESTION_HEADING}\nKunden ønsker en nisje i dusjen.`));
    expect(shown).toContain("Kunden ønsker en nisje i dusjen.");
    expect(shown).not.toContain(AI_SUGGESTION_HEADING);
    expect(shown).not.toMatch(/\bAI-forslag\b/);
  });

  it("skriver eksempel-PDF når artifaktmappen finnes", async () => {
    const target = "/opt/cursor/artifacts";
    if (!existsSync(target)) return;
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, "tilbud-eksempel.pdf"), await render());
  });
});
