import { z } from "zod";
import { sql } from "@/lib/db";
import { body, handle } from "@/lib/api";
import { apiUser, HttpError } from "@/lib/auth";
import { getStudentProfile, lessonContext } from "@/lib/curriculum";

const schema = z.object({
  lessonId: z.number().int().positive(),
  step: z.number().int().min(0).max(1000),
  completed: z.boolean().optional(),
});

export async function POST(req: Request) {
  return handle(async () => {
    const user = await apiUser("student");
    const { lessonId, step, completed } = await body(req, schema);
    const [profile, lesson] = await Promise.all([getStudentProfile(user.id), lessonContext(lessonId)]);
    if (!lesson || lesson.status !== "published" || lesson.gradeId !== profile.gradeId) {
      throw new HttpError(404, "الدرس غير متاح");
    }
    await sql`
      insert into lesson_progress (student_id, lesson_id, last_step, completed, updated_at)
      values (${user.id}, ${lessonId}, ${step}, ${completed ?? false}, now())
      on conflict (student_id, lesson_id) do update set
        last_step = excluded.last_step,
        completed = lesson_progress.completed or excluded.completed,
        updated_at = now()`;
    return { ok: true };
  });
}
