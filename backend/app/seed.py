"""Demo data: a teacher's class in Madurai, an employer, a CSR foundation and mentors.

All demo accounts use PIN 1234. Run `python -m backend.app.seed --reset` to start over.
"""
import sys

from sqlmodel import Session, SQLModel, select

from .auth import hash_pin
from .db import engine, init_db
from .knowledge import kb
from .models import (Badge, Endorsement, Module, Opportunity, Org, Profile, Progress, User)
from .ai import profiler

PIN = "1234"

DEMO_LOGINS = {
    "student": ("9000000001", "Meena S (Class 11, profile done)"),
    "student_new": ("9000000006", "Kavya R (new student, try Discover)"),
    "teacher": ("9000000002", "Raju K (government school teacher)"),
    "employer": ("9000000003", "MedLab Diagnostics, Madurai"),
    "csr": ("9000000004", "Vidiyal Foundation (CSR / NGO)"),
    "mentor": ("9000000005", "Dr. Anitha Rajan (mentor)"),
}

BASE = {"state": "Tamil Nadu", "district": "Madurai"}

STUDENTS = [
    # name, phone, lang, profile, chosen career, done steps
    ("Meena S", "9000000001", "ta", {
        "education_level": "class11", "stream": "science_bio", "gender": "female", "category": "bc",
        "family_income": 200000, "school_type": "government", "marks_percent": 82,
        "interests": ["biology", "chemistry", "helping_people", "health"], "work_styles": ["hands", "people"],
        "strengths": ["careful with details"], "needs_income_soon": False, "can_relocate": False,
        "aspirations": ["work in a hospital"], "age": 16}, None, []),
    ("Priya R", None, "ta", {
        "education_level": "class12", "stream": "commerce", "gender": "female", "category": "sc",
        "family_income": 80000, "school_type": "government", "marks_percent": 88,
        "interests": ["maths", "business", "computers"], "work_styles": ["numbers", "computers"],
        "needs_income_soon": True, "can_relocate": False, "age": 17}, "accountant", []),
    ("Karthik M", "9000000011", "ta", {
        "education_level": "class10", "gender": "male", "category": "mbc", "family_income": 150000,
        "school_type": "government", "marks_percent": 62,
        "interests": ["machines", "electricity", "vehicles"], "work_styles": ["hands", "outdoors"],
        "needs_income_soon": True, "can_relocate": False, "age": 15}, "electrician", [0, 1]),
    ("Divya P", None, "ta", {
        "education_level": "class11", "stream": "arts", "gender": "female", "category": "bc",
        "family_income": 120000, "school_type": "government", "marks_percent": 71,
        "interests": ["drawing", "sewing"], "work_styles": ["creative", "hands"],
        "needs_income_soon": False, "can_relocate": True, "age": 16}, "textile_designer", [0]),
    ("Suresh V", "9000000012", "en", {
        "education_level": "class12", "stream": "science_maths", "gender": "male", "category": "general",
        "family_income": 350000, "school_type": "aided", "marks_percent": 76,
        "interests": ["computers", "maths"], "work_styles": ["computers", "numbers"],
        "needs_income_soon": False, "can_relocate": True, "age": 17}, "it_support_technician", []),
    ("Lakshmi N", None, "ta", {
        "education_level": "class12", "stream": "science_bio", "gender": "female", "category": "sc",
        "family_income": 90000, "school_type": "government", "marks_percent": 69,
        "interests": ["farming", "biology"], "work_styles": ["outdoors", "hands"],
        "needs_income_soon": False, "can_relocate": False, "age": 17, "district": "Theni"}, None, []),
    ("Mohan R", None, "ta", {
        "education_level": "class10", "gender": "male", "category": "bc", "family_income": 180000,
        "school_type": "government", "marks_percent": 58,
        "interests": ["sports", "uniform_service"], "work_styles": ["outdoors", "people"],
        "needs_income_soon": True, "can_relocate": True, "age": 15}, "police_constable", []),
    ("Fathima B", None, "ta", {
        "education_level": "class11", "stream": "science_bio", "gender": "female", "category": "minority",
        "family_income": 160000, "school_type": "aided", "marks_percent": 79,
        "interests": ["helping_people", "biology"], "work_styles": ["people", "hands"],
        "needs_income_soon": False, "can_relocate": False, "age": 16}, "nurse", []),
    ("Arun K", None, "ta", {"education_level": "class9"}, None, []),
    ("Kavya R", "9000000006", "ta", {}, None, []),
]

MENTORS = [
    ("Dr. Anitha Rajan", "9000000005", {"title": "Pathologist, Madurai", "careers": ["lab_technician", "nurse", "doctor"],
                                        "interests": ["biology", "health", "helping_people"], "languages": ["ta", "en"]}),
    ("Senthil Kumar", "9000000007", {"title": "Licensed electrician and solar installer",
                                     "careers": ["electrician", "solar_pv_installer"],
                                     "interests": ["electricity", "machines"], "languages": ["ta"]}),
    ("Revathi G", "9000000008", {"title": "Handloom textile designer, Madurai",
                                 "careers": ["textile_designer", "fashion_designer", "tailor_garment_maker"],
                                 "interests": ["drawing", "sewing", "fashion"], "languages": ["ta", "en"]}),
]


def _known(cid):
    return cid if cid and cid in kb().careers_by_id else None


def seed(session: Session) -> None:
    medlab = Org(name="MedLab Diagnostics, Madurai", kind="employer", district="Madurai", state="Tamil Nadu")
    vidiyal = Org(name="Vidiyal Foundation", kind="csr", district="Madurai", state="Tamil Nadu")
    session.add(medlab)
    session.add(vidiyal)
    session.commit()

    teacher = User(phone="9000000002", pin_hash=hash_pin(PIN), role="teacher", name="Raju K", language="ta")
    session.add(teacher)
    session.add(User(phone="9000000003", pin_hash=hash_pin(PIN), role="employer", name="Dr. Vel Murugan",
                     language="en", org_id=medlab.id))
    session.add(User(phone="9000000004", pin_hash=hash_pin(PIN), role="employer", name="Shalini Iyer",
                     language="en", org_id=vidiyal.id))
    session.add(User(phone="9000000009", pin_hash=hash_pin(PIN), role="admin", name="Thiran Admin"))
    session.commit()

    for name, phone, data in MENTORS:
        m = User(phone=phone, pin_hash=hash_pin(PIN), role="mentor", name=name, language="ta")
        session.add(m)
        session.commit()
        session.add(Profile(user_id=m.id, data={**BASE, **data}, completeness=100))
    session.commit()

    for name, phone, lang, data, career, done in STUDENTS:
        s = User(phone=phone, pin_hash=hash_pin(PIN) if phone else None, role="student", name=name,
                 language=lang, managed_by=teacher.id)
        session.add(s)
        session.commit()
        pdata = {**BASE, "name": name, **data}
        if data:
            pdata["_asked"] = [q["id"] for q in profiler.interview()["questions"]
                               if pdata.get(q["field"]) not in (None, "", [])]
        session.add(Profile(user_id=s.id, data=pdata, chosen_career=_known(career),
                            completeness=profiler.completeness(pdata)))
        if profiler.is_ready(pdata):
            session.add(Badge(student_id=s.id, code="discover", title="Completed Discover profile",
                              detail="Told Thiran about interests, strengths and goals"))
        if _known(career):
            c = kb().careers_by_id[career]
            session.add(Badge(student_id=s.id, code=f"career:{career}", title=f"Chose a goal: {c['name']['en']}"))
            for i in done:
                if i < len(c.get("pathway", [])):
                    session.add(Progress(user_id=s.id, career_id=career, step_index=i))
                    session.add(Badge(student_id=s.id, code=f"step:{career}:{i}",
                                      title=f"Completed: {c['pathway'][i]['title']}", detail=c["name"]["en"]))
        session.commit()

    by_name = {u.name: u for u in session.exec(select(User).where(User.role == "student")).all()}
    for student, skill, note in [
        ("Meena S", "Practical science", "Careful and accurate in every lab practical."),
        ("Karthik M", "Wiring and repair", "Fixed the school's fan and lighting wiring safely."),
        ("Suresh V", "Logical thinking", "Helps classmates with computer lab work."),
        ("Divya P", "Drawing and design", "Won the district kolam design competition."),
    ]:
        s = by_name[student]
        session.add(Endorsement(student_id=s.id, teacher_id=teacher.id, skill=skill, note=note))
        session.add(Badge(student_id=s.id, code=f"endorse:{teacher.id}:{skill.lower()}", title=f"Endorsed: {skill}",
                          detail=note, verified_by=f"teacher:{teacher.name}"))
    session.commit()

    for a in kb().apprenticeships:
        org_id = medlab.id if a["org"].startswith("MedLab") else None
        session.add(Opportunity(
            key=a["id"], org_id=org_id, kind=a.get("kind", "apprenticeship"), title=a["title"], org_name=a["org"],
            district=a.get("district"), state=a.get("state"), stipend_inr_month=a.get("stipend_inr_month"),
            duration=a.get("duration"), min_education=a.get("min_education"), interests=a.get("interests", []),
            careers=a.get("careers", []), apply_url=a.get("apply_url"), naps=a.get("naps", False),
            description=a.get("description", f"{a.get('trade', '')} apprenticeship. Demo listing."),
        ))
    session.add(Opportunity(
        kind="scholarship", title="Vidiyal girls in science scholarship (Rs 10,000 a year)",
        org_name="Vidiyal Foundation", org_id=vidiyal.id, district="Madurai", state="Tamil Nadu",
        min_education="class11", interests=["biology", "health", "computers", "maths"],
        careers=["lab_technician", "nurse", "pharmacist", "data_analyst"], sponsored=True,
        description="CSR-sponsored scholarship for girls from government schools taking science. Demo listing."))
    session.commit()

    session.add(Module(
        teacher_id=teacher.id, title="Basic Electrical Wiring (in Tamil)", language="ta",
        description="Five short voice lessons with pictures and a quiz: safety, tools, switch boards, "
                    "fan wiring and earthing.",
        lessons=[{"title": t} for t in ["Safety first", "Tools of an electrician", "Switch board wiring",
                                         "Fan and light connections", "Earthing and testing"]],
        interests=["electricity", "machines"], pricing="per_module", price_inr=20))
    session.add(Module(
        teacher_id=teacher.id, title="Spoken English for interviews", language="ta",
        description="Ten everyday phrases a week, explained in Tamil, for apprenticeship interviews.",
        lessons=[{"title": t} for t in ["Introducing yourself", "Talking about your skills", "Common questions"]],
        interests=["talking", "languages"], pricing="free", sponsor="Vidiyal Foundation"))
    session.commit()


def seed_if_empty() -> None:
    with Session(engine) as session:
        if session.exec(select(User)).first():
            return
        seed(session)


if __name__ == "__main__":
    if "--reset" in sys.argv:
        SQLModel.metadata.drop_all(engine)
    init_db()
    seed_if_empty()
    print("Seeded demo data. Logins (PIN 1234):")
    for role, (phone, who) in DEMO_LOGINS.items():
        print(f"  {role:12s} {phone}  {who}")
