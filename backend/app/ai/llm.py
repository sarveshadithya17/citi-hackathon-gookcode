"""Provider-agnostic LLM client.

Every provider is reached through the OpenAI-compatible chat completions API
(Gemini, Groq, Ollama and most hosted models offer one), so switching provider
is a change to LLM_PROVIDERS in .env, not to code. Providers are tried in order;
if all fail, callers get None and use their rule-based fallback.
"""
import hashlib
import json
import logging
import re
import time

import httpx

from ..config import LLM_PROVIDERS, LLM_TIMEOUT, PROVIDERS

log = logging.getLogger("thiran.llm")

_cache: dict[str, tuple[float, str]] = {}
_CACHE_TTL = 3600
_cooldown: dict[str, float] = {}  # provider -> time until which it is skipped


def _available() -> list[str]:
    names = []
    for name in LLM_PROVIDERS:
        if name == "none":
            return []
        cfg = PROVIDERS.get(name)
        if not cfg or not cfg.get("base_url") or not cfg.get("model"):
            continue
        if not cfg.get("api_key") and not cfg.get("optional"):
            continue
        if _cooldown.get(name, 0) > time.time():
            continue
        names.append(name)
    return names


def status() -> dict:
    return {"providers": _available(), "configured": LLM_PROVIDERS}


def chat(messages: list[dict], *, json_mode: bool = False, temperature: float = 0.4,
         max_tokens: int = 1200, cache: bool = True) -> str | None:
    key = hashlib.sha256(json.dumps([messages, json_mode, temperature], ensure_ascii=False).encode()).hexdigest()
    if cache and key in _cache and _cache[key][0] > time.time():
        return _cache[key][1]

    attempts = []
    for name in _available():
        cfg = PROVIDERS[name]
        attempts.append((name, cfg, cfg["model"], cfg.get("extra", {})))
        if cfg.get("fallback_model"):
            attempts.append((name, cfg, cfg["fallback_model"], cfg.get("fallback_extra", {})))
    for name, cfg, model, extra in attempts:
        if _cooldown.get(name + model, 0) > time.time():
            continue
        body = {"model": model, "messages": messages, "temperature": temperature,
                "max_tokens": max_tokens, **extra}
        if json_mode:
            body["response_format"] = {"type": "json_object"}
        try:
            timeout = 4 if cfg.get("optional") else LLM_TIMEOUT
            r = httpx.post(f"{cfg['base_url'].rstrip('/')}/chat/completions",
                           headers={"Authorization": f"Bearer {cfg['api_key']}"},
                           json=body, timeout=timeout)
            if r.status_code == 429 or r.status_code >= 500 or r.status_code == 404:
                _cooldown[name + model] = time.time() + (600 if r.status_code == 404 else 30)
                log.warning("LLM %s/%s returned %s, trying next", name, model, r.status_code)
                continue
            r.raise_for_status()
            text = r.json()["choices"][0]["message"]["content"] or ""
            if cache:
                _cache[key] = (time.time() + _CACHE_TTL, text)
            return text
        except (httpx.HTTPError, KeyError, IndexError, ValueError) as e:
            log.warning("LLM %s/%s failed: %s", name, model, type(e).__name__)
            if cfg.get("optional"):
                _cooldown[name] = time.time() + 300
            continue
    return None


def chat_json(messages: list[dict], **kw) -> dict | None:
    text = chat(messages, json_mode=True, **kw)
    if text is None:
        return None
    return parse_json(text)


def parse_json(text: str) -> dict | None:
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    if fence:
        text = fence.group(1)
    try:
        val = json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end <= start:
            return None
        try:
            val = json.loads(text[start:end + 1])
        except json.JSONDecodeError:
            return None
    return val if isinstance(val, dict) else None


LANG_NAMES = {"en": "English", "ta": "Tamil", "hi": "Hindi"}


def lang_instruction(lang: str) -> str:
    name = LANG_NAMES.get(lang, "English")
    if lang == "en":
        return "Write in very simple English (a 14-year-old rural student should understand)."
    return (f"Write in simple, spoken {name} using {name} script, the way a friendly teacher talks to "
            f"a 14-year-old in a village. Keep common English words like 'course' or 'exam' if they are "
            f"more familiar.")
