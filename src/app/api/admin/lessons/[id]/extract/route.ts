import { sql } from "@/lib/db";
import { handle, intParam } from "@/lib/api";
import { apiUser, HttpError } from "@/lib/auth";
import { blockSchema, sanitizeBlocks, type Block } from "@/lib/blocks";
import { normalizeQuestionShape, questionInputSchema } from "@/lib/questions";
import { bookPageImages, lessonContext, pageRange } from "@/lib/curriculum";

export const maxDuration = 120;

const PROMPT = `أنت مساعد لمعلّم عراقي يُدخل كتاب المنهج الرسمي في منصة تعليمية للصفوف الابتدائية.
الصور المرفقة هي صفحات درس «{title}» من كتاب «{book}» ({grade}).

المطلوب:
1) انسخ نص الدرس كما هو في الكتاب حرفياً وبالتشكيل نفسه، ولا تؤلّف شرحاً من عندك.
2) تجاهل أرقام الصفحات المطبوعة والترويسة والتذييل وهوامش الطباعة، ولا تكتبها أبداً.
3) قسّم المحتوى إلى كتل بالترتيب: heading (عنوان)، paragraph (فقرة)، keypoint (فكرة الدرس أو معلومة مهمة)، example (مثال أو تدريب كتابة، مع title اختياري)، list (قائمة items مع ordered)، figure (صورة في الكتاب: اكتب وصفاً قصيراً في description ورقم الصفحة المطبوع في page).
4) اقترح أنشطة (activities) وأسئلة اختبار (quiz) مبنية فقط على ما في هذه الصفحات، مناسبة لعمر الطالب، بالأنواع:
   mcq: options (2-6 خيارات) و answer رقم الخيار الصحيح (يبدأ من 0)
   true_false: answer true/false
   fill_blank: answer مصفوفة بالإجابات المقبولة
   ordering: options بالترتيب الصحيح
   matching: options أزواج {left, right}
   مع explanation قصير لكل سؤال. اجعل 2-4 أنشطة و 3-6 أسئلة اختبار.

أعد JSON فقط بين الوسمين <json> و </json> بالشكل:
{"blocks":[...],"activities":[{"type":"mcq","prompt":"...","options":[...],"answer":0,"explanation":"..."}],"quiz":[...]}`;

async function toBase64(url: string, origin: string) {
  const res = await fetch(new URL(url, origin));
  if (!res.ok) throw new HttpError(502, `تعذر تحميل صورة الصفحة (${res.status})`);
  const type = res.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
  const media = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(type) ? type : "image/jpeg";
  return { media, data: Buffer.from(await res.arrayBuffer()).toString("base64") };
}

export async function POST(req: Request, ctx: RouteContext<"/api/admin/lessons/[id]/extract">) {
  return handle(async () => {
    await apiUser("admin");
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new HttpError(501, "الاستخراج بالذكاء الاصطناعي غير مفعّل: أضف ANTHROPIC_API_KEY في إعدادات الاستضافة، أو أدخل المحتوى يدوياً");
    }
    const id = intParam((await ctx.params).id);
    const lesson = await lessonContext(id);
    if (!lesson) throw new HttpError(404, "الدرس غير موجود");
    const range = pageRange(lesson.pageStart, lesson.pageEnd).slice(0, 6);
    if (!range.length) throw new HttpError(400, "حدّد صفحات الدرس أولاً");
    const images = await bookPageImages(lesson.bookId, range);
    const urls = range.map((p) => images[p]).filter(Boolean);
    if (!urls.length) throw new HttpError(400, "لا توجد صور لصفحات هذا الدرس؛ ارفع ملف PDF وولّد الصفحات أولاً");

    const origin = new URL(req.url).origin;
    const pics = await Promise.all(urls.map((u) => toBase64(u, origin)));
    const text = PROMPT.replace("{title}", lesson.title).replace("{book}", lesson.bookTitle).replace("{grade}", lesson.gradeName);

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
        max_tokens: 8000,
        messages: [
          {
            role: "user",
            content: [
              ...pics.map((p, i) => [
                { type: "text", text: `الصفحة المطبوعة ${range[i]}:` },
                { type: "image", source: { type: "base64", media_type: p.media, data: p.data } },
              ]).flat(),
              { type: "text", text },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      throw new HttpError(502, `فشل طلب الذكاء الاصطناعي (${res.status}): ${detail}`);
    }
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const out = data.content?.map((c) => c.text ?? "").join("") ?? "";
    const m = /<json>([\s\S]*?)<\/json>/.exec(out) ?? /(\{[\s\S]*\})/.exec(out);
    if (!m) throw new HttpError(502, "لم يُرجع الذكاء الاصطناعي نتيجة مفهومة، حاول مرة أخرى");
    let parsed: { blocks?: unknown[]; activities?: unknown[]; quiz?: unknown[] };
    try {
      parsed = JSON.parse(m[1]);
    } catch {
      throw new HttpError(502, "تعذر قراءة نتيجة الذكاء الاصطناعي، حاول مرة أخرى");
    }

    const blocks: Block[] = [];
    for (const b of parsed.blocks ?? []) {
      const r = blockSchema.safeParse(b);
      if (r.success) blocks.push(r.data);
    }
    const questions = (list: unknown[] | undefined, kind: "activity" | "quiz") =>
      (list ?? []).flatMap((q) => {
        const r = questionInputSchema.safeParse({ ...(q as object), kind, points: 1 });
        if (!r.success) return [];
        try {
          const s = normalizeQuestionShape(r.data.type, r.data.options, r.data.answer);
          return [{ ...r.data, ...s }];
        } catch {
          return [];
        }
      });

    return {
      blocks: sanitizeBlocks(blocks),
      questions: [...questions(parsed.activities, "activity"), ...questions(parsed.quiz, "quiz")],
    };
  });
}

