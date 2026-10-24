import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { basicAuthHeader, createTripletexApi, EMPLOYEE_FIELDS, ENTRY_FIELDS, PROJECT_FIELDS, sessionRequest, WEEK_FIELDS } from "./client";
import { readTripletexConfig } from "./config";
import { realisticTripletex, tripletexFixture } from "./fixture";
import { bestEmployeeMatch, bestProjectMatch } from "./match";
import {
  TRIPLETEX_SETUP_LABEL,
  employeeCreateData,
  employeeLinkData,
  needsTripletexSetup,
  planEmployeeImports,
  planProjectImports,
  projectCreateData,
  projectUpdateData,
  type LocalProject,
} from "./import";
import { employmentOverlaps, selectCurrentEmployees } from "./employment";
import { normalizeEmployment, normalizeEntry, normalizeProject, normalizeWeek, staffEmployees } from "./parse";
import { runSyncPipeline } from "./pipeline";
import { bearerAuthorized } from "./secret";
import { classifyEntries, mergeByExternalId, syncWindow } from "./sync";
import type { TripletexEmployee, TripletexEntry, TripletexProject } from "./types";

describe("tripletex-oppsett", () => {
  it("er avslått uten nøkler og leser ikke hemmeligheter inn i feil", () => {
    const config = readTripletexConfig({});
    assert.equal(config.configured, false);
    assert.equal(config.baseUrl, "https://tripletex.no/v2");
    assert.equal(config.username, "0");
    const ready = readTripletexConfig({
      TRIPLETEX_REFRESH_TOKEN: "hemmelig-refresh",
      TRIPLETEX_BASE_URL: "https://api.tripletex.io/v2/",
      TRIPLETEX_COMPANY_ID: "6682311",
    });
    assert.equal(ready.configured, true);
    assert.equal(ready.mode, "refresh");
    assert.equal(ready.baseUrl, "https://api.tripletex.io/v2");
    const request = sessionRequest(ready);
    assert.equal(request.method, "POST");
    assert.match(request.url, /\/token\/session\/:createFromRefreshToken$/);
    assert.equal(request.body.refreshToken, "hemmelig-refresh");
    const commercial = sessionRequest(
      readTripletexConfig({ TRIPLETEX_CONSUMER_TOKEN: "konsument", TRIPLETEX_EMPLOYEE_TOKEN: "ansatt" }),
    );
    assert.match(commercial.url, /\/token\/session\/:create$/);
    assert.equal(commercial.body.consumerToken, "konsument");
  });
});

describe("tripletex-klient", () => {
  it("henter bare med GET etter sesjon og hopper over kontakter", async () => {
    const calls: { url: string; method: string; authorization?: string }[] = [];
    const config = readTripletexConfig({ TRIPLETEX_REFRESH_TOKEN: "hemmelig-refresh" });
    const api = await createTripletexApi(config, async (url, init) => {
      calls.push({
        url,
        method: init?.method ?? "GET",
        authorization: new Headers(init?.headers).get("authorization") ?? undefined,
      });
      if (String(url).includes("createFromRefreshToken")) {
        return new Response(JSON.stringify({ value: { token: "sesjon-token" } }), { status: 200 });
      }
      const payload = String(url).includes("/employee")
        ? { fullResultSize: tripletexFixture.employees.length, values: tripletexFixture.employees }
        : String(url).includes("/project")
          ? { values: tripletexFixture.projects, fullResultSize: tripletexFixture.projects.length }
          : String(url).includes("/timesheet/entry")
            ? { values: tripletexFixture.entries, fullResultSize: tripletexFixture.entries.length }
            : { values: tripletexFixture.weeks, fullResultSize: tripletexFixture.weeks.length };
      return new Response(JSON.stringify(payload), { status: 200 });
    });
    assert.ok(api);
    const employees = await api.employees();
    const projects = await api.projects();
    const entries = await api.entries("2026-08-21", "2026-10-21");
    assert.deepEqual(
      employees.map((employee) => employee.id),
      [10, 12],
    );
    assert.equal(projects[0]?.number, "1042");
    assert.equal(projects[0]?.customer, "Familien Berg");
    assert.equal(projects[0]?.startDate, "2026-10-19");
    assert.equal(projects[0]?.endDate, "2026-12-01");
    assert.equal(projects.find((project) => project.id === 202)?.closed, true);
    assert.equal(projects.find((project) => project.id === 201)?.customer, "Ukjent");
    const projectCall = calls.find((call) => call.url.includes("/project"));
    assert.equal(new URL(projectCall?.url ?? "http://localhost").searchParams.get("fields"), PROJECT_FIELDS);
    assert.match(projectCall?.url ?? "", /isInternal/);
    const entryCall = calls.find((call) => call.url.includes("/timesheet/entry"));
    assert.equal(new URL(entryCall?.url ?? "http://localhost").searchParams.get("fields"), ENTRY_FIELDS);
    assert.equal(entries[0]?.activityName, "Timer fastpris");
    assert.equal(calls[0]?.method, "POST");
    assert.ok(calls.slice(1).every((call) => call.method === "GET"));
    assert.equal(calls[1]?.authorization, basicAuthHeader("0", "sesjon-token"));
    assert.ok(calls.every((call) => !call.url.includes("hemmelig-refresh")));
    const staff = staffEmployees(
      tripletexFixture.employees.map((employee) => ({ ...employee })),
    );
    assert.equal(staff.some((employee) => employee.isContact), false);
  });

  it("feilmelding inneholder ikke token", async () => {
    const config = readTripletexConfig({ TRIPLETEX_REFRESH_TOKEN: "hemmelig-refresh" });
    await assert.rejects(
      () => createTripletexApi(config, async () => new Response("token=hemmelig-refresh", { status: 401 })),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message.includes("hemmelig-refresh"), false);
        return true;
      },
    );
  });
});

describe("tripletex-kobling", () => {
  it("kobler på id og prosjektnummer, og mister ikke ukoblede timer", () => {
    const entries = tripletexFixture.entries
      .map(normalizeEntry)
      .filter((entry): entry is TripletexEntry => Boolean(entry));
    const classified = classifyEntries(entries, {
      employeeToResource: new Map([[10, "kari"]]),
      projectIdToProject: new Map([[200, "tilbygg"]]),
      projectNumberToProject: new Map(),
    });
    assert.equal(classified[0]?.projectId, "tilbygg");
    assert.equal(classified[0]?.resourceId, "kari");
    assert.equal(classified[0]?.unmappedReason, "");
    assert.equal(classified[0]?.externalId, "tt:501");
    assert.equal(classified[1]?.unmappedReason.includes("koblet"), true);
    assert.equal(classified[1]?.resourceId, null);
    assert.equal(classified[1]?.projectId, null);
    const partial = classifyEntries(
      [{ ...entries[0], projectId: 999, projectNumber: "9999", projectName: "Ikke importert" }],
      {
        employeeToResource: new Map([[10, "kari"]]),
        projectIdToProject: new Map(),
        projectNumberToProject: new Map(),
      },
    );
    assert.equal(partial[0]?.resourceId, "kari");
    assert.equal(partial[0]?.projectId, null);
    assert.match(partial[0]?.unmappedReason ?? "", /Prosjekt/);
    const onlyProject = classifyEntries([entries[0]], {
      employeeToResource: new Map(),
      projectIdToProject: new Map([[200, "tilbygg"]]),
      projectNumberToProject: new Map(),
    });
    assert.equal(onlyProject[0]?.resourceId, null);
    assert.equal(onlyProject[0]?.projectId, "tilbygg");
    const byNumber = classifyEntries([entries[0]], {
      employeeToResource: new Map([[10, "kari"]]),
      projectIdToProject: new Map(),
      projectNumberToProject: new Map([["1042", "tilbygg"]]),
    });
    assert.equal(byNumber[0]?.projectId, "tilbygg");
    assert.equal("fag" in (classified[0] ?? {}), false);
  });

  it("oppdaterer samme Tripletex-id i stedet for å legge inn dobbelt", () => {
    const [first] = classifyEntries(
      [normalizeEntry(tripletexFixture.entries[0])].filter((entry): entry is TripletexEntry => Boolean(entry)),
      {
        employeeToResource: new Map([[10, "kari"]]),
        projectIdToProject: new Map([[200, "tilbygg"]]),
        projectNumberToProject: new Map(),
      },
    );
    const once = mergeByExternalId([], [first]);
    assert.equal(once.inserted, 1);
    const again = mergeByExternalId(once.rows, [first]);
    assert.equal(again.rows.length, 1);
    assert.equal(again.unchanged, 1);
    const changed = mergeByExternalId(once.rows, [{ ...first, hours: 5 }]);
    assert.equal(changed.updated, 1);
    assert.equal(changed.rows[0]?.hours, 5);
    const unlinked = mergeByExternalId(
      [{ ...first, id: first.externalId, resourceId: null, projectId: null, unmappedReason: "Verken ansatt eller prosjekt er koblet." }],
      [first],
    );
    assert.equal(unlinked.updated, 1);
    assert.equal(unlinked.unchanged, 0);
    assert.equal(unlinked.rows.length, 1);
    assert.equal(unlinked.rows[0]?.resourceId, "kari");
    assert.equal(unlinked.rows[0]?.projectId, "tilbygg");
    assert.equal(unlinked.rows[0]?.unmappedReason, "");
  });

  it("foreslår treff på navn og prosjektnummer", () => {
    assert.equal(
      bestEmployeeMatch("Kari Haugen", tripletexFixture.employees.filter((employee) => !employee.isContact)),
      10,
    );
    assert.equal(bestProjectMatch("Tilbygg Strandveien 12", tripletexFixture.projects), 200);
    assert.equal(bestProjectMatch("Prosjekt 1042", tripletexFixture.projects), 200);
  });

  it("bruker et vindu der sluttdato er eksklusiv", () => {
    assert.deepEqual(syncWindow("2026-10-20"), { dateFrom: "2026-08-21", dateTo: "2026-10-21" });
  });
});

const remoteProject = (overrides: Partial<TripletexProject> & Pick<TripletexProject, "id" | "name">): TripletexProject => ({
  number: "",
  customer: "",
  startDate: null,
  endDate: null,
  closed: false,
  ...overrides,
});

const localProject = (overrides: Partial<LocalProject> & Pick<LocalProject, "id" | "name">): LocalProject => ({
  customer: "",
  tripletexProjectId: null,
  tripletexProjectNumber: "",
  startDate: "2026-10-01",
  endDate: null,
  status: "pågår",
  ...overrides,
});

describe("tripletex-import", () => {
  it("leser kunde, datoer og lukket fra prosjektet", () => {
    const parsed = normalizeProject({
      id: 9,
      number: 88,
      displayName: "Naust",
      customerName: "Naustet",
      startDate: "2026-05-02T00:00:00",
      closed: true,
    });
    assert.equal(parsed?.name, "Naust");
    assert.equal(parsed?.customer, "Naustet");
    assert.equal(parsed?.startDate, "2026-05-02");
    assert.equal(parsed?.endDate, null);
    assert.equal(parsed?.closed, true);
  });

  it("oppretter åpne prosjekter og hopper over lukkede som ikke finnes", () => {
    const changes = planProjectImports(
      [
        remoteProject({ id: 1, number: "10", name: "Nytt hus", customer: "Berg", startDate: "2026-11-02", endDate: "2026-12-01" }),
        remoteProject({ id: 2, name: "Gammelt", closed: true }),
        remoteProject({ id: 3, name: "", number: "11" }),
      ],
      [],
      "2026-10-21",
    );
    assert.equal(changes.filter((change) => change.kind === "skip").length, 1);
    const created = changes.filter((change) => change.kind === "create");
    assert.equal(created.length, 2);
    assert.equal(created[0]?.kind === "create" && created[0].startDate, "2026-11-02");
    assert.equal(created[1]?.kind === "create" && created[1].name, "Prosjekt 11");
    assert.equal(created[1]?.kind === "create" && created[1].startDate, "2026-10-21");
    const data = projectCreateData(created[0] as Extract<(typeof created)[number], { kind: "create" }>);
    assert.equal(data.estimatedHours, 0);
    assert.equal(data.status, "planlagt");
    assert.equal(data.isExample, false);
    assert.equal("color" in data, false);
    assert.equal("assignments" in data, false);
  });

  it("oppdaterer koblede felt og lar planfeltene stå", () => {
    const linked = localProject({
      id: "p1",
      name: "Gammelt navn",
      customer: "Gammel",
      tripletexProjectId: 5,
      tripletexProjectNumber: "1",
      status: "pågår",
      startDate: "2026-01-01",
    });
    const tentative = localProject({
      id: "p2",
      name: "Tilbud",
      tripletexProjectId: 6,
      status: "tentativ",
    });
    const finished = localProject({
      id: "p3",
      name: "Ferdig jobb",
      tripletexProjectId: 7,
      status: "ferdig",
    });
    const byNumber = localProject({
      id: "p4",
      name: "Lokalt",
      tripletexProjectNumber: "42",
      status: "planlagt",
    });
    const changes = planProjectImports(
      [
        remoteProject({
          id: 5,
          number: "1",
          name: "Nytt navn",
          customer: "Ny kunde",
          startDate: "2026-02-02",
          endDate: "2026-03-03",
          closed: true,
        }),
        remoteProject({ id: 6, name: "Tilbud fra TT", closed: true }),
        remoteProject({ id: 7, name: "Ferdig jobb", closed: false }),
        remoteProject({ id: 8, number: "42", name: "Lokalt", customer: "Kunde" }),
      ],
      [linked, tentative, finished, byNumber],
      "2026-10-21",
    );
    const updated = changes.find((change) => change.kind === "update" && change.localId === "p1");
    assert.ok(updated && updated.kind === "update");
    assert.equal(updated.status, "ferdig");
    assert.equal(updated.name, "Nytt navn");
    assert.equal(updated.customer, "Ny kunde");
    assert.equal(updated.startDate, "2026-02-02");
    assert.equal(updated.endDate, "2026-03-03");
    const payload = projectUpdateData(updated);
    for (const key of ["estimatedHours", "color", "isExample", "assignments", "phases", "address"]) {
      assert.equal(key in payload, false);
    }
    assert.equal(payload.status, "ferdig");
    const tilbud = changes.find((change) => change.kind === "update" && change.localId === "p2");
    assert.ok(tilbud && tilbud.kind === "update");
    assert.equal("status" in tilbud, false);
    assert.equal(changes.some((change) => change.kind === "update" && change.localId === "p3"), false);
    const numbered = changes.find((change) => change.kind === "update" && change.localId === "p4");
    assert.ok(numbered && numbered.kind === "update");
    assert.equal(numbered.tripletexProjectId, 8);
    assert.equal(numbered.customer, "Kunde");
    assert.equal("status" in numbered, false);
  });

  it("kobler ansatte på eksakt navn og oppretter ikke treff som bare ligner", () => {
    const employees: TripletexEmployee[] = [
      { id: 10, firstName: "Kari", lastName: "Haugen", isContact: false },
      { id: 12, firstName: "Ole", lastName: "Nilsen", isContact: false },
      { id: 11, firstName: "Per", lastName: "Kontakt", isContact: true },
      { id: 13, firstName: "Ole", lastName: "", isContact: false },
      { id: 14, firstName: "Mari", lastName: "Solberg", isContact: false },
      { id: 15, firstName: "Ny", lastName: "Person", isContact: false },
    ];
    const changes = planEmployeeImports(employees, [
      { id: "kari", name: "Kari Haugen", tripletexEmployeeId: null },
      { id: "ole", name: "Ole Nilsen", tripletexEmployeeId: 99 },
      { id: "mari", name: "Mari", tripletexEmployeeId: null },
    ]);
    assert.deepEqual(
      changes.find((change) => change.tripletexEmployeeId === 10),
      { kind: "link", resourceId: "kari", tripletexEmployeeId: 10 },
    );
    assert.equal(employeeLinkData({ kind: "link", resourceId: "kari", tripletexEmployeeId: 10 }).tripletexEmployeeId, 10);
    assert.equal(changes.some((change) => change.tripletexEmployeeId === 11), false);
    assert.equal(changes.find((change) => change.tripletexEmployeeId === 12)?.kind, "skip");
    assert.equal(changes.find((change) => change.tripletexEmployeeId === 13)?.kind, "skip");
    assert.equal(
      (changes.find((change) => change.tripletexEmployeeId === 14) as { reason?: string } | undefined)?.reason,
      "possible-duplicate",
    );
    const created = changes.find((change) => change.tripletexEmployeeId === 15);
    assert.equal(created?.kind, "create");
    assert.equal(created && created.kind === "create" && employeeCreateData(created).role, "Ukjent");
    assert.equal(TRIPLETEX_SETUP_LABEL, "Ny fra Tripletex – mangler timeverk/ressurser");
    assert.equal(
      needsTripletexSetup({ tripletexProjectId: 1, estimatedHours: 0, assignments: [{ resourceId: "a" }] }),
      true,
    );
    assert.equal(
      needsTripletexSetup({
        tripletexProjectId: 1,
        estimatedHours: 10,
        assignments: [],
        phases: [{ assignments: [{ resourceId: "a" }] }],
      }),
      false,
    );
    assert.equal(
      needsTripletexSetup({ tripletexProjectId: null, estimatedHours: 0, assignments: [] }),
      false,
    );
  });

  it("arkiverer lukkede koblinger, hopper over interne og ignorerte, og henter gjenåpnede tilbake", () => {
    const archived = planProjectImports(
      [
        remoteProject({ id: 5, name: "Lukket hus", closed: true }),
        remoteProject({ id: 8, name: "Internt lager", internal: true }),
        remoteProject({ id: 9, name: "Slettet av bruker" }),
      ],
      [
        localProject({ id: "p5", name: "Lukket hus", tripletexProjectId: 5, status: "pågår" }),
        localProject({ id: "manuell", name: "Eget prosjekt", status: "pågår" }),
        localProject({ id: "borte", name: "Slettet av bruker", tripletexProjectId: 9, syncIgnored: true, status: "pågår" }),
      ],
      "2026-10-24",
    );
    const closed = archived.find((change) => change.kind === "update" && change.localId === "p5");
    assert.ok(closed && closed.kind === "update");
    assert.equal(closed.archived, true);
    assert.equal(closed.status, "ferdig");
    assert.equal(archived.some((change) => change.kind === "update" && change.localId === "manuell"), false);
    const internal = archived.find((change) => change.kind === "skip" && change.tripletexProjectId === 8);
    const ignored = archived.find((change) => change.kind === "skip" && change.tripletexProjectId === 9);
    assert.equal(internal?.kind === "skip" && internal.reason, "internal");
    assert.equal(ignored?.kind === "skip" && ignored.reason, "ignored");

    const reopened = planProjectImports(
      [remoteProject({ id: 5, name: "Lukket hus", closed: false })],
      [localProject({ id: "p5", name: "Lukket hus", tripletexProjectId: 5, status: "ferdig", archived: true })],
      "2026-10-24",
    );
    const back = reopened.find((change) => change.kind === "update");
    assert.ok(back && back.kind === "update");
    assert.equal(back.archived, false);
    assert.equal(back.status, "planlagt");

    const hidden = planProjectImports(
      [remoteProject({ id: 8, name: "Internt lager", internal: true })],
      [localProject({ id: "p8", name: "Internt lager", tripletexProjectId: 8, status: "pågår" })],
      "2026-10-24",
    );
    const archivedInternal = hidden.find((change) => change.kind === "update" && change.localId === "p8");
    assert.ok(archivedInternal && archivedInternal.kind === "update");
    assert.equal(archivedInternal.archived, true);
    assert.equal(archivedInternal.status, "ferdig");
    assert.equal(hidden.some((change) => change.kind === "keep"), false);

    const kept = planProjectImports(
      [
        remoteProject({ id: 8, name: "Internt lager", internal: true }),
        remoteProject({ id: 5, name: "Lukket med folk", closed: true }),
      ],
      [
        localProject({
          id: "p8",
          name: "Internt lager",
          tripletexProjectId: 8,
          status: "ferdig",
          archived: true,
          hasAllocations: true,
        }),
        localProject({
          id: "p5",
          name: "Lukket med folk",
          tripletexProjectId: 5,
          status: "pågår",
          hasAllocations: true,
        }),
      ],
      "2026-10-24",
    );
    const keptInternal = kept.find((change) => change.kind === "update" && change.localId === "p8");
    assert.ok(keptInternal && keptInternal.kind === "update");
    assert.equal(keptInternal.archived, false);
    assert.equal(keptInternal.status, "planlagt");
    assert.equal(kept.some((change) => change.kind === "keep" && change.tripletexProjectId === 8), true);
    const closedWithPeople = kept.find((change) => change.kind === "update" && change.localId === "p5");
    assert.ok(closedWithPeople && closedWithPeople.kind === "update");
    assert.equal(closedWithPeople.archived, true);
  });

  it("godtar SYNC_SECRET og den eldre synk-hemmeligheten", () => {
    assert.equal(bearerAuthorized("Bearer natt", { SYNC_SECRET: "natt" }), true);
    assert.equal(bearerAuthorized("Bearer gammel", { TRIPLETEX_SYNC_SECRET: "gammel" }), true);
    assert.equal(bearerAuthorized("Bearer gammel", { SYNC_SECRET: "natt", TRIPLETEX_SYNC_SECRET: "gammel" }), true);
    assert.equal(bearerAuthorized("Bearer feil", { SYNC_SECRET: "natt" }), false);
    assert.equal(bearerAuthorized("Bearer ", {}), false);
  });
});

describe("tripletex-uke-og-ansettelse", () => {
  it("bygger weekYear fra year og week, ikke fra et felt som ikke finnes", () => {
    const week = normalizeWeek(realisticTripletex.weekList.values[0]);
    assert.equal(week?.weekYear, "2026-43");
    assert.equal(week?.year, 2026);
    assert.equal(week?.week, 43);
    assert.equal(week?.completed, false);
    assert.equal(WEEK_FIELDS.includes("weekYear"), false);
    const job = normalizeEmployment(realisticTripletex.employmentList.values[1]);
    assert.equal(job?.employeeId, 12);
    assert.equal(job?.endDate, "2024-05-31");
  });

  it("henter uke med year og week, og viser 400-teksten", async () => {
    const calls: string[] = [];
    const config = readTripletexConfig({ TRIPLETEX_REFRESH_TOKEN: "hemmelig-refresh" });
    const api = await createTripletexApi(config, async (url) => {
      calls.push(String(url));
      if (String(url).includes("createFromRefreshToken")) {
        return new Response(JSON.stringify({ value: { token: "sesjon-token" } }), { status: 200 });
      }
      if (String(url).includes("/timesheet/week")) {
        return new Response(JSON.stringify(realisticTripletex.weekList), { status: 200 });
      }
      return new Response(JSON.stringify({ fullResultSize: 0, values: [] }), { status: 200 });
    });
    assert.ok(api);
    const weeks = await api.weeks([10], "2026-43");
    assert.equal(weeks[0]?.weekYear, "2026-43");
    const weekUrl = calls.find((url) => url.includes("/timesheet/week")) ?? "";
    assert.equal(new URL(weekUrl).searchParams.get("fields"), WEEK_FIELDS);
    assert.equal(new URL(weekUrl).searchParams.get("weekYear"), "2026-43");

    const failing = await createTripletexApi(config, async (url) => {
      if (String(url).includes("createFromRefreshToken")) {
        return new Response(JSON.stringify({ value: { token: "sesjon-token" } }), { status: 200 });
      }
      return new Response(JSON.stringify(realisticTripletex.weekError), { status: 400 });
    });
    assert.ok(failing);
    await assert.rejects(
      () => failing.weeks([10], "2026-43"),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /weekYear/);
        assert.equal(error.message.includes("hemmelig-refresh"), false);
        return true;
      },
    );
  });

  it("krever ansettelse som overlapper dagen", () => {
    const employees: TripletexEmployee[] = [
      { id: 1, firstName: "Kari", lastName: "Haugen", isContact: false, allowInformationRegistration: false },
      { id: 2, firstName: "Sluttet", lastName: "I fjor", isContact: false, allowInformationRegistration: true },
      { id: 3, firstName: "Per", lastName: "Kontakt", isContact: true },
      { id: 4, firstName: "Regnskap", lastName: "Kontor", isContact: false, isProxy: true },
      { id: 5, firstName: "Pensjon", lastName: "Uten", isContact: false },
      { id: 6, firstName: "Ny", lastName: "I morgen", isContact: false },
    ];
    const jobs = [
      { employeeId: 1, startDate: "2019-04-01", endDate: null, noEmploymentRelationship: false },
      { employeeId: 2, startDate: "2010-01-01", endDate: "2024-05-31", noEmploymentRelationship: false },
      { employeeId: 3, startDate: "2020-01-01", endDate: null, noEmploymentRelationship: false },
      { employeeId: 4, startDate: "2020-01-01", endDate: null, noEmploymentRelationship: false },
      { employeeId: 5, startDate: "2020-01-01", endDate: null, noEmploymentRelationship: true },
      { employeeId: 6, startDate: "2026-10-25", endDate: null, noEmploymentRelationship: false },
    ];
    assert.equal(employmentOverlaps({ startDate: "2020-01-01", endDate: "2026-10-24" }, "2026-10-24", "2026-10-25"), true);
    assert.equal(employmentOverlaps({ startDate: "2020-01-01", endDate: "2026-10-23" }, "2026-10-24", "2026-10-25"), false);
    const current = selectCurrentEmployees(employees, jobs, "2026-10-24", "2026-10-25");
    assert.deepEqual(current.map((employee) => employee.id), [1]);
  });

  it("fjerner tomme tidligere ansatte og rører ikke innleid, manuell eller skjult", () => {
    const current: TripletexEmployee[] = [
      { id: 10, firstName: "Kari", lastName: "Haugen", isContact: false },
    ];
    const changes = planEmployeeImports(current, [
      { id: "kari", name: "Kari Haugen", tripletexEmployeeId: 10, active: true, hasHistory: true },
      { id: "tom", name: "Tidligere Tom", tripletexEmployeeId: 30, active: true, hasHistory: false },
      { id: "historie", name: "Tidligere Lin", tripletexEmployeeId: 31, active: true, hasHistory: true },
      { id: "innleid", name: "Leie Hansen", tripletexEmployeeId: 32, innleid: true, active: true, hasHistory: false },
      { id: "manuell", name: "Egen Person", tripletexEmployeeId: null, active: true },
      { id: "skjult", name: "Kari Haugen", tripletexEmployeeId: null, planExcluded: true, active: false },
      { id: "gammel-skjult", name: "Skjult Ansatt", tripletexEmployeeId: 40, planExcluded: true, active: false, hasHistory: false },
    ]);
    assert.equal(changes.some((change) => change.kind === "remove" && change.resourceId === "tom"), true);
    assert.equal(changes.some((change) => change.kind === "deactivate" && change.resourceId === "historie"), true);
    assert.equal(changes.some((change) => "resourceId" in change && change.resourceId === "innleid"), false);
    assert.equal(changes.some((change) => "resourceId" in change && change.resourceId === "manuell"), false);
    assert.equal(changes.some((change) => change.kind === "create"), false);
    assert.equal(changes.some((change) => change.kind === "remove" && change.resourceId === "gammel-skjult"), false);
    assert.equal(changes.find((change) => change.tripletexEmployeeId === 10)?.kind, "skip");
  });

  it("hopper over timer på et ignorert Tripletex-prosjekt", () => {
    const entries = tripletexFixture.entries
      .map(normalizeEntry)
      .filter((entry): entry is TripletexEntry => Boolean(entry));
    const classified = classifyEntries(
      entries,
      {
        employeeToResource: new Map([[10, "kari"]]),
        projectIdToProject: new Map([[200, "tilbygg"]]),
        projectNumberToProject: new Map(),
      },
      new Set([200]),
    );
    assert.equal(classified.some((entry) => entry.projectId === "tilbygg"), false);
    assert.equal(classified.length, 1);
  });

  it("beholder prosjekt- og timetall når uke-status feiler", async () => {
    const report = await runSyncPipeline({
      today: "2026-10-24",
      employees: async () => [
        { id: 10, firstName: "Kari", lastName: "Haugen", isContact: false },
        { id: 99, firstName: "Gammel", lastName: "Ansatt", isContact: false },
      ],
      employments: async () => [
        { employeeId: 10, startDate: "2020-01-01", endDate: null, noEmploymentRelationship: false },
        { employeeId: 99, startDate: "2010-01-01", endDate: "2020-01-01", noEmploymentRelationship: false },
      ],
      projects: async () => [
        remoteProject({ id: 1, name: "Åpent", number: "1" }),
        remoteProject({ id: 2, name: "Lukket", closed: true }),
        remoteProject({ id: 3, name: "Internt lager", internal: true }),
      ],
      entries: async () =>
        [normalizeEntry(tripletexFixture.entries[0])].filter((entry): entry is TripletexEntry => Boolean(entry)),
      weeks: async () => {
        throw new Error("Tripletex svarte med status 400: Illegal field in fields filter: weekYear (WeekDTO)");
      },
      loadResources: async () => [
        { id: "extra", name: "Gammel Ansatt", tripletexEmployeeId: 99, active: true, hasHistory: false },
      ],
      loadProjects: async () => [],
      applyEmployees: async (changes) => {
        assert.equal(changes.some((change) => change.kind === "create" && change.tripletexEmployeeId === 10), true);
        assert.equal(changes.some((change) => change.kind === "remove" && change.tripletexEmployeeId === 99), true);
        assert.equal(changes.some((change) => change.kind === "create" && change.tripletexEmployeeId === 99), false);
        return { linked: 0, created: 1, deactivated: 0, removed: 1, reactivated: 0 };
      },
      applyProjects: async (changes) => {
        assert.equal(changes.filter((change) => change.kind === "create").length, 1);
        assert.equal(changes.filter((change) => change.kind === "skip").length, 2);
        return { created: 1, updated: 0, archived: 0 };
      },
      loadLinks: async () => ({
        links: {
          employeeToResource: new Map([[10, "kari"]]),
          projectIdToProject: new Map([[200, "tilbygg"]]),
          projectNumberToProject: new Map(),
        },
        ignoredProjectIds: [],
      }),
      writeEntry: async () => "inserted",
      saveState: async () => {},
    });
    assert.equal(report.projectsCreated, 1);
    assert.equal(report.projectsSkipped, 2);
    assert.equal(report.employeesCreated, 1);
    assert.equal(report.employeesRemoved, 1);
    assert.equal(report.inserted, 1);
    assert.equal(report.ok, false);
    assert.match(report.message, /1 nye prosjekter/);
    assert.match(report.message, /Uke-status/);
    assert.match(report.message, /weekYear/);
    assert.equal(report.message.includes("0 nye prosjekter"), false);
  });

  it("leser nested employments når /employee/employment er tom", async () => {
    const calls: string[] = [];
    const config = readTripletexConfig({ TRIPLETEX_REFRESH_TOKEN: "hemmelig-refresh" });
    const api = await createTripletexApi(config, async (url) => {
      calls.push(String(url));
      const path = new URL(String(url)).pathname;
      if (path.endsWith("/token/session/:createFromRefreshToken")) {
        return new Response(JSON.stringify({ value: { token: "sesjon-token" } }), { status: 200 });
      }
      if (path.endsWith("/employee/employment")) {
        return new Response(JSON.stringify(realisticTripletex.emptyEmploymentSearch), { status: 200 });
      }
      if (path.endsWith("/employee")) {
        return new Response(JSON.stringify(realisticTripletex.employeesWithEmployments), { status: 200 });
      }
      return new Response(JSON.stringify({ fullResultSize: 0, values: [] }), { status: 200 });
    });
    assert.ok(api);
    const employees = await api.employees();
    const jobs = await api.employments();
    const staffCalls = calls.filter((url) => new URL(url).pathname.endsWith("/employee"));
    assert.equal(staffCalls.length, 1);
    assert.equal(new URL(staffCalls[0] ?? "http://localhost").searchParams.get("fields"), EMPLOYEE_FIELDS);
    assert.match(EMPLOYEE_FIELDS, /employments\(startDate,endDate,noEmploymentRelationship\)/);
    assert.equal(calls.some((url) => url.includes("/employee/employment")), false);
    assert.deepEqual(
      employees.map((employee) => employee.id),
      [1, 2, 5, 6],
    );
    assert.deepEqual(
      jobs.map((job) => job.employeeId),
      [1, 2, 5, 6],
    );
    assert.equal(jobs.find((job) => job.employeeId === 5)?.noEmploymentRelationship, true);
    assert.equal(jobs.find((job) => job.employeeId === 1)?.startDate, "2019-04-01");
    const current = selectCurrentEmployees(employees, jobs, "2026-10-24", "2026-10-25");
    assert.deepEqual(current.map((employee) => employee.id), [1]);
  });

  it("endrer ingen ressurser når ansettelseslisten er tom", async () => {
    let appliedEmployees = false;
    const report = await runSyncPipeline({
      today: "2026-10-24",
      employees: async () => [{ id: 10, firstName: "Kari", lastName: "Haugen", isContact: false }],
      employments: async () => [],
      projects: async () => [],
      entries: async () => [],
      weeks: async () => [],
      loadResources: async () => [
        { id: "kari", name: "Kari Haugen", tripletexEmployeeId: 10, active: true, hasHistory: false },
      ],
      loadProjects: async () => [],
      applyEmployees: async () => {
        appliedEmployees = true;
        return { linked: 0, created: 0, deactivated: 0, removed: 36, reactivated: 0 };
      },
      applyProjects: async () => ({ created: 0, updated: 0, archived: 0 }),
      loadLinks: async () => ({
        links: {
          employeeToResource: new Map(),
          projectIdToProject: new Map(),
          projectNumberToProject: new Map(),
        },
        ignoredProjectIds: [],
      }),
      writeEntry: async () => "unchanged",
      saveState: async () => {},
    });
    assert.equal(appliedEmployees, false);
    assert.equal(report.employeesRemoved, 0);
    assert.equal(report.employeesLinked, 0);
    assert.equal(report.ok, false);
    assert.match(report.message, /Ingen ressurser ble endret/);
  });

  it("kobler eksisterende timer på nytt og arkiverer interne uten tildeling", async () => {
    const entry = (raw: unknown) => {
      const parsed = normalizeEntry(raw);
      assert.ok(parsed);
      return parsed;
    };
    const report = await runSyncPipeline({
      today: "2026-10-24",
      employees: async () => [{ id: 10, firstName: "Kari", lastName: "Haugen", isContact: false }],
      employments: async () => [
        { employeeId: 10, startDate: "2019-04-01", endDate: null, noEmploymentRelationship: false },
      ],
      projects: async () => [
        remoteProject({ id: 200, number: "1042", name: "Tilbygg" }),
        remoteProject({ id: 8, name: "Internt lager", internal: true }),
        remoteProject({ id: 9, name: "Internt med folk", internal: true }),
      ],
      entries: async () => [
        entry(tripletexFixture.entries[0]),
        entry({
          id: 502,
          date: "2026-10-21",
          hours: 4,
          comment: "Lukket prosjekt",
          employee: { id: 10, firstName: "Kari", lastName: "Haugen" },
          project: { id: 300, number: "3000", name: "Ikke importert" },
          activity: { name: "Timer fastpris" },
        }),
        entry({
          id: 503,
          date: "2026-10-22",
          hours: 2,
          comment: "Ignorert",
          employee: { id: 10, firstName: "Kari", lastName: "Haugen" },
          project: { id: 400, number: "4000", name: "Slettet" },
          activity: { name: "Timer fastpris" },
        }),
      ],
      weeks: async () => [],
      loadResources: async () => [{ id: "kari", name: "Kari Haugen", tripletexEmployeeId: null, active: true }],
      loadProjects: async () => [
        localProject({ id: "intern", name: "Internt lager", tripletexProjectId: 8, status: "pågår" }),
        localProject({
          id: "med-folk",
          name: "Internt med folk",
          tripletexProjectId: 9,
          status: "pågår",
          hasAllocations: true,
        }),
      ],
      applyEmployees: async (changes) => {
        assert.deepEqual(
          changes.find((change) => change.tripletexEmployeeId === 10),
          { kind: "link", resourceId: "kari", tripletexEmployeeId: 10 },
        );
        assert.equal(changes.some((change) => change.kind === "create"), false);
        return { linked: 1, created: 0, deactivated: 0, removed: 0, reactivated: 0 };
      },
      applyProjects: async (changes) => {
        const intern = changes.find((change) => change.kind === "update" && change.localId === "intern");
        assert.ok(intern && intern.kind === "update");
        assert.equal(intern.archived, true);
        assert.equal(changes.some((change) => change.kind === "keep" && change.tripletexProjectId === 9), true);
        assert.equal(changes.some((change) => change.kind === "update" && change.localId === "med-folk"), false);
        assert.equal(changes.filter((change) => change.kind === "create").length, 1);
        return { created: 1, updated: 1, archived: 1 };
      },
      loadLinks: async () => ({
        links: {
          employeeToResource: new Map([[10, "kari"]]),
          projectIdToProject: new Map([
            [200, "tilbygg"],
            [8, "intern"],
            [9, "med-folk"],
          ]),
          projectNumberToProject: new Map(),
        },
        ignoredProjectIds: [400],
      }),
      writeEntry: async (row) => {
        if (row.externalId === "tt:501") {
          assert.equal(row.resourceId, "kari");
          assert.equal(row.projectId, "tilbygg");
          assert.equal(row.unmappedReason, "");
          return "updated";
        }
        if (row.externalId === "tt:502") {
          assert.equal(row.resourceId, "kari");
          assert.equal(row.projectId, null);
          assert.match(row.unmappedReason, /Prosjekt/);
          return "updated";
        }
        assert.equal(row.externalId === "tt:503", false);
        return "inserted";
      },
      saveState: async () => {},
    });
    assert.equal(report.employeesLinked, 1);
    assert.equal(report.employeesCreated, 0);
    assert.equal(report.updated, 2);
    assert.equal(report.inserted, 0);
    assert.equal(report.entriesSkipped, 1);
    assert.equal(report.entriesWithoutProject, 1);
    assert.equal(report.projectsArchived, 1);
    assert.equal(report.projectsKeptInternal, 1);
    assert.equal(report.projectsCreated, 1);
    assert.match(report.message, /uten importert prosjekt/);
    assert.match(report.message, /hoppet over fordi prosjektet er ignorert/);
    assert.match(report.message, /interne prosjekter beholdt/);
  });
});
