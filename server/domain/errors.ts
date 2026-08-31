export class DomainError extends Error { constructor(public readonly code: string, public readonly messageKey: string, public readonly details?: Record<string, unknown>) { super(messageKey); this.name = "DomainError"; } }
export const forbidden = () => new DomainError("FORBIDDEN", "errors.forbidden");
export const notFound = () => new DomainError("NOT_FOUND", "errors.notFound");
export const invalidTransition = (from: string, action: string) => new DomainError("INVALID_TRANSITION", "errors.invalidTransition", { from, action });
export const validationFailed = (items: Array<Record<string, unknown>>) => new DomainError("VALIDATION_FAILED", "errors.validationFailed", { items });
export const claimConflict = (currentAssigneeId?: number | null) => new DomainError("CLAIM_CONFLICT", "errors.claimConflict", { currentAssigneeId: currentAssigneeId ?? null });
export const versionConflict = () => new DomainError("VERSION_CONFLICT", "errors.versionConflict");
export const noActiveChecklist = () => new DomainError("NO_ACTIVE_CHECKLIST", "errors.noActiveChecklist");
