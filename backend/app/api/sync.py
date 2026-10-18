"""Offline sync: the app queues actions in an outbox while offline and sends them here.

Every operation carries a client-generated op_id. Applied ids are logged, so a
retried upload never applies an action twice. Operations are applied in the
order the student made them (by client timestamp); for the same pathway step
the latest change wins.
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session

from ..auth import can_act_for, current_user
from ..db import get_session
from ..models import SyncLog, User
from .students import AnswersIn, ProgressIn, apply_progress, offline_answers, record_application
from .teacher import EndorseIn, apply_endorse

router = APIRouter(tags=["sync"])


class Op(BaseModel):
    op_id: str
    kind: str  # progress | apply | answers | endorse | profile
    student_id: int | None = None
    ts: float = 0
    payload: dict = {}


class SyncIn(BaseModel):
    ops: list[Op]


@router.post("/sync")
def sync(body: SyncIn, user: User = Depends(current_user), session: Session = Depends(get_session)):
    results = []
    for op in sorted(body.ops, key=lambda o: o.ts):
        if session.get(SyncLog, op.op_id):
            results.append({"op_id": op.op_id, "status": "duplicate"})
            continue
        try:
            student = session.get(User, op.student_id) if op.student_id else user
            if op.kind != "endorse" and (not student or not can_act_for(user, student)):
                raise PermissionError("not allowed")
            if op.kind == "progress":
                apply_progress(session, student, ProgressIn(**op.payload))
            elif op.kind == "apply":
                record_application(session, student, op.payload["target"])
            elif op.kind == "answers":
                offline_answers(AnswersIn(**op.payload), student, session)
            elif op.kind == "endorse" and user.role == "teacher":
                apply_endorse(session, user, EndorseIn(**op.payload))
            else:
                raise ValueError(f"unknown op {op.kind}")
            session.add(SyncLog(op_id=op.op_id, user_id=user.id, kind=op.kind))
            session.commit()
            results.append({"op_id": op.op_id, "status": "applied"})
        except Exception as e:  # one bad op must not block the rest of the queue
            session.rollback()
            results.append({"op_id": op.op_id, "status": "error", "error": str(e)[:200]})
    return {"results": results}
