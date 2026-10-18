export function asDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
  }
  return new Date(`${value}T00:00:00.000Z`);
}

export function isoDate(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

export function dec(value: { toNumber(): number } | number | null | undefined): number | null {
  if (value == null) return null;
  return typeof value === "number" ? value : value.toNumber();
}

export function address(parts: {
  street?: string | null;
  houseNumber?: string | null;
  postalCode?: string | null;
  city?: string | null;
}): string {
  const line = [parts.street, parts.houseNumber].filter(Boolean).join(" ");
  const place = [parts.postalCode, parts.city].filter(Boolean).join(" ");
  return [line, place].filter(Boolean).join(", ");
}
