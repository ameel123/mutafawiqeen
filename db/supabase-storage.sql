-- يُشغَّل على Supabase فقط (بعد schema.sql): ينشئ حاويات التخزين.
-- books: ملفات PDF الأصلية (خاصة، للمشرف فقط)
-- media: صور الصفحات وصور الدروس والفيديو (عامة للعرض)
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('books', 'books', false, 52428800),
  ('media', 'media', true, 52428800)
on conflict (id) do nothing;
