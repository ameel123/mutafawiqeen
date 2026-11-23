"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Circle, Eye, FileText, ImagePlus, Save, Sparkles } from "lucide-react";
import type { Block } from "@/lib/blocks";
import { api } from "@/lib/client";
import { openPdf, pageText } from "@/lib/pdf-client";
import { BlockView } from "../BlockView";
import { BlocksEditor, stripKeys, withKeys, type EditableBlock } from "./BlocksEditor";
import { answerSummary, QuestionsEditor, type AdminQuestion } from "./QuestionsEditor";
import { ErrorText, StatusBadge, useAction, type LessonStatus } from "./ui";

export type LessonEditorData = {
  id: number;
  title: string;
  status: LessonStatus;
  pageStart: number | null;
  pageEnd: number | null;
  content: Block[];
  bookId: number;
  bookTitle: string;
  unitTitle: string;
  subjectName: string;
  gradeName: string;
  hasPdf: boolean;
  pageOffset: number;
};

type Suggestion = { blocks: Block[]; questions: (Omit<AdminQuestion, "id" | "explanation"> & { explanation?: string | null })[] };

export function LessonEditor({
  lesson,
  pageImages,
  questions,
}: {
  lesson: LessonEditorData;
  pageImages: Record<number, string>;
  questions: AdminQuestion[];
}) {
  const [blocks, setBlocks] = useState<EditableBlock[]>(() => withKeys(lesson.content));
  const [saved, setSaved] = useState(() => JSON.stringify(lesson.content));
  const [tab, setTab] = useState<"content" | "questions">("content");
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [tool, setTool] = useState<string | null>(null);
  const { busy, error, setError, run } = useAction();

  const dirty = JSON.stringify(stripKeys(blocks)) !== saved;
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const range = useMemo(() => {
    if (!lesson.pageStart) return [];
    const end = Math.max(lesson.pageStart, lesson.pageEnd ?? lesson.pageStart);
    return Array.from({ length: Math.min(end - lesson.pageStart + 1, 20) }, (_, i) => lesson.pageStart! + i);
  }, [lesson.pageStart, lesson.pageEnd]);

  const quizCount = questions.filter((q) => q.kind === "quiz").length;
  const hasContent = stripKeys(blocks).length > 0;

  const save = async () => {
    const content = stripKeys(blocks);
    const r = await run(() => api<{ status: string }>(`/api/admin/lessons/${lesson.id}`, { method: "PUT", body: { content } }));
    if (r) setSaved(JSON.stringify(content));
    return !!r;
  };

  const workflow = async (action: "review" | "publish" | "unpublish" | "reopen") => {
    if (dirty && !(await save())) return;
    await run(() => api(`/api/admin/lessons/${lesson.id}`, { body: { action } }));
  };

  async function addPagePictures() {
    const figs: Block[] = range.map((p) => ({ type: "figure", description: `صفحة ${p} من كتاب ${lesson.bookTitle}`, page: p }));
    setBlocks([...blocks, ...withKeys(figs)]);
  }

  async function copyPdfText() {
    setTool("pdf");
    setError(null);
    try {
      const { url } = await api<{ url: string }>(`/api/admin/books/${lesson.bookId}/pages`);
      const doc = await openPdf(url);
      const out: Block[] = [];
      for (const p of range) {
        const n = p + lesson.pageOffset;
        if (n < 1 || n > doc.numPages) continue;
        const text = await pageText(doc, n);
        out.push({ type: "figure", description: `صفحة ${p} من كتاب ${lesson.bookTitle}`, page: p });
        if (text) out.push({ type: "paragraph", text });
      }
      await doc.destroy();
      if (!out.length) throw new Error("لم يُعثر على نص في صفحات هذا الدرس");
      setBlocks([...blocks, ...withKeys(out)]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTool(null);
    }
  }

  async function aiExtract() {
    setTool("ai");
    setError(null);
    try {
      setSuggestion(await api<Suggestion>(`/api/admin/lessons/${lesson.id}/extract`, { body: {} }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTool(null);
    }
  }

  const checks = [
    { ok: range.length > 0, text: "حُدّدت صفحات الدرس" },
    { ok: range.some((p) => pageImages[p]), text: "صور صفحات الكتاب متوفرة" },
    { ok: hasContent && !dirty, text: "المحتوى محفوظ" },
    { ok: quizCount > 0, text: `أسئلة الاختبار (${quizCount})` },
    { ok: lesson.status === "reviewed" || lesson.status === "published", text: "روجع ومطابق للكتاب" },
  ];

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="me-auto min-w-0">
            <Link href={`/admin/books/${lesson.bookId}`} className="text-sm font-bold text-brand-600 hover:underline">
              {lesson.subjectName} · {lesson.bookTitle} · {lesson.unitTitle}
            </Link>
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-extrabold">
              {lesson.title} <StatusBadge status={lesson.status} />
            </h1>
            <p className="text-sm text-ink-soft">
              {lesson.gradeName} · {range.length ? `الصفحات ${range[0]}–${range[range.length - 1]}` : "بلا صفحات"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/admin/lessons/${lesson.id}/preview`} className="btn btn-outline" target="_blank">
              <Eye size={16} /> معاينة كطالب
            </Link>
            {(lesson.status === "draft" || lesson.status === "extracted") && (
              <button className="btn btn-sun" disabled={busy || !hasContent} onClick={() => workflow("review")}>
                <CheckCircle2 size={16} /> راجعته وهو مطابق للكتاب
              </button>
            )}
            {lesson.status === "reviewed" && (
              <button className="btn btn-mint" disabled={busy || quizCount === 0} onClick={() => workflow("publish")} title={quizCount ? "" : "أضف سؤال اختبار أولاً"}>
                نشر للطلاب
              </button>
            )}
            {lesson.status === "published" && (
              <button className="btn btn-outline" disabled={busy} onClick={() => workflow("unpublish")}>
                إلغاء النشر
              </button>
            )}
            {(lesson.status === "reviewed" || lesson.status === "published") && (
              <button className="btn btn-ghost" disabled={busy} onClick={() => workflow("reopen")}>
                إعادة للمراجعة
              </button>
            )}
          </div>
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {checks.map((c) => (
            <li key={c.text} className={`flex items-center gap-1 ${c.ok ? "text-mint-700" : "text-ink-soft"}`}>
              {c.ok ? <CheckCircle2 size={15} /> : <Circle size={15} />} {c.text}
            </li>
          ))}
        </ul>
        <div className="mt-2">
          <ErrorText error={error} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-3">
          <div className="flex gap-1 rounded-2xl bg-white p-1 ring-1 ring-line">
            {(
              [
                ["content", "محتوى الدرس"],
                ["questions", `الأنشطة والأسئلة (${questions.length})`],
              ] as const
            ).map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} className={`flex-1 rounded-xl py-2 font-bold ${tab === k ? "bg-brand-500 text-white" : "text-ink-soft"}`}>
                {label}
              </button>
            ))}
          </div>

          {tab === "content" ? (
            <>
              <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-2 ring-1 ring-line">
                <span className="px-1 text-xs font-bold text-ink-soft">استخراج من الكتاب:</span>
                <button className="btn btn-ghost btn-sm" disabled={!range.length} onClick={addPagePictures}>
                  <ImagePlus size={15} /> صور صفحات الدرس
                </button>
                <button className="btn btn-ghost btn-sm" disabled={!lesson.hasPdf || !range.length || !!tool} onClick={copyPdfText} title={lesson.hasPdf ? "" : "ارفع ملف PDF للكتاب أولاً"}>
                  <FileText size={15} /> {tool === "pdf" ? "جارٍ القراءة…" : "نص ملف PDF"}
                </button>
                <button className="btn btn-ghost btn-sm" disabled={!range.length || !!tool} onClick={aiExtract}>
                  <Sparkles size={15} /> {tool === "ai" ? "جارٍ الاستخراج… (حتى دقيقة)" : "استخراج بالذكاء الاصطناعي"}
                </button>
                <button className="btn btn-primary btn-sm ms-auto" disabled={!dirty || busy} onClick={save}>
                  <Save size={15} /> {dirty ? "حفظ المحتوى" : "محفوظ"}
                </button>
              </div>

              {suggestion && (
                <SuggestionPanel
                  s={suggestion}
                  onClose={() => setSuggestion(null)}
                  onUseBlocks={(mode) => {
                    setBlocks(mode === "replace" ? withKeys(suggestion.blocks) : [...blocks, ...withKeys(suggestion.blocks)]);
                    setSuggestion({ ...suggestion, blocks: [] });
                  }}
                  onAddQuestions={async () => {
                    const r = await run(() =>
                      api(`/api/admin/lessons/${lesson.id}/questions`, { body: { questions: suggestion.questions.map((q) => ({ ...q, points: 1 })) } }),
                    );
                    if (r) setSuggestion({ ...suggestion, questions: [] });
                  }}
                />
              )}

              <BlocksEditor lessonId={lesson.id} blocks={blocks} onChange={setBlocks} />
            </>
          ) : (
            <QuestionsEditor lessonId={lesson.id} questions={questions} />
          )}
        </div>

        <aside className="space-y-2 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
          <p className="text-sm font-bold text-ink-soft">صفحات الكتاب الأصلي للمقارنة</p>
          {range.length === 0 && <p className="card p-4 text-sm text-ink-soft">حدّد صفحات الدرس من صفحة هيكل الكتاب.</p>}
          {range.map((p) =>
            pageImages[p] ? (
              <a key={p} href={pageImages[p]} target="_blank" rel="noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={pageImages[p]} alt={`صفحة ${p}`} className="w-full rounded-xl border border-line bg-white" />
                <span className="block text-center text-xs text-ink-soft">ص {p}</span>
              </a>
            ) : (
              <div key={p} className="card p-4 text-center text-sm text-ink-soft">
                لا توجد صورة للصفحة {p} — ارفع ملف PDF من صفحة الكتاب.
              </div>
            ),
          )}
        </aside>
      </div>
    </div>
  );
}

function SuggestionPanel({
  s,
  onClose,
  onUseBlocks,
  onAddQuestions,
}: {
  s: Suggestion;
  onClose: () => void;
  onUseBlocks: (mode: "replace" | "append") => void;
  onAddQuestions: () => void;
}) {
  return (
    <div className="rounded-2xl border-2 border-sun-300 bg-sun-100/50 p-4" data-testid="ai-suggestion">
      <div className="mb-2 flex items-center justify-between">
        <p className="font-extrabold">نتيجة الاستخراج — راجعها مقابل صفحات الكتاب قبل الحفظ</p>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>
          إغلاق
        </button>
      </div>
      {s.blocks.length > 0 && (
        <>
          <div className="max-h-80 space-y-3 overflow-y-auto rounded-xl bg-white p-3">
            {s.blocks.map((b, i) => (
              <BlockView key={i} block={b} admin />
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <button className="btn btn-primary btn-sm" onClick={() => onUseBlocks("replace")}>
              استبدال المحتوى الحالي
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => onUseBlocks("append")}>
              إضافة في النهاية
            </button>
          </div>
        </>
      )}
      {s.questions.length > 0 && (
        <div className="mt-4">
          <p className="mb-1 font-bold">أسئلة مقترحة ({s.questions.length})</p>
          <ul className="space-y-1 text-sm">
            {s.questions.map((q, i) => (
              <li key={i} className="rounded-lg bg-white p-2">
                <span className="badge me-1 bg-paper text-ink-soft">{q.kind === "quiz" ? "اختبار" : "نشاط"}</span>
                {q.prompt} <span className="text-mint-700">— {answerSummary(q)}</span>
              </li>
            ))}
          </ul>
          <button className="btn btn-primary btn-sm mt-2" onClick={onAddQuestions}>
            إضافة كل الأسئلة
          </button>
        </div>
      )}
    </div>
  );
}
