"""Settings, read from environment variables (and the project's .env file)."""
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")

DATA_DIR = Path(os.getenv("THIRAN_DATA_DIR", ROOT / "data"))
# The built React app (cd frontend && npm run build).
FRONTEND_DIR = Path(os.getenv("THIRAN_FRONTEND_DIR", ROOT / "frontend" / "dist"))
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{ROOT / 'backend' / 'thiran.db'}")

SECRET_KEY = os.getenv("SECRET_KEY", "dev-only-secret-change-me-in-production")
TOKEN_TTL_HOURS = int(os.getenv("TOKEN_TTL_HOURS", "720"))

# Comma-separated provider order. The first one that has a key (or, for ollama,
# answers) is used, and the rest are fallbacks. "none" disables the LLM so the
# rule-based fallbacks are used everywhere.
LLM_PROVIDERS = [p.strip() for p in os.getenv("LLM_PROVIDERS", "gemini,groq,ollama").split(",") if p.strip()]
LLM_TIMEOUT = float(os.getenv("LLM_TIMEOUT", "25"))

PROVIDERS = {
    "gemini": {
        "base_url": os.getenv("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta/openai"),
        "api_key": os.getenv("GEMINI_API_KEY", ""),
        "model": os.getenv("GEMINI_MODEL", "gemini-3.5-flash"),
        "fallback_model": os.getenv("GEMINI_FALLBACK_MODEL", "gemini-flash-latest"),
        # Short answers don't need long thinking; this keeps replies fast on a phone.
        "extra": {"reasoning_effort": os.getenv("GEMINI_REASONING", "minimal")},
        "fallback_extra": {"reasoning_effort": "low"},
    },
    "groq": {
        "base_url": os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1"),
        "api_key": os.getenv("GROQ_API_KEY", ""),
        "model": os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
    },
    "ollama": {
        "base_url": os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1"),
        "api_key": "ollama",
        "model": os.getenv("OLLAMA_MODEL", "gemma3"),
        "optional": True,
    },
    "openai_compatible": {
        "base_url": os.getenv("OPENAI_BASE_URL", ""),
        "api_key": os.getenv("OPENAI_API_KEY", ""),
        "model": os.getenv("OPENAI_MODEL", ""),
    },
}

LANGUAGES = {
    "en": {"name": "English", "speech": "en-IN"},
    "ta": {"name": "தமிழ்", "speech": "ta-IN"},
    "hi": {"name": "हिन्दी", "speech": "hi-IN"},
}
