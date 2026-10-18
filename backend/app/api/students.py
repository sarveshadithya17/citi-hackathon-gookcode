import hashlib
import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..ai import careers as careers_ai
from ..ai import eligibility, llm, matching, pathways, profiler
from ..db import get_session
from ..knowledge import kb
from ..models import (Application, Badge, ChatMessage, Endorsement, Enrolment, Module, Opportunity,
                      Profile, Progress, Recommendation, User, now)
from ..services import (award, counts, ensure_slug, get_profile, profile_dict, save_profile,
                        steps_done, student_for)

router = APIRouter(prefix="/students/{student_id}", tags=["student"])

def clean(d: dict) -> dict:
    return {k: v for k, v in d.items() if not k.startswith("_")}


def lang_of(student: User, lang: str | None) -> str:
    return lang if lang in ("en", "ta", "hi") else (student.language or "en")


# ---------------------------------------------------------------- profile

@router.get("/profile")
def read_profile(student: User = Depends(student_for), session: Session = Depends(get_session)):
    prof = get_profile(session, student)
    return {"id": student.id, "name": student.name, "language": student.language,
            "profile": clean(profile_dict(prof)), "ready": profiler.is_ready(prof.data)}


@router.patch("/profile")
def update_profile(updates: dict, student: User = Depends(student_for), session: Session = Depends(get_session)):
    prof = get_profile(session, student)
    allowed = profiler._clean(updates)
    for k in ("age", "disability", "first_graduate", "state"):
        if k in updates:
            allowed[k] = updates[k]
    prof = save_profile(session, prof, {**prof.data, **allowed})
    return {"profile": clean(profile_dict(prof)), "ready": profiler.is_ready(prof.data)}


# ---------------------------------------------------------------- discover (chat)

class ChatIn(BaseModel):
    text: str | None = None
    choice: Any = None
    skip: bool = False
    question_id: str | None = None
    lang: str | None = None


def _q_by_id(qid: str | None) -> dict | None:
    for q in profiler.interview()["questions"]:
        if q["id"] == qid:
            return q
    return None


def _label(q: dict | None, value, lang: str) -> str:
    if not q:
        return str(value)
    values = value if isinstance(value, list) else [value]
    labels = []
    for o in q.get("options", []):
        if o["value"] in values:
            labels.append(o["label"].get(lang) or o["label"]["en"])
    return ", ".join(labels) or str(value)


@router.get("/chat")
def chat_history(lang: str | None = None, student: User = Depends(student_for),
                 session: Session = Depends(get_session)):
    lang = lang_of(student, lang)
    prof = get_profile(session, student)
    msgs = session.exec(select(ChatMessage).where(ChatMessage.user_id == student.id)
                        .order_by(ChatMessage.id)).all()
    asked = set(prof.data.get("_asked", []))
    nq = profiler.next_question(prof.data, asked)
    return {
        "messages": [{"role": m.role, "text": m.text} for m in msgs],
        "intro": profiler.interview()["intro"].get(lang),
        "question": profiler.localize_question(nq, lang),
        "ready": profiler.is_ready(prof.data),
        "done": nq is None,
        "completeness": prof.completeness,
    }


@router.post("/chat")
def chat(body: ChatIn, student: User = Depends(student_for), session: Session = Depends(get_session)):
    lang = lang_of(student, body.lang)
    prof = get_profile(session, student)
    data = dict(prof.data)
    asked = list(data.get("_asked", []))
    history = [{"role": m.role, "text": m.text} for m in session.exec(
        select(ChatMessage).where(ChatMessage.user_id == student.id).order_by(ChatMessage.id)).all()]

    asked_q = _q_by_id(body.question_id) or profiler.next_question(data, set(asked))
    said = (body.text or "").strip()
    if body.choice is not None and not said:
        said = _label(asked_q, body.choice, lang)
    if not said and not body.skip:
        raise HTTPException(400, "Say or choose something")
    if body.skip and not said:
        said = "—"

    updates = {}
    if asked_q and not body.skip:
        updates = profiler.apply_answer(data, asked_q, body.text, body.choice)
    data = profiler.merge(data, updates)
    tries = dict(data.get("_tries", {}))

    def settle():
        # A question counts as asked once it is answered, skipped, or tried twice.
        if asked_q and asked_q["id"] not in asked:
            filled = data.get(asked_q["field"]) not in (None, "", [])
            if filled or body.skip or tries.get(asked_q["id"], 0) >= 2:
                asked.append(asked_q["id"])

    if asked_q:
        tries[asked_q["id"]] = tries.get(asked_q["id"], 0) + 1
    settle()
    next_q = profiler.next_question(data, set(asked))
    reply, used_ai = None, False
    if said != "—":
        ai = profiler.ai_turn(history, clean(data), asked_q, said, next_q, lang)
        if ai:
            used_ai = True
            data = profiler.merge(data, ai["updates"])
            reply = ai["reply"]
            settle()
            next_q = profiler.next_question(data, set(asked))
    data["_tries"] = tries
    if not reply:
        reply = (profiler.localize_question(next_q, lang) or {}).get("text") \
            or profiler.interview()["done"].get(lang)
    if next_q is None and not used_ai:
        reply = profiler.interview()["done"].get(lang)

    data["_asked"] = asked
    data.pop("_cache", None)  # profile changed, career suggestions must be recomputed
    session.add(ChatMessage(user_id=student.id, role="user", text=said))
    session.add(ChatMessage(user_id=student.id, role="assistant", text=reply))
    prof = save_profile(session, prof, data)
    if profiler.is_ready(data):
        award(session, student.id, "discover", "Completed Discover profile",
              "Told Thiran about interests, strengths and goals")
    return {"reply": reply, "question": profiler.localize_question(next_q, lang), "updates": updates,
            "profile": clean(profile_dict(prof)), "ready": profiler.is_ready(data),
            "done": next_q is None, "ai": used_ai}


class AnswersIn(BaseModel):
    answers: list[ChatIn]
    lang: str | None = None


@router.post("/answers")
def offline_answers(body: AnswersIn, student: User = Depends(student_for), session: Session = Depends(get_session)):
    """Answers collected by the offline (scripted) interview, uploaded on reconnect."""
    prof = get_profile(session, student)
    data = dict(prof.data)
    asked = list(data.get("_asked", []))
    lang = lang_of(student, body.lang)
    for a in body.answers:
        q = _q_by_id(a.question_id)
        if not q:
            continue
        if not a.skip:
            data = profiler.merge(data, profiler.apply_answer(data, q, a.text, a.choice))
        if q["id"] not in asked:
            asked.append(q["id"])
        said = a.text or (_label(q, a.choice, lang) if a.choice is not None else "—")
        session.add(ChatMessage(user_id=student.id, role="assistant", text=q["text"].get(lang) or q["text"]["en"]))
        session.add(ChatMessage(user_id=student.id, role="user", text=said))
    data["_asked"] = asked
    data.pop("_cache", None)
    prof = save_profile(session, prof, data)
    if profiler.is_ready(data):
        award(session, student.id, "discover", "Completed Discover profile",
              "Told Thiran about interests, strengths and goals")
    return {"profile": clean(profile_dict(prof)), "ready": profiler.is_ready(data)}


@router.post("/chat/reset")
def reset_chat(student: User = Depends(student_for), session: Session = Depends(get_session)):
    for m in session.exec(select(ChatMessage).where(ChatMessage.user_id == student.id)).all():
        session.delete(m)
    prof = get_profile(session, student)
    data = {k: v for k, v in prof.data.items() if k in ("name", "state", "language", "district")}
    save_profile(session, prof, data)
    return {"ok": True}


# ---------------------------------------------------------------- careers

def _hash(d: dict) -> str:
    return hashlib.sha1(json.dumps(clean(d), sort_keys=True, default=str).encode()).hexdigest()[:12]


@router.get("/careers")
def suggested_careers(lang: str | None = None, student: User = Depends(student_for),
                      session: Session = Depends(get_session)):
    lang = lang_of(student, lang)
    prof = get_profile(session, student)
    if not profiler.is_ready(prof.data):
        raise HTTPException(409, "Finish Discover first")
    key = f"{lang}:{_hash(prof.data)}"
    cache = prof.data.get("_cache") or {}
    if cache.get("careers_key") == key:
        cards = cache["careers"]
    else:
        cards = careers_ai.suggest(prof.data, lang)
        cache = {**cache, "careers_key": key, "careers": cards}
        prof.data = {**prof.data, "_cache": cache}
        session.add(prof)
        session.commit()
    return {"careers": cards, "chosen": prof.chosen_career,
            "categories": sorted({c["category"] for c in cards})}


class Choose(BaseModel):
    career_id: str


@router.post("/career")
def choose_career(body: Choose, student: User = Depends(student_for), session: Session = Depends(get_session)):
    c = kb().careers_by_id.get(body.career_id)
    if not c:
        raise HTTPException(404, "Unknown career")
    prof = get_profile(session, student)
    prof.chosen_career = body.career_id
    prof.updated_at = now()
    session.add(prof)
    session.commit()
    award(session, student.id, f"career:{body.career_id}", f"Chose a goal: {c['name']['en']}")
    return {"chosen": body.career_id}


# ---------------------------------------------------------------- learn (pathway)

@router.get("/pathway")
def pathway(career_id: str | None = None, lang: str | None = None, student: User = Depends(student_for),
            session: Session = Depends(get_session)):
    lang = lang_of(student, lang)
    prof = get_profile(session, student)
    cid = career_id or prof.chosen_career
    if not cid:
        raise HTTPException(409, "Choose a career first")
    key = f"pathway:{cid}:{lang}"
    cache = prof.data.get("_cache") or {}
    result = cache.get(key) or pathways.build(cid, prof.data, lang)
    if not result:
        raise HTTPException(404, "Unknown career")
    if key not in cache:
        prof.data = {**prof.data, "_cache": {**cache, key: result}}
        session.add(prof)
        session.commit()
    done = {p.step_index for p in session.exec(select(Progress).where(
        Progress.user_id == student.id, Progress.career_id == cid, Progress.done == True)).all()}  # noqa: E712
    for i, s in enumerate(result["steps"]):
        s["done"] = i in done or bool(s.get("already_done"))
    result["progress"] = round(100 * sum(1 for s in result["steps"] if s["done"]) / max(len(result["steps"]), 1))
    return result


class ProgressIn(BaseModel):
    career_id: str
    step_index: int
    done: bool = True


def apply_progress(session: Session, student: User, body: ProgressIn) -> None:
    row = session.exec(select(Progress).where(Progress.user_id == student.id, Progress.career_id == body.career_id,
                                              Progress.step_index == body.step_index)).first()
    if row:
        row.done = body.done
        row.updated_at = now()
    else:
        row = Progress(user_id=student.id, career_id=body.career_id, step_index=body.step_index, done=body.done)
    session.add(row)
    session.commit()
    if body.done:
        c = kb().careers_by_id.get(body.career_id)
        steps = (c or {}).get("pathway", [])
        if 0 <= body.step_index < len(steps):
            award(session, student.id, f"step:{body.career_id}:{body.step_index}",
                  f"Completed: {steps[body.step_index]['title']}", c["name"]["en"])


@router.post("/progress")
def progress(body: ProgressIn, student: User = Depends(student_for), session: Session = Depends(get_session)):
    apply_progress(session, student, body)
    return {"ok": True, "steps_done": steps_done(session, student.id, body.career_id)}


# ---------------------------------------------------------------- opportunity

@router.get("/opportunities")
def opportunities(lang: str | None = None, student: User = Depends(student_for),
                  session: Session = Depends(get_session)):
    lang = lang_of(student, lang)
    prof = get_profile(session, student)
    p = profile_dict(prof)
    elig = eligibility.find(p, lang)

    cache = prof.data.get("_cache") or {}
    suggested = [c["id"] for c in cache.get("careers", [])] or [m["career"]["id"] for m in careers_ai.match(p)]
    listings = []
    for o in session.exec(select(Opportunity).where(Opportunity.active == True)).all():  # noqa: E712
        fit, why = matching.opportunity_fit(o, p, suggested)
        if fit >= 20:
            listings.append({**listing_out(o), "fit": fit, "why": why})
    listings.sort(key=lambda x: -x["fit"])

    recs = []
    for r in session.exec(select(Recommendation).where(Recommendation.student_id == student.id)).all():
        o = session.get(Opportunity, r.opportunity_id)
        t = session.get(User, r.teacher_id)
        if o:
            recs.append({"opportunity": listing_out(o), "teacher": t.name if t else "", "note": r.note})

    applied = [a.target for a in session.exec(select(Application).where(Application.student_id == student.id)).all()]
    mentors = match_mentors(session, p, suggested)
    return {"eligible": elig["eligible"], "maybe": elig["maybe"], "listings": listings[:10],
            "recommended": recs, "applied": applied, "mentors": mentors}


def listing_out(o: Opportunity) -> dict:
    return {"id": o.id, "kind": o.kind, "title": o.title, "org": o.org_name, "district": o.district,
            "state": o.state, "stipend_inr_month": o.stipend_inr_month, "duration": o.duration,
            "min_education": o.min_education, "careers": o.careers, "naps": o.naps,
            "sponsored": o.sponsored, "apply_url": o.apply_url, "description": o.description}


def match_mentors(session: Session, p: dict, careers: list[str]) -> list[dict]:
    out = []
    for m in session.exec(select(User).where(User.role == "mentor")).all():
        mp = (session.get(Profile, m.id) or Profile(user_id=m.id, data={})).data
        shared = set(mp.get("careers", [])) & set(careers + ([p.get("chosen_career")] if p.get("chosen_career") else []))
        common = set(mp.get("interests", [])) & set(p.get("interests") or [])
        score = 3 * len(shared) + len(common)
        if score:
            out.append({"id": m.id, "name": m.name, "title": mp.get("title", ""), "district": mp.get("district"),
                        "languages": mp.get("languages", []),
                        "careers": [matching.career_name(c) for c in shared], "score": score})
    return sorted(out, key=lambda x: -x["score"])[:3]


class ExplainIn(BaseModel):
    id: str
    lang: str | None = None


@router.post("/explain")
def explain(body: ExplainIn, student: User = Depends(student_for), session: Session = Depends(get_session)):
    """Explain a scholarship or scheme simply, in the student's language, using only the record's own facts."""
    rec = kb().scholarships_by_id.get(body.id) or kb().schemes_by_id.get(body.id)
    if not rec:
        raise HTTPException(404, "Scheme not found")
    lang = lang_of(student, body.lang)
    p = profile_dict(get_profile(session, student))
    res = eligibility.check(rec, p, lang)
    facts = {k: rec.get(k) for k in ("name", "provider", "benefit", "summary", "documents", "how_to_apply",
                                       "deadline_note")}
    text = llm.chat([
        {"role": "system", "content": (
            "Explain this scholarship or scheme to a rural student in 3 or 4 short spoken sentences: what they get, "
            "why they qualify (use the reasons given), and the first thing to do to apply. Use ONLY the facts "
            "given; if something is not in the facts, do not say it. No lists, no markdown. "
            + llm.lang_instruction(lang))},
        {"role": "user", "content": json.dumps({"facts": facts, "reasons": res["reasons"],
                                                "still_to_check": res["missing"] + res["conditions"]},
                                               ensure_ascii=False)},
    ], temperature=0.2, max_tokens=500)
    if not text:
        text = ". ".join(x for x in [rec["name"], rec.get("benefit"), rec.get("how_to_apply")] if x)
    return {"text": text.strip(), "ai": text is not None}


class ApplyIn(BaseModel):
    target: str  # "opp:<id>" or "kb:<id>"


@router.post("/applications")
def apply(body: ApplyIn, student: User = Depends(student_for), session: Session = Depends(get_session)):
    return record_application(session, student, body.target)


def record_application(session: Session, student: User, target: str) -> dict:
    kind, _, ident = target.partition(":")
    if kind == "opp":
        o = session.get(Opportunity, int(ident)) if ident.isdigit() else None
        if not o:
            raise HTTPException(404, "Opportunity not found")
        title = o.title
    elif kind == "kb":
        rec = kb().scholarships_by_id.get(ident) or kb().schemes_by_id.get(ident)
        if not rec:
            raise HTTPException(404, "Scheme not found")
        title = rec["name"]
    else:
        raise HTTPException(400, "target must be opp:<id> or kb:<id>")
    existing = session.exec(select(Application).where(Application.student_id == student.id,
                                                      Application.target == target)).first()
    if not existing:
        session.add(Application(student_id=student.id, target=target))
        session.commit()
        award(session, student.id, f"applied:{target}", f"Applied: {title}")
    return {"ok": True, "target": target}


# ---------------------------------------------------------------- passport

@router.get("/passport")
def passport(student: User = Depends(student_for), session: Session = Depends(get_session)):
    return build_passport(session, student, full=True)


def build_passport(session: Session, student: User, full: bool) -> dict:
    from ..services import display_name
    prof = get_profile(session, student)
    p = prof.data
    slug = ensure_slug(session, student)
    endorsements = []
    for e in session.exec(select(Endorsement).where(Endorsement.student_id == student.id)
                          .order_by(Endorsement.id.desc())).all():
        t = session.get(User, e.teacher_id)
        endorsements.append({"skill": e.skill, "note": e.note, "by": t.name if t else "", "role": "Teacher",
                             "date": e.created_at.date().isoformat()})
    badges = [{"code": b.code, "title": b.title, "detail": b.detail, "verified_by": b.verified_by,
               "date": b.created_at.date().isoformat()}
              for b in session.exec(select(Badge).where(Badge.student_id == student.id)
                                    .order_by(Badge.id.desc())).all()]
    career = kb().careers_by_id.get(prof.chosen_career or "")
    teacher = session.get(User, student.managed_by) if student.managed_by else None
    out = {
        "slug": slug,
        "name": student.name if full else display_name(student.name),
        "district": p.get("district"),
        "state": p.get("state"),
        "education_level": p.get("education_level"),
        "goal": career["name"] if career else None,
        "goal_id": prof.chosen_career,
        "interests": p.get("interests", []),
        "strengths": p.get("strengths", []),
        "work_styles": p.get("work_styles", []),
        "endorsements": endorsements,
        "badges": badges,
        "stats": counts(session, student.id),
        "teacher": teacher.name if teacher else None,
        "modules": [session.get(Module, en.module_id).title for en in
                    session.exec(select(Enrolment).where(Enrolment.student_id == student.id)).all()
                    if session.get(Module, en.module_id)],
        "public_url": f"/p/{slug}",
    }
    return out
