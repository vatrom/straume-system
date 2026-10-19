import { prisma, type QuestionType } from "@straume/db";
import { asItemConfig, DomainError, QUESTION_TYPES, TRADE_CODES, TRADES, type ItemConfig } from "@straume/domain";
import { audit } from "./audit";
import { reorderTrades } from "./trades";
import { assertAdmin } from "./roles";

export type DraftSection = {
  tradeCode: string;
  name: string;
  items: {
    prompt: string;
    questionType: QuestionType;
    required?: boolean;
    choices?: string[] | null;
    unit?: string | null;
    priceItemCode?: string | null;
    helpText?: string | null;
    itemKey?: string | null;
    config?: ItemConfig | null;
  }[];
};

const QUESTION_TYPE_SET = new Set<string>(QUESTION_TYPES);

export function validateDraft(sections: DraftSection[]): void {
  if (sections.length === 0) throw new DomainError("Sjekklisten må ha minst én seksjon");
  const known = new Set(TRADES.map((trade) => trade.code));
  sections.forEach((section, index) => {
    if (!known.has(section.tradeCode as (typeof TRADES)[number]["code"])) throw new DomainError(`Ukjent fag i seksjon ${index + 1}`);
    if (!section.name.trim()) throw new DomainError("Seksjonen må ha et navn");
    if (section.items.length === 0) throw new DomainError(`«${section.name}» har ingen spørsmål`);
    section.items.forEach((item) => {
      if (!item.prompt.trim()) throw new DomainError("Spørsmålet må ha en tekst");
      if (!QUESTION_TYPE_SET.has(item.questionType)) throw new DomainError("Ukjent spørsmålstype");
      if ((item.questionType === "choice" || item.questionType === "multi") && (!item.choices || item.choices.filter(Boolean).length < 2)) {
        throw new DomainError(`«${item.prompt}» må ha minst to valg`);
      }
      if (item.config?.showWhen?.itemKey) {
        const keys = sections.flatMap((row) => row.items.map((entry) => entry.itemKey).filter(Boolean));
        if (!keys.includes(item.config.showWhen.itemKey)) throw new DomainError(`«${item.prompt}» viser til et ukjent felt`);
      }
    });
  });
}

async function draftVersion() {
  const template = await prisma.checklistTemplate.findFirst({ orderBy: { name: "asc" } });
  if (!template) throw new DomainError("Fant ikke sjekklistemalen");
  let draft = await prisma.checklistTemplateVersion.findFirst({
    where: { templateId: template.id, publishedAt: null },
    orderBy: { version: "desc" },
    include: { sections: { orderBy: { sortOrder: "asc" }, include: { items: { orderBy: { sortOrder: "asc" } } } } },
  });
  if (!draft) {
    const latest = await prisma.checklistTemplateVersion.findFirst({
      where: { templateId: template.id },
      orderBy: { version: "desc" },
      include: { sections: { orderBy: { sortOrder: "asc" }, include: { items: { orderBy: { sortOrder: "asc" } } } } },
    });
    const version = (latest?.version ?? 0) + 1;
    draft = await prisma.checklistTemplateVersion.create({
      data: {
        templateId: template.id,
        version,
        sections: {
          create: (latest?.sections ?? []).map((section) => ({
            tradeCode: section.tradeCode,
            name: section.name,
            sortOrder: section.sortOrder,
            items: {
              create: section.items.map((item) => ({
                prompt: item.prompt,
                helpText: item.helpText,
                questionType: item.questionType,
                required: item.required,
                choices: item.choices ?? undefined,
                sortOrder: item.sortOrder,
                unit: item.unit,
                priceItemCode: item.priceItemCode,
                itemKey: item.itemKey,
                config: item.config ?? undefined,
              })),
            },
          })),
        },
      },
      include: { sections: { orderBy: { sortOrder: "asc" }, include: { items: { orderBy: { sortOrder: "asc" } } } } },
    });
  }
  const published = await prisma.checklistTemplateVersion.findFirst({
    where: { templateId: template.id, publishedAt: { not: null } },
    orderBy: { version: "desc" },
    include: { _count: { select: { inspections: true } } },
  });
  return { template, draft, published };
}

export async function checklistEditor() {
  return draftVersion();
}

export async function saveDraft(user: { id: string; role: string }, sections: DraftSection[]) {
  assertAdmin(user);
  validateDraft(sections);
  const { draft } = await draftVersion();
  const answers = await prisma.checklistAnswer.count({ where: { item: { section: { versionId: draft.id } } } });
  if (answers > 0) throw new DomainError("Utkastet er allerede brukt og kan ikke overskrives");
  await prisma.$transaction(async (tx) => {
    await tx.checklistSection.deleteMany({ where: { versionId: draft.id } });
    for (let s = 0; s < sections.length; s += 1) {
      const section = sections[s]!;
      await tx.checklistSection.create({
        data: {
          versionId: draft.id,
          tradeCode: section.tradeCode,
          name: section.name.trim(),
          sortOrder: s + 1,
          items: {
            create: section.items.map((item, index) => ({
              prompt: item.prompt.trim(),
              questionType: item.questionType,
              required: Boolean(item.required),
              choices: item.choices?.filter(Boolean) ?? undefined,
              unit: item.unit || null,
              priceItemCode: item.priceItemCode || null,
              helpText: item.helpText || null,
              itemKey: item.itemKey || null,
              config: item.config ?? undefined,
              sortOrder: index + 1,
            })),
          },
        },
      });
    }
  });
  await audit(user.id, "checklist.save", "checklist", draft.id);
    const seen: string[] = [];
  for (const section of sections) {
    if (section.tradeCode === "annet" || seen.includes(section.tradeCode)) continue;
    seen.push(section.tradeCode);
  }
  const rest = TRADE_CODES.filter((code) => !seen.includes(code));
  await reorderTrades(user, [...seen, ...rest]);
  return draftVersion();
}

export async function publishChecklist(user: { id: string; role: string }) {
  assertAdmin(user);
  const { template, draft } = await draftVersion();
  if (draft.sections.length === 0) throw new DomainError("Utkastet er tomt");
  await prisma.checklistTemplateVersion.update({ where: { id: draft.id }, data: { publishedAt: new Date() } });
  const cloned = await prisma.checklistTemplateVersion.create({
    data: {
      templateId: template.id,
      version: draft.version + 1,
      sections: {
        create: draft.sections.map((section) => ({
          tradeCode: section.tradeCode,
          name: section.name,
          sortOrder: section.sortOrder,
          items: {
            create: section.items.map((item) => ({
              prompt: item.prompt,
              helpText: item.helpText,
              questionType: item.questionType,
              required: item.required,
              choices: item.choices ?? undefined,
              sortOrder: item.sortOrder,
              unit: item.unit,
              priceItemCode: item.priceItemCode,
              itemKey: item.itemKey,
              config: item.config ?? undefined,
            })),
          },
        })),
      },
    },
  });
  await audit(user.id, "checklist.publish", "checklist", draft.id, { nextDraft: cloned.id });
  return { publishedId: draft.id, draftId: cloned.id };
}

export async function publishedChecklist() {
  const version = await prisma.checklistTemplateVersion.findFirst({
    where: { publishedAt: { not: null } },
    orderBy: { version: "desc" },
    include: {
      template: true,
      sections: { orderBy: { sortOrder: "asc" }, include: { items: { orderBy: { sortOrder: "asc" } } } },
    },
  });
  if (!version) return null;
  return {
    versionId: version.id,
    version: version.version,
    name: version.template.name,
    sections: version.sections.map((section) => ({
      id: section.id,
      tradeCode: section.tradeCode,
      name: section.name,
      sortOrder: section.sortOrder,
      items: section.items.map((item) => ({
        id: item.id,
        prompt: item.prompt,
        questionType: item.questionType,
        required: item.required,
        choices: Array.isArray(item.choices) ? (item.choices as string[]) : null,
        unit: item.unit,
        sortOrder: item.sortOrder,
        priceItemCode: item.priceItemCode,
        helpText: item.helpText,
        itemKey: item.itemKey,
        config: asItemConfig(item.config),
      })),
    })),
  };
}
