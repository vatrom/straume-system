export type DealStatusName = "open" | "won" | "lost";

const DAY_MS = 86_400_000;

/**
 * En åpen avtale stagnerer når den har ligget i fasen i minst `rottenDays` hele døgn.
 * Vunnet, tapt og faser uten rottenDays stagnerer aldri.
 */
export function isDealRotten(input: {
  status: DealStatusName;
  stageEnteredAt: Date;
  rottenDays: number | null;
  now: Date;
}): boolean {
  if (input.status !== "open") return false;
  if (input.rottenDays == null) return false;
  const elapsedDays = (input.now.getTime() - input.stageEnteredAt.getTime()) / DAY_MS;
  return elapsedDays >= input.rottenDays;
}

export function fullDaysInStage(stageEnteredAt: Date, now: Date): number {
  const elapsed = now.getTime() - stageEnteredAt.getTime();
  if (elapsed <= 0) return 0;
  return Math.floor(elapsed / DAY_MS);
}
