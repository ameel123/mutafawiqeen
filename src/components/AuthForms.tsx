"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client";

const GRADES = ["الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس"];

function ErrorBox({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <p role="alert" className="rounded-xl bg-coral-100 px-3.5 py-2.5 text-sm font-bold text-coral-700">
      {msg}
    </p>
  );
}

export function LoginForm() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        setBusy(true);
        try {
          const r = await api<{ redirect: string }>("/api/auth/login", { body: { login, password } });
          window.location.href = r.redirect;
        } catch (e) {
          setErr((e as Error).message);
          setBusy(false);
        }
      }}
    >
      <div>
        <label className="label" htmlFor="login">
          اسم المستخدم أو البريد
        </label>
        <input
          id="login"
          className="input"
          dir="ltr"
          autoComplete="username"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="label" htmlFor="password">
          كلمة المرور
        </label>
        <input
          id="password"
          type="password"
          className="input"
          dir="ltr"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      <ErrorBox msg={err} />
      <button className="btn btn-primary w-full py-3 text-base" disabled={busy}>
        {busy ? "جارٍ الدخول…" : "دخول"}
      </button>
      <p className="text-center text-sm text-ink-soft">
        ليس لديك حساب؟{" "}
        <Link href="/register" className="font-bold text-brand-600 underline-offset-4 hover:underline">
          أنشئ حساباً
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm({ initialRole }: { initialRole: "student" | "parent" }) {
  const [role, setRole] = useState<"student" | "parent">(initialRole);
  const [displayName, setDisplayName] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [grade, setGrade] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        if (role === "student" && !grade) return setErr("اختر الصف الدراسي");
        setBusy(true);
        try {
          const r = await api<{ redirect: string }>("/api/auth/register", {
            body: { role, displayName, login, password, gradeNumber: role === "student" ? grade : undefined },
          });
          window.location.href = r.redirect;
        } catch (e) {
          setErr((e as Error).message);
          setBusy(false);
        }
      }}
    >
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-brand-50 p-1.5" role="radiogroup" aria-label="نوع الحساب">
        {(
          [
            ["student", "🎒 طالب"],
            ["parent", "👪 ولي أمر"],
          ] as const
        ).map(([r, label]) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={role === r}
            onClick={() => setRole(r)}
            className={`rounded-xl py-2.5 font-bold transition ${role === r ? "bg-white text-brand-700 shadow" : "text-ink-soft"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div>
        <label className="label" htmlFor="name">
          {role === "student" ? "اسم الطالب" : "الاسم"}
        </label>
        <input id="name" className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
      </div>

      {role === "student" && (
        <div>
          <span className="label">الصف</span>
          <div className="grid grid-cols-3 gap-2">
            {GRADES.map((g, i) => (
              <button
                key={g}
                type="button"
                onClick={() => setGrade(i + 1)}
                aria-pressed={grade === i + 1}
                className={`rounded-xl border py-2 font-bold transition ${
                  grade === i + 1 ? "border-brand-500 bg-brand-500 text-white" : "border-line bg-white hover:border-brand-200"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="label" htmlFor="login">
          اسم المستخدم (بالإنكليزية) أو البريد
        </label>
        <input
          id="login"
          className="input"
          dir="ltr"
          autoComplete="username"
          placeholder="ali2019"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="label" htmlFor="password">
          كلمة المرور
        </label>
        <input
          id="password"
          type="password"
          className="input"
          dir="ltr"
          autoComplete="new-password"
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <p className="mt-1 text-xs text-ink-soft">6 أحرف على الأقل</p>
      </div>
      <ErrorBox msg={err} />
      <button className="btn btn-primary w-full py-3 text-base" disabled={busy}>
        {busy ? "جارٍ إنشاء الحساب…" : "إنشاء الحساب"}
      </button>
      <p className="text-center text-sm text-ink-soft">
        لديك حساب؟{" "}
        <Link href="/login" className="font-bold text-brand-600 underline-offset-4 hover:underline">
          سجّل الدخول
        </Link>
      </p>
    </form>
  );
}
