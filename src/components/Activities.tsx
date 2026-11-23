"use client";

import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { api } from "@/lib/client";
import { isAnswered, type PublicQuestion } from "@/lib/questions";
import { QuestionInput, QuestionPrompt } from "./QuestionInput";

type Feedback = { correct: boolean; correctAnswer: string; explanation: string | null };

/** Lesson practice: each activity is checked right away, with a hint of the right answer. */
export function Activities({
  items,
  onSpeak,
  checkUrl = "/api/student/check",
}: {
  items: PublicQuestion[];
  onSpeak?: (t: string) => void;
  checkUrl?: string;
}) {
  return (
    <div className="space-y-4">
      {items.map((q, i) => (
        <ActivityCard key={q.id} q={q} index={i} onSpeak={onSpeak} checkUrl={checkUrl} />
      ))}
    </div>
  );
}

function ActivityCard({
  q,
  index,
  onSpeak,
  checkUrl,
}: {
  q: PublicQuestion;
  index: number;
  onSpeak?: (t: string) => void;
  checkUrl: string;
}) {
  const [value, setValue] = useState<unknown>(undefined);
  const [fb, setFb] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const reveal = !!fb && !fb.correct && tries >= 2;

  return (
    <div className="card p-4 sm:p-5" data-testid="activity">
      <div className="mb-3 flex items-center gap-2">
        <span className="badge bg-sun-100 text-ink">نشاط {index + 1}</span>
      </div>
      <QuestionPrompt q={q} onSpeak={onSpeak} />
      <div className="mt-3">
        <QuestionInput
          q={q}
          value={value}
          onChange={(v) => {
            setValue(v);
            if (fb && !fb.correct) setFb(null);
          }}
          disabled={!!fb?.correct}
        />
      </div>
      {fb ? (
        <div
          className={`animate-rise mt-4 flex gap-3 rounded-2xl p-3.5 ${fb.correct ? "bg-mint-100 text-mint-700" : "bg-coral-100 text-coral-700"}`}
          role="status"
        >
          {fb.correct ? <CheckCircle2 className="shrink-0" /> : <XCircle className="shrink-0" />}
          <div className="space-y-1 font-bold">
            <p>{fb.correct ? "أحسنت! إجابة صحيحة 🎉" : reveal ? "لا بأس، تعلّم الإجابة الصحيحة:" : "ليست صحيحة، حاول مرة أخرى 💪"}</p>
            {reveal && <p className="font-medium text-ink">الإجابة الصحيحة: {fb.correctAnswer}</p>}
            {(fb.correct || reveal) && fb.explanation && <p className="font-medium text-ink">{fb.explanation}</p>}
          </div>
        </div>
      ) : (
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            className="btn btn-sun"
            disabled={busy || !isAnswered(q, value)}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              try {
                setFb(await api<Feedback>(checkUrl, { body: { questionId: q.id, answer: value } }));
                setTries((t) => t + 1);
              } catch (e) {
                setErr((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            تحقق من إجابتي
          </button>
          {err && <span className="text-sm font-bold text-coral-700">{err}</span>}
        </div>
      )}
    </div>
  );
}
