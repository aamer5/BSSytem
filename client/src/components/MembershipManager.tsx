import { describeApiError } from "@/lib/errors";
import { trpc } from "@/lib/trpc";
import { roleLabels, type Locale } from "@shared/domain";
import { UserPlus } from "lucide-react";
import { useMemo, useState } from "react";

const membershipRoles = [
  "requester",
  "secretary_member",
  "secretariat_head",
  "board_member",
  "board_head",
] as const;
type MembershipRole = (typeof membershipRoles)[number];

type Board = { id: number; nameAr: string; nameEn: string | null };
type Person = { id: number; name: string | null; email: string | null };

// Assign board roles to users and deactivate them, grouped by board.
export function MembershipManager({
  locale,
  boards,
  people,
}: {
  locale: Locale;
  boards: Board[];
  people: Person[];
}) {
  const ar = locale === "ar";
  const memberships = trpc.admin.memberships.useQuery();
  const [userId, setUserId] = useState("");
  const [boardId, setBoardId] = useState("");
  const [role, setRole] = useState<MembershipRole>("requester");
  const [message, setMessage] = useState<{
    tone: "ok" | "error";
    text: string;
  } | null>(null);
  const onError = (error: { message: string }) =>
    setMessage({ tone: "error", text: describeApiError(error, locale) });
  const assign = trpc.admin.assignMembership.useMutation({
    onSuccess: result => {
      setMessage({
        tone: "ok",
        text: result.reactivated
          ? ar
            ? "أُعيد تفعيل العضوية."
            : "Membership re-activated."
          : ar
            ? "تمت إضافة العضوية."
            : "Membership added.",
      });
      memberships.refetch();
    },
    onError,
  });
  const deactivate = trpc.admin.deactivateMembership.useMutation({
    onSuccess: () => {
      setMessage({
        tone: "ok",
        text: ar ? "تم تعطيل العضوية." : "Membership deactivated.",
      });
      memberships.refetch();
    },
    onError,
  });

  const boardName = (board: Pick<Board, "nameAr" | "nameEn">) =>
    ar ? board.nameAr : board.nameEn || board.nameAr;
  const grouped = useMemo(() => {
    const byBoard = new Map<number, NonNullable<typeof memberships.data>>();
    for (const item of memberships.data ?? []) {
      if (!item.isActive) continue;
      byBoard.set(item.boardId, [...(byBoard.get(item.boardId) ?? []), item]);
    }
    return Array.from(byBoard.entries());
  }, [memberships.data]);

  return (
    <div className="mt-6 border-t border-[#eee9df] pt-5">
      <p className="text-sm font-semibold">
        {ar ? "عضويات المجالس" : "Board memberships"}
      </p>
      <p className="mt-1 text-xs leading-6 text-[#7d8479]">
        {ar
          ? "يحدد الدور في المجلس ما يستطيع المستخدم فعله في طلبات ذلك المجلس."
          : "A user's role on a board decides what they can do with that board's requests."}
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-[1.4fr_1fr_1fr_auto]">
        <select
          className="field w-full"
          value={userId}
          onChange={e => setUserId(e.target.value)}
          aria-label={ar ? "المستخدم" : "User"}
        >
          <option value="">{ar ? "اختر المستخدم" : "Choose user"}</option>
          {people.map(person => (
            <option key={person.id} value={person.id}>
              {person.name || person.email || `#${person.id}`}
              {person.name && person.email ? ` · ${person.email}` : ""}
            </option>
          ))}
        </select>
        <select
          className="field w-full"
          value={boardId}
          onChange={e => setBoardId(e.target.value)}
          aria-label={ar ? "المجلس" : "Board"}
        >
          <option value="">{ar ? "اختر المجلس" : "Choose board"}</option>
          {boards.map(board => (
            <option key={board.id} value={board.id}>
              {boardName(board)}
            </option>
          ))}
        </select>
        <select
          className="field w-full"
          value={role}
          onChange={e => setRole(e.target.value as MembershipRole)}
          aria-label={ar ? "الدور" : "Role"}
        >
          {membershipRoles.map(item => (
            <option key={item} value={item}>
              {roleLabels[item][locale]}
            </option>
          ))}
        </select>
        <button
          disabled={!userId || !boardId || assign.isPending}
          onClick={() =>
            assign.mutate({
              userId: Number(userId),
              boardId: Number(boardId),
              role,
            })
          }
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#163f43] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          <UserPlus className="h-4 w-4" />
          {ar ? "إضافة" : "Add"}
        </button>
      </div>
      {message && (
        <p
          className={`mt-3 rounded-xl p-3 text-sm ${message.tone === "ok" ? "bg-[#f0f8f3] text-[#2f6b4f]" : "bg-[#fff4f1] text-[#9b4c3f]"}`}
          role={message.tone === "ok" ? "status" : "alert"}
        >
          {message.text}
        </p>
      )}
      <div className="mt-5 space-y-4">
        {!grouped.length && !memberships.isLoading && (
          <p className="text-sm text-[#7d8479]">
            {ar ? "لا توجد عضويات بعد." : "No memberships yet."}
          </p>
        )}
        {grouped.map(([id, items]) => (
          <div key={id} className="rounded-2xl bg-[#f7f5ef] p-4">
            <p className="font-semibold">
              {boardName({
                nameAr: items[0].boardNameAr ?? `#${id}`,
                nameEn: items[0].boardNameEn,
              })}
            </p>
            <div className="mt-3 divide-y divide-[#e7e2d6]">
              {items.map(item => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                >
                  <span>
                    {item.userName || item.userEmail || `#${item.userId}`}
                    <span className="ms-2 rounded-full border border-[#d9d4c5] px-2 py-0.5 text-xs text-[#53645f]">
                      {roleLabels[item.role][locale]}
                    </span>
                  </span>
                  <button
                    disabled={deactivate.isPending}
                    onClick={() => deactivate.mutate({ membershipId: item.id })}
                    className="text-xs font-semibold text-[#9b4c3f]"
                  >
                    {ar ? "تعطيل" : "Deactivate"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
