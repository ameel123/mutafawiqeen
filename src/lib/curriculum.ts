import "server-only";
import { sql } from "./db";
import type { Block } from "./blocks";
import type { StoredQuestion } from "./questions";
import { HttpError } from "./auth";

export type LessonStatus = "draft" | "extracted" | "reviewed" | "published";
export type Scope = "lesson" | "chapter" | "unit" | "subject";

export const STATUS_LABEL: Record<LessonStatus, string> = {
  draft: "مسودة",
  extracted: "مستخرج",
  reviewed: "تمت المراجعة",
  published: "منشور",
};

export type StudentProfile = { gradeId: number; gradeNumber: number; gradeName: string; linkCode: string };

export async function getStudentProfile(userId: number): Promise<StudentProfile> {
  const [p] = await sql<StudentProfile[]>`
    select g.id as "gradeId", g.number as "gradeNumber", g.name as "gradeName", sp.link_code as "linkCode"
    from student_profiles sp join grades g on g.id = sp.grade_id where sp.user_id = ${userId}`;
  if (!p) throw new HttpError(404, "ملف الطالب غير موجود");
  return p;
}

export type SubjectCard = {
  id: number;
  name: string;
  icon: string;
  color: string;
  lessons: number;
  completed: number;
};

/** Active subjects of a grade with the student's published-lesson progress. */
export async function subjectsForStudent(gradeId: number, studentId: number): Promise<SubjectCard[]> {
  return sql<SubjectCard[]>`
    select s.id, s.name, s.icon, s.color,
      count(l.id)::int as lessons,
      count(lp.lesson_id) filter (where lp.completed)::int as completed
    from subjects s
    left join books b on b.subject_id = s.id
    left join units u on u.book_id = b.id
    left join chapters c on c.unit_id = u.id
    left join lessons l on l.chapter_id = c.id and l.status = 'published'
    left join lesson_progress lp on lp.lesson_id = l.id and lp.student_id = ${studentId}
    where s.grade_id = ${gradeId} and s.is_active
    group by s.id order by s.sort_order, s.id`;
}

export type TreeLesson = {
  id: number;
  title: string;
  sortOrder: number;
  status: LessonStatus;
  pageStart: number | null;
  pageEnd: number | null;
  quizCount: number;
  activityCount: number;
  completed: boolean;
  bestPercent: number | null;
};
export type TreeChapter = { id: number; title: string; sortOrder: number; lessons: TreeLesson[] };
export type TreeUnit = { id: number; title: string; sortOrder: number; chapters: TreeChapter[] };
export type TreeBook = { id: number; title: string; edition: string | null; pageCount: number | null; units: TreeUnit[] };

/** Book → unit → chapter → lesson tree of a subject. */
export async function subjectTree(
  subjectId: number,
  opts: { publishedOnly: boolean; studentId?: number },
): Promise<TreeBook[]> {
  const books = await sql<{ id: number; title: string; edition: string | null; pageCount: number | null }[]>`
    select id, title, edition, page_count as "pageCount" from books where subject_id = ${subjectId} order by id`;
  if (!books.length) return [];
  const bookIds = books.map((b) => b.id);
  const units = await sql<{ id: number; bookId: number; title: string; sortOrder: number }[]>`
    select id, book_id as "bookId", title, sort_order as "sortOrder" from units
    where book_id in ${sql(bookIds)} order by sort_order, id`;
  const unitIds = units.map((u) => u.id);
  const chapters = unitIds.length
    ? await sql<{ id: number; unitId: number; title: string; sortOrder: number }[]>`
        select id, unit_id as "unitId", title, sort_order as "sortOrder" from chapters
        where unit_id in ${sql(unitIds)} order by sort_order, id`
    : [];
  const chapterIds = chapters.map((c) => c.id);
  const studentId = opts.studentId ?? 0;
  const lessons = chapterIds.length
    ? await sql<(TreeLesson & { chapterId: number })[]>`
        select l.id, l.chapter_id as "chapterId", l.title, l.sort_order as "sortOrder", l.status,
          l.page_start as "pageStart", l.page_end as "pageEnd",
          (select count(*)::int from lesson_questions q where q.lesson_id = l.id and q.kind = 'quiz') as "quizCount",
          (select count(*)::int from lesson_questions q where q.lesson_id = l.id and q.kind = 'activity') as "activityCount",
          coalesce(lp.completed, false) as completed, lp.best_percent as "bestPercent"
        from lessons l
        left join lesson_progress lp on lp.lesson_id = l.id and lp.student_id = ${studentId}
        where l.chapter_id in ${sql(chapterIds)}
          ${opts.publishedOnly ? sql`and l.status = 'published'` : sql``}
        order by l.sort_order, l.id`
    : [];

  return books.map((b) => ({
    ...b,
    units: units
      .filter((u) => u.bookId === b.id)
      .map((u) => ({
        id: u.id,
        title: u.title,
        sortOrder: u.sortOrder,
        chapters: chapters
          .filter((c) => c.unitId === u.id)
          .map((c) => ({
            id: c.id,
            title: c.title,
            sortOrder: c.sortOrder,
            lessons: lessons.filter((l) => l.chapterId === c.id).map(({ chapterId: _c, ...l }) => l),
          }))
          .filter((c) => !opts.publishedOnly || c.lessons.length > 0),
      }))
      .filter((u) => !opts.publishedOnly || u.chapters.length > 0),
  }));
}

export type LessonContext = {
  id: number;
  title: string;
  status: LessonStatus;
  pageStart: number | null;
  pageEnd: number | null;
  content: Block[];
  chapterId: number;
  chapterTitle: string;
  unitId: number;
  unitTitle: string;
  bookId: number;
  bookTitle: string;
  pageOffset: number;
  subjectId: number;
  subjectName: string;
  subjectIcon: string;
  gradeId: number;
  gradeName: string;
};

export async function lessonContext(lessonId: number): Promise<LessonContext | null> {
  const [l] = await sql<LessonContext[]>`
    select l.id, l.title, l.status, l.page_start as "pageStart", l.page_end as "pageEnd", l.content,
      c.id as "chapterId", c.title as "chapterTitle", u.id as "unitId", u.title as "unitTitle",
      b.id as "bookId", b.title as "bookTitle", b.page_offset as "pageOffset", s.id as "subjectId", s.name as "subjectName", s.icon as "subjectIcon",
      g.id as "gradeId", g.name as "gradeName"
    from lessons l
    join chapters c on c.id = l.chapter_id
    join units u on u.id = c.unit_id
    join books b on b.id = u.book_id
    join subjects s on s.id = b.subject_id
    join grades g on g.id = s.grade_id
    where l.id = ${lessonId}`;
  return l ?? null;
}

/**
 * Page images keyed by PRINTED page number (lessons and figures use printed numbers;
 * the PDF page is printed + book.page_offset).
 */
export async function bookPageImages(bookId: number, printedPages: number[]): Promise<Record<number, string>> {
  const pages = [...new Set(printedPages.filter((p) => Number.isInteger(p) && p > 0))];
  if (!pages.length) return {};
  const [b] = await sql<{ offset: number }[]>`select page_offset as offset from books where id = ${bookId}`;
  const off = b?.offset ?? 0;
  const rows = await sql<{ page: number; url: string }[]>`
    select page, url from book_pages where book_id = ${bookId} and page in ${sql(pages.map((p) => p + off))}`;
  return Object.fromEntries(rows.map((r) => [r.page - off, r.url]));
}

export function pageRange(from: number | null, to: number | null): number[] {
  if (!from) return [];
  const end = Math.max(from, to ?? from);
  return Array.from({ length: Math.min(end - from + 1, 40) }, (_, i) => from + i);
}

/** Published neighbours of a lesson inside its subject (reading order). */
export async function lessonNeighbours(subjectId: number, lessonId: number) {
  const rows = await sql<{ id: number; title: string }[]>`
    select l.id, l.title from lessons l
    join chapters c on c.id = l.chapter_id join units u on u.id = c.unit_id join books b on b.id = u.book_id
    where b.subject_id = ${subjectId} and l.status = 'published'
    order by b.id, u.sort_order, u.id, c.sort_order, c.id, l.sort_order, l.id`;
  const i = rows.findIndex((r) => r.id === lessonId);
  return { prev: i > 0 ? rows[i - 1] : null, next: i >= 0 && i < rows.length - 1 ? rows[i + 1] : null };
}

export async function lessonQuestions(lessonId: number, kind?: "activity" | "quiz"): Promise<StoredQuestion[]> {
  return sql<StoredQuestion[]>`
    select id, kind, type, prompt, options, answer, explanation, points from lesson_questions
    where lesson_id = ${lessonId} ${kind ? sql`and kind = ${kind}` : sql``}
    order by kind, sort_order, id`;
}

/** Scope → its title, subject and grade, plus the ids of its published lessons. */
export async function resolveScope(scope: Scope, id: number) {
  const base = sql`
    from lessons l join chapters c on c.id = l.chapter_id join units u on u.id = c.unit_id
    join books b on b.id = u.book_id join subjects s on s.id = b.subject_id`;
  const where =
    scope === "lesson"
      ? sql`l.id = ${id}`
      : scope === "chapter"
        ? sql`c.id = ${id}`
        : scope === "unit"
          ? sql`u.id = ${id}`
          : sql`s.id = ${id}`;
  const title =
    scope === "lesson"
      ? sql`l.title`
      : scope === "chapter"
        ? sql`c.title`
        : scope === "unit"
          ? sql`u.title`
          : sql`s.name`;
  const rows = await sql<{ lessonId: number; title: string; subjectId: number; subjectName: string; gradeId: number }[]>`
    select l.id as "lessonId", ${title} as title, s.id as "subjectId", s.name as "subjectName", s.grade_id as "gradeId"
    ${base} where ${where} and l.status = 'published'`;
  if (!rows.length) return null;
  return {
    title: rows[0].title,
    subjectId: rows[0].subjectId,
    subjectName: rows[0].subjectName,
    gradeId: rows[0].gradeId,
    lessonIds: rows.map((r) => r.lessonId),
  };
}

export const SCOPE_LABEL: Record<Scope, string> = {
  lesson: "اختبار الدرس",
  chapter: "اختبار الفصل",
  unit: "اختبار الوحدة",
  subject: "الاختبار الشامل",
};

/** How many questions a scoped quiz draws (lesson quizzes use all of them). */
export const SCOPE_LIMIT: Record<Scope, number> = { lesson: 100, chapter: 15, unit: 20, subject: 25 };
