"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Film, Heading, ImageIcon, Lightbulb, List, PenLine, Pilcrow, Trash2, Upload } from "lucide-react";
import { BLOCK_LABEL, type Block, type BlockType } from "@/lib/blocks";
import { uploadFile } from "@/lib/client";
import { BlockView } from "../BlockView";

export type EditableBlock = Block & { _k: string };

let seq = 0;
export const withKeys = (blocks: Block[]): EditableBlock[] => blocks.map((b) => ({ ...b, _k: `b${++seq}` }));
export const stripKeys = (blocks: EditableBlock[]): Block[] => blocks.map(({ _k, ...b }) => b as Block);

const ADD: { type: BlockType; icon: typeof Heading }[] = [
  { type: "heading", icon: Heading },
  { type: "paragraph", icon: Pilcrow },
  { type: "keypoint", icon: Lightbulb },
  { type: "example", icon: PenLine },
  { type: "list", icon: List },
  { type: "image", icon: ImageIcon },
  { type: "video", icon: Film },
];

function blank(type: BlockType): Block | null {
  switch (type) {
    case "heading":
    case "paragraph":
    case "keypoint":
      return { type, text: "" };
    case "example":
      return { type, text: "", title: "" };
    case "list":
      return { type, items: [""], ordered: false };
    default:
      return null;
  }
}

export function BlocksEditor({
  lessonId,
  blocks,
  onChange,
}: {
  lessonId: number;
  blocks: EditableBlock[];
  onChange: (b: EditableBlock[]) => void;
}) {
  const [uploading, setUploading] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pending = useRef<{ kind: "image" | "video"; replace?: string } | null>(null);

  const update = (k: string, patch: Partial<Block>) =>
    onChange(blocks.map((b) => (b._k === k ? ({ ...b, ...patch } as EditableBlock) : b)));
  const remove = (k: string) => onChange(blocks.filter((b) => b._k !== k));
  const move = (k: string, d: -1 | 1) => {
    const i = blocks.findIndex((b) => b._k === k);
    const j = i + d;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  const pick = (kind: "image" | "video", replace?: string) => {
    pending.current = { kind, replace };
    if (fileRef.current) {
      fileRef.current.accept = kind === "image" ? "image/jpeg,image/png,image/webp,image/gif" : "video/mp4,video/webm";
      fileRef.current.click();
    }
  };

  async function onFile(file: File) {
    const p = pending.current;
    if (!p) return;
    const limit = p.kind === "video" ? 200 : 15;
    if (file.size > limit * 1024 * 1024) return setErr(`الملف أكبر من ${limit} ميغابايت`);
    setErr(null);
    setUploading(p.kind === "video" ? "جارٍ رفع الفيديو…" : "جارٍ رفع الصورة…");
    try {
      const t = await uploadFile(file, { bucket: "media", folder: `lessons/${lessonId}`, filename: file.name, contentType: file.type });
      const url = t.publicUrl!;
      if (p.replace) {
        const cur = blocks.find((b) => b._k === p.replace);
        if (cur?.type === "figure") {
          onChange(blocks.map((b) => (b._k === p.replace ? ({ type: "image", url, _k: b._k } as EditableBlock) : b)));
        } else update(p.replace, { url } as Partial<Block>);
      } else {
        onChange([...blocks, { type: p.kind, url, _k: `b${++seq}` } as EditableBlock]);
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setUploading(null);
    }
  }

  return (
    <div className="space-y-3">
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        data-testid="media-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      {blocks.length === 0 && (
        <p className="rounded-xl border-2 border-dashed border-line p-6 text-center text-ink-soft">
          لا يوجد محتوى بعد. استخرج المحتوى من صفحات الكتاب أو أضف الكتل يدوياً.
        </p>
      )}
      {blocks.map((b, i) => (
        <div key={b._k} className="rounded-2xl border border-line bg-white p-3" data-testid="block">
          <div className="mb-2 flex items-center gap-1">
            <span className="badge bg-paper text-ink-soft">
              {i + 1}. {BLOCK_LABEL[b.type]}
            </span>
            <div className="ms-auto flex">
              <button className="btn btn-ghost btn-sm !p-1.5" onClick={() => move(b._k, -1)} aria-label="للأعلى">
                <ArrowUp size={14} />
              </button>
              <button className="btn btn-ghost btn-sm !p-1.5" onClick={() => move(b._k, 1)} aria-label="للأسفل">
                <ArrowDown size={14} />
              </button>
              <button className="btn btn-ghost btn-sm !p-1.5 text-coral-700" onClick={() => remove(b._k)} aria-label="حذف الكتلة">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
          <BlockFields b={b} update={(p) => update(b._k, p)} onPick={(kind) => pick(kind, b._k)} />
        </div>
      ))}

      <div className="sticky bottom-2 z-10 rounded-2xl border border-line bg-white/95 p-2 shadow-lg backdrop-blur">
        <div className="flex flex-wrap items-center gap-1">
          <span className="px-1 text-xs font-bold text-ink-soft">إضافة:</span>
          {ADD.map((a) => (
            <button
              key={a.type}
              className="btn btn-ghost btn-sm"
              disabled={!!uploading}
              onClick={() => {
                if (a.type === "image" || a.type === "video") return pick(a.type);
                const nb = blank(a.type);
                if (nb) onChange([...blocks, { ...nb, _k: `b${++seq}` } as EditableBlock]);
              }}
            >
              <a.icon size={15} /> {BLOCK_LABEL[a.type]}
            </button>
          ))}
        </div>
        {uploading && <p className="px-2 text-sm font-bold text-brand-700">{uploading}</p>}
        {err && <p className="px-2 text-sm font-bold text-coral-700">{err}</p>}
      </div>
    </div>
  );
}

function BlockFields({ b, update, onPick }: { b: EditableBlock; update: (p: Partial<Block>) => void; onPick: (k: "image" | "video") => void }) {
  const area = "input book-text !text-lg !leading-loose";
  switch (b.type) {
    case "heading":
      return <input className="input !text-lg font-bold" value={b.text} onChange={(e) => update({ text: e.target.value })} placeholder="العنوان" aria-label="العنوان" />;
    case "paragraph":
    case "keypoint":
      return (
        <textarea
          className={area}
          rows={Math.min(10, Math.max(2, b.text.split("\n").length + 1))}
          value={b.text}
          onChange={(e) => update({ text: e.target.value })}
          aria-label={BLOCK_LABEL[b.type]}
        />
      );
    case "example":
      return (
        <div className="space-y-2">
          <input className="input" value={b.title ?? ""} onChange={(e) => update({ title: e.target.value })} placeholder="عنوان المثال (اختياري)" aria-label="عنوان المثال" />
          <textarea className={area} rows={Math.max(2, b.text.split("\n").length + 1)} value={b.text} onChange={(e) => update({ text: e.target.value })} aria-label="نص المثال" />
        </div>
      );
    case "list":
      return (
        <div className="space-y-2">
          <textarea
            className={area}
            rows={Math.max(3, b.items.length + 1)}
            value={b.items.join("\n")}
            onChange={(e) => update({ items: e.target.value.split("\n") })}
            aria-label="عناصر القائمة (كل عنصر في سطر)"
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!b.ordered} onChange={(e) => update({ ordered: e.target.checked })} /> قائمة مرقمة
          </label>
        </div>
      );
    case "image":
    case "video":
      return (
        <div className="space-y-2">
          <div className="max-w-md">
            <BlockView block={b} admin />
          </div>
          <div className="flex flex-wrap gap-2">
            <input className="input flex-1" value={b.caption ?? ""} onChange={(e) => update({ caption: e.target.value })} placeholder="تعليق تحت الصورة (اختياري)" aria-label="التعليق" />
            <button className="btn btn-outline btn-sm" onClick={() => onPick(b.type as "image" | "video")}>
              <Upload size={14} /> استبدال
            </button>
          </div>
        </div>
      );
    case "figure":
      return (
        <div className="space-y-2">
          <p className="text-sm text-ink-soft">
            صورة من الكتاب: تظهر للطالب صورة الصفحة المحددة كاملة. يمكنك رفع صورة مقصوصة بدلاً منها.
          </p>
          <div className="flex flex-wrap gap-2">
            <input className="input flex-1" value={b.description} onChange={(e) => update({ description: e.target.value })} aria-label="وصف الصورة" />
            <input
              className="input w-24 text-center"
              inputMode="numeric"
              value={b.page ?? ""}
              onChange={(e) => update({ page: e.target.value ? Number(e.target.value) || undefined : undefined })}
              aria-label="رقم الصفحة المطبوع"
              placeholder="ص"
            />
            <button className="btn btn-outline btn-sm" onClick={() => onPick("image")}>
              <Upload size={14} /> رفع صورة بدلها
            </button>
          </div>
        </div>
      );
  }
}
