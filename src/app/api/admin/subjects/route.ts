import { z } from "zod";
import { sql } from "@/lib/db";
import { body, handle } from "@/lib/api";
import { apiUser, HttpError } from "@/lib/auth";

const COLORS = ["blue", "orange", "green", "teal", "purple", "rose"] as const;

const createSchema = z.object({
  gradeId: z.number().int().positive(),
  name: z.string().trim().min(2, "اكتب اسم المادة").max(80),
  icon: z.string().trim().min(1).max(8).default("📘"),
  color: z.enum(COLORS).default("blue"),
});

const updateSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(2).max(80).optional(),
  icon: z.string().trim().min(1).max(8).optional(),
  color: z.enum(COLORS).optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
  isActive: z.boolean().optional(),
});

export async function POST(req: Request) {
  return handle(async () => {
    await apiUser("admin");
    const s = await body(req, createSchema);
    const [r] = await sql<{ id: number }[]>`
      insert into subjects (grade_id, name, icon, color, sort_order)
      values (${s.gradeId}, ${s.name}, ${s.icon}, ${s.color},
        (select coalesce(max(sort_order), 0) + 1 from subjects where grade_id = ${s.gradeId}))
      returning id`;
    return r;
  });
}

export async function PATCH(req: Request) {
  return handle(async () => {
    await apiUser("admin");
    const s = await body(req, updateSchema);
    const [r] = await sql`
      update subjects set
        name = coalesce(${s.name ?? null}, name),
        icon = coalesce(${s.icon ?? null}, icon),
        color = coalesce(${s.color ?? null}, color),
        sort_order = coalesce(${s.sortOrder ?? null}, sort_order),
        is_active = coalesce(${s.isActive ?? null}, is_active)
      where id = ${s.id} returning id`;
    if (!r) throw new HttpError(404, "المادة غير موجودة");
    return { ok: true };
  });
}

export async function DELETE(req: Request) {
  return handle(async () => {
    await apiUser("admin");
    const { id } = await body(req, z.object({ id: z.number().int().positive() }));
    const books = await sql`select 1 from books where subject_id = ${id} limit 1`;
    if (books.length) throw new HttpError(409, "احذف كتب المادة أولاً، أو أخفِ المادة بدلاً من حذفها");
    await sql`delete from subjects where id = ${id}`;
    return { ok: true };
  });
}
