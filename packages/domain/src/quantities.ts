import { floorArea, perimeter, type Opening, type Sketch } from "./geometry";

export type QuantityContext = {
  omkrets: number;
  romhoyde: number;
  takhoyde: number;
  gulvareal: number;
  /** Brutto vegg: omkrets × takhøyde, uten fradrag. */
  veggarealBrutto: number;
  /** Netto vegg: brutto minus dør og vindu, pluss gavlvegger ved skråtak. */
  veggareal: number;
  apninger: number;
  /** Himlingsflate. Ved skråtak er dette overflaten, ikke planarealet. */
  himlingsareal: number;
  skrataak: number;
  /**
   * Flisareal slik regnearket regner det: gulv + omkrets × høyde, uten fradrag for dør/vindu.
   * Netto vegg ligger i `veggareal` og brukes når en formel ber om det.
   */
  flisareal: number;
  gipshimling: number;
  gipsvegger: number;
  assumptions: string[];
};

export type OpeningMeasure = {
  type: "door" | "window" | "drain";
  widthM: number;
  heightM?: number | null;
};

const DOOR_HEIGHT_M = 2.1;
const WINDOW_HEIGHT_M = 1.2;

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function quantityContext(input: {
  perimeterM: number;
  ceilingHeightM: number;
  floorAreaM: number;
  openings?: OpeningMeasure[];
  slope?: { kneeHeightM: number; ridgeHeightM: number; spanM?: number | null } | null;
}): QuantityContext {
  const omkrets = round3(input.perimeterM);
  const romhoyde = round3(input.ceilingHeightM);
  const gulvareal = round3(input.floorAreaM);
  const assumptions: string[] = [];
  let apninger = 0;
  for (const opening of input.openings ?? []) {
    if (opening.type === "drain") continue;
    const width = opening.widthM;
    if (!(width > 0)) continue;
    let height = opening.heightM ?? null;
    if (height == null || !(height > 0)) {
      height = opening.type === "door" ? Math.min(DOOR_HEIGHT_M, romhoyde) : Math.min(WINDOW_HEIGHT_M, romhoyde);
      assumptions.push(
        opening.type === "door"
          ? `Dørhøyde er ikke målt og er satt til ${height.toLocaleString("nb-NO")} m.`
          : `Vindushøyde er ikke målt og er satt til ${height.toLocaleString("nb-NO")} m.`,
      );
    }
    apninger += width * height;
  }
  apninger = round3(apninger);
  const veggarealBrutto = round3(omkrets * romhoyde);
  let gable = 0;
  let himlingsareal = gulvareal;
  let skrataak = 0;
  const slope = input.slope;
  if (slope && slope.ridgeHeightM > slope.kneeHeightM + 1e-6) {
    const span = slope.spanM && slope.spanM > 0 ? slope.spanM : null;
    if (span) {
      const rise = slope.ridgeHeightM - slope.kneeHeightM;
      const run = span / 2;
      const factor = Math.hypot(run, rise) / run;
      himlingsareal = round3(gulvareal * factor);
      skrataak = himlingsareal;
      gable = round3(span * rise);
      assumptions.push("Skråtak: himlingsarealet er overflaten, og gavlveggene er lagt til veggarealet.");
    } else {
      assumptions.push("Skråtak er registrert uten spennvidde, så himlingen følger gulvarealet.");
    }
  }
  const veggareal = round3(Math.max(0, veggarealBrutto - apninger + gable));
  const flisareal = round3(gulvareal + veggarealBrutto);
  return {
    omkrets,
    romhoyde,
    takhoyde: romhoyde,
    gulvareal,
    veggarealBrutto,
    veggareal,
    apninger,
    himlingsareal,
    skrataak,
    flisareal,
    gipshimling: gulvareal,
    gipsvegger: 0,
    assumptions,
  };
}

export function contextFromSketch(sketch: Sketch, openings?: OpeningMeasure[]): QuantityContext {
  const points = sketch.points;
  const span = boundingSpan(points);
  return quantityContext({
    perimeterM: perimeter(points),
    ceilingHeightM: sketch.ceilingHeightM,
    floorAreaM: floorArea(points),
    openings: openings ?? sketch.openings?.map(openingMeasure),
    slope: sketch.slope ? { ...sketch.slope, spanM: span } : null,
  });
}

function openingMeasure(opening: Opening): OpeningMeasure {
  return { type: opening.type, widthM: opening.widthM };
}

function boundingSpan(points: { x: number; y: number }[]): number | null {
  if (points.length < 2) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const width = Math.max(...xs) - Math.min(...xs);
  const depth = Math.max(...ys) - Math.min(...ys);
  const span = Math.min(width, depth);
  return span > 0 ? span : null;
}

type Token =
  | { type: "num"; value: number }
  | { type: "id"; value: string }
  | { type: "op"; value: "+" | "-" | "*" | "/" }
  | { type: "lp" }
  | { type: "rp" };

function tokenize(formula: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < formula.length) {
    const char = formula[i]!;
    if (char === " " || char === "\t") {
      i += 1;
      continue;
    }
    if (char === "(") {
      tokens.push({ type: "lp" });
      i += 1;
      continue;
    }
    if (char === ")") {
      tokens.push({ type: "rp" });
      i += 1;
      continue;
    }
    if (char === "+" || char === "-" || char === "*" || char === "/") {
      tokens.push({ type: "op", value: char });
      i += 1;
      continue;
    }
    if ((char >= "0" && char <= "9") || char === ".") {
      let end = i + 1;
      while (end < formula.length && /[0-9.]/.test(formula[end]!)) end += 1;
      const value = Number(formula.slice(i, end));
      if (!Number.isFinite(value)) return null;
      tokens.push({ type: "num", value });
      i = end;
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      let end = i + 1;
      while (end < formula.length && /[A-Za-z0-9_]/.test(formula[end]!)) end += 1;
      tokens.push({ type: "id", value: formula.slice(i, end) });
      i = end;
      continue;
    }
    return null;
  }
  return tokens;
}

export function quantityVars(ctx: QuantityContext): Record<string, number> {
  return {
    omkrets: ctx.omkrets,
    romhoyde: ctx.romhoyde,
    takhoyde: ctx.takhoyde,
    gulvareal: ctx.gulvareal,
    veggareal: ctx.veggareal,
    veggareal_brutto: ctx.veggarealBrutto,
    apninger: ctx.apninger,
    himlingsareal: ctx.himlingsareal,
    skrataak: ctx.skrataak,
    flisareal: ctx.flisareal,
    gipshimling: ctx.gipshimling,
    gipsvegger: ctx.gipsvegger,
  };
}

export function evalQuantity(formula: string | null | undefined, ctx: QuantityContext): number | null {
  if (!formula?.trim() || formula.startsWith("excel:")) return null;
  const tokens = tokenize(formula.trim());
  if (!tokens || tokens.length === 0) return null;
  let index = 0;
  const peek = () => tokens[index];
  const parseExpr = (): number | null => {
    let left = parseTerm();
    if (left == null) return null;
    while (peek()?.type === "op" && (peek() as { value: string }).value.match(/^[+-]$/)) {
      const op = (tokens[index] as { value: "+" | "-" }).value;
      index += 1;
      const right = parseTerm();
      if (right == null) return null;
      left = op === "+" ? left + right : left - right;
    }
    return left;
  };
  const parseTerm = (): number | null => {
    let left = parseUnary();
    if (left == null) return null;
    while (peek()?.type === "op" && ((peek() as { value: string }).value === "*" || (peek() as { value: string }).value === "/")) {
      const op = (tokens[index] as { value: "*" | "/" }).value;
      index += 1;
      const right = parseUnary();
      if (right == null) return null;
      if (op === "/" && right === 0) return null;
      left = op === "*" ? left * right : left / right;
    }
    return left;
  };
  const parseUnary = (): number | null => {
    if (peek()?.type === "op" && (peek() as { value: string }).value === "-") {
      index += 1;
      const value = parseUnary();
      return value == null ? null : -value;
    }
    return parsePrimary();
  };
  const parsePrimary = (): number | null => {
    const token = peek();
    if (!token) return null;
    if (token.type === "num") {
      index += 1;
      return token.value;
    }
    if (token.type === "id") {
      index += 1;
      const value = quantityVars(ctx)[token.value];
      if (typeof value !== "number") return null;
      return value;
    }
    if (token.type === "lp") {
      index += 1;
      const value = parseExpr();
      if (peek()?.type !== "rp") return null;
      index += 1;
      return value;
    }
    return null;
  };
  const value = parseExpr();
  if (value == null || index !== tokens.length || !Number.isFinite(value)) return null;
  return round3(value);
}
