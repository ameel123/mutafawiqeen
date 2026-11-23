import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { sql } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { getStudentProfile, subjectsForStudent } from "@/lib/curriculum";
import { ProgressBar } from "@/components/Stars";

export const metadata = { title: "دروسي" };

const COLORS: Record<string, string> = {
  blue: "from-sky-100 to-white border-sky-200",
  orange: "from-orange-100 to-white border-orange-200",
  green: "from-emerald-100 to-white border-emerald-200",
  teal: "from-teal-100 to-white border-teal-200",
  purple: "from-violet-100 to-white border-violet-200",
  rose: "from-rose-100 to-white border-rose-200",
};

export default async function StudentHome() {
  const user = await requireRole("student");
  const profile = await getStudentProfile(user.id);
  const subjects = await subjectsForStudent(profile.gradeId, user.id);
  const [last] = await sql<{ id: number; title: string; subject: string }[]>`
    select l.id, l.title, s.name as subject from lesson_progress lp
    join lessons l on l.id = lp.lesson_id and l.status = 'published'
    join chapters c on c.id = l.chapter_id join units u on u.id = c.unit_id
    join books b on b.id = u.book_id join subjects s on s.id = b.subject_id
    where lp.student_id = ${user.id} and s.grade_id = ${profile.gradeId}
    order by lp.updated_at desc limit 1`;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-ink-soft">{profile.gradeName}</p>
        <h1 className="text-3xl font-extrabold">أهلاً {user.displayName} 👋</h1>
      </div>

      {last && (
        <Link
          href={`/student/lessons/${last.id}`}
          className="card flex items-center justify-between gap-3 border-brand-200 bg-brand-500 p-5 text-white hover:bg-brand-600"
        >
          <div>
            <p className="text-sm opacity-80">تابع من حيث توقفت · {last.subject}</p>
            <p className="text-xl font-extrabold">{last.title}</p>
          </div>
          <ArrowLeft />
        </Link>
      )}

      <section>
        <h2 className="mb-3 text-xl font-extrabold">موادي</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {subjects.map((s) => {
            const pct = s.lessons ? Math.round((s.completed / s.lessons) * 100) : 0;
            const ready = s.lessons > 0;
            const cls = `card block bg-gradient-to-b p-5 transition ${COLORS[s.color] ?? COLORS.blue}`;
            const inner = (
              <>
                <div className="flex items-start justify-between">
                  <span className="text-4xl" aria-hidden>
                    {s.icon}
                  </span>
                  {ready ? (
                    <span className="badge bg-white text-ink-soft">{s.lessons} درس</span>
                  ) : (
                    <span className="badge bg-white text-ink-soft">قريباً</span>
                  )}
                </div>
                <h3 className="mt-3 text-xl font-extrabold">{s.name}</h3>
                {ready && (
                  <>
                    <ProgressBar value={pct} className="mt-3 bg-white" />
                    <p className="mt-1.5 text-sm text-ink-soft">
                      أنهيت {s.completed} من {s.lessons}
                    </p>
                  </>
                )}
              </>
            );
            return ready ? (
              <Link key={s.id} href={`/student/subjects/${s.id}`} className={`${cls} hover:-translate-y-0.5 hover:shadow-lg`}>
                {inner}
              </Link>
            ) : (
              <div key={s.id} className={`${cls} opacity-70`}>
                {inner}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
