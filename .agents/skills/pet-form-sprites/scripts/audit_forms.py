#!/usr/bin/env python3
"""Audit a pet's evolution-form sheets: are they real redesigns or recolours of one sprite?

Usage: python3 -I .agents/skills/pet-form-sprites/scripts/audit_forms.py <slug>
Run from the repository root. Needs Pillow + numpy.

For each public/pets/<slug>/forms/<id>/spritesheet.webp it prints how many alpha-mask
pixels differ from the root sheet, the opaque pixel count, and the six dominant colours.
"TINT-ONLY" means the form shares the root silhouette exactly: same shape, new colours.
"""

import colorsys
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def dominant(rgba, n=6):
    px = rgba.reshape(-1, 4)
    px = px[px[:, 3] > 200][:, :3]
    q = (px // 16) * 16
    colours, counts = np.unique(q, axis=0, return_counts=True)
    out = []
    for i in np.argsort(-counts)[:n]:
        r, g, b = (int(v) for v in colours[i])
        h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
        out.append(f"#{r:02x}{g:02x}{b:02x}(h{h * 360:.0f} l{l:.2f})")
    return " ".join(out)


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    pet = Path("public/pets") / sys.argv[1]
    root_path = pet / "spritesheet.webp"
    if not root_path.exists():
        sys.exit(f"missing {root_path}; run from the repository root")
    root = np.array(Image.open(root_path).convert("RGBA"))
    root_mask = root[:, :, 3] > 0
    print(f"root {root.shape[1]}x{root.shape[0]}  opaque={int(root_mask.sum())}")
    print(f"  {dominant(root)}")
    forms = sorted(p for p in (pet / "forms").glob("*/spritesheet.webp"))
    if not forms:
        print("no forms/ directory")
        return
    tint_only = 0
    for path in forms:
        sheet = np.array(Image.open(path).convert("RGBA"))
        if sheet.shape != root.shape:
            print(f"{path.parent.name}: size {sheet.shape[1]}x{sheet.shape[0]} differs from root")
            continue
        mask = sheet[:, :, 3] > 0
        diff = int((mask != root_mask).sum())
        flag = "TINT-ONLY" if diff == 0 else "reshaped"
        tint_only += diff == 0
        print(f"{path.parent.name}: {flag}  mask-diff={diff}  opaque={int(mask.sum())}")
        print(f"  {dominant(sheet)}")
    print(f"\n{tint_only}/{len(forms)} forms share the root silhouette exactly")


if __name__ == "__main__":
    main()
