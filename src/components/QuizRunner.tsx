"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import { api } from "@/lib/client";
import { isAnswered, type PublicQuestion } from "@/lib/questions";
import { QuestionInput, QuestionPrompt } from "./QuestionInput";
import { ProgressBar, Stars } from "./Stars";
import { useTeacherVoice } from "./useTeacherVoice";

type Quiz = {
  scope: string;
  scopeId: number;
  title: string;
  label: string;
  subjectId: number;
  subjectName: string;
  questions: PublicQuestion[];
};
type Result = {
  attemptId: number;
  percent: number;
  earnedPoints: number;
  totalPoints: number;
  rating: string;
  stars: number;
  message: string;
  review: { questionId: number; prompt: string; correct: boolean; correctAnswer: string; explanation: string | null }[];
};

export function QuizRunner({ scope, id, backHref }: { scope: string; id: number; backHref: string }) {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Record<number, unknown>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [round, setRound] = useState(0);
  const voice = useTeacherVoice();

  useEffect(() => {
    let alive = true;
    setQuiz(null);
    setErr(null);
    api<Quiz>(`/api/student/quiz?scope=${scope}&id=${id}`)
      .then((q) => alive && setQuiz(q))
      .catch((e) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
  }, [scope, id, round]);

  if (err)
    return (
      <div className="card p-8 text-center">
        <p className="text-lg font-bold">{err}</p>
        <Link href={backHref} className="btn btn-outline mt-5">
          رجوع
        </Link>
      </div>
    );
  if (!quiz) return <div className="card animate-pulse p-10 text-center text-ink-soft">جارٍ تحضير الأسئلة…</div>;

  if (result) {
    return (
      <div className="space-y-5">
        <div className="card animate-rise p-6 text-center sm:p-8">
          <Stars n={result.stars} size={52} />
          <p className="mt-4 text-5xl font-extrabold text-brand-700">{result.percent}%</p>
          <p className="mt-2 text-2xl font-extrabold">{result.rating}</p>
          <p className="mt-1 text-ink-soft">{result.message}</p>
          <p className="mt-3 text-sm text-ink-soft">
            {result.earnedPoints} من {result.totalPoints} درجة
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              className="btn btn-primary"
              onClick={() => {
                setResult(null);
                setAnswers({});
                setI(0);
                setRound((r) => r + 1);
              }}
            >
              <RotateCcw size={18} /> أعد المحاولة
            </button>
            <Link href={backHref} className="btn btn-outline">
              رجوع
            </Link>
          </div>
        </div>
        <h2 className="text-xl font-extrabold">مراجعة الإجابات</h2>
        <ul className="space-y-3">
          {result.review.map((r, k) => (
            <li key={r.questionId} className="card flex gap-3 p-4" data-testid="review-item">
              {r.correct ? <CheckCircle2 className="mt-1 shrink-0 text-mint-500" /> : <XCircle className="mt-1 shrink-0 text-coral-500" />}
              <div>
                <p className="font-bold">
                  {k + 1}. {r.prompt}
                </p>
                {!r.correct && <p className="mt-1 text-mint-700">الإجابة الصحيحة: {r.correctAnswer}</p>}
                {r.explanation && <p className="mt-1 text-sm text-ink-soft">{r.explanation}</p>}
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const q = quiz.questions[i];
  const answeredCount = quiz.questions.filter((x) => isAnswered(x, answers[x.id])).length;
  const allAnswered = answeredCount === quiz.questions.length;
  const last = i === quiz.questions.length - 1;

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-ink-soft">{quiz.label}</p>
            <h1 className="text-lg font-extrabold">{quiz.title}</h1>
          </div>
          <span className="badge bg-brand-50 text-brand-700">
            {i + 1} / {quiz.questions.length}
          </span>
        </div>
        <ProgressBar value={(answeredCount / quiz.questions.length) * 100} className="mt-3" />
      </div>

      <div key={q.id} className="card animate-rise p-5 sm:p-6" data-testid="quiz-question">
        <QuestionPrompt q={q} onSpeak={voice.supported ? (t) => voice.speak(t) : undefined} />
        <div className="mt-4">
          <QuestionInput q={q} value={answers[q.id]} onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <button className="btn btn-outline" disabled={i === 0} onClick={() => setI(i - 1)}>
          <ArrowRight size={18} /> السابق
        </button>
        {last ? (
          <button
            className="btn btn-mint px-6"
            disabled={!allAnswered || busy}
            onClick={async () => {
              setBusy(true);
              voice.stop();
              try {
                const r = await api<Result>("/api/student/quiz/submit", {
                  body: {
                    scope: quiz.scope,
                    scopeId: quiz.scopeId,
                    answers: quiz.questions.map((x) => ({ questionId: x.id, answer: answers[x.id] ?? null })),
                  },
                });
                setResult(r);
                window.scrollTo({ top: 0, behavior: "smooth" });
              } catch (e) {
                setErr((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "جارٍ التصحيح…" : allAnswered ? "أنهِ الاختبار" : `أجب عن كل الأسئلة (${answeredCount}/${quiz.questions.length})`}
          </button>
        ) : (
          <button className="btn btn-primary" onClick={() => setI(i + 1)}>
            التالي <ArrowLeft size={18} />
          </button>
        )}
      </div>

      <div className="flex flex-wrap justify-center gap-1.5" aria-label="الأسئلة">
        {quiz.questions.map((x, k) => (
          <button
            key={x.id}
            onClick={() => setI(k)}
            aria-label={`السؤال ${k + 1}`}
            className={`h-3 w-3 rounded-full transition ${k === i ? "scale-125 bg-brand-500" : isAnswered(x, answers[x.id]) ? "bg-mint-500" : "bg-line"}`}
          />
        ))}
      </div>
    </div>
  );
}
