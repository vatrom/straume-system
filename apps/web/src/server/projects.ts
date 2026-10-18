import { prisma, type ChangeOrderStatus, type DocumentVisibility, type ProjectStatus } from "@straume/db";
import { assertRottenDays, createPhase, deletePhase, DomainError, isDealRotten, projectForAudience, reorderPhases, updatePhase, type ProjectBundle } from "@straume/domain";
import { audit } from "./audit";
import { address, asDate, dec, isoDate } from "./dates";
import { assertAdmin } from "./roles";
import { buildWinnerMail } from "@straume/domain";
import { mailProvider } from "./mail";
import { inspectionPdf, sketchToPng } from "./sketch-files";
import { putObject } from "./store";
import type { Sketch } from "@straume/domain";

export async function listBoards() {
  return prisma.projectBoard.findMany({
    orderBy: { sortOrder: "asc" },
    include: { phases: { orderBy: { sortOrder: "asc" } } },
  });
}

export async function addPhase(user: { id: string; role: string }, boardId: string, name: string, rottenDays?: number | null) {
  assertAdmin(user);
  if (rottenDays !== undefined) assertRottenDays(rottenDays);
  const existing = await prisma.projectPhase.findMany({ where: { boardId } });
  const id = crypto.randomUUID();
  const next = createPhase(existing, { id, boardId, name });
  const created = next.find((phase) => phase.id === id)!;
  await prisma.projectPhase.create({ data: { ...created, rottenDays: rottenDays ?? null } });
  await audit(user.id, "phase.create", "phase", id);
  return { ...created, rottenDays: rottenDays ?? null };
}

export async function editPhase(user: { id: string; role: string }, id: string, name: string, rottenDays?: number | null) {
  assertAdmin(user);
  if (rottenDays !== undefined) assertRottenDays(rottenDays);
  const current = await prisma.projectPhase.findUnique({ where: { id } });
  if (!current) throw new DomainError("Fant ikke fasen");
  const existing = await prisma.projectPhase.findMany({ where: { boardId: current.boardId } });
  const next = updatePhase(existing, id, name);
  const updated = next.find((phase) => phase.id === id)!;
  await prisma.projectPhase.update({ where: { id }, data: { name: updated.name, rottenDays: rottenDays === undefined ? undefined : rottenDays } });
  await audit(user.id, "phase.update", "phase", id, { name: updated.name, rottenDays });
  return { ...updated, rottenDays: rottenDays === undefined ? current.rottenDays : rottenDays };
}

export async function removePhase(user: { id: string; role: string }, id: string) {
  assertAdmin(user);
  const current = await prisma.projectPhase.findUnique({ where: { id } });
  if (!current) throw new DomainError("Fant ikke fasen");
  const existing = await prisma.projectPhase.findMany({ where: { boardId: current.boardId } });
  const projectCount = await prisma.project.count({ where: { phaseId: id } });
  const next = deletePhase(existing, id, projectCount);
  await prisma.$transaction([
    prisma.projectPhase.delete({ where: { id } }),
    ...next.map((phase) => prisma.projectPhase.update({ where: { id: phase.id }, data: { sortOrder: phase.sortOrder } })),
  ]);
  await audit(user.id, "phase.delete", "phase", id);
}

export async function orderPhases(user: { id: string; role: string }, boardId: string, orderedIds: string[]) {
  assertAdmin(user);
  const existing = await prisma.projectPhase.findMany({ where: { boardId } });
  const next = reorderPhases(existing, orderedIds);
  await prisma.$transaction(next.map((phase) => prisma.projectPhase.update({ where: { id: phase.id }, data: { sortOrder: phase.sortOrder } })));
  await audit(user.id, "phase.reorder", "board", boardId, { orderedIds });
  return next;
}

export async function dashboard(filter: {
  sellerId?: string;
  projectManagerId?: string;
  phaseId?: string;
  boardId?: string;
  status?: ProjectStatus | "" | "active";
  q?: string;
  year?: string;
  missingStart?: boolean;
}) {
  const q = filter.q?.trim();
  const year = Number(filter.year);
  const yearRange = Number.isInteger(year) && year > 1900 ? { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } : undefined;
  const where = {
    sellerId: filter.sellerId || undefined,
    projectManagerId: filter.projectManagerId || undefined,
    phaseId: filter.phaseId || undefined,
    boardId: filter.boardId || undefined,
    status: filter.status === "active" ? { not: "completed" as const } : filter.status || undefined,
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" as const } },
            { street: { contains: q, mode: "insensitive" as const } },
            { city: { contains: q, mode: "insensitive" as const } },
            { person: { is: { firstName: { contains: q, mode: "insensitive" as const } } } },
            { person: { is: { lastName: { contains: q, mode: "insensitive" as const } } } },
          ],
        }
      : {}),
    ...(yearRange
      ? {
          AND: [
            {
              OR: [{ plannedStartDate: yearRange }, { plannedEndDate: yearRange }, { endDate: yearRange }, { createdAt: yearRange }],
            },
          ],
        }
      : {}),
  };
  const listedWhere = filter.missingStart ? { ...where, plannedStartDate: null } : where;
  const [projects, openDeals, users, boards, missingStartCount] = await Promise.all([
    prisma.project.findMany({
      where: listedWhere,
      include: { seller: true, projectManager: true, phase: true, board: true, person: true, changes: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.deal.aggregate({ where: { status: "open" }, _sum: { valueNok: true }, _count: true }),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } }),
    listBoards(),
    prisma.project.count({ where: { ...where, plannedStartDate: null } }),
  ]);
  const open = projects.filter((project) => project.status === "open");
  const contract = open.reduce((sum, project) => sum + (dec(project.contractSumNok) ?? 0), 0);
  const approved = projects.reduce(
    (sum, project) => sum + project.changes.filter((change) => change.status === "approved").reduce((inner, change) => inner + (dec(change.amountNok) ?? 0), 0),
    0,
  );
  return {
    projects: projects.map((project) => ({
      id: project.id,
      title: project.title,
      status: project.status,
      phaseId: project.phaseId,
      phaseName: project.phase.name,
      boardId: project.boardId,
      boardName: project.board.name,
      sellerId: project.sellerId,
      sellerName: project.seller.name,
      projectManagerId: project.projectManagerId,
      projectManagerName: project.projectManager.name,
      contractSumNok: dec(project.contractSumNok),
      approvedChangesNok: project.changes.filter((change) => change.status === "approved").reduce((sum, change) => sum + (dec(change.amountNok) ?? 0), 0),
      address: address(project),
      plannedStartDate: isoDate(project.plannedStartDate),
      missingStart: project.plannedStartDate == null,
      plannedEndDate: isoDate(project.plannedEndDate),
      phaseEnteredAt: project.phaseEnteredAt.toISOString(),
      rottenDays: project.phase.rottenDays,
      delayed: Boolean(project.plannedEndDate && project.status !== "completed" && project.plannedEndDate.getTime() < Date.now()),
      stagnant: isDealRotten({
        status: project.status === "open" ? "open" : "won",
        stageEnteredAt: project.phaseEnteredAt,
        rottenDays: project.phase.rottenDays,
        now: new Date(),
      }),
      personName: project.person ? `${project.person.firstName} ${project.person.lastName}` : null,
    })),
    users,
    boards,
    kpis: {
      openProjects: open.length,
      contractSumNok: contract,
      approvedChangesNok: approved,
      openDealValueNok: dec(openDeals._sum.valueNok) ?? 0,
      openDeals: openDeals._count,
      missingStartCount,
    },
  };
}

export async function moveProject(user: { id: string; role: string }, id: string, phaseId: string) {
  const phase = await prisma.projectPhase.findUnique({ where: { id: phaseId } });
  if (!phase) throw new DomainError("Fant ikke fasen");
  const current = await prisma.project.findUnique({ where: { id } });
  if (!current) throw new DomainError("Fant ikke prosjektet");
  if (current.phaseId === phaseId && current.boardId === phase.boardId) return current;
  if (current.status === "completed") throw new DomainError("Fullførte prosjekter ligger ikke i tavlen. Gjenåpne prosjektet først.");
  const project = await prisma.project.update({
    where: { id },
    data: { phaseId, boardId: phase.boardId, phaseEnteredAt: current.phaseId === phaseId ? undefined : new Date() },
  });
  await audit(user.id, "project.phase", "project", id, { phaseId });
  return project;
}

export async function updateProject(
  user: { id: string; role: string },
  id: string,
  input: {
    sellerId?: string;
    projectManagerId?: string;
    status?: ProjectStatus;
    contractSumNok?: number | null;
    phaseId?: string;
    plannedStartDate?: string | null;
    plannedEndDate?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    street?: string | null;
    houseNumber?: string | null;
    postalCode?: string | null;
    city?: string | null;
  },
) {
  if (input.status && input.status !== "completed") {
    await prisma.project.update({ where: { id }, data: { status: input.status } });
  }
  if (input.phaseId) await moveProject(user, id, input.phaseId);
  const project = await prisma.project.update({
    where: { id },
    data: {
      sellerId: input.sellerId,
      projectManagerId: input.projectManagerId,
      status: input.status,
      contractSumNok: input.contractSumNok === undefined ? undefined : input.contractSumNok,
      plannedStartDate: input.plannedStartDate === undefined ? undefined : asDate(input.plannedStartDate),
      plannedEndDate: input.plannedEndDate === undefined ? undefined : asDate(input.plannedEndDate),
      startDate: input.startDate === undefined ? undefined : asDate(input.startDate),
      endDate: input.endDate === undefined ? undefined : asDate(input.endDate),
      street: input.street === undefined ? undefined : input.street,
      houseNumber: input.houseNumber === undefined ? undefined : input.houseNumber,
      postalCode: input.postalCode === undefined ? undefined : input.postalCode,
      city: input.city === undefined ? undefined : input.city,
    },
  });
  await audit(user.id, "project.update", "project", id);
  return project;
}

export async function addChange(
  user: { id: string; role: string },
  projectId: string,
  input: { title: string; description?: string; amountNok?: number | null; status?: ChangeOrderStatus; internalNote?: string },
) {
  const title = input.title.trim();
  if (!title) throw new DomainError("Endringen må ha en tittel");
  const change = await prisma.changeOrder.create({
    data: {
      projectId,
      title,
      description: input.description?.trim() || null,
      amountNok: input.amountNok ?? null,
      status: input.status ?? "draft",
      internalNote: input.internalNote?.trim() || null,
    },
  });
  await audit(user.id, "change.create", "change", change.id);
  return change;
}

export async function editChange(
  user: { id: string; role: string },
  id: string,
  input: { title?: string; description?: string | null; amountNok?: number | null; status?: ChangeOrderStatus; internalNote?: string | null },
) {
  const change = await prisma.changeOrder.update({
    where: { id },
    data: {
      title: input.title?.trim() || undefined,
      description: input.description === undefined ? undefined : input.description,
      amountNok: input.amountNok === undefined ? undefined : input.amountNok,
      status: input.status,
      internalNote: input.internalNote === undefined ? undefined : input.internalNote,
    },
  });
  await audit(user.id, "change.update", "change", id, { status: input.status });
  return change;
}

export async function addDocument(
  user: { id: string; role: string },
  projectId: string,
  file: { name: string; bytes: Buffer; mimeType: string; visibility: DocumentVisibility },
) {
  if (file.bytes.length > 40 * 1024 * 1024) throw new DomainError("Filen er større enn 40 MB");
  const id = crypto.randomUUID();
  const key = `projects/${projectId}/documents/${id}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
  await putObject(key, file.bytes, file.mimeType || "application/octet-stream");
  const document = await prisma.document.create({
    data: {
      id,
      projectId,
      name: file.name,
      storageKey: key,
      mimeType: file.mimeType || "application/octet-stream",
      sizeBytes: file.bytes.length,
      visibility: file.visibility,
      uploadedById: user.id,
    },
  });
  await audit(user.id, "document.create", "document", id);
  return document;
}

export async function loadBundle(projectId: string): Promise<ProjectBundle> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      seller: true,
      projectManager: true,
      person: true,
      changes: { orderBy: { createdAt: "desc" } },
      documents: { orderBy: { createdAt: "desc" } },
      media: { orderBy: { createdAt: "asc" } },
      notes: { orderBy: { createdAt: "asc" } },
      activities: true,
      inspections: { include: { answers: true } },
    },
  });
  if (!project) throw new DomainError("Fant ikke prosjektet");
  return {
    project: {
      id: project.id,
      title: project.title,
      contractSumNok: dec(project.contractSumNok),
      status: project.status,
      address: address(project),
      sellerName: project.seller.name,
      projectManagerName: project.projectManager.name,
    },
    changeOrders: project.changes.map((change) => ({
      id: change.id,
      title: change.title,
      description: change.description,
      amountNok: dec(change.amountNok),
      status: change.status,
      internalNote: change.internalNote,
    })),
    documents: project.documents.map((document) => ({ id: document.id, name: document.name, visibility: document.visibility })),
    media: project.media.filter((item) => !item.deletedAt).map((item) => ({
      id: item.id,
      kind: item.kind,
      internal: item.internal,
      textContent: item.textContent,
      fileName: item.fileName,
    })),
    notes: project.notes.filter((note) => !note.deletedAt).map((note) => ({
      id: note.id,
      body: note.body,
      internal: note.internal,
      roomId: note.roomId,
      sectionKey: note.sectionKey,
    })),
    answers: project.inspections.flatMap((inspection) =>
      inspection.answers.filter((answer) => !answer.deletedAt).map((answer) => ({
        id: answer.id,
        itemId: answer.itemId,
        value: answer.value,
        freeText: answer.freeText,
        internalNote: answer.internalNote,
      })),
    ),
    activities: project.activities.map((activity) => ({
      id: activity.id,
      subject: activity.subject,
      note: activity.note,
      internal: activity.internal,
    })),
  };
}

export async function customerView(projectId: string) {
  return projectForAudience(await loadBundle(projectId), "customer");
}

export async function sendWinner(user: { id: string; role: string }, projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      floors: { include: { rooms: { include: { walls: { orderBy: { number: "asc" } } } } }, where: { deletedAt: null } },
      notes: true,
    },
  });
  if (!project) throw new DomainError("Fant ikke prosjektet");
  const setting = await prisma.appSetting.findUnique({ where: { key: "winner_email" } });
  const recipient = setting?.value || process.env.WINNER_EMAIL || "";
  if (!recipient.includes("@")) throw new DomainError("Winner-mottaker er ikke satt. Legg den inn under Innstillinger.");
  const rooms = project.floors.flatMap((floor) =>
    floor.rooms.filter((room) => !room.deletedAt).map((room) => ({
      name: room.name,
      floorName: floor.name,
      perimeterM: dec(room.perimeterM),
      ceilingHeightM: dec(room.ceilingHeightM),
      floorAreaM: dec(room.floorAreaM),
      walls: room.walls.filter((wall) => !wall.deletedAt).map((wall) => ({ number: wall.number, lengthM: dec(wall.lengthM) ?? 0 })),
      slope: room.sketch && typeof room.sketch === "object" && room.sketch !== null && "slope" in room.sketch
        ? ((room.sketch as Sketch).slope ?? null)
        : null,
      sketch: room.sketch as Sketch | null,
    })),
  );
  const mail = buildWinnerMail({
    projectTitle: project.title,
    address: address(project),
    recipient,
    rooms,
    notes: project.notes.filter((note) => !note.deletedAt).map((note) => ({ body: note.body, internal: note.internal })),
  });
  const attachments: { filename: string; contentType: string; storageKey: string }[] = [];
  const pdf = inspectionPdf({ title: mail.subject, lines: mail.text.split("\n") });
  const pdfKey = `projects/${projectId}/winner/${crypto.randomUUID()}.pdf`;
  await putObject(pdfKey, pdf, "application/pdf");
  attachments.push({ filename: "maal.pdf", contentType: "application/pdf", storageKey: pdfKey });
  for (const room of rooms) {
    if (!room.sketch || !Array.isArray(room.sketch.points) || room.sketch.points.length < 3) continue;
    const png = sketchToPng(room.sketch);
    const key = `projects/${projectId}/winner/${crypto.randomUUID()}.png`;
    await putObject(key, png, "image/png");
    attachments.push({ filename: `${room.name}.png`, contentType: "image/png", storageKey: key });
  }
  const sent = await mailProvider().send({ ...mail, attachments });
  await audit(user.id, "winner.mail", "project", projectId, { to: mail.to, omitted: mail.internalNotesOmitted, mailId: sent.id });
  return { ...sent, to: mail.to, subject: mail.subject, internalNotesOmitted: mail.internalNotesOmitted, preview: mail.text };
}

export async function roomSketchFile(projectId: string, roomId: string, kind: "png" | "pdf") {
  const room = await prisma.room.findUnique({ where: { id: roomId }, include: { floor: true } });
  if (!room || room.deletedAt || room.floor.projectId !== projectId) throw new DomainError("Fant ikke rommet");
  const sketch = room.sketch as Sketch | null;
  if (!sketch || !Array.isArray(sketch.points) || sketch.points.length < 3) throw new DomainError("Rommet har ingen skisse");
  if (kind === "png") return { body: sketchToPng(sketch), contentType: "image/png", name: `${room.name}.png` };
  const measures = sketch.slope
    ? `Skråtak kne ${sketch.slope.kneeHeightM} m, møne ${sketch.slope.ridgeHeightM} m`
    : "Flatt tak";
  const body = inspectionPdf({
    title: `${room.name} · mål`,
    lines: [
      `Omkrets ${dec(room.perimeterM) ?? "–"} m`,
      `Gulvareal ${dec(room.floorAreaM) ?? "–"} m2`,
      `Romhøyde ${dec(room.ceilingHeightM) ?? "–"} m`,
      measures,
    ],
  });
  return { body, contentType: "application/pdf", name: `${room.name}.pdf` };
}

export async function projectDetail(id: string) {
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      seller: true,
      projectManager: true,
      person: { include: { organization: true } },
      organization: true,
      phase: true,
      board: { include: { phases: { orderBy: { sortOrder: "asc" } } } },
      deal: true,
      changes: { orderBy: { createdAt: "desc" }, include: { lines: { orderBy: { sortOrder: "asc" } } } },
      documents: { orderBy: { createdAt: "desc" }, include: { uploadedBy: true } },
      floors: {
        where: { deletedAt: null },
        orderBy: { sortOrder: "asc" },
        include: {
          rooms: {
            where: { deletedAt: null },
            orderBy: { sortOrder: "asc" },
            include: { walls: { where: { deletedAt: null }, orderBy: { number: "asc" } } },
          },
        },
      },
      inspections: {
        include: {
          inspector: true,
          templateVersion: { include: { sections: { orderBy: { sortOrder: "asc" }, include: { items: { orderBy: { sortOrder: "asc" } } } } } },
          answers: true,
        },
      },
      media: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } },
      notes: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!project) throw new DomainError("Fant ikke prosjektet");
  const conflicts = await prisma.syncConflict.findMany({
    where: { entityId: { in: [project.id, ...project.notes.map((note) => note.id), ...project.media.map((item) => item.id)] } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return { project, conflicts };
}
