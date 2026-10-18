"""Draft locales/<lang>.json from en.json with the configured LLM (a native speaker should review).

Usage: python tools/translate_locales.py ta hi
Only missing keys are translated, so manual corrections are kept.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from backend.app.ai import llm  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
LOCALES = ROOT / "frontend" / "locales"
NAMES = {"ta": "Tamil", "hi": "Hindi"}


def translate(batch: dict, lang: str) -> dict:
    prompt = (
        f"Translate the values of this JSON object from English to simple, spoken {NAMES[lang]} in its own script, "
        "for a phone app used by rural school students aged 13-20 and their teachers. Keep it short and friendly. "
        "Keep {placeholders} exactly as they are. Keep emoji, numbers, ₹ amounts and the words NAPS, CSR, PIN, QR, UPI. "
        "Brand name 'Thiran' is 'திறன்' in Tamil and 'थिरन' in Hindi. Return only the JSON object with the same keys."
    )
    out = llm.chat_json([{"role": "system", "content": prompt},
                         {"role": "user", "content": json.dumps(batch, ensure_ascii=False)}],
                        temperature=0.2, max_tokens=8000, cache=False)
    return {k: v for k, v in (out or {}).items() if k in batch and isinstance(v, str)}


def main(langs: list[str]) -> None:
    en = json.loads((LOCALES / "en.json").read_text(encoding="utf-8"))
    for lang in langs:
        path = LOCALES / f"{lang}.json"
        cur = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
        todo = {k: v for k, v in en.items() if k not in cur}
        keys = list(todo)
        for i in range(0, len(keys), 40):
            batch = {k: todo[k] for k in keys[i:i + 40]}
            got = translate(batch, lang)
            cur.update(got)
            print(f"{lang}: {len(got)}/{len(batch)}")
        path.write_text(json.dumps(dict(sorted(cur.items())), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1:] or ["ta", "hi"])
