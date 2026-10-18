"""Shared helpers used by several routers."""
import secrets

from fastapi import Depends, HTTPException
from sqlmodel import Session, func, select

from .ai import profiler
from .auth import can_act_for, current_user
from .db import get_session
from .models import Application, Badge, Endorsement, Profile, Progress, User, now


def student_for(student_id: str, user: User = Depends(current_user),
                session: Session = Depends(get_session)) -> User:
    """Resolve the student a request acts on ("me" or an id the caller may act for)."""
    if student_id == "me":
        if user.role != "student":
            raise HTTPException(400, "Use a student id")
        return user
    try:
        sid = int(student_id)
    except ValueError:
        raise HTTPException(404, "Student not found")
    student = session.get(User, sid)
    if not student or student.role != "student":
        raise HTTPException(404, "Student not found")
    if not can_act_for(user, student):
        raise HTTPException(403, "Not your student")
    return student


def get_profile(session: Session, user: User) -> Profile:
    prof = session.get(Profile, user.id)
    if not prof:
        prof = Profile(user_id=user.id, data={"name": user.name, "state": "Tamil Nadu", "language": user.language})
        session.add(prof)
        session.commit()
        session.refresh(prof)
    return prof


def profile_dict(prof: Profile) -> dict:
    d = dict(prof.data or {})
    d["chosen_career"] = prof.chosen_career
    d["completeness"] = prof.completeness
    return d


def save_profile(session: Session, prof: Profile, data: dict) -> Profile:
    data = {k: v for k, v in data.items() if k not in ("chosen_career", "completeness")}
    prof.data = data
    prof.completeness = profiler.completeness(data)
    prof.updated_at = now()
    session.add(prof)
    session.commit()
    session.refresh(prof)
    return prof


def award(session: Session, student_id: int, code: str, title: str, detail: str = "",
          verified_by: str = "system") -> None:
    exists = session.exec(select(Badge).where(Badge.student_id == student_id, Badge.code == code)).first()
    if not exists:
        session.add(Badge(student_id=student_id, code=code, title=title, detail=detail, verified_by=verified_by))
        session.commit()


def ensure_slug(session: Session, user: User) -> str:
    if not user.passport_slug:
        user.passport_slug = secrets.token_urlsafe(6)
        session.add(user)
        session.commit()
    return user.passport_slug


def steps_done(session: Session, student_id: int, career_id: str | None = None) -> int:
    q = select(func.count()).select_from(Progress).where(Progress.user_id == student_id, Progress.done == True)  # noqa: E712
    if career_id:
        q = q.where(Progress.career_id == career_id)
    return session.exec(q).one()


def counts(session: Session, student_id: int) -> dict:
    return {
        "endorsements": session.exec(select(func.count()).select_from(Endorsement)
                                     .where(Endorsement.student_id == student_id)).one(),
        "badges": session.exec(select(func.count()).select_from(Badge).where(Badge.student_id == student_id)).one(),
        "applications": session.exec(select(func.count()).select_from(Application)
                                     .where(Application.student_id == student_id)).one(),
        "steps_done": steps_done(session, student_id),
    }


def display_name(name: str) -> str:
    """First name and last initial, used wherever a minor is shown to an organisation."""
    parts = (name or "").split()
    if len(parts) <= 1:
        return name
    return f"{parts[0]} {parts[-1][0]}."
