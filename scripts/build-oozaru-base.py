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


def harmonize_roar_to_idle(c0, c4):
    is_eye0 = (c0[:, :, 0] > 130) & (c0[:, :, 1] < 80) & (c0[:, :, 2] < 80)
    is_muzzle0 = (c0[:, :, 0] > 55) & (c0[:, :, 1] > 55) & (c0[:, :, 2] > 55) & ~is_eye0 & (c0[:, :, 3] > 64)
    is_fur0 = (c0[:, :, 3] > 64) & ~is_eye0 & ~is_muzzle0

    is_eye4 = (c4[:, :, 0] > 130) & (c4[:, :, 1] < 80) & (c4[:, :, 2] < 80) & (np.arange(CELL_H)[:, None] < 35)
    is_mouth4 = (c4[:, :, 0] > 90) & (c4[:, :, 1] < 70) & (np.arange(CELL_H)[:, None] >= 35) & (c4[:, :, 3] > 64)
    is_muzzle4 = (c4[:, :, 0] > 55) & (c4[:, :, 1] > 55) & (c4[:, :, 2] > 55) & ~is_eye4 & ~is_mouth4 & (c4[:, :, 3] > 64)
    is_fur4 = (c4[:, :, 3] > 64) & ~is_eye4 & ~is_muzzle4 & ~is_mouth4

    c4_out = c4.copy().astype(np.float32)

    f0_mean = c0[is_fur0][:, :3].mean(axis=0)
    f0_std = c0[is_fur0][:, :3].std(axis=0)
    f4_mean = c4[is_fur4][:, :3].mean(axis=0)
    f4_std = c4[is_fur4][:, :3].std(axis=0)
    c4_out[is_fur4, :3] = (c4[is_fur4, :3] - f4_mean) * (f0_std / f4_std) + f0_mean

    m0_mean = c0[is_muzzle0][:, :3].mean(axis=0)
    m0_std = c0[is_muzzle0][:, :3].std(axis=0)
    m4_mean = c4[is_muzzle4][:, :3].mean(axis=0)
    m4_std = c4[is_muzzle4][:, :3].std(axis=0)
    c4_out[is_muzzle4, :3] = (c4[is_muzzle4, :3] - m4_mean) * (m0_std / m4_std) + m0_mean

    eye0_mean = c0[is_eye0][:, :3].mean(axis=0)
    eye0_std = c0[is_eye0][:, :3].std(axis=0)
    eye4_mean = c4[is_eye4][:, :3].mean(axis=0)
    eye4_std = np.maximum(c4[is_eye4][:, :3].std(axis=0), 1.0)
    c4_out[is_eye4, :3] = (c4[is_eye4, :3] - eye4_mean) * (eye0_std / eye4_std) + eye0_mean

    return Image.fromarray(np.clip(c4_out, 0, 255).astype(np.uint8))


def build_oozaru_sheet():
    idle_im = Image.open(ASSETS_DIR / "oozaru_idle_base.png").convert("RGBA")
    roar_im = Image.open(ASSETS_DIR / "oozaru_roar_base.png").convert("RGBA")

    c0 = clean_alpha(np.array(idle_im))
    c4 = clean_alpha(np.array(roar_im))

    c4_harmonized = harmonize_roar_to_idle(c0, c4)
    idle = Image.fromarray(c0)

    c0_cell = idle.copy()

    c1_raw = c4_harmonized.transpose(Image.FLIP_LEFT_RIGHT).rotate(-10, resample=Image.BICUBIC, center=(96, 200))
    arr1 = np.array(c1_raw)
    non_empty = np.argwhere(arr1[:, :, 3] > 0)
    shift_y1 = BASELINE_Y - non_empty[:, 0].max()
    c1_cell = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
    c1_cell.paste(c1_raw, (0, shift_y1), c1_raw)

    c2_cell = c1_cell.transpose(Image.FLIP_LEFT_RIGHT)
    c3_cell = idle.copy()
    c4_cell = c4_harmonized.copy()

    c5_cell = idle.copy()
    arr5 = np.array(c5_cell)
    eye_coords = np.argwhere((c0[:, :, 0] > 130) & (c0[:, :, 1] < 80) & (c0[:, :, 2] < 80))
    for y, x in eye_coords:
        arr5[y, x] = [40, 42, 48, 255]
    c5_cell = Image.fromarray(arr5)

    c6_cell = idle.copy()
    c7_cell = c4_harmonized.copy()
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
