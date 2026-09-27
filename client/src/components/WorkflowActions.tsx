import { describeApiError } from "@/lib/errors";
import { trpc } from "@/lib/trpc";
import {
  actionLabels,
  decisionReasonCodes,
  decisionReasonLabels,
  roleLabels,
  type Locale,
} from "@shared/domain";
import { Loader2 } from "lucide-react";
import { useState } from "react";

type Action =
  | "submit"
  | "claim"
  | "release"
  | "assign"
  | "request_info"
  | "respond_info"
  | "return_to_requester"
  | "return_to_secretary_member"
  | "submit_to_board_head"
  | "decide"
  | "withdraw"
  | "archive";

type Candidate = {
  id: number;
  name: string | null;
  email: string | null;
  role: keyof typeof roleLabels;
};

// Actions whose note is mandatory (mirrors noteRequiredActions on the server).
const noteRequired: Action[] = [
  "request_info",
  "respond_info",
  "return_to_requester",
  "return_to_secretary_member",
  "decide",
];
// Irreversible or closing actions are styled as secondary to avoid mis-clicks.
const secondary: Action[] = ["release", "withdraw", "archive"];

const notePrompt: Partial<Record<Action, Record<Locale, string>>> = {
  request_info: {
    ar: "ما المعلومات المطلوبة من مقدم الطلب؟",
    en: "What does the requester need to provide?",
  },
  respond_info: {
    ar: "اكتب ردك على طلب المعلومات",
    en: "Write your response to the information request",
  },
  return_to_requester: {
    ar: "سبب الإعادة إلى مقدم الطلب",
    en: "Why is it going back to the requester?",
  },
  return_to_secretary_member: {
    ar: "ما المطلوب من عضو الأمانة؟",
    en: "What should the secretary do?",
  },
  decide: { ar: "مسوغات القرار", en: "Reasoning for the decision" },
  withdraw: {
    ar: "سبب السحب (اختياري)",
    en: "Reason for withdrawing (optional)",
  },
};

export function WorkflowActions({
  requestId,
  rowVersion,
  actions,
  candidates,
  locale,
  onDone,
}: {
  requestId: number;
  rowVersion: number;
  actions: Action[];
  candidates: { secretaries: Candidate[]; boardHeads: Candidate[] };
  locale: Locale;
  onDone: (message: string) => void;
}) {
  const ar = locale === "ar";
  const [active, setActive] = useState<Action | null>(null);
  const [note, setNote] = useState("");
  const [assignee, setAssignee] = useState("");
  const [outcome, setOutcome] = useState<"proper" | "not_proper">("proper");
  const [reasonCode, setReasonCode] =
    useState<(typeof decisionReasonCodes)[number]>("complete");
  const [requesterVisible, setRequesterVisible] = useState(true);
  const [error, setError] = useState("");

  const reset = () => {
    setActive(null);
    setNote("");
    setAssignee("");
    setOutcome("proper");
    setReasonCode("complete");
    setRequesterVisible(true);
    setError("");
  };
  const handlers = {
    onSuccess: () => {
      const label = active ? actionLabels[active][locale] : "";
      reset();
      onDone(ar ? `تم: ${label}` : `Done: ${label}`);
    },
    onError: (e: { message: string }) => setError(describeApiError(e, locale)),
  };
  const submit = trpc.requests.submit.useMutation(handlers);
  const claim = trpc.requests.claim.useMutation(handlers);
  const transition = trpc.requests.transition.useMutation(handlers);
  const decide = trpc.requests.decide.useMutation(handlers);
  const pending =
    submit.isPending ||
    claim.isPending ||
    transition.isPending ||
    decide.isPending;

  if (!actions.length) {
    return (
      <p className="mt-5 text-sm leading-7 text-[#d5e0da]">
        {ar
          ? "لا توجد إجراءات متاحة لك على هذا الطلب حاليًا."
          : "There are no actions available to you on this request right now."}
      </p>
    );
  }

  const people =
    active === "assign"
      ? candidates.secretaries
      : active === "submit_to_board_head"
        ? candidates.boardHeads
        : [];
  const needsPerson = active === "assign" || active === "submit_to_board_head";

  const confirm = () => {
    if (!active) return;
    setError("");
    if (noteRequired.includes(active) && !note.trim()) {
      setError(describeApiError({ message: "errors.noteRequired" }, locale));
      return;
    }
    if (needsPerson && !assignee) {
      setError(describeApiError({ message: "errors.invalidAssignee" }, locale));
      return;
    }
    const base = { requestId, expectedRowVersion: rowVersion, locale };
    if (active === "submit") submit.mutate(base);
    else if (active === "claim") claim.mutate(base);
    else if (active === "decide")
      decide.mutate({
        ...base,
        outcome,
        reasonCode,
        note: note.trim(),
        requesterVisible,
      });
    else
      transition.mutate({
        ...base,
        action: active,
        note: note.trim() || undefined,
        assigneeUserId: needsPerson ? Number(assignee) : undefined,
      });
  };

  const personLabel = (person: Candidate) =>
    `${person.name || person.email || `#${person.id}`} · ${roleLabels[person.role][locale]}`;
  const inputClass =
    "mt-1.5 w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white outline-none placeholder:text-white/50 focus:border-[#d8a84e]";

  return (
    <div className="mt-5 space-y-3">
      {!active &&
        actions.map(action => (
          <button
            key={action}
            onClick={() => setActive(action)}
            className={
              secondary.includes(action)
                ? "w-full rounded-xl border border-white/25 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
                : "w-full rounded-xl bg-[#d8a84e] px-4 py-3 text-sm font-semibold text-[#163f43]"
            }
          >
            {actionLabels[action][locale]}
          </button>
        ))}
      {active && (
        <div className="space-y-3 rounded-2xl bg-white/10 p-4">
          <p className="font-semibold">{actionLabels[active][locale]}</p>
          {needsPerson && (
            <label className="block text-xs text-[#d5e0da]">
              {active === "assign"
                ? ar
                  ? "عضو الأمانة"
                  : "Secretary"
                : ar
                  ? "رئيس المجلس"
                  : "Board head"}
              <select
                className={inputClass}
                value={assignee}
                onChange={e => setAssignee(e.target.value)}
              >
                <option value="" className="text-black">
                  {ar ? "اختر…" : "Choose…"}
                </option>
                {people.map(person => (
                  <option
                    key={person.id}
                    value={person.id}
                    className="text-black"
                  >
                    {personLabel(person)}
                  </option>
                ))}
              </select>
              {!people.length && (
                <span className="mt-1.5 block text-[#f4e5bd]">
                  {ar
                    ? "لا يوجد أعضاء مؤهلون في هذا المجلس. أضفهم من صفحة الإدارة."
                    : "No eligible members on this board yet. Add them from Administration."}
                </span>
              )}
            </label>
          )}
          {active === "decide" && (
            <>
              <label className="block text-xs text-[#d5e0da]">
                {ar ? "القرار" : "Outcome"}
                <select
                  className={inputClass}
                  value={outcome}
                  onChange={e =>
                    setOutcome(e.target.value as "proper" | "not_proper")
                  }
                >
                  <option value="proper" className="text-black">
                    {ar ? "مستوفٍ" : "Proper"}
                  </option>
                  <option value="not_proper" className="text-black">
                    {ar ? "غير مستوفٍ" : "Not proper"}
                  </option>
                </select>
              </label>
              <label className="block text-xs text-[#d5e0da]">
                {ar ? "السبب" : "Reason"}
                <select
                  className={inputClass}
                  value={reasonCode}
                  onChange={e =>
                    setReasonCode(
                      e.target.value as (typeof decisionReasonCodes)[number]
                    )
                  }
                >
                  {decisionReasonCodes.map(code => (
                    <option key={code} value={code} className="text-black">
                      {decisionReasonLabels[code][locale]}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          {(notePrompt[active] ||
            active === "submit_to_board_head" ||
            active === "assign") && (
            <label className="block text-xs text-[#d5e0da]">
              {notePrompt[active]?.[locale] ??
                (ar ? "ملاحظة (اختياري)" : "Note (optional)")}
              <textarea
                className={`${inputClass} min-h-24`}
                value={note}
                onChange={e => setNote(e.target.value)}
              />
            </label>
          )}
          {active === "decide" && (
            <label className="flex items-center gap-2 text-xs text-[#d5e0da]">
              <input
                type="checkbox"
                checked={requesterVisible}
                onChange={e => setRequesterVisible(e.target.checked)}
              />
              {ar
                ? "إظهار القرار ومسوغاته لمقدم الطلب"
                : "Show the decision and reasoning to the requester"}
            </label>
          )}
          {error && (
            <p className="rounded-xl bg-[#9b4c3f]/40 p-3 text-xs" role="alert">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={confirm}
              disabled={pending}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#d8a84e] px-4 py-2.5 text-sm font-semibold text-[#163f43] disabled:opacity-60"
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {ar ? "تأكيد" : "Confirm"}
            </button>
            <button
              onClick={reset}
              disabled={pending}
              className="rounded-xl border border-white/25 px-4 py-2.5 text-sm font-semibold"
            >
              {ar ? "إلغاء" : "Cancel"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
