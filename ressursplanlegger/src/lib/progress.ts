import type { IsoDate } from "./dates";
import { expandProjects, scheduleProject, type ProjectInput, type ResourceInput } from "./planning";

export type ProgressStatus = "foran" | "i rute" | "etter";

export function plannedHours(project: ProjectInput, resources: ResourceInput[], today: IsoDate) {
  let plannedToDate = 0;
  let plannedTotal = 0;
  for (const unit of expandProjects([project])) {
    const { schedule } = scheduleProject(unit, resources);
    for (const byDate of schedule.bookings.values()) {
      for (const [date, hours] of byDate) {
        plannedTotal += hours;
        if (date <= today) plannedToDate += hours;
      }
    }
  }
  return { plannedToDate, plannedTotal };
}

export function progressStatus(actualToDate: number, plannedToDate: number): ProgressStatus {
  const diff = actualToDate - plannedToDate;
  if (diff > 0.5) return "foran";
  if (diff < -0.5) return "etter";
  return "i rute";
}

export const PROGRESS_LABEL: Record<ProgressStatus, string> = {
  foran: "Foran planen",
  "i rute": "I rute",
  etter: "Etter planen",
};
