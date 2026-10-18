export function nok(value: number | null | undefined) {
  return new Intl.NumberFormat("nb-NO", { style: "currency", currency: "NOK", maximumFractionDigits: 0 }).format(value ?? 0);
}

export function meters(value: number | null | undefined) {
  if (value == null) return "–";
  return `${value.toLocaleString("nb-NO", { maximumFractionDigits: 2 })} m`;
}
