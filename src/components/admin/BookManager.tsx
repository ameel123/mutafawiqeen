"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, FileUp, ImageIcon, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { api, uploadFile } from "@/lib/client";
import { openPdf, renderPage } from "@/lib/pdf-client";
import { ErrorText, InlineEdit, StatusBadge, useAction, type LessonStatus } from "./ui";

type Lesson = {
  id: number;
  title: string;
  pageStart: number | null;
  pageEnd: number | null;
  status: LessonStatus;
  quizCount: number;
  activityCount: number;
};
type Chapter = { id: number; title: string; lessons: Lesson[] };
type Unit = { id: number; title: string; chapters: Chapter[] };
export type BookData = {
  id: number;
  title: string;
  edition: string | null;
  pageOffset: number;
  pageCount: number | null;
  hasPdf: boolean;
  subjectId: number;
  subjectName: string;
  gradeName: string;
  pages: { page: number; url: string }[];
  units: Unit[];
};

const pad = (n: number) => String(n).padStart(3, "0");

export function BookManager({ book }: { book: BookData }) {
  return (
    <div className="space-y-6">
      <BookInfo book={book} />
      <PdfPanel book={book} />
      <Structure book={book} />
    </div>
  );
}

function BookInfo({ book }: { book: BookData }) {
  const { error, run } = useAction();
  const [offset, setOffset] = useState(book.pageOffset);
  return (
    <section className="card p-5">
      <Link href={`/admin/subjects/${book.subjectId}`} className="text-sm font-bold text-brand-600 hover:underline">
        {book.subjectName} · {book.gradeName}
      </Link>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-extrabold">
          <InlineEdit
            value={book.title}
            label="عنوان الكتاب"
            onSave={(v) => run(() => api("/api/admin/books", { method: "PATCH", body: { id: book.id, title: v } }))}
          />
        </h1>
        <span className="text-ink-soft">
          <InlineEdit
            value={book.edition || "— بلا وصف —"}
            label="الطبعة"
            onSave={(v) => run(() => api("/api/admin/books", { method: "PATCH", body: { id: book.id, edition: v } }))}
          />
        </span>
        <button
          className="btn btn-danger btn-sm ms-auto"
          onClick={async () => {
            if (!confirm(`حذف كتاب «${book.title}» وكل دروسه وأسئلته نهائياً؟`)) return;
            const r = await run(() => api("/api/admin/books", { method: "DELETE", body: { id: book.id } }), { refresh: false });
            if (r) window.location.href = `/admin/subjects/${book.subjectId}`;
          }}
        >
          <Trash2 size={15} /> حذف الكتاب
        </button>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-2 rounded-xl bg-paper p-3 text-sm">
        <div>
          <label className="label" htmlFor="offset">
            فرق ترقيم الصفحات
          </label>
          <input
            id="offset"
            type="number"
            className="input w-24"
            value={offset}
            onChange={(e) => setOffset(Number(e.target.value))}
          />
        </div>
        <button
          className="btn btn-outline btn-sm"
          disabled={offset === book.pageOffset}
          onClick={() => run(() => api("/api/admin/books", { method: "PATCH", body: { id: book.id, pageOffset: offset } }))}
        >
          حفظ
        </button>
        <p className="max-w-xl text-ink-soft">
          أرقام الصفحات في الدروس هي الأرقام المطبوعة في الكتاب. مثلاً: إذا كانت الصفحة المطبوعة رقم 1 هي الصفحة رقم 3 داخل ملف PDF فالفرق = 2.
        </p>
      </div>
      <div className="mt-2">
        <ErrorText error={error} />
      </div>
    </section>
  );
}

function PdfPanel({ book }: { book: BookData }) {
  const { error, setError, run } = useAction();
  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function generate(source: ArrayBuffer | string) {
    setProgress({ label: "فتح الملف…", done: 0, total: 1 });
    const doc = await openPdf(source);
    const total = doc.numPages;
    const stamp = Date.now();
    const done: { page: number; url: string }[] = [];
    let next = 1;
    let count = 0;
    const flush = async (final = false) => {
      if (done.length >= 20 || (final && done.length)) {
        const batch = done.splice(0, done.length);
        await api(`/api/admin/books/${book.id}/pages`, { body: { pages: batch, pageCount: total } });
      }
    };
    const worker = async () => {
      while (next <= total) {
        const n = next++;
        const blob = await renderPage(doc, n);
        const t = await uploadFile(blob, {
          bucket: "media",
          folder: `books/${book.id}/pages`,
          filename: `${pad(n)}.jpg`,
          contentType: "image/jpeg",
        });
        done.push({ page: n, url: `${t.publicUrl}?v=${stamp}` });
        count++;
        setProgress({ label: "توليد صور الصفحات", done: count, total });
        await flush();
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    await flush(true);
    await doc.destroy();
  }

  async function onFile(file: File) {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("اختر ملف PDF");
      return;
    }
    await run(async () => {
      setProgress({ label: "رفع ملف الكتاب", done: 0, total: 1 });
      const t = await uploadFile(file, { bucket: "books", folder: `books/${book.id}`, filename: file.name, contentType: "application/pdf" });
      await api("/api/admin/books", { method: "PATCH", body: { id: book.id, pdfPath: t.path, pdfSize: file.size } });
      await generate(await file.arrayBuffer());
    });
    setProgress(null);
  }

  const pages = showAll ? book.pages : book.pages.slice(0, 12);
  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold">ملف الكتاب وصور الصفحات</h2>
          <p className="text-sm text-ink-soft">
            {book.hasPdf ? "تم رفع ملف PDF الأصلي." : "لم يُرفع ملف PDF بعد."} {book.pages.length} صورة صفحة
            {book.pageCount ? ` من ${book.pageCount}` : ""}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            data-testid="pdf-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
          <button className="btn btn-primary" disabled={!!progress} onClick={() => fileRef.current?.click()}>
            <FileUp size={17} /> {book.hasPdf ? "استبدال ملف PDF" : "رفع ملف PDF"}
          </button>
          {book.hasPdf && (
            <button
              className="btn btn-outline"
              disabled={!!progress}
              onClick={async () => {
                await run(async () => {
                  const { url } = await api<{ url: string }>(`/api/admin/books/${book.id}/pages`);
                  await generate(url);
                });
                setProgress(null);
              }}
            >
              <RefreshCw size={16} /> إعادة توليد الصور
            </button>
          )}
        </div>
      </div>
      {progress && (
        <div className="mt-4" role="status">
          <p className="mb-1 text-sm font-bold">
            {progress.label} {progress.total > 1 ? `${progress.done} / ${progress.total}` : ""}
          </p>
          <div className="h-2.5 overflow-hidden rounded-full bg-line">
            <div className="h-full bg-brand-500 transition-all" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
          </div>
          <p className="mt-1 text-xs text-ink-soft">لا تغلق الصفحة حتى ينتهي التوليد.</p>
        </div>
      )}
      <div className="mt-3">
        <ErrorText error={error} />
      </div>
      {book.pages.length > 0 && (
        <>
          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-8">
            {pages.map((p) => (
              <a key={p.page} href={p.url} target="_blank" rel="noreferrer" className="group block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" loading="lazy" className="aspect-[3/4] w-full rounded-lg border border-line bg-white object-cover object-top" />
                <span className="block text-center text-xs text-ink-soft">
                  ملف {p.page} · مطبوع {p.page - book.pageOffset}
                </span>
              </a>
            ))}
          </div>
          {book.pages.length > 12 && (
            <button className="btn btn-ghost btn-sm mt-2" onClick={() => setShowAll(!showAll)}>
              <ImageIcon size={15} /> {showAll ? "عرض أقل" : `عرض كل الصفحات (${book.pages.length})`}
            </button>
          )}
        </>
      )}
    </section>
  );
}

function Structure({ book }: { book: BookData }) {
  const { busy, error, run } = useAction();
  const [newUnit, setNewUnit] = useState("");
  const S = (body: unknown, method = "POST") => run(() => api("/api/admin/structure", { method, body }));
  let n = 0;

  return (
    <section className="card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-extrabold">هيكل الكتاب: الوحدات والفصول والدروس</h2>
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await S({ kind: "unit", parentId: book.id, title: newUnit })) setNewUnit("");
          }}
        >
          <input className="input !py-1.5" placeholder="عنوان وحدة جديدة" value={newUnit} onChange={(e) => setNewUnit(e.target.value)} required aria-label="عنوان وحدة جديدة" />
          <button className="btn btn-outline btn-sm" disabled={busy}>
            <Plus size={15} /> وحدة
          </button>
        </form>
      </div>
      <ErrorText error={error} />
      {book.units.length === 0 && <p className="py-6 text-center text-ink-soft">أضف أول وحدة كما في فهرس الكتاب.</p>}
      <div className="space-y-4">
        {book.units.map((u) => (
          <div key={u.id} className="rounded-2xl border border-line" data-testid="unit">
            <div className="flex flex-wrap items-center gap-2 bg-brand-50 p-3">
              <span className="text-xs font-bold text-brand-700">وحدة</span>
              <InlineEdit value={u.title} label="عنوان الوحدة" className="font-extrabold" onSave={(v) => S({ kind: "unit", id: u.id, title: v }, "PATCH")} />
              <div className="ms-auto flex gap-1">
                <MoveButtons onMove={(m) => S({ kind: "unit", id: u.id, move: m }, "PATCH")} />
                <button className="btn btn-ghost btn-sm" onClick={() => S({ kind: "chapter", parentId: u.id, title: "فصل جديد" })}>
                  <Plus size={14} /> فصل
                </button>
                <button
                  className="btn btn-ghost btn-sm !p-2 text-coral-700"
                  aria-label="حذف الوحدة"
                  onClick={() => confirm(`حذف الوحدة «${u.title}»؟`) && S({ kind: "unit", id: u.id }, "DELETE")}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            <div className="divide-y divide-line">
              {u.chapters.map((c) => (
                <div key={c.id} className="p-3">
                  {(u.chapters.length > 1 || c.title !== u.title) && (
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-ink-soft">فصل</span>
                      <InlineEdit value={c.title} label="عنوان الفصل" className="font-bold" onSave={(v) => S({ kind: "chapter", id: c.id, title: v }, "PATCH")} />
                      <div className="ms-auto flex gap-1">
                        <MoveButtons onMove={(m) => S({ kind: "chapter", id: c.id, move: m }, "PATCH")} />
                        <button
                          className="btn btn-ghost btn-sm !p-2 text-coral-700"
                          aria-label="حذف الفصل"
                          onClick={() => confirm(`حذف الفصل «${c.title}»؟`) && S({ kind: "chapter", id: c.id }, "DELETE")}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  )}
                  <ul className="space-y-1.5">
                    {c.lessons.map((l) => {
                      n++;
                      return <LessonRow key={l.id} lesson={l} n={n} S={S} />;
                    })}
                  </ul>
                  <NewLesson chapterId={c.id} S={S} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function MoveButtons({ onMove }: { onMove: (m: "up" | "down") => void }) {
  return (
    <>
      <button className="btn btn-ghost btn-sm !p-1.5" aria-label="تحريك للأعلى" onClick={() => onMove("up")}>
        <ArrowUp size={14} />
      </button>
      <button className="btn btn-ghost btn-sm !p-1.5" aria-label="تحريك للأسفل" onClick={() => onMove("down")}>
        <ArrowDown size={14} />
      </button>
    </>
  );
}

type SFn = (body: unknown, method?: string) => Promise<unknown>;

function LessonRow({ lesson: l, n, S }: { lesson: Lesson; n: number; S: SFn }) {
  const [a, setA] = useState(l.pageStart ?? "");
  const [b, setB] = useState(l.pageEnd ?? "");
  const dirty = String(a) !== String(l.pageStart ?? "") || String(b) !== String(l.pageEnd ?? "");
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-xl bg-white px-2 py-1.5 ring-1 ring-line" data-testid="lesson-row">
      <span className="w-7 text-center text-xs font-bold text-ink-soft">{n}</span>
      <InlineEdit value={l.title} label="عنوان الدرس" className="min-w-40 flex-1 font-bold" onSave={(v) => S({ kind: "lesson", id: l.id, title: v }, "PATCH")} />
      <span className="flex items-center gap-1 text-xs text-ink-soft">
        ص
        <input className="input w-16 !px-2 !py-1 text-center" inputMode="numeric" value={a} onChange={(e) => setA(e.target.value)} aria-label="صفحة البداية" />–
        <input className="input w-16 !px-2 !py-1 text-center" inputMode="numeric" value={b} onChange={(e) => setB(e.target.value)} aria-label="صفحة النهاية" />
        {dirty && (
          <button
            className="btn btn-outline btn-sm !px-2 !py-1"
            onClick={() => S({ kind: "lesson", id: l.id, pageStart: a === "" ? null : Number(a), pageEnd: b === "" ? null : Number(b) }, "PATCH")}
          >
            حفظ
          </button>
        )}
      </span>
      <StatusBadge status={l.status} />
      <span className="text-xs text-ink-soft">
        {l.activityCount} نشاط · {l.quizCount} سؤال
      </span>
      <MoveButtons onMove={(m) => S({ kind: "lesson", id: l.id, move: m }, "PATCH")} />
      <Link href={`/admin/lessons/${l.id}`} className="btn btn-primary btn-sm">
        <Pencil size={14} /> المحتوى
      </Link>
      {l.status !== "published" && (
        <button
          className="btn btn-ghost btn-sm !p-1.5 text-coral-700"
          aria-label="حذف الدرس"
          onClick={() => confirm(`حذف درس «${l.title}» وأسئلته؟`) && S({ kind: "lesson", id: l.id }, "DELETE")}
        >
          <Trash2 size={14} />
        </button>
      )}
    </li>
  );
}

function NewLesson({ chapterId, S }: { chapterId: number; S: SFn }) {
  const [title, setTitle] = useState("");
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  return (
    <form
      className="mt-2 flex flex-wrap items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await S({ kind: "lesson", parentId: chapterId, title, pageStart: a ? Number(a) : null, pageEnd: b ? Number(b) : null });
        if (r) {
          setTitle("");
          setA(b ? String(Number(b) + 1) : "");
          setB("");
        }
      }}
    >
      <input className="input min-w-40 flex-1 !py-1.5" placeholder="عنوان درس جديد" value={title} onChange={(e) => setTitle(e.target.value)} required aria-label="عنوان درس جديد" />
      <input className="input w-20 !py-1.5 text-center" placeholder="من ص" inputMode="numeric" value={a} onChange={(e) => setA(e.target.value)} aria-label="من صفحة" />
      <input className="input w-20 !py-1.5 text-center" placeholder="إلى ص" inputMode="numeric" value={b} onChange={(e) => setB(e.target.value)} aria-label="إلى صفحة" />
      <button className="btn btn-outline btn-sm">
        <Plus size={14} /> درس
      </button>
    </form>
  );
}
