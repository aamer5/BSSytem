import type { BoardRole, ConfidentialityLevel } from "@shared/domain";
import type { RequestAttachment, RequestDecision, RequestHistory, SubjectRequest } from "@shared/schema";

// "staff" sees the whole working file; "owner" is the requester's own view with
// internal material removed; null means the request is not visible at all.
export type Audience = "staff" | "owner" | null;

// Board roles that may read requests of each confidentiality level. A
// secretary member can always read confidential work assigned to them.
const readers: Record<ConfidentialityLevel, readonly BoardRole[]> = {
  standard: ["secretary_member", "secretariat_head", "board_member", "board_head"],
  restricted: ["secretary_member", "secretariat_head", "board_head"],
  confidential: ["secretariat_head", "board_head"],
};

type Viewer = { userId: number; roles: BoardRole[]; isAdmin: boolean };
type RequestScope = Pick<SubjectRequest, "requesterUserId" | "lifecycleStatus" | "confidentialityLevel" | "currentAssigneeId" | "assignedSecretaryMemberId">;

export function requestAudience(viewer: Viewer, request: RequestScope): Audience {
  if (viewer.isAdmin) return "staff";
  const isOwner = request.requesterUserId === viewer.userId;
  // Drafts are private to their author until they are submitted.
  if (request.lifecycleStatus === "draft") return isOwner ? "owner" : null;
  const assigned = request.currentAssigneeId === viewer.userId || request.assignedSecretaryMemberId === viewer.userId;
  const allowed = readers[request.confidentialityLevel] ?? readers.confidential;
  if (viewer.roles.some(role => allowed.includes(role)) || (assigned && viewer.roles.includes("secretary_member"))) return "staff";
  return isOwner ? "owner" : null;
}

// Actions whose notes are internal secretariat communication.
const internalNoteActions = ["claim", "release", "assign", "return_to_secretary_member", "submit_to_board_head", "archive"];
const internalFields = ["internalNotes", "secretaryFindings", "summary", "recommendations", "completenessResult", "jurisdictionResult", "duplicationResult"] as const;

// The requester's view of a request: internal fields, hidden decisions,
// staff-only documents, internal notes and snapshots are removed.
export function ownerView<T extends { request: SubjectRequest; decisions: Array<{ decision: RequestDecision }>; attachments: RequestAttachment[]; history: RequestHistory[] }>(data: T, userId: number) {
  const request = { ...data.request };
  for (const field of internalFields) request[field] = null;
  if (!request.decisionNoteRequesterVisible) {
    request.decisionNote = null;
    request.decisionReasonCode = null;
  }
  const decisionVisible = Boolean(data.request.decisionNoteRequesterVisible);
  return {
    ...data,
    request,
    decisions: data.decisions.filter(item => item.decision.requesterVisible),
    attachments: data.attachments.filter(file => file.requesterVisible || file.uploadedByUserId === userId),
    history: data.history.map(entry => {
      const hidden = internalNoteActions.includes(entry.action) || (entry.action === "decide" && !decisionVisible);
      // before/after states hold the full request, internal fields included.
      return { ...entry, note: hidden ? null : entry.note, beforeState: {}, afterState: {} };
    }),
    snapshots: [],
  };
}

export function canReadAttachment(audience: Audience, attachment: Pick<RequestAttachment, "requesterVisible" | "uploadedByUserId" | "isActive">, userId: number) {
  if (!attachment.isActive || !audience) return false;
  return audience === "staff" || attachment.requesterVisible || attachment.uploadedByUserId === userId;
}
