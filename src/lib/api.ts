import "server-only";
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { HttpError } from "./auth";

/** Runs a route handler body and turns errors into JSON { error } responses. */
export async function handle<T>(fn: () => Promise<T>) {
  try {
    const data = await fn();
    return NextResponse.json(data ?? { ok: true });
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message ?? "بيانات غير صالحة" }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: "حدث خطأ غير متوقع، حاول مرة أخرى" }, { status: 500 });
  }
}

export async function body<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, "بيانات غير صالحة");
  }
  return schema.parse(raw);
}

export function intParam(v: string | undefined | null): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, "معرّف غير صالح");
  return n;
}
