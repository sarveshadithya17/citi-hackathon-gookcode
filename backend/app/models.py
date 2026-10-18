"""Database tables. SQLite for the prototype; the same models run on PostgreSQL."""
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


def now() -> datetime:
    return datetime.now(timezone.utc)


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    phone: Optional[str] = Field(default=None, index=True, unique=True)
    pin_hash: Optional[str] = None
    role: str = Field(index=True)  # student | teacher | employer | mentor | admin
    name: str
    language: str = "en"
    org_id: Optional[int] = Field(default=None, foreign_key="org.id")
    # Students added by a teacher may have no phone of their own.
    managed_by: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    passport_slug: Optional[str] = Field(default=None, index=True, unique=True)
    created_at: datetime = Field(default_factory=now)


class Org(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    kind: str = "employer"  # employer | ngo | csr | college
    district: Optional[str] = None
    state: Optional[str] = None
    plan: str = "free"  # free | talent_pro
    created_at: datetime = Field(default_factory=now)


class Profile(SQLModel, table=True):
    user_id: int = Field(primary_key=True, foreign_key="user.id")
    data: dict = Field(default_factory=dict, sa_column=Column(JSON))
    chosen_career: Optional[str] = None
    completeness: int = 0
    updated_at: datetime = Field(default_factory=now)


class ChatMessage(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    role: str  # user | assistant
    text: str
    created_at: datetime = Field(default_factory=now)


class Progress(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    career_id: str
    step_index: int
    done: bool = True
    updated_at: datetime = Field(default_factory=now)


class Endorsement(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    student_id: int = Field(foreign_key="user.id", index=True)
    teacher_id: int = Field(foreign_key="user.id")
    skill: str
    note: str = ""
    created_at: datetime = Field(default_factory=now)


class Badge(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    student_id: int = Field(foreign_key="user.id", index=True)
    code: str
    title: str
    detail: str = ""
    verified_by: Optional[str] = None  # "teacher:<name>", "system"
    created_at: datetime = Field(default_factory=now)


class Opportunity(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    key: Optional[str] = Field(default=None, index=True, unique=True)  # knowledge-base id for seeded rows
    org_id: Optional[int] = Field(default=None, foreign_key="org.id")
    kind: str = "apprenticeship"  # apprenticeship | internship | job | scholarship
    title: str
    org_name: str
    district: Optional[str] = None
    state: Optional[str] = None
    stipend_inr_month: Optional[int] = None
    duration: Optional[str] = None
    min_education: Optional[str] = None
    interests: list = Field(default_factory=list, sa_column=Column(JSON))
    careers: list = Field(default_factory=list, sa_column=Column(JSON))
    description: str = ""
    apply_url: Optional[str] = None
    naps: bool = False
    sponsored: bool = False
    active: bool = True
    created_at: datetime = Field(default_factory=now)


class Application(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    student_id: int = Field(foreign_key="user.id", index=True)
    target: str  # "opp:<id>" or "kb:<scholarship/scheme id>"
    status: str = "applied"  # applied | shortlisted | selected
    via_teacher: Optional[int] = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=now)


class Recommendation(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    student_id: int = Field(foreign_key="user.id", index=True)
    teacher_id: int = Field(foreign_key="user.id")
    opportunity_id: int = Field(foreign_key="opportunity.id", index=True)
    note: str = ""
    created_at: datetime = Field(default_factory=now)


class Module(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    teacher_id: int = Field(foreign_key="user.id", index=True)
    title: str
    language: str = "ta"
    description: str = ""
    lessons: list = Field(default_factory=list, sa_column=Column(JSON))
    interests: list = Field(default_factory=list, sa_column=Column(JSON))
    pricing: str = "free"  # free | per_module | subscription
    price_inr: int = 0
    sponsor: Optional[str] = None
    enrolments: int = 0
    created_at: datetime = Field(default_factory=now)


class Enrolment(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    module_id: int = Field(foreign_key="module.id", index=True)
    student_id: int = Field(foreign_key="user.id", index=True)
    paid_inr: int = 0
    platform_fee_inr: int = 0
    created_at: datetime = Field(default_factory=now)


class Unlock(SQLModel, table=True):
    """An employer unlocking a student's full passport (a paid action)."""
    id: Optional[int] = Field(default=None, primary_key=True)
    org_id: int = Field(foreign_key="org.id", index=True)
    student_id: int = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=now)


class ContactRequest(SQLModel, table=True):
    """Employers reach students only through their teacher."""
    id: Optional[int] = Field(default=None, primary_key=True)
    org_id: int = Field(foreign_key="org.id")
    student_id: int = Field(foreign_key="user.id", index=True)
    teacher_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    message: str = ""
    status: str = "pending"  # pending | accepted | declined
    created_at: datetime = Field(default_factory=now)


class SyncLog(SQLModel, table=True):
    """Client-generated ids of offline actions already applied, so a retried sync is a no-op."""
    op_id: str = Field(primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    kind: str
    created_at: datetime = Field(default_factory=now)
