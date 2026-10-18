import { describe, expect, it } from "vitest";
import { diffCatalog, mapPriceRows, presetFor, rollupBom, type BomLineInput } from "./catalog";
import { priceListFromCsv, adjustComponents, DEFAULT_TRADE_RATES } from "./pricing";
import { readFileSync } from "node:fs";
import { tableToRecords, tableToXlsx, xlsxToTable } from "./xlsx-table";
import { computeSalePrice } from "./pricing";

const product = (patch: Partial<BomLineInput["product"]> & Pick<NonNullable<BomLineInput["product"]>, "sku">): NonNullable<BomLineInput["product"]> => ({
  id: patch.sku,
  name: patch.name ?? patch.sku,
  unit: "stk",
  costPrice: 100,
  listPrice: 200,
  discontinued: false,
  ...patch,
});

describe("stykkliste", () => {
  it("regner materialkost fra produkter og fri sum, og flagger utgått vare og manglende pris", () => {
    const lines: BomLineInput[] = [
      { id: "a", kind: "product", label: null, amountNok: null, quantity: 1, product: product({ sku: "FR-100", costPrice: 890 }) },
      { id: "b", kind: "product", label: null, amountNok: null, quantity: 0.2, product: product({ sku: "FR-300", name: "Membran", costPrice: 610 }) },
      { id: "c", kind: "amount", label: "Festemidler", amountNok: 85, quantity: 1, product: null },
      { id: "d", kind: "product", label: null, amountNok: null, quantity: 1, product: product({ sku: "FR-404", name: "Pakning", costPrice: 40, discontinued: true }) },
      { id: "e", kind: "product", label: null, amountNok: null, quantity: 2, product: product({ sku: "FR-000", name: "Uten pris", costPrice: null }) },
    ];
    const rollup = rollupBom(lines);
    expect(rollup?.materialCost).toBeCloseTo(890 + 122 + 85 + 40, 4);
    expect(rollup?.flags.map((flag) => flag.code)).toEqual(["discontinued", "missing_price"]);
    expect(rollup?.incomplete).toBe(true);
    expect(rollupBom([])).toBeNull();
  });

  it("lar et låst tilbud beholde prisen når katalogen endres", () => {
    const before = rollupBom([
      { id: "a", kind: "product", label: null, amountNok: null, quantity: 2, product: product({ sku: "FR-100", costPrice: 100 }) },
    ]);
    const snapshot = computeSalePrice(
      {
        itemId: "TOM-050",
        code: "TOM-050",
        tradeCode: "tomrer",
        name: "Pakke",
        unit: "stk",
        type: "unit_price",
        materialCost: before!.materialCost,
        materialMarkup: 0.3,
        hoursPerUnit: 1,
        hourlyRateOverride: null,
        salePriceOverride: null,
        quantityFormula: null,
        costFormula: null,
        internalNote: null,
        customerVisible: true,
        active: true,
        sortOrder: 1,
      },
      DEFAULT_TRADE_RATES,
    );
    const after = rollupBom([
      { id: "a", kind: "product", label: null, amountNok: null, quantity: 2, product: product({ sku: "FR-100", costPrice: 150 }) },
    ]);
    expect(snapshot).toBe(200 * 1.3 + 910);
    expect(after?.materialCost).toBe(300);
    expect(snapshot).not.toBe(after!.materialCost * 1.3 + 910);
  });
});

describe("leverandørpris", () => {
  const existing = [
    { sku: "FR-100", name: "Batteri", costPrice: 890, listPrice: 1490, discontinued: false },
    { sku: "FR-200", name: "Slukrist", costPrice: 240, listPrice: 420, discontinued: false },
  ];

  it("viser diff og leser både CSV og Excel med lagret mapping", () => {
    const csv = "varenummer;navn;enhet;kostpris;veilpris;nobb\nFR-100;Batteri;stk;940;1490;123\nFR-500;Ny kran;stk;1100;1800;\nFR-200;Slukrist;stk;240;420;\n";
    const parsed = mapPriceRows(parseSemi(csv), presetFor("csv"));
    const diff = diffCatalog(existing, parsed);
    expect(diff.find((row) => row.sku === "FR-100")).toMatchObject({ kind: "cost", oldCost: 890, newCost: 940 });
    expect(diff.find((row) => row.sku === "FR-500")?.kind).toBe("new");
    expect(diff.find((row) => row.sku === "FR-200")?.kind).toBe("unchanged");
    const table = [
      ["Varenr", "Varetekst", "Enhet", "Pris", "NOBB"],
      ["FR-100", "Batteri", "stk", "940", "555"],
    ];
    const back = tableToRecords(xlsxToTable(tableToXlsx(table)));
    const fromExcel = mapPriceRows(back, presetFor("efo"));
    expect(fromExcel[0]).toMatchObject({ sku: "FR-100", costPrice: 940, nobb: "555" });
  });
});

describe("splitt og separat justering", () => {
  const csv = readFileSync(new URL("../../db/prisma/data/prisposter.csv", import.meta.url), "utf8");
  const list = priceListFromCsv(csv, { id: "mal", name: "Mal", validFrom: "2026-08-11" });

  it("flagger elektrikerposter som bare har totalpris, og utleder timeposter", () => {
    const downlight = list.lines.find((line) => line.code === "EL-002");
    expect(downlight?.splitConfidence).toBe("uncertain");
    expect(downlight?.salePriceOverride).toBe(1510);
    const hours = list.lines.find((line) => line.code === "EL-015");
    expect(hours?.splitConfidence).toBe("derived");
    expect(hours?.hoursPerUnit).toBe(1);
    const known = list.lines.find((line) => line.code === "TOM-004");
    expect(known?.splitConfidence).toBe("known");
    expect(known?.materialCost).toBeGreaterThan(0);
    expect(known?.hoursPerUnit).toBeGreaterThan(0);
  });

  it("justerer materiell og timepris hver for seg", () => {
    const { next } = adjustComponents(list, {
      id: "ny",
      name: "Justert",
      validFrom: "2027-03-01",
      materialPercent: 10,
      laborPercent: 0,
      tradeCodes: ["tomrer"],
    });
    const gips = list.lines.find((line) => line.code === "TOM-004")!;
    const nextGips = next.lines.find((line) => line.code === "TOM-004")!;
    expect(nextGips.materialCost).toBeCloseTo(gips.materialCost * 1.1, 4);
    expect(next.rates.find((rate) => rate.tradeCode === "tomrer")?.hourlyRateSale).toBe(910);
    const labor = adjustComponents(list, {
      id: "timer",
      name: "Timer",
      validFrom: "2027-04-01",
      materialPercent: 0,
      laborPercent: 5,
    }).next;
    expect(labor.rates.find((rate) => rate.tradeCode === "elektriker")?.hourlyRateSale).toBeCloseTo(1190 * 1.05, 2);
    expect(labor.lines.find((line) => line.code === "TOM-004")?.materialCost).toBe(gips.materialCost);
  });
});

function parseSemi(text: string): Record<string, string>[] {
  const [header, ...rows] = text.trim().split("\n");
  const keys = header!.split(";");
  return rows.map((row) => {
    const cells = row.split(";");
    return Object.fromEntries(keys.map((key, index) => [key, cells[index] ?? ""]));
  });
}
