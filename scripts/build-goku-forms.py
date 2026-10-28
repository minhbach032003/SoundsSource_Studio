#!/usr/bin/env python3
"""Build the ten Son Goku form spritesheets with distinct silhouettes and authentic canon outfits.

Key principles:
1. Distinct hair silhouettes: Base (squashed & widened), Lifted (God/MUI), SSJ, SSJ2 (taller & sharper), SSJ3 (long flowing mane).
2. Clean material classification: NEVER treat forehead skin highlights as hair.
3. Authentic outfits: Base/Kaio-ken Kanji, SS1/SS2 classic gi, Whis Gi for SS Blue, Torn navy undershirt for UI-Sign, and Shirtless for MUI.
4. Sharp pixel art without blur or halos.
"""

import hashlib
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path("/Users/mac/Documents/rust-sound")
PET_DIR = ROOT / "public" / "pets" / "super-saiyan-goku"
SOURCE = PET_DIR / "spritesheet.webp"
COLS, ROWS = 8, 9
CELL_W, CELL_H = 192, 208
AVATAR = 128

# Palettes (Darkest to Lightest)
PALETTES = {
    "base": {
        "hairShape": "base",
        "hair": [(10, 10, 16), (22, 22, 32), (40, 42, 56), (70, 75, 95)],
        "iris": [(10, 10, 15), (20, 25, 35)],
        "outline": (10, 10, 15, 255),
    },
    "kaioken": {
        "hairShape": "base",
        "hair": [(28, 10, 14), (52, 16, 22), (88, 25, 35), (135, 42, 55)],
        "iris": [(15, 5, 8), (35, 12, 18)],
        "outline": (30, 8, 12, 255),
    },
    "ss1": {
        "hairShape": "ssj",
        "hair": [(120, 70, 0), (185, 125, 10), (245, 195, 30), (255, 240, 120)],
        "iris": [(20, 110, 95), (40, 180, 155)],
        "outline": (60, 32, 0, 255),
    },
    "ss2": {
        "hairShape": "ssj2",
        "hair": [(130, 75, 0), (200, 135, 12), (255, 210, 35), (255, 248, 140)],
        "iris": [(20, 110, 95), (40, 180, 155)],
        "outline": (60, 32, 0, 255),
    },
    "ss3": {
        "hairShape": "ssj3",
        "hair": [(140, 66, 0), (200, 118, 4), (255, 196, 8), (255, 234, 112)],
        "iris": [(12, 99, 85), (20, 175, 135)],
        "outline": (52, 24, 0, 255),
    },
    "god": {
        "hairShape": "lifted",
        "hair": [(80, 10, 25), (140, 20, 45), (215, 35, 75), (255, 105, 135)],
        "iris": [(160, 18, 42), (225, 48, 75)],
        "outline": (42, 5, 15, 255),
    },
    "ssblue": {
        "hairShape": "ssj",
        "hair": [(14, 75, 125), (22, 120, 185), (52, 198, 240), (168, 236, 255)],
        "iris": [(15, 95, 158), (35, 145, 215)],
        "outline": (6, 40, 75, 255),
    },
    "blue-kaioken": {
        "hairShape": "ssj",
        "hair": [(20, 80, 135), (35, 130, 195), (70, 205, 245), (195, 242, 255)],
        "iris": [(20, 105, 170), (45, 160, 230)],
        "outline": (10, 45, 80, 255),
    },
    "ui-sign": {
        "hairShape": "base",
        "hair": [(12, 12, 18), (26, 28, 38), (55, 60, 78), (110, 118, 140)],
        "iris": [(115, 122, 138), (185, 192, 208)],
        "outline": (10, 10, 15, 255),
    },
    "mui": {
        "hairShape": "lifted",
        "hair": [(100, 108, 125), (148, 156, 175), (210, 215, 226), (255, 255, 255)],
        "iris": [(145, 152, 168), (225, 230, 240)],
        "outline": (45, 50, 65, 255),
    },
}

SHAPE_SCALE = {
    "base": (0.60, 1.14),
    "lifted": (0.76, 1.08),
    "ssj": (1.00, 1.00),
    "ssj2": (1.08, 0.97),
    "ssj3": (1.00, 1.00),
}

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

def classify_cell(cell):
    r, g, b, a = cell[:, :, 0], cell[:, :, 1], cell[:, :, 2], cell[:, :, 3]
    cx = 96
    
    # Precise Hair: Golden pixels strictly above neck (y < 105 or outer side flares)
    # Exclude skin! Skin has B >= 110 (e.g. B=174)
    is_upper_hair_region = (np.arange(CELL_H)[:, None] < 105) | (
        (np.arange(CELL_H)[:, None] < 125) & (np.abs(np.arange(CELL_W)[None, :] - cx) > 42)
    )
    is_hair = (a > 96) & is_upper_hair_region & (b <= 85) & (g >= 40) & (r >= 80) & (r > b + 40)
    is_hair_outline = (a > 96) & is_upper_hair_region & (r < 50) & (g < 40) & (b < 30)
    
    # Skin: high R, high G, and B >= 110
    skin = (a > 96) & (r > 185) & (g > 130) & (b > 90) & (b >= 110)
    
    # Hairline estimation
    hair_ys, hair_xs = np.nonzero(is_hair)
    hairline = 70
    if len(hair_ys) > 0:
        hairline = int(np.percentile(hair_ys, 85))
        
    return {
        "hair": is_hair,
        "hair_outline": is_hair_outline,
        "skin": skin,
        "cx": cx,
        "hairline": hairline,
    }

def reshape_hair(cell, cls, vscale, hscale):
    if vscale == 1.0 and hscale == 1.0:
        return cell, cls["hair"].copy()
    h, w = cls["hair"].shape
    top = np.zeros((h, w), dtype=bool)
    line = cls["hairline"]
    top[:line, :] = True
    
    keep = dilate(cls["skin"], 2)
    movable = top & dilate(cls["hair"], 6) & (cell[:, :, 3] > 0) & ~keep
    out = cell.copy()
    out[movable] = 0
    hair = cls["hair"] & ~top
    cx = cls["cx"]
    
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

def build_cell(cell, form_id="base", row=0, col=0):
    if (cell[:, :, 3] > 0).sum() == 0:
        return cell
        
    cls = classify_cell(cell)
    cx = cls["cx"]
    vscale, hscale = SHAPE_SCALE[PALETTES[form_id]["hairShape"]]
    
    # Reshape hair silhouette
    shaped_cell, hair_mask = reshape_hair(cell, cls, vscale, hscale)
    out = shaped_cell.copy()
    
    r_val, g_val, b_val, a_val = out[:, :, 0], out[:, :, 1], out[:, :, 2], out[:, :, 3]
    
    # 1. Recolor hair
    pal = PALETTES[form_id]
    h_stops = pal["hair"]
    c_arr = np.array(h_stops, dtype=float)
    
    hair_lum = (r_val.astype(float) * 0.299 + g_val.astype(float) * 0.587 + b_val.astype(float) * 0.114) / 255.0
    t = np.clip((hair_lum - 0.25) / 0.55, 0.0, 1.0)
    idx = t * 3.0
    i0 = np.clip(np.floor(idx).astype(int), 0, 2)
    i1 = np.clip(i0 + 1, 0, 3)
    f = (idx - i0)[..., None]
    hair_rgb = c_arr[i0] * (1 - f) + c_arr[i1] * f
    out[hair_mask, :3] = hair_rgb[hair_mask].astype(np.uint8)
    
    # Hair outline recolor
    out_mask = (a_val > 96) & (r_val < 50) & (g_val < 40) & (b_val < 30) & (np.arange(CELL_H)[:, None] < cls["hairline"])
    out[out_mask, :3] = pal["outline"][:3]
    
    # 2. Perfect Iris Recolor (ONLY actual teal iris pixels in source sprite):
    is_iris = (a_val > 96) & (g_val > 150) & (b_val > 150) & (r_val < 100)
    iris_stops = pal["iris"]
    iris_lum = np.clip((g_val.astype(float) - 150) / 60.0, 0.0, 1.0)[..., None]
    iris_rgb = np.array(iris_stops[0], dtype=float) * (1 - iris_lum) + np.array(iris_stops[1], dtype=float) * iris_lum
    out[is_iris, :3] = iris_rgb[is_iris].astype(np.uint8)
    
    # 3. Kaio-ken / Blue Kaio-ken skin glow
    if form_id in ("kaioken", "blue-kaioken"):
        skin_mask = (a_val > 96) & (r_val > 185) & (g_val > 130) & (b_val > 90) & (b_val >= 110) & ~hair_mask
        tint = np.array([255, 95, 95] if form_id == "kaioken" else [255, 125, 145], dtype=float)
        factor = 0.20 if form_id == "kaioken" else 0.14
        out[skin_mask, :3] = np.clip(out[skin_mask, :3].astype(float) * (1 - factor) + tint * factor, 0, 255).astype(np.uint8)

    # 4. Outfits: STRICTLY THE SHIRT (between neck and belt, y=115..142)
    orange_shirt = (a_val > 96) & (r_val > 130) & (g_val > 55) & (g_val < 175) & (b_val < 65) & (r_val > g_val + 25) & (np.arange(CELL_H)[:, None] < 143) & (np.arange(CELL_H)[:, None] >= 115) & (np.abs(np.arange(CELL_W)[None, :] - cx) < 30)
    blue_chest = (a_val > 96) & (b_val > 100) & (r_val < 75) & (g_val < 100) & (np.arange(CELL_H)[:, None] < 142)

    fx = Image.fromarray(out)
    draw = ImageDraw.Draw(fx)
    
    if form_id == "base":
        draw.ellipse([80, 124, 90, 134], fill=(250, 250, 250, 255), outline=(20, 20, 20, 255), width=1)
        draw.line([(83, 127), (87, 127)], fill=(20, 20, 20, 255), width=1)
        draw.line([(85, 127), (85, 132)], fill=(20, 20, 20, 255), width=1)
        draw.line([(83, 129), (87, 129)], fill=(20, 20, 20, 255), width=1)
        draw.line([(83, 132), (87, 132)], fill=(20, 20, 20, 255), width=1)
        return np.array(fx)
        
    elif form_id == "kaioken":
        draw.ellipse([80, 124, 90, 134], fill=(250, 250, 250, 255), outline=(140, 20, 20, 255), width=1)
        draw.line([(83, 127), (87, 127)], fill=(140, 20, 20, 255), width=1)
        draw.line([(85, 126), (85, 133)], fill=(140, 20, 20, 255), width=1)
        draw.line([(82, 130), (88, 130)], fill=(140, 20, 20, 255), width=1)
        return np.array(fx)
        
    elif form_id in ("ss1", "ss2"):
        if form_id == "ss2":
            draw.polygon([(cx - 2, 70), (cx + 3, 70), (cx + 5, 82), (cx + 1, 92), (cx - 2, 95), (cx, 84)], fill=(255, 210, 35, 255), outline=(60, 32, 0, 255))
            draw.line([(cx + 2, 72), (cx + 3, 84), (cx, 93)], fill=(255, 248, 140, 255), width=1)
            draw.line([(cx - 22, 120), (cx - 25, 125), (cx - 20, 128)], fill=(100, 240, 255, 255), width=2)
            draw.line([(cx + 24, 130), (cx + 28, 134), (cx + 23, 140)], fill=(100, 240, 255, 255), width=2)
        return np.array(fx)
        
    elif form_id == "ss3":
        res = out.copy()
        # Remove brows (y=83..89, x=80..112)
        brows = (np.arange(CELL_H)[:, None] >= 83) & (np.arange(CELL_H)[:, None] <= 89) & (np.abs(np.arange(CELL_W)[None, :] - cx) <= 16) & (res[:, :, 3] > 0) & (res[:, :, :3].mean(axis=-1) < 80)
        res[brows, :3] = [254, 212, 174]
        
        back_img = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
        b_draw = ImageDraw.Draw(back_img)
        
        C_OUTLINE = (52, 24, 0, 255)
        C_MID = (200, 118, 4, 255)
        C_BASE = (255, 196, 8, 255)
        C_HI = (255, 234, 112, 255)
        
        # Massive, thick layered cascading mane with rich volume flowing to mid-thigh (>1.25x SSJ1 volume)
        downward_locks = [
            ([(cx - 35, 65), (cx - 52, 75), (cx - 64, 98), (cx - 52, 106), (cx - 35, 85)], [(cx - 45, 78), (cx - 58, 96)]),
            ([(cx - 34, 88), (cx - 58, 104), (cx - 72, 128), (cx - 56, 138), (cx - 32, 112)], [(cx - 48, 104), (cx - 65, 126)]),
            ([(cx - 32, 114), (cx - 62, 132), (cx - 76, 158), (cx - 58, 168), (cx - 30, 138)], [(cx - 50, 132), (cx - 68, 156)]),
            ([(cx - 28, 140), (cx - 56, 160), (cx - 68, 188), (cx - 50, 194), (cx - 24, 162)], [(cx - 45, 158), (cx - 60, 185)]),
            ([(cx - 24, 158), (cx - 48, 178), (cx - 54, 202), (cx - 36, 200), (cx - 18, 175)], [(cx - 38, 176), (cx - 46, 198)]),
        ]
        for poly_l, spine_l in downward_locks:
            b_draw.polygon(poly_l, fill=C_BASE, outline=C_OUTLINE)
            b_draw.line([poly_l[0], poly_l[1]], fill=C_MID, width=2)
            b_draw.line(spine_l, fill=C_HI, width=2)
            poly_r = [(2 * cx - x, y) for (x, y) in poly_l]
            spine_r = [(2 * cx - x, y) for (x, y) in spine_l]
            b_draw.polygon(poly_r, fill=C_BASE, outline=C_OUTLINE)
            b_draw.line([poly_r[0], poly_r[1]], fill=C_MID, width=2)
            b_draw.line(spine_r, fill=C_HI, width=2)
            
        center_tips = [
            ([(cx - 12, 154), (cx - 14, 176), (cx - 10, 195), (cx - 5, 172), (cx - 6, 156)], [(cx - 10, 166), (cx - 10, 188)]),
            ([(cx - 5, 158), (cx - 2, 180), (cx, 198), (cx + 2, 180), (cx + 5, 158)], [(cx, 168), (cx, 192)]),
            ([(cx + 6, 156), (cx + 5, 172), (cx + 10, 195), (cx + 14, 176), (cx + 12, 154)], [(cx + 10, 166), (cx + 10, 188)]),
        ]
        for poly_c, spine_c in center_tips:
            b_draw.polygon(poly_c, fill=C_BASE, outline=C_OUTLINE)
            b_draw.line(spine_c, fill=C_HI, width=2)
            
        front_img = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
        f_draw = ImageDraw.Draw(front_img)
        line = 68
        main_bang = [
            (cx - 3, line - 4), (cx + 5, line - 2), (cx + 8, line + 10), (cx + 5, line + 22),
            (cx + 1, line + 28), (cx - 2, line + 32), (cx - 1, line + 18), (cx + 3, line + 6), (cx - 3, line + 2),
        ]
        f_draw.polygon(main_bang, fill=C_BASE, outline=C_OUTLINE)
        f_draw.line([(cx + 3, line), (cx + 5, line + 12), (cx + 1, line + 26)], fill=C_HI, width=2)
        f_draw.line([(cx - 2, line), (cx - 1, line + 16)], fill=C_MID, width=2)
        
        final = np.array(back_img)
        body_px = res[:, :, 3] > 0
        final[body_px] = res[body_px]
        front_px = np.array(front_img)[:, :, 3] > 0
        final[front_px] = np.array(front_img)[front_px]
        return final

    elif form_id in ("ssblue", "blue-kaioken"):
        # Whis Gi: No blue undershirt! Orange fabric wrap with Whis signature
        res = out.copy()
        light = (cell[:, :, :3].astype(float).mean(axis=-1) / 255.0)
        orange_shadow = np.array([170, 75, 10], dtype=float)
        orange_mid = np.array([220, 115, 20], dtype=float)
        orange_hi = np.array([250, 155, 35], dtype=float)
        t = np.clip((light - 0.25) / 0.45, 0.0, 1.0)
        orange_shaded = np.where(t[..., None] < 0.5,
                                 orange_shadow * (1 - t[..., None] * 2) + orange_mid * (t[..., None] * 2),
                                 orange_mid * (1 - (t[..., None] - 0.5) * 2) + orange_hi * ((t[..., None] - 0.5) * 2))
        res[blue_chest, :3] = orange_shaded[blue_chest].astype(np.uint8)
        
        fx = Image.fromarray(res)
        draw = ImageDraw.Draw(fx)
        draw.arc([82, 126, 90, 134], start=30, end=330, fill=(20, 15, 10, 255), width=2)
        draw.line([(86, 130), (86, 133)], fill=(20, 15, 10, 255), width=2)
        return np.array(fx)
        
    elif form_id == "ui-sign":
        # UI -Sign-: Shredded orange gi showing dark navy undershirt with tears
        res = out.copy()
        light = (cell[:, :, :3].astype(float).mean(axis=-1) / 255.0)
        navy_shadow = np.array([18, 32, 74], dtype=float)
        navy_mid = np.array([30, 56, 128], dtype=float)
        navy_hi = np.array([55, 95, 185], dtype=float)
        t = np.clip((light - 0.25) / 0.45, 0.0, 1.0)
        navy_shaded = np.where(t[..., None] < 0.5,
                               navy_shadow * (1 - t[..., None] * 2) + navy_mid * (t[..., None] * 2),
                               navy_mid * (1 - (t[..., None] - 0.5) * 2) + navy_hi * ((t[..., None] - 0.5) * 2))
        res[orange_shirt, :3] = navy_shaded[orange_shirt].astype(np.uint8)
        
        fx = Image.fromarray(res)
        draw = ImageDraw.Draw(fx)
        draw.polygon([(82, 122), (86, 126), (84, 129), (80, 124)], fill=(254, 212, 174, 255))
        draw.polygon([(106, 124), (111, 122), (112, 127), (108, 129)], fill=(254, 212, 174, 255))
        draw.polygon([(93, 135), (99, 133), (97, 138), (91, 137)], fill=(254, 212, 174, 255))
        return np.array(fx)
        
    elif form_id == "mui":
        # Mastered Ultra Instinct: BARE CHEST / CỞI TRẦN CHIẾN ĐẤU!
        res = out.copy()
        torso_mask = orange_shirt | blue_chest
        light = (cell[:, :, :3].astype(float).mean(axis=-1) / 255.0)
        shadow_skin = np.array([195, 120, 85], dtype=float)
        mid_skin = np.array([238, 175, 135], dtype=float)
        hi_skin = np.array([254, 212, 174], dtype=float)
        t = np.clip((light - 0.25) / 0.45, 0.0, 1.0)
        skin_shaded = np.where(t[..., None] < 0.5,
                               shadow_skin * (1 - t[..., None] * 2) + mid_skin * (t[..., None] * 2),
                               mid_skin * (1 - (t[..., None] - 0.5) * 2) + hi_skin * ((t[..., None] - 0.5) * 2))
        res[torso_mask, :3] = skin_shaded[torso_mask].astype(np.uint8)
        
        fx = Image.fromarray(res)
        draw = ImageDraw.Draw(fx)
        draw.line([(96, 122), (96, 138)], fill=(160, 95, 65, 255), width=1)
        draw.arc([86, 125, 96, 135], start=0, end=180, fill=(160, 95, 65, 255), width=1)
        draw.arc([96, 125, 106, 135], start=0, end=180, fill=(160, 95, 65, 255), width=1)
        draw.line([(88, 126), (98, 133)], fill=(180, 50, 40, 255), width=1)
        draw.line([(89, 128), (95, 132)], fill=(140, 30, 25, 255), width=1)
        return np.array(fx)
        
    return out

def avatar_from(cell):
    ys, xs = np.nonzero(cell[:, :, 3] > 0)
    if len(ys) == 0 or len(xs) == 0:
        return Image.new("RGBA", (AVATAR, AVATAR), (0, 0, 0, 0))
    crop = Image.fromarray(cell[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1])
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

    for form_id in PALETTES.keys():
        if only and form_id not in only:
            if form_id in previous:
                manifest["forms"][form_id] = previous[form_id]
            continue
        out = sheet.copy()
        for r in range(ROWS):
            for c in range(COLS):
                y0, x0 = r * CELL_H, c * CELL_W
                cell = sheet[y0 : y0 + CELL_H, x0 : x0 + CELL_W]
                out[y0 : y0 + CELL_H, x0 : x0 + CELL_W] = build_cell(cell, form_id=form_id, row=r, col=c)

        target = PET_DIR / "forms" / form_id
        target.mkdir(parents=True, exist_ok=True)
        Image.fromarray(out).save(target / "spritesheet.webp", quality=92, alpha_quality=100, method=6)
        avatar_from(out[0:CELL_H, 0:CELL_W]).save(target / "avatar.png", optimize=True)
        alpha = (out[:, :, 3] > 0).astype(np.uint8)
        
        # Determine shape name for manifest tests
        shape_name = "ssj3" if form_id == "ss3" else "ssj2" if form_id == "ss2" else "lifted" if form_id in ("god", "mui") else "base" if form_id in ("base", "kaioken", "ui-sign") else "ssj"
        
        # Palettes in hex for manifest
        hair_hex = [f"#{c[0]:02x}{c[1]:02x}{c[2]:02x}" for c in PALETTES[form_id]["hair"]]
        iris_hex = [f"#{c[0]:02x}{c[1]:02x}{c[2]:02x}" for c in PALETTES[form_id]["iris"]]
        
        manifest["forms"][form_id] = {
            "hairShape": "ssj3" if form_id == "ss3" else "base" if form_id in ("base", "kaioken", "ui-sign") else "ssj" if form_id in ("ss1", "ssblue", "blue-kaioken") else "ssj2" if form_id == "ss2" else "lifted",
            "hair": hair_hex,
            "iris": iris_hex,
            "skinTint": "#ff5f5f" if form_id == "kaioken" else "#ff7d91" if form_id == "blue-kaioken" else None,
            "browsVisible": form_id != "ss3",
            "alphaHash": hashlib.sha1(alpha.tobytes()).hexdigest()[:16],
            "opaquePixels": int(alpha.sum()),
        }
        print(f"{form_id}: {manifest['forms'][form_id]['opaquePixels']} px (shape={manifest['forms'][form_id]['hairShape']})")

    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    print("Done building all Goku forms!")

if __name__ == "__main__":
    main()
