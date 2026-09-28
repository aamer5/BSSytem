export const locales = ["ar", "en"] as const;
export type Locale = (typeof locales)[number];
// general_secretariat_head is platform-wide (a user flag), not a board membership.
export const boardRoles = ["requester", "secretary_member", "secretariat_head", "board_member", "board_head", "general_secretariat_head", "administrator"] as const;
export type BoardRole = (typeof boardRoles)[number];
export const lifecycleStatuses = ["draft", "submitted", "under_secretariat_review", "under_general_secretariat_review", "waiting_for_requester", "under_board_head_review", "proper", "not_proper", "withdrawn", "cancelled", "archived"] as const;
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
export type RequestAction = "create_draft" | "edit_draft" | "answer_checklist" | "upload_attachment" | "submit" | "claim" | "release" | "assign" | "edit_working_copy" | "request_info" | "respond_info" | "return_to_requester" | "return_to_secretary_member" | "consult_general_head" | "respond_consultation" | "submit_to_board_head" | "decide" | "withdraw" | "archive";

export const subjectTypeLabels: Record<SubjectType, Record<Locale, string>> = {
  general: { ar: "عام", en: "General" }, policy: { ar: "سياسة", en: "Policy" }, legal: { ar: "قانوني", en: "Legal" }, financial: { ar: "مالي", en: "Financial" }, operational: { ar: "تشغيلي", en: "Operational" },
};
export const statusLabels: Record<LifecycleStatus, Record<Locale, string>> = {
  draft: { ar: "مسودة", en: "Draft" }, submitted: { ar: "مقدم", en: "Submitted" }, under_secretariat_review: { ar: "قيد مراجعة الأمانة", en: "Secretariat review" }, under_general_secretariat_review: { ar: "قيد استشارة الأمين العام", en: "With the general secretariat head" }, waiting_for_requester: { ar: "بانتظار مقدم الطلب", en: "Waiting for requester" }, under_board_head_review: { ar: "قيد مراجعة رئيس المجلس", en: "Board-head review" }, proper: { ar: "مستوفٍ", en: "Proper" }, not_proper: { ar: "غير مستوفٍ", en: "Not proper" }, withdrawn: { ar: "مسحوب", en: "Withdrawn" }, cancelled: { ar: "ملغى", en: "Cancelled" }, archived: { ar: "مؤرشف", en: "Archived" },
};
export const roleLabels: Record<BoardRole, Record<Locale, string>> = {
  requester: { ar: "مقدم طلب", en: "Requester" }, secretary_member: { ar: "عضو الأمانة", en: "Secretariat member" }, secretariat_head: { ar: "رئيس الأمانة", en: "Secretariat head" }, board_member: { ar: "عضو مجلس", en: "Board member" }, board_head: { ar: "رئيس المجلس", en: "Board head" }, general_secretariat_head: { ar: "رئيس الأمانة العامة", en: "General secretariat head" }, administrator: { ar: "مدير النظام", en: "Administrator" },
};
export const priorityLabels: Record<Priority, Record<Locale, string>> = {
  low: { ar: "منخفضة", en: "Low" }, normal: { ar: "عادية", en: "Normal" }, high: { ar: "مرتفعة", en: "High" }, urgent: { ar: "عاجلة", en: "Urgent" },
};
export const confidentialityLabels: Record<ConfidentialityLevel, Record<Locale, string>> = {
  standard: { ar: "عادية", en: "Standard" }, restricted: { ar: "مقيدة", en: "Restricted" }, confidential: { ar: "سرية", en: "Confidential" },
};

// Labels for audit-history entries and the workflow buttons on the request page.
export const actionLabels: Record<string, Record<Locale, string>> = {
  create_draft: { ar: "إنشاء مسودة", en: "Draft created" },
  edit_draft: { ar: "تعديل المسودة", en: "Draft edited" },
  submit: { ar: "تقديم الطلب", en: "Submit request" },
  claim: { ar: "استلام للمراجعة", en: "Claim for review" },
  release: { ar: "إعادة إلى قائمة الانتظار", en: "Release to queue" },
  assign: { ar: "إسناد إلى عضو أمانة", en: "Assign to secretary" },
  request_info: { ar: "طلب معلومات إضافية", en: "Request more information" },
  respond_info: { ar: "إرسال المعلومات المطلوبة", en: "Send requested information" },
  return_to_requester: { ar: "إعادة إلى مقدم الطلب", en: "Return to requester" },
  return_to_secretary_member: { ar: "إعادة إلى عضو الأمانة", en: "Return to secretary" },
  consult_general_head: { ar: "استشارة رئيس الأمانة العامة", en: "Consult the general secretariat head" },
  respond_consultation: { ar: "الرد على الاستشارة", en: "Reply to consultation" },
  submit_to_board_head: { ar: "رفع إلى رئيس المجلس", en: "Send to board head" },
  decide: { ar: "تسجيل القرار", en: "Record decision" },
  withdraw: { ar: "سحب الطلب", en: "Withdraw request" },
  archive: { ar: "أرشفة", en: "Archive" },
};

export const decisionReasonCodes = ["complete", "incomplete", "out_of_jurisdiction", "duplicate", "other"] as const;
export const decisionReasonLabels: Record<(typeof decisionReasonCodes)[number], Record<Locale, string>> = {
  complete: { ar: "مستوفٍ لجميع المتطلبات", en: "Meets all requirements" },
  incomplete: { ar: "بيانات أو مستندات ناقصة", en: "Missing information or documents" },
  out_of_jurisdiction: { ar: "خارج اختصاص المجلس", en: "Outside the board's mandate" },
  duplicate: { ar: "موضوع مكرر", en: "Duplicate subject" },
  other: { ar: "سبب آخر", en: "Other reason" },
};

// Messages for the translation keys the API returns as error messages.
export const errorLabels: Record<string, Record<Locale, string>> = {
  "errors.forbidden": { ar: "لا تملك صلاحية تنفيذ هذا الإجراء.", en: "You don't have permission to do this." },
  "errors.notFound": { ar: "الطلب غير موجود.", en: "The request was not found." },
  "errors.versionConflict": { ar: "حدّث مستخدم آخر هذا الطلب للتو. حدّث الصفحة وأعد المحاولة.", en: "Someone else just updated this request. Refresh and try again." },
  "errors.claimConflict": { ar: "استلم مستخدم آخر هذا الطلب.", en: "Someone else has already claimed this request." },
  "errors.invalidTransition": { ar: "لا يمكن تنفيذ هذا الإجراء في حالة الطلب الحالية.", en: "This action isn't possible in the request's current state." },
  "errors.noteRequired": { ar: "أضف ملاحظة توضيحية قبل المتابعة.", en: "Add an explanatory note before continuing." },
  "errors.invalidAssignee": { ar: "اختر شخصًا من أعضاء المجلس المؤهلين.", en: "Choose an eligible member of this board." },
  "errors.membershipExists": { ar: "هذه العضوية موجودة ومفعّلة بالفعل.", en: "This membership already exists and is active." },
  "errors.validationFailed": { ar: "تحقق من البيانات المدخلة.", en: "Please check the information you entered." },
  "errors.invalidAnswer": { ar: "الإجابة لا تناسب نوع السؤال.", en: "That answer doesn't fit the question type." },
  "errors.checklistIncomplete": { ar: "أجب عن جميع أسئلة قائمة التحقق الإلزامية قبل الإرسال.", en: "Answer every required checklist question before submitting." },
  "errors.questionNotOnChecklist": { ar: "هذا السؤال ليس ضمن قائمة التحقق لهذا الطلب.", en: "This question isn't part of this request's checklist." },
  "errors.templateNotDraft": { ar: "لا يمكن تعديل إلا القوالب في حالة المسودة. أنشئ نسخة جديدة للتعديل.", en: "Only draft templates can be changed. Create a new version to edit it." },
  "errors.templateHasNoQuestions": { ar: "أضف سؤالًا واحدًا على الأقل قبل تفعيل القالب.", en: "Add at least one question before activating the template." },
  "errors.optionsRequired": { ar: "أضف خيارين على الأقل لسؤال الاختيار.", en: "Add at least two options for a choice question." },
  "errors.boardCodeExists": { ar: "رمز المجلس مستخدم لمجلس آخر.", en: "That board code is already used by another board." },
  "errors.headInTeam": { ar: "رئيس الأمانة لا يُضاف ضمن فريق الأمانة؛ اختر أعضاء آخرين للفريق.", en: "The secretariat head can't also be in the secretariat team; choose other team members." },
  "errors.lastSecretariatHead": { ar: "لا يمكن تعطيل آخر رئيس أمانة في المجلس. عيّن رئيسًا آخر أولًا.", en: "This is the board's only secretariat head. Assign another one first." },
  "errors.lastBoardHead": { ar: "لا يمكن تعطيل رئيس المجلس الوحيد. عيّن رئيسًا آخر أولًا.", en: "This is the board's only board head. Assign another one first." },
  "errors.boardHeadInSecretariat": { ar: "رئيس المجلس لا يكون من أعضاء الأمانة في المجلس نفسه.", en: "The board head can't also be part of the same board's secretariat." },
  "errors.lastSecretaryMember": { ar: "لا يمكن تعطيل آخر عضو في فريق الأمانة بالمجلس. أضف عضوًا آخر أولًا.", en: "This is the board's only secretariat team member. Add another one first." },
  "errors.fileEmpty": { ar: "الملف فارغ.", en: "The file is empty." },
  "errors.fileTooLarge": { ar: "حجم الملف أكبر من 10 ميجابايت.", en: "The file is larger than 10 MB." },
  "errors.fileUnavailable": { ar: "هذا الملف غير متاح. ربما رُفع قبل نقل النظام؛ اطلب رفعه من جديد.", en: "This file isn't available. It may have been uploaded before the system moved; ask for it to be uploaded again." },
  "errors.invalidEvidence": { ar: "المرفق غير صالح لهذا الطلب.", en: "That attachment doesn't belong to this request." },
  "errors.questionCodeExists": { ar: "رمز السؤال مستخدم في هذا القالب.", en: "That question code is already used in this template." },
};

export const answerTypeLabels: Record<ChecklistAnswerType, Record<Locale, string>> = {
  text: { ar: "نص قصير", en: "Short text" },
  long_text: { ar: "نص طويل", en: "Long text" },
  numeric: { ar: "رقم", en: "Number" },
  boolean: { ar: "نعم / لا", en: "Yes / No" },
  single_select: { ar: "اختيار واحد", en: "Single choice" },
  multi_select: { ar: "اختيار متعدد", en: "Multiple choice" },
  document_linked: { ar: "مرتبط بمستند", en: "Document reference" },
};

export const templateStatusLabels: Record<"draft" | "active" | "retired", Record<Locale, string>> = {
  draft: { ar: "مسودة", en: "Draft" },
  active: { ar: "مفعّل", en: "Active" },
  retired: { ar: "موقوف", en: "Retired" },
};
