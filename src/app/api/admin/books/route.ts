import { z } from "zod";
import { sql } from "@/lib/db";
import { body, handle } from "@/lib/api";
import { apiUser, HttpError } from "@/lib/auth";
import { mediaKeyFromUrl, removeObjects } from "@/lib/storage";

const createSchema = z.object({
  subjectId: z.number().int().positive(),
  title: z.string().trim().min(2, "اكتب عنوان الكتاب").max(200),
  edition: z.string().trim().max(200).optional(),
});

const updateSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().trim().min(2).max(200).optional(),
  edition: z.string().trim().max(200).nullable().optional(),
  pageOffset: z.number().int().min(-50).max(50).optional(),
  pdfPath: z.string().max(500).optional(),
  pdfSize: z.number().int().positive().optional(),
  pageCount: z.number().int().min(1).max(2000).optional(),
});

export async function POST(req: Request) {
  return handle(async () => {
    await apiUser("admin");
    const b = await body(req, createSchema);
    const [r] = await sql<{ id: number }[]>`
      insert into books (subject_id, title, edition) values (${b.subjectId}, ${b.title}, ${b.edition || null}) returning id`;
    return r;
  });
}

export async function PATCH(req: Request) {
  return handle(async () => {
    await apiUser("admin");
    const b = await body(req, updateSchema);
    const [old] = await sql<{ pdfPath: string | null }[]>`select pdf_path as "pdfPath" from books where id = ${b.id}`;
    if (!old) throw new HttpError(404, "الكتاب غير موجود");
    if (b.pdfPath && !b.pdfPath.startsWith(`books/${b.id}/`)) throw new HttpError(400, "مسار الملف غير صالح");
    await sql`
      update books set
        title = coalesce(${b.title ?? null}, title),
        edition = ${b.edition === undefined ? sql`edition` : b.edition || null},
        page_offset = coalesce(${b.pageOffset ?? null}, page_offset),
        pdf_path = coalesce(${b.pdfPath ?? null}, pdf_path),
        pdf_size_bytes = coalesce(${b.pdfSize ?? null}, pdf_size_bytes),
        page_count = coalesce(${b.pageCount ?? null}, page_count),
        updated_at = now()
      where id = ${b.id}`;
    // A new PDF replaces the previous file.
    if (b.pdfPath && old.pdfPath && old.pdfPath !== b.pdfPath) await removeObjects("books", [old.pdfPath]).catch(() => {});
    return { ok: true };
  });
}

export async function DELETE(req: Request) {
  return handle(async () => {
    await apiUser("admin");
    const { id } = await body(req, z.object({ id: z.number().int().positive() }));
    const [b] = await sql<{ pdfPath: string | null }[]>`select pdf_path as "pdfPath" from books where id = ${id}`;
    if (!b) throw new HttpError(404, "الكتاب غير موجود");
    const pages = await sql<{ url: string }[]>`select url from book_pages where book_id = ${id}`;
    await sql`delete from books where id = ${id}`;
    const keys = pages.map((p) => mediaKeyFromUrl(p.url.split("?")[0])).filter((k): k is string => !!k);
    await removeObjects("media", keys).catch(() => {});
    if (b.pdfPath) await removeObjects("books", [b.pdfPath]).catch(() => {});
    return { ok: true };
  });
}
