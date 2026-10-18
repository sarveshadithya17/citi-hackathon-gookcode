"""Public Talent Passport link and QR code (no login; no contact details)."""
import io

import qrcode
import qrcode.image.svg
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from sqlmodel import Session, select

from ..db import get_session
from ..models import User
from .students import build_passport

router = APIRouter(tags=["passport"])


def _by_slug(session: Session, slug: str) -> User:
    u = session.exec(select(User).where(User.passport_slug == slug)).first()
    if not u:
        raise HTTPException(404, "Passport not found")
    return u


@router.get("/passport/{slug}")
def public_passport(slug: str, session: Session = Depends(get_session)):
    pp = build_passport(session, _by_slug(session, slug), full=False)
    pp.pop("modules", None)
    pp["stats"].pop("applications", None)
    return pp


@router.get("/passport/{slug}/qr.svg")
def passport_qr(slug: str, request: Request, session: Session = Depends(get_session)):
    _by_slug(session, slug)
    url = str(request.base_url).rstrip("/") + f"/p/{slug}"
    img = qrcode.make(url, image_factory=qrcode.image.svg.SvgPathImage, box_size=8, border=2)
    buf = io.BytesIO()
    img.save(buf)
    return Response(buf.getvalue(), media_type="image/svg+xml",
                    headers={"Cache-Control": "public, max-age=86400"})
