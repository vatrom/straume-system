import bcrypt from "bcryptjs";
import { prisma, type ActivityType, type ChangeOrderStatus, type DocumentVisibility, type PriceItemType, type ProjectStatus, type Role } from "@straume/db";
import { DomainError, type QuoteFlowStatus } from "@straume/domain";
import { clearSessionCookie, setSessionCookie, signSession, withUser, type SessionUser } from "./auth";
import { addActivity, addOption, addStage, createDeal, createPipeline, createProjectFromDeal, dealsForBoard, editOption, editStage, getDeal, listOptions, listOrganizations, listPeople, listPipelines, loseDeal, orderStages, removeOption, removePipeline, removeStage, saveOrganization, savePerson, staff, toggleActivity, updateDeal, updatePipeline, winDeal } from "./crm";
import { checklistEditor, publishChecklist, saveDraft, type DraftSection } from "./checklists";
import { HttpError, json, jsonError, readJson } from "./http";
import { activateList, addItem, adjustComponentVersion, adjustPriceList, archiveItem, editLine, listPriceLists, priceChangeLog, priceListExcel, priceListView, updateCommercial, updateTradeRate } from "./price-admin";
import { listTrades, reorderTrades, setTradeSubcontractor } from "./trades";
import { applyPriceFile, itemBom, listProducts, listSuppliers, previewPriceFile, saveItemBom, saveSupplier } from "./catalog";
import { addQuoteLine, createChangeDraft, createQuoteDraft, decideChange, emailQuote, listTemplates, plannedHours, quotePdf, quoteView, quotesFor, removeQuoteLine, reviseQuote, saveTemplate, transitionQuote, updateQuote } from "./quotes";
import { dashboardView, deleteGoal, deleteReport, drilldown, exportInsights, goalBoard, insightMeta, queryInsights, saveGoal, saveReport, setPeerVisibility, toCsv, toExcelXml } from "./insights";
import { addChange, addDocument, addPhase, customerView, dashboard, editChange, editPhase, listBoards, moveProject, orderPhases, projectDetail, removePhase, roomSketchFile, sendWinner, updateProject } from "./projects";
import { getObject } from "./store";
import { pullChanges, pushMutations, saveMediaFile } from "./sync-service";
import type { SyncMutation } from "@straume/domain";

const ROLES: Role[] = ["admin", "selger", "prosjektleder", "kontor"];

function bool(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  return Boolean(value);
}

export async function handleApi(req: Request, slug: string[]): Promise<Response> {
  if (req.method === "OPTIONS") return json(null, 204, req);
  try {
    if (slug[0] === "health") return json({ ok: true }, 200, req);
    if (slug[0] === "auth" && slug[1] === "login" && req.method === "POST") return login(req);
    if (slug[0] === "auth" && slug[1] === "logout" && req.method === "POST") {
      await clearSessionCookie();
      return json({ ok: true }, 200, req);
    }
    if (slug[0] === "auth" && slug[1] === "me" && req.method === "GET") {
      return withUser(req, null, async (user) => json({ user }, 200, req));
    }
    return withUser(req, null, (user) => dispatch(req, slug, user));
  } catch (error) {
    return jsonError(error, req);
  }
}

async function login(req: Request): Promise<Response> {
  const body = await readJson<{ email?: string; password?: string }>(req);
  const email = body.email?.trim().toLowerCase() ?? "";
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.active || !body.password || !(await bcrypt.compare(body.password, user.passwordHash))) {
    return json({ error: "Ukjent e-post eller passord" }, 401, req);
  }
  const session = { id: user.id, email: user.email, name: user.name, role: user.role };
  const token = await signSession(session);
  await setSessionCookie(token);
  return json({ token, user: session }, 200, req);
}

async function dispatch(req: Request, slug: string[], user: SessionUser): Promise<Response> {
  const [a, b, c, d] = slug;
  const method = req.method;
  if (a === "insights" && b === "export" && method === "GET") {
    const url = new URL(req.url);
    const spec = JSON.parse(url.searchParams.get("spec") ?? "{}") as Record<string, unknown>;
    const file = await exportInsights(user, spec);
    const excel = url.searchParams.get("format") === "xls";
    const body = excel ? toExcelXml(file.header, file.body) : toCsv(file.header, file.body);
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": excel ? "application/vnd.ms-excel; charset=utf-8" : "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="innsikt.${excel ? "xls" : "csv"}"`,
      },
    });
  }
  if (a === "insights" && b === "meta" && method === "GET") return json(await insightMeta(user), 200, req);
  if (a === "insights" && b === "query" && method === "POST") return json(await queryInsights(user, await readJson(req)), 200, req);
  if (a === "insights" && b === "drill" && method === "POST") {
    const body = await readJson<{ spec?: Record<string, unknown>; bucket?: string }>(req);
    return json(await drilldown(user, body.spec ?? {}, body.bucket ?? "__all"), 200, req);
  }
  if (a === "insights" && b === "reports" && !c && method === "POST") return json(await saveReport(user, await readJson(req)), 201, req);
  if (a === "insights" && b === "reports" && c && method === "DELETE") {
    await deleteReport(user, c);
    return json({ ok: true }, 200, req);
  }
  if (a === "insights" && b === "goals" && !c && method === "GET") return json(await goalBoard(user), 200, req);
  if (a === "insights" && b === "goals" && !c && method === "POST") return json(await saveGoal(user, await readJson(req)), 201, req);
  if (a === "insights" && b === "goals" && c && method === "DELETE") {
    await deleteGoal(user, c);
    return json({ ok: true }, 200, req);
  }
  if (a === "insights" && b === "peers" && method === "POST") return json(await setPeerVisibility(user, await readJson(req)), 200, req);

  if (a === "pipelines" && !b && method === "GET") return json(await listPipelines(), 200, req);
  if (a === "pipelines" && !b && method === "POST") {
    const body = await readJson<{ name: string; dealProbabilityEnabled?: boolean }>(req);
    return json(await createPipeline(user, body), 201, req);
  }
  if (a === "pipelines" && b && !c && method === "PATCH") {
    const body = await readJson<{ name?: string; dealProbabilityEnabled?: boolean }>(req);
    return json(await updatePipeline(user, b, body), 200, req);
  }
  if (a === "pipelines" && b && !c && method === "DELETE") {
    await removePipeline(user, b);
    return json({ ok: true }, 200, req);
  }
  if (a === "pipelines" && b && c === "stages" && method === "POST") {
    const body = await readJson<{ name: string; probability: number; rottenDays: number | null }>(req);
    return json(await addStage(user, b, body), 201, req);
  }
  if (a === "pipelines" && b && c === "reorder" && method === "POST") {
    const body = await readJson<{ ids: string[] }>(req);
    return json(await orderStages(user, b, body.ids), 200, req);
  }
  if (a === "stages" && b && method === "PATCH") {
    const body = await readJson<{ name?: string; probability?: number; rottenDays?: number | null }>(req);
    return json(await editStage(user, b, body), 200, req);
  }
  if (a === "stages" && b && method === "DELETE") {
    await removeStage(user, b);
    return json({ ok: true }, 200, req);
  }
  if (a === "deals" && !b && method === "GET") {
    const url = new URL(req.url);
    return json(await dealsForBoard(url.searchParams.get("pipelineId") ?? undefined, url.searchParams.get("ownerId") ?? undefined), 200, req);
  }
  if (a === "deals" && !b && method === "POST") return json(await createDeal(user, await readJson(req)), 201, req);
  if (a === "deals" && b && !c && method === "GET") return json(await getDeal(b), 200, req);
  if (a === "deals" && b && !c && method === "PATCH") return json(await updateDeal(user, b, await readJson(req)), 200, req);
  if (a === "deals" && b && c === "win" && method === "POST") {
    const body = await readJson<{ createProject?: boolean; plannedStartDate?: string | null }>(req);
    return json(
      await winDeal(user, b, {
        createProject: Boolean(body.createProject),
        plannedStartDate: body.plannedStartDate,
      }),
      200,
      req,
    );
  }
  if (a === "deals" && b && c === "project" && method === "POST") return json(await createProjectFromDeal(user, b), 201, req);
  if (a === "deals" && b && c === "lose" && method === "POST") {
    const body = await readJson<{ lostReason: string; lostComment?: string }>(req);
    return json(await loseDeal(user, b, body.lostReason, body.lostComment), 200, req);
  }
  if (a === "deals" && b && c === "activities" && method === "POST") {
    const body = await readJson<{ type: ActivityType; subject: string; note?: string; dueAt?: string }>(req);
    return json(await addActivity(user, { ...body, dealId: b }), 201, req);
  }
  if (a === "activities" && b && method === "PATCH") {
    const body = await readJson<{ done: boolean }>(req);
    return json(await toggleActivity(user, b, body.done), 200, req);
  }
  if (a === "people" && !b && method === "GET") return json(await listPeople(), 200, req);
  if (a === "people" && !b && method === "POST") return json(await savePerson(user, null, await readJson(req)), 201, req);
  if (a === "people" && b && method === "GET") {
    const person = await prisma.person.findUnique({ where: { id: b }, include: { organization: true, deals: true, projects: true } });
    if (!person) throw new DomainError("Fant ikke personen");
    return json(person, 200, req);
  }
  if (a === "people" && b && method === "PATCH") return json(await savePerson(user, b, await readJson(req)), 200, req);
  if (a === "organizations" && !b && method === "GET") return json(await listOrganizations(), 200, req);
  if (a === "organizations" && !b && method === "POST") return json(await saveOrganization(user, null, await readJson(req)), 201, req);
  if (a === "organizations" && b && method === "PATCH") return json(await saveOrganization(user, b, await readJson(req)), 200, req);
  if (a === "options" && !b && method === "GET") return json(await listOptions(), 200, req);
  if (a === "options" && b && c === "items" && !d && method === "POST") {
    const body = await readJson<{ label: string }>(req);
    return json(await addOption(user, b, body.label), 201, req);
  }
  if (a === "options" && b === "items" && c && method === "PATCH") return json(await editOption(user, c, await readJson(req)), 200, req);
  if (a === "options" && b === "items" && c && method === "DELETE") {
    await removeOption(user, c);
    return json({ ok: true }, 200, req);
  }
  if (a === "staff" && method === "GET") return json(await staff(), 200, req);
  if (a === "boards" && !b && method === "GET") return json(await listBoards(), 200, req);
  if (a === "boards" && b && c === "phases" && method === "POST") {
    const body = await readJson<{ name: string; rottenDays?: number | null }>(req);
    return json(await addPhase(user, b, body.name, body.rottenDays), 201, req);
  }
  if (a === "boards" && b && c === "reorder" && method === "POST") {
    const body = await readJson<{ ids: string[] }>(req);
    return json(await orderPhases(user, b, body.ids), 200, req);
  }
  if (a === "phases" && b && method === "PATCH") {
    const body = await readJson<{ name: string; rottenDays?: number | null }>(req);
    return json(await editPhase(user, b, body.name, body.rottenDays), 200, req);
  }
  if (a === "phases" && b && method === "DELETE") {
    await removePhase(user, b);
    return json({ ok: true }, 200, req);
  }
  if (a === "projects" && !b && method === "GET") {
    const url = new URL(req.url);
    const status = (url.searchParams.get("status") ?? "") as ProjectStatus | "" | "active";
    return json(await dashboard({
      sellerId: url.searchParams.get("sellerId") ?? undefined,
      projectManagerId: url.searchParams.get("projectManagerId") ?? undefined,
      phaseId: url.searchParams.get("phaseId") ?? undefined,
      boardId: url.searchParams.get("boardId") ?? undefined,
      status,
      q: url.searchParams.get("q") ?? undefined,
      year: url.searchParams.get("year") ?? undefined,
    }), 200, req);
  }
  if (a === "projects" && b && c === "rooms" && d && slug[4]?.startsWith("sketch.") && method === "GET") {
    const kind = slug[4] === "sketch.pdf" ? "pdf" : "png";
    const file = await roomSketchFile(b, d, kind);
    return new Response(new Uint8Array(file.body), {
      headers: { "content-type": file.contentType, "content-disposition": `inline; filename="${encodeURIComponent(file.name)}"` },
    });
  }
  if (a === "projects" && b && !c && method === "GET") return json(await projectDetail(b), 200, req);
  if (a === "projects" && b && !c && method === "PATCH") return json(await updateProject(user, b, await readJson(req)), 200, req);
  if (a === "projects" && b && c === "phase" && method === "POST") {
    const body = await readJson<{ phaseId: string }>(req);
    return json(await moveProject(user, b, body.phaseId), 200, req);
  }
  if (a === "projects" && b && c === "changes" && !d && method === "POST") {
    const body = await readJson<{ title: string; description?: string; amountNok?: number | null; status?: ChangeOrderStatus; internalNote?: string }>(req);
    return json(await addChange(user, b, body), 201, req);
  }
  if (a === "changes" && b && method === "PATCH") return json(await editChange(user, b, await readJson(req)), 200, req);
  if (a === "projects" && b && c === "documents" && method === "POST") return uploadDocument(req, user, b);
  if (a === "projects" && b && c === "customer-view" && method === "GET") return json(await customerView(b), 200, req);
  if (a === "projects" && b && c === "winner-mail" && method === "POST") return json(await sendWinner(user, b), 200, req);
  if (a === "files" && b === "documents" && c && method === "GET") return downloadDocument(c, req);
  if (a === "files" && b === "media" && c && method === "GET") return downloadMedia(c, req);
  if (a === "checklists" && !b && method === "GET") return json(await checklistEditor(), 200, req);
  if (a === "checklists" && b === "draft" && method === "PUT") {
    const body = await readJson<{ sections: DraftSection[] }>(req);
    return json(await saveDraft(user, body.sections), 200, req);
  }
  if (a === "checklists" && b === "publish" && method === "POST") return json(await publishChecklist(user), 200, req);
  if (a === "price-lists" && !b && method === "GET") return json(await listPriceLists(), 200, req);
  if (a === "price-lists" && b && !c && method === "GET") return json(await priceListView(b), 200, req);
  if (a === "price-lists" && b && c === "version" && method === "POST") {
    const body = await readJson<{ name: string; validFrom: string; percent: number; tradeCodes?: string[]; includeLaborRates?: boolean }>(req);
    return json(await adjustPriceList(user, b, body), 201, req);
  }
  if (a === "price-lists" && b && c === "activate" && method === "POST") {
    await activateList(user, b);
    return json({ ok: true }, 200, req);
  }
  if (a === "price-lists" && b && c === "items" && method === "POST") {
    const body = await readJson<{ code: string; name: string; tradeCode: string; unit: string; type: PriceItemType; materialCost?: number; materialMarkup?: number | null; hoursPerUnit?: number; salePriceOverride?: number | null; quantityFormula?: string | null }>(req);
    return json(await addItem(user, b, body), 201, req);
  }
  if (a === "price-lists" && b && c === "lines" && d && method === "PATCH") return json(await editLine(user, b, d, await readJson(req)) ?? { ok: true }, 200, req);
  if (a === "price-lists" && b && c === "lines" && d && slug[4] === "archive" && method === "POST") {
    await archiveItem(user, b, d);
    return json({ ok: true }, 200, req);
  }
  if (a === "price-lists" && b && c === "excel" && method === "GET") {
    const file = await priceListExcel(b);
    return new Response(new Uint8Array(file.body), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${encodeURIComponent(file.name)}"`,
      },
    });
  }
  if (a === "price-lists" && b && c === "log" && method === "GET") return json(await priceChangeLog(b), 200, req);
  if (a === "price-lists" && b && c === "commercial" && method === "PATCH") return json(await updateCommercial(user, b, await readJson(req)), 200, req);
  if (a === "price-lists" && b && c === "rates" && d && method === "PATCH") return json(await updateTradeRate(user, b, d, await readJson(req)), 200, req);
  if (a === "trades" && !b && method === "GET") return json(await listTrades(), 200, req);
  if (a === "trades" && b === "order" && method === "PUT") {
    const body = await readJson<{ codes?: string[] }>(req);
    return json(await reorderTrades(user, body.codes ?? []), 200, req);
  }
  if (a === "trades" && b && method === "PATCH") {
    const body = await readJson<{ subcontractor?: boolean }>(req);
    return json(await setTradeSubcontractor(user, b, Boolean(body.subcontractor)), 200, req);
  }
  if (a === "price-lists" && b && c === "components" && method === "POST") {
    return json(await adjustComponentVersion(user, b, await readJson(req)), 201, req);
  }
  if (a === "price-lists" && b && c === "items" && d && slug[4] === "bom" && method === "GET") return json(await itemBom(b, d), 200, req);
  if (a === "price-lists" && b && c === "items" && d && slug[4] === "bom" && method === "PUT") {
    const body = await readJson<{ lines: { kind: "amount" | "product"; label?: string | null; amountNok?: number | null; productId?: string | null; quantity: number }[] }>(req);
    return json(await saveItemBom(user, b, d, body.lines ?? []), 200, req);
  }
  if (a === "suppliers" && !b && method === "GET") return json(await listSuppliers(), 200, req);
  if (a === "suppliers" && !b && method === "POST") return json(await saveSupplier(user, await readJson(req)), 201, req);
  if (a === "suppliers" && b && c === "import" && d === "preview" && method === "POST") return importFile(req, b, false, user);
  if (a === "suppliers" && b && c === "import" && d === "apply" && method === "POST") return importFile(req, b, true, user);
  if (a === "products" && method === "GET") {
    return json(await listProducts(new URL(req.url).searchParams.get("q") ?? undefined), 200, req);
  }
  if (a === "quotes" && b === "draft" && method === "POST") {
    const body = await readJson<{ dealId?: string; projectId?: string }>(req);
    return json(await createQuoteDraft(user, body), 201, req);
  }
  if (a === "quotes" && b === "for" && method === "GET") {
    const url = new URL(req.url);
    const rows = await quotesFor({ dealId: url.searchParams.get("dealId"), projectId: url.searchParams.get("projectId") });
    return json(rows, 200, req);
  }
  if (a === "quotes" && b && !c && method === "GET") return json(await quoteView(b), 200, req);
  if (a === "quotes" && b && !c && method === "PATCH") return json(await updateQuote(user, b, await readJson(req)), 200, req);
  if (a === "quotes" && b && c === "lines" && !d && method === "POST") return json(await addQuoteLine(user, b, await readJson(req)), 201, req);
  if (a === "quotes" && b && c === "lines" && d && method === "DELETE") return json(await removeQuoteLine(user, b, d), 200, req);
  if (a === "quotes" && b && c === "transition" && method === "POST") {
    const body = await readJson<{ to: QuoteFlowStatus }>(req);
    return json(await transitionQuote(user, b, body.to), 200, req);
  }
  if (a === "quotes" && b && c === "revision" && method === "POST") return json(await reviseQuote(user, b), 201, req);
  if (a === "quotes" && b && c === "email" && method === "POST") return json(await emailQuote(user, b), 200, req);
  if (a === "quotes" && b && c === "pdf" && method === "GET") {
    const file = await quotePdf(b);
    return new Response(new Uint8Array(file.body), {
      headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${encodeURIComponent(file.name)}"` },
    });
  }
  if (a === "projects" && b && c === "planned-hours" && method === "GET") return json(await plannedHours(b), 200, req);
  if (a === "projects" && b && c === "changes" && d === "draft" && method === "POST") {
    const body = await readJson<{ description: string }>(req);
    return json(await createChangeDraft(user, b, body.description), 201, req);
  }
  if (a === "changes" && b && c === "decide" && method === "POST") {
    const body = await readJson<{ status: "approved" | "rejected" | "sent" }>(req);
    return json(await decideChange(user, b, body.status), 200, req);
  }
  if (a === "templates" && !b && method === "GET") return json(await listTemplates(), 200, req);
  if (a === "templates" && b && method === "PUT") {
    const body = await readJson<{ body: string }>(req);
    return json(await saveTemplate(user, decodeURIComponent(b), body.body), 200, req);
  }
  if (a === "sync" && b === "pull" && method === "GET") {
    const since = new URL(req.url).searchParams.get("since");
    return json(await pullChanges(since), 200, req);
  }
  if (a === "sync" && b === "push" && method === "POST") {
    const body = await readJson<{ mutations: SyncMutation[] }>(req);
    if (!Array.isArray(body.mutations)) throw new HttpError(400, "Mangler mutations");
    return json(await pushMutations(user.id, body.mutations), 200, req);
  }
  if (a === "media" && method === "POST") return uploadMedia(req, user);
  if (a === "settings" && method === "GET") {
    const winner = await prisma.appSetting.findUnique({ where: { key: "winner_email" } });
    const approvers = await prisma.appSetting.findUnique({ where: { key: "quote_approver_roles" } });
    const users = user.role === "admin" ? await prisma.user.findMany({ select: { id: true, name: true, email: true, role: true, active: true }, orderBy: { name: "asc" } }) : [];
    return json({ winnerEmail: winner?.value ?? "", approverRoles: approvers?.value ?? "admin,kontor", users }, 200, req);
  }
  if (a === "settings" && !b && method === "PUT") {
    if (user.role !== "admin") throw new HttpError(403, "Bare administrator kan gjøre dette");
    const body = await readJson<{ winnerEmail: string }>(req);
    if (!body.winnerEmail.includes("@")) throw new DomainError("E-postadressen er ugyldig");
    await prisma.appSetting.upsert({ where: { key: "winner_email" }, update: { value: body.winnerEmail.trim() }, create: { key: "winner_email", value: body.winnerEmail.trim() } });
    return json({ ok: true }, 200, req);
  }
  if (a === "settings" && b === "approvers" && method === "PUT") {
    if (user.role !== "admin") throw new HttpError(403, "Bare administrator kan gjøre dette");
    const body = await readJson<{ roles: string[] }>(req);
    const roles = (body.roles ?? []).filter((role) => ROLES.includes(role as Role));
    if (!roles.length) throw new DomainError("Minst én rolle må kunne godkjenne");
    await prisma.appSetting.upsert({
      where: { key: "quote_approver_roles" },
      update: { value: roles.join(",") },
      create: { key: "quote_approver_roles", value: roles.join(",") },
    });
    return json({ ok: true }, 200, req);
  }
  if (a === "users" && !b && method === "POST") return createUser(req, user);
  if (a === "users" && b && method === "PATCH") return updateUser(req, user, b);

  return json({ error: "Fant ikke endepunktet" }, 404, req);
}

async function importFile(req: Request, supplierId: string, apply: boolean, user: SessionUser): Promise<Response> {
  const type = req.headers.get("content-type") ?? "";
  let fileName = "prisfil.csv";
  let bytes: Buffer;
  if (type.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "Mangler fil");
    fileName = file.name || fileName;
    bytes = Buffer.from(await file.arrayBuffer());
  } else {
    const body = await readJson<{ fileName?: string; text?: string }>(req);
    fileName = body.fileName || fileName;
    if (!body.text) throw new HttpError(400, "Mangler filinnhold");
    bytes = Buffer.from(body.text, "utf8");
  }
  if (apply) return json(await applyPriceFile(user, supplierId, fileName, bytes), 200, req);
  return json(await previewPriceFile(supplierId, fileName, bytes), 200, req);
}

async function createUser(req: Request, actorUser: SessionUser): Promise<Response> {
  if (actorUser.role !== "admin") throw new HttpError(403, "Bare administrator kan gjøre dette");
  const body = await readJson<{ name: string; email: string; password: string; role: Role }>(req);
  if (!ROLES.includes(body.role)) throw new DomainError("Ukjent rolle");
  if (!body.password || body.password.length < 8) throw new DomainError("Passordet må ha minst 8 tegn");
  const user = await prisma.user.create({
    data: {
      name: body.name.trim(),
      email: body.email.trim().toLowerCase(),
      passwordHash: await bcrypt.hash(body.password, 10),
      role: body.role,
    },
    select: { id: true, name: true, email: true, role: true, active: true },
  });
  return json(user, 201, req);
}

async function updateUser(req: Request, actorUser: SessionUser, id: string): Promise<Response> {
  if (actorUser.role !== "admin") throw new HttpError(403, "Bare administrator kan gjøre dette");
  const body = await readJson<{ name?: string; role?: Role; active?: boolean; password?: string }>(req);
  if (body.role && !ROLES.includes(body.role)) throw new DomainError("Ukjent rolle");
  const user = await prisma.user.update({
    where: { id },
    data: {
      name: body.name?.trim() || undefined,
      role: body.role,
      active: bool(body.active),
      passwordHash: body.password ? await bcrypt.hash(body.password, 10) : undefined,
    },
    select: { id: true, name: true, email: true, role: true, active: true },
  });
  return json(user, 200, req);
}

async function uploadDocument(req: Request, user: SessionUser, projectId: string): Promise<Response> {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Mangler fil");
  const visibility = String(form.get("visibility") || "internal") as DocumentVisibility;
  if (!["internal", "customer", "craftsman"].includes(visibility)) throw new DomainError("Ugyldig synlighet");
  const bytes = Buffer.from(await file.arrayBuffer());
  const document = await addDocument(user, projectId, { name: file.name, bytes, mimeType: file.type, visibility });
  return json(document, 201, req);
}

async function uploadMedia(req: Request, user: SessionUser): Promise<Response> {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Mangler fil");
  const id = String(form.get("id") || "");
  const projectId = String(form.get("projectId") || "");
  const kind = String(form.get("kind") || "photo") as "photo" | "video" | "voice" | "text";
  const internal = String(form.get("internal") || "true") !== "false";
  const saved = await saveMediaFile(user.id, {
    id,
    projectId,
    kind,
    internal,
    bytes: Buffer.from(await file.arrayBuffer()),
    mimeType: file.type || "application/octet-stream",
    fileName: file.name || "fil",
    roomId: String(form.get("roomId") || "") || null,
    floorId: String(form.get("floorId") || "") || null,
    wallId: String(form.get("wallId") || "") || null,
    inspectionId: String(form.get("inspectionId") || "") || null,
  });
  return json(saved, 201, req);
}

async function downloadDocument(id: string, req: Request): Promise<Response> {
  const document = await prisma.document.findUnique({ where: { id } });
  if (!document) return json({ error: "Fant ikke filen" }, 404, req);
  const file = await getObject(document.storageKey);
  if (!file) return json({ error: "Filen mangler i lageret" }, 404, req);
  return new Response(new Uint8Array(file.body), {
    headers: {
      "content-type": document.mimeType,
      "content-disposition": `inline; filename="${encodeURIComponent(document.name)}"`,
    },
  });
}

async function downloadMedia(id: string, req: Request): Promise<Response> {
  const media = await prisma.media.findUnique({ where: { id } });
  if (!media?.storageKey) return json({ error: "Fant ikke filen" }, 404, req);
  const file = await getObject(media.storageKey);
  if (!file) return json({ error: "Filen mangler i lageret" }, 404, req);
  return new Response(new Uint8Array(file.body), { headers: { "content-type": media.mimeType || file.contentType } });
}
