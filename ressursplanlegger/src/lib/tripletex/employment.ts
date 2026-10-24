import { addDays, type IsoDate } from "../dates";
import type { TripletexEmployee, TripletexEmployment } from "./types";

/** Employed on the sync day. The timesheet window is wider and is not used here. */
export function employmentWindow(today: IsoDate): { from: IsoDate; to: IsoDate } {
  return { from: today, to: addDays(today, 1) };
}

/** Inclusive start, inclusive end. `to` is exclusive, matching the timesheet dateTo style. */
export function employmentOverlaps(
  employment: { startDate: string | null; endDate: string | null },
  from: string,
  to: string,
): boolean {
  const start = employment.startDate ?? "0000-01-01";
  if (start >= to) return false;
  if (employment.endDate && employment.endDate < from) return false;
  return true;
}

/**
 * Timeliste-regelen: ansatt = ikke kontakt, med en ansettelse som overlapper dagen.
 * `allowInformationRegistration` sier bare om timer kan føres på brukeren, så den
 * er ikke et krav. `noEmploymentRelationship` er pensjon/ytelse uten ansettelse.
 */
export function selectCurrentEmployees(
  employees: TripletexEmployee[],
  employments: TripletexEmployment[],
  from: string,
  to: string,
): TripletexEmployee[] {
  const activeIds = new Set<number>();
  for (const job of employments) {
    if (job.noEmploymentRelationship) continue;
    if (employmentOverlaps(job, from, to)) activeIds.add(job.employeeId);
  }
  return employees.filter(
    (employee) => !employee.isContact && employee.isProxy !== true && activeIds.has(employee.id),
  );
}
