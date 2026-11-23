import { expect, test } from "@playwright/test";
import { expectNoHorizontalScroll, register, uid } from "./helpers";

test("الصفحات الأساسية مناسبة للهاتف", async ({ page }) => {
  await page.goto("/");
  await expectNoHorizontalScroll(page);
  await register(page, { role: "student", name: "ليلى", login: `mob-${uid()}`, grade: 1 });
  await expectNoHorizontalScroll(page);

  await page.getByRole("link", { name: /اللغة العربية/ }).click();
  await expectNoHorizontalScroll(page);
  await page.getByRole("link", { name: /^1\s*دادا/ }).click();
  await expect(page.getByTestId("lesson-step")).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.getByRole("button", { name: "التالي" }).click();
  await page.getByRole("link", { name: "ابدأ الاختبار" }).click();
  await expect(page.getByTestId("quiz-question")).toBeVisible();
  await expectNoHorizontalScroll(page);
});
