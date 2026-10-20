import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isoWeek, mondayOf, weekdayLabel } from "./dates";
import { easterSunday, holidayName, norwegianHolidays } from "./holidays";
import {
  buildPlan,
  dailyCapacity,
  loadLevel,
  previewAssignment,
  scheduleProject,
  totalWeekCells,
  weekRows,
  type ProjectInput,
  type ResourceInput,
} from "./planning";

function resource(
  partial: Partial<ResourceInput> & Pick<ResourceInput, "id" | "name">,
): ResourceInput {
  return {
    role: "Tømrer",
    weeklyCapacityHours: 37.5,
    active: true,
    absences: [],
    ...partial,
  };
}

function project(
  partial: Partial<ProjectInput> & Pick<ProjectInput, "id" | "name" | "startDate" | "estimatedHours">,
): ProjectInput {
  return {
    endDate: null,
    status: "planlagt",
    color: "#1f6b4a",
    resourceIds: [],
    ...partial,
  };
}

describe("helligdager", () => {
  it("kjenner påske og faste norske helligdager", () => {
    assert.equal(easterSunday(2024), "2024-03-31");
    assert.equal(easterSunday(2025), "2025-04-20");
    assert.equal(easterSunday(2026), "2026-04-05");
    assert.equal(holidayName("2026-04-02"), "Skjærtorsdag");
    assert.equal(holidayName("2026-04-03"), "Langfredag");
    assert.equal(holidayName("2026-04-06"), "Andre påskedag");
    assert.equal(holidayName("2026-05-14"), "Kristi himmelfartsdag");
    assert.equal(holidayName("2026-05-25"), "Andre pinsedag");
    assert.equal(holidayName("2026-05-17"), "Grunnlovsdag");
    assert.equal(holidayName("2026-12-25"), "Første juledag");
    assert.equal(norwegianHolidays(2026).length, 12);
  });
});

describe("datoer", () => {
  it("finner mandag og ISO-uke", () => {
    assert.equal(mondayOf("2026-10-20"), "2026-10-19");
    assert.equal(isoWeek("2026-01-01").week, 1);
    assert.equal(isoWeek("2026-10-19").week, 43);
    assert.equal(isoWeek("2026-10-19").weekYear, 2026);
    assert.match(weekdayLabel("2026-10-19", "short"), /ma/i);
  });
});

describe("belastning", () => {
  it("fargelegger 80 % og 100 % som nesten full, og over 100 % som overbelastet", () => {
    assert.equal(loadLevel(0, 7.5), "free");
    assert.equal(loadLevel(5.9, 7.5), "free");
    assert.equal(loadLevel(6, 7.5), "tight");
    assert.equal(loadLevel(7.5, 7.5), "tight");
    assert.equal(loadLevel(7.6, 7.5), "over");
    assert.equal(loadLevel(0, 0), "off");
    assert.equal(loadLevel(2, 0), "over");
  });
});

describe("planlegging uten sluttdato", () => {
  it("bruker full dagskapasitet og hopper over helg", () => {
    const kari = resource({ id: "kari", name: "Kari" });
    const result = scheduleProject(
      project({
        id: "p1",
        name: "Tilbygg",
        startDate: "2026-10-23",
        estimatedHours: 15,
        resourceIds: ["kari"],
      }),
      [kari],
    );
    const days = result.schedule.bookings.get("kari");
    assert.equal(days?.get("2026-10-23"), 7.5);
    assert.equal(days?.get("2026-10-26"), 7.5);
    assert.equal(days?.has("2026-10-24"), false);
    assert.equal(days?.has("2026-10-25"), false);
    assert.equal(result.schedule.finishDate, "2026-10-26");
  });

  it("hopper over helligdag og fravær", () => {
    const kari = resource({
      id: "kari",
      name: "Kari",
      absences: [{ startDate: "2026-10-21", endDate: "2026-10-21", reason: "Ferie" }],
    });
    const absence = scheduleProject(
      project({
        id: "p1",
        name: "Tilbygg",
        startDate: "2026-10-19",
        estimatedHours: 22.5,
        resourceIds: ["kari"],
      }),
      [kari],
    );
    const days = absence.schedule.bookings.get("kari");
    assert.equal(days?.get("2026-10-19"), 7.5);
    assert.equal(days?.get("2026-10-20"), 7.5);
    assert.equal(days?.has("2026-10-21"), false);
    assert.equal(days?.get("2026-10-22"), 7.5);
    assert.equal(absence.schedule.finishDate, "2026-10-22");

    const holiday = scheduleProject(
      project({
        id: "p2",
        name: "Jul",
        startDate: "2026-12-23",
        estimatedHours: 22.5,
        resourceIds: ["kari"],
      }),
      [kari],
    );
    const christmas = holiday.schedule.bookings.get("kari");
    assert.equal(christmas?.get("2026-12-23"), 7.5);
    assert.equal(christmas?.get("2026-12-24"), 7.5);
    assert.equal(christmas?.has("2026-12-25"), false);
    assert.equal(christmas?.get("2026-12-28"), 7.5);
  });

  it("fordeler en delt siste dag på teamet", () => {
    const team = [
      resource({ id: "a", name: "A" }),
      resource({ id: "b", name: "B" }),
    ];
    const result = scheduleProject(
      project({
        id: "p1",
        name: "Felles",
        startDate: "2026-10-19",
        estimatedHours: 20,
        resourceIds: ["a", "b"],
      }),
      team,
    );
    assert.equal(result.schedule.bookings.get("a")?.get("2026-10-19"), 7.5);
    assert.equal(result.schedule.bookings.get("b")?.get("2026-10-19"), 7.5);
    assert.equal(result.schedule.bookings.get("a")?.get("2026-10-20"), 2.5);
    assert.equal(result.schedule.bookings.get("b")?.get("2026-10-20"), 2.5);
    assert.equal(result.schedule.finishDate, "2026-10-20");
  });
});

describe("planlegging med sluttdato", () => {
  it("sprer timene jevnt på arbeidsdagene og kan overbelaste", () => {
    const kari = resource({ id: "kari", name: "Kari" });
    const result = scheduleProject(
      project({
        id: "p1",
        name: "Naust",
        startDate: "2026-10-19",
        endDate: "2026-10-23",
        estimatedHours: 50,
        resourceIds: ["kari"],
      }),
      [kari],
    );
    const days = result.schedule.bookings.get("kari");
    assert.equal(days?.size, 5);
    assert.equal(days?.get("2026-10-19"), 10);
    const plan = buildPlan([kari], [
      project({
        id: "p1",
        name: "Naust",
        startDate: "2026-10-19",
        endDate: "2026-10-23",
        estimatedHours: 50,
        resourceIds: ["kari"],
      }),
    ], "2026-10-19", "2026-10-25");
    const rows = weekRows(plan, [kari], "2026-10-19", "2026-10-25");
    assert.equal(rows[0].cells[0].bookedHours, 50);
    assert.equal(rows[0].cells[0].capacityHours, 37.5);
    assert.equal(rows[0].cells[0].level, "over");
  });

  it("legger ikke timer på fraværsdager, så de andre dagene blir tyngre", () => {
    const kari = resource({
      id: "kari",
      name: "Kari",
      absences: [{ startDate: "2026-10-21", endDate: "2026-10-23", reason: "Ferie" }],
    });
    const result = scheduleProject(
      project({
        id: "p1",
        name: "Naust",
        startDate: "2026-10-19",
        endDate: "2026-10-23",
        estimatedHours: 20,
        resourceIds: ["kari"],
      }),
      [kari],
    );
    const days = result.schedule.bookings.get("kari");
    assert.equal(days?.size, 2);
    assert.equal(days?.get("2026-10-19"), 10);
    assert.equal(days?.get("2026-10-20"), 10);
    assert.equal(result.schedule.unallocatedHours, 0);
  });

  it("fordeler forholdsmessig etter ukekapasitet", () => {
    const team = [
      resource({ id: "a", name: "A", weeklyCapacityHours: 37.5 }),
      resource({ id: "b", name: "B", weeklyCapacityHours: 12.5 }),
    ];
    const result = scheduleProject(
      project({
        id: "p1",
        name: "Grunn",
        startDate: "2026-10-19",
        endDate: "2026-10-23",
        estimatedHours: 100,
        resourceIds: ["a", "b"],
      }),
      team,
    );
    assert.equal(result.schedule.bookings.get("a")?.get("2026-10-19"), 15);
    assert.equal(result.schedule.bookings.get("b")?.get("2026-10-19"), 5);
    assert.equal(dailyCapacity(12.5), 2.5);
  });

  it("advarer når perioden ikke har arbeidsdager", () => {
    const kari = resource({ id: "kari", name: "Kari" });
    const result = scheduleProject(
      project({
        id: "p1",
        name: "Helg",
        startDate: "2026-10-24",
        endDate: "2026-10-25",
        estimatedHours: 10,
        resourceIds: ["kari"],
      }),
      [kari],
    );
    assert.equal(result.schedule.bookings.size, 0);
    assert.equal(result.warnings.length, 1);
    assert.equal(result.schedule.unallocatedHours, 10);
  });
});

describe("sammenlagt plan", () => {
  it("summerer overlapp og ignorerer ferdige og inaktive", () => {
    const kari = resource({ id: "kari", name: "Kari" });
    const ole = resource({ id: "ole", name: "Ole", active: false });
    const projects = [
      project({
        id: "a",
        name: "A",
        startDate: "2026-10-19",
        endDate: "2026-10-19",
        estimatedHours: 8,
        resourceIds: ["kari"],
      }),
      project({
        id: "b",
        name: "B",
        startDate: "2026-10-19",
        endDate: "2026-10-19",
        estimatedHours: 4,
        resourceIds: ["kari", "ole"],
      }),
      project({
        id: "c",
        name: "C",
        startDate: "2026-10-19",
        endDate: "2026-10-19",
        estimatedHours: 40,
        status: "ferdig",
        resourceIds: ["kari"],
      }),
    ];
    const plan = buildPlan([kari, ole], projects, "2026-10-19", "2026-10-25");
    const monday = plan.byResource.get("kari")?.get("2026-10-19");
    assert.equal(monday?.bookedHours, 12);
    assert.equal(monday?.level, "over");
    assert.equal(monday?.projects.length, 2);
    assert.equal(plan.byResource.get("ole")?.get("2026-10-19")?.bookedHours, 0);
    assert.ok(plan.warnings.some((warning) => warning.projectId === "b"));

    const rows = weekRows(plan, [kari], "2026-10-19", "2026-10-25");
    assert.equal(rows[0].cells[0].bookedHours, 12);
    assert.equal(rows[0].cells[0].hasOverloadedDay, true);
    const total = totalWeekCells(rows);
    assert.equal(total[0].bookedHours, 12);

    const friday = plan.byResource.get("kari")?.get("2026-12-25");
    assert.equal(friday, undefined);
  });

  it("senker ukekapasiteten i en uke med helligdag", () => {
    const kari = resource({ id: "kari", name: "Kari" });
    const plan = buildPlan([kari], [], "2026-12-21", "2026-12-27");
    const cell = plan.byResource.get("kari")?.get("2026-12-25");
    assert.equal(cell?.holidayName, "Første juledag");
    assert.equal(cell?.capacityHours, 0);
    assert.equal(cell?.level, "off");
    const rows = weekRows(plan, [kari], "2026-12-21", "2026-12-27");
    assert.equal(rows[0].cells[0].capacityHours, 30);
    assert.equal(rows[0].cells[0].level, "free");
  });

  it("viser ledig kapasitet rundt et utkast uten å telle utkastet med", () => {
    const kari = resource({ id: "kari", name: "Kari" });
    const existing = project({
      id: "a",
      name: "A",
      startDate: "2026-10-19",
      endDate: "2026-10-23",
      estimatedHours: 37.5,
      resourceIds: ["kari"],
    });
    const preview = previewAssignment(
      [kari],
      [existing],
      project({
        id: "draft",
        name: "Nytt",
        startDate: "2026-10-19",
        endDate: "2026-10-23",
        estimatedHours: 10,
        resourceIds: ["kari"],
      }),
    );
    const kariPreview = preview.perResource.find((entry) => entry.id === "kari");
    assert.equal(kariPreview?.capacityHours, 37.5);
    assert.equal(kariPreview?.bookedHours, 37.5);
    assert.equal(kariPreview?.freeHours, 0);
    assert.ok(preview.peak);
    assert.ok((preview.peak?.bookedHours ?? 0) > 7.5);
  });
});
