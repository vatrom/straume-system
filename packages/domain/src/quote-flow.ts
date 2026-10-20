import { DomainError } from "./errors";

export const QUOTE_FLOW = ["draft", "pending_approval", "approved", "sent", "accepted", "rejected"] as const;

export type QuoteFlowStatus = (typeof QUOTE_FLOW)[number];

export const QUOTE_STATUS_LABEL: Record<QuoteFlowStatus, string> = {
  draft: "Utkast",
  pending_approval: "Til godkjenning",
  approved: "Godkjent",
  sent: "Sendt",
  accepted: "Akseptert",
  rejected: "Avslått",
};

const NEXT: Record<QuoteFlowStatus, QuoteFlowStatus[]> = {
  draft: ["pending_approval"],
  pending_approval: ["draft", "approved"],
  approved: ["sent"],
  sent: ["accepted", "rejected"],
  accepted: [],
  rejected: [],
};

export function quoteTransitions(status: QuoteFlowStatus): QuoteFlowStatus[] {
  return NEXT[status];
}

export function assertQuoteTransition(from: QuoteFlowStatus, to: QuoteFlowStatus, canApprove: boolean): void {
  if (!QUOTE_FLOW.includes(from) || !QUOTE_FLOW.includes(to)) throw new DomainError("Ukjent tilbudsstatus");
  if (!NEXT[from].includes(to)) throw new DomainError(`Kan ikke gå fra ${QUOTE_STATUS_LABEL[from]} til ${QUOTE_STATUS_LABEL[to]}`);
  if ((to === "approved" || from === "pending_approval" && to !== "draft") && to === "approved" && !canApprove) {
    throw new DomainError("Du kan ikke godkjenne tilbud");
  }
}

export function canEditQuote(status: QuoteFlowStatus): boolean {
  return status === "draft" || status === "pending_approval";
}

export function nextRevision(current: string): string {
  const letters = current.trim().toUpperCase();
  if (!/^[A-Z]+$/.test(letters)) throw new DomainError("Revisjon må være bokstaver");
  const chars = letters.split("");
  for (let i = chars.length - 1; i >= 0; i -= 1) {
    const code = chars[i]!.charCodeAt(0);
    if (code < 90) {
      chars[i] = String.fromCharCode(code + 1);
      return chars.join("");
    }
    chars[i] = "A";
  }
  return `A${chars.join("")}`;
}

export function parseApproverRoles(value: string | null | undefined): string[] {
  const roles = (value ?? "admin,kontor")
    .split(",")
    .map((role) => role.trim())
    .filter(Boolean);
  return roles.length ? roles : ["admin"];
}

export function roleCanApprove(role: string, configured: string[]): boolean {
  return configured.includes(role);
}
