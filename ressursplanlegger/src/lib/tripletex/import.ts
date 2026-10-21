import { norm } from "./match";
import type { TripletexEmployee, TripletexProject } from "./types";

export const TRIPLETEX_SETUP_LABEL = "Ny fra Tripletex – mangler timeverk/ressurser";

export type LocalProject = {
  id: string;
  name: string;
  customer: string;
  tripletexProjectId: number | null;
  tripletexProjectNumber: string;
  startDate: string;
  endDate: string | null;
  status: string;
};

export type LocalResource = {
  id: string;
  name: string;
  tripletexEmployeeId: number | null;
};

export type ProjectChange =
  | {
      kind: "create";
      tripletexProjectId: number;
      name: string;
      customer: string;
      number: string;
      startDate: string;
      endDate: string | null;
      status: "planlagt";
    }
  | {
      kind: "update";
      localId: string;
      tripletexProjectId: number;
      name?: string;
      customer?: string;
      number?: string;
      startDate?: string;
      endDate?: string;
      status?: "ferdig";
    }
  | { kind: "skip"; tripletexProjectId: number; reason: "closed" };

export type EmployeeChange =
  | { kind: "link"; resourceId: string; tripletexEmployeeId: number }
  | { kind: "create"; tripletexEmployeeId: number; name: string }
  | { kind: "skip"; tripletexEmployeeId: number; reason: "linked" | "possible-duplicate" };

function projectUpdate(local: LocalProject, item: TripletexProject): ProjectChange | null {
  const change: Extract<ProjectChange, { kind: "update" }> = {
    kind: "update",
    localId: local.id,
    tripletexProjectId: item.id,
  };
  const name = item.name.trim();
  if (name && name !== local.name) change.name = name;
  const customer = item.customer.trim();
  if (customer && customer !== local.customer) change.customer = customer;
  if (item.number && item.number !== local.tripletexProjectNumber) change.number = item.number;
  if (item.startDate && item.startDate !== local.startDate) change.startDate = item.startDate;
  if (item.endDate && item.endDate !== local.endDate) change.endDate = item.endDate;
  if (item.closed && local.status !== "tentativ" && local.status !== "ferdig") change.status = "ferdig";
  const linking = local.tripletexProjectId !== item.id;
  const changed =
    change.name !== undefined ||
    change.customer !== undefined ||
    change.number !== undefined ||
    change.startDate !== undefined ||
    change.endDate !== undefined ||
    change.status !== undefined;
  if (!linking && !changed) return null;
  return change;
}

export function planProjectImports(
  remote: TripletexProject[],
  local: LocalProject[],
  fallbackToday: string,
): ProjectChange[] {
  const byId = new Map<number, LocalProject>();
  for (const project of local) {
    if (project.tripletexProjectId != null) byId.set(project.tripletexProjectId, project);
  }
  const used = new Set<string>();
  const changes: ProjectChange[] = [];
  for (const item of remote) {
    const linked = byId.get(item.id);
    if (linked) {
      used.add(linked.id);
      const change = projectUpdate(linked, item);
      if (change) changes.push(change);
      continue;
    }
    const byNumber = item.number
      ? local.find(
          (project) =>
            !used.has(project.id) &&
            project.tripletexProjectId == null &&
            project.tripletexProjectNumber === item.number,
        )
      : undefined;
    if (byNumber) {
      used.add(byNumber.id);
      const change = projectUpdate(byNumber, item);
      if (change) changes.push(change);
      continue;
    }
    if (item.closed) {
      changes.push({ kind: "skip", tripletexProjectId: item.id, reason: "closed" });
      continue;
    }
    changes.push({
      kind: "create",
      tripletexProjectId: item.id,
      name: item.name.trim() || `Prosjekt ${item.number || item.id}`,
      customer: item.customer.trim(),
      number: item.number,
      startDate: item.startDate ?? fallbackToday,
      endDate: item.endDate,
      status: "planlagt",
    });
  }
  return changes;
}

export function projectCreateData(change: Extract<ProjectChange, { kind: "create" }>) {
  return {
    name: change.name,
    customer: change.customer,
    startDate: change.startDate,
    endDate: change.endDate,
    estimatedHours: 0,
    status: "planlagt" as const,
    isExample: false,
    tripletexProjectId: change.tripletexProjectId,
    tripletexProjectNumber: change.number,
  };
}

export function projectUpdateData(change: Extract<ProjectChange, { kind: "update" }>) {
  return {
    tripletexProjectId: change.tripletexProjectId,
    ...(change.name !== undefined ? { name: change.name } : {}),
    ...(change.customer !== undefined ? { customer: change.customer } : {}),
    ...(change.number !== undefined ? { tripletexProjectNumber: change.number } : {}),
    ...(change.startDate !== undefined ? { startDate: change.startDate } : {}),
    ...(change.endDate !== undefined ? { endDate: change.endDate } : {}),
    ...(change.status !== undefined ? { status: change.status } : {}),
  };
}

export function planEmployeeImports(remote: TripletexEmployee[], local: LocalResource[]): EmployeeChange[] {
  const taken = new Set(local.filter((resource) => resource.tripletexEmployeeId != null).map((resource) => resource.id));
  const changes: EmployeeChange[] = [];
  for (const employee of remote) {
    if (employee.isContact) continue;
    if (local.some((resource) => resource.tripletexEmployeeId === employee.id)) {
      changes.push({ kind: "skip", tripletexEmployeeId: employee.id, reason: "linked" });
      continue;
    }
    const name = norm(`${employee.firstName} ${employee.lastName}`);
    const exact = name
      ? local.find((resource) => !taken.has(resource.id) && norm(resource.name) === name)
      : undefined;
    if (exact) {
      taken.add(exact.id);
      changes.push({ kind: "link", resourceId: exact.id, tripletexEmployeeId: employee.id });
      continue;
    }
    const partial =
      Boolean(name) &&
      local.some((resource) => {
        const localName = norm(resource.name);
        if (!localName || localName === name) return false;
        return localName.includes(name) || name.includes(localName);
      });
    const nameTaken = Boolean(name) && local.some((resource) => norm(resource.name) === name);
    if (partial || nameTaken) {
      changes.push({ kind: "skip", tripletexEmployeeId: employee.id, reason: "possible-duplicate" });
      continue;
    }
    changes.push({
      kind: "create",
      tripletexEmployeeId: employee.id,
      name: `${employee.firstName} ${employee.lastName}`.trim() || `Ansatt ${employee.id}`,
    });
  }
  return changes;
}

export function employeeCreateData(change: Extract<EmployeeChange, { kind: "create" }>) {
  return {
    name: change.name,
    role: "Ukjent",
    weeklyCapacityHours: 37.5,
    tripletexEmployeeId: change.tripletexEmployeeId,
  };
}

export function employeeLinkData(change: Extract<EmployeeChange, { kind: "link" }>) {
  return { tripletexEmployeeId: change.tripletexEmployeeId };
}

export function needsTripletexSetup(project: {
  tripletexProjectId: number | null;
  estimatedHours: number;
  assignments: readonly { resourceId: string }[];
  phases?: readonly { assignments: readonly { resourceId: string }[] }[];
}): boolean {
  if (project.tripletexProjectId == null) return false;
  const people =
    project.assignments.length +
    (project.phases ?? []).reduce((sum, phase) => sum + phase.assignments.length, 0);
  return project.estimatedHours <= 0 || people === 0;
}
