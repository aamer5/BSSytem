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
type Person = { id: number; name: string | null; email: string | null };
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
  const setGeneralHead = trpc.admin.setGeneralSecretariatHead.useMutation({
    onSuccess: () =>
      success(
        ar
          ? "تم تحديث صفة رئيس الأمانة العامة."
          : "General secretariat head updated."
      ),
    onError: failure,
  });
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
          people={people.data ?? []}
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
              <div className="flex flex-col items-end gap-1.5">
                <div className="flex flex-wrap justify-end gap-1.5">
                  <span className="rounded-full border px-3 py-1 text-xs">
                    {person.role === "admin"
                      ? ar
                        ? "مدير النظام"
                        : "Administrator"
                      : ar
                        ? "مستخدم"
                        : "User"}
                  </span>
                  {person.isGeneralSecretariatHead && (
                    <span className="rounded-full bg-[#163f43] px-3 py-1 text-xs text-white">
                      {ar ? "رئيس الأمانة العامة" : "General secretariat head"}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap justify-end gap-3">
                  <button
                    onClick={() =>
                      setRole.mutate({
                        userId: person.id,
                        role: person.role === "admin" ? "user" : "admin",
                      })
                    }
                    className="text-xs font-semibold text-[#a1722d]"
                  >
                    {person.role === "admin"
                      ? ar
                        ? "إزالة صلاحية المدير"
                        : "Remove admin"
                      : ar
                        ? "جعله مديرًا"
                        : "Make admin"}
                  </button>
                  <button
                    onClick={() =>
                      setGeneralHead.mutate({
                        userId: person.id,
                        enabled: !person.isGeneralSecretariatHead,
                      })
                    }
                    className="text-xs font-semibold text-[#163f43]"
                  >
                    {person.isGeneralSecretariatHead
                      ? ar
                        ? "إزالة صفة رئيس الأمانة العامة"
                        : "Remove general secretariat head"
                      : ar
                        ? "تعيين رئيسًا للأمانة العامة"
                        : "Make general secretariat head"}
                  </button>
                </div>
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
  people,
}: PanelProps & { boards: Board[]; people: Person[] }) {
  const ar = locale === "ar";
  const utils = trpc.useUtils();
  const memberships = trpc.admin.memberships.useQuery();
  const [code, setCode] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [boardHeadId, setBoardHeadId] = useState("");
  const [headId, setHeadId] = useState("");
  const [teamIds, setTeamIds] = useState<number[]>([]);
  const createBoard = trpc.admin.createBoard.useMutation({
    onSuccess: () => {
      setCode("");
      setNameAr("");
      setNameEn("");
      setBoardHeadId("");
      setHeadId("");
      setTeamIds([]);
      void utils.admin.memberships.invalidate();
      onSaved(
        ar
          ? "تم حفظ المجلس وتعيين رئيسه وأمانته."
          : "Board saved with its board head and secretariat."
      );
    },
    onError,
  });
  const personName = (person: Person) =>
    person.name || person.email || `#${person.id}`;
  // Secretariat of each board, from active memberships.
  const secretariat = (boardId: number) => {
    const active = (memberships.data ?? []).filter(
      m => m.boardId === boardId && m.isActive
    );
    const nameOf = (m: (typeof active)[number]) =>
      m.userName || m.userEmail || `#${m.userId}`;
    return {
      boardHeads: active.filter(m => m.role === "board_head").map(nameOf),
      heads: active.filter(m => m.role === "secretariat_head").map(nameOf),
      team: active.filter(m => m.role === "secretary_member").map(nameOf),
    };
  };
  const ready =
    code.trim().length >= 2 &&
    nameAr.trim().length >= 2 &&
    Boolean(boardHeadId) &&
    Boolean(headId) &&
    teamIds.length > 0;
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
              <BoardSecretariat
                locale={locale}
                loading={memberships.isLoading}
                {...secretariat(board.id)}
              />
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
        <label className="mt-4 block text-sm font-medium">
          {ar ? "رئيس المجلس" : "Board head"}
          <select
            className={`${inputClass} mt-2`}
            value={boardHeadId}
            aria-label={ar ? "رئيس المجلس" : "Board head"}
            onChange={e => {
              setBoardHeadId(e.target.value);
              if (headId === e.target.value) setHeadId("");
              setTeamIds(ids =>
                ids.filter(id => id !== Number(e.target.value))
              );
            }}
          >
            <option value="">
              {ar ? "اختر رئيس المجلس" : "Choose the board head"}
            </option>
            {people.map(person => (
              <option key={person.id} value={person.id}>
                {personName(person)}
                {person.name && person.email ? ` · ${person.email}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-4 block text-sm font-medium">
          {ar ? "رئيس الأمانة" : "Secretariat head"}
          <select
            className={`${inputClass} mt-2`}
            value={headId}
            aria-label={ar ? "رئيس الأمانة" : "Secretariat head"}
            onChange={e => {
              setHeadId(e.target.value);
              setTeamIds(ids =>
                ids.filter(id => id !== Number(e.target.value))
              );
            }}
          >
            <option value="">
              {ar ? "اختر رئيس الأمانة" : "Choose the secretariat head"}
            </option>
            {people
              .filter(person => String(person.id) !== boardHeadId)
              .map(person => (
                <option key={person.id} value={person.id}>
                  {personName(person)}
                  {person.name && person.email ? ` · ${person.email}` : ""}
                </option>
              ))}
          </select>
        </label>
        <fieldset className="mt-4">
          <legend className="text-sm font-medium">
            {ar ? "فريق الأمانة" : "Secretariat team"}
            <span className="ms-2 text-xs font-normal text-[#7d8479]">
              {ar ? "(عضو واحد على الأقل)" : "(at least one member)"}
            </span>
          </legend>
          <div className="mt-2 grid max-h-56 gap-1 overflow-y-auto rounded-xl border border-[#dcd8c9] bg-[#fcfbf8] p-2 sm:grid-cols-2">
            {people
              .filter(
                person =>
                  String(person.id) !== headId &&
                  String(person.id) !== boardHeadId
              )
              .map(person => (
                <label
                  key={person.id}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-white"
                >
                  <input
                    type="checkbox"
                    checked={teamIds.includes(person.id)}
                    onChange={e =>
                      setTeamIds(ids =>
                        e.target.checked
                          ? [...ids, person.id]
                          : ids.filter(id => id !== person.id)
                      )
                    }
                  />
                  <span className="min-w-0 truncate">{personName(person)}</span>
                </label>
              ))}
            {people.length < 2 && (
              <p className="p-2 text-xs text-[#9b4c3f]">
                {ar
                  ? "يجب أن يسجّل أعضاء الأمانة دخولهم مرة واحدة على الأقل ليظهروا هنا."
                  : "Secretariat staff must sign in once before they appear here."}
              </p>
            )}
          </div>
        </fieldset>
        <button
          disabled={!ready || createBoard.isPending}
          onClick={() =>
            createBoard.mutate({
              code: code.trim().toUpperCase(),
              nameAr: nameAr.trim(),
              nameEn: nameEn.trim() || undefined,
              boardHeadUserId: Number(boardHeadId),
              secretariatHeadUserId: Number(headId),
              secretaryMemberUserIds: teamIds,
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

function BoardSecretariat({
  locale,
  loading,
  boardHeads,
  heads,
  team,
}: {
  locale: Locale;
  loading: boolean;
  boardHeads: string[];
  heads: string[];
  team: string[];
}) {
  const ar = locale === "ar";
  if (loading) return null;
  const missing = !boardHeads.length || !heads.length || !team.length;
  return (
    <div className="mt-2 space-y-0.5 text-xs text-[#53645f]">
      <p>
        {ar ? "رئيس المجلس: " : "Board head: "}
        {boardHeads.join(ar ? "، " : ", ") || "—"}
      </p>
      <p>
        {ar ? "رئيس الأمانة: " : "Secretariat head: "}
        {heads.join(ar ? "، " : ", ") || "—"}
      </p>
      <p>
        {ar ? "فريق الأمانة: " : "Secretariat team: "}
        {team.join(ar ? "، " : ", ") || "—"}
      </p>
      {missing && (
        <p className="font-semibold text-[#9b4c3f]">
          {ar
            ? "تنقص هذا المجلس أدوار أساسية. أضفها من «عضويات المجالس»."
            : "This board is missing a key role. Add it under Board memberships."}
        </p>
      )}
    </div>
  );
}
