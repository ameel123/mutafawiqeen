import { z } from "zod";
import { sql } from "@/lib/db";
import { body, handle } from "@/lib/api";
import { createSession, hashPassword, homeFor, HttpError, newLinkCode, type Role } from "@/lib/auth";

const schema = z.object({
  login: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "اسم المستخدم 3 أحرف على الأقل")
    .max(120)
    .regex(/^[a-z0-9._@+\-]+$/, "اسم المستخدم بالأحرف الإنكليزية أو الأرقام أو البريد الإلكتروني"),
  password: z.string().min(6, "كلمة المرور 6 أحرف على الأقل").max(200),
  displayName: z.string().trim().min(2, "اكتب الاسم").max(80),
  role: z.enum(["student", "parent"]),
  gradeNumber: z.number().int().min(1).max(6).optional(),
});

export async function POST(req: Request) {
  return handle(async () => {
    const input = await body(req, schema);
    const adminLogin = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const role: Role = adminLogin && input.login === adminLogin ? "admin" : input.role;
    if (role === "student" && !input.gradeNumber) throw new HttpError(400, "اختر الصف الدراسي");

    const exists = await sql`select 1 from users where login = ${input.login}`;
    if (exists.length) throw new HttpError(409, "اسم المستخدم مستعمل، اختر اسماً آخر");

    const hash = await hashPassword(input.password);
    const userId = await sql.begin(async (tx) => {
      const [u] = await tx<{ id: number }[]>`
        insert into users (login, password_hash, display_name, role)
        values (${input.login}, ${hash}, ${input.displayName}, ${role}) returning id`;
      if (role === "student") {
        const [g] = await tx<{ id: number }[]>`select id from grades where number = ${input.gradeNumber!}`;
        await tx`insert into student_profiles (user_id, grade_id, link_code) values (${u.id}, ${g.id}, ${newLinkCode()})`;
      }
      return u.id;
    });
    await createSession(userId);
    return { redirect: homeFor(role) };
  });
}
