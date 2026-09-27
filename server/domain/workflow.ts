import type { BoardRole, ChecklistAnswerValue, DecisionOutcome, LifecycleStatus, RequestAction, WorkStatus } from "@shared/domain";
import { authorizeAction } from "./permissions";
import { DomainError, forbidden, invalidTransition, validationFailed, versionConflict } from "./errors";
export type WorkflowState = { lifecycleStatus: LifecycleStatus; workStatus: WorkStatus; currentAssigneeId: number | null; rowVersion: number };
export type HistoryDraft = { actorUserId: number; actorRoleAtTime: BoardRole; action: RequestAction; beforeState: Record<string, unknown>; afterState: Record<string, unknown>; note?: string; correlationId?: string | null; createdAt: number };
const lifecycleRules: Partial<Record<RequestAction, readonly LifecycleStatus[]>> = { edit_draft: ["draft"], answer_checklist: ["draft", "under_secretariat_review", "waiting_for_requester"], upload_attachment: ["draft", "under_secretariat_review", "waiting_for_requester"], submit: ["draft"], claim: ["submitted"], release: ["under_secretariat_review"], assign: ["submitted", "under_secretariat_review"], edit_working_copy: ["under_secretariat_review"], request_info: ["under_secretariat_review"], respond_info: ["waiting_for_requester"], return_to_requester: ["under_secretariat_review"], return_to_secretary_member: ["under_secretariat_review"], submit_to_board_head: ["under_secretariat_review"], decide: ["under_board_head_review"], withdraw: ["draft", "submitted", "under_secretariat_review", "waiting_for_requester", "under_board_head_review"], archive: ["proper", "not_proper", "withdrawn", "cancelled"] };
export function assertLifecycle(state: WorkflowState, action: RequestAction) { const allowed = lifecycleRules[action]; if (allowed && !allowed.includes(state.lifecycleStatus)) throw invalidTransition(state.lifecycleStatus, action); }
export function assertWorkStatus(state: WorkflowState, allowed: readonly WorkStatus[], action: RequestAction) { if (!allowed.includes(state.workStatus)) throw invalidTransition(`${state.lifecycleStatus}/${state.workStatus}`, action); }
export function assertNonEmpty(value: string | null | undefined, key = "errors.noteRequired") { if (!value?.trim()) throw new DomainError("VALIDATION_FAILED", key); }
export function assertOwner(ownerId: number, actorId: number) { if (ownerId !== actorId) throw validationFailed([{ key: "errors.ownerRequired" }]); }
export function answerHasValue(value: ChecklistAnswerValue | undefined) { if (value === null || value === undefined) return false; if (typeof value === "string") return value.trim().length > 0; if (Array.isArray(value)) return value.length > 0; return true; }
export function conditionMatches(condition: { questionCode: string; operator: "equals" | "not_equals" | "includes"; value: unknown } | null, answers: Map<string, ChecklistAnswerValue>) { if (!condition) return true; const current = answers.get(condition.questionCode); if (condition.operator === "equals") return current === condition.value; if (condition.operator === "not_equals") return current !== condition.value; return Array.isArray(current) && current.includes(String(condition.value)); }
export const snapshotActions: RequestAction[] = ["submit", "submit_to_board_head", "withdraw", "archive", "decide"];
export function snapshotRequired(action: RequestAction) { return snapshotActions.includes(action); }
export function terminalDecisionState(outcome: DecisionOutcome): Pick<WorkflowState, "lifecycleStatus" | "workStatus"> { return { lifecycleStatus: outcome === "proper" ? "proper" : "not_proper", workStatus: "completed" }; }
export function assertOptimisticUpdateResult(result: unknown) { const header = Array.isArray(result) ? result[0] : result; if (!header || typeof header !== "object" || !("affectedRows" in header) || header.affectedRows !== 1) throw versionConflict(); }
export function buildHistory(before: WorkflowState, after: WorkflowState, actorUserId: number, actorRoleAtTime: BoardRole, action: RequestAction, now: number, note?: string, correlationId?: string | null): HistoryDraft { return { actorUserId, actorRoleAtTime, action, beforeState: { ...before }, afterState: { ...after }, note, correlationId, createdAt: now }; }

// Request-level workflow actions a user can trigger from the request page.
export const workflowActions = ["submit", "claim", "release", "assign", "request_info", "respond_info", "return_to_requester", "return_to_secretary_member", "submit_to_board_head", "decide", "withdraw", "archive"] as const;
export type WorkflowAction = (typeof workflowActions)[number];
const workRules: Record<WorkflowAction, readonly WorkStatus[]> = { submit: ["unassigned"], claim: ["unassigned"], release: ["assigned", "in_review"], assign: ["unassigned", "assigned", "in_review"], request_info: ["assigned", "in_review"], respond_info: ["waiting_for_requester"], return_to_requester: ["assigned", "in_review"], return_to_secretary_member: ["assigned", "in_review"], submit_to_board_head: ["assigned", "in_review"], decide: ["in_review"], withdraw: ["unassigned", "assigned", "in_review", "waiting_for_requester"], archive: ["completed"] };
// Only the request's own requester may perform these, even with the requester role.
const ownerActions: readonly WorkflowAction[] = ["submit", "respond_info", "withdraw"];
// A secretary member may only act on work currently assigned to them; the secretariat head may act on any.
const assigneeActions: readonly WorkflowAction[] = ["release", "request_info", "return_to_requester"];
// Actions that must carry an explanatory note.
export const noteRequiredActions: readonly WorkflowAction[] = ["request_info", "respond_info", "return_to_requester", "return_to_secretary_member"];

export type ActionContext = { state: WorkflowState; requesterUserId: number; userId: number; roles: BoardRole[]; isAdmin: boolean };

// Throws a DomainError explaining why the action is not allowed; returns the role the actor acts as.
export function checkAction(ctx: ActionContext, action: WorkflowAction) {
  const isOwner = ctx.requesterUserId === ctx.userId;
  if (ownerActions.includes(action) && !isOwner) throw forbidden();
  const actorRole = authorizeAction(ctx.roles, action, ctx.isAdmin && !ownerActions.includes(action));
  if (assigneeActions.includes(action) && actorRole === "secretary_member" && ctx.state.currentAssigneeId !== ctx.userId) throw forbidden();
  assertLifecycle(ctx.state, action);
  assertWorkStatus(ctx.state, workRules[action], action);
  return actorRole;
}

export function availableActions(ctx: ActionContext): WorkflowAction[] {
  return workflowActions.filter(action => { try { checkAction(ctx, action); return true; } catch { return false; } });
}

// Editing actions on a request (checklist answers, uploads). A requester may only edit their own request.
export function checkRequestEdit(ctx: ActionContext, action: "answer_checklist" | "upload_attachment" | "edit_draft") {
  const actorRole = authorizeAction(ctx.roles, action, ctx.isAdmin);
  if (actorRole === "requester" && ctx.requesterUserId !== ctx.userId) throw forbidden();
  assertLifecycle(ctx.state, action);
  return actorRole;
}

export function canEditRequest(ctx: ActionContext, action: "answer_checklist" | "upload_attachment" | "edit_draft") {
  try { checkRequestEdit(ctx, action); return true; } catch { return false; }
}
