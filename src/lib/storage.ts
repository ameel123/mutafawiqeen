import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "node:crypto";
import path from "node:path";

/**
 * Two buckets:
 *  - books: original PDF books (private; admin downloads through short-lived signed URLs)
 *  - media: page images, lesson pictures and videos (public, read by students)
 *
 * With SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY files go to Supabase Storage.
 * Without them (local development / tests) files are kept on disk in LOCAL_STORAGE_DIR.
 */
export type Bucket = "books" | "media";

export type UploadTarget = {
  uploadUrl: string;
  headers: Record<string, string>;
  path: string;
  publicUrl: string | null;
};

const useSupabase = () => !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

let client: SupabaseClient | null = null;
function supabase() {
  if (!client) {
    client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export const localRoot = () =>
  path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.LOCAL_STORAGE_DIR ?? ".data/storage");

function localSecret() {
  return process.env.SESSION_SECRET ?? "local-dev-secret";
}
export function signLocal(value: string) {
  return createHmac("sha256", localSecret()).update(value).digest("base64url");
}
export function verifyLocal(value: string, sig: string) {
  const a = Buffer.from(signLocal(value));
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function publicUrl(bucket: Bucket, key: string): string {
  if (useSupabase()) return supabase().storage.from(bucket).getPublicUrl(key).data.publicUrl;
  return `/api/files/${bucket}/${key}`;
}

/** A URL the browser can PUT the file to directly (bypasses the server's body-size limit). */
export async function createUploadTarget(bucket: Bucket, key: string, contentType: string): Promise<UploadTarget> {
  if (useSupabase()) {
    const { data, error } = await supabase().storage.from(bucket).createSignedUploadUrl(key, { upsert: true });
    if (error || !data) throw new Error(`تعذر تجهيز الرفع: ${error?.message ?? "unknown"}`);
    return {
      uploadUrl: data.signedUrl,
      headers: { "content-type": contentType, "x-upsert": "true", "cache-control": "max-age=31536000" },
      path: key,
      publicUrl: bucket === "media" ? publicUrl(bucket, key) : null,
    };
  }
  const expires = Date.now() + 2 * 3600_000;
  const payload = `${bucket}/${key}:${expires}`;
  return {
    uploadUrl: `/api/files/${bucket}/${key}?exp=${expires}&sig=${signLocal(payload)}`,
    headers: { "content-type": contentType },
    path: key,
    publicUrl: bucket === "media" ? publicUrl(bucket, key) : null,
  };
}

/** Short-lived download link for a private object (book PDFs). */
export async function signedDownloadUrl(bucket: Bucket, key: string): Promise<string> {
  if (useSupabase()) {
    const { data, error } = await supabase().storage.from(bucket).createSignedUrl(key, 3600);
    if (error || !data) throw new Error(`تعذر فتح الملف: ${error?.message ?? "unknown"}`);
    return data.signedUrl;
  }
  const expires = Date.now() + 3600_000;
  return `/api/files/${bucket}/${key}?exp=${expires}&sig=${signLocal(`${bucket}/${key}:${expires}`)}`;
}

export async function removeObjects(bucket: Bucket, keys: string[]) {
  if (!keys.length) return;
  if (useSupabase()) {
    for (let i = 0; i < keys.length; i += 500) await supabase().storage.from(bucket).remove(keys.slice(i, i + 500));
    return;
  }
  const fs = await import("node:fs/promises");
  for (const k of keys) await fs.rm(path.join(/*turbopackIgnore: true*/ localRoot(), bucket, k), { force: true });
}

/** Key from a public media URL (for cleanup); null when it is not ours. */
export function mediaKeyFromUrl(url: string): string | null {
  const local = "/api/files/media/";
  if (url.startsWith(local)) return url.slice(local.length);
  const marker = "/storage/v1/object/public/media/";
  const i = url.indexOf(marker);
  return i >= 0 ? decodeURIComponent(url.slice(i + marker.length)) : null;
}

export const safeName = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(-80) || "file";
