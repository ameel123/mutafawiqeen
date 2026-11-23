import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const uid = () => Math.random().toString(36).slice(2, 8);

export async function register(page: Page, opts: { role: "student" | "parent"; name: string; login: string; password?: string; grade?: number }) {
  await page.goto(`/register?role=${opts.role}`);
  await page.getByLabel(opts.role === "student" ? "اسم الطالب" : "الاسم").fill(opts.name);
  if (opts.role === "student") await page.getByRole("button", { name: ["الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس"][(opts.grade ?? 1) - 1], exact: true }).click();
  await page.getByLabel("اسم المستخدم (بالإنكليزية) أو البريد").fill(opts.login);
  await page.getByLabel("كلمة المرور").fill(opts.password ?? "pass-1234");
  await page.getByRole("button", { name: "إنشاء الحساب" }).click();
  await page.waitForURL(opts.role === "student" ? "**/student" : "**/parent");
}

export async function login(page: Page, loginName: string, password: string) {
  const r = await page.request.post("/api/auth/login", { data: { login: loginName, password } });
  expect(r.ok()).toBeTruthy();
}

export async function apiJson(req: APIRequestContext, url: string, method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE" = "GET", data?: unknown) {
  const r = await req.fetch(url, { method, data });
  const body = await r.json();
  return { status: r.status(), body };
}

/** The page must not scroll sideways (mobile layout check). */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}
