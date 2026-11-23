import { z } from "zod";
import { json, sql } from "@/lib/db";
import { body, handle } from "@/lib/api";
import { apiUser, HttpError } from "@/lib/auth";
import { getStudentProfile, resolveScope, type Scope } from "@/lib/curriculum";
import { correctAnswerText, gradeAnswer, ratingFor, type StoredQuestion } from "@/lib/questions";

const schema = z.object({
  scope: z.enum(["lesson", "chapter", "unit", "subject"]),
  scopeId: z.number().int().positive(),
  answers: z
    .array(z.object({ questionId: z.number().int().positive(), answer: z.unknown() }))
    .min(1, "لا توجد إجابات")
    .max(200),
});

export async function POST(req: Request) {
  return handle(async () => {
    const user = await apiUser("student");
    const input = await body(req, schema);
    const profile = await getStudentProfile(user.id);
    const resolved = await resolveScope(input.scope as Scope, input.scopeId);
    if (!resolved || resolved.gradeId !== profile.gradeId) throw new HttpError(404, "الاختبار غير متاح");

    const ids = [...new Set(input.answers.map((a) => a.questionId))];
    const questions = await sql<(StoredQuestion & { lessonId: number })[]>`
      select id, kind, type, prompt, options, answer, explanation, points, lesson_id as "lessonId"
      from lesson_questions
      where id in ${sql(ids)} and kind = 'quiz' and lesson_id in ${sql(resolved.lessonIds)}`;
    if (questions.length !== ids.length) throw new HttpError(400, "بعض الأسئلة لا تنتمي لهذا الاختبار");

    const given = new Map(input.answers.map((a) => [a.questionId, a.answer]));
    let earned = 0;
    let total = 0;
    const review = ids.map((id) => {
      const q = questions.find((x) => x.id === id)!;
      const correct = gradeAnswer(q, given.get(id));
      total += q.points;
      if (correct) earned += q.points;
      return {
        questionId: q.id,
        prompt: q.prompt,
        correct,
        correctAnswer: correctAnswerText(q),
        explanation: q.explanation,
        answer: given.get(id) ?? null,
      };
    });
    const percent = total ? Math.round((earned / total) * 100) : 0;
    const rating = ratingFor(percent);

    const attemptId = await sql.begin(async (tx) => {
      const [a] = await tx<{ id: number }[]>`
        insert into quiz_attempts (student_id, scope, scope_id, subject_id, title, earned_points, total_points, percent)
        values (${user.id}, ${input.scope}, ${input.scopeId}, ${resolved.subjectId}, ${resolved.title}, ${earned}, ${total}, ${percent})
        returning id`;
      for (const r of review) {
        await tx`insert into quiz_attempt_answers (attempt_id, question_id, answer, correct)
                 values (${a.id}, ${r.questionId}, ${json(r.answer)}, ${r.correct})`;
      }
      if (input.scope === "lesson") {
        await tx`
          insert into lesson_progress (student_id, lesson_id, best_percent, completed, updated_at)
          values (${user.id}, ${input.scopeId}, ${percent}, true, now())
          on conflict (student_id, lesson_id) do update set
            best_percent = greatest(coalesce(lesson_progress.best_percent, 0), excluded.best_percent),
            completed = true, updated_at = now()`;
      }
      return a.id;
    });

    return {
      attemptId,
      percent,
      earnedPoints: earned,
      totalPoints: total,
      ...rating,
      review: review.map(({ answer: _a, ...r }) => r),
    };
  });
}
