#!/usr/bin/env python3
"""Build the ten Pikachu evolution form spritesheets with authentic Pokémon canon traits.

Adheres strictly to Pokémon character canon aesthetics and pet-form-sprites standards:
- 10 Authentic Evolution Forms:
  * pichu: Baby Pichu shape (diamond ears, black collar bib, pink cheeks, tiny tail, pale yellow fur).
  * classic: Chubby Gen 1 pear-shaped Chonkachu silhouette expansion, retro cream fur, dorsal stripes.
  * original-cap: Ash's classic Kanto/Johto cap with green Expo crest.
  * hoenn-cap: Ash's AG cap (black crown, red band, green Pokéball arc).
  * kalos-cap: Ash's XY cap (red crown, white front, red visor).
  * alola-cap: Ash's SM cap (blue/red front emblem).
  * raichu: Kanto Raichu (warm amber fur, yellow cheeks, white belly, curled ears, long wire tail + bolt).
  * alolan-raichu: Alolan Raichu (golden caramel fur, psychic blue eyes, rounded ears, wide surfing tail).
  * gigantamax: Colossal Chonkachu body, towering skyward lightning tail, swirling red Dynamax clouds.
  * ash-cap: Ash's World Champion Cap with victory emblem.

Usage: python3 -I scripts/build-pikachu-forms.py [form-id ...]
Writes public/pets/pikachu/forms/<id>/{spritesheet.webp,avatar.png}
and forms/manifest.json.
"""

import hashlib
import json
import math
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
PET_DIR = ROOT / "public" / "pets" / "pikachu"
SOURCE = PET_DIR / "spritesheet.webp"
COLS, ROWS = 8, 9
CELL_W, CELL_H = 192, 208
AVATAR = 128

FORMS = {
    "pichu": {
        "shapeKey": "pichu",
        "name": "Pichu Spark",
        "fur": ["#cfae25", "#ecd757", "#fdf192", "#fffde0"],
        "cheeks": ["#b52a46", "#db4d68", "#f78398", "#ffccd5"],
    },
    "classic": {
        "shapeKey": "classic",
        "name": "Pikachu Classic 1996",
        "fur": ["#b88e1a", "#dfb83b", "#f9e066", "#fff4b3"],
        "cheeks": ["#b51515", "#db2424", "#f74a4a", "#ff9494"],
    },
    "original-cap": {
        "shapeKey": "cap",
        "name": "Original Cap Pikachu",
        "fur": ["#b37a08", "#e6a312", "#ffd700", "#fff28f"],
        "cheeks": ["#b51515", "#db2424", "#f74a4a", "#ff9494"],
        "capId": "original-cap",
    },
    "hoenn-cap": {
        "shapeKey": "cap",
        "name": "Hoenn Cap Pikachu",
        "fur": ["#b37a08", "#e6a312", "#ffd700", "#fff28f"],
        "cheeks": ["#b51515", "#db2424", "#f74a4a", "#ff9494"],
        "capId": "hoenn-cap",
    },
    "kalos-cap": {
        "shapeKey": "cap",
        "name": "Kalos Cap Pikachu",
        "fur": ["#b37a08", "#e6a312", "#ffd700", "#fff28f"],
        "cheeks": ["#b51515", "#db2424", "#f74a4a", "#ff9494"],
        "capId": "kalos-cap",
    },
    "alola-cap": {
        "shapeKey": "cap",
        "name": "Alola Cap Pikachu",
        "fur": ["#b37a08", "#e6a312", "#ffd700", "#fff28f"],
        "cheeks": ["#b51515", "#db2424", "#f74a4a", "#ff9494"],
        "capId": "alola-cap",
    },
    "raichu": {
        "shapeKey": "raichu",
        "name": "Raichu Kanto",
        "fur": ["#964802", "#cf6d0a", "#f58e1e", "#ffd18c"],
        "cheeks": ["#d49700", "#ffcc00", "#ffe600", "#fff380"], # Canon Raichu has yellow cheeks!
    },
    "alolan-raichu": {
        "shapeKey": "alolan-raichu",
        "name": "Alolan Raichu",
        "fur": ["#9a520e", "#d47b19", "#f5a742", "#ffe0a3"],
        "cheeks": ["#d49700", "#facc15", "#fde047", "#fef08a"],
        "eyes": ["#1d4ed8", "#2563eb", "#38bdf8", "#bae6fd"], # Psychic blue eyes!
    },
    "gigantamax": {
        "shapeKey": "gigantamax",
        "name": "Gigantamax Pikachu",
        "fur": ["#a65805", "#d67c0f", "#f7a523", "#ffdb8a"],
        "cheeks": ["#c70c0c", "#f01616", "#ff3d3d", "#ffa3a3"],
    },
    "ash-cap": {
        "shapeKey": "cap",
        "name": "World Champion Cap Pikachu",
        "fur": ["#b37a08", "#e6a312", "#ffd700", "#fff28f"],
        "cheeks": ["#b51515", "#db2424", "#f74a4a", "#ff9494"],
        "capId": "ash-cap",
    },
}


def hex_rgb(value):
    value = value.lstrip("#")
    return np.array([int(value[i : i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


def hls_planes(rgb):
    c = rgb.astype(np.float32) / 255.0
    r, g, b = c[..., 0], c[..., 1], c[..., 2]
    mx, mn = c.max(axis=-1), c.min(axis=-1)
    light = (mx + mn) / 2.0
    delta = mx - mn
    safe = np.where(delta == 0, 1.0, delta)
    sat = np.where(
        delta == 0,
        0.0,
        np.where(
            light <= 0.5,
            delta / np.maximum(mx + mn, 1e-6),
            delta / np.maximum(2.0 - mx - mn, 1e-6),
        ),
    )
    hue = (
        np.where(
            mx == r,
            ((g - b) / safe) % 6.0,
            np.where(mx == g, (b - r) / safe + 2.0, (r - g) / safe + 4.0),
        )
        / 6.0
    )
    hue = np.where(delta == 0, 0.0, hue)
    return hue, light, sat


def clean_cell_borders(cell):
    """Flawlessly remove the 3D capture box artifact lines across all rows and columns."""
    arr = cell.copy()
    rgb = arr[:, :, :3]
    alpha = arr[:, :, 3] > 0

    c = rgb.astype(float) / 255.0
    mx, mn = c.max(axis=-1), c.min(axis=-1)
    delta = mx - mn
    light = (mx + mn) / 2.0
    sat = np.where(delta == 0, 0.0, np.where(light <= 0.5, delta / np.maximum(mx + mn, 1e-6), delta / np.maximum(2.0 - mx - mn, 1e-6)))

    # White / light grey border lines (sat < 0.2, light > 0.6) in margins
    white_box = alpha & (sat < 0.2) & (light > 0.6)
    outer_margin = (np.arange(CELL_W)[None, :] < 32) | (np.arange(CELL_W)[None, :] > 150) | (np.arange(CELL_H)[:, None] < 25) | (np.arange(CELL_H)[:, None] > 190)
    arr[white_box & outer_margin] = 0

    # Dark border lines (light < 0.2) in outer edges
    dark_box = alpha & (light < 0.2)
    outer_edge = (np.arange(CELL_W)[None, :] < 22) | (np.arange(CELL_W)[None, :] > 165) | (np.arange(CELL_H)[:, None] < 12) | ((np.arange(CELL_H)[:, None] > 195) & ((np.arange(CELL_W)[None, :] < 30) | (np.arange(CELL_W)[None, :] > 100)))
    arr[dark_box & outer_edge] = 0

    return arr


def find_tail_component(cell, facing_left):
    """Accurately extract 100% of the tail pixels using connected flood fill."""
    alpha = cell[:, :, 3] > 0
    tail = np.zeros((CELL_H, CELL_W), dtype=bool)
    if facing_left:
        seed = (86, 24)
        if not (0 <= seed[0] < CELL_H and 0 <= seed[1] < CELL_W and alpha[seed]):
            ys, xs = np.where(alpha & (np.arange(CELL_W)[None, :] < 80) & (np.arange(CELL_H)[:, None] > 70))
            if len(ys) == 0:
                return tail
            seed = (ys[0], xs[0])
        tail[seed] = True
        frontier = [seed]
        while frontier:
            y, x = frontier.pop()
            for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < CELL_H and 0 <= nx < CELL_W:
                    if alpha[ny, nx] and not tail[ny, nx]:
                        if nx <= 88 or (nx <= 94 and ny < 155):
                            tail[ny, nx] = True
                            frontier.append((ny, nx))
    else:
        seed = (86, 168)
        if not (0 <= seed[0] < CELL_H and 0 <= seed[1] < CELL_W and alpha[seed]):
            ys, xs = np.where(alpha & (np.arange(CELL_W)[None, :] > 110) & (np.arange(CELL_H)[:, None] > 70))
            if len(ys) == 0:
                return tail
            seed = (ys[0], xs[0])
        tail[seed] = True
        frontier = [seed]
        while frontier:
            y, x = frontier.pop()
            for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < CELL_H and 0 <= nx < CELL_W:
                    if alpha[ny, nx] and not tail[ny, nx]:
                        if nx >= 104 or (nx >= 98 and ny < 155):
                            tail[ny, nx] = True
                            frontier.append((ny, nx))
    return tail


def remap_ramp(source_light, mask, ramp_hex):
    ramp_rgb = [hex_rgb(h) for h in ramp_hex]
    out = np.zeros((*source_light.shape, 3), dtype=np.float32)
    l_vals = source_light[mask]
    if len(l_vals) == 0:
        return out
    min_l, max_l = np.percentile(l_vals, 4), np.percentile(l_vals, 96)
    span = max(max_l - min_l, 1e-4)
    norm_l = np.clip((source_light[mask] - min_l) / span, 0.0, 1.0)

    p0, p1, p2, p3 = ramp_rgb

    seg0 = norm_l < 0.33
    t0 = np.clip(norm_l / 0.33, 0.0, 1.0)[..., None]
    c0 = p0 * (1 - t0) + p1 * t0

    seg1 = (norm_l >= 0.33) & (norm_l < 0.66)
    t1 = np.clip((norm_l - 0.33) / 0.33, 0.0, 1.0)[..., None]
    c1 = p1 * (1 - t1) + p2 * t1

    seg2 = norm_l >= 0.66
    t2 = np.clip((norm_l - 0.66) / 0.34, 0.0, 1.0)[..., None]
    c2 = p2 * (1 - t2) + p3 * t2

    out[mask] = np.where(seg0[..., None], c0, np.where(seg1[..., None], c1, c2))
    return out


def draw_cap(arr, r, c, cap_id):
    """Draw Ash Ketchum's regional caps fitted naturally between ears with forehead shading."""
    facing_left = (r == 2)
    y_drop = 6 if r == 5 else (0 if r not in (3, 4) else -2)

    scale = 4
    fx = Image.new("RGBA", (CELL_W * scale, CELL_H * scale), (0, 0, 0, 0))
    draw = ImageDraw.Draw(fx)

    if facing_left:
        cx = 120 * scale
        cy = (60 + y_drop) * scale
        crown = [cx - 20 * scale, cy - 14 * scale, cx + 18 * scale, cy + 10 * scale]
        front = [cx - 19 * scale, cy - 11 * scale, cx + 2 * scale, cy + 9 * scale]
        crest = [cx - 13 * scale, cy - 3 * scale, cx - 5 * scale, cy + 5 * scale]
        brim = [
            (cx - 6 * scale, cy + 6 * scale),
            (cx - 32 * scale, cy + 9 * scale),
            (cx - 28 * scale, cy + 16 * scale),
            (cx - 2 * scale, cy + 12 * scale),
        ]
    else:
        cx = 58 * scale
        cy = (60 + y_drop) * scale
        crown = [cx - 18 * scale, cy - 14 * scale, cx + 20 * scale, cy + 10 * scale]
        front = [cx - 2 * scale, cy - 11 * scale, cx + 19 * scale, cy + 9 * scale]
        crest = [cx + 5 * scale, cy - 3 * scale, cx + 13 * scale, cy + 5 * scale]
        brim = [
            (cx + 6 * scale, cy + 6 * scale),
            (cx + 32 * scale, cy + 9 * scale),
            (cx + 28 * scale, cy + 16 * scale),
            (cx + 2 * scale, cy + 12 * scale),
        ]

    # Forehead shadow
    draw.ellipse([crown[0] + 2*scale, crown[3] - 2*scale, crown[2] - 2*scale, crown[3] + 6*scale], fill=(50, 40, 0, 60))

    if cap_id == "original-cap":
        # Red crown
        draw.ellipse(crown, fill=(215, 25, 35, 255), outline=(140, 15, 20, 255), width=2 * scale)
        draw.ellipse([crown[0] + 4*scale, crown[1] + 2*scale, crown[2] - 4*scale, crown[1] + 10*scale], fill=(235, 70, 80, 180))
        # White front panel
        draw.ellipse(front, fill=(245, 248, 252, 255), outline=(170, 175, 185, 255), width=2 * scale)
        # Green Expo Pokéball crest
        draw.ellipse(crest, fill=(20, 155, 85, 255), outline=(10, 100, 50, 255), width=1 * scale)
        crest_in = [crest[0] + 2*scale, crest[1] + 2*scale, crest[2] - 2*scale, crest[3] - 2*scale]
        draw.ellipse(crest_in, fill=(255, 255, 255, 255))
        # Visor
        draw.polygon(brim, fill=(185, 18, 26, 255), outline=(110, 10, 15, 255))
        draw.line([brim[0], brim[1]], fill=(240, 60, 70, 255), width=2 * scale)

    elif cap_id == "hoenn-cap":
        # Black crown
        draw.ellipse(crown, fill=(38, 42, 50, 255), outline=(20, 22, 28, 255), width=2 * scale)
        draw.ellipse([crown[0] + 4*scale, crown[1] + 2*scale, crown[2] - 4*scale, crown[1] + 10*scale], fill=(70, 75, 88, 180))
        # Red band across front
        draw.ellipse(front, fill=(215, 30, 40, 255), outline=(140, 15, 20, 255), width=2 * scale)
        # Green Pokéball arc
        draw.ellipse(crest, fill=(34, 197, 94, 255), outline=(20, 120, 60, 255), width=1 * scale)
        crest_in = [crest[0] + 2*scale, crest[1] + 2*scale, crest[2] - 2*scale, crest[3] - 2*scale]
        draw.ellipse(crest_in, fill=(245, 248, 252, 255))
        # Visor
        draw.polygon(brim, fill=(185, 18, 26, 255), outline=(110, 10, 15, 255))
        draw.line([brim[0], brim[1]], fill=(240, 60, 70, 255), width=2 * scale)

    elif cap_id == "kalos-cap":
        # Red crown
        draw.ellipse(crown, fill=(225, 30, 40, 255), outline=(140, 15, 20, 255), width=2 * scale)
        draw.ellipse([crown[0] + 4*scale, crown[1] + 2*scale, crown[2] - 4*scale, crown[1] + 10*scale], fill=(245, 80, 90, 180))
        # White front panel
        draw.ellipse(front, fill=(250, 250, 255, 255), outline=(180, 185, 195, 255), width=2 * scale)
        # White Pokéball semi-circle emblem
        draw.ellipse(crest, fill=(225, 30, 40, 255), outline=(180, 185, 195, 255), width=1 * scale)
        crest_in = [crest[0] + 2*scale, crest[1] + 2*scale, crest[2] - 2*scale, crest[3] - 2*scale]
        draw.ellipse(crest_in, fill=(255, 255, 255, 255))
        # Visor
        draw.polygon(brim, fill=(195, 20, 30, 255), outline=(120, 10, 18, 255))
        draw.line([brim[0], brim[1]], fill=(245, 70, 80, 255), width=2 * scale)

    elif cap_id == "alola-cap":
        # Navy blue crown
        draw.ellipse(crown, fill=(28, 52, 130, 255), outline=(15, 30, 80, 255), width=2 * scale)
        draw.ellipse([crown[0] + 4*scale, crown[1] + 2*scale, crown[2] - 4*scale, crown[1] + 10*scale], fill=(50, 80, 180, 180))
        # White front
        draw.ellipse(front, fill=(248, 250, 255, 255), outline=(170, 175, 185, 255), width=2 * scale)
        # Blue/red crest
        draw.ellipse(crest, fill=(37, 99, 235, 255), outline=(220, 38, 38, 255), width=1 * scale)
        crest_in = [crest[0] + 2*scale, crest[1] + 2*scale, crest[2] - 2*scale, crest[3] - 2*scale]
        draw.ellipse(crest_in, fill=(239, 68, 68, 255))
        # Visor
        draw.polygon(brim, fill=(195, 20, 30, 255), outline=(120, 10, 18, 255))
        draw.line([brim[0], brim[1]], fill=(245, 70, 80, 255), width=2 * scale)

    else:  # ash-cap (World Champion)
        # Cobalt blue crown
        draw.ellipse(crown, fill=(30, 64, 175, 255), outline=(18, 38, 110, 255), width=2 * scale)
        draw.ellipse([crown[0] + 4*scale, crown[1] + 2*scale, crown[2] - 4*scale, crown[1] + 10*scale], fill=(60, 100, 220, 180))
        # White front panel
        draw.ellipse(front, fill=(250, 252, 255, 255), outline=(180, 185, 195, 255), width=2 * scale)
        # Gold & cyan victory emblem
        draw.ellipse(crest, fill=(234, 179, 8, 255), outline=(6, 182, 212, 255), width=1 * scale)
        crest_in = [crest[0] + 2*scale, crest[1] + 2*scale, crest[2] - 2*scale, crest[3] - 2*scale]
        draw.ellipse(crest_in, fill=(6, 182, 212, 255))
        # Visor
        draw.polygon(brim, fill=(200, 25, 35, 255), outline=(125, 12, 20, 255))
        draw.line([brim[0], brim[1]], fill=(245, 70, 80, 255), width=2 * scale)

    fx_smooth = fx.resize((CELL_W, CELL_H), Image.LANCZOS)
    img = Image.fromarray(arr)
    img.paste(fx_smooth, (0, 0), fx_smooth)
    return np.array(img)


def apply_pichu_shape(arr, r, c):
    """Pichu baby silhouette: diamond-shaped ears, black collar bib, diminutive spiky tail."""
    facing_left = (r == 2)
    y_drop = 6 if r == 5 else (0 if r not in (3, 4) else -2)
    res = arr.copy()

    # 1. Erase outer lightning tail and replace with small black baby tail
    tail = find_tail_component(res, facing_left)
    if np.any(tail):
        if facing_left:
            remove_tail = tail & ~((np.arange(CELL_H)[:, None] >= 155) & (np.arange(CELL_W)[None, :] >= 62))
        else:
            remove_tail = tail & ~((np.arange(CELL_H)[:, None] >= 155) & (np.arange(CELL_W)[None, :] <= 130))
        res[remove_tail] = 0

    scale = 4
    fx = Image.new("RGBA", (CELL_W * scale, CELL_H * scale), (0, 0, 0, 0))
    draw = ImageDraw.Draw(fx)

    # Tiny black spiky tail
    if facing_left:
        tiny_tail = [
            (68 * scale, 154 * scale),
            (52 * scale, 146 * scale),
            (60 * scale, 162 * scale),
        ]
    else:
        tiny_tail = [
            (124 * scale, 154 * scale),
            (140 * scale, 146 * scale),
            (132 * scale, 162 * scale),
        ]
    draw.polygon(tiny_tail, fill=(25, 25, 25, 255), outline=(10, 10, 10, 255), width=1 * scale)

    # Diamond ears with thick black perimeter & pale yellow interior
    if facing_left:
        cx1, cy1 = 96 * scale, (30 + y_drop) * scale
        w1, h1 = 20 * scale, 28 * scale
        diamond1 = [(cx1, cy1 - h1), (cx1 + w1, cy1), (cx1, cy1 + h1), (cx1 - w1, cy1)]
        draw.polygon(diamond1, fill=(253, 241, 146, 255), outline=(20, 20, 20, 255), width=3 * scale)

        cx2, cy2 = 156 * scale, (34 + y_drop) * scale
        w2, h2 = 18 * scale, 28 * scale
        diamond2 = [(cx2, cy2 - h2), (cx2 + w2, cy2), (cx2, cy2 + h2), (cx2 - w2, cy2)]
        draw.polygon(diamond2, fill=(253, 241, 146, 255), outline=(20, 20, 20, 255), width=3 * scale)

        collar = [
            (96 * scale, (98 + y_drop) * scale),
            (102 * scale, (112 + y_drop) * scale),
            (110 * scale, (102 + y_drop) * scale),
            (116 * scale, (114 + y_drop) * scale),
            (126 * scale, (98 + y_drop) * scale),
        ]
    else:
        cx1, cy1 = 36 * scale, (34 + y_drop) * scale
        w1, h1 = 18 * scale, 28 * scale
        diamond1 = [(cx1, cy1 - h1), (cx1 + w1, cy1), (cx1, cy1 + h1), (cx1 - w1, cy1)]
        draw.polygon(diamond1, fill=(253, 241, 146, 255), outline=(20, 20, 20, 255), width=3 * scale)

        cx2, cy2 = 96 * scale, (30 + y_drop) * scale
        w2, h2 = 20 * scale, 28 * scale
        diamond2 = [(cx2, cy2 - h2), (cx2 + w2, cy2), (cx2, cy2 + h2), (cx2 - w2, cy2)]
        draw.polygon(diamond2, fill=(253, 241, 146, 255), outline=(20, 20, 20, 255), width=3 * scale)

        collar = [
            (66 * scale, (98 + y_drop) * scale),
            (76 * scale, (114 + y_drop) * scale),
            (82 * scale, (102 + y_drop) * scale),
            (90 * scale, (112 + y_drop) * scale),
            (96 * scale, (98 + y_drop) * scale),
        ]

    draw.polygon(collar, fill=(25, 25, 25, 255), outline=(10, 10, 10, 255), width=1 * scale)

    fx_smooth = fx.resize((CELL_W, CELL_H), Image.LANCZOS)
    img_res = Image.fromarray(res)
    img_res.paste(fx_smooth, (0, 0), fx_smooth)
    return np.array(img_res)


def apply_classic_shape(arr, r, c):
    """Classic Gen 1 Chonkachu pear-shaped body expansion with retro dorsal stripes."""
    y_drop = 6 if r == 5 else (0 if r not in (3, 4) else -2)
    facing_left = (r == 2)
    alpha = arr[:, :, 3] > 0
    res = arr.copy()

    # Bilateral flank expansion creating the round pear body
    for y in range(max(0, 100 + y_drop), min(186 + y_drop, CELL_H - 1)):
        t = (y - (145 + y_drop)) / 42.0
        w_add = int(max(0, 13 * (1.0 - t * t)))
        if w_add <= 0:
            continue
        xs = np.where(alpha[y, :])[0]
        if len(xs) == 0:
            continue
        min_x, max_x = xs.min(), xs.max()
        res[y, max(0, min_x - w_add):min_x] = [249, 224, 102, 255]
        res[y, max_x:min(CELL_W - 1, max_x + int(w_add * 0.75))] = [249, 224, 102, 255]

    # Two prominent dark brown dorsal stripes across the back
    for y_stripe in (122 + y_drop, 144 + y_drop):
        if 0 <= y_stripe < CELL_H - 4:
            xs = np.where(res[y_stripe, :, 3] > 0)[0]
            if len(xs) > 0:
                if facing_left:
                    sx = xs.max()
                    res[y_stripe:y_stripe+4, max(0, sx - 22):sx, :3] = [120, 53, 15]
                else:
                    sx = xs.min()
                    res[y_stripe:y_stripe+4, sx:min(CELL_W - 1, sx + 22), :3] = [120, 53, 15]
    return res


def apply_raichu_shape(arr, r, c):
    """Raichu Kanto: curled spiral ears, long thin wire tail + flat golden lightning bolt, white belly."""
    y_drop = 6 if r == 5 else (0 if r not in (3, 4) else -2)
    facing_left = (r == 2)
    res = arr.copy()

    # Cream belly patch
    alpha = res[:, :, 3] > 0
    if facing_left:
        belly_x = (np.arange(CELL_W)[None, :] >= 100) & (np.arange(CELL_W)[None, :] <= 130)
    else:
        belly_x = (np.arange(CELL_W)[None, :] >= 62) & (np.arange(CELL_W)[None, :] <= 92)
    belly_y = (np.arange(CELL_H)[:, None] >= (115 + y_drop)) & (np.arange(CELL_H)[:, None] <= (160 + y_drop))
    belly_mask = alpha & belly_x & belly_y & (res[:, :, 0] > 180) & (res[:, :, 1] > 100)
    res[belly_mask, :3] = [255, 247, 237]

    scale = 4
    fx = Image.new("RGBA", (CELL_W * scale, CELL_H * scale), (0, 0, 0, 0))
    draw = ImageDraw.Draw(fx)

    if facing_left:
        # Spiral curled ears
        e1 = [78 * scale, (14 + y_drop) * scale, 114 * scale, (52 + y_drop) * scale]
        draw.ellipse(e1, fill=(255, 204, 0, 255), outline=(130, 60, 10, 255), width=3 * scale)
        e2 = [142 * scale, (20 + y_drop) * scale, 174 * scale, (56 + y_drop) * scale]
        draw.ellipse(e2, fill=(255, 204, 0, 255), outline=(130, 60, 10, 255), width=3 * scale)
        # Tail bolt
        bolt = [
            (48 * scale, 88 * scale),
            (36 * scale, 64 * scale),
            (20 * scale, 82 * scale),
            (30 * scale, 92 * scale),
            (16 * scale, 108 * scale),
            (42 * scale, 114 * scale),
            (36 * scale, 98 * scale),
        ]
    else:
        # Spiral curled ears
        e1 = [16 * scale, (20 + y_drop) * scale, 48 * scale, (56 + y_drop) * scale]
        draw.ellipse(e1, fill=(255, 204, 0, 255), outline=(130, 60, 10, 255), width=3 * scale)
        e2 = [78 * scale, (14 + y_drop) * scale, 114 * scale, (52 + y_drop) * scale]
        draw.ellipse(e2, fill=(255, 204, 0, 255), outline=(130, 60, 10, 255), width=3 * scale)
        # Tail bolt
        bolt = [
            (144 * scale, 88 * scale),
            (156 * scale, 64 * scale),
            (172 * scale, 82 * scale),
            (162 * scale, 92 * scale),
            (176 * scale, 108 * scale),
            (150 * scale, 114 * scale),
            (156 * scale, 98 * scale),
        ]

    draw.polygon(bolt, fill=(255, 215, 0, 255), outline=(180, 110, 10, 255), width=2 * scale)

    fx_smooth = fx.resize((CELL_W, CELL_H), Image.LANCZOS)
    img_res = Image.fromarray(res)
    img_res.paste(fx_smooth, (0, 0), fx_smooth)
    return np.array(img_res)


def apply_alolan_raichu_shape(arr, r, c):
    """Alolan Raichu: rounded ears, broad golden surfing tail, psychic blue eyes."""
    y_drop = 6 if r == 5 else (0 if r not in (3, 4) else -2)
    facing_left = (r == 2)
    res = arr.copy()
    alpha = res[:, :, 3] > 0
    rgb = res[:, :, :3]

    # Psychic blue eyes
    face_y = (np.arange(CELL_H)[:, None] >= (60 + y_drop)) & (np.arange(CELL_H)[:, None] <= (100 + y_drop))
    if facing_left:
        face_x = (np.arange(CELL_W)[None, :] >= 95) & (np.arange(CELL_W)[None, :] <= 135)
    else:
        face_x = (np.arange(CELL_W)[None, :] >= 55) & (np.arange(CELL_W)[None, :] <= 95)
    eye_dark = alpha & face_y & face_x & (rgb.max(axis=-1) < 60)
    res[eye_dark, 0] = 37   # R: #2563eb
    res[eye_dark, 1] = 99   # G
    res[eye_dark, 2] = 235  # B

    scale = 4
    # Golden surfboard underneath/behind feet
    fx_surf = Image.new("RGBA", (CELL_W * scale, CELL_H * scale), (0, 0, 0, 0))
    draw_surf = ImageDraw.Draw(fx_surf)
    if facing_left:
        surfboard = [17 * scale, 172 * scale, 142 * scale, 198 * scale]
    else:
        surfboard = [50 * scale, 172 * scale, 175 * scale, 198 * scale]
    draw_surf.ellipse(surfboard, fill=(255, 215, 0, 240), outline=(56, 189, 248, 255), width=2 * scale)
    surf_smooth = fx_surf.resize((CELL_W, CELL_H), Image.LANCZOS)

    out_img = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
    out_img.paste(surf_smooth, (0, 0), surf_smooth)
    body_img = Image.fromarray(res)
    out_img.paste(body_img, (0, 0), body_img)

    # Rounded ears on top
    fx_ears = Image.new("RGBA", (CELL_W * scale, CELL_H * scale), (0, 0, 0, 0))
    draw_ears = ImageDraw.Draw(fx_ears)
    if facing_left:
        e1 = [78 * scale, (16 + y_drop) * scale, 112 * scale, (50 + y_drop) * scale]
        draw_ears.ellipse(e1, fill=(245, 175, 75, 255), outline=(160, 90, 20, 255), width=3 * scale)
        e2 = [142 * scale, (22 + y_drop) * scale, 174 * scale, (54 + y_drop) * scale]
        draw_ears.ellipse(e2, fill=(245, 175, 75, 255), outline=(160, 90, 20, 255), width=3 * scale)
    else:
        e1 = [18 * scale, (22 + y_drop) * scale, 48 * scale, (54 + y_drop) * scale]
        draw_ears.ellipse(e1, fill=(245, 175, 75, 255), outline=(160, 90, 20, 255), width=3 * scale)
        e2 = [80 * scale, (16 + y_drop) * scale, 112 * scale, (50 + y_drop) * scale]
        draw_ears.ellipse(e2, fill=(245, 175, 75, 255), outline=(160, 90, 20, 255), width=3 * scale)

    ears_smooth = fx_ears.resize((CELL_W, CELL_H), Image.LANCZOS)
    out_img.paste(ears_smooth, (0, 0), ears_smooth)
    return np.array(out_img)


def apply_gigantamax_shape(arr, r, c):
    """Gigantamax Pikachu: colossal body expansion, towering skyward lightning tail, Dynamax red clouds."""
    y_drop = 6 if r == 5 else (0 if r not in (3, 4) else -2)
    facing_left = (r == 2)
    res = arr.copy()
    alpha = res[:, :, 3] > 0

    # 1. Colossal body expansion
    for y in range(max(0, 95 + y_drop), min(190 + y_drop, CELL_H - 1)):
        t = (y - (145 + y_drop)) / 45.0
        w_add = int(max(0, 16 * (1.0 - t * t)))
        if w_add <= 0:
            continue
        xs = np.where(alpha[y, :])[0]
        if len(xs) == 0:
            continue
        min_x, max_x = xs.min(), xs.max()
        res[y, max(0, min_x - w_add):min_x] = [247, 165, 35, 255]
        res[y, max_x:min(CELL_W - 1, max_x + int(w_add * 0.8))] = [247, 165, 35, 255]

    scale = 4
    fx = Image.new("RGBA", (CELL_W * scale, CELL_H * scale), (0, 0, 0, 0))
    draw = ImageDraw.Draw(fx)

    # 2. Towering colossal lightning tail extending skyward
    if facing_left:
        colossal_tail = [
            (52 * scale, 75 * scale),
            (40 * scale, 42 * scale),
            (50 * scale, 40 * scale),
            (24 * scale, 8 * scale),
            (7 * scale, 35 * scale),
            (22 * scale, 38 * scale),
            (12 * scale, 70 * scale),
        ]
    else:
        colossal_tail = [
            (140 * scale, 75 * scale),
            (152 * scale, 42 * scale),
            (142 * scale, 40 * scale),
            (168 * scale, 8 * scale),
            (185 * scale, 35 * scale),
            (170 * scale, 38 * scale),
            (180 * scale, 70 * scale),
        ]
    draw.polygon(colossal_tail, fill=(255, 224, 51, 255), outline=(239, 68, 68, 255), width=3 * scale)

    # 3. Three swirling Dynamax red clouds
    cloud_color = (220, 38, 38, 210)
    cloud_outline = (185, 28, 28, 255)
    if facing_left:
        draw.ellipse([146 * scale, (85 + y_drop) * scale, 172 * scale, (102 + y_drop) * scale], fill=cloud_color, outline=cloud_outline, width=2 * scale)
        draw.ellipse([104 * scale, (35 + y_drop) * scale, 138 * scale, (52 + y_drop) * scale], fill=cloud_color, outline=cloud_outline, width=2 * scale)
        draw.ellipse([64 * scale, (90 + y_drop) * scale, 92 * scale, (108 + y_drop) * scale], fill=cloud_color, outline=cloud_outline, width=2 * scale)
    else:
        draw.ellipse([20 * scale, (85 + y_drop) * scale, 46 * scale, (102 + y_drop) * scale], fill=cloud_color, outline=cloud_outline, width=2 * scale)
        draw.ellipse([54 * scale, (35 + y_drop) * scale, 88 * scale, (52 + y_drop) * scale], fill=cloud_color, outline=cloud_outline, width=2 * scale)
        draw.ellipse([100 * scale, (90 + y_drop) * scale, 128 * scale, (108 + y_drop) * scale], fill=cloud_color, outline=cloud_outline, width=2 * scale)

    fx_smooth = fx.resize((CELL_W, CELL_H), Image.LANCZOS)
    img_res = Image.fromarray(res)
    img_res.paste(fx_smooth, (0, 0), fx_smooth)
    return np.array(img_res)


def process_cell(source_arr, form_id, spec, r, c):
    arr = source_arr.copy()
    arr = clean_cell_borders(arr)

    alpha = arr[:, :, 3] > 0
    rgb = arr[:, :, :3]
    h, l, s = hls_planes(rgb)

    yellow_mask = alpha & (h >= 0.08) & (h <= 0.24) & (s >= 0.28) & (l >= 0.32) & (l <= 0.96)
    cheek_mask = alpha & ((h <= 0.05) | (h >= 0.95)) & (s >= 0.38) & (l >= 0.22) & (l <= 0.78)

    # 1. Fur color ramp
    if "fur" in spec and np.any(yellow_mask):
        f_mapped = remap_ramp(l, yellow_mask, spec["fur"])
        arr[yellow_mask, :3] = f_mapped[yellow_mask]

    # 2. Cheek color ramp
    if "cheeks" in spec and np.any(cheek_mask):
        c_mapped = remap_ramp(l, cheek_mask, spec["cheeks"])
        arr[cheek_mask, :3] = c_mapped[cheek_mask]

    # 3. Shape & accessory transformations
    if form_id == "pichu":
        arr = apply_pichu_shape(arr, r, c)
    elif form_id == "classic":
        arr = apply_classic_shape(arr, r, c)
    elif "capId" in spec:
        arr = draw_cap(arr, r, c, spec["capId"])
    elif form_id == "raichu":
        arr = apply_raichu_shape(arr, r, c)
    elif form_id == "alolan-raichu":
        arr = apply_alolan_raichu_shape(arr, r, c)
    elif form_id == "gigantamax":
        arr = apply_gigantamax_shape(arr, r, c)

    return Image.fromarray(arr)


def build_form(form_id, spec, source_img):
    print(f"Building Pikachu form '{form_id}' ({spec.get('name')})...")
    out_sheet = Image.new("RGBA", (COLS * CELL_W, ROWS * CELL_H), (0, 0, 0, 0))

    for r in range(ROWS):
        for c in range(COLS):
            box = (c * CELL_W, r * CELL_H, (c + 1) * CELL_W, (r + 1) * CELL_H)
            cell_src = np.array(source_img.crop(box))
            cell_out = process_cell(cell_src, form_id, spec, r, c)
            out_sheet.paste(cell_out, box)

    form_dir = PET_DIR / "forms" / form_id
    form_dir.mkdir(parents=True, exist_ok=True)

    sheet_path = form_dir / "spritesheet.webp"
    # Save lossy WebP quality=92, alpha_quality=100, method=6
    out_sheet.save(sheet_path, "WEBP", quality=92, alpha_quality=100, method=6)

    # Avatar: frame (0, 0) centered in 128x128
    cell_0_0 = out_sheet.crop((0, 0, CELL_W, CELL_H))
    avatar = Image.new("RGBA", (AVATAR, AVATAR), (0, 0, 0, 0))
    scale = (AVATAR - 8) / max(CELL_W, CELL_H)
    scaled_w, scaled_h = int(CELL_W * scale), int(CELL_H * scale)
    cell_scaled = cell_0_0.resize((scaled_w, scaled_h), Image.LANCZOS)
    ox = (AVATAR - scaled_w) // 2
    oy = (AVATAR - scaled_h) // 2
    avatar.paste(cell_scaled, (ox, oy), cell_scaled)
    avatar.save(form_dir / "avatar.png", "PNG")

    # Metrics
    sheet_np = np.array(out_sheet)
    alpha = sheet_np[:, :, 3] > 0
    alpha_bytes = np.packbits(alpha).tobytes()
    alpha_hash = hashlib.sha256(alpha_bytes).hexdigest()[:16]
    opaque_px = int(np.count_nonzero(alpha))

    entry = {
        "shapeKey": spec.get("shapeKey", form_id),
        "name": spec.get("name"),
        "fur": spec.get("fur"),
        "cheeks": spec.get("cheeks"),
        "alphaHash": alpha_hash,
        "opaquePixels": opaque_px,
    }
    if "eyes" in spec:
        entry["eyes"] = spec["eyes"]
    return entry


def main():
    form_filter = set(sys.argv[1:]) if len(sys.argv) > 1 else None
    if not SOURCE.exists():
        print(f"Error: source sheet {SOURCE} does not exist.", file=sys.stderr)
        sys.exit(1)

    # Clean up obsolete form directories when doing a full build
    forms_dir = PET_DIR / "forms"
    if not form_filter and forms_dir.exists():
        for child in forms_dir.iterdir():
            if child.is_dir() and child.name not in FORMS:
                print(f"Removing obsolete form directory: {child.name}")
                shutil.rmtree(child)

    source_img = Image.open(SOURCE).convert("RGBA")
    manifest_path = forms_dir / "manifest.json"

    manifest_forms = {}
    if manifest_path.exists():
        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                manifest_forms = json.load(f).get("forms", {})
        except Exception:
            manifest_forms = {}

    for form_id, spec in FORMS.items():
        if form_filter and form_id not in form_filter:
            continue
        meta = build_form(form_id, spec, source_img)
        manifest_forms[form_id] = meta

    # Prune any obsolete keys from manifest
    manifest_forms = {k: v for k, v in manifest_forms.items() if k in FORMS}

    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump({"pet": "pikachu", "forms": manifest_forms}, f, indent=2)

    print(f"Successfully generated Pikachu forms and updated {manifest_path}")


if __name__ == "__main__":
    main()
