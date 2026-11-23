-- منصة المتفوقين — مخطط قاعدة البيانات (PostgreSQL 15+ / Supabase)
-- يُشغَّل مرة واحدة على قاعدة فارغة.

create type user_role as enum ('student', 'parent', 'admin');
create type lesson_status as enum ('draft', 'extracted', 'reviewed', 'published');
create type question_kind as enum ('activity', 'quiz');
create type question_type as enum ('mcq', 'true_false', 'fill_blank', 'ordering', 'matching');
create type attempt_scope as enum ('lesson', 'chapter', 'unit', 'subject');

-- ===== المستخدمون والجلسات =====
create table users (
  id            serial primary key,
  login         text not null unique, -- البريد أو اسم المستخدم (بأحرف صغيرة)
  password_hash text not null,
  display_name  text not null,
  role          user_role not null default 'student',
  created_at    timestamptz not null default now()
);

create table sessions (
  token_hash text primary key,
  user_id    int not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index sessions_user_idx on sessions(user_id);

create table grades (
  id     serial primary key,
  number int not null unique,
  name   text not null
);

create table student_profiles (
  user_id   int primary key references users(id) on delete cascade,
  grade_id  int not null references grades(id),
  link_code text not null unique
);

create table parent_students (
  parent_id  int not null references users(id) on delete cascade,
  student_id int not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (parent_id, student_id)
);
create index parent_students_student_idx on parent_students(student_id);

-- ===== المنهج =====
create table subjects (
  id         serial primary key,
  grade_id   int not null references grades(id) on delete cascade,
  name       text not null,
  icon       text not null default '📘',
  color      text not null default 'blue',
  sort_order int not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
create index subjects_grade_idx on subjects(grade_id);

create table books (
  id             serial primary key,
  subject_id     int not null references subjects(id) on delete cascade,
  title          text not null,
  edition        text,
  pdf_path       text,
  pdf_size_bytes bigint,
  page_count     int,
  -- رقم صفحة ملف PDF = رقم الصفحة المطبوع + page_offset (الدروس تستعمل الأرقام المطبوعة)
  page_offset    int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index books_subject_idx on books(subject_id);

-- صورة لكل صفحة من صفحات ملف PDF (تُولَّد في المتصفح)؛ page = رقم الصفحة داخل الملف
create table book_pages (
  book_id int not null references books(id) on delete cascade,
  page    int not null,
  url     text not null,
  primary key (book_id, page)
);

create table units (
  id         serial primary key,
  book_id    int not null references books(id) on delete cascade,
  title      text not null,
  sort_order int not null default 0
);
create index units_book_idx on units(book_id);

create table chapters (
  id         serial primary key,
  unit_id    int not null references units(id) on delete cascade,
  title      text not null,
  sort_order int not null default 0
);
create index chapters_unit_idx on chapters(unit_id);

create table lessons (
  id           serial primary key,
  chapter_id   int not null references chapters(id) on delete cascade,
  title        text not null,
  sort_order   int not null default 0,
  page_start   int,
  page_end     int,
  status       lesson_status not null default 'draft',
  content      jsonb not null default '[]'::jsonb,
  reviewed_by  int references users(id) on delete set null,
  reviewed_at  timestamptz,
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index lessons_chapter_idx on lessons(chapter_id);

create table lesson_questions (
  id          serial primary key,
  lesson_id   int not null references lessons(id) on delete cascade,
  kind        question_kind not null,
  type        question_type not null,
  prompt      text not null,
  options     jsonb not null default '[]'::jsonb,
  answer      jsonb not null default 'null'::jsonb,
  explanation text,
  points      int not null default 1,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create index lesson_questions_lesson_idx on lesson_questions(lesson_id);

-- ===== التقدم والتقييم =====
create table lesson_progress (
  student_id   int not null references users(id) on delete cascade,
  lesson_id    int not null references lessons(id) on delete cascade,
  last_step    int not null default 0,
  completed    boolean not null default false,
  best_percent int,
  updated_at   timestamptz not null default now(),
  primary key (student_id, lesson_id)
);
create index lesson_progress_lesson_idx on lesson_progress(lesson_id);

create table quiz_attempts (
  id            serial primary key,
  student_id    int not null references users(id) on delete cascade,
  scope         attempt_scope not null,
  scope_id      int not null,
  subject_id    int not null references subjects(id) on delete cascade,
  title         text not null,
  earned_points int not null,
  total_points  int not null,
  percent       int not null,
  created_at    timestamptz not null default now()
);
create index quiz_attempts_student_idx on quiz_attempts(student_id, created_at desc);

create table quiz_attempt_answers (
  attempt_id  int not null references quiz_attempts(id) on delete cascade,
  question_id int not null references lesson_questions(id) on delete cascade,
  answer      jsonb not null default 'null'::jsonb,
  correct     boolean not null,
  primary key (attempt_id, question_id)
);

-- التطبيق يتصل بقاعدة البيانات مباشرة من الخادم فقط.
-- تفعيل RLS بلا سياسات يمنع الوصول للجداول عبر واجهة Supabase العامة (anon key).
alter table users enable row level security;
alter table sessions enable row level security;
alter table grades enable row level security;
alter table student_profiles enable row level security;
alter table parent_students enable row level security;
alter table subjects enable row level security;
alter table books enable row level security;
alter table book_pages enable row level security;
alter table units enable row level security;
alter table chapters enable row level security;
alter table lessons enable row level security;
alter table lesson_questions enable row level security;
alter table lesson_progress enable row level security;
alter table quiz_attempts enable row level security;
alter table quiz_attempt_answers enable row level security;

-- ===== بيانات أساسية =====
insert into grades (number, name) values
  (1, 'الصف الأول الابتدائي'),
  (2, 'الصف الثاني الابتدائي'),
  (3, 'الصف الثالث الابتدائي'),
  (4, 'الصف الرابع الابتدائي'),
  (5, 'الصف الخامس الابتدائي'),
  (6, 'الصف السادس الابتدائي');

insert into subjects (grade_id, name, icon, color, sort_order)
select g.id, s.name, s.icon, s.color, s.ord
from grades g
cross join (values
  ('اللغة العربية', '📖', 'blue', 1),
  ('الرياضيات', '🔢', 'orange', 2),
  ('العلوم', '🔬', 'green', 3),
  ('التربية الإسلامية', '🕌', 'teal', 4),
  ('اللغة الإنكليزية', '🔤', 'purple', 5)
) as s(name, icon, color, ord);

insert into subjects (grade_id, name, icon, color, sort_order)
select g.id, 'الاجتماعيات', '🌍', 'rose', 6 from grades g where g.number >= 4;
