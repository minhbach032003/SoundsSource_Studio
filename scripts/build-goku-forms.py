#!/usr/bin/env python3
"""Build the ten Son Goku form spritesheets from the Super Saiyan 1 source sheet.

Each form gets its own hair silhouette, hair/eyebrow/iris colours and skin tint,
derived per frame from the source art instead of a whole-image hue shift. The gi is
never recoloured. Auras are drawn at runtime by the renderer, not baked in.

Usage: python3 -I scripts/build-goku-forms.py [form-id ...]   (needs Pillow + numpy)
Writes public/pets/super-saiyan-goku/forms/<id>/{spritesheet.webp,avatar.png}
and forms/manifest.json (read by tests/pet-forms.test.mjs).
"""

import hashlib
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
PET_DIR = ROOT / "public" / "pets" / "super-saiyan-goku"
SOURCE = PET_DIR / "spritesheet.webp"
COLS, ROWS = 8, 9
CELL_W, CELL_H = 192, 208
AVATAR = 128

# Hair ramps run dark -> light; the source hair lightness is remapped onto them.
# Hex proposals come from docs/engineering/goku-form-sprite-redesign-research.md (3.3).
BLACK_HAIR = ["#06060a", "#121219", "#23232c", "#3a3f55"]
FORMS = {
    "base": {
        "hairShape": "base", "hair": BLACK_HAIR, "outline": "#000000",
        "iris": ["#0b0b0b", "#1c1c22"], "skin": None,
    },
    "kaioken": {
        "hairShape": "base", "hair": BLACK_HAIR, "outline": "#000000",
        "iris": ["#0b0b0b", "#1c1c22"], "skin": ("#ff4a3d", 0.45),
    },
    "ss1": {
        "hairShape": "ssj", "hair": ["#a8700c", "#c9951c", "#fde05a", "#fff3a6"], "outline": "#5a3a00",
        "iris": ["#1f8c7c", "#2fae9c"], "skin": None,
    },
    "ss2": {
        "hairShape": "ssj2", "hair": ["#b07a06", "#d19a12", "#ffe14d", "#fff6b8"], "outline": "#5a3a00",
        "iris": ["#1f8c7c", "#2fae9c"], "skin": None,
    },
    "ss3": {
        "hairShape": "ssj3", "hair": ["#964802", "#cf7808", "#ffd214", "#fff6a0"], "outline": "#381702",
        "iris": ["#0c6355", "#10b981"], "skin": None,
    },
    "god": {
        "hairShape": "lifted", "hair": ["#5e0820", "#8c0f2e", "#d4204a", "#ff6b85"], "outline": "#2a0010",
        "iris": ["#a3122b", "#e0304a"], "skin": None,
    },
    "ssblue": {
        "hairShape": "ssj", "hair": ["#0e5288", "#1679b8", "#34c6f0", "#a8ecff"], "outline": "#06284a",
        "iris": ["#0f5f9e", "#1f8fd6"], "skin": None,
    },
    "blue-kaioken": {
        "hairShape": "ssj", "hair": ["#0e5288", "#1679b8", "#34c6f0", "#a8ecff"], "outline": "#06284a",
        "iris": ["#0f5f9e", "#1f8fd6"], "skin": ("#ff6f7d", 0.32),
    },
    "ui-sign": {
        "hairShape": "base", "hair": BLACK_HAIR, "outline": "#000000",
        "iris": ["#7d8597", "#c7ccd8"], "skin": None,
    },
    "mui": {
        "hairShape": "lifted", "hair": ["#6d7588", "#9aa3b5", "#d9dde6", "#ffffff"], "outline": "#2c3140",
        "iris": ["#9aa3b5", "#e6e9f0"], "skin": None,
    },
}

# Vertical scale / horizontal scale applied to the hair above the hairline.
SHAPE_SCALE = {
    "base": (0.6, 1.14),
    "lifted": (0.76, 1.08),
    "ssj": (1.0, 1.0),
    "ssj2": (1.08, 0.97),
    "ssj3": (0.95, 1.05),
}


def hex_rgb(value):
    value = value.lstrip("#")
    return np.array([int(value[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


def hls_planes(rgb):
    """Vectorised colorsys.rgb_to_hls: returns (hue 0-1, lightness, saturation) planes."""
    c = rgb.astype(np.float32) / 255.0
    r, g, b = c[..., 0], c[..., 1], c[..., 2]
    mx, mn = c.max(axis=-1), c.min(axis=-1)
    light = (mx + mn) / 2
    delta = mx - mn
    safe = np.where(delta == 0, 1, delta)
    sat = np.where(delta == 0, 0, np.where(light <= 0.5, delta / np.maximum(mx + mn, 1e-6), delta / np.maximum(2 - mx - mn, 1e-6)))
    hue = np.where(mx == r, ((g - b) / safe) % 6, np.where(mx == g, (b - r) / safe + 2, (r - g) / safe + 4)) / 6
    hue = np.where(delta == 0, 0, hue)
    return [hue, light, sat]


def dilate(mask, steps=1):
    out = mask.copy()
    for _ in range(steps):
        grown = out.copy()
        grown[1:, :] |= out[:-1, :]
        grown[:-1, :] |= out[1:, :]
        grown[:, 1:] |= out[:, :-1]
        grown[:, :-1] |= out[:, 1:]
        out = grown
    return out


def drop_small_components(mask, min_size):
    """4-connected flood fill; removes stray gi pixels that share a hair hue."""
    seen = np.zeros_like(mask)
    keep = np.zeros_like(mask)
    h, w = mask.shape
    for y, x in zip(*np.nonzero(mask)):
        if seen[y, x]:
            continue
        stack, comp = [(y, x)], []
        seen[y, x] = True
        while stack:
            cy, cx = stack.pop()
            comp.append((cy, cx))
            for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((ny, nx))
        if len(comp) >= min_size:
            for cy, cx in comp:
                keep[cy, cx] = True
    return keep


def near_largest(mask, reach):
    """Keeps the largest component plus pieces within `reach` px of it."""
    if not mask.any():
        return mask
    seen = np.zeros_like(mask)
    best = None
    h, w = mask.shape
    for y, x in zip(*np.nonzero(mask)):
        if seen[y, x]:
            continue
        stack, comp = [(y, x)], []
        seen[y, x] = True
        while stack:
            cy, cx = stack.pop()
            comp.append((cy, cx))
            for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((ny, nx))
        if best is None or len(comp) > len(best):
            best = comp
    core = np.zeros_like(mask)
    for cy, cx in best:
        core[cy, cx] = True
    # Strands are split by inner line art, so chain outward piece by piece.
    while True:
        grown = mask & dilate(core, reach)
        if (grown == core).all():
            return core
        core = grown


def ramp_color(ramp, t):
    """Piecewise-linear lookup into a dark -> light ramp, t in [0, 1]."""
    stops = [hex_rgb(c) for c in ramp]
    t = np.clip(t, 0.0, 1.0) * (len(stops) - 1)
    lo = np.floor(t).astype(int)
    hi = np.minimum(lo + 1, len(stops) - 1)
    frac = (t - lo)[..., None]
    table = np.stack(stops)
    return table[lo] * (1 - frac) + table[hi] * frac


def classify(cell):
    rgb = cell[:, :, :3]
    alpha = cell[:, :, 3]
    hue, light, sat = hls_planes(rgb)
    hue = hue * 360
    opaque = alpha > 96
    hair = opaque & (sat > 0.35) & (light > 0.28) & (hue >= 37.5) & (hue <= 68)
    hair = drop_small_components(hair, 10)
    hair = near_largest(hair, 10)
    # Hair shadows share the gi's orange hue, so grow into them only from lit hair,
    # a few pixels at a time; the dark outline between hair and gi stops the growth.
    shadow = opaque & (sat > 0.5) & (hue >= 25) & (hue < 37.5) & (light > 0.3) & (light < 0.56)
    for _ in range(6):
        hair = hair | (shadow & dilate(hair, 1))
    iris = opaque & (sat > 0.25) & (hue >= 140) & (hue <= 205) & (light > 0.12) & (light < 0.8)
    skin = opaque & ~hair & (hue >= 8) & (hue <= 36) & (light > 0.62) & (sat > 0.25)
    dark = opaque & (light < 0.3)
    hair_outline = dark & dilate(hair, 1) & ~iris
    blue = drop_small_components(opaque & (sat > 0.4) & (light > 0.18) & (hue >= 200) & (hue <= 250), 12)
    return {"hair": hair, "iris": iris, "skin": skin, "blue": blue, "outline": hair_outline, "light": light, "opaque": opaque}


def head_metrics(cls):
    ys, xs = np.nonzero(cls["hair"])
    cx = float(np.median(xs))
    hair_top = int(ys.min())
    skin_ys, skin_xs = np.nonzero(cls["skin"])
    near = (np.abs(skin_xs - cx) <= 22) & (skin_ys > hair_top + 6)
    if near.any():
        hairline = int(skin_ys[near].min())
    else:
        hairline = int(hair_top + (ys.max() - hair_top) * 0.6)
    body_ys, body_xs = np.nonzero(cls["opaque"] & ~cls["hair"])
    return {
        "cx": cx,
        "hairline": hairline,
        "hair_top": hair_top,
        "hair_w": int(xs.max() - xs.min() + 1),
        "head": (float(xs.mean()), float(ys.mean())),
        "face_x": float(skin_xs[near].mean()) if near.any() else cx,
        "body": (float(body_xs.mean()), float(body_ys.mean())) if len(body_xs) else (cx, hairline + 60),
        "bottom": int(np.nonzero(cls["opaque"])[0].max()),
    }


def reshape_top_hair(cell, cls, m, vscale, hscale):
    """Scale the hair above the hairline about (cx, hairline); returns the new cell + hair mask."""
    if vscale == 1.0 and hscale == 1.0:
        return cell, cls["hair"].copy()
    h, w = cls["hair"].shape
    top = np.zeros((h, w), dtype=bool)
    top[: m["hairline"], :] = True
    # Everything around the hair above the hairline moves with it, including the
    # antialiased outer outline, so no ghost of the old silhouette is left behind.
    keep = dilate(cls["skin"] | cls["blue"], 2)
    movable = top & dilate(cls["hair"], 8) & (cell[:, :, 3] > 0) & ~keep & ~cls["iris"]
    out = cell.copy()
    out[movable] = 0
    hair = cls["hair"] & ~top
    cx, line = m["cx"], m["hairline"]
    for y in range(0, line):
        sy = int(round(line - (line - y) / vscale))
        if sy < 0 or sy >= line:
            continue
        for x in range(w):
            sx = int(round(cx + (x - cx) / hscale))
            if sx < 0 or sx >= w or not movable[sy, sx]:
                continue
            if out[y, x, 3] == 0:
                out[y, x] = cell[sy, sx]
                hair[y, x] = cls["hair"][sy, sx]
    return out, hair


def outline_mask(mask, canvas_alpha):
    return dilate(mask, 1) & ~mask & (canvas_alpha == 0)


def draw_polygon_mask(shape, points):
    img = Image.new("L", (shape[1], shape[0]), 0)
    ImageDraw.Draw(img).polygon([(float(x), float(y)) for x, y in points], fill=255)
    return np.array(img) > 0


def erode(mask, steps=1):
    return ~dilate(~mask, steps)


def draw_ss3_forehead_bangs(cx, line, form):
    """Forehead and bangs overlay for SSJ3:
    - Vầng trán cao nổi bật (prominent tall brow ridge)
    - Long iconic sharp bang curving down across forehead towards eye
    - Minor temple lock framing the face
    """
    fx = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
    f_draw = ImageDraw.Draw(fx)
    c_outline = tuple(hex_rgb(form["outline"]).astype(int)) + (255,)
    c_base = tuple(ramp_color(form["hair"], np.array([0.7]))[0].astype(int)) + (255,)
    c_mid = tuple(ramp_color(form["hair"], np.array([0.4]))[0].astype(int)) + (255,)
    c_hi = tuple(ramp_color(form["hair"], np.array([0.95]))[0].astype(int)) + (255,)

    # Long iconic SSJ3 bang curving down
    bang_pts = [
        (cx - 3, line - 6),
        (cx + 6, line - 4),
        (cx + 8, line + 8),
        (cx + 4, line + 22),
        (cx - 1, line + 28),  # sharp tip curving slightly inward
        (cx + 1, line + 16),
        (cx - 5, line + 6),
    ]
    f_draw.polygon(bang_pts, fill=c_base, outline=c_outline)
    f_draw.line([(cx + 4, line - 2), (cx + 6, line + 10), (cx + 2, line + 24)], fill=c_hi, width=2)
    f_draw.line([(cx - 3, line - 6), (cx - 5, line + 6)], fill=c_mid, width=2)

    # Minor temple bang on right
    temple_bang = [
        (cx + 12, line - 4),
        (cx + 20, line - 2),
        (cx + 24, line + 10),
        (cx + 22, line + 18),
        (cx + 16, line + 8),
    ]
    f_draw.polygon(temple_bang, fill=c_base, outline=c_outline)
    f_draw.line([(cx + 18, line - 1), (cx + 22, line + 10)], fill=c_hi, width=1)
    return np.array(fx)


def draw_ss3_mane(shape, m, form, row=0):
    """Waist-to-thigh cascading spiky mane matching official Banpresto figure reference:
    - Massive, dense, heavy curved cascade of hair flowing down behind neck, shoulders, and back to waist/thighs.
    - Symmetrical crescent-shaped chunky locks on each flank.
    - Deep warm amber-gold shadow backing, rich midtone, bright highlight ridges.
    - Dynamic aerodynamic sweeping locks for running rows (1 and 2).
    """
    hx, hy = m["head"]
    cx = m["cx"]
    fx = Image.new("RGBA", (shape[1], shape[0]), (0, 0, 0, 0))
    draw = ImageDraw.Draw(fx)

    c_outline = tuple(hex_rgb(form["outline"]).astype(int)) + (255,)
    c_shadow = tuple(ramp_color(form["hair"], np.array([0.05]))[0].astype(int)) + (255,)
    c_mid = tuple(ramp_color(form["hair"], np.array([0.40]))[0].astype(int)) + (255,)
    c_base = tuple(ramp_color(form["hair"], np.array([0.72]))[0].astype(int)) + (255,)
    c_hi = tuple(ramp_color(form["hair"], np.array([0.96]))[0].astype(int)) + (255,)

    if row in (1, 2):
        facing_right = (row == 1)
        sign = -1 if facing_right else 1
        ax = (hx - 10) if facing_right else (hx + 10)
        ay = hy - 4

        # Dynamic swept back mane for running
        bg_shadow = [
            (ax, ay + 6),
            (ax + sign * 38, ay - 20),
            (ax + sign * 75, ay - 14),
            (ax + sign * 95, ay - 5),
            (ax + sign * 80, ay + 12),
            (ax + sign * 105, ay + 24),
            (ax + sign * 82, ay + 40),
            (ax + sign * 110, ay + 56),
            (ax + sign * 85, ay + 72),
            (ax + sign * 100, ay + 92),
            (ax + sign * 72, ay + 105),
            (ax + sign * 82, ay + 125),
            (ax + sign * 48, ay + 128),
            (ax + sign * 56, ay + 148),
            (ax + sign * 24, ay + 125),
            (ax, ay + 70),
        ]
        draw.polygon(bg_shadow, fill=c_shadow, outline=c_outline)

        # Swept locks
        locks = [
            ([(ax, ay), (ax + sign * 40, ay - 18), (ax + sign * 72, ay - 12), (ax + sign * 92, ay - 4), (ax + sign * 65, ay + 8), (ax + sign * 32, ay + 12), (ax, ay + 18)],
             [(ax + sign * 20, ay - 4), (ax + sign * 50, ay - 5), (ax + sign * 82, ay - 2)]),
            ([(ax, ay + 18), (ax + sign * 42, ay + 12), (ax + sign * 78, ay + 18), (ax + sign * 102, ay + 25), (ax + sign * 72, ay + 42), (ax + sign * 38, ay + 38), (ax, ay + 34)],
             [(ax + sign * 22, ay + 16), (ax + sign * 58, ay + 22), (ax + sign * 92, ay + 25)]),
            ([(ax, ay + 34), (ax + sign * 45, ay + 36), (ax + sign * 80, ay + 50), (ax + sign * 106, ay + 58), (ax + sign * 75, ay + 74), (ax + sign * 40, ay + 70), (ax, ay + 54)],
             [(ax + sign * 22, ay + 42), (ax + sign * 60, ay + 52), (ax + sign * 96, ay + 58)]),
            ([(ax, ay + 54), (ax + sign * 42, ay + 70), (ax + sign * 72, ay + 86), (ax + sign * 96, ay + 94), (ax + sign * 65, ay + 108), (ax + sign * 34, ay + 100), (ax, ay + 74)],
             [(ax + sign * 22, ay + 72), (ax + sign * 55, ay + 86), (ax + sign * 86, ay + 92)]),
            ([(ax, ay + 74), (ax + sign * 36, ay + 100), (ax + sign * 56, ay + 122), (ax + sign * 76, ay + 128), (ax + sign * 46, ay + 136), (ax + sign * 22, ay + 120), (ax, ay + 92)],
             [(ax + sign * 18, ay + 96), (ax + sign * 42, ay + 116), (ax + sign * 68, ay + 125)]),
        ]
        for poly, spine in locks:
            draw.polygon(poly, fill=c_base, outline=c_outline)
            draw.line(spine, fill=c_hi, width=2)
            draw.line([poly[0], poly[-1]], fill=c_mid, width=2)
    else:
        # Front / idle / celebrate / working:
        # Massive, heavy, sweeping mane curving down behind back to waist & thighs
        cy = hy - 4

        # 1. Warm amber-gold shadow backing, tailored to the crescent lock contours
        bg_shadow = [
            (cx - 24, cy + 14),
            (cx - 52, cy + 28),
            (cx - 74, cy + 50),
            (cx - 84, cy + 74),
            (cx - 68, cy + 78),
            (cx - 82, cy + 98),
            (cx - 88, cy + 122),
            (cx - 70, cy + 124),
            (cx - 78, cy + 144),
            (cx - 80, cy + 162),
            (cx - 60, cy + 160),
            (cx - 58, cy + 178),
            (cx - 50, cy + 192),
            (cx - 36, cy + 182),
            (cx - 28, cy + 196),
            (cx - 14, cy + 184),
            (cx, cy + 198),
            (cx + 14, cy + 184),
            (cx + 28, cy + 196),
            (cx + 36, cy + 182),
            (cx + 50, cy + 192),
            (cx + 58, cy + 178),
            (cx + 60, cy + 160),
            (cx + 80, cy + 162),
            (cx + 78, cy + 144),
            (cx + 70, cy + 124),
            (cx + 88, cy + 122),
            (cx + 82, cy + 98),
            (cx + 68, cy + 78),
            (cx + 84, cy + 74),
            (cx + 74, cy + 50),
            (cx + 52, cy + 28),
            (cx + 24, cy + 14),
        ]
        draw.polygon(bg_shadow, fill=c_shadow, outline=c_outline)

        # 2. Chunky curved crescent locks on each flank (left and right)
        flank_locks = [
            # Lock 1: Trapezius/shoulder lock
            ([(cx - 22, cy + 18), (cx - 46, cy + 26), (cx - 70, cy + 48), (cx - 80, cy + 70), (cx - 62, cy + 68), (cx - 28, cy + 36)],
             [(cx - 35, cy + 28), (cx - 56, cy + 46), (cx - 72, cy + 64)]),
            # Lock 2: Upper arm/chest lock (thick, prominent)
            ([(cx - 26, cy + 40), (cx - 56, cy + 64), (cx - 78, cy + 92), (cx - 84, cy + 118), (cx - 64, cy + 110), (cx - 28, cy + 64)],
             [(cx - 40, cy + 58), (cx - 64, cy + 84), (cx - 76, cy + 108)]),
            # Lock 3: Waist lock (flowing down behind forearms/hands)
            ([(cx - 26, cy + 68), (cx - 54, cy + 100), (cx - 72, cy + 130), (cx - 76, cy + 156), (cx - 55, cy + 146), (cx - 24, cy + 98)],
             [(cx - 36, cy + 88), (cx - 58, cy + 120), (cx - 68, cy + 146)]),
            # Lock 4: Thigh lock (terminating at bottom near thighs)
            ([(cx - 24, cy + 100), (cx - 45, cy + 134), (cx - 54, cy + 164), (cx - 48, cy + 186), (cx - 32, cy + 170), (cx - 18, cy + 130)],
             [(cx - 28, cy + 122), (cx - 42, cy + 150), (cx - 44, cy + 174)]),
        ]

        for poly_l, spine_l in flank_locks:
            # Left lock
            draw.polygon(poly_l, fill=c_base, outline=c_outline)
            draw.line([poly_l[0], poly_l[1]], fill=c_mid, width=2)
            draw.line(spine_l, fill=c_hi, width=2)

            # Symmetrical right lock
            poly_r = [(2 * cx - x, y) for (x, y) in poly_l]
            spine_r = [(2 * cx - x, y) for (x, y) in spine_l]
            draw.polygon(poly_r, fill=c_base, outline=c_outline)
            draw.line([poly_r[0], poly_r[1]], fill=c_mid, width=2)
            draw.line(spine_r, fill=c_hi, width=2)

        # Center cascading tips visible between the legs down to waist/knees
        center_tips = [
            ([(cx - 18, cy + 116), (cx - 20, cy + 156), (cx - 14, cy + 188), (cx - 7, cy + 162), (cx - 9, cy + 126)],
             [(cx - 15, cy + 136), (cx - 16, cy + 164), (cx - 13, cy + 182)]),
            ([(cx - 7, cy + 126), (cx - 3, cy + 170), (cx, cy + 196), (cx + 3, cy + 170), (cx + 7, cy + 126)],
             [(cx, cy + 136), (cx, cy + 166), (cx, cy + 190)]),
            ([(cx + 9, cy + 126), (cx + 7, cy + 162), (cx + 14, cy + 188), (cx + 20, cy + 156), (cx + 18, cy + 116)],
             [(cx + 13, cy + 136), (cx + 16, cy + 164), (cx + 15, cy + 182)]),
        ]
        for poly_c, spine_c in center_tips:
            draw.polygon(poly_c, fill=c_base, outline=c_outline)
            draw.line(spine_c, fill=c_hi, width=2)

    return np.array(fx)


def ssj2_bang(shape, m):
    cx, line = m["cx"], m["hairline"]
    pts = [(cx - 1, line - 3), (cx + 4, line - 2), (cx + 1, line + 6), (cx - 3, line + 13), (cx - 4, line + 6)]
    return draw_polygon_mask(shape, pts)


def recolor(cell, cls, hair_mask, form):
    out = cell.astype(np.float32)
    light = cls["light"]
    if hair_mask.any():
        lo, hi = 0.3, 0.9
        t = (light - lo) / (hi - lo)
        out[hair_mask, :3] = ramp_color(form["hair"], t)[hair_mask]
    out[cls["outline"], :3] = hex_rgb(form["outline"])
    iris = cls["iris"]
    if iris.any():
        t = (light - 0.25) / 0.4
        out[iris, :3] = ramp_color(form["iris"], t)[iris]
    if form["skin"]:
        tint, amount = form["skin"]
        skin = cls["skin"]
        out[skin, :3] = out[skin, :3] * (1 - amount) + hex_rgb(tint) * amount
    return np.clip(out, 0, 255).astype(np.uint8)


def remove_brows(out, cls):
    """Super Saiyan 3 has no eyebrows: paint the dark brow strokes over with skin shadow."""
    ys, xs = np.nonzero(cls["iris"])
    if len(ys) < 6:
        return
    top, x0, x1 = ys.min(), xs.min(), xs.max()
    hue, light, sat = hls_planes(out[:, :, :3])
    white = (light > 0.85) & (sat < 0.6)
    band = np.zeros_like(cls["iris"])
    band[max(0, top - 4) : top + 5, max(0, x0 - 2) : x1 + 3] = True
    brows = band & (light < 0.3) & (out[:, :, 3] > 96) & ~dilate(white | cls["iris"], 1) & ~dilate(cls["hair"], 1)
    fill_px = band & ~brows & (light >= 0.3) & ~white & ~cls["iris"] & (out[:, :, 3] > 96)
    if not brows.any() or not fill_px.any():
        return
    out[brows, :3] = np.median(out[fill_px, :3], axis=0).astype(np.uint8)


def apply_form_outfit(out, cls, m, form_id, row=0):
    """Apply canon dogi / outfit variations per evolution form."""
    cx, line = int(m["cx"]), int(m["hairline"])
    facing_left = (row == 2)
    # Patch x-offset depending on facing direction
    patch_x = cx + (16 if facing_left else -18)
    patch_y = line + 56

    if form_id == "base":
        # Kame Kanji patch on chest
        fx = Image.fromarray(out)
        draw = ImageDraw.Draw(fx)
        draw.ellipse([patch_x - 6, patch_y - 6, patch_x + 6, patch_y + 6], fill=(255, 255, 255, 255), outline=(0, 0, 0, 255))
        draw.text((patch_x - 4, patch_y - 7), "亀", fill=(0, 0, 0, 255))
        return np.array(fx)

    elif form_id == "kaioken":
        # Kaio Kanji patch on chest
        fx = Image.fromarray(out)
        draw = ImageDraw.Draw(fx)
        draw.ellipse([patch_x - 6, patch_y - 6, patch_x + 6, patch_y + 6], fill=(255, 255, 255, 255), outline=(120, 0, 0, 255))
        draw.text((patch_x - 4, patch_y - 7), "界", fill=(120, 0, 0, 255))
        return np.array(fx)

    elif form_id in ("ssblue", "blue-kaioken"):
        # Whis Gi: Whis signature swirl on left chest
        fx = Image.fromarray(out)
        draw = ImageDraw.Draw(fx)
        c_pen = (60, 0, 0, 255) if form_id == "blue-kaioken" else (0, 0, 0, 255)
        draw.arc([patch_x - 5, patch_y - 6, patch_x + 5, patch_y + 4], start=0, end=270, fill=c_pen, width=2)
        draw.line([(patch_x - 1, patch_y + 4), (patch_x - 1, patch_y + 8)], fill=c_pen, width=2)
        return np.array(fx)

    elif form_id == "ui-sign":
        # Tournament of Power: Ripped orange gi showing navy blue undershirt
        chest_mask = (np.arange(CELL_H)[:, None] > line + 45) & (np.arange(CELL_H)[:, None] < line + 85) & (np.abs(np.arange(CELL_W)[None, :] - cx) < 26)
        orange_chest = cls["opaque"] & chest_mask & (out[:, :, 0] > 140) & (out[:, :, 1] > 80) & (out[:, :, 2] < 60)
        out[orange_chest, 0] = np.clip(out[orange_chest, 0] * 0.15, 10, 45).astype(np.uint8)
        out[orange_chest, 1] = np.clip(out[orange_chest, 1] * 0.25, 20, 75).astype(np.uint8)
        out[orange_chest, 2] = np.clip(out[orange_chest, 2] * 0.90 + 90, 80, 175).astype(np.uint8)
        return out

    elif form_id == "mui":
        # Mastered Ultra Instinct: Shirtless / cởi trần chiến đấu với cơ bắp và vết xước
        torso_mask = (np.arange(CELL_H)[:, None] > line + 40) & (np.arange(CELL_H)[:, None] < line + 92) & (np.abs(np.arange(CELL_W)[None, :] - cx) < 32)
        shirt_torso = cls["opaque"] & torso_mask & ~cls["skin"] & ~cls["hair"]
        skin_rgb = out[cls["skin"], :3]
        if len(skin_rgb) > 0:
            skin_mean = skin_rgb.mean(axis=0)
            light_factor = np.clip(out[shirt_torso, :3].mean(axis=-1) / 200.0, 0.7, 1.2)[..., None]
            out[shirt_torso, :3] = np.clip(skin_mean * light_factor, 0, 255).astype(np.uint8)
        fx = Image.fromarray(out)
        draw = ImageDraw.Draw(fx)
        draw.line([(cx - 15, line + 55), (cx - 5, line + 62)], fill=(150, 40, 30, 255), width=2)
        draw.line([(cx + 8, line + 60), (cx + 18, line + 70)], fill=(150, 40, 30, 255), width=2)
        return np.array(fx)

    return out


def build_cell(cell, form, form_id="base", row=0):
    if (cell[:, :, 3] > 0).sum() == 0:
        return cell
    cls = classify(cell)
    if not cls["hair"].any():
        return cell
    m = head_metrics(cls)
    vscale, hscale = SHAPE_SCALE[form["hairShape"]]
    shaped, hair = reshape_top_hair(cell, cls, m, vscale, hscale)
    # Re-run light/outline on the reshaped pixels so recolouring follows the moved hair.
    moved = dict(cls)
    rgb_light = hls_planes(shaped[:, :, :3])[1]
    moved["light"] = rgb_light
    moved["outline"] = (cls["outline"] & ~(np.arange(cell.shape[0])[:, None] < m["hairline"])) | (
        (shaped[:, :, 3] > 96) & (rgb_light < 0.3) & dilate(hair, 1) & ~hair
    )
    out = recolor(shaped, moved, hair, form)
    hair_rgb = lambda t: ramp_color(form["hair"], t)

    if form["hairShape"] == "ssj2":
        bang = ssj2_bang(hair.shape, m)
        out[bang, :3] = hair_rgb(np.full(hair.shape, 0.7))[bang]
        out[bang, 3] = 255
        edge = dilate(bang, 1) & ~bang & ~hair
        out[edge, :3] = hex_rgb(form["outline"])
        out[edge, 3] = 255
        hair = hair | bang

    # Close outline gaps left by nearest-neighbour scaling.
    if SHAPE_SCALE[form["hairShape"]] != (1.0, 1.0):
        gap = outline_mask(hair, out[:, :, 3])
        out[gap, :3] = hex_rgb(form["outline"])
        out[gap, 3] = 255

    if form["hairShape"] == "ssj3":
        remove_brows(out, cls)
        mane_arr = draw_ss3_mane(hair.shape, m, form, row=row)
        behind = (mane_arr[:, :, 3] > 0) & (out[:, :, 3] == 0)
        out[behind] = mane_arr[behind]
        # Forehead & bangs overlay in front of face
        bangs_arr = draw_ss3_forehead_bangs(m["cx"], m["hairline"], form)
        front = bangs_arr[:, :, 3] > 0
        out[front] = bangs_arr[front]

    # Apply canon outfit variations
    out = apply_form_outfit(out, cls, m, form_id, row=row)
    return out


def avatar_from(cell):
    ys, xs = np.nonzero(cell[:, :, 3] > 0)
    if len(ys) == 0 or len(xs) == 0:
        return Image.new("RGBA", (AVATAR, AVATAR), (0, 0, 0, 0))
    crop = Image.fromarray(cell[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1])
    # 12px breathing room on each side ensures full silhouette and SSJ3 mane
    # are completely visible without edge clipping in cards or rounded popovers
    max_dim = AVATAR - 24
    scale = min(max_dim / crop.width, max_dim / crop.height)
    new_w = max(1, round(crop.width * scale))
    new_h = max(1, round(crop.height * scale))
    crop = crop.resize((new_w, new_h), Image.LANCZOS)
    canvas = Image.new("RGBA", (AVATAR, AVATAR), (0, 0, 0, 0))
    ox = (AVATAR - new_w) // 2
    oy = (AVATAR - new_h) // 2
    canvas.alpha_composite(crop, (ox, oy))
    return canvas


def main():
    sheet = np.array(Image.open(SOURCE).convert("RGBA"))
    assert sheet.shape[:2] == (ROWS * CELL_H, COLS * CELL_W), sheet.shape
    manifest_path = PET_DIR / "forms" / "manifest.json"
    previous = json.loads(manifest_path.read_text())["forms"] if manifest_path.exists() else {}
    manifest = {"source": "spritesheet.webp", "cell": [CELL_W, CELL_H], "grid": [COLS, ROWS], "forms": {}}
    only = set(sys.argv[1:])
    for form_id, form in FORMS.items():
        if only and form_id not in only:
            if form_id in previous:
                manifest["forms"][form_id] = previous[form_id]
            continue
        out = sheet.copy()
        for r in range(ROWS):
            for c in range(COLS):
                y0, x0 = r * CELL_H, c * CELL_W
                cell = sheet[y0 : y0 + CELL_H, x0 : x0 + CELL_W]
                out[y0 : y0 + CELL_H, x0 : x0 + CELL_W] = build_cell(cell, form, form_id=form_id, row=r)
        target = PET_DIR / "forms" / form_id
        target.mkdir(parents=True, exist_ok=True)
        Image.fromarray(out).save(target / "spritesheet.webp", quality=92, alpha_quality=100, method=6)
        avatar_from(out[0:CELL_H, 0:CELL_W]).save(target / "avatar.png", optimize=True)
        alpha = (out[:, :, 3] > 0).astype(np.uint8)
        manifest["forms"][form_id] = {
            "hairShape": form["hairShape"],
            "hair": form["hair"],
            "iris": form["iris"],
            "skinTint": form["skin"][0] if form["skin"] else None,
            "browsVisible": form["hairShape"] != "ssj3",
            "alphaHash": hashlib.sha1(alpha.tobytes()).hexdigest()[:16],
            "opaquePixels": int(alpha.sum()),
        }
        print(f"{form_id}: {manifest['forms'][form_id]['opaquePixels']} px")
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
