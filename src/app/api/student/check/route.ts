import { z } from "zod";
import { sql } from "@/lib/db";
import { body, handle } from "@/lib/api";
import { apiUser, HttpError } from "@/lib/auth";
import { getStudentProfile } from "@/lib/curriculum";
import { correctAnswerText, gradeAnswer, type StoredQuestion } from "@/lib/questions";

// Instant feedback for lesson activities (practice). Quiz questions are graded only on submit.
const schema = z.object({ questionId: z.number().int().positive(), answer: z.unknown() });

export async function POST(req: Request) {
  return handle(async () => {
    const user = await apiUser("student");
    const { questionId, answer } = await body(req, schema);
    const profile = await getStudentProfile(user.id);
    const [q] = await sql<(StoredQuestion & { gradeId: number })[]>`
      select q.id, q.kind, q.type, q.prompt, q.options, q.answer, q.explanation, q.points, s.grade_id as "gradeId"
      from lesson_questions q
      join lessons l on l.id = q.lesson_id and l.status = 'published'
      join chapters c on c.id = l.chapter_id join units u on u.id = c.unit_id
      join books b on b.id = u.book_id join subjects s on s.id = b.subject_id
      where q.id = ${questionId} and q.kind = 'activity'`;
    if (!q || q.gradeId !== profile.gradeId) throw new HttpError(404, "النشاط غير موجود");
    const correct = gradeAnswer(q, answer);
    return { correct, correctAnswer: correctAnswerText(q), explanation: q.explanation };
  });
}
