#!/usr/bin/env python3
"""Render a contact sheet: one column per form, one row per chosen sprite cell.

Usage: python3 -I .agents/skills/pet-form-sprites/scripts/preview.py <slug> <out.png> [scale] [row,col ...]
Run from the repository root. Needs Pillow. Defaults: scale 0.75, cells 0,0 1,2 3,1 5,4
(idle, run, wave, lying down: the poses where hair reshaping breaks first).

Form order follows the folders listed in forms/manifest.json when present, else alphabetical.
Write the PNG to a scratch directory and look at it before shipping any regenerated sheet.
"""

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

COLS, ROWS = 8, 9


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    pet = Path("public/pets") / sys.argv[1]
    out_path = Path(sys.argv[2])
    scale = float(sys.argv[3]) if len(sys.argv) > 3 else 0.75
    cells = [tuple(int(v) for v in a.split(",")) for a in sys.argv[4:]] or [(0, 0), (1, 2), (3, 1), (5, 4)]
    manifest = pet / "forms" / "manifest.json"
    if manifest.exists():
        forms = list(json.loads(manifest.read_text())["forms"])
    else:
        forms = sorted(p.name for p in (pet / "forms").iterdir() if (p / "spritesheet.webp").exists())
    first = Image.open(pet / "forms" / forms[0] / "spritesheet.webp")
    cw, ch = first.width // COLS, first.height // ROWS
    label = 14
    sheet = Image.new("RGBA", (cw * len(forms), ch * len(cells) + label), (170, 180, 190, 255))
    draw = ImageDraw.Draw(sheet)
    for i, form in enumerate(forms):
        src = Image.open(pet / "forms" / form / "spritesheet.webp").convert("RGBA")
        draw.text((i * cw + 4, 1), form, fill=(20, 20, 30, 255))
        for j, (r, c) in enumerate(cells):
            sheet.alpha_composite(src.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch)), (i * cw, label + j * ch))
    sheet = sheet.resize((int(sheet.width * scale), int(sheet.height * scale)), Image.NEAREST)
    sheet.save(out_path)
    print(f"wrote {out_path} ({sheet.width}x{sheet.height})")


if __name__ == "__main__":
    main()
