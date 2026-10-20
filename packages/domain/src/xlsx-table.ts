import { deflateRawSync, inflateRawSync } from "node:zlib";

function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (const byte of data) {
    c ^= byte;
    for (let i = 0; i < 8; i += 1) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function zip(files: { name: string; body: Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const compressed = deflateRawSync(file.body);
    const crc = crc32(file.body);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(file.body.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    locals.push(local, compressed);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(file.body.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);
    offset += local.length + compressed.length;
  }
  const central = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, central, end]);
}

function unzip(buffer: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  let offset = 0;
  while (offset + 30 < buffer.length) {
    if (buffer.readUInt32LE(offset) !== 0x04034b50) break;
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
    const start = offset + 30 + nameLength + extraLength;
    const data = buffer.subarray(start, start + compressedSize);
    const body = method === 0 ? data : inflateRawSync(data);
    files.set(name, body);
    offset = start + compressedSize;
  }
  return files;
}

function colIndex(ref: string): number {
  let n = 0;
  for (const char of ref.replace(/[0-9]/g, "")) n = n * 26 + (char.charCodeAt(0) - 64);
  return n - 1;
}

export function tableToXlsx(rows: string[][]): Buffer {
  const strings: string[] = [];
  const index = new Map<string, number>();
  const cellXml = rows
    .map((row, rowIndex) => {
      const cells = row.map((value, column) => {
        if (!index.has(value)) {
          index.set(value, strings.length);
          strings.push(value);
        }
        const letter = String.fromCharCode(65 + column);
        return `<c r="${letter}${rowIndex + 1}" t="s"><v>${index.get(value)}</v></c>`;
      });
      return `<row r="${rowIndex + 1}">${cells.join("")}</row>`;
    })
    .join("");
  const shared = `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">${strings.map((value) => `<si><t>${escapeXml(value)}</t></si>`).join("")}</sst>`;
  const sheet = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${cellXml}</sheetData></worksheet>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Priser" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`;
  const root = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`;
  return zip([
    { name: "[Content_Types].xml", body: Buffer.from(root) },
    { name: "xl/workbook.xml", body: Buffer.from(workbook) },
    { name: "xl/_rels/workbook.xml.rels", body: Buffer.from(rels) },
    { name: "xl/worksheets/sheet1.xml", body: Buffer.from(sheet) },
    { name: "xl/sharedStrings.xml", body: Buffer.from(shared) },
  ]);
}

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function xlsxToTable(buffer: Buffer): string[][] {
  const files = unzip(buffer);
  const sharedXml = files.get("xl/sharedStrings.xml")?.toString("utf8") ?? "";
  const strings = [...sharedXml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((match) => decodeXml(match[1] ?? ""));
  const sheet = files.get("xl/worksheets/sheet1.xml")?.toString("utf8");
  if (!sheet) throw new Error("Excel-filen mangler ark");
  const rows: string[][] = [];
  for (const row of sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const cell of row[1]!.matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
      const ref = /r="([A-Z]+)/.exec(cell[1] ?? "")?.[1] ?? "";
      const index = ref ? colIndex(ref) : cells.length;
      const type = /t="([^"]+)"/.exec(cell[1] ?? "")?.[1];
      const value = /<v>([\s\S]*?)<\/v>/.exec(cell[2] ?? "")?.[1] ?? "";
      const inline = /<t[^>]*>([\s\S]*?)<\/t>/.exec(cell[2] ?? "")?.[1];
      const text = inline != null ? decodeXml(inline) : type === "s" ? strings[Number(value)] ?? "" : value;
      cells[index] = text;
    }
    rows.push(cells.map((cell) => cell ?? ""));
  }
  return rows;
}

function decodeXml(value: string): string {
  return value.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
}

export function tableToRecords(table: string[][]): Record<string, string>[] {
  const [header, ...body] = table;
  if (!header) return [];
  return body
    .filter((row) => row.some((cell) => cell.trim()))
    .map((row) => {
      const record: Record<string, string> = {};
      header.forEach((key, index) => {
        if (key) record[key] = row[index] ?? "";
      });
      return record;
    });
}
