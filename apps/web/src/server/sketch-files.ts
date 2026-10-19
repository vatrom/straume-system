import { deflateSync } from "node:zlib";
import { layoutSketch, numberedWalls, roomMeasures, type Sketch } from "@straume/domain";

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of data) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const head = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head, data])));
  return Buffer.concat([length, head, data, crc]);
}

export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    rgba.subarray(y * width * 4, (y + 1) * width * 4).forEach((value, index) => {
      raw[row + 1 + index] = value;
    });
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return png;
}

function stamp(px: Uint8Array, width: number, x: number, y: number, radius: number, color: [number, number, number]): void {
  const height = px.length / 4 / width;
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx * dx + dy * dy > radius * radius) continue;
      const xx = Math.round(x + dx);
      const yy = Math.round(y + dy);
      if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
      const i = (yy * width + xx) * 4;
      px[i] = color[0];
      px[i + 1] = color[1];
      px[i + 2] = color[2];
      px[i + 3] = 255;
    }
  }
}

export function sketchToPng(sketch: Sketch): Buffer {
  const width = 800;
  const height = 560;
  const px = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    px[i * 4] = 244;
    px[i * 4 + 1] = 239;
    px[i * 4 + 2] = 230;
    px[i * 4 + 3] = 255;
  }
  const laid = layoutSketch(sketch.points, width, height, 48);
  const walls = numberedWalls(sketch);
  for (const wall of walls) {
    const a = laid[wall.edgeIndex];
    const b = laid[(wall.edgeIndex + 1) % laid.length];
    if (!a || !b) continue;
    const steps = Math.max(Math.hypot(b.x - a.x, b.y - a.y), 1);
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      stamp(px, width, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, wall.number === 1 ? 4 : 3, wall.number === 1 ? [196, 98, 45] : [14, 59, 57]);
    }
  }
  return encodePng(width, height, px);
}

function pdfEscape(value: string): string {
  let out = "";
  for (const char of value) {
    const code = char.charCodeAt(0);
    const byte = code < 256 ? code : 63;
    if (byte === 40 || byte === 41 || byte === 92) out += `\\${String.fromCharCode(byte)}`;
    else if (byte < 32 || byte > 126) out += `\\${byte.toString(8).padStart(3, "0")}`;
    else out += String.fromCharCode(byte);
  }
  return out;
}

function pageStream(title: string, lines: string[]): string {
  const commands = ["BT", "/F1 16 Tf", "48 800 Td", `(${pdfEscape(title)}) Tj`, "/F1 11 Tf", "0 -28 Td"];
  for (const line of lines.slice(0, 42)) {
    commands.push(`(${pdfEscape(line)}) Tj`, "0 -16 Td");
  }
  commands.push("ET");
  return commands.join("\n");
}

export function textPdf(title: string, lines: string[]): Buffer {
  return pagesPdf([{ title, lines }]);
}

export function richPdf(parts: { title: string; lines: string[]; images?: { caption: string; jpeg: Buffer }[] }[]): Buffer {
  const pages: { title: string; lines: string[]; jpeg?: Buffer; width?: number; height?: number; gray?: boolean }[] = [];
  for (const part of parts.length ? parts : [{ title: "Tom", lines: [] }]) {
    pages.push({ title: part.title, lines: part.lines });
    for (const image of part.images ?? []) {
      const size = jpegSize(image.jpeg);
      if (!size) {
        pages.push({ title: part.title, lines: [`Bilde: ${image.caption}`, "Bildet kunne ikke leses."] });
        continue;
      }
      pages.push({ title: image.caption, lines: ["Bilde fra befaringen."], jpeg: image.jpeg, width: size.width, height: size.height, gray: size.gray });
    }
  }
  return buildPdf(pages);
}

function jpegSize(buffer: Buffer): { width: number; height: number; gray: boolean } | null {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) return null;
    const marker = buffer[offset + 1] ?? 0;
    if (marker === 0xd8 || marker === 0x01) {
      offset += 2;
      continue;
    }
    const length = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7), gray: buffer[offset + 9] === 1 };
    }
    offset += 2 + length;
  }
  return null;
}

export function pagesPdf(pages: { title: string; lines: string[] }[]): Buffer {
  return buildPdf(pages);
}

function buildPdf(pages: { title: string; lines: string[]; jpeg?: Buffer; width?: number; height?: number; gray?: boolean }[]): Buffer {
  const chunks = pages.length ? pages : [{ title: "Tom", lines: [] }];
  const pageIds: number[] = [];
  const contentIds: number[] = [];
  const imageIds: Array<number | null> = [];
  let nextId = 3;
  for (const page of chunks) {
    pageIds.push(nextId);
    nextId += 1;
    contentIds.push(nextId);
    nextId += 1;
    imageIds.push(page.jpeg ? nextId++ : null);
  }
  const fontId = nextId;
  const objects = new Map<number, string>();
  objects.set(1, "<< /Type /Catalog /Pages 2 0 R >>");
  objects.set(2, `<< /Type /Pages /Count ${chunks.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`);
  chunks.forEach((page, index) => {
    const imageId = imageIds[index];
    let stream = pageStream(page.title, page.lines);
    let resources = `/Font << /F1 ${fontId} 0 R >>`;
    if (page.jpeg && imageId && page.width && page.height) {
      const scale = Math.min(500 / page.width, 460 / page.height);
      const width = Math.max(1, Math.round(page.width * scale));
      const height = Math.max(1, Math.round(page.height * scale));
      stream += `\nq\n${width} 0 0 ${height} 48 220 cm\n/Im Do\nQ`;
      resources += ` /XObject << /Im ${imageId} 0 R >>`;
      const hex = page.jpeg.toString("hex");
      objects.set(
        imageId,
        `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /${page.gray ? "DeviceGray" : "DeviceRGB"} /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${hex.length + 1} >>\nstream\n${hex}>\nendstream`,
      );
    }
    objects.set(
      pageIds[index]!,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${contentIds[index]} 0 R /Resources << ${resources} >> >>`,
    );
    objects.set(contentIds[index]!, `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  });
  objects.set(fontId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const ordered = [...objects.entries()].sort((a, b) => a[0] - b[0]);
  let body = "%PDF-1.4\n";
  const offsets = new Map<number, number>();
  for (const [id, object] of ordered) {
    offsets.set(id, Buffer.byteLength(body));
    body += `${id} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(body);
  const size = fontId + 1;
  body += `xref\n0 ${size}\n`;
  body += "0000000000 65535 f \n";
  for (let id = 1; id < size; id += 1) body += `${String(offsets.get(id) ?? 0).padStart(10, "0")} 00000 n \n`;
  body += `trailer << /Size ${size} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body);
}

export function inspectionPdf(input: { title: string; lines: string[] }): Buffer {
  const measures = input.lines;
  return textPdf(input.title, measures);
}

export function measuresOf(sketch: Sketch): ReturnType<typeof roomMeasures> {
  return roomMeasures(sketch);
}
