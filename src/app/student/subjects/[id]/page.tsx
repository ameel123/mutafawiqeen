import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, ClipboardList, PlayCircle } from "lucide-react";
import { sql } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { getStudentProfile, subjectTree } from "@/lib/curriculum";
import { ProgressBar } from "@/components/Stars";

export default async function SubjectPage({ params }: PageProps<"/student/subjects/[id]">) {
  const user = await requireRole("student");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const profile = await getStudentProfile(user.id);
  const [subject] = await sql<{ id: number; name: string; icon: string; gradeId: number }[]>`
    select id, name, icon, grade_id as "gradeId" from subjects where id = ${id} and is_active`;
  if (!subject || subject.gradeId !== profile.gradeId) notFound();
  const books = await subjectTree(id, { publishedOnly: true, studentId: user.id });
  const lessons = books.flatMap((b) => b.units.flatMap((u) => u.chapters.flatMap((c) => c.lessons)));
  const done = lessons.filter((l) => l.completed).length;
  const hasQuiz = lessons.some((l) => l.quizCount > 0);
  const multiChapterUnit = (u: (typeof books)[number]["units"][number]) => u.chapters.length > 1;

  return (
    <div className="space-y-6">
      <div className="card p-5">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-5xl" aria-hidden>
            {subject.icon}
          </span>
          <div className="me-auto">
            <Link href="/student" className="text-sm font-bold text-brand-600 hover:underline">
              موادي
            </Link>
            <h1 className="text-3xl font-extrabold">{subject.name}</h1>
            <p className="text-sm text-ink-soft">
              أنهيت {done} من {lessons.length} درس
            </p>
          </div>
          {hasQuiz && (
            <Link href={`/student/quiz/subject/${id}`} className="btn btn-sun">
              <ClipboardList size={18} /> الاختبار الشامل
            </Link>
          )}
        </div>
        <ProgressBar value={lessons.length ? (done / lessons.length) * 100 : 0} className="mt-4" />
      </div>

      {lessons.length === 0 && <div className="card p-8 text-center text-ink-soft">لم تُنشر دروس هذه المادة بعد.</div>}

      {books.map((b) => (
        <div key={b.id} className="space-y-5">
          {books.length > 1 && <h2 className="text-xl font-extrabold">{b.title}</h2>}
          {b.units.map((u) => {
            const unitHasQuiz = u.chapters.some((c) => c.lessons.some((l) => l.quizCount > 0));
            return (
              <section key={u.id} className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-xl font-extrabold text-brand-700">{u.title}</h2>
                  {unitHasQuiz && (
                    <Link href={`/student/quiz/unit/${u.id}`} className="btn btn-outline btn-sm">
                      <ClipboardList size={16} /> اختبار الوحدة
                    </Link>
                  )}
                </div>
                {u.chapters.map((c) => (
                  <div key={c.id} className="space-y-2">
                    {(multiChapterUnit(u) || c.title !== u.title) && (
                      <div className="flex flex-wrap items-center justify-between gap-2 ps-1">
                        <h3 className="font-extrabold text-ink-soft">{c.title}</h3>
                        {multiChapterUnit(u) && c.lessons.some((l) => l.quizCount > 0) && (
                          <Link href={`/student/quiz/chapter/${c.id}`} className="text-sm font-bold text-brand-600 hover:underline">
                            اختبار الفصل
                          </Link>
                        )}
                      </div>
                    )}
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {c.lessons.map((l, i) => (
                        <li key={l.id}>
                          <Link
                            href={`/student/lessons/${l.id}`}
                            className={`card flex items-center gap-3 p-3.5 transition hover:border-brand-200 ${l.completed ? "bg-mint-100/40" : ""}`}
                          >
                            <span
                              className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-extrabold ${
                                l.completed ? "bg-mint-500 text-white" : "bg-brand-50 text-brand-700"
                              }`}
                            >
                              {l.completed ? <CheckCircle2 size={20} /> : i + 1}
                            </span>
                            <span className="book-text me-auto !text-lg !leading-snug font-semibold">{l.title}</span>
                            {l.bestPercent != null ? (
                              <span className="badge bg-sun-100 text-ink">{l.bestPercent}%</span>
                            ) : (
                              <PlayCircle className="text-brand-500" size={22} />
                            )}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            );
          })}
        </div>
      ))}
    </div>
  );
}
