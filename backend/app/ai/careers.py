"""Career matching: rule filters + interest similarity + a diversity boost.

Scoring is deterministic and explainable. The LLM is only used to write the
short "why this suits you" line in the student's language.
"""
import json
import re

from ..knowledge import EDU_RANK, kb
from . import llm

CATEGORY_LABELS = {
    "vocational": {"en": "Skilled trade", "ta": "தொழில் திறன்", "hi": "कुशल कारीगरी"},
    "stem": {"en": "Science & tech", "ta": "அறிவியல், தொழில்நுட்பம்", "hi": "विज्ञान और तकनीक"},
    "non_stem": {"en": "Services & office", "ta": "சேவை, அலுவலகம்", "hi": "सेवा और दफ़्तर"},
    "creative": {"en": "Creative", "ta": "படைப்பாற்றல்", "hi": "रचनात्मक"},
    "government": {"en": "Government job", "ta": "அரசு வேலை", "hi": "सरकारी नौकरी"},
    "entrepreneurship": {"en": "Own business", "ta": "சொந்தத் தொழில்", "hi": "अपना व्यवसाय"},
    "healthcare": {"en": "Healthcare", "ta": "சுகாதாரம்", "hi": "स्वास्थ्य सेवा"},
    "agriculture": {"en": "Agriculture", "ta": "விவசாயம்", "hi": "कृषि"},
}

SHORT_TRAINING = re.compile(r"(\d+)\s*(month|week)", re.I)


def _short_training(career: dict) -> bool:
    t = career.get("training_time", "")
    if SHORT_TRAINING.search(t) and "year" not in t.lower():
        return True
    m = re.search(r"(\d+)", t)
    return bool(m and "year" in t.lower() and int(m.group(1)) <= 2)


def score(career: dict, p: dict) -> tuple[float, list[str]]:
    reasons = []
    s = 0.0
    interests = set(p.get("interests") or [])
    styles = set(p.get("work_styles") or [])
    hit_i = interests & set(career.get("interests", []))
    hit_w = styles & set(career.get("work_styles", []))
    s += 3.0 * len(hit_i) + 2.0 * len(hit_w)
    if hit_i:
        reasons.append("interest:" + ",".join(sorted(hit_i)))
    if hit_w:
        reasons.append("style:" + ",".join(sorted(hit_w)))

    edu = EDU_RANK.get(p.get("education_level") or "", None)
    need = EDU_RANK.get(career.get("min_education") or "", 0)
    if edu is not None and need > EDU_RANK["class12"] and edu < EDU_RANK["class11"]:
        s -= 0.5  # long road, still shown

    stream = p.get("stream")
    hint = career.get("stream_hint", "any")
    if stream and hint not in ("any", None) and edu is not None and edu >= EDU_RANK["class11"]:
        if hint == stream:
            s += 1.5
            reasons.append("stream")
        elif hint.startswith("science") and not stream.startswith("science"):
            s -= 3.0

    if p.get("needs_income_soon"):
        if _short_training(career) or career.get("cost_level") in ("free", "low"):
            s += 1.5
            reasons.append("earn_soon")
        if career.get("cost_level") == "high":
            s -= 2.0
    if p.get("can_relocate") is False and career.get("local_demand") == "high":
        s += 1.0
        reasons.append("local")

    asp = " ".join(p.get("aspirations") or []).lower()
    if asp:
        name_words = set(re.findall(r"[a-z]{4,}", (career["name"].get("en", "") + " " + career["id"]).lower()))
        if any(w in asp for w in name_words):
            s += 4.0
            reasons.append("dream")
    return s, reasons


def match(p: dict, n: int = 8) -> list[dict]:
    """Top careers, always spread across at least 4 categories, at most 3 from any one."""
    scored = []
    for c in kb().careers:
        s, why = score(c, p)
        scored.append((s, c, why))
    scored.sort(key=lambda x: -x[0])

    picked, per_cat = [], {}
    # Pass 1: best career from each category with a positive score, so the list
    # is never only "doctor / engineer".
    for s, c, why in scored:
        cat = c.get("category")
        if s > 0 and cat not in per_cat:
            picked.append((s, c, why))
            per_cat[cat] = 1
    picked.sort(key=lambda x: -x[0])
    picked = picked[: max(4, n - 2)]
    per_cat = {}
    for _, c, _ in picked:
        per_cat[c.get("category")] = per_cat.get(c.get("category"), 0) + 1
    # Pass 2: fill with the next best, at most 3 per category.
    for s, c, why in scored:
        if len(picked) >= n:
            break
        if any(c["id"] == x[1]["id"] for x in picked):
            continue
        cat = c.get("category")
        if per_cat.get(cat, 0) >= 3:
            continue
        picked.append((s, c, why))
        per_cat[cat] = per_cat.get(cat, 0) + 1
    picked.sort(key=lambda x: -x[0])
    top = picked[0][0] if picked and picked[0][0] > 0 else 1
    return [{"career": c, "score": round(max(s, 0) / top * 100), "reasons": why} for s, c, why in picked]


def card(c: dict, lang: str, fit: int, why: str) -> dict:
    cat = c.get("category", "")
    return {
        "id": c["id"],
        "name": kb().career_name(c, lang),
        "name_en": c["name"].get("en"),
        "category": cat,
        "category_label": CATEGORY_LABELS.get(cat, {}).get(lang) or cat,
        "description": c.get("description", ""),
        "training_time": c.get("training_time", ""),
        "salary_inr_month": c.get("salary_inr_month"),
        "min_education": c.get("min_education"),
        "local_demand": c.get("local_demand"),
        "fit": fit,
        "why": why,
    }


INTEREST_WORDS = {
    "en": "you enjoy {i}", "ta": "உங்களுக்கு {i} பிடிக்கும்", "hi": "आपको {i} पसंद है",
}


def fallback_why(m: dict, p: dict, lang: str) -> str:
    hits = [r.split(":", 1)[1] for r in m["reasons"] if r.startswith("interest:")]
    if hits:
        return INTEREST_WORDS.get(lang, INTEREST_WORDS["en"]).format(i=hits[0].replace(",", ", ").replace("_", " "))
    return m["career"].get("description", "")


def suggest(p: dict, lang: str, n: int = 8, use_ai: bool = True) -> list[dict]:
    matches = match(p, n)
    whys = {}
    if use_ai and matches:
        brief = [{"id": m["career"]["id"], "career": m["career"]["name"]["en"],
                  "description": m["career"].get("description", ""), "signals": m["reasons"]} for m in matches]
        out = llm.chat_json([
            {"role": "system", "content": (
                "For each career, write ONE short sentence (max 18 words) telling this student why it could suit "
                "them, using only facts from their profile and the career description, plus a 'description' that "
                "is the career description rewritten in the target language in at most 16 words. "
                "Match the student's gender in grammar if it is given; otherwise use gender-neutral words. "
                "Return JSON {\"<career id>\": {\"why\": \"...\", \"description\": \"...\"}}. "
                + llm.lang_instruction(lang))},
            {"role": "user", "content": json.dumps({"profile": _public(p), "careers": brief}, ensure_ascii=False)},
        ], temperature=0.3)
        if out:
            whys = out
    cards = []
    for m in matches:
        c = m["career"]
        extra = whys.get(c["id"]) if isinstance(whys.get(c["id"]), dict) else {}
        cd = card(c, lang, m["score"], extra.get("why") or fallback_why(m, p, lang))
        if extra.get("description") and lang != "en":
            cd["description"] = extra["description"]
        cards.append(cd)
    return cards


def _public(p: dict) -> dict:
    keep = ["gender", "education_level", "stream", "interests", "work_styles", "strengths", "aspirations",
            "needs_income_soon", "can_relocate", "district", "marks_percent"]
    return {k: p[k] for k in keep if k in p}
