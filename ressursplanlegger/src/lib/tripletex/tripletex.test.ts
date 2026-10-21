import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { basicAuthHeader, createTripletexApi, sessionRequest } from "./client";
import { readTripletexConfig } from "./config";
import { tripletexFixture } from "./fixture";
import { bestEmployeeMatch, bestProjectMatch } from "./match";
import { normalizeEntry, staffEmployees } from "./parse";
import { classifyEntries, mergeByExternalId, syncWindow } from "./sync";
import type { TripletexEntry } from "./types";

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
