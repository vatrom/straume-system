import {
  DomainError,
  draftPrompt,
  mockDraft,
  type AiDraftShape,
  type DraftRequest,
} from "@straume/domain";

/** Produksjon bruker claude-sonnet-5. claude-sonnet-4-5 svarer 404. claude-sonnet-5-5 avviser tvunget tool_choice. */
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";

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
  if (!draft || !Array.isArray(draft.lines)) throw aiFailure("Claude returnerte ikke et utkast");
  return draft;
}

function aiFailure(detail: string): DomainError {
  const text = detail.replace(/\s+/g, " ").trim().slice(0, 240);
  return new DomainError(`AI-utkast feilet: ${text}`);
}

function claudeErrorDetail(status: number, raw: string, model: string): string {
  let message = "";
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } };
    message = parsed.error?.message?.trim() ?? "";
  } catch {
    message = "";
  }
  if (status === 404) return message ? `modellen ${model} finnes ikke. ${message}` : `modellen ${model} finnes ikke`;
  if (status === 401 || status === 403) return message ? `Claude avviste nøkkelen. ${message}` : "Claude avviste nøkkelen";
  return message ? `Claude svarte ${status}. ${message}` : `Claude svarte ${status}`;
}

function toolChoiceUnsupported(status: number, raw: string): boolean {
  if (status !== 400) return false;
  const text = raw.toLowerCase();
  return text.includes("tool_choice") && (text.includes("not supported") || text.includes("unsupported"));
}

type ClaudeBody = {
  content?: { type: string; input?: unknown }[];
  usage?: { input_tokens?: number; output_tokens?: number };
};

async function callClaude(
  key: string,
  model: string,
  prompt: { system: string; user: string },
  toolChoice: { type: "tool"; name: string } | { type: "auto" },
): Promise<Response> {
  const system =
    toolChoice.type === "auto"
      ? `${prompt.system} You MUST call the tool ${TOOL.name}. Ikke svar med vanlig tekst.`
      : prompt.system;
  return fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4000,
      system,
      tools: [TOOL],
      tool_choice: toolChoice,
      messages: [{ role: "user", content: prompt.user }],
    }),
  });
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
  const model = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL;
  let response: Response;
  try {
    response = await callClaude(key, model, prompt, { type: "tool", name: TOOL.name });
  } catch {
    throw aiFailure("fikk ikke kontakt med Claude");
  }
  let raw = await response.text();
  if (toolChoiceUnsupported(response.status, raw)) {
    try {
      response = await callClaude(key, model, prompt, { type: "auto" });
    } catch {
      throw aiFailure("fikk ikke kontakt med Claude");
    }
    raw = await response.text();
  }
  if (!response.ok) throw aiFailure(claudeErrorDetail(response.status, raw, model));
  let body: ClaudeBody;
  try {
    body = JSON.parse(raw) as ClaudeBody;
  } catch {
    throw aiFailure("Claude svarte med ugyldig data");
  }
  const tool = body.content?.find((block) => block.type === "tool_use");
  if (!tool) throw aiFailure(`Claude kalte ikke verktøyet ${TOOL.name}`);
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
