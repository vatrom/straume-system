import { prisma } from "@straume/db";
import { afterAll, describe, expect, it } from "vitest";
import { addStage, createPipeline, editStage, orderStages, removePipeline, removeStage } from "./crm";
import { adjustPriceList, priceListView } from "./price-admin";
import { customerView } from "./projects";
import { pushMutations } from "./sync-service";

const admin = { id: "00000000-0000-4000-8000-000000000001", role: "admin" };
const projectId = "60000000-0000-4000-8000-000000000001";

describe("fase 1 mot databasen", () => {
  const created: string[] = [];

  afterAll(async () => {
    if (created.length) {
      await prisma.priceList.deleteMany({ where: { id: { in: created } } });
      await prisma.note.deleteMany({ where: { id: { in: created } } });
    }
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
});
