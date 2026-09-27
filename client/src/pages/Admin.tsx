import { ApiErrorState } from "@/components/ApiErrorState";
import { ChecklistTemplates } from "@/components/ChecklistTemplates";
import { MembershipManager } from "@/components/MembershipManager";
import { useLocale } from "@/contexts/LocaleContext";
import { describeApiError } from "@/lib/errors";
import { trpc } from "@/lib/trpc";
import type { Locale } from "@shared/domain";
import { useState } from "react";

const inputClass = "field w-full";

type Board = {
  id: number;
  code: string;
  nameAr: string;
  nameEn: string | null;
};
type Specialty = Board & { boardId: number };
type PanelProps = {
  locale: Locale;
  onSaved: (message: string) => void;
  onError: (error: { message: string }) => void;
};

export default function Admin() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const refs = trpc.admin.reference.useQuery();
  const people = trpc.admin.users.useQuery();
  const [message, setMessage] = useState("");
  const success = (text: string) => {
    setMessage(text);
    refs.refetch();
    people.refetch();
  };
  const failure = (error: { message: string }) =>
    setMessage(describeApiError(error, locale));
  const setRole = trpc.admin.setUserRole.useMutation({
    onSuccess: () =>
      success(ar ? "تم تحديث الدور العام." : "Global role updated."),
    onError: failure,
  });
  return (
    <div className="space-y-7">
      <div>
        <p className="eyebrow">
          {ar ? "الضبط المؤسسي" : "Institutional controls"}
        </p>
        <h1 className="mt-3 text-3xl font-semibold">
          {ar ? "الإدارة" : "Administration"}
        </h1>
        <p className="mt-2 text-sm leading-7 text-[#6f756e]">
          {ar
            ? "أدر حدود المجالس والتخصصات وقوالب التحقق وعضويات المستخدمين من مكان واحد."
            : "Manage boards, specialties, checklist templates, questions, and memberships in one place."}
        </p>
      </div>
      {message && (
        <p
          className="rounded-2xl border border-[#d8a84e] bg-[#fff8e7] p-4 text-sm"
          role="status"
        >
          {message}
        </p>
      )}
      {refs.error && (
        <ApiErrorState
          error={refs.error}
          locale={locale}
          onRetry={() => refs.refetch()}
        />
      )}
      <div className="grid gap-6 xl:grid-cols-2">
        <BoardsPanel
          locale={locale}
          boards={refs.data?.boards ?? []}
          onSaved={text => success(text)}
          onError={failure}
        />
        <SpecialtiesPanel
          locale={locale}
          boards={refs.data?.boards ?? []}
          specialties={refs.data?.specialties ?? []}
          onSaved={text => success(text)}
          onError={failure}
        />
      </div>
      <ChecklistTemplates
        locale={locale}
        boards={refs.data?.boards ?? []}
        specialties={refs.data?.specialties ?? []}
      />
      <section className="rounded-3xl border border-[#e2ded2] bg-white p-6">
        <h2 className="font-semibold">
          {ar ? "المستخدمون والعضويات" : "Users & memberships"}
        </h2>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {people.data?.map(person => (
            <div
              key={person.id}
              className="flex items-center justify-between rounded-2xl bg-[#f7f5ef] p-4"
            >
              <div>
                <p className="font-semibold">{person.name || "—"}</p>
                <p className="text-xs text-[#7d8479]">{person.email || "—"}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full border px-3 py-1 text-xs">
                  {person.role === "admin"
                    ? ar
                      ? "مدير النظام"
                      : "Administrator"
                    : ar
                      ? "مستخدم"
                      : "User"}
                </span>
                <button
                  onClick={() =>
                    setRole.mutate({
                      userId: person.id,
                      role: person.role === "admin" ? "user" : "admin",
                    })
                  }
                  className="text-xs font-semibold text-[#a1722d]"
                >
                  {ar ? "تبديل الدور" : "Toggle role"}
                </button>
              </div>
            </div>
          ))}
        </div>
        <MembershipManager
          locale={locale}
          boards={refs.data?.boards ?? []}
          people={people.data ?? []}
        />
      </section>
    </div>
  );
}

function BoardsPanel({
  locale,
  boards,
  onSaved,
  onError,
}: PanelProps & { boards: Board[] }) {
  const ar = locale === "ar";
  const [code, setCode] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const createBoard = trpc.admin.createBoard.useMutation({
    onSuccess: () => {
      setCode("");
      setNameAr("");
      setNameEn("");
      onSaved(ar ? "تم حفظ المجلس." : "Board saved.");
    },
    onError,
  });
  return (
    <section className="rounded-3xl border border-[#e2ded2] bg-white p-6">
      <h2 className="font-semibold">{ar ? "المجالس" : "Boards"}</h2>
      <div className="mt-5 space-y-3">
        {boards.map(board => (
          <div
            key={board.id}
            className="flex items-center justify-between rounded-2xl bg-[#f7f5ef] p-4"
          >
            <div>
              <p className="font-semibold">
                {ar ? board.nameAr : board.nameEn || board.nameAr}
              </p>
              <p className="mt-1 font-mono text-xs text-[#7d8479]">
                {board.code}
              </p>
            </div>
            <span className="rounded-full bg-[#e6f1ed] px-3 py-1 text-xs">
              {ar ? "نشط" : "Active"}
            </span>
          </div>
        ))}
        {!boards.length && (
          <p className="text-sm text-[#7d8479]">
            {ar ? "لا توجد مجالس بعد." : "No boards yet."}
          </p>
        )}
      </div>
      <div className="mt-6 border-t border-[#eee9df] pt-5">
        <p className="text-sm font-semibold">
          {ar ? "إضافة مجلس" : "Add board"}
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <input
            className={inputClass}
            value={code}
            onChange={e => setCode(e.target.value)}
            placeholder={ar ? "الرمز (مثل FIN)" : "Code (e.g. FIN)"}
            aria-label={ar ? "رمز المجلس" : "Board code"}
          />
          <input
            className={inputClass}
            value={nameAr}
            onChange={e => setNameAr(e.target.value)}
            placeholder="الاسم بالعربية"
            aria-label={ar ? "اسم المجلس بالعربية" : "Board Arabic name"}
          />
          <input
            className={inputClass}
            value={nameEn}
            onChange={e => setNameEn(e.target.value)}
            placeholder="English name"
            aria-label={ar ? "اسم المجلس بالإنجليزية" : "Board English name"}
          />
        </div>
        <button
          disabled={
            code.trim().length < 2 ||
            nameAr.trim().length < 2 ||
            createBoard.isPending
          }
          onClick={() =>
            createBoard.mutate({
              code: code.trim().toUpperCase(),
              nameAr: nameAr.trim(),
              nameEn: nameEn.trim() || undefined,
            })
          }
          className="mt-3 rounded-xl bg-[#163f43] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {ar ? "حفظ المجلس" : "Save board"}
        </button>
      </div>
    </section>
  );
}

function SpecialtiesPanel({
  locale,
  boards,
  specialties,
  onSaved,
  onError,
}: PanelProps & { boards: Board[]; specialties: Specialty[] }) {
  const ar = locale === "ar";
  const [boardId, setBoardId] = useState("");
  const [code, setCode] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const createSpecialty = trpc.admin.createSpecialty.useMutation({
    onSuccess: () => {
      setCode("");
      setNameAr("");
      setNameEn("");
      onSaved(ar ? "تم حفظ التخصص." : "Specialty saved.");
    },
    onError,
  });
  const name = (item: Pick<Board, "nameAr" | "nameEn">) =>
    ar ? item.nameAr : item.nameEn || item.nameAr;
  return (
    <section className="rounded-3xl border border-[#e2ded2] bg-white p-6">
      <h2 className="font-semibold">{ar ? "التخصصات" : "Specialties"}</h2>
      <div className="mt-5 space-y-4">
        {boards.map(board => {
          const items = specialties.filter(item => item.boardId === board.id);
          return (
            <div key={board.id}>
              <p className="text-xs font-semibold text-[#7d8479]">
                {name(board)}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {items.map(item => (
                  <span
                    key={item.id}
                    className="rounded-full border border-[#eee9df] px-3 py-1 text-sm"
                  >
                    {name(item)}
                    <span className="ms-2 font-mono text-xs text-[#7d8479]">
                      {item.code}
                    </span>
                  </span>
                ))}
                {!items.length && (
                  <span className="text-xs text-[#9aa096]">
                    {ar ? "لا توجد تخصصات" : "No specialties"}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-6 grid gap-3 border-t border-[#eee9df] pt-5">
        <p className="text-sm font-semibold">
          {ar ? "إضافة تخصص" : "Add specialty"}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <select
            className={inputClass}
            value={boardId}
            onChange={e => setBoardId(e.target.value)}
            aria-label={ar ? "مجلس التخصص" : "Specialty board"}
          >
            <option value="">{ar ? "اختر المجلس" : "Choose board"}</option>
            {boards.map(board => (
              <option key={board.id} value={board.id}>
                {name(board)}
              </option>
            ))}
          </select>
          <input
            className={inputClass}
            value={code}
            onChange={e => setCode(e.target.value)}
            placeholder={ar ? "الرمز (مثل AUDIT)" : "Code (e.g. AUDIT)"}
            aria-label={ar ? "رمز التخصص" : "Specialty code"}
          />
          <input
            className={inputClass}
            value={nameAr}
            onChange={e => setNameAr(e.target.value)}
            placeholder="الاسم بالعربية"
            aria-label={ar ? "اسم التخصص بالعربية" : "Specialty Arabic name"}
          />
          <input
            className={inputClass}
            value={nameEn}
            onChange={e => setNameEn(e.target.value)}
            placeholder="English name"
            aria-label={
              ar ? "اسم التخصص بالإنجليزية" : "Specialty English name"
            }
          />
        </div>
        <button
          disabled={
            !boardId ||
            code.trim().length < 2 ||
            nameAr.trim().length < 2 ||
            createSpecialty.isPending
          }
          onClick={() =>
            createSpecialty.mutate({
              boardId: Number(boardId),
              code: code.trim().toUpperCase(),
              nameAr: nameAr.trim(),
              nameEn: nameEn.trim() || undefined,
            })
          }
          className="justify-self-start rounded-xl bg-[#163f43] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {ar ? "حفظ التخصص" : "Save specialty"}
        </button>
      </div>
    </section>
  );
}
