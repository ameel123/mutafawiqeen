import { z } from "zod";

export type QuestionType = "mcq" | "true_false" | "fill_blank" | "ordering" | "matching";
export type QuestionKind = "activity" | "quiz";

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  mcq: "اختيار من متعدد",
  true_false: "صح أو خطأ",
  fill_blank: "أكمل الفراغ",
  ordering: "ترتيب",
  matching: "توصيل",
};

/** Shapes stored in lesson_questions:
 *  mcq        options: string[]               answer: index
 *  true_false options: []                     answer: boolean
 *  fill_blank options: []                     answer: string[] (accepted answers)
 *  ordering   options: string[] (correct order) answer: null
 *  matching   options: {left,right}[]          answer: null
 */
export type StoredQuestion = {
  id: number;
  kind: QuestionKind;
  type: QuestionType;
  prompt: string;
  options: unknown;
  answer: unknown;
  explanation: string | null;
  points: number;
};

/** What a student may see (no answers). */
export type PublicQuestion = {
  id: number;
  kind: QuestionKind;
  type: QuestionType;
  prompt: string;
  points: number;
  // mcq: string[]; ordering: shuffled string[]; matching: { lefts, rights(shuffled) }
  options: string[] | { lefts: string[]; rights: string[] } | [];
};

const clean = (s: unknown) => String(s ?? "").trim();

export const questionInputSchema = z.object({
  kind: z.enum(["activity", "quiz"]),
  type: z.enum(["mcq", "true_false", "fill_blank", "ordering", "matching"]),
  prompt: z.string().trim().min(1, "نص السؤال مطلوب").max(1000),
  options: z.unknown(),
  answer: z.unknown(),
  explanation: z.string().trim().max(1000).nullable().optional(),
  points: z.number().int().min(1).max(20).default(1),
});

/** Validates and normalises options/answer for a question type (Arabic error messages). */
export function normalizeQuestionShape(type: QuestionType, options: unknown, answer: unknown) {
  switch (type) {
    case "mcq": {
      const opts = (Array.isArray(options) ? options : []).map(clean).filter(Boolean);
      if (opts.length < 2 || opts.length > 6) throw new Error("سؤال الاختيار من متعدد يحتاج من 2 إلى 6 خيارات");
      if (new Set(opts).size !== opts.length) throw new Error("الخيارات يجب ألا تتكرر");
      if (typeof answer !== "number" || !Number.isInteger(answer) || answer < 0 || answer >= opts.length) {
        throw new Error("اختر الإجابة الصحيحة من الخيارات");
      }
      return { options: opts, answer };
    }
    case "true_false":
      if (typeof answer !== "boolean") throw new Error("حدد هل العبارة صح أم خطأ");
      return { options: [], answer };
    case "fill_blank": {
      const accepted = (Array.isArray(answer) ? answer : [answer]).map(clean).filter(Boolean);
      if (accepted.length < 1 || accepted.length > 6) throw new Error("اكتب إجابة صحيحة واحدة على الأقل (حتى 6)");
      return { options: [], answer: accepted };
    }
    case "ordering": {
      const items = (Array.isArray(options) ? options : []).map(clean).filter(Boolean);
      if (items.length < 2 || items.length > 8) throw new Error("سؤال الترتيب يحتاج من 2 إلى 8 عناصر");
      if (new Set(items).size !== items.length) throw new Error("عناصر الترتيب يجب ألا تتكرر");
      return { options: items, answer: null };
    }
    case "matching": {
      const pairs = (Array.isArray(options) ? options : [])
        .map((p) => ({ left: clean((p as { left?: unknown })?.left), right: clean((p as { right?: unknown })?.right) }))
        .filter((p) => p.left && p.right);
      if (pairs.length < 2 || pairs.length > 6) throw new Error("سؤال التوصيل يحتاج من 2 إلى 6 أزواج");
      if (new Set(pairs.map((p) => p.right)).size !== pairs.length) throw new Error("الأجوبة في عمود التوصيل يجب ألا تتكرر");
      return { options: pairs, answer: null };
    }
  }
}

function shuffled<T>(items: T[]): T[] {
  const original = [...items];
  let arr = [...items];
  for (let attempt = 0; attempt < 6; attempt++) {
    arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    if (items.length < 2 || arr.some((v, i) => v !== original[i])) break;
  }
  return arr;
}

export function toPublicQuestion(q: StoredQuestion): PublicQuestion {
  let options: PublicQuestion["options"] = [];
  if (q.type === "mcq" && Array.isArray(q.options)) options = q.options as string[];
  else if (q.type === "ordering" && Array.isArray(q.options)) options = shuffled(q.options as string[]);
  else if (q.type === "matching" && Array.isArray(q.options)) {
    const pairs = q.options as { left: string; right: string }[];
    options = { lefts: pairs.map((p) => p.left), rights: shuffled(pairs.map((p) => p.right)) };
  }
  return { id: q.id, kind: q.kind, type: q.type, prompt: q.prompt, points: q.points, options };
}

/** Arabic-aware normalisation for typed answers (diacritics and hamza forms ignored). */
export function normalizeArabic(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670\u0640\u06E1\u06DF]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة(?=\s|$)/g, "ه")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function gradeAnswer(q: Pick<StoredQuestion, "type" | "options" | "answer">, given: unknown): boolean {
  switch (q.type) {
    case "mcq":
      return typeof given === "number" && given === q.answer;
    case "true_false":
      return typeof given === "boolean" && given === q.answer;
    case "fill_blank": {
      if (typeof given !== "string" || !Array.isArray(q.answer)) return false;
      const g = normalizeArabic(given);
      return !!g && (q.answer as string[]).some((a) => normalizeArabic(String(a)) === g);
    }
    case "ordering": {
      if (!Array.isArray(given) || !Array.isArray(q.options)) return false;
      const correct = q.options as string[];
      return given.length === correct.length && correct.every((c, i) => given[i] === c);
    }
    case "matching": {
      if (!Array.isArray(given) || !Array.isArray(q.options)) return false;
      const pairs = q.options as { left: string; right: string }[];
      return given.length === pairs.length && pairs.every((p, i) => given[i] === p.right);
    }
  }
}

/** Human-readable correct answer for feedback. */
export function correctAnswerText(q: Pick<StoredQuestion, "type" | "options" | "answer">): string {
  switch (q.type) {
    case "mcq":
      return Array.isArray(q.options) ? String((q.options as string[])[q.answer as number] ?? "") : "";
    case "true_false":
      return q.answer ? "صح" : "خطأ";
    case "fill_blank":
      return Array.isArray(q.answer) ? String((q.answer as string[])[0] ?? "") : "";
    case "ordering":
      return Array.isArray(q.options) ? (q.options as string[]).join(" ← ") : "";
    case "matching":
      return Array.isArray(q.options)
        ? (q.options as { left: string; right: string }[]).map((p) => `${p.left} ↔ ${p.right}`).join("، ")
        : "";
  }
}

export function isAnswered(q: PublicQuestion, value: unknown): boolean {
  switch (q.type) {
    case "mcq":
      return typeof value === "number";
    case "true_false":
      return typeof value === "boolean";
    case "fill_blank":
      return typeof value === "string" && value.trim().length > 0;
    case "ordering":
      return Array.isArray(value) && value.length === (q.options as string[]).length;
    case "matching": {
      const n = (q.options as { lefts: string[] }).lefts?.length ?? 0;
      return Array.isArray(value) && value.length === n && value.every((v) => typeof v === "string" && v);
    }
  }
}

export function ratingFor(percent: number): { rating: string; stars: number; message: string } {
  if (percent >= 90) return { rating: "ممتاز", stars: 3, message: "رائع! أنت بطل حقيقي 🌟" };
  if (percent >= 75) return { rating: "جيد جداً", stars: 3, message: "أحسنت! عمل رائع، استمر هكذا." };
  if (percent >= 60) return { rating: "جيد", stars: 2, message: "جيد! راجع الأسئلة التي أخطأت فيها." };
  if (percent >= 50) return { rating: "مقبول", stars: 1, message: "لا بأس، راجع الدرس وحاول مرة أخرى." };
  return { rating: "يحتاج إلى مراجعة", stars: 0, message: "لا تستسلم! راجع الدرس مع المعلم ثم حاول من جديد." };
}
