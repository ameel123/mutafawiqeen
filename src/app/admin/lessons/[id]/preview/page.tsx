import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { bookPageImages, lessonContext, lessonQuestions, pageRange } from "@/lib/curriculum";
import { buildSteps, figurePages } from "@/lib/blocks";
import { toPublicQuestion } from "@/lib/questions";
import { LessonPlayer } from "@/components/LessonPlayer";
import { StatusBadge } from "@/components/admin/ui";

export const metadata = { title: "معاينة الدرس" };

export default async function PreviewPage({ params }: PageProps<"/admin/lessons/[id]/preview">) {
  await requireRole("admin");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const lesson = await lessonContext(id);
  if (!lesson) notFound();
  const range = pageRange(lesson.pageStart, lesson.pageEnd);
  const figs = figurePages(lesson.content);
  const [images, questions] = await Promise.all([bookPageImages(lesson.bookId, [...range, ...figs]), lessonQuestions(id)]);
  const pages = figs.some((p) => images[p]) ? [] : range.filter((p) => images[p]).map((p) => ({ page: p, url: images[p] }));

  return (
    <div className="mx-auto max-w-4xl space-y-3">
      <p className="flex items-center gap-2 rounded-xl bg-sun-100 px-3 py-2 text-sm font-bold">
        معاينة كما يراها الطالب — لا يُحفظ أي تقدم. <StatusBadge status={lesson.status} />
      </p>
      <LessonPlayer
        preview
        lesson={{
          id,
          title: lesson.title,
          subjectId: lesson.subjectId,
          subjectName: lesson.subjectName,
          subjectIcon: lesson.subjectIcon,
          chapterTitle: lesson.unitTitle,
        }}
        steps={buildSteps(lesson.content, images)}
        pages={pages}
        activities={questions.filter((q) => q.kind === "activity").map(toPublicQuestion)}
        quizCount={questions.filter((q) => q.kind === "quiz").length}
        initialStep={0}
        completed={false}
        next={null}
        prev={null}
      />
    </div>
  );
}
