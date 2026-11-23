import { z } from "zod";
import { sql } from "@/lib/db";
import { body, handle } from "@/lib/api";
import { apiUser, hashPassword, HttpError, newLinkCode } from "@/lib/auth";

const linkSchema = z.object({ code: z.string().trim().toUpperCase().min(4, "اكتب رمز الربط").max(12) });

const createSchema = z.object({
  displayName: z.string().trim().min(2, "اكتب اسم الطفل").max(80),
  login: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "اسم المستخدم 3 أحرف على الأقل")
    .max(120)
    .regex(/^[a-z0-9._@+\-]+$/, "اسم المستخدم بالأحرف الإنكليزية أو الأرقام"),
  password: z.string().min(6, "كلمة المرور 6 أحرف على الأقل").max(200),
  gradeNumber: z.number().int().min(1).max(6),
});

/** Link an existing student by code ({code}) or create a child account ({displayName, login, password, gradeNumber}). */
export async function POST(req: Request) {
  return handle(async () => {
    const parent = await apiUser("parent");
    const raw = await req.json().catch(() => null);
    if (raw && typeof raw === "object" && "code" in raw) {
      const { code } = linkSchema.parse(raw);
      const [s] = await sql<{ id: number; name: string }[]>`
        select u.id, u.display_name as name from student_profiles sp join users u on u.id = sp.user_id
        where sp.link_code = ${code}`;
      if (!s) throw new HttpError(404, "الرمز غير صحيح، تأكد منه من صفحة «حسابي» عند الطالب");
      await sql`insert into parent_students (parent_id, student_id) values (${parent.id}, ${s.id}) on conflict do nothing`;
      return { studentId: s.id, name: s.name };
    }

    const input = createSchema.parse(raw);
    const exists = await sql`select 1 from users where login = ${input.login}`;
    if (exists.length) throw new HttpError(409, "اسم المستخدم مستعمل، اختر اسماً آخر");
    const hash = await hashPassword(input.password);
    const id = await sql.begin(async (tx) => {
      const [u] = await tx<{ id: number }[]>`
        insert into users (login, password_hash, display_name, role)
        values (${input.login}, ${hash}, ${input.displayName}, 'student') returning id`;
      const [g] = await tx<{ id: number }[]>`select id from grades where number = ${input.gradeNumber}`;
      await tx`insert into student_profiles (user_id, grade_id, link_code) values (${u.id}, ${g.id}, ${newLinkCode()})`;
      await tx`insert into parent_students (parent_id, student_id) values (${parent.id}, ${u.id})`;
      return u.id;
    });
    return { studentId: id, name: input.displayName };
  });
}

const unlinkSchema = z.object({ studentId: z.number().int().positive() });

export async function DELETE(req: Request) {
  return handle(async () => {
    const parent = await apiUser("parent");
    const { studentId } = await body(req, unlinkSchema);
    await sql`delete from parent_students where parent_id = ${parent.id} and student_id = ${studentId}`;
    return { ok: true };
  });
}
