import { z } from "zod";
import { json, sql } from "@/lib/db";
import { body, handle, intParam } from "@/lib/api";
import { apiUser, HttpError } from "@/lib/auth";
import { normalizeQuestionShape, questionInputSchema, type QuestionType } from "@/lib/questions";

function shape(type: QuestionType, options: unknown, answer: unknown) {
  try {
    return normalizeQuestionShape(type, options, answer);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
}

/** Adds one question, or several at once ({ questions: [...] }, e.g. from AI suggestions). */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/lessons/[id]/questions">) {
  return handle(async () => {
    await apiUser("admin");
    const lessonId = intParam((await ctx.params).id);
    const raw = await req.json().catch(() => null);
    const list = z
      .array(questionInputSchema)
      .min(1)
      .max(50)
      .parse(raw && typeof raw === "object" && "questions" in raw ? (raw as { questions: unknown }).questions : [raw]);
    const exists = await sql`select 1 from lessons where id = ${lessonId}`;
    if (!exists.length) throw new HttpError(404, "الدرس غير موجود");
    const ids: number[] = [];
    for (const q of list) {
      const s = shape(q.type, q.options, q.answer);
      const [r] = await sql<{ id: number }[]>`
        insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order)
        values (${lessonId}, ${q.kind}, ${q.type}, ${q.prompt}, ${json(s.options)}, ${json(s.answer)}, ${q.explanation || null}, ${q.points},
          (select coalesce(max(sort_order), 0) + 1 from lesson_questions where lesson_id = ${lessonId} and kind = ${q.kind}))
        returning id`;
      ids.push(r.id);
    }
    return { ids };
  });
}

const updateSchema = questionInputSchema.extend({ id: z.number().int().positive() });

export async function PATCH(req: Request, ctx: RouteContext<"/api/admin/lessons/[id]/questions">) {
  return handle(async () => {
    await apiUser("admin");
    const lessonId = intParam((await ctx.params).id);
    const raw = await req.json().catch(() => null);
    // Reorder: { move: "up" | "down", id }
    if (raw && typeof raw === "object" && "move" in raw) {
      const { id, move } = z.object({ id: z.number().int().positive(), move: z.enum(["up", "down"]) }).parse(raw);
      await sql.begin(async (tx) => {
        const [me] = await tx<{ kind: string }[]>`select kind from lesson_questions where id = ${id} and lesson_id = ${lessonId}`;
        if (!me) throw new HttpError(404, "السؤال غير موجود");
        const rows = await tx<{ id: number }[]>`
          select id from lesson_questions where lesson_id = ${lessonId} and kind = ${me.kind} order by sort_order, id`;
        const i = rows.findIndex((r) => r.id === id);
        const j = move === "up" ? i - 1 : i + 1;
        if (j < 0 || j >= rows.length) return;
        [rows[i], rows[j]] = [rows[j], rows[i]];
        for (let k = 0; k < rows.length; k++) await tx`update lesson_questions set sort_order = ${k + 1} where id = ${rows[k].id}`;
      });
      return { ok: true };
    }
    const q = updateSchema.parse(raw);
    const s = shape(q.type, q.options, q.answer);
    const [r] = await sql`
      update lesson_questions set kind = ${q.kind}, type = ${q.type}, prompt = ${q.prompt}, options = ${json(s.options)},
        answer = ${json(s.answer)}, explanation = ${q.explanation || null}, points = ${q.points}
      where id = ${q.id} and lesson_id = ${lessonId} returning id`;
    if (!r) throw new HttpError(404, "السؤال غير موجود");
    return { ok: true };
  });
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/admin/lessons/[id]/questions">) {
  return handle(async () => {
    await apiUser("admin");
    const lessonId = intParam((await ctx.params).id);
    const { id } = await body(req, z.object({ id: z.number().int().positive() }));
    const [l] = await sql<{ status: string; quiz: number; kind: string }[]>`
      select l.status, q.kind,
        (select count(*)::int from lesson_questions x where x.lesson_id = l.id and x.kind = 'quiz') as quiz
      from lesson_questions q join lessons l on l.id = q.lesson_id where q.id = ${id} and q.lesson_id = ${lessonId}`;
    if (!l) throw new HttpError(404, "السؤال غير موجود");
    if (l.status === "published" && l.kind === "quiz" && l.quiz <= 1) {
      throw new HttpError(409, "الدرس منشور ويحتاج سؤال اختبار واحداً على الأقل");
    }
    await sql`delete from lesson_questions where id = ${id}`;
    return { ok: true };
  });
}
