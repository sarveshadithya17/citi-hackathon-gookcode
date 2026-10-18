"""Discover: a guided interview that turns a conversation into a structured profile.

The question order and the allowed values come from data/interview.json, so the
same flow works with the LLM (natural conversation, free-text understanding in
any language) and without it (scripted questions and keyword matching, which is
also what the app runs offline).
"""
import json
from functools import lru_cache

from ..config import DATA_DIR
from . import llm

LIST_FIELDS = {"interests", "work_styles", "strengths", "aspirations"}


@lru_cache
def interview() -> dict:
    with open(DATA_DIR / "interview.json", encoding="utf-8") as f:
        return json.load(f)


def _applies(q: dict, profile: dict) -> bool:
    cond = q.get("ask_if")
    if not cond:
        return True
    return all(profile.get(k) in allowed for k, allowed in cond.items())


def _answered(q: dict, profile: dict, asked: set[str]) -> bool:
    if q["id"] in asked:
        return True
    val = profile.get(q["field"])
    return val not in (None, "", [])


def next_question(profile: dict, asked: set[str]) -> dict | None:
    for q in interview()["questions"]:
        if _applies(q, profile) and not _answered(q, profile, asked):
            return q
    return None


def localize_question(q: dict | None, lang: str) -> dict | None:
    if q is None:
        return None
    out = {"id": q["id"], "field": q["field"], "type": q["type"],
           "text": q["text"].get(lang) or q["text"]["en"]}
    if q.get("options"):
        out["options"] = [{"value": o["value"], "icon": o.get("icon", ""),
                           "label": o["label"].get(lang) or o["label"]["en"]} for o in q["options"]]
    return out


def completeness(profile: dict) -> int:
    qs = [q for q in interview()["questions"] if _applies(q, profile)]
    done = sum(1 for q in qs if profile.get(q["field"]) not in (None, "", []))
    return round(100 * done / max(len(qs), 1))


def is_ready(profile: dict) -> bool:
    return all(profile.get(f) not in (None, "", []) for f in interview()["required"])


def _keyword_match(q: dict, text: str):
    text_l = text.lower()
    hits = []
    for o in q.get("options", []):
        words = list(o.get("keywords", [])) + [o["label"].get("en", "").lower()]
        if any(w and w.lower() in text_l for w in words):
            hits.append(o["value"])
    if q["type"] == "multi":
        return hits or None
    return hits[0] if hits else None


def apply_answer(profile: dict, q: dict, text: str | None, choice) -> dict:
    """Rule-based understanding of one answer. Returns field updates."""
    field = q["field"]
    if choice is not None:
        value = choice
    elif q["type"] == "text":
        value = (text or "").strip() or None
        if field == "aspirations" and value:
            value = [value]
    else:
        value = _keyword_match(q, text or "")
    if value is None:
        return {}
    if field in LIST_FIELDS:
        existing = list(profile.get(field) or [])
        for v in value if isinstance(value, list) else [value]:
            if v not in existing:
                existing.append(v)
        value = existing
    return {field: value}


SYSTEM = """You are Thiran, a warm career guide for rural Indian students aged 13-22.
You are running a short interview to understand the student. You receive the
conversation, the profile so far, the question just asked, and the next topic.

Return ONLY a JSON object:
{
  "updates": { ...profile fields you can confidently fill from the student's LAST message... },
  "reply": "one or two short sentences: a kind, specific reaction to what they said, then ask about the next topic"
}

Allowed profile fields and values:
- name: string
- education_level: one of class8, class9, class10, class11, class12, iti, diploma, ug, pg
- stream: one of science_bio, science_maths, commerce, arts, vocational
- interests: list from {interests}
- work_styles: list from hands, people, computers, outdoors, creative, numbers
- strengths: list of short English phrases (e.g. "good at explaining", "patient")
- marks_percent: number 0-100
- needs_income_soon: true/false
- can_relocate: true/false
- gender: female, male or other
- category: general, ews, obc, bc, mbc, sc, st, minority
- family_income: rupees per year (number)
- school_type: government, aided, private
- district: string (English spelling)
- aspirations: list of short English phrases (dream jobs or goals)

Rules: only fill a field when the student said it or it clearly follows. Map
free answers to the allowed values (e.g. "I like fixing my uncle's bike" ->
interests ["vehicles","machines"], work_styles ["hands"]). Never invent facts.
If the student asks a question, answer it briefly before moving on.
Never mention JSON, fields or the profile. {lang}"""


def ai_turn(history: list[dict], profile: dict, asked_q: dict | None, text: str,
            next_q: dict | None, lang: str) -> dict | None:
    from ..knowledge import kb  # local import to avoid a cycle at import time
    interests = sorted({t for c in kb().careers for t in c.get("interests", [])}) or \
        [o["value"] for o in interview()["questions"][3]["options"]]
    system = SYSTEM.replace("{interests}", ", ".join(interests)).replace("{lang}", llm.lang_instruction(lang))
    context = {
        "profile_so_far": profile,
        "question_just_asked": asked_q["text"]["en"] if asked_q else None,
        "next_topic": next_q["text"]["en"] if next_q else "No more questions: thank them warmly and tell them to tap 'See my careers'.",
    }
    msgs = [{"role": "system", "content": system}]
    for m in history[-8:]:
        msgs.append({"role": m["role"], "content": m["text"]})
    msgs.append({"role": "user", "content": f"[context] {json.dumps(context, ensure_ascii=False)}\n[student] {text}"})
    out = llm.chat_json(msgs, temperature=0.5, cache=False)
    if not out or not isinstance(out.get("reply"), str):
        return None
    updates = out.get("updates") or {}
    return {"updates": _clean(updates), "reply": out["reply"].strip()}


ALLOWED = {
    "education_level": {"class8", "class9", "class10", "class11", "class12", "iti", "diploma", "ug", "pg"},
    "stream": {"science_bio", "science_maths", "commerce", "arts", "vocational"},
    "work_styles": {"hands", "people", "computers", "outdoors", "creative", "numbers"},
    "gender": {"female", "male", "other"},
    "category": {"general", "ews", "obc", "bc", "mbc", "sc", "st", "minority"},
    "school_type": {"government", "aided", "private"},
}


def _clean(updates: dict) -> dict:
    """Drop anything the model returned that isn't an allowed value."""
    from ..knowledge import kb
    interest_vocab = {t for c in kb().careers for t in c.get("interests", [])}
    out = {}
    for k, v in updates.items():
        if v in (None, "", []):
            continue
        if k in ALLOWED:
            if isinstance(v, list):
                v = [x for x in v if x in ALLOWED[k]]
                if v:
                    out[k] = v
            elif v in ALLOWED[k]:
                out[k] = v
        elif k == "interests" and isinstance(v, list):
            v = [x for x in v if not interest_vocab or x in interest_vocab]
            if v:
                out[k] = v
        elif k in ("strengths", "aspirations") and isinstance(v, list):
            out[k] = [str(x)[:80] for x in v][:6]
        elif k in ("marks_percent", "family_income"):
            try:
                out[k] = float(v) if k == "marks_percent" else int(v)
            except (TypeError, ValueError):
                pass
        elif k in ("needs_income_soon", "can_relocate") and isinstance(v, bool):
            out[k] = v
        elif k in ("name", "district") and isinstance(v, str):
            out[k] = v.strip()[:60]
    return out


def merge(profile: dict, updates: dict) -> dict:
    merged = dict(profile)
    for k, v in updates.items():
        if k in LIST_FIELDS and isinstance(v, list):
            existing = list(merged.get(k) or [])
            merged[k] = existing + [x for x in v if x not in existing]
        else:
            merged[k] = v
    return merged
