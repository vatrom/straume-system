export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

export function addDays(isoDate: string, days: number): string {
  const parts = isoDate.split("-").map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (!y || !m || !d) throw new Error(`Ugyldig dato: ${isoDate}`);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
