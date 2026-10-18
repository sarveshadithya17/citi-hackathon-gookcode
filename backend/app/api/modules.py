from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..auth import current_user
from ..db import get_session
from ..models import Enrolment, Module, User
from ..services import award, get_profile, student_for
from .teacher import PLATFORM_FEE, module_out

router = APIRouter(tags=["modules"])


@router.get("/modules")
def list_modules(user: User = Depends(current_user), session: Session = Depends(get_session)):
    interests = set()
    if user.role == "student":
        interests = set(get_profile(session, user).data.get("interests") or [])
    mods = [module_out(m, session) for m in session.exec(select(Module).order_by(Module.id.desc())).all()]
    mods.sort(key=lambda m: -len(interests & set(m["interests"])))
    return mods


@router.post("/students/{student_id}/modules/{module_id}/enrol")
def enrol(module_id: int, student: User = Depends(student_for), session: Session = Depends(get_session)):
    """Join a module. Paid modules use a simulated payment in the prototype (UPI in production)."""
    m = session.get(Module, module_id)
    if not m:
        raise HTTPException(404, "Module not found")
    if session.exec(select(Enrolment).where(Enrolment.module_id == m.id, Enrolment.student_id == student.id)).first():
        return {"ok": True, "already": True}
    paid = 0 if (m.pricing == "free" or m.sponsor) else m.price_inr
    fee = round(paid * PLATFORM_FEE)
    session.add(Enrolment(module_id=m.id, student_id=student.id, paid_inr=paid, platform_fee_inr=fee))
    m.enrolments += 1
    session.add(m)
    session.commit()
    award(session, student.id, f"module:{m.id}", f"Joined module: {m.title}")
    return {"ok": True, "paid_inr": paid, "platform_fee_inr": fee, "payment": "simulated" if paid else "free"}
