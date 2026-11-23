import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { subjectTree } from "@/lib/curriculum";
import { BookManager } from "@/components/admin/BookManager";

export default async function BookPage({ params }: PageProps<"/admin/books/[id]">) {
  await requireRole("admin");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [b] = await sql<
    {
      id: number;
      title: string;
      edition: string | null;
      pageOffset: number;
      pageCount: number | null;
      hasPdf: boolean;
      subjectId: number;
      subjectName: string;
      gradeName: string;
    }[]
  >`
    select b.id, b.title, b.edition, b.page_offset as "pageOffset", b.page_count as "pageCount", b.pdf_path is not null as "hasPdf",
      s.id as "subjectId", s.name as "subjectName", g.name as "gradeName"
    from books b join subjects s on s.id = b.subject_id join grades g on g.id = s.grade_id where b.id = ${id}`;
  if (!b) notFound();
  const [pages, tree] = await Promise.all([
    sql<{ page: number; url: string }[]>`select page, url from book_pages where book_id = ${id} order by page`,
    subjectTree(b.subjectId, { publishedOnly: false }),
  ]);
  const units = tree.find((t) => t.id === id)?.units ?? [];
  return <BookManager book={{ ...b, pages, units }} />;
}
