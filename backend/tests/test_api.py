"""End-to-end API tests on a fresh database with the AI switched off (rule-based fallbacks)."""
import os
import tempfile

os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.mkdtemp()}/test.db"
os.environ["LLM_PROVIDERS"] = "none"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from backend.app.ai import eligibility  # noqa: E402
from backend.app.knowledge import kb  # noqa: E402
from backend.app.main import app  # noqa: E402


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def login(client, phone):
    r = client.post("/api/v1/auth/login", json={"phone": phone, "pin": "1234"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_knowledge_base_is_consistent():
    stats = kb().stats()
    assert stats["careers"] >= 60 and stats["scholarships"] >= 20 and stats["schemes"] >= 10
    for c in kb().careers:
        for step in c.get("pathway", []):
            if step.get("ref"):
                assert kb().ref(step["ref"]), f"{c['id']} points to missing {step['ref']}"
    for rec in kb().scholarships + kb().schemes:
        assert rec["apply_url"].startswith("https://")


def test_wrong_pin_is_rejected(client):
    r = client.post("/api/v1/auth/login", json={"phone": "9000000001", "pin": "0000"})
    assert r.status_code == 401


def test_discover_interview_without_ai(client):
    h = login(client, "9000000006")  # Kavya: empty profile
    first = client.get("/api/v1/students/me/chat?lang=ta", headers=h).json()
    assert first["question"]["id"] == "education"
    r = client.post("/api/v1/students/me/chat", headers=h,
                    json={"question_id": "education", "choice": "class10", "lang": "ta"}).json()
    assert r["profile"]["education_level"] == "class10"
    assert r["question"]["id"] == "interests"
    r = client.post("/api/v1/students/me/chat", headers=h,
                    json={"question_id": "interests", "text": "I like fixing machines and wires", "lang": "en"}).json()
    assert {"machines", "electricity"} <= set(r["profile"]["interests"])
    r = client.post("/api/v1/students/me/chat", headers=h,
                    json={"question_id": "work_style", "choice": ["hands"], "lang": "en"}).json()
    assert r["ready"] is True


def test_careers_are_diverse(client):
    h = login(client, "9000000001")  # Meena
    cards = client.get("/api/v1/students/me/careers?lang=en", headers=h).json()["careers"]
    assert len(cards) >= 6
    assert len({c["category"] for c in cards}) >= 4, "suggestions must span several fields"
    assert "lab_technician" in [c["id"] for c in cards]


def test_pathway_links_real_catalogue_items(client):
    h = login(client, "9000000001")
    p = client.get("/api/v1/students/me/pathway?career_id=lab_technician&lang=en", headers=h).json()
    assert p["steps"] and any(s.get("url") for s in p["steps"])
    r = client.post("/api/v1/students/me/progress", headers=h,
                    json={"career_id": "lab_technician", "step_index": 1, "done": True})
    assert r.status_code == 200
    passport = client.get("/api/v1/students/me/passport", headers=h).json()
    assert any(b["code"] == "step:lab_technician:1" for b in passport["badges"])


def test_eligibility_rules():
    rec = kb().scholarships_by_id["pm_yasasvi_postmatric"]
    ok = eligibility.check(rec, {"education_level": "class11", "category": "bc", "family_income": 200000})
    assert ok["status"] in ("eligible", "maybe") and not ok["failed"]
    rich = eligibility.check(rec, {"education_level": "class11", "category": "bc", "family_income": 900000})
    assert rich["status"] == "no"
    unknown = eligibility.check(rec, {"education_level": "class11"})
    assert unknown["status"] == "maybe" and unknown["missing"]


def test_opportunities_explain_why(client):
    h = login(client, "9000000001")
    d = client.get("/api/v1/students/me/opportunities?lang=en", headers=h).json()
    assert d["eligible"], "Meena should qualify for something"
    assert all(x["reasons"] for x in d["eligible"])
    assert d["listings"] and d["mentors"]


def test_offline_sync_is_idempotent(client):
    h = login(client, "9000000001")
    op = {"op_id": "test-op-1", "kind": "apply", "ts": 1, "payload": {"target": "kb:naps"}}
    first = client.post("/api/v1/sync", headers=h, json={"ops": [op]}).json()["results"][0]
    again = client.post("/api/v1/sync", headers=h, json={"ops": [op]}).json()["results"][0]
    assert first["status"] == "applied" and again["status"] == "duplicate"


def test_teacher_endorse_and_privacy(client):
    th = login(client, "9000000002")
    roster = client.get("/api/v1/teacher/roster", headers=th).json()
    meena = next(s for s in roster if s["name"].startswith("Meena"))
    assert client.post("/api/v1/teacher/endorse", headers=th,
                       json={"student_id": meena["id"], "skill": "Teamwork", "note": "Leads group work"}).status_code == 200
    ins = client.get("/api/v1/teacher/insights?lang=en", headers=th).json()
    assert ins["class_size"] == len(roster) and ins["cards"]

    # A teacher can't act for a student who isn't on their roster; an employer can't use student routes.
    eh = login(client, "9000000003")
    assert client.get(f"/api/v1/students/{meena['id']}/profile", headers=eh).status_code == 403
    talent = client.get("/api/v1/employer/talent?district=Madurai", headers=eh).json()
    names = [r["name"] for r in talent["results"]]
    assert "Meena S." in names and "Meena S" not in names  # first name + initial only
    unlocked = client.post(f"/api/v1/employer/unlock/{meena['id']}", headers=eh).json()["passport"]
    assert "phone" not in unlocked and any(e["skill"] == "Teamwork" for e in unlocked["endorsements"])


def test_public_passport_and_qr(client):
    h = login(client, "9000000001")
    slug = client.get("/api/v1/students/me/passport", headers=h).json()["slug"]
    pub = client.get(f"/api/v1/passport/{slug}").json()
    assert pub["name"] == "Meena S." and "applications" not in pub["stats"]
    qr = client.get(f"/api/v1/passport/{slug}/qr.svg")
    assert qr.status_code == 200 and qr.headers["content-type"].startswith("image/svg")


def test_modules_marketplace(client):
    th = login(client, "9000000002")
    mid = client.post("/api/v1/teacher/modules", headers=th, json={
        "title": "Mobile repair basics", "pricing": "per_module", "price_inr": 50, "lessons": [{"title": "Tools"}]}).json()["id"]
    sh = login(client, "9000000001")
    r = client.post(f"/api/v1/students/me/modules/{mid}/enrol", headers=sh).json()
    assert r["paid_inr"] == 50 and r["platform_fee_inr"] == 5
    mods = client.get("/api/v1/teacher/modules", headers=th).json()
    assert next(m for m in mods if m["id"] == mid)["earnings_inr"] == 45
