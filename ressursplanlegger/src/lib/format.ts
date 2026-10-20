import { loadRatio, type LoadLevel } from "./planning";

export function formatHours(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return new Intl.NumberFormat("nb-NO", {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 1,
    maximumFractionDigits: 1,
  }).format(rounded);
}

export function formatPercent(bookedHours: number, capacityHours: number): string {
  const ratio = loadRatio(bookedHours, capacityHours);
  if (ratio == null) return "–";
  if (!Number.isFinite(ratio)) return "over kapasitet";
  return new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(ratio * 100) + " %";
}

export const LEVEL_LABEL: Record<LoadLevel, string> = {
  free: "Ledig kapasitet",
  tight: "Nesten full",
  over: "Overbelastet",
  off: "Ingen kapasitet",
};

export function parseDecimal(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!normalized) return null;
  const number = Number(normalized);
  if (!Number.isFinite(number)) return null;
  return number;
}

export const PROJECT_COLORS = [
  "#1f6b4a",
  "#c47b2b",
  "#2f5d8c",
  "#8c3d4e",
  "#5c6b2f",
  "#3d6b6b",
  "#a65d32",
  "#4a5568",
];

export const ROLE_SUGGESTIONS = [
  "Tømrer",
  "Betongarbeider",
  "Lærling",
  "Bas",
  "Murer",
  "Forskalingssnekker",
  "Jernbinder",
  "Anleggsarbeider",
];

export const ABSENCE_REASONS = ["Ferie", "Sykdom", "Permisjon", "Kurs", "Annet"];

export const STATUS_LABEL: Record<string, string> = {
  planlagt: "Planlagt",
  pågår: "Pågår",
  ferdig: "Ferdig",
};
