"""Learn: a personal pathway assembled only from catalogue items.

Steps come from the career's pathway in careers.json; course and exam steps
link to the real resource in courses.json / exams.json. The LLM only translates
the step titles and adds a short personal tip, so it cannot invent a course.
"""
import json

from ..knowledge import EDU_RANK, kb
from . import llm


def _resolve(step: dict) -> dict:
    out = {"type": step.get("type"), "title": step.get("title", ""), "duration": step.get("duration", "")}
    ref = kb().ref(step.get("ref"))
    if ref:
        out["ref"] = ref["id"]
        out["url"] = ref.get("url")
        out["provider"] = ref.get("provider") or ref.get("conducted_by")
        out["free"] = ref.get("free", None)
        if ref.get("typical_month"):
            out["when"] = ref["typical_month"]
    return out


def build(career_id: str, p: dict, lang: str = "en", use_ai: bool = True) -> dict | None:
    c = kb().careers_by_id.get(career_id)
    if not c:
        return None
    steps = [_resolve(s) for s in c.get("pathway", [])]

    # Mark the education steps the student has already passed.
    edu = EDU_RANK.get(p.get("education_level") or "", -1)
    for s in steps:
        t = s["title"].lower()
        if s["type"] == "education" and ("class 10" in t and edu > EDU_RANK["class10"]):
            s["already_done"] = True

    used = {s.get("ref") for s in steps}
    extra_courses = [x for x in kb().courses if career_id in x.get("careers", []) and x["id"] not in used][:3]
    exams = [x for x in kb().exams if career_id in x.get("careers", []) and x["id"] not in used][:3]

    result = {
        "career_id": career_id,
        "career": kb().career_name(c, lang),
        "category": c.get("category"),
        "salary_inr_month": c.get("salary_inr_month"),
        "training_time": c.get("training_time"),
        "steps": steps,
        "resources": [{"id": x["id"], "title": x["title"], "provider": x.get("provider"), "url": x.get("url"),
                       "duration": x.get("duration"), "free": x.get("free", True)} for x in extra_courses],
        "exams": [{"id": x["id"], "name": x["name"], "purpose": x.get("purpose"), "url": x.get("url"),
                   "when": x.get("typical_month"), "eligibility": x.get("eligibility")} for x in exams],
        "intro": None,
        "source": "Thiran knowledge base (SWAYAM, DIKSHA, Skill India, NTA, state portals)",
    }

    if use_ai:
        payload = {
            "career": c["name"]["en"], "description": c.get("description"),
            "student": {k: p.get(k) for k in ("education_level", "stream", "interests", "needs_income_soon",
                                               "can_relocate", "district", "name") if p.get(k) is not None},
            "steps": [s["title"] for s in steps],
        }
        out = llm.chat_json([
            {"role": "system", "content": (
                "You help a rural Indian student follow a career pathway. Given the steps (do NOT add, remove or "
                "reorder steps), return JSON {\"intro\": \"2 short encouraging sentences personal to the student\", "
                "\"steps\": [{\"title\": \"step title in the target language\", \"tip\": \"one practical tip, "
                "max 15 words\"}]}. Same number of steps, same order. " + llm.lang_instruction(lang))},
            {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
        ], temperature=0.3)
        if out and isinstance(out.get("steps"), list) and len(out["steps"]) == len(steps):
            result["intro"] = out.get("intro")
            for s, o in zip(steps, out["steps"]):
                if isinstance(o, dict):
                    if lang != "en" and o.get("title"):
                        s["title_en"] = s["title"]
                        s["title"] = o["title"]
                    s["tip"] = o.get("tip")
    return result
