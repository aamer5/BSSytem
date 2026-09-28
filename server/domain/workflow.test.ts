import { describe, expect, it } from "vitest";
import { DomainError } from "./errors";
import { answerHasValue, assertLifecycle, availableActions, checkAction, assertOptimisticUpdateResult, assertWorkStatus, buildHistory, conditionMatches, snapshotRequired, terminalDecisionState, type WorkflowState , canEditRequest, type ActionContext } from "./workflow";
const state: WorkflowState = { lifecycleStatus: "submitted", workStatus: "unassigned", currentAssigneeId: null, rowVersion: 4 };
describe("audited workflow guards", () => { it("permits only legal claims", () => { expect(() => assertLifecycle(state, "claim")).not.toThrow(); expect(() => assertWorkStatus(state, ["unassigned"], "claim")).not.toThrow(); expect(() => assertLifecycle({ ...state, lifecycleStatus: "draft" }, "claim")).toThrow(DomainError); expect(() => assertWorkStatus({ ...state, workStatus: "assigned" }, ["unassigned"], "claim")).toThrow(DomainError); }); it("requires usable answers and evaluates conditions", () => { expect(answerHasValue(null)).toBe(false); expect(answerHasValue(" ")).toBe(false); expect(answerHasValue(false)).toBe(true); expect(answerHasValue(0)).toBe(true); const answers = new Map([["Q1", true], ["Q2", ["finance"]]]); expect(conditionMatches({ questionCode: "Q1", operator: "equals", value: true }, answers)).toBe(true); expect(conditionMatches({ questionCode: "Q2", operator: "includes", value: "finance" }, answers)).toBe(true); }); it("uses snapshots for handoff and terminal actions only", () => { expect(snapshotRequired("submit")).toBe(true); expect(snapshotRequired("submit_to_board_head")).toBe(true); expect(snapshotRequired("decide")).toBe(true); expect(snapshotRequired("release")).toBe(false); }); it("maps decisions to terminal states", () => { expect(terminalDecisionState("proper")).toEqual({ lifecycleStatus: "proper", workStatus: "completed" }); expect(terminalDecisionState("not_proper")).toEqual({ lifecycleStatus: "not_proper", workStatus: "completed" }); }); });
describe("optimistic concurrency and audit immutability", () => { it("accepts one affected row and rejects stale writes", () => { expect(() => assertOptimisticUpdateResult({ affectedRows: 1 })).not.toThrow(); expect(() => assertOptimisticUpdateResult({ affectedRows: 0 })).toThrow(DomainError); }); it("copies before and after workflow states", () => { const before = { ...state }; const after = { ...state, lifecycleStatus: "under_secretariat_review" as const, workStatus: "assigned" as const, rowVersion: 5 }; const history = buildHistory(before, after, 8, "secretary_member", "claim", 1800000000000); before.rowVersion = 99; after.workStatus = "completed"; expect(history.beforeState.rowVersion).toBe(4); expect(history.afterState.workStatus).toBe("assigned"); expect(history.createdAt).toBe(1800000000000); }); });

describe("available workflow actions", () => {
  const base = { requesterUserId: 1, userId: 1, roles: [] as ("requester" | "secretary_member" | "secretariat_head" | "board_head")[], isAdmin: false };
  const at = (lifecycleStatus: WorkflowState["lifecycleStatus"], workStatus: WorkflowState["workStatus"], currentAssigneeId: number | null = null) => ({ lifecycleStatus, workStatus, currentAssigneeId, rowVersion: 1 });
  it("lets only the owner submit or withdraw a draft", () => {
    expect(availableActions({ ...base, roles: ["requester"], state: at("draft", "unassigned") })).toEqual(["submit", "withdraw"]);
    expect(availableActions({ ...base, userId: 2, roles: ["requester"], state: at("draft", "unassigned") })).toEqual([]);
    expect(() => checkAction({ ...base, userId: 2, roles: ["requester"], isAdmin: true, state: at("draft", "unassigned") }, "submit")).toThrow(DomainError);
  });
  it("limits secretary members to their own assigned work", () => {
    const state = at("under_secretariat_review", "assigned", 5);
    expect(availableActions({ ...base, userId: 5, roles: ["secretary_member"], state })).toEqual(["release", "request_info", "return_to_requester"]);
    expect(availableActions({ ...base, userId: 6, roles: ["secretary_member"], state })).toEqual([]);
    expect(availableActions({ ...base, userId: 7, roles: ["secretariat_head"], state })).toEqual(["release", "assign", "request_info", "return_to_requester", "return_to_secretary_member", "consult_general_head", "submit_to_board_head"]);
  });
  it("reserves decisions for board heads, even over admins", () => {
    const state = at("under_board_head_review", "in_review", 9);
    expect(availableActions({ ...base, userId: 9, roles: ["board_head"], state })).toEqual(["decide"]);
    expect(availableActions({ ...base, userId: 3, isAdmin: true, state })).not.toContain("decide");
  });
});

describe("general secretariat consultation", () => {
  const consulting = (overrides: Partial<ActionContext> = {}): ActionContext => ({ state: { lifecycleStatus: "under_general_secretariat_review", workStatus: "in_review", currentAssigneeId: 9, rowVersion: 4 }, requesterUserId: 1, userId: 9, roles: ["general_secretariat_head"], isAdmin: false, ...overrides });
  it("lets only the consulted general head reply", () => {
    expect(availableActions(consulting())).toEqual(["respond_consultation"]);
    expect(availableActions(consulting({ userId: 10 }))).toEqual([]);
    expect(availableActions(consulting({ userId: 2, roles: ["secretariat_head"] }))).toEqual([]);
  });
  it("lets the secretariat head consult during secretariat review", () => {
    const review: ActionContext = { state: { lifecycleStatus: "under_secretariat_review", workStatus: "assigned", currentAssigneeId: 2, rowVersion: 3 }, requesterUserId: 1, userId: 2, roles: ["secretariat_head"], isAdmin: false };
    expect(availableActions(review)).toContain("consult_general_head");
    expect(availableActions({ ...review, userId: 3, roles: ["secretary_member"] })).not.toContain("consult_general_head");
  });
});

describe("requester-only edits", () => {
  const draft: ActionContext = { state: { lifecycleStatus: "draft", workStatus: "unassigned", currentAssigneeId: null, rowVersion: 1 }, requesterUserId: 1, userId: 1, roles: ["requester"], isAdmin: false };
  const review: ActionContext = { ...draft, state: { ...draft.state, lifecycleStatus: "under_secretariat_review", workStatus: "assigned", currentAssigneeId: 2 } };
  it("lets only the request's own requester change checklist answers and draft contents", () => {
    expect(canEditRequest(draft, "answer_checklist")).toBe(true);
    expect(canEditRequest(draft, "edit_draft")).toBe(true);
    for (const other of [
      { userId: 2, roles: ["requester"] as const },
      { userId: 2, roles: ["secretariat_head"] as const },
      { userId: 2, roles: ["secretary_member"] as const },
      { userId: 9, roles: [] as const, isAdmin: true },
    ]) {
      expect(canEditRequest({ ...review, ...other, roles: [...other.roles] }, "answer_checklist")).toBe(false);
      expect(canEditRequest({ ...draft, ...other, roles: [...other.roles] }, "edit_draft")).toBe(false);
    }
  });
  it("still lets staff and admins upload documents during review", () => {
    expect(canEditRequest({ ...review, userId: 2, roles: ["secretariat_head"] }, "upload_attachment")).toBe(true);
    expect(canEditRequest({ ...review, userId: 9, roles: [], isAdmin: true }, "upload_attachment")).toBe(true);
  });
});
