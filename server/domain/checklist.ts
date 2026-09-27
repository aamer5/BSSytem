import type { ChecklistAnswerValue } from "@shared/domain";
import type { ChecklistAnswer, ChecklistQuestion, ChecklistTemplate } from "@shared/schema";
import { DomainError } from "./errors";
import { answerHasValue } from "./workflow";

const invalidAnswer = (code: string) => new DomainError("VALIDATION_FAILED", "errors.invalidAnswer", { question: code });

export function questionOptions(question: Pick<ChecklistQuestion, "optionsJson">): string[] {
  return Array.isArray(question.optionsJson) ? question.optionsJson.filter((item): item is string => typeof item === "string") : [];
}

// Checks an answer against its question type and returns the value to store.
export function normalizeAnswer(question: ChecklistQuestion, value: ChecklistAnswerValue): ChecklistAnswerValue {
  if (value === null) return null;
  const options = questionOptions(question);
  switch (question.answerType) {
    case "numeric": {
      const number = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
      if (typeof value === "string" && value.trim() === "") return null;
      if (!Number.isFinite(number)) throw invalidAnswer(question.code);
      return number;
    }
    case "boolean":
      if (typeof value !== "boolean") throw invalidAnswer(question.code);
      return value;
    case "single_select":
      if (typeof value !== "string") throw invalidAnswer(question.code);
      if (value === "") return null;
      if (options.length && !options.includes(value)) throw invalidAnswer(question.code);
      return value;
    case "multi_select":
      if (!Array.isArray(value)) throw invalidAnswer(question.code);
      if (options.length && value.some(item => !options.includes(item))) throw invalidAnswer(question.code);
      return Array.from(new Set(value));
    default:
      if (typeof value !== "string") throw invalidAnswer(question.code);
      return value.trim() === "" ? null : value;
  }
}

// Required, active questions that still have no usable answer.
export function missingRequiredQuestions(questions: ChecklistQuestion[], answers: Pick<ChecklistAnswer, "checklistQuestionId" | "answerValue">[]) {
  const byQuestion = new Map(answers.map(answer => [answer.checklistQuestionId, answer.answerValue]));
  return questions.filter(question => question.isActive && question.required && !answerHasValue(byQuestion.get(question.id)));
}

// The active template for a request: a specialty-specific one wins over a board-wide one.
export function pickActiveTemplate(templates: ChecklistTemplate[], specialtyId: number) {
  const active = templates.filter(template => template.status === "active");
  return active.find(template => template.specialtyId === specialtyId) ?? active.find(template => template.specialtyId === null) ?? null;
}
