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

export async function applyProjectImports(changes: ProjectChange[]) {
  let created = 0;
  let updated = 0;
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
      },
    });
    updated += 1;
  }
  return { created, updated };
}

export async function applyEmployeeImports(changes: EmployeeChange[]) {
  let linked = 0;
  let created = 0;
  for (const change of changes) {
    if (change.kind === "link") {
      await prisma.resource.update({
        where: { id: change.resourceId },
        data: employeeLinkData(change),
      });
      linked += 1;
      continue;
    }
    if (change.kind !== "create") continue;
    await prisma.resource.create({ data: employeeCreateData(change) });
    created += 1;
  }
  return { linked, created };
}
