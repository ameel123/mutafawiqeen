import Link from "next/link";
import { sql } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { SCOPE_LABEL, type Scope } from "@/lib/curriculum";
import { ratingFor } from "@/lib/questions";
import { Stars } from "@/components/Stars";

export const metadata = { title: "نتائجي" };

export default async function ResultsPage() {
  const user = await requireRole("student");
  const attempts = await sql<
    { id: number; scope: Scope; scopeId: number; title: string; subject: string; percent: number; createdAt: Date }[]
  >`
    select a.id, a.scope, a.scope_id as "scopeId", a.title, s.name as subject, a.percent, a.created_at as "createdAt"
    from quiz_attempts a join subjects s on s.id = a.subject_id
    where a.student_id = ${user.id} order by a.created_at desc limit 100`;

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-extrabold">نتائجي</h1>
      {attempts.length === 0 ? (
        <div className="card p-8 text-center text-ink-soft">
          لم تؤدِّ أي اختبار بعد.{" "}
          <Link href="/student" className="font-bold text-brand-600 hover:underline">
            ابدأ درساً
          </Link>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {attempts.map((a) => {
            const r = ratingFor(a.percent);
            return (
              <li key={a.id} className="card flex flex-wrap items-center gap-3 p-4">
                <div className="me-auto">
                  <p className="text-xs text-ink-soft">
                    {a.subject} · {SCOPE_LABEL[a.scope]} · {new Date(a.createdAt).toLocaleDateString("ar-IQ")}
                  </p>
                  <p className="font-extrabold">{a.title}</p>
                </div>
                <Stars n={r.stars} size={20} />
                <span className="badge bg-brand-50 text-base text-brand-700">{a.percent}%</span>
                <Link href={`/student/quiz/${a.scope}/${a.scopeId}`} className="btn btn-outline btn-sm">
                  أعد
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
