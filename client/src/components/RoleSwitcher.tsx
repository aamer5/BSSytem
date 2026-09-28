import { useAuth } from "@/_core/hooks/useAuth";
import { setActingRole } from "@/lib/actingRole";
import { roleLabels, type BoardRole, type Locale } from "@shared/domain";
import { useQueryClient } from "@tanstack/react-query";
import { UserCog } from "lucide-react";
import { useLocation } from "wouter";

// Lets a user who holds several roles act as just one of them, to see the
// platform exactly as that role does. It can only narrow access.
export function RoleSwitcher({ locale }: { locale: Locale }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const available = (user?.availableRoles ?? []) as BoardRole[];
  if (available.length < 2) return null;
  const ar = locale === "ar";
  return (
    <label className="inline-flex items-center gap-2 rounded-xl border border-[#d9d4c5] bg-white/60 px-2 py-1 text-xs font-semibold">
      <UserCog className="h-4 w-4 text-[#a1722d]" />
      <span className="sr-only">{ar ? "العمل بصفة" : "Act as"}</span>
      <select
        aria-label={ar ? "العمل بصفة" : "Act as"}
        className="max-w-[11rem] bg-transparent py-1 outline-none"
        value={user?.actingRole ?? ""}
        onChange={event => {
          setActingRole(event.target.value || null);
          // Everything on screen was loaded with the previous role.
          navigate("/");
          void queryClient.resetQueries();
        }}
      >
        <option value="">{ar ? "كل صلاحياتي" : "All my roles"}</option>
        {available.map(role => (
          <option key={role} value={role}>
            {roleLabels[role]?.[locale] ?? role}
          </option>
        ))}
      </select>
    </label>
  );
}

// Shown under the header while acting as a single role.
export function ActingRoleBanner({ locale }: { locale: Locale }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const role = user?.actingRole as BoardRole | null | undefined;
  if (!role) return null;
  const ar = locale === "ar";
  return (
    <div
      className="flex flex-wrap items-center justify-center gap-3 bg-[#d8a84e] px-4 py-2 text-center text-xs font-semibold text-[#163f43]"
      role="status"
    >
      {ar
        ? `أنت تعمل الآن بصفة «${roleLabels[role]?.ar ?? role}» فقط.`
        : `You are acting as ${roleLabels[role]?.en ?? role} only.`}
      <button
        className="rounded-lg bg-[#163f43] px-3 py-1 text-white"
        onClick={() => {
          setActingRole(null);
          navigate("/");
          void queryClient.resetQueries();
        }}
      >
        {ar ? "العودة إلى كل صلاحياتي" : "Back to all my roles"}
      </button>
    </div>
  );
}
