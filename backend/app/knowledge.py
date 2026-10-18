"""Loads the JSON knowledge base in data/ once and indexes it by id."""
import json
from functools import lru_cache

from .config import DATA_DIR

EDUCATION_ORDER = ["class8", "class9", "class10", "class11", "class12", "iti", "diploma", "ug", "pg"]
EDU_RANK = {e: i for i, e in enumerate(EDUCATION_ORDER)}
# iti and diploma both normally come after class 10; treat them as class 12 equivalents for gating.
EDU_RANK["iti"] = EDU_RANK["class12"]
EDU_RANK["diploma"] = EDU_RANK["class12"]

FILES = ["careers", "courses", "exams", "scholarships", "schemes", "apprenticeships"]


def _load(name: str) -> list[dict]:
    path = DATA_DIR / f"{name}.json"
    if not path.exists():
        return []
    with open(path, encoding="utf-8") as f:
        return json.load(f)


class KnowledgeBase:
    def __init__(self) -> None:
        self.reload()

    def reload(self) -> None:
        for name in FILES:
            rows = _load(name)
            setattr(self, name, rows)
            setattr(self, f"{name}_by_id", {r["id"]: r for r in rows})
        self.locales = {}
        for path in sorted((DATA_DIR / "locales").glob("*.json")) if (DATA_DIR / "locales").exists() else []:
            with open(path, encoding="utf-8") as f:
                self.locales[path.stem] = json.load(f)

    def ref(self, ref_id: str | None) -> dict | None:
        if not ref_id:
            return None
        return self.courses_by_id.get(ref_id) or self.exams_by_id.get(ref_id)

    def career_name(self, career: dict, lang: str) -> str:
        names = career.get("name", {})
        return names.get(lang) or names.get("en") or career["id"]

    def stats(self) -> dict:
        return {name: len(getattr(self, name)) for name in FILES}


@lru_cache
def kb() -> KnowledgeBase:
    return KnowledgeBase()
