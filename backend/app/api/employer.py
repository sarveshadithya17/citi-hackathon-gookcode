"""Employers, CSR teams and NGOs: post opportunities, find endorsed talent, see impact.

Students' contact details are never shown. Employers reach a student through the
student's teacher, who accepts or declines the request.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..ai import matching
from ..auth import current_user, require
from ..db import get_session
from ..knowledge import kb
from ..models import (Application, ContactRequest, Endorsement, Opportunity, Org, Profile, Unlock, User)
from ..services import counts, display_name, get_profile, profile_dict
from .students import build_passport, listing_out

router = APIRouter(tags=["employer"])
employer_only = require("employer")

UNLOCK_PRICE_INR = 99
PLANS = {"free": {"unlocks": 3, "price_inr_month": 0},
         "talent_pro": {"unlocks": None, "price_inr_month": 2999}}


def org_of(session: Session, user: User) -> Org:
    org = session.get(Org, user.org_id) if user.org_id else None
    if not org:
        raise HTTPException(400, "No organisation linked to this account")
    return org


# ---------------------------------------------------------------- listings (open API)

@router.get("/opportunities")
def list_opportunities(district: str | None = None, career: str | None = None, kind: str | None = None,
                       session: Session = Depends(get_session)):
    """Public listing, schema.org JobPosting-like fields. Partners can read this without a login."""
    q = select(Opportunity).where(Opportunity.active == True)  # noqa: E712
    rows = session.exec(q).all()
    out = []
    for o in rows:
        if district and (o.district or "").lower() != district.lower():
            continue
        if career and career not in (o.careers or []):
            continue
        if kind and o.kind != kind:
            continue
        out.append(listing_out(o))
    return out


class OpportunityIn(BaseModel):
    kind: str = Field(default="apprenticeship", pattern=r"^(apprenticeship|internship|job|scholarship)$")
    title: str = Field(min_length=3, max_length=120)
    district: str | None = None
    state: str | None = "Tamil Nadu"
    stipend_inr_month: int | None = None
    duration: str | None = None
    min_education: str | None = None
    careers: list[str] = []
    interests: list[str] = []
    description: str = Field(default="", max_length=2000)
    apply_url: str | None = None
    naps: bool = False
    sponsored: bool = False


@router.post("/opportunities")
def create_opportunity(body: OpportunityIn, user: User = Depends(employer_only),
                       session: Session = Depends(get_session)):
    org = org_of(session, user)
    o = Opportunity(org_id=org.id, org_name=org.name, **body.model_dump())
    session.add(o)
    session.commit()
    session.refresh(o)
    return {"id": o.id, "matches": len(candidates_for(session, o, limit=50))}


def candidates_for(session: Session, o: Opportunity, limit: int = 10) -> list[dict]:
    out = []
    for s in session.exec(select(User).where(User.role == "student")).all():
        prof = session.get(Profile, s.id)
        if not prof:
            continue
        p = profile_dict(prof)
        fit, why = matching.opportunity_fit(o, p, [p["chosen_career"]] if p.get("chosen_career") else [])
        if fit >= 30:
            c = counts(session, s.id)
            out.append({"student_id": s.id, "name": display_name(s.name), "district": p.get("district"),
                        "goal": matching.career_name(p.get("chosen_career")) if p.get("chosen_career") else None,
                        "fit": fit, "why": why, "endorsements": c["endorsements"]})
    return sorted(out, key=lambda x: (-x["fit"], -x["endorsements"]))[:limit]


@router.get("/employer/opportunities")
def my_opportunities(user: User = Depends(employer_only), session: Session = Depends(get_session)):
    org = org_of(session, user)
    out = []
    for o in session.exec(select(Opportunity).where(Opportunity.org_id == org.id).order_by(Opportunity.id.desc())).all():
        apps = []
        for a in session.exec(select(Application).where(Application.target == f"opp:{o.id}")).all():
            s = session.get(User, a.student_id)
            t = session.get(User, a.via_teacher) if a.via_teacher else None
            apps.append({"id": a.id, "student_id": a.student_id, "name": display_name(s.name) if s else "",
                         "status": a.status, "recommended_by": t.name if t else None,
                         "endorsements": counts(session, a.student_id)["endorsements"]})
        out.append({**listing_out(o), "applications": apps, "suggested": candidates_for(session, o, 5)})
    return out


class StatusIn(BaseModel):
    status: str = Field(pattern=r"^(applied|shortlisted|selected)$")


@router.post("/employer/applications/{app_id}")
def set_status(app_id: int, body: StatusIn, user: User = Depends(employer_only), session: Session = Depends(get_session)):
    org = org_of(session, user)
    a = session.get(Application, app_id)
    if not a or not a.target.startswith("opp:"):
        raise HTTPException(404, "Application not found")
    o = session.get(Opportunity, int(a.target[4:]))
    if not o or o.org_id != org.id:
        raise HTTPException(404, "Application not found")
    a.status = body.status
    session.add(a)
    session.commit()
    if body.status == "selected":
        from ..services import award
        award(session, a.student_id, f"selected:{o.id}", f"Selected: {o.title}", o.org_name,
              verified_by=f"employer:{o.org_name}")
    return {"ok": True}


# ---------------------------------------------------------------- talent search (paid)

@router.get("/employer/talent")
def talent(district: str | None = None, skill: str | None = None, career: str | None = None,
           endorsed_only: bool = False, user: User = Depends(employer_only), session: Session = Depends(get_session)):
    org = org_of(session, user)
    unlocked = {u.student_id for u in session.exec(select(Unlock).where(Unlock.org_id == org.id)).all()}
    out = []
    for s in session.exec(select(User).where(User.role == "student")).all():
        prof = get_profile(session, s)
        p = profile_dict(prof)
        if district and (p.get("district") or "").lower() != district.lower():
            continue
        if career and p.get("chosen_career") != career:
            continue
        ends = session.exec(select(Endorsement).where(Endorsement.student_id == s.id)).all()
        if endorsed_only and not ends:
            continue
        skills = [e.skill for e in ends]
        if skill:
            hay = " ".join(skills + (p.get("strengths") or []) + (p.get("interests") or [])).lower()
            if skill.lower() not in hay:
                continue
        c = counts(session, s.id)
        score = matching.talent_score(p, len(ends), c["steps_done"], skill, career)
        out.append({"student_id": s.id, "name": display_name(s.name), "district": p.get("district"),
                    "education_level": p.get("education_level"),
                    "goal": matching.career_name(p["chosen_career"]) if p.get("chosen_career") else None,
                    "endorsed_skills": skills[:4], "endorsements": len(ends), "badges": c["badges"],
                    "steps_done": c["steps_done"], "score": score, "unlocked": s.id in unlocked})
    out.sort(key=lambda x: -x["score"])
    return {"plan": org.plan, "unlocks_used": len(unlocked), "plans": PLANS,
            "unlock_price_inr": UNLOCK_PRICE_INR, "results": out[:30]}


@router.post("/employer/unlock/{student_id}")
def unlock(student_id: int, user: User = Depends(employer_only), session: Session = Depends(get_session)):
    """Unlock a full passport. Free plan: 3 unlocks, then Rs 99 each (simulated); Talent Pro: unlimited."""
    org = org_of(session, user)
    s = session.get(User, student_id)
    if not s or s.role != "student":
        raise HTTPException(404, "Student not found")
    used = session.exec(select(Unlock).where(Unlock.org_id == org.id)).all()
    if any(u.student_id == s.id for u in used):
        charge = 0
    else:
        limit = PLANS[org.plan]["unlocks"]
        charge = 0 if (limit is None or len(used) < limit) else UNLOCK_PRICE_INR
        session.add(Unlock(org_id=org.id, student_id=s.id))
        session.commit()
    pp = build_passport(session, s, full=False)
    return {"charged_inr": charge, "payment": "simulated" if charge else "included", "passport": pp}


@router.post("/employer/upgrade")
def upgrade(user: User = Depends(employer_only), session: Session = Depends(get_session)):
    org = org_of(session, user)
    org.plan = "talent_pro"
    session.add(org)
    session.commit()
    return {"plan": org.plan, "price_inr_month": PLANS["talent_pro"]["price_inr_month"], "payment": "simulated"}


class ContactIn(BaseModel):
    student_id: int
    message: str = Field(min_length=3, max_length=500)


@router.post("/employer/contact")
def contact(body: ContactIn, user: User = Depends(employer_only), session: Session = Depends(get_session)):
    org = org_of(session, user)
    s = session.get(User, body.student_id)
    if not s or s.role != "student":
        raise HTTPException(404, "Student not found")
    session.add(ContactRequest(org_id=org.id, student_id=s.id, teacher_id=s.managed_by, message=body.message))
    session.commit()
    return {"ok": True, "routed_to": "teacher" if s.managed_by else "student"}


# ---------------------------------------------------------------- CSR impact dashboard

@router.get("/employer/impact")
def impact(user: User = Depends(current_user), session: Session = Depends(get_session)):
    students = session.exec(select(User).where(User.role == "student")).all()
    profiles = [session.get(Profile, s.id) for s in students]
    apps = session.exec(select(Application)).all()
    by_district = {}
    for p in profiles:
        if p:
            d = (p.data or {}).get("district") or "Unknown"
            by_district[d] = by_district.get(d, 0) + 1
    careers = {}
    for p in profiles:
        if p and p.chosen_career:
            cat = kb().careers_by_id.get(p.chosen_career, {}).get("category", "other")
            careers[cat] = careers.get(cat, 0) + 1
    return {
        "students_reached": len(students),
        "teachers": len(session.exec(select(User).where(User.role == "teacher")).all()),
        "profiles_completed": sum(1 for p in profiles if p and p.completeness >= 60),
        "goals_chosen": sum(1 for p in profiles if p and p.chosen_career),
        "scheme_applications": sum(1 for a in apps if a.target.startswith("kb:")),
        "opportunity_applications": sum(1 for a in apps if a.target.startswith("opp:")),
        "selected": sum(1 for a in apps if a.status == "selected"),
        "endorsements": len(session.exec(select(Endorsement)).all()),
        "by_district": by_district,
        "goal_categories": careers,
    }
