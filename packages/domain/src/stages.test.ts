import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DomainError } from "./errors";
import { fullDaysInStage, isDealRotten } from "./rotting";
import { createPhase, createStage, deletePhase, deleteStage, reorderStages, updateStage } from "./stages";

const base = [
  { id: "a", pipelineId: "p", name: "Innkommende", sortOrder: 0, probability: 30, rottenDays: 2 },
  { id: "b", pipelineId: "p", name: "Befaring avtalt", sortOrder: 1, probability: 40, rottenDays: 14 },
];

describe("faser", () => {
  it("oppretter, døper om og sorterer faser", () => {
    const created = createStage(base, {
      id: "c",
      pipelineId: "p",
      name: " Tilbud sendt ",
      probability: 35,
      rottenDays: 9,
    });
    expect(created.map((stage) => stage.name)).toEqual(["Innkommende", "Befaring avtalt", "Tilbud sendt"]);
    expect(created[2]?.sortOrder).toBe(2);
    const renamed = updateStage(created, "b", { name: "Befaring", probability: 40, rottenDays: null });
    expect(renamed.find((stage) => stage.id === "b")).toMatchObject({ name: "Befaring", probability: 40, rottenDays: null });
    const ordered = reorderStages(renamed, ["c", "a", "b"]);
    expect(ordered.map((stage) => [stage.id, stage.sortOrder])).toEqual([
      ["c", 0],
      ["a", 1],
      ["b", 2],
    ]);
  });

  it("avviser ugyldig sannsynlighet, duplikatnavn og ufullstendig rekkefølge", () => {
    expect(() => updateStage(base, "a", { probability: 101 })).toThrow(DomainError);
    expect(() => updateStage(base, "a", { probability: 30.5 })).toThrow(DomainError);
    expect(() => createStage(base, { id: "c", pipelineId: "p", name: "innkommende", probability: 10, rottenDays: 1 })).toThrow(
      /allerede i bruk/,
    );
    expect(() => reorderStages(base, ["a"])).toThrow(DomainError);
    expect(() => reorderStages(base, ["a", "a"])).toThrow(DomainError);
  });

  it("sletter tom fase og blokkerer siste fase og fase med avtaler", () => {
    const three = createStage(base, { id: "c", pipelineId: "p", name: "Tilbud", probability: 35, rottenDays: 9 });
    expect(() => deleteStage(three, "c", 2)).toThrow(/salgsavtaler/);
    const left = deleteStage(three, "c", 0);
    expect(left.map((stage) => stage.id)).toEqual(["a", "b"]);
    expect(left.map((stage) => stage.sortOrder)).toEqual([0, 1]);
    expect(() => deleteStage([base[0]!], "a", 0)).toThrow(/minst én fase/);
  });

  it("har samme regler for prosjektfaser", () => {
    const phases = [
      { id: "p1", boardId: "b", name: "Oppdrag mottatt", sortOrder: 0 },
      { id: "p2", boardId: "b", name: "Klar for gjennomføring", sortOrder: 1 },
    ];
    const next = createPhase(phases, { id: "p3", boardId: "b", name: "Send Kundeundersøkelse" });
    expect(deletePhase(next, "p3", 0)).toHaveLength(2);
    expect(() => deletePhase(next, "p1", 4)).toThrow(/prosjekter/);
  });
});

describe("stagnasjon", () => {
  const entered = new Date("2026-10-01T08:00:00.000Z");

  it("stagnerer når antall dager er nådd, og ikke før", () => {
    const almost = new Date(entered.getTime() + 2 * 86_400_000 - 1);
    const exact = new Date(entered.getTime() + 2 * 86_400_000);
    expect(isDealRotten({ status: "open", stageEnteredAt: entered, rottenDays: 2, now: almost })).toBe(false);
    expect(isDealRotten({ status: "open", stageEnteredAt: entered, rottenDays: 2, now: exact })).toBe(true);
    expect(fullDaysInStage(entered, exact)).toBe(2);
  });

  it("hopper over vunnet, tapt og faser uten varsel", () => {
    const later = new Date("2026-11-01T00:00:00.000Z");
    expect(isDealRotten({ status: "won", stageEnteredAt: entered, rottenDays: 2, now: later })).toBe(false);
    expect(isDealRotten({ status: "lost", stageEnteredAt: entered, rottenDays: 2, now: later })).toBe(false);
    expect(isDealRotten({ status: "open", stageEnteredAt: entered, rottenDays: null, now: later })).toBe(false);
  });
});

describe("prisfil finnes", () => {
  it("har 110 datarader", () => {
    const csv = readFileSync(new URL("../../db/prisma/data/prisposter.csv", import.meta.url), "utf8");
    expect(csv.split("\n").filter((line) => line.trim()).length).toBe(111);
  });
});
