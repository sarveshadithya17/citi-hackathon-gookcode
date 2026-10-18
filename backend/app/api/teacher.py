"""Facilitator mode: one teacher, many students, often on one shared phone."""
import json
from collections import Counter

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..ai import eligibility, llm, profiler
from ..auth import require
from ..db import get_session
from ..knowledge import kb
from ..models import (Application, ChatMessage, ContactRequest, Endorsement, Module, Opportunity, Org,
                      Recommendation, User)
from ..services import award, counts, get_profile, profile_dict, save_profile

router = APIRouter(prefix="/teacher", tags=["teacher"])
teacher_only = require("teacher")


def roster_of(session: Session, teacher: User) -> list[User]:
    return session.exec(select(User).where(User.managed_by == teacher.id, User.role == "student")
                        .order_by(User.name)).all()


@router.get("/roster")
def roster(teacher: User = Depends(teacher_only), session: Session = Depends(get_session)):
    out = []
    for s in roster_of(session, teacher):
        prof = get_profile(session, s)
        p = profile_dict(prof)
        elig = eligibility.find(p, "en", include_maybe=False)["eligible"]
        applied = {a.target for a in session.exec(select(Application).where(Application.student_id == s.id)).all()}
        last = session.exec(select(ChatMessage).where(ChatMessage.user_id == s.id)
                            .order_by(ChatMessage.id.desc())).first()
        out.append({
            "id": s.id, "name": s.name, "has_phone": bool(s.phone), "language": s.language,
            "education_level": p.get("education_level"), "district": p.get("district"),
            "completeness": prof.completeness, "ready": profiler.is_ready(prof.data),
            "chosen_career": prof.chosen_career,
            "chosen_career_name": kb().careers_by_id.get(prof.chosen_career or "", {}).get("name", {}).get("en"),
            "interests": p.get("interests", []),
            "eligible_count": len(elig),
            "unapplied_count": len([e for e in elig if f"kb:{e['id']}" not in applied]),
            "last_active": (last.created_at if last else prof.updated_at).isoformat(),
            **counts(session, s.id),
        })
    return out


class NewStudent(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    language: str = "ta"
    education_level: str | None = None
    gender: str | None = None
    district: str | None = None


@router.post("/students")
def add_student(body: NewStudent, teacher: User = Depends(teacher_only), session: Session = Depends(get_session)):
    """Add a student who has no phone; the teacher's phone is used for their sessions."""
    s = User(role="student", name=body.name, language=body.language, managed_by=teacher.id)
    session.add(s)
    session.commit()
    session.refresh(s)
    prof = get_profile(session, s)
    data = {**prof.data, **{k: v for k, v in body.model_dump().items()
                            if v and k in ("education_level", "gender", "district")}}
    save_profile(session, prof, data)
    return {"id": s.id, "name": s.name}


INSIGHT_TEXT = {
    "cluster": {"en": "{n} students are interested in {x}", "ta": "{n} மாணவர்களுக்கு {x} மீது ஆர்வம் உள்ளது",
                "hi": "{n} छात्रों की रुचि {x} में है"},
    "unapplied": {"en": "{x} is eligible for {n} scholarships/schemes but hasn't applied",
                  "ta": "{x} {n} உதவித்தொகை/திட்டங்களுக்குத் தகுதியானவர், ஆனால் இன்னும் விண்ணப்பிக்கவில்லை",
                  "hi": "{x} {n} छात्रवृत्ति/योजनाओं के योग्य है, पर अभी आवेदन नहीं किया"},
    "incomplete": {"en": "{n} students haven't finished their Discover profile",
                   "ta": "{n} மாணவர்கள் தங்கள் சுயவிவரத்தை இன்னும் முடிக்கவில்லை",
                   "hi": "{n} छात्रों ने अपनी प्रोफ़ाइल पूरी नहीं की है"},
    "no_goal": {"en": "{n} students finished Discover but haven't chosen a career goal yet",
                "ta": "{n} மாணவர்கள் சுயவிவரத்தை முடித்தும் இன்னும் தொழில் இலக்கைத் தேர்ந்தெடுக்கவில்லை",
                "hi": "{n} छात्रों ने प्रोफ़ाइल पूरी की, पर अभी करियर लक्ष्य नहीं चुना"},
}


def interest_label(tag: str, lang: str) -> str:
    for q in profiler.interview()["questions"]:
        for o in q.get("options", []):
            if q["field"] == "interests" and o["value"] == tag:
                return o["label"].get(lang) or o["label"]["en"]
    return tag.replace("_", " ")


def _say(kind: str, lang: str, **kw) -> str:
    tpl = INSIGHT_TEXT[kind].get(lang) or INSIGHT_TEXT[kind]["en"]
    return tpl.format(**kw)


@router.get("/insights")
def insights(lang: str = "en", teacher: User = Depends(teacher_only), session: Session = Depends(get_session)):
    students = roster(teacher, session)
    n = len(students)
    interest_counts = Counter(i for s in students for i in s["interests"])
    clusters = [{"interest": i, "count": c, "students": [s["name"] for s in students if i in s["interests"]]}
                for i, c in interest_counts.most_common(4)]
    unapplied = [s for s in students if s["unapplied_count"] > 0]
    incomplete = [s for s in students if not s["ready"]]
    no_goal = [s for s in students if s["ready"] and not s["chosen_career"]]
    cards = []
    for cl in clusters[:2]:
        cards.append({"kind": "cluster", "count": cl["count"], "key": cl["interest"], "students": cl["students"],
                      "text": _say("cluster", lang, n=cl["count"], x=interest_label(cl["interest"], lang))})
    for s in sorted(unapplied, key=lambda x: -x["unapplied_count"])[:3]:
        cards.append({"kind": "unapplied", "count": s["unapplied_count"], "students": [s["name"]], "student_id": s["id"],
                      "text": _say("unapplied", lang, x=s["name"], n=s["unapplied_count"])})
    if incomplete:
        cards.append({"kind": "incomplete", "count": len(incomplete), "students": [s["name"] for s in incomplete],
                      "text": _say("incomplete", lang, n=len(incomplete))})
    if no_goal:
        cards.append({"kind": "no_goal", "count": len(no_goal), "students": [s["name"] for s in no_goal],
                      "text": _say("no_goal", lang, n=len(no_goal))})

    summary = None
    if n:
        summary = llm.chat([
            {"role": "system", "content": "You advise a rural government-school teacher. In 2-3 short sentences, "
             "say what to do this week for the class, based only on these facts. Be specific (use names). "
             + llm.lang_instruction(lang)},
            {"role": "user", "content": json.dumps({"class_size": n, "insights": [c["text"] for c in cards]})},
        ], temperature=0.3, max_tokens=300)
    return {"class_size": n, "cards": cards, "summary": summary,
            "totals": {"profiles_done": n - len(incomplete),
                       "goals_chosen": sum(1 for s in students if s["chosen_career"]),
                       "applications": sum(s["applications"] for s in students),
                       "endorsements": sum(s["endorsements"] for s in students)}}


class EndorseIn(BaseModel):
    student_id: int
    skill: str = Field(min_length=1, max_length=80)
    note: str = Field(default="", max_length=300)


def _own(session: Session, teacher: User, student_id: int) -> User:
    s = session.get(User, student_id)
    if not s or s.managed_by != teacher.id:
        raise HTTPException(404, "Student not on your roster")
    return s


@router.post("/endorse")
def endorse(body: EndorseIn, teacher: User = Depends(teacher_only), session: Session = Depends(get_session)):
    return apply_endorse(session, teacher, body)


def apply_endorse(session: Session, teacher: User, body: EndorseIn) -> dict:
    s = _own(session, teacher, body.student_id)
    session.add(Endorsement(student_id=s.id, teacher_id=teacher.id, skill=body.skill, note=body.note))
    session.commit()
    award(session, s.id, f"endorse:{teacher.id}:{body.skill.lower()}", f"Endorsed: {body.skill}",
          body.note, verified_by=f"teacher:{teacher.name}")
    prof = get_profile(session, s)
    strengths = list(prof.data.get("strengths") or [])
    if body.skill not in strengths:
        save_profile(session, prof, {**prof.data, "strengths": strengths + [body.skill]})
    return {"ok": True}


class RecommendIn(BaseModel):
    student_id: int
    opportunity_id: int
    note: str = Field(default="", max_length=300)


@router.post("/recommend")
def recommend(body: RecommendIn, teacher: User = Depends(teacher_only), session: Session = Depends(get_session)):
    s = _own(session, teacher, body.student_id)
    o = session.get(Opportunity, body.opportunity_id)
    if not o:
        raise HTTPException(404, "Opportunity not found")
    session.add(Recommendation(student_id=s.id, teacher_id=teacher.id, opportunity_id=o.id, note=body.note))
    target = f"opp:{o.id}"
    if not session.exec(select(Application).where(Application.student_id == s.id,
                                                  Application.target == target)).first():
        session.add(Application(student_id=s.id, target=target, via_teacher=teacher.id))
    session.commit()
    award(session, s.id, f"recommended:{o.id}", f"Recommended by teacher for: {o.title}", o.org_name,
          verified_by=f"teacher:{teacher.name}")
    return {"ok": True}


@router.get("/opportunities")
def open_opportunities(teacher: User = Depends(teacher_only), session: Session = Depends(get_session)):
    from .students import listing_out
    return [listing_out(o) for o in session.exec(select(Opportunity).where(Opportunity.active == True)).all()]  # noqa: E712


@router.get("/contact-requests")
def contact_requests(teacher: User = Depends(teacher_only), session: Session = Depends(get_session)):
    out = []
    for c in session.exec(select(ContactRequest).where(ContactRequest.teacher_id == teacher.id)
                          .order_by(ContactRequest.id.desc())).all():
        org = session.get(Org, c.org_id)
        s = session.get(User, c.student_id)
        out.append({"id": c.id, "org": org.name if org else "", "student": s.name if s else "",
                    "student_id": c.student_id, "message": c.message, "status": c.status,
                    "date": c.created_at.date().isoformat()})
    return out


class Respond(BaseModel):
    status: str = Field(pattern=r"^(accepted|declined)$")


@router.post("/contact-requests/{req_id}")
def respond(req_id: int, body: Respond, teacher: User = Depends(teacher_only), session: Session = Depends(get_session)):
    c = session.get(ContactRequest, req_id)
    if not c or c.teacher_id != teacher.id:
        raise HTTPException(404, "Request not found")
    c.status = body.status
    session.add(c)
    session.commit()
    return {"ok": True}


# ---------------------------------------------------------------- modules (sustainability)

class ModuleIn(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    language: str = "ta"
    description: str = Field(default="", max_length=1000)
    lessons: list[dict] = []
    interests: list[str] = []
    pricing: str = Field(default="free", pattern=r"^(free|per_module|subscription)$")
    price_inr: int = Field(default=0, ge=0, le=5000)


PLATFORM_FEE = 0.10


@router.post("/modules")
def create_module(body: ModuleIn, teacher: User = Depends(teacher_only), session: Session = Depends(get_session)):
    m = Module(teacher_id=teacher.id, **body.model_dump())
    if m.pricing == "free":
        m.price_inr = 0
    session.add(m)
    session.commit()
    session.refresh(m)
    return {"id": m.id}


@router.get("/modules")
def my_modules(teacher: User = Depends(teacher_only), session: Session = Depends(get_session)):
    from ..models import Enrolment
    out = []
    for m in session.exec(select(Module).where(Module.teacher_id == teacher.id).order_by(Module.id.desc())).all():
        ens = session.exec(select(Enrolment).where(Enrolment.module_id == m.id)).all()
        gross = sum(e.paid_inr for e in ens)
        fee = sum(e.platform_fee_inr for e in ens)
        out.append({**module_out(m, session), "enrolments": len(ens), "gross_inr": gross,
                    "platform_fee_inr": fee, "earnings_inr": gross - fee})
    return out


def module_out(m: Module, session: Session) -> dict:
    t = session.get(User, m.teacher_id)
    return {"id": m.id, "title": m.title, "language": m.language, "description": m.description,
            "lessons": m.lessons, "interests": m.interests, "pricing": m.pricing, "price_inr": m.price_inr,
            "sponsor": m.sponsor, "teacher": t.name if t else "", "created": m.created_at.date().isoformat()}
