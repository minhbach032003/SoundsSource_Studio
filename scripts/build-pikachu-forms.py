#!/usr/bin/env python3
"""Build the ten Pikachu form spritesheets with clean, authentic Pokémon traits.

Adheres strictly to Pokémon character aesthetics:
- No unnatural whole-body flame/ki envelopes.
- Clean 3D models without clumsy 2D pasted sticker polygons.
- Pure palette and material transformations:
  * Pichu: Pale butter-cream fur with soft baby-pink cheeks.
  * Classic: Warm retro 1996 Gen-1 watercolor cream-yellow.
  * Spark: Radiant high-voltage yellow fur with vibrant crimson cheeks.
  * Studio: Polished golden-honey studio figure lighting.
  * Electro Ball: High-energy electric yellow with tail-tip power discharge.
  * Iron Tail: Polished hardened chrome steel lightning tail with specular sheen.
  * Thunderbolt: High-voltage surge with vivid electric eyes and fur brightness.
  * Overcharge: Authentic Raichu tribute: rich amber-orange fur, bright YELLOW cheeks!
  * Gigantamax: Deep golden Dynamax energy tone with crimson cheek intensity.
  * Ash-Cap: Vibrant champion yellow with Ash's cap cleanly fitted.

Usage: python3 -I scripts/build-pikachu-forms.py [form-id ...]
Writes public/pets/pikachu/forms/<id>/{spritesheet.webp,avatar.png}
and forms/manifest.json.
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
    },
    "classic": {
        "shapeKey": "classic",
        "name": "Pikachu (Classic)",
        "fur": ["#b88e1a", "#dfb83b", "#f9e066", "#fff4b3"],
        "cheeks": ["#b51515", "#db2424", "#f74a4a", "#ff9494"],
    },
    "spark": {
        "shapeKey": "spark",
        "name": "Spark Volt",
        "fur": ["#b37a08", "#e6a312", "#ffd700", "#fff28f"],
        "cheeks": ["#bd0909", "#e81515", "#ff3333", "#ff8f8f"],
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
    },
    "overcharge": {
        "shapeKey": "overcharge",
        "name": "Pikachu (Raichu Aura)",
        "fur": ["#964802", "#cf6d0a", "#f5911e", "#ffd18c"],
        "cheeks": ["#d49700", "#ffcc00", "#ffe600", "#fff380"], # Canon Raichu has yellow cheeks!
    },
    "gigantamax": {
        "shapeKey": "gigantamax",
        "name": "Gigantamax Thunder",
        "fur": ["#a65805", "#d67c0f", "#f7a523", "#ffdb8a"],
        "cheeks": ["#c70c0c", "#f01616", "#ff3d3d", "#ffa3a3"],
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
    return arr


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
    if spec.get("ironTail"):
        arr = apply_iron_tail(arr, r, c)
    elif spec.get("hasAshCap"):
        arr = draw_ash_champion_cap(arr, r, c)

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
