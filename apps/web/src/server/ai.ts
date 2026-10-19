import {
  draftPrompt,
  mockDraft,
  type AiDraftShape,
  type DraftRequest,
} from "@straume/domain";

const inputRate = () => Number(process.env.ANTHROPIC_INPUT_USD_PER_MTOK ?? 3);
const outputRate = () => Number(process.env.ANTHROPIC_OUTPUT_USD_PER_MTOK ?? 15);

export type DraftCompletion = {
  draft: AiDraftShape;
  provider: string;
  model: string;
  prompt: string;
  response: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

const TOOL = {
  name: "lag_tilbudsutkast",
  description: "Velg varekoder og mengder og skriv kundetekst. Ikke sett pris.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["lines", "customerText", "reservations", "emailSubject", "emailBody", "flags"],
    properties: {
      lines: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["code", "quantity", "rationale", "uncertain", "uncertaintyNote", "optional"],
          properties: {
            code: { type: "string" },
            quantity: { type: "number" },
            rationale: { type: "string" },
            uncertain: { type: "boolean" },
            uncertaintyNote: { type: ["string", "null"] },
            optional: { type: "boolean" },
          },
        },
      },
      customerText: { type: "string" },
      reservations: { type: "string" },
      emailSubject: { type: "string" },
      emailBody: { type: "string" },
      flags: { type: "array", items: { type: "string" } },
      suggestions: { type: "string" },
      selectedBlockKeys: { type: "array", items: { type: "string" } },
    },
  },
};

function asDraft(value: unknown): AiDraftShape {
  const draft = value as AiDraftShape;
  if (!draft || !Array.isArray(draft.lines)) throw new Error("Modellen returnerte ikke et utkast");
  return draft;
}

export async function completeDraft(request: DraftRequest): Promise<DraftCompletion> {
  const prompt = draftPrompt(request);
  const packed = `${prompt.system}\n\n${prompt.user}`;
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) {
    const draft = mockDraft(request);
    return {
      draft,
      provider: "mock",
      model: "mock",
      prompt: packed,
      response: JSON.stringify(draft),
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    };
  }
  const model = process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-5";
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4000,
      system: prompt.system,
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [{ role: "user", content: prompt.user }],
    }),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`Claude svarte ${response.status}`);
  const body = JSON.parse(raw) as {
    content?: { type: string; input?: unknown }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const tool = body.content?.find((block) => block.type === "tool_use");
  const inputTokens = body.usage?.input_tokens ?? 0;
  const outputTokens = body.usage?.output_tokens ?? 0;
  return {
    draft: asDraft(tool?.input),
    provider: "anthropic",
    model,
    prompt: packed,
    response: raw,
    inputTokens,
    outputTokens,
    costUsd: (inputTokens * inputRate() + outputTokens * outputRate()) / 1_000_000,
  };
}
