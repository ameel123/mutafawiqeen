import { z } from "zod";
import { sql } from "@/lib/db";
import { body, handle } from "@/lib/api";
import { apiUser, HttpError } from "@/lib/auth";

// Book structure: units → chapters → lessons.
const kind = z.enum(["unit", "chapter", "lesson"]);
const page = z.number().int().min(1).max(2000).nullable().optional();

const createSchema = z.object({
  kind,
  parentId: z.number().int().positive(),
  title: z.string().trim().min(1, "اكتب العنوان").max(300),
  pageStart: page,
  pageEnd: page,
});

const updateSchema = z.object({
  kind,
  id: z.number().int().positive(),
  title: z.string().trim().min(1).max(300).optional(),
  pageStart: page,
  pageEnd: page,
  move: z.enum(["up", "down"]).optional(),
});

const TABLE = { unit: "units", chapter: "chapters", lesson: "lessons" } as const;
const PARENT = { unit: "book_id", chapter: "unit_id", lesson: "chapter_id" } as const;

function checkPages(a?: number | null, b?: number | null) {
  if (a && b && b < a) throw new HttpError(400, "صفحة النهاية قبل صفحة البداية");
}

export async function POST(req: Request) {
  return handle(async () => {
    await apiUser("admin");
    const s = await body(req, createSchema);
    checkPages(s.pageStart, s.pageEnd);
    const t = TABLE[s.kind];
    const p = PARENT[s.kind];
    const next = sql`(select coalesce(max(sort_order), 0) + 1 from ${sql(t)} where ${sql(p)} = ${s.parentId})`;
    const [r] =
      s.kind === "lesson"
        ? await sql<{ id: number }[]>`
            insert into lessons (chapter_id, title, sort_order, page_start, page_end)
            values (${s.parentId}, ${s.title}, ${next}, ${s.pageStart ?? null}, ${s.pageEnd ?? s.pageStart ?? null}) returning id`
        : await sql<{ id: number }[]>`
            insert into ${sql(t)} (${sql(p)}, title, sort_order) values (${s.parentId}, ${s.title}, ${next}) returning id`;
    // A new unit gets a first chapter with the same title, so lessons can be added right away.
    if (s.kind === "unit") await sql`insert into chapters (unit_id, title, sort_order) values (${r.id}, ${s.title}, 1)`;
    return r;
  });
}

export async function PATCH(req: Request) {
  return handle(async () => {
    await apiUser("admin");
    const s = await body(req, updateSchema);
    const t = TABLE[s.kind];
    const p = PARENT[s.kind];
    if (s.move) {
      await sql.begin(async (tx) => {
        const [me] = await tx<{ parent: number; sort: number }[]>`
          select ${tx(p)} as parent, sort_order as sort from ${tx(t)} where id = ${s.id}`;
        if (!me) throw new HttpError(404, "العنصر غير موجود");
        // Normalise order first so neighbours always differ.
        await tx`
          update ${tx(t)} x set sort_order = o.rn from (
            select id, row_number() over (order by sort_order, id) as rn from ${tx(t)} where ${tx(p)} = ${me.parent}
          ) o where x.id = o.id`;
        const [cur] = await tx<{ sort: number }[]>`select sort_order as sort from ${tx(t)} where id = ${s.id}`;
        const target = s.move === "up" ? cur.sort - 1 : cur.sort + 1;
        const [other] = await tx<{ id: number }[]>`
          select id from ${tx(t)} where ${tx(p)} = ${me.parent} and sort_order = ${target}`;
        if (!other) return;
        await tx`update ${tx(t)} set sort_order = ${cur.sort} where id = ${other.id}`;
        await tx`update ${tx(t)} set sort_order = ${target} where id = ${s.id}`;
      });
      return { ok: true };
    }
    if (s.kind === "lesson") {
      const [cur] = await sql<{ a: number | null; b: number | null }[]>`
        select page_start as a, page_end as b from lessons where id = ${s.id}`;
      if (!cur) throw new HttpError(404, "الدرس غير موجود");
      const a = s.pageStart === undefined ? cur.a : s.pageStart;
      const b = s.pageEnd === undefined ? cur.b : s.pageEnd;
      checkPages(a, b);
      await sql`
        update lessons set title = coalesce(${s.title ?? null}, title), page_start = ${a}, page_end = ${b}, updated_at = now()
        where id = ${s.id}`;
    } else if (s.title) {
      await sql`update ${sql(t)} set title = ${s.title} where id = ${s.id}`;
    }
    return { ok: true };
  });
}

export async function DELETE(req: Request) {
  return handle(async () => {
    await apiUser("admin");
    const s = await body(req, z.object({ kind, id: z.number().int().positive() }));
    if (s.kind === "lesson") {
      const [l] = await sql<{ status: string }[]>`select status from lessons where id = ${s.id}`;
      if (l?.status === "published") throw new HttpError(409, "ألغِ نشر الدرس قبل حذفه");
    } else {
      const child = s.kind === "unit" ? sql`select 1 from chapters c join lessons l on l.chapter_id = c.id where c.unit_id = ${s.id} limit 1` : sql`select 1 from lessons where chapter_id = ${s.id} limit 1`;
      if ((await child).length) throw new HttpError(409, "احذف الدروس التي بداخله أولاً");
    }
    await sql`delete from ${sql(TABLE[s.kind])} where id = ${s.id}`;
    return { ok: true };
  });
}
