import { prisma } from "@straume/db";
import { afterAll, describe, expect, it } from "vitest";
import { isoDate } from "./dates";
import { addStage, createDeal, createPipeline, createProjectFromDeal, dealsForBoard, editStage, orderStages, removePipeline, removeStage, winDeal } from "./crm";
import { adjustPriceList, priceListView } from "./price-admin";
import { queryInsights } from "./insights";
import { customerView, dashboard, moveProject, updateProject } from "./projects";
import { pushMutations } from "./sync-service";

const admin = { id: "00000000-0000-4000-8000-000000000001", role: "admin" };
const projectId = "60000000-0000-4000-8000-000000000001";

describe("fase 1 mot databasen", () => {
  const created: string[] = [];
  const extraProjects: string[] = [];
  const extraDeals: string[] = [];

  afterAll(async () => {
    if (created.length) {
      await prisma.priceList.deleteMany({ where: { id: { in: created } } });
      await prisma.note.deleteMany({ where: { id: { in: created } } });
    }
    if (extraProjects.length) await prisma.project.deleteMany({ where: { id: { in: extraProjects } } });
    if (extraDeals.length) await prisma.deal.deleteMany({ where: { id: { in: extraDeals } } });
    await prisma.$disconnect();
  });

  it("lar administrator opprette, endre, sortere og slette salgsfaser", async () => {
    const pipeline = await createPipeline(admin, { name: `Testpipe ${Date.now()}`, dealProbabilityEnabled: true });
    const extra = await addStage(admin, pipeline.id, { name: "Oppfølging", probability: 40, rottenDays: 5 });
    const renamed = await editStage(admin, extra.id, { name: "Oppfølging oss", probability: 45, rottenDays: 6 });
    expect(renamed.name).toBe("Oppfølging oss");
    expect(renamed.probability).toBe(45);
    const third = await addStage(admin, pipeline.id, { name: "Avslutning", probability: 80, rottenDays: null });
    const ordered = await orderStages(admin, pipeline.id, [third.id, extra.id, pipeline.stages[0]!.id]);
    expect(ordered[0]?.id).toBe(third.id);
    await removeStage(admin, third.id);
    const left = await prisma.stage.count({ where: { pipelineId: pipeline.id } });
    expect(left).toBe(2);
    await removePipeline(admin, pipeline.id);
    expect(await prisma.pipeline.findUnique({ where: { id: pipeline.id } })).toBeNull();
  });

  it("lager en ny prisversjon med prosent og lar prosenttillegg stå", async () => {
    const active = await prisma.priceList.findFirst({ where: { status: "active" } });
    if (!active) throw new Error("Mangler aktiv prisliste");
    const before = await priceListView(active.id);
    const sample = before.lines.find((line) => line.tradeCode === "riving" && line.type === "unit_price");
    const addon = before.lines.find((line) => line.type === "percent_addon");
    if (!sample || !addon) throw new Error("Mangler testposter");
    const createdList = await adjustPriceList(admin, active.id, {
      name: `Testjustering ${Date.now()}`,
      validFrom: "2027-01-01",
      percent: 10,
      tradeCodes: ["riving"],
    });
    created.push(createdList.id);
    const next = await priceListView(createdList.id);
    const sampleNext = next.lines.find((line) => line.code === sample.code);
    const addonNext = next.lines.find((line) => line.code === addon.code);
    expect(sampleNext?.materialCost).toBeCloseTo(sample.materialCost * 1.1, 2);
    expect(addonNext?.materialCost).toBeCloseTo(addon.materialCost, 4);
    expect(next.status).toBe("draft");
    await prisma.priceList.update({ where: { id: active.id }, data: { validTo: active.validTo } });
  });

  it("fjerner interne notater fra kundeutsikten", async () => {
    const view = await customerView(projectId);
    const text = JSON.stringify(view);
    expect(text).toContain("Sluk ønskes mot yttervegg.");
    expect(text).not.toContain("kunden er usikker på flisformat");
    expect(text).not.toContain("karm er skjev");
    expect(text).not.toContain("enhetspris til kunden");
  });

  it("avviser sletting av media i synk og beholder siste feltverdi", async () => {
    const noteId = `note-sync-${Date.now().toString(36)}`;
    created.push(noteId);
    const now = new Date().toISOString();
    const createdNote = await pushMutations(admin.id, [
      {
        entity: "note",
        op: "upsert",
        id: noteId,
        updatedAt: now,
        payload: { projectId, body: "Synktest", internal: true },
      },
    ]);
    expect(createdNote.results[0]?.ok).toBe(true);
    const removed = await pushMutations(admin.id, [{ entity: "media", op: "delete", id: noteId, updatedAt: new Date().toISOString() }]);
    expect(removed.results[0]?.conflicts[0]?.reason).toBe("append_only");
    const older = new Date(Date.parse(now) - 60_000).toISOString();
    const stale = await pushMutations(admin.id, [
      {
        entity: "note",
        op: "upsert",
        id: noteId,
        updatedAt: older,
        baseUpdatedAt: now,
        payload: { body: "Gammel tekst" },
      },
    ]);
    expect(stale.results[0]?.ok).toBe(true);
    const stored = await prisma.note.findUnique({ where: { id: noteId } });
    expect(stored?.body).toBe("Synktest");
  });

  it("holder vunne og tapte avtaler ute av salgspipen", async () => {
    const board = await dealsForBoard("10000000-0000-4000-8000-000000000001");
    const titles = board.deals.map((deal) => deal.title);
    expect(titles).toContain("Eksempelveien 12");
    expect(titles).not.toContain("Lyngveien 3");
    expect(titles).not.toContain("Fiktivveien 9");
    expect(titles).not.toContain("Solsiden 5");
    expect(titles).not.toContain("Utsikten 6");
    expect(board.deals.every((deal) => deal.status === "open")).toBe(true);
  });

  it("oppretter prosjekt bare etter bekreftelse, og bare ett per avtale", async () => {
    const deal = await createDeal(admin, {
      title: `Testavtale ${Date.now()}`,
      valueNok: 120000,
      pipelineId: "10000000-0000-4000-8000-000000000001",
      stageId: "11000000-0000-4000-8000-000000000001",
      personId: "40000000-0000-4000-8000-000000000001",
      plannedStartDate: "2026-12-01",
    });
    extraDeals.push(deal.id);
    const won = await winDeal(admin, deal.id);
    expect(won.project).toBeNull();
    expect(won.deal.status).toBe("won");
    const project = await createProjectFromDeal(admin, deal.id);
    extraProjects.push(project.id);
    expect(project.title).toBe(deal.title);
    expect(project.dealId).toBe(deal.id);
    expect(isoDate(project.plannedStartDate)).toBe("2026-12-01");
    await expect(createProjectFromDeal(admin, deal.id)).rejects.toThrow(/allerede et prosjekt/);
    await updateProject(admin, project.id, { status: "completed" });
    await expect(moveProject(admin, project.id, "21000000-0000-4000-8000-000000000002")).rejects.toThrow(/Gjenåpne/);
    const reopened = await updateProject(admin, project.id, { status: "open", phaseId: "21000000-0000-4000-8000-000000000002" });
    expect(reopened.status).toBe("open");
    expect(reopened.phaseId).toBe("21000000-0000-4000-8000-000000000002");
  });

  it("skjuler fullførte prosjekter fra tavlen og finner dem på år og status", async () => {
    const boardId = "20000000-0000-4000-8000-000000000001";
    const active = await dashboard({ status: "active", boardId });
    expect(active.projects.map((project) => project.title)).not.toContain("Solsiden 5");
    expect(active.projects.map((project) => project.title)).toContain("Havneveien 15");
    const archive = await dashboard({ status: "completed", year: "2025", q: "Solsiden", sellerId: "00000000-0000-4000-8000-000000000002" });
    expect(archive.projects.map((project) => project.title)).toEqual(["Solsiden 5"]);
    const havn = active.projects.find((project) => project.title === "Havneveien 15");
    expect(havn?.delayed).toBe(true);
    expect(havn?.stagnant).toBe(true);
    const withoutDate = active.projects.find((project) => project.title === "Utsikten 6");
    expect(withoutDate?.missingStart).toBe(true);
    expect(withoutDate?.plannedStartDate).toBeNull();
    const onlyMissing = await dashboard({ status: "active", boardId, missingStart: true });
    expect(onlyMissing.projects.map((project) => project.title)).toContain("Utsikten 6");
    expect(onlyMissing.projects.every((project) => project.plannedStartDate == null)).toBe(true);
    expect(onlyMissing.kpis.missingStartCount).toBe(onlyMissing.projects.length);
  });

  it("lar oppstartsdato settes eller stå tom når prosjektet opprettes", async () => {
    const stamp = Date.now();
    const chosen = await createDeal(admin, {
      title: `Dato ${stamp}`,
      valueNok: 100000,
      pipelineId: "10000000-0000-4000-8000-000000000001",
      stageId: "11000000-0000-4000-8000-000000000001",
      plannedStartDate: "2026-11-01",
    });
    extraDeals.push(chosen.id);
    const withDate = await winDeal(admin, chosen.id, { createProject: true, plannedStartDate: "2027-04-15" });
    if (!withDate.project) throw new Error("Mangler prosjekt");
    extraProjects.push(withDate.project.id);
    expect(isoDate(withDate.project.plannedStartDate)).toBe("2027-04-15");

    const empty = await createDeal(admin, {
      title: `Tom dato ${stamp}`,
      valueNok: 90000,
      pipelineId: "10000000-0000-4000-8000-000000000001",
      stageId: "11000000-0000-4000-8000-000000000001",
      plannedStartDate: "2026-11-01",
    });
    extraDeals.push(empty.id);
    const without = await winDeal(admin, empty.id, { createProject: true, plannedStartDate: null });
    if (!without.project) throw new Error("Mangler prosjekt");
    extraProjects.push(without.project.id);
    expect(without.project.plannedStartDate).toBeNull();
  });

  it("beholder fasenavn i historikken og summerer vunne avtaler", async () => {
    const result = await queryInsights(admin, {
      kind: "won",
      measure: "sum",
      groupBy: "seller",
      period: "custom",
      from: "2024-11-01",
      to: "2026-10-18",
      compare: "none",
      view: "bar",
    });
    expect(result.total).toBeGreaterThan(1_000_000);
    expect(result.buckets.length).toBeGreaterThan(1);
    const pipeline = await createPipeline(admin, { name: `Histpipe ${Date.now()}` });
    const stage = pipeline.stages[0]!;
    const deal = await createDeal(admin, {
      title: `Histavtale ${Date.now()}`,
      valueNok: 150000,
      pipelineId: pipeline.id,
      stageId: stage.id,
    });
    extraDeals.push(deal.id);
    const events = await prisma.dealStageEvent.findMany({ where: { dealId: deal.id } });
    expect(events[0]?.toStageName).toBe("Ny fase");
    await editStage(admin, stage.id, { name: "Omdøpt fase" });
    const kept = await prisma.dealStageEvent.findUnique({ where: { id: events[0]!.id } });
    expect(kept?.toStageName).toBe("Ny fase");
    await prisma.deal.delete({ where: { id: deal.id } });
    await removePipeline(admin, pipeline.id);
  });
});
