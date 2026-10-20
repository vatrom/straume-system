import { prisma } from "@straume/db";
import { DomainError, TRADE_CODES } from "@straume/domain";
import { audit } from "./audit";

function assertAdmin(user: { role: string }) {
  if (user.role !== "admin") throw new DomainError("Bare administrator kan endre fag");
}

export async function listTrades() {
  const rows = await prisma.trade.findMany({ orderBy: { sortOrder: "asc" } });
  return rows.map((trade) => ({
    code: trade.code,
    name: trade.name,
    sortOrder: trade.sortOrder,
    subcontractor: trade.subcontractor,
  }));
}

/** Fagrekkefølgen styrer tilbud, PDF, tekstmaler og sjekklisteseksjoner. */
export async function reorderTrades(user: { id: string; role: string }, codes: string[]) {
  assertAdmin(user);
  const unique = [...new Set(codes)];
  if (unique.length !== TRADE_CODES.length || unique.some((code) => !TRADE_CODES.includes(code as (typeof TRADE_CODES)[number]))) {
    throw new DomainError("Fagrekkefølgen må inneholde hvert fag én gang");
  }
  await prisma.$transaction(async (tx) => {
    for (let index = 0; index < unique.length; index += 1) {
      const code = unique[index]!;
      await tx.trade.update({ where: { code }, data: { sortOrder: index + 1 } });
      await tx.textTemplate.updateMany({ where: { kind: "trade", tradeCode: code }, data: { sortOrder: (index + 1) * 10 } });
    }
    const versions = await tx.checklistTemplateVersion.findMany({ select: { id: true } });
    for (const version of versions) {
      const sections = await tx.checklistSection.findMany({ where: { versionId: version.id }, orderBy: { sortOrder: "asc" } });
      const sorted = sections
        .map((section, index) => ({ section, index }))
        .sort((a, b) => {
          const left = unique.indexOf(a.section.tradeCode);
          const right = unique.indexOf(b.section.tradeCode);
          return (left === -1 ? 99 : left) - (right === -1 ? 99 : right) || a.index - b.index;
        });
      for (let index = 0; index < sorted.length; index += 1) {
        await tx.checklistSection.update({ where: { id: sorted[index]!.section.id }, data: { sortOrder: index + 1 } });
      }
    }
  });
  await audit(user.id, "trade.reorder", "trade", "order", { codes: unique });
  return listTrades();
}

export async function setTradeSubcontractor(user: { id: string; role: string }, code: string, subcontractor: boolean) {
  assertAdmin(user);
  if (!TRADE_CODES.includes(code as (typeof TRADE_CODES)[number])) throw new DomainError("Ukjent fag");
  await prisma.trade.update({ where: { code }, data: { subcontractor } });
  await audit(user.id, "trade.subcontractor", "trade", code, { subcontractor });
  return { code, subcontractor };
}
