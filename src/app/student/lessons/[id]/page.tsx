import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { bookPageImages, getStudentProfile, lessonContext, lessonNeighbours, lessonQuestions, pageRange } from "@/lib/curriculum";
import { buildSteps, figurePages } from "@/lib/blocks";
import { toPublicQuestion } from "@/lib/questions";
import { LessonPlayer } from "@/components/LessonPlayer";

export async function generateMetadata({ params }: PageProps<"/student/lessons/[id]">) {
  const id = Number((await params).id);
  const l = Number.isInteger(id) ? await lessonContext(id) : null;
  return { title: l?.title ?? "درس" };
}

export default async function LessonPage({ params }: PageProps<"/student/lessons/[id]">) {
  const user = await requireRole("student");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [profile, lesson] = await Promise.all([getStudentProfile(user.id), lessonContext(id)]);
  if (!lesson || lesson.status !== "published" || lesson.gradeId !== profile.gradeId) notFound();

  const range = pageRange(lesson.pageStart, lesson.pageEnd);
  const figPages = figurePages(lesson.content);
  const [images, questions, nb, progress] = await Promise.all([
    bookPageImages(lesson.bookId, [...range, ...figPages]),
    lessonQuestions(id),
    lessonNeighbours(lesson.subjectId, id),
    sql<{ lastStep: number; completed: boolean }[]>`
      select last_step as "lastStep", completed from lesson_progress where student_id = ${user.id} and lesson_id = ${id}`,
  ]);
  const steps = buildSteps(lesson.content, images);
  // The "book page" button is only useful when the pages are not already inside the lesson.
  const pages = figPages.some((p) => images[p]) ? [] : range.filter((p) => images[p]).map((p) => ({ page: p, url: images[p] }));
  const p = progress[0];
  // Re-opening a finished lesson starts from the beginning.
  const initialStep = p && !p.completed ? p.lastStep : 0;

  return (
    <LessonPlayer
      lesson={{
        id,
        title: lesson.title,
        subjectId: lesson.subjectId,
        subjectName: lesson.subjectName,
        subjectIcon: lesson.subjectIcon,
        chapterTitle: lesson.unitTitle === lesson.chapterTitle ? lesson.unitTitle : `${lesson.unitTitle} · ${lesson.chapterTitle}`,
      }}
      steps={steps}
      pages={pages}
      activities={questions.filter((q) => q.kind === "activity").map(toPublicQuestion)}
      quizCount={questions.filter((q) => q.kind === "quiz").length}
      initialStep={initialStep}
      completed={!!p?.completed}
      next={nb.next}
      prev={nb.prev}
    />
  );
}
