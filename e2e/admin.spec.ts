import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { ADMIN } from "../playwright.config";
import { register, uid } from "./helpers";

test.describe.configure({ mode: "serial" });

async function adminPage(page: Page) {
  page.on("dialog", (d) => d.accept());
  const r = await page.request.post("/api/auth/login", { data: { login: ADMIN.login, password: ADMIN.password } });
  if (r.status() !== 200) {
    // First run: the account whose login equals ADMIN_EMAIL becomes the admin.
    const reg = await page.request.post("/api/auth/register", {
      data: { login: ADMIN.login, password: ADMIN.password, displayName: "المشرف", role: "parent" },
    });
    expect((await reg.json()).redirect).toBe("/admin");
  }
}

const SUBJECT = `مادة تجريبية ${uid()}`;

test.describe("لوحة الإدارة: من ملف PDF إلى درس منشور", () => {
  test("المشرف يرى لوحة التحكم وحالة المحتوى", async ({ page }) => {
    await adminPage(page);
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "لوحة التحكم" })).toBeVisible();
    await expect(page.getByRole("link", { name: /قراءتي|اللغة العربية/ }).first()).toBeVisible();
  });

  test("إضافة مادة وكتاب ورفع PDF وبناء درس ونشره", async ({ page, browser }) => {
    await adminPage(page);
    await page.goto("/admin/subjects");
    const grade2 = page.getByTestId("grade-2");
    await grade2.getByRole("button", { name: "مادة", exact: true }).click();
    await page.getByLabel("اسم المادة", { exact: true }).fill(SUBJECT);
    await page.getByRole("button", { name: "إضافة", exact: true }).click();
    await expect(grade2.getByText(SUBJECT)).toBeVisible();
    await grade2.locator("li", { hasText: SUBJECT }).getByRole("link", { name: "الكتب" }).click();

    await page.getByLabel("عنوان الكتاب").fill("كتاب الاختبار");
    await page.getByRole("button", { name: "إنشاء الكتاب" }).click();
    await page.waitForURL(/\/admin\/books\/\d+/);

    // Upload the original PDF: pages are rendered in the browser and stored.
    await page.getByTestId("pdf-input").setInputFiles(path.join(__dirname, "fixtures", "sample-book.pdf"));
    await expect(page.getByText("3 صورة صفحة من 3")).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('img[src*="/api/files/media/books/"]')).toHaveCount(3);

    // Structure: unit → lesson with its printed pages.
    await page.getByLabel("عنوان وحدة جديدة").fill("الوحدة الأولى");
    await page.getByRole("button", { name: "وحدة" }).click();
    await expect(page.getByTestId("unit")).toHaveCount(1);
    await page.getByLabel("عنوان درس جديد").fill("الدرس التجريبي");
    await page.getByLabel("من صفحة").fill("1");
    await page.getByLabel("إلى صفحة").fill("2");
    await page.getByRole("button", { name: "درس", exact: true }).click();
    const row = page.getByTestId("lesson-row");
    await expect(row).toContainText("مسودة");
    await row.getByRole("link", { name: "المحتوى" }).click();
    await page.waitForURL(/\/admin\/lessons\/\d+/);
    const lessonId = Number(page.url().split("/").pop());

    // Content: book page pictures + a paragraph + an uploaded picture.
    await page.getByRole("button", { name: "صور صفحات الدرس" }).click();
    await expect(page.getByTestId("block")).toHaveCount(2);
    await page.getByRole("button", { name: "فقرة", exact: true }).click();
    await page.getByLabel("فقرة").fill("هذه فقرة من الدرس التجريبي.");
    await page.getByRole("button", { name: "صورة", exact: true }).click();
    await page.getByTestId("media-input").setInputFiles(path.join(__dirname, "fixtures", "picture.jpg"));
    await expect(page.getByTestId("block")).toHaveCount(4);
    await page.getByRole("button", { name: "حفظ المحتوى" }).click();
    await expect(page.getByText("بانتظار المراجعة").first()).toBeVisible();

    // Review, then publishing needs at least one quiz question.
    await page.getByRole("button", { name: "راجعته وهو مطابق للكتاب" }).click();
    await expect(page.getByRole("button", { name: "نشر للطلاب" })).toBeDisabled();

    await page.getByRole("button", { name: /الأنشطة والأسئلة/ }).click();
    await page.getByRole("button", { name: "سؤال", exact: true }).click();
    const form = page.getByTestId("question-form");
    await form.getByLabel("نص السؤال").fill("ما لون السماء؟");
    await form.getByLabel("الخيار 1", { exact: true }).fill("أخضر");
    await form.getByLabel("الخيار 2", { exact: true }).fill("أزرق");
    await form.getByLabel("الخيار 2 صحيح").check();
    await form.getByRole("button", { name: "حفظ السؤال" }).click();
    await expect(page.getByTestId("q-quiz")).toContainText("✓ أزرق");

    // An activity (true/false) as well.
    await page.getByRole("button", { name: "نشاط", exact: true }).click();
    await page.getByTestId("question-form").getByRole("button", { name: "صح أو خطأ" }).click();
    await page.getByTestId("question-form").getByLabel("نص السؤال").fill("الشمس تشرق من الشرق");
    await page.getByTestId("question-form").getByRole("button", { name: "حفظ السؤال" }).click();
    await expect(page.getByTestId("q-activity")).toContainText("✓ صح");

    await page.getByRole("button", { name: "نشر للطلاب" }).click();
    await expect(page.getByText("منشور").first()).toBeVisible();

    // A grade-2 student now sees the lesson with the book page.
    const student = await (await browser.newContext()).newPage();
    await register(student, { role: "student", name: "طالب ثاني", login: `s2-${uid()}`, grade: 2 });
    await student.getByRole("link", { name: new RegExp(SUBJECT) }).click();
    await student.getByRole("link", { name: /الدرس التجريبي/ }).click();
    const step = student.getByTestId("lesson-step");
    await expect(step.locator('img[src*="/api/files/media/books/"]').first()).toBeVisible();
    await expect(step).toContainText("هذه فقرة من الدرس التجريبي.");

    // Unpublishing hides it again.
    await page.getByRole("button", { name: "إلغاء النشر" }).click();
    await expect(page.getByText("تمت المراجعة").first()).toBeVisible();
    const res = await student.goto(`/student/lessons/${lessonId}`);
    expect(res?.status()).toBe(404);
  });

  test("إدارة المستخدمين: تغيير الصف وكلمة المرور", async ({ page, browser }) => {
    await adminPage(page);
    const login = `u-${uid()}`;
    const kid = await (await browser.newContext()).newPage();
    await register(kid, { role: "student", name: "طالب للتعديل", login, grade: 1 });

    await page.goto(`/admin/users?q=${login}`);
    const row = page.locator("tr", { hasText: login });
    await row.getByLabel("الصف").selectOption("5");
    await expect(row.getByLabel("الصف")).toHaveValue("5");
    await row.getByRole("button", { name: "كلمة المرور" }).click();
    await row.getByLabel("كلمة المرور الجديدة").fill("new-pass-99");
    await row.getByRole("button", { name: "حفظ" }).click();
    await expect(row.getByLabel("كلمة المرور الجديدة")).toHaveCount(0);

    // Old sessions end; the new password works and the grade changed.
    await kid.goto("/student");
    await kid.waitForURL("**/login");
    const r = await kid.request.post("/api/auth/login", { data: { login, password: "new-pass-99" } });
    expect(r.status()).toBe(200);
    await kid.goto("/student");
    await expect(kid.getByText("الصف الخامس الابتدائي")).toBeVisible();
  });
});
