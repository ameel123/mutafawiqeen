import { z } from "zod";
import { sql } from "@/lib/db";
import { handle } from "@/lib/api";
import { apiUser, HttpError } from "@/lib/auth";
import { getStudentProfile, resolveScope, SCOPE_LABEL, SCOPE_LIMIT, type Scope } from "@/lib/curriculum";
import { toPublicQuestion, type StoredQuestion } from "@/lib/questions";

const query = z.object({
  scope: z.enum(["lesson", "chapter", "unit", "subject"]),
  id: z.coerce.number().int().positive(),
});

function shuffle<T>(a: T[]): T[] {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Spreads a limited draw across lessons: one from each lesson in turn. */
function draw(questions: (StoredQuestion & { lessonId: number })[], limit: number) {
  if (questions.length <= limit) return questions;
  const byLesson = new Map<number, (StoredQuestion & { lessonId: number })[]>();
  for (const q of shuffle(questions)) {
    const list = byLesson.get(q.lessonId) ?? [];
    list.push(q);
    byLesson.set(q.lessonId, list);
  }
  const queues = shuffle([...byLesson.values()]);
  const out: typeof questions = [];
  while (out.length < limit) {
    for (const q of queues) {
      const next = q.shift();
      if (next) out.push(next);
      if (out.length >= limit) break;
    }
  }
  return out;
}

export async function GET(req: Request) {
  return handle(async () => {
    const user = await apiUser("student");
    const u = new URL(req.url);
    const { scope, id } = query.parse({ scope: u.searchParams.get("scope"), id: u.searchParams.get("id") });
    const profile = await getStudentProfile(user.id);
    const resolved = await resolveScope(scope as Scope, id);
    if (!resolved || resolved.gradeId !== profile.gradeId) throw new HttpError(404, "الاختبار غير متاح");

    const all = await sql<(StoredQuestion & { lessonId: number })[]>`
      select q.id, q.kind, q.type, q.prompt, q.options, q.answer, q.explanation, q.points, q.lesson_id as "lessonId"
      from lesson_questions q
      join lessons l on l.id = q.lesson_id
      join chapters c on c.id = l.chapter_id
      join units un on un.id = c.unit_id
      where q.lesson_id in ${sql(resolved.lessonIds)} and q.kind = 'quiz'
      order by un.sort_order, c.sort_order, l.sort_order, q.sort_order, q.id`;
    if (!all.length) throw new HttpError(404, "لا توجد أسئلة لهذا الاختبار بعد");

    const picked = scope === "lesson" ? all : draw(all, SCOPE_LIMIT[scope as Scope]);
    return {
      scope,
      scopeId: id,
      title: resolved.title,
      label: SCOPE_LABEL[scope as Scope],
      subjectId: resolved.subjectId,
      subjectName: resolved.subjectName,
      questions: (scope === "lesson" ? picked : shuffle(picked)).map(toPublicQuestion),
    };
  });
}
