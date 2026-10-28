"""Pixel-level regression check: python3 -B tests/goku-sprite-generator.test.py."""
import importlib.util
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("goku", ROOT / "scripts/build-goku-forms.py")
g = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)
sheet = np.array(Image.open(g.SOURCE).convert("RGBA"))
checked = 0
for row in range(g.ROWS):
    for col in range(g.COLS):
        cell = sheet[row*208:(row+1)*208, col*192:(col+1)*192].copy()
        cls = g.classify(cell)
        if not cls["hair"].any():
            assert np.array_equal(g.build_cell(cell, g.FORMS["mui"], "mui", row, col), cell)
            continue
        cloth, orange, _ = g.outfit_region(cell, cls, row, col)
        for form_id in g.FORMS:
            out = g.apply_form_outfit(cell.copy(), cell, cls, form_id, row, col)
            changed = np.any(out != cell, axis=2)
            assert not (changed & ~cloth).any(), (row, col, form_id, "outfit leaked outside fabric")
            assert np.array_equal(out[:, :, 3], cell[:, :, 3]), "outfits must preserve alpha"
            assert np.array_equal(out[cls["skin"]], cell[cls["skin"]]), "outfit painted skin"
        assert cloth.any(), (row, col, "missing visible torso")
        ss3 = g.draw_ss3_mane((208, 192), g.head_metrics(cls), g.FORMS["ss3"], row)
        assert not ss3[[0, -1], :, 3].any(), (row, col, "hair touches vertical cell edge")
        assert not ss3[:, [0, -1], 3].any(), (row, col, "hair touches horizontal cell edge")
        checked += 1
assert checked == 57, checked
print(f"Verified {checked} poses: fabric-only outfits, unchanged skin/alpha, bounded SSJ3 hair")
