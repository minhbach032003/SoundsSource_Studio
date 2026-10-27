#!/usr/bin/env python3
"""Build the ten Pikachu form spritesheets with distinct silhouettes and canon traits.

Each form gets its own distinct silhouette (Pichu baby shape/collar, Ash's Champion Cap,
Iron Tail chrome finish, Electro Ball plasma charge, Gigantamax towering tail, etc.),
individual color ramps, and metadata manifest. Auras are rendered dynamically at runtime.

Usage: python3 -I scripts/build-pikachu-forms.py [form-id ...]
Writes public/pets/pikachu/forms/<id>/{spritesheet.webp,avatar.png}
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
        "isPichu": True,
    },
    "classic": {
        "shapeKey": "classic",
        "name": "Pikachu (Classic)",
        "fur": ["#b88e1a", "#dfb83b", "#f9e066", "#fff4b3"],
        "cheeks": ["#b51515", "#db2424", "#f74a4a", "#ff9494"],
        "isClassicChonkachu": True,
    },
    "spark": {
        "shapeKey": "spark",
        "name": "Spark Volt",
        "fur": ["#b37a08", "#e6a312", "#ffd700", "#fff28f"],
        "cheeks": ["#bd0909", "#e81515", "#ff3333", "#ff8f8f"],
        "sparkCheeks": True,
    },
    "studio": {
        "shapeKey": "studio",
        "name": "Pikachu (Studio HD)",
        "fur": ["#a86d05", "#d9930f", "#ffc425", "#ffec99"],
        "cheeks": ["#ab1111", "#d41c1c", "#f03535", "#ff8585"],
    },
    "electro-ball": {
        "shapeKey": "electro-ball",
        "name": "Electro Ball",
        "fur": ["#a37000", "#d49700", "#ffc400", "#fffa9e"],
        "cheeks": ["#b51515", "#db2424", "#f74a4a", "#ff9494"],
        "hasElectroBall": True,
    },
    "iron-tail": {
        "shapeKey": "iron-tail",
        "name": "Iron Tail Strike",
        "fur": ["#b37a08", "#e6a312", "#ffd700", "#fff28f"],
        "cheeks": ["#b51515", "#db2424", "#f74a4a", "#ff9494"],
        "ironTail": True,
    },
    "thunderbolt": {
        "shapeKey": "thunderbolt",
        "name": "Thunderbolt 100K Volts",
        "fur": ["#b58500", "#e6b000", "#ffe600", "#ffffff"],
        "cheeks": ["#c70c0c", "#f01616", "#ff3d3d", "#ffa3a3"],
        "thunderElectric": True,
    },
    "overcharge": {
        "shapeKey": "overcharge",
        "name": "Pikachu (Raichu Aura)",
        "fur": ["#964802", "#cf6d0a", "#f5911e", "#ffd18c"],
        "cheeks": ["#d49700", "#ffcc00", "#ffe600", "#fff380"], # Canon Raichu has yellow cheeks!
        "isRaichuTribute": True,
    },
    "gigantamax": {
        "shapeKey": "gigantamax",
        "name": "Gigantamax Thunder",
        "fur": ["#a65805", "#d67c0f", "#f7a523", "#ffdb8a"],
        "cheeks": ["#b51515", "#db2424", "#f74a4a", "#ff9494"],
        "gmaxTail": True,
    },
    "ash-cap": {
        "shapeKey": "ash-cap",
        "name": "Champion Cap Pikachu",
        "fur": ["#b37a08", "#e6a312", "#ffd700", "#fff28f"],
        "cheeks": ["#b51515", "#db2424", "#f74a4a", "#ff9494"],
        "hasAshCap": True,
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
    """Flawlessly remove the 3D capture box artifact across all rows and columns."""
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


def apply_classic_chonkachu(arr, r, c):
    """Enlarge body/torso into 1996 retro round chubby Chonkachu silhouette + seamless soft cream belly."""
    alpha = arr[:, :, 3] > 0
    torso_mask = alpha & (np.arange(CELL_H)[:, None] >= 110) & (np.arange(CELL_H)[:, None] <= 192) & (np.arange(CELL_W)[None, :] >= 22) & (np.arange(CELL_W)[None, :] <= 108)

    # Expand torso horizontally by 3px on both sides to give pear/chubby body
    expanded_mask = np.zeros_like(torso_mask)
    expanded_mask[:, 2:] |= torso_mask[:, :-2]
    expanded_mask[:, :-2] |= torso_mask[:, 2:]
    expanded_mask[2:, :] |= torso_mask[:-2, :]
    new_pixels = expanded_mask & (~alpha)

    arr[new_pixels, 0] = 249
    arr[new_pixels, 1] = 224
    arr[new_pixels, 2] = 102
    arr[new_pixels, 3] = 255

    # 1996 Sugimori soft elliptical cream belly with smooth radial falloff
    grid_y, grid_x = np.mgrid[0:CELL_H, 0:CELL_W]
    cy, cx = 152.0, 58.0
    ry, rx = 28.0, 22.0
    dist = ((grid_y - cy) / ry) ** 2 + ((grid_x - cx) / rx) ** 2
    belly_factor = np.clip(1.0 - dist, 0.0, 1.0) ** 1.5

    active = (arr[:, :, 3] > 0) & (belly_factor > 0)
    bf = belly_factor[active, None] * 0.45
    belly_rgb = np.array([255, 248, 205], dtype=np.float32)
    arr[active, :3] = np.clip(arr[active, :3] * (1.0 - bf) + belly_rgb * bf, 0, 255).astype(np.uint8)

    return arr


def apply_pichu_transform(arr, r, c):
    """Shape authentic Pichu: remove big tail, add black collar, diamond ears, baby pink cheeks."""
    facing_left = (r == 2)
    tail = find_tail_component(arr, facing_left)
    arr[tail] = 0 # Erase adult Pikachu tail

    scale = 4
    fx = Image.new("RGBA", (CELL_W * scale, CELL_H * scale), (0, 0, 0, 0))
    draw = ImageDraw.Draw(fx)

    y_drop = 6 if r == 5 else (0 if r not in (3, 4) else -2)

    # Small black spiky tail
    if facing_left:
        pichu_tail = [
            (96 * scale, (154 + y_drop) * scale),
            (84 * scale, (160 + y_drop) * scale),
            (74 * scale, (148 + y_drop) * scale),
            (80 * scale, (144 + y_drop) * scale),
            (70 * scale, (134 + y_drop) * scale),
            (84 * scale, (138 + y_drop) * scale),
            (90 * scale, (146 + y_drop) * scale)
        ]
        collar_pts = [
            (146 * scale, (116 + y_drop) * scale),
            (140 * scale, (128 + y_drop) * scale),
            (134 * scale, (122 + y_drop) * scale),
            (128 * scale, (132 + y_drop) * scale),
            (120 * scale, (122 + y_drop) * scale),
            (114 * scale, (128 + y_drop) * scale),
            (110 * scale, (115 + y_drop) * scale),
            (128 * scale, (112 + y_drop) * scale)
        ]
        left_d = [(163 * scale, (8 + y_drop) * scale), (181 * scale, (24 + y_drop) * scale), (166 * scale, (40 + y_drop) * scale), (148 * scale, (24 + y_drop) * scale)]
        left_in = [(163 * scale, (13 + y_drop) * scale), (175 * scale, (24 + y_drop) * scale), (166 * scale, (35 + y_drop) * scale), (153 * scale, (24 + y_drop) * scale)]
        right_d = [(86 * scale, (4 + y_drop) * scale), (103 * scale, (20 + y_drop) * scale), (88 * scale, (36 + y_drop) * scale), (70 * scale, (20 + y_drop) * scale)]
        right_in = [(86 * scale, (9 + y_drop) * scale), (98 * scale, (20 + y_drop) * scale), (88 * scale, (31 + y_drop) * scale), (75 * scale, (20 + y_drop) * scale)]
    else:
        pichu_tail = [
            (96 * scale, (154 + y_drop) * scale),
            (108 * scale, (160 + y_drop) * scale),
            (118 * scale, (148 + y_drop) * scale),
            (112 * scale, (144 + y_drop) * scale),
            (122 * scale, (134 + y_drop) * scale),
            (108 * scale, (138 + y_drop) * scale),
            (102 * scale, (146 + y_drop) * scale)
        ]
        collar_pts = [
            (42 * scale, (116 + y_drop) * scale),
            (48 * scale, (128 + y_drop) * scale),
            (54 * scale, (122 + y_drop) * scale),
            (60 * scale, (132 + y_drop) * scale),
            (68 * scale, (122 + y_drop) * scale),
            (74 * scale, (128 + y_drop) * scale),
            (78 * scale, (115 + y_drop) * scale),
            (60 * scale, (112 + y_drop) * scale)
        ]
        left_d = [(29 * scale, (8 + y_drop) * scale), (46 * scale, (24 + y_drop) * scale), (31 * scale, (40 + y_drop) * scale), (13 * scale, (24 + y_drop) * scale)]
        left_in = [(29 * scale, (13 + y_drop) * scale), (41 * scale, (24 + y_drop) * scale), (31 * scale, (35 + y_drop) * scale), (18 * scale, (24 + y_drop) * scale)]
        right_d = [(106 * scale, (4 + y_drop) * scale), (123 * scale, (20 + y_drop) * scale), (108 * scale, (36 + y_drop) * scale), (90 * scale, (20 + y_drop) * scale)]
        right_in = [(106 * scale, (9 + y_drop) * scale), (118 * scale, (20 + y_drop) * scale), (108 * scale, (31 + y_drop) * scale), (95 * scale, (20 + y_drop) * scale)]

    draw.polygon(pichu_tail, fill=(28, 28, 34, 255), outline=(15, 15, 18, 255))
    draw.polygon(collar_pts, fill=(26, 26, 32, 255), outline=(14, 14, 18, 255))
    draw.polygon(left_d, fill=(26, 26, 32, 255), outline=(14, 14, 18, 255))
    draw.polygon(left_in, fill=(254, 243, 150, 255))
    draw.polygon(right_d, fill=(26, 26, 32, 255), outline=(14, 14, 18, 255))
    draw.polygon(right_in, fill=(254, 243, 150, 255))

    fx_smooth = fx.resize((CELL_W, CELL_H), Image.LANCZOS)
    img = Image.fromarray(arr)
    img.paste(fx_smooth, (0, 0), fx_smooth)
    return np.array(img)


def apply_iron_tail(arr, r, c):
    """Transform the entire lightning tail into polished chrome steel with specular glints."""
    facing_left = (r == 2)
    tail_mask = find_tail_component(arr, facing_left)
    if not np.any(tail_mask):
        return arr

    grid_y, grid_x = np.mgrid[0:CELL_H, 0:CELL_W]
    diag = (grid_x * 0.75 - grid_y * 0.75).astype(np.float32)
    diag_t = diag[tail_mask]
    norm_diag = (diag - diag_t.min()) / max(diag_t.max() - diag_t.min(), 1)

    orig_light = (arr[..., 0].astype(float) + arr[..., 1].astype(float) + arr[..., 2].astype(float)) / (3.0 * 255.0)
    sheen = 0.5 + 0.5 * np.cos(norm_diag * math.pi * 3.5)
    specular = (0.5 + 0.5 * np.sin(norm_diag * math.pi * 7.0)) ** 3.0
    steel_l = np.clip(orig_light * 0.45 + sheen * 0.35 + specular * 0.40, 0.0, 1.0)

    sr = np.clip(70 + 185 * (steel_l ** 0.9), 0, 255).astype(np.uint8)
    sg = np.clip(85 + 170 * (steel_l ** 0.9), 0, 255).astype(np.uint8)
    sb = np.clip(105 + 150 * (steel_l ** 0.85), 0, 255).astype(np.uint8)

    arr[tail_mask, 0] = sr[tail_mask]
    arr[tail_mask, 1] = sg[tail_mask]
    arr[tail_mask, 2] = sb[tail_mask]

    # Metallic star glint (expands alpha silhouette)
    scale = 4
    fx = Image.new("RGBA", (CELL_W * scale, CELL_H * scale), (0, 0, 0, 0))
    d = ImageDraw.Draw(fx)
    gx, gy = (24 * scale, 86 * scale) if facing_left else (168 * scale, 86 * scale)
    size = 10 * scale
    color = (235, 245, 255, 245)
    d.line([(gx - size, gy), (gx + size, gy)], fill=color, width=2 * scale)
    d.line([(gx, gy - size), (gx, gy + size)], fill=color, width=2 * scale)
    d.line([(gx - size//2, gy - size//2), (gx + size//2, gy + size//2)], fill=color, width=1 * scale)
    d.line([(gx - size//2, gy + size//2), (gx + size//2, gy - size//2)], fill=color, width=1 * scale)
    d.ellipse([gx - 3*scale, gy - 3*scale, gx + 3*scale, gy + 3*scale], fill=(255, 255, 255, 255))

    fx_smooth = fx.resize((CELL_W, CELL_H), Image.LANCZOS)
    img = Image.fromarray(arr)
    img.paste(fx_smooth, (0, 0), fx_smooth)
    return np.array(img)


def draw_electro_ball(arr, r, c):
    """Draw a vibrant crackling plasma sphere dynamically pinned to the tail tip."""
    facing_left = (r == 2)
    tail_mask = find_tail_component(arr, facing_left)
    ys, xs = np.where(tail_mask)
    if len(ys) > 0:
        if facing_left:
            tip_idx = np.argmin(xs)
            bx, by = xs[tip_idx], ys[tip_idx]
        else:
            tip_idx = np.argmax(xs)
            bx, by = xs[tip_idx], ys[tip_idx]
    else:
        bx, by = (24, 88) if facing_left else (168, 88)

    scale = 4
    fx = Image.new("RGBA", (CELL_W * scale, CELL_H * scale), (0, 0, 0, 0))
    draw = ImageDraw.Draw(fx)
    cx, cy = bx * scale, by * scale

    draw.ellipse([cx - 18 * scale, cy - 18 * scale, cx + 18 * scale, cy + 18 * scale], fill=(255, 230, 40, 110), outline=(255, 245, 120, 180), width=2*scale)
    draw.ellipse([cx - 12 * scale, cy - 12 * scale, cx + 12 * scale, cy + 12 * scale], fill=(60, 220, 255, 200), outline=(180, 245, 255, 255), width=2*scale)
    draw.ellipse([cx - 6 * scale, cy - 6 * scale, cx + 6 * scale, cy + 6 * scale], fill=(255, 255, 255, 255))

    # Animated crackling arcs varying by frame
    rot = (c * 45) * math.pi / 180.0
    for ang in (0, 1.2, 2.4, 3.8, 5.0):
        a = ang + rot
        x1, y1 = cx + math.cos(a) * 8 * scale, cy + math.sin(a) * 8 * scale
        x2, y2 = cx + math.cos(a + 0.3) * 16 * scale, cy + math.sin(a + 0.3) * 16 * scale
        x3, y3 = cx + math.cos(a + 0.1) * 22 * scale, cy + math.sin(a + 0.1) * 22 * scale
        draw.line([(x1, y1), (x2, y2), (x3, y3)], fill=(255, 255, 255, 220), width=2 * scale)

    fx_smooth = fx.resize((CELL_W, CELL_H), Image.LANCZOS)
    img = Image.fromarray(arr)
    img.paste(fx_smooth, (0, 0), fx_smooth)
    return np.array(img)


def apply_raichu_tribute(arr, r, c):
    """Raichu tribute form: amber-orange fur, bright YELLOW cheeks, cream belly, Raichu lightning tail."""
    facing_left = (r == 2)
    tail = find_tail_component(arr, facing_left)
    arr[tail] = 0 # Erase Pikachu tail to replace with Raichu slender tail + blade

    # Soft elliptical cream belly with smooth radial falloff
    grid_y, grid_x = np.mgrid[0:CELL_H, 0:CELL_W]
    cy, cx = 152.0, (114.0 if facing_left else 58.0)
    ry, rx = 28.0, 22.0
    dist = ((grid_y - cy) / ry) ** 2 + ((grid_x - cx) / rx) ** 2
    belly_factor = np.clip(1.0 - dist, 0.0, 1.0) ** 1.5

    active = (arr[:, :, 3] > 0) & (belly_factor > 0)
    bf = belly_factor[active, None] * 0.45
    belly_rgb = np.array([255, 244, 218], dtype=np.float32)
    arr[active, :3] = np.clip(arr[active, :3] * (1.0 - bf) + belly_rgb * bf, 0, 255).astype(np.uint8)

    scale = 4
    fx = Image.new("RGBA", (CELL_W * scale, CELL_H * scale), (0, 0, 0, 0))
    draw = ImageDraw.Draw(fx)

    y_drop = 6 if r == 5 else (0 if r not in (3, 4) else -2)

    # Long cord tail + golden lightning blade at tip
    if facing_left:
        cord = [(96 * scale, (165 + y_drop) * scale), (76 * scale, (175 + y_drop) * scale), (46 * scale, (165 + y_drop) * scale), (42 * scale, (130 + y_drop) * scale), (52 * scale, (105 + y_drop) * scale)]
        blade = [(52 * scale, (105 + y_drop) * scale), (44 * scale, (100 + y_drop) * scale), (47 * scale, (85 + y_drop) * scale), (24 * scale, (65 + y_drop) * scale), (36 * scale, (68 + y_drop) * scale), (17 * scale, (45 + y_drop) * scale), (42 * scale, (58 + y_drop) * scale), (37 * scale, (75 + y_drop) * scale), (57 * scale, (95 + y_drop) * scale), (52 * scale, (105 + y_drop) * scale)]
    else:
        cord = [(96 * scale, (165 + y_drop) * scale), (116 * scale, (175 + y_drop) * scale), (146 * scale, (165 + y_drop) * scale), (150 * scale, (130 + y_drop) * scale), (140 * scale, (105 + y_drop) * scale)]
        blade = [(140 * scale, (105 + y_drop) * scale), (148 * scale, (100 + y_drop) * scale), (145 * scale, (85 + y_drop) * scale), (168 * scale, (65 + y_drop) * scale), (156 * scale, (68 + y_drop) * scale), (175 * scale, (45 + y_drop) * scale), (150 * scale, (58 + y_drop) * scale), (155 * scale, (75 + y_drop) * scale), (135 * scale, (95 + y_drop) * scale), (140 * scale, (105 + y_drop) * scale)]

    for i in range(len(cord) - 1):
        draw.line([cord[i], cord[i + 1]], fill=(32, 22, 14, 255), width=3 * scale)
    draw.polygon(blade, fill=(255, 215, 0, 255), outline=(190, 130, 0, 255))

    fx_smooth = fx.resize((CELL_W, CELL_H), Image.LANCZOS)
    img = Image.fromarray(arr)
    img.paste(fx_smooth, (0, 0), fx_smooth)
    return np.array(img)


def draw_gigantamax(arr, r, c):
    """Draw colossal towering lightning tail + volumetric swirling crimson Dynamax clouds."""
    facing_left = (r == 2)
    tail = find_tail_component(arr, facing_left)
    arr[tail] = 0 # Erase small tail

    scale = 4
    fx = Image.new("RGBA", (CELL_W * scale, CELL_H * scale), (0, 0, 0, 0))
    draw = ImageDraw.Draw(fx)

    y_drop = 6 if r == 5 else (0 if r not in (3, 4) else -2)

    if facing_left:
        pts = [(35 * scale, (100 + y_drop) * scale), (8 * scale, (65 + y_drop) * scale), (28 * scale, (60 + y_drop) * scale), (4 * scale, (16 + y_drop) * scale), (38 * scale, (10 + y_drop) * scale), (18 * scale, (50 + y_drop) * scale), (45 * scale, (55 + y_drop) * scale), (35 * scale, (100 + y_drop) * scale)]
        cloud_x, cloud_y = 25 * scale, (36 + y_drop) * scale
        spine_pts = [(25 * scale, (95 + y_drop) * scale), (17 * scale, (60 + y_drop) * scale), (25 * scale, (18 + y_drop) * scale)]
    else:
        pts = [(155 * scale, (100 + y_drop) * scale), (184 * scale, (65 + y_drop) * scale), (164 * scale, (60 + y_drop) * scale), (188 * scale, (16 + y_drop) * scale), (154 * scale, (10 + y_drop) * scale), (174 * scale, (50 + y_drop) * scale), (147 * scale, (55 + y_drop) * scale), (155 * scale, (100 + y_drop) * scale)]
        cloud_x, cloud_y = 168 * scale, (36 + y_drop) * scale
        spine_pts = [(168 * scale, (95 + y_drop) * scale), (176 * scale, (60 + y_drop) * scale), (168 * scale, (18 + y_drop) * scale)]

    # Colossal tail
    draw.polygon(pts, fill=(255, 226, 45, 255), outline=(215, 155, 10, 255))
    draw.line(spine_pts, fill=(255, 255, 255, 245), width=3 * scale)

    # 3 Crimson swirling Dynamax clouds
    draw.ellipse([cloud_x - 18 * scale, cloud_y - 6 * scale, cloud_x + 18 * scale, cloud_y + 6 * scale], fill=(225, 29, 72, 160), outline=(253, 164, 175, 230), width=2 * scale)
    draw.ellipse([cloud_x - 24 * scale, cloud_y + 8 * scale, cloud_x + 24 * scale, cloud_y + 20 * scale], fill=(190, 18, 60, 160), outline=(251, 113, 133, 230), width=2 * scale)
    draw.ellipse([cloud_x - 14 * scale, cloud_y - 18 * scale, cloud_x + 14 * scale, cloud_y - 8 * scale], fill=(244, 63, 94, 160), outline=(254, 205, 211, 230), width=2 * scale)

    fx_smooth = fx.resize((CELL_W, CELL_H), Image.LANCZOS)
    img = Image.fromarray(arr)
    img.paste(fx_smooth, (0, 0), fx_smooth)
    return np.array(img)


def draw_ash_champion_cap(arr, r, c):
    """Draw Ash Ketchum's Champion cap fitted naturally between ears with forehead shading."""
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
            (cx - 2 * scale, cy + 12 * scale)
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
            (cx + 2 * scale, cy + 12 * scale)
        ]

    # Forehead shadow
    draw.ellipse([crown[0] + 2*scale, crown[3] - 2*scale, crown[2] - 2*scale, crown[3] + 6*scale], fill=(50, 40, 0, 60))
    # Red crown
    draw.ellipse(crown, fill=(215, 25, 35, 255), outline=(140, 15, 20, 255), width=2 * scale)
    draw.ellipse([crown[0] + 4*scale, crown[1] + 2*scale, crown[2] - 4*scale, crown[1] + 10*scale], fill=(235, 70, 80, 180))
    # White front panel
    draw.ellipse(front, fill=(245, 248, 252, 255), outline=(170, 175, 185, 255), width=2 * scale)
    # Green Pokéball crest
    draw.ellipse(crest, fill=(20, 155, 85, 255), outline=(10, 100, 50, 255), width=1 * scale)
    crest_inner = [crest[0] + 2*scale, crest[1] + 2*scale, crest[2] - 2*scale, crest[3] - 2*scale]
    draw.ellipse(crest_inner, fill=(255, 255, 255, 255))
    # Visor
    draw.polygon(brim, fill=(185, 18, 26, 255), outline=(110, 10, 15, 255))
    draw.line([brim[0], brim[1]], fill=(240, 60, 70, 255), width=2 * scale)

    fx_smooth = fx.resize((CELL_W, CELL_H), Image.LANCZOS)
    img = Image.fromarray(arr)
    img.paste(fx_smooth, (0, 0), fx_smooth)
    return np.array(img)


def draw_lightning_discharges(arr, r, c, is_thunderbolt=False):
    """Draw crackling lightning discharges varying across frames for Spark and Thunderbolt."""
    facing_left = (r == 2)
    scale = 4
    fx = Image.new("RGBA", (CELL_W * scale, CELL_H * scale), (0, 0, 0, 0))
    draw = ImageDraw.Draw(fx)

    y_drop = 6 if r == 5 else (0 if r not in (3, 4) else -2)
    ch_x = (107 if facing_left else 83) * scale
    ch_y = ((105 if r != 5 else 114) + y_drop) * scale

    color = (255, 255, 255, 240) if is_thunderbolt else (255, 235, 40, 230)
    w = (3 if is_thunderbolt else 2) * scale

    # Frame-varying offset
    f_off = (c % 4) * 3 * scale

    # Cheek spark
    draw.line([(ch_x, ch_y), (ch_x + (14 if not facing_left else -14) * scale + f_off, ch_y - 8 * scale), (ch_x + (24 if not facing_left else -24) * scale + f_off, ch_y - 2 * scale)], fill=color, width=w)

    if is_thunderbolt:
        # Full body electrical storm: lightning arcs around ears, tail, back
        ex = (105 if facing_left else 30) * scale
        ey = (15 + y_drop) * scale
        draw.line([(ex, ey), (ex - 12 * scale, ey - 8 * scale), (ex - 6 * scale, ey - 16 * scale)], fill=(255, 255, 255, 240), width=w)
        tx = (30 if facing_left else 165) * scale
        ty = (85 + y_drop) * scale
        draw.line([(tx, ty), (tx + (10 if not facing_left else -10) * scale, ty - 12 * scale), (tx + (18 if not facing_left else -18) * scale, ty - 8 * scale)], fill=(120, 235, 255, 240), width=w)

    fx_smooth = fx.resize((CELL_W, CELL_H), Image.LANCZOS)
    img = Image.fromarray(arr)
    img.paste(fx_smooth, (0, 0), fx_smooth)
    return np.array(img)


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
    if spec.get("isClassicChonkachu"):
        arr = apply_classic_chonkachu(arr, r, c)
    elif spec.get("isPichu"):
        arr = apply_pichu_transform(arr, r, c)
    elif spec.get("ironTail"):
        arr = apply_iron_tail(arr, r, c)
    elif spec.get("hasElectroBall"):
        arr = draw_electro_ball(arr, r, c)
    elif spec.get("isRaichuTribute"):
        arr = apply_raichu_tribute(arr, r, c)
    elif spec.get("gmaxTail"):
        arr = draw_gigantamax(arr, r, c)
    elif spec.get("hasAshCap"):
        arr = draw_ash_champion_cap(arr, r, c)

    if spec.get("sparkCheeks"):
        arr = draw_lightning_discharges(arr, r, c, is_thunderbolt=False)
    elif spec.get("thunderElectric"):
        arr = draw_lightning_discharges(arr, r, c, is_thunderbolt=True)

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

    return {
        "shapeKey": spec.get("shapeKey", form_id),
        "name": spec.get("name"),
        "fur": spec.get("fur"),
        "cheeks": spec.get("cheeks"),
        "alphaHash": alpha_hash,
        "opaquePixels": opaque_px,
    }


def main():
    form_filter = set(sys.argv[1:]) if len(sys.argv) > 1 else None
    if not SOURCE.exists():
        print(f"Error: source sheet {SOURCE} does not exist.", file=sys.stderr)
        sys.exit(1)

    source_img = Image.open(SOURCE).convert("RGBA")
    manifest_path = PET_DIR / "forms" / "manifest.json"

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

    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump({"pet": "pikachu", "forms": manifest_forms}, f, indent=2)

    print(f"Successfully generated Pikachu forms and updated {manifest_path}")


if __name__ == "__main__":
    main()
