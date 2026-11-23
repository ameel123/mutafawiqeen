"use client";

import { useState } from "react";
import { Check, RotateCcw, Volume2, X } from "lucide-react";
import type { PublicQuestion } from "@/lib/questions";

type Props = {
  q: PublicQuestion;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
  onSpeak?: (text: string) => void;
};

const PAIR_COLORS = [
  "bg-brand-500 text-white",
  "bg-sun-300 text-ink",
  "bg-mint-500 text-white",
  "bg-coral-500 text-white",
  "bg-sky-500 text-white",
  "bg-fuchsia-500 text-white",
];

const choice =
  "w-full rounded-2xl border-2 px-4 py-3.5 text-start text-lg font-bold transition disabled:cursor-default book-text !leading-[1.8]";

export function QuestionPrompt({ q, onSpeak }: { q: PublicQuestion; onSpeak?: (t: string) => void }) {
  return (
    <div className="flex items-start gap-2">
      <p className="book-text flex-1 font-semibold text-ink">{q.prompt}</p>
      {onSpeak && (
        <button
          type="button"
          className="btn btn-outline btn-sm shrink-0 !rounded-full !p-2"
          onClick={() => onSpeak(q.prompt)}
          aria-label="اقرأ السؤال"
        >
          <Volume2 size={18} />
        </button>
      )}
    </div>
  );
}

export function QuestionInput({ q, value, onChange, disabled }: Props) {
  if (q.type === "mcq") {
    const opts = q.options as string[];
    return (
      <div className="grid gap-2.5 sm:grid-cols-2">
        {opts.map((o, i) => {
          const sel = value === i;
          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => onChange(i)}
              aria-pressed={sel}
              className={`${choice} ${sel ? "border-brand-500 bg-brand-50 text-brand-900" : "border-line bg-white hover:border-brand-200"}`}
            >
              {o}
            </button>
          );
        })}
      </div>
    );
  }

  if (q.type === "true_false") {
    return (
      <div className="grid grid-cols-2 gap-3">
        {[
          [true, "صح", Check, "border-mint-500 bg-mint-100 text-mint-700"],
          [false, "خطأ", X, "border-coral-500 bg-coral-100 text-coral-700"],
        ].map(([v, label, Icon, on]) => {
          const sel = value === v;
          const I = Icon as typeof Check;
          return (
            <button
              key={String(v)}
              type="button"
              disabled={disabled}
              aria-pressed={sel}
              onClick={() => onChange(v)}
              className={`flex items-center justify-center gap-2 rounded-2xl border-2 py-5 text-xl font-extrabold transition ${
                sel ? (on as string) : "border-line bg-white hover:border-brand-200"
              }`}
            >
              <I size={24} />
              {label as string}
            </button>
          );
        })}
      </div>
    );
  }

  if (q.type === "fill_blank") {
    return (
      <input
        className="input book-text !py-3 !text-xl"
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="اكتب الإجابة هنا"
        aria-label="الإجابة"
      />
    );
  }

  if (q.type === "ordering") {
    const items = q.options as string[];
    const chosen = Array.isArray(value) ? (value as string[]) : [];
    const pool = items.filter((it) => !chosen.includes(it));
    return (
      <div className="space-y-3">
        <div className="min-h-[64px] rounded-2xl border-2 border-dashed border-brand-200 bg-brand-50/60 p-2.5">
          {chosen.length === 0 ? (
            <p className="p-2 text-center text-sm text-ink-soft">اضغط على العناصر بالترتيب الصحيح</p>
          ) : (
            <ol className="flex flex-wrap gap-2">
              {chosen.map((it, i) => (
                <li key={it}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange(chosen.filter((x) => x !== it))}
                    className="book-text flex items-center gap-2 rounded-xl bg-brand-500 px-3 py-1.5 text-lg font-bold text-white"
                  >
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-white/25 text-sm">{i + 1}</span>
                    {it}
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {pool.map((it) => (
            <button
              key={it}
              type="button"
              disabled={disabled}
              onClick={() => onChange([...chosen, it])}
              className="book-text rounded-xl border-2 border-line bg-white px-3 py-1.5 text-lg font-bold hover:border-brand-200"
            >
              {it}
            </button>
          ))}
          {chosen.length > 0 && !disabled && (
            <button type="button" onClick={() => onChange([])} className="btn btn-ghost btn-sm">
              <RotateCcw size={15} /> إعادة
            </button>
          )}
        </div>
      </div>
    );
  }

  // matching: value = rights aligned with lefts ("" = not paired yet); pending left kept in a data attribute via state
  const { lefts, rights } = q.options as { lefts: string[]; rights: string[] };
  const pairs = Array.isArray(value) ? (value as string[]) : lefts.map(() => "");
  return <Matching lefts={lefts} rights={rights} pairs={pairs} onChange={onChange} disabled={disabled} />;
}


function Matching({
  lefts,
  rights,
  pairs,
  onChange,
  disabled,
}: {
  lefts: string[];
  rights: string[];
  pairs: string[];
  onChange: (v: unknown) => void;
  disabled?: boolean;
}) {
  const [active, setActive] = useState<number | null>(null);
  const colorOfLeft = (i: number) => PAIR_COLORS[i % PAIR_COLORS.length];
  const leftOfRight = (r: string) => pairs.findIndex((p) => p === r);

  return (
    <div>
      <p className="mb-2 text-sm text-ink-soft">اختر من العمود الأول ثم ما يناسبه من العمود الثاني</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          {lefts.map((l, i) => {
            const paired = !!pairs[i];
            return (
              <button
                key={i}
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (paired) {
                    const next = [...pairs];
                    next[i] = "";
                    onChange(next);
                    setActive(i);
                  } else setActive(active === i ? null : i);
                }}
                className={`book-text flex w-full items-center gap-2 rounded-xl border-2 px-3 py-2 text-start text-lg font-bold transition ${
                  active === i ? "border-brand-500 ring-4 ring-brand-100" : paired ? "border-transparent" : "border-line"
                } bg-white`}
              >
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm ${paired || active === i ? colorOfLeft(i) : "bg-line"}`}>
                  {i + 1}
                </span>
                {l}
              </button>
            );
          })}
        </div>
        <div className="space-y-2">
          {rights.map((r) => {
            const li = leftOfRight(r);
            return (
              <button
                key={r}
                type="button"
                disabled={disabled}
                onClick={() => {
                  const next = [...pairs];
                  if (li >= 0) {
                    next[li] = "";
                    onChange(next);
                    return;
                  }
                  const target = active ?? pairs.findIndex((p) => !p);
                  if (target < 0) return;
                  next[target] = r;
                  onChange(next);
                  setActive(null);
                }}
                className={`book-text flex w-full items-center gap-2 rounded-xl border-2 px-3 py-2 text-start text-lg font-bold transition ${
                  li >= 0 ? "border-transparent bg-white" : "border-line bg-white hover:border-brand-200"
                }`}
              >
                {li >= 0 && (
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm ${colorOfLeft(li)}`}>{li + 1}</span>
                )}
                {r}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
