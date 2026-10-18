import { DomainError } from "./errors";

export type StageRecord = {
  id: string;
  pipelineId: string;
  name: string;
  sortOrder: number;
  probability: number;
  rottenDays: number | null;
};

export type PhaseRecord = {
  id: string;
  boardId: string;
  name: string;
  sortOrder: number;
};

function cleanName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new DomainError("Navnet kan ikke være tomt");
  if (trimmed.length > 80) throw new DomainError("Navnet er for langt");
  return trimmed;
}

export function assertProbability(probability: number): void {
  if (!Number.isInteger(probability) || probability < 0 || probability > 100) {
    throw new DomainError("Sannsynlighet må være et heltall fra 0 til 100");
  }
}

export function assertRottenDays(rottenDays: number | null): void {
  if (rottenDays == null) return;
  if (!Number.isInteger(rottenDays) || rottenDays < 1 || rottenDays > 3650) {
    throw new DomainError("Stagnasjonsdager må være tomt eller et heltall fra 1 til 3650");
  }
}

function assertUniqueName(names: string[], name: string, ignoreId?: string, rows?: { id: string; name: string }[]): void {
  const clash = (rows ?? names.map((n) => ({ id: "", name: n }))).some(
    (row) => row.id !== ignoreId && row.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (clash) throw new DomainError("Navnet er allerede i bruk");
}

export function createStage(
  existing: StageRecord[],
  input: { id: string; pipelineId: string; name: string; probability: number; rottenDays: number | null },
): StageRecord[] {
  const name = cleanName(input.name);
  assertUniqueName([], name, undefined, existing);
  assertProbability(input.probability);
  assertRottenDays(input.rottenDays);
  const sortOrder = existing.reduce((max, stage) => Math.max(max, stage.sortOrder), -1) + 1;
  return [...existing, { ...input, name, sortOrder }];
}

export function updateStage(
  existing: StageRecord[],
  id: string,
  patch: { name?: string; probability?: number; rottenDays?: number | null },
): StageRecord[] {
  const current = existing.find((stage) => stage.id === id);
  if (!current) throw new DomainError("Fant ikke fasen");
  const name = patch.name == null ? current.name : cleanName(patch.name);
  assertUniqueName([], name, id, existing);
  const probability = patch.probability ?? current.probability;
  const rottenDays = patch.rottenDays === undefined ? current.rottenDays : patch.rottenDays;
  assertProbability(probability);
  assertRottenDays(rottenDays);
  return existing.map((stage) => (stage.id === id ? { ...stage, name, probability, rottenDays } : stage));
}

export function reorderStages(existing: StageRecord[], orderedIds: string[]): StageRecord[] {
  if (orderedIds.length !== existing.length) {
    throw new DomainError("Rekkefølgen må inneholde alle faser");
  }
  if (new Set(orderedIds).size !== orderedIds.length) {
    throw new DomainError("Rekkefølgen har duplikater");
  }
  const byId = new Map(existing.map((stage) => [stage.id, stage]));
  return orderedIds.map((id, index) => {
    const stage = byId.get(id);
    if (!stage) throw new DomainError("Ukjent fase i rekkefølgen");
    return { ...stage, sortOrder: index };
  });
}

export function deleteStage(existing: StageRecord[], id: string, dealCount: number): StageRecord[] {
  if (!existing.some((stage) => stage.id === id)) throw new DomainError("Fant ikke fasen");
  if (existing.length <= 1) throw new DomainError("Pipelinen må ha minst én fase");
  if (dealCount > 0) {
    throw new DomainError("Fasen har salgsavtaler og kan ikke slettes. Flytt avtalene først.");
  }
  return existing
    .filter((stage) => stage.id !== id)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((stage, index) => ({ ...stage, sortOrder: index }));
}

export function assertCanDeletePipeline(dealCount: number): void {
  if (dealCount > 0) throw new DomainError("Pipelinen har salgsavtaler og kan ikke slettes");
}

export function createPhase(existing: PhaseRecord[], input: { id: string; boardId: string; name: string }): PhaseRecord[] {
  const name = cleanName(input.name);
  assertUniqueName([], name, undefined, existing);
  const sortOrder = existing.reduce((max, phase) => Math.max(max, phase.sortOrder), -1) + 1;
  return [...existing, { ...input, name, sortOrder }];
}

export function updatePhase(existing: PhaseRecord[], id: string, name: string): PhaseRecord[] {
  if (!existing.some((phase) => phase.id === id)) throw new DomainError("Fant ikke fasen");
  const cleaned = cleanName(name);
  assertUniqueName([], cleaned, id, existing);
  return existing.map((phase) => (phase.id === id ? { ...phase, name: cleaned } : phase));
}

export function reorderPhases(existing: PhaseRecord[], orderedIds: string[]): PhaseRecord[] {
  if (orderedIds.length !== existing.length || new Set(orderedIds).size !== orderedIds.length) {
    throw new DomainError("Rekkefølgen må inneholde hver fase én gang");
  }
  const byId = new Map(existing.map((phase) => [phase.id, phase]));
  return orderedIds.map((id, index) => {
    const phase = byId.get(id);
    if (!phase) throw new DomainError("Ukjent fase i rekkefølgen");
    return { ...phase, sortOrder: index };
  });
}

export function deletePhase(existing: PhaseRecord[], id: string, projectCount: number): PhaseRecord[] {
  if (!existing.some((phase) => phase.id === id)) throw new DomainError("Fant ikke fasen");
  if (existing.length <= 1) throw new DomainError("Tavlen må ha minst én fase");
  if (projectCount > 0) {
    throw new DomainError("Fasen har prosjekter og kan ikke slettes. Flytt prosjektene først.");
  }
  return existing
    .filter((phase) => phase.id !== id)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((phase, index) => ({ ...phase, sortOrder: index }));
}
