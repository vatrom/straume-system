import { DomainError } from "./errors";
import { round4, roundMoney } from "./money";
import { parseCsv } from "./csv";

export type BomKind = "amount" | "product";

export type BomProduct = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  costPrice: number | null;
  listPrice: number | null;
  discontinued: boolean;
};

export type BomLineInput = {
  id: string;
  kind: BomKind;
  label: string | null;
  amountNok: number | null;
  quantity: number;
  product: BomProduct | null;
};

export type BomFlag = { lineId: string; code: "missing_price" | "discontinued" | "missing_product"; message: string };

export type BomRollup = {
  materialCost: number;
  incomplete: boolean;
  flags: BomFlag[];
  lines: { id: string; cost: number }[];
};

/** Summerer stykklisten til netto materialkost per enhet. Tom liste betyr at posten bruker enkel materialsum. */
export function rollupBom(lines: BomLineInput[]): BomRollup | null {
  if (lines.length === 0) return null;
  const flags: BomFlag[] = [];
  const priced = lines.map((line) => {
    const quantity = line.quantity > 0 ? line.quantity : 0;
    if (line.kind === "amount") {
      const amount = line.amountNok ?? 0;
      return { id: line.id, cost: round4(amount * (quantity || 1)) };
    }
    if (!line.product) {
      flags.push({ lineId: line.id, code: "missing_product", message: "Stykklisten peker på et produkt som ikke finnes." });
      return { id: line.id, cost: 0 };
    }
    if (line.product.discontinued) {
      flags.push({ lineId: line.id, code: "discontinued", message: `${line.product.sku} ${line.product.name} er utgått.` });
    }
    if (line.product.costPrice == null) {
      flags.push({ lineId: line.id, code: "missing_price", message: `${line.product.sku} ${line.product.name} mangler kostpris.` });
      return { id: line.id, cost: 0 };
    }
    return { id: line.id, cost: round4(line.product.costPrice * quantity) };
  });
  return {
    materialCost: round4(priced.reduce((sum, line) => sum + line.cost, 0)),
    incomplete: flags.some((flag) => flag.code !== "discontinued"),
    flags,
    lines: priced,
  };
}

export type ColumnMap = {
  sku: string;
  name: string;
  unit?: string;
  cost: string;
  listPrice?: string;
  nobb?: string;
  ean?: string;
  discontinued?: string;
  validFrom?: string;
};

export const FORMAT_PRESETS: Record<string, ColumnMap> = {
  csv: { sku: "varenummer", name: "navn", unit: "enhet", cost: "kostpris", listPrice: "veilpris", nobb: "nobb", ean: "ean" },
  xlsx: { sku: "varenummer", name: "navn", unit: "enhet", cost: "kostpris", listPrice: "veilpris", nobb: "nobb", ean: "ean" },
  efo: { sku: "Varenr", name: "Varetekst", unit: "Enhet", cost: "Pris", listPrice: "VeilPris", nobb: "NOBB", ean: "EAN", discontinued: "Utgatt" },
  nelfo: { sku: "VareNr", name: "Beskrivelse", unit: "Enhet", cost: "Nettopris", listPrice: "Listepris", nobb: "NobbNr", ean: "EAN", discontinued: "Utgaatt" },
  api: { sku: "sku", name: "name", unit: "unit", cost: "cost", listPrice: "listPrice", nobb: "nobb", ean: "ean" },
};

export type ParsedProduct = {
  sku: string;
  name: string;
  unit: string;
  costPrice: number | null;
  listPrice: number | null;
  nobb: string | null;
  ean: string | null;
  discontinued: boolean;
  validFrom: string | null;
};

export type CatalogSnapshot = {
  sku: string;
  name: string;
  costPrice: number | null;
  listPrice: number | null;
  discontinued: boolean;
};

export type PriceDiffKind = "new" | "cost" | "list" | "unchanged" | "discontinued" | "missing_price";

export type PriceDiffRow = {
  sku: string;
  name: string;
  kind: PriceDiffKind;
  oldCost: number | null;
  newCost: number | null;
  oldList: number | null;
  newList: number | null;
  discontinued: boolean;
};

function normHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "").replace(/[._-]/g, "");
}

function detectDelimiter(header: string): "," | ";" | "\t" {
  const counts: ["," | ";" | "\t", number][] = [
    [",", header.split(",").length],
    [";", header.split(";").length],
    ["\t", header.split("\t").length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0]![0];
}

export function parseDelimited(text: string): Record<string, string>[] {
  const headerLine = text.split(/\r?\n/).find((line) => line.trim()) ?? "";
  const delimiter = detectDelimiter(headerLine);
  if (delimiter === ",") return parseCsv(text);
  const normalized = text
    .split(/\r?\n/)
    .map((line) => splitDelimited(line, delimiter).map((cell) => `"${cell.replaceAll('"', '""')}"`).join(","))
    .join("\n");
  return parseCsv(normalized);
}

function splitDelimited(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]!;
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(cell);
      cell = "";
    } else cell += char;
  }
  cells.push(cell);
  return cells;
}

function column(row: Record<string, string>, header: string | undefined): string {
  if (!header) return "";
  const wanted = normHeader(header);
  const key = Object.keys(row).find((item) => normHeader(item) === wanted);
  return key ? (row[key] ?? "").trim() : "";
}

function money(value: string): number | null {
  const cleaned = value.replace(/\s/g, "").replace(",", ".");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function truthy(value: string): boolean {
  return ["1", "ja", "yes", "y", "true", "utgatt", "utgått", "x"].includes(value.trim().toLowerCase());
}

export function mapPriceRows(rows: Record<string, string>[], mapping: ColumnMap): ParsedProduct[] {
  if (!mapping.sku || !mapping.name || !mapping.cost) throw new DomainError("Kolonnemapping må ha varenummer, navn og kostpris");
  if (rows.length === 0) throw new DomainError("Prisfilen er tom");
  const headers = Object.keys(rows[0] ?? {});
  for (const required of [mapping.sku, mapping.name, mapping.cost]) {
    if (!headers.some((header) => normHeader(header) === normHeader(required))) {
      throw new DomainError(`Fant ikke kolonnen «${required}». Kolonner i filen: ${headers.join(", ")}`);
    }
  }
  const products: ParsedProduct[] = [];
  for (const row of rows) {
    const sku = column(row, mapping.sku);
    const name = column(row, mapping.name);
    if (!sku && !name) continue;
    if (!sku) throw new DomainError(`En rad mangler varenummer (${name || "uten navn"})`);
    products.push({
      sku,
      name: name || sku,
      unit: column(row, mapping.unit) || "stk",
      costPrice: money(column(row, mapping.cost)),
      listPrice: money(column(row, mapping.listPrice)),
      nobb: column(row, mapping.nobb) || null,
      ean: column(row, mapping.ean) || null,
      discontinued: truthy(column(row, mapping.discontinued)),
      validFrom: column(row, mapping.validFrom) || null,
    });
  }
  if (products.length === 0) throw new DomainError("Prisfilen har ingen varelinjer");
  return products;
}

export function diffCatalog(existing: CatalogSnapshot[], incoming: ParsedProduct[]): PriceDiffRow[] {
  const bySku = new Map(existing.map((item) => [item.sku, item]));
  return incoming.map((row) => {
    const current = bySku.get(row.sku);
    if (!current) {
      return {
        sku: row.sku,
        name: row.name,
        kind: row.costPrice == null ? "missing_price" : "new",
        oldCost: null,
        newCost: row.costPrice,
        oldList: null,
        newList: row.listPrice,
        discontinued: row.discontinued,
      };
    }
    const costChanged = (current.costPrice ?? null) !== (row.costPrice ?? null);
    const listChanged = row.listPrice != null && (current.listPrice ?? null) !== row.listPrice;
    const kind: PriceDiffKind = row.discontinued && !current.discontinued
      ? "discontinued"
      : row.costPrice == null
        ? "missing_price"
        : costChanged
          ? "cost"
          : listChanged
            ? "list"
            : "unchanged";
    return {
      sku: row.sku,
      name: row.name,
      kind,
      oldCost: current.costPrice,
      newCost: row.costPrice,
      oldList: current.listPrice,
      newList: row.listPrice,
      discontinued: row.discontinued,
    };
  });
}

export function presetFor(format: string): ColumnMap {
  return { ...(FORMAT_PRESETS[format] ?? FORMAT_PRESETS.csv!) };
}

export function saleFromParts(materialCost: number, markup: number, hoursPerUnit: number, hourlyRate: number): number {
  return roundMoney(materialCost * (1 + markup) + hoursPerUnit * hourlyRate);
}
