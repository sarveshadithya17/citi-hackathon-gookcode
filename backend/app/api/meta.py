from fastapi import APIRouter, Depends, HTTPException

from ..ai import llm, profiler
from ..auth import require
from ..config import LANGUAGES
from ..knowledge import FILES, kb

router = APIRouter(tags=["meta"])


@router.get("/meta")
def meta():
    return {"languages": LANGUAGES, "knowledge_base": kb().stats(), "ai": llm.status()}


@router.get("/meta/interview")
def interview():
    """The scripted Discover flow. The app caches it so Discover works offline."""
    return profiler.interview()


@router.get("/kb/{name}")
def knowledge(name: str):
    """Open data for partners: the curated knowledge base, as published JSON."""
    if name not in FILES:
        raise HTTPException(404, f"Unknown dataset. Available: {', '.join(FILES)}")
    return getattr(kb(), name)


@router.post("/admin/reload", dependencies=[Depends(require("admin"))])
def reload():
    kb().reload()
    profiler.interview.cache_clear()
    return kb().stats()
