import { z } from "zod";
import { sql } from "@/lib/db";
import { body, handle } from "@/lib/api";
import { apiUser, hashPassword, HttpError, newLinkCode } from "@/lib/auth";

const updateSchema = z.object({
  id: z.number().int().positive(),
  role: z.enum(["student", "parent", "admin"]).optional(),
  password: z.string().min(6, "كلمة المرور 6 أحرف على الأقل").max(200).optional(),
  gradeNumber: z.number().int().min(1).max(6).optional(),
  displayName: z.string().trim().min(2).max(80).optional(),
});

export async function PATCH(req: Request) {
  return handle(async () => {
    const admin = await apiUser("admin");
    const u = await body(req, updateSchema);
    if (u.id === admin.id && u.role && u.role !== "admin") throw new HttpError(400, "لا يمكنك إزالة صلاحية المشرف عن نفسك");
    await sql.begin(async (tx) => {
      const [cur] = await tx<{ role: string }[]>`select role from users where id = ${u.id}`;
      if (!cur) throw new HttpError(404, "المستخدم غير موجود");
      if (u.displayName) await tx`update users set display_name = ${u.displayName} where id = ${u.id}`;
      if (u.password) {
        await tx`update users set password_hash = ${await hashPassword(u.password)} where id = ${u.id}`;
        await tx`delete from sessions where user_id = ${u.id}`;
      }
      const role = u.role ?? cur.role;
      if (u.role && u.role !== cur.role) await tx`update users set role = ${u.role} where id = ${u.id}`;
      if (role === "student" && (u.gradeNumber || u.role === "student")) {
        const [g] = await tx<{ id: number }[]>`select id from grades where number = ${u.gradeNumber ?? 1}`;
        const [p] = await tx`select 1 from student_profiles where user_id = ${u.id}`;
        if (p) {
          if (u.gradeNumber) await tx`update student_profiles set grade_id = ${g.id} where user_id = ${u.id}`;
        } else {
          await tx`insert into student_profiles (user_id, grade_id, link_code) values (${u.id}, ${g.id}, ${newLinkCode()})`;
        }
      }
    });
    return { ok: true };
  });
}

export async function DELETE(req: Request) {
  return handle(async () => {
    const admin = await apiUser("admin");
    const { id } = await body(req, z.object({ id: z.number().int().positive() }));
    if (id === admin.id) throw new HttpError(400, "لا يمكنك حذف حسابك");
    await sql`delete from users where id = ${id}`;
    return { ok: true };
  });
}
