import { useLocale } from "@/contexts/LocaleContext";
import { auth } from "@/lib/firebase";
import type { Locale } from "@shared/domain";
import { FirebaseError } from "firebase/app";
import { createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, updateProfile } from "firebase/auth";
import { Globe2, KeyRound, LogIn, LogOut, MailCheck, RefreshCw, ShieldCheck, UserPlus } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";

type Mode = "signIn" | "register" | "reset";
type Feedback = { tone: "error" | "success"; text: string } | null;

const errorMessages: Record<string, Record<Locale, string>> = {
  "auth/invalid-credential": { ar: "البريد الإلكتروني أو كلمة المرور غير صحيحة.", en: "Incorrect email or password." },
  "auth/invalid-email": { ar: "صيغة البريد الإلكتروني غير صحيحة.", en: "The email address is not valid." },
  "auth/email-already-in-use": { ar: "يوجد حساب مسجل بهذا البريد الإلكتروني.", en: "An account already exists for this email." },
  "auth/weak-password": { ar: "كلمة المرور ضعيفة؛ استخدم 8 أحرف على الأقل.", en: "Password is too weak; use at least 8 characters." },
  "auth/too-many-requests": { ar: "محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.", en: "Too many attempts. Wait a moment and try again." },
  "auth/network-request-failed": { ar: "تعذر الاتصال. تحقق من الشبكة وأعد المحاولة.", en: "Network error. Check your connection and try again." },
  "app/email-not-verified": { ar: "لم يتم التحقق من البريد بعد. افتح الرابط المرسل ثم أعد المحاولة.", en: "Your email isn't verified yet. Open the link we sent, then try again." },
  "auth/user-disabled": { ar: "تم تعطيل هذا الحساب.", en: "This account has been disabled." },
};
const genericError = { ar: "تعذر إكمال العملية. أعد المحاولة.", en: "Something went wrong. Please try again." };
const t = (locale: Locale, ar: string, en: string) => (locale === "ar" ? ar : en);

function describeError(error: unknown, locale: Locale) {
  if (error instanceof FirebaseError) {
    // Older projects report wrong passwords / unknown users separately.
    const code = ["auth/wrong-password", "auth/user-not-found"].includes(error.code) ? "auth/invalid-credential" : error.code;
    return (errorMessages[code] ?? genericError)[locale];
  }
  return genericError[locale];
}

const inputClass = "mt-1.5 w-full rounded-xl border border-[#d9d4c5] bg-[#fbfaf6] px-3.5 py-2.5 text-sm text-[#163f43] outline-none focus:border-[#163f43] focus:ring-2 focus:ring-[#163f43]/15";
const primaryButton = "inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#d8a84e] px-5 py-3 font-semibold text-[#163f43] disabled:opacity-60";
const linkButton = "text-sm font-semibold text-[#163f43] underline-offset-4 hover:underline";

function Frame({ children }: { children: ReactNode }) {
  const { locale, setLocale } = useLocale();
  return <div className="min-h-screen grid place-items-center bg-[#f7f5ef] p-6"><div className="w-full max-w-md rounded-[2rem] border border-[#dcd8c9] bg-white p-8 shadow-sm sm:p-10"><div className="flex items-start justify-between"><div className="grid h-14 w-14 place-items-center rounded-2xl bg-[#163f43] text-[#f7f5ef]"><ShieldCheck /></div><button type="button" onClick={() => setLocale(locale === "ar" ? "en" : "ar")} className="inline-flex items-center gap-2 rounded-xl border border-[#d9d4c5] px-3 py-2 text-xs font-semibold text-[#163f43]"><Globe2 className="h-4 w-4" />{locale === "ar" ? "English" : "العربية"}</button></div>{children}</div></div>;
}

function FeedbackBox({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  return feedback.tone === "error"
    ? <p className="mt-5 rounded-xl border border-[#9b4c3f]/30 bg-[#fff4f1] p-3 text-sm text-[#9b4c3f]" role="alert">{feedback.text}</p>
    : <p className="mt-5 rounded-xl border border-[#2f6b4f]/30 bg-[#f0f8f3] p-3 text-sm text-[#2f6b4f]" role="status">{feedback.text}</p>;
}

export function SignInScreen() {
  const { locale } = useLocale();
  const [mode, setMode] = useState<Mode>("signIn");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const switchMode = (next: Mode) => { setMode(next); setFeedback(null); };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      if (mode === "signIn") {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else if (mode === "register") {
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(credential.user, { displayName: name.trim() });
        auth.languageCode = locale;
        await sendEmailVerification(credential.user);
        // Force a fresh token so the display name is carried to the server.
        await credential.user.getIdToken(true);
      } else {
        auth.languageCode = locale;
        await sendPasswordResetEmail(auth, email.trim());
        setFeedback({ tone: "success", text: t(locale, "إذا كان البريد مسجلًا، فستصلك رسالة لإعادة تعيين كلمة المرور.", "If that email is registered, a password reset link is on its way.") });
      }
    } catch (error) {
      setFeedback({ tone: "error", text: describeError(error, locale) });
    } finally {
      setBusy(false);
    }
  };

  const title = mode === "signIn" ? t(locale, "تسجيل الدخول", "Sign in") : mode === "register" ? t(locale, "إنشاء حساب", "Create account") : t(locale, "إعادة تعيين كلمة المرور", "Reset password");

  return <Frame>
    <h1 className="mt-6 text-2xl font-semibold text-[#163f43]">{t(locale, "مساحة أمانة المجلس", "Board Secretariat Workspace")}</h1>
    <p className="mt-2 leading-7 text-[#6f756e]">{title}</p>
    <form className="mt-6 space-y-4 text-start" onSubmit={handleSubmit}>
      {mode === "register" && <label className="block text-sm font-semibold text-[#163f43]">{t(locale, "الاسم الكامل", "Full name")}<input className={inputClass} value={name} onChange={event => setName(event.target.value)} autoComplete="name" required minLength={2} /></label>}
      <label className="block text-sm font-semibold text-[#163f43]">{t(locale, "البريد الإلكتروني", "Email")}<input className={inputClass} type="email" dir="ltr" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" required /></label>
      {mode !== "reset" && <label className="block text-sm font-semibold text-[#163f43]">{t(locale, "كلمة المرور", "Password")}<input className={inputClass} type="password" dir="ltr" value={password} onChange={event => setPassword(event.target.value)} autoComplete={mode === "register" ? "new-password" : "current-password"} required minLength={mode === "register" ? 8 : undefined} /></label>}
      <FeedbackBox feedback={feedback} />
      <button type="submit" className={primaryButton} disabled={busy}>{mode === "signIn" ? <LogIn className="h-4 w-4" /> : mode === "register" ? <UserPlus className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}{mode === "signIn" ? t(locale, "دخول", "Sign in") : mode === "register" ? t(locale, "إنشاء الحساب", "Create account") : t(locale, "إرسال رابط إعادة التعيين", "Send reset link")}</button>
    </form>
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
      {mode === "signIn" ? <><button type="button" className={linkButton} onClick={() => switchMode("register")}>{t(locale, "ليس لديك حساب؟ أنشئ حسابًا", "No account? Create one")}</button><button type="button" className={linkButton} onClick={() => switchMode("reset")}>{t(locale, "نسيت كلمة المرور؟", "Forgot password?")}</button></> : <button type="button" className={linkButton} onClick={() => switchMode("signIn")}>{t(locale, "العودة لتسجيل الدخول", "Back to sign in")}</button>}
    </div>
  </Frame>;
}

export function VerifyEmailScreen({ email, onRefresh, onSignOut }: { email: string | null; onRefresh: () => Promise<void>; onSignOut: () => Promise<void> }) {
  const { locale } = useLocale();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const run = async (action: () => Promise<void>, success?: string) => {
    setBusy(true);
    setFeedback(null);
    try { await action(); if (success) setFeedback({ tone: "success", text: success }); } catch (error) { setFeedback({ tone: "error", text: describeError(error, locale) }); } finally { setBusy(false); }
  };

  const resend = () => run(async () => { if (!auth.currentUser) return; auth.languageCode = locale; await sendEmailVerification(auth.currentUser); }, t(locale, "أُرسلت رسالة تحقق جديدة.", "A new verification email has been sent."));
  const confirm = () => run(async () => {
    await onRefresh();
    if (!auth.currentUser?.emailVerified) throw new FirebaseError("app/email-not-verified", "Email not verified");
  });

  return <Frame>
    <div className="mt-6 flex items-center gap-3 text-[#163f43]"><MailCheck className="h-6 w-6" /><h1 className="text-2xl font-semibold">{t(locale, "تحقق من بريدك الإلكتروني", "Verify your email")}</h1></div>
    <p className="mt-3 leading-7 text-[#6f756e]">{t(locale, "أرسلنا رابط تحقق إلى", "We sent a verification link to")} <span dir="ltr" className="font-semibold text-[#163f43]">{email}</span>. {t(locale, "افتح الرابط ثم اضغط متابعة.", "Open the link, then press Continue.")}</p>
    <FeedbackBox feedback={feedback} />
    <div className="mt-7 space-y-3">
      <button type="button" className={primaryButton} disabled={busy} onClick={confirm}><RefreshCw className="h-4 w-4" />{t(locale, "متابعة", "Continue")}</button>
      <div className="flex flex-wrap items-center justify-between gap-3"><button type="button" className={linkButton} disabled={busy} onClick={resend}>{t(locale, "إعادة إرسال الرابط", "Resend link")}</button><button type="button" className={`${linkButton} inline-flex items-center gap-1.5`} onClick={() => void onSignOut()}><LogOut className="h-4 w-4" />{t(locale, "تسجيل الخروج", "Sign out")}</button></div>
    </div>
  </Frame>;
}

export function AccountErrorScreen({ onRetry, onSignOut }: { onRetry: () => Promise<void>; onSignOut: () => Promise<void> }) {
  const { locale } = useLocale();
  return <Frame>
    <h1 className="mt-6 text-2xl font-semibold text-[#163f43]">{t(locale, "تعذر تحميل الحساب", "Couldn't load your account")}</h1>
    <p className="mt-3 leading-7 text-[#6f756e]">{t(locale, "تم تسجيل دخولك لكن الخادم لم يتمكن من التحقق من جلستك. أعد المحاولة أو سجّل الخروج.", "You're signed in, but the server couldn't verify your session. Try again or sign out.")}</p>
    <div className="mt-7 space-y-3"><button type="button" className={primaryButton} onClick={() => void onRetry()}><RefreshCw className="h-4 w-4" />{t(locale, "إعادة المحاولة", "Try again")}</button><button type="button" className={`${linkButton} inline-flex items-center gap-1.5`} onClick={() => void onSignOut()}><LogOut className="h-4 w-4" />{t(locale, "تسجيل الخروج", "Sign out")}</button></div>
  </Frame>;
}
