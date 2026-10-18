import { prisma } from "@straume/db";
import { DomainError } from "@straume/domain";
import { afterAll, describe, expect, it } from "vitest";
import { applyPriceFile } from "./catalog";
import { priceListView } from "./price-admin";
import { createQuoteDraft, transitionQuote } from "./quotes";

const admin = { id: "00000000-0000-4000-8000-000000000001", role: "admin", name: "Ada Berg" };
const seller = { id: "00000000-0000-4000-8000-000000000002", role: "selger", name: "Noah Lien" };
const lyngveien = "60000000-0000-4000-8000-000000000001";
const havneveien = "60000000-0000-4000-8000-000000000002";
const havneDeal = "50000000-0000-4000-8000-000000000004";

describe("fase 2 mot databasen", () => {
  const quotes: string[] = [];
  const suppliers: string[] = [];
  const items: string[] = [];

  afterAll(async () => {
    if (quotes.length) await prisma.quote.deleteMany({ where: { id: { in: quotes } } });
    if (items.length) {
      await prisma.bomLine.deleteMany({ where: { priceItemId: { in: items } } });
      await prisma.priceLine.deleteMany({ where: { priceItemId: { in: items } } });
      await prisma.priceItem.deleteMany({ where: { id: { in: items } } });
    }
    if (suppliers.length) await prisma.supplier.deleteMany({ where: { id: { in: suppliers } } });
    await prisma.project.update({ where: { id: havneveien }, data: { contractSumNok: 512000 } });
    await prisma.deal.update({ where: { id: havneDeal }, data: { valueNok: 512000 } });
    await prisma.$disconnect();
  });

  it("holder interne notater ute av kundeteksten", async () => {
    const created = await createQuoteDraft(admin, { projectId: lyngveien });
    quotes.push(created.id);
    const quote = await prisma.quote.findUniqueOrThrow({ where: { id: created.id }, include: { lines: true } });
    const text = `${quote.customerText}\n${quote.reservations}\n${quote.emailBody}`;
    expect(text).not.toContain("flisformat");
    expect(text).not.toContain("karm er skjev");
    expect(text.toLowerCase()).not.toContain("enhetspris");
    expect(quote.lines.length).toBeGreaterThan(0);
    expect(quote.lines.every((line) => line.unitPriceExVat !== null)).toBe(true);
  });

  it("krever godkjenningsrolle og kopierer kontraktsum ved aksept", async () => {
    const list = await prisma.priceList.findFirstOrThrow({ where: { status: "active" } });
    const quote = await prisma.quote.create({
      data: {
        dealId: havneDeal,
        projectId: havneveien,
        familyId: crypto.randomUUID(),
        priceListId: list.id,
        title: "Testtilbud",
        totalIncVat: 11111,
        status: "draft",
      },
    });
    quotes.push(quote.id);
    const pending = await transitionQuote(seller, quote.id, "pending_approval");
    expect(pending.status).toBe("pending_approval");
    await expect(transitionQuote(seller, quote.id, "approved")).rejects.toBeInstanceOf(DomainError);
    const approved = await transitionQuote(admin, quote.id, "approved");
    expect(approved.status).toBe("approved");
    expect(approved.events.some((event) => event.actorName === "Ada Berg" && event.toStatus === "approved")).toBe(true);
    await transitionQuote(admin, quote.id, "sent");
    await transitionQuote(admin, quote.id, "accepted");
    const project = await prisma.project.findUniqueOrThrow({ where: { id: havneveien } });
    const deal = await prisma.deal.findUniqueOrThrow({ where: { id: havneDeal } });
    expect(Number(project.contractSumNok)).toBe(11111);
    expect(Number(deal.valueNok)).toBe(11111);
  });

  it("låser tilbudspris når produktkatalogen oppdateres og regner stykkelisten på nytt", async () => {
    const list = await prisma.priceList.findFirstOrThrow({ where: { status: "active" } });
    const supplier = await prisma.supplier.create({
      data: { name: "Testgrossist", code: `test-${Date.now()}`, format: "csv", columnMap: { sku: "varenummer", name: "navn", cost: "kostpris", unit: "enhet" } },
    });
    suppliers.push(supplier.id);
    const product = await prisma.product.create({
      data: { supplierId: supplier.id, sku: "T-1", name: "Testpakning", unit: "stk", costPrice: 100, listPrice: 180 },
    });
    const code = `ANN-T${Date.now().toString(36).slice(-4)}`;
    items.push(code);
    await prisma.priceItem.create({
      data: { id: code, code, tradeId: "annet", name: "Testpakke", unit: "stk", type: "package", sortOrder: 99 },
    });
    await prisma.priceLine.create({
      data: { priceListId: list.id, priceItemId: code, materialCost: 100, materialMarkup: 0.2, hoursPerUnit: 0 },
    });
    await prisma.bomLine.create({ data: { priceItemId: code, kind: "product", productId: product.id, quantity: 2, sortOrder: 1 } });
    const quote = await prisma.quote.create({
      data: {
        familyId: crypto.randomUUID(),
        priceListId: list.id,
        title: "Låst",
        lines: {
          create: {
            priceItemId: code,
            tradeCode: "annet",
            code,
            description: "Testpakke",
            unit: "stk",
            quantity: 1,
            quantitySource: "manual",
            unitPriceExVat: 999,
            materialCost: 100,
            lineSumExVat: 999,
            sortOrder: 1,
          },
        },
      },
    });
    quotes.push(quote.id);
    const csv = "varenummer;navn;enhet;kostpris\nT-1;Testpakning;stk;150\n";
    const applied = await applyPriceFile(admin, supplier.id, "test.csv", Buffer.from(csv));
    expect(applied.diff.some((row) => row.sku === "T-1" && row.kind === "cost" && row.oldCost === 100 && row.newCost === 150)).toBe(true);
    const view = await priceListView(list.id);
    const line = view.lines.find((item) => item.code === code);
    expect(line?.materialCost).toBeCloseTo(300, 2);
    expect(line?.bomFlags).toEqual([]);
    const locked = await prisma.quoteLine.findFirstOrThrow({ where: { quoteId: quote.id } });
    expect(Number(locked.unitPriceExVat)).toBe(999);
  });
});
