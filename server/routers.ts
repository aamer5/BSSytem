import { z } from "zod";
import { confidentialityLevels, decisionOutcomes, lifecycleStatuses, priorities, subjectTypes, type BoardRole, type RequestAction } from "@shared/domain";
import type { Board, BoardMembership, ChecklistAnswer, ChecklistQuestion, ChecklistTemplate, RequestAttachment, RequestDecision, RequestHistory, RequestSnapshot, Specialty, SubjectRequest, User } from "@shared/schema";
import { toUser } from "./_core/auth";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { accessibleBoardIds, getActiveMemberships, getBoardRoles, listReferenceData } from "./db";
import { allocateIds, col, COLLECTIONS, docRef, getById, getDb, getManyById, insertWithId, queryAll, queryIn, type Transaction } from "./firestore";
import { authorizeAction } from "./domain/permissions";
import { DomainError, forbidden, notFound, versionConflict } from "./domain/errors";
import { availableActions, canEditRequest, checkAction, checkRequestEdit, noteRequiredActions, snapshotRequired, terminalDecisionState, assertNonEmpty, type ActionContext, type WorkflowAction } from "./domain/workflow";
import { MAX_FILE_BYTES, readFile, storeFile } from "./storage";
import { canReadAttachment, ownerView, requestAudience } from "./domain/visibility";
import { missingRequiredQuestions, normalizeAnswer } from "./domain/checklist";
import { activeTemplateFor, listTemplates, loadDraftTemplate, nextTemplateVersion, templateQuestions } from "./checklists";
import { checklistAnswerTypes } from "@shared/domain";

const localeInput = z.object({ locale: z.enum(["ar", "en"]).default("ar") });
const membershipRoles = ["requester", "secretary_member", "secretariat_head", "board_member", "board_head"] as const;
const requestIdInput = z.object({ requestId: z.number().int().positive(), expectedRowVersion: z.number().int().positive().optional(), locale: z.enum(["ar", "en"]).default("ar") });
const roleFor = (roles: Array<{ role: string }>) => roles.map(item => item.role as BoardRole);
type ActorRole = RequestHistory["actorRoleAtTime"];

async function requireBoardRole(user: { id: number; role: "user" | "admin" }, boardId: number, action: RequestAction) {
  const roles = await getBoardRoles(user.id, boardId);
  const actorRole = authorizeAction(roleFor(roles), action, user.role === "admin");
  return { roles: roleFor(roles), actorRole };
}

async function loadRequest(requestId: number) {
  const row = await getById<SubjectRequest>(COLLECTIONS.subjectRequests, requestId);
  if (!row) throw notFound();
  return row;
}

async function actionContext(user: { id: number; role: "user" | "admin" }, row: SubjectRequest): Promise<ActionContext> {
  const roles = roleFor(await getBoardRoles(user.id, row.boardId));
  return { state: { lifecycleStatus: row.lifecycleStatus, workStatus: row.workStatus, currentAssigneeId: row.currentAssigneeId ?? null, rowVersion: row.rowVersion }, requesterUserId: row.requesterUserId, userId: user.id, roles, isAdmin: user.role === "admin" };
}

type Candidate = { id: number; name: string | null; email: string | null; role: BoardMembership["role"] };
// People on the board who can receive secretariat work or a board-head review.
async function boardCandidates(boardId: number) {
  const memberships = await queryAll<BoardMembership>(col(COLLECTIONS.boardMemberships).where("boardId", "==", boardId).where("isActive", "==", true));
  const people = await getManyById<{ name: string | null; email: string | null }>(COLLECTIONS.users, memberships.map(m => m.userId));
  const toCandidate = (m: BoardMembership): Candidate => ({ id: m.userId, name: people.get(m.userId)?.name ?? null, email: people.get(m.userId)?.email ?? null, role: m.role });
  const unique = (items: Candidate[]) => Array.from(new Map(items.map(item => [item.id, item])).values());
  return {
    secretaries: unique(memberships.filter(m => m.role === "secretary_member" || m.role === "secretariat_head").map(toCandidate)),
    boardHeads: unique(memberships.filter(m => m.role === "board_head").map(toCandidate)),
  };
}

// Requests the user may see: on their boards, and allowed by the request's
// status and confidentiality level (see domain/visibility.ts).
async function loadAccessibleRequests(user: { id: number; role: "user" | "admin" }, boardFilter?: number) {
  const boardIds = await accessibleBoardIds(user.id, user.role);
  const scoped = boardFilter ? (boardIds === null || boardIds.includes(boardFilter) ? [boardFilter] : []) : boardIds;
  const rows = scoped === null ? await queryAll<SubjectRequest>(col(COLLECTIONS.subjectRequests)) : await queryIn<SubjectRequest>(COLLECTIONS.subjectRequests, "boardId", scoped);
  const memberships = await getActiveMemberships(user.id);
  const rolesOn = (boardId: number) => memberships.filter(m => m.boardId === boardId).map(m => m.role as BoardRole);
  return rows.filter(row => requestAudience({ userId: user.id, roles: rolesOn(row.boardId), isAdmin: user.role === "admin" }, row));
}

async function audienceFor(user: { id: number; role: "user" | "admin" }, row: SubjectRequest) {
  return requestAudience({ userId: user.id, roles: roleFor(await getBoardRoles(user.id, row.boardId)), isAdmin: user.role === "admin" }, row);
}

type TransitionRecord = { action: string; actorUserId: number; actorRoleAtTime: ActorRole; note?: string | null; snapshot: boolean; decision?: Omit<RequestDecision, "id" | "subjectRequestId">; now: number };

// Applies a patch only if the stored rowVersion still matches, writing history,
// optional snapshot and optional decision in the same transaction.
async function commitVersionedUpdate(requestId: number, expectedRowVersion: number, patch: Partial<SubjectRequest>, record: TransitionRecord) {
  return getDb().runTransaction(async tx => {
    const ref = docRef(COLLECTIONS.subjectRequests, requestId);
    const snap = await tx.get(ref);
    const before = snap.data() as SubjectRequest | undefined;
    if (!before || before.rowVersion !== expectedRowVersion) throw versionConflict();
    const ids = await allocateIds(tx, COLLECTIONS.requestHistory, ...(record.snapshot ? [COLLECTIONS.requestSnapshots] : []), ...(record.decision ? [COLLECTIONS.requestDecisions] : []));
    const historyId = ids.shift()!;
    const snapshotId = record.snapshot ? ids.shift()! : null;
    const decisionId = record.decision ? ids.shift()! : null;
    const after = { ...before, ...patch, rowVersion: before.rowVersion + 1 };
    tx.update(ref, { ...patch, rowVersion: after.rowVersion });
    if (snapshotId) tx.set(docRef(COLLECTIONS.requestSnapshots, snapshotId), { id: snapshotId, subjectRequestId: requestId, revision: before.revision, content: before, createdByUserId: record.actorUserId, createdAt: record.now } satisfies RequestSnapshot);
    if (decisionId && record.decision) tx.set(docRef(COLLECTIONS.requestDecisions, decisionId), { id: decisionId, subjectRequestId: requestId, ...record.decision } satisfies RequestDecision);
    writeHistory(tx, historyId, { subjectRequestId: requestId, actorUserId: record.actorUserId, actorRoleAtTime: record.actorRoleAtTime, action: record.action, beforeState: before, afterState: after, note: record.note ?? null, correlationId: null, createdAt: record.now });
    return { rowVersion: after.rowVersion };
  });
}

function writeHistory(tx: Transaction, id: number, entry: Omit<RequestHistory, "id">) {
  tx.set(docRef(COLLECTIONS.requestHistory, id), { id, ...entry } satisfies RequestHistory);
}

// Mirrors the old MySQL unique indexes: fails when a document already matches all given fields.
async function assertUnique(tx: Transaction, name: Parameters<typeof col>[0], fields: Record<string, string | number | null>, message: string) {
  let query = col(name).limit(1) as FirebaseFirestore.Query;
  for (const [field, value] of Object.entries(fields)) query = query.where(field, "==", value);
  if (!(await tx.get(query)).empty) throw new DomainError("VALIDATION_FAILED", message);
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
  }),
  reference: router({
    list: protectedProcedure.input(localeInput).query(({ ctx }) => listReferenceData(ctx.user.id, ctx.user.role)),
  }),
  dashboard: router({
    summary: protectedProcedure.input(localeInput).query(async ({ ctx }) => { const rows = await loadAccessibleRequests(ctx.user); const count = (statuses: string[]) => rows.filter(r => statuses.includes(r.lifecycleStatus)).length; const recent = [...rows].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6).map(r => ({ id: r.id, referenceNumber: r.referenceNumber, title: r.title, status: r.lifecycleStatus, updatedAt: r.updatedAt })); return { total: rows.length, drafts: count(["draft"]), submitted: count(["submitted"]), inReview: count(["under_secretariat_review", "under_board_head_review", "waiting_for_requester"]), completed: count(["proper", "not_proper", "archived"]), pending: count(["submitted", "under_secretariat_review", "under_board_head_review", "waiting_for_requester"]), recent }; }),
  }),
  requests: router({
    list: protectedProcedure.input(z.object({ locale: z.enum(["ar", "en"]).default("ar"), search: z.string().optional(), status: z.enum(lifecycleStatuses).optional(), boardId: z.number().int().positive().optional(), specialtyId: z.number().int().positive().optional(), requestedByMe: z.boolean().default(false), assignedToMe: z.boolean().default(false), page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(50).default(20) })).query(async ({ ctx, input }) => { const search = input.search?.toLowerCase(); const matches = (await loadAccessibleRequests(ctx.user, input.boardId)).filter(r => (!input.status || r.lifecycleStatus === input.status) && (!input.specialtyId || r.specialtyId === input.specialtyId) && (!input.requestedByMe || r.requesterUserId === ctx.user.id) && (!input.assignedToMe || r.currentAssigneeId === ctx.user.id) && (!search || r.title.toLowerCase().includes(search) || r.referenceNumber.toLowerCase().includes(search))).sort((a, b) => b.updatedAt - a.updatedAt); const [boardMap, specialtyMap] = await Promise.all([getManyById<Board>(COLLECTIONS.boards, matches.map(r => r.boardId)), getManyById<Specialty>(COLLECTIONS.specialties, matches.map(r => r.specialtyId))]); const joined = matches.filter(r => boardMap.has(r.boardId) && specialtyMap.has(r.specialtyId)); const items = joined.slice((input.page - 1) * input.pageSize, input.page * input.pageSize).map(r => { const board = boardMap.get(r.boardId)!; const specialty = specialtyMap.get(r.specialtyId)!; return { id: r.id, referenceNumber: r.referenceNumber, title: r.title, status: r.lifecycleStatus, workStatus: r.workStatus, priority: r.priority, updatedAt: r.updatedAt, boardNameAr: board.nameAr, boardNameEn: board.nameEn, specialtyNameAr: specialty.nameAr, specialtyNameEn: specialty.nameEn }; }); return { items, total: joined.length, page: input.page, pageSize: input.pageSize }; }),
    detail: protectedProcedure.input(z.object({ requestId: z.number().int().positive(), locale: z.enum(["ar", "en"]).default("ar") })).query(async ({ ctx, input }) => { const request = await getById<SubjectRequest>(COLLECTIONS.subjectRequests, input.requestId); const audience = request ? await audienceFor(ctx.user, request) : null; if (!request || !audience) return null; const [board, specialty, requesterDoc] = await Promise.all([getById<Board>(COLLECTIONS.boards, request.boardId), getById<Specialty>(COLLECTIONS.specialties, request.specialtyId), getById<Parameters<typeof toUser>[0]>(COLLECTIONS.users, request.requesterUserId)]); if (!board || !specialty || !requesterDoc) return null; const byRequest = <T,>(name: Parameters<typeof col>[0]) => queryAll<T>(col(name).where("subjectRequestId", "==", input.requestId)); const [questions, answers, attachments, decisionRows, history, snapshots] = await Promise.all([request.checklistTemplateId ? templateQuestions(request.checklistTemplateId) : Promise.resolve([] as ChecklistQuestion[]), byRequest<ChecklistAnswer>(COLLECTIONS.checklistAnswers), byRequest<RequestAttachment>(COLLECTIONS.requestAttachments).then(rows => rows.filter(row => row.isActive)), byRequest<RequestDecision>(COLLECTIONS.requestDecisions).then(rows => rows.sort((a, b) => b.decidedAt - a.decidedAt)), byRequest<RequestHistory>(COLLECTIONS.requestHistory).then(rows => rows.sort((a, b) => b.createdAt - a.createdAt)), byRequest<RequestSnapshot>(COLLECTIONS.requestSnapshots).then(rows => rows.sort((a, b) => b.revision - a.revision))]); const people = await getManyById<{ name: string | null; email: string | null }>(COLLECTIONS.users, [...decisionRows.map(d => d.decidedByUserId), ...history.map(h => h.actorUserId)]); const deciders = people; const actorNames = Object.fromEntries(Array.from(people, ([userId, person]) => [userId, person.name || person.email || null])); const decisions = decisionRows.map(decision => ({ decision, actorName: deciders.get(decision.decidedByUserId)?.name ?? null })); const actionCtx = await actionContext(ctx.user, request); const actions = availableActions(actionCtx); const candidates = actions.includes("assign") || actions.includes("submit_to_board_head") ? await boardCandidates(request.boardId) : { secretaries: [] as Candidate[], boardHeads: [] as Candidate[] }; const template = request.checklistTemplateId ? ((await getById<ChecklistTemplate>(COLLECTIONS.checklistTemplates, request.checklistTemplateId)) ?? null) : null; const result = { audience, request, board, specialty, requester: toUser(requesterDoc) as User, template, questions, answers, attachments, decisions, history, snapshots, actorNames, permissions: { roles: actionCtx.roles, actions, canAnswerChecklist: canEditRequest(actionCtx, "answer_checklist"), canUpload: canEditRequest(actionCtx, "upload_attachment"), canEditDraft: canEditRequest(actionCtx, "edit_draft") }, candidates }; return audience === "owner" ? ownerView(result, ctx.user.id) : result; }),
    createDraft: protectedProcedure.input(z.object({ boardId: z.number().int().positive(), specialtyId: z.number().int().positive(), title: z.string().min(3).max(500), subjectType: z.enum(subjectTypes), priority: z.enum(priorities), confidentialityLevel: z.enum(confidentialityLevels), description: z.string().nullable().optional(), background: z.string().nullable().optional(), objective: z.string().nullable().optional(), requestedOutcome: z.string().nullable().optional(), requesterOrganization: z.string().nullable().optional() })).mutation(async ({ ctx, input }) => { await requireBoardRole(ctx.user, input.boardId, "create_draft"); const specialty = await getById<Specialty>(COLLECTIONS.specialties, input.specialtyId); if (!specialty || specialty.boardId !== input.boardId) throw new DomainError("VALIDATION_FAILED", "errors.validationFailed"); const template = await activeTemplateFor(input.boardId, input.specialtyId); const now = Date.now(); const ref = `SR-${new Date(now).getUTCFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`; const id = await getDb().runTransaction(async tx => { const [requestId, historyId] = await allocateIds(tx, COLLECTIONS.subjectRequests, COLLECTIONS.requestHistory); const request: SubjectRequest = { id: requestId, referenceNumber: ref, revision: 1, rowVersion: 1, title: input.title, subjectType: input.subjectType, priority: input.priority, confidentialityLevel: input.confidentialityLevel, source: "portal", requesterUserId: ctx.user.id, requesterOrganization: input.requesterOrganization ?? null, requesterContactDetails: null, preferredCommunicationChannel: null, boardId: input.boardId, specialtyId: input.specialtyId, assignedSecretaryMemberId: null, currentAssigneeId: null, dueDate: null, description: input.description ?? null, background: input.background ?? null, objective: input.objective ?? null, requestedOutcome: input.requestedOutcome ?? null, justification: null, urgencyExplanation: null, secretaryFindings: null, summary: null, recommendations: null, internalNotes: null, completenessResult: null, jurisdictionResult: null, duplicationResult: null, boardHeadOutcome: null, decisionReasonCode: null, decisionNote: null, decisionNoteRequesterVisible: null, decisionAt: null, decisionByUserId: null, lifecycleStatus: "draft", workStatus: "unassigned", agendaHandoffStatus: null, checklistTemplateId: template?.id ?? null, checklistTemplateVersion: template?.version ?? null, correlationId: null, agendaItemId: null, createdAt: now, updatedAt: now, submittedAt: null, closedAt: null }; tx.set(docRef(COLLECTIONS.subjectRequests, requestId), request); writeHistory(tx, historyId, { subjectRequestId: requestId, actorUserId: ctx.user.id, actorRoleAtTime: "requester", action: "create_draft", beforeState: {}, afterState: { lifecycleStatus: "draft", workStatus: "unassigned", rowVersion: 1 }, note: null, correlationId: null, createdAt: now }); return requestId; }); return { id, referenceNumber: ref, rowVersion: 1 }; }),
    claim: protectedProcedure.input(requestIdInput).mutation(async ({ ctx, input }) => { const row = await loadRequest(input.requestId); const actorRole = checkAction(await actionContext(ctx.user, row), "claim"); if (row.rowVersion !== input.expectedRowVersion) throw versionConflict(); const now = Date.now(); return commitVersionedUpdate(row.id, row.rowVersion, { currentAssigneeId: ctx.user.id, assignedSecretaryMemberId: ctx.user.id, lifecycleStatus: "under_secretariat_review", workStatus: "assigned", updatedAt: now }, { action: "claim", actorUserId: ctx.user.id, actorRoleAtTime: actorRole, snapshot: false, now }); }),
    // The requester can change the subject details while the request is still a draft.
    updateDraft: protectedProcedure.input(z.object({ requestId: z.number().int().positive(), expectedRowVersion: z.number().int().positive(), title: z.string().trim().min(3).max(500), subjectType: z.enum(subjectTypes), priority: z.enum(priorities), confidentialityLevel: z.enum(confidentialityLevels), description: z.string().max(10_000).nullable().optional(), background: z.string().max(10_000).nullable().optional(), objective: z.string().max(10_000).nullable().optional(), requestedOutcome: z.string().max(10_000).nullable().optional(), requesterOrganization: z.string().max(255).nullable().optional() })).mutation(async ({ ctx, input }) => {
      const row = await loadRequest(input.requestId);
      checkRequestEdit(await actionContext(ctx.user, row), "edit_draft");
      if (row.rowVersion !== input.expectedRowVersion) throw versionConflict();
      const text = (value: string | null | undefined) => value?.trim() || null;
      const now = Date.now();
      return commitVersionedUpdate(row.id, row.rowVersion, { title: input.title, subjectType: input.subjectType, priority: input.priority, confidentialityLevel: input.confidentialityLevel, description: text(input.description), background: text(input.background), objective: text(input.objective), requestedOutcome: text(input.requestedOutcome), requesterOrganization: text(input.requesterOrganization), updatedAt: now }, { action: "edit_draft", actorUserId: ctx.user.id, actorRoleAtTime: "requester", snapshot: false, now });
    }),
    submit: protectedProcedure.input(requestIdInput).mutation(async ({ ctx, input }) => { const row = await loadRequest(input.requestId); const actorRole = checkAction(await actionContext(ctx.user, row), "submit"); if (row.rowVersion !== input.expectedRowVersion) throw versionConflict(); const template = row.checklistTemplateId ? null : await activeTemplateFor(row.boardId, row.specialtyId); const templateId = row.checklistTemplateId ?? template?.id ?? null; if (templateId) { const [questions, answers] = await Promise.all([templateQuestions(templateId), queryAll<ChecklistAnswer>(col(COLLECTIONS.checklistAnswers).where("subjectRequestId", "==", row.id))]); const missing = missingRequiredQuestions(questions, answers); if (missing.length) throw new DomainError("VALIDATION_FAILED", "errors.checklistIncomplete", { questions: missing.map(question => question.id) }); } const now = Date.now(); return commitVersionedUpdate(row.id, row.rowVersion, { lifecycleStatus: "submitted", workStatus: "unassigned", submittedAt: now, updatedAt: now, ...(template ? { checklistTemplateId: template.id, checklistTemplateVersion: template.version } : {}) }, { action: "submit", actorUserId: ctx.user.id, actorRoleAtTime: actorRole, snapshot: true, now }); }),
    answerChecklist: protectedProcedure.input(z.object({ requestId: z.number().int().positive(), checklistQuestionId: z.number().int().positive(), answerValue: z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]), comment: z.string().optional(), finalConfirmation: z.boolean().default(false), locale: z.enum(["ar", "en"]).default("ar") })).mutation(async ({ ctx, input }) => { const row = await loadRequest(input.requestId); checkRequestEdit(await actionContext(ctx.user, row), "answer_checklist"); const question = await getById<ChecklistQuestion>(COLLECTIONS.checklistQuestions, input.checklistQuestionId); if (!question || !question.isActive || !row.checklistTemplateId || question.checklistTemplateId !== row.checklistTemplateId) throw new DomainError("VALIDATION_FAILED", "errors.questionNotOnChecklist"); const answerValue = normalizeAnswer(question, input.answerValue); const now = Date.now(); const fields = { answerValue, comment: input.comment ?? null, responderUserId: ctx.user.id, responseDate: now, finalConfirmation: input.finalConfirmation, updatedAt: now }; await getDb().runTransaction(async tx => { const existing = (await tx.get(col(COLLECTIONS.checklistAnswers).where("subjectRequestId", "==", row.id).where("checklistQuestionId", "==", input.checklistQuestionId).limit(1))).docs[0]; if (existing) { tx.update(existing.ref, fields); return; } const [id] = await allocateIds(tx, COLLECTIONS.checklistAnswers); tx.set(docRef(COLLECTIONS.checklistAnswers, id), { id, subjectRequestId: row.id, checklistQuestionId: input.checklistQuestionId, evidenceAttachmentId: null, ...fields } satisfies ChecklistAnswer); }); return { success: true, updatedAt: now }; }),
    attachments: router({
      upload: protectedProcedure.input(z.object({ requestId: z.number().int().positive(), fileName: z.string().min(1).max(255), documentType: z.string().min(2).max(80), mimeType: z.string().min(3).max(120), dataBase64: z.string().min(1).max(Math.ceil(MAX_FILE_BYTES / 3) * 4 + 4), requesterVisible: z.boolean().default(false), locale: z.enum(["ar", "en"]).default("ar") })).mutation(async ({ ctx, input }) => {
        const row = await loadRequest(input.requestId);
        const actorRole = checkRequestEdit(await actionContext(ctx.user, row), "upload_attachment");
        const safe = input.fileName.replace(/[\\/\0]/g, "_").slice(0, 180);
        const file = await storeFile(Buffer.from(input.dataBase64, "base64"));
        // A requester's own documents are always visible to them; staff choose.
        const requesterVisible = actorRole === "requester" ? true : input.requesterVisible;
        const id = await insertWithId<RequestAttachment>(COLLECTIONS.requestAttachments, { subjectRequestId: row.id, storageKey: file.key, accessUrl: null, originalFileName: safe, documentType: input.documentType, description: null, mimeType: input.mimeType, byteSize: file.byteSize, checksumSha256: file.checksumSha256, version: 1, uploadedByUserId: ctx.user.id, requesterVisible, reviewStatus: "pending", replacesAttachmentId: null, isActive: true, uploadedAt: Date.now() });
        return { success: true, id };
      }),
      download: protectedProcedure.input(z.object({ attachmentId: z.number().int().positive(), locale: z.enum(["ar", "en"]).default("ar") })).query(async ({ ctx, input }) => {
        const attachment = await getById<RequestAttachment>(COLLECTIONS.requestAttachments, input.attachmentId);
        const request = attachment ? await getById<SubjectRequest>(COLLECTIONS.subjectRequests, attachment.subjectRequestId) : undefined;
        if (!attachment || !request || !canReadAttachment(await audienceFor(ctx.user, request), attachment, ctx.user.id)) throw forbidden();
        const data = await readFile(attachment.storageKey);
        return { fileName: attachment.originalFileName, mimeType: attachment.mimeType, dataBase64: data.toString("base64") };
      }),
    }),
    transition: protectedProcedure.input(z.object({ requestId: z.number().int().positive(), action: z.enum(["release", "assign", "request_info", "respond_info", "return_to_requester", "return_to_secretary_member", "submit_to_board_head", "withdraw", "archive"]), expectedRowVersion: z.number().int().positive(), note: z.string().max(4000).optional(), assigneeUserId: z.number().int().positive().optional(), locale: z.enum(["ar", "en"]).default("ar") })).mutation(async ({ ctx, input }) => {
      const row = await loadRequest(input.requestId);
      const actorRole = checkAction(await actionContext(ctx.user, row), input.action);
      if (noteRequiredActions.includes(input.action)) assertNonEmpty(input.note);
      let assignee: number | null = null;
      if (input.action === "assign" || input.action === "submit_to_board_head") {
        const candidates = await boardCandidates(row.boardId);
        const pool = input.action === "assign" ? candidates.secretaries : candidates.boardHeads;
        if (!input.assigneeUserId || !pool.some(person => person.id === input.assigneeUserId)) throw new DomainError("VALIDATION_FAILED", "errors.invalidAssignee");
        assignee = input.assigneeUserId;
      }
      if (row.rowVersion !== input.expectedRowVersion) throw versionConflict();
      const now = Date.now();
      const secretary = row.assignedSecretaryMemberId ?? null;
      const next: Record<Exclude<WorkflowAction, "submit" | "claim" | "decide">, Partial<SubjectRequest>> = {
        release: { lifecycleStatus: "under_secretariat_review", workStatus: "unassigned", currentAssigneeId: null, assignedSecretaryMemberId: null },
        assign: { lifecycleStatus: "under_secretariat_review", workStatus: "assigned", currentAssigneeId: assignee, assignedSecretaryMemberId: assignee },
        request_info: { lifecycleStatus: "waiting_for_requester", workStatus: "waiting_for_requester" },
        return_to_requester: { lifecycleStatus: "waiting_for_requester", workStatus: "waiting_for_requester" },
        // The requester's answer goes back to the secretary who asked for it.
        respond_info: { lifecycleStatus: "under_secretariat_review", workStatus: secretary ? "assigned" : "unassigned", currentAssigneeId: secretary },
        return_to_secretary_member: { lifecycleStatus: "under_secretariat_review", workStatus: secretary ? "assigned" : "unassigned", currentAssigneeId: secretary },
        submit_to_board_head: { lifecycleStatus: "under_board_head_review", workStatus: "in_review", currentAssigneeId: assignee },
        withdraw: { lifecycleStatus: "withdrawn", workStatus: "completed", currentAssigneeId: null, closedAt: now },
        archive: { lifecycleStatus: "archived", workStatus: "completed", closedAt: row.closedAt ?? now },
      };
      return commitVersionedUpdate(row.id, row.rowVersion, { ...next[input.action], updatedAt: now }, { action: input.action, actorUserId: ctx.user.id, actorRoleAtTime: actorRole, note: input.note?.trim() || null, snapshot: snapshotRequired(input.action), now });
    }),
    decide: protectedProcedure.input(z.object({ requestId: z.number().int().positive(), expectedRowVersion: z.number().int().positive(), locale: z.enum(["ar", "en"]).default("ar"), outcome: z.enum(decisionOutcomes), reasonCode: z.string().min(2).max(80), note: z.string().max(4000), requesterVisible: z.boolean().default(true) })).mutation(async ({ ctx, input }) => { const row = await loadRequest(input.requestId); const actorRole = checkAction(await actionContext(ctx.user, row), "decide"); assertNonEmpty(input.note); if (row.rowVersion !== input.expectedRowVersion) throw versionConflict(); const now = Date.now(); return commitVersionedUpdate(row.id, row.rowVersion, { boardHeadOutcome: input.outcome, decisionReasonCode: input.reasonCode, decisionNote: input.note.trim(), decisionNoteRequesterVisible: input.requesterVisible, decisionAt: now, decisionByUserId: ctx.user.id, lifecycleStatus: terminalDecisionState(input.outcome).lifecycleStatus, workStatus: "completed", currentAssigneeId: null, updatedAt: now, closedAt: now }, { action: "decide", actorUserId: ctx.user.id, actorRoleAtTime: actorRole, note: input.note.trim(), snapshot: snapshotRequired("decide"), decision: { outcome: input.outcome, reasonCode: input.reasonCode, note: input.note.trim(), requesterVisible: input.requesterVisible, decidedByUserId: ctx.user.id, decidedAt: now }, now }); }),
  }),
  admin: router({
    reference: protectedProcedure.query(async ({ ctx }) => { if (ctx.user.role !== "admin") throw forbidden(); return listReferenceData(ctx.user.id, "admin"); }),
    users: protectedProcedure.query(async ({ ctx }) => { if (ctx.user.role !== "admin") throw forbidden(); const rows = await queryAll<User>(col(COLLECTIONS.users)); return rows.map(u => ({ id: u.id, name: u.name ?? null, email: u.email ?? null, role: u.role })).sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")); }),
    // A board always starts with a secretariat head and at least one secretariat team member.
    createBoard: protectedProcedure.input(z.object({ code: z.string().trim().min(2).max(32), nameAr: z.string().trim().min(2), nameEn: z.string().optional(), descriptionAr: z.string().optional(), descriptionEn: z.string().optional(), secretariatHeadUserId: z.number().int().positive(), secretaryMemberUserIds: z.array(z.number().int().positive()).min(1).max(50) })).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw forbidden();
      const members = Array.from(new Set(input.secretaryMemberUserIds));
      if (members.includes(input.secretariatHeadUserId)) throw new DomainError("VALIDATION_FAILED", "errors.headInTeam");
      const people = await getManyById<User>(COLLECTIONS.users, [input.secretariatHeadUserId, ...members]);
      if (people.size !== members.length + 1) throw notFound();
      const now = Date.now();
      const id = await getDb().runTransaction(async tx => {
        await assertUnique(tx, COLLECTIONS.boards, { code: input.code }, "errors.boardCodeExists");
        const [boardId, ...membershipIds] = await allocateIds(tx, COLLECTIONS.boards, COLLECTIONS.boardMemberships, ...members.map(() => COLLECTIONS.boardMemberships));
        tx.set(docRef(COLLECTIONS.boards, boardId), { id: boardId, code: input.code, nameAr: input.nameAr, nameEn: input.nameEn?.trim() || null, mandateAr: null, mandateEn: null, isActive: true, allowWithdrawDuringBoardHeadReview: false, createdByUserId: ctx.user.id, createdAt: now, updatedAt: now, descriptionAr: input.descriptionAr ?? null, descriptionEn: input.descriptionEn ?? null } satisfies Board);
        const assignments: Array<[number, BoardMembership["role"]]> = [[input.secretariatHeadUserId, "secretariat_head"], ...members.map(userId => [userId, "secretary_member"] as [number, BoardMembership["role"]])];
        assignments.forEach(([userId, role], index) => tx.set(docRef(COLLECTIONS.boardMemberships, membershipIds[index]), { id: membershipIds[index], boardId, userId, role, isActive: true, assignedByUserId: ctx.user.id, createdAt: now, updatedAt: now } satisfies BoardMembership));
        return boardId;
      });
      return { id };
    }),
    createSpecialty: protectedProcedure.input(z.object({ boardId: z.number().positive(), code: z.string().min(2), nameAr: z.string().min(2), nameEn: z.string().optional() })).mutation(async ({ ctx, input }) => { if (ctx.user.role !== "admin") throw forbidden(); const now = Date.now(); const id = await getDb().runTransaction(async tx => { await assertUnique(tx, COLLECTIONS.specialties, { boardId: input.boardId, code: input.code }, "Specialty code already exists for this board"); const [specialtyId] = await allocateIds(tx, COLLECTIONS.specialties); tx.set(docRef(COLLECTIONS.specialties, specialtyId), { id: specialtyId, boardId: input.boardId, code: input.code, nameAr: input.nameAr, nameEn: input.nameEn ?? null, isActive: true, createdAt: now, updatedAt: now } satisfies Specialty); return specialtyId; }); return { id }; }),
    checklists: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw forbidden();
      return listTemplates();
    }),
    // A new template starts as a draft; its version follows the latest one for the same board and specialty.
    createTemplate: protectedProcedure.input(z.object({ boardId: z.number().positive(), specialtyId: z.number().positive().optional(), nameAr: z.string().min(2), nameEn: z.string().optional() })).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw forbidden();
      const [board, specialty] = await Promise.all([getById<Board>(COLLECTIONS.boards, input.boardId), input.specialtyId ? getById<Specialty>(COLLECTIONS.specialties, input.specialtyId) : Promise.resolve(null)]);
      if (!board || (input.specialtyId && (!specialty || specialty.boardId !== input.boardId))) throw notFound();
      const now = Date.now();
      const specialtyId = input.specialtyId ?? null;
      const id = await getDb().runTransaction(async tx => {
        const version = await nextTemplateVersion(tx, input.boardId, specialtyId);
        const [templateId] = await allocateIds(tx, COLLECTIONS.checklistTemplates);
        tx.set(docRef(COLLECTIONS.checklistTemplates, templateId), { id: templateId, boardId: input.boardId, specialtyId, subjectType: null, nameAr: input.nameAr, nameEn: input.nameEn ?? null, version, status: "draft", createdByUserId: ctx.user.id, activatedAt: null, retiredAt: null, createdAt: now, updatedAt: now } satisfies ChecklistTemplate);
        return templateId;
      });
      return { id };
    }),
    // Copies a template and its questions into a new draft version that can be edited.
    newTemplateVersion: protectedProcedure.input(z.object({ templateId: z.number().positive() })).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw forbidden();
      const source = await getById<ChecklistTemplate>(COLLECTIONS.checklistTemplates, input.templateId);
      if (!source) throw notFound();
      const questions = await templateQuestions(source.id);
      const now = Date.now();
      const id = await getDb().runTransaction(async tx => {
        const version = await nextTemplateVersion(tx, source.boardId, source.specialtyId);
        const [templateId, ...questionIds] = await allocateIds(tx, COLLECTIONS.checklistTemplates, ...questions.map(() => COLLECTIONS.checklistQuestions));
        tx.set(docRef(COLLECTIONS.checklistTemplates, templateId), { ...source, id: templateId, version, status: "draft", createdByUserId: ctx.user.id, activatedAt: null, retiredAt: null, createdAt: now, updatedAt: now } satisfies ChecklistTemplate);
        questions.forEach((question, index) => tx.set(docRef(COLLECTIONS.checklistQuestions, questionIds[index]), { ...question, id: questionIds[index], checklistTemplateId: templateId, createdAt: now, updatedAt: now } satisfies ChecklistQuestion));
        return templateId;
      });
      return { id };
    }),
    // Activating a template retires the one that was active for the same board and specialty.
    activateTemplate: protectedProcedure.input(z.object({ templateId: z.number().positive() })).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw forbidden();
      const template = await loadDraftTemplate(input.templateId);
      if (!(await templateQuestions(template.id)).length) throw new DomainError("VALIDATION_FAILED", "errors.templateHasNoQuestions");
      const now = Date.now();
      await getDb().runTransaction(async tx => {
        const active = await tx.get(col(COLLECTIONS.checklistTemplates).where("boardId", "==", template.boardId).where("specialtyId", "==", template.specialtyId).where("status", "==", "active"));
        active.docs.forEach(doc => tx.update(doc.ref, { status: "retired", retiredAt: now, updatedAt: now }));
        tx.update(docRef(COLLECTIONS.checklistTemplates, template.id), { status: "active", activatedAt: now, updatedAt: now });
      });
      return { success: true };
    }),
    retireTemplate: protectedProcedure.input(z.object({ templateId: z.number().positive() })).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw forbidden();
      const template = await getById<ChecklistTemplate>(COLLECTIONS.checklistTemplates, input.templateId);
      if (!template) throw notFound();
      const now = Date.now();
      await docRef(COLLECTIONS.checklistTemplates, template.id).update({ status: "retired", retiredAt: now, updatedAt: now });
      return { success: true };
    }),
    // Questions can only be added to or removed from draft templates, so answered checklists never change.
    createQuestion: protectedProcedure.input(z.object({ checklistTemplateId: z.number().positive(), code: z.string().min(1).max(80).optional(), textAr: z.string().min(2), textEn: z.string().optional(), answerType: z.enum(checklistAnswerTypes), required: z.boolean().default(false), options: z.array(z.string().trim().min(1).max(200)).max(50).optional(), sortOrder: z.number().int().optional() })).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw forbidden();
      const template = await loadDraftTemplate(input.checklistTemplateId);
      const options = Array.from(new Set(input.options ?? []));
      const isSelect = input.answerType === "single_select" || input.answerType === "multi_select";
      if (isSelect && options.length < 2) throw new DomainError("VALIDATION_FAILED", "errors.optionsRequired");
      const now = Date.now();
      const id = await getDb().runTransaction(async tx => {
        const existing = (await tx.get(col(COLLECTIONS.checklistQuestions).where("checklistTemplateId", "==", template.id))).docs.map(doc => doc.data() as ChecklistQuestion);
        const code = input.code?.trim() || `Q${existing.length + 1}`;
        if (existing.some(question => question.code === code)) throw new DomainError("VALIDATION_FAILED", "errors.questionCodeExists");
        const sortOrder = input.sortOrder ?? existing.reduce((max, question) => Math.max(max, question.sortOrder), 0) + 1;
        const [questionId] = await allocateIds(tx, COLLECTIONS.checklistQuestions);
        tx.set(docRef(COLLECTIONS.checklistQuestions, questionId), { id: questionId, checklistTemplateId: template.id, code, textAr: input.textAr, textEn: input.textEn ?? null, answerType: input.answerType, required: input.required, sortOrder, showIfJson: null, linkedDocumentType: null, optionsJson: isSelect ? options : null, isActive: true, createdAt: now, updatedAt: now } satisfies ChecklistQuestion);
        return questionId;
      });
      return { id, createdAt: now };
    }),
    removeQuestion: protectedProcedure.input(z.object({ questionId: z.number().positive() })).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw forbidden();
      const question = await getById<ChecklistQuestion>(COLLECTIONS.checklistQuestions, input.questionId);
      if (!question) throw notFound();
      await loadDraftTemplate(question.checklistTemplateId);
      await docRef(COLLECTIONS.checklistQuestions, question.id).update({ isActive: false, updatedAt: Date.now() });
      return { success: true };
    }),
    // The last active secretariat head or secretariat team member of a board can't be removed.
    deactivateMembership: protectedProcedure.input(z.object({ membershipId: z.number().positive() })).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw forbidden();
      await getDb().runTransaction(async tx => {
        const ref = docRef(COLLECTIONS.boardMemberships, input.membershipId);
        const membership = (await tx.get(ref)).data() as BoardMembership | undefined;
        if (!membership) throw notFound();
        if (membership.isActive && (membership.role === "secretariat_head" || membership.role === "secretary_member")) {
          const peers = await tx.get(col(COLLECTIONS.boardMemberships).where("boardId", "==", membership.boardId).where("role", "==", membership.role).where("isActive", "==", true));
          if (peers.size <= 1) throw new DomainError("VALIDATION_FAILED", membership.role === "secretariat_head" ? "errors.lastSecretariatHead" : "errors.lastSecretaryMember");
        }
        tx.update(ref, { isActive: false, updatedAt: Date.now() });
      });
      return { success: true };
    }),
    setUserRole: protectedProcedure.input(z.object({ userId: z.number().positive(), role: z.enum(["user", "admin"]) })).mutation(async ({ ctx, input }) => { if (ctx.user.role !== "admin") throw forbidden(); await docRef(COLLECTIONS.users, input.userId).update({ role: input.role }); return { success: true }; }),
    memberships: protectedProcedure.query(async ({ ctx }) => { if (ctx.user.role !== "admin") throw forbidden(); const rows = await queryAll<BoardMembership>(col(COLLECTIONS.boardMemberships)); const [people, boardMap] = await Promise.all([getManyById<{ name: string | null; email: string | null }>(COLLECTIONS.users, rows.map(r => r.userId)), getManyById<Board>(COLLECTIONS.boards, rows.map(r => r.boardId))]); return rows.map(r => ({ id: r.id, userId: r.userId, boardId: r.boardId, role: r.role, isActive: r.isActive, userName: people.get(r.userId)?.name ?? null, userEmail: people.get(r.userId)?.email ?? null, boardNameAr: boardMap.get(r.boardId)?.nameAr ?? null, boardNameEn: boardMap.get(r.boardId)?.nameEn ?? null })).sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.boardId - b.boardId || a.role.localeCompare(b.role) || a.userId - b.userId); }),
    // Adds a board role, or re-activates it if it was previously deactivated.
    assignMembership: protectedProcedure.input(z.object({ boardId: z.number().positive(), userId: z.number().positive(), role: z.enum(membershipRoles) })).mutation(async ({ ctx, input }) => { if (ctx.user.role !== "admin") throw forbidden(); const [user, board] = await Promise.all([getById(COLLECTIONS.users, input.userId), getById(COLLECTIONS.boards, input.boardId)]); if (!user || !board) throw notFound(); const now = Date.now(); return getDb().runTransaction(async tx => { const existing = (await tx.get(col(COLLECTIONS.boardMemberships).where("userId", "==", input.userId).where("boardId", "==", input.boardId).where("role", "==", input.role).limit(1))).docs[0]; if (existing) { if (existing.get("isActive")) throw new DomainError("VALIDATION_FAILED", "errors.membershipExists"); tx.update(existing.ref, { isActive: true, assignedByUserId: ctx.user.id, updatedAt: now }); return { id: Number(existing.id), reactivated: true }; } const [membershipId] = await allocateIds(tx, COLLECTIONS.boardMemberships); tx.set(docRef(COLLECTIONS.boardMemberships, membershipId), { id: membershipId, ...input, isActive: true, assignedByUserId: ctx.user.id, createdAt: now, updatedAt: now } satisfies BoardMembership); return { id: membershipId, reactivated: false }; }); }),
  }),
});
export type AppRouter = typeof appRouter;
