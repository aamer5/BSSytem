import { AttachmentLink } from "@/components/AttachmentLink";
import { trpc } from "@/lib/trpc";
import { questionComplete } from "@shared/checklist";
import type { ChecklistAnswerValue, Locale } from "@shared/domain";
import type {
  ChecklistAnswer,
  ChecklistQuestion,
  RequestAttachment,
} from "@shared/schema";
import { CheckCircle2, Circle, Loader2, Paperclip } from "lucide-react";
import { useState } from "react";

type AnswerPatch = {
  answerValue?: ChecklistAnswerValue;
  comment?: string | null;
  evidenceAttachmentId?: number | null;
};

// The request's checklist. Questions are Yes / No with notes; the admin may
// require a note and/or a supporting attachment on each one. Answers save as
// the requester goes. Older question types are still shown for old checklists.
export function ChecklistForm({
  requestId,
  questions,
  answers,
  attachments,
  editable,
  locale,
  onSaved,
  onError,
}: {
  requestId: number;
  questions: ChecklistQuestion[];
  answers: ChecklistAnswer[];
  attachments: RequestAttachment[];
  editable: boolean;
  locale: Locale;
  onSaved: () => void;
  onError: (error: { message: string }) => void;
}) {
  const ar = locale === "ar";
  const answer = trpc.requests.answerChecklist.useMutation({ onError });
  const upload = trpc.requests.attachments.upload.useMutation({ onError });
  const [uploadingFor, setUploadingFor] = useState<number | null>(null);
  const answerOf = new Map(
    answers.map(item => [item.checklistQuestionId, item])
  );
  const activeFiles = new Map(attachments.map(file => [file.id, file]));
  const activeIds = new Set(activeFiles.keys());

  const save = async (question: ChecklistQuestion, patch: AnswerPatch) => {
    await answer.mutateAsync({
      requestId,
      checklistQuestionId: question.id,
      ...patch,
      finalConfirmation: true,
      locale,
    });
    onSaved();
  };
  const saveIfChanged = (
    question: ChecklistQuestion,
    key: keyof AnswerPatch,
    value: AnswerPatch[keyof AnswerPatch]
  ) => {
    const current = answerOf.get(question.id)?.[key] ?? null;
    if (JSON.stringify(current) === JSON.stringify(value)) return;
    void save(question, { [key]: value }).catch(() => undefined);
  };
  const attach = (question: ChecklistQuestion, file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const raw = String(reader.result);
      setUploadingFor(question.id);
      try {
        const uploaded = await upload.mutateAsync({
          requestId,
          fileName: file.name,
          documentType: "checklist_evidence",
          mimeType: file.type || "application/octet-stream",
          dataBase64: raw.split(",")[1] || raw,
          requesterVisible: true,
          locale,
        });
        await save(question, { evidenceAttachmentId: uploaded.id });
      } catch {
        // onError already reported it.
      } finally {
        setUploadingFor(null);
      }
    };
    reader.readAsDataURL(file);
  };

  if (!questions.length) {
    return (
      <p className="text-sm text-[#7d8479]">
        {ar
          ? "لا توجد قائمة تحقق مفعّلة لهذا المجلس."
          : "There is no active checklist for this board."}
      </p>
    );
  }

  const complete = questions.filter(question =>
    questionComplete(question, answerOf.get(question.id), activeIds)
  ).length;

  return (
    <div className="space-y-5">
      <p
        className={`text-xs font-semibold ${complete === questions.length ? "text-[#2f6b4f]" : "text-[#a1722d]"}`}
      >
        {ar
          ? `اكتمل ${complete} من ${questions.length} سؤالًا`
          : `${complete} of ${questions.length} questions complete`}
      </p>
      {questions.map((question, index) => {
        const stored = answerOf.get(question.id);
        const value = stored?.answerValue ?? null;
        const done = questionComplete(question, stored, activeIds);
        const text = ar ? question.textAr : question.textEn || question.textAr;
        const evidence =
          stored?.evidenceAttachmentId != null
            ? activeFiles.get(stored.evidenceAttachmentId)
            : undefined;
        const isYesNo = question.answerType === "boolean";
        const inputId = `question-${question.id}`;
        return (
          <fieldset
            key={question.id}
            className="rounded-2xl border border-[#eee9df] p-4 text-sm"
          >
            <legend className="sr-only">{text}</legend>
            <div className="flex items-start gap-2 font-medium">
              {done ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#2f6b4f]" />
              ) : (
                <Circle className="mt-0.5 h-4 w-4 shrink-0 text-[#c9c3b3]" />
              )}
              <span>
                <span className="text-[#7d8479]">{index + 1}. </span>
                {text}
                {question.required && (
                  <span className="text-[#9b4c3f]" aria-hidden>
                    {" "}
                    *
                  </span>
                )}
              </span>
            </div>

            <div className="mt-3 space-y-3 ps-6">
              {isYesNo ? (
                <div className="flex gap-2" role="radiogroup" aria-label={text}>
                  {[true, false].map(option => (
                    <button
                      key={String(option)}
                      type="button"
                      role="radio"
                      aria-checked={value === option}
                      disabled={!editable}
                      onClick={() =>
                        saveIfChanged(question, "answerValue", option)
                      }
                      className={`rounded-xl border px-5 py-1.5 text-sm ${value === option ? "border-[#163f43] bg-[#163f43] text-white" : "border-[#dcd8c9] bg-white"} disabled:opacity-60`}
                    >
                      {option ? (ar ? "نعم" : "Yes") : ar ? "لا" : "No"}
                    </button>
                  ))}
                </div>
              ) : (
                <LegacyAnswer
                  question={question}
                  value={value}
                  inputId={inputId}
                  editable={editable}
                  locale={locale}
                  onSave={next => saveIfChanged(question, "answerValue", next)}
                />
              )}

              {isYesNo && (
                <label className="block text-xs font-medium text-[#53645f]">
                  {ar ? "ملاحظات" : "Notes"}{" "}
                  <span
                    className={
                      question.noteRequired
                        ? "text-[#9b4c3f]"
                        : "font-normal text-[#7d8479]"
                    }
                  >
                    {question.noteRequired
                      ? ar
                        ? "(إلزامية)"
                        : "(required)"
                      : ar
                        ? "(اختيارية)"
                        : "(optional)"}
                  </span>
                  <textarea
                    className="field mt-1.5 min-h-20 text-sm font-normal"
                    disabled={!editable}
                    defaultValue={stored?.comment ?? ""}
                    onBlur={e =>
                      saveIfChanged(
                        question,
                        "comment",
                        e.target.value.trim() || null
                      )
                    }
                  />
                </label>
              )}

              {(question.attachmentRequired || evidence) && (
                <div className="text-xs">
                  <p className="font-medium text-[#53645f]">
                    {ar ? "المرفق" : "Attachment"}{" "}
                    {question.attachmentRequired && (
                      <span className="text-[#9b4c3f]">
                        {ar ? "(إلزامي)" : "(required)"}
                      </span>
                    )}
                  </p>
                  {evidence ? (
                    <div className="mt-1.5 flex flex-wrap items-center gap-3 rounded-xl bg-[#f7f5ef] px-3 py-2">
                      <Paperclip className="h-4 w-4 text-[#a1722d]" />
                      <span className="text-sm">
                        {evidence.originalFileName}
                      </span>
                      <AttachmentLink
                        attachmentId={evidence.id}
                        locale={locale}
                        onError={message => onError({ message })}
                      />
                    </div>
                  ) : (
                    !editable && (
                      <p className="mt-1.5 text-[#9b4c3f]">
                        {ar ? "لم يُرفق مستند." : "No document attached."}
                      </p>
                    )
                  )}
                  {editable && (
                    <label className="mt-2 flex items-center gap-2">
                      {uploadingFor === question.id && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                      <span className="text-[#53645f]">
                        {evidence
                          ? ar
                            ? "استبدال المرفق:"
                            : "Replace attachment:"
                          : ar
                            ? "إرفاق مستند:"
                            : "Attach a document:"}
                      </span>
                      <input
                        type="file"
                        className="text-xs"
                        accept="application/pdf,image/*,.doc,.docx"
                        disabled={uploadingFor !== null}
                        aria-label={
                          ar
                            ? `مرفق السؤال ${index + 1}`
                            : `Attachment for question ${index + 1}`
                        }
                        onChange={e => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (file) attach(question, file);
                        }}
                      />
                    </label>
                  )}
                </div>
              )}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}

// Inputs for question types used before checklists became Yes / No with notes.
function LegacyAnswer({
  question,
  value,
  inputId,
  editable,
  locale,
  onSave,
}: {
  question: ChecklistQuestion;
  value: ChecklistAnswerValue;
  inputId: string;
  editable: boolean;
  locale: Locale;
  onSave: (value: ChecklistAnswerValue) => void;
}) {
  const ar = locale === "ar";
  const options = Array.isArray(question.optionsJson)
    ? (question.optionsJson as string[])
    : [];
  if (question.answerType === "single_select")
    return (
      <select
        id={inputId}
        className="field"
        disabled={!editable}
        value={typeof value === "string" ? value : ""}
        onChange={e => onSave(e.target.value || null)}
      >
        <option value="">{ar ? "اختر…" : "Choose…"}</option>
        {options.map(option => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  if (question.answerType === "multi_select") {
    const selected = Array.isArray(value) ? value : [];
    return (
      <div className="flex flex-wrap gap-3" id={inputId}>
        {options.map(option => (
          <label key={option} className="flex items-center gap-2">
            <input
              type="checkbox"
              disabled={!editable}
              checked={selected.includes(option)}
              onChange={e =>
                onSave(
                  e.target.checked
                    ? [...selected, option]
                    : selected.filter(item => item !== option)
                )
              }
            />
            {option}
          </label>
        ))}
      </div>
    );
  }
  if (question.answerType === "long_text")
    return (
      <textarea
        id={inputId}
        className="field min-h-24"
        disabled={!editable}
        defaultValue={value === null ? "" : String(value)}
        onBlur={e => onSave(e.target.value.trim() || null)}
      />
    );
  return (
    <input
      id={inputId}
      className="field"
      type={question.answerType === "numeric" ? "number" : "text"}
      disabled={!editable}
      defaultValue={value === null ? "" : String(value)}
      onBlur={e => {
        const raw = e.target.value.trim();
        onSave(
          raw === ""
            ? null
            : question.answerType === "numeric"
              ? Number(raw)
              : raw
        );
      }}
    />
  );
}
