"use client";

/** JSON fetch for our API routes; throws Error with the server's Arabic message. */
export async function api<T = unknown>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? (init?.body !== undefined ? "POST" : "GET"),
    headers: init?.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error ?? "تعذر الاتصال بالخادم";
    throw new Error(msg);
  }
  return data as T;
}

export type UploadTarget = {
  uploadUrl: string;
  headers: Record<string, string>;
  path: string;
  publicUrl: string | null;
};

/** Asks the server for an upload URL then sends the file straight to storage. */
export async function uploadFile(
  file: Blob,
  opts: { bucket: "books" | "media"; folder: string; filename: string; contentType?: string },
): Promise<UploadTarget> {
  const contentType = opts.contentType ?? file.type ?? "application/octet-stream";
  const target = await api<UploadTarget>("/api/admin/upload-url", {
    body: { bucket: opts.bucket, folder: opts.folder, filename: opts.filename, contentType, size: file.size },
  });
  const res = await fetch(target.uploadUrl, { method: "PUT", headers: target.headers, body: file });
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.text()).slice(0, 200);
    } catch {}
    throw new Error(`فشل رفع الملف (${res.status}) ${detail}`);
  }
  return target;
}
