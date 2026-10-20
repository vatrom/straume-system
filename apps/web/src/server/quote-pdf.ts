import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AI_SUGGESTION_HEADING,
  type ComposedQuoteDocument,
  type QuoteDocumentBlock,
  type QuoteDocumentSection,
  type QuoteLetterhead,
} from "@straume/domain";
import PDFDocument from "pdfkit";

const here = dirname(fileURLToPath(import.meta.url));
const brand = join(here, "../../assets/brand");

const TEXT = "#282827";
const GREEN = "#ABC037";
const MUTED = "#3F4042";

const mm = (value: number) => (value * 72) / 25.4;
const PAGE_W = mm(210);
const BODY_X = mm(25);
const BODY_RIGHT = mm(183);
const BODY_W = BODY_RIGHT - BODY_X;
const QTY_RIGHT = mm(145.2);
const BODY_TOP = mm(39.5);
const BODY_BOTTOM = mm(256);
const SIZE = 9;
const LEADING = 12.8;

type Pdf = InstanceType<typeof PDFDocument>;

export type CustomerQuotePdfInput = {
  document: ComposedQuoteDocument;
  customer: { name: string; email: string; address: string; phone: string };
  letterhead: QuoteLetterhead;
  /** Dato i toppteksten, format dd.mm.yy. */
  date: string;
  quoteNumber: string;
  /** Godkjent tilleggstekst. Trykkes som vanlig brødtekst, uten AI-merking. */
  approvedNote?: string;
};

const asset = (path: string) => join(brand, path);

function file(path: string): Buffer {
  return readFileSync(asset(path));
}

export function displayQuoteNumber(familyId: string): string {
  const head = familyId.split("-")[0]?.trim();
  return (head || familyId).toUpperCase();
}

export function quoteHeaderDate(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Oslo",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).formatToParts(value);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("day")}.${pick("month")}.${pick("year")}`;
}

export function safePdfName(value: string): string {
  const cleaned = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "kunde";
}

function registerFonts(doc: Pdf) {
  doc.registerFont("Lexend", asset("fonts/LexendDeca-Regular.ttf"));
  doc.registerFont("Lexend-Medium", asset("fonts/LexendDeca-Medium.ttf"));
  doc.registerFont("Lexend-Semi", asset("fonts/LexendDeca-SemiBold.ttf"));
}

function newPage(doc: Pdf) {
  doc.addPage();
  doc.x = BODY_X;
  doc.y = BODY_TOP;
}

function ensure(doc: Pdf, height: number) {
  if (doc.y + height <= BODY_BOTTOM) return;
  newPage(doc);
}

function gap(doc: Pdf, lines = 1) {
  doc.y += LEADING * lines;
}

function drawLine(doc: Pdf, words: string[], x: number, y: number, width: number, justify: boolean, italic: boolean) {
  const shear = italic ? 0.2 : 0;
  const paint = (text: string, at: number) => {
    if (!italic) {
      doc.text(text, at, y, { lineBreak: false });
      return;
    }
    doc.save();
    doc.transform(1, 0, shear, 1, -shear * y, 0);
    doc.text(text, at, y, { lineBreak: false });
    doc.restore();
  };
  if (!justify || words.length < 2) {
    paint(words.join(" "), x);
    return;
  }
  const wordsWidth = words.reduce((sum, word) => sum + doc.widthOfString(word), 0);
  const space = (width - wordsWidth) / (words.length - 1);
  let cursor = x;
  for (const word of words) {
    paint(word, cursor);
    cursor += doc.widthOfString(word) + space;
  }
}

function wrapWords(doc: Pdf, text: string, width: number): string[][] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[][] = [];
  let current: string[] = [];
  for (const word of words) {
    const trial = [...current, word];
    if (current.length > 0 && doc.widthOfString(trial.join(" ")) > width) {
      lines.push(current);
      current = [word];
      continue;
    }
    current = trial;
  }
  if (current.length) lines.push(current);
  return lines;
}

function drawWrapped(
  doc: Pdf,
  text: string,
  options: { font?: string; size?: number; align?: "left" | "justify"; italic?: boolean; x?: number; width?: number; underline?: boolean; gapAfter?: number } = {},
) {
  const font = options.font ?? "Lexend";
  const size = options.size ?? SIZE;
  const x = options.x ?? BODY_X;
  const width = options.width ?? BODY_W;
  const leading = size === SIZE ? LEADING : size * 1.15;
  doc.font(font).fontSize(size).fillColor(TEXT);
  const chunks = text.split("\n");
  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (!trimmed) {
      gap(doc, 1);
      continue;
    }
    const lines = wrapWords(doc, trimmed, width);
    lines.forEach((words, index) => {
      ensure(doc, leading);
      const y = doc.y;
      const justify = options.align === "justify" && index < lines.length - 1;
      drawLine(doc, words, x, y, width, justify, Boolean(options.italic));
      if (options.underline && index === 0) {
        const label = words.join(" ");
        const underlineWidth = doc.widthOfString(label);
        doc.save();
        doc.strokeColor(TEXT).lineWidth(0.4).moveTo(x, y + size + 1).lineTo(x + underlineWidth, y + size + 1).stroke();
        doc.restore();
      }
      doc.x = BODY_X;
      doc.y = y + leading;
    });
  }
  doc.y += leading * (options.gapAfter ?? 0.95);
}

function heading(doc: Pdf, number: number, title: string) {
  if (doc.y > BODY_TOP + 4) doc.y += 6;
  ensure(doc, LEADING * 3);
  const y = doc.y;
  doc.font("Lexend-Semi").fontSize(SIZE).fillColor(GREEN);
  doc.text(`${number}.`, mm(37.4), y, { lineBreak: false });
  doc.fillColor(TEXT);
  doc.text(title, mm(49), y, { lineBreak: false });
  doc.x = BODY_X;
  doc.y = y + 30;
}

function productList(doc: Pdf, block: QuoteDocumentBlock) {
  doc.font("Lexend").fontSize(SIZE).fillColor(TEXT);
  for (const item of block.items ?? []) {
    const qty = `${item.quantity} ${item.unit}`.trim();
    const qtyWidth = doc.widthOfString(qty);
    const descWidth = QTY_RIGHT - BODY_X - mm(16);
    ensure(doc, 12);
    const y = doc.y;
    const lines = wrapWords(doc, item.description, descWidth);
    lines.forEach((words, index) => {
      doc.text(words.join(" "), BODY_X, y + index * 11.3, { lineBreak: false });
    });
    doc.text(qty, QTY_RIGHT - qtyWidth, y, { lineBreak: false });
    doc.x = BODY_X;
    doc.y = y + Math.max(lines.length, 1) * 11.3;
  }
  gap(doc, 0.85);
}

function priceBlock(doc: Pdf, block: QuoteDocumentBlock) {
  ensure(doc, LEADING * 4);
  const y = doc.y;
  doc.font("Lexend-Semi").fontSize(SIZE).fillColor(TEXT);
  doc.text("Sum Investering", BODY_X, y, { lineBreak: false });
  const amount = block.priceAmount || "";
  if (amount) {
    const width = doc.widthOfString(amount);
    doc.text(amount, QTY_RIGHT - width, y, { lineBreak: false });
  }
  doc.x = BODY_X;
  doc.y = y + 20;
  for (const paragraph of block.paragraphs) drawWrapped(doc, paragraph, { gapAfter: 0.4 });
}

function dottedRule(doc: Pdf, x: number, y: number, width: number) {
  doc.save();
  doc.strokeColor(TEXT).lineWidth(0.6).dash(0.8, { space: 2.2 }).moveTo(x, y).lineTo(x + width, y).stroke();
  doc.restore();
}

function signatureValue(line: string, label: string): { label: string; value: string; dotted: boolean } | null {
  if (!line.startsWith(label)) return null;
  const value = line.slice(label.length).trim();
  const dotted = !value || /^[.\u2026\s]+$/.test(value);
  return { label, value, dotted };
}

function signatureBlock(doc: Pdf, block: QuoteDocumentBlock) {
  const rows: { test: (paragraph: string) => boolean; y: number; x: number; font: string; dots: number }[] = [
    { test: (paragraph) => paragraph.startsWith("Arbeidets"), y: mm(50.4), x: mm(27.1), font: "Lexend", dots: 0 },
    { test: (paragraph) => paragraph.startsWith("Start:"), y: mm(68.1), x: BODY_X, font: "Lexend", dots: 50 },
    { test: (paragraph) => paragraph.startsWith("Slutt:"), y: mm(80.4), x: BODY_X, font: "Lexend", dots: 50 },
    { test: (paragraph) => paragraph.startsWith("Forbruker"), y: mm(97.1), x: mm(27.1), font: "Lexend", dots: 0 },
    { test: (paragraph) => paragraph.startsWith("Håndverkerne"), y: mm(116.4), x: mm(27.1), font: "Lexend", dots: 0 },
    { test: (paragraph) => paragraph.startsWith("Tilbudet er gyldig"), y: mm(134.8), x: mm(27.1), font: "Lexend", dots: 0 },
    { test: (paragraph) => paragraph.trim() === "Tilbudet aksepteres.", y: mm(149.7), x: mm(39.6), font: "Lexend-Semi", dots: 0 },
    { test: (paragraph) => paragraph.startsWith("Håndverker:"), y: mm(181.3), x: BODY_X, font: "Lexend", dots: 60 },
    { test: (paragraph) => paragraph.startsWith("Oppdragsgiver:"), y: mm(210), x: BODY_X, font: "Lexend", dots: 60 },
  ];
  for (const paragraph of block.paragraphs) {
    const row = rows.find((item) => item.test(paragraph));
    const y = row?.y ?? doc.y;
    const x = row?.x ?? BODY_X;
    doc.font(row?.font ?? "Lexend").fontSize(SIZE).fillColor(TEXT);
    const marked = signatureValue(paragraph, "Start:") ?? signatureValue(paragraph, "Slutt:") ?? signatureValue(paragraph, "Håndverker:") ?? signatureValue(paragraph, "Oppdragsgiver:");
    if (marked && row?.dots) {
      const label = paragraph.startsWith("Oppdragsgiver:") ? "Oppdragsgiver:" : `${marked.label}`;
      doc.text(label, x, y, { lineBreak: false });
      const labelWidth = doc.widthOfString(label.endsWith(" ") ? label : `${label} `);
      if (marked.dotted) dottedRule(doc, x + labelWidth, y + SIZE * 0.85, mm(row.dots));
      else doc.text(marked.value, x + labelWidth, y, { lineBreak: false });
    } else {
      doc.text(paragraph, x, y, { lineBreak: false });
    }
    doc.y = y + LEADING;
  }
  doc.x = BODY_X;
}

function termsBlock(doc: Pdf, block: QuoteDocumentBlock) {
  for (const paragraph of block.paragraphs) {
    const rows = paragraph.split("\n");
    for (const row of rows) {
      if (row.trim() === "Betalingsvilkår:") {
        drawWrapped(doc, row.trim(), { font: "Lexend-Medium", underline: true, gapAfter: 0.35 });
        continue;
      }
      drawWrapped(doc, row, { align: "justify", gapAfter: 0.85 });
    }
  }
}

function renderBlock(doc: Pdf, block: QuoteDocumentBlock) {
  if (block.role === "products") {
    productList(doc, block);
    return;
  }
  if (block.role === "price") {
    priceBlock(doc, block);
    return;
  }
  if (block.role === "signature") {
    signatureBlock(doc, block);
    return;
  }
  if (block.role === "terms") {
    termsBlock(doc, block);
    return;
  }
  if (block.role === "reservation") {
    for (const paragraph of block.paragraphs) drawWrapped(doc, paragraph, { align: "justify", italic: true });
    return;
  }
  for (const paragraph of block.paragraphs) drawWrapped(doc, paragraph);
}

function renderSection(doc: Pdf, section: QuoteDocumentSection) {
  if (section.pageBreakBefore) newPage(doc);
  if (doc.y + 78 > BODY_BOTTOM) newPage(doc);
  heading(doc, section.number, section.title);
  for (const block of section.blocks) renderBlock(doc, block);
}

function contents(doc: Pdf, input: CustomerQuotePdfInput) {
  const block = input.document.intro.find((item) => item.role === "contents");
  drawWrapped(doc, block?.paragraphs[0] ?? "Tilbudet inneholder følgende poster:", { font: "Lexend-Medium", gapAfter: 1.45 });
  doc.font("Lexend").fontSize(SIZE).fillColor(TEXT);
  for (const item of input.document.contents) {
    ensure(doc, 14);
    const y = doc.y;
    doc.text(`${item.number}.`, mm(31.4), y, { lineBreak: false });
    doc.text(item.title, mm(48), y, { lineBreak: false });
    doc.x = BODY_X;
    doc.y = y + 13.1;
  }
  if (doc.y < 534) doc.y = 534;
}

function cover(doc: Pdf, input: CustomerQuotePdfInput) {
  doc.font("Lexend").fontSize(12).fillColor(TEXT);
  const customer = [input.customer.name, input.customer.email, input.customer.address, input.customer.phone];
  customer.forEach((line, index) => {
    doc.text(line || " ", mm(28.2), 132.2 + index * 16.5, { lineBreak: false });
  });
  doc.font("Lexend-Semi").fontSize(16).fillColor(TEXT);
  const title = "Tilbud / Kontrakt";
  doc.text(title, (PAGE_W - doc.widthOfString(title)) / 2, 224.4, { lineBreak: false });
  doc.x = BODY_X;
  doc.y = 286.4;
  for (const block of input.document.intro) {
    if (block.role === "contents") {
      contents(doc, input);
      continue;
    }
    if (block.role === "signoff") {
      const [hello, firm] = block.paragraphs;
      if (hello) drawWrapped(doc, hello, { gapAfter: 0 });
      doc.y += 26;
      if (firm) drawWrapped(doc, firm, { gapAfter: 0.2 });
      continue;
    }
    const tight = block.key === "intro.kontrakt" ? 0 : block.key === "intro.lov" ? 0.65 : block.key === "intro.sporsmal" ? 1.1 : 0.25;
    drawWrapped(doc, block.paragraphs.join("\n"), { gapAfter: tight });
  }
  newPage(doc);
}

function noteParagraphs(note: string | undefined): string[] {
  if (!note?.trim()) return [];
  return note
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && line !== AI_SUGGESTION_HEADING && line.toLowerCase() !== "ai-forslag");
}

function body(doc: Pdf, input: CustomerQuotePdfInput) {
  const notes = noteParagraphs(input.approvedNote);
  let notesPlaced = false;
  for (const section of input.document.sections) {
    if (!notesPlaced && notes.length && (section.key === "pristilbud" || section.pageBreakBefore)) {
      for (const paragraph of notes) drawWrapped(doc, paragraph);
      notesPlaced = true;
    }
    renderSection(doc, section);
  }
  if (!notesPlaced) {
    for (const paragraph of notes) drawWrapped(doc, paragraph);
  }
}

function chrome(doc: Pdf, input: CustomerQuotePdfInput, page: number, pages: number) {
  doc.image(file("logo/straume-logo-primar.png"), mm(23.8), mm(20.8), { width: mm(45.5), height: mm(12.7) });
  const badges = [
    { file: "merker/merke-mesterbrev.png", height: mm(12.5), aspect: 77 / 79 },
    { file: "merker/merke-godkjent-ansvarsrett.png", height: mm(12.9), aspect: 177 / 183 },
    { file: "merker/merke-bvn-godkjent-vatromsbedrift.png", height: mm(13.4), aspect: 206 / 318 },
  ];
  const gapMm = 3;
  const widths = badges.map((badge) => badge.height * badge.aspect);
  const total = widths.reduce((sum, width) => sum + width, 0) + mm(gapMm) * (badges.length - 1);
  let x = mm(182.5) - total;
  const bottom = mm(31.5);
  badges.forEach((badge, index) => {
    const width = widths[index] ?? badge.height;
    doc.image(file(badge.file), x, bottom - badge.height, { width, height: badge.height });
    x += width + mm(gapMm);
  });

  doc.font("Lexend").fontSize(10).fillColor(TEXT);
  const dated = `${input.letterhead.place} ${input.date}`.trim();
  const dateWidth = doc.widthOfString(dated);
  doc.text(dated, mm(175) - dateWidth, 92.3, { lineBreak: false });

  doc.save();
  doc.strokeColor(GREEN).lineWidth(0.6).moveTo(mm(25), mm(37.9)).lineTo(mm(183), mm(37.9)).stroke();
  doc.restore();

  doc.save();
  doc.strokeColor(GREEN).lineWidth(1.5).moveTo(mm(23), mm(268)).lineTo(mm(185), mm(268)).stroke();
  doc.restore();

  const leftX = mm(25);
  const rightX = mm(125.6);
  const foot = mm(271);
  const step = mm(4.35);
  doc.font("Lexend").fontSize(10).fillColor(TEXT);
  doc.text(`${input.letterhead.legalName}   Org nr ${input.letterhead.orgNr}`, leftX, foot, { lineBreak: false });
  doc.text(input.letterhead.address, leftX, foot + step, { lineBreak: false });
  doc.font("Lexend-Semi").text(input.letterhead.web, leftX, foot + step * 2, { lineBreak: false });
  doc.font("Lexend").text(`Tlf:      ${input.letterhead.phone}`, rightX, foot, { lineBreak: false });
  doc.text(input.letterhead.email, rightX, foot + step, { lineBreak: false });

  doc.font("Lexend").fontSize(7.5).fillColor(MUTED);
  const pager = `Side ${page} av ${pages}  ·  Tilbudsnr ${input.quoteNumber}`;
  const pagerWidth = doc.widthOfString(pager);
  doc.text(pager, (PAGE_W - pagerWidth) / 2, mm(286.5), { lineBreak: false });
  doc.fillColor(TEXT);
}

export function renderCustomerQuotePdf(input: CustomerQuotePdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      bufferPages: true,
      autoFirstPage: true,
      compress: true,
      margins: { top: BODY_TOP, bottom: mm(297) - BODY_BOTTOM, left: BODY_X, right: PAGE_W - BODY_RIGHT },
      info: { Title: "Tilbud / Kontrakt", Author: input.letterhead.legalName },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      registerFonts(doc);
      doc.x = BODY_X;
      doc.y = BODY_TOP;
      cover(doc, input);
      body(doc, input);
      const range = doc.bufferedPageRange();
      for (let index = 0; index < range.count; index += 1) {
        doc.switchToPage(range.start + index);
        chrome(doc, input, index + 1, range.count);
      }
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
