#!/usr/bin/env python3
"""Builds db/seed/*.sql from the curriculum files in content/.

Each seed is one idempotent PL/pgSQL block: it does nothing if the book already exists.
Run:  python3 scripts/build-seed.py
"""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTENT = os.path.join(ROOT, "content")
OUT = os.path.join(ROOT, "db", "seed")

BLOCK_TYPES = {"heading", "paragraph", "keypoint", "example", "list", "image", "figure", "video"}


def lit(s: str) -> str:
    tag = "$c$"
    assert tag not in s
    return f"{tag}{s}{tag}"


def jlit(v) -> str:
    return lit(json.dumps(v, ensure_ascii=False, separators=(",", ":"))) + "::jsonb"


def check_blocks(blocks, where):
    for b in blocks:
        t = b.get("type")
        assert t in BLOCK_TYPES, f"{where}: unknown block {t}"
        if t in ("heading", "paragraph", "keypoint", "example"):
            assert b.get("text", "").strip(), f"{where}: empty {t}"
        if t == "list":
            assert b.get("items"), f"{where}: empty list"
        if t in ("image", "video"):
            assert b.get("url"), f"{where}: {t} without url"
        if t == "figure":
            assert b.get("description"), f"{where}: figure without description"


def check_question(q, where):
    t = q["type"]
    o, a = q.get("options", []), q.get("answer")
    assert q["prompt"].strip(), where
    if t == "mcq":
        assert 2 <= len(o) <= 6 and len(set(o)) == len(o), f"{where}: mcq options"
        assert isinstance(a, int) and 0 <= a < len(o), f"{where}: mcq answer"
    elif t == "true_false":
        assert isinstance(a, bool), f"{where}: tf answer"
    elif t == "fill_blank":
        assert isinstance(a, list) and 1 <= len(a) <= 6, f"{where}: fill answers"
    elif t == "ordering":
        assert 2 <= len(o) <= 8 and len(set(o)) == len(o), f"{where}: ordering"
    elif t == "matching":
        assert 2 <= len(o) <= 6 and len({p["right"] for p in o}) == len(o), f"{where}: matching"
    else:
        raise AssertionError(f"{where}: type {t}")


def norm_q(q):
    t = q["type"]
    options = q.get("options") or []
    answer = q.get("answer")
    if t in ("ordering", "matching"):
        answer = None
    if t in ("true_false", "fill_blank"):
        options = []
    return t, options, answer, q.get("explanation")


def render(spec) -> str:
    book = spec["book"]
    lines = []
    w = lines.append
    w("-- يُولَّد تلقائياً من content/ بواسطة scripts/build-seed.py — لا تعدّله يدوياً.")
    w("do $seed$")
    w("declare v_subject int; v_book int; v_unit int; v_chapter int; v_lesson int;")
    w("begin")
    w(
        f"  select s.id into v_subject from subjects s join grades g on g.id = s.grade_id "
        f"where g.number = {spec['grade']} and s.name = {lit(spec['subject'])};"
    )
    w(f"  if v_subject is null then raise exception 'subject not found: {spec['subject']}'; end if;")
    w(f"  if exists (select 1 from books where subject_id = v_subject and title = {lit(book['title'])}) then")
    w(f"    raise notice 'book already exists, skipped: {book['title']}'; return;")
    w("  end if;")
    w(
        "  insert into books (subject_id, title, edition, page_count, page_offset) values "
        f"(v_subject, {lit(book['title'])}, {lit(book['edition']) if book.get('edition') else 'null'}, "
        f"{book.get('pageCount') or 'null'}, {book.get('pageOffset', 0)}) returning id into v_book;"
    )
    if book.get("pagesUrl"):
        pattern = book["pagesUrl"]
        n = book["pageCount"]
        url = "replace(" + lit(pattern) + ", '{nnn}', lpad(p::text, 3, '0'))"
        w(f"  insert into book_pages (book_id, page, url) select v_book, p, {url} from generate_series(1, {n}) p;")

    stats = {"lessons": 0, "published": 0, "questions": 0}
    for ui, unit in enumerate(spec["units"], 1):
        w(f"  insert into units (book_id, title, sort_order) values (v_book, {lit(unit['title'])}, {ui}) returning id into v_unit;")
        chapters = unit.get("chapters") or [{"title": unit["title"], "lessons": unit["lessons"]}]
        for ci, ch in enumerate(chapters, 1):
            w(
                f"  insert into chapters (unit_id, title, sort_order) values (v_unit, {lit(ch['title'])}, {ci}) "
                "returning id into v_chapter;"
            )
            for li, les in enumerate(ch["lessons"], 1):
                where = f"{unit['title']} / {les['title']}"
                blocks = les.get("blocks", [])
                check_blocks(blocks, where)
                acts, quiz = les.get("activities", []), les.get("quiz", [])
                for q in acts + quiz:
                    check_question(q, where)
                status = les.get("status") or ("draft" if not blocks else "extracted")
                if status == "published":
                    assert quiz and blocks, f"{where}: published lesson needs content and quiz"
                    stats["published"] += 1
                stamps = (
                    "now(), now()" if status == "published" else ("now(), null" if status == "reviewed" else "null, null")
                )
                ps, pe = les.get("pages", [None, None])
                w(
                    "  insert into lessons (chapter_id, title, sort_order, page_start, page_end, status, content, "
                    "reviewed_at, published_at) values "
                    f"(v_chapter, {lit(les['title'])}, {li}, {ps or 'null'}, {pe or 'null'}, '{status}', {jlit(blocks)}, {stamps}) "
                    "returning id into v_lesson;"
                )
                stats["lessons"] += 1
                rows = []
                for kind, qs in (("activity", acts), ("quiz", quiz)):
                    for qi, q in enumerate(qs, 1):
                        t, o, a, e = norm_q(q)
                        rows.append(
                            f"(v_lesson, '{kind}', '{t}', {lit(q['prompt'])}, {jlit(o)}, {jlit(a)}, "
                            f"{lit(e) if e else 'null'}, 1, {qi})"
                        )
                if rows:
                    stats["questions"] += len(rows)
                    w("  insert into lesson_questions (lesson_id, kind, type, prompt, options, answer, explanation, points, sort_order) values")
                    w("    " + ",\n    ".join(rows) + ";")
    w(f"  raise notice 'seeded {book['title']}: {stats['lessons']} lessons ({stats['published']} published), {stats['questions']} questions';")
    w("end $seed$;")
    print(f"{book['title']}: {stats}")
    return "\n".join(lines) + "\n"


def qiraati_spec():
    data = json.load(open(os.path.join(CONTENT, "g1-qiraati.json")))
    qs = json.load(open(os.path.join(CONTENT, "g1-qiraati-questions.json")))

    def lesson(entry, unit_no, sort):
        mine = [q for q in qs if q["unit"] == unit_no and q["lesson"] == sort]
        acts = sorted([q for q in mine if q["kind"] == "activity"], key=lambda q: q["order"])
        quiz = sorted([q for q in mine if q["kind"] == "quiz"], key=lambda q: q["order"])
        return {
            "title": entry["title"],
            "pages": entry["pages"],
            "blocks": entry["blocks"],
            "status": "published" if quiz else "reviewed",
            "activities": acts,
            "quiz": quiz,
        }

    prep = data["prep"]
    return {
        "grade": 1,
        "subject": "اللغة العربية",
        "book": {
            "title": "قراءتي",
            "edition": "الجزء الأول",
            "pageCount": 112,
            "pageOffset": 0,
            "pagesUrl": "/books/g1-qiraati/{nnn}.webp",
        },
        "units": [
            {"title": prep["title"], "lessons": [lesson(prep, 1, 1)]},
            {"title": "الدروس", "lessons": [lesson(l, 2, i) for i, l in enumerate(data["lessons"], 1)]},
        ],
    }


def main():
    os.makedirs(OUT, exist_ok=True)
    seeds = {
        "10-g1-qiraati.sql": qiraati_spec(),
        "11-g1-math.sql": json.load(open(os.path.join(CONTENT, "g1-math.json"))),
    }
    for name, spec in seeds.items():
        sql = render(spec)
        assert not re.search(r"\$seed\$.*\$seed\$.*\$seed\$", sql[200:-20], re.S)
        with open(os.path.join(OUT, name), "w") as f:
            f.write(sql)
        print(name, round(len(sql.encode()) / 1024), "KB")

    # One file to paste into the Supabase SQL editor on a NEW project.
    db = os.path.join(ROOT, "db")
    parts = [open(os.path.join(db, "schema.sql")).read(), open(os.path.join(db, "supabase-storage.sql")).read()]
    parts += [open(os.path.join(OUT, n)).read() for n in sorted(seeds)]
    header = (
        "-- منصة المتفوقين: إعداد قاعدة بيانات Supabase جديدة دفعة واحدة.\n"
        "-- الصقه في SQL Editor واضغط Run مرة واحدة فقط على مشروع فارغ.\n\n"
    )
    with open(os.path.join(db, "setup-supabase.sql"), "w") as f:
        f.write(header + "\n\n".join(parts))
    print("setup-supabase.sql", round(os.path.getsize(os.path.join(db, "setup-supabase.sql")) / 1024), "KB")


if __name__ == "__main__":
    main()
