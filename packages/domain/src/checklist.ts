import type { ChannelCode } from "./calc";
import { evalQuantity, quantityContext, type QuantityContext } from "./quantities";
import { TRADE_CODES, type TradeCode } from "./trades";

export const QUESTION_TYPES = ["yes_no", "number", "measurement", "choice", "text", "text_short", "multi", "date", "media"] as const;
export type ChecklistQuestionType = (typeof QUESTION_TYPES)[number];

export type ChecklistMapping = {
  /** Tomt gjelder hele svaret. Satt gjelder ett valg. */
  when?: string | null;
  code: string;
  /** svar, 1 eller et mengdeuttrykk (gulvareal, omkrets, flisareal, …). */
  formula: string;
};

export type ShowWhen = {
  itemKey: string;
  anyOf: string[];
};

export type ItemRole = "info" | "measure" | "price" | "channel" | "lump" | "photo" | "gate";

export type ItemConfig = {
  showWhen?: ShowWhen | null;
  prefill?: "gulvareal" | "takhoyde" | "omkrets" | null;
  role?: ItemRole;
  /** Flervalg som bestemmer hvilke fagseksjoner som vises. */
  controlsSections?: boolean;
  tradeByChoice?: Record<string, string>;
  channelByChoice?: Record<string, ChannelCode>;
  /** Svar som ikke skal gi post, f.eks. Tilkomst = OK. */
  ignoreValues?: string[];
  /** Valg som bare åpner et målfelt. Mengden prises der, ikke på avkrysningen. */
  gateChoices?: string[];
  mappings?: ChecklistMapping[];
};

export type ChecklistItemSpec = {
  key: string;
  prompt: string;
  questionType: ChecklistQuestionType;
  choices?: string[];
  unit?: string | null;
  helpText?: string | null;
  required?: boolean;
  config?: ItemConfig;
};

export type ChecklistSectionSpec = {
  tradeCode: TradeCode;
  name: string;
  items: ChecklistItemSpec[];
};

export type ChecklistAnswerInput = {
  key?: string | null;
  prompt: string;
  tradeCode: string;
  questionType?: string | null;
  value: unknown;
  freeText?: string | null;
  unit?: string | null;
  priceItemCode?: string | null;
  config?: ItemConfig | null;
};

export type MappedLine = {
  code: string;
  quantity: number;
  rationale: string;
  uncertain: boolean;
  uncertaintyNote: string | null;
  optional: boolean;
};

export type ManualItem = { prompt: string; detail: string };

export type ChecklistEval = {
  lines: MappedLine[];
  manualItems: ManualItem[];
  flags: string[];
  channel: ChannelCode | null;
  extraProfitNok: number | null;
  /** Fag som er valgt. Null betyr at fagvalget ikke er brukt, og alle fag gjelder. */
  selectedTrades: Set<string> | null;
};

const WORK_TRADES = new Set<string>(TRADE_CODES.filter((code) => code !== "annet"));

export function asItemConfig(value: unknown): ItemConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as ItemConfig;
}

export function answerLabels(value: unknown): string[] {
  if (value === true) return ["ja"];
  if (value === false) return ["nei"];
  if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter(Boolean);
  if (typeof value === "number" && Number.isFinite(value)) return [String(value)];
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

export function answerNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value.replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

export function fieldVisible(item: { key?: string | null; config?: ItemConfig | null }, values: Map<string, unknown>): boolean {
  const when = item.config?.showWhen;
  if (!when?.itemKey || when.anyOf.length === 0) return true;
  const labels = answerLabels(values.get(when.itemKey));
  return when.anyOf.some((choice) => labels.includes(choice));
}

export function selectedTrades(answers: ChecklistAnswerInput[]): Set<string> | null {
  const gate = answers.find((answer) => answer.config?.controlsSections);
  if (!gate) return null;
  const labels = answerLabels(gate.value);
  if (labels.length === 0) return null;
  const selected = new Set<string>();
  for (const label of labels) {
    const code = gate.config?.tradeByChoice?.[label];
    if (code) selected.add(code);
  }
  return selected;
}

export function sectionVisible(tradeCode: string, selected: Set<string> | null): boolean {
  if (!selected) return true;
  if (!WORK_TRADES.has(tradeCode)) return true;
  return selected.has(tradeCode);
}

type CatalogHit = { code: string; active?: boolean; type?: string; tradeCode?: string; quantityFormula?: string | null };

export function evaluateChecklist(input: {
  answers: ChecklistAnswerInput[];
  catalog: CatalogHit[];
  room?: QuantityContext | null;
}): ChecklistEval {
  const values = new Map<string, unknown>();
  for (const answer of input.answers) {
    if (answer.key) values.set(answer.key, answer.value);
  }
  const selected = selectedTrades(input.answers);
  const room = measuresFrom(input.answers, input.room ?? null);
  const flags: string[] = [];
  const manual: ManualItem[] = [];
  const bucket = new Map<string, MappedLine>();
  let channel: ChannelCode | null = null;
  let extraProfitNok: number | null = null;
  const catalog = new Map(input.catalog.map((item) => [item.code, item]));

  const skipped = (answer: ChecklistAnswerInput) => {
    if (answer.key && !fieldVisible(answer, values)) return true;
    if (selected && WORK_TRADES.has(answer.tradeCode) && !selected.has(answer.tradeCode)) return true;
    return false;
  };

  const manualFlag = (prompt: string, detail: string) => {
    manual.push({ prompt, detail });
    flags.push(`Må prises manuelt: ${prompt}`);
  };

  const add = (line: MappedLine) => {
    const current = bucket.get(line.code);
    if (!current) {
      bucket.set(line.code, { ...line });
      return;
    }
    current.quantity = roundQty(current.quantity + line.quantity);
    current.rationale = `${current.rationale} ${line.rationale}`.trim();
    current.uncertain = current.uncertain || line.uncertain;
    current.optional = current.optional && line.optional;
    if (line.uncertaintyNote) current.uncertaintyNote = current.uncertaintyNote ? `${current.uncertaintyNote} ${line.uncertaintyNote}` : line.uncertaintyNote;
  };

  const place = (answer: ChecklistAnswerInput, mapping: ChecklistMapping, svar: number, because: string) => {
    const hit = catalog.get(mapping.code);
    if (!hit || hit.active === false || hit.type === "freetext" || hit.type === "percent_addon") {
      manualFlag(because, hit ? `Varekode ${mapping.code} kan ikke brukes i kalkylen.` : `Varekode ${mapping.code} finnes ikke i prisdatabasen.`);
      return;
    }
    const quantity = mappingQuantity(mapping.formula, svar, room);
    if (quantity == null || !(quantity > 0)) {
      manualFlag(because, `Formelen «${mapping.formula}» ga ingen mengde.`);
      return;
    }
    const uncertain = hit.type === "hours" && mapping.formula === "1";
    add({
      code: mapping.code,
      quantity,
      rationale: `Fra sjekkliste: ${because}.`,
      uncertain,
      uncertaintyNote: uncertain ? "Timeantall er ikke målt." : null,
      optional: false,
    });
  };

  for (const answer of input.answers) {
    if (skipped(answer)) continue;
    const role = answer.config?.role ?? (answer.priceItemCode ? "price" : "info");
    const labels = answerLabels(answer.value);
    const ignore = new Set(answer.config?.ignoreValues ?? []);
    if (role === "channel") {
      const label = labels[0];
      channel = (label && answer.config?.channelByChoice?.[label]) || "none";
      continue;
    }
    if (role === "lump") {
      const amount = answerNumber(answer.value);
      extraProfitNok = amount != null && amount > 0 ? amount : 0;
      continue;
    }
    if (role !== "price") continue;
    const chosen = labels.filter((label) => !ignore.has(label));
    if (chosen.length === 0) continue;
    const mappings = answer.config?.mappings?.length
      ? answer.config.mappings
      : answer.priceItemCode
        ? [{ code: answer.priceItemCode, formula: answerNumber(answer.value) != null && answer.value !== true ? "svar" : "1" }]
        : [];
    const gates = new Set(answer.config?.gateChoices ?? []);
    if (answer.questionType === "multi" || answer.questionType === "choice") {
      for (const label of chosen) {
        if (gates.has(label)) continue;
        const hits = mappings.filter((mapping) => !mapping.when || mapping.when === label);
        if (hits.length === 0) {
          manualFlag(`${answer.prompt}: ${label}`, "Ingen varekode er koblet til valget.");
          continue;
        }
        for (const mapping of hits) place(answer, mapping, 1, `${answer.prompt}: ${label}`);
      }
      continue;
    }
    if (answer.questionType === "text" || answer.questionType === "text_short" || answer.questionType === "date") {
      if (!textValue(answer).trim()) continue;
      if (mappings.length === 0) manualFlag(answer.prompt, "Feltet har ingen varekode.");
      else for (const mapping of mappings) place(answer, mapping, 1, answer.prompt);
      continue;
    }
    const svar = answerNumber(answer.value) ?? (labels.includes("ja") ? 1 : 0);
    if (!(svar > 0)) continue;
    if (mappings.length === 0) {
      manualFlag(answer.prompt, "Feltet har ingen varekode.");
      continue;
    }
    for (const mapping of mappings) place(answer, mapping, svar, answer.prompt);
  }

  for (const answer of input.answers) {
    if (skipped(answer)) continue;
    const text = [textValue(answer), answer.freeText ?? ""].map((part) => part.trim()).filter(Boolean).join("\n");
    if (!text) continue;
    for (const hint of freeTextHints(text)) {
      if (hint.code) {
        const hit = catalog.get(hint.code);
        if (!hit || hit.active === false || hit.type === "freetext" || hit.type === "percent_addon") {
          manualFlag(hint.prompt, `Fritekst: ${clip(text)}`);
          continue;
        }
        add({
          code: hint.code,
          quantity: hint.quantity,
          rationale: `Fritekst tolket: ${clip(text)}`,
          uncertain: true,
          uncertaintyNote: "Mengden er lest ut av fritekst og bør kontrolleres.",
          optional: true,
        });
        flags.push(`Fritekst foreslår ${hint.code}: ${hint.prompt}.`);
      } else {
        manualFlag(hint.prompt, `Fritekst: ${clip(text)}`);
      }
    }
  }

  return { lines: [...bucket.values()], manualItems: manual, flags: [...new Set(flags)], channel, extraProfitNok, selectedTrades: selected };
}

export function missingPriceLinks(sections: ChecklistSectionSpec[]): { section: string; prompt: string; choice: string | null }[] {
  const gaps: { section: string; prompt: string; choice: string | null }[] = [];
  for (const section of sections) {
    for (const item of section.items) {
      if ((item.config?.role ?? "info") !== "price") continue;
      const mappings = item.config?.mappings ?? [];
      const ignore = new Set([...(item.config?.ignoreValues ?? []), ...(item.config?.gateChoices ?? [])]);
      if (item.questionType === "choice" || item.questionType === "multi") {
        for (const choice of item.choices ?? []) {
          if (ignore.has(choice)) continue;
          const linked = mappings.some((mapping) => !mapping.when || mapping.when === choice);
          if (!linked) gaps.push({ section: section.name, prompt: item.prompt, choice });
        }
        continue;
      }
      if (mappings.length === 0) gaps.push({ section: section.name, prompt: item.prompt, choice: null });
    }
  }
  return gaps;
}

function measuresFrom(answers: ChecklistAnswerInput[], room: QuantityContext | null): QuantityContext | null {
  const read = (key: string) => answerNumber(answers.find((answer) => answer.key === key)?.value);
  const gulv = read("maal.gulv");
  const hoyde = read("maal.hoyde");
  const omkrets = read("maal.omkrets");
  if (gulv == null && hoyde == null && omkrets == null) return room;
  return quantityContext({
    perimeterM: omkrets ?? room?.omkrets ?? 0,
    ceilingHeightM: hoyde ?? room?.takhoyde ?? 0,
    floorAreaM: gulv ?? room?.gulvareal ?? 0,
  });
}

function mappingQuantity(formula: string, svar: number, room: QuantityContext | null): number | null {
  const trimmed = formula.trim();
  if (trimmed === "1") return 1;
  if (trimmed === "svar") return svar > 0 ? svar : null;
  if (!room) return null;
  const rewritten = trimmed.replace(/\bsvar\b/g, String(svar));
  const quantity = evalQuantity(rewritten, room);
  return quantity != null && quantity > 0 ? roundQty(quantity) : null;
}

function textValue(answer: ChecklistAnswerInput): string {
  if (answer.questionType !== "text" && answer.questionType !== "text_short" && answer.questionType !== "date") return "";
  return typeof answer.value === "string" ? answer.value : "";
}

function clip(text: string): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > 140 ? `${one.slice(0, 137)}…` : one;
}

function roundQty(value: number): number {
  return Math.round(value * 1000) / 1000;
}

type Hint = { prompt: string; code?: string; quantity: number };

function freeTextHints(text: string): Hint[] {
  const hints: Hint[] = [];
  if (/plejd/i.test(text)) hints.push({ prompt: "Plejd på brytere, dimmere og termostat", quantity: 1 });
  if (/epoxy/i.test(text)) hints.push({ prompt: "Epoxyfuger", quantity: 1 });
  if (/innbyggingsbatteri/i.test(text)) hints.push({ prompt: "Innbyggingsbatterier", quantity: 1 });
  if (/laminat/i.test(text)) hints.push({ prompt: "Laminat utenfor våtrom", quantity: 1 });
  if (/(2|to)\s*lag/i.test(text) && /påstøp|pastop/i.test(text)) hints.push({ prompt: "Ekstra lag påstøp", quantity: 1 });
  const area = text.match(/(\d+(?:[.,]\d+)?)\s*m\s*(?:2|²)/i);
  if (area && /spark|maling|male/i.test(text)) {
    hints.push({ prompt: "Ekstra sparkling og maling fra fritekst", code: "MAL-005", quantity: Number(area[1]!.replace(",", ".")) });
  }
  return hints;
}
