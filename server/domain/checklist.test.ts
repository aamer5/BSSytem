import { describe, expect, it } from "vitest";
import type { ChecklistQuestion, ChecklistTemplate } from "@shared/schema";
import { missingRequiredQuestions, normalizeAnswer, pickActiveTemplate } from "./checklist";

const question = (overrides: Partial<ChecklistQuestion>): ChecklistQuestion => ({ id: 1, checklistTemplateId: 1, code: "Q1", textAr: "سؤال", textEn: null, answerType: "text", required: true, sortOrder: 1, showIfJson: null, linkedDocumentType: null, optionsJson: null, isActive: true, createdAt: 0, updatedAt: 0, ...overrides });
const template = (overrides: Partial<ChecklistTemplate>): ChecklistTemplate => ({ id: 1, boardId: 1, specialtyId: null, subjectType: null, nameAr: "قالب", nameEn: null, version: 1, status: "active", createdByUserId: 1, activatedAt: 0, retiredAt: null, createdAt: 0, updatedAt: 0, ...overrides });

describe("checklist answers", () => {
  it("normalizes answers by question type", () => {
    expect(normalizeAnswer(question({ answerType: "numeric" }), "12.5")).toBe(12.5);
    expect(normalizeAnswer(question({ answerType: "numeric" }), " ")).toBeNull();
    expect(() => normalizeAnswer(question({ answerType: "numeric" }), "abc")).toThrow("errors.invalidAnswer");
    expect(() => normalizeAnswer(question({ answerType: "boolean" }), "yes")).toThrow("errors.invalidAnswer");
    expect(normalizeAnswer(question({ answerType: "text" }), "  ")).toBeNull();
    const select = question({ answerType: "single_select", optionsJson: ["A", "B"] });
    expect(normalizeAnswer(select, "A")).toBe("A");
    expect(() => normalizeAnswer(select, "C")).toThrow("errors.invalidAnswer");
    const multi = question({ answerType: "multi_select", optionsJson: ["A", "B"] });
    expect(normalizeAnswer(multi, ["A", "A", "B"])).toEqual(["A", "B"]);
    expect(() => normalizeAnswer(multi, ["Z"])).toThrow("errors.invalidAnswer");
  });

  it("lists required questions without a usable answer", () => {
    const questions = [question({ id: 1 }), question({ id: 2 }), question({ id: 3, required: false }), question({ id: 4, isActive: false })];
    const missing = missingRequiredQuestions(questions, [{ checklistQuestionId: 1, answerValue: "done" }, { checklistQuestionId: 2, answerValue: "" }]);
    expect(missing.map(item => item.id)).toEqual([2]);
  });

  it("prefers the specialty template over the board-wide one", () => {
    const boardWide = template({ id: 1 });
    const specialty = template({ id: 2, specialtyId: 5 });
    expect(pickActiveTemplate([boardWide, specialty], 5)?.id).toBe(2);
    expect(pickActiveTemplate([boardWide, specialty], 6)?.id).toBe(1);
    expect(pickActiveTemplate([template({ status: "draft" })], 6)).toBeNull();
  });
});
