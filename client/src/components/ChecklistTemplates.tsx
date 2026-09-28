import { describeApiError } from "@/lib/errors";
import { trpc } from "@/lib/trpc";
import {
  answerTypeLabels,
  templateStatusLabels,
  type Locale,
} from "@shared/domain";
import { CheckCircle2, Copy, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

type Board = { id: number; nameAr: string; nameEn: string | null };
type Specialty = Board & { boardId: number };
type Message = { tone: "ok" | "error"; text: string } | null;

const statusStyles = {
  draft: "bg-[#fff8e7] text-[#8a6424]",
  active: "bg-[#e6f1ed] text-[#2f6b4f]",
  retired: "bg-[#efedea] text-[#7d8479]",
} as const;

// Build checklist templates per board (or specialty), add questions and activate them.
export function ChecklistTemplates({
  locale,
  boards,
  specialties,
}: {
  locale: Locale;
  boards: Board[];
  specialties: Specialty[];
}) {
  const ar = locale === "ar";
  const templates = trpc.admin.checklists.useQuery();
  const [boardId, setBoardId] = useState("");
  const [specialtyId, setSpecialtyId] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [message, setMessage] = useState<Message>(null);
  const name = (item: Pick<Board, "nameAr" | "nameEn">) =>
    ar ? item.nameAr : item.nameEn || item.nameAr;
  const done = (text: string) => {
    setMessage({ tone: "ok", text });
    templates.refetch();
  };
  const onError = (error: { message: string }) =>
    setMessage({ tone: "error", text: describeApiError(error, locale) });

  const create = trpc.admin.createTemplate.useMutation({
    onSuccess: () => {
      setNameAr("");
      setNameEn("");
      done(ar ? "تم إنشاء القالب كمسودة." : "Template created as a draft.");
    },
    onError,
  });
  const activate = trpc.admin.activateTemplate.useMutation({
    onSuccess: () =>
      done(
        ar
          ? "تم تفعيل القالب. ستستخدمه الطلبات الجديدة."
          : "Template activated. New requests will use it."
      ),
    onError,
  });
  const retire = trpc.admin.retireTemplate.useMutation({
    onSuccess: () => done(ar ? "تم إيقاف القالب." : "Template retired."),
    onError,
  });
  const copy = trpc.admin.newTemplateVersion.useMutation({
    onSuccess: () =>
      done(
        ar
          ? "أُنشئت نسخة جديدة كمسودة للتعديل."
          : "A new draft version was created for editing."
      ),
    onError,
  });
  const removeQuestion = trpc.admin.removeQuestion.useMutation({
    onSuccess: () => done(ar ? "تم حذف السؤال." : "Question removed."),
    onError,
  });

  const boardSpecialties = specialties.filter(
    item => String(item.boardId) === boardId
  );
  const boardName = new Map(boards.map(board => [board.id, name(board)]));
  const specialtyName = new Map(specialties.map(item => [item.id, name(item)]));

  return (
    <section className="rounded-3xl border border-[#e2ded2] bg-white p-6">
      <h2 className="font-semibold">
        {ar ? "قوالب قوائم التحقق" : "Checklist templates"}
      </h2>
      <p className="mt-1 text-xs leading-6 text-[#7d8479]">
        {ar
          ? "يُطبّق القالب المفعّل على الطلبات الجديدة للمجلس. قالب التخصص يسبق قالب المجلس العام. لا يمكن تعديل القالب بعد تفعيله؛ أنشئ نسخة جديدة بدلًا من ذلك."
          : "The active template is applied to new requests on its board; a specialty template wins over a board-wide one. Active templates can't be edited — create a new version instead."}
      </p>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <select
          className="field"
          value={boardId}
          onChange={e => {
            setBoardId(e.target.value);
            setSpecialtyId("");
          }}
          aria-label={ar ? "مجلس القالب" : "Template board"}
        >
          <option value="">{ar ? "اختر المجلس" : "Choose board"}</option>
          {boards.map(board => (
            <option key={board.id} value={board.id}>
              {name(board)}
            </option>
          ))}
        </select>
        <select
          className="field"
          value={specialtyId}
          onChange={e => setSpecialtyId(e.target.value)}
          disabled={!boardId}
          aria-label={ar ? "تخصص القالب" : "Template specialty"}
        >
          <option value="">{ar ? "كل التخصصات" : "All specialties"}</option>
          {boardSpecialties.map(item => (
            <option key={item.id} value={item.id}>
              {name(item)}
            </option>
          ))}
        </select>
        <input
          className="field"
          value={nameAr}
          onChange={e => setNameAr(e.target.value)}
          placeholder="اسم القالب بالعربية"
          aria-label={ar ? "اسم القالب بالعربية" : "Template Arabic name"}
        />
        <input
          className="field"
          value={nameEn}
          onChange={e => setNameEn(e.target.value)}
          placeholder="English name"
          aria-label={ar ? "اسم القالب بالإنجليزية" : "Template English name"}
        />
      </div>
      <button
        disabled={!boardId || nameAr.trim().length < 2 || create.isPending}
        onClick={() =>
          create.mutate({
            boardId: Number(boardId),
            specialtyId: specialtyId ? Number(specialtyId) : undefined,
            nameAr: nameAr.trim(),
            nameEn: nameEn.trim() || undefined,
          })
        }
        className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#163f43] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        <Plus className="h-4 w-4" />
        {ar ? "إنشاء قالب" : "Create template"}
      </button>

      {message && (
        <p
          className={`mt-4 rounded-xl p-3 text-sm ${message.tone === "ok" ? "bg-[#f0f8f3] text-[#2f6b4f]" : "bg-[#fff4f1] text-[#9b4c3f]"}`}
          role={message.tone === "ok" ? "status" : "alert"}
        >
          {message.text}
        </p>
      )}

      <div className="mt-6 space-y-4">
        {!templates.data?.length && !templates.isLoading && (
          <p className="text-sm text-[#7d8479]">
            {ar ? "لا توجد قوالب بعد." : "No templates yet."}
          </p>
        )}
        {templates.data?.map(template => (
          <article
            key={template.id}
            className="rounded-2xl border border-[#eee9df] p-4"
            data-testid={`template-${template.id}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">
                  {name(template)}{" "}
                  <span className="text-xs font-normal text-[#7d8479]">
                    v{template.version}
                  </span>
                </p>
                <p className="mt-1 text-xs text-[#7d8479]">
                  {boardName.get(template.boardId) ?? `#${template.boardId}`}
                  {" · "}
                  {template.specialtyId
                    ? (specialtyName.get(template.specialtyId) ??
                      `#${template.specialtyId}`)
                    : ar
                      ? "كل التخصصات"
                      : "All specialties"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-3 py-1 text-xs ${statusStyles[template.status]}`}
                >
                  {templateStatusLabels[template.status][locale]}
                </span>
                {template.status === "draft" && (
                  <button
                    disabled={activate.isPending}
                    onClick={() => activate.mutate({ templateId: template.id })}
                    className="inline-flex items-center gap-1 rounded-xl bg-[#163f43] px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {ar ? "تفعيل" : "Activate"}
                  </button>
                )}
                {template.status !== "draft" && (
                  <button
                    disabled={copy.isPending}
                    onClick={() => copy.mutate({ templateId: template.id })}
                    className="inline-flex items-center gap-1 rounded-xl border border-[#163f43] px-3 py-1.5 text-xs font-semibold text-[#163f43]"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {ar ? "نسخة جديدة" : "New version"}
                  </button>
                )}
                {template.status === "active" && (
                  <button
                    disabled={retire.isPending}
                    onClick={() => retire.mutate({ templateId: template.id })}
                    className="text-xs font-semibold text-[#9b4c3f]"
                  >
                    {ar ? "إيقاف" : "Retire"}
                  </button>
                )}
              </div>
            </div>
            <ol className="mt-4 space-y-2">
              {template.questions.map((question, index) => (
                <li
                  key={question.id}
                  className="flex items-start justify-between gap-3 rounded-xl bg-[#f7f5ef] px-3 py-2 text-sm"
                >
                  <span>
                    <span className="text-[#7d8479]">{index + 1}. </span>
                    {ar ? question.textAr : question.textEn || question.textAr}
                    {question.required && (
                      <span className="text-[#9b4c3f]"> *</span>
                    )}
                    <span className="ms-2 text-xs text-[#7d8479]">
                      {answerTypeLabels[question.answerType][locale]}
                      {question.answerType === "boolean" &&
                        (ar ? " + ملاحظات" : " + notes")}
                      {Array.isArray(question.optionsJson) &&
                        ` · ${(question.optionsJson as string[]).join(" / ")}`}
                    </span>
                    {question.noteRequired && (
                      <span className="ms-2 rounded-full bg-[#fff8e7] px-2 py-0.5 text-xs text-[#8a6424]">
                        {ar ? "الملاحظة إلزامية" : "Note required"}
                      </span>
                    )}
                    {question.attachmentRequired && (
                      <span className="ms-2 rounded-full bg-[#fff8e7] px-2 py-0.5 text-xs text-[#8a6424]">
                        {ar ? "المرفق إلزامي" : "Attachment required"}
                      </span>
                    )}
                  </span>
                  {template.status === "draft" && (
                    <button
                      onClick={() =>
                        removeQuestion.mutate({ questionId: question.id })
                      }
                      disabled={removeQuestion.isPending}
                      aria-label={ar ? "حذف السؤال" : "Remove question"}
                      className="text-[#9b4c3f]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </li>
              ))}
              {!template.questions.length && (
                <li className="text-xs text-[#7d8479]">
                  {ar ? "لا توجد أسئلة بعد." : "No questions yet."}
                </li>
              )}
            </ol>
            {template.status === "draft" && (
              <QuestionForm
                templateId={template.id}
                locale={locale}
                onSaved={() =>
                  done(ar ? "تمت إضافة السؤال." : "Question added.")
                }
                onError={onError}
              />
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function QuestionForm({
  templateId,
  locale,
  onSaved,
  onError,
}: {
  templateId: number;
  locale: Locale;
  onSaved: () => void;
  onError: (error: { message: string }) => void;
}) {
  const ar = locale === "ar";
  const [textAr, setTextAr] = useState("");
  const [textEn, setTextEn] = useState("");
  const [noteRequired, setNoteRequired] = useState(false);
  const [attachmentRequired, setAttachmentRequired] = useState(false);
  const create = trpc.admin.createQuestion.useMutation({
    onSuccess: () => {
      setTextAr("");
      setTextEn("");
      setNoteRequired(false);
      setAttachmentRequired(false);
      onSaved();
    },
    onError,
  });
  return (
    <div className="mt-4 grid gap-2 border-t border-[#eee9df] pt-4">
      <p className="text-xs font-semibold text-[#53645f]">
        {ar
          ? "إضافة سؤال (نعم / لا مع ملاحظات)"
          : "Add a question (Yes / No with notes)"}
      </p>
      <div className="grid gap-2 md:grid-cols-2">
        <input
          className="field"
          value={textAr}
          onChange={e => setTextAr(e.target.value)}
          placeholder="نص السؤال بالعربية"
          aria-label={ar ? "نص السؤال بالعربية" : "Question (Arabic)"}
        />
        <input
          className="field"
          value={textEn}
          onChange={e => setTextEn(e.target.value)}
          placeholder="Question in English (optional)"
          aria-label={ar ? "نص السؤال بالإنجليزية" : "Question (English)"}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={noteRequired}
            onChange={e => setNoteRequired(e.target.checked)}
          />
          {ar ? "الملاحظة إلزامية" : "Note required"}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={attachmentRequired}
            onChange={e => setAttachmentRequired(e.target.checked)}
          />
          {ar ? "المرفق إلزامي" : "Attachment required"}
        </label>
        <button
          disabled={textAr.trim().length < 2 || create.isPending}
          onClick={() =>
            create.mutate({
              checklistTemplateId: templateId,
              textAr: textAr.trim(),
              textEn: textEn.trim() || undefined,
              noteRequired,
              attachmentRequired,
            })
          }
          className="ms-auto rounded-xl bg-[#d8a84e] px-4 py-2 text-sm font-semibold text-[#163f43] disabled:opacity-50"
        >
          {ar ? "إضافة سؤال" : "Add question"}
        </button>
      </div>
    </div>
  );
}
