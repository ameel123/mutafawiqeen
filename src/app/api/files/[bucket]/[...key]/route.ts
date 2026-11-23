import { NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { localRoot, verifyLocal } from "@/lib/storage";

// Local-disk storage used when Supabase is not configured (development and tests).

const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
};

type Ctx = { params: Promise<{ bucket: string; key: string[] }> };

async function resolve(ctx: Ctx) {
  if (process.env.SUPABASE_URL) return null;
  const { bucket, key } = await ctx.params;
  if (bucket !== "books" && bucket !== "media") return null;
  const rel = key.map(decodeURIComponent).join("/");
  const root = path.join(/*turbopackIgnore: true*/ localRoot(), bucket);
  const file = path.resolve(/*turbopackIgnore: true*/ root, rel);
  if (!file.startsWith(root + path.sep)) return null;
  return { bucket, rel, file };
}

function signatureOk(req: Request, bucket: string, rel: string) {
  const u = new URL(req.url);
  const exp = Number(u.searchParams.get("exp"));
  const sig = u.searchParams.get("sig") ?? "";
  return exp > Date.now() && verifyLocal(`${bucket}/${rel}:${exp}`, sig);
}

export async function GET(req: Request, ctx: Ctx) {
  const r = await resolve(ctx);
  if (!r) return new NextResponse("Not found", { status: 404 });
  if (r.bucket === "books" && !signatureOk(req, r.bucket, r.rel)) return new NextResponse("Forbidden", { status: 403 });
  let size: number;
  try {
    size = (await stat(r.file)).size;
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
  const type = TYPES[path.extname(r.file).toLowerCase()] ?? "application/octet-stream";
  const range = req.headers.get("range");
  const m = range && /bytes=(\d*)-(\d*)/.exec(range);
  if (m) {
    const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    const stream = Readable.toWeb(createReadStream(r.file, { start, end })) as ReadableStream;
    return new NextResponse(stream, {
      status: 206,
      headers: {
        "content-type": type,
        "content-length": String(end - start + 1),
        "content-range": `bytes ${start}-${end}/${size}`,
        "accept-ranges": "bytes",
      },
    });
  }
  const stream = Readable.toWeb(createReadStream(r.file)) as ReadableStream;
  return new NextResponse(stream, {
    headers: {
      "content-type": type,
      "content-length": String(size),
      "accept-ranges": "bytes",
      "cache-control": r.bucket === "media" ? "public, max-age=3600" : "private, no-store",
    },
  });
}

export async function PUT(req: Request, ctx: Ctx) {
  const r = await resolve(ctx);
  if (!r) return new NextResponse("Not found", { status: 404 });
  if (!signatureOk(req, r.bucket, r.rel)) return new NextResponse("Forbidden", { status: 403 });
  const buf = Buffer.from(await req.arrayBuffer());
  await mkdir(path.dirname(r.file), { recursive: true });
  await writeFile(r.file, buf);
  return NextResponse.json({ ok: true, size: buf.length });
}
