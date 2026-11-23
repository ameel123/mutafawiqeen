"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

export type LessonStatus = "draft" | "extracted" | "reviewed" | "published";

export const STATUS: Record<LessonStatus, { label: string; cls: string }> = {
  draft: { label: "مسودة", cls: "bg-line text-ink-soft" },
  extracted: { label: "بانتظار المراجعة", cls: "bg-sun-100 text-ink" },
  reviewed: { label: "تمت المراجعة", cls: "bg-brand-50 text-brand-700" },
  published: { label: "منشور", cls: "bg-mint-100 text-mint-700" },
};

export function StatusBadge({ status }: { status: LessonStatus }) {
  const s = STATUS[status];
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}

/** Runs a mutation, keeps busy/error state, and refreshes server data afterwards. */
export function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    async <T,>(fn: () => Promise<T>, opts?: { refresh?: boolean }): Promise<T | undefined> => {
      setBusy(true);
      setError(null);
      try {
        const r = await fn();
        if (opts?.refresh !== false) router.refresh();
        return r;
      } catch (e) {
        setError((e as Error).message);
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [router],
  );
  return { busy, error, setError, run };
}

export function ErrorText({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-lg bg-coral-100 px-3 py-2 text-sm font-bold text-coral-700">
      {error}
    </p>
  );
}

/** Text that turns into an input on click; saves on Enter/blur. */
export function InlineEdit({
  value,
  onSave,
  className = "",
  inputClassName = "",
  label,
}: {
  value: string;
  onSave: (v: string) => Promise<unknown>;
  className?: string;
  inputClassName?: string;
  label: string;
}) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);
  if (!editing)
    return (
      <button
        type="button"
        className={`rounded px-1 text-start hover:bg-brand-50 ${className}`}
        onClick={() => {
          setV(value);
          setEditing(true);
        }}
        title="اضغط للتعديل"
        aria-label={`تعديل ${label}`}
      >
        {value}
      </button>
    );
  const save = async () => {
    setEditing(false);
    if (v.trim() && v.trim() !== value) await onSave(v.trim());
  };
  return (
    <input
      autoFocus
      aria-label={label}
      className={`input !py-1 ${inputClassName}`}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") save();
        if (e.key === "Escape") setEditing(false);
      }}
    />
  );
}
