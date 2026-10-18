import { DomainError } from "./errors";

export type Point = { x: number; y: number };

export type Slope = { kneeHeightM: number; ridgeHeightM: number };

export type Opening = {
  id: string;
  type: "door" | "window" | "drain";
  wallNumber: number;
  offsetM: number;
  widthM: number;
};

/** Koordinater i meter, x mot høyre og y nedover (samme som skjerm). */
export type Sketch = {
  points: Point[];
  doorEdge: number;
  ceilingHeightM: number;
  slope?: Slope | null;
  openings?: Opening[];
};

export type NumberedWall = {
  number: number;
  edgeIndex: number;
  lengthM: number;
};

export function signedArea(points: Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (!a || !b) continue;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

export function edgeLength(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function floorArea(points: Point[]): number {
  return Math.abs(signedArea(points));
}

export function perimeter(points: Point[]): number {
  let total = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (!a || !b) continue;
    total += edgeLength(a, b);
  }
  return total;
}

export function ensureClockwise(points: Point[], doorEdge: number): { points: Point[]; doorEdge: number } {
  if (points.length < 3) throw new DomainError("Et rom må ha minst tre hjørner");
  if (doorEdge < 0 || doorEdge >= points.length) throw new DomainError("Døra må ligge på en vegg");
  if (signedArea(points) < 0) {
    const n = points.length;
    const newDoor = (n - 1 - ((doorEdge + 1) % n) + n) % n;
    return { points: [...points].reverse().map((point) => ({ ...point })), doorEdge: newDoor };
  }
  return { points: points.map((point) => ({ ...point })), doorEdge };
}

export function numberedWalls(sketch: Pick<Sketch, "points" | "doorEdge">): NumberedWall[] {
  const norm = ensureClockwise(sketch.points, sketch.doorEdge);
  const n = norm.points.length;
  const walls: NumberedWall[] = [];
  for (let step = 0; step < n; step += 1) {
    const edgeIndex = (norm.doorEdge + step) % n;
    const a = norm.points[edgeIndex];
    const b = norm.points[(edgeIndex + 1) % n];
    if (!a || !b) continue;
    walls.push({ number: step + 1, edgeIndex, lengthM: edgeLength(a, b) });
  }
  return walls;
}

function axisOf(a: Point, b: Point): "h" | "v" | null {
  if (Math.abs(a.y - b.y) < 1e-8) return "h";
  if (Math.abs(a.x - b.x) < 1e-8) return "v";
  return null;
}

/**
 * Setter lengden på en vegg (nummerert med klokka fra døra).
 * Rettvinklede vegger flyttes slik at hjørnene beholdes rette.
 * Skrå vegger beholder retning; rommet holdes lukket.
 */
export function withWallLength(sketch: Sketch, wallNumber: number, newLength: number): Sketch {
  if (!(newLength > 0) || newLength > 200) throw new DomainError("Vegglengde må være mellom 0 og 200 meter");
  const norm = ensureClockwise(sketch.points, sketch.doorEdge);
  const walls = numberedWalls({ points: norm.points, doorEdge: norm.doorEdge });
  const wall = walls.find((item) => item.number === wallNumber);
  if (!wall) throw new DomainError("Ukjent vegg");
  const n = norm.points.length;
  const a = norm.points[wall.edgeIndex];
  const b = norm.points[(wall.edgeIndex + 1) % n];
  if (!a || !b) throw new DomainError("Ukjent vegg");
  const current = edgeLength(a, b);
  if (current < 1e-8) throw new DomainError("Kan ikke endre en vegg uten lengde");
  const points = norm.points.map((point) => ({ ...point }));
  const axis = axisOf(a, b);
  if (axis === "h" || axis === "v") {
    const sign = axis === "h" ? Math.sign(b.x - a.x) || 1 : Math.sign(b.y - a.y) || 1;
    const oldValue = axis === "h" ? b.x : b.y;
    const nextValue = (axis === "h" ? a.x : a.y) + sign * newLength;
    for (const point of points) {
      const value = axis === "h" ? point.x : point.y;
      if (Math.abs(value - oldValue) < 1e-6) {
        if (axis === "h") point.x = nextValue;
        else point.y = nextValue;
      }
    }
  } else {
    const scale = newLength / current;
    const b2 = { x: a.x + (b.x - a.x) * scale, y: a.y + (b.y - a.y) * scale };
    const dx = b2.x - b.x;
    const dy = b2.y - b.y;
    for (let step = 1; step < n; step += 1) {
      const index = (wall.edgeIndex + step) % n;
      const point = points[index];
      if (!point) continue;
      points[index] = { x: point.x + dx, y: point.y + dy };
    }
  }
  return { ...sketch, points, doorEdge: norm.doorEdge };
}

export function roomMeasures(sketch: Sketch): { perimeterM: number; floorAreaM: number; ceilingHeightM: number } {
  const norm = ensureClockwise(sketch.points, sketch.doorEdge);
  if (!(sketch.ceilingHeightM > 0) || sketch.ceilingHeightM > 20) {
    throw new DomainError("Romhøyde må være mellom 0 og 20 meter");
  }
  return {
    perimeterM: round3(perimeter(norm.points)),
    floorAreaM: round3(floorArea(norm.points)),
    ceilingHeightM: round3(sketch.ceilingHeightM),
  };
}

export function assertSlope(slope: Slope): Slope {
  if (!(slope.kneeHeightM > 0) || !(slope.ridgeHeightM > 0)) {
    throw new DomainError("Knelhøyde og mønehøyde må være større enn 0");
  }
  if (slope.ridgeHeightM + 1e-9 < slope.kneeHeightM) {
    throw new DomainError("Mønehøyde kan ikke være lavere enn knelhøyde");
  }
  return { kneeHeightM: round3(slope.kneeHeightM), ridgeHeightM: round3(slope.ridgeHeightM) };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function layoutSketch(points: Point[], width: number, height: number, pad = 28): Point[] {
  if (points.length === 0) return [];
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 0.01);
  const spanY = Math.max(maxY - minY, 0.01);
  const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY);
  const usedW = spanX * scale;
  const usedH = spanY * scale;
  const ox = (width - usedW) / 2;
  const oy = (height - usedH) / 2;
  return points.map((point) => ({
    x: ox + (point.x - minX) * scale,
    y: oy + (point.y - minY) * scale,
  }));
}

export function screenToMeter(px: number, py: number, points: Point[], width: number, height: number, pad = 28): Point {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 0.01);
  const spanY = Math.max(maxY - minY, 0.01);
  const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY);
  const usedW = spanX * scale;
  const usedH = spanY * scale;
  const ox = (width - usedW) / 2;
  const oy = (height - usedH) / 2;
  return { x: minX + (px - ox) / scale, y: minY + (py - oy) / scale };
}

function esc(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function sketchToSvg(sketch: Sketch, label = "Rom"): string {
  const norm = ensureClockwise(sketch.points, sketch.doorEdge);
  const width = 640;
  const height = 420;
  const laid = layoutSketch(norm.points, width, height, 46);
  const poly = laid.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const walls = numberedWalls({ points: norm.points, doorEdge: norm.doorEdge });
  const measures = roomMeasures({ ...sketch, points: norm.points, doorEdge: norm.doorEdge });
  const labels = walls
    .map((wall) => {
      const a = laid[wall.edgeIndex];
      const b = laid[(wall.edgeIndex + 1) % laid.length];
      if (!a || !b) return "";
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const door = wall.number === 1 ? " · dør" : "";
      return `<text x="${mx.toFixed(1)}" y="${(my - 8).toFixed(1)}" text-anchor="middle" font-size="13" font-family="sans-serif" fill="#1e1a16">V${wall.number}${door} ${wall.lengthM.toFixed(2)} m</text>`;
    })
    .join("");
  const slope = sketch.slope
    ? ` · skråtak kne ${sketch.slope.kneeHeightM.toFixed(2)} m / møne ${sketch.slope.ridgeHeightM.toFixed(2)} m`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#f4efe6"/>
  <polygon points="${poly}" fill="#fffdf8" stroke="#0e3b39" stroke-width="3"/>
  ${labels}
  <text x="24" y="28" font-size="16" font-family="sans-serif" fill="#0e3b39">${esc(label)}</text>
  <text x="24" y="${height - 18}" font-size="13" font-family="sans-serif" fill="#1e1a16">Omkrets ${measures.perimeterM.toFixed(2)} m · gulv ${measures.floorAreaM.toFixed(2)} m² · høyde ${measures.ceilingHeightM.toFixed(2)} m${esc(slope)}</text>
</svg>`;
}

export function sectionToSvg(input: { widthM: number; kneeHeightM: number; ridgeHeightM: number }): string {
  const slope = assertSlope({ kneeHeightM: input.kneeHeightM, ridgeHeightM: input.ridgeHeightM });
  const width = 640;
  const height = 280;
  const pad = 36;
  const scale = Math.min((width - pad * 2) / Math.max(input.widthM, 0.1), (height - pad * 2) / slope.ridgeHeightM);
  const x0 = (width - input.widthM * scale) / 2;
  const base = height - pad;
  const y = (meters: number) => base - meters * scale;
  const x1 = x0 + input.widthM * scale;
  const mid = (x0 + x1) / 2;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#f4efe6"/>
  <polyline points="${x0.toFixed(1)},${y(0).toFixed(1)} ${x0.toFixed(1)},${y(slope.kneeHeightM).toFixed(1)} ${mid.toFixed(1)},${y(slope.ridgeHeightM).toFixed(1)} ${x1.toFixed(1)},${y(slope.kneeHeightM).toFixed(1)} ${x1.toFixed(1)},${y(0).toFixed(1)}" fill="#fffdf8" stroke="#0e3b39" stroke-width="3"/>
  <text x="24" y="28" font-size="16" font-family="sans-serif" fill="#0e3b39">Snitt · skråtak</text>
  <text x="24" y="${height - 16}" font-size="13" font-family="sans-serif" fill="#1e1a16">Knelhøyde ${slope.kneeHeightM.toFixed(2)} m · møne ${slope.ridgeHeightM.toFixed(2)} m · bredde ${input.widthM.toFixed(2)} m</text>
</svg>`;
}
