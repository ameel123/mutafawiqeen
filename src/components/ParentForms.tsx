"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

const GRADES = ["الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس"];

export function LinkChildForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg(null);
        try {
          const r = await api<{ name: string }>("/api/parent/children", { body: { code } });
          setMsg({ ok: true, text: `تم ربط ${r.name} بحسابك` });
          setCode("");
          router.refresh();
        } catch (e) {
          setMsg({ ok: false, text: (e as Error).message });
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="min-w-40 flex-1">
        <label className="label" htmlFor="code">
          رمز الربط من حساب الطالب
        </label>
        <input
          id="code"
          className="input font-mono uppercase tracking-[0.25em]"
          dir="ltr"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="ABC234"
          required
        />
      </div>
      <button className="btn btn-primary" disabled={busy}>
        ربط
      </button>
      {msg && <p className={`w-full text-sm font-bold ${msg.ok ? "text-mint-700" : "text-coral-700"}`}>{msg.text}</p>}
    </form>
  );
}

export function CreateChildForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ displayName: "", login: "", password: "", grade: 0 });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!open)
    return (
      <button className="btn btn-sun" onClick={() => setOpen(true)}>
        + إنشاء حساب لطفلي
      </button>
    );
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!f.grade) return setErr("اختر الصف");
        setBusy(true);
        setErr(null);
        try {
          await api("/api/parent/children", {
            body: { displayName: f.displayName, login: f.login, password: f.password, gradeNumber: f.grade },
          });
          setOpen(false);
          setF({ displayName: "", login: "", password: "", grade: 0 });
          router.refresh();
        } catch (e) {
          setErr((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="cname">
            اسم الطفل
          </label>
          <input id="cname" className="input" value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} required />
        </div>
        <div>
          <label className="label" htmlFor="clogin">
            اسم المستخدم (إنكليزي)
          </label>
          <input id="clogin" className="input" dir="ltr" value={f.login} onChange={(e) => setF({ ...f, login: e.target.value })} required />
        </div>
        <div>
          <label className="label" htmlFor="cpass">
            كلمة المرور
          </label>
          <input
            id="cpass"
            className="input"
            dir="ltr"
            type="password"
            minLength={6}
            value={f.password}
            onChange={(e) => setF({ ...f, password: e.target.value })}
            required
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {GRADES.map((g, i) => (
          <button
            type="button"
            key={g}
            aria-pressed={f.grade === i + 1}
            onClick={() => setF({ ...f, grade: i + 1 })}
            className={`rounded-xl border px-3 py-1.5 text-sm font-bold ${f.grade === i + 1 ? "border-brand-500 bg-brand-500 text-white" : "border-line bg-white"}`}
          >
            الصف {g}
          </button>
        ))}
      </div>
      {err && <p className="text-sm font-bold text-coral-700">{err}</p>}
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={busy}>
          إنشاء الحساب
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
          إلغاء
        </button>
      </div>
    </form>
  );
}

export function UnlinkButton({ studentId, name }: { studentId: number; name: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  if (!confirm)
    return (
      <button className="btn btn-danger btn-sm" onClick={() => setConfirm(true)}>
        إلغاء الربط
      </button>
    );
  return (
    <span className="flex items-center gap-2 text-sm">
      إلغاء ربط {name}؟
      <button
        className="btn btn-danger btn-sm"
        onClick={async () => {
          await api("/api/parent/children", { method: "DELETE", body: { studentId } });
          router.push("/parent");
          router.refresh();
        }}
      >
        نعم
      </button>
      <button className="btn btn-ghost btn-sm" onClick={() => setConfirm(false)}>
        لا
      </button>
    </span>
  );
}
