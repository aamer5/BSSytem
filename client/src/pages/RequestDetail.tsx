import { ApiErrorState } from "@/components/ApiErrorState";
import { ChecklistForm } from "@/components/ChecklistForm";
import { DraftEditor } from "@/components/DraftEditor";
import { useAuth } from "@/_core/hooks/useAuth";
import { WorkflowActions } from "@/components/WorkflowActions";
import { useLocale } from "@/contexts/LocaleContext";
import { describeApiError } from "@/lib/errors";
import { trpc } from "@/lib/trpc";
import {
  actionLabels,
  confidentialityLabels,
  priorityLabels,
  roleLabels,
  statusLabels,
  subjectTypeLabels,
  type Locale,
} from "@shared/domain";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileText,
  Gavel,
  Pencil,
  ShieldCheck,
} from "lucide-react";
import { Link, useRoute } from "wouter";
import { useState } from "react";
export default function RequestDetail() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [, params] = useRoute("/requests/:id");
  const id = Number(params?.id);
  const [actionMessage, setActionMessage] = useState("");
  const [editing, setEditing] = useState(false);
  const [shareWithRequester, setShareWithRequester] = useState(false);
  const { user } = useAuth();
  const query = trpc.requests.detail.useQuery({ requestId: id, locale });
  const upload = trpc.requests.attachments.upload.useMutation({
    onSuccess: () => {
      setActionMessage(
        ar ? "تم رفع المرفق بأمان." : "Attachment uploaded securely."
      );
      query.refetch();
    },
    onError: error => setActionMessage(describeApiError(error, locale)),
  });
  const data = query.data;
  if (query.isLoading)
    return (
      <div className="rounded-3xl bg-white p-12 text-center">
        {ar ? "جارٍ تحميل الطلب…" : "Loading request…"}
      </div>
    );
  if (query.error)
    return (
      <ApiErrorState
        error={query.error}
        locale={locale}
        onRetry={() => query.refetch()}
      />
    );
  if (!data)
    return (
      <div className="rounded-3xl bg-white p-12 text-center">
        {ar ? "الطلب غير موجود" : "Request not found"}
      </div>
    );
  const request = data.request;
  // Staff decide whether their uploads are shared; a requester's own uploads always are.
  const canChooseVisibility =
    data.audience === "staff" && request.requesterUserId !== user?.id;
  return (
    <div className="space-y-7">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">{ar ? "تفاصيل الطلب" : "Request detail"}</p>
          <h1 className="mt-3 text-3xl font-semibold">{request.title}</h1>
          <p className="mt-2 font-mono text-xs text-[#7d8479]" dir="ltr">
            {request.referenceNumber}
          </p>
        </div>
        <Link
          href="/requests"
          className="inline-flex items-center gap-2 rounded-xl border border-[#dcd8c9] px-4 py-2 text-sm font-semibold"
        >
          {ar ? (
            <ArrowRight className="h-4 w-4" />
          ) : (
            <ArrowLeft className="h-4 w-4" />
          )}
          {ar ? "العودة إلى الطلبات" : "Back to requests"}
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label={ar ? "الحالة" : "Status"}
          value={
            statusLabels[
              request.lifecycleStatus as keyof typeof statusLabels
            ]?.[locale] || request.lifecycleStatus
          }
          icon={Clock3}
        />
        <Stat
          label={ar ? "النسخة" : "Version"}
          value={String(request.rowVersion)}
          icon={ShieldCheck}
        />
        <Stat
          label={ar ? "الأولوية" : "Priority"}
          value={priorityLabels[request.priority]?.[locale] ?? request.priority}
          icon={CheckCircle2}
        />
        <Stat
          label={ar ? "الجهة" : "Board"}
          value={
            ar ? data.board.nameAr : data.board.nameEn || data.board.nameAr
          }
          icon={FileText}
        />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.25fr_.75fr]">
        <div className="space-y-6">
          <section className="rounded-3xl border border-[#e2ded2] bg-white p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">
                {ar ? "بيانات الموضوع" : "Subject information"}
              </h2>
              {data.permissions.canEditDraft && !editing && (
                <button
                  onClick={() => setEditing(true)}
                  className="inline-flex items-center gap-2 rounded-xl border border-[#dcd8c9] px-3 py-1.5 text-sm font-semibold"
                >
                  <Pencil className="h-4 w-4" />
                  {ar ? "تعديل" : "Edit"}
                </button>
              )}
            </div>
            {editing ? (
              <DraftEditor
                request={request}
                locale={locale}
                onCancel={() => setEditing(false)}
                onSaved={() => {
                  setEditing(false);
                  setActionMessage(
                    ar ? "تم حفظ تعديلات المسودة." : "Draft changes saved."
                  );
                  query.refetch();
                }}
              />
            ) : (
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                {[
                  [
                    ar ? "التخصص" : "Specialty",
                    ar
                      ? data.specialty.nameAr
                      : data.specialty.nameEn || data.specialty.nameAr,
                  ],
                  [ar ? "مقدم الطلب" : "Requester", data.requester.name || "—"],
                  [
                    ar ? "نوع الموضوع" : "Subject type",
                    subjectTypeLabels[request.subjectType]?.[locale] ??
                      request.subjectType,
                  ],
                  [
                    ar ? "السرية" : "Confidentiality",
                    confidentialityLabels[request.confidentialityLevel]?.[
                      locale
                    ] ?? request.confidentialityLevel,
                  ],
                  [
                    ar ? "الجهة الطالبة" : "Requesting organization",
                    request.requesterOrganization || "—",
                  ],
                  [ar ? "الوصف" : "Description", request.description || "—"],
                  [ar ? "الخلفية" : "Background", request.background || "—"],
                  [ar ? "الهدف" : "Objective", request.objective || "—"],
                  [
                    ar ? "النتيجة المطلوبة" : "Requested outcome",
                    request.requestedOutcome || "—",
                  ],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs text-[#7d8479]">{label}</p>
                    <p className="mt-2 whitespace-pre-line leading-7">
                      {value}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="rounded-3xl border border-[#e2ded2] bg-white p-6">
            <h2 className="text-lg font-semibold">
              {ar ? "قائمة التحقق والمرفقات" : "Checklist & documents"}
            </h2>
            <div className="mt-5 space-y-4">
              {data.template && (
                <p className="text-xs text-[#7d8479]">
                  {ar
                    ? data.template.nameAr
                    : data.template.nameEn || data.template.nameAr}{" "}
                  · v{data.template.version}
                </p>
              )}
              <ChecklistForm
                requestId={id}
                questions={data.questions}
                answers={data.answers}
                editable={data.permissions.canAnswerChecklist}
                locale={locale}
                onSaved={() => {
                  setActionMessage(
                    ar
                      ? "تم حفظ إجابة قائمة التحقق."
                      : "Checklist answer saved."
                  );
                  query.refetch();
                }}
                onError={error =>
                  setActionMessage(describeApiError(error, locale))
                }
              />
              {data.permissions.canUpload && (
                <label className="block border-t border-[#eee9df] pt-4 text-sm font-medium">
                  {ar ? "رفع مستند" : "Upload document"}
                  <input
                    className="mt-2 block w-full text-sm"
                    type="file"
                    accept="application/pdf,image/*,.doc,.docx"
                    onChange={event => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        const raw = String(reader.result);
                        upload.mutate({
                          requestId: id,
                          fileName: file.name,
                          documentType: "supporting_document",
                          mimeType: file.type || "application/octet-stream",
                          dataBase64: raw.split(",")[1] || raw,
                          requesterVisible: canChooseVisibility
                            ? shareWithRequester
                            : true,
                          locale,
                        });
                      };
                      reader.readAsDataURL(file);
                      event.target.value = "";
                    }}
                  />
                  <span className="mt-1 block text-xs font-normal text-[#7d8479]">
                    {ar
                      ? "PDF أو صورة أو Word، حتى 10 ميجابايت."
                      : "PDF, image or Word, up to 10 MB."}
                  </span>
                  {canChooseVisibility && (
                    <span className="mt-2 flex items-center gap-2 font-normal">
                      <input
                        type="checkbox"
                        checked={shareWithRequester}
                        onChange={e => setShareWithRequester(e.target.checked)}
                      />
                      {ar
                        ? "إظهار المستند لمقدم الطلب"
                        : "Show this document to the requester"}
                    </span>
                  )}
                </label>
              )}
              <div className="space-y-2">
                {data.attachments.map(file => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between rounded-xl bg-[#f7f5ef] p-3 text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-[#a1722d]" />
                      {file.originalFileName}
                      {data.audience === "staff" && !file.requesterVisible && (
                        <span className="rounded-full border border-[#d9d4c5] px-2 py-0.5 text-xs text-[#7d8479]">
                          {ar ? "داخلي" : "Internal"}
                        </span>
                      )}
                    </span>
                    <AttachmentLink
                      attachmentId={file.id}
                      locale={locale}
                      onError={message => setActionMessage(message)}
                    />
                    <span className="text-xs text-[#7d8479]">
                      {formatSize(file.byteSize)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
          <section className="rounded-3xl border border-[#e2ded2] bg-white p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Gavel className="h-5 w-5 text-[#a1722d]" />
              {ar ? "القرارات" : "Decisions"}
            </h2>
            <div className="mt-5 space-y-4">
              {data.decisions.length ? (
                data.decisions.map(item => (
                  <div
                    key={item.decision.id}
                    className="rounded-2xl bg-[#f7f5ef] p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <b>
                        {item.decision.outcome === "proper"
                          ? ar
                            ? "مستوفٍ"
                            : "Proper"
                          : ar
                            ? "غير مستوفٍ"
                            : "Not proper"}
                      </b>
                      <span className="text-xs text-[#7d8479]">
                        {item.decision.requesterVisible
                          ? ar
                            ? "ظاهر لمقدم الطلب"
                            : "Requester-visible"
                          : ar
                            ? "داخلي"
                            : "Internal"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-7">
                      {item.decision.note}
                    </p>
                    <p className="mt-2 text-xs text-[#7d8479]">
                      {ar ? "سجله" : "Recorded by"}:{" "}
                      {item.actorName || item.decision.decidedByUserId}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[#7d8479]">
                  {ar ? "لم تُسجل قرارات بعد." : "No decisions recorded yet."}
                </p>
              )}
            </div>
          </section>
        </div>
        <aside className="space-y-6">
          <section className="rounded-3xl bg-[#163f43] p-6 text-white">
            <p className="eyebrow text-[#d8a84e]">
              {ar ? "إجراء المسار" : "Workflow action"}
            </p>
            <h2 className="mt-3 text-xl font-semibold">
              {ar ? "الحالة الحالية" : "Current state"}
            </h2>
            <p className="mt-2 text-sm leading-7 text-[#d5e0da]">
              {statusLabels[
                request.lifecycleStatus as keyof typeof statusLabels
              ]?.[locale] || request.lifecycleStatus}
            </p>
            {actionMessage && (
              <p
                className="mt-4 rounded-xl bg-white/10 p-3 text-xs text-[#f4e5bd]"
                role="status"
              >
                {actionMessage}
              </p>
            )}
            <WorkflowActions
              requestId={id}
              rowVersion={request.rowVersion}
              actions={data.permissions.actions}
              candidates={data.candidates}
              locale={locale}
              onDone={message => {
                setActionMessage(message);
                query.refetch();
              }}
            />
          </section>
          <section className="rounded-3xl border border-[#e2ded2] bg-white p-6">
            <h2 className="font-semibold">
              {ar ? "سجل التدقيق" : "Audit history"}
            </h2>
            <div className="mt-5 space-y-4">
              {data.history.map(item => (
                <div key={item.id} className="border-s-2 border-[#d8a84e] ps-4">
                  <p className="text-sm font-semibold">
                    {actionLabels[item.action]?.[locale] ?? item.action}
                  </p>
                  <p className="mt-1 text-xs text-[#7d8479]">
                    {data.actorNames[item.actorUserId] ??
                      `#${item.actorUserId}`}{" "}
                    ·{" "}
                    {roleLabels[item.actorRoleAtTime]?.[locale] ??
                      item.actorRoleAtTime}{" "}
                    ·{" "}
                    {new Date(item.createdAt).toLocaleString(
                      locale === "ar" ? "ar-SA" : "en-US"
                    )}
                  </p>
                  {item.note && (
                    <p className="mt-2 whitespace-pre-line rounded-xl bg-[#f7f5ef] p-3 text-xs leading-6 text-[#53645f]">
                      {item.note}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Clock3;
}) {
  return (
    <div className="rounded-3xl border border-[#e2ded2] bg-white p-5">
      <Icon className="h-5 w-5 text-[#a1722d]" />
      <p className="mt-6 text-xs text-[#7d8479]">{label}</p>
      <p className="mt-2 font-semibold">{value}</p>
    </div>
  );
}
function AttachmentLink({
  attachmentId,
  locale,
  onError,
}: {
  attachmentId: number;
  locale: Locale;
  onError: (message: string) => void;
}) {
  const utils = trpc.useUtils();
  const [loading, setLoading] = useState(false);
  return (
    <button
      className="text-xs font-semibold text-[#a1722d] disabled:opacity-50"
      disabled={loading}
      onClick={async event => {
        event.preventDefault();
        setLoading(true);
        try {
          const file = await utils.requests.attachments.download.fetch({
            attachmentId,
            locale,
          });
          const bytes = Uint8Array.from(atob(file.dataBase64), c =>
            c.charCodeAt(0)
          );
          const url = URL.createObjectURL(
            new Blob([bytes], { type: file.mimeType })
          );
          const link = document.createElement("a");
          link.href = url;
          link.download = file.fileName;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 60_000);
        } catch (error) {
          onError(describeApiError(error as { message: string }, locale));
        } finally {
          setLoading(false);
        }
      }}
    >
      {locale === "ar" ? "تنزيل" : "Download"}
    </button>
  );
}
function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
