import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DomainError } from "./errors";
import {
  activatePriceList,
  addPriceLine,
  computeSalePrice,
  createAdjustedVersion,
  DEFAULT_TRADE_RATES,
  lineFromSpreadsheetRow,
  priceListFromCsv,
  type PriceLineInput,
} from "./pricing";

const rates = DEFAULT_TRADE_RATES;

function line(partial: Partial<PriceLineInput> & Pick<PriceLineInput, "code" | "tradeCode" | "type">): PriceLineInput {
  return {
    itemId: partial.code,
    name: partial.name ?? partial.code,
    unit: "stk",
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

describe("salgspris", () => {
  it("regner materialpåslag pluss timer, og lar overstyring vinne", () => {
    const computed = computeSalePrice(
      line({ code: "X", tradeCode: "rorlegger", type: "unit_price", materialCost: 100, materialMarkup: 0.4, hoursPerUnit: 2 }),
      rates,
    );
    expect(computed).toBe(2120);
    const overridden = computeSalePrice(
      line({ code: "Y", tradeCode: "elektriker", type: "unit_price", salePriceOverride: 1510 }),
      rates,
    );
    expect(overridden).toBe(1510);
    expect(
      computeSalePrice(line({ code: "Z", tradeCode: "annet", type: "percent_addon", salePriceOverride: 0.07 }), rates),
    ).toBe(0.07);
  });
});

describe("import fra regneark", () => {
  const csv = readFileSync(new URL("../../db/prisma/data/prisposter.csv", import.meta.url), "utf8");
  const list = priceListFromCsv(csv, { id: "pl-2026", name: "Prisliste 2026", validFrom: "2026-08-11" });

  it("gir unike koder og bevarer salgsprisen fra regnearket", () => {
    expect(list.lines).toHaveLength(110);
    expect(new Set(list.lines.map((item) => item.code)).size).toBe(110);
    const riving = list.lines.find((item) => item.code === "RIV-001");
    expect(riving?.salePriceOverride).toBeNull();
    expect(computeSalePrice(riving!, rates)).toBe(930);
    const fibo = list.lines.find((item) => item.code === "TOM-001");
    expect(computeSalePrice(fibo!, rates)).toBe(1615.04);
    const callout = list.lines.find((item) => item.code === "TOM-018");
    expect(callout?.salePriceOverride).toBe(450);
    const diverse = list.lines.find((item) => item.code === "TOM-019");
    expect(diverse?.salePriceOverride).toBe(890);
    const downlight = list.lines.find((item) => item.code === "EL-002");
    expect(downlight?.salePriceOverride).toBe(1510);
    const plates = list.lines.find((item) => item.code === "TOM-002");
    expect(plates?.quantityFormula).toBe("(omkrets/0.6)*1.2");
    const byggstart = list.lines.find((item) => item.code === "ANN-002");
    expect(byggstart?.type).toBe("percent_addon");
    expect(byggstart?.customerVisible).toBe(false);
  });

  it("lager ny versjon med prosent uten å røre originalen eller provisjonssatsene", () => {
    const before = list.lines.find((item) => item.code === "RIV-002")!.materialCost;
    const { previous, next } = createAdjustedVersion(list, {
      id: "pl-2027",
      name: "Prisliste 2027",
      validFrom: "2027-01-01",
      percent: 5,
      tradeCodes: ["riving", "tomrer"],
    });
    expect(list.lines.find((item) => item.code === "RIV-002")!.materialCost).toBe(before);
    expect(previous.status).toBe("active");
    expect(previous.validTo).toBe("2026-12-31");
    expect(next.status).toBe("draft");
    expect(next.lines.find((item) => item.code === "RIV-002")!.materialCost).toBeCloseTo(before * 1.05, 4);
    expect(next.lines.find((item) => item.code === "TOM-018")!.salePriceOverride).toBe(472.5);
    expect(next.lines.find((item) => item.code === "EL-002")!.salePriceOverride).toBe(1510);
    expect(next.lines.find((item) => item.code === "ANN-002")!.salePriceOverride).toBe(0.07);
    expect(next.lines.map((item) => item.code)).toEqual(list.lines.map((item) => item.code));
    const withNew = addPriceLine(next, line({
      code: "TOM-099",
      itemId: "TOM-099",
      tradeCode: "tomrer",
      type: "unit_price",
      name: "Ekstra list",
      unit: "lm",
      materialCost: 40,
      hoursPerUnit: 0.2,
      sortOrder: 99,
    }));
    expect(withNew.lines.some((item) => item.code === "TOM-099")).toBe(true);
    expect(previous.lines.some((item) => item.code === "TOM-099")).toBe(false);
    expect(() => addPriceLine(withNew, withNew.lines.find((item) => item.code === "TOM-099")!)).toThrow(DomainError);
  });

  it("kan ta med timesatser og aktivere den nye listen", () => {
    const { next } = createAdjustedVersion(list, {
      id: "pl-2027b",
      name: "Med timer",
      validFrom: "2027-02-01",
      percent: 5,
      includeLaborRates: true,
    });
    expect(next.rates.find((rate) => rate.tradeCode === "tomrer")?.hourlyRateSale).toBe(955.5);
    const activated = activatePriceList(
      [
        { id: list.id, status: "active" as const },
        { id: next.id, status: "draft" as const },
      ],
      next.id,
    );
    expect(activated.find((item) => item.id === next.id)?.status).toBe("active");
    expect(activated.find((item) => item.id === list.id)?.status).toBe("archived");
  });
});

describe("radtolking", () => {
  it("setter timesats-overstyring bare når den avviker fra faget", () => {
    const row = lineFromSpreadsheetRow({
      kategori: "tomrer",
      kategori_navn: "Tømrer",
      sortering: "14",
      navn: "Byggeledelse, administrasjon",
      type: "timer",
      enhet: "t",
      salgspris_eks_mva: "1150",
      materialkost_pr_enhet: "0",
      paslag_material: "",
      timer_pr_enhet: "1",
      timesats: "1150",
      mengdeformel_mal: "",
      merknad: "",
      materialkost_formel: "",
    });
    expect(row.hourlyRateOverride).toBe(1150);
    expect(row.salePriceOverride).toBeNull();
    expect(computeSalePrice(row, rates)).toBe(1150);
  });
});
