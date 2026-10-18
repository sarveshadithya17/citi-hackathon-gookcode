"""Matching between students and listed opportunities (both directions)."""
from ..knowledge import EDU_RANK, kb


def opportunity_fit(opp, p: dict, career_ids: list[str]) -> tuple[int, list[str]]:
    reasons = []
    s = 0
    careers = set(opp.careers or [])
    if p.get("chosen_career") and p["chosen_career"] in careers:
        s += 50
        reasons.append("matches your chosen career")
    elif careers & set(career_ids):
        s += 30
        reasons.append("matches a career suggested for you")
    hits = set(opp.interests or []) & set(p.get("interests") or [])
    if hits:
        s += 10 * len(hits)
        reasons.append("uses your interests: " + ", ".join(sorted(hits)).replace("_", " "))
    if opp.district and p.get("district") and opp.district.lower() == p["district"].lower():
        s += 20
        reasons.append("in your district")
    elif opp.state and p.get("state") and opp.state.lower() == p["state"].lower():
        s += 5
    edu = EDU_RANK.get(p.get("education_level") or "", None)
    need = EDU_RANK.get(opp.min_education or "", 0)
    if edu is not None and edu < need - 1:
        s -= 25
        reasons.append("needs more education first")
    if opp.sponsored:
        s += 3
    return max(0, min(100, s)), reasons


def talent_score(p: dict, endorsements: int, steps_done: int, skill: str | None, career: str | None) -> int:
    s = min(endorsements, 5) * 12 + min(steps_done, 10) * 3 + int(p.get("completeness", 0) / 10)
    if career and (p.get("chosen_career") == career):
        s += 25
    if skill:
        sk = skill.lower()
        text = " ".join((p.get("interests") or []) + (p.get("strengths") or [])).lower()
        if sk in text:
            s += 15
    return min(100, s)


def career_name(cid: str, lang: str = "en") -> str:
    c = kb().careers_by_id.get(cid)
    return kb().career_name(c, lang) if c else cid
