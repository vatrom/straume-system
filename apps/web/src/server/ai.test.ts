import { DEFAULT_COMMERCIAL, type DraftRequest } from "@straume/domain";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ANTHROPIC_MODEL, completeDraft } from "./ai";
import { jsonError } from "./http";

const request: DraftRequest = {
  mode: "quote",
  rooms: [],
  answers: [],
  notes: [],
  media: [],
  catalog: [],
  templates: [],
  rates: [],
  commercial: DEFAULT_COMMERCIAL,
  channel: "none",
};

const previousKey = process.env.ANTHROPIC_API_KEY;
const previousModel = process.env.ANTHROPIC_MODEL;

afterEach(() => {
  vi.unstubAllGlobals();
  if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = previousKey;
  if (previousModel === undefined) delete process.env.ANTHROPIC_MODEL;
  else process.env.ANTHROPIC_MODEL = previousModel;
});

function sentBody(fetchMock: ReturnType<typeof vi.fn>, index = 0): { model?: string; system?: string; tool_choice?: { type?: string; name?: string } } {
  const init = fetchMock.mock.calls[index]?.[1] as { body?: string } | undefined;
  return JSON.parse(init?.body ?? "{}");
}

const toolError = JSON.stringify({
  error: { type: "invalid_request_error", message: 'tool_choice: type "tool" and "any" are not supported for this model' },
});

function draftResponse() {
  return new Response(
    JSON.stringify({
      content: [
        {
          type: "tool_use",
          name: "lag_tilbudsutkast",
          input: {
            lines: [{ code: "TOM-001", quantity: 1, rationale: "Målt", uncertain: false, uncertaintyNote: null, optional: false }],
            customerText: "Tekst",
            reservations: "",
            emailSubject: "Emne",
            emailBody: "Brød",
            flags: [],
          },
        },
      ],
      usage: { input_tokens: 10, output_tokens: 4 },
    }),
    { status: 200 },
  );
}

describe("Claude-utkast", () => {
  it("bruker mock bare når nøkkel mangler", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await completeDraft(request);
    expect(result.provider).toBe("mock");
    expect(result.model).toBe("mock");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("kaller claude-sonnet-5 og viser norsk feil ved 404, avvist nøkkel og nettverksfeil", async () => {
    process.env.ANTHROPIC_API_KEY = "test-nokkel";
    delete process.env.ANTHROPIC_MODEL;
    expect(DEFAULT_ANTHROPIC_MODEL).toBe("claude-sonnet-5");

    const notFound = vi.fn(async () =>
      new Response(JSON.stringify({ error: { type: "not_found_error", message: "model: claude-sonnet-5" } }), { status: 404 }),
    );
    vi.stubGlobal("fetch", notFound);
    await expect(completeDraft(request)).rejects.toThrow("AI-utkast feilet: modellen claude-sonnet-5 finnes ikke. model: claude-sonnet-5");
    expect(sentBody(notFound).model).toBe("claude-sonnet-5");
    expect(sentBody(notFound).tool_choice).toEqual({ type: "tool", name: "lag_tilbudsutkast" });
    expect(notFound).toHaveBeenCalledTimes(1);
    try {
      await completeDraft(request);
    } catch (error) {
      const response = jsonError(error);
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "AI-utkast feilet: modellen claude-sonnet-5 finnes ikke. model: claude-sonnet-5",
      });
    }

    const denied = vi.fn(async () => new Response("{}", { status: 401 }));
    vi.stubGlobal("fetch", denied);
    await expect(completeDraft(request)).rejects.toThrow("AI-utkast feilet: Claude avviste nøkkelen");

    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("fetch failed");
    }));
    await expect(completeDraft(request)).rejects.toThrow("AI-utkast feilet: fikk ikke kontakt med Claude");
  });

  it("prøver tool_choice auto én gang når modellen avviser tvunget verktøy", async () => {
    process.env.ANTHROPIC_API_KEY = "test-nokkel";
    delete process.env.ANTHROPIC_MODEL;
    const fetchMock = vi.fn(async () => new Response(toolError, { status: 400 }));
    fetchMock.mockImplementationOnce(async () => new Response(toolError, { status: 400 })).mockImplementationOnce(async () => draftResponse());
    vi.stubGlobal("fetch", fetchMock);

    const result = await completeDraft(request);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentBody(fetchMock, 0).tool_choice).toEqual({ type: "tool", name: "lag_tilbudsutkast" });
    expect(sentBody(fetchMock, 1).tool_choice).toEqual({ type: "auto" });
    expect(sentBody(fetchMock, 1).system).toContain("MUST call the tool lag_tilbudsutkast");
    expect(result.provider).toBe("anthropic");
    expect(result.model).toBe("claude-sonnet-5");
    expect(result.draft.lines[0]?.code).toBe("TOM-001");
  });

  it("bruker samme reserve for endringsordre og feiler når auto ikke kaller verktøyet", async () => {
    process.env.ANTHROPIC_API_KEY = "test-nokkel";
    delete process.env.ANTHROPIC_MODEL;
    const change = { ...request, mode: "change" as const, changeDescription: "Flytte servant" };
    const empty = new Response(JSON.stringify({ content: [{ type: "text", text: "Her er et utkast" }], usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200 });
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => new Response(toolError, { status: 400 }))
      .mockImplementationOnce(async () => empty);
    vi.stubGlobal("fetch", fetchMock);

    await expect(completeDraft(change)).rejects.toThrow("AI-utkast feilet: Claude kalte ikke verktøyet lag_tilbudsutkast");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentBody(fetchMock, 1).tool_choice).toEqual({ type: "auto" });
    expect(sentBody(fetchMock, 1).system).toContain("MUST call the tool lag_tilbudsutkast");

    const other = vi.fn(async () => new Response(JSON.stringify({ error: { message: "max_tokens is too large" } }), { status: 400 }));
    vi.stubGlobal("fetch", other);
    await expect(completeDraft(change)).rejects.toThrow("AI-utkast feilet: Claude svarte 400. max_tokens is too large");
    expect(other).toHaveBeenCalledTimes(1);
  });
});
