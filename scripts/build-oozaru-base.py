#!/usr/bin/env python3
import hashlib
import json
from pathlib import Path
from PIL import Image
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
ASSETS_DIR = ROOT / "scripts" / "assets" / "oozaru"
PET_DIR = ROOT / "public" / "pets" / "super-saiyan-goku"
FORMS_DIR = PET_DIR / "forms"
BASE_DIR = FORMS_DIR / "base"
BASE_DIR.mkdir(parents=True, exist_ok=True)

SHEET_W, SHEET_H = 1536, 1872
CELL_W, CELL_H = 192, 208
BASELINE_Y = 202


def clean_alpha(arr, threshold=30):
    cleaned = arr.copy()
    cleaned[cleaned[:, :, 3] < threshold] = [0, 0, 0, 0]
    return cleaned


def harmonize_base_frames(idle_raw, roar_raw):
    c0 = clean_alpha(np.array(idle_raw))
    c4 = clean_alpha(np.array(roar_raw))

    y_grid, x_grid = np.ogrid[:CELL_H, :CELL_W]

    left_pec = (((x_grid - 83.5)**2 / (11.5**2) + (y_grid - 80)**2 / (7.5**2)) <= 1.0)
    right_pec = (((x_grid - 108.5)**2 / (11.5**2) + (y_grid - 80)**2 / (7.5**2)) <= 1.0)
    outline0 = (c0[:, :, 0] < 28) & (c0[:, :, 1] < 28) & (c0[:, :, 2] < 34)
    pec_mask0 = (left_pec | right_pec) & ~outline0 & (c0[:, :, 3] > 64)

    ab_skin0 = (y_grid >= 95) & (y_grid <= 125) & (c0[:, :, 0] > 55) & (c0[:, :, 1] > 55) & (c0[:, :, 2] > 55)

    c0_mod = c0.copy().astype(np.float32)
    ab_mean = c0[ab_skin0][:, :3].mean(axis=0)
    ab_std = c0[ab_skin0][:, :3].std(axis=0)
    pec_raw = c0[pec_mask0][:, :3].astype(np.float32)
    pec_mean = pec_raw.mean(axis=0)
    pec_std = np.maximum(pec_raw.std(axis=0), 1.0)
    c0_mod[pec_mask0, :3] = (pec_raw - pec_mean) * (ab_std / pec_std * 0.9) + ab_mean
    c0_synced = np.clip(c0_mod, 0, 255).astype(np.uint8)

    is_eye0 = (c0_synced[:, :, 0] > 130) & (c0_synced[:, :, 1] < 80) & (c0_synced[:, :, 2] < 80)
    is_skin0 = (c0_synced[:, :, 0] > 50) & (c0_synced[:, :, 1] > 50) & (c0_synced[:, :, 2] > 50) & ~is_eye0 & (c0_synced[:, :, 3] > 64)
    is_fur0 = (c0_synced[:, :, 3] > 64) & ~is_eye0 & ~is_skin0

    is_eye4 = (c4[:, :, 0] > 130) & (c4[:, :, 1] < 80) & (c4[:, :, 2] < 80) & (y_grid < 35)
    is_mouth4 = (c4[:, :, 0] > 90) & (c4[:, :, 1] < 70) & (y_grid >= 35) & (c4[:, :, 3] > 64)
    is_skin4 = (c4[:, :, 0] > 50) & (c4[:, :, 1] > 40) & (c4[:, :, 2] > 40) & ~is_eye4 & ~is_mouth4 & (c4[:, :, 3] > 64)
    is_fur4 = (c4[:, :, 3] > 64) & ~is_eye4 & ~is_mouth4 & ~is_skin4

    c4_out = c4.copy().astype(np.float32)

    f0_mean = c0_synced[is_fur0][:, :3].mean(axis=0)
    f0_std = c0_synced[is_fur0][:, :3].std(axis=0)
    f4_mean = c4[is_fur4][:, :3].mean(axis=0)
    f4_std = c4[is_fur4][:, :3].std(axis=0)
    c4_out[is_fur4, :3] = (c4[is_fur4, :3] - f4_mean) * (f0_std / f4_std) + f0_mean

    s0_mean = c0_synced[is_skin0][:, :3].mean(axis=0)
    s0_std = c0_synced[is_skin0][:, :3].std(axis=0)
    s4_mean = c4[is_skin4][:, :3].mean(axis=0)
    s4_std = c4[is_skin4][:, :3].std(axis=0)
    c4_out[is_skin4, :3] = (c4[is_skin4, :3] - s4_mean) * (s0_std / s4_std) + s0_mean

    eye0_mean = c0_synced[is_eye0][:, :3].mean(axis=0)
    eye0_std = c0_synced[is_eye0][:, :3].std(axis=0)
    eye4_mean = c4[is_eye4][:, :3].mean(axis=0)
    eye4_std = np.maximum(c4[is_eye4][:, :3].std(axis=0), 1.0)
    c4_out[is_eye4, :3] = (c4[is_eye4, :3] - eye4_mean) * (eye0_std / eye4_std) + eye0_mean

    is_pec4 = (y_grid >= 65) & (y_grid < 95) & (c4[:, :, 0] > 50) & (c4[:, :, 1] > 40) & (c4[:, :, 3] > 64)
    c4_out[is_pec4, :3] = c4_out[is_pec4, :3] * 0.82

    feet4_mask = (y_grid >= 170) & (c4[:, :, 0] > 45) & (c4[:, :, 1] > 40) & (c4[:, :, 3] > 64)
    feet0_mask = (y_grid >= 170) & (c0_synced[:, :, 0] > 45) & (c0_synced[:, :, 1] > 40) & (c0_synced[:, :, 3] > 64)
    f0_m = c0_synced[feet0_mask][:, :3].mean(axis=0)
    f0_s = c0_synced[feet0_mask][:, :3].std(axis=0)
    f4_m = c4_out[feet4_mask][:, :3].mean(axis=0)
    f4_s = c4_out[feet4_mask][:, :3].std(axis=0)
    c4_out[feet4_mask, :3] = (c4_out[feet4_mask, :3] - f4_m) * (f0_s / f4_s) + f0_m

    c4_synced = np.clip(c4_out, 0, 255).astype(np.uint8)

    return Image.fromarray(c0_synced), Image.fromarray(c4_synced)


def build_oozaru_sheet():
    idle_im = Image.open(ASSETS_DIR / "oozaru_idle_base.png").convert("RGBA")
    roar_im = Image.open(ASSETS_DIR / "oozaru_roar_base.png").convert("RGBA")

    idle, roar = harmonize_base_frames(idle_im, roar_im)

    c0_cell = idle.copy()

    c1_raw = roar.transpose(Image.FLIP_LEFT_RIGHT).rotate(-10, resample=Image.BICUBIC, center=(96, 200))
    arr1 = np.array(c1_raw)
    non_empty = np.argwhere(arr1[:, :, 3] > 0)
    shift_y1 = BASELINE_Y - non_empty[:, 0].max()
    c1_cell = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
    c1_cell.paste(c1_raw, (0, shift_y1), c1_raw)

    c2_cell = c1_cell.transpose(Image.FLIP_LEFT_RIGHT)
    c3_cell = idle.copy()
    c4_cell = roar.copy()

    c5_cell = idle.copy()
    arr5 = np.array(c5_cell)
    c0_arr = np.array(idle)
    eye_coords = np.argwhere((c0_arr[:, :, 0] > 130) & (c0_arr[:, :, 1] < 80) & (c0_arr[:, :, 2] < 80))
    for y, x in eye_coords:
        arr5[y, x] = [40, 42, 48, 255]
    c5_cell = Image.fromarray(arr5)

    c6_cell = idle.copy()
    c7_cell = roar.copy()
    c8_cell = idle.copy()

    row_bases = [c0_cell, c1_cell, c2_cell, c3_cell, c4_cell, c5_cell, c6_cell, c7_cell, c8_cell]

    sheet = Image.new("RGBA", (SHEET_W, SHEET_H), (0, 0, 0, 0))
    for r in range(9):
        base_cell = row_bases[r]
        for col in range(8):
            bob = int(round(np.sin(col * np.pi / 4.0) * 2.0))
            frame = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
            frame.paste(base_cell, (0, bob), base_cell)
            sheet.paste(frame, (col * CELL_W, r * CELL_H), frame)

    spritesheet_path = BASE_DIR / "spritesheet.webp"
    sheet.save(spritesheet_path, "WEBP", quality=92, alpha_quality=100, method=6)
    print(f"Saved {spritesheet_path} ({spritesheet_path.stat().st_size // 1024} KB)")

    head_crop = idle.crop((42, 4, 150, 112))
    avatar = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    avatar_scaled = head_crop.resize((116, 116), Image.LANCZOS)
    avatar.paste(avatar_scaled, (6, 6), avatar_scaled)
    avatar_path = BASE_DIR / "avatar.png"
    avatar.save(avatar_path, "PNG", optimize=True)
    print(f"Saved {avatar_path} ({avatar_path.stat().st_size // 1024} KB)")

    alpha_bytes = (np.array(sheet)[:, :, 3] > 0).astype(np.uint8).tobytes()
    alpha_hash = hashlib.sha1(alpha_bytes).hexdigest()[:16]
    opaque_count = int(np.sum(np.array(sheet)[:, :, 3] > 0))

    manifest_path = FORMS_DIR / "manifest.json"
    manifest = {}
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text())
    if "forms" not in manifest:
        manifest["forms"] = {}

    manifest["forms"]["base"] = {
        "hairShape": "base",
        "hair": [
            "#1a1c22",
            "#181a1e",
            "#282a32",
            "#393b45"
        ],
        "iris": [
            "#8b0000",
            "#d43828",
            "#ff5544"
        ],
        "skinTint": None,
        "browsVisible": True,
        "alphaHash": alpha_hash,
        "opaquePixels": opaque_count
    }

    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Updated {manifest_path}: base opaquePixels={opaque_count}, alphaHash={alpha_hash}")
    return sheet


if __name__ == "__main__":
    build_oozaru_sheet()
