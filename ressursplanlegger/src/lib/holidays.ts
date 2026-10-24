import { addDays, type IsoDate } from "./dates";

export type Holiday = {
  date: IsoDate;
  name: string;
};

/** Anonymous Gregorian algorithm. Returns Easter Sunday. */
export function easterSunday(year: number): IsoDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const cache = new Map<number, Holiday[]>();

/** Official Norwegian public holidays. Christmas Eve and New Year's Eve are not included. */
export function norwegianHolidays(year: number): Holiday[] {
  const cached = cache.get(year);
  if (cached) return cached;

  const easter = easterSunday(year);
  const holidays: Holiday[] = [
    { date: `${year}-01-01`, name: "Nyttårsdag" },
    { date: addDays(easter, -3), name: "Skjærtorsdag" },
    { date: addDays(easter, -2), name: "Langfredag" },
    { date: easter, name: "Første påskedag" },
    { date: addDays(easter, 1), name: "Andre påskedag" },
    { date: `${year}-05-01`, name: "Arbeidernes dag" },
    { date: `${year}-05-17`, name: "Grunnlovsdag" },
    { date: addDays(easter, 39), name: "Kristi himmelfartsdag" },
    { date: addDays(easter, 49), name: "Første pinsedag" },
    { date: addDays(easter, 50), name: "Andre pinsedag" },
    { date: `${year}-12-25`, name: "Første juledag" },
    { date: `${year}-12-26`, name: "Andre juledag" },
  ];
  cache.set(year, holidays);
  return holidays;
}

export function holidayName(iso: IsoDate): string | null {
  const year = Number(iso.slice(0, 4));
  const match = norwegianHolidays(year).find((holiday) => holiday.date === iso);
  return match?.name ?? null;
}

export function holidaysBetween(from: IsoDate, to: IsoDate): Holiday[] {
  const startYear = Number(from.slice(0, 4));
  const endYear = Number(to.slice(0, 4));
  const result: Holiday[] = [];
  for (let year = startYear; year <= endYear; year += 1) {
    for (const holiday of norwegianHolidays(year)) {
      if (holiday.date >= from && holiday.date <= to) result.push(holiday);
    }
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}
