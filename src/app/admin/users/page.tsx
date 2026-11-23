import { sql } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { UsersTable } from "@/components/admin/UsersTable";

export const metadata = { title: "المستخدمون" };

export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  const me = await requireRole("admin");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const role = typeof sp.role === "string" && ["student", "parent", "admin"].includes(sp.role) ? sp.role : "";
  const like = `%${q}%`;
  const users = await sql<
    {
      id: number;
      login: string;
      displayName: string;
      role: "student" | "parent" | "admin";
      createdAt: Date;
      grade: number | null;
      linkCode: string | null;
      attempts: number;
      children: number;
    }[]
  >`
    select u.id, u.login, u.display_name as "displayName", u.role, u.created_at as "createdAt",
      g.number as grade, sp.link_code as "linkCode",
      (select count(*)::int from quiz_attempts a where a.student_id = u.id) as attempts,
      (select count(*)::int from parent_students ps where ps.parent_id = u.id) as children
    from users u
    left join student_profiles sp on sp.user_id = u.id
    left join grades g on g.id = sp.grade_id
    where (${q} = '' or u.login ilike ${like} or u.display_name ilike ${like})
      and (${role} = '' or u.role::text = ${role})
    order by u.created_at desc limit 200`;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">المستخدمون</h1>
      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={q} className="input max-w-xs" placeholder="بحث بالاسم أو اسم المستخدم" aria-label="بحث" />
        <select name="role" defaultValue={role} className="input w-40" aria-label="الدور">
          <option value="">الكل</option>
          <option value="student">طلاب</option>
          <option value="parent">أولياء أمور</option>
          <option value="admin">مشرفون</option>
        </select>
        <button className="btn btn-outline">بحث</button>
      </form>
      <UsersTable users={users} meId={me.id} />
    </div>
  );
}
