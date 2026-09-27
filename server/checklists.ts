import type { ChecklistQuestion, ChecklistTemplate } from "@shared/schema";
import { col, COLLECTIONS, getById, queryAll, type Transaction } from "./firestore";
import { DomainError, notFound } from "./domain/errors";
import { pickActiveTemplate } from "./domain/checklist";

const byOrder = (a: ChecklistQuestion, b: ChecklistQuestion) => a.sortOrder - b.sortOrder || a.id - b.id;

// Active questions of a template, in display order.
export async function templateQuestions(templateId: number) {
  const rows = await queryAll<ChecklistQuestion>(col(COLLECTIONS.checklistQuestions).where("checklistTemplateId", "==", templateId));
  return rows.filter(question => question.isActive).sort(byOrder);
}

// The template a new request on this board and specialty should use, if any.
export async function activeTemplateFor(boardId: number, specialtyId: number) {
  const templates = await queryAll<ChecklistTemplate>(col(COLLECTIONS.checklistTemplates).where("boardId", "==", boardId).where("status", "==", "active"));
  return pickActiveTemplate(templates, specialtyId);
}

// Every template with its questions, for the administration page.
export async function listTemplates() {
  const [templates, questions] = await Promise.all([queryAll<ChecklistTemplate>(col(COLLECTIONS.checklistTemplates)), queryAll<ChecklistQuestion>(col(COLLECTIONS.checklistQuestions))]);
  const statusOrder = { active: 0, draft: 1, retired: 2 } as const;
  return templates
    .sort((a, b) => a.boardId - b.boardId || (a.specialtyId ?? 0) - (b.specialtyId ?? 0) || statusOrder[a.status] - statusOrder[b.status] || b.version - a.version)
    .map(template => ({ ...template, questions: questions.filter(question => question.checklistTemplateId === template.id && question.isActive).sort(byOrder) }));
}

// Next version number for templates covering the same board and specialty.
export async function nextTemplateVersion(tx: Transaction, boardId: number, specialtyId: number | null) {
  const rows = await tx.get(col(COLLECTIONS.checklistTemplates).where("boardId", "==", boardId).where("specialtyId", "==", specialtyId));
  return rows.docs.reduce((max, doc) => Math.max(max, Number(doc.get("version")) || 0), 0) + 1;
}

export async function loadDraftTemplate(templateId: number) {
  const template = await getById<ChecklistTemplate>(COLLECTIONS.checklistTemplates, templateId);
  if (!template) throw notFound();
  if (template.status !== "draft") throw new DomainError("VALIDATION_FAILED", "errors.templateNotDraft");
  return template;
}
