import { z } from "zod";
import { json, sql } from "@/lib/db";
import { body, handle, intParam } from "@/lib/api";
import { apiUser, HttpError } from "@/lib/auth";
import { blocksSchema, sanitizeBlocks } from "@/lib/blocks";

const contentSchema = z.object({ content: blocksSchema });

/** Saves the lesson blocks. A draft with content becomes "extracted" (waiting for review). */
export async function PUT(req: Request, ctx: RouteContext<"/api/admin/lessons/[id]">) {
  return handle(async () => {
    await apiUser("admin");
    const id = intParam((await ctx.params).id);
    const { content } = await body(req, contentSchema);
    const clean = sanitizeBlocks(content);
    const [r] = await sql<{ status: string }[]>`
      update lessons set content = ${json(clean)},
        status = case when status = 'draft' and ${clean.length} > 0 then 'extracted'::lesson_status else status end,
        updated_at = now()
      where id = ${id} returning status`;
    if (!r) throw new HttpError(404, "الدرس غير موجود");
    return { status: r.status, count: clean.length };
  });
}

const statusSchema = z.object({ action: z.enum(["review", "publish", "unpublish", "reopen"]) });

/** Review / publish workflow: draft → extracted → reviewed → published. */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/lessons/[id]">) {
  return handle(async () => {
    const admin = await apiUser("admin");
    const id = intParam((await ctx.params).id);
    const { action } = await body(req, statusSchema);
    const [l] = await sql<{ status: string; blocks: number; quiz: number }[]>`
      select status, jsonb_array_length(content) as blocks,
        (select count(*)::int from lesson_questions q where q.lesson_id = l.id and q.kind = 'quiz') as quiz
      from lessons l where id = ${id}`;
    if (!l) throw new HttpError(404, "الدرس غير موجود");

    if (action === "review") {
      if (!l.blocks) throw new HttpError(409, "أضف محتوى الدرس قبل اعتماده");
      await sql`update lessons set status = 'reviewed', reviewed_by = ${admin.id}, reviewed_at = now(), updated_at = now() where id = ${id}`;
    } else if (action === "publish") {
      if (l.status !== "reviewed" && l.status !== "published") throw new HttpError(409, "راجع الدرس واعتمده قبل النشر");
      if (!l.quiz) throw new HttpError(409, "أضف سؤال اختبار واحداً على الأقل قبل النشر");
      await sql`update lessons set status = 'published', published_at = now(), updated_at = now() where id = ${id}`;
    } else if (action === "unpublish") {
      await sql`update lessons set status = 'reviewed', published_at = null, updated_at = now() where id = ${id} and status = 'published'`;
    } else {
      await sql`
        update lessons set status = case when jsonb_array_length(content) > 0 then 'extracted'::lesson_status else 'draft'::lesson_status end,
          reviewed_at = null, reviewed_by = null, published_at = null, updated_at = now()
        where id = ${id}`;
    }
    const [r] = await sql<{ status: string }[]>`select status from lessons where id = ${id}`;
    return r;
  });
}
