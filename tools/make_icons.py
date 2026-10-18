"""Render the Thiran "Voice Sprout" logo into the app's icon files.

Usage: python tools/make_icons.py   (needs: pip install cairosvg)
"""
from pathlib import Path

import cairosvg

ICONS = Path(__file__).resolve().parent.parent / "frontend" / "public" / "icons"

# The glyph: a speech bubble with a sprout inside (talk to Thiran, grow your skills).
GLYPH = """
<path d="M24 20h52a10 10 0 0 1 10 10v30a10 10 0 0 1-10 10H46l-14 12V70h-8a10 10 0 0 1-10-10V30a10 10 0 0 1 10-10z" fill="#fdf3e3"/>
<path d="M50 62V44" fill="none" stroke="#0f766e" stroke-width="5" stroke-linecap="round"/>
<path d="M50 51c-10 0-16-6-16-15 10 0 16 6 16 15z" fill="#0f766e"/>
<path d="M50 46c0-10 7-16 17-16 0 10-7 16-17 16z" fill="#fb923c"/>
"""

ROUNDED = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="24" fill="#0f766e"/>{GLYPH}</svg>'
# Maskable: full-bleed background, glyph inside the 80% safe zone.
MASKABLE = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#0f766e"/>'
            f'<g transform="translate(14 13) scale(0.72)">{GLYPH}</g></svg>')


def main() -> None:
    (ICONS / "icon.svg").write_text(ROUNDED + "\n")
    # New file names for the tab icon, because browsers cache favicons by URL for a long time.
    (ICONS / "thiran-logo.svg").write_text(ROUNDED + "\n")
    cairosvg.svg2png(bytestring=ROUNDED.encode(), write_to=str(ICONS / "thiran-logo-32.png"),
                     output_width=32, output_height=32)
    for size in (192, 512):
        cairosvg.svg2png(bytestring=ROUNDED.encode(), write_to=str(ICONS / f"icon-{size}.png"),
                         output_width=size, output_height=size)
    cairosvg.svg2png(bytestring=MASKABLE.encode(), write_to=str(ICONS / "maskable-512.png"),
                     output_width=512, output_height=512)
    print("icons written to", ICONS)


if __name__ == "__main__":
    main()
