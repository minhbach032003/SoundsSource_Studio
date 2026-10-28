import json
import hashlib
from pathlib import Path
from PIL import Image
import numpy as np

ROOT = Path(".")
PET_DIR = ROOT / "public" / "pets" / "super-saiyan-goku"
FORMS_DIR = PET_DIR / "forms"
BASE_DIR = FORMS_DIR / "base"
BASE_DIR.mkdir(parents=True, exist_ok=True)

SHEET_W, SHEET_H = 1536, 1872
CELL_W, CELL_H = 192, 208
BASELINE_Y = 202

idle = Image.open("/tmp/oozaru_anime_palette.png").convert("RGBA")
roar = Image.open("/tmp/oozaru_roar_cell.png").convert("RGBA")

# Ensure transparent background and clean alpha
def clean_alpha(im):
    arr = np.array(im)
    arr[arr[:, :, 3] < 30] = [0, 0, 0, 0]
    return Image.fromarray(arr)

idle = clean_alpha(idle)
roar = clean_alpha(roar)

# 0. Idle
c0 = idle.copy()

# 1. Run-Right (chồm người chạy phải)
c1_raw = roar.transpose(Image.FLIP_LEFT_RIGHT).rotate(-10, resample=Image.BICUBIC, center=(96, 200))
arr1 = np.array(c1_raw)
non_empty = np.argwhere(arr1[:, :, 3] > 0)
shift_y1 = BASELINE_Y - non_empty[:, 0].max()
c1 = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
c1.paste(c1_raw, (0, shift_y1), c1_raw)

# 2. Run-Left (chồm người chạy trái)
c2_raw = roar.rotate(10, resample=Image.BICUBIC, center=(96, 200))
arr2 = np.array(c2_raw)
non_empty = np.argwhere(arr2[:, :, 3] > 0)
shift_y2 = BASELINE_Y - non_empty[:, 0].max()
c2 = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
c2.paste(c2_raw, (0, shift_y2), c2_raw)

# 3. Wave/Done
c3 = idle.copy()

# 4. Celebrate/Levelup (Roar)
c4 = roar.copy()

# 5. Sleepy (Mắt nhắm mí tối)
c5 = idle.copy()
arr5 = np.array(c5)
for y in range(35, 65):
    for x in range(70, 120):
        if arr5[y, x, 0] > 180 and arr5[y, x, 1] < 80 and arr5[y, x, 2] < 80:
            arr5[y, x] = [40, 42, 48, 255]
c5 = Image.fromarray(arr5)

# 6. Waiting
c6 = idle.copy()

# 7. Working (Roar & smash)
c7 = roar.copy()

# 8. Reading
c8 = idle.copy()

row_bases = [c0, c1, c2, c3, c4, c5, c6, c7, c8]

# Create 8x9 full spritesheet
sheet = Image.new("RGBA", (SHEET_W, SHEET_H), (0, 0, 0, 0))

for r in range(9):
    base_cell = row_bases[r]
    for col in range(8):
        # Subtle 2px natural motion
        bob = int(round(np.sin(col * np.pi / 4.0) * 2.0))
        frame = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
        frame.paste(base_cell, (0, bob), base_cell)
        sheet.paste(frame, (col * CELL_W, r * CELL_H), frame)

# Save WebP according to skill standards: quality=92, alpha_quality=100, method=6
spritesheet_path = BASE_DIR / "spritesheet.webp"
sheet.save(spritesheet_path, "WEBP", quality=92, alpha_quality=100, method=6)
print(f"Saved {spritesheet_path} ({spritesheet_path.stat().st_size // 1024} KB)")

# Save 128x128 avatar
head_crop = idle.crop((42, 4, 150, 112))
avatar = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
avatar_scaled = head_crop.resize((116, 116), Image.LANCZOS)
avatar.paste(avatar_scaled, (6, 6), avatar_scaled)
avatar_path = BASE_DIR / "avatar.png"
avatar.save(avatar_path, "PNG")
print(f"Saved {avatar_path} ({avatar_path.stat().st_size // 1024} KB)")

# Update forms/manifest.json
manifest_path = FORMS_DIR / "manifest.json"
manifest = {}
if manifest_path.exists():
    manifest = json.loads(manifest_path.read_text())

# Compute alpha hash and opaque count for base
alpha_bytes = bytes(np.array(sheet)[:, :, 3].tobytes())
alpha_hash = hashlib.sha256(alpha_bytes).hexdigest()[:16]
opaque_count = int(np.sum(np.array(sheet)[:, :, 3] > 0))

if "forms" not in manifest:
    manifest["forms"] = {}

manifest["forms"]["base"] = {
    "shape": "oozaru",
    "alpha_hash": alpha_hash,
    "opaque_pixels": opaque_count,
    "hair_ramp": ["#1a1c22", "#2a2e35", "#3e3e44", "#6c686a", "#9a9496"],
    "outline": "#181a1e",
    "iris_ramp": ["#8b0000", "#d43828", "#ff5544"],
    "skin_tint": "#bebfb4"
}

manifest_path.write_text(json.dumps(manifest, indent=2))
print("Updated forms/manifest.json successfully!")
