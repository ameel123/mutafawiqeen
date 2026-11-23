import "server-only";
import { sql } from "./db";
import { subjectsForStudent, type Scope } from "./curriculum";

export type ChildSummary = {
  id: number;
  name: string;
  login: string;
  gradeId: number;
  gradeName: string;
  lessonsDone: number;
  lessonsTotal: number;
  attempts: number;
  avgPercent: number | null;
  lastActive: Date | null;
};

export async function childrenOf(parentId: number): Promise<ChildSummary[]> {
  return sql<ChildSummary[]>`
    select u.id, u.display_name as name, u.login, g.id as "gradeId", g.name as "gradeName",
      (select count(*)::int from lesson_progress lp join lessons l on l.id = lp.lesson_id and l.status = 'published'
        where lp.student_id = u.id and lp.completed) as "lessonsDone",
      (select count(*)::int from lessons l join chapters c on c.id = l.chapter_id join units un on un.id = c.unit_id
        join books b on b.id = un.book_id join subjects s on s.id = b.subject_id
        where s.grade_id = g.id and s.is_active and l.status = 'published') as "lessonsTotal",
      (select count(*)::int from quiz_attempts a where a.student_id = u.id) as attempts,
      (select round(avg(percent))::int from (select percent from quiz_attempts a where a.student_id = u.id
        order by created_at desc limit 20) t) as "avgPercent",
      greatest(
        (select max(updated_at) from lesson_progress where student_id = u.id),
        (select max(created_at) from quiz_attempts where student_id = u.id)
      ) as "lastActive"
    from parent_students ps
    join users u on u.id = ps.student_id
    join student_profiles sp on sp.user_id = u.id
    join grades g on g.id = sp.grade_id
    where ps.parent_id = ${parentId}
    order by ps.created_at`;
}

export async function isLinked(parentId: number, studentId: number) {
  const r = await sql`select 1 from parent_students where parent_id = ${parentId} and student_id = ${studentId}`;
  return r.length > 0;
}

export async function childReport(studentId: number, gradeId: number) {
  const [subjects, attempts, weak] = await Promise.all([
    subjectsForStudent(gradeId, studentId),
    sql<{ id: number; scope: Scope; title: string; subject: string; percent: number; createdAt: Date }[]>`
      select a.id, a.scope, a.title, s.name as subject, a.percent, a.created_at as "createdAt"
      from quiz_attempts a join subjects s on s.id = a.subject_id
      where a.student_id = ${studentId} order by a.created_at desc limit 30`,
    sql<{ id: number; title: string; subject: string; bestPercent: number }[]>`
      select l.id, l.title, s.name as subject, lp.best_percent as "bestPercent"
      from lesson_progress lp join lessons l on l.id = lp.lesson_id
      join chapters c on c.id = l.chapter_id join units u on u.id = c.unit_id
      join books b on b.id = u.book_id join subjects s on s.id = b.subject_id
      where lp.student_id = ${studentId} and lp.best_percent is not null and lp.best_percent < 60
      order by lp.best_percent limit 10`,
  ]);
  return { subjects, attempts, weak };
}
