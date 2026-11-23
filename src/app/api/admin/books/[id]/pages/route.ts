import { z } from "zod";
import { sql } from "@/lib/db";
import { body, handle, intParam } from "@/lib/api";
import { apiUser, HttpError } from "@/lib/auth";
import { signedDownloadUrl } from "@/lib/storage";

const schema = z.object({
  pages: z
    .array(z.object({ page: z.number().int().min(1).max(2000), url: z.string().min(1).max(1000) }))
    .min(1)
    .max(200),
  pageCount: z.number().int().min(1).max(2000).optional(),
});

/** Saves generated page images (upsert). */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/books/[id]/pages">) {
  return handle(async () => {
    await apiUser("admin");
    const id = intParam((await ctx.params).id);
    const { pages, pageCount } = await body(req, schema);
    const exists = await sql`select 1 from books where id = ${id}`;
    if (!exists.length) throw new HttpError(404, "الكتاب غير موجود");
    await sql`
      insert into book_pages ${sql(pages.map((p) => ({ book_id: id, page: p.page, url: p.url })))}
      on conflict (book_id, page) do update set url = excluded.url`;
    if (pageCount) {
      await sql`update books set page_count = ${pageCount}, updated_at = now() where id = ${id}`;
      await sql`delete from book_pages where book_id = ${id} and page > ${pageCount}`;
    }
    return { saved: pages.length };
  });
}

/** Short-lived link to the original PDF (to regenerate pages or extract text in the browser). */
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/books/[id]/pages">) {
  return handle(async () => {
    await apiUser("admin");
    const id = intParam((await ctx.params).id);
    const [b] = await sql<{ pdfPath: string | null }[]>`select pdf_path as "pdfPath" from books where id = ${id}`;
    if (!b?.pdfPath) throw new HttpError(404, "لم يُرفع ملف PDF لهذا الكتاب");
    return { url: await signedDownloadUrl("books", b.pdfPath) };
  });
}
