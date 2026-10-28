#!/usr/bin/env python3
"""Original Bézier chibi art for the ten reference Pikachu forms; no raster surgery.

python3 -I scripts/build-pikachu-forms.py [form-id ...]
python3 -I scripts/build-pikachu-forms.py --check

Art is authored at 4x, downsampled once, and exported as q92/alpha100 WebP.
Runtime owns electricity. See docs/engineering/pikachu-form-sprite-research.md.
"""
import argparse
import hashlib
import json
import math
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parent.parent
PET_DIR = ROOT / "public/pets/pikachu"
COLS, ROWS, CELL_W, CELL_H, SCALE = 8, 9, 192, 208, 4
OUTLINE = "#493123"
DARK = "#353039"
CREAM = "#fff4d9"
CONTACT = Path("/tmp/pikachu-refined-ten-forms.png")

FORMS = {
    "pichu": {
        "shapeKey": "pichu",
        "name": "Pichu Spark",
        "fur": ["#cfae25", "#ecd757", "#fdf192", "#fffde0"],
        "cheeks": ["#b52a46", "#db4d68", "#f78398", "#ffccd5"],
    },
    "classic": {
        "shapeKey": "classic",
        "name": "Pikachu Classic",
        "fur": ["#b88e1a", "#dfb83b", "#f9e066", "#fff4b3"],
        "cheeks": ["#b51515", "#db2424", "#f74a4a", "#ff9494"],
    },
    "raichu": {
        "shapeKey": "raichu",
        "name": "Raichu Kanto",
        "fur": ["#964802", "#cf6d0a", "#f58e1e", "#ffd18c"],
        "cheeks": ["#d49700", "#ffcc00", "#ffe600", "#fff380"],
    },
    "alolan-raichu": {
        "shapeKey": "alolan-raichu",
        "name": "Alolan Raichu",
        "fur": ["#9a520e", "#d47b19", "#f5a742", "#ffe0a3"],
        "cheeks": ["#d49700", "#facc15", "#fde047", "#fef08a"],
        "eyes": ["#1d4ed8", "#2563eb", "#38bdf8", "#bae6fd"],
    },
    "gigantamax": {
        "shapeKey": "gigantamax",
        "name": "Gigantamax Pikachu",
        "fur": ["#a65805", "#d67c0f", "#f7a523", "#ffdb8a"],
        "cheeks": ["#c70c0c", "#f01616", "#ff3d3d", "#ffa3a3"],
    },
    "mega-raichu-x": {
        "shapeKey": "mega-raichu-x",
        "name": "Mega Raichu X",
        "fur": ["#b37a08", "#e6a312", "#facc15", "#fff28f"],
        "cheeks": ["#b51515", "#db2424", "#ef4444", "#ff9494"],
        "eyes": ["#7f1d1d", "#b91c1c", "#dc2626", "#fca5a5"],
    },
    "mega-raichu-y": {
        "shapeKey": "mega-raichu-y",
        "name": "Mega Raichu Y",
        "fur": ["#964802", "#cf6d0a", "#ea580c", "#fed7aa"],
        "cheeks": ["#d49700", "#facc15", "#fde047", "#fef08a"],
        "eyes": ["#0369a1", "#0284c7", "#38bdf8", "#bae6fd"],
    },
    "concept-white-belly": {
        "shapeKey": "concept-white-belly",
        "name": "White-Belly Pikachu",
        "fur": ["#ca8a04", "#eab308", "#fde047", "#fef08a"],
        "cheeks": ["#be123c", "#e11d48", "#f43f5e", "#fda4af"],
    },
    "concept-long-tail": {
        "shapeKey": "concept-long-tail",
        "name": "Long-Tail Pikachu",
        "fur": ["#b37a08", "#e6a312", "#facc15", "#fff28f"],
        "cheeks": ["#b51515", "#db2424", "#dc2626", "#ff9494"],
    },
    "gorochu": {
        "shapeKey": "gorochu",
        "name": "Gorochu Reconstruction",
        "fur": ["#7c2d12", "#9a3412", "#c2410c", "#fed7aa"],
        "cheeks": ["#78350f", "#92400e", "#b45309", "#fcd34d"],
        "horns": ["#78350f", "#a16207", "#ca8a04", "#fef08a"],
    },
}

