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

function sentModel(fetchMock: ReturnType<typeof vi.fn>): string {
  const init = fetchMock.mock.calls[0]?.[1] as { body?: string } | undefined;
  return JSON.parse(init?.body ?? "{}").model;
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

  it("kaller claude-sonnet-5-5 og viser norsk feil ved 404, avvist nøkkel og nettverksfeil", async () => {
    process.env.ANTHROPIC_API_KEY = "test-nokkel";
    delete process.env.ANTHROPIC_MODEL;
    expect(DEFAULT_ANTHROPIC_MODEL).toBe("claude-sonnet-5-5");

    const notFound = vi.fn(async () =>
      new Response(JSON.stringify({ error: { type: "not_found_error", message: "model: claude-sonnet-5-5" } }), { status: 404 }),
    );
    vi.stubGlobal("fetch", notFound);
    await expect(completeDraft(request)).rejects.toThrow("AI-utkast feilet: modellen claude-sonnet-5-5 finnes ikke. model: claude-sonnet-5-5");
    expect(sentModel(notFound)).toBe("claude-sonnet-5-5");
    try {
      await completeDraft(request);
    } catch (error) {
      const response = jsonError(error);
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "AI-utkast feilet: modellen claude-sonnet-5-5 finnes ikke. model: claude-sonnet-5-5",
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
});
