from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..auth import current_user, hash_pin, make_token, verify_pin
from ..db import get_session
from ..models import Org, User
from ..services import get_profile

router = APIRouter(prefix="/auth", tags=["auth"])


class Login(BaseModel):
    phone: str = Field(pattern=r"^\d{10}$")
    pin: str = Field(pattern=r"^\d{4}$")


class Register(Login):
    name: str = Field(min_length=1, max_length=80)
    role: str = Field(pattern=r"^(student|teacher|employer|mentor)$")
    language: str = "en"
    org_name: str | None = None
    org_kind: str = "employer"
    district: str | None = None


def user_out(u: User, session: Session) -> dict:
    out = {"id": u.id, "name": u.name, "role": u.role, "language": u.language, "phone": u.phone}
    if u.org_id:
        org = session.get(Org, u.org_id)
        out["org"] = {"id": org.id, "name": org.name, "kind": org.kind, "plan": org.plan} if org else None
    return out


@router.post("/login")
def login(body: Login, session: Session = Depends(get_session)):
    u = session.exec(select(User).where(User.phone == body.phone)).first()
    if not u or not verify_pin(body.pin, u.pin_hash):
        raise HTTPException(401, "Wrong phone number or PIN")
    return {"token": make_token(u), "user": user_out(u, session)}


@router.post("/register")
def register(body: Register, session: Session = Depends(get_session)):
    if session.exec(select(User).where(User.phone == body.phone)).first():
        raise HTTPException(409, "This phone number is already registered")
    org_id = None
    if body.role == "employer":
        org = Org(name=body.org_name or body.name, kind=body.org_kind, district=body.district, state="Tamil Nadu")
        session.add(org)
        session.commit()
        session.refresh(org)
        org_id = org.id
    u = User(phone=body.phone, pin_hash=hash_pin(body.pin), role=body.role, name=body.name,
             language=body.language, org_id=org_id)
    session.add(u)
    session.commit()
    session.refresh(u)
    if u.role in ("student", "mentor"):
        prof = get_profile(session, u)
        if body.district:
            prof.data = {**prof.data, "district": body.district}
            session.add(prof)
            session.commit()
    return {"token": make_token(u), "user": user_out(u, session)}


@router.get("/me")
def me(user: User = Depends(current_user), session: Session = Depends(get_session)):
    return user_out(user, session)


class Lang(BaseModel):
    language: str = Field(pattern=r"^(en|ta|hi)$")


@router.post("/me/language")
def set_language(body: Lang, user: User = Depends(current_user), session: Session = Depends(get_session)):
    user.language = body.language
    session.add(user)
    session.commit()
    return user_out(user, session)
