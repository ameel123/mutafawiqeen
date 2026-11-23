-- منصة المتفوقين: إعداد قاعدة بيانات Supabase جديدة دفعة واحدة.
-- الصقه في SQL Editor واضغط Run مرة واحدة فقط على مشروع فارغ.

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


-- يُشغَّل على Supabase فقط (بعد schema.sql): ينشئ حاويات التخزين.
-- books: ملفات PDF الأصلية (خاصة، للمشرف فقط)
-- media: صور الصفحات وصور الدروس والفيديو (عامة للعرض)
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('books', 'books', false, 52428800),
  ('media', 'media', true, 52428800)
on conflict (id) do nothing;


-- يُولَّد تلقائياً من content/ بواسطة scripts/build-seed.py — لا تعدّله يدوياً.
do $seed$
declare v_subject int; v_book int; v_unit int; v_chapter int; v_lesson int;
begin
  select s.id into v_subject from subjects s join grades g on g.id = s.grade_id where g.number = 1 and s.name = $c$اللغة العربية$c$;
  if v_subject is null then raise exception 'subject not found: اللغة العربية'; end if;
  if exists (select 1 from books where subject_id = v_subject and title = $c$قراءتي$c$) then
    raise notice 'book already exists, skipped: قراءتي'; return;
  end if;
  insert into books (subject_id, title, edition, page_count, page_offset) values (v_subject, $c$قراءتي$c$, $c$الجزء الأول$c$, 112, 0) returning id into v_book;
  insert into book_pages (book_id, page, url) select v_book, p, replace($c$/books/g1-qiraati/{nnn}.webp$c$, '{nnn}', lpad(p::text, 3, '0')) from generate_series(1, 112) p;
  insert into units (book_id, title, sort_order) values (v_book, $c$دروس التهيئة والإعداد الانتقالي$c$, 1) returning id into v_unit;
  insert into chapters (unit_id, title, sort_order) values (v_unit, $c$دروس التهيئة والإعداد الانتقالي$c$, 1) returning id into v_chapter;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$دروس التهيئة والإعداد الانتقالي$c$, 1, 4, 20, 'published', $c$[{"type":"heading","text":"دروس التَّهيئة والإعداد"},{"type":"figure","description":"صفحة 4 من الكتاب","page":4},{"type":"paragraph","text":"مجموعة لعب الأطفال"},{"type":"heading","text":"الإعداد الانتقالي"},{"type":"figure","description":"صفحة 5 من الكتاب","page":5},{"type":"paragraph","text":"أدوات القراءة والكتابة"},{"type":"heading","text":"دروس التَّهيئة والإعداد"},{"type":"figure","description":"صفحة 6 من الكتاب","page":6},{"type":"heading","text":"دروس التَّهيئة والإعداد"},{"type":"figure","description":"صفحة 7 من الكتاب","page":7},{"type":"paragraph","text":"محاكاة أصوات الآلات والحيوانات (تهيئة صوتية)"},{"type":"heading","text":"الإعداد الانتقالي – نطق الحروف من خلال الكلمة"},{"type":"figure","description":"صفحة 8 من الكتاب","page":8},{"type":"paragraph","text":"دار   فأر   قمر   منشار\nولد   ورد   دود   هدهد\nباب   أرنب   عنب   كلب\nميزان   رُمّان   زَيتون   حِصان\nوَز   رُز   خُبز"},{"type":"heading","text":"الإعداد الانتقالي – تركيب الصور من أجزائها"},{"type":"figure","description":"صفحة 9 من الكتاب","page":9},{"type":"paragraph","text":"جَمل   فيل\nغزالٌ   لَقلق"},{"type":"heading","text":"الإعداد الانتقالي"},{"type":"figure","description":"صفحة 10 من الكتاب","page":10},{"type":"heading","text":"الإعداد الانتقالي"},{"type":"figure","description":"صفحة 11 من الكتاب","page":11},{"type":"paragraph","text":"البدء من اليمين إلى اليسار (تهيئة كتابية)"},{"type":"heading","text":"الإعداد الانتقالي"},{"type":"figure","description":"صفحة 12 من الكتاب","page":12},{"type":"paragraph","text":"تمييز الأشياء المختلفة والمؤتلفة"},{"type":"heading","text":"الإعداد الانتقالي – الاستعداد للكتابة"},{"type":"figure","description":"صفحة 13 من الكتاب","page":13},{"type":"heading","text":"الإعداد الانتقالي"},{"type":"figure","description":"صفحة 14 من الكتاب","page":14},{"type":"heading","text":"الإعداد الانتقالي"},{"type":"figure","description":"صفحة 15 من الكتاب","page":15},{"type":"heading","text":"الإعداد الانتقالي (التعبير)"},{"type":"figure","description":"صفحة 16 من الكتاب","page":16},{"type":"heading","text":"الإعداد الانتقالي"},{"type":"figure","description":"صفحة 17 من الكتاب","page":17},{"type":"paragraph","text":"حكاية متسلسلة الحوادث"},{"type":"heading","text":"الإعداد الانتقالي"},{"type":"figure","description":"صفحة 18 من الكتاب","page":18},{"type":"heading","text":"سورة الفاتحة"},{"type":"figure","description":"صفحة 19 من الكتاب","page":19},{"type":"paragraph","text":"بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ ١ ٱلۡحَمۡدُ لِلَّهِ رَبِّ ٱلۡعَٰلَمِينَ ٢ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ ٣ مَٰلِكِ يَوۡمِ ٱلدِّينِ ٤ إِيَّاكَ نَعۡبُدُ وَإِيَّاكَ نَسۡتَعِينُ ٥ ٱهۡدِنَا ٱلصِّرَٰطَ ٱلۡمُسۡتَقِيمَ ٦ صِرَٰطَ ٱلَّذِينَ أَنۡعَمۡتَ عَلَيۡهِمۡ غَيۡرِ ٱلۡمَغۡضُوبِ عَلَيۡهِمۡ وَلَا ٱلضَّآلِّينَ ٧"},{"type":"paragraph","text":"صدق الله العظيم"},{"type":"heading","text":"الإعداد الانتقالي"},{"type":"figure","description":"صفحة 20 من الكتاب","page":20}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$نبدأ القراءة والكتابة من جهة:$c$, $c$["اليسار","اليمين"]$c$::jsonb, $c$1$c$::jsonb, $c$في الإعداد الانتقالي: البدء من اليمين إلى اليسار.$c$, 1, 1),
    (v_lesson, 'quiz', 'fill_blank', $c$كم آية في سورة الفاتحة؟ (اكتب الرقم)$c$, $c$[]$c$::jsonb, $c$["7","٧","سبع","سبعة"]$c$::jsonb, $c$سورة الفاتحة سبع آيات.$c$, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$أكمل: بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ......$c$, $c$["ٱلدِّينِ","ٱلرَّحِيمِ","ٱلۡعَٰلَمِينَ"]$c$::jsonb, $c$1$c$::jsonb, $c$بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ$c$, 1, 2),
    (v_lesson, 'quiz', 'true_false', $c$نقول بعد قراءة السورة: صدق الله العظيم$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 3);
  insert into units (book_id, title, sort_order) values (v_book, $c$الدروس$c$, 2) returning id into v_unit;
  insert into chapters (unit_id, title, sort_order) values (v_unit, $c$الدروس$c$, 1) returning id into v_chapter;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$دادا$c$, 1, 21, 21, 'published', $c$[{"type":"heading","text":"دادا"},{"type":"figure","description":"صفحة 21 من الكتاب","page":21},{"type":"paragraph","text":"دادا   دادا"},{"type":"paragraph","text":"دادا   دادا   دادا"},{"type":"example","text":"دا   دا   دا   دا"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$أيّ مقطع تكرّر في كلمة «دادا»؟$c$, $c$["ما","با","دا"]$c$::jsonb, $c$2$c$::jsonb, $c$دادا = دا + دا$c$, 1, 1),
    (v_lesson, 'activity', 'mcq', $c$كم مرة تكرّر المقطع «دا» في كلمة «دادا»؟$c$, $c$["مرتين","ثلاث مرات","مرة واحدة"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'fill_blank', $c$اكتب الكلمة: دا + دا = ......$c$, $c$[]$c$::jsonb, $c$["دادا"]$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'true_false', $c$كلمة «دادا» تتكوّن من المقطع «دا» مرتين$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'mcq', $c$أيّ كلمة قرأناها في هذا الدرس؟$c$, $c$["دادا","بابا","ماما"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$دار دادا$c$, 2, 22, 22, 'published', $c$[{"type":"heading","text":"دار\nدادا"},{"type":"figure","description":"صفحة 22 من الكتاب","page":22},{"type":"paragraph","text":"دار   دار   دار"},{"type":"paragraph","text":"دار   دادا\nدار   دادا"},{"type":"example","text":"ر   ر   ر   ر"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$ما الحرف الجديد في كلمة «دار»؟$c$, $c$["د","ا","ر"]$c$::jsonb, $c$2$c$::jsonb, $c$الحرف الجديد هو الراء «ر».$c$, 1, 1),
    (v_lesson, 'activity', 'ordering', $c$رتّب الكلمتين كما في الدرس: (دادا - دار)$c$, $c$["دار","دادا"]$c$::jsonb, $c$null$c$::jsonb, $c$دار دادا$c$, 1, 2),
    (v_lesson, 'quiz', 'fill_blank', $c$اكتب الكلمة: دا + ر = ......$c$, $c$[]$c$::jsonb, $c$["دار"]$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$أيّ كلمة تنتهي بحرف الراء؟$c$, $c$["دادا","دار"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'true_false', $c$كلمة «دار» تبدأ بحرف الدال$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$دادا دور$c$, 3, 23, 25, 'published', $c$[{"type":"heading","text":"دادا   دور"},{"type":"figure","description":"صفحة 23 من الكتاب","page":23},{"type":"paragraph","text":"دادا   دادا\nدور   دور\nدادا   دادا"},{"type":"paragraph","text":"دار   دور   دار   دور"},{"type":"example","text":"دو   دو   دو   دو"},{"type":"heading","text":"تدريب ١"},{"type":"figure","description":"صفحة 24 من الكتاب","page":24},{"type":"list","items":["د  و  د  ←  دود","د  ا  ر  ←  دار","د  و  ر  ←  دور"],"ordered":false},{"type":"heading","text":"تدريب ٢"},{"type":"figure","description":"صفحة 25 من الكتاب","page":25},{"type":"paragraph","text":"دود\nدور\nدادا\nدار"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'matching', $c$صِل الحروف بالكلمة التي تتكوّن منها:$c$, $c$[{"left":"د و د","right":"دود"},{"left":"د ا ر","right":"دار"},{"left":"د و ر","right":"دور"}]$c$::jsonb, $c$null$c$::jsonb, $c$من تدريب ١ في الدرس.$c$, 1, 1),
    (v_lesson, 'activity', 'mcq', $c$ما المقطع المكتوب في سطر الكتابة؟$c$, $c$["را","دا","دو"]$c$::jsonb, $c$2$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'fill_blank', $c$اكتب الكلمة: د + و + د = ......$c$, $c$[]$c$::jsonb, $c$["دود"]$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'fill_blank', $c$اكتب الكلمة: د + و + ر = ......$c$, $c$[]$c$::jsonb, $c$["دور"]$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'mcq', $c$أيّ كلمة فيها حرف الواو «و»؟$c$, $c$["دادا","دار","دور"]$c$::jsonb, $c$2$c$::jsonb, null, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$بابا بابا$c$, 4, 26, 26, 'published', $c$[{"type":"heading","text":"بابا   بابا"},{"type":"figure","description":"صفحة 26 من الكتاب","page":26},{"type":"paragraph","text":"بابا   بابا :"},{"type":"paragraph","text":"باب\nباب"},{"type":"paragraph","text":"باب   دار   بابا\nباب   دار   دادا"},{"type":"example","text":"بـ   ب   بـ   ب   بـ   ب"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$ما الحرف الجديد في كلمة «باب»؟$c$, $c$["ر","د","ب"]$c$::jsonb, $c$2$c$::jsonb, $c$الحرف الجديد هو الباء «ب».$c$, 1, 1),
    (v_lesson, 'activity', 'ordering', $c$رتّب الكلمات كما في الدرس:$c$, $c$["باب","دار","بابا"]$c$::jsonb, $c$null$c$::jsonb, $c$باب دار بابا$c$, 1, 2),
    (v_lesson, 'quiz', 'fill_blank', $c$اكتب الكلمة: با + ب = ......$c$, $c$[]$c$::jsonb, $c$["باب"]$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$أكمل: باب دار ......$c$, $c$["بابا","دور","دود"]$c$::jsonb, $c$0$c$::jsonb, $c$باب دار بابا$c$, 1, 2),
    (v_lesson, 'quiz', 'true_false', $c$كلمة «بابا» تبدأ بحرف الباء$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$دادا بان$c$, 5, 27, 27, 'published', $c$[{"type":"heading","text":"دادا   بان"},{"type":"figure","description":"صفحة 27 من الكتاب","page":27},{"type":"paragraph","text":"بابا   بابا :  دادا بان\nباب   دار   بان"},{"type":"paragraph","text":"بابا   بابا :\nدادا   نور\nباب   دار   نور"},{"type":"example","text":"نـ   ن   نـ   ن   نـ"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$ما الحرف الجديد في كلمة «بان»؟$c$, $c$["ا","ب","ن"]$c$::jsonb, $c$2$c$::jsonb, $c$الحرف الجديد هو النون «ن».$c$, 1, 1),
    (v_lesson, 'activity', 'ordering', $c$رتّب الكلمات كما في الدرس:$c$, $c$["باب","دار","نور"]$c$::jsonb, $c$null$c$::jsonb, $c$باب دار نور$c$, 1, 2),
    (v_lesson, 'quiz', 'fill_blank', $c$اكتب الكلمة: نو + ر = ......$c$, $c$[]$c$::jsonb, $c$["نور"]$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$أيّ كلمة فيها حرف النون؟$c$, $c$["بان","باب","دار"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'true_false', $c$في الدرس: «باب دار بان»$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$ماما ماما$c$, 6, 28, 29, 'published', $c$[{"type":"heading","text":"ماما   ماما"},{"type":"figure","description":"صفحة 28 من الكتاب","page":28},{"type":"paragraph","text":"دادا   نام\nدادا   نام"},{"type":"paragraph","text":"نور   نور :\nدادا   نام"},{"type":"paragraph","text":"بان   بان :\nبابا   ما نام"},{"type":"example","text":"ما   مو   با   بو   نا   نو"},{"type":"example","text":"مـ   م   مـ   م   مـ   م"},{"type":"heading","text":"تدريب ١"},{"type":"figure","description":"صفحة 29 من الكتاب","page":29},{"type":"list","items":["دا  ←  دا  :  دادا","ما  ←  ما  :  ......","با  ←  با  :  ......"],"ordered":false},{"type":"heading","text":"تدريب ٢"},{"type":"paragraph","text":"دادا   بابا\nماما   باب\nبابا   ماما\nباب   دادا"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'fill_blank', $c$تدريب: ما + ما = ......$c$, $c$[]$c$::jsonb, $c$["ماما"]$c$::jsonb, null, 1, 1),
    (v_lesson, 'activity', 'fill_blank', $c$تدريب: با + با = ......$c$, $c$[]$c$::jsonb, $c$["بابا"]$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'mcq', $c$مَن نام في الدرس؟$c$, $c$["دادا","بابا"]$c$::jsonb, $c$0$c$::jsonb, $c$دادا نام ، بابا ما نام$c$, 1, 1),
    (v_lesson, 'quiz', 'true_false', $c$بابا نام$c$, $c$[]$c$::jsonb, $c$false$c$::jsonb, $c$في الدرس: «بابا ما نام».$c$, 1, 2),
    (v_lesson, 'quiz', 'mcq', $c$أيّ كلمة فيها حرف الميم؟$c$, $c$["باب","نام","دار"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$دعاء - محفوظة$c$, 7, 30, 30, 'published', $c$[{"type":"heading","text":"دُعاء"},{"type":"figure","description":"صفحة 30 من الكتاب","page":30},{"type":"paragraph","text":"أَدعوكَ يا إلهي     يا رافِعَ السَّماءِ\nيَسِّرْ عَلَيَّ دَرسي     بِالجِدِّ والذَّكاءِ\nواحفَظْ أَبي وأُمي     وكُلَّ أصدِقائي\nيا واسِعَ العَطاءِ     رَبِّ استَجِبْ دُعائي"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$أكمل: أَدعوكَ يا إلهي ، يا رافِعَ ......$c$, $c$["السَّماءِ","العَطاءِ","الذَّكاءِ"]$c$::jsonb, $c$0$c$::jsonb, $c$أَدعوكَ يا إلهي يا رافِعَ السَّماءِ$c$, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$أكمل: يَسِّرْ عَلَيَّ دَرسي ، بِالجِدِّ و......$c$, $c$["العَطاءِ","السَّماءِ","الذَّكاءِ"]$c$::jsonb, $c$2$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$في الدعاء نطلب من الله أن يحفظ:$c$, $c$["أبي وأمي وكلَّ أصدقائي","الدار والباب"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'true_false', $c$نختم الدعاء بقولنا: رَبِّ استَجِبْ دُعائي$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$دار نوري$c$, 8, 31, 32, 'published', $c$[{"type":"heading","text":"دار   نوري"},{"type":"figure","description":"صفحة 31 من الكتاب","page":31},{"type":"paragraph","text":"بابا   بابا :  دار نوري\nباب   دار   نوري"},{"type":"paragraph","text":"ماما   ماما :\nدار   ريم\nدار   دينا"},{"type":"example","text":"ي   يـ   ي   يـ   ي   يـ"},{"type":"example","text":"ريـ   ديـ   بيـ   نيـ   ميـ"},{"type":"heading","text":"تدريب"},{"type":"figure","description":"صفحة 32 من الكتاب","page":32},{"type":"list","items":["با......   با......   ( ب ، ن )","نا......   نا......   ( م ، ر )","دو......   دو......   ( ر ، د )","بو......   نو......   ( ر ، م )"],"ordered":false}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$ما الحرف الجديد في كلمة «نوري»؟$c$, $c$["ر","ي","ن"]$c$::jsonb, $c$1$c$::jsonb, $c$الحرف الجديد هو الياء «ي».$c$, 1, 1),
    (v_lesson, 'activity', 'fill_blank', $c$أكمل بالحرف «ن» واكتب الكلمة كاملة: با......$c$, $c$[]$c$::jsonb, $c$["بان"]$c$::jsonb, $c$با + ن = بان$c$, 1, 2),
    (v_lesson, 'quiz', 'mcq', $c$أيّ اسم ورد في الدرس؟$c$, $c$["ريم","زينب","مازن"]$c$::jsonb, $c$0$c$::jsonb, $c$دار ريم ، دار دينا$c$, 1, 1),
    (v_lesson, 'quiz', 'fill_blank', $c$اكتب الكلمة: نو + ري = ......$c$, $c$[]$c$::jsonb, $c$["نوري"]$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'true_false', $c$كلمة «ريم» فيها حرف الياء$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$دادا رباب$c$, 9, 33, 35, 'published', $c$[{"type":"heading","text":"دادا   رَباب"},{"type":"figure","description":"صفحة 33 من الكتاب","page":33},{"type":"paragraph","text":"نَمير نامَ\nبَدري ما نامَ"},{"type":"paragraph","text":"دادا نور ، دادا رِيم :\nنَبني دارَ بان"},{"type":"example","text":"رَ   نَ   بَ   وَ   دَ   يَ   مَ"},{"type":"heading","text":"تدريب ١"},{"type":"figure","description":"صفحة 34 من الكتاب","page":34},{"type":"paragraph","text":"نو......\nبَد......\nيَد......\n( ري )"},{"type":"heading","text":"تدريب ٢"},{"type":"list","items":["رَ  +  باب  =  رَباب","بَـ  +  ريد  =  ......","نا  +  مَ  =  ......","نَبـ  +  ني  =  ......"],"ordered":false},{"type":"heading","text":"تدريب ٣"},{"type":"figure","description":"صفحة 35 من الكتاب","page":35},{"type":"paragraph","text":"بَريد   بَـ   بان   با\nدَرب   دَ   دار   دا\nنَبني   نَـ   نار   نا\nوَرد   وَ   وادي   وا"},{"type":"heading","text":"تدريب ٤"},{"type":"paragraph","text":"د   ر   ب   بـ"},{"type":"example","text":"دَرب   بَدر   بَرد"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'fill_blank', $c$تدريب: رَ + باب = ......$c$, $c$[]$c$::jsonb, $c$["رباب"]$c$::jsonb, null, 1, 1),
    (v_lesson, 'activity', 'fill_blank', $c$تدريب: بَـ + ريد = ......$c$, $c$[]$c$::jsonb, $c$["بريد"]$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'mcq', $c$مَن الذي ما نامَ؟$c$, $c$["نَمير","بَدري"]$c$::jsonb, $c$1$c$::jsonb, $c$نَمير نامَ ، بَدري ما نامَ$c$, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$ماذا نبني في الدرس؟$c$, $c$["دارَ بان","دارَ ريم","دارَ نور"]$c$::jsonb, $c$0$c$::jsonb, $c$نَبني دارَ بان$c$, 1, 2),
    (v_lesson, 'quiz', 'ordering', $c$رتّب الحروف لتكوّن كلمة «دَرب»:$c$, $c$["د","ر","ب"]$c$::jsonb, $c$null$c$::jsonb, null, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$المحادثة والتعبير - الأسرة$c$, 10, 36, 36, 'published', $c$[{"type":"heading","text":"المحادثة والتعبير"},{"type":"figure","description":"صفحة 36 من الكتاب","page":36},{"type":"heading","text":"الأسرة"},{"type":"example","text":"يشارك المعلم تلاميذه في الحديث عن مفردات الموضوع ومفاهيمه الآتية :","title":"للمعلم"},{"type":"list","items":["تتكون العائلة من الأب والأم والأولاد (بنين وبنات) وبعض الأقارب كالجدة والجد والعمة والخالة وغيرهم . يعيشون في بيت واحد .","يتعب الأب وتسعى الأم من أجل تربيتنا وسعادتنا .","أوصانا الله (سبحانه وتعالى) بالوالدين إحسانا وطاعتهما .","قال النبي محمد (صلى الله عليه وآله وسلم) : (رضا الله في رضا الوالدين) وأوصانا أيضا برعاية أقاربنا .","أفراد الأسرة (الصغار والكبار) يحب بعضهم بعضا ويتعاونون .","جدتنا تساعد أمنا في أعمال البيت وتحكي لنا الحكايات فنفرح ونضحك . كلنا نحب الجد والجدة ."],"ordered":false}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$مِمَّن تتكوّن الأسرة؟$c$, $c$["الأب والأم والأولاد","المعلم والتلاميذ"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'true_false', $c$أفراد الأسرة يحب بعضهم بعضاً ويتعاونون$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'true_false', $c$أوصانا الله سبحانه وتعالى بالإحسان إلى الوالدين وطاعتهما$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'mcq', $c$مَن تحكي لنا الحكايات فنفرح ونضحك؟$c$, $c$["الجدة","المعلمة"]$c$::jsonb, $c$0$c$::jsonb, $c$جدتنا تساعد أمنا وتحكي لنا الحكايات.$c$, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$بوق نديم$c$, 11, 37, 37, 'published', $c$[{"type":"heading","text":"بوق   نَديم"},{"type":"figure","description":"صفحة 37 من الكتاب","page":37},{"type":"paragraph","text":"بوق   نَديم   قَديم\nنَديم   يَقود   بَقَر   بَدران\nبَقَر   بَدران   قَريب"},{"type":"example","text":"ق   قـ   ـقـ   ق   قـ"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$ما الحرف الجديد في كلمة «بوق»؟$c$, $c$["و","ق","ب"]$c$::jsonb, $c$1$c$::jsonb, $c$الحرف الجديد هو القاف «ق».$c$, 1, 1),
    (v_lesson, 'activity', 'ordering', $c$رتّب الكلمات كما في الدرس:$c$, $c$["نَديم","يَقود","بَقَر","بَدران"]$c$::jsonb, $c$null$c$::jsonb, $c$نَديم يَقود بَقَر بَدران$c$, 1, 2),
    (v_lesson, 'quiz', 'mcq', $c$ماذا يقود نَديم؟$c$, $c$["بَقَر بَدران","دار نوري"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'true_false', $c$بوق نَديم جديد$c$, $c$[]$c$::jsonb, $c$false$c$::jsonb, $c$في الدرس: «بوق نَديم قَديم».$c$, 1, 2),
    (v_lesson, 'quiz', 'fill_blank', $c$أكمل: بَقَر بَدران ......$c$, $c$[]$c$::jsonb, $c$["قريب"]$c$::jsonb, null, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$وز وز$c$, 12, 38, 39, 'published', $c$[{"type":"heading","text":"وَز\nوَز"},{"type":"figure","description":"صفحة 38 من الكتاب","page":38},{"type":"paragraph","text":"دادا زَينَب :\nوَز   وَز"},{"type":"paragraph","text":"زَيد زَيد :"},{"type":"paragraph","text":"زَورَق   زَيدون   قَريب\nنَزور   دارَ   زَيدون"},{"type":"example","text":"ز   ز   ز   ز   ز"},{"type":"heading","text":"تدريب ١"},{"type":"figure","description":"صفحة 39 من الكتاب","page":39},{"type":"paragraph","text":"بوق :   زَورَق   بوق   بَقَر   قَريب   ميزان   بوق"},{"type":"paragraph","text":"زَينَب :   وَز   نَقود   زَينَب   رَقيب   قامَ   زَينَب"},{"type":"paragraph","text":"ريم :   نامَ   نَديم   ريم   بَدري   رَباب   نَزور"},{"type":"heading","text":"تدريب ٢"},{"type":"paragraph","text":"وَز   يَدري   قَديم   نَبني\nنَبني   قَديم   يَدري   وَز"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$ما الحرف الجديد في كلمة «وَز»؟$c$, $c$["ز","و","ر"]$c$::jsonb, $c$0$c$::jsonb, $c$الحرف الجديد هو الزاي «ز».$c$, 1, 1),
    (v_lesson, 'activity', 'mcq', $c$اختر الكلمة نفسها: زَينَب$c$, $c$["نَزور","زَيدون","زَينَب"]$c$::jsonb, $c$2$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'ordering', $c$رتّب الكلمات كما في الدرس:$c$, $c$["نَزور","دارَ","زَيدون"]$c$::jsonb, $c$null$c$::jsonb, $c$نَزور دارَ زَيدون$c$, 1, 1),
    (v_lesson, 'quiz', 'fill_blank', $c$أكمل: زَورَق زَيدون ......$c$, $c$[]$c$::jsonb, $c$["قريب"]$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'mcq', $c$أيّ كلمة فيها حرف الزاي؟$c$, $c$["زَورَق","دار","بوق"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$مدرستي - محفوظة$c$, 13, 40, 40, 'published', $c$[{"type":"heading","text":"مَدْرَسَتي"},{"type":"figure","description":"صفحة 40 من الكتاب","page":40},{"type":"paragraph","text":"يا مَدْرَسَتي     يا مَدْرَسَتي\nفيكِ أَقضي     كُلَّ ٱلوَقْتِ\nمَعَ إِخْواني     مَعَ أَصحابي\nبَيْنَ ٱلدَّرسِ     وٱلأَلعابِ\nهٰذا صَفّي     هٰذي كُتُبي\nأَقرأُ فيها     بَعدَ ٱللَّعِبِ"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$أكمل: يا مَدْرَسَتي ، فيكِ أَقضي كُلَّ ......$c$, $c$["ٱلوَقْتِ","ٱللَّعِبِ","ٱلأَلعابِ"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$أكمل: هٰذا صَفّي ، هٰذي ......$c$, $c$["كُتُبي","إِخْواني","أَصحابي"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$أكمل: مَعَ إِخْواني ، مَعَ ......$c$, $c$["كُتُبي","أَصحابي"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'true_false', $c$أَقرأُ في كتبي بَعدَ ٱللَّعِبِ$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$مزمار مازن$c$, 14, 41, 41, 'published', $c$[{"type":"heading","text":"مِزمار   مازِن"},{"type":"figure","description":"صفحة 41 من الكتاب","page":41},{"type":"paragraph","text":"مِزمار مازِن قَدِيم\nقِرد مازِن يَدور"},{"type":"paragraph","text":"يا وِداد يا وِداد :\nقِردي يَدور\nمِزماري قَدِيم"},{"type":"example","text":"مِـ   زِ   وِ   دِ   قِـ"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$اختر الكلمة التي فيها كسرة:$c$, $c$["دار","قِرد","بوق"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 1),
    (v_lesson, 'activity', 'fill_blank', $c$أكمل: مِزمار مازِن ......$c$, $c$[]$c$::jsonb, $c$["قديم"]$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'mcq', $c$ماذا يفعل قِرد مازِن؟$c$, $c$["يَنام","يَدور"]$c$::jsonb, $c$1$c$::jsonb, $c$قِرد مازِن يَدور$c$, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$مَن صاحب القِرد والمِزمار؟$c$, $c$["نَديم","زَيد","مازِن"]$c$::jsonb, $c$2$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'true_false', $c$مِزمار مازِن جديد$c$, $c$[]$c$::jsonb, $c$false$c$::jsonb, $c$في الدرس: «مِزمار مازِن قَدِيم».$c$, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$ميزان قدّوري$c$, 15, 42, 44, 'published', $c$[{"type":"heading","text":"مِيزان   قَدّوري"},{"type":"figure","description":"صفحة 42 من الكتاب","page":42},{"type":"paragraph","text":"قَدّوري وَزّان\nوَزَنَ زَبيبَ مازِن"},{"type":"paragraph","text":"نادِر بَزّاز\nنَادِر مَرَّ مِن دَربِنَا\nمَازِن دَقَّ بَابَنا"},{"type":"example","text":"قَددوري  =  قَدّوري"},{"type":"heading","text":"تدريب ١"},{"type":"figure","description":"صفحة 43 من الكتاب","page":43},{"type":"list","items":["بَز زاز  =  بَزّاز","دَ ق ق  =  دَقّ","قَد دوري  =  ......","مَـرر  =  ......","وَززان  =  ......"],"ordered":false},{"type":"heading","text":"تدريب ٢"},{"type":"paragraph","text":"نادر بَزّاز"},{"type":"paragraph","text":"مِزمار   مِـ   مِيزان   ميـ\nقِرد   قِـ   قِير   قيـ\nمازِن   زِ   زِياد   زيـ\nقادِم   دِ   قَدِيم   ديـ"},{"type":"heading","text":"تدريب ٣"},{"type":"figure","description":"صفحة 44 من الكتاب","page":44},{"type":"paragraph","text":"با......   ( ب   بـ )\nبو......   ( مـ   م )\nميزا......   ( ن   نـ )"},{"type":"heading","text":"تدريب ٤"},{"type":"paragraph","text":"( د ر قـ )   قِرد\n( ق بـ و )   ......\n( وَ د ر )   ......\n( ر بَـ قَـ )   ......\n( نَ وَ زَ )   ......\n( زَ ق و ر )   ......"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'fill_blank', $c$تدريب: قَد دوري = ......$c$, $c$[]$c$::jsonb, $c$["قدوري"]$c$::jsonb, null, 1, 1),
    (v_lesson, 'activity', 'fill_blank', $c$تدريب: وَززان = ......$c$, $c$[]$c$::jsonb, $c$["وزان"]$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'mcq', $c$ماذا وَزَنَ قَدّوري؟$c$, $c$["زَبيبَ مازِن","بَقَر بَدران"]$c$::jsonb, $c$0$c$::jsonb, $c$قَدّوري وَزّان ، وَزَنَ زَبيبَ مازِن$c$, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$مَن مَرَّ مِن دَربِنا؟$c$, $c$["نادِر","مازِن"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'true_false', $c$مازِن دَقَّ بابَنا$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 3),
    (v_lesson, 'quiz', 'ordering', $c$رتّب الحروف لتكوّن كلمة «قِرد»:$c$, $c$["ق","ر","د"]$c$::jsonb, $c$null$c$::jsonb, null, 1, 4);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$دب منير$c$, 16, 45, 45, 'published', $c$[{"type":"heading","text":"دُبُّ   مُنير"},{"type":"figure","description":"صفحة 45 من الكتاب","page":45},{"type":"paragraph","text":"دُبُّ مُنير مِن وَرَقٍ"},{"type":"paragraph","text":"دُبُّ مَريَمَ مِن وَرَقٍ"},{"type":"paragraph","text":"قُم يا مُنيرُ\nنَزورُ زَيدان"},{"type":"example","text":"دُ   مُـ   زُ   رُ   قُـ   بُـ"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$اختر الكلمة التي فيها ضمّة:$c$, $c$["قِرد","دار","دُبّ"]$c$::jsonb, $c$2$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$دُبُّ مُنير مِن:$c$, $c$["زَبيبٍ","وَرَقٍ"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'true_false', $c$دُبُّ مَريَمَ مِن وَرَقٍ$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'fill_blank', $c$أكمل: قُم يا مُنيرُ نَزورُ ......$c$, $c$[]$c$::jsonb, $c$["زيدان"]$c$::jsonb, null, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$نبيل بقّال$c$, 17, 46, 47, 'published', $c$[{"type":"heading","text":"نَبيل   بَقّال"},{"type":"figure","description":"صفحة 46 من الكتاب","page":46},{"type":"paragraph","text":"نَبيل يَقولُ :\nلَدَينا لَبَن\nلَدَينا رُمّان"},{"type":"paragraph","text":"قُلنا يا نَبيلُ :\nرُمّان وَ لَبَن قَليل"},{"type":"example","text":"ل   لـ   ـلـ   ل   لـ"},{"type":"heading","text":"تدريب ١"},{"type":"figure","description":"صفحة 47 من الكتاب","page":47},{"type":"paragraph","text":"رُمّان  •  قَلَم  •  بُلبُل  •  لَقلَق"},{"type":"heading","text":"تدريب ٢"},{"type":"paragraph","text":"دُبّ   دُ   دُور   دُو\nقُم   قُـ   قُومي   قُو\nرُمّان   رُ   رُومي   رُو\nزُر   زُ   زُوري   زُو"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$ما الحرف الجديد في كلمة «لَبَن»؟$c$, $c$["ن","ب","ل"]$c$::jsonb, $c$2$c$::jsonb, $c$الحرف الجديد هو اللام «ل».$c$, 1, 1),
    (v_lesson, 'activity', 'mcq', $c$أيّ كلمة فيها حرف اللام؟$c$, $c$["قَلَم","رُمّان","بوق"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'mcq', $c$ماذا لدى نَبيل؟$c$, $c$["لَبَن ورُمّان","زَبيب ومِزمار"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'true_false', $c$الرُّمّان واللَّبَن كثير$c$, $c$[]$c$::jsonb, $c$false$c$::jsonb, $c$في الدرس: «رُمّان وَ لَبَن قَليل».$c$, 1, 2),
    (v_lesson, 'quiz', 'mcq', $c$نَبيل يعمل:$c$, $c$["بَقّالاً","وَزّاناً"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$ريف مناف$c$, 18, 48, 48, 'published', $c$[{"type":"heading","text":"ريف   مَناف"},{"type":"figure","description":"صفحة 48 من الكتاب","page":48},{"type":"paragraph","text":"فاروق يَقولُ : يا مُفيدُ"},{"type":"paragraph","text":"نَزورُ ريفَ مَناف\nفِي ريفِ مَناف بَقَر\nفِي ريفِ مَناف وَزّ"},{"type":"example","text":"ف   فـ   ـفـ   ف   فـ"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$ما الحرف الجديد في كلمة «ريف»؟$c$, $c$["ف","ر","ي"]$c$::jsonb, $c$0$c$::jsonb, $c$الحرف الجديد هو الفاء «ف».$c$, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$ماذا في ريف مَناف؟$c$, $c$["بَقَر ووَزّ","قِرد ودُبّ"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'ordering', $c$رتّب الكلمات كما في الدرس:$c$, $c$["نَزورُ","ريفَ","مَناف"]$c$::jsonb, $c$null$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'true_false', $c$فاروق يَقولُ: يا مُفيدُ نَزورُ ريفَ مَناف$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$أمين بنّاء$c$, 19, 49, 50, 'published', $c$[{"type":"heading","text":"أَمين   بَنّاء"},{"type":"figure","description":"صفحة 49 من الكتاب","page":49},{"type":"paragraph","text":"أَمين أَبو مَأمون\nبَنّاء"},{"type":"paragraph","text":"مَأمون يَقولُ :\nنَبني دارَنا\nوَ نَبني دارَ أَديب"},{"type":"example","text":"ء   أَ   ء   أَ   ء   أَ"},{"type":"heading","text":"تدريب ١"},{"type":"figure","description":"صفحة 50 من الكتاب","page":50},{"type":"paragraph","text":"أَمين ......   ( ماء   بَنّاء )\nنادِر ......   ( وَرَق   بَزّاز )\nنَبيل ......   ( بَقّال   رُمّان )\nنَمير ......   ( نامَ   باب )"},{"type":"heading","text":"تدريب ٢"},{"type":"paragraph","text":"قِنديل   مِنديل   بِرميل\nبَلَد   بَلَدي   بَلَدُنا\nنَزَلَ   قَلَبَ   نَقَلَ"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'fill_blank', $c$تدريب: أَمين ...... (ماء / بَنّاء)$c$, $c$[]$c$::jsonb, $c$["بناء"]$c$::jsonb, null, 1, 1),
    (v_lesson, 'activity', 'fill_blank', $c$تدريب: نَبيل ...... (بَقّال / رُمّان)$c$, $c$[]$c$::jsonb, $c$["بقال"]$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'mcq', $c$مَن أبو مَأمون؟$c$, $c$["أَمين","نَبيل","نادِر"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$ماذا يعمل أَمين؟$c$, $c$["بَزّاز","بَقّال","بَنّاء"]$c$::jsonb, $c$2$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'true_false', $c$مَأمون يَقولُ: نَبني دارَنا$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$أصحابي$c$, 20, 51, 51, 'published', $c$[{"type":"heading","text":"أَصحابي"},{"type":"figure","description":"صفحة 51 من الكتاب","page":51},{"type":"paragraph","text":"أَهْلاً أَهْلاً     يا أَصْحابي\nأَهْلاً أَهْلاً     بالأَحبابِ"},{"type":"paragraph","text":"كُلُّ صَدِيقٍ     لي أَرْعاهُ\nأَبَداً أَبَداً     لا أَنساهُ"},{"type":"paragraph","text":"نَحْنُ جَميعاً     جُنْدُ ٱلوَطَنِ\nعِشْتِ بِلادي     طولَ ٱلزَّمَنِ"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$أكمل: أَهْلاً أَهْلاً يا ......$c$, $c$["أَصْحابي","بِلادي"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$أكمل: نَحْنُ جَميعاً جُنْدُ ......$c$, $c$["ٱلزَّمَنِ","ٱلوَطَنِ"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'true_false', $c$كُلُّ صَدِيقٍ لي أَرْعاهُ ، أَبَداً لا أَنساهُ$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 2);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$المحادثة والتعبير - أصحاب الأعمال$c$, 21, 52, 52, 'published', $c$[{"type":"heading","text":"المحادثة والتعبير"},{"type":"figure","description":"صفحة 52 من الكتاب","page":52},{"type":"heading","text":"أصحاب الأعمال"},{"type":"example","text":"يذكر المعلم في حديثه مع الأطفال المفردات والمفاهيم الآتية :","title":"للمعلم"},{"type":"list","items":["يسأل المعلم تلاميذه عن المهن والحرف التي يقوم بها أولياء أمورهم ويشيد بها .","يتعرف التلاميذ صور أصحاب الأعمال ويذكرون اسم المهنة ، فضلا عن ذكر المهن الأخرى ( المعلم - الموظف - الشرطي - الجندي - السائق - البقال - الضابط - الطيار - إلخ ) .","كل واحد من هؤلاء يحب عمله ويؤديه بأمانة وإخلاص ويكون صادقا في تعامله مع الناس وكلهم يخدمون الوطن وأبناء الوطن .","يسأل المعلم تلاميذه عن المهنة التي يحبها كل واحد منهم ، ماذا تحب أن تكون في المستقبل ؟"],"ordered":false}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$أيّ مما يأتي مهنة؟$c$, $c$["الحديقة","الكتاب","المعلم"]$c$::jsonb, $c$2$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$كل صاحب عمل يؤدي عمله بـ:$c$, $c$["أمانة وإخلاص","كسل"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'true_false', $c$أصحاب الأعمال كلهم يخدمون الوطن وأبناء الوطن$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 2);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$أم أيمن وأم إقبال$c$, 22, 53, 54, 'published', $c$[{"type":"heading","text":"أُمُّ أَيمَنَ\nوَ\nأُمُّ إِقبالَ"},{"type":"figure","description":"صفحة 53 من الكتاب","page":53},{"type":"paragraph","text":"قالَ أَيمَن : أُمّي أُمّي\nأَنا وَ إِقبال بَدَأنا نَقرَأُ ."},{"type":"paragraph","text":"أَيمَن قَرَأَ :\nفي إِناءِ إِيمانَ ماء"},{"type":"example","text":"أُ   إِ   أَ"},{"type":"heading","text":"تدريب ١"},{"type":"figure","description":"صفحة 54 من الكتاب","page":54},{"type":"paragraph","text":"أَب   أُم   إِناء\nأَ   أُ   إِ"},{"type":"paragraph","text":"قَلَم   قُلنا   قِرد\nقَـ   قُـ   قِـ"},{"type":"paragraph","text":"زَينَب   زُنبور   زِياد\nزَ   زُ   زِ"},{"type":"heading","text":"تدريب ٢"},{"type":"paragraph","text":"( مَـ رَ ق )   ( قِـ د ر )   ( دَ ر ب )"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$اختر الكلمة التي تبدأ بـ «إِ»:$c$, $c$["إِناء","أُم","أَب"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 1),
    (v_lesson, 'activity', 'mcq', $c$اختر الكلمة التي تبدأ بـ «أُ»:$c$, $c$["إِناء","أُم","أَب"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'mcq', $c$ماذا في إِناءِ إِيمانَ؟$c$, $c$["ماء","لَبَن"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'true_false', $c$قالَ أَيمَن: أَنا وَإِقبال بَدَأنا نَقرَأُ$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'ordering', $c$رتّب الحروف لتكوّن كلمة «مَرَق»:$c$, $c$["م","ر","ق"]$c$::jsonb, $c$null$c$::jsonb, null, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$بط وطيور$c$, 23, 55, 55, 'published', $c$[{"type":"heading","text":"بَطّ\nوَ\nطُيور"},{"type":"figure","description":"صفحة 55 من الكتاب","page":55},{"type":"paragraph","text":"طارِق يَقول :\nفي دارِنا بَطّ\nفي دارِ لُطفي وَزّ"},{"type":"paragraph","text":"في دارِ طالِب بُلبُل\nبُلبُل طالِب طار"},{"type":"example","text":"ط   ط   ط   ط   ط"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$ما الحرف الجديد في كلمة «بَطّ»؟$c$, $c$["ط","ب","د"]$c$::jsonb, $c$0$c$::jsonb, $c$الحرف الجديد هو الطاء «ط».$c$, 1, 1),
    (v_lesson, 'activity', 'matching', $c$صِل كل دار بما فيها:$c$, $c$[{"left":"دار طارِق","right":"بَطّ"},{"left":"دار لُطفي","right":"وَزّ"},{"left":"دار طالِب","right":"بُلبُل"}]$c$::jsonb, $c$null$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'mcq', $c$ماذا في دار لُطفي؟$c$, $c$["وَزّ","بُلبُل","بَطّ"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$ماذا في دار طالِب؟$c$, $c$["وَزّ","بُلبُل","بَطّ"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'true_false', $c$بُلبُل طالِب طار$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$أنشودة البط$c$, 24, 56, 56, 'published', $c$[{"type":"heading","text":"أنشودة البطّ"},{"type":"figure","description":"صفحة 56 من الكتاب","page":56},{"type":"paragraph","text":"يا بَطّ يا بَطّ     اِسبَح بِٱلشَّط\nقُل لِلسَّمَكَةْ     أَتَتِ ٱلشَّبَكَةْ\nميلي عَنها     تَنْجَي مِنها\nوَعَلى ٱلجُرفِ     خُفّي خُفّي"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$أكمل: يا بَطّ يا بَطّ ، اِسبَح ......$c$, $c$["بِٱلشَّط","بِٱلدّار"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$ماذا نقول لِلسَّمَكَةْ؟$c$, $c$["أَتَتِ ٱلشَّبَكَةْ","نامَ ٱلبَطّ"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'true_false', $c$نطلب من السمكة أن تميل عن الشبكة لتنجو منها$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 2);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$ورد لطيف$c$, 25, 57, 58, 'published', $c$[{"type":"heading","text":"وَردٌ لَطيفٌ"},{"type":"figure","description":"صفحة 57 من الكتاب","page":57},{"type":"paragraph","text":"وَردُ وِداد لَطيفٌ\nقِطارُ فَوزي طَويلٌ"},{"type":"paragraph","text":"زَورَقُ أَيمَن واقِفٌ"},{"type":"paragraph","text":"وَردٌ لَطيفٌ\nقِطارٌ طَويلٌ\nزَورَقٌ واقِفٌ"},{"type":"example","text":"دٌ   قٌ   لٌ   رٌ   فٌ"},{"type":"heading","text":"تدريب ١"},{"type":"figure","description":"صفحة 58 من الكتاب","page":58},{"type":"list","items":["وَر  +  دٌ  =  وَردٌ","وِ  +  داد  =  ......","زَو  +  رَق  =  ......","وَ  +  ليد  =  ......","بَـ  +  ريد  =  ......"],"ordered":false},{"type":"heading","text":"تدريب ٢"},{"type":"list","items":["يَـد  +  ري  =  يَدري","زِ  +  ياد  =  ......","طُـ  +  يور  =  ......","زَيـ  +  نَب  =  ......","يُـ  +  ريد  =  ......"],"ordered":false}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'fill_blank', $c$تدريب: وِ + داد = ......$c$, $c$[]$c$::jsonb, $c$["وداد"]$c$::jsonb, null, 1, 1),
    (v_lesson, 'activity', 'fill_blank', $c$تدريب: زَو + رَق = ......$c$, $c$[]$c$::jsonb, $c$["زورق"]$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'matching', $c$صِل كل كلمة بصفتها كما في الدرس:$c$, $c$[{"left":"وَردٌ","right":"لَطيفٌ"},{"left":"قِطارٌ","right":"طَويلٌ"},{"left":"زَورَقٌ","right":"واقِفٌ"}]$c$::jsonb, $c$null$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$قِطارُ مَن طَويلٌ؟$c$, $c$["وِداد","فَوزي","أَيمَن"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'true_false', $c$وَردُ وِداد لَطيفٌ$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$رأينا وردا$c$, 26, 59, 60, 'published', $c$[{"type":"heading","text":"رَأَينا وَرداً"},{"type":"figure","description":"صفحة 59 من الكتاب","page":59},{"type":"paragraph","text":"مازِن يَقولُ :"},{"type":"paragraph","text":"رَأَينا وَرداً وَ قِطاراً وَ زَورَقاً"},{"type":"paragraph","text":"لَدَينا طَبَقُ وَردٍ\nوَأَرنَبٌ في قِطارٍ\nوَزَورَقٌ مِن وَرَقٍ"},{"type":"example","text":"اً   دٍ   بٌ   اً   دٍ   قٌ"},{"type":"heading","text":"تدريب ١"},{"type":"figure","description":"صفحة 60 من الكتاب","page":60},{"type":"paragraph","text":"نارٌ   رَأَينا ناراً   مَوقِدُ نارٍ\nطَبَقٌ   أُريدُ طَبَقاً   وَردٌ في طَبَقٍ\nوَردٌ   رَأينا وَرداً   طَبَقُ وَردٍ"},{"type":"heading","text":"تدريب ٢"},{"type":"paragraph","text":"مِنْ   لَنْ   إِنْ   عَنْ\nلبنٌ   بَدَنٌ   مَوطِنٌ   قُطنٌ"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$اختر الكلمة المنوّنة بالفتح:$c$, $c$["وَرداً","وَردٍ","وَردٌ"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 1),
    (v_lesson, 'activity', 'mcq', $c$اختر الكلمة المنوّنة بالكسر:$c$, $c$["طَبَقاً","طَبَقٍ","طَبَقٌ"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'mcq', $c$ماذا رأى مازِن؟$c$, $c$["وَرداً وقِطاراً وزَورَقاً","بَطّاً ووَزّاً"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$الزَّورَق مصنوع مِن:$c$, $c$["وَرَقٍ","وَردٍ"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'true_false', $c$الأَرنَب في القِطار$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$المطر نازل$c$, 27, 61, 62, 'published', $c$[{"type":"heading","text":"اَلمَطَرُ نازِلٌ"},{"type":"figure","description":"صفحة 61 من الكتاب","page":61},{"type":"paragraph","text":"اَلوَلَدُ يَقولُ :\nاَلمَطَرُ نازِلٌ\nاَلبَردُ قَليلٌ"},{"type":"paragraph","text":"أَنا أُريدُ ٱلمَطَرَ\nاَلوَردُ يُريدُ ٱلمَطَرَ\nماءُ ٱلمَطَرِ مُفيدٌ"},{"type":"example","text":"مَطَر   اَلمَطَر   ماءُ ٱلمَطَرِ"},{"type":"heading","text":"تدريب ١"},{"type":"figure","description":"صفحة 62 من الكتاب","page":62},{"type":"paragraph","text":"مَطَر   اَلمَطَر   زَورَق   ......\nوَلَد   اَلـ......   بَرد   ......\nقَلَم   اَلـ......   وَرد   ......\nبَقّال   اَلـ......   قِطار   ......"},{"type":"heading","text":"تدريب ٢"},{"type":"list","items":["ٱلمَطَر  ←  ماءُ ٱلمَطَرِ","ٱلوَرد  ←  لَونُ ٱلـ......","ٱلبَطّ  ←  مِنقارُ ٱلـ......","ٱلوَلَد  ←  قِطارُ ٱلـ......","ٱلقَمَر  ←  نورُ ٱلـ......"],"ordered":false}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'fill_blank', $c$أدخل «ال» على كلمة «وَلَد» واكتبها:$c$, $c$[]$c$::jsonb, $c$["الولد"]$c$::jsonb, null, 1, 1),
    (v_lesson, 'activity', 'fill_blank', $c$أدخل «ال» على كلمة «قَلَم» واكتبها:$c$, $c$[]$c$::jsonb, $c$["القلم"]$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'mcq', $c$ماءُ ٱلمَطَرِ:$c$, $c$["قَليلٌ","مُفيدٌ"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'true_false', $c$البَردُ كثير$c$, $c$[]$c$::jsonb, $c$false$c$::jsonb, $c$في الدرس: «اَلبَردُ قَليلٌ».$c$, 1, 2),
    (v_lesson, 'quiz', 'mcq', $c$مَن يُريدُ ٱلمَطَرَ في الدرس؟$c$, $c$["الوَلَد والوَرد","البَطّ"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$نوال ونور وريم بنات$c$, 28, 63, 63, 'published', $c$[{"type":"heading","text":"نَوالُ وَنورُ وَريمُ\nبَناتٌ"},{"type":"figure","description":"صفحة 63 من الكتاب","page":63},{"type":"paragraph","text":"قالَت نَوالُ : نورُ نامَت\nيا ريمُ أَنتِ ما نِمتِ\nيا ريمُ أَنتِ قَرَأتِ\nأَنا وأَنتِ قَرَأنا :"},{"type":"paragraph","text":"في بَيتِنا تَمرٌ وَ زَيتونٌ"},{"type":"example","text":"ت   تـ   ت   ـتـ   ت   تـ"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$ما الحرف الجديد في كلمة «بَناتٌ»؟$c$, $c$["ت","ب","ن"]$c$::jsonb, $c$0$c$::jsonb, $c$الحرف الجديد هو التاء «ت».$c$, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$مَن نامَت؟$c$, $c$["ريم","نَوال","نور"]$c$::jsonb, $c$2$c$::jsonb, $c$قالَت نَوالُ: نورُ نامَت$c$, 1, 1),
    (v_lesson, 'quiz', 'true_false', $c$ريم نامَت$c$, $c$[]$c$::jsonb, $c$false$c$::jsonb, $c$في الدرس: «يا ريمُ أَنتِ ما نِمتِ».$c$, 1, 2),
    (v_lesson, 'quiz', 'mcq', $c$ماذا في بيتهم؟$c$, $c$["تَمرٌ وزَيتونٌ","لَبَنٌ ورُمّانٌ"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$المحادثة والتعبير - النخلة$c$, 29, 64, 64, 'published', $c$[{"type":"heading","text":"المحادثة والتعبير"},{"type":"figure","description":"صفحة 64 من الكتاب","page":64},{"type":"heading","text":"النخلة"},{"type":"example","text":"يوجه المعلم لتلاميذه بعض الأسئلة حول الموضوع ويشاركهم في الحديث عن المفاهيم والأمور الآتية :","title":"للمعلم"},{"type":"list","items":["النخلة شجرة جميلة نأخذ منها التمر فنأكله ، أو نصنع منه الدبس اللذيذ ، وكذلك علفا للحيوانات .","للنخلة جذع وسَعَف ، للسَّعف خوص نصنع منه السلال والحصران والمكانس والأطباق .","ومن جريدها نصنع الأسرّة والأقفاص والكراسي ، أما الجذع والسَّعف فيستعمله الناس حطبا أو في سقوف المنازل .","النخل كثير في بلادنا ، النخلة أم الأشجار ."],"ordered":false}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$ماذا نأخذ من النخلة؟$c$, $c$["الرمان","التمر"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$ماذا نصنع من التمر؟$c$, $c$["الدبس","اللبن"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$مِن خوص السَّعف نصنع:$c$, $c$["الأقلام","السلال والحصران"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'true_false', $c$النخل كثير في بلادنا ، والنخلة أم الأشجار$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$بلال وطلال ودلال أولاد$c$, 30, 65, 66, 'published', $c$[{"type":"heading","text":"بِلالٌ وَ طَلالٌ وَ دَلالُ\nأَولادٌ"},{"type":"figure","description":"صفحة 65 من الكتاب","page":65},{"type":"paragraph","text":"اَلأَبُ يُنادي : يا أَولادي"},{"type":"paragraph","text":"لَدَينا أَقلامٌ"},{"type":"paragraph","text":"اَلأَقلامُ لِمَن يَقرَأُ"},{"type":"paragraph","text":"قَرَأَ ٱلأَولادُ : نَبني ٱلوَطَنَ\nنَبني ٱلبِلادَ"},{"type":"example","text":"لـ   ا   لا   لـ   ا"},{"type":"heading","text":"تدريب ١"},{"type":"figure","description":"صفحة 66 من الكتاب","page":66},{"type":"list","items":["أَو  +  لاد  =  ......","بِـ  +  لاد  =  ......","أَو  +  لادي  =  ......","بِـ  +  لادي  =  ......","طَ  +  لال  =  ......","دَ  +  لال  =  ......","فَـ  +  ريد  =  ......","بَـ  +  ريد  =  ......"],"ordered":false},{"type":"heading","text":"تدريب ٢"},{"type":"paragraph","text":"أَب   اَلأَب   أُم   اَلـ......\nأَقلام   اَلـ......   أُنبوب   اَلـ......\nإِناء   اَلـ......   إِبريق   اَلـ......"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'fill_blank', $c$تدريب: أَو + لاد = ......$c$, $c$[]$c$::jsonb, $c$["أولاد"]$c$::jsonb, null, 1, 1),
    (v_lesson, 'activity', 'fill_blank', $c$تدريب: طَ + لال = ......$c$, $c$[]$c$::jsonb, $c$["طلال"]$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'mcq', $c$مَن نادى: يا أَولادي؟$c$, $c$["المعلم","الأَب"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$الأَقلامُ لِمَن؟$c$, $c$["لِمَن يَنام","لِمَن يَقرَأُ"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'true_false', $c$قَرَأَ ٱلأَولادُ: نَبني ٱلوَطَنَ ، نَبني ٱلبِلادَ$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$فراس وأنيس وميسون$c$, 31, 67, 67, 'published', $c$[{"type":"heading","text":"فِراسٌ وَ أَنيسٌ\nوَ مَيسونُ"},{"type":"figure","description":"صفحة 67 من الكتاب","page":67},{"type":"paragraph","text":"فِراسٌ يَرسُمُ\nأَنيسٌ يَقرَأُ"},{"type":"paragraph","text":"سَأَلَت مَيسونُ :\nأَينَ سَلامٌ ؟\nسَلامٌ في ٱلبُستانِ"},{"type":"example","text":"س   سـ   س   ـسـ   سـ"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$ما الحرف الجديد في كلمة «فِراسٌ»؟$c$, $c$["ر","س","ف"]$c$::jsonb, $c$1$c$::jsonb, $c$الحرف الجديد هو السين «س».$c$, 1, 1),
    (v_lesson, 'activity', 'matching', $c$صِل الاسم بما يفعله:$c$, $c$[{"left":"فِراسٌ","right":"يَرسُمُ"},{"left":"أَنيسٌ","right":"يَقرَأُ"}]$c$::jsonb, $c$null$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'mcq', $c$عن مَن سَأَلَت مَيسونُ؟$c$, $c$["فِراس","سَلام","أَنيس"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$أَينَ سَلامٌ؟$c$, $c$["في ٱلدّارِ","في ٱلبُستانِ"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'true_false', $c$أَنيسٌ يَرسُمُ$c$, $c$[]$c$::jsonb, $c$false$c$::jsonb, $c$في الدرس: «فِراسٌ يَرسُمُ ، أَنيسٌ يَقرَأُ».$c$, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$سالم مزارع$c$, 32, 68, 68, 'published', $c$[{"type":"heading","text":"سالِمٌ مُزارِعٌ"},{"type":"figure","description":"صفحة 68 من الكتاب","page":68},{"type":"paragraph","text":"بُستانُ سالِمٍ واسِعٌ"},{"type":"paragraph","text":"بَديعٌ يَقولُ :\nأَبي يَزرَعُ ٱلوَردَ\nوَ يَزرَعُ ٱلفُلفُلَ"},{"type":"paragraph","text":"أَنا أَبيعُ ٱلوَردَ\nوَ أَبيعُ ٱلفُلفُلَ"},{"type":"example","text":"ع   ـع   ع   ـع   ع   ـع"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$ما الحرف الجديد في كلمة «مُزارِعٌ»؟$c$, $c$["م","ز","ع"]$c$::jsonb, $c$2$c$::jsonb, $c$الحرف الجديد هو العين «ع».$c$, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$بُستانُ سالِمٍ:$c$, $c$["واسِعٌ","صَغيرٌ"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$ماذا يَزرَعُ أبو بَديع؟$c$, $c$["الوَردَ والفُلفُلَ","التَّمرَ والزَّيتونَ"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'true_false', $c$بَديعٌ يَبيعُ الوَردَ والفُلفُلَ$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$علم بلادي$c$, 33, 69, 69, 'published', $c$[{"type":"heading","text":"عَلَمُ بِلادي"},{"type":"figure","description":"صفحة 69 من الكتاب","page":69},{"type":"paragraph","text":"عَليٌّ يَقولُ :\nعَلَمُ بِلادي مَرفوعٌ"},{"type":"paragraph","text":"سُعادُ تَقولُ : أَنا وَ عادِلٌ\nرَفَعنا ٱلعَلَمَ\nرَفرِف يا عَلَمَ ٱلعِراقِ"},{"type":"example","text":"عـ   ـعـ   ع   ـعـ   عـ   ع"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'fill_blank', $c$أكمل: عَلَمُ بِلادي ......$c$, $c$[]$c$::jsonb, $c$["مرفوع"]$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$مَن رَفَعا العَلَم؟$c$, $c$["عَليّ وفِراس","سُعاد وعادِل"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$أكمل: رَفرِف يا عَلَمَ ......$c$, $c$["ٱلبُستانِ","ٱلعِراقِ"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'true_false', $c$عَليٌّ يَقولُ: عَلَمُ بِلادي مَرفوعٌ$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$حروفنا الجميلة$c$, 34, 70, 70, 'published', $c$[{"type":"heading","text":"حُروفُنا الجَميلةُ"},{"type":"figure","description":"صفحة 70 من الكتاب","page":70},{"type":"paragraph","text":"أَلِفٌ باءٌ     تاءٌ ثاءْ\nهَيّا نَقْرَأْ     يا هَيْفاءْ\nأَلِفٌ أَبْني     باءٌ بَلَدي\nبِيَدي بِيَدي     أَبْني بَلَدي\nكُلُّ حُروفي     تَأْتي بَعْدُ\nأَتَعَلَّمُها     وَأَنا أَشدو"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$أكمل: أَلِفٌ باءٌ ، تاءٌ ......$c$, $c$["ثاءْ","هاءْ"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$أكمل: هَيّا نَقْرَأْ يا ......$c$, $c$["هَيْفاءْ","بَلَدي"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'true_false', $c$أَبْني بَلَدي بِيَدي$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 2);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$الربيع$c$, 35, 71, 71, 'published', $c$[{"type":"heading","text":"اَلرَّبيعُ"},{"type":"figure","description":"صفحة 71 من الكتاب","page":71},{"type":"paragraph","text":"قالَت سُعادُ :\nأَنا أُريدُ ٱلرَّبيعَ"},{"type":"paragraph","text":"اَلمَطَرُ يَنزِلُ مِنَ ٱلسَّماءِ\nوَيَسقي ٱلزَّرعَ\nاَلنّاسُ تَقولُ :\nنَزرَعُ وَ لانَقطَعُ"},{"type":"example","text":"اَلـ :  رَبيع : اَلرَّبيع  ،  سَماء : اَلسَّماء  ،  زَرع : اَلزَّرع"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$في أيّ كلمة لا تُنطَق اللام؟$c$, $c$["اَلمَطَر","اَلسَّماء","اَلقَمَر"]$c$::jsonb, $c$1$c$::jsonb, $c$اللام لا تُنطق مع الحروف الشمسية مثل السين.$c$, 1, 1),
    (v_lesson, 'activity', 'mcq', $c$في أيّ كلمة لا تُنطَق اللام؟$c$, $c$["اَلوَرد","اَلزَّرع","اَلبَرد"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'mcq', $c$المَطَرُ يَنزِلُ مِنَ:$c$, $c$["السَّماءِ","البُستانِ"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'true_false', $c$المطر يسقي الزرع$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'fill_blank', $c$أكمل: نَزرَعُ وَلا ......$c$, $c$[]$c$::jsonb, $c$["نقطع"]$c$::jsonb, null, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$سلوى وليلى$c$, 36, 72, 72, 'published', $c$[{"type":"heading","text":"سَلوى وَ لَيلى"},{"type":"figure","description":"صفحة 72 من الكتاب","page":72},{"type":"paragraph","text":"سَلوى نادَت لَيلى :\nتَعالَي نَلعَبُ مَعَ نَدى"},{"type":"paragraph","text":"قالَ موسى : نَقفِزُ وَ نَدورُ"},{"type":"example","text":"ى   ى   ى   ى   ى   ى"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$اختر الكلمة التي تنتهي بالألف المقصورة «ى»:$c$, $c$["ريم","لَيلى","وِداد"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$مَن نادَت لَيلى؟$c$, $c$["سَلوى","نَدى"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$ماذا قال موسى؟$c$, $c$["نَنامُ","نَقفِزُ ونَدورُ"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'true_false', $c$قالت سلوى: تَعالَي نَلعَبُ مَعَ نَدى$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$نشيد النور$c$, 37, 73, 73, 'published', $c$[{"type":"heading","text":"نَشيدُ ٱلنّور"},{"type":"figure","description":"صفحة 73 من الكتاب","page":73},{"type":"paragraph","text":"نَشيدُ ٱلنّورِ في شَفَتي\nتَعيشُ تَعيشُ مَدرَسَتي\nأُحِبُّ مُعَلِّمي ٱلغالي\nأُحِبُّكِ يا مُعَلِّمَتي\nأَرى عَلَمي أَرى وَطَني\nأَرى ٱلدُّنيا بِمَدرَسَتي"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$أكمل: نَشيدُ ٱلنّورِ في ......$c$, $c$["شَفَتي","مَدرَسَتي"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$أكمل: أُحِبُّ مُعَلِّمي ......$c$, $c$["ٱلدُّنيا","ٱلغالي"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'true_false', $c$أَرى عَلَمي أَرى وَطَني$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 2);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$المحادثة والتعبير - الجيران$c$, 38, 74, 74, 'published', $c$[{"type":"heading","text":"المحادثة والتعبير"},{"type":"figure","description":"صفحة 74 من الكتاب","page":74},{"type":"heading","text":"الجيران"},{"type":"example","text":"يدور حديث المعلم مع الأطفال حول المفردات والقيم الآتية :","title":"للمعلم"},{"type":"list","items":["جيراننا مثل أهلنا نحبهم ويحبوننا ونساعدهم ويساعدوننا ، نحترمهم ويحترموننا .","أوصى الله - سبحانه وتعالى - بالجار ، وقال النبي محمد (صلى الله عليه وآله وسلم) : ((خير الجيران عند الله خيرهم لجاره)) .","نشارك الجيران بالأفراح والأحزان ، نلعب مع أولادهم بهدوء ومحبة وتسامح .","لا نؤذي جيراننا ولا نزعجهم وإذا أخطأنا بحقهم نعتذر لهم ونتسامح بالأخطاء ، حتى نعيش سعداء ."],"ordered":false}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$جيراننا مثل:$c$, $c$["الغرباء","أهلنا"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'true_false', $c$قال النبي محمد (صلى الله عليه وآله وسلم): خير الجيران عند الله خيرهم لجاره$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$إذا أخطأنا بحق جيراننا:$c$, $c$["نعتذر لهم","نسكت"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 2);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$الفراش بديع$c$, 39, 75, 75, 'published', $c$[{"type":"heading","text":"اَلفَراشُ بَديعٌ"},{"type":"figure","description":"صفحة 75 من الكتاب","page":75},{"type":"paragraph","text":"سُرى تَقولُ :\nاَلفَراشُ يَطيرُ في ٱلبُستانِ"},{"type":"paragraph","text":"اَلفَراشُ يَعيشُ مَعَ ٱلطُّيورِ\nلِلطَّيرِ ريشٌ\nلِلطَّيرِ عُشٌّ"},{"type":"example","text":"ش   ش   ش   ش   ش   ش"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$ما الحرف الجديد في كلمة «اَلفَراشُ»؟$c$, $c$["ش","ف","ر"]$c$::jsonb, $c$0$c$::jsonb, $c$الحرف الجديد هو الشين «ش».$c$, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$أين يَطيرُ الفَراشُ؟$c$, $c$["في ٱلبُستانِ","في ٱلدّارِ"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'fill_blank', $c$أكمل: لِلطَّيرِ ......$c$, $c$[]$c$::jsonb, $c$["ريش","عش"]$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'true_false', $c$الفَراشُ يَعيشُ مَعَ الطُّيورِ$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$شامل شرطي المرور$c$, 40, 76, 78, 'published', $c$[{"type":"heading","text":"شامِلٌ شُرطِيُّ ٱلمُرورِ"},{"type":"figure","description":"صفحة 76 من الكتاب","page":76},{"type":"paragraph","text":"شامِلٌ شُرطِيٌّ نَشيطٌ"},{"type":"paragraph","text":"يَقِفُ في ٱلشّارِعِ\nمَعَ شُروقِ ٱلشَّمسِ\nيُساعِدُ ٱلنّاسَ عَلى عُبورِ ٱلشّارِعِ"},{"type":"example","text":"شـ   شـ   ـشـ   ـشـ"},{"type":"heading","text":"تدريب ١"},{"type":"figure","description":"صفحة 77 من الكتاب","page":77},{"type":"list","items":["مِشـ  +  مِش  =  ......","سِمـ  +  سِم  =  ......","لَقـ  +  لَق  =  ......","رَف  +  رِف  =  ......","فُلـ  +  فُل  =  ......","بُلـ  +  بُل  =  ......"],"ordered":false},{"type":"heading","text":"تدريب ٢"},{"type":"figure","description":"صفحة 78 من الكتاب","page":78},{"type":"paragraph","text":"رتّب الكلمات وكوّن منها جملة :"},{"type":"list","items":["نَزورُ  •  زَيدون  •  دارَ","مازِنٌ  •  بابَنا  •  دَقَّ","ريفِ  •  مَنافٍ  •  في  •  بَقَرٌ","إِيمان  •  إِناء  •  في  •  ماءٌ","وَزَيتونٌ  •  بَيتِنا  •  في  •  تَمرٌ"],"ordered":false}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'fill_blank', $c$تدريب: مِشـ + مِش = ......$c$, $c$[]$c$::jsonb, $c$["مشمش"]$c$::jsonb, null, 1, 1),
    (v_lesson, 'activity', 'ordering', $c$رتّب الكلمات لتكوّن جملة:$c$, $c$["نَزورُ","دارَ","زَيدون"]$c$::jsonb, $c$null$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'mcq', $c$شامِل يعمل:$c$, $c$["بَقّالاً","شُرطِيَّ مُرور"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$متى يَقِفُ شامِل في الشّارِعِ؟$c$, $c$["في اللَّيل","مَعَ شُروقِ ٱلشَّمسِ"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'true_false', $c$شامِل يُساعِدُ ٱلنّاسَ عَلى عُبورِ ٱلشّارِعِ$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 3),
    (v_lesson, 'quiz', 'ordering', $c$رتّب الكلمات لتكوّن جملة:$c$, $c$["مازِنٌ","دَقَّ","بابَنا"]$c$::jsonb, $c$null$c$::jsonb, null, 1, 4);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$رائد يلعب$c$, 41, 79, 79, 'published', $c$[{"type":"heading","text":"رائِدٌ يَلعَبُ"},{"type":"figure","description":"صفحة 79 من الكتاب","page":79},{"type":"paragraph","text":"رائِدٌ يَلعَبُ مَعَ ٱلأَولادِ\nرائِدٌ مِن فَريقِ فائِزٍ"},{"type":"paragraph","text":"فائِزٌ رَئيسُ ٱلفَريقِ\nفائِزٌ دَرَّبَ ٱلفَريقَ\nاَلفَريقُ نَشيطٌ\nفازَ اَلفَريقُ"},{"type":"example","text":"ئـ   ئـ   ئـ   ئـ   ئـ   ئـ"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$اختر الكلمة التي فيها «ئـ»:$c$, $c$["يَلعَب","رائِد","فَريق"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$مَن رَئيسُ الفَريقِ؟$c$, $c$["رائِد","فائِز"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$الفَريقُ:$c$, $c$["نَشيطٌ","نائِمٌ"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'true_false', $c$فازَ الفَريقُ$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$أستاذ وتلاميذ$c$, 42, 80, 80, 'published', $c$[{"type":"heading","text":"أُستاذٌ وَ تَلاميذُ"},{"type":"figure","description":"صفحة 80 من الكتاب","page":80},{"type":"paragraph","text":"مَعاذٌ أُستاذٌ قَديرٌ\nمُنذِرٌ تِلميذٌ نَشيطٌ"},{"type":"paragraph","text":"قالَ ٱلأُستاذُ : اِقرَأ يا مُنذِرُ\nقالَ مُنذِرُ :\nأَنا أَذوقُ ٱلعَسَلَ\nاَلعَسَلُ لَذيذٌ"},{"type":"example","text":"ذ   ذ   ذ   ذ   ذ   ذ"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$ما الحرف الجديد في كلمة «أُستاذٌ»؟$c$, $c$["د","ز","ذ"]$c$::jsonb, $c$2$c$::jsonb, $c$الحرف الجديد هو الذال «ذ».$c$, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$مَن الأُستاذ؟$c$, $c$["مَعاذ","مُنذِر"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$مُنذِرٌ:$c$, $c$["تِلميذٌ نَشيطٌ","أُستاذٌ قَديرٌ"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'true_false', $c$العَسَلُ لَذيذٌ$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$المحادثة والتعبير - المعلمون$c$, 43, 81, 81, 'published', $c$[{"type":"heading","text":"المحادثة والتعبير"},{"type":"figure","description":"صفحة 81 من الكتاب","page":81},{"type":"heading","text":"اَلمُعَلِّمون"},{"type":"example","text":"يحدث المعلم تلاميذه عن المفردات والمفاهيم الآتية :","title":"للمعلم"},{"type":"list","items":["المعلمة في الروضة وفي المدرسة مثل أمنا في البيت ، تحبنا وترعانا وتربينا وتعلمنا ، ونحن أيضاً نحبها ونطيعها ونستمع إلى حديثها .","المعلم في المدرسة كأبينا في البيت ، نحبه ويحبنا .","من علمني حرفاً ملّكني عبداً .","الذي لا يقرأ ولا يكتب يعيش حياته كالأعمى .","يرشدنا المعلمون إلى الخير والأعمال الصالحة لنكون رجال المستقبل نخدم وطننا وشعبنا .","يطرح المعلم مجموعة من الأسئلة يجيب عنها تلاميذه بحرية وانطلاق ."],"ordered":false}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'true_false', $c$المعلم في المدرسة كأبينا في البيت$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$المعلمة في المدرسة مثل:$c$, $c$["جارتنا","أمنا في البيت"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$يرشدنا المعلمون إلى:$c$, $c$["اللعب فقط","الخير والأعمال الصالحة"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 2);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$مالك سمّاك$c$, 44, 82, 82, 'published', $c$[{"type":"heading","text":"مالِكٌ سَمّاكٌ"},{"type":"figure","description":"صفحة 82 من الكتاب","page":82},{"type":"paragraph","text":"مالِكٌ سَمّاكٌ يَبيعُ ٱلسَّمَكَ\nعِندَ مالِكٍ زَورَقٌ وَ شِباكٌ"},{"type":"paragraph","text":"عِندَ مالِكٍ سَمَكٌ\nاَلسَّمَكُ لَذيذٌ"},{"type":"example","text":"ك   ك   ك   ك   ك   ك   ك"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$ما الحرف الجديد في كلمة «مالِكٌ»؟$c$, $c$["ك","م","ل"]$c$::jsonb, $c$0$c$::jsonb, $c$الحرف الجديد هو الكاف «ك».$c$, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$ماذا يَبيعُ مالِك؟$c$, $c$["السَّمَكَ","الوَردَ"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$عِندَ مالِكٍ:$c$, $c$["زَورَقٌ وشِباكٌ","قِطارٌ وأَرنَبٌ"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'true_false', $c$السَّمَكُ لَذيذٌ$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$كتاب مكتوب$c$, 45, 83, 83, 'published', $c$[{"type":"heading","text":"كِتابٌ\nمَكتوبٌ"},{"type":"figure","description":"صفحة 83 من الكتاب","page":83},{"type":"paragraph","text":"كامِلٌ يَقرَأُ وَ يَكتُبُ\nكَتَبَ مَكتوباً فَقالَ :"},{"type":"paragraph","text":"إِلى العَمِ كَريمٍ .\nاَلسَّلامُ عَلَيكُم\nنَسأَلُ عَنكَ .\nأَرسِل لَنا مَكتوباً\nشُكراً لَكَ"},{"type":"example","text":"كـ   ك   كـ   ـكـ   ك"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$اختر الكلمة التي تبدأ بحرف الكاف:$c$, $c$["كِتابٌ","مالِكٌ"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$إلى مَن كَتَبَ كامِلٌ المكتوب؟$c$, $c$["العَمِّ كَريمٍ","الأُستاذِ مَعاذ"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'true_false', $c$كامِلٌ يَقرَأُ وَيَكتُبُ$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'ordering', $c$رتّب الكلمات لتكوّن جملة:$c$, $c$["أَرسِل","لَنا","مَكتوباً"]$c$::jsonb, $c$null$c$::jsonb, null, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$مياه المطر$c$, 46, 84, 84, 'published', $c$[{"type":"heading","text":"مِياهُ ٱلمَطَرِ"},{"type":"figure","description":"صفحة 84 من الكتاب","page":84},{"type":"paragraph","text":"مِياهُ ٱلمَطَرِ تَسقي ٱلزَّرعَ"},{"type":"paragraph","text":"أَبو نَبيهٍ يَزرَعُ\nنَبيهٌ يُساعِدُهُ"},{"type":"paragraph","text":"قالَ لَهُ أَبوهُ : شُكراً لَكَ يا نَبيهُ\nرَعاكَ ٱللهُ يا وَلَدي"},{"type":"example","text":"ه   ـه   ه   ـه   ه   ـه"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$اختر الكلمة التي تنتهي بحرف الهاء «ه»:$c$, $c$["زَرع","مَطَر","مِياه"]$c$::jsonb, $c$2$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$مِياهُ المَطَرِ تَسقي:$c$, $c$["الزَّرعَ","السَّمَكَ"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$مَن يُساعِدُ أَباهُ في الزَّرع؟$c$, $c$["كامِل","نَبيه"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'fill_blank', $c$أكمل: قالَ لَهُ أَبوهُ: شُكراً لَكَ يا ......$c$, $c$[]$c$::jsonb, $c$["نبيه"]$c$::jsonb, null, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$هلال العيد$c$, 47, 85, 86, 'published', $c$[{"type":"heading","text":"هِلالُ ٱلعيدِ"},{"type":"figure","description":"صفحة 85 من الكتاب","page":85},{"type":"paragraph","text":"هَلَّ هِلالُ ٱلعيدِ"},{"type":"paragraph","text":"ذَهَبَ هُمامٌ وَمَعَهُ سُهادُ\nإِلى عَمِّهِما مَهديّ"},{"type":"paragraph","text":"وَقالا :\nعيدُكَ مُبارَكٌ يا عَمُّ\nقالَ ٱلعَمُّ :\nوَعيدُكُما سَعيدٌ\nيا أَولادُ"},{"type":"example","text":"هـ   ـهـ   هـ   ـهـ   ـه"},{"type":"heading","text":"تدريب ١"},{"type":"figure","description":"صفحة 86 من الكتاب","page":86},{"type":"paragraph","text":"نَقطَع  •  رَئيس  •  الفَرّاش  •  يَزرَع"},{"type":"list","items":["أَبو نَبيه ......","نَزرَع و لا ......","فائز ...... ٱلفَريق","...... بِلا ريش"],"ordered":false},{"type":"heading","text":"تدريب ٢"},{"type":"paragraph","text":"ه   هـ   ك   كـ"},{"type":"list","items":["......لال","مِيا......","......تاب","سَمَـ......"],"ordered":false}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'fill_blank', $c$تدريب: أكمل بالكلمة المناسبة (نَقطَع - رَئيس - يَزرَع): فائز ...... ٱلفَريق$c$, $c$[]$c$::jsonb, $c$["رئيس"]$c$::jsonb, null, 1, 1),
    (v_lesson, 'activity', 'fill_blank', $c$تدريب: أكمل بالكلمة المناسبة (نَقطَع - رَئيس - يَزرَع): أَبو نَبيه ......$c$, $c$[]$c$::jsonb, $c$["يزرع"]$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'mcq', $c$إلى مَن ذَهَبَ هُمامٌ وسُهادُ؟$c$, $c$["أَبيهِما","عَمِّهِما مَهديّ"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$ماذا قالا للعَمِّ؟$c$, $c$["شُكراً لَكَ","عيدُكَ مُبارَكٌ يا عَمُّ"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'true_false', $c$قالَ العَمُّ: وَعيدُكُما سَعيدٌ يا أَولادُ$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$ناهدة تلميذة$c$, 48, 87, 87, 'published', $c$[{"type":"heading","text":"ناهِدَةُ تِلميذَةٌ"},{"type":"figure","description":"صفحة 87 من الكتاب","page":87},{"type":"paragraph","text":"ناهِدَةُ تِلميذَةٌ نَشيطَةٌ\nتَذهَبُ إِلى ٱلمَدرَسَةِ\nعِندَها كُرَةٌ تَلعَبُ بِها\nوَعِندَها ساعَةٌ كَبيرَةٌ ، تَعرِفُ بِها ٱلوَقتَ"},{"type":"example","text":"ة   ـة   ة   ـة   ة   ـة"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$اختر الكلمة التي تنتهي بالتاء المربوطة «ة»:$c$, $c$["ساعَة","بَيت","بَنات"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$إلى أين تَذهَبُ ناهِدَةُ؟$c$, $c$["إِلى ٱلمَدرَسَةِ","إِلى ٱلبُستانِ"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$بماذا تَعرِفُ ناهِدَةُ الوَقتَ؟$c$, $c$["بالكُرَةِ","بالسّاعَةِ"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'true_false', $c$ناهِدَةُ تِلميذَةٌ نَشيطَةٌ$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$هذا ولد$c$, 49, 88, 89, 'published', $c$[{"type":"heading","text":"هٰذا وَلَدٌ"},{"type":"figure","description":"صفحة 88 من الكتاب","page":88},{"type":"paragraph","text":"عِندَهُ قِطارٌ"},{"type":"paragraph","text":"هٰذِهِ بِنتٌ\nعِندَها لُعبَةٌ"},{"type":"paragraph","text":"قالَت هَناء : ما هٰذا ؟\nهٰذا قِطارٌ\nسَأَلَ وَليد : ما هٰذِهِ ؟\nهٰذِهِ لُعبَةٌ"},{"type":"example","text":"هٰذا   هٰذِهِ   هٰذا   هٰذِهِ"},{"type":"heading","text":"تدريب ١"},{"type":"figure","description":"صفحة 89 من الكتاب","page":89},{"type":"paragraph","text":"هٰذا  •  هٰذِهِ"},{"type":"list","items":["...... وَلَدٌ","...... بِنتٌ","...... ديكٌ","...... بَطَّةٌ"],"ordered":false},{"type":"heading","text":"تدريب ٢"},{"type":"paragraph","text":"ت  •  ة  •  ـة"},{"type":"list","items":["بَنا......","فَتا......","ساعَـ......","كُرَ......","بَطَّـ......","بَيـ......"],"ordered":false}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$أكمل بـ (هٰذا أو هٰذِهِ): ...... بِنتٌ$c$, $c$["هٰذا","هٰذِهِ"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 1),
    (v_lesson, 'activity', 'mcq', $c$أكمل بـ (هٰذا أو هٰذِهِ): ...... ديكٌ$c$, $c$["هٰذا","هٰذِهِ"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'mcq', $c$أكمل بـ (هٰذا أو هٰذِهِ): ...... وَلَدٌ$c$, $c$["هٰذِهِ","هٰذا"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$أكمل بـ (هٰذا أو هٰذِهِ): ...... بَطَّةٌ$c$, $c$["هٰذا","هٰذِهِ"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'mcq', $c$ماذا عِندَ الوَلَدِ؟$c$, $c$["لُعبَةٌ","قِطارٌ"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 3),
    (v_lesson, 'quiz', 'mcq', $c$أكمل الكلمة بالحرف المناسب: بَنا......$c$, $c$["ة","ت"]$c$::jsonb, $c$1$c$::jsonb, $c$بَنات$c$, 1, 4);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$طيارة وقاص$c$, 50, 90, 90, 'published', $c$[{"type":"heading","text":"طَيّارَةُ وَقّاصٍ"},{"type":"figure","description":"صفحة 90 من الكتاب","page":90},{"type":"paragraph","text":"عادَ وَقّاصٌ مِنَ ٱلمَدرَسَةِ\nطَلَبَ ٱلمِقَصَّ مِن أُمِّهِ\nقَصَّ بِهِ ٱلوَرَقَ\nوَصَنَعَ مِنهُ طَيّارَةً\nلَعِبَ بِها مَعَ صَديقِهِ مَنصورٍ"},{"type":"example","text":"ص   صـ   ـص   ـصـ   ص   صـ"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$ما الحرف الجديد في كلمة «وَقّاص»؟$c$, $c$["س","ص","ق"]$c$::jsonb, $c$1$c$::jsonb, $c$الحرف الجديد هو الصاد «ص».$c$, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$ماذا طَلَبَ وَقّاصٌ مِن أُمِّهِ؟$c$, $c$["المِقَصَّ","القَلَمَ"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$ماذا صَنَعَ وَقّاصٌ مِنَ الوَرَقِ؟$c$, $c$["زَورَقاً","طَيّارَةً"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'mcq', $c$مَعَ مَن لَعِبَ وَقّاصٌ؟$c$, $c$["صَديقِهِ مَنصورٍ","أُستاذِهِ"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$طيارتي - محفوظة$c$, 51, 91, 91, 'published', $c$[{"type":"heading","text":"طَيّارَتي"},{"type":"figure","description":"صفحة 91 من الكتاب","page":91},{"type":"paragraph","text":"طَيّارَتي     أُحِبُّها\nمِن وَرَقٍ     أَصنَعُها\nطَيّارَتي     سَريعَةْ\nخُيوطُها     رَفيعَةْ\nأَسحَبُها     فَتَرتَفِعْ\nوَ في ٱلهَواءِ     تَندَفِعْ\nبِرَأسِها     تَميلُ\nوَذَيلُها     طَويلُ\nتَطيرُ فَوقَ     رَأسي\nبَعدَ انتِهاءِ     ٱلدَّرْسِ"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$أكمل: طَيّارَتي أُحِبُّها ، مِن وَرَقٍ ......$c$, $c$["أَسحَبُها","أَصنَعُها"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$طَيّارَتي:$c$, $c$["بَطيئَةْ","سَريعَةْ"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'true_false', $c$ذَيلُ الطَّيّارَةِ طَويلُ$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 2);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$صلاح فلاح$c$, 52, 92, 92, 'published', $c$[{"type":"heading","text":"صَلاحٌ فَلّاحٌ"},{"type":"figure","description":"صفحة 92 من الكتاب","page":92},{"type":"paragraph","text":"عِندَهُ حَقلٌ\nيَزرَعُ فيهِ ٱلقَمحَ"},{"type":"paragraph","text":"مَحاسِنُ فَلّاحَةٌ\nتَحلُبُ ٱلبَقَرَةَ"},{"type":"paragraph","text":"تَربِطُ ٱلحِصانَ بِالحَبلِ\nوَتُقَدِّمُ لَهُ ٱلحَشيشَ"},{"type":"example","text":"ح   حـ   ح   ـحـ   ـح   حـ"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$ما الحرف الجديد في كلمة «صَلاحٌ»؟$c$, $c$["ص","ح","ل"]$c$::jsonb, $c$1$c$::jsonb, $c$الحرف الجديد هو الحاء «ح».$c$, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$ماذا يَزرَعُ صَلاحٌ في حَقلِهِ؟$c$, $c$["الوَردَ","القَمحَ"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$مَحاسِنُ فَلّاحَةٌ تَحلُبُ:$c$, $c$["الحِصانَ","البَقَرَةَ"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'true_false', $c$مَحاسِنُ تُقَدِّمُ لِلحِصانِ الحَشيشَ$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$أصباغ هشام$c$, 53, 93, 93, 'published', $c$[{"type":"heading","text":"أَصباغُ هِشامٍ"},{"type":"figure","description":"صفحة 93 من الكتاب","page":93},{"type":"paragraph","text":"هِشامٌ رَسّامٌ\nعِندَهُ عُلبَةُ أَصباغٍ"},{"type":"paragraph","text":"سَأَلَت مَيسونُ : ماذا تَصبُغُ يا هِشامُ ؟\nقالَ هِشامٌ : أَصبُغُ ٱلصّورَةَ بِٱلأَصباغِ"},{"type":"example","text":"غ   ـغ   غ   ـغ   غ   ـغ"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$ما الحرف الجديد في كلمة «أَصباغ»؟$c$, $c$["ع","غ","ص"]$c$::jsonb, $c$1$c$::jsonb, $c$الحرف الجديد هو الغين «غ».$c$, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$هِشامٌ:$c$, $c$["رَسّامٌ","فَلّاحٌ"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$بماذا يَصبُغُ هِشامٌ الصّورَةَ؟$c$, $c$["بالأَصباغِ","بالماءِ"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'true_false', $c$مَيسونُ سَأَلَت هِشاماً: ماذا تَصبُغُ؟$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$غزال وغراب$c$, 54, 94, 94, 'published', $c$[{"type":"heading","text":"غَزالٌ وَ غُرابٌ"},{"type":"figure","description":"صفحة 94 من الكتاب","page":94},{"type":"paragraph","text":"اَلغُرابُ صَديقُ ٱلغَزالِ\nصاحَ ٱلغَزالُ : ساقي مَكسورَةٌ . أَنا عَطشانُ\nقَدَّمَ ٱلغُرابُ إِلَيهِ ماءً\nشَرِبَ ٱلغَزالُ وَ قالَ :\nاَلحَمدُ لِلّٰهِ . أَشكُرُكَ يا صَديقي ."},{"type":"example","text":"غـ   ـغـ   غـ   ـغـ   غـ   ـغـ"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$الغُرابُ صَديقُ:$c$, $c$["الغَزالِ","البَطِّ"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$لماذا صاحَ الغَزالُ؟$c$, $c$["ساقُهُ مَكسورَةٌ وَهُوَ عَطشانُ","ضاعَ في البُستانِ"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$ماذا قَدَّمَ الغُرابُ لِلغَزالِ؟$c$, $c$["تَمراً","ماءً"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'true_false', $c$قالَ الغَزالُ: الحَمدُ لِلّٰهِ ، أَشكُرُكَ يا صَديقي$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$المحادثة والتعبير - آداب الطعام$c$, 55, 95, 97, 'published', $c$[{"type":"heading","text":"آدابُ الطعام"},{"type":"figure","description":"صفحة 95 من الكتاب","page":95},{"type":"example","text":"يحدث المعلم تلاميذه بالمفردات والموضوعات الآتية :","title":"للمعلم"},{"type":"list","items":["نغسل أيدينا قبل تناول الطعام .","لا نأكل حتى يحضر الأب والأم .","قبل أن نأكل نقول : بسم الله الرحمن الرحيم ..","لا نأكل قبل أن يبدأ الأب والأم بتناول الطعام .","نشكر الأب والأم لأنهما أحضرا لنا الطعام جاهزاً .","لا نأكل بسرعة ، ولا نأكل كثيراً ، ولا نتكلم في أثناء الأكل .","بعد الانتهاء من تناول الطعام نقول : الحمد لله .. (اللهم أطعم الجوعان ، واسقِ العطشان ، واشفِ المرضى) .","بعد ذلك نقول : شكراً يا أبي .. شكراً يا أمي .","نغسل أيدينا بالماء والصابون ، وننظف أسناننا ."],"ordered":false},{"type":"heading","text":"تدريب ١"},{"type":"figure","description":"صفحة 96 من الكتاب","page":96},{"type":"paragraph","text":"صَبّاغ  •  صَمغ  •  غَزال  •  مِغزَل"},{"type":"heading","text":"تدريب ٢"},{"type":"list","items":["اَلصَّبّاغُ ......   ( يَصبُغُ  /  يَزرَعُ )","اَلبُلبُلُ ......   ( يَعوي  /  يُغَرِّدُ )","اَلإِناءُ ......   ( فارِغٌ  /  غَنَمٌ )","اَلغُيومُ ......   ( في ٱلسَّماءِ  /  في ٱلحَقلِ )"],"ordered":false},{"type":"heading","text":"تدريب ٣"},{"type":"figure","description":"صفحة 97 من الكتاب","page":97},{"type":"paragraph","text":"اَلطِّفلُ يَنامُ\nاَلوَلَدُ يَقرَأُ\nاَلبِنتُ تَلعَبُ\nاَلبَطُّ يَسبَحُ"},{"type":"heading","text":"تدريب ٤"},{"type":"list","items":["هِـ  +  لال  =  ......","دَ  +  لال  =  ......","بِـ  +  لال  =  ......","أَو  +  لاد  =  ......","بِـ  +  لاد  =  ......","مِيـ  +  لاد  =  ......"],"ordered":false}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$قبل أن نأكل نقول:$c$, $c$["بسم الله الرحمن الرحيم","شكراً يا أمي"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 1),
    (v_lesson, 'activity', 'mcq', $c$تدريب: اَلصَّبّاغُ ......$c$, $c$["يَصبُغُ","يَزرَعُ"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 2),
    (v_lesson, 'activity', 'mcq', $c$تدريب: اَلبُلبُلُ ......$c$, $c$["يَعوي","يُغَرِّدُ"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 3),
    (v_lesson, 'quiz', 'true_false', $c$نأكل بسرعة ونتكلم في أثناء الأكل$c$, $c$[]$c$::jsonb, $c$false$c$::jsonb, $c$لا نأكل بسرعة ، ولا نتكلم في أثناء الأكل.$c$, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$بعد الانتهاء من تناول الطعام نقول:$c$, $c$["الحمد لله","بسم الله الرحمن الرحيم"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'fill_blank', $c$تدريب: هِـ + لال = ......$c$, $c$[]$c$::jsonb, $c$["هلال"]$c$::jsonb, null, 1, 3),
    (v_lesson, 'quiz', 'mcq', $c$تدريب: اَلغُيومُ ......$c$, $c$["في ٱلحَقلِ","في ٱلسَّماءِ"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 4);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$حوض السباحة$c$, 56, 98, 99, 'published', $c$[{"type":"heading","text":"حَوضُ ٱلسِّباحَةِ"},{"type":"figure","description":"صفحة 98 من الكتاب","page":98},{"type":"paragraph","text":"رِياضٌ يَسبَحُ في ٱلحَوضِ\nمَعَ صَديقِهِ ناهِضٍ"},{"type":"paragraph","text":"ضِياءٌ يَقولُ : اَلرِّياضَةُ مُفيدَةٌ"},{"type":"paragraph","text":"نَلعَبُ وَ نَركُضُ . نَفرَحُ وَ نَضحَكُ ."},{"type":"example","text":"ض   ضـ   ـض   ـضـ   ض   ضـ"},{"type":"heading","text":"تدريب ١"},{"type":"figure","description":"صفحة 99 من الكتاب","page":99},{"type":"paragraph","text":"( صـ  ،  ص )   ( حَـ  ،  ح )   ( غَـ  ،  ـغـ )   ( ض  ،  ضِـ )"},{"type":"list","items":["مِقـ......","......لاح","فَلّا......","......قل","......زال","صَـ......ير","حَو......","......ياء"],"ordered":false},{"type":"heading","text":"تدريب ٢"},{"type":"list","items":["بـ • حـ • ر  =  بَحر","حـ • ر • ب  =  ......","حـ • بـ • ر  =  ......","ر • بـ • ح  =  ......","مـ • لـ • ح  =  ......","لـ • حـ • م  =  ......","حـ • مـ • ل  =  ......","مـ • حـ • ل  =  ......"],"ordered":false}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$ما الحرف الجديد في كلمة «حَوض»؟$c$, $c$["ض","و","ح"]$c$::jsonb, $c$0$c$::jsonb, $c$الحرف الجديد هو الضاد «ض».$c$, 1, 1),
    (v_lesson, 'activity', 'ordering', $c$رتّب الحروف لتكوّن كلمة «لَحم»:$c$, $c$["ل","ح","م"]$c$::jsonb, $c$null$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'mcq', $c$مَعَ مَن يَسبَحُ رِياضٌ؟$c$, $c$["صَديقِهِ ناهِضٍ","ضِياءٍ"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$ماذا يَقولُ ضِياءٌ؟$c$, $c$["اَلرِّياضَةُ مُفيدَةٌ","اَلماءُ بارِدٌ"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'true_false', $c$رِياضٌ يَسبَحُ في ٱلحَوضِ$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$فرج نساج$c$, 57, 100, 100, 'published', $c$[{"type":"heading","text":"فَرَجٌ نَسّاجٌ"},{"type":"figure","description":"صفحة 100 من الكتاب","page":100},{"type":"paragraph","text":"يَنسِجُ بِساطاً جَديداً"},{"type":"paragraph","text":"جَميلَةُ نَسّاجَةٌ ماهِرَةٌ\nتَنسِجُ قُماشاً جَميلاً\nتَنقُشُ عَلَيهِ\nوَرداً وَ أَشجاراً"},{"type":"example","text":"ج   جـ   ـجـ   ج   جـ   ـجـ"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$ما الحرف الجديد في كلمة «فَرَجٌ»؟$c$, $c$["ج","ر","ف"]$c$::jsonb, $c$0$c$::jsonb, $c$الحرف الجديد هو الجيم «ج».$c$, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$ماذا يَنسِجُ فَرَجٌ؟$c$, $c$["طَيّارَةً","بِساطاً جَديداً"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$ماذا تَنقُشُ جَميلَةُ عَلى القُماشِ؟$c$, $c$["وَرداً وأَشجاراً","سَمَكاً"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'true_false', $c$جَميلَةُ نَسّاجَةٌ ماهِرَةٌ$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$محراث حارث$c$, 58, 101, 101, 'published', $c$[{"type":"heading","text":"مِحراثُ حارِثٍ"},{"type":"figure","description":"صفحة 101 من الكتاب","page":101},{"type":"paragraph","text":"حارِثٌ فَلّاحٌ\nيَحرُثُ ٱلأَرضَ"},{"type":"paragraph","text":"وَلَدُهُ لَيثٌ يَقودُ ٱلجَرّارَ"},{"type":"paragraph","text":"ثامِرٌ يَجمَعُ ٱلأَثمارَ\nثُرَيّا تَرعى ٱلغَنَمَ\nوَ تُرَبّي ٱلدَّجاجَ"},{"type":"example","text":"ث   ثـ   ث   ثـ   ث   ثـ"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$ما الحرف الجديد في كلمة «حارِثٌ»؟$c$, $c$["ث","ح","ر"]$c$::jsonb, $c$0$c$::jsonb, $c$الحرف الجديد هو الثاء «ث».$c$, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$مَن يَقودُ الجَرّارَ؟$c$, $c$["لَيثٌ","ثامِرٌ"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$ماذا تَفعَلُ ثُرَيّا؟$c$, $c$["تَقودُ الجَرّارَ","تَرعى ٱلغَنَمَ وتُرَبّي ٱلدَّجاجَ"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'mcq', $c$ثامِرٌ يَجمَعُ:$c$, $c$["ٱلأَثمارَ","ٱلحَشيشَ"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$أفراخ الدجاج$c$, 59, 102, 102, 'published', $c$[{"type":"heading","text":"أَفراخُ ٱلدَّجاجِ"},{"type":"figure","description":"صفحة 102 من الكتاب","page":102},{"type":"paragraph","text":"في مَزرَعَةِ ثامِرٍ أَفراخٌ\nأَفراخُ ٱلدَّجاجِ جَميلَةٌ\nيَزرَعُ ثامِرٌ البَطيخَ"},{"type":"paragraph","text":"اَلدَّجاجُ وَ ٱلبَطُّ يُعطينا\nبَيضاً وَ يُعطينا لَحماً"},{"type":"example","text":"خ   خ   خ   خ   خ   خ"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$ما الحرف الجديد في كلمة «أَفراخ»؟$c$, $c$["ف","ر","خ"]$c$::jsonb, $c$2$c$::jsonb, $c$الحرف الجديد هو الخاء «خ».$c$, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$ماذا يَزرَعُ ثامِرٌ؟$c$, $c$["القَمحَ","البَطّيخَ"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'true_false', $c$الدَّجاجُ والبَطُّ يُعطينا بَيضاً ولَحماً$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'mcq', $c$أَفراخُ الدَّجاجِ:$c$, $c$["طَويلَةٌ","جَميلَةٌ"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$عندنا خيمة$c$, 60, 103, 104, 'published', $c$[{"type":"heading","text":"عِندَنا خَيمَةٌ"},{"type":"figure","description":"صفحة 103 من الكتاب","page":103},{"type":"paragraph","text":"أَخَذنا خَيمَةً\nوَ ذَهَبنا إِلى ٱلبُستانِ\nفي ٱلبُستانِ نَخلٌ\nوَ خَوخٌ وَ عِنَبٌ"},{"type":"paragraph","text":"نَصَبنا ٱلخَيمَةَ بَينَ ٱلنَّخيلِ\nأَكَلنا وَ لَعِبنا وَ فَرِحنا"},{"type":"example","text":"خـ   ـخـ   خـ   ـخـ   خـ"},{"type":"heading","text":"تدريب ١"},{"type":"figure","description":"صفحة 104 من الكتاب","page":104},{"type":"paragraph","text":"ح   ج   خ"},{"type":"paragraph","text":"مِفتا......   نَسّا......   طَبّا......\nيَفتَـ......   يَنسِـ......   يَطبُـ......\nفَرَ......   فَرَ......   فَر......"},{"type":"heading","text":"تدريب ٢"},{"type":"paragraph","text":"حـ   جـ   خـ"},{"type":"paragraph","text":"نَـ......لَة   نَـ......لَة   نَـ......لَة\n......بل   ......بَل   ......يل\n......روف   ......رف   ......روف"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'fill_blank', $c$أكمل بالحرف المناسب (ح ، ج ، خ) واكتب الكلمة: نَسّا......$c$, $c$[]$c$::jsonb, $c$["نساج"]$c$::jsonb, null, 1, 1),
    (v_lesson, 'activity', 'fill_blank', $c$أكمل بالحرف المناسب (ح ، ج ، خ) واكتب الكلمة: مِفتا......$c$, $c$[]$c$::jsonb, $c$["مفتاح"]$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'mcq', $c$أين نَصَبوا الخَيمَةَ؟$c$, $c$["في ٱلحَقلِ","بَينَ ٱلنَّخيلِ"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$ماذا في البُستانِ؟$c$, $c$["نَخلٌ وخَوخٌ وعِنَبٌ","سَمَكٌ وبَطٌّ"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'ordering', $c$رتّب الكلمات كما في الدرس:$c$, $c$["أَكَلنا","وَلَعِبنا","وَفَرِحنا"]$c$::jsonb, $c$null$c$::jsonb, null, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$محفوظ وظافر$c$, 61, 105, 105, 'published', $c$[{"type":"heading","text":"مَحفوظٌ وَ ظافِرٌ"},{"type":"figure","description":"صفحة 105 من الكتاب","page":105},{"type":"paragraph","text":"مَحفوظٌ تِلميذٌ نَظيفٌ\nيَقولُ لِصَديقِهِ ظافِرٍ :\nأَحفَظُ دُروسي كُلَّ يَومٍ .\nوَ أُحافِظُ عَلى نَظافَةِ مَدرَسَتي"},{"type":"paragraph","text":"اَلنَّظافَةُ مِنَ ٱلإِيمانِ"},{"type":"example","text":"ظ   ظ   ظ   ظ   ظ   ظ"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$ما الحرف الجديد في كلمة «ظافِر»؟$c$, $c$["ظ","ط","ض"]$c$::jsonb, $c$0$c$::jsonb, $c$الحرف الجديد هو الظاء «ظ».$c$, 1, 1),
    (v_lesson, 'quiz', 'fill_blank', $c$أكمل: اَلنَّظافَةُ مِنَ ......$c$, $c$[]$c$::jsonb, $c$["الإيمان"]$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$مَحفوظٌ يَحفَظُ دُروسَهُ:$c$, $c$["كُلَّ يَومٍ","يَوماً واحِداً"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'true_false', $c$مَحفوظٌ يُحافِظُ عَلى نَظافَةِ مَدرَسَتِهِ$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$أنا فتى - محفوظة$c$, 62, 106, 106, 'published', $c$[{"type":"heading","text":"أَنا فَتًى"},{"type":"figure","description":"صفحة 106 من الكتاب","page":106},{"type":"paragraph","text":"أَنا فَتًى نَظيفُ     وَمَنظَري لَطيفُ\nمُعَلِّمي مِثلُ أَبي     وَأَصدِقائي كُتُبي\nوَ إِنَّني أَمينُ     وَخُلُقي رَصينُ\nأُحِبُّكِ مَدرَسَتي     أَنتِ وَ كُلُّ إِخوَتي"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$أكمل: أَنا فَتًى نَظيفُ ، وَمَنظَري ......$c$, $c$["رَصينُ","لَطيفُ"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$أكمل: مُعَلِّمي مِثلُ ......$c$, $c$["كُتُبي","أَبي"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'true_false', $c$وَأَصدِقائي كُتُبي$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 2);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$آمنة تقرأ القرآن$c$, 63, 107, 107, 'published', $c$[{"type":"heading","text":"آمِنَةُ تَقرَأُ ٱلقُرآنَ"},{"type":"figure","description":"صفحة 107 من الكتاب","page":107},{"type":"paragraph","text":"تَدعو ٱللهَ وَ تَقولُ :\nآمين"},{"type":"paragraph","text":"آدَمُ يَقرَأُ ٱلكِتابَ ."},{"type":"paragraph","text":"مَآرِبُ تَقرَأُ قِصَّةً .\nتَقرَأُ قِصَّةَ ٱلأَسَدِ وَ ٱلفَأرِ"},{"type":"example","text":"ءامِنة = آمِنة  .  القُرءان = القُرآن\nمَأارِب = مَآرِب  .  ءادَم = آدَم"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$اختر الكلمة التي فيها مَدّة «آ»:$c$, $c$["إِناء","آدَم","أَب"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$ماذا تَقرَأُ آمِنَةُ؟$c$, $c$["القُرآنَ","قِصَّةً"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$ماذا يَقرَأُ آدَمُ؟$c$, $c$["القُرآنَ","الكِتابَ"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'mcq', $c$مَآرِبُ تَقرَأُ قِصَّةَ:$c$, $c$["الغَزالِ وَالغُرابِ","الأَسَدِ وَالفَأرِ"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$هيا نتعلم$c$, 64, 108, 108, 'published', $c$[{"type":"heading","text":"هَيّا نَتَعَلَّمُ"},{"type":"figure","description":"صفحة 108 من الكتاب","page":108},{"type":"paragraph","text":"قالَ ٱلمُعَلِّمُ لِتَلاميذِهِ :\nهَيّا نَتَعَلَّمُ ، نَقرَأُ وَ نَكتُبُ"},{"type":"paragraph","text":"قالَتِ ٱلمُعَلِّمَةُ :\nنَرسُمُ وَ نَلْعَبُ\nقالَ ٱلتَّلاميذُ :\nنَقرَأُ وَ نَكتُبُ\nنَرسُمُ وَ نَلْعَبُ"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$قالَ المُعَلِّمُ لِتَلاميذِهِ:$c$, $c$["هَيّا نَتَعَلَّمُ","هَيّا نَنامُ"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$قالَتِ المُعَلِّمَةُ:$c$, $c$["نَزرَعُ وَنَحرُثُ","نَرسُمُ وَنَلعَبُ"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'true_false', $c$قالَ التَّلاميذُ: نَقرَأُ وَنَكتُبُ ، نَرسُمُ وَنَلعَبُ$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 2);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$هشام وفاطمة$c$, 65, 109, 109, 'published', $c$[{"type":"heading","text":"هِشامٌ وَ فاطِمَةُ"},{"type":"figure","description":"صفحة 109 من الكتاب","page":109},{"type":"paragraph","text":"هِشامٌ تِلميذٌ نَبيهٌ\nيَدرُسُ في ٱلصَّفِّ ٱلثّالِثِ\nلَهُ أُختٌ اسمُها فاطِمَةُ"},{"type":"paragraph","text":"فاطِمَةُ تِلميذَةٌ نَبيهَةٌ\nتَدرُسُ في ٱلصَّفِّ ٱلثّاني\nهُما تِلميذانِ مُجتَهِدانِ\nيَذهَبانِ إِلى ٱلمَدرَسَةِ مَعاً"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$في أيّ صَفٍّ يَدرُسُ هِشامٌ؟$c$, $c$["الثّالِث","الثّاني"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$في أيّ صَفٍّ تَدرُسُ فاطِمَةُ؟$c$, $c$["الثّاني","الثّالِث"]$c$::jsonb, $c$0$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$فاطِمَةُ هي:$c$, $c$["مُعَلِّمَةُ هِشامٍ","أُختُ هِشامٍ"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 2),
    (v_lesson, 'quiz', 'true_false', $c$هِشامٌ وفاطِمَةُ يَذهَبانِ إِلى المَدرَسَةِ مَعاً$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 3);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$شكراً لله$c$, 66, 110, 110, 'published', $c$[{"type":"heading","text":"شُكْراً لِلّٰهِ"},{"type":"figure","description":"صفحة 110 من الكتاب","page":110},{"type":"paragraph","text":"اَللهُ رَبُّنا     اَللهُ خالِقُنا\nخَلَقَ ٱلشَّمسَ وَ ٱلقَمَرَ\nوَخَلَقَ ٱلطَّيرَ وَ ٱلشَّجَرَ\nأَنْعَمَ عَلَينا بِٱلماءِ وَ ٱلهَواءِ\nوَ أَنْعَمَ عَلَينا بِٱلصِّحَّةِ وَ ٱلغِذاءِ\nحَمْداً لِلّٰهِ . . شُكْراً لِلّٰهِ"}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'fill_blank', $c$أكمل: اَللهُ رَبُّنا ، اَللهُ ......$c$, $c$[]$c$::jsonb, $c$["خالقنا"]$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$أكمل: خَلَقَ ٱلشَّمسَ وَ......$c$, $c$["ٱلغِذاءَ","ٱلقَمَرَ"]$c$::jsonb, $c$1$c$::jsonb, null, 1, 1),
    (v_lesson, 'quiz', 'true_false', $c$نقول: حَمداً لِلّٰهِ .. شُكراً لِلّٰهِ$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, null, 1, 2);
  raise notice 'seeded قراءتي: 67 lessons (67 published), 290 questions';
end $seed$;


-- يُولَّد تلقائياً من content/ بواسطة scripts/build-seed.py — لا تعدّله يدوياً.
do $seed$
declare v_subject int; v_book int; v_unit int; v_chapter int; v_lesson int;
begin
  select s.id into v_subject from subjects s join grades g on g.id = s.grade_id where g.number = 1 and s.name = $c$الرياضيات$c$;
  if v_subject is null then raise exception 'subject not found: الرياضيات'; end if;
  if exists (select 1 from books where subject_id = v_subject and title = $c$الرياضيات$c$) then
    raise notice 'book already exists, skipped: الرياضيات'; return;
  end if;
  insert into books (subject_id, title, edition, page_count, page_offset) values (v_subject, $c$الرياضيات$c$, $c$الطبعة العاشرة ١٤٤٧ هـ / ٢٠٢٥ م$c$, null, 0) returning id into v_book;
  insert into units (book_id, title, sort_order) values (v_book, $c$الفصل الأول: الأنماط والأعداد حتى ٢٠$c$, 1) returning id into v_unit;
  insert into chapters (unit_id, title, sort_order) values (v_unit, $c$الفصل الأول: الأنماط والأعداد حتى ٢٠$c$, 1) returning id into v_chapter;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$الأنماط$c$, 1, 8, 9, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$العددان ١ ، ٢$c$, 2, 10, 11, 'published', $c$[{"type":"heading","text":"العددان ١ ، ٢"},{"type":"paragraph","text":"لاحظت إيناس أنّ أعداد الحيوانات في حديقة الحيوان مختلفة."},{"type":"figure","description":"صفحة 10 من كتاب الرياضيات","page":10},{"type":"keypoint","text":"فكرة الدرس: أتعرّف العددين ١ ، ٢ وأقرؤهما وأكتبهما."},{"type":"video","url":"/media/g1-math-numbers-1-2.mp4","poster":"/media/g1-math-numbers-1-2.jpg","caption":"حديقة الأعداد: العددان ١ و ٢"},{"type":"heading","text":"المفردات"},{"type":"example","title":"العدد واحد","text":"١\nواحد"},{"type":"example","title":"العدد اثنان","text":"٢\nاثنان"},{"type":"heading","text":"أقرأ الأعداد وأكتبها"},{"type":"list","ordered":true,"items":["أعدّ الأشياء وأكتب العدد.","أكتب العدد ١ والعدد ٢.","أتحدّث: كيف أكتب العدد ٢؟"]},{"type":"figure","description":"صفحة 11 من كتاب الرياضيات","page":11},{"type":"heading","text":"أتدرّب"},{"type":"list","ordered":true,"items":["أحوّط العدد المناسب.","أكتب العددين ١ ، ٢ وأرسم ما يدلّ على كل عدد.","أكوّن نمطاً من العددين ١ ، ٢.","ألوّن بما يدلّ على العدد."]},{"type":"keypoint","text":"نشاط مع الأسرة: اختر شيئين من البيت، ثم اكتب العدد ٢."}]$c$::jsonb, now(), now()) returning id into v_lesson;
  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values
    (v_lesson, 'activity', 'mcq', $c$كم نجمة هنا؟ ⭐ ⭐$c$, $c$["١","٢","٣"]$c$::jsonb, $c$1$c$::jsonb, $c$نعدّ: واحد، اثنان. إذن العدد ٢.$c$, 1, 1),
    (v_lesson, 'activity', 'mcq', $c$أيّ عدد يدلّ على تفاحة واحدة؟ 🍎$c$, $c$["٢","١"]$c$::jsonb, $c$1$c$::jsonb, $c$تفاحة واحدة يدلّ عليها العدد ١.$c$, 1, 2),
    (v_lesson, 'activity', 'matching', $c$صِل كل عدد باسمه.$c$, $c$[{"left":"١","right":"واحد"},{"left":"٢","right":"اثنان"}]$c$::jsonb, $c$null$c$::jsonb, $c$١ واحد، ٢ اثنان.$c$, 1, 3),
    (v_lesson, 'quiz', 'mcq', $c$ما اسم العدد ٢؟$c$, $c$["واحد","اثنان","ثلاثة"]$c$::jsonb, $c$1$c$::jsonb, $c$العدد ٢ نقرؤه: اثنان.$c$, 1, 1),
    (v_lesson, 'quiz', 'mcq', $c$ما اسم العدد ١؟$c$, $c$["واحد","اثنان"]$c$::jsonb, $c$0$c$::jsonb, $c$العدد ١ نقرؤه: واحد.$c$, 1, 2),
    (v_lesson, 'quiz', 'mcq', $c$كم كرة هنا؟ ⚽ ⚽$c$, $c$["١","٢","٤"]$c$::jsonb, $c$1$c$::jsonb, $c$كرتان، فالعدد ٢.$c$, 1, 3),
    (v_lesson, 'quiz', 'true_false', $c$العدد ١ يدلّ على شيء واحد.$c$, $c$[]$c$::jsonb, $c$true$c$::jsonb, $c$نعم، ١ يعني شيئاً واحداً.$c$, 1, 4),
    (v_lesson, 'quiz', 'true_false', $c$العدد ٢ يدلّ على ثلاثة أشياء.$c$, $c$[]$c$::jsonb, $c$false$c$::jsonb, $c$العدد ٢ يدلّ على شيئين اثنين.$c$, 1, 5),
    (v_lesson, 'quiz', 'fill_blank', $c$أكمل النمط: ١ ، ٢ ، ١ ، ٢ ، ١ ، ....$c$, $c$[]$c$::jsonb, $c$["٢","2","اثنان"]$c$::jsonb, $c$النمط يتكرّر: ١ ثم ٢، فيأتي بعد ١ العدد ٢.$c$, 1, 6),
    (v_lesson, 'quiz', 'matching', $c$صِل الصورة بالعدد المناسب.$c$, $c$[{"left":"🐥","right":"١"},{"left":"🐥 🐥","right":"٢"}]$c$::jsonb, $c$null$c$::jsonb, $c$كتكوت واحد ١، كتكوتان ٢.$c$, 1, 7);
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$العددان ٣ ، ٤$c$, 3, 12, 13, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$العددان ٥ ، ٦$c$, 4, 14, 15, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$الأعداد ٧ ، ٨ ، ٩$c$, 5, 16, 17, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$العدد صفر (٠)$c$, 6, 18, 19, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$العدد ١٠$c$, 7, 20, 21, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$الأعداد ١١ ، ١٢ ، ١٣ ، ١٤ ، ١٥$c$, 8, 22, 23, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$الأعداد ١٦ ، ١٧ ، ١٨ ، ١٩ ، ٢٠$c$, 9, 24, 25, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$خطة حل المسألة (استعمل النمط)$c$, 10, 26, 27, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into units (book_id, title, sort_order) values (v_book, $c$الفصل الثاني: مقارنة الأعداد وترتيبها$c$, 2) returning id into v_unit;
  insert into chapters (unit_id, title, sort_order) values (v_unit, $c$الفصل الثاني: مقارنة الأعداد وترتيبها$c$, 1) returning id into v_chapter;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$مقارنة الأعداد حتى ٩$c$, 1, 34, 35, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$السابق والتالي وبين العددين للأعداد حتى ٩$c$, 2, 36, 37, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$ترتيب الأعداد حتى ٩$c$, 3, 38, 39, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$العدد الترتيبي$c$, 4, 40, 41, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$خطة حل المسألة (استعمل التمثيل)$c$, 5, 42, 43, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$مقارنة الأعداد حتى ٢٠$c$, 6, 44, 45, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$السابق والتالي وبين العددين للأعداد حتى ٢٠$c$, 7, 46, 47, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$ترتيب الأعداد حتى ٢٠$c$, 8, 48, 49, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into units (book_id, title, sort_order) values (v_book, $c$الفصل الثالث: الجمع والطرح حتى ١٠$c$, 3) returning id into v_unit;
  insert into chapters (unit_id, title, sort_order) values (v_unit, $c$الفصل الثالث: الجمع والطرح حتى ١٠$c$, 1) returning id into v_chapter;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$قصص الجمع$c$, 1, 56, 57, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$جمع العدد صفر وجمع العدد مع نفسه$c$, 2, 58, 59, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$تكوين الأعداد والجمع حتى ٦$c$, 3, 60, 61, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$تكوين الأعداد والجمع حتى ١٠$c$, 4, 62, 63, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$مفهوم الطرح$c$, 5, 64, 65, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$حقائق الطرح حتى ٦$c$, 6, 66, 67, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$حقائق الطرح حتى ١٠$c$, 7, 68, 69, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$الحقائق المترابطة$c$, 8, 70, 71, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$طرح الصفر وطرح الكل$c$, 9, 72, 73, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$خطة حل المسألة (اعمل أنموذجاً)$c$, 10, 74, 75, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into units (book_id, title, sort_order) values (v_book, $c$الفصل الرابع: التصنيف والتمثيل بمخططات الصور$c$, 4) returning id into v_unit;
  insert into chapters (unit_id, title, sort_order) values (v_unit, $c$الفصل الرابع: التصنيف والتمثيل بمخططات الصور$c$, 1) returning id into v_chapter;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$تصنيف الأشياء بحسب اللون أو الشكل$c$, 1, 82, 83, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$تصنيف الأشياء بحسب النوع$c$, 2, 84, 85, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$التمثيل بالصور$c$, 3, 86, 87, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$قراءة مخطط بالصور$c$, 4, 88, 89, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$خطة حل المسألة (استعمل مخطط الصور)$c$, 5, 90, 91, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into units (book_id, title, sort_order) values (v_book, $c$الفصل الخامس: الجمع حتى العدد ٢٠$c$, 5) returning id into v_unit;
  insert into chapters (unit_id, title, sort_order) values (v_unit, $c$الفصل الخامس: الجمع حتى العدد ٢٠$c$, 1) returning id into v_chapter;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$الجمع بإضافة ١ ، ٢ ، ٣$c$, 1, 98, 99, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$الجمع على خط الأعداد$c$, 2, 100, 101, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$جمع العدد مع نفسه ومع نفسه + ١ ومع نفسه - ١$c$, 3, 102, 103, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$الجمع بتكوين العدد ١٠$c$, 4, 104, 105, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$خطة حل المسألة (اكتب جملة عددية)$c$, 5, 106, 107, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into units (book_id, title, sort_order) values (v_book, $c$الفصل السادس: الطرح حتى ٢٠$c$, 6) returning id into v_unit;
  insert into chapters (unit_id, title, sort_order) values (v_unit, $c$الفصل السادس: الطرح حتى ٢٠$c$, 1) returning id into v_chapter;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$الطرح بالعد إلى الوراء ١ أو ٢ أو ٣$c$, 1, 114, 115, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$الطرح باستعمال خط الأعداد$c$, 2, 116, 117, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$الطرح بالمقارنة$c$, 3, 118, 119, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$العلاقة بين الجمع والطرح (الحقائق المترابطة)$c$, 4, 120, 121, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$خطة حل المسألة (استعمل الخطوات الأربع)$c$, 5, 122, 123, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into units (book_id, title, sort_order) values (v_book, $c$الفصل السابع: الهندسة والقياس$c$, 7) returning id into v_unit;
  insert into chapters (unit_id, title, sort_order) values (v_unit, $c$الفصل السابع: الهندسة والقياس$c$, 1) returning id into v_chapter;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$أيام الأسبوع$c$, 1, 130, 131, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$الوقت بالساعات الكاملة$c$, 2, 132, 133, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$الكسر نصف$c$, 3, 134, 135, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$الكسر ربع$c$, 4, 136, 137, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$الوقت بنصف الساعة$c$, 5, 138, 139, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$الأطوال$c$, 6, 140, 141, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$خطة حل المسألة (استعمل الخطوات الأربع)$c$, 7, 142, 143, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$المجسمات$c$, 8, 144, 145, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$الأشكال المستوية$c$, 9, 146, 147, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$البعد المكاني$c$, 10, 148, 149, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into units (book_id, title, sort_order) values (v_book, $c$الفصل الثامن: الأعداد حتى ٩٩ والقيمة المكانية$c$, 8) returning id into v_unit;
  insert into chapters (unit_id, title, sort_order) values (v_unit, $c$الفصل الثامن: الأعداد حتى ٩٩ والقيمة المكانية$c$, 1) returning id into v_chapter;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$العشرات$c$, 1, 156, 157, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$الآحاد والعشرات حتى ٩٩$c$, 2, 158, 159, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$الأنماط ولوحة المئة (العد خمسات وعشرات)$c$, 3, 160, 161, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$الأنماط ولوحة المئة (العد اثنينات)$c$, 4, 162, 163, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$مقارنة الأعداد حتى ٩٩$c$, 5, 164, 165, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$سابق العدد وتالي العدد وبين العددين$c$, 6, 166, 167, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$ترتيب الأعداد حتى ٩٩$c$, 7, 168, 169, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$خطة حل المسألة (استعمل التبرير المنطقي)$c$, 8, 170, 171, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into units (book_id, title, sort_order) values (v_book, $c$الفصل التاسع: الجمع والطرح حتى ٩٩ دون إعادة تسمية$c$, 9) returning id into v_unit;
  insert into chapters (unit_id, title, sort_order) values (v_unit, $c$الفصل التاسع: الجمع والطرح حتى ٩٩ دون إعادة تسمية$c$, 1) returning id into v_chapter;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$جمع العشرات وطرحها$c$, 1, 178, 179, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$جمع عددين من مرتبتين حتى ٩٩$c$, 2, 180, 181, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$طرح عدد من عدد مكوّن من مرتبتين$c$, 3, 182, 183, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, reviewed_at, published_at) values (v_chapter, $c$خطة حل المسألة (ارسم صورة)$c$, 4, 184, 185, 'draft', $c$[]$c$::jsonb, null, null) returning id into v_lesson;
  raise notice 'seeded الرياضيات: 65 lessons (1 published), 10 questions';
end $seed$;
