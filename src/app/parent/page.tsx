import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { childrenOf } from "@/lib/progress";
import { CreateChildForm, LinkChildForm } from "@/components/ParentForms";
import { ProgressBar } from "@/components/Stars";

export const metadata = { title: "أبنائي" };

function ago(d: Date | null) {
  if (!d) return "لم يبدأ بعد";
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400_000);
  if (days <= 0) return "نشط اليوم";
  if (days === 1) return "آخر نشاط أمس";
  return `آخر نشاط قبل ${days} يوم`;
}

export default async function ParentHome() {
  const user = await requireRole("parent");
  const kids = await childrenOf(user.id);
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-extrabold">أهلاً {user.displayName}</h1>

      {kids.length === 0 ? (
        <div className="card p-6 text-center text-ink-soft">لم تربط أي طالب بعد. اربط حساب طفلك بالرمز أو أنشئ له حساباً.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {kids.map((k) => {
            const pct = k.lessonsTotal ? Math.round((k.lessonsDone / k.lessonsTotal) * 100) : 0;
            return (
              <Link key={k.id} href={`/parent/children/${k.id}`} className="card block p-5 transition hover:border-brand-200" data-testid="child-card">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xl font-extrabold">{k.name}</p>
                    <p className="text-sm text-ink-soft">
                      {k.gradeName} · {ago(k.lastActive)}
                    </p>
                  </div>
                  <ArrowLeft className="text-brand-500" />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-brand-50 p-2">
                    <p className="text-xl font-extrabold text-brand-700">{k.lessonsDone}</p>
                    <p className="text-xs text-ink-soft">درس منجز</p>
                  </div>
                  <div className="rounded-xl bg-sun-100 p-2">
                    <p className="text-xl font-extrabold">{k.attempts}</p>
                    <p className="text-xs text-ink-soft">اختبار</p>
                  </div>
                  <div className="rounded-xl bg-mint-100 p-2">
                    <p className="text-xl font-extrabold text-mint-700">{k.avgPercent != null ? `${k.avgPercent}%` : "—"}</p>
                    <p className="text-xs text-ink-soft">متوسط الدرجات</p>
                  </div>
                </div>
                <ProgressBar value={pct} className="mt-4" />
                <p className="mt-1 text-xs text-ink-soft">
                  {k.lessonsDone} من {k.lessonsTotal} درس منشور
                </p>
              </Link>
            );
          })}
        </div>
      )}

      <section className="card space-y-5 p-5">
        <h2 className="text-lg font-extrabold">إضافة طفل</h2>
        <LinkChildForm />
        <div className="border-t border-line pt-4">
          <p className="mb-2 text-sm text-ink-soft">طفلك صغير ولا يملك حساباً؟ أنشئ له حساباً مرتبطاً بك مباشرة:</p>
          <CreateChildForm />
        </div>
      </section>
    </div>
  );
}
