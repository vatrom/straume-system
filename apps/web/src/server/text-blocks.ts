import { prisma } from "@straume/db";
import {
  asBlockInclude,
  DEFAULT_QUOTE_TERMS,
  describeBlockLink,
  DOCUMENT_SECTIONS,
  DomainError,
  MAL_BLOCKS,
  type BlockInclude,
  type QuoteTextBlock,
} from "@straume/domain";
import type { Prisma } from "@straume/db";
import { audit } from "./audit";

type Actor = { id: string; role: string };

const TERMS = [
  ["quote_valid_days", DEFAULT_QUOTE_TERMS.validDays],
  ["quote_payment_start_percent", DEFAULT_QUOTE_TERMS.paymentStartPercent],
  ["quote_payment_finish_percent", DEFAULT_QUOTE_TERMS.paymentFinishPercent],
  ["quote_payment_due_days", DEFAULT_QUOTE_TERMS.paymentDueDays],
] as const;

function toBlock(row: {
  key: string;
  name: string;
  section: string;
  kind: string;
  body: string;
  sortOrder: number;
  includeWhen: unknown;
  locked: boolean;
  aiSelectable: boolean;
}): QuoteTextBlock | null {
  const include = asBlockInclude(row.includeWhen);
  if (!include) return null;
  const kind = row.kind === "reservation" || row.kind === "fixed" || row.kind === "generated" || row.kind === "description" ? row.kind : "description";
  return {
    key: row.key,
    name: row.name,
    section: row.section,
    kind,
    body: row.body,
    sortOrder: row.sortOrder,
    include,
    locked: row.locked,
    aiSelectable: row.aiSelectable,
  };
}

export async function publishedTextBlocks(): Promise<QuoteTextBlock[]> {
  const version = await prisma.textBlockVersion.findFirst({
    where: { publishedAt: { not: null } },
    orderBy: { version: "desc" },
    include: { blocks: { orderBy: { sortOrder: "asc" } } },
  });
  const rows = version?.blocks ?? [];
  const blocks = rows.flatMap((row) => {
    const block = toBlock(row);
    return block ? [block] : [];
  });
  return blocks.length ? blocks : MAL_BLOCKS;
}

export async function quoteTerms() {
  const rows = await prisma.appSetting.findMany({ where: { key: { in: TERMS.map(([key]) => key) } } });
  const read = (key: string, fallback: number) => {
    const found = rows.find((row) => row.key === key);
    const parsed = found ? Number(found.value) : fallback;
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return {
    validDays: read("quote_valid_days", DEFAULT_QUOTE_TERMS.validDays),
    paymentStartPercent: read("quote_payment_start_percent", DEFAULT_QUOTE_TERMS.paymentStartPercent),
    paymentFinishPercent: read("quote_payment_finish_percent", DEFAULT_QUOTE_TERMS.paymentFinishPercent),
    paymentDueDays: read("quote_payment_due_days", DEFAULT_QUOTE_TERMS.paymentDueDays),
  };
}

export async function saveQuoteTerms(
  user: Actor,
  input: { validDays: number; paymentStartPercent: number; paymentFinishPercent: number; paymentDueDays: number },
) {
  if (user.role !== "admin") throw new DomainError("Bare administrator kan endre betalingsvilkår");
  const validDays = Math.round(input.validDays);
  const start = Math.round(input.paymentStartPercent);
  const finish = Math.round(input.paymentFinishPercent);
  const due = Math.round(input.paymentDueDays);
  if (validDays < 1 || validDays > 365) throw new DomainError("Gyldighet må være mellom 1 og 365 dager");
  if (start < 0 || finish < 0 || start + finish !== 100) throw new DomainError("Oppstart og ferdigstillelse skal til sammen være 100 %");
  if (due < 1 || due > 90) throw new DomainError("Forfall må være mellom 1 og 90 dager");
  const values: Record<string, number> = {
    quote_valid_days: validDays,
    quote_payment_start_percent: start,
    quote_payment_finish_percent: finish,
    quote_payment_due_days: due,
  };
  for (const [key, value] of Object.entries(values)) {
    await prisma.appSetting.upsert({ where: { key }, update: { value: String(value) }, create: { key, value: String(value) } });
  }
  await audit(user.id, "settings.terms", "setting", "quote_terms", values);
  return quoteTerms();
}

async function draftVersion() {
  const draft = await prisma.textBlockVersion.findFirst({
    where: { publishedAt: null },
    orderBy: { version: "desc" },
    include: { blocks: { orderBy: { sortOrder: "asc" } }, set: true },
  });
  if (draft) return draft;
  const published = await prisma.textBlockVersion.findFirst({
    where: { publishedAt: { not: null } },
    orderBy: { version: "desc" },
    include: { blocks: true, set: true },
  });
  if (!published) return null;
  const created = await prisma.textBlockVersion.create({
    data: {
      setId: published.setId,
      version: published.version + 1,
      blocks: {
        create: published.blocks.map((block) => ({
          key: block.key,
          name: block.name,
          section: block.section,
          kind: block.kind,
          body: block.body,
          sortOrder: block.sortOrder,
          includeWhen: block.includeWhen as Prisma.InputJsonValue,
          locked: block.locked,
          aiSelectable: block.aiSelectable,
        })),
      },
    },
    include: { blocks: { orderBy: { sortOrder: "asc" } }, set: true },
  });
  return created;
}

export async function textBlockEditor() {
  const published = await prisma.textBlockVersion.findFirst({
    where: { publishedAt: { not: null } },
    orderBy: { version: "desc" },
  });
  const draft = await draftVersion();
  const blocks = (draft?.blocks ?? []).flatMap((row) => {
    const block = toBlock(row);
    if (!block) return [];
    const choice = block.include.choices?.[0];
    const numberKey = block.include.numbers?.map((item) => item.key).join(", ") ?? "";
    return [
      {
        ...block,
        link: describeBlockLink(block),
        choiceKey: choice?.key ?? "",
        choiceValues: choice?.anyOf.join(", ") ?? "",
        codes: block.include.codes?.join(", ") ?? "",
        numberKey,
      },
    ];
  });
  const order = ["intro", ...DOCUMENT_SECTIONS.map((section) => section.key)];
  blocks.sort((a, b) => order.indexOf(a.section) - order.indexOf(b.section) || a.sortOrder - b.sortOrder);
  return {
    publishedVersion: published?.version ?? null,
    draftVersion: draft?.version ?? null,
    sections: order.map((key) => ({
      key,
      title: key === "intro" ? "Innledning" : (DOCUMENT_SECTIONS.find((section) => section.key === key)?.title ?? key),
      blocks: blocks.filter((block) => block.section === key),
    })),
  };
}

export async function saveTextBlock(
  user: Actor,
  key: string,
  input: { body: string; choiceKey?: string; choiceValues?: string; codes?: string; numberKey?: string },
) {
  if (user.role !== "admin") throw new DomainError("Bare administrator kan endre tekstblokker");
  const draft = await draftVersion();
  if (!draft) throw new DomainError("Tekstbiblioteket er ikke installert");
  const current = draft.blocks.find((block) => block.key === key);
  if (!current) throw new DomainError("Fant ikke tekstblokken");
  const include = asBlockInclude(current.includeWhen) ?? { type: "always" as const };
  const next = nextInclude(include, input);
  await prisma.textBlock.update({
    where: { id: current.id },
    data: { body: input.body, includeWhen: next as Prisma.InputJsonValue },
  });
  await audit(user.id, "textblock.update", "textblock", key);
  return { ok: true };
}

function nextInclude(
  include: BlockInclude,
  input: { choiceKey?: string; choiceValues?: string; codes?: string; numberKey?: string },
): BlockInclude {
  if (include.type !== "match") return include;
  const values = (input.choiceValues ?? "").split(",").map((part) => part.trim()).filter(Boolean);
  const codes = (input.codes ?? "").split(",").map((part) => part.trim()).filter(Boolean);
  const choiceKey = input.choiceKey?.trim() ?? "";
  const numberKeys = (input.numberKey ?? "").split(",").map((part) => part.trim()).filter(Boolean);
  return {
    ...include,
    choices: choiceKey ? [{ key: choiceKey, anyOf: values }] : undefined,
    codes: codes.length ? codes : undefined,
    numbers: numberKeys.length ? numberKeys.map((key) => ({ key })) : undefined,
  };
}

export async function publishTextBlocks(user: Actor) {
  if (user.role !== "admin") throw new DomainError("Bare administrator kan publisere tekstblokker");
  const draft = await draftVersion();
  if (!draft) throw new DomainError("Tekstbiblioteket er ikke installert");
  if (draft.publishedAt) throw new DomainError("Versjonen er allerede publisert");
  await prisma.textBlockVersion.update({ where: { id: draft.id }, data: { publishedAt: new Date() } });
  await prisma.textBlockVersion.create({
    data: {
      setId: draft.setId,
      version: draft.version + 1,
      blocks: {
        create: draft.blocks.map((block) => ({
          key: block.key,
          name: block.name,
          section: block.section,
          kind: block.kind,
          body: block.body,
          sortOrder: block.sortOrder,
          includeWhen: block.includeWhen as Prisma.InputJsonValue,
          locked: block.locked,
          aiSelectable: block.aiSelectable,
        })),
      },
    },
  });
  await audit(user.id, "textblock.publish", "textblock", String(draft.version));
  return { version: draft.version };
}
