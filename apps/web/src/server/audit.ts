import { prisma } from "@straume/db";

export async function audit(actorId: string | null, action: string, entityType: string, entityId?: string | null, payload?: unknown): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId,
      action,
      entityType,
      entityId: entityId ?? null,
      payload: payload === undefined ? undefined : (payload as object),
    },
  });
}
