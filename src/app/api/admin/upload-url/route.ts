import { z } from "zod";
import { randomBytes } from "node:crypto";
import { apiUser, HttpError } from "@/lib/auth";
import { body, handle } from "@/lib/api";
import { createUploadTarget, safeName } from "@/lib/storage";

const MAX = 500 * 1024 * 1024;

const schema = z.object({
  bucket: z.enum(["books", "media"]),
  folder: z
    .string()
    .regex(/^[a-z0-9][a-z0-9/_\-]{0,120}$/, "مسار غير صالح")
    .refine((f) => !f.includes(".."), "مسار غير صالح"),
  filename: z.string().min(1).max(200),
  contentType: z.string().min(1).max(100),
  size: z.number().int().positive().max(MAX, "الملف أكبر من الحد المسموح"),
});

const ALLOWED: Record<string, RegExp> = {
  books: /^application\/pdf$/,
  media: /^(image\/(jpeg|png|webp|gif)|video\/(mp4|webm)|audio\/(mpeg|mp4|webm|ogg))$/,
};

export async function POST(req: Request) {
  return handle(async () => {
    await apiUser("admin");
    const input = await body(req, schema);
    if (!ALLOWED[input.bucket].test(input.contentType)) throw new HttpError(400, "نوع الملف غير مدعوم");
    // Page images keep a stable name (so re-generating replaces them); other files get a unique suffix.
    const stable = /^books\/\d+\/pages$/.test(input.folder);
    const name = stable ? safeName(input.filename) : `${randomBytes(4).toString("hex")}-${safeName(input.filename)}`;
    return createUploadTarget(input.bucket, `${input.folder}/${name}`, input.contentType);
  });
}
