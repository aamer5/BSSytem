import type { ChecklistAnswerValue } from "./domain";
import type { ChecklistAnswer, ChecklistQuestion } from "./schema";

export function answerHasValue(value: ChecklistAnswerValue | undefined) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export type AnswerParts = Pick<ChecklistAnswer, "checklistQuestionId" | "answerValue"> & Partial<Pick<ChecklistAnswer, "comment" | "evidenceAttachmentId">>;

// Whether one question has everything it asks for: an answer when required,
// a note when notes are required and an attachment when one is required.
// Used by the server before submitting and by the request page for progress.
export function questionComplete(question: Pick<ChecklistQuestion, "required" | "noteRequired" | "attachmentRequired">, answer: AnswerParts | undefined, activeAttachmentIds?: ReadonlySet<number>) {
  if (question.required && !answerHasValue(answer?.answerValue)) return false;
  if (question.noteRequired && !answer?.comment?.trim()) return false;
  if (question.attachmentRequired) {
    const evidence = answer?.evidenceAttachmentId ?? null;
    if (evidence === null || (activeAttachmentIds && !activeAttachmentIds.has(evidence))) return false;
  }
  return true;
}
