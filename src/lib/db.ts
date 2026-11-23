import "server-only";
import postgres from "postgres";

declare global {
  // eslint-disable-next-line no-var
  var __sql: postgres.Sql | undefined;
}

function create() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL غير مضبوط");
  const local = /@(localhost|127\.0\.0\.1)(:|\/)/.test(url) || url.includes("host=/");
  return postgres(url, {
    // Supabase transaction pooler (port 6543) does not support prepared statements.
    prepare: false,
    // Encrypt the connection to hosted databases (Supabase).
    ssl: local ? false : "require",
    max: Number(process.env.DATABASE_POOL_SIZE ?? 5),
    idle_timeout: 20,
    transform: { undefined: null },
  });
}

/** Shared Postgres client (one per server process). */
export const sql: postgres.Sql = globalThis.__sql ?? (globalThis.__sql = create());

/** Wraps a JS value so postgres.js stores it as jsonb. */
export function json(value: unknown) {
  return sql.json(value as postgres.JSONValue);
}
