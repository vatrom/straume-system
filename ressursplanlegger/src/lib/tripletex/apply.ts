import { prisma } from "../db";
import { isoToDate } from "../dates";
import {
  employeeCreateData,
  employeeLinkData,
  projectCreateData,
  projectUpdateData,
  type EmployeeChange,
  type ProjectChange,
} from "./import";
import { publicSyncError } from "./sync";

export async function applyProjectImports(changes: ProjectChange[]) {
  let created = 0;
  let updated = 0;
  let archived = 0;
  try {
  for (const change of changes) {
    if (change.kind === "create") {
      const data = projectCreateData(change);
      await prisma.project.create({
        data: {
          name: data.name,
          customer: data.customer,
          startDate: isoToDate(data.startDate),
          endDate: data.endDate ? isoToDate(data.endDate) : null,
          estimatedHours: data.estimatedHours,
          status: data.status,
          isExample: data.isExample,
          tripletexProjectId: data.tripletexProjectId,
          tripletexProjectNumber: data.tripletexProjectNumber,
        },
      });
      created += 1;
      continue;
    }
    if (change.kind === "keep" || change.kind === "skip") continue;
    if (change.kind !== "update") continue;
    const data = projectUpdateData(change);
    await prisma.project.update({
      where: { id: change.localId },
      data: {
        tripletexProjectId: data.tripletexProjectId,
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.customer !== undefined ? { customer: data.customer } : {}),
        ...(data.tripletexProjectNumber !== undefined ? { tripletexProjectNumber: data.tripletexProjectNumber } : {}),
        ...(data.startDate !== undefined ? { startDate: isoToDate(data.startDate) } : {}),
        ...(data.endDate !== undefined ? { endDate: isoToDate(data.endDate) } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.archived !== undefined ? { archived: data.archived } : {}),
      },
    });
    updated += 1;
    if (data.archived === true) archived += 1;
  }
  return { created, updated, archived };
  } catch (error) {
    return { created, updated, archived, error: publicSyncError(error) };
  }
}

export async function applyEmployeeImports(changes: EmployeeChange[]) {
  let linked = 0;
  let created = 0;
  let deactivated = 0;
  let removed = 0;
  let reactivated = 0;
  try {
  for (const change of changes) {
    if (change.kind === "link") {
      await prisma.resource.update({
        where: { id: change.resourceId },
        data: {
          ...employeeLinkData(change),
          ...(change.reactivate ? { active: true } : {}),
        },
      });
      linked += 1;
      if (change.reactivate) reactivated += 1;
      continue;
    }
    if (change.kind === "create") {
      await prisma.resource.create({ data: employeeCreateData(change) });
      created += 1;
      continue;
    }
    if (change.kind === "deactivate") {
      await prisma.resource.update({ where: { id: change.resourceId }, data: { active: false } });
      deactivated += 1;
      continue;
    }
    if (change.kind === "reactivate") {
      await prisma.resource.update({ where: { id: change.resourceId }, data: { active: true } });
      reactivated += 1;
      continue;
    }
    if (change.kind === "remove") {
      await prisma.resource.delete({ where: { id: change.resourceId } });
      removed += 1;
    }
  }
  return { linked, created, deactivated, removed, reactivated };
  } catch (error) {
    return { linked, created, deactivated, removed, reactivated, error: publicSyncError(error) };
  }
}
