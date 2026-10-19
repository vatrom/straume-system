import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  applyDraft,
  asItemConfig,
  mockDraft,
  quantityContext,
  type DraftAnswer,
  type PriceLineInput,
  type RateInput,
} from "@straume/domain";

const id = (n: number, group: string) => `${group}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const when = new Date("2026-10-18T10:00:00.000Z");

const ANSWERS: Record<string, unknown> = {
  "kunde.beskrivelse": "Oppussing av bad og vaskerom, og litt arbeid på kjøkkenet",
  "kunde.oppstart": "Ønsker å starte etter nyttår",
  "maal.gulv": 5.5,
  "maal.hoyde": 2.4,
  "maal.omkrets": 11,
  "maal.tilkomst": "OK",
  "maal.parkering": false,
  "fag.valg": ["Riving", "Tømrerarbeid", "Elektro", "Rør", "Murerarbeid", "Malerarbeid"],
  "riving.tildekking": "Mye",
  "riving.hva": ["Innredning demonteres", "Pigge påstøp"],
  "riving.omfang": "3-4 dager",
  "riving.tekst": "2 lag med påstøp som skal pigges opp",
  "tomrer.arbeid": ["Oppretting av vegger", "Bygge toalettkasse", "Ny gipshimling", "Annen type himling", "Gipsvegger inne på våtrom", "Gipsvegger i tillegg til våtrom"],
  "tomrer.himling": "Spileplater",
  "tomrer.gips_vat": 25,
  "tomrer.gips_ekstra": 5,
  "tomrer.dor_behold": 1,
  "tomrer.dor_ny": 1,
  "tomrer.vindu": true,
  "tomrer.vindu_tekst": "Toppsving 100x130 med frostet glass",
  "tomrer.tekst": "Kunden ønsker ny laminat på kjøkkenet, omtrent 6 m2",
  "el.varme": ["Nye varmekabler", "Ny termostat"],
  "el.downlight": 5,
  "el.dimmer": 1,
  "el.speil": 1,
  "el.himling": 0,
  "el.bryter": 1,
  "el.stikk_dobbel": 1,
  "el.stikk_enkel": 2,
  "el.vifte": 1,
  "el.vvb": true,
  "el.tekst": "Kunden ønsker Plejd på brytere, dimmere og termostat",
  "ror.standard": true,
  "ror.kald": 2,
  "ror.varm": 2,
  "ror.sluk": 1,
  "ror.avlop50": 1,
  "ror.vm": 1,
  "ror.renne": 1,
  "ror.utstyr": ["Badekarskran", "Utekran (kald)", "Magnetventil", "Hovedstoppekran", "Ny VVB 200L standard", "Spillbakke"],
  "ror.tekst": "Kunden ønsker innbyggingsbatterier i dusj og på servant",
  "mur.arbeid": ["Støping av gulv", "Nedsenk i dusj", "Delvis flislagte vegger", "Gulvfliser med sokkel"],
  "mur.delvis": 16,
  "mur.sokkel": 6,
  "mur.hjorne": 2.4,
  "mur.kasse": 1,
  "mur.stor": 5,
  "mur.sma": 1.5,
  "mur.tekst": "Ønsker epoxyfuger på gulv",
  "mal.arbeid": ["Sparkling og maling av himling", "Sparkling og maling av gipsede vegger", "Aquapro"],
  "mal.aquapro": 15,
  "mal.tekst": "Ønsker også noe ekstra sparkling og maling ca 20 m2 vegg",
  "annet.kilde": "MittAnbud XL",
  "annet.rund": 15000,
};

/** Ett fiktivt utfylt skjema på Fjellstien. Eksisterende svar og tilbud blir stående. */
export async function ensureDemoBefaring(prisma: PrismaClient) {
  const inspectionId = id(3, "70000000");
  const version = await prisma.checklistTemplateVersion.findFirst({
    where: { publishedAt: { not: null } },
    orderBy: { version: "desc" },
    include: { sections: { include: { items: true } } },
  });
  const items = version?.sections.flatMap((section) => section.items) ?? [];
  if (!version || !items.some((item) => item.itemKey === "kunde.beskrivelse")) return;
  const existing = await prisma.inspection.findUnique({ where: { id: inspectionId } });
  if (!existing) {
    await prisma.inspection.create({
      data: {
        id: inspectionId,
        dealId: id(2, "50000000"),
        inspectorId: id(2, "00000000"),
        templateVersionId: version.id,
        status: "draft",
        visitedAt: when,
        updatedAt: when,
        fieldUpdatedAt: { status: when.toISOString() },
      },
    });
    await prisma.floor.create({
      data: { id: id(3, "71000000"), dealId: id(2, "50000000"), inspectionId, name: "1. etasje", sortOrder: 0, updatedAt: when, fieldUpdatedAt: {} },
    });
    await prisma.room.create({
      data: {
        id: id(3, "72000000"),
        floorId: id(3, "71000000"),
        name: "Bad",
        sortOrder: 0,
        perimeterM: 11,
        ceilingHeightM: 2.4,
        floorAreaM: 5.5,
        measurementSource: "manual",
        updatedAt: when,
        fieldUpdatedAt: {},
      },
    });
    let n = 20;
    for (const item of items) {
      if (!item.itemKey || !(item.itemKey in ANSWERS)) continue;
      n += 1;
      await prisma.checklistAnswer.create({
        data: {
          id: id(n, "75000000"),
          inspectionId,
          itemId: item.id,
          value: ANSWERS[item.itemKey] as Prisma.InputJsonValue,
          updatedAt: when,
          fieldUpdatedAt: { value: when.toISOString() },
        },
      });
    }
    const photo = items.find((item) => item.itemKey === "bilder.adkomst");
    const photoAnswer = photo
      ? await prisma.checklistAnswer.create({
          data: { id: id(80, "75000000"), inspectionId, itemId: photo.id, value: "1", updatedAt: when, fieldUpdatedAt: {} },
        })
      : null;
    const storageKey = writeDemoPhoto();
    await prisma.media.create({
      data: {
        id: id(1, "76000000"),
        dealId: id(2, "50000000"),
        inspectionId,
        answerId: photoAnswer?.id,
        kind: "photo",
        internal: true,
        storageKey,
        mimeType: "image/jpeg",
        fileName: "adkomst-fiktiv.jpg",
        updatedAt: when,
        fieldUpdatedAt: {},
      },
    });
    await prisma.note.create({
      data: {
        id: id(5, "74000000"),
        dealId: id(2, "50000000"),
        inspectionId,
        sectionKey: "Riving",
        body: "Intern: sjekk adkomst med vaktmester før oppstart. Ikke ta med i tilbudet.",
        internal: true,
        updatedAt: when,
        fieldUpdatedAt: {},
      },
    });
  }

  const quoteId = id(9, "90000000");
  if (await prisma.quote.findUnique({ where: { id: quoteId } })) return;
  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    include: { answers: { include: { item: { include: { section: true } } } }, notes: true, media: true, floors: { include: { rooms: true } }, deal: true },
  });
  const list = await prisma.priceList.findFirst({
    where: { status: "active" },
    include: { lines: { include: { priceItem: { include: { trade: true } } } }, rates: { include: { trade: true } } },
  });
  if (!inspection || !list) return;
  const room = inspection.floors.flatMap((floor) => floor.rooms)[0];
  const context = quantityContext({
    perimeterM: Number(room?.perimeterM ?? 11),
    ceilingHeightM: Number(room?.ceilingHeightM ?? 2.4),
    floorAreaM: Number(room?.floorAreaM ?? 5.5),
  });
  const answers: DraftAnswer[] = inspection.answers.map((answer) => ({
    prompt: answer.item.prompt,
    tradeCode: answer.item.section.tradeCode,
    value: answer.value,
    freeText: answer.freeText,
    priceItemCode: answer.item.priceItemCode,
    internalNote: answer.internalNote,
    key: answer.item.itemKey,
    questionType: answer.item.questionType,
    unit: answer.item.unit,
    config: asItemConfig(answer.item.config),
  }));
  const catalog: PriceLineInput[] = list.lines.map((line) => ({
    itemId: line.priceItemId,
    code: line.priceItem.code,
    name: line.priceItem.name,
    unit: line.priceItem.unit,
    type: line.priceItem.type,
    tradeCode: line.priceItem.trade.code,
    materialCost: Number(line.materialCost),
    materialMarkup: line.materialMarkup == null ? null : Number(line.materialMarkup),
    hoursPerUnit: Number(line.hoursPerUnit),
    hourlyRateOverride: line.hourlyRateOverride == null ? null : Number(line.hourlyRateOverride),
    salePriceOverride: line.salePriceOverride == null ? null : Number(line.salePriceOverride),
    quantityFormula: line.priceItem.quantityFormula,
    costFormula: line.costFormula,
    internalNote: line.priceItem.internalNote,
    customerVisible: line.priceItem.customerVisible,
    active: line.priceItem.active,
    sortOrder: line.priceItem.sortOrder,
  }));
  const rates: RateInput[] = list.rates.map((rate) => ({
    tradeCode: rate.trade.code as RateInput["tradeCode"],
    hourlyRateSale: Number(rate.hourlyRateSale),
    hourlyRateInternal: Number(rate.hourlyRateInternal),
    calloutPrice: rate.calloutPrice == null ? null : Number(rate.calloutPrice),
    defaultMaterialMarkup: Number(rate.defaultMaterialMarkup),
    subcontractor: rate.trade.subcontractor,
  }));
  const templates = await prisma.textTemplate.findMany({ orderBy: { sortOrder: "asc" } });
  const request = {
    mode: "quote" as const,
    rooms: [{ ...context, name: room?.name ?? "Bad" }],
    answers,
    notes: inspection.notes.map((note) => ({ body: note.body, internal: note.internal })),
    media: inspection.media.map((media) => ({ id: media.id, kind: media.kind, fileName: media.fileName, internal: media.internal })),
    catalog,
    templates: templates.map((row) => ({ key: row.key, name: row.name, kind: row.kind, tradeCode: row.tradeCode, body: row.body, sortOrder: row.sortOrder })),
    rates,
    commercial: {
      vatRate: Number(list.vatRate),
      byggstartPercent: Number(list.byggstartPercent),
      byggstartFactor: Number(list.byggstartFactor),
      mittanbudPercent: Number(list.mittanbudPercent),
      mittanbudFactor: Number(list.mittanbudFactor),
      extraCalloutNok: list.extraCalloutNok == null ? 490 : Number(list.extraCalloutNok),
      tileAllowanceExVat: list.tileAllowanceExVat == null ? 400 : Number(list.tileAllowanceExVat),
      electricianCostFactor: Number(list.electricianCostFactor),
      assemblyHourlyNok: list.assemblyHourlyNok == null ? null : Number(list.assemblyHourlyNok),
    },
    channel: "none" as const,
    validDays: 30,
  };
  const draft = mockDraft(request);
  const applied = applyDraft(request, draft);
  const manual = draft.manualItems ?? [];
  await prisma.quote.create({
    data: {
      id: quoteId,
      dealId: inspection.dealId,
      familyId: id(9, "91000000"),
      revision: "A",
      priceListId: list.id,
      inspectionId,
      status: "draft",
      title: "Tilbud",
      channelCode: applied.totals.channelCode,
      extraProfitNok: applied.totals.extraProfitExVat,
      vatRate: applied.totals.vatRate,
      customerText: applied.customerText,
      reservations: applied.reservations,
      emailSubject: applied.emailSubject,
      emailBody: applied.emailBody,
      sumExVat: applied.totals.subtotalExVat,
      addonsExVat: applied.totals.addonsExVat,
      vatNok: applied.totals.vatNok,
      totalIncVat: applied.totals.totalIncVat,
      costExVat: applied.totals.costExVat,
      contributionExVat: applied.totals.contributionExVat,
      marginExVat: applied.totals.marginExVat,
      hoursTotal: applied.totals.hoursTotal,
      hoursByTrade: Object.fromEntries(applied.totals.trades.filter((trade) => trade.hours).map((trade) => [trade.tradeCode, trade.hours])),
      flags: applied.flags,
      createdById: id(1, "00000000"),
      lines: {
        create: [
          ...applied.totals.lines.map((line, index) => ({
            priceItemId: line.code,
            tradeCode: line.tradeCode,
            code: line.code,
            description: line.name,
            unit: line.unit,
            quantity: line.quantity,
            quantitySource: "checklist",
            unitPriceExVat: line.unitPriceExVat,
            materialCost: line.materialCostPerUnit,
            hours: line.hours,
            lineSumExVat: line.lineSumExVat,
            optional: line.optional,
            included: line.included,
            uncertain: Boolean(draft.lines.find((choice) => choice.code === line.code)?.uncertain),
            uncertaintyNote: draft.lines.find((choice) => choice.code === line.code)?.uncertaintyNote,
            rationale: draft.lines.find((choice) => choice.code === line.code)?.rationale ?? "",
            sortOrder: index + 1,
          })),
          ...manual.map((item, index) => ({
            tradeCode: "annet",
            description: `Må prises manuelt: ${item.prompt}`,
            unit: "stk",
            quantity: 1,
            quantitySource: "checklist",
            unitPriceExVat: 0,
            materialCost: 0,
            hours: 0,
            lineSumExVat: 0,
            included: false,
            uncertain: true,
            uncertaintyNote: "Må prises manuelt",
            rationale: item.detail,
            sortOrder: applied.totals.lines.length + index + 1,
          })),
        ],
      },
    },
  });
}

function writeDemoPhoto(): string {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../..", ".data");
  const key = "inspections/fjellstien-adkomst.jpg";
  const file = join(root, key);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    Buffer.from(
      "ffd8ffe000104a46494600010101004800480000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffc0000b080001000101011100ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad3d4d5d6d7d8d9dae2e3e4e5e6e7e8e9eaf2f3f4f5f6f7f8f9faffda000800010001003f00fbffd9",
      "hex",
    ),
  );
  return key;
}
