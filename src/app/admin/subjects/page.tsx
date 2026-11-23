import { sql } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { SubjectsManager } from "@/components/admin/SubjectsManager";

export const metadata = { title: "المواد والكتب" };

export default async function SubjectsPage() {
  await requireRole("admin");
  const grades = await sql<{ id: number; name: string }[]>`select id, name from grades order by number`;
  const subjects = await sql<
    { id: number; gradeId: number; name: string; icon: string; color: string; isActive: boolean; books: number; published: number }[]
  >`
    select s.id, s.grade_id as "gradeId", s.name, s.icon, s.color, s.is_active as "isActive",
      (select count(*)::int from books b where b.subject_id = s.id) as books,
      (select count(*)::int from lessons l join chapters c on c.id = l.chapter_id join units u on u.id = c.unit_id
        join books b on b.id = u.book_id where b.subject_id = s.id and l.status = 'published') as published
    from subjects s order by s.sort_order, s.id`;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">المواد والكتب</h1>
        <p className="text-ink-soft">اختر مادة لإضافة كتابها ورفع ملف PDF الأصلي وبناء الدروس.</p>
      </div>
      <SubjectsManager grades={grades.map((g) => ({ ...g, subjects: subjects.filter((s) => s.gradeId === g.id) }))} />
    </div>
  );
}
