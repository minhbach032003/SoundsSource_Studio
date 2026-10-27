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
        "hairShape": "ssj3", "hair": ["#946a05", "#b8860b", "#f5c842", "#fff0a0"], "outline": "#4f3300",
        "iris": ["#1f8c7c", "#2fae9c"], "skin": None,
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
    "ssj3": (1.06, 1.02),
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


def ssj3_mane(shape, m):
    """Waist-length mane hanging from the back of the head toward the body.

    Returns the mask and a 0-1 shade plane: dark rim, mid body, a few lit strands.
    """
    hx, hy = m["head"]
    bx, by = m["body"]
    dx, dy = bx - hx, by - hy
    # When running, the face leads the hair: let the mane trail behind the head.
    lead = m["face_x"] - hx
    if abs(lead) > 12:
        dx -= math.copysign(0.7 * math.hypot(dx, dy), lead)
    norm = math.hypot(dx, dy) or 1.0
    dx, dy = dx / norm, dy / norm
    nx, ny = -dy, dx
    width = m["hair_w"] * 0.92
    length = max(56.0, (m["bottom"] - m["hair_top"]) * 0.56)
    ox, oy = hx, hy

    def at(along, across):
        return (ox + dx * along + nx * across, oy + dy * along + ny * across)

    # Clockwise outline: one flank with outward spikes, a row of tips, the other flank.
    left = [at(0, -width * 0.5)]
    # Flank locks point down and only slightly outward, like hair falling down the back.
    for k, a in enumerate((0.2, 0.4, 0.6)):
        spread = width * (0.52 + 0.08 * k)
        left += [at(length * (a - 0.08), -spread), at(length * (a + 0.09), -spread - 7), at(length * a, -spread + 3)]
    tips = []
    span = width * 1.1
    count = 5
    for i in range(count):
        l = -span / 2 + span * i / count
        r = l + span / count
        tip = length * (1.0 if i in (1, 3) else 0.94 if i == 2 else 0.86)
        tips += [at(length * 0.8, l), at(tip, (l + r) / 2 + 3)]
    tips.append(at(length * 0.8, span / 2))
    right = []
    for x, y in reversed(left):
        a = (x - ox) * dx + (y - oy) * dy
        c = (x - ox) * nx + (y - oy) * ny
        right.append(at(a, -c))
    mask = draw_polygon_mask(shape, left + tips + right)
    ys, xs = np.mgrid[0 : shape[0], 0 : shape[1]]
    along = (xs - ox) * dx + (ys - oy) * dy
    across = (xs - ox) * nx + (ys - oy) * ny
    shade = np.full(shape, 0.74, dtype=np.float32)
    strands = (np.abs(((across + 3) % 11) - 5.5) < 1.1) & (along > 8)
    shade[strands] = 0.92
    shade -= 0.2 * np.clip(along / length, 0, 1)
    rim = mask & ~erode(mask, 2)
    shade[rim] = 0.36
    return mask, np.clip(shade, 0.05, 0.95)


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


def build_cell(cell, form):
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
        mane, shade = ssj3_mane(hair.shape, m)
        behind = mane & (out[:, :, 3] == 0)
        mane_rgb = hair_rgb(shade)
        out[behind, :3] = mane_rgb[behind]
        out[behind, 3] = 255
        rim = dilate(mane | (out[:, :, 3] > 0), 1) & (out[:, :, 3] == 0) & dilate(behind, 1)
        out[rim, :3] = hex_rgb(form["outline"])
        out[rim, 3] = 255
    return out


def avatar_from(cell):
    ys, xs = np.nonzero(cell[:, :, 3] > 0)
    crop = Image.fromarray(cell[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1])
    scale = min((AVATAR - 2) / crop.width, (AVATAR - 2) / crop.height)
    crop = crop.resize((max(1, round(crop.width * scale)), max(1, round(crop.height * scale))), Image.LANCZOS)
    canvas = Image.new("RGBA", (AVATAR, AVATAR), (0, 0, 0, 0))
    canvas.alpha_composite(crop, ((AVATAR - crop.width) // 2, AVATAR - 1 - crop.height))
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
                out[y0 : y0 + CELL_H, x0 : x0 + CELL_W] = build_cell(cell, form)
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
