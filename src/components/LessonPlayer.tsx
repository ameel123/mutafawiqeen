"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Pause, Play, Square, Turtle, X } from "lucide-react";
import { speakableText, type Block } from "@/lib/blocks";
import type { PublicQuestion } from "@/lib/questions";
import { api } from "@/lib/client";
import { BlockView } from "./BlockView";
import { Activities } from "./Activities";
import { ProgressBar } from "./Stars";
import { useTeacherVoice } from "./useTeacherVoice";

type Props = {
  lesson: { id: number; title: string; subjectId: number; subjectName: string; subjectIcon: string; chapterTitle: string };
  steps: Block[][];
  pages: { page: number; url: string }[];
  activities: PublicQuestion[];
  quizCount: number;
  initialStep: number;
  completed: boolean;
  next: { id: number; title: string } | null;
  prev: { id: number; title: string } | null;
  /** Admin preview: nothing is saved, activities are checked by the admin API. */
  preview?: boolean;
};

export function LessonPlayer({ lesson, steps, pages, activities, quizCount, initialStep, completed, next, prev, preview = false }: Props) {
  const total = steps.length + 1; // last screen = activities and quiz
  const [step, setStep] = useState(Math.min(initialStep, total - 1));
  const [showPages, setShowPages] = useState(false);
  const [autoRead, setAutoRead] = useState(false);
  const voice = useTeacherVoice();
  const topRef = useRef<HTMLDivElement>(null);
  const isEnd = step >= steps.length;
  const blocks = isEnd ? [] : steps[step];

  const readStep = useCallback(
    (s: number) => {
      const b = steps[s];
      if (!b) return;
      voice.speakSequence(b.map(speakableText));
    },
    [steps, voice],
  );

  // Save where the student stopped; reaching the last screen marks the lesson as studied.
  useEffect(() => {
    if (preview) return;
    const t = setTimeout(() => {
      api("/api/student/progress", { body: { lessonId: lesson.id, step, completed: step >= steps.length } }).catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, [lesson.id, step, steps.length, preview]);

  const go = (s: number) => {
    voice.stop();
    setStep(s);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (autoRead && s < steps.length) setTimeout(() => readStep(s), 350);
  };

  return (
    <div ref={topRef} className="scroll-mt-24 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={preview ? `/admin/lessons/${lesson.id}` : `/student/subjects/${lesson.subjectId}`}
            className="text-sm font-bold text-brand-600 hover:underline"
          >
            {lesson.subjectIcon} {lesson.subjectName} · {lesson.chapterTitle}
          </Link>
          <h1 className="mt-0.5 text-2xl font-extrabold">{lesson.title}</h1>
        </div>
        {pages.length > 0 && (
          <button className="btn btn-outline btn-sm" onClick={() => setShowPages(true)}>
            <BookOpen size={16} /> صفحة الكتاب
          </button>
        )}
      </div>

      <ProgressBar value={((step + 1) / total) * 100} />

      {/* Teacher voice */}
      {!isEnd && (
        <div className="card flex flex-wrap items-center gap-3 p-3">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-sun-100 text-2xl" aria-hidden>
            👩‍🏫
          </span>
          <div className="me-auto">
            <p className="font-extrabold">المعلمة</p>
            <p className="text-xs text-ink-soft">
              {!voice.supported
                ? "المتصفح لا يدعم القراءة الصوتية"
                : !voice.hasArabic
                  ? "لا يوجد صوت عربي في هذا الجهاز؛ قد تُقرأ الكلمات بلكنة أجنبية"
                  : voice.state === "speaking"
                    ? "أستمع الآن…"
                    : "اضغط لتسمع شرح هذه الصفحة"}
            </p>
          </div>
          {voice.supported && (
            <div className="flex items-center gap-2">
              {voice.state === "speaking" ? (
                <button className="btn btn-sun" onClick={voice.pause} aria-label="إيقاف مؤقت">
                  <Pause size={18} /> إيقاف
                </button>
              ) : voice.state === "paused" ? (
                <button className="btn btn-sun" onClick={voice.resume}>
                  <Play size={18} /> متابعة
                </button>
              ) : (
                <button
                  className="btn btn-sun"
                  onClick={() => {
                    setAutoRead(true);
                    readStep(step);
                  }}
                >
                  <Play size={18} /> استمع
                </button>
              )}
              {voice.state !== "idle" && (
                <button className="btn btn-outline btn-sm !p-2.5" onClick={voice.stop} aria-label="إيقاف">
                  <Square size={16} />
                </button>
              )}
              <button
                className={`btn btn-sm !p-2.5 ${voice.slow ? "bg-mint-100 text-mint-700" : "btn-outline"}`}
                onClick={() => voice.setSlow(!voice.slow)}
                aria-pressed={voice.slow}
                title="قراءة بطيئة"
                aria-label="قراءة بطيئة"
              >
                <Turtle size={18} />
              </button>
            </div>
          )}
        </div>
      )}

      {!isEnd ? (
        <div key={step} className="card animate-rise space-y-5 p-5 sm:p-7" data-testid="lesson-step">
          {blocks.map((b, k) => (
            <div
              key={k}
              onClick={() => voice.supported && speakableText(b) && voice.speakSequence(blocks.map(speakableText), k)}
              className={speakableText(b) ? "cursor-pointer" : ""}
            >
              <BlockView block={b} active={voice.current === k && voice.state !== "idle"} />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="card animate-rise p-6 text-center">
            <p className="text-4xl" aria-hidden>
              🎉
            </p>
            <h2 className="mt-2 text-2xl font-extrabold">أحسنت! أنهيت شرح الدرس</h2>
            <p className="mt-1 text-ink-soft">
              {activities.length ? "حلّ الأنشطة التالية ثم اختبر نفسك." : quizCount ? "اختبر نفسك الآن." : ""}
            </p>
            {completed && <p className="mt-2 text-sm font-bold text-mint-700">✓ درستَ هذا الدرس من قبل</p>}
          </div>
          {activities.length > 0 && (
            <section>
              <h2 className="mb-3 text-xl font-extrabold">أنشطة الدرس</h2>
              <Activities items={activities} onSpeak={voice.supported ? voice.speak : undefined} checkUrl={preview ? "/api/admin/check" : undefined} />
            </section>
          )}
          <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
            {quizCount > 0 ? (
              <>
                <div>
                  <p className="font-extrabold">اختبار الدرس</p>
                  <p className="text-sm text-ink-soft">{quizCount} سؤال</p>
                </div>
                {preview ? (
                  <span className="badge bg-paper text-ink-soft">الاختبار متاح للطلاب بعد النشر</span>
                ) : (
                  <Link href={`/student/quiz/lesson/${lesson.id}`} className="btn btn-primary px-6">
                    ابدأ الاختبار
                  </Link>
                )}
              </>
            ) : (
              <p className="text-ink-soft">لا يوجد اختبار لهذا الدرس بعد.</p>
            )}
          </div>
          {next && !preview && (
            <Link href={`/student/lessons/${next.id}`} className="card flex items-center justify-between p-4 hover:border-brand-200">
              <span>
                <span className="block text-sm text-ink-soft">الدرس التالي</span>
                <span className="font-extrabold">{next.title}</span>
              </span>
              <ArrowLeft className="text-brand-500" />
            </Link>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pb-6">
        {step > 0 ? (
          <button className="btn btn-outline" onClick={() => go(step - 1)}>
            <ArrowRight size={18} /> السابق
          </button>
        ) : prev && !preview ? (
          <Link href={`/student/lessons/${prev.id}`} className="btn btn-ghost">
            <ArrowRight size={18} /> الدرس السابق
          </Link>
        ) : (
          <span />
        )}
        <span className="text-sm font-bold text-ink-soft">
          {step + 1} / {total}
        </span>
        {!isEnd ? (
          <button className="btn btn-primary" onClick={() => go(step + 1)}>
            التالي <ArrowLeft size={18} />
          </button>
        ) : (
          <span />
        )}
      </div>

      {showPages && (
        <div className="fixed inset-0 z-50 flex justify-end bg-ink/50" onClick={() => setShowPages(false)} role="dialog" aria-label="صفحة الكتاب">
          <div className="h-full w-full max-w-2xl overflow-y-auto bg-paper p-4" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 z-10 mb-3 flex items-center justify-between bg-paper py-2">
              <h2 className="text-lg font-extrabold">من كتاب {lesson.subjectName}</h2>
              <button className="btn btn-outline btn-sm" onClick={() => setShowPages(false)} aria-label="إغلاق">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-4">
              {pages.map((p) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={p.page} src={p.url} alt="صفحة من الكتاب" className="w-full rounded-xl border border-line bg-white" loading="lazy" />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
