"""Thiran API and web app server.

Run from the repo root:  uvicorn backend.app.main:app --reload
API docs: /docs (Swagger UI), all endpoints under /api/v1.
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .api import auth, employer, meta, modules, public, students, sync, teacher
from .config import FRONTEND_DIR
from .db import init_db

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    from .seed import seed_if_empty
    seed_if_empty()
    yield


app = FastAPI(
    title="Thiran API",
    version="1.0.0",
    description="Voice-first learning-to-livelihood platform for rural students. "
                "Open API for colleges, employers, NGOs and government systems.",
    lifespan=lifespan,
)
app.add_middleware(GZipMiddleware, minimum_size=800)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

API = "/api/v1"
for r in (auth.router, meta.router, students.router, teacher.router, modules.router,
          employer.router, public.router, sync.router):
    app.include_router(r, prefix=API)


@app.get("/p/{slug}", include_in_schema=False)
def passport_page(slug: str):
    # The React app renders the public passport when the path starts with /p/.
    return FileResponse(FRONTEND_DIR / "index.html")


if (FRONTEND_DIR / "index.html").exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
else:
    @app.get("/", include_in_schema=False)
    def no_frontend():
        return {"message": "API is running. Build the web app with: cd frontend && npm install && npm run build",
                "docs": "/docs"}
