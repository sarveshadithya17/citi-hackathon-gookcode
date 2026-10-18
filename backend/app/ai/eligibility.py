"""Deterministic eligibility engine for scholarships and schemes.

Each record in scholarships.json / schemes.json carries a `rules` object. A
student is "eligible" when every rule passes, "maybe" when no rule fails but
some facts are unknown (the app then asks for them), and otherwise not shown.
The LLM never decides eligibility; it may only explain the result.
"""
from datetime import date

from ..knowledge import EDU_RANK, kb

T = {
    "edu": {"en": "You are in {v}", "ta": "நீங்கள் {v} படிக்கிறீர்கள்", "hi": "आप {v} में हैं"},
    "income": {"en": "Family income is under ₹{v}", "ta": "குடும்ப வருமானம் ₹{v}க்குக் கீழ்", "hi": "परिवार की आय ₹{v} से कम है"},
    "category": {"en": "Your category ({v}) is covered", "ta": "உங்கள் பிரிவு ({v}) தகுதியானது", "hi": "आपकी श्रेणी ({v}) शामिल है"},
    "marks": {"en": "Your marks meet the {v}% cut-off", "ta": "உங்கள் மதிப்பெண் {v}% அளவைத் தாண்டுகிறது", "hi": "आपके अंक {v}% की सीमा पूरी करते हैं"},
    "gender_female": {"en": "This is for girl students", "ta": "இது மாணவிகளுக்கானது", "hi": "यह छात्राओं के लिए है"},
    "gender_male": {"en": "This is for boy students", "ta": "இது மாணவர்களுக்கானது", "hi": "यह छात्रों के लिए है"},
    "school": {"en": "You study in a {v} school", "ta": "நீங்கள் {v} பள்ளியில் படிக்கிறீர்கள்", "hi": "आप {v} स्कूल में पढ़ते हैं"},
    "state": {"en": "You live in {v}", "ta": "நீங்கள் {v}-இல் வசிக்கிறீர்கள்", "hi": "आप {v} में रहते हैं"},
    "age": {"en": "Your age fits", "ta": "உங்கள் வயது பொருந்துகிறது", "hi": "आपकी उम्र सही है"},
    "disability": {"en": "For students with a disability", "ta": "மாற்றுத்திறனாளி மாணவர்களுக்கானது", "hi": "दिव्यांग छात्रों के लिए"},
    "first_graduate": {"en": "You will be the first graduate in your family", "ta": "உங்கள் குடும்பத்தில் முதல் பட்டதாரி நீங்கள்", "hi": "आप अपने परिवार के पहले स्नातक होंगे"},
    "stream": {"en": "Your subject group fits", "ta": "உங்கள் பாடப் பிரிவு பொருந்துகிறது", "hi": "आपका विषय समूह सही है"},
    "all_india": {"en": "Open to students across India", "ta": "இந்தியா முழுவதும் உள்ள மாணவர்களுக்கு", "hi": "पूरे भारत के छात्रों के लिए"},
}

MISSING = {
    "education_level": {"en": "your class", "ta": "உங்கள் வகுப்பு", "hi": "आपकी कक्षा"},
    "family_income": {"en": "family income", "ta": "குடும்ப வருமானம்", "hi": "परिवार की आय"},
    "category": {"en": "community category", "ta": "சமூகப் பிரிவு", "hi": "श्रेणी"},
    "marks_percent": {"en": "your marks", "ta": "உங்கள் மதிப்பெண்", "hi": "आपके अंक"},
    "gender": {"en": "gender", "ta": "பாலினம்", "hi": "लिंग"},
    "school_type": {"en": "school type", "ta": "பள்ளி வகை", "hi": "स्कूल का प्रकार"},
    "state": {"en": "state", "ta": "மாநிலம்", "hi": "राज्य"},
    "age": {"en": "age", "ta": "வயது", "hi": "उम्र"},
    "disability": {"en": "disability status", "ta": "மாற்றுத்திறன் நிலை", "hi": "दिव्यांगता"},
    "first_graduate": {"en": "whether anyone in your family has a degree", "ta": "குடும்பத்தில் யாராவது பட்டம் பெற்றுள்ளார்களா", "hi": "क्या परिवार में किसी के पास डिग्री है"},
    "stream": {"en": "subject group", "ta": "பாடப் பிரிவு", "hi": "विषय समूह"},
}

EDU_LABEL = {
    "class8": "Class 8", "class9": "Class 9", "class10": "Class 10", "class11": "Class 11",
    "class12": "Class 12", "iti": "ITI", "diploma": "Diploma", "ug": "college (UG)", "pg": "PG",
}
SCHOOL_LABEL = {"government": "government", "aided": "government-aided", "private": "private"}


def _t(key: str, lang: str, v="") -> str:
    tpl = T[key].get(lang) or T[key]["en"]
    return tpl.format(v=v)


def _inr(n: int) -> str:
    s = str(int(n))
    if len(s) <= 3:
        return s
    head, tail = s[:-3], s[-3:]
    parts = []
    while len(head) > 2:
        parts.insert(0, head[-2:])
        head = head[:-2]
    if head:
        parts.insert(0, head)
    return ",".join(parts) + "," + tail


def _age(p: dict) -> int | None:
    if p.get("age"):
        try:
            return int(p["age"])
        except (TypeError, ValueError):
            return None
    if p.get("birth_year"):
        return date.today().year - int(p["birth_year"])
    return None


def check(record: dict, p: dict, lang: str = "en") -> dict:
    r = record.get("rules") or {}
    reasons, missing, failed, conditions = [], [], [], []

    def need(field):
        missing.append(MISSING.get(field, {}).get(lang) or MISSING.get(field, {}).get("en") or field)

    levels = r.get("education_levels")
    if levels:
        e = p.get("education_level")
        if not e:
            need("education_level")
        elif e in levels:
            reasons.append(_t("edu", lang, EDU_LABEL.get(e, e)))
        else:
            failed.append("education")

    inc = r.get("max_family_income")
    if inc:
        fi = p.get("family_income")
        if fi is None:
            need("family_income")
        elif fi <= inc:
            reasons.append(_t("income", lang, _inr(inc)))
        else:
            failed.append("income")

    cats = r.get("categories")
    if cats:
        c = p.get("category")
        if not c:
            need("category")
        elif c in cats or (c in ("bc", "mbc") and "obc" in cats):
            reasons.append(_t("category", lang, c.upper()))
        else:
            failed.append("category")

    mm = r.get("min_marks_percent")
    if mm:
        m = p.get("marks_percent")
        if m is None:
            need("marks_percent")
        elif m >= mm:
            reasons.append(_t("marks", lang, mm))
        else:
            failed.append("marks")

    g = r.get("gender")
    if g:
        pg = p.get("gender")
        if not pg:
            need("gender")
        elif pg == g:
            reasons.append(_t(f"gender_{g}", lang))
        else:
            failed.append("gender")

    st = r.get("school_types")
    if st:
        s = p.get("school_type")
        if not s:
            need("school_type")
        elif s in st:
            reasons.append(_t("school", lang, SCHOOL_LABEL.get(s, s)))
        else:
            failed.append("school")

    states = r.get("states")
    if states:
        s = p.get("state")
        if not s:
            need("state")
        elif s.lower() in [x.lower() for x in states]:
            reasons.append(_t("state", lang, s))
        else:
            failed.append("state")
    elif record.get("level") == "central":
        reasons.append(_t("all_india", lang))

    lo, hi = r.get("min_age"), r.get("max_age")
    if lo or hi:
        a = _age(p)
        if a is None:
            need("age")
        elif (lo is None or a >= lo) and (hi is None or a <= hi):
            reasons.append(_t("age", lang))
        else:
            failed.append("age")

    if r.get("disability"):
        d = p.get("disability")  # unknown is treated as "no": the app asks only if the student raises it
        if d:
            reasons.append(_t("disability", lang))
        else:
            failed.append("disability")

    if r.get("first_graduate"):
        fg = p.get("first_graduate")
        if fg is None:
            need("first_graduate")
        elif fg:
            reasons.append(_t("first_graduate", lang))
        else:
            failed.append("first_graduate")

    streams = r.get("streams")
    if streams:
        s = p.get("stream")
        e = p.get("education_level")
        if e and EDU_RANK.get(e, 0) < EDU_RANK["class11"]:
            pass  # stream not chosen yet; the rule applies later
        elif not s:
            need("stream")
        elif s in streams:
            reasons.append(_t("stream", lang))
        else:
            failed.append("stream")

    # Conditions the rules can't check (e.g. "cleared the NMMS exam", "top 1% of the board")
    # are asked as a question, so the student is never told they qualify when they may not.
    req = r.get("requires")
    if req:
        conditions.append(req.get(lang) or req.get("en"))

    status = "no" if failed else ("maybe" if missing or conditions else "eligible")
    return {"status": status, "reasons": reasons, "missing": missing, "conditions": conditions, "failed": failed}


def public_record(rec: dict) -> dict:
    keys = ["id", "kind", "name", "provider", "level", "benefit", "summary", "documents",
            "how_to_apply", "apply_url", "deadline_note", "source_url", "last_verified"]
    return {k: rec.get(k) for k in keys}


def find(p: dict, lang: str = "en", include_maybe: bool = True) -> dict:
    out = {"eligible": [], "maybe": []}
    for rec in kb().scholarships + kb().schemes:
        res = check(rec, p, lang)
        if res["status"] == "eligible" or (include_maybe and res["status"] == "maybe"):
            item = public_record(rec)
            item.update(res)
            out[res["status"]].append(item)
    # Scholarships first, then schemes; within each, the most reasons first.
    for k in out:
        out[k].sort(key=lambda x: (x.get("kind") != "scholarship", -len(x["reasons"])))
    return out
