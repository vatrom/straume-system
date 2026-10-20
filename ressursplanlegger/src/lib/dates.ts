export type IsoDate = string;

export function todayIso(timeZone = "Europe/Oslo"): IsoDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function parseIso(iso: IsoDate): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function formatIso(date: Date): IsoDate {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateToIso(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

export function isoToDate(iso: IsoDate): Date {
  return parseIso(iso);
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  const date = parseIso(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return formatIso(date);
}

export function compareIso(a: IsoDate, b: IsoDate): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function minIso(a: IsoDate, b: IsoDate): IsoDate {
  return a <= b ? a : b;
}

export function maxIso(a: IsoDate, b: IsoDate): IsoDate {
  return a >= b ? a : b;
}

export function eachDate(start: IsoDate, end: IsoDate): IsoDate[] {
  if (end < start) return [];
  const dates: IsoDate[] = [];
  let cursor = start;
  while (cursor <= end) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

/** 1 = Monday … 7 = Sunday */
export function isoWeekday(iso: IsoDate): number {
  const day = parseIso(iso).getUTCDay();
  return day === 0 ? 7 : day;
}

export function isWeekend(iso: IsoDate): boolean {
  const day = isoWeekday(iso);
  return day === 6 || day === 7;
}

export function mondayOf(iso: IsoDate): IsoDate {
  return addDays(iso, -(isoWeekday(iso) - 1));
}

export function sundayOf(iso: IsoDate): IsoDate {
  return addDays(mondayOf(iso), 6);
}

export function isoWeek(iso: IsoDate): { weekYear: number; week: number } {
  const date = parseIso(iso);
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const weekYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { weekYear, week };
}

export function weekId(iso: IsoDate): string {
  const { weekYear, week } = isoWeek(iso);
  return `${weekYear}-W${String(week).padStart(2, "0")}`;
}

export type WeekSpan = {
  id: string;
  weekYear: number;
  week: number;
  monday: IsoDate;
  sunday: IsoDate;
};

export function weeksCovering(from: IsoDate, to: IsoDate): WeekSpan[] {
  const weeks: WeekSpan[] = [];
  let monday = mondayOf(from);
  const last = mondayOf(to);
  while (monday <= last) {
    const { weekYear, week } = isoWeek(monday);
    weeks.push({
      id: `${weekYear}-W${String(week).padStart(2, "0")}`,
      weekYear,
      week,
      monday,
      sunday: addDays(monday, 6),
    });
    monday = addDays(monday, 7);
  }
  return weeks;
}

export function formatNorwegian(iso: IsoDate): string {
  const [year, month, day] = iso.split("-");
  return `${day}.${month}.${year}`;
}

export function formatShort(iso: IsoDate): string {
  const [, month, day] = iso.split("-");
  return `${day}.${month}`;
}

const SHORT_WEEKDAYS = ["", "ma", "ti", "on", "to", "fr", "lø", "sø"];

export function weekdayShort(iso: IsoDate): string {
  return SHORT_WEEKDAYS[isoWeekday(iso)];
}

export function weekdayLabel(iso: IsoDate, width: "long" | "short" = "short"): string {
  return new Intl.DateTimeFormat("nb-NO", {
    weekday: width,
    timeZone: "UTC",
  }).format(parseIso(iso));
}

export function isValidIso(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return formatIso(parseIso(value)) === value;
}
