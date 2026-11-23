import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpenCheck, ClipboardCheck, Headphones, Users } from "lucide-react";
import { Logo } from "@/components/Logo";
import { getUser, homeFor } from "@/lib/auth";

const FEATURES = [
  { icon: BookOpenCheck, title: "كتب المنهج الرسمي", text: "الدروس مرتبة كما في الكتاب: وحدات وفصول ودروس، بصور الكتاب نفسه." },
  { icon: Headphones, title: "صوت المعلم", text: "يقرأ الدرس بصوت واضح وبطيء، ويمكن إعادته في أي وقت." },
  { icon: ClipboardCheck, title: "أنشطة واختبارات", text: "تدريبات بعد كل درس واختبارات للفصل والوحدة والمادة بتقييم فوري." },
  { icon: Users, title: "متابعة ولي الأمر", text: "يربط ولي الأمر حساب طفله برمز بسيط ويتابع تقدمه ونتائجه." },
];

export default async function Home() {
  const user = await getUser();
  if (user) redirect(homeFor(user.role));

  return (
    <main className="bg-dots flex-1">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Logo />
        <div className="flex gap-2">
          <Link href="/login" className="btn btn-outline">
            تسجيل الدخول
          </Link>
          <Link href="/register" className="btn btn-primary hidden sm:inline-flex">
            حساب جديد
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-6 md:grid-cols-[1.1fr_1fr] md:pt-14">
        <div className="animate-rise">
          <span className="badge bg-sun-100 text-ink">من الصف الأول إلى السادس الابتدائي</span>
          <h1 className="mt-4 text-4xl font-extrabold leading-[1.25] md:text-[3.4rem]">
            المنهج العراقي
            <br />
            <span className="text-brand-500">يتعلّمه طفلك بمتعة</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-ink-soft">
            دروس الكتاب المدرسي نفسه، يشرحها صوت المعلم خطوة بخطوة، ثم أنشطة واختبارات تقيس الفهم وتكافئ التقدم.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/register?role=student" className="btn btn-primary px-6 py-3 text-lg">
              ابدأ كطالب
            </Link>
            <Link href="/register?role=parent" className="btn btn-sun px-6 py-3 text-lg">
              أنا ولي أمر
            </Link>
          </div>
        </div>

        <div className="relative">
          <div className="card rotate-[-1.5deg] p-6">
            <div className="flex items-center justify-between">
              <span className="badge bg-brand-50 text-brand-700">قراءتي · الصف الأول</span>
              <span className="text-2xl">📖</span>
            </div>
            <p className="book-text mt-4 text-center text-[2rem] text-brand-900">دار&nbsp;&nbsp;دادا</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border-2 border-mint-500 bg-mint-100 p-3 text-center font-bold text-mint-700">
                ✓ دار
              </div>
              <div className="rounded-xl border border-line bg-white p-3 text-center font-bold text-ink-soft">باب</div>
            </div>
            <div className="mt-5 flex items-center gap-2 text-sm text-ink-soft">
              <span className="text-sun-500">★★★</span> ممتاز! أجبت عن كل الأسئلة
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-20">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="card p-5">
              <f.icon className="text-brand-500" size={28} />
              <h3 className="mt-3 text-lg font-extrabold">{f.title}</h3>
              <p className="mt-1.5 leading-7 text-ink-soft">{f.text}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
