#!/usr/bin/env python3
"""Print the dominant colours of one sprite cell (or a box inside it) with hue/lightness/saturation.

Usage: python3 -I .agents/skills/pet-form-sprites/scripts/palette.py <sheet.webp> <row> <col> [y0:y1,x0:x1] [--map]
Run from the repository root. Needs Pillow + numpy.

Use it to pick the hue/lightness bands that separate materials (hair vs outfit vs skin)
before writing classify() in a build script. Bands that overlap need spatial rules.
--map prints a character map of the box: '#' dark (l<0.3), 'w' white, '.' everything else
lit, so line art, eyes and brows can be located.
"""

import colorsys
import sys

import numpy as np
from PIL import Image

COLS, ROWS = 8, 9


def main():
    args = [a for a in sys.argv[1:] if a != "--map"]
    if len(args) < 3:
        sys.exit(__doc__)
    sheet = np.array(Image.open(args[0]).convert("RGBA"))
    ch, cw = sheet.shape[0] // ROWS, sheet.shape[1] // COLS
    row, col = int(args[1]), int(args[2])
    cell = sheet[row * ch : (row + 1) * ch, col * cw : (col + 1) * cw]
    if len(args) > 3:
        ys, xs = args[3].split(",")
        y0, y1 = (int(v) for v in ys.split(":"))
        x0, x1 = (int(v) for v in xs.split(":"))
        cell = cell[y0:y1, x0:x1]
    px = cell.reshape(-1, 4)
    px = px[px[:, 3] > 200][:, :3]
    q = (px // 16) * 16
    colours, counts = np.unique(q, axis=0, return_counts=True)
    print(f"cell {cw}x{ch}, box {cell.shape[1]}x{cell.shape[0]}, {len(px)} opaque px")
    for i in np.argsort(-counts)[:16]:
        r, g, b = (int(v) for v in colours[i])
        h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
        print(f"  #{r:02x}{g:02x}{b:02x}  {counts[i]:5d}  h={h * 360:5.1f} l={l:.2f} s={s:.2f}")
    if "--map" in sys.argv:
        for y in range(cell.shape[0]):
            line = ""
            for x in range(cell.shape[1]):
                r, g, b, a = (int(v) for v in cell[y, x])
                if a < 96:
                    line += " "
                    continue
                _, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
                line += "#" if l < 0.3 else "w" if l > 0.85 and s < 0.6 else "."
            print(f"{y:4d} {line}")


if __name__ == "__main__":
    main()
