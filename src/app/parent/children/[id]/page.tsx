import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { childrenOf, childReport } from "@/lib/progress";
import { SCOPE_LABEL } from "@/lib/curriculum";
import { ratingFor } from "@/lib/questions";
import { ProgressBar, Stars } from "@/components/Stars";
import { UnlinkButton } from "@/components/ParentForms";

export default async function ChildPage({ params }: PageProps<"/parent/children/[id]">) {
  const user = await requireRole("parent");
  const id = Number((await params).id);
  const kid = (await childrenOf(user.id)).find((k) => k.id === id);
  if (!kid) notFound();
  const report = await childReport(kid.id, kid.gradeId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/parent" className="text-sm font-bold text-brand-600 hover:underline">
            أبنائي
          </Link>
          <h1 className="text-3xl font-extrabold">{kid.name}</h1>
          <p className="text-ink-soft">
            {kid.gradeName} · اسم المستخدم: <span dir="ltr">{kid.login}</span>
          </p>
        </div>
        <UnlinkButton studentId={kid.id} name={kid.name} />
      </div>

      <section>
        <h2 className="mb-3 text-xl font-extrabold">التقدم في المواد</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {report.subjects.map((s) => (
            <div key={s.id} className="card p-4">
              <p className="font-extrabold">
                {s.icon} {s.name}
              </p>
              {s.lessons ? (
                <>
                  <ProgressBar value={(s.completed / s.lessons) * 100} className="mt-3" />
                  <p className="mt-1 text-sm text-ink-soft">
                    {s.completed} من {s.lessons} درس
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-ink-soft">لا دروس منشورة بعد</p>
              )}
            </div>
          ))}
        </div>
      </section>

      {report.weak.length > 0 && (
        <section className="card border-coral-100 p-5">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-extrabold text-coral-700">
            <AlertTriangle size={20} /> دروس تحتاج مراجعة
          </h2>
          <ul className="space-y-1.5">
            {report.weak.map((w) => (
              <li key={w.id} className="flex justify-between gap-2">
                <span>
                  {w.subject} · <b>{w.title}</b>
                </span>
                <span className="badge bg-coral-100 text-coral-700">{w.bestPercent}%</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-xl font-extrabold">آخر الاختبارات</h2>
        {report.attempts.length === 0 ? (
          <div className="card p-6 text-center text-ink-soft">لم يؤدِّ أي اختبار بعد.</div>
        ) : (
          <ul className="space-y-2">
            {report.attempts.map((a) => (
              <li key={a.id} className="card flex flex-wrap items-center gap-3 p-3.5">
                <div className="me-auto">
                  <p className="text-xs text-ink-soft">
                    {a.subject} · {SCOPE_LABEL[a.scope]} · {new Date(a.createdAt).toLocaleDateString("ar-IQ")}
                  </p>
                  <p className="font-bold">{a.title}</p>
                </div>
                <Stars n={ratingFor(a.percent).stars} size={18} />
                <span className="badge bg-brand-50 text-brand-700">
                  {a.percent}% · {ratingFor(a.percent).rating}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
