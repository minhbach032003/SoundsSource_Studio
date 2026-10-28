#!/usr/bin/env python3
"""Generate a 3x3 contact sheet showing all 9 animation states of Pichu."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import sys

ROOT = Path(__file__).resolve().parent.parent
PET_DIR = ROOT / "public/pets/pikachu"
COLS, ROWS, CELL_W, CELL_H = 8, 9, 192, 208

sheet_path = PET_DIR / "forms/pichu/spritesheet.webp"
if not sheet_path.exists():
    print(f"Error: {sheet_path} not found")
    sys.exit(1)

sheet = Image.open(sheet_path).convert("RGBA")

STATES = [
    ("Hàng 0: IDLE (Đứng yên)", 0, 0),
    ("Hàng 1: RUN-R (Chạy phải)", 1, 2),
    ("Hàng 2: RUN-L (Chạy trái)", 2, 2),
    ("Hàng 3: WAVE/DONE (Vẫy tay)", 3, 2),
    ("Hàng 4: CELEBRATE (Hân hoan)", 4, 3),
    ("Hàng 5: SLEEPY (Ngủ)", 5, 0),
    ("Hàng 6: WAITING (Chờ đợi)", 6, 0),
    ("Hàng 7: WORKING (Làm việc)", 7, 2),
    ("Hàng 8: READING (Đọc sách)", 8, 2),
]

font_path = "/System/Library/Fonts/Supplemental/Arial.ttf"
try:
    font = ImageFont.truetype(font_path, 13)
except Exception:
    font = ImageFont.load_default()

CARD_W = CELL_W + 16
CARD_H = CELL_H + 36
PAD = 20
TOTAL_W = PAD * 2 + CARD_W * 3
TOTAL_H = PAD * 2 + CARD_H * 3

out = Image.new("RGBA", (TOTAL_W, TOTAL_H), "#181824")
draw = ImageDraw.Draw(out)

for idx, (label, row, frame) in enumerate(STATES):
    col_idx = idx % 3
    row_idx = idx // 3

    x = PAD + col_idx * CARD_W
    y = PAD + row_idx * CARD_H

    # Card background box
    draw.rounded_rectangle(
        [x, y, x + CARD_W - 8, y + CARD_H - 8],
        radius=10,
        fill="#222232",
        outline="#333348",
        width=1
    )

    # Label header
    draw.text((x + 12, y + 10), label, fill="#f0e8d8", font=font)

    # Crop cell from spritesheet
    cell = sheet.crop((frame * CELL_W, row * CELL_H, (frame + 1) * CELL_W, (row + 1) * CELL_H))

    # Paste cell
    cell_x = x + (CARD_W - 8 - CELL_W) // 2
    cell_y = y + 28
    out.alpha_composite(cell, (cell_x, cell_y))

output_path = Path("/tmp/pichu-all-states-review.png")
out.convert("RGB").save(output_path, quality=95)
print(f"Saved {output_path}")
