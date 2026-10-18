/** Fagrekkefølge i tilbudet og regnearket (Tilbud_MAL / Regneark). */
export const TRADES = [
  { code: "riving", name: "Riving", sort: 1 },
  { code: "tomrer", name: "Tømrer", sort: 2 },
  { code: "elektriker", name: "Elektriker", sort: 3 },
  { code: "rorlegger", name: "Rørlegger", sort: 4 },
  { code: "murer", name: "Murer/flis", sort: 5 },
  { code: "maler", name: "Maler", sort: 6 },
  { code: "annet", name: "Annet/tillegg", sort: 7 },
] as const;

export type TradeCode = (typeof TRADES)[number]["code"];

export const TRADE_CODES: TradeCode[] = TRADES.map((t) => t.code);

const CODE_PREFIX: Record<string, string> = {
  riving: "RIV",
  tomrer: "TOM",
  elektriker: "EL",
  rorlegger: "ROR",
  murer: "MUR",
  maler: "MAL",
  annet: "ANN",
};

export function priceItemCode(category: string, sort: number): string {
  const prefix = CODE_PREFIX[category];
  if (!prefix) throw new Error(`Ukjent kategori: ${category}`);
  return `${prefix}-${String(sort).padStart(3, "0")}`;
}

export function tradeName(code: string): string {
  return TRADES.find((t) => t.code === code)?.name ?? code;
}
