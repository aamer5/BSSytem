import { trpc } from "@/lib/trpc";
import type { ChecklistAnswerValue, Locale } from "@shared/domain";
import type { ChecklistAnswer, ChecklistQuestion } from "@shared/schema";
import { CheckCircle2, Circle } from "lucide-react";

const hasValue = (value: ChecklistAnswerValue | undefined) =>
  value !== null &&
  value !== undefined &&
  value !== "" &&
  !(Array.isArray(value) && value.length === 0);

// Renders each checklist question with an input that fits its answer type and saves as the requester goes.
export function ChecklistForm({
  requestId,
  questions,
  answers,
  editable,
  locale,
  onSaved,
  onError,
}: {
  requestId: number;
  questions: ChecklistQuestion[];
  answers: ChecklistAnswer[];
  editable: boolean;
  locale: Locale;
  onSaved: () => void;
  onError: (error: { message: string }) => void;
}) {
  const ar = locale === "ar";
  const answer = trpc.requests.answerChecklist.useMutation({
    onSuccess: onSaved,
    onError,
  });
  const valueOf = new Map(
    answers.map(item => [item.checklistQuestionId, item.answerValue])
  );
  const save = (question: ChecklistQuestion, value: ChecklistAnswerValue) => {
    const current = valueOf.get(question.id) ?? null;
    if (JSON.stringify(current) === JSON.stringify(value)) return;
    answer.mutate({
      requestId,
      checklistQuestionId: question.id,
      answerValue: value,
      finalConfirmation: true,
      locale,
    });
  };
  const required = questions.filter(question => question.required);
  const answeredRequired = required.filter(question =>
    hasValue(valueOf.get(question.id))
  ).length;

  if (!questions.length) {
    return (
      <p className="text-sm text-[#7d8479]">
        {ar
          ? "لا توجد قائمة تحقق مفعّلة لهذا المجلس."
          : "There is no active checklist for this board."}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {required.length > 0 && (
        <p
          className={`text-xs font-semibold ${answeredRequired === required.length ? "text-[#2f6b4f]" : "text-[#a1722d]"}`}
        >
          {ar
            ? `أُجيب عن ${answeredRequired} من ${required.length} سؤالًا إلزاميًا`
            : `${answeredRequired} of ${required.length} required questions answered`}
        </p>
      )}
      {questions.map(question => {
        const value = valueOf.get(question.id) ?? null;
        const text = ar ? question.textAr : question.textEn || question.textAr;
        const options = Array.isArray(question.optionsJson)
          ? (question.optionsJson as string[])
          : [];
        const inputId = `question-${question.id}`;
        return (
          <div key={question.id} className="text-sm">
            <label
              htmlFor={inputId}
              className="flex items-start gap-2 font-medium"
            >
              {hasValue(value) ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#2f6b4f]" />
              ) : (
                <Circle className="mt-0.5 h-4 w-4 shrink-0 text-[#c9c3b3]" />
              )}
              <span>
                {text}
                {question.required && (
                  <span className="text-[#9b4c3f]" aria-hidden>
                    {" "}
                    *
                  </span>
                )}
              </span>
            </label>
            <div className="mt-2 ps-6">
              {question.answerType === "boolean" ? (
                <div className="flex gap-2" role="radiogroup" id={inputId}>
                  {[true, false].map(option => (
                    <button
                      key={String(option)}
                      type="button"
                      role="radio"
                      aria-checked={value === option}
                      disabled={!editable}
                      onClick={() => save(question, option)}
                      className={`rounded-xl border px-4 py-1.5 text-sm ${value === option ? "border-[#163f43] bg-[#163f43] text-white" : "border-[#dcd8c9]"} disabled:opacity-60`}
                    >
                      {option ? (ar ? "نعم" : "Yes") : ar ? "لا" : "No"}
                    </button>
                  ))}
                </div>
              ) : question.answerType === "single_select" ? (
                <select
                  id={inputId}
                  className="field"
                  disabled={!editable}
                  value={typeof value === "string" ? value : ""}
                  onChange={e => save(question, e.target.value || null)}
                >
                  <option value="">{ar ? "اختر…" : "Choose…"}</option>
                  {options.map(option => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : question.answerType === "multi_select" ? (
                <div className="flex flex-wrap gap-3" id={inputId}>
                  {options.map(option => {
                    const selected = Array.isArray(value) ? value : [];
                    return (
                      <label key={option} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          disabled={!editable}
                          checked={selected.includes(option)}
                          onChange={e =>
                            save(
                              question,
                              e.target.checked
                                ? [...selected, option]
                                : selected.filter(item => item !== option)
                            )
                          }
                        />
                        {option}
                      </label>
                    );
                  })}
                </div>
              ) : question.answerType === "long_text" ? (
                <textarea
                  id={inputId}
                  className="field min-h-24"
                  disabled={!editable}
                  defaultValue={value === null ? "" : String(value)}
                  onBlur={e => save(question, e.target.value.trim() || null)}
                />
              ) : (
                <input
                  id={inputId}
                  className="field"
                  type={question.answerType === "numeric" ? "number" : "text"}
                  disabled={!editable}
                  defaultValue={value === null ? "" : String(value)}
                  onBlur={e => {
                    const raw = e.target.value.trim();
                    save(
                      question,
                      raw === ""
                        ? null
                        : question.answerType === "numeric"
                          ? Number(raw)
                          : raw
                    );
                  }}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
