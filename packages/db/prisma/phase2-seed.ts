import { FORMAT_PRESETS, numberedWalls, priceListFromCsv, type Sketch } from "@straume/domain";
import type { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const id = (n: number, group: string) => `${group}-0000-4000-8000-${String(n).padStart(12, "0")}`;

const TEMPLATES: { key: string; name: string; kind: string; tradeCode?: string; sortOrder: number; body: string }[] = [
  {
    key: "intro",
    name: "Innledning",
    kind: "intro",
    sortOrder: 1,
    body: "Vi takker for hyggelig befaring og sender tilbud på rehabilitering av badet. Alle summer er inkludert merverdiavgift. Tilbudet er gyldig i {{gyldighet.dager}} dager.",
  },
  { key: "fag.riving", name: "Riving", kind: "trade", tradeCode: "riving", sortOrder: 10, body: "Riving og bortkjøring." },
  { key: "fag.tomrer", name: "Tømrer", kind: "trade", tradeCode: "tomrer", sortOrder: 20, body: "Tømrerarbeid. Timepris {{timepris.tomrer}} kr eks. mva." },
  { key: "fag.elektriker", name: "Elektriker", kind: "trade", tradeCode: "elektriker", sortOrder: 30, body: "Elektriker utføres av underleverandør, med fast pris og uten egne timer. Timepris {{timepris.elektriker}} kr eks. mva. Ekstra oppmøte {{oppmote.ekstra}} kr eks. mva." },
  { key: "fag.rorlegger", name: "Rørlegger", kind: "trade", tradeCode: "rorlegger", sortOrder: 40, body: "Rørlegger. Timepris {{timepris.rorlegger}} kr eks. mva." },
  { key: "fag.murer", name: "Murer", kind: "trade", tradeCode: "murer", sortOrder: 50, body: "Flis og membran. Timepris {{timepris.murer}} kr eks. mva." },
  { key: "fag.maler", name: "Maler", kind: "trade", tradeCode: "maler", sortOrder: 60, body: "Maler. Timepris {{timepris.maler}} kr eks. mva." },
  {
    key: "forbehold",
    name: "Forbehold",
    kind: "reservation",
    sortOrder: 70,
    body: "Skjulte forhold bak eksisterende flater er ikke inkludert. Ekstra oppmøte utover avtalt fremdrift prises med {{oppmote.ekstra}} kr eks. mva per oppmøte.",
  },
  {
    key: "spesifikasjon",
    name: "Spesifikasjon",
    kind: "spec",
    sortOrder: 80,
    body: "Flis som kunden holder, er inkludert inntil {{flis.inntil.ink}} kr per m² inkl. mva ({{flis.inntil}} kr eks. mva).\n{{#flis.inntil}}Flisgodtgjørelsen følger prislisten.{{/flis.inntil}}\n{{#oppmote.ekstra}}Ekstra oppmøte følger prislisten.{{/oppmote.ekstra}}\nMontering av innredning kunden leverer: {{timepris.montering}} kr per time.",
  },
  {
    key: "epost.tilbud",
    name: "E-post tilbud",
    kind: "email",
    sortOrder: 90,
    body: "Hei,\n\nVedlagt ligger tilbudet. Summen inkludert mva er {{total.ink}} kr. Timepris elektriker er {{timepris.elektriker}} kr eks. mva. Flisgodtgjørelse: {{flis.inntil.ink}} kr inkl. mva. Ekstra oppmøte: {{oppmote.ekstra}} kr eks. mva.\n\nVennlig hilsen\nStraume Våtrom",
  },
  {
    key: "epost.endring",
    name: "E-post endring",
    kind: "email",
    sortOrder: 91,
    body: "Hei,\n\nPrisen på tilleggsarbeidet følger samme satser som kontrakten. Timepris elektriker er {{timepris.elektriker}} kr eks. mva.\n\nVennlig hilsen\nStraume Våtrom",
  },
  {
    key: "endring.brev",
    name: "Brev tilleggsarbeid",
    kind: "change",
    sortOrder: 92,
    body: "Beskrivelse av tillegg:\n{{beskrivelse}}\n\nPoster:\n{{poster}}\n\nForutsetninger: timesatser og betingelser følger tilbudet. Timepris tømrer {{timepris.tomrer}} kr eks. mva.",
  },
];

export async function ensurePhase2(prisma: PrismaClient) {
  const csv = readFileSync(join(here, "data/prisposter.csv"), "utf8");
  const priceList = priceListFromCsv(csv, { id: id(1, "30000000"), name: "Prisliste 2026", validFrom: "2026-08-11" });
  for (const line of priceList.lines) {
    await prisma.priceItem.updateMany({
      where: { code: line.code },
      data: { splitConfidence: line.splitConfidence ?? "known", splitNote: line.splitNote ?? null },
    });
  }

  for (const template of TEMPLATES) {
    await prisma.textTemplate.upsert({
      where: { key: template.key },
      update: { name: template.name, kind: template.kind, body: template.body },
      create: { ...template, tradeCode: template.tradeCode ?? null },
    });
  }
  await prisma.appSetting.upsert({
    where: { key: "quote_approver_roles" },
    update: {},
    create: { key: "quote_approver_roles", value: "admin,kontor" },
  });

  const supplierId = id(1, "90000000");
  const columnMap = FORMAT_PRESETS.csv ?? { sku: "varenummer", name: "navn", unit: "enhet", cost: "kostpris", listPrice: "veilpris" };
  await prisma.supplier.upsert({
    where: { code: "fiktiv-ror" },
    update: { name: "Fiktiv Rør AS", format: "csv", columnMap },
    create: { id: supplierId, name: "Fiktiv Rør AS", code: "fiktiv-ror", format: "csv", columnMap },
  });
  const supplier = await prisma.supplier.findUniqueOrThrow({ where: { code: "fiktiv-ror" } });
  const products = [
    { sku: "FR-100", name: "Servantbatteri", unit: "stk", costPrice: 890, listPrice: 1490, nobb: "10000001", ean: "7000000000011", discontinued: false },
    { sku: "FR-200", name: "Slukrist", unit: "stk", costPrice: 240, listPrice: 420, nobb: "10000002", ean: "7000000000028", discontinued: false },
    { sku: "FR-300", name: "Membran", unit: "m2", costPrice: 610, listPrice: 890, nobb: null, ean: "7000000000035", discontinued: false },
    { sku: "FR-404", name: "Hjørnelist utgått", unit: "stk", costPrice: 40, listPrice: 80, nobb: null, ean: null, discontinued: true },
  ];
  const productIds = new Map<string, string>();
  for (const [index, product] of products.entries()) {
    const saved = await prisma.product.upsert({
      where: { supplierId_sku: { supplierId: supplier.id, sku: product.sku } },
      update: { ...product, validFrom: new Date("2026-08-11") },
      create: { id: id(index + 1, "91000000"), supplierId: supplier.id, ...product, validFrom: new Date("2026-08-11") },
    });
    productIds.set(product.sku, saved.id);
  }

  const listId = id(1, "30000000");
  await prisma.priceItem.upsert({
    where: { code: "TOM-050" },
    update: {
      name: "Servantpakke med stykkliste",
      unit: "stk",
      splitConfidence: "known",
      splitNote: "Materialkost summeres fra stykklisten.",
    },
    create: {
      id: "TOM-050",
      code: "TOM-050",
      tradeId: "tomrer",
      name: "Servantpakke med stykkliste",
      unit: "stk",
      type: "package",
      sortOrder: 50,
      customerVisible: true,
      splitConfidence: "known",
      splitNote: "Materialkost summeres fra stykklisten.",
    },
  });
  await prisma.priceLine.upsert({
    where: { priceListId_priceItemId: { priceListId: listId, priceItemId: "TOM-050" } },
    update: {},
    create: {
      priceListId: listId,
      priceItemId: "TOM-050",
      materialCost: 1137,
      materialMarkup: 0.3,
      hoursPerUnit: 1.5,
    },
  });
  const bom = [
    { id: id(1, "92000000"), kind: "product", productId: productIds.get("FR-100"), quantity: 1, label: null, amountNok: null },
    { id: id(2, "92000000"), kind: "product", productId: productIds.get("FR-300"), quantity: 0.2, label: null, amountNok: null },
    { id: id(3, "92000000"), kind: "amount", productId: null, quantity: 1, label: "Festemidler", amountNok: 85 },
    { id: id(4, "92000000"), kind: "product", productId: productIds.get("FR-404"), quantity: 1, label: null, amountNok: null },
  ];
  for (const [index, line] of bom.entries()) {
    await prisma.bomLine.upsert({
      where: { id: line.id },
      update: { sortOrder: index + 1, kind: line.kind, productId: line.productId, quantity: line.quantity, label: line.label, amountNok: line.amountNok },
      create: { priceItemId: "TOM-050", sortOrder: index + 1, ...line },
    });
  }

  await seedFjellstien(prisma);
}

async function seedFjellstien(prisma: PrismaClient) {
  const when = new Date("2026-10-16T10:00:00.000Z");
  const sketch: Sketch = {
    points: [
      { x: 0, y: 0 },
      { x: 2.4, y: 0 },
      { x: 2.4, y: 1.85 },
      { x: 0, y: 1.85 },
    ],
    doorEdge: 0,
    ceilingHeightM: 2.25,
    openings: [{ id: "vindu-1", type: "window", wallNumber: 2, offsetM: 0.4, widthM: 0.6 }],
  };
  const inspectionId = id(2, "70000000");
  const floorId = id(2, "71000000");
  const roomId = id(2, "72000000");
  const dealId = id(2, "50000000");
  await prisma.inspection.upsert({
    where: { id: inspectionId },
    update: {},
    create: {
      id: inspectionId,
      dealId,
      inspectorId: id(2, "00000000"),
      templateVersionId: id(1, "81000000"),
      status: "draft",
      visitedAt: when,
      updatedAt: when,
      fieldUpdatedAt: { status: when.toISOString() },
    },
  });
  await prisma.floor.upsert({
    where: { id: floorId },
    update: {},
    create: {
      id: floorId,
      inspectionId,
      name: "1. etasje",
      sortOrder: 0,
      updatedAt: when,
      fieldUpdatedAt: { name: when.toISOString() },
    },
  });
  await prisma.room.upsert({
    where: { id: roomId },
    update: { perimeterM: 8.5, ceilingHeightM: 2.25, floorAreaM: 4.44, sketch },
    create: {
      id: roomId,
      floorId,
      name: "Bad",
      sortOrder: 0,
      perimeterM: 8.5,
      ceilingHeightM: 2.25,
      floorAreaM: 4.44,
      measurementSource: "sketch",
      sketch,
      updatedAt: when,
      fieldUpdatedAt: { sketch: when.toISOString() },
    },
  });
  for (const wall of numberedWalls(sketch)) {
    await prisma.wall.upsert({
      where: { id: id(20 + wall.number, "73000000") },
      update: {},
      create: {
        id: id(20 + wall.number, "73000000"),
        roomId,
        number: wall.number,
        edgeIndex: wall.edgeIndex,
        lengthM: wall.lengthM,
        updatedAt: when,
        fieldUpdatedAt: { lengthM: when.toISOString() },
      },
    });
  }
  await prisma.note.upsert({
    where: { id: id(3, "74000000") },
    update: {},
    create: {
      id: id(3, "74000000"),
      dealId,
      inspectionId,
      roomId,
      body: "Kunden ønsker lyst servantbatteri.",
      internal: false,
      updatedAt: when,
      fieldUpdatedAt: { body: when.toISOString() },
    },
  });
  await prisma.note.upsert({
    where: { id: id(4, "74000000") },
    update: {},
    create: {
      id: id(4, "74000000"),
      dealId,
      inspectionId,
      roomId,
      body: "Intern: ikke nevne at naboen klaget på støv.",
      internal: true,
      updatedAt: when,
      fieldUpdatedAt: { body: when.toISOString() },
    },
  });
  const version = await prisma.checklistTemplateVersion.findFirst({ where: { version: 1 }, include: { sections: { include: { items: true } } } });
  const items = version?.sections.flatMap((section) => section.items) ?? [];
  const answers = [
    { n: 2, code: "TOM-004", value: true, freeText: null },
    { n: 3, code: "EL-002", value: 4, freeText: null },
    { n: 4, code: "MUR-002", value: true, freeText: "Kunden er usikker på flisformat?" },
  ];
  for (const answer of answers) {
    const item = items.find((row) => row.priceItemCode === answer.code);
    if (!item) continue;
    await prisma.checklistAnswer.upsert({
      where: { inspectionId_itemId: { inspectionId, itemId: item.id } },
      update: {},
      create: {
        id: id(answer.n, "75000000"),
        inspectionId,
        itemId: item.id,
        value: answer.value,
        freeText: answer.freeText,
        updatedAt: when,
        fieldUpdatedAt: { value: when.toISOString() },
      },
    });
  }
}
