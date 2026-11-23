import { z } from "zod";
import { sql } from "@/lib/db";
import { body, handle } from "@/lib/api";
import { apiUser, HttpError } from "@/lib/auth";
import { correctAnswerText, gradeAnswer, type StoredQuestion } from "@/lib/questions";

// Answer checking for the admin's lesson preview (any question, any status).
export async function POST(req: Request) {
  return handle(async () => {
    await apiUser("admin");
    const { questionId, answer } = await body(req, z.object({ questionId: z.number().int().positive(), answer: z.unknown() }));
    const [q] = await sql<StoredQuestion[]>`
      select id, kind, type, prompt, options, answer, explanation, points from lesson_questions where id = ${questionId}`;
    if (!q) throw new HttpError(404, "السؤال غير موجود");
    return { correct: gradeAnswer(q, answer), correctAnswer: correctAnswerText(q), explanation: q.explanation };
  });
}
