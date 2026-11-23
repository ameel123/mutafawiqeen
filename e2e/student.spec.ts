import { expect, test, type Page } from "@playwright/test";
import { register, uid } from "./helpers";

async function openMathLesson(page: Page) {
  await page.getByRole("link", { name: /الرياضيات/ }).click();
  await expect(page.getByRole("heading", { name: "الرياضيات" })).toBeVisible();
  await page.getByRole("link", { name: /العددان ١ ، ٢/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "العددان ١ ، ٢" })).toBeVisible();
}

test.describe("تجربة الطالب", () => {
  test("الصفحة الرئيسية تعرض مواد الصف", async ({ page }) => {
    await register(page, { role: "student", name: "زيد", login: `z-${uid()}`, grade: 1 });
    await expect(page.getByRole("link", { name: /اللغة العربية/ })).toContainText("67 درس");
    await expect(page.getByRole("link", { name: /الرياضيات/ })).toContainText("1 درس");
    await expect(page.getByText("قريباً").first()).toBeVisible();
  });

  test("درس قراءتي يعرض صفحة الكتاب ولا يقرأ أرقام الصفحات", async ({ page }) => {
    await register(page, { role: "student", name: "مريم", login: `m-${uid()}`, grade: 1 });
    await page.getByRole("link", { name: /اللغة العربية/ }).click();
    await page.getByRole("link", { name: /^1\s*دادا/ }).click();
    const step = page.getByTestId("lesson-step");
    await expect(step.locator('img[src*="/books/g1-qiraati/021.webp"]')).toBeVisible();
    await expect(step).not.toContainText("صفحة 21");
    await page.getByRole("button", { name: "التالي" }).click();
    await expect(page.getByText("أحسنت! أنهيت شرح الدرس")).toBeVisible();
    await expect(page.getByText("أنشطة الدرس")).toBeVisible();
  });

  test("الأنشطة تصحَّح فوراً والاختبار يُقيَّم ويُحفظ", async ({ page }) => {
    await register(page, { role: "student", name: "علي", login: `a-${uid()}`, grade: 1 });
    await openMathLesson(page);
    await expect(page.locator("video")).toBeVisible();

    // Go to the last screen (activities).
    for (let i = 0; i < 6 && (await page.getByRole("button", { name: "التالي" }).isVisible()); i++) {
      await page.getByRole("button", { name: "التالي" }).click();
    }
    const first = page.getByTestId("activity").first();
    await first.getByRole("button", { name: "١", exact: true }).click();
    await first.getByRole("button", { name: "تحقق من إجابتي" }).click();
    await expect(first).toContainText("ليست صحيحة");
    await first.getByRole("button", { name: "٢", exact: true }).click();
    await first.getByRole("button", { name: "تحقق من إجابتي" }).click();
    await expect(first).toContainText("أحسنت");

    // Two wrong tries reveal the right answer.
    const second = page.getByTestId("activity").nth(1);
    for (let i = 0; i < 2; i++) {
      await second.getByRole("button", { name: "٢", exact: true }).click();
      await second.getByRole("button", { name: "تحقق من إجابتي" }).click();
      if (i === 0) {
        await expect(second).toContainText("ليست صحيحة");
        await expect(second).not.toContainText("الإجابة الصحيحة");
        await second.getByRole("button", { name: "١", exact: true }).click();
      }
    }
    await expect(second).toContainText("الإجابة الصحيحة: ١");

    await page.getByRole("link", { name: "ابدأ الاختبار" }).click();
    const q = page.getByTestId("quiz-question");
    const next = () => page.getByRole("button", { name: "التالي" }).click();

    await expect(q).toContainText("ما اسم العدد ٢؟");
    await q.getByRole("button", { name: "اثنان" }).click();
    await next();
    await q.getByRole("button", { name: "واحد" }).click();
    await next();
    await q.getByRole("button", { name: "٢", exact: true }).click();
    await next();
    await q.getByRole("button", { name: "صح" }).click();
    await next();
    await q.getByRole("button", { name: "خطأ" }).click();
    await next();
    await q.getByLabel("الإجابة").fill("2");
    await next();
    // Matching: pick a left item, then its partner.
    await q.getByRole("button", { name: /^1\s*🐥$/ }).click();
    await q.getByRole("button", { name: "١", exact: true }).click();
    await q.getByRole("button", { name: /^2\s*🐥 🐥$/ }).click();
    await q.getByRole("button", { name: "٢", exact: true }).click();

    await page.getByRole("button", { name: "أنهِ الاختبار" }).click();
    await expect(page.getByText("100%")).toBeVisible();
    await expect(page.getByText("ممتاز")).toBeVisible();
    await expect(page.getByTestId("review-item")).toHaveCount(7);

    await page.goto("/student/results");
    await expect(page.getByText("العددان ١ ، ٢")).toBeVisible();
    await page.goto("/student");
    await expect(page.getByRole("link", { name: /تابع من حيث توقفت/ })).toContainText("العددان ١ ، ٢");
    await page.locator("section").getByRole("link", { name: /الرياضيات/ }).click();
    await expect(page.getByRole("link", { name: /العددان ١ ، ٢/ })).toContainText("100%");
  });

  test("الأسئلة لا تكشف الإجابات ولا يمكن التلاعب بالتصحيح", async ({ page }) => {
    await register(page, { role: "student", name: "هدى", login: `h-${uid()}`, grade: 1 });
    await page.getByRole("link", { name: /الرياضيات/ }).click();
    const href = await page.getByRole("link", { name: /العددان ١ ، ٢/ }).getAttribute("href");
    const lessonId = Number(href!.split("/").pop());

    const quiz = await (await page.request.get(`/api/student/quiz?scope=lesson&id=${lessonId}`)).json();
    expect(quiz.questions.length).toBe(7);
    for (const q of quiz.questions) {
      expect(q).not.toHaveProperty("answer");
      expect(q).not.toHaveProperty("explanation");
    }
    const matching = quiz.questions.find((q: { type: string }) => q.type === "matching");
    expect(matching.options).toHaveProperty("lefts");

    // Instant checking is for activities only.
    const check = await page.request.post("/api/student/check", { data: { questionId: quiz.questions[0].id, answer: 0 } });
    expect(check.status()).toBe(404);

    // Questions from another lesson are rejected.
    await page.goto("/student/subjects/1");
    const other = await page.getByRole("link", { name: /^1\s*دادا/ }).getAttribute("href");
    const otherQuiz = await (await page.request.get(`/api/student/quiz?scope=lesson&id=${other!.split("/").pop()}`)).json();
    const bad = await page.request.post("/api/student/quiz/submit", {
      data: { scope: "lesson", scopeId: lessonId, answers: [{ questionId: otherQuiz.questions[0].id, answer: 0 }] },
    });
    expect(bad.status()).toBe(400);

    // Unpublished lessons are not reachable.
    const draft = await page.request.get(`/api/student/quiz?scope=lesson&id=${lessonId + 1}`);
    expect(draft.status()).toBe(404);
  });

  test("طالب صف آخر لا يرى دروس الصف الأول", async ({ page }) => {
    await register(page, { role: "student", name: "كرار", login: `k-${uid()}`, grade: 4 });
    await expect(page.getByText("قريباً").first()).toBeVisible();
    const res = await page.goto("/student/subjects/1");
    expect(res?.status()).toBe(404);
  });
});
