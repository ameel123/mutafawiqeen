"use client";

import Link from "next/link";
import { useState } from "react";
import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/client";
import { ErrorText, InlineEdit, useAction } from "./ui";

type Subject = { id: number; name: string; icon: string; color: string; isActive: boolean; books: number; published: number };
type Grade = { id: number; name: string; subjects: Subject[] };

const ICONS = ["📖", "🔢", "🔬", "🕌", "🔤", "🌍", "🎨", "🤝", "💻", "🏃", "📘"];

export function SubjectsManager({ grades }: { grades: Grade[] }) {
  const { busy, error, run } = useAction();
  const [adding, setAdding] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("📘");

  return (
    <div className="space-y-5">
      <ErrorText error={error} />
      {grades.map((g) => (
        <section key={g.id} className="card p-4" data-testid={`grade-${g.id}`}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-extrabold">{g.name}</h2>
            <button className="btn btn-outline btn-sm" onClick={() => setAdding(adding === g.id ? null : g.id)}>
              <Plus size={15} /> مادة
            </button>
          </div>
          {adding === g.id && (
            <form
              className="mb-3 flex flex-wrap items-end gap-2 rounded-xl bg-paper p-3"
              onSubmit={async (e) => {
                e.preventDefault();
                const r = await run(() => api("/api/admin/subjects", { body: { gradeId: g.id, name, icon } }));
                if (r) {
                  setName("");
                  setAdding(null);
                }
              }}
            >
              <div className="flex-1">
                <label className="label" htmlFor={`sn-${g.id}`}>
                  اسم المادة
                </label>
                <input id={`sn-${g.id}`} className="input" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="flex flex-wrap gap-1">
                {ICONS.map((i) => (
                  <button
                    type="button"
                    key={i}
                    onClick={() => setIcon(i)}
                    className={`h-10 w-10 rounded-lg text-xl ${icon === i ? "bg-brand-100 ring-2 ring-brand-500" : "bg-white"}`}
                  >
                    {i}
                  </button>
                ))}
              </div>
              <button className="btn btn-primary" disabled={busy}>
                إضافة
              </button>
            </form>
          )}
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {g.subjects.map((s) => (
              <li key={s.id} className={`flex items-center gap-2 rounded-xl border border-line bg-white p-2.5 ${s.isActive ? "" : "opacity-60"}`}>
                <span className="text-2xl">{s.icon}</span>
                <div className="min-w-0 flex-1">
                  <InlineEdit
                    value={s.name}
                    label="اسم المادة"
                    className="font-bold"
                    onSave={(v) => run(() => api("/api/admin/subjects", { method: "PATCH", body: { id: s.id, name: v } }))}
                  />
                  <p className="px-1 text-xs text-ink-soft">
                    {s.books} كتاب · {s.published} درس منشور{s.isActive ? "" : " · مخفية"}
                  </p>
                </div>
                <Link href={`/admin/subjects/${s.id}`} className="btn btn-outline btn-sm">
                  الكتب
                </Link>
                <button
                  className="btn btn-ghost btn-sm !p-2"
                  title={s.isActive ? "إخفاء عن الطلاب" : "إظهار للطلاب"}
                  aria-label={s.isActive ? "إخفاء" : "إظهار"}
                  onClick={() => run(() => api("/api/admin/subjects", { method: "PATCH", body: { id: s.id, isActive: !s.isActive } }))}
                >
                  {s.isActive ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
                {s.books === 0 && (
                  <button
                    className="btn btn-ghost btn-sm !p-2 text-coral-700"
                    aria-label="حذف"
                    onClick={() => confirm(`حذف مادة ${s.name}؟`) && run(() => api("/api/admin/subjects", { method: "DELETE", body: { id: s.id } }))}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function NewBookForm({ subjectId }: { subjectId: number }) {
  const { busy, error, run } = useAction();
  const [title, setTitle] = useState("");
  const [edition, setEdition] = useState("");
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await run(() => api<{ id: number }>("/api/admin/books", { body: { subjectId, title, edition } }), { refresh: false });
        if (r) window.location.href = `/admin/books/${r.id}`;
      }}
    >
      <div className="min-w-48 flex-1">
        <label className="label" htmlFor="btitle">
          عنوان الكتاب
        </label>
        <input id="btitle" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: قراءتي" required />
      </div>
      <div className="min-w-48 flex-1">
        <label className="label" htmlFor="bed">
          الجزء / الطبعة (اختياري)
        </label>
        <input id="bed" className="input" value={edition} onChange={(e) => setEdition(e.target.value)} />
      </div>
      <button className="btn btn-primary" disabled={busy}>
        <Plus size={16} /> إنشاء الكتاب
      </button>
      <div className="w-full">
        <ErrorText error={error} />
      </div>
    </form>
  );
}
