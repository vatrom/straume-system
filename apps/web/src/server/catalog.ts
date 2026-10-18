import { prisma } from "@straume/db";
import {
  diffCatalog,
  DomainError,
  mapPriceRows,
  parseDelimited,
  presetFor,
  rollupBom,
  tableToRecords,
  xlsxToTable,
  type ColumnMap,
  type PriceDiffRow,
} from "@straume/domain";
import { audit } from "./audit";
import { dec } from "./dates";
import { assertAdmin } from "./roles";

type Actor = { id: string; role: string };

function asMap(value: unknown, format: string): ColumnMap {
  if (value && typeof value === "object" && "sku" in value && "name" in value && "cost" in value) return value as ColumnMap;
  return presetFor(format);
}

export async function listSuppliers() {
  const suppliers = await prisma.supplier.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { products: true } } } });
  return suppliers.map((supplier) => ({
    id: supplier.id,
    name: supplier.name,
    code: supplier.code,
    format: supplier.format,
    columnMap: supplier.columnMap,
    products: supplier._count.products,
  }));
}

export async function listProducts(query?: string) {
  const q = query?.trim();
  const products = await prisma.product.findMany({
    where: q
      ? { OR: [{ sku: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }, { nobb: { contains: q } }, { ean: { contains: q } }] }
      : {},
    include: { supplier: true },
    orderBy: [{ supplier: { name: "asc" } }, { sku: "asc" }],
    take: 400,
  });
  return products.map((product) => ({
    id: product.id,
    supplierId: product.supplierId,
    supplierName: product.supplier.name,
    sku: product.sku,
    nobb: product.nobb,
    ean: product.ean,
    name: product.name,
    unit: product.unit,
    costPrice: dec(product.costPrice),
    listPrice: dec(product.listPrice),
    validFrom: product.validFrom ? product.validFrom.toISOString().slice(0, 10) : null,
    discontinued: product.discontinued,
  }));
}

export async function saveSupplier(
  user: Actor,
  input: { id?: string; name: string; code: string; format: string; columnMap?: ColumnMap },
) {
  assertAdmin(user);
  const name = input.name.trim();
  const code = input.code.trim().toLowerCase();
  if (!name || !code) throw new DomainError("Leverandør må ha navn og kode");
  const format = input.format || "csv";
  const columnMap = input.columnMap ?? presetFor(format);
  const supplier = input.id
    ? await prisma.supplier.update({ where: { id: input.id }, data: { name, code, format, columnMap } })
    : await prisma.supplier.create({ data: { name, code, format, columnMap } });
  await audit(user.id, "supplier.save", "supplier", supplier.id);
  return supplier;
}

function rowsFromFile(fileName: string, bytes: Buffer): Record<string, string>[] {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".xlsx")) return tableToRecords(xlsxToTable(bytes));
  return parseDelimited(bytes.toString("utf8"));
}

export async function previewPriceFile(supplierId: string, fileName: string, bytes: Buffer): Promise<{ diff: PriceDiffRow[]; fileName: string }> {
  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId }, include: { products: true } });
  if (!supplier) throw new DomainError("Fant ikke leverandøren");
  const parsed = mapPriceRows(rowsFromFile(fileName, bytes), asMap(supplier.columnMap, supplier.format));
  if (parsed.length === 0) throw new DomainError("Fant ingen varelinjer i filen");
  const diff = diffCatalog(
    supplier.products.map((product) => ({
      sku: product.sku,
      name: product.name,
      costPrice: dec(product.costPrice),
      listPrice: dec(product.listPrice),
      discontinued: product.discontinued,
    })),
    parsed,
  );
  return { diff, fileName };
}

export async function applyPriceFile(user: Actor, supplierId: string, fileName: string, bytes: Buffer) {
  assertAdmin(user);
  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId }, include: { products: true } });
  if (!supplier) throw new DomainError("Fant ikke leverandøren");
  const parsed = mapPriceRows(rowsFromFile(fileName, bytes), asMap(supplier.columnMap, supplier.format));
  const diff = diffCatalog(
    supplier.products.map((product) => ({
      sku: product.sku,
      name: product.name,
      costPrice: dec(product.costPrice),
      listPrice: dec(product.listPrice),
      discontinued: product.discontinued,
    })),
    parsed,
  );
  const today = new Date().toISOString().slice(0, 10);
  const importId = crypto.randomUUID();
  const changedSkus: string[] = [];
  await prisma.$transaction(async (tx) => {
    await tx.supplierPriceImport.create({
      data: {
        id: importId,
        supplierId,
        fileName,
        status: "applied",
        summary: {
          rows: diff.length,
          cost: diff.filter((row) => row.kind === "cost").length,
          created: diff.filter((row) => row.kind === "new").length,
        },
        createdById: user.id,
      },
    });
    for (const row of parsed) {
      const existing = supplier.products.find((product) => product.sku === row.sku);
      const product = await tx.product.upsert({
        where: { supplierId_sku: { supplierId, sku: row.sku } },
        update: {
          name: row.name || existing?.name || row.sku,
          unit: row.unit || existing?.unit || "stk",
          nobb: row.nobb,
          ean: row.ean,
          costPrice: row.costPrice,
          listPrice: row.listPrice,
          discontinued: row.discontinued,
          validFrom: row.validFrom ? new Date(`${row.validFrom}T00:00:00.000Z`) : new Date(`${today}T00:00:00.000Z`),
          sourceImportId: importId,
        },
        create: {
          supplierId,
          sku: row.sku,
          name: row.name || row.sku,
          unit: row.unit || "stk",
          nobb: row.nobb,
          ean: row.ean,
          costPrice: row.costPrice,
          listPrice: row.listPrice,
          discontinued: row.discontinued,
          validFrom: row.validFrom ? new Date(`${row.validFrom}T00:00:00.000Z`) : new Date(`${today}T00:00:00.000Z`),
          sourceImportId: importId,
        },
      });
      const change = diff.find((item) => item.sku === row.sku);
      if (change && change.kind !== "unchanged") {
        changedSkus.push(row.sku);
        await tx.supplierPriceChange.create({
          data: {
            importId,
            productId: product.id,
            sku: row.sku,
            name: product.name,
            kind: change.kind,
            oldCost: change.oldCost,
            newCost: change.newCost,
          },
        });
      }
    }
  });
  const touched = await recalcBomForProducts(supplierId, changedSkus.length ? changedSkus : parsed.map((row) => row.sku));
  await audit(user.id, "catalog.import", "supplier", supplierId, { fileName, changed: changedSkus.length, items: touched.length });
  return { importId, diff, updatedItems: touched };
}

async function recalcBomForProducts(supplierId: string, skus: string[]) {
  if (skus.length === 0) return [];
  const products = await prisma.product.findMany({ where: { supplierId, sku: { in: skus } }, select: { id: true } });
  const links = await prisma.bomLine.findMany({ where: { productId: { in: products.map((product) => product.id) } }, select: { priceItemId: true } });
  const itemIds = [...new Set(links.map((link) => link.priceItemId))];
  const updated: { code: string; materialCost: number; flags: string[] }[] = [];
  for (const itemId of itemIds) {
    const lines = await prisma.bomLine.findMany({ where: { priceItemId: itemId }, include: { product: true }, orderBy: { sortOrder: "asc" } });
    const rollup = rollupBom(
      lines.map((line) => ({
        id: line.id,
        kind: line.kind === "product" ? "product" as const : "amount" as const,
        label: line.label,
        amountNok: dec(line.amountNok),
        quantity: dec(line.quantity) ?? 1,
        product: line.product
          ? {
              id: line.product.id,
              sku: line.product.sku,
              name: line.product.name,
              unit: line.product.unit,
              costPrice: dec(line.product.costPrice),
              listPrice: dec(line.product.listPrice),
              discontinued: line.product.discontinued,
            }
          : null,
      })),
    );
    if (!rollup) continue;
    await prisma.priceLine.updateMany({
      where: { priceItemId: itemId, priceList: { status: { in: ["active", "draft"] } } },
      data: { materialCost: rollup.materialCost },
    });
    const item = await prisma.priceItem.findUnique({ where: { id: itemId }, select: { code: true } });
    updated.push({ code: item?.code ?? itemId, materialCost: rollup.materialCost, flags: rollup.flags.map((flag) => flag.message) });
  }
  return updated;
}

export async function itemBom(priceListId: string, itemId: string) {
  const line = await prisma.priceLine.findUnique({
    where: { priceListId_priceItemId: { priceListId, priceItemId: itemId } },
    include: { priceItem: true },
  });
  if (!line) throw new DomainError("Fant ikke prisposten");
  const [bom, products] = await Promise.all([
    prisma.bomLine.findMany({ where: { priceItemId: itemId }, include: { product: { include: { supplier: true } } }, orderBy: { sortOrder: "asc" } }),
    prisma.product.findMany({ include: { supplier: true }, orderBy: [{ supplier: { name: "asc" } }, { sku: "asc" }], take: 500 }),
  ]);
  const rollup = rollupBom(
    bom.map((row) => ({
      id: row.id,
      kind: row.kind === "product" ? "product" as const : "amount" as const,
      label: row.label,
      amountNok: dec(row.amountNok),
      quantity: dec(row.quantity) ?? 1,
      product: row.product
        ? {
            id: row.product.id,
            sku: row.product.sku,
            name: row.product.name,
            unit: row.product.unit,
            costPrice: dec(row.product.costPrice),
            listPrice: dec(row.product.listPrice),
            discontinued: row.product.discontinued,
          }
        : null,
    })),
  );
  return {
    priceListId,
    item: {
      id: line.priceItem.id,
      code: line.priceItem.code,
      name: line.priceItem.name,
      unit: line.priceItem.unit,
      materialCost: dec(line.materialCost) ?? 0,
      materialMarkup: dec(line.materialMarkup),
      hoursPerUnit: dec(line.hoursPerUnit) ?? 0,
    },
    rollup,
    lines: bom.map((row) => ({
      id: row.id,
      kind: row.kind,
      label: row.label,
      amountNok: dec(row.amountNok),
      quantity: dec(row.quantity) ?? 1,
      productId: row.productId,
      product: row.product
        ? {
            sku: row.product.sku,
            name: row.product.name,
            supplierName: row.product.supplier.name,
            costPrice: dec(row.product.costPrice),
            unit: row.product.unit,
            discontinued: row.product.discontinued,
          }
        : null,
    })),
    products: products.map((product) => ({
      id: product.id,
      label: `${product.supplier.name} · ${product.sku} · ${product.name}`,
      costPrice: dec(product.costPrice),
      discontinued: product.discontinued,
    })),
  };
}

export async function saveItemBom(
  user: Actor,
  priceListId: string,
  itemId: string,
  lines: { kind: "amount" | "product"; label?: string | null; amountNok?: number | null; productId?: string | null; quantity: number }[],
) {
  assertAdmin(user);
  const exists = await prisma.priceItem.findUnique({ where: { id: itemId } });
  if (!exists) throw new DomainError("Fant ikke prisposten");
  await prisma.$transaction(async (tx) => {
    await tx.bomLine.deleteMany({ where: { priceItemId: itemId } });
    if (lines.length) {
      await tx.bomLine.createMany({
        data: lines.map((line, index) => ({
          priceItemId: itemId,
          kind: line.kind,
          sortOrder: index + 1,
          label: line.kind === "amount" ? line.label?.trim() || "Fri sum" : null,
          amountNok: line.kind === "amount" ? line.amountNok ?? 0 : null,
          productId: line.kind === "product" ? line.productId || null : null,
          quantity: line.quantity > 0 ? line.quantity : 1,
        })),
      });
    }
  });
  const fresh = await prisma.bomLine.findMany({ where: { priceItemId: itemId }, include: { product: true } });
  const rollup = rollupBom(
    fresh.map((line) => ({
      id: line.id,
      kind: line.kind === "product" ? "product" as const : "amount" as const,
      label: line.label,
      amountNok: dec(line.amountNok),
      quantity: dec(line.quantity) ?? 1,
      product: line.product
        ? {
            id: line.product.id,
            sku: line.product.sku,
            name: line.product.name,
            unit: line.product.unit,
            costPrice: dec(line.product.costPrice),
            listPrice: dec(line.product.listPrice),
            discontinued: line.product.discontinued,
          }
        : null,
    })),
  );
  if (rollup) {
    await prisma.priceLine.updateMany({
      where: { priceItemId: itemId, priceList: { status: { in: ["active", "draft"] } } },
      data: { materialCost: rollup.materialCost },
    });
  }
  await audit(user.id, "bom.save", "priceitem", itemId, { priceListId, lines: lines.length, materialCost: rollup?.materialCost ?? null });
  return itemBom(priceListId, itemId);
}
