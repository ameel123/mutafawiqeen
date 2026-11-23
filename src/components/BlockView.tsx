import type { Block } from "@/lib/blocks";

/** Renders one lesson block. `admin` shows placeholders that students never see. */
export function BlockView({ block, active = false, admin = false }: { block: Block; active?: boolean; admin?: boolean }) {
  const hl = active ? "speaking" : "";
  switch (block.type) {
    case "heading":
      return <h2 className={`text-2xl font-extrabold leading-relaxed text-brand-700 md:text-[1.7rem] ${hl}`}>{block.text}</h2>;
    case "paragraph":
      return <p className={`book-text text-ink ${hl}`}>{block.text}</p>;
    case "keypoint":
      return (
        <div className={`flex gap-3 rounded-2xl border-2 border-sun-300 bg-sun-100 p-4 ${active ? "ring-4 ring-sun-300" : ""}`}>
          <span className="text-2xl" aria-hidden>
            💡
          </span>
          <div>
            <p className="text-sm font-extrabold text-ink">تذكّر</p>
            <p className="book-text text-ink">{block.text}</p>
          </div>
        </div>
      );
    case "example":
      return (
        <div className={`rounded-2xl border border-brand-100 bg-brand-50 p-4 ${active ? "ring-4 ring-sun-300" : ""}`}>
          {block.title && <p className="mb-1 text-sm font-extrabold text-brand-700">{block.title}</p>}
          <p className="book-text text-center text-brand-900">{block.text}</p>
        </div>
      );
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag className={`book-text space-y-1 ps-6 ${block.ordered ? "list-decimal" : "list-disc"} marker:text-brand-500 ${hl}`}>
          {block.items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </Tag>
      );
    }
    case "image":
      return (
        <figure className="overflow-hidden rounded-2xl border border-line bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={block.url} alt={block.caption ?? "صورة من الدرس"} className="mx-auto max-h-[78vh] w-full object-contain" loading="lazy" />
          {block.caption && <figcaption className="border-t border-line px-3 py-2 text-center text-sm text-ink-soft">{block.caption}</figcaption>}
        </figure>
      );
    case "video":
      return (
        <figure className="overflow-hidden rounded-2xl border border-line bg-black">
          <video
            src={block.url}
            poster={block.poster}
            controls
            playsInline
            preload="metadata"
            controlsList="nodownload"
            className="aspect-video w-full"
          />
          {block.caption && <figcaption className="bg-white px-3 py-2 text-center text-sm text-ink-soft">{block.caption}</figcaption>}
        </figure>
      );
    case "figure":
      if (!admin) return null;
      return (
        <div className="rounded-2xl border-2 border-dashed border-line bg-paper p-4 text-center text-sm text-ink-soft">
          🖼️ صورة لم تُرفع: {block.description}
          {block.page ? ` (ص ${block.page})` : ""}
        </div>
      );
  }
}
