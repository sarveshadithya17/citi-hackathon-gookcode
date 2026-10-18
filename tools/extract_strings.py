"""Collect every t('key', 'English') string in the frontend into locales/en.json.

Translators (or the translate script) then produce locales/<lang>.json with the same keys.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PATTERN = re.compile(r"""\bt\(\s*'([\w.]+)'\s*,\s*'((?:[^'\\]|\\.)*)'""")


def main() -> None:
    strings = {}
    src = ROOT / "frontend" / "src"
    for js in sorted([*src.rglob("*.js"), *src.rglob("*.jsx")]):
        for key, text in PATTERN.findall(js.read_text(encoding="utf-8")):
            text = text.replace("\\'", "'")
            if key in strings and strings[key] != text:
                print(f"warning: {key} has two texts: {strings[key]!r} / {text!r}")
            strings.setdefault(key, text)
    out = ROOT / "frontend" / "public" / "locales" / "en.json"
    out.write_text(json.dumps(dict(sorted(strings.items())), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{len(strings)} strings -> {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
