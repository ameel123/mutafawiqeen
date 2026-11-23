<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# منصة المتفوقين — notes for coding agents
- UI text is Arabic, RTL. Lesson text uses the `.book-text` class (Naskh font, diacritics).
- Server data access only (`src/lib/db.ts`, postgres.js). Never expose answers to students: use `toPublicQuestion`.
- Lesson pages are PRINTED page numbers; PDF page = printed + `books.page_offset`.
- After editing `content/*.json` run `npm run seed:build`. Schema lives in `db/schema.sql` (keep `db/setup-supabase.sql` in sync via the same script).
- Tests: `npm run build && npm run test:e2e` (needs a `platform_test` database).
