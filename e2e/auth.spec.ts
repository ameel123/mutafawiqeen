import { expect, test } from "@playwright/test";
import { register, uid } from "./helpers";

test.describe("الحسابات والصلاحيات", () => {
  test("تسجيل طالب ثم خروج ودخول", async ({ page }) => {
    const login = `stu-${uid()}`;
    await register(page, { role: "student", name: "سارة", login, grade: 1 });
    await expect(page.getByRole("heading", { name: /أهلاً سارة/ })).toBeVisible();

    await page.getByRole("button", { name: "تسجيل الخروج" }).click();
    await page.waitForURL("/");

    await page.goto("/login");
    await page.getByLabel("اسم المستخدم أو البريد").fill(login);
    await page.getByLabel("كلمة المرور").fill("wrong-pass");
    await page.getByRole("button", { name: "دخول" }).click();
    await expect(page.getByText("اسم المستخدم أو كلمة المرور غير صحيحة")).toBeVisible();

    await page.getByLabel("كلمة المرور").fill("pass-1234");
    await page.getByRole("button", { name: "دخول" }).click();
    await page.waitForURL("**/student");
  });

  test("اسم مستخدم مكرر وحقول ناقصة", async ({ page, request }) => {
    const login = `dup-${uid()}`;
    const ok = await request.post("/api/auth/register", { data: { login, password: "pass-1234", displayName: "أحمد", role: "parent" } });
    expect(ok.status()).toBe(200);
    const dup = await request.post("/api/auth/register", { data: { login, password: "pass-1234", displayName: "أحمد", role: "parent" } });
    expect(dup.status()).toBe(409);
    const noGrade = await request.post("/api/auth/register", { data: { login: `g-${uid()}`, password: "pass-1234", displayName: "علي", role: "student" } });
    expect(noGrade.status()).toBe(400);
    const shortPw = await request.post("/api/auth/register", { data: { login: `p-${uid()}`, password: "123", displayName: "علي", role: "parent" } });
    expect((await shortPw.json()).error).toContain("6");
    // Self-registering as admin is not possible.
    const asAdmin = await request.post("/api/auth/register", { data: { login: `a-${uid()}`, password: "pass-1234", displayName: "x", role: "admin" } });
    expect(asAdmin.status()).toBe(400);
  });

  test("الصفحات المحمية تعيد التوجيه حسب الدور", async ({ page }) => {
    await page.goto("/student");
    await page.waitForURL("**/login");
    await page.goto("/admin");
    await page.waitForURL("**/login");

    await register(page, { role: "student", name: "طالب", login: `r-${uid()}`, grade: 3 });
    await page.goto("/admin");
    await page.waitForURL("**/student");
    await page.goto("/parent");
    await page.waitForURL("**/student");

    const r = await page.request.post("/api/admin/subjects", { data: { gradeId: 1, name: "اختراق" } });
    expect(r.status()).toBe(403);
    const r2 = await page.request.post("/api/admin/upload-url", {
      data: { bucket: "media", folder: "x", filename: "a.jpg", contentType: "image/jpeg", size: 10 },
    });
    expect(r2.status()).toBe(403);
  });
});
