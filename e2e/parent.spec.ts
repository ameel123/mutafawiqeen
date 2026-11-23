import { expect, test } from "@playwright/test";
import { register, uid } from "./helpers";

test.describe("ولي الأمر", () => {
  test("ربط طالب بالرمز ومتابعة تقريره", async ({ browser }) => {
    const kidCtx = await browser.newContext();
    const kid = await kidCtx.newPage();
    await register(kid, { role: "student", name: "يوسف", login: `y-${uid()}`, grade: 1 });
    await kid.goto("/student/profile");
    const code = (await kid.getByTestId("link-code").innerText()).trim();
    expect(code).toMatch(/^[A-Z0-9]{6}$/);

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await register(page, { role: "parent", name: "أبو يوسف", login: `p-${uid()}` });
    await expect(page.getByText("لم تربط أي طالب بعد")).toBeVisible();

    await page.getByLabel("رمز الربط من حساب الطالب").fill("ZZZZZZ");
    await page.getByRole("button", { name: "ربط" }).click();
    await expect(page.getByText("الرمز غير صحيح")).toBeVisible();

    await page.getByLabel("رمز الربط من حساب الطالب").fill(code.toLowerCase());
    await page.getByRole("button", { name: "ربط" }).click();
    await expect(page.getByTestId("child-card")).toContainText("يوسف");

    await page.getByTestId("child-card").click();
    await expect(page.getByRole("heading", { name: "يوسف" })).toBeVisible();
    await expect(page.getByText("التقدم في المواد")).toBeVisible();
    await expect(page.getByText("لم يؤدِّ أي اختبار بعد.")).toBeVisible();

    await kid.reload();
    await expect(kid.getByText("مرتبط بـ: أبو يوسف")).toBeVisible();
    await kidCtx.close();
    await ctx.close();
  });

  test("إنشاء حساب طفل من حساب ولي الأمر، ولا يرى أطفال غيره", async ({ page, browser }) => {
    await register(page, { role: "parent", name: "أم سجى", login: `pm-${uid()}` });
    const childLogin = `sj-${uid()}`;
    await page.getByRole("button", { name: "+ إنشاء حساب لطفلي" }).click();
    await page.getByLabel("اسم الطفل").fill("سجى");
    await page.getByLabel("اسم المستخدم (إنكليزي)").fill(childLogin);
    await page.getByLabel("كلمة المرور").fill("kid-pass-1");
    await page.getByRole("button", { name: "الصف الثاني" }).click();
    await page.getByRole("button", { name: "إنشاء الحساب" }).click();
    await expect(page.getByTestId("child-card")).toContainText("سجى");
    await expect(page.getByTestId("child-card")).toContainText("الصف الثاني الابتدائي");

    const childPage = await (await browser.newContext()).newPage();
    const r = await childPage.request.post("/api/auth/login", { data: { login: childLogin, password: "kid-pass-1" } });
    expect((await r.json()).redirect).toBe("/student");

    // Another parent cannot open this child's report.
    const href = await page.getByTestId("child-card").getAttribute("href");
    const other = await (await browser.newContext()).newPage();
    await register(other, { role: "parent", name: "غريب", login: `o-${uid()}` });
    const res = await other.goto(href!);
    expect(res?.status()).toBe(404);
  });
});
