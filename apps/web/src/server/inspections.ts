import { prisma } from "@straume/db";
import { DomainError } from "@straume/domain";
import { richPdf } from "./sketch-files";
import { getObject } from "./store";

function showValue(value: unknown): string {
  if (value == null || value === "") return "–";
  if (value === true) return "Ja";
  if (value === false) return "Nei";
  if (Array.isArray(value)) return value.map(String).join(", ") || "–";
  return String(value);
}

export async function inspectionView(id: string) {
  const inspection = await prisma.inspection.findUnique({
    where: { id },
    include: {
      deal: { include: { person: true } },
      project: true,
      inspector: true,
      templateVersion: { include: { template: true, sections: { orderBy: { sortOrder: "asc" }, include: { items: { orderBy: { sortOrder: "asc" } } } } } },
      answers: { where: { deletedAt: null }, include: { media: { where: { deletedAt: null } } } },
      notes: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } },
      media: { where: { deletedAt: null } },
      floors: { where: { deletedAt: null }, include: { rooms: { where: { deletedAt: null } } } },
    },
  });
  if (!inspection) throw new DomainError("Fant ikke befaringen");
  const byItem = new Map(inspection.answers.map((answer) => [answer.itemId, answer]));
  const sections = (inspection.templateVersion?.sections ?? []).map((section) => ({
    name: section.name,
    tradeCode: section.tradeCode,
    items: section.items.map((item) => {
      const answer = byItem.get(item.id);
      return {
        prompt: item.prompt,
        questionType: item.questionType,
        unit: item.unit,
        value: showValue(answer?.value),
        freeText: answer?.freeText,
        internalNote: answer?.internalNote,
        images: (answer?.media ?? []).map((media) => ({ id: media.id, fileName: media.fileName, mimeType: media.mimeType, storageKey: media.storageKey })),
      };
    }),
    notes: inspection.notes.filter((note) => note.sectionKey === section.tradeCode || note.sectionKey === section.name),
  }));
  const looseImages = inspection.media.filter((media) => !media.answerId);
  return {
    id: inspection.id,
    title: inspection.project?.title ?? inspection.deal?.title ?? "Befaring",
    template: inspection.templateVersion?.template.name ?? "Sjekkliste",
    version: inspection.templateVersion?.version ?? null,
    inspector: inspection.inspector?.name ?? "Ukjent",
    visitedAt: inspection.visitedAt?.toISOString() ?? null,
    sections,
    images: looseImages.map((media) => ({ id: media.id, fileName: media.fileName, mimeType: media.mimeType, internal: media.internal, storageKey: media.storageKey })),
    rooms: inspection.floors.flatMap((floor) => floor.rooms.map((room) => room.name)),
  };
}

export async function inspectionPdf(id: string): Promise<{ name: string; body: Buffer }> {
  const view = await inspectionView(id);
  const lines: string[] = [`${view.template}${view.version ? ` v${view.version}` : ""}`, `Utført av ${view.inspector}`, ""];
  const images: { caption: string; jpeg: Buffer }[] = [];
  for (const section of view.sections) {
    lines.push(section.name.toUpperCase());
    for (const item of section.items) {
      const suffix = item.unit ? ` ${item.unit}` : "";
      lines.push(`${item.prompt}: ${item.value}${item.value !== "–" ? suffix : ""}`);
      if (item.freeText) lines.push(`  ${item.freeText}`);
      if (item.internalNote) lines.push(`  Internt: ${item.internalNote}`);
      for (const image of item.images) {
        lines.push(`  Bilde: ${image.fileName ?? image.id}`);
        if (image.storageKey) {
          const file = await getObject(image.storageKey);
          if (file && file.body[0] === 0xff && file.body[1] === 0xd8) images.push({ caption: image.fileName ?? item.prompt, jpeg: file.body });
        }
      }
    }
    for (const note of section.notes) lines.push(note.internal ? `Internt notat: ${note.body}` : note.body);
    lines.push("");
  }
  for (const image of view.images) {
    lines.push(`Bilde: ${image.fileName ?? image.id}`);
    if (image.storageKey) {
      const file = await getObject(image.storageKey);
      if (file?.body[0] === 0xff && file.body[1] === 0xd8) images.push({ caption: image.fileName ?? "Bilde fra befaring", jpeg: file.body });
    }
  }
  return { name: `befaring-${view.title}.pdf`, body: richPdf([{ title: `Tilbudsbefaring · ${view.title}`, lines, images }]) };
}
