#!/usr/bin/env node
// Creates the database tables (first run only) and loads the curriculum seeds.
//   npm run db:setup              (uses DATABASE_URL, or .env.local)
//   npm run db:setup -- --reset   (DELETES everything first — tests / local only)
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Minimal .env.local loader (variables already set in the environment win).
const envFile = path.join(root, ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL غير مضبوط");
  process.exit(1);
}

const reset = process.argv.includes("--reset");
const sql = postgres(url, { prepare: false, max: 1, onnotice: (n) => console.log("  ·", n.message) });

try {
  if (reset) {
    console.log("حذف كل الجداول (--reset)…");
    await sql.unsafe("drop schema if exists public cascade; create schema public;");
  }
  const [{ exists }] = await sql`select to_regclass('public.users') is not null as exists`;
  if (!exists) {
    console.log("إنشاء الجداول…");
    await sql.unsafe(readFileSync(path.join(root, "db", "schema.sql"), "utf8"));
  } else {
    console.log("الجداول موجودة مسبقاً.");
  }

  const [{ storage }] = await sql`select to_regclass('storage.buckets') is not null as storage`;
  if (storage) {
    console.log("تجهيز حاويات التخزين في Supabase…");
    await sql.unsafe(readFileSync(path.join(root, "db", "supabase-storage.sql"), "utf8"));
  }

  const seedDir = path.join(root, "db", "seed");
  for (const f of readdirSync(seedDir).filter((f) => f.endsWith(".sql")).sort()) {
    console.log(`تحميل ${f}…`);
    await sql.unsafe(readFileSync(path.join(seedDir, f), "utf8"));
  }
  console.log("تم ✓");
} catch (e) {
  console.error("فشل:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
