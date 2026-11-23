import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { QuizRunner } from "@/components/QuizRunner";

export const metadata = { title: "اختبار" };

const SCOPES = ["lesson", "chapter", "unit", "subject"] as const;

export default async function QuizPage({ params }: PageProps<"/student/quiz/[scope]/[id]">) {
  await requireRole("student");
  const { scope, id: raw } = await params;
  const id = Number(raw);
  if (!SCOPES.includes(scope as (typeof SCOPES)[number]) || !Number.isInteger(id)) notFound();

  // Where "back" goes: the lesson for a lesson quiz, otherwise the subject page.
  let back = "/student";
  if (scope === "lesson") back = `/student/lessons/${id}`;
  else if (scope === "subject") back = `/student/subjects/${id}`;
  else {
    const [r] =
      scope === "unit"
        ? await sql<{ s: number }[]>`select b.subject_id as s from units u join books b on b.id = u.book_id where u.id = ${id}`
        : await sql<{ s: number }[]>`select b.subject_id as s from chapters c join units u on u.id = c.unit_id join books b on b.id = u.book_id where c.id = ${id}`;
    if (r) back = `/student/subjects/${r.s}`;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <QuizRunner scope={scope} id={id} backHref={back} />
    </div>
  );
}
