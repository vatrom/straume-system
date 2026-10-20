import type { CalcLine, ChannelCode, CommercialSettings } from "./calc";
import { calculateQuote, priceLineToCalc } from "./calc";
import { evaluateChecklist, type ItemConfig } from "./checklist";
import { mergeTemplate, type MergeContext } from "./merge";
import type { PriceLineInput, RateInput } from "./pricing";
import { evalQuantity, type QuantityContext } from "./quantities";
import { composeQuoteDocument, isStandardDocument, type QuoteTextBlock } from "./quote-document";
import { TRADES, tradeName } from "./trades";

export type DraftAnswer = {
  prompt: string;
  tradeCode: string;
  value: unknown;
  freeText: string | null;
  priceItemCode: string | null;
  internalNote: string | null;
  key?: string | null;
  questionType?: string | null;
  unit?: string | null;
  config?: ItemConfig | null;
};

export type DraftNote = { body: string; internal: boolean; roomName?: string | null };
export type DraftMedia = { id: string; kind: string; fileName: string | null; internal: boolean; roomName?: string | null };

export type DraftRoom = QuantityContext & { name: string };

export type DraftTemplate = { key: string; name: string; kind: string; tradeCode: string | null; body: string; sortOrder?: number };

export type DraftRequest = {
  mode: "quote" | "change";
  changeDescription?: string | null;
  rooms: DraftRoom[];
  answers: DraftAnswer[];
  notes: DraftNote[];
  media: DraftMedia[];
  catalog: PriceLineInput[];
  templates: DraftTemplate[];
  rates: RateInput[];
  commercial: CommercialSettings;
  channel: ChannelCode;
  validDays?: number;
  /** Publiserte tekstblokker. Når de er med, er standardteksten låst og settes sammen i koden. */
  textBlocks?: QuoteTextBlock[];
  paymentStartPercent?: number;
  paymentFinishPercent?: number;
  paymentDueDays?: number;
  startDate?: string | null;
  endDate?: string | null;
};

export type AiLineChoice = {
  code: string;
  quantity: number;
  rationale: string;
  uncertain: boolean;
  uncertaintyNote: string | null;
  optional: boolean;
};

export type AiDraftShape = {
  lines: AiLineChoice[];
  customerText: string;
  reservations: string;
  emailSubject: string;
  emailBody: string;
  flags: string[];
  channel?: ChannelCode | null;
  extraProfitNok?: number | null;
  manualItems?: { prompt: string; detail: string }[];
  /** Ekstra setninger for fritekst. Blir ikke en del av standardteksten. */
  suggestions?: string;
  /** Blokker modellen vil ta med i tillegg til dem som følger av sjekkliste og varekoder. */
  selectedBlockKeys?: string[];
};

const SECRET_MIN = 12;

export function internalSnippets(request: Pick<DraftRequest, "answers" | "notes">): string[] {
  const raw = [
    ...request.notes.filter((note) => note.internal).map((note) => note.body),
    ...request.answers.map((answer) => answer.internalNote ?? ""),
  ];
  const snippets: string[] = [];
  for (const text of raw) {
    const trimmed = text.trim();
    if (trimmed.length < SECRET_MIN) continue;
    snippets.push(trimmed);
    const unmarked = trimmed.replace(/^intern:\s*/i, "").trim();
    if (unmarked.length >= SECRET_MIN && unmarked !== trimmed) snippets.push(unmarked);
  }
  return [...new Set(snippets)].sort((a, b) => b.length - a.length);
}

export function sanitizeCustomerText(text: string, secrets: string[]): { text: string; removed: string[] } {
  let next = text;
  const removed: string[] = [];
  for (const secret of secrets) {
    if (secret.length < SECRET_MIN) continue;
    if (!next.toLowerCase().includes(secret.toLowerCase())) continue;
    const pattern = new RegExp(escapeRegExp(secret), "ig");
    next = next.replace(pattern, "");
    removed.push(secret);
  }
  return { text: next.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim(), removed };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function positive(value: unknown): { ok: boolean; quantity: number | null } {
  if (value === true) return { ok: true, quantity: null };
  if (value === false || value == null || value === "") return { ok: false, quantity: null };
  if (typeof value === "number") return value > 0 ? { ok: true, quantity: value } : { ok: false, quantity: null };
  const text = String(value).trim();
  if (!text || /^nei$/i.test(text) || /^ingen/i.test(text)) return { ok: false, quantity: null };
  const numeric = Number(text.replace(",", "."));
  if (Number.isFinite(numeric) && text.match(/^-?\d/)) return numeric > 0 ? { ok: true, quantity: numeric } : { ok: false, quantity: null };
  return { ok: true, quantity: null };
}

function primaryRoom(request: DraftRequest): DraftRoom | null {
  return request.rooms[0] ?? null;
}

function formulaQuantity(line: PriceLineInput, room: DraftRoom | null): number | null {
  if (!line.quantityFormula || !room) return null;
  return evalQuantity(line.quantityFormula, room);
}

/** Deterministisk utkast når Anthropic-nøkkel mangler. Pris settes aldri her. */
export function mockDraft(request: DraftRequest): AiDraftShape {
  const flags: string[] = [];
  let draftChannel: ChannelCode | null = null;
  let draftExtra: number | null = null;
  let draftManual: { prompt: string; detail: string }[] = [];
  const room = primaryRoom(request);
  if (!room) flags.push("Mangler rommål fra befaringen.");
  else flags.push(...room.assumptions);
  const choices: AiLineChoice[] = [];
  const used = new Set<string>();

  const push = (choice: AiLineChoice) => {
    if (used.has(choice.code) || !(choice.quantity > 0)) return;
    const line = request.catalog.find((item) => item.code === choice.code);
    if (!line || !line.active || line.type === "percent_addon" || line.type === "freetext") {
      flags.push(`Varekode ${choice.code} kan ikke prises og er utelatt.`);
      return;
    }
    used.add(choice.code);
    choices.push(choice);
  };

  if (request.mode === "change") {
    const description = (request.changeDescription ?? "").trim();
    if (!description) flags.push("Endringen mangler beskrivelse.");
    const lowered = description.toLowerCase();
    for (const line of request.catalog) {
      if (!line.active || line.customerVisible === false) continue;
      const name = line.name.toLowerCase();
      const words = name.split(/[^a-ø0-9]+/i).filter((word) => word.length > 4);
      if (!words.some((word) => lowered.includes(word))) continue;
      const count = numberNear(lowered, words) ?? 1;
      push({
        code: line.code,
        quantity: count,
        rationale: `Nevnt i endringsbeskrivelsen. Slått opp som ${line.code}.`,
        uncertain: true,
        uncertaintyNote: "Kontroller mengde mot beskrivelsen.",
        optional: false,
      });
    }
    if (choices.length === 0) flags.push("Fant ingen varekode som passer beskrivelsen. Legg inn poster manuelt.");
  } else if (request.answers.some((answer) => answer.key || answer.config)) {
    const built = evaluateChecklist({ answers: request.answers, catalog: request.catalog, room });
    for (const line of built.lines) {
      push({
        code: line.code,
        quantity: line.quantity,
        rationale: line.rationale,
        uncertain: line.uncertain,
        uncertaintyNote: line.uncertaintyNote,
        optional: line.optional,
      });
    }
    flags.push(...built.flags);
    draftChannel = built.channel;
    draftExtra = built.extraProfitNok;
    draftManual = built.manualItems;
  } else {
    for (const answer of request.answers) {
      const decision = positive(answer.value);
      if (!decision.ok || !answer.priceItemCode) continue;
      const line = request.catalog.find((item) => item.code === answer.priceItemCode);
      if (!line) {
        flags.push(`Sjekklistepunkt «${answer.prompt}» peker på ukjent kode ${answer.priceItemCode}.`);
        continue;
      }
      const fromFormula = formulaQuantity(line, room);
      const quantity = decision.quantity ?? fromFormula ?? 1;
      const subcontractor = Boolean(request.rates.find((rate) => rate.tradeCode === line.tradeCode)?.subcontractor);
      const uncertain = !subcontractor && decision.quantity == null && fromFormula == null && line.type === "hours";
      push({
        code: line.code,
        quantity,
        rationale: `Fra sjekkliste: ${answer.prompt}${answer.freeText ? `. ${answer.freeText}` : ""}`,
        uncertain,
        uncertaintyNote: uncertain ? "Timeantall er ikke målt." : null,
        optional: false,
      });
      if (answer.freeText && /usikker|avklar|kanskje|\?/i.test(answer.freeText)) {
        flags.push(`Fritekst på «${answer.prompt}» bør leses av kontoret.`);
      }
    }
    for (const line of request.catalog) {
      if (!line.quantityFormula || used.has(line.code)) continue;
      const sameTradeChosen = choices.some((choice) => request.catalog.find((item) => item.code === choice.code)?.tradeCode === line.tradeCode);
      if (!sameTradeChosen) continue;
      const quantity = formulaQuantity(line, room);
      if (quantity == null || !(quantity > 0)) continue;
      const deducts = line.quantityFormula.includes("veggareal") && !line.quantityFormula.includes("brutto");
      push({
        code: line.code,
        quantity,
        rationale: `Mengde fra rommål med formelen ${line.quantityFormula}.`,
        uncertain: Boolean(room && room.apninger > 0 && !deducts && line.quantityFormula.includes("omkrets")),
        uncertaintyNote:
          room && room.apninger > 0 && line.quantityFormula.includes("omkrets") && !line.quantityFormula.includes("veggareal")
            ? `Formelen trekker ikke fra dør/vindu. Netto veggareal er ${room.veggareal} m².`
            : null,
        optional: false,
      });
    }
  }

  const secrets = internalSnippets(request);
  const merge = mergeContext(request, 0);
  const composed = request.mode === "quote" && request.textBlocks?.length ? composeFromBlocks(request, [], merge, []) : null;
  const customerText = sanitizeCustomerText(composed?.customerText ?? composeCustomerText(request, choices, merge), secrets).text;
  const reservations = sanitizeCustomerText(composed?.reservations ?? composeReservations(request, merge), secrets).text;
  const suggestions = request.textBlocks?.length ? suggestionFromRequest(request) : "";
  const email = sanitizeCustomerText(composeEmail(request, merge), secrets);
  if (secrets.length) flags.push("Interne notater er holdt utenfor kundeteksten.");
  for (const answer of request.answers) {
    if (answer.freeText && !answer.priceItemCode && answer.freeText.trim().length > 0 && request.mode === "quote") {
      flags.push(`Fritekst uten varekode: «${answer.prompt}».`);
    }
  }
  return {
    lines: choices,
    customerText,
    reservations,
    emailSubject: request.mode === "change" ? "Pris på tilleggsarbeid" : "Tilbud på badet",
    emailBody: email.text,
    flags: [...new Set(flags)],
    channel: draftChannel,
    extraProfitNok: draftExtra,
    manualItems: draftManual,
    suggestions,
  };
}

function numberNear(text: string, words: string[]): number | null {
  for (const word of words) {
    const index = text.indexOf(word);
    if (index < 0) continue;
    const window = text.slice(Math.max(0, index - 12), index + word.length + 12);
    const match = window.match(/(\d+(?:[.,]\d+)?)/);
    if (match) return Number(match[1]!.replace(",", "."));
  }
  return null;
}

function mergeContext(request: DraftRequest, totalIncVat: number): MergeContext {
  return {
    rates: request.rates,
    commercial: request.commercial,
    totalIncVat,
    validDays: request.validDays ?? 30,
    paymentStartPercent: request.paymentStartPercent,
    paymentFinishPercent: request.paymentFinishPercent,
    paymentDueDays: request.paymentDueDays,
    startDate: request.startDate,
    endDate: request.endDate,
  };
}

export function suggestionFromRequest(request: Pick<DraftRequest, "answers" | "notes">): string {
  const lines: string[] = [];
  for (const answer of request.answers) {
    const typed = answer.questionType === "text" || answer.questionType === "text_short";
    if (typed && typeof answer.value === "string" && answer.value.trim()) lines.push(`${answer.prompt}: ${answer.value.trim()}`);
    if (answer.freeText?.trim()) lines.push(`${answer.prompt}: ${answer.freeText.trim()}`);
  }
  for (const note of request.notes) {
    if (!note.internal && note.body.trim()) lines.push(note.body.trim());
  }
  return lines.join("\n");
}

function composeFromBlocks(request: DraftRequest, lines: { code: string; tradeCode: string; name: string; unit: string; quantity: number; included: boolean; internal?: boolean; lineSumExVat: number }[], merge: MergeContext, selectedKeys: string[] | undefined) {
  return composeQuoteDocument({
    blocks: request.textBlocks ?? [],
    lines: lines.map((line) => ({
      code: line.code,
      tradeCode: line.tradeCode,
      description: line.name,
      unit: line.unit,
      quantity: line.quantity,
      included: line.included,
      internal: line.internal,
      lineSumExVat: line.lineSumExVat,
    })),
    answers: request.answers.map((answer) => ({ key: answer.key ?? null, value: answer.value, freeText: answer.freeText })),
    merge,
    selectedKeys,
  });
}

function composeCustomerText(request: DraftRequest, choices: AiLineChoice[], merge: MergeContext): string {
  if (request.mode === "change") {
    const template = request.templates.find((item) => item.key === "endring.brev");
    const lines = choices
      .map((choice) => {
        const item = request.catalog.find((line) => line.code === choice.code);
        return item ? `${item.name}: ${choice.quantity} ${item.unit}` : choice.code;
      })
      .join("\n");
    const body = template?.body ?? "Beskrivelse av tillegg:\n{{beskrivelse}}\n\nForutsetninger og betingelser:\nTimesatser og betingelser fremkommer i tilbud/kontrakt for prosjektet.";
    const filled = body
      .replaceAll("{{beskrivelse}}", (request.changeDescription ?? "").trim())
      .replaceAll("{{poster}}", lines);
    return mergeTemplate(filled, merge);
  }
  const intro = request.templates.find((item) => item.kind === "intro");
  const parts: string[] = [];
  if (intro) parts.push(mergeTemplate(intro.body, merge));
  const byTrade = new Map<string, AiLineChoice[]>();
  for (const choice of choices) {
    const item = request.catalog.find((line) => line.code === choice.code);
    const trade = item?.tradeCode ?? "annet";
    byTrade.set(trade, [...(byTrade.get(trade) ?? []), choice]);
  }
  const ordered = [...byTrade.entries()].sort((a, b) => tradeRank(request, a[0]) - tradeRank(request, b[0]));
  for (const [trade, rows] of ordered) {
    const template = request.templates.find((item) => item.kind === "trade" && item.tradeCode === trade);
    const list = rows
      .map((choice) => {
        const item = request.catalog.find((line) => line.code === choice.code);
        if (!item) return "";
        return `${item.name}\t${choice.quantity} ${item.unit}`;
      })
      .filter(Boolean)
      .join("\n");
    parts.push(template ? `${mergeTemplate(template.body, merge)}\n${list}` : `${tradeName(trade)}\n${list}`);
  }
  const visibleNotes = request.notes.filter((note) => !note.internal).map((note) => note.body.trim()).filter(Boolean);
  if (visibleNotes.length) parts.push(visibleNotes.join("\n"));
  return parts.join("\n\n");
}

function tradeRank(request: DraftRequest, trade: string): number {
  const template = request.templates.find((item) => item.kind === "trade" && item.tradeCode === trade);
  if (template?.sortOrder != null) return template.sortOrder;
  const index = TRADES.findIndex((item) => item.code === trade);
  return index === -1 ? 1000 : index;
}

function composeReservations(request: DraftRequest, merge: MergeContext): string {
  return request.templates
    .filter((item) => item.kind === "reservation" || item.kind === "spec")
    .map((item) => mergeTemplate(item.body, merge))
    .join("\n\n");
}

function composeEmail(request: DraftRequest, merge: MergeContext): string {
  const key = request.mode === "change" ? "epost.endring" : "epost.tilbud";
  const template = request.templates.find((item) => item.key === key);
  return mergeTemplate(template?.body ?? "Vedlagt ligger tilbudet. Alle beløp som er oppgitt som sum er inkludert mva.", merge);
}

export type AppliedDraft = {
  lines: CalcLine[];
  totals: ReturnType<typeof calculateQuote>;
  customerText: string;
  reservations: string;
  emailSubject: string;
  emailBody: string;
  flags: string[];
  leaked: string[];
  aiSuggestion: string;
};

/** Motoren slår opp koder og regner pris. Tekst fra modellen renses for interne notater. */
export function applyDraft(request: DraftRequest, draft: AiDraftShape, extraProfitNok = 0): AppliedDraft {
  const secrets = internalSnippets(request);
  const lines: CalcLine[] = [];
  const flags = [...draft.flags];
  for (const choice of draft.lines) {
    const item = request.catalog.find((line) => line.code === choice.code);
    if (!item) {
      flags.push(`Ukjent varekode ${choice.code} er forkastet. AI setter ikke pris uten kode.`);
      continue;
    }
    const rationale = sanitizeCustomerText(choice.rationale, secrets).text;
    lines.push(
      priceLineToCalc(item, choice.quantity, {
        optional: choice.optional,
        included: !choice.optional,
      }),
    );
    if (choice.uncertain) flags.push(`${choice.code}: ${choice.uncertaintyNote || "Usikker mengde"}`);
    void rationale;
  }
  const totals = calculateQuote({
    lines,
    rates: request.rates,
    commercial: request.commercial,
    extraProfitNok: draft.extraProfitNok ?? extraProfitNok,
    channel: draft.channel ?? request.channel,
  });
  const merge = mergeContext(request, totals.totalIncVat);
  const locked = request.mode === "quote" && (request.textBlocks?.length ?? 0) > 0;
  const composed = locked
    ? composeFromBlocks(
        request,
        totals.lines.map((line) => ({
          code: line.code,
          tradeCode: line.tradeCode,
          name: line.name,
          unit: line.unit,
          quantity: line.quantity,
          included: line.included,
          internal: line.internal,
          lineSumExVat: line.lineSumExVat,
        })),
        merge,
        draft.selectedBlockKeys,
      )
    : null;
  const customer = sanitizeCustomerText(composed ? composed.customerText : mergeTemplate(draft.customerText, merge), secrets);
  const reservations = sanitizeCustomerText(composed ? composed.reservations : mergeTemplate(draft.reservations, merge), secrets);
  const email = sanitizeCustomerText(mergeTemplate(draft.emailBody, merge), secrets);
  const suggestionSource = locked
    ? [draft.suggestions?.trim(), suggestionFromRequest(request), isStandardDocument(draft.customerText) ? "" : draft.customerText.trim()]
        .filter((part): part is string => Boolean(part))
        .filter((part, index, all) => all.indexOf(part) === index)
        .join("\n\n")
    : "";
  const suggestion = sanitizeCustomerText(suggestionSource, secrets);
  const leaked = [...new Set([...customer.removed, ...reservations.removed, ...email.removed, ...suggestion.removed])];
  if (leaked.length) flags.push("Intern tekst ble fjernet fra kundeteksten.");
  return {
    lines,
    totals,
    customerText: customer.text,
    reservations: reservations.text,
    emailSubject: sanitizeCustomerText(draft.emailSubject, secrets).text,
    emailBody: email.text,
    flags: [...new Set(flags)],
    leaked,
    aiSuggestion: suggestion.text,
  };
}

export function draftPrompt(request: DraftRequest): { system: string; user: string } {
  const secrets = internalSnippets(request);
  const catalog = request.catalog
    .filter((line) => line.active && line.type !== "percent_addon" && line.type !== "freetext")
    .map((line) => ({
      code: line.code,
      trade: line.tradeCode,
      name: line.name,
      unit: line.unit,
      type: line.type,
      formula: line.quantityFormula,
    }));
  const answers = request.answers.map((answer) => ({
    prompt: answer.prompt,
    trade: answer.tradeCode,
    value: answer.value,
    freeText: answer.freeText,
    priceItemCode: answer.priceItemCode,
    hasInternalNote: Boolean(answer.internalNote?.trim()),
  }));
  const customerNotes = request.notes.filter((note) => !note.internal).map((note) => ({ body: note.body, room: note.roomName ?? null }));
  const internal = [
    ...request.notes.filter((note) => note.internal).map((note) => ({ kind: "notat", body: note.body, room: note.roomName ?? null })),
    ...request.answers.filter((answer) => answer.internalNote?.trim()).map((answer) => ({ kind: "sjekkliste", body: answer.internalNote, prompt: answer.prompt })),
  ];
  const media = request.media.map((item) => ({
    id: item.id,
    kind: item.kind,
    fileName: item.fileName,
    room: item.roomName ?? null,
    internal: item.internal,
  }));
  const payload = {
    mode: request.mode,
    changeDescription: request.changeDescription ?? null,
    rooms: request.rooms.map((room) => ({
      name: room.name,
      omkrets: room.omkrets,
      takhoyde: room.takhoyde,
      gulvareal: room.gulvareal,
      veggareal: room.veggareal,
      skrataak: room.skrataak,
      assumptions: room.assumptions,
    })),
    answers,
    customerNotes,
    internalNotes: internal,
    media,
    catalog,
    channel: request.channel,
    templates: request.templates.map((item) => ({ key: item.key, kind: item.kind, tradeCode: item.tradeCode, body: item.body })),
  };
  void secrets;
  return {
    system: [
      "Du lager tilbudsutkast for Straume Våtrom AS.",
      "Velg kun varekoder fra katalogen og sett mengde. Ikke oppgi pris, påslag eller timesats.",
      "Standardtekster og forbehold er låst. Ikke skriv om customerText eller reservations, og ikke endre en standardsetning.",
      "Du kan bare velge ekstra tekstblokker via selectedBlockKeys, og foreslå tilleggstekst for fritekstpunkter i suggestions. Forslaget merkes som AI-forslag og blir ikke en del av standardteksten.",
      "Begrunn hver linje. Flagg usikkerhet og manglende informasjon.",
      "Feltet internalNotes er kun til intern vurdering. Ingen setning derfra, og ingen formulering som røper innholdet, skal inn i customerText, reservations eller emailBody.",
      "Sjekkliste med mapping er fasit for grunnutkastet. Fritekst kan legge til ekstra poster med begrunnelse. Mangler varekode, skriv det i flags som «må prises manuelt» og ikke finn på en pris.",
      "Ikke ta med kundenavn, telefon, e-post eller adresse.",
    ].join(" "),
    user: JSON.stringify(payload),
  };
}
