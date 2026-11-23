import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { sql } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { NewBookForm } from "@/components/admin/SubjectsManager";

export default async function SubjectBooksPage({ params }: PageProps<"/admin/subjects/[id]">) {
  await requireRole("admin");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [s] = await sql<{ id: number; name: string; icon: string; grade: string }[]>`
    select s.id, s.name, s.icon, g.name as grade from subjects s join grades g on g.id = s.grade_id where s.id = ${id}`;
  if (!s) notFound();
  const books = await sql<
    { id: number; title: string; edition: string | null; pageCount: number | null; hasPdf: boolean; pages: number; lessons: number; published: number }[]
  >`
    select b.id, b.title, b.edition, b.page_count as "pageCount", b.pdf_path is not null as "hasPdf",
      (select count(*)::int from book_pages p where p.book_id = b.id) as pages,
      (select count(*)::int from lessons l join chapters c on c.id = l.chapter_id join units u on u.id = c.unit_id where u.book_id = b.id) as lessons,
      (select count(*)::int from lessons l join chapters c on c.id = l.chapter_id join units u on u.id = c.unit_id where u.book_id = b.id and l.status = 'published') as published
    from books b where b.subject_id = ${id} order by b.id`;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin/subjects" className="text-sm font-bold text-brand-600 hover:underline">
          المواد والكتب
        </Link>
        <h1 className="text-2xl font-extrabold">
          {s.icon} {s.name} · <span className="text-ink-soft">{s.grade}</span>
        </h1>
      </div>

      {books.length > 0 && (
        <ul className="grid gap-3 md:grid-cols-2">
          {books.map((b) => (
            <li key={b.id}>
              <Link href={`/admin/books/${b.id}`} className="card flex items-start gap-3 p-4 hover:border-brand-200">
                <FileText className="mt-1 text-brand-500" />
                <div className="flex-1">
                  <p className="text-lg font-extrabold">{b.title}</p>
                  {b.edition && <p className="text-sm text-ink-soft">{b.edition}</p>}
                  <p className="mt-2 flex flex-wrap gap-1.5 text-xs">
                    <span className={`badge ${b.hasPdf ? "bg-mint-100 text-mint-700" : "bg-line text-ink-soft"}`}>
                      {b.hasPdf ? "ملف PDF مرفوع" : "بلا ملف PDF"}
                    </span>
                    <span className="badge bg-brand-50 text-brand-700">{b.pages} صورة صفحة</span>
                    <span className="badge bg-sun-100 text-ink">
                      {b.published}/{b.lessons} درس منشور
                    </span>
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section className="card p-5">
        <h2 className="mb-3 font-extrabold">كتاب جديد</h2>
        <NewBookForm subjectId={id} />
      </section>
    </div>
  );
}
