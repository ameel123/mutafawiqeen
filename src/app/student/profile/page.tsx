import { sql } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { getStudentProfile } from "@/lib/curriculum";

export const metadata = { title: "حسابي" };

export default async function ProfilePage() {
  const user = await requireRole("student");
  const profile = await getStudentProfile(user.id);
  const parents = await sql<{ displayName: string }[]>`
    select u.display_name as "displayName" from parent_students ps join users u on u.id = ps.parent_id
    where ps.student_id = ${user.id}`;
  return (
    <div className="mx-auto max-w-lg space-y-5">
      <h1 className="text-3xl font-extrabold">حسابي</h1>
      <div className="card space-y-2 p-5">
        <p>
          <span className="text-ink-soft">الاسم: </span>
          <b>{user.displayName}</b>
        </p>
        <p>
          <span className="text-ink-soft">الصف: </span>
          <b>{profile.gradeName}</b>
        </p>
        <p>
          <span className="text-ink-soft">اسم المستخدم: </span>
          <b dir="ltr">{user.login}</b>
        </p>
      </div>
      <div className="card p-5 text-center">
        <p className="font-extrabold">رمز ربط ولي الأمر</p>
        <p className="mt-1 text-sm text-ink-soft">أعطِ هذا الرمز لولي أمرك ليتابع تقدمك من حسابه.</p>
        <p dir="ltr" className="mt-4 rounded-2xl bg-sun-100 py-4 font-mono text-4xl font-extrabold tracking-[0.3em]" data-testid="link-code">
          {profile.linkCode}
        </p>
        {parents.length > 0 && (
          <p className="mt-3 text-sm text-mint-700">مرتبط بـ: {parents.map((p) => p.displayName).join("، ")}</p>
        )}
      </div>
    </div>
  );
}
