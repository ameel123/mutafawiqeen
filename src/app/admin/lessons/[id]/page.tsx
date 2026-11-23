import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { bookPageImages, lessonContext, lessonQuestions, pageRange } from "@/lib/curriculum";
import { figurePages } from "@/lib/blocks";
import { LessonEditor } from "@/components/admin/LessonEditor";

export const metadata = { title: "تحرير درس" };

export default async function AdminLessonPage({ params }: PageProps<"/admin/lessons/[id]">) {
  await requireRole("admin");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const lesson = await lessonContext(id);
  if (!lesson) notFound();
  const [[book], questions] = await Promise.all([
    sql<{ hasPdf: boolean }[]>`select pdf_path is not null as "hasPdf" from books where id = ${lesson.bookId}`,
    lessonQuestions(id),
  ]);
  const images = await bookPageImages(lesson.bookId, [...pageRange(lesson.pageStart, lesson.pageEnd), ...figurePages(lesson.content)]);

  return (
    <LessonEditor
      key={`${lesson.id}-${lesson.status}`}
      lesson={{
        id: lesson.id,
        title: lesson.title,
        status: lesson.status,
        pageStart: lesson.pageStart,
        pageEnd: lesson.pageEnd,
        content: lesson.content,
        bookId: lesson.bookId,
        bookTitle: lesson.bookTitle,
        unitTitle: lesson.unitTitle,
        subjectName: lesson.subjectName,
        gradeName: lesson.gradeName,
        hasPdf: book.hasPdf,
        pageOffset: lesson.pageOffset,
      }}
      pageImages={images}
      questions={questions}
    />
  );
}
