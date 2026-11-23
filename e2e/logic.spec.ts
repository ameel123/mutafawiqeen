import { expect, test } from "@playwright/test";
import { buildSteps, speechOf, stripPageRefs, type Block } from "../src/lib/blocks";
import { gradeAnswer, normalizeArabic, normalizeQuestionShape, ratingFor, toPublicQuestion } from "../src/lib/questions";

test.describe("منطق المنصة (بدون متصفح)", () => {
  test("صوت المعلم لا يقرأ أرقام صفحات الكتاب", () => {
    expect(stripPageRefs("انظر صفحة 55 من كتاب قراءتي ثم اقرأ")).toBe("انظر ثم اقرأ");
    expect(stripPageRefs("تمرين (ص ١٢) مهم")).toBe("تمرين مهم");
    expect(stripPageRefs("الصفحات 4-5")).toBe("");
    // The letter ص inside words or without a number stays.
    expect(stripPageRefs("صابر يصيد السمك")).toBe("صابر يصيد السمك");
    const blocks: Block[] = [
      { type: "heading", text: "دادا" },
      { type: "figure", description: "صفحة 21 من الكتاب", page: 21 },
      { type: "image", url: "/x.jpg", caption: "صفحة 21 من كتاب قراءتي" },
      { type: "keypoint", text: "نقرأ من اليمين" },
    ];
    const spoken = speechOf(blocks);
    expect(spoken).not.toContain("21");
    expect(spoken).toContain("تذكّر. نقرأ من اليمين");
  });

  test("تقسيم الدرس إلى شاشات وتحويل صور الكتاب", () => {
    const blocks: Block[] = [
      { type: "heading", text: "أ" },
      { type: "figure", description: "ص", page: 3 },
      { type: "paragraph", text: "نص" },
      { type: "heading", text: "ب" },
      { type: "figure", description: "بلا صورة", page: 99 },
      { type: "paragraph", text: "نص ٢" },
    ];
    const steps = buildSteps(blocks, { 3: "/p3.jpg" });
    expect(steps).toHaveLength(2);
    expect(steps[0][1]).toEqual({ type: "image", url: "/p3.jpg" });
    expect(steps[1].map((b) => b.type)).toEqual(["heading", "paragraph"]);
  });

  test("تصحيح الإجابات المكتوبة يتجاهل التشكيل والهمزات والأرقام الهندية", () => {
    expect(normalizeArabic("إِسْلامٌ")).toBe(normalizeArabic("اسلام"));
    expect(normalizeArabic("مُسْتَشْفى")).toBe(normalizeArabic("مستشفي"));
    expect(normalizeArabic("٧")).toBe("7");
    const fb = { type: "fill_blank" as const, options: [], answer: ["سبعة", "7"] };
    expect(gradeAnswer(fb, "٧")).toBe(true);
    expect(gradeAnswer(fb, " سَبْعَة ")).toBe(true);
    expect(gradeAnswer(fb, "ستة")).toBe(false);
    expect(gradeAnswer(fb, "")).toBe(false);
  });

  test("أنواع الأسئلة: التحقق والتصحيح وإخفاء الإجابة", () => {
    expect(() => normalizeQuestionShape("mcq", ["أ"], 0)).toThrow();
    expect(() => normalizeQuestionShape("mcq", ["أ", "أ"], 0)).toThrow();
    expect(() => normalizeQuestionShape("mcq", ["أ", "ب"], 2)).toThrow();
    expect(() => normalizeQuestionShape("matching", [{ left: "1", right: "x" }, { left: "2", right: "x" }], null)).toThrow();

    const ordering = { id: 1, kind: "quiz" as const, type: "ordering" as const, prompt: "رتّب", options: ["١", "٢", "٣"], answer: null, explanation: "س", points: 1 };
    expect(gradeAnswer(ordering, ["١", "٢", "٣"])).toBe(true);
    expect(gradeAnswer(ordering, ["٢", "١", "٣"])).toBe(false);
    const pub = toPublicQuestion(ordering);
    expect(pub).not.toHaveProperty("answer");
    expect(pub).not.toHaveProperty("explanation");
    expect([...(pub.options as string[])].sort()).toEqual(["١", "٢", "٣"]);

    const matching = {
      type: "matching" as const,
      options: [
        { left: "قطة", right: "مواء" },
        { left: "كلب", right: "نباح" },
      ],
      answer: null,
    };
    expect(gradeAnswer(matching, ["مواء", "نباح"])).toBe(true);
    expect(gradeAnswer(matching, ["نباح", "مواء"])).toBe(false);
    expect(gradeAnswer({ type: "mcq", options: ["a", "b"], answer: 1 }, "1")).toBe(false);
    expect(gradeAnswer({ type: "true_false", options: [], answer: false }, false)).toBe(true);
  });

  test("سلّم التقييم", () => {
    expect(ratingFor(95)).toMatchObject({ rating: "ممتاز", stars: 3 });
    expect(ratingFor(80).rating).toBe("جيد جداً");
    expect(ratingFor(65)).toMatchObject({ rating: "جيد", stars: 2 });
    expect(ratingFor(50).stars).toBe(1);
    expect(ratingFor(20).stars).toBe(0);
  });
});
