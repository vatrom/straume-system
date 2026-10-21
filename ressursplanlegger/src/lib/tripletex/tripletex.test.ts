import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { basicAuthHeader, createTripletexApi, sessionRequest } from "./client";
import { readTripletexConfig } from "./config";
import { tripletexFixture } from "./fixture";
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
import { normalizeEntry, normalizeProject, staffEmployees } from "./parse";
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
    assert.match(projectCall?.url ?? "", /startDate/);
    assert.match(projectCall?.url ?? "", /isClosed/);
    assert.match(projectCall?.url ?? "", /customer/);
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
    assert.equal(classified[1]?.projectId, null);
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

  it("godtar SYNC_SECRET og den eldre synk-hemmeligheten", () => {
    assert.equal(bearerAuthorized("Bearer natt", { SYNC_SECRET: "natt" }), true);
    assert.equal(bearerAuthorized("Bearer gammel", { TRIPLETEX_SYNC_SECRET: "gammel" }), true);
    assert.equal(bearerAuthorized("Bearer gammel", { SYNC_SECRET: "natt", TRIPLETEX_SYNC_SECRET: "gammel" }), true);
    assert.equal(bearerAuthorized("Bearer feil", { SYNC_SECRET: "natt" }), false);
    assert.equal(bearerAuthorized("Bearer ", {}), false);
  });
});
