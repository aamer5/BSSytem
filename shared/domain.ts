export const locales = ["ar", "en"] as const;
export type Locale = (typeof locales)[number];
export const boardRoles = ["requester", "secretary_member", "secretariat_head", "board_member", "board_head", "administrator"] as const;
export type BoardRole = (typeof boardRoles)[number];
export const lifecycleStatuses = ["draft", "submitted", "under_secretariat_review", "waiting_for_requester", "under_board_head_review", "proper", "not_proper", "withdrawn", "cancelled", "archived"] as const;
export type LifecycleStatus = (typeof lifecycleStatuses)[number];
export const workStatuses = ["unassigned", "assigned", "in_review", "waiting_for_requester", "completed"] as const;
export type WorkStatus = (typeof workStatuses)[number];
export const subjectTypes = ["general", "policy", "legal", "financial", "operational"] as const;
export type SubjectType = (typeof subjectTypes)[number];
export const priorities = ["low", "normal", "high", "urgent"] as const;
export type Priority = (typeof priorities)[number];
export const confidentialityLevels = ["standard", "restricted", "confidential"] as const;
export type ConfidentialityLevel = (typeof confidentialityLevels)[number];
export const decisionOutcomes = ["proper", "not_proper"] as const;
export type DecisionOutcome = (typeof decisionOutcomes)[number];
export const checklistAnswerTypes = ["text", "long_text", "numeric", "boolean", "single_select", "multi_select", "document_linked"] as const;
export type ChecklistAnswerType = (typeof checklistAnswerTypes)[number];
export type ChecklistAnswerValue = string | number | boolean | string[] | null;
export type RequestAction = "create_draft" | "edit_draft" | "answer_checklist" | "upload_attachment" | "submit" | "claim" | "release" | "assign" | "edit_working_copy" | "request_info" | "respond_info" | "return_to_requester" | "return_to_secretary_member" | "submit_to_board_head" | "decide" | "withdraw" | "archive";

export const subjectTypeLabels: Record<SubjectType, Record<Locale, string>> = {
  general: { ar: "عام", en: "General" }, policy: { ar: "سياسة", en: "Policy" }, legal: { ar: "قانوني", en: "Legal" }, financial: { ar: "مالي", en: "Financial" }, operational: { ar: "تشغيلي", en: "Operational" },
};
export const statusLabels: Record<LifecycleStatus, Record<Locale, string>> = {
  draft: { ar: "مسودة", en: "Draft" }, submitted: { ar: "مقدم", en: "Submitted" }, under_secretariat_review: { ar: "قيد مراجعة الأمانة", en: "Secretariat review" }, waiting_for_requester: { ar: "بانتظار مقدم الطلب", en: "Waiting for requester" }, under_board_head_review: { ar: "قيد مراجعة رئيس المجلس", en: "Board-head review" }, proper: { ar: "مستوفٍ", en: "Proper" }, not_proper: { ar: "غير مستوفٍ", en: "Not proper" }, withdrawn: { ar: "مسحوب", en: "Withdrawn" }, cancelled: { ar: "ملغى", en: "Cancelled" }, archived: { ar: "مؤرشف", en: "Archived" },
};
export const roleLabels: Record<BoardRole, Record<Locale, string>> = {
  requester: { ar: "مقدم طلب", en: "Requester" }, secretary_member: { ar: "عضو الأمانة", en: "Secretariat member" }, secretariat_head: { ar: "رئيس الأمانة", en: "Secretariat head" }, board_member: { ar: "عضو مجلس", en: "Board member" }, board_head: { ar: "رئيس المجلس", en: "Board head" }, administrator: { ar: "مدير النظام", en: "Administrator" },
};
export const priorityLabels: Record<Priority, Record<Locale, string>> = {
  low: { ar: "منخفضة", en: "Low" }, normal: { ar: "عادية", en: "Normal" }, high: { ar: "مرتفعة", en: "High" }, urgent: { ar: "عاجلة", en: "Urgent" },
};
export const confidentialityLabels: Record<ConfidentialityLevel, Record<Locale, string>> = {
  standard: { ar: "عادية", en: "Standard" }, restricted: { ar: "مقيدة", en: "Restricted" }, confidential: { ar: "سرية", en: "Confidential" },
};
