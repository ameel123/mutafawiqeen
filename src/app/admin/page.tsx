import Link from "next/link";
import { sql } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export const metadata = { title: "لوحة التحكم" };

export default async function AdminHome() {
  await requireRole("admin");
  const [[users], perSubject, [attempts]] = await Promise.all([
    sql<{ students: number; parents: number; admins: number }[]>`
      select count(*) filter (where role = 'student')::int as students,
             count(*) filter (where role = 'parent')::int as parents,
             count(*) filter (where role = 'admin')::int as admins from users`,
    sql<
      {
        subjectId: number;
        grade: string;
        subject: string;
        icon: string;
        books: number;
        draft: number;
        extracted: number;
        reviewed: number;
        published: number;
        questions: number;
      }[]
    >`
      select s.id as "subjectId", g.name as grade, s.name as subject, s.icon,
        count(distinct b.id)::int as books,
        count(distinct l.id) filter (where l.status = 'draft')::int as draft,
        count(distinct l.id) filter (where l.status = 'extracted')::int as extracted,
        count(distinct l.id) filter (where l.status = 'reviewed')::int as reviewed,
        count(distinct l.id) filter (where l.status = 'published')::int as published,
        (select count(*)::int from lesson_questions q join lessons l2 on l2.id = q.lesson_id join chapters c2 on c2.id = l2.chapter_id
          join units u2 on u2.id = c2.unit_id join books b2 on b2.id = u2.book_id where b2.subject_id = s.id) as questions
      from subjects s join grades g on g.id = s.grade_id
      join books b on b.subject_id = s.id
      left join units u on u.book_id = b.id left join chapters c on c.unit_id = u.id left join lessons l on l.chapter_id = c.id
      group by s.id, g.number, g.name order by g.number, s.sort_order`,
    sql<{ total: number; week: number; avg: number | null }[]>`
      select count(*)::int as total, count(*) filter (where created_at > now() - interval '7 days')::int as week,
        round(avg(percent))::int as avg from quiz_attempts`,
  ]);

  const cards = [
    { label: "طلاب", value: users.students, cls: "bg-brand-50 text-brand-700" },
    { label: "أولياء أمور", value: users.parents, cls: "bg-sun-100 text-ink" },
    { label: "اختبارات هذا الأسبوع", value: attempts.week, cls: "bg-mint-100 text-mint-700" },
    { label: "متوسط الدرجات", value: attempts.avg != null ? `${attempts.avg}%` : "—", cls: "bg-coral-100 text-coral-700" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">لوحة التحكم</h1>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className={`rounded-2xl p-4 ${c.cls}`}>
            <p className="text-3xl font-extrabold">{c.value}</p>
            <p className="text-sm font-bold opacity-80">{c.label}</p>
          </div>
        ))}
      </div>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line p-4">
          <h2 className="font-extrabold">حالة المحتوى</h2>
          <Link href="/admin/subjects" className="btn btn-outline btn-sm">
            إدارة المواد والكتب
          </Link>
        </div>
        {perSubject.length === 0 ? (
          <p className="p-6 text-center text-ink-soft">لا توجد كتب بعد. ابدأ بإضافة كتاب لمادة من «المواد والكتب».</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-paper text-ink-soft">
                <tr>
                  <th className="p-3 text-start">المادة</th>
                  <th className="p-3">مسودة</th>
                  <th className="p-3">بانتظار المراجعة</th>
                  <th className="p-3">تمت المراجعة</th>
                  <th className="p-3">منشور</th>
                  <th className="p-3">الأسئلة</th>
                </tr>
              </thead>
              <tbody>
                {perSubject.map((r) => (
                  <tr key={r.subjectId} className="border-t border-line text-center">
                    <td className="p-3 text-start">
                      <Link href={`/admin/subjects/${r.subjectId}`} className="font-bold hover:text-brand-600">
                        {r.icon} {r.subject}
                      </Link>
                      <span className="block text-xs text-ink-soft">{r.grade}</span>
                    </td>
                    <td className="p-3">{r.draft}</td>
                    <td className="p-3">{r.extracted}</td>
                    <td className="p-3">{r.reviewed}</td>
                    <td className="p-3 font-bold text-mint-700">{r.published}</td>
                    <td className="p-3">{r.questions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="text-sm text-ink-soft">
        الدرس لا يظهر للطلاب إلا بعد مراجعته ونشره، ويحتاج النشر سؤال اختبار واحداً على الأقل.
      </p>
    </div>
  );
}
