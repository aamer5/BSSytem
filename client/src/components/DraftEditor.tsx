import { describeApiError } from "@/lib/errors";
import { trpc } from "@/lib/trpc";
import {
  confidentialityLabels,
  confidentialityLevels,
  priorities,
  priorityLabels,
  subjectTypeLabels,
  subjectTypes,
  type Locale,
} from "@shared/domain";
import type { SubjectRequest } from "@shared/schema";
import { Loader2 } from "lucide-react";
import { useState, type ReactNode } from "react";

type Editable = Pick<
  SubjectRequest,
  | "title"
  | "subjectType"
  | "priority"
  | "confidentialityLevel"
  | "description"
  | "background"
  | "objective"
  | "requestedOutcome"
  | "requesterOrganization"
>;

// Lets the requester change the subject details while the request is a draft.
export function DraftEditor({
  request,
  locale,
  onSaved,
  onCancel,
}: {
  request: SubjectRequest;
  locale: Locale;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const ar = locale === "ar";
  const [form, setForm] = useState<Editable>({
    title: request.title,
    subjectType: request.subjectType,
    priority: request.priority,
    confidentialityLevel: request.confidentialityLevel,
    description: request.description ?? "",
    background: request.background ?? "",
    objective: request.objective ?? "",
    requestedOutcome: request.requestedOutcome ?? "",
    requesterOrganization: request.requesterOrganization ?? "",
  });
  const [error, setError] = useState("");
  const save = trpc.requests.updateDraft.useMutation({
    onSuccess: onSaved,
    onError: e => setError(describeApiError(e, locale)),
  });
  const set = <K extends keyof Editable>(key: K, value: Editable[K]) =>
    setForm(current => ({ ...current, [key]: value }));
  const textArea = (key: keyof Editable, label: string) => (
    <Field label={label}>
      <textarea
        className="field min-h-24"
        value={String(form[key] ?? "")}
        onChange={e => set(key, e.target.value)}
      />
    </Field>
  );

  return (
    <form
      className="mt-5 space-y-4"
      onSubmit={e => {
        e.preventDefault();
        if (form.title.trim().length < 3) {
          setError(ar ? "أدخل عنوانًا واضحًا." : "Enter a clear title.");
          return;
        }
        setError("");
        save.mutate({
          requestId: request.id,
          expectedRowVersion: request.rowVersion,
          ...form,
          title: form.title.trim(),
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={ar ? "العنوان" : "Title"}>
          <input
            className="field"
            value={form.title}
            maxLength={500}
            onChange={e => set("title", e.target.value)}
          />
        </Field>
        <Field label={ar ? "الجهة الطالبة" : "Requesting organization"}>
          <input
            className="field"
            value={form.requesterOrganization ?? ""}
            onChange={e => set("requesterOrganization", e.target.value)}
          />
        </Field>
        <Field label={ar ? "نوع الموضوع" : "Subject type"}>
          <select
            className="field"
            value={form.subjectType}
            onChange={e =>
              set("subjectType", e.target.value as Editable["subjectType"])
            }
          >
            {subjectTypes.map(type => (
              <option key={type} value={type}>
                {subjectTypeLabels[type][locale]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={ar ? "الأولوية" : "Priority"}>
          <select
            className="field"
            value={form.priority}
            onChange={e =>
              set("priority", e.target.value as Editable["priority"])
            }
          >
            {priorities.map(item => (
              <option key={item} value={item}>
                {priorityLabels[item][locale]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={ar ? "السرية" : "Confidentiality"}>
          <select
            className="field"
            value={form.confidentialityLevel}
            onChange={e =>
              set(
                "confidentialityLevel",
                e.target.value as Editable["confidentialityLevel"]
              )
            }
          >
            {confidentialityLevels.map(item => (
              <option key={item} value={item}>
                {confidentialityLabels[item][locale]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {textArea("description", ar ? "الوصف" : "Description")}
      {textArea("background", ar ? "الخلفية" : "Background")}
      {textArea("objective", ar ? "الهدف" : "Objective")}
      {textArea(
        "requestedOutcome",
        ar ? "النتيجة المطلوبة" : "Requested outcome"
      )}
      {error && (
        <p
          className="rounded-xl bg-[#fff4f1] p-3 text-sm text-[#9b4c3f]"
          role="alert"
        >
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={save.isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-[#163f43] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {ar ? "حفظ التعديلات" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={save.isPending}
          className="rounded-xl border border-[#dcd8c9] px-4 py-2 text-sm font-semibold"
        >
          {ar ? "إلغاء" : "Cancel"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <div className="mt-2">{children}</div>
    </label>
  );
}
