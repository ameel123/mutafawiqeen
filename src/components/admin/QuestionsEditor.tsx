"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2, X } from "lucide-react";
import { api } from "@/lib/client";
import { QUESTION_TYPE_LABEL, type QuestionKind, type QuestionType } from "@/lib/questions";
import { ErrorText, useAction } from "./ui";

export type AdminQuestion = {
  id: number;
  kind: QuestionKind;
  type: QuestionType;
  prompt: string;
  options: unknown;
  answer: unknown;
  explanation: string | null;
  points: number;
};

type Draft = {
  id?: number;
  kind: QuestionKind;
  type: QuestionType;
  prompt: string;
  options: string[];
  correct: number;
  tf: boolean;
  accepted: string;
  pairs: { left: string; right: string }[];
  explanation: string;
  points: number;
};

const emptyDraft = (kind: QuestionKind): Draft => ({
  kind,
  type: "mcq",
  prompt: "",
  options: ["", ""],
  correct: 0,
  tf: true,
  accepted: "",
  pairs: [
    { left: "", right: "" },
    { left: "", right: "" },
  ],
  explanation: "",
  points: 1,
});

function toDraft(q: AdminQuestion): Draft {
  const d = emptyDraft(q.kind);
  d.id = q.id;
  d.type = q.type;
  d.prompt = q.prompt;
  d.explanation = q.explanation ?? "";
  d.points = q.points;
  if (q.type === "mcq" || q.type === "ordering") d.options = [...(q.options as string[])];
  if (q.type === "mcq") d.correct = q.answer as number;
  if (q.type === "true_false") d.tf = q.answer as boolean;
  if (q.type === "fill_blank") d.accepted = (q.answer as string[]).join("\n");
  if (q.type === "matching") d.pairs = [...(q.options as { left: string; right: string }[])];
  return d;
}

function payload(d: Draft) {
  const base = { kind: d.kind, type: d.type, prompt: d.prompt, explanation: d.explanation || null, points: d.points };
  switch (d.type) {
    case "mcq":
      return { ...base, options: d.options, answer: d.correct };
    case "true_false":
      return { ...base, options: [], answer: d.tf };
    case "fill_blank":
      return { ...base, options: [], answer: d.accepted.split(/\n|،|,/).map((s) => s.trim()).filter(Boolean) };
    case "ordering":
      return { ...base, options: d.options, answer: null };
    case "matching":
      return { ...base, options: d.pairs, answer: null };
  }
}

export function answerSummary(q: Pick<AdminQuestion, "type" | "options" | "answer">): string {
  switch (q.type) {
    case "mcq":
      return `✓ ${(q.options as string[])[q.answer as number]} · من ${(q.options as string[]).length} خيارات`;
    case "true_false":
      return q.answer ? "✓ صح" : "✓ خطأ";
    case "fill_blank":
      return `✓ ${(q.answer as string[]).join(" / ")}`;
    case "ordering":
      return (q.options as string[]).join(" ← ");
    case "matching":
      return (q.options as { left: string; right: string }[]).map((p) => `${p.left} ↔ ${p.right}`).join("، ");
  }
}

export function QuestionsEditor({ lessonId, questions }: { lessonId: number; questions: AdminQuestion[] }) {
  const { busy, error, run } = useAction();
  const [editing, setEditing] = useState<Draft | null>(null);
  const url = `/api/admin/lessons/${lessonId}/questions`;

  const save = async (d: Draft) => {
    const body = d.id ? { ...payload(d), id: d.id } : payload(d);
    const r = await run(() => api(url, { method: d.id ? "PATCH" : "POST", body }));
    if (r) setEditing(null);
  };

  return (
    <div className="space-y-5">
      <ErrorText error={error} />
      {(["activity", "quiz"] as const).map((kind) => {
        const list = questions.filter((q) => q.kind === kind);
        return (
          <section key={kind}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-extrabold">
                {kind === "activity" ? "أنشطة الدرس (تصحيح فوري)" : "أسئلة اختبار الدرس"}{" "}
                <span className="text-sm font-bold text-ink-soft">({list.length})</span>
              </h3>
              <button className="btn btn-outline btn-sm" onClick={() => setEditing(emptyDraft(kind))}>
                <Plus size={14} /> {kind === "activity" ? "نشاط" : "سؤال"}
              </button>
            </div>
            {editing && editing.kind === kind && !editing.id && <QuestionForm draft={editing} onCancel={() => setEditing(null)} onSave={save} busy={busy} />}
            <ul className="space-y-2">
              {list.map((q) =>
                editing?.id === q.id ? (
                  <li key={q.id}>
                    <QuestionForm draft={editing} onCancel={() => setEditing(null)} onSave={save} busy={busy} />
                  </li>
                ) : (
                  <li key={q.id} className="flex items-start gap-2 rounded-xl border border-line bg-white p-3" data-testid={`q-${kind}`}>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-brand-700">{QUESTION_TYPE_LABEL[q.type]}</p>
                      <p className="font-bold">{q.prompt}</p>
                      <p className="mt-0.5 truncate text-sm text-mint-700">{answerSummary(q)}</p>
                    </div>
                    <button className="btn btn-ghost btn-sm !p-1.5" aria-label="للأعلى" onClick={() => run(() => api(url, { method: "PATCH", body: { id: q.id, move: "up" } }))}>
                      <ArrowUp size={14} />
                    </button>
                    <button className="btn btn-ghost btn-sm !p-1.5" aria-label="للأسفل" onClick={() => run(() => api(url, { method: "PATCH", body: { id: q.id, move: "down" } }))}>
                      <ArrowDown size={14} />
                    </button>
                    <button className="btn btn-ghost btn-sm !p-1.5" aria-label="تعديل" onClick={() => setEditing(toDraft(q))}>
                      <Pencil size={14} />
                    </button>
                    <button
                      className="btn btn-ghost btn-sm !p-1.5 text-coral-700"
                      aria-label="حذف"
                      onClick={() => confirm("حذف هذا السؤال؟") && run(() => api(url, { method: "DELETE", body: { id: q.id } }))}
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ),
              )}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function QuestionForm({ draft, onSave, onCancel, busy }: { draft: Draft; onSave: (d: Draft) => void; onCancel: () => void; busy: boolean }) {
  const [d, setD] = useState<Draft>(draft);
  const set = (p: Partial<Draft>) => setD({ ...d, ...p });

  return (
    <form
      className="mb-3 space-y-3 rounded-2xl border-2 border-brand-200 bg-brand-50/40 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(d);
      }}
      data-testid="question-form"
    >
      <div className="flex flex-wrap gap-1">
        {(Object.keys(QUESTION_TYPE_LABEL) as QuestionType[]).map((t) => (
          <button
            type="button"
            key={t}
            onClick={() => set({ type: t })}
            className={`rounded-lg px-3 py-1.5 text-sm font-bold ${d.type === t ? "bg-brand-500 text-white" : "bg-white text-ink-soft ring-1 ring-line"}`}
          >
            {QUESTION_TYPE_LABEL[t]}
          </button>
        ))}
      </div>
      <div>
        <label className="label" htmlFor="qprompt">
          نص السؤال
        </label>
        <textarea id="qprompt" className="input" rows={2} value={d.prompt} onChange={(e) => set({ prompt: e.target.value })} required />
      </div>

      {(d.type === "mcq" || d.type === "ordering") && (
        <div className="space-y-1.5">
          <p className="label">{d.type === "mcq" ? "الخيارات (اختر الصحيح)" : "العناصر بالترتيب الصحيح (تُخلط للطالب)"}</p>
          {d.options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              {d.type === "mcq" ? (
                <input type="radio" name="correct" checked={d.correct === i} onChange={() => set({ correct: i })} aria-label={`الخيار ${i + 1} صحيح`} />
              ) : (
                <span className="w-5 text-center text-sm font-bold text-ink-soft">{i + 1}</span>
              )}
              <input
                className="input !py-1.5"
                value={o}
                onChange={(e) => set({ options: d.options.map((x, j) => (j === i ? e.target.value : x)) })}
                aria-label={`الخيار ${i + 1}`}
                required
              />
              {d.options.length > 2 && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm !p-1.5"
                  aria-label="حذف الخيار"
                  onClick={() => set({ options: d.options.filter((_, j) => j !== i), correct: d.correct >= i && d.correct > 0 ? d.correct - 1 : d.correct })}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
          {d.options.length < (d.type === "mcq" ? 6 : 8) && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ options: [...d.options, ""] })}>
              <Plus size={14} /> إضافة
            </button>
          )}
        </div>
      )}

      {d.type === "true_false" && (
        <div className="flex gap-2">
          {[true, false].map((v) => (
            <label key={String(v)} className={`flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2 font-bold ring-1 ${d.tf === v ? "bg-white ring-brand-500" : "ring-line"}`}>
              <input type="radio" name="tf" checked={d.tf === v} onChange={() => set({ tf: v })} /> {v ? "صح" : "خطأ"}
            </label>
          ))}
        </div>
      )}

      {d.type === "fill_blank" && (
        <div>
          <label className="label" htmlFor="qacc">
            الإجابات المقبولة (كل إجابة في سطر) — يُتجاهل التشكيل والهمزات عند التصحيح
          </label>
          <textarea id="qacc" className="input" rows={2} value={d.accepted} onChange={(e) => set({ accepted: e.target.value })} required />
        </div>
      )}

      {d.type === "matching" && (
        <div className="space-y-1.5">
          <p className="label">الأزواج الصحيحة (يُخلط العمود الثاني للطالب)</p>
          {d.pairs.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className="input !py-1.5" value={p.left} onChange={(e) => set({ pairs: d.pairs.map((x, j) => (j === i ? { ...x, left: e.target.value } : x)) })} aria-label={`العمود الأول ${i + 1}`} required />
              <span>↔</span>
              <input className="input !py-1.5" value={p.right} onChange={(e) => set({ pairs: d.pairs.map((x, j) => (j === i ? { ...x, right: e.target.value } : x)) })} aria-label={`العمود الثاني ${i + 1}`} required />
              {d.pairs.length > 2 && (
                <button type="button" className="btn btn-ghost btn-sm !p-1.5" aria-label="حذف الزوج" onClick={() => set({ pairs: d.pairs.filter((_, j) => j !== i) })}>
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
          {d.pairs.length < 6 && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ pairs: [...d.pairs, { left: "", right: "" }] })}>
              <Plus size={14} /> زوج
            </button>
          )}
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input className="input" value={d.explanation} onChange={(e) => set({ explanation: e.target.value })} placeholder="شرح يظهر بعد الإجابة (اختياري)" aria-label="الشرح" />
        <label className="flex items-center gap-2 text-sm">
          الدرجة
          <input type="number" min={1} max={20} className="input w-20" value={d.points} onChange={(e) => set({ points: Number(e.target.value) || 1 })} />
        </label>
      </div>
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={busy}>
          حفظ السؤال
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          إلغاء
        </button>
      </div>
    </form>
  );
}
