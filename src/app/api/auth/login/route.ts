import { z } from "zod";
import { sql } from "@/lib/db";
import { body, handle } from "@/lib/api";
import { createSession, homeFor, HttpError, verifyPassword, type Role } from "@/lib/auth";

const schema = z.object({
  login: z.string().trim().toLowerCase().min(1, "اكتب اسم المستخدم"),
  password: z.string().min(1, "اكتب كلمة المرور"),
});

// Small in-memory brake on password guessing (per server instance).
const failures = new Map<string, { count: number; until: number }>();

export async function POST(req: Request) {
  return handle(async () => {
    const { login, password } = await body(req, schema);
    const f = failures.get(login);
    if (f && f.count >= 8 && f.until > Date.now()) {
      throw new HttpError(429, "محاولات كثيرة، انتظر بضع دقائق ثم حاول مجدداً");
    }
    const [u] = await sql<{ id: number; password_hash: string; role: Role }[]>`
      select id, password_hash, role from users where login = ${login}`;
    if (!u || !(await verifyPassword(password, u.password_hash))) {
      const cur = failures.get(login);
      failures.set(login, { count: (cur?.count ?? 0) + 1, until: Date.now() + 10 * 60_000 });
      throw new HttpError(401, "اسم المستخدم أو كلمة المرور غير صحيحة");
    }
    failures.delete(login);
    await createSession(u.id);
    return { redirect: homeFor(u.role) };
  });
}
