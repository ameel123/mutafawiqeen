import { z } from "zod";

/**
 * Lesson content is an ordered list of blocks (lessons.content jsonb).
 * "figure" marks a picture of the book that has not been uploaded yet.
 */
export const blockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heading"), text: z.string().min(1).max(300) }),
  z.object({ type: z.literal("paragraph"), text: z.string().min(1).max(6000) }),
  z.object({ type: z.literal("keypoint"), text: z.string().min(1).max(3000) }),
  z.object({
    type: z.literal("example"),
    title: z.string().max(200).optional(),
    text: z.string().min(1).max(4000),
  }),
  z.object({
    type: z.literal("list"),
    ordered: z.boolean().optional(),
    items: z.array(z.string().min(1).max(1000)).min(1).max(60),
  }),
  z.object({
    type: z.literal("image"),
    url: z.string().min(1).max(1000),
    caption: z.string().max(500).optional(),
  }),
  z.object({
    type: z.literal("figure"),
    description: z.string().min(1).max(800),
    page: z.number().int().min(1).max(2000).optional(),
  }),
  z.object({
    type: z.literal("video"),
    url: z.string().min(1).max(1000),
    caption: z.string().max(500).optional(),
    poster: z.string().max(1000).optional(),
  }),
]);

export const blocksSchema = z.array(blockSchema).max(400);
export type Block = z.infer<typeof blockSchema>;
export type BlockType = Block["type"];

export const BLOCK_LABEL: Record<BlockType, string> = {
  heading: "عنوان",
  paragraph: "فقرة",
  keypoint: "تذكّر / معلومة مهمة",
  example: "مثال / تدريب كتابة",
  list: "قائمة",
  image: "صورة",
  figure: "صورة لم تُرفع بعد",
  video: "فيديو",
};

/** Removes printed-book page references ("صفحة 55 من كتاب قراءتي", "(ص 12)") from spoken text. */
const PAGE_REF =
  /(^|[^\u0600-\u06FF])[(\[]?\s*(?:الصفحات|الصفحة|صفحات|صفحة|ص)\s*\.?\s*[0-9٠-٩]+(?:\s*[-–]\s*[0-9٠-٩]+)?(?:\s+من\s+(?:ال)?كتاب(?:\s+[^\s.،,؛:]+)?)?\s*[)\]]?/g;

export function stripPageRefs(text: string): string {
  let out = text.replace(PAGE_REF, "$1 ");
  // Quranic text (Uthmani marks): verse numbers are not recited.
  if (/[\u06D6-\u06ED]/.test(out)) out = out.replace(/(^|\s)[\u06DD]?[0-9٠-٩]+(?=\s|$)/g, "$1");
  return out.replace(/[ \t]{2,}/g, " ").trim();
}

/** Text of a block that the teacher voice reads (pictures and videos are not read). */
export function speakableText(b: Block): string {
  switch (b.type) {
    case "heading":
      return `${b.text}.`;
    case "paragraph":
      return b.text;
    case "keypoint":
      return `تذكّر. ${b.text}`;
    case "example":
      return b.title ? `${b.title}. ${b.text}` : b.text;
    case "list":
      return b.items.join(".\n");
    default:
      return "";
  }
}

export function speechOf(blocks: Block[]): string {
  return stripPageRefs(blocks.map(speakableText).filter(Boolean).join("\n"));
}

/** Printed pages referenced by figure blocks. */
export function figurePages(blocks: Block[]): number[] {
  return blocks.flatMap((b) => (b.type === "figure" && b.page ? [b.page] : []));
}

/**
 * Splits a lesson into small screens: a new screen starts at each heading.
 * A figure that points at a book page becomes that page's picture; other figures are dropped.
 */
export function buildSteps(blocks: Block[], pageImages: Record<number, string> = {}): Block[][] {
  const steps: Block[][] = [];
  let cur: Block[] = [];
  for (const raw of blocks) {
    let b: Block = raw;
    if (raw.type === "figure") {
      const url = raw.page ? pageImages[raw.page] : undefined;
      if (!url) continue;
      b = { type: "image", url };
    }
    const startsNew = b.type === "heading" && cur.some((x) => x.type !== "heading");
    if (startsNew || cur.length >= 6) {
      steps.push(cur);
      cur = [];
    }
    cur.push(b);
  }
  if (cur.length) steps.push(cur);
  return steps;
}

/** Cleans editor state before saving (trims, drops empty blocks/items). */
export function sanitizeBlocks(blocks: Block[]): Block[] {
  const out: Block[] = [];
  for (const b of blocks) {
    if (b.type === "heading" || b.type === "paragraph" || b.type === "keypoint") {
      if (b.text.trim()) out.push({ ...b, text: b.text.trim() });
    } else if (b.type === "example") {
      if (b.text.trim()) out.push({ ...b, title: b.title?.trim() || undefined, text: b.text.trim() });
    } else if (b.type === "list") {
      const items = b.items.map((i) => i.trim()).filter(Boolean);
      if (items.length) out.push({ ...b, items });
    } else if (b.type === "image" || b.type === "video") {
      if (b.url) out.push({ ...b, caption: b.caption?.trim() || undefined });
    } else if (b.type === "figure") {
      if (b.description.trim()) out.push({ ...b, description: b.description.trim() });
    }
  }
  return out;
}
