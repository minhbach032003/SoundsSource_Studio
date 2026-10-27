#!/usr/bin/env python3
"""Build the ten Work Blue Cat (Cyber Coding Cat) form spritesheets from the source sheet.

Each form gets its own distinct silhouette accessories (coffee mug, coder glasses,
over-ear headphones, neck scarf, visor goggles, solar antennae, retro synthwave shades,
astral horns & gem, ethereal architect halo), custom hoodie/fur/eye ramps, and dedicated
aura effects at runtime.

Usage: python3 -I scripts/build-work-blue-cat-forms.py [form-id ...]
Writes public/pets/work-blue-cat/forms/<id>/{spritesheet.webp,avatar.png}
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
PET_DIR = ROOT / "public" / "pets" / "work-blue-cat"
SOURCE = PET_DIR / "spritesheet.webp"
COLS, ROWS = 8, 9
CELL_W, CELL_H = 192, 208
AVATAR = 128

FORMS = {
    "classic": {
        "shape": "none",
        "hoodie": ["#20402b", "#366a47", "#5ba374", "#7ec897"],
        "stripe": ["#bdd4b7", "#f6f6f2"],
        "eyes": ["#8a5214", "#d97706", "#fed073"],
        "laptop": ["#5a4e40", "#877969", "#72b085", "#b1efc6"],
        "inner_ears": ["#723e27", "#9e6953"],
        "outline": "#000000",
    },
    "midnight": {
        "shape": "mug",
        "hoodie": ["#0f141c", "#1f2735", "#334155", "#475569"],
        "stripe": ["#64748b", "#94a3b8"],
        "eyes": ["#853b08", "#d97706", "#fbb03b"],
        "laptop": ["#1e1b2e", "#333242", "#b45309", "#f59e0b"],
        "inner_ears": ["#4a201b", "#703a32"],
        "outline": "#000000",
    },
    "indigo": {
        "shape": "glasses",
        "hoodie": ["#111836", "#1e285a", "#374996", "#526bcc"],
        "stripe": ["#818cf8", "#c7d2fe"],
        "eyes": ["#084b6f", "#06b6d4", "#67e8f9"],
        "laptop": ["#1a2238", "#2a375a", "#0284c7", "#38bdf8"],
        "inner_ears": ["#3b2247", "#6b3b7e"],
        "outline": "#000000",
    },
    "deep-work": {
        "shape": "headphones",
        "hoodie": ["#18181b", "#27272a", "#3f3f46", "#52525b"],
        "stripe": ["#991b1b", "#ef4444"],
        "eyes": ["#7f1d1d", "#dc2626", "#f87171"],
        "laptop": ["#18181b", "#2e2e33", "#b91c1c", "#f87171"],
        "inner_ears": ["#501818", "#782828"],
        "outline": "#000000",
    },
    "lofi-study": {
        "shape": "lofi",
        "hoodie": ["#3b2434", "#6d3a5a", "#9d527e", "#c478a5"],
        "stripe": ["#fbcfe8", "#fdf2f8"],
        "eyes": ["#785412", "#ca8a04", "#fde047"],
        "laptop": ["#3f4335", "#5c634e", "#db2777", "#f472b6"],
        "inner_ears": ["#6d304a", "#9c4c70"],
        "outline": "#000000",
    },
    "aurora": {
        "shape": "goggles",
        "hoodie": ["#3b3310", "#635818", "#9ca325", "#34d399"],
        "stripe": ["#fde68a", "#d1fae5"],
        "eyes": ["#78350f", "#d97706", "#fef08a"],
        "laptop": ["#3d3b28", "#5e5b3f", "#10b981", "#6ee7b7"],
        "inner_ears": ["#524b1c", "#786e2d"],
        "outline": "#000000",
    },
    "amber-flow": {
        "shape": "antennae",
        "hoodie": ["#5c1c00", "#9a3412", "#c2410c", "#ea580c"],
        "stripe": ["#fed7aa", "#ffedd5"],
        "eyes": ["#7c2d12", "#ea580c", "#fcd34d"],
        "laptop": ["#543220", "#844f33", "#ea580c", "#fdba74"],
        "inner_ears": ["#6e2610", "#9c3f20"],
        "outline": "#000000",
    },
    "synthwave": {
        "shape": "synth_shades",
        "hoodie": ["#3b0764", "#581c87", "#7e22ce", "#a855f7"],
        "stripe": ["#00f0ff", "#a5f3fc"],
        "eyes": ["#0891b2", "#00f0ff", "#e0f2fe"],
        "laptop": ["#25143a", "#432368", "#d946ef", "#00f0ff"],
        "inner_ears": ["#581448", "#882470"],
        "outline": "#000000",
    },
    "astral": {
        "shape": "astral_horns",
        "hoodie": ["#1e1035", "#311854", "#4c2882", "#6b3bb8"],
        "stripe": ["#2dd4bf", "#99f6e4"],
        "eyes": ["#0f766e", "#14b8a6", "#5eead4"],
        "laptop": ["#161226", "#292242", "#0d9488", "#2dd4bf"],
        "inner_ears": ["#361b4d", "#5e3285"],
        "outline": "#000000",
    },
    "timeless": {
        "shape": "halo",
        "hoodie": ["#475569", "#64748b", "#94a3b8", "#cbd5e1"],
        "stripe": ["#eab308", "#fef08a"],
        "eyes": ["#0369a1", "#0ea5e9", "#7dd3fc"],
        "laptop": ["#334155", "#475569", "#eab308", "#fde047"],
        "inner_ears": ["#52405e", "#7b638c"],
        "outline": "#000000",
    },
}


def hex_rgb(value):
    value = value.lstrip("#")
    return np.array([int(value[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


def hls_planes(rgb):
    """Vectorised RGB to HLS."""
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


def ramp_color(ramp, t):
    stops = [hex_rgb(c) for c in ramp]
    t = np.clip(t, 0.0, 1.0) * (len(stops) - 1)
    lo = np.floor(t).astype(int)
    hi = np.minimum(lo + 1, len(stops) - 1)
    frac = (t - lo)[..., None]
    table = np.stack(stops)
    return table[lo] * (1 - frac) + table[hi] * frac


def classify_materials(cell):
    rgb = cell[:, :, :3]
    alpha = cell[:, :, 3]
    h, w = alpha.shape
    hue, light, sat = hls_planes(rgb)
    hue = hue * 360
    opaque = alpha > 96
    y_coords = np.arange(h)[:, None]
    x_coords = np.arange(w)[None, :]

    # 1. Amber eye irises: include core and subtle eye shading in the eye socket region
    eye_box = (y_coords >= 55) & (y_coords <= 90) & (x_coords >= 40) & (x_coords <= 125)
    eyes = opaque & eye_box & (
        ((light >= 0.25) & (light <= 0.88) & (sat >= 0.28) & (hue >= 20) & (hue <= 62)) |
        ((light >= 0.35) & (sat >= 0.40) & (hue >= 18) & (hue <= 68))
    )

    # 2. Exclude laptop paw logo and paws from hoodie
    laptop_paw = (y_coords >= 140) & (x_coords <= 75) & (y_coords <= 185)
    hoodie_all = opaque & ~laptop_paw & (hue >= 95) & (hue <= 175) & (sat >= 0.15) & (y_coords >= 70)

    # Hoodie knit stripes are strictly high-lightness green hoodie stitches (light >= 0.79)
    # This completely protects the white paws/claws from being misclassified as stripes!
    hoodie_stripes = hoodie_all & (light >= 0.79)
    hoodie_green = hoodie_all & (light < 0.79)

    # 4. Laptop chassis:
    laptop_area = (y_coords >= 120) & (x_coords <= 110)
    laptop_chassis = opaque & laptop_area & (y_coords >= 122) & (hue >= 15) & (hue <= 60) & (sat >= 0.05) & (sat <= 0.25) & (light >= 0.28) & (light <= 0.65)

    # 5. Laptop paw logo:
    paw_logo = opaque & laptop_area & (y_coords >= 140) & (hue >= 115) & (hue <= 165) & (sat >= 0.20) & (light >= 0.58)

    # 6. Inner ears:
    inner_ears = opaque & (y_coords <= 45) & ((hue <= 25) | (hue >= 345)) & (sat >= 0.10) & (light >= 0.25) & (light <= 0.55)

    return {
        "opaque": opaque,
        "light": light,
        "eyes": eyes,
        "hoodie_green": hoodie_green,
        "hoodie_stripes": hoodie_stripes,
        "laptop_chassis": laptop_chassis,
        "paw_logo": paw_logo,
        "inner_ears": inner_ears,
    }


def find_cat_metrics(cell, cls, row=0):
    alpha = cell[:, :, 3]
    h, w = alpha.shape
    op = alpha > 128
    if not op.any():
        return None
    ys, xs = np.nonzero(op)
    top_y = ys.min()
    bottom_y = ys.max()

    is_sleepy = (row == 5) or ((bottom_y - top_y) < 80 and top_y > 35)

    upper = op & (np.arange(h)[:, None] < top_y + 45)
    u_ys, u_xs = np.nonzero(upper)
    head_cx = float(np.median(u_xs)) if len(u_xs) else float(np.median(xs))

    left_ear_pts = [(y, x) for y, x in zip(u_ys, u_xs) if x < head_cx - 10]
    right_ear_pts = [(y, x) for y, x in zip(u_ys, u_xs) if x > head_cx + 10]
    l_ear = min(left_ear_pts, key=lambda p: p[0]) if left_ear_pts else (top_y + 5, int(head_cx - 35))
    r_ear = min(right_ear_pts, key=lambda p: p[0]) if right_ear_pts else (top_y + 5, int(head_cx + 35))

    # Outer ear base (sides of head below ear tips)
    l_side_pts = [p for p in left_ear_pts if p[0] > top_y + 12]
    r_side_pts = [p for p in right_ear_pts if p[0] > top_y + 12]
    l_side = min(l_side_pts, key=lambda p: p[1]) if l_side_pts else (l_ear[0] + 16, l_ear[1] - 4)
    r_side = max(r_side_pts, key=lambda p: p[1]) if r_side_pts else (r_ear[0] + 16, r_ear[1] + 4)

    # Eyes
    eye_ys, eye_xs = np.nonzero(cls["eyes"])
    if len(eye_ys) >= 8:
        eye_cx = float(np.mean(eye_xs))
        eye_cy = float(np.mean(eye_ys))
    else:
        # Fallback for closed eyes / sleep
        if is_sleepy:
            eye_cx = head_cx - 5
            eye_cy = float(top_y + 36)
        else:
            eye_cx = head_cx - 8
            eye_cy = float(top_y + 42)

    between = op & (np.abs(np.arange(w)[None, :] - head_cx) < 12)
    top_crown = int(np.nonzero(between)[0].min()) if between.any() else top_y + 10

    # Desk plane (lower left area, table surface is around y=168..185)
    desk_pts = [(y, x) for y, x in zip(ys, xs) if y > 155 and x < 45]
    desk_x = min([p[1] for p in desk_pts]) if desk_pts else 15
    desk_y = min([p[0] for p in desk_pts]) if desk_pts else 165

    return {
        "top_y": top_y,
        "bottom_y": bottom_y,
        "head_cx": head_cx,
        "top_crown": top_crown,
        "l_ear": (int(l_ear[1]), int(l_ear[0])),
        "r_ear": (int(r_ear[1]), int(r_ear[0])),
        "l_side": (int(l_side[1]), int(l_side[0])),
        "r_side": (int(r_side[1]), int(r_side[0])),
        "eye_c": (eye_cx, eye_cy),
        "is_sleepy": is_sleepy,
        "desk": (desk_x, desk_y),
    }


def draw_accessory(cell, shape_type, m):
    h, w, _ = cell.shape
    img = Image.fromarray(cell)
    draw = ImageDraw.Draw(img)
    is_sleepy = m["is_sleepy"]
    hcx = m["head_cx"]
    top_y = m["top_y"]

    if shape_type == "mug":
        # Midnight Coder: ceramic mug resting on the table surface to the left
        # Desk surface is around y=168..184, x=4..22
        mx, my = 8, min(h - 26, max(158, m["desk"][1] + 2))
        mw, mh = 12, 14
        # Mug body (cream white ceramic with navy rim)
        draw.rectangle([mx, my, mx + mw, my + mh], fill=(245, 245, 250, 255), outline=(15, 23, 42, 255))
        # Handle on left
        draw.line([(mx - 3, my + 3), (mx - 1, my + 3)], fill=(15, 23, 42, 255), width=2)
        draw.line([(mx - 3, my + 3), (mx - 3, my + mh - 3)], fill=(15, 23, 42, 255), width=2)
        draw.line([(mx - 3, my + mh - 3), (mx - 1, my + mh - 3)], fill=(15, 23, 42, 255), width=2)
        # Hot espresso dark line inside
        draw.line([mx + 2, my + 2, mx + mw - 2, my + 2], fill=(90, 40, 15, 255), width=1)
        # Gentle wisps of steam
        for s_idx, (sx, sy_off) in enumerate([(mx + 3, 0), (mx + 7, -2), (mx + 9, 0)]):
            steam_y = my - 3 + sy_off
            draw.line([(sx, steam_y), (sx + (1 if s_idx % 2 == 0 else -1), steam_y - 3), (sx, steam_y - 6)],
                      fill=(220, 235, 255, 175), width=1)

    elif shape_type == "glasses":
        # Indigo: coder blue-light glasses across eyes (persists in all frames)
        ecx, ecy = m["eye_c"]
        gy = int(ecy)
        lw, lh = 18, 14
        left_gx = int(ecx - lw - 3)
        right_gx = int(ecx + 2)
        # Left frame
        draw.rectangle([left_gx, gy - 6, left_gx + lw, gy + 7], outline=(15, 23, 42, 255), width=2)
        # Right frame
        draw.rectangle([right_gx, gy - 6, right_gx + lw, gy + 7], outline=(15, 23, 42, 255), width=2)
        # Nose bridge
        draw.line([left_gx + lw, gy, right_gx, gy], fill=(15, 23, 42, 255), width=2)
        # Blue-light anti-glare reflection
        draw.line([left_gx + 3, gy - 3, left_gx + 6, gy], fill=(103, 232, 249, 220), width=1)
        draw.line([right_gx + 3, gy - 3, right_gx + 6, gy], fill=(103, 232, 249, 220), width=1)

    elif shape_type == "headphones":
        # Deep Work Master: over-ear headphones hugging head
        lx, ly = m["l_side"]
        rx, ry = m["r_side"]
        if is_sleepy:
            hb_y = top_y + 10
            draw.line([(lx + 6, ly), (hcx, hb_y), (rx - 4, ry)], fill=(24, 24, 27, 255), width=3)
            draw.line([(hcx - 8, hb_y), (hcx + 8, hb_y)], fill=(220, 38, 38, 255), width=3)
            draw.rounded_rectangle([lx - 2, ly - 4, lx + 8, ly + 14], radius=3, fill=(24, 24, 27, 255), outline=(220, 38, 38, 255), width=2)
            draw.rounded_rectangle([rx - 6, ry - 4, rx + 4, ry + 14], radius=3, fill=(24, 24, 27, 255), outline=(220, 38, 38, 255), width=2)
        else:
            hb_y = m["top_crown"] - 1
            draw.line([(lx + 4, ly), (hcx, hb_y), (rx - 4, ry)], fill=(24, 24, 27, 255), width=3)
            draw.line([(hcx - 10, hb_y), (hcx + 10, hb_y)], fill=(220, 38, 38, 255), width=3)
            draw.rounded_rectangle([lx - 5, ly - 5, lx + 7, ly + 13], radius=3, fill=(24, 24, 27, 255), outline=(220, 38, 38, 255), width=2)
            draw.rounded_rectangle([rx - 7, ry - 5, rx + 5, ry + 13], radius=3, fill=(24, 24, 27, 255), outline=(220, 38, 38, 255), width=2)

    elif shape_type == "lofi":
        # Lo-Fi Beats: DJ headphones (without awkward neck scarf)
        lx, ly = m["l_side"]
        rx, ry = m["r_side"]
        if is_sleepy:
            hb_y = top_y + 10
            draw.line([(lx + 6, ly), (hcx, hb_y), (rx - 4, ry)], fill=(112, 26, 117, 255), width=3)
            draw.rounded_rectangle([lx - 2, ly - 4, lx + 8, ly + 14], radius=3, fill=(112, 26, 117, 255), outline=(244, 114, 182, 255), width=2)
            draw.rounded_rectangle([rx - 6, ry - 4, rx + 4, ry + 14], radius=3, fill=(112, 26, 117, 255), outline=(244, 114, 182, 255), width=2)
        else:
            hb_y = m["top_crown"] - 1
            draw.line([(lx + 4, ly), (hcx, hb_y), (rx - 4, ry)], fill=(112, 26, 117, 255), width=3)
            draw.line([(hcx - 10, hb_y), (hcx + 10, hb_y)], fill=(244, 114, 182, 255), width=2)
            draw.rounded_rectangle([lx - 5, ly - 5, lx + 7, ly + 13], radius=3, fill=(112, 26, 117, 255), outline=(244, 114, 182, 255), width=2)
            draw.rounded_rectangle([rx - 7, ry - 5, rx + 5, ry + 13], radius=3, fill=(112, 26, 117, 255), outline=(244, 114, 182, 255), width=2)

    elif shape_type == "goggles":
        # Aurora: amber visor / cyber goggles pushed up on forehead
        gy = top_y + (16 if is_sleepy else 24)
        draw.line([(hcx - 34, gy + 3), (hcx, gy + 1), (hcx + 34, gy + 3)], fill=(24, 18, 14, 255), width=2)
        # Angled lenses
        draw.polygon([(hcx - 24, gy - 6), (hcx - 4, gy - 6), (hcx - 6, gy + 8), (hcx - 26, gy + 8)],
                     fill=(245, 158, 11, 255), outline=(24, 18, 14, 255))
        draw.polygon([(hcx + 4, gy - 6), (hcx + 24, gy - 6), (hcx + 26, gy + 8), (hcx + 6, gy + 8)],
                     fill=(245, 158, 11, 255), outline=(24, 18, 14, 255))
        # Glint
        draw.line([(hcx - 18, gy - 2), (hcx - 12, gy + 3)], fill=(254, 243, 199, 240), width=1)
        draw.line([(hcx + 10, gy - 2), (hcx + 16, gy + 3)], fill=(254, 243, 199, 240), width=1)

    elif shape_type == "antennae":
        # Amber-Flow Solar Resonator: cyber antennae on ear tips
        lx, ly = m["l_ear"]
        rx, ry = m["r_ear"]
        if is_sleepy:
            # Trailing along curled ears
            draw.line([(lx, ly + 2), (lx - 10, ly - 4)], fill=(30, 30, 30, 255), width=2)
            draw.polygon([(lx - 14, ly - 4), (lx - 10, ly - 8), (lx - 6, ly - 4), (lx - 10, ly)],
                         fill=(249, 115, 22, 255), outline=(254, 215, 170, 255))
            draw.line([(rx, ry + 2), (rx + 8, ry - 4)], fill=(30, 30, 30, 255), width=2)
            draw.polygon([(rx + 6, ry - 4), (rx + 10, ry - 8), (rx + 14, ry - 4), (rx + 10, ry)],
                         fill=(249, 115, 22, 255), outline=(254, 215, 170, 255))
        else:
            # Metal base cuffs
            draw.rectangle([lx - 3, ly, lx + 3, ly + 3], fill=(120, 53, 15, 255), outline=(24, 24, 24, 255))
            draw.rectangle([rx - 3, ry, rx + 3, ry + 3], fill=(120, 53, 15, 255), outline=(24, 24, 24, 255))
            # Upright stems
            draw.line([(lx, ly + 1), (lx - 3, ly - 12)], fill=(30, 30, 30, 255), width=2)
            draw.polygon([(lx - 7, ly - 15), (lx - 3, ly - 20), (lx + 1, ly - 15), (lx - 3, ly - 10)],
                         fill=(249, 115, 22, 255), outline=(254, 215, 170, 255))
            draw.line([(rx, ry + 1), (rx + 3, ry - 12)], fill=(30, 30, 30, 255), width=2)
            draw.polygon([(rx - 1, ry - 15), (rx + 3, ry - 20), (rx + 7, ry - 15), (rx + 3, ry - 10)],
                         fill=(249, 115, 22, 255), outline=(254, 215, 170, 255))

    elif shape_type == "synth_shades":
        # Synthwave: 80s cyber shutter-shades visor (persists in all frames)
        ecx, ecy = m["eye_c"]
        vy = int(ecy)
        vx0, vx1 = int(ecx - 24), int(ecx + 24)
        draw.polygon([(vx0, vy - 7), (vx1, vy - 7), (vx1 - 3, vy + 7), (vx0 + 3, vy + 7)],
                     fill=(0, 240, 255, 235), outline=(217, 70, 239, 255))
        draw.line([(vx0 + 2, vy - 2), (vx1 - 2, vy - 2)], fill=(217, 70, 239, 255), width=1)
        draw.line([(vx0 + 3, vy + 2), (vx1 - 3, vy + 2)], fill=(217, 70, 239, 255), width=1)

    elif shape_type == "astral_horns":
        # Astral Mind Cat: cosmic crystal horns + 4-point star gem
        lx, ly = m["l_ear"]
        rx, ry = m["r_ear"]
        if is_sleepy:
            draw.polygon([(lx, ly + 2), (lx - 10, ly - 8), (lx + 2, ly - 4)],
                         fill=(94, 234, 212, 255), outline=(15, 118, 110, 255))
            draw.polygon([(rx, ry + 2), (rx + 10, ry - 8), (rx - 2, ry - 4)],
                         fill=(94, 234, 212, 255), outline=(15, 118, 110, 255))
            gy = top_y + 20
        else:
            draw.polygon([(lx, ly + 2), (lx - 10, ly - 16), (lx + 4, ly - 6)],
                         fill=(94, 234, 212, 255), outline=(15, 118, 110, 255))
            draw.polygon([(rx, ry + 2), (rx + 10, ry - 16), (rx - 4, ry - 6)],
                         fill=(94, 234, 212, 255), outline=(15, 118, 110, 255))
            gy = top_y + 32
        # Forehead starlight cross gem
        draw.polygon([(hcx, gy - 6), (hcx + 5, gy), (hcx, gy + 6), (hcx - 5, gy)],
                     fill=(45, 212, 191, 255), outline=(240, 253, 250, 255))

    elif shape_type == "halo":
        # Timeless Architect: ethereal floating architect halo above ears
        hy = max(2, top_y - (4 if is_sleepy else 8))
        rx, ry = 30, (6 if is_sleepy else 8)
        draw.ellipse([hcx - rx, hy - ry, hcx + rx, hy + ry], outline=(234, 179, 8, 255), width=2)
        draw.ellipse([hcx - rx + 2, hy - ry + 1, hcx + rx - 2, hy + ry - 1], outline=(254, 240, 138, 255), width=1)

    return np.array(img)


def recolor_materials(cell, cls, form):
    out = cell.astype(np.float32)
    light = cls["light"]

    if cls["hoodie_green"].any():
        t = (light - 0.15) / 0.50
        out[cls["hoodie_green"], :3] = ramp_color(form["hoodie"], t)[cls["hoodie_green"]]

    if cls["hoodie_stripes"].any():
        t = (light - 0.70) / 0.28
        out[cls["hoodie_stripes"], :3] = ramp_color(form["stripe"], t)[cls["hoodie_stripes"]]

    if cls["eyes"].any():
        t = (light - 0.25) / 0.52
        out[cls["eyes"], :3] = ramp_color(form["eyes"], t)[cls["eyes"]]

    if cls["laptop_chassis"].any():
        t = (light - 0.28) / 0.35
        out[cls["laptop_chassis"], :3] = ramp_color(form["laptop"][:2], t)[cls["laptop_chassis"]]

    if cls["paw_logo"].any():
        t = (light - 0.58) / 0.30
        out[cls["paw_logo"], :3] = ramp_color(form["laptop"][2:], t)[cls["paw_logo"]]

    if cls["inner_ears"].any():
        t = (light - 0.25) / 0.30
        out[cls["inner_ears"], :3] = ramp_color(form["inner_ears"], t)[cls["inner_ears"]]

    return np.clip(out, 0, 255).astype(np.uint8)


def build_cell(cell, form, row=0):
    if (cell[:, :, 3] > 0).sum() == 0:
        return cell

    cls = classify_materials(cell)
    recolored = recolor_materials(cell, cls, form)

    shape_type = form["shape"]
    if shape_type != "none":
        metrics = find_cat_metrics(recolored, cls, row=row)
        if metrics is not None:
            recolored = draw_accessory(recolored, shape_type, metrics)

    return recolored


def avatar_from(cell):
    ys, xs = np.nonzero(cell[:, :, 3] > 0)
    crop = Image.fromarray(cell[ys.min():ys.max() + 1, xs.min():xs.max() + 1])
    scale = min((AVATAR - 2) / crop.width, (AVATAR - 2) / crop.height)
    crop = crop.resize((max(1, round(crop.width * scale)), max(1, round(crop.height * scale))), Image.LANCZOS)
    canvas = Image.new("RGBA", (AVATAR, AVATAR), (0, 0, 0, 0))
    canvas.paste(crop, ((AVATAR - crop.width) // 2, (AVATAR - crop.height) // 2))
    return canvas


def build_form(form_id, form, source_arr):
    print(f"Building {form_id:12s} shape={form['shape']} ...", flush=True)
    out_arr = np.zeros_like(source_arr)
    for r in range(ROWS):
        for c in range(COLS):
            cell = source_arr[r * CELL_H : (r + 1) * CELL_H, c * CELL_W : (c + 1) * CELL_W]
            out_arr[r * CELL_H : (r + 1) * CELL_H, c * CELL_W : (c + 1) * CELL_W] = build_cell(cell, form, row=r)

    form_dir = PET_DIR / "forms" / form_id
    form_dir.mkdir(parents=True, exist_ok=True)
    out_img = Image.fromarray(out_arr)
    out_img.save(form_dir / "spritesheet.webp", quality=92, alpha_quality=100, method=6)
    avatar = avatar_from(out_arr[0:CELL_H, 0:CELL_W])
    avatar.save(form_dir / "avatar.png")

    alpha = out_arr[:, :, 3] > 0
    alpha_hash = hashlib.sha1(np.packbits(alpha).tobytes()).hexdigest()[:12]
    opaque_count = int(alpha.sum())
    return {
        "shape": form["shape"],
        "alphaHash": alpha_hash,
        "opaquePixels": opaque_count,
        "hoodie": form["hoodie"],
        "eyes": form["eyes"],
    }


def main():
    target_ids = sys.argv[1:] or list(FORMS.keys())
    source_img = Image.open(SOURCE).convert("RGBA")
    source_arr = np.array(source_img)

    manifest_path = PET_DIR / "forms" / "manifest.json"
    manifest = {"forms": {}}
    if manifest_path.exists():
        try:
            manifest = json.loads(manifest_path.read_text("utf8"))
        except Exception:
            manifest = {"forms": {}}

    for form_id in target_ids:
        if form_id not in FORMS:
            sys.exit(f"Unknown form id: {form_id}")
        info = build_form(form_id, FORMS[form_id], source_arr)
        manifest["forms"][form_id] = info

    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", "utf8")
    print(f"Wrote {manifest_path}")


if __name__ == "__main__":
    main()
