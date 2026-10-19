import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";

const here = dirname(fileURLToPath(import.meta.url));
for (const file of [join(here, "../../../.env"), join(here, "../../../.env.local")]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    const key = match[1];
    if (!key || process.env[key]) continue;
    process.env[key] = match[2]?.replace(/^"|"$/g, "") ?? "";
  }
}
import {
  DEFAULT_TRADE_RATES,
  numberedWalls,
  priceListFromCsv,
  TILBUDSBEFARING,
  TRADES,
  type Sketch,
} from "@straume/domain";
import { PrismaClient, type ActivityType, type Prisma, type QuestionType } from "@prisma/client";
import { ensureDemoBefaring } from "./befaring-seed";
import { ensureInsights } from "./insight-seed";
import { ensurePhase2 } from "./phase2-seed";

const prisma = new PrismaClient();

const id = (n: number, group: string) => `${group}-0000-4000-8000-${String(n).padStart(12, "0")}`;

const USERS = {
  ada: id(1, "00000000"),
  noah: id(2, "00000000"),
  mia: id(3, "00000000"),
  eirik: id(4, "00000000"),
};

const PIPE = { salg: id(1, "10000000"), borett: id(2, "10000000") };
const STAGE = {
  inn: id(1, "11000000"),
  befaring: id(2, "11000000"),
  sendt: id(3, "11000000"),
  oss: id(4, "11000000"),
  kunde: id(5, "11000000"),
  mote: id(6, "11000000"),
  slutt: id(7, "11000000"),
  skal: id(1, "12000000"),
  kontakt: id(2, "12000000"),
  avtalt: id(3, "12000000"),
  fremlagt: id(4, "12000000"),
  forhandling: id(5, "12000000"),
};
const BOARD = { rehab: id(1, "20000000"), rekl: id(2, "20000000") };
const PHASE = {
  mottatt: id(1, "21000000"),
  tilvalg: id(2, "21000000"),
  endring: id(3, "21000000"),
  flis: id(4, "21000000"),
  varer: id(5, "21000000"),
  klar: id(6, "21000000"),
  dok: id(7, "21000000"),
  undersokelse: id(8, "21000000"),
};

async function ensureDealProjectSplit() {
  const day = (iso: string) => new Date(`${iso}T12:00:00.000Z`);
  const personId = id(7, "40000000");
  await prisma.person.upsert({
    where: { id: personId },
    update: {},
    create: {
      id: personId,
      firstName: "Sigrid",
      lastName: "Solsiden",
      email: "sigrid.solsiden@example.com",
      phone: "40000007",
      street: "Solsiden",
      houseNumber: "5",
      postalCode: "5353",
      city: "Straume",
      country: "Norge",
      label: "Kunde",
      ownerId: USERS.noah,
    },
  });
  const dealId = id(10, "50000000");
  await prisma.deal.upsert({
    where: { id: dealId },
    update: {},
    create: {
      id: dealId,
      title: "Solsiden 5",
      valueNok: 398000,
      ownerId: USERS.noah,
      personId,
      pipelineId: PIPE.salg,
      stageId: STAGE.slutt,
      sourceChannel: "Har brukt oss før",
      plannedStartDate: day("2025-03-04"),
      stageEnteredAt: day("2025-01-15"),
      status: "won",
      wonAt: day("2025-02-20"),
    },
  });
  await prisma.project.upsert({
    where: { id: id(3, "60000000") },
    update: {},
    create: {
      id: id(3, "60000000"),
      title: "Solsiden 5",
      dealId,
      personId,
      sellerId: USERS.noah,
      projectManagerId: USERS.mia,
      boardId: BOARD.rehab,
      phaseId: PHASE.undersokelse,
      status: "completed",
      contractSumNok: 398000,
      street: "Solsiden",
      houseNumber: "5",
      postalCode: "5353",
      city: "Straume",
      municipality: "Øygarden",
      plannedStartDate: day("2025-03-04"),
      plannedEndDate: day("2025-06-12"),
      startDate: day("2025-03-10"),
      endDate: day("2025-06-18"),
      phaseEnteredAt: day("2025-06-18"),
    },
  });

  const utsiktPerson = id(8, "40000000");
  await prisma.person.upsert({
    where: { id: utsiktPerson },
    update: {},
    create: {
      id: utsiktPerson,
      firstName: "Tone",
      lastName: "Utsikt",
      email: "tone.utsikt@example.com",
      phone: "40000008",
      street: "Utsikten",
      houseNumber: "6",
      postalCode: "5353",
      city: "Straume",
      country: "Norge",
      label: "Kunde",
      ownerId: USERS.mia,
    },
  });
  const utsiktDeal = id(11, "50000000");
  await prisma.deal.upsert({
    where: { id: utsiktDeal },
    update: {},
    create: {
      id: utsiktDeal,
      title: "Utsikten 6",
      valueNok: 364000,
      ownerId: USERS.mia,
      personId: utsiktPerson,
      pipelineId: PIPE.salg,
      stageId: STAGE.slutt,
      sourceChannel: "Tok direkte kontakt på tlf/mail",
      plannedStartDate: null,
      stageEnteredAt: day("2026-10-14"),
      status: "won",
      wonAt: day("2026-10-16"),
    },
  });
  await prisma.project.upsert({
    where: { id: id(4, "60000000") },
    update: {},
    create: {
      id: id(4, "60000000"),
      title: "Utsikten 6",
      dealId: utsiktDeal,
      personId: utsiktPerson,
      sellerId: USERS.mia,
      projectManagerId: USERS.mia,
      boardId: BOARD.rehab,
      phaseId: PHASE.mottatt,
      status: "open",
      contractSumNok: 364000,
      street: "Utsikten",
      houseNumber: "6",
      postalCode: "5353",
      city: "Straume",
      municipality: "Øygarden",
      plannedStartDate: null,
      phaseEnteredAt: new Date(),
    },
  });
}

async function main() {
  const done = await prisma.appSetting.findUnique({ where: { key: "seed_complete" } });
  if (done && process.env.SEED_FORCE !== "1") {
    await repeatSeed();
    console.log("Seed finnes allerede. Manglende rader er sikret, uten å overskrive endringer. Sett SEED_FORCE=1 for full upsert.");
    return;
  }
  const password = process.env.SEED_PASSWORD ?? (process.env.NODE_ENV === "production" ? "" : "bytt-meg-lokalt");
  if (!password) throw new Error("SEED_PASSWORD må settes når NODE_ENV=production");
  const passwordHash = await bcrypt.hash(password, 10);

  const users = [
    { id: USERS.ada, email: "ada.berg@straume.test", name: "Ada Berg", role: "admin" as const },
    { id: USERS.noah, email: "noah.lien@straume.test", name: "Noah Lien", role: "selger" as const },
    { id: USERS.mia, email: "mia.solberg@straume.test", name: "Mia Solberg", role: "prosjektleder" as const },
    { id: USERS.eirik, email: "eirik.dahl@straume.test", name: "Eirik Dahl", role: "kontor" as const },
  ];
  for (const user of users) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: { name: user.name, role: user.role, active: true },
      create: { ...user, passwordHash },
    });
  }

  const lists = [
    { id: "kildekanal", key: "kildekanal", name: "Kildekanal" },
    { id: "tapsarsak", key: "tapsarsak", name: "Tapsårsak" },
    { id: "person_etikett", key: "person_etikett", name: "Etikett person" },
    { id: "avtale_etikett", key: "avtale_etikett", name: "Etikett avtale" },
    { id: "aktivitetstype", key: "aktivitetstype", name: "Aktivitetstype" },
  ];
  for (const list of lists) {
    await prisma.optionList.upsert({ where: { id: list.id }, update: { name: list.name }, create: list });
  }
  const options: Record<string, string[]> = {
    kildekanal: [
      "Anbefalt via venner/bekjente",
      "Byggstart",
      "Google",
      "Har brukt oss før",
      "Instagram/Facebook",
      "MittAnbud",
      "MittAnbud XL",
      "Tok direkte kontakt på tlf/mail",
      "Anbefalt via Flisbutikk/Leverandør",
      "Rørkjøp Arbeidsformidling",
      "Anbudstorget",
      "Business Booster",
    ],
    tapsarsak: ["Oppstartstidspunkt", "Pris (konkurrent)", "Pris (for dyrt å gjennomføre)", "Konkurrent", "Ukjent årsak"],
    person_etikett: ["Kunde", "Glovarm potensiell kunde", "Varm potensiell kunde", "Kald potensiell kunde"],
    avtale_etikett: ["03.01.22", "Byggstart"],
    aktivitetstype: ["Telefonsamtale", "Møte", "Oppgave", "Tidsfrist", "E-post", "Lunsj"],
  };
  for (const [listId, labels] of Object.entries(options)) {
    for (let index = 0; index < labels.length; index += 1) {
      const label = labels[index]!;
      await prisma.optionItem.upsert({
        where: { listId_label: { listId, label } },
        update: { sortOrder: index, active: true },
        create: { listId, label, sortOrder: index },
      });
    }
  }

  await prisma.pipeline.upsert({
    where: { id: PIPE.salg },
    update: { name: "Salgspipe", sortOrder: 0, dealProbabilityEnabled: false },
    create: { id: PIPE.salg, name: "Salgspipe", sortOrder: 0, dealProbabilityEnabled: false },
  });
  await prisma.pipeline.upsert({
    where: { id: PIPE.borett },
    update: { name: "Borettslag og sameier", sortOrder: 1, dealProbabilityEnabled: true },
    create: { id: PIPE.borett, name: "Borettslag og sameier", sortOrder: 1, dealProbabilityEnabled: true },
  });
  const stages = [
    { id: STAGE.inn, pipelineId: PIPE.salg, name: "Innkommende henvendelse", sortOrder: 0, probability: 30, rottenDays: 2 },
    { id: STAGE.befaring, pipelineId: PIPE.salg, name: "Befaring avtalt", sortOrder: 1, probability: 40, rottenDays: 14 },
    { id: STAGE.sendt, pipelineId: PIPE.salg, name: "Tilbud sendt", sortOrder: 2, probability: 35, rottenDays: 9 },
    { id: STAGE.oss, pipelineId: PIPE.salg, name: "Tilbud fulgt opp av oss", sortOrder: 3, probability: 35, rottenDays: 7 },
    { id: STAGE.kunde, pipelineId: PIPE.salg, name: "Tilbud fulgt opp av kunde", sortOrder: 4, probability: 50, rottenDays: 7 },
    { id: STAGE.mote, pipelineId: PIPE.salg, name: "Har hatt kundemøte hos oss", sortOrder: 5, probability: 90, rottenDays: 7 },
    { id: STAGE.slutt, pipelineId: PIPE.salg, name: "Sluttforhandlinger", sortOrder: 6, probability: 90, rottenDays: 10 },
    { id: STAGE.skal, pipelineId: PIPE.borett, name: "Skal kontaktes", sortOrder: 0, probability: 2, rottenDays: null },
    { id: STAGE.kontakt, pipelineId: PIPE.borett, name: "Kontakt opprettet", sortOrder: 1, probability: 4, rottenDays: null },
    { id: STAGE.avtalt, pipelineId: PIPE.borett, name: "Avtalt møte", sortOrder: 2, probability: 8, rottenDays: null },
    { id: STAGE.fremlagt, pipelineId: PIPE.borett, name: "Tilbud fremlagt", sortOrder: 3, probability: 20, rottenDays: null },
    { id: STAGE.forhandling, pipelineId: PIPE.borett, name: "Forhandling startet", sortOrder: 4, probability: 40, rottenDays: null },
  ];
  for (const stage of stages) {
    await prisma.stage.upsert({
      where: { id: stage.id },
      update: { name: stage.name, sortOrder: stage.sortOrder, pipelineId: stage.pipelineId },
      create: stage,
    });
  }

  await prisma.projectBoard.upsert({
    where: { id: BOARD.rehab },
    update: { name: "Rehabiliteringsprosjekter", sortOrder: 0 },
    create: { id: BOARD.rehab, name: "Rehabiliteringsprosjekter", sortOrder: 0 },
  });
  await prisma.projectBoard.upsert({
    where: { id: BOARD.rekl },
    update: { name: "Reklamasjon/Service", sortOrder: 1 },
    create: { id: BOARD.rekl, name: "Reklamasjon/Service", sortOrder: 1 },
  });
  const phases = [
    [PHASE.mottatt, BOARD.rehab, "Oppdrag mottatt", 0, 21],
    [id(2, "21000000"), BOARD.rehab, "Gjennomført tilvalgsmøte", 1, null],
    [id(3, "21000000"), BOARD.rehab, "Endringsskjema sendt", 2, null],
    [id(4, "21000000"), BOARD.rehab, "Fliser og vindu bestilt", 3, null],
    [id(5, "21000000"), BOARD.rehab, "Alle varer bestilt", 4, null],
    [PHASE.klar, BOARD.rehab, "Klar for gjennomføring", 5, null],
    [id(7, "21000000"), BOARD.rehab, "Klart for dokumentasjon", 6, null],
    [id(8, "21000000"), BOARD.rehab, "Send Kundeundersøkelse", 7, null],
    [id(1, "22000000"), BOARD.rekl, "Innkommende henvendelse", 0, null],
    [id(2, "22000000"), BOARD.rekl, "Venter tilbakemelding fra kunde", 1, null],
    [id(3, "22000000"), BOARD.rekl, "Kunde venter på tilbakemelding", 2, null],
    [id(4, "22000000"), BOARD.rekl, "Venter på leverandør", 3, null],
    [id(5, "22000000"), BOARD.rekl, "Avtalt utbedringsdato", 4, null],
    [id(6, "22000000"), BOARD.rekl, "Sak lukket", 5, null],
  ] as const;
  for (const [phaseId, boardId, name, sortOrder, rottenDays] of phases) {
    await prisma.projectPhase.upsert({
      where: { id: phaseId },
      update: { name, sortOrder, boardId },
      create: { id: phaseId, boardId, name, sortOrder, rottenDays },
    });
  }

  for (const trade of TRADES) {
    await prisma.trade.upsert({
      where: { id: trade.code },
      update: { name: trade.name, code: trade.code },
      create: { id: trade.code, code: trade.code, name: trade.name, sortOrder: trade.sort, subcontractor: trade.code === "elektriker" },
    });
  }
  const csv = readFileSync(join(here, "data/prisposter.csv"), "utf8");
  const priceList = priceListFromCsv(csv, {
    id: id(1, "30000000"),
    name: "Prisliste 2026",
    validFrom: "2026-08-11",
  });
  const commercial = priceList.commercial;
  await prisma.priceList.upsert({
    where: { id: priceList.id },
    update: {
      name: priceList.name,
      status: "active",
      comment: "Importert fra prisposter.csv. Salgspris følger regnearket.",
      vatRate: commercial?.vatRate,
      byggstartPercent: commercial?.byggstartPercent,
      byggstartFactor: commercial?.byggstartFactor,
      mittanbudPercent: commercial?.mittanbudPercent,
      mittanbudFactor: commercial?.mittanbudFactor,
      extraCalloutNok: commercial?.extraCalloutNok,
      tileAllowanceExVat: commercial?.tileAllowanceExVat,
      electricianCostFactor: commercial?.electricianCostFactor,
      assemblyHourlyNok: commercial?.assemblyHourlyNok,
    },
    create: {
      id: priceList.id,
      name: priceList.name,
      validFrom: new Date("2026-08-11"),
      status: "active",
      comment: "Importert fra prisposter.csv. Gyldig fra revisjonen 11.08.2026. Salgspris følger regnearket der underarket avviker.",
      vatRate: commercial?.vatRate,
      byggstartPercent: commercial?.byggstartPercent,
      byggstartFactor: commercial?.byggstartFactor,
      mittanbudPercent: commercial?.mittanbudPercent,
      mittanbudFactor: commercial?.mittanbudFactor,
      extraCalloutNok: commercial?.extraCalloutNok,
      tileAllowanceExVat: commercial?.tileAllowanceExVat,
      electricianCostFactor: commercial?.electricianCostFactor,
      assemblyHourlyNok: commercial?.assemblyHourlyNok,
    },
  });
  for (const rate of DEFAULT_TRADE_RATES) {
    await prisma.tradeRate.upsert({
      where: { priceListId_tradeId: { priceListId: priceList.id, tradeId: rate.tradeCode } },
      update: {
        hourlyRateSale: rate.hourlyRateSale,
        hourlyRateInternal: rate.hourlyRateInternal,
        calloutPrice: rate.calloutPrice,
        defaultMaterialMarkup: rate.defaultMaterialMarkup,
      },
      create: {
        priceListId: priceList.id,
        tradeId: rate.tradeCode,
        hourlyRateSale: rate.hourlyRateSale,
        hourlyRateInternal: rate.hourlyRateInternal,
        calloutPrice: rate.calloutPrice,
        defaultMaterialMarkup: rate.defaultMaterialMarkup,
      },
    });
  }
  for (const line of priceList.lines) {
    await prisma.priceItem.upsert({
      where: { id: line.code },
      update: {
        name: line.name,
        unit: line.unit,
        type: line.type,
        sortOrder: line.sortOrder,
        active: line.active,
        customerVisible: line.customerVisible,
        internalNote: line.internalNote,
        quantityFormula: line.quantityFormula,
        tradeId: line.tradeCode,
        splitConfidence: line.splitConfidence ?? "known",
        splitNote: line.splitNote ?? null,
      },
      create: {
        id: line.code,
        code: line.code,
        tradeId: line.tradeCode,
        name: line.name,
        unit: line.unit,
        type: line.type,
        sortOrder: line.sortOrder,
        active: line.active,
        customerVisible: line.customerVisible,
        internalNote: line.internalNote,
        quantityFormula: line.quantityFormula,
        splitConfidence: line.splitConfidence ?? "known",
        splitNote: line.splitNote ?? null,
      },
    });
    const existingLine = await prisma.priceLine.findUnique({
      where: { priceListId_priceItemId: { priceListId: priceList.id, priceItemId: line.code } },
    });
    const data = {
      materialCost: line.materialCost,
      materialMarkup: line.materialMarkup,
      hoursPerUnit: line.hoursPerUnit,
      hourlyRateOverride: line.hourlyRateOverride,
      salePriceOverride: line.salePriceOverride,
      costFormula: line.costFormula,
    };
    if (existingLine) await prisma.priceLine.update({ where: { id: existingLine.id }, data });
    else await prisma.priceLine.create({ data: { priceListId: priceList.id, priceItemId: line.code, ...data } });
  }

  const templateId = id(1, "80000000");
  await prisma.checklistTemplate.upsert({
    where: { id: templateId },
    update: {},
    create: { id: templateId, name: "Tilbudsbefaring" },
  });
  for (const version of [1, 2]) {
    const versionId = id(version, "81000000");
    await prisma.checklistTemplateVersion.upsert({
      where: { templateId_version: { templateId, version } },
      update: { publishedAt: version === 1 ? new Date("2026-10-01T00:00:00.000Z") : null },
      create: {
        id: versionId,
        templateId,
        version,
        publishedAt: version === 1 ? new Date("2026-10-01T00:00:00.000Z") : null,
      },
    });
    const existingSections = await prisma.checklistSection.count({ where: { versionId } });
    if (existingSections > 0) continue;
    await writeChecklistVersion(versionId);
  }
  const installed = await prisma.checklistItem.findFirst({ where: { itemKey: "kunde.beskrivelse" } });
  if (installed) {
    await prisma.appSetting.upsert({
      where: { key: "checklist_tilbudsbefaring" },
      update: {},
      create: { key: "checklist_tilbudsbefaring", value: "1" },
    });
  }

  await prisma.appSetting.upsert({
    where: { key: "winner_email" },
    update: {},
    create: { key: "winner_email", value: process.env.WINNER_EMAIL ?? "tegner@example.com" },
  });

  const people = [
    { id: id(1, "40000000"), firstName: "Kari", lastName: "Eksempel", email: "kari.eksempel@example.com", phone: "40000001", street: "Eksempelveien", houseNumber: "12", postalCode: "5353", city: "Straume", label: "Varm potensiell kunde", ownerId: USERS.noah },
    { id: id(2, "40000000"), firstName: "Ola", lastName: "Prøve", email: "ola.prove@example.com", phone: "40000002", street: "Fjellstien", houseNumber: "4", postalCode: "5353", city: "Straume", label: "Kunde", ownerId: USERS.noah },
    { id: id(3, "40000000"), firstName: "Nora", lastName: "Fiktiv", email: "nora.fiktiv@example.com", phone: "40000003", street: "Lyngveien", houseNumber: "3", postalCode: "5353", city: "Straume", label: "Kunde", ownerId: USERS.noah },
    { id: id(4, "40000000"), firstName: "Even", lastName: "Demo", email: "even.demo@example.com", phone: "40000004", street: "Havneveien", houseNumber: "15", postalCode: "5353", city: "Straume", label: "Kunde", ownerId: USERS.ada },
    { id: id(5, "40000000"), firstName: "Liv", lastName: "Eksempel", email: "liv.eksempel@example.com", phone: "40000005", street: "Sjøutsikten", houseNumber: "1", postalCode: "5353", city: "Straume", label: "Glovarm potensiell kunde", ownerId: USERS.ada, organizationId: id(1, "41000000") },
    { id: id(6, "40000000"), firstName: "Per", lastName: "Eksempel", email: "per.eksempel@example.com", phone: "40000006", street: "Fjelltoppen", houseNumber: "8", postalCode: "5353", city: "Straume", label: "Kald potensiell kunde", ownerId: USERS.eirik, organizationId: id(2, "41000000") },
  ];
  await prisma.organization.upsert({
    where: { id: id(1, "41000000") },
    update: {},
    create: { id: id(1, "41000000"), name: "Sameiet Sjøutsikten", orgNumber: "999000111", address: "Sjøutsikten 1, 5353 Straume", ownerId: USERS.ada, label: "Glovarm potensiell kunde" },
  });
  await prisma.organization.upsert({
    where: { id: id(2, "41000000") },
    update: {},
    create: { id: id(2, "41000000"), name: "Borettslaget Fjelltoppen", orgNumber: "999000222", address: "Fjelltoppen 8, 5353 Straume", ownerId: USERS.eirik, label: "Kald potensiell kunde" },
  });
  for (const person of people) {
    await prisma.person.upsert({ where: { id: person.id }, update: {}, create: { ...person, country: "Norge" } });
  }

  const day = (iso: string) => new Date(`${iso}T12:00:00.000Z`);
  const deals = [
    { id: id(1, "50000000"), title: "Eksempelveien 12", valueNok: 420000, ownerId: USERS.noah, personId: id(1, "40000000"), pipelineId: PIPE.salg, stageId: STAGE.sendt, sourceChannel: "Google", plannedStartDate: day("2026-11-16"), stageEnteredAt: day("2026-09-20"), label: null },
    { id: id(2, "50000000"), title: "Fjellstien 4", valueNok: 385000, ownerId: USERS.noah, personId: id(2, "40000000"), pipelineId: PIPE.salg, stageId: STAGE.befaring, sourceChannel: "Anbefalt via venner/bekjente", plannedStartDate: day("2026-12-01"), stageEnteredAt: day("2026-10-16"), label: null },
    { id: id(3, "50000000"), title: "Lyngveien 3", valueNok: 486000, ownerId: USERS.noah, personId: id(3, "40000000"), pipelineId: PIPE.salg, stageId: STAGE.slutt, sourceChannel: "Har brukt oss før", plannedStartDate: day("2026-11-02"), stageEnteredAt: day("2026-09-01"), status: "won" as const, wonAt: day("2026-09-28") },
    { id: id(4, "50000000"), title: "Havneveien 15", valueNok: 512000, ownerId: USERS.ada, personId: id(4, "40000000"), pipelineId: PIPE.salg, stageId: STAGE.slutt, sourceChannel: "MittAnbud XL", plannedStartDate: day("2026-11-23"), stageEnteredAt: day("2026-10-02"), status: "won" as const, wonAt: day("2026-10-10"), label: "Byggstart" },
    { id: id(5, "50000000"), title: "Demoalleen 7", valueNok: 350000, ownerId: USERS.ada, personId: id(1, "40000000"), pipelineId: PIPE.salg, stageId: STAGE.inn, sourceChannel: "Tok direkte kontakt på tlf/mail", plannedStartDate: day("2027-01-12"), stageEnteredAt: day("2026-10-17") },
    { id: id(6, "50000000"), title: "Prøvebakken 2", valueNok: 455000, ownerId: USERS.noah, personId: id(2, "40000000"), pipelineId: PIPE.salg, stageId: STAGE.kunde, sourceChannel: "Instagram/Facebook", plannedStartDate: day("2026-12-07"), stageEnteredAt: day("2026-10-05") },
    { id: id(7, "50000000"), title: "Fiktivveien 9", valueNok: 275000, ownerId: USERS.eirik, personId: id(4, "40000000"), pipelineId: PIPE.salg, stageId: STAGE.oss, sourceChannel: "Byggstart", plannedStartDate: null, stageEnteredAt: day("2026-10-01"), status: "lost" as const, lostAt: day("2026-10-12"), lostReason: "Pris (konkurrent)" },
    { id: id(8, "50000000"), title: "Sameiet Sjøutsikten", valueNok: 2400000, ownerId: USERS.ada, personId: id(5, "40000000"), organizationId: id(1, "41000000"), pipelineId: PIPE.borett, stageId: STAGE.kontakt, sourceChannel: "Anbudstorget", probabilityOverride: 10, stageEnteredAt: day("2026-10-08") },
    { id: id(9, "50000000"), title: "Borettslaget Fjelltoppen", valueNok: 1800000, ownerId: USERS.eirik, personId: id(6, "40000000"), organizationId: id(2, "41000000"), pipelineId: PIPE.borett, stageId: STAGE.skal, sourceChannel: "Business Booster", probabilityOverride: 2, stageEnteredAt: day("2026-09-15") },
  ];
  for (const deal of deals) {
    await prisma.deal.upsert({
      where: { id: deal.id },
      update: {},
      create: {
        status: "open",
        ...deal,
        valueNok: deal.valueNok,
      },
    });
  }

  const projects = [
    {
      id: id(1, "60000000"),
      title: "Lyngveien 3",
      dealId: id(3, "50000000"),
      personId: id(3, "40000000"),
      sellerId: USERS.noah,
      projectManagerId: USERS.mia,
      phaseId: PHASE.klar,
      contractSumNok: 486000,
      street: "Lyngveien",
      houseNumber: "3",
      plannedStartDate: day("2026-11-02"),
    },
    {
      id: id(2, "60000000"),
      title: "Havneveien 15",
      dealId: id(4, "50000000"),
      personId: id(4, "40000000"),
      sellerId: USERS.ada,
      projectManagerId: USERS.ada,
      phaseId: PHASE.mottatt,
      contractSumNok: 512000,
      street: "Havneveien",
      houseNumber: "15",
      plannedStartDate: day("2026-11-23"),
      plannedEndDate: day("2026-10-01"),
      phaseEnteredAt: day("2026-09-01"),
    },
  ];
  for (const project of projects) {
    await prisma.project.upsert({
      where: { id: project.id },
      update: {},
      create: {
        ...project,
        boardId: BOARD.rehab,
        postalCode: "5353",
        city: "Straume",
        municipality: "Øygarden",
        status: "open",
      },
    });
  }
  const changeId = id(1, "61000000");
  await prisma.changeOrder.upsert({
    where: { id: changeId },
    update: {},
    create: {
      id: changeId,
      projectId: id(1, "60000000"),
      title: "To ekstra downlights",
      description: "Kunden ba om to downlights over servant, etter befaring.",
      amountNok: 12500,
      status: "approved",
      internalNote: "Intern: pris tatt fra EL-002 uten å vise enhetspris til kunden.",
    },
  });

  const when = new Date("2026-10-12T09:30:00.000Z");
  const sketch: Sketch = {
    points: [
      { x: 0, y: 0 },
      { x: 3.5, y: 0 },
      { x: 3.5, y: 2.35 },
      { x: 0, y: 2.35 },
    ],
    doorEdge: 0,
    ceilingHeightM: 2.4,
    slope: { kneeHeightM: 1.4, ridgeHeightM: 2.4 },
    openings: [{ id: "apning-vindu", type: "window", wallNumber: 3, offsetM: 0.8, widthM: 0.7 }],
  };
  const walls = numberedWalls(sketch);
  const inspectionId = id(1, "70000000");
  const floorId = id(1, "71000000");
  const roomId = id(1, "72000000");
  await prisma.inspection.upsert({
    where: { id: inspectionId },
    update: {},
    create: {
      id: inspectionId,
      projectId: id(1, "60000000"),
      inspectorId: USERS.noah,
      templateVersionId: id(1, "81000000"),
      status: "draft",
      visitedAt: when,
      updatedAt: when,
      fieldUpdatedAt: { status: when.toISOString(), templateVersionId: when.toISOString() },
    },
  });
  await prisma.floor.upsert({
    where: { id: floorId },
    update: {},
    create: {
      id: floorId,
      projectId: id(1, "60000000"),
      inspectionId,
      name: "1. etasje",
      sortOrder: 0,
      updatedAt: when,
      fieldUpdatedAt: { name: when.toISOString() },
    },
  });
  await prisma.room.upsert({
    where: { id: roomId },
    update: {},
    create: {
      id: roomId,
      floorId,
      name: "Bad",
      sortOrder: 0,
      perimeterM: 11.7,
      ceilingHeightM: 2.4,
      floorAreaM: 8.225,
      measurementSource: "sketch",
      sketch,
      updatedAt: when,
      fieldUpdatedAt: { sketch: when.toISOString(), perimeterM: when.toISOString() },
    },
  });
  for (const wall of walls) {
    const wallId = id(wall.number, "73000000");
    await prisma.wall.upsert({
      where: { id: wallId },
      update: {},
      create: {
        id: wallId,
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
    where: { id: id(1, "74000000") },
    update: {},
    create: {
      id: id(1, "74000000"),
      projectId: id(1, "60000000"),
      inspectionId,
      roomId,
      body: "Intern: kunden er usikker på flisformat. Ikke ta med i noe som går ut av huset.",
      internal: true,
      updatedAt: when,
      fieldUpdatedAt: { body: when.toISOString(), internal: when.toISOString() },
    },
  });
  await prisma.note.upsert({
    where: { id: id(2, "74000000") },
    update: {},
    create: {
      id: id(2, "74000000"),
      projectId: id(1, "60000000"),
      inspectionId,
      roomId,
      sectionKey: "rorlegger",
      body: "Sluk ønskes mot yttervegg.",
      internal: false,
      updatedAt: when,
      fieldUpdatedAt: { body: when.toISOString(), internal: when.toISOString() },
    },
  });
  const activities: { id: string; dealId: string; type: ActivityType; subject: string; dueAt: Date; done: boolean }[] = [
    { id: id(1, "51000000"), dealId: id(1, "50000000"), type: "call", subject: "Følg opp tilbud Eksempelveien", dueAt: day("2026-10-20"), done: false },
    { id: id(2, "51000000"), dealId: id(2, "50000000"), type: "meeting", subject: "Befaring Fjellstien 4", dueAt: day("2026-10-21"), done: false },
  ];
  for (const activity of activities) {
    await prisma.activity.upsert({
      where: { id: activity.id },
      update: {},
      create: { ...activity, ownerId: USERS.noah, internal: true },
    });
  }

  await repeatSeed();

  await prisma.appSetting.upsert({
    where: { key: "seed_complete" },
    update: { value: new Date().toISOString() },
    create: { key: "seed_complete", value: new Date().toISOString() },
  });
  console.log("Seed fullført. Demo-brukere bruker passordet fra SEED_PASSWORD.");
}

/** Kjøres ved hver oppstart når seed allerede er lagt inn. Oppretter bare det som mangler. */
export async function repeatSeed() {
  await ensureDealProjectSplit();
  await ensureInsights(prisma);
  await ensurePhase2(prisma);
  await ensureTilbudsbefaring();
  await ensureDemoBefaring(prisma);
}

async function writeChecklistVersion(versionId: string) {
  let sortOrder = 0;
  for (const section of TILBUDSBEFARING) {
    sortOrder += 1;
    await prisma.checklistSection.create({
      data: {
        versionId,
        tradeCode: section.tradeCode,
        name: section.name,
        sortOrder,
        items: {
          create: section.items.map((item, index) => ({
            prompt: item.prompt,
            helpText: item.helpText ?? null,
            questionType: item.questionType as QuestionType,
            required: Boolean(item.required),
            choices: item.choices ?? undefined,
            unit: item.unit ?? null,
            itemKey: item.key,
            config: (item.config ?? undefined) as Prisma.InputJsonValue | undefined,
            sortOrder: index + 1,
          })),
        },
      },
    });
  }
}

/** Engangsoppgradering. Når flagget er satt, rører ikke seed sjekklisten igjen. */
async function ensureTilbudsbefaring() {
  const flag = await prisma.appSetting.findUnique({ where: { key: "checklist_tilbudsbefaring" } });
  if (flag) return;
  const template = await prisma.checklistTemplate.findFirst({ orderBy: { name: "asc" } });
  if (!template) return;
  if (template.name === "Standardbefaring") {
    await prisma.checklistTemplate.update({ where: { id: template.id }, data: { name: "Tilbudsbefaring" } });
  }
  const published = await prisma.checklistTemplateVersion.findFirst({
    where: { templateId: template.id, publishedAt: { not: null } },
    orderBy: { version: "desc" },
    include: { sections: { include: { items: true } } },
  });
  const installed = published?.sections.some((section) => section.items.some((item) => item.itemKey === "kunde.beskrivelse"));
  if (!installed) {
    const latest = await prisma.checklistTemplateVersion.findFirst({ where: { templateId: template.id }, orderBy: { version: "desc" } });
    const version = (latest?.version ?? 0) + 1;
    const created = await prisma.checklistTemplateVersion.create({
      data: { templateId: template.id, version, publishedAt: new Date() },
    });
    await writeChecklistVersion(created.id);
    const draft = await prisma.checklistTemplateVersion.create({
      data: { templateId: template.id, version: version + 1 },
    });
    await writeChecklistVersion(draft.id);
  }
  await prisma.appSetting.upsert({
    where: { key: "checklist_tilbudsbefaring" },
    update: {},
    create: { key: "checklist_tilbudsbefaring", value: new Date().toISOString() },
  });
}

const invokedDirectly = process.argv[1]?.endsWith("seed.ts") || process.argv[1]?.endsWith("seed.js");
if (invokedDirectly) {
  main()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
