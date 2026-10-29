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
from PIL import Image, ImageColor, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parent.parent
PET_DIR = ROOT / "public/pets/pikachu"
COLS, ROWS, CELL_W, CELL_H, SCALE = 8, 9, 192, 208, 4
OUTLINE = "#493123"
DARK = "#353039"
CREAM = "#fff4d9"
PIKA_LINE = "#231815"
BROWN_STRIPE = "#82461e"
BROWN_TAIL = "#a65c26"
CONTACT = Path("/tmp/pikachu-refined-ten-forms.png")

FORMS = {
    "pichu": {
        "shapeKey": "pichu",
        "name": "Pichu Spark",
        "fur": ["#c29f2e", "#edd05a", "#fff18a", "#fffde8"],
        "cheeks": ["#ba3d5d", "#ea7e9a", "#f7a8bd", "#ffebf2"],
    },
    "classic": {
        "shapeKey": "classic",
        "name": "Pikachu Classic",
        "fur": ["#b87a14", "#e2a325", "#fed430", "#ffea75"],
        "cheeks": ["#b32015", "#dc3522", "#e8492b", "#ffa090"],
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
        "fur": ["#7c2d26", "#ae382f", "#df5941", "#ffb08a"],
        "cheeks": ["#9d4a23", "#dba239", "#f7c866", "#ffe5a1"],
        "horns": ["#78350f", "#a16207", "#ca8a04", "#fef08a"],
    },
}

# One cycle in the stable eight-cell grid; secondary motion trails the body.
# idle amplitude, second harmonic, ear amplitude/lag, tail amplitude/lag
MOTION = {
    "pichu": (1.5, .35, 4, .25, 4, .7),
    "classic": (1, 0, 2, .2, 3, 0),
    "raichu": (.8, .12, 1.8, .5, 3.5, .8),
    "alolan-raichu": (1.4, -.18, 2.6, .8, 2.2, 1.1),
    "gigantamax": (.6, -.25, 1.2, .6, 1.3, .9),
    "mega-raichu-x": (.9, .3, 1.4, .15, 2.8, .4),
    "mega-raichu-y": (1.1, .22, 2.8, .35, 3.2, .6),
    "concept-white-belly": (.8, -.12, 2.2, .4, 2.4, .5),
    "concept-long-tail": (1, .16, 3, .5, 3.8, 1),
    "gorochu": (.7, .28, 1.2, .7, 2.5, .3),
}
TAIL_TIPS = {
    "pichu": (136, 162), "classic": (174, 106), "raichu": (174, 33),
    "alolan-raichu": (155, 185), "gigantamax": (138, 22),
    "mega-raichu-x": (179, 81), "mega-raichu-y": (174, 25),
    "concept-white-belly": (150, 117), "concept-long-tail": (174, 70),
    "gorochu": (158, 56),
}


def tail_point(form_id, phase, x, y):
    *_, amplitude, lag = MOTION[form_id]
    return x + math.sin(phase-lag)*amplitude*max(0, (x-110)/65), y


def cell_anchors(form_id, row, frame):
    transform = pose_transform(form_id, row, frame)
    phase = frame*math.tau/COLS
    points = [(57, 110), (112, 110), tail_point(form_id, phase, *TAIL_TIPS[form_id])]
    result = []
    for x, y in points:
        x, y = transform(x, y)
        if row == 2:
            x = CELL_W-x
        result.append([round(x, 3), round(y, 3)])
    return result

ALIASES = {"white-belly": "concept-white-belly", "long-tail": "concept-long-tail"}
# Legacy cap directories are deliberately never pruned or overwritten.


class Ink:
    """Small supersampled cubic-path painter; coordinates stay in cell space."""

    def __init__(self, image, transform=lambda x, y: (x, y)):
        self.image = image
        self.draw = ImageDraw.Draw(image)
        self.transform = transform

    def points(self, points):
        return [tuple(round(v * SCALE) for v in self.transform(x, y)) for x, y in points]

    def path(self, commands, fill=None, stroke=OUTLINE, width=1.8):
        points = []
        for command in commands:
            op, *v = command
            if op == "M" or op == "L":
                points.append(tuple(v))
            elif op == "C":
                x0, y0 = points[-1]
                for i in range(1, 25):
                    t = i / 24
                    s = 1 - t
                    points.append((s**3*x0 + 3*s*s*t*v[0] + 3*s*t*t*v[2] + t**3*v[4],
                                   s**3*y0 + 3*s*s*t*v[1] + 3*s*t*t*v[3] + t**3*v[5]))
            elif op == "Q":
                x0, y0 = points[-1]
                for i in range(1, 17):
                    t = i / 16
                    s = 1 - t
                    points.append((s*s*x0 + 2*s*t*v[0] + t*t*v[2],
                                   s*s*y0 + 2*s*t*v[1] + t*t*v[3]))
            elif op == "Z":
                points.append(points[0])
            else:
                raise ValueError(f"Unknown path command {op}")
        xy = self.points(points)
        if fill:
            self.draw.polygon(xy, fill=fill)
        if stroke and width:
            self.draw.line(xy, fill=stroke, width=max(1, round(width*SCALE)), joint="curve")

    def ellipse(self, cx, cy, rx, ry, fill, stroke=OUTLINE, width=1.8):
        self.path([("M", cx+rx, cy),
                   ("C", cx+rx, cy+ry*.5523, cx+rx*.5523, cy+ry, cx, cy+ry),
                   ("C", cx-rx*.5523, cy+ry, cx-rx, cy+ry*.5523, cx-rx, cy),
                   ("C", cx-rx, cy-ry*.5523, cx-rx*.5523, cy-ry, cx, cy-ry),
                   ("C", cx+rx*.5523, cy-ry, cx+rx, cy-ry*.5523, cx+rx, cy),
                   ("Z",)], fill, stroke, width)


def pose_transform(form_id, row, frame):
    phase = frame * math.tau / COLS
    baby = form_id == "pichu"
    scale = .86 * (.84 if baby else (.94 if form_id == "concept-long-tail" else 1))
    amplitude, harmonic, *_ = MOTION[form_id]
    rhythm = math.sin(phase) + harmonic*math.sin(2*phase)
    bob = rhythm * (amplitude if row in (0, 6, 8) else 2)
    if row in (1, 2):
        bob = -4 - abs(math.sin(phase))*4
    elif row == 4:
        bob = -4 - (1-math.cos(phase))*5
    elif row == 5:
        bob = 4 + math.sin(phase)*.7
    lean = .10 if row in (1, 2) else 0

    def transform(x, y):
        x += (168-y)*lean
        if row == 5:
            # Tucked, resting silhouette, not an awake frame with a row label.
            x += (142-y)*.07
            y = 177 + (y-177)*.76
        if form_id == "raichu":
            # A narrower skull and elongated torso/feet distinguish the adult.
            narrowing = .10 * max(0, 1-((y-97)/32)**2)
            x = 85+(x-85)*(1-narrowing)
        return 88+(x-88)*scale, 184+(y-184)*scale+bob
    return transform


def tail(ink, form_id, fur, phase, row):
    """All tails start *inside* the pelvis; draw behind body to hide the seam."""
    def tail_transform(x, y):
        return ink.transform(*tail_point(form_id, phase, x, y))
    p = Ink(ink.image, tail_transform)
    light, shade = fur[2], fur[1]
    if form_id == "pichu":
        p.path([("M", 96, 160), ("L", 118, 150), ("L", 114, 160), ("L", 136, 162),
                ("L", 126, 174), ("L", 110, 167), ("L", 96, 173), ("Z",)], DARK, PIKA_LINE, 2.0)
        p.path([("M", 115, 153), ("L", 128, 162), ("L", 121, 170)], None, "#4a3c46", 1.2)
    elif form_id in ("classic", "concept-white-belly", "concept-long-tail", "gigantamax"):
        if form_id == "gigantamax":
            points = [(111,166),(145,150),(137,119),(159,120),(149,91),(174,90),
                      (161,38),(138,22),(144,70),(127,68),(143,103),(123,101),(132,142),(103,153)]
        elif form_id == "concept-long-tail":
            points = [(105,159),(125,148),(127,131),(145,138),(142,113),(163,119),
                      (157,86),(174,70),(172,105),(164,104),(169,136),(151,131),
                      (153,155),(136,147),(136,160),(112,174)]
        elif form_id == "concept-white-belly":
            points = [(108,155),(129,144),(125,126),(150,117),(157,135),(139,139),
                      (144,152),(116,172)]
        else:
            points = [(106,159),(130,145),(122,126),(148,116),(141,94),(170,80),
                      (174,106),(153,112),(159,128),(137,137),(143,153),(113,174)]
        p.path([("M",*points[0])]+[("L",*pt) for pt in points[1:]]+[("Z",)],light,
               PIKA_LINE if form_id == "classic" else OUTLINE, 2.0 if form_id == "classic" else 1.8)
        if form_id == "classic":
            zig = [
                ("M", 108, 159),
                ("L", 121, 153),
                ("L", 118, 158),
                ("L", 126, 155),
                ("L", 121, 161),
                ("L", 128, 160),
                ("L", 113, 172),
                ("Z",)
            ]
            p.path(zig, BROWN_TAIL, None)
        elif form_id != "gigantamax":
            p.path([("M",108,159),("L",123,152),("L",127,161),("L",113,172),("Z",)],"#956044",None)
        else:
            p.path([("M",150,40),("L",158,71),("L",150,68)],None,"#fff3b2",3)
    elif form_id == "alolan-raichu":
        p.path([("M",107,155),("C",143,144,154,175,125,183),
                ("C",112,188,100,180,112,176)],None,"#775034",4)
        p.path([("M",49,184),("C",81,178,124,177,155,170),
                ("Q",171,174,155,185),("L",139,189),("L",144,192),
                ("C",112,200,69,199,45,191),("Q",37,188,49,184),("Z",)],"#f8d269")
        p.path([("M",48,187),("C",82,185,121,183,153,176)],None,"#fff4b4",2.4)
        p.path([("M",49,192),("C",80,199,120,198,143,192)],None,"#c69343",1.5)
    elif form_id == "mega-raichu-x":
        # Paired tail blades in the supplied X reference, rooted by flexible cords.
        p.path([("M",106,157),("C",127,159,134,138,138,127)],None,DARK,5)
        p.path([("M",106,157),("C",128,153,134,168,144,173)],None,DARK,5)
        p.path([("M",132,138),("L",138,111),("L",146,114),("L",154,91),
                ("L",179,81),("L",169,112),("L",155,119),("L",151,137),
                ("L",141,145),("Z",)],light)
        p.path([("M",134,165),("L",151,169),("L",178,191),
                ("L",150,189),("L",143,180),("L",130,176),("Z",)],light)
        p.path([("M",144,131),("L",150,119),("L",164,106),("L",172,91)],None,"#fff4b0",2)
        p.path([("M",145,174),("L",166,185),("L",153,183)],None,"#fff4b0",2)
    else:
        p.path([("M",108,158),("C",156,170,161,140,151,120),
                ("C",139,98,143,83,149,72)],None,DARK if form_id != "gorochu" else "#5e3028",4)
        if form_id == "gorochu":
            p.path([("M",144,78),("L",136,66),("L",149,69),("L",158,56),
                    ("L",162,71),("L",174,75),("L",164,84),("L",166,96),
                    ("L",153,91),("L",143,99),("L",144,85),("L",134,83),("Z",)],fur[2])
            p.path([("M",149,74),("L",157,67),("L",158,77),("L",167,79),
                    ("L",157,83),("L",151,89),("Z",)],fur[3],None)
        elif form_id == "mega-raichu-y":
            p.path([("M",146,89),("L",130,77),("L",145,61),("L",133,43),
                    ("L",174,25),("L",178,60),("L",158,57),("L",169,75),
                    ("L",151,97),("Z",)],"#ffdc49")
            p.path([("M",150,49),("L",167,39),("L",167,51)],None,"#fff7c0",2)
        else:
            p.path([("M",148,83),("L",137,76),("L",151,62),("L",144,47),
                    ("L",174,33),("L",173,56),("L",159,57),("L",165,72),
                    ("L",153,88),("Z",)],"#f8d159")
            p.path([("M",151,51),("L",167,43)],None,"#fff3af",2.5)


def ears(ink, form_id, fur, phase, row):
    """Connected ear roots overlap the head dome; no erasing source pixels."""
    _, _, amplitude, lag, *_ = MOTION[form_id]
    fold = math.sin(phase-lag)*amplitude
    if row == 5:
        fold += 13
    for side in (-1, 1):
        # Author one flowing ear and reflect around the skull, not a floating stamp.
        def transform(x, y, side=side):
            return ink.transform(85+side*(x-85), y + fold*max(0, (72-y)/50))
        p = Ink(ink.image, transform)
        if form_id == "pichu":
            ear_full = [
                ("M", 97, 78),
                ("Q", 106, 58, 122, 36),
                ("L", 146, 12),
                ("L", 172, 22),
                ("L", 166, 56),
                ("Q", 140, 75, 114, 87),
                ("Z",)
            ]
            p.path(ear_full, fur[2], PIKA_LINE, 2.2)
            p.path([("M", 102, 68), ("Q", 115, 46, 138, 22)], None, fur[3], 2.2)
            p.path([("M", 103, 76),
                    ("Q", 111, 58, 121, 42),
                    ("L", 129, 48),
                    ("Q", 125, 68, 112, 81),
                    ("Z",)], fur[1], None)
            ear_black_tip = [
                ("M", 119, 40),
                ("L", 146, 12),
                ("L", 172, 22),
                ("L", 166, 56),
                ("L", 138, 59),
                ("L", 133, 49),
                ("L", 127, 44),
                ("Z",)
            ]
            p.path(ear_black_tip, DARK, PIKA_LINE, 2.0)
            p.path([("M", 142, 16), ("L", 168, 24), ("L", 164, 48)], None, "#4e424c", 1.2)
        elif form_id == "raichu":
            p.path([("M",104,85),("C",112,67,113,42,139,28),
                    ("C",128,44,136,48,139,55),("C",147,71,124,80,121,66),
                    ("Q",114,73,112,88),("Z",)],"#795038")
            p.path([("M",112,75),("C",119,60,119,44,132,36),
                    ("C",125,49,137,52,135,62),("C",133,71,121,70,125,62),
                    ("Q",126,58,130,61),("Q",133,66,128,66)],"#f8d65e",None)
            p.path([("M",125,62),("C",121,74,142,73,138,59)],None,"#b17b37",1.2)
        elif form_id == "alolan-raichu":
            p.path([("M",102,83),("C",111,74,103,59,111,45),
                    ("C",120,29,144,29,145,43),("C",147,62,127,76,111,86),("Z",)],fur[1])
            p.path([("M",113,72),("C",120,62,113,52,124,43),
                    ("C",138,33,140,47,133,57),("C",125,67,120,59,126,54)],"#f7dc83",None)
            p.path([("M",126,53),("C",119,58,127,67,134,56)],None,"#c7994c",1.1)
        elif form_id == "mega-raichu-x":
            p.path([("M",103,84),("C",108,60,121,35,149,19),
                    ("C",131,41,127,67,115,84),("Q",110,87,103,84),("Z",)],DARK)
            p.path([("M",116,58),("C",122,42,136,29,147,22),
                    ("C",137,36,129,51,126,62),("Z",)],fur[2],None)
            p.path([("M",119,49),("Q",133,31,141,27)],None,fur[3],1.6)
            p.path([("M",108,82),("C",121,80,121,69,114,70),
                    ("C",107,72,117,79,116,74)],None,"#b9ac97",1.3)
        elif form_id == "mega-raichu-y":
            p.path([("M",101,84),("C",103,58,108,38,130,24),
                    ("L",125,48),("L",139,40),("L",129,64),
                    ("Q",119,73,113,87),("Z",)],"#ffcf3e")
            p.path([("M",115,40),("Q",121,30,130,24),("L",125,48),
                    ("L",120,53),("Z",)],DARK,None)
            p.path([("M",116,68),("L",125,57),("L",121,72),("L",133,68),
                    ("L",119,85),("L",110,86),("Z",)],fur[2])
        elif form_id == "gorochu":
            p.path([("M",103,91),("L",115,65),("L",130,56),("L",125,77),
                    ("L",134,74),("L",120,93),("Z",)],"#642e2c")
            p.path([("M",99,78),("C",103,61,106,42,116,32),
                    ("C",112,54,122,63,113,81),("Z",)],"#ffdfb6")
            p.path([("M",106,72),("Q",111,60,111,51)],None,"#d59e79",2)
        elif form_id == "classic":
            p.path([("M",103,85),("C",106,65,117,36,138,31),
                    ("C",141,49,123,69,114,88),("Z",)], fur[2], PIKA_LINE, 2.0)
            p.path([("M",120,44), ("Q",128,33,138,31),
                    ("Q",139,42,131,54), ("Z",)], DARK, PIKA_LINE, 1.8)
        else:
            short = form_id == "concept-white-belly"
            long = form_id == "concept-long-tail"
            top = 27 if long else (43 if short else 31)
            end = 143 if long else (132 if short else 138)
            p.path([("M",103,85),("C",106,65,117,top+5,end,top),
                    ("C",end+3,top+18,123,69,114,88),("Z",)],fur[2])
            p.path([("M",120,top+13),("Q",128,top+2,end,top),
                    ("Q",end+1,top+11,end-7,top+23),("Z",)],DARK,None)
            p.path([("M",111,71),("Q",117,56,123,top+20)],None,fur[3],2)


def body(ink, form_id, fur, phase, row):
    baby = form_id == "pichu"
    gmax = form_id == "gigantamax"
    athletic = form_id in ("raichu", "mega-raichu-y")
    shaggy = form_id == "gorochu"
    width = 47 if gmax else (25 if baby else (28 if athletic else 34))
    if form_id == "concept-white-belly":
        width = 38
    top, bottom = (103,184) if gmax else ((118,178) if baby else (108,177))
    if shaggy:
        outline = [("M",66,111),("L",54,116),("L",58,123),("L",45,133),
                   ("L",54,134),("L",48,147),("L",56,144),("C",48,166,59,180,84,181),
                   ("C",111,183,124,169,119,151),("L",126,156),("L",123,140),
                   ("L",132,141),("L",123,128),("L",130,127),("L",117,115),
                   ("Q",93,102,66,111),("Z",)]
    else:
        outline = [("M",85,top),("C",85+width*.8,top-2,85+width,top+25,85+width,bottom-23),
                   ("C",85+width,bottom+7,85-width,bottom+7,85-width,bottom-23),
                   ("C",85-width,top+25,85-width*.8,top-2,85,top),("Z",)]
    ink.path(outline, fur[2], PIKA_LINE if (form_id == "classic" or baby) else OUTLINE, 2.0 if (form_id == "classic" or baby) else 1.8)
    if form_id == "classic":
        ink.path([("M", 53, 143), ("Q", 58, 144, 61, 147), ("Q", 57, 149, 53, 147), ("Z",)], BROWN_STRIPE, None)
        ink.path([("M", 54, 154), ("Q", 59, 155, 62, 158), ("Q", 58, 160, 54, 158), ("Z",)], BROWN_STRIPE, None)
    # Organic shadow follows the right flank and folds under the belly.
    ink.path([("M",99,top+9),("C",111,top+28,111,bottom-15,97,bottom-6),
              ("Q",79,bottom+1,66,bottom-6),("C",79,bottom+5,112,bottom+1,115,bottom-15),
              ("Q",122,top+30,99,top+9),("Z",)],fur[1],None)
    if gmax:
        ink.ellipse(73,151,31,28,fur[3],None)
    if form_id in ("raichu", "alolan-raichu", "mega-raichu-x", "mega-raichu-y", "concept-white-belly", "gorochu"):
        if shaggy:
            patch = [("M",76,118),("L",83,125),("L",91,119),("L",97,133),
                     ("L",105,139),("L",102,150),("L",108,159),
                     ("Q",87,182,66,164),("L",69,151),("L",65,142),
                     ("L",74,135),("Z",)]
            ink.path(patch,"#ffdeba",None)
        else:
            patch_w = 25 if form_id == "concept-white-belly" else (24 if form_id == "alolan-raichu" else 20)
            patch_top = 114 if form_id == "concept-white-belly" else 124
            ink.path([("M",83,patch_top),("C",103,patch_top-2,85+patch_w,145,85+patch_w,157),
                      ("C",85+patch_w,179,85-patch_w,181,85-patch_w,157),
                      ("C",85-patch_w,141,65,patch_top+1,83,patch_top),("Z",)],
                     "#fffdf2" if form_id == "concept-white-belly" else CREAM,None)
            ink.path([("M",99,141),("C",109,164,99,171,80,174),
                      ("C",101,181,113,166,99,141),("Z",)],"#e8d4b5",None)
    if baby:
        ink.path([("M", 63, 134), ("Q", 85, 142, 107, 134), ("Q", 85, 146, 63, 134), ("Z",)], fur[1], None)
        ink.path([("M", 60, 121),
                  ("L", 66, 134), ("L", 71, 126),
                  ("L", 78, 137), ("L", 85, 128),
                  ("L", 92, 137), ("L", 99, 126),
                  ("L", 104, 134), ("L", 110, 121),
                  ("Z",)], DARK, PIKA_LINE, 2.2)
        ink.path([("M", 66, 131), ("L", 68, 128)], None, "#4e424c", 1.0)
        ink.path([("M", 78, 134), ("L", 81, 130)], None, "#4e424c", 1.0)
    if form_id == "mega-raichu-x":
        ink.path([("M",77,121),("Q",85,116,93,124),("L",91,139),
                  ("L",78,136),("Z",)],"#a56c3d",None)
    # Rear foot then near foot: run cycle uses opposed, smoothly varying strides.
    stride = math.sin(phase)*12 if row in (1,2) else 0
    for side in (-1,1):
        x = 85 + side*(width*.57) + side*stride
        y = bottom-1 + (max(0, side*math.cos(phase))*-7 if row in (1,2) else 0)
        foot = DARK if form_id in ("raichu","mega-raichu-x","gorochu") else fur[2]
        rx = 22 if athletic else (12 if baby else 15)
        ink.path([("M",x-9,y-7),("C",x+3,y-8,x+rx+2,y,x+rx,y+5),
                  ("C",x+rx-2,y+10,x-10,y+9,x-11,y+3),("Q",x-12,y-2,x-9,y-7),("Z",)],foot,
                 PIKA_LINE if (form_id == "classic" or baby) else OUTLINE, 1.8)
        ink.path([("M",x+3,y+3),("Q",x+9,y+5,x+12,y+4)],None,"#75614f" if foot==DARK else fur[1],1.2 if form_id == "classic" else 1)


def head(ink, form_id, fur, cheek, phase, row, frame):
    gmax = form_id == "gigantamax"
    baby = form_id == "pichu"
    head_w = 38 if baby else (39 if gmax else 34)
    center_y = 96 if not gmax else 94
    # Smooth complete dome with fuller cheek lobes and a short, rounded muzzle.
    ink.path([("M",85,66 if baby else 68),("C",108 if baby else 106,63 if baby else 65,85+head_w,77 if baby else 79,85+head_w,98 if baby else 99),
              ("C",85+head_w+3 if baby else 85+head_w+4,118 if baby else 119,104 if baby else 103,129,85,128),
              ("C",64 if baby else 63,131,46 if baby else 47,118 if baby else 120,48 if baby else 49,103 if baby else 104),("C",47 if baby else 48,80 if baby else 81,62,66 if baby else 68,85,66 if baby else 68),("Z",)],fur[2],
             PIKA_LINE if (form_id == "classic" or baby) else OUTLINE, 2.2 if baby else (2.0 if form_id == "classic" else 1.8))
    if baby:
        ink.path([("M", 64, 76), ("C", 73, 67, 95, 67, 106, 76)], None, fur[3], 3.2)
        ink.path([("M", 108, 84), ("C", 120, 100, 115, 116, 96, 122),
                  ("Q", 80, 128, 64, 120), ("C", 78, 132, 118, 128, 116, 98),
                  ("Q", 114, 88, 108, 84), ("Z",)], fur[1], None)
    else:
        ink.path([("M",109,80),("C",123,100,116,119,96,124),
                  ("Q",74,132,58,119),("C",77,139,129,131,119,98),
                  ("Q",117,87,109,80),("Z",)],fur[1],None)
        ink.path([("M",59,89),("C",62,76,79,70,90,73)],None,fur[3],3)
    if form_id == "gorochu":
        for side in (-1,1):
            def tr(x,y,side=side):
                return ink.transform(85+side*(x-85),y)
            p=Ink(ink.image,tr)
            p.path([("M",111,98),("L",125,96),("L",121,105),("L",131,108),
                    ("L",120,113),("L",124,119),("L",111,119),("Z",)],fur[2])
    # Oval cheek pads sit entirely on the face, never on body/back stripes.
    if baby:
        for x in (56, 113):
            ink.ellipse(x, 110, 8.8, 7.8, cheek[1], PIKA_LINE, 1.4)
            ink.ellipse(x, 110.5, 6.5, 5.6, cheek[2], None)
            ink.ellipse(x - 2.0, 107.8, 2.6, 1.5, cheek[3], None)
    elif form_id == "classic":
        for x in (57,112):
            ink.ellipse(x, 110, 7.8, 7.2, cheek[2], PIKA_LINE, 1.4)
    else:
        for x in (57,112):
            ink.ellipse(x,110,7.5,6.8,cheek[1],None)
            ink.ellipse(x-1.7,107.8,3.2,1.6,cheek[3],None)
    sleeping = row == 5
    blink = row in (0,6,7,8) and frame == 6
    for x in ((68, 101) if baby else (69, 100)):
        if sleeping or blink:
            ink.path([("M",x-5.5,97 if baby else (99 if form_id=="classic" else 98)),
                      ("Q",x,103.5,x+5.5,97 if baby else (99 if form_id=="classic" else 98))],
                     None, PIKA_LINE if (form_id=="classic" or baby) else DARK, 2.2 if (form_id=="classic" or baby) else 2.2)
            if baby:
                ink.path([("M", x + 3.5, 97), ("L", x + 6.5, 94)], None, PIKA_LINE, 1.4)
        elif row == 4:
            ink.path([("M",x-5.5,99),
                      ("Q",x,90 if form_id=="classic" else 89,x+5.5,99)],
                     None, PIKA_LINE if (form_id=="classic" or baby) else DARK, 2.2)
        else:
            if baby:
                ink.ellipse(x, 96, 6.6, 8.2, DARK, PIKA_LINE, 1.6)
                iris = FORMS[form_id].get('eyes')
                iris_col = iris[2] if iris else "#782d34"
                ink.path([("M", x - 5.0, 97.5),
                          ("C", x - 4.0, 102.5, x + 4.0, 102.5, x + 5.0, 97.5),
                          ("Q", x, 100.5, x - 5.0, 97.5), ("Z",)], iris_col, None)
                ink.ellipse(x, 95.8, 4.2, 5.0, DARK, None)
                ink.ellipse(x - 1.5, 93.4, 2.5, 2.8, "#ffffff", None)
                ink.ellipse(x + 2.0, 98.4, 1.1, 1.1, "#ffffff", None)
            elif form_id == "classic":
                ink.ellipse(x, 96, 5.6, 7.5, DARK, PIKA_LINE, 1.6)
                ink.ellipse(x - 1.4, 93.6, 2.3, 2.7, "#ffffff", None)
                ink.ellipse(x + 1.8, 98.2, 0.9, 0.9, "#ffffff", None)
            else:
                ink.ellipse(x,96,5.3,7.2,DARK,None)
                iris = FORMS[form_id].get('eyes')
                if iris:
                    ink.ellipse(x,98.4,3.5,3.6,iris[1],None)
                    ink.ellipse(x,96.3,2.0,4.2,DARK,None)
                else:
                    ink.ellipse(x,99.3,3.3,2.7,"#815442",None)
                ink.ellipse(x-1.5,93.4,1.9,2.3,"#fffdf5",None)
                ink.ellipse(x+2,98, .8,.8,"#fffdf5",None)
    ink.ellipse(85, 106.5 if baby else 106, 1.2 if baby else 1.5, 0.9 if baby else 1.2, DARK, None)
    if row == 4 or row == 3:
        mouth_dark = "#a82d36" if (form_id == "classic" or baby) else "#703d36"
        mouth_pink = "#f07584" if (form_id == "classic" or baby) else "#ee9391"
        line = PIKA_LINE if (form_id == "classic" or baby) else DARK
        ink.path([("M",78 if baby else 77,112),("Q",85,115,92 if baby else 93,112),("Q",89 if baby else 90,123 if baby else 125,85,121 if baby else 123),
                  ("Q",81 if baby else 80,123 if baby else 125,78 if baby else 77,112),("Z",)], mouth_dark, line, 1.4 if (form_id == "classic" or baby) else 1.2)
        ink.path([("M",80,119),("Q",85,115,90,119),("Q",87,123,85,123),("Q",83,123,80,119),("Z",)], mouth_pink, None)
    else:
        if baby:
            ink.path([("M", 78, 112.5), ("Q", 81.5, 116.0, 85, 113.0),
                      ("Q", 88.5, 116.0, 92, 112.5)], None, PIKA_LINE, 1.5)
        elif form_id == "classic":
            ink.path([("M",77,113),("Q",81,117,85,113),("Q",89,117,93,113)], None, PIKA_LINE, 1.6)
        else:
            ink.path([("M",77,113),("Q",80,117,85,113),("Q",90,117,94,112)],None,DARK,1.4)
    if form_id == "gorochu" and not sleeping:
        for x in (79,91):
            ink.path([("M",x-2,114),("L",x,120),("L",x+2,114),("Z",)],"#fff4dc",None)


def arms(ink, form_id, fur, phase, row):
    baby = form_id == "pichu"
    color = "#6b4537" if form_id in ("raichu","mega-raichu-x","gorochu") else fur[2]
    for side in (-1,1):
        def tr(x,y,side=side):
            return ink.transform(85+side*(x-85),y)
        p=Ink(ink.image,tr)
        if row == 4 or (row == 3 and side == 1):
            wave=math.sin(phase)*5
            p.path([("M",108 if not baby else 102,127 if not baby else 126),
                    ("C",123,122,126,109+wave,131 if not baby else 124,107+wave if not baby else 106+wave),
                    ("C",140,105+wave,140,115+wave,133 if not baby else 126,122+wave if not baby else 120+wave),
                    ("Q",126,139,112 if not baby else 105,143 if not baby else 140),("Z",)],fur[2],
                   PIKA_LINE if (form_id == "classic" or baby) else OUTLINE, 1.8 if (baby or form_id == "classic") else None)
            if form_id == "classic":
                p.path([("M",132,107+wave),("L",135,111+wave)], None, PIKA_LINE, 1.0)
            elif not baby:
                p.ellipse(132,114+wave,6,7,color,None)
                p.path([("M",133,110+wave),("L",135,111+wave)],None,fur[3],1.3)
        elif row in (7,8):
            reach=math.sin(phase)*2 if row==7 else 0
            p.path([("M",108 if not baby else 105,129),("Q",122 if not baby else 118,143,106 if not baby else 103,158+reach),
                    ("Q",97 if not baby else 95,164+reach,94 if not baby else 92,155+reach),("Q",107 if not baby else 104,145,102 if not baby else 100,134),("Z",)],fur[2],
                   PIKA_LINE if (form_id == "classic" or baby) else OUTLINE, 1.6 if (form_id == "classic" or baby) else None)
            if form_id != "classic" and not baby:
                p.ellipse(101,156+reach,6,5,color,None)
        elif row==5:
            p.path([("M",108 if not baby else 105,132),("Q",119 if not baby else 116,146,107 if not baby else 104,158),
                    ("Q",96 if not baby else 94,160,96 if not baby else 94,152),("Q",103 if not baby else 100,146,102 if not baby else 99,136),("Z",)],fur[2],
                   PIKA_LINE if (form_id == "classic" or baby) else OUTLINE, 1.6 if (form_id == "classic" or baby) else None)
        else:
            if baby:
                p.path([("M", 100, 127),
                        ("C", 112, 132, 110, 148, 99, 150),
                        ("C", 91, 151, 88, 140, 96, 131),
                        ("Z",)], fur[2], PIKA_LINE, 1.8)
                p.path([("M", 96, 137), ("Q", 103, 144, 98, 148)], None, fur[1], 1.2)
            elif form_id == "classic":
                stride=math.cos(phase)*6*side if row in (1,2) else math.sin(phase)*1.3
                p.path([("M",108,128),("C",121,134,119,144+stride,109,152+stride),
                        ("Q",101,157+stride,100,150+stride),("Q",104,138,101,133),("Z",)],fur[2],
                       PIKA_LINE, 1.8)
            else:
                stride=math.cos(phase)*6*side if row in (1,2) else math.sin(phase)*1.3
                p.path([("M",108,128),("C",121,134,119,144+stride,109,152+stride),
                        ("Q",101,157+stride,100,150+stride),("Q",104,138,101,133),("Z",)],fur[2])
                p.ellipse(107,149+stride,5,5.7,color,None)
                p.path([("M",107,145+stride),("Q",111,142+stride,112,137)],None,fur[3],1.4)


def props(ink, row, phase):
    if row == 7:
        # A small rounded laptop: no screen illumination or electricity is baked in.
        ink.path([("M",60,167),("L",113,167),("L",121,183),("Q",122,187,117,188),
                  ("L",56,188),("Q",51,187,53,183),("Z",)],"#a5b6b2")
        for y in (175,179):
            ink.path([("M",63,y),("L",108,y)],None,"#6a817d",1)
        ink.path([("M",60,158),("Q",60,155,64,155),("L",108,155),("Q",112,155,112,159),
                  ("L",109,178),("L",63,178),("Z",)],"#6c8989")
        ink.ellipse(86,166,3,3,"#d3e1cc",None)
    elif row == 8:
        ink.path([("M",85,163),("Q",69,151,52,157),("L",54,182),
                  ("Q",72,178,85,187),("Q",100,177,116,181),("L",119,156),
                  ("Q",102,152,85,163),("Z",)],"#839f9c")
        ink.path([("M",85,166),("Q",70,156,56,160),("L",58,179),
                  ("Q",72,177,85,185),("Q",99,176,113,178),("L",115,159),
                  ("Q",100,157,85,166),("Z",)],"#fff0cb",None)
        ink.path([("M",85,166),("L",85,184)],None,"#c0a782",1)
        for y in (165,170,175):
            ink.path([("M",61,y),("Q",70,y-1,79,y+4)],None,"#c4b494",.8)
            ink.path([("M",92,y+4),("Q",102,y-1,110,y)],None,"#c4b494",.8)


def clouds(ink, phase):
    for x,y,k in ((53,46,1),(86,34,.9),(117,43,1)):
        def tr(px,py,x=x,y=y,k=k):
            return ink.transform(x+px*k,y+py*k+math.sin(phase)*1.5)
        p=Ink(ink.image,tr)
        p.path([("M",-15,4),("C",-24,1,-18,-7,-12,-5),
                ("C",-14,-14,-2,-16,2,-9),("C",9,-14,18,-7,15,-1),
                ("C",25,4,13,11,6,7),("C",0,13,-11,13,-15,4),("Z",)],"#bd465b","#743646",1.2)
        p.path([("M",-13,0),("C",-5,-9,7,-3,5,3),("Q",0,8,-4,3)],None,"#ee91a0",1.8)


def render_cell(form_id, row, frame):
    spec=FORMS[form_id]
    fur=spec['fur']
    phase=frame*math.tau/COLS
    image=Image.new('RGBA',(CELL_W*SCALE,CELL_H*SCALE))
    ink=Ink(image,pose_transform(form_id,row,frame))
    tail(ink,form_id,fur,phase,row)
    ears(ink,form_id,fur,phase,row)
    body(ink,form_id,fur,phase,row)
    head(ink,form_id,fur,spec['cheeks'],phase,row,frame)
    arms(ink,form_id,fur,phase,row)
    props(ink,row,phase)
    if form_id=='gigantamax':
        clouds(ink,phase)
    image=image.resize((CELL_W,CELL_H),Image.Resampling.LANCZOS)
    if row==2:
        image=ImageOps.mirror(image)
    return image


def check_assets():
    """Runnable regression for cut margins, disconnected anatomy and fake run/sleep."""
    silhouettes=set()
    anchors=json.loads((PET_DIR/'forms/anchors.json').read_text())
    for form_id in FORMS:
        image=Image.open(PET_DIR/'forms'/form_id/'spritesheet.webp').convert('RGBA')
        assert image.size==(COLS*CELL_W,ROWS*CELL_H), (form_id,image.size)
        a=np.array(image)[:,:,3]
        if 'eyes' in FORMS[form_id]:
            target=np.array(ImageColor.getrgb(FORMS[form_id]['eyes'][1]))
            authored=np.array(render_cell(form_id,0,0))
            for eye_x in (69,100):
                x,y=pose_transform(form_id,0,0)(eye_x,99)
                for pixels,tolerance in ((authored,15),(np.array(image),75)):
                    # WebP chroma subsampling softens these tiny saturated irises.
                    patch=pixels[round(y)-4:round(y)+5,round(x)-4:round(x)+5,:3].astype(int)
                    assert np.linalg.norm(patch-target,axis=2).min()<tolerance, (form_id,'painted iris must match declared palette')
        silhouettes.add(hashlib.sha256(a.tobytes()).hexdigest())
        for row in range(ROWS):
            for col in range(COLS):
                cell=a[row*CELL_H:(row+1)*CELL_H,col*CELL_W:(col+1)*CELL_W]
                assert anchors[form_id][row*COLS+col] == cell_anchors(form_id,row,col), (form_id,row,col,'stale anchors')
                for x,y in anchors[form_id][row*COLS+col]:
                    assert cell[round(y)-2:round(y)+3,round(x)-2:round(x)+3].max()>127, (form_id,row,col,'anchor off art')
                assert not (cell[:6].any() or cell[203:].any() or cell[:,:8].any() or cell[:,185:].any()), (form_id,row,col,'margin')
        # At substantial alpha the entire animal must be connected. Dynamax clouds
        # are intentionally separate, but ears, tail and skull never are.
        mask=a[:CELL_H,:CELL_W]>127
        seen=set()
        components=[]
        for y,x in zip(*np.where(mask)):
            if (y,x) in seen:
                continue
            todo=[(y,x)]
            seen.add((y,x))
            size=0
            while todo:
                py,px=todo.pop()
                size+=1
                for dy,dx in ((0,1),(0,-1),(1,0),(-1,0)):
                    qy,qx=py+dy,px+dx
                    if 0<=qy<CELL_H and 0<=qx<CELL_W and mask[qy,qx] and (qy,qx) not in seen:
                        seen.add((qy,qx)); todo.append((qy,qx))
            if size>8:
                components.append(size)
        assert len(components)<= (4 if form_id=='gigantamax' else 1), (form_id,'detached anatomy',components)
        for col in range(COLS):
            r=np.array(image.crop((col*CELL_W,CELL_H,(col+1)*CELL_W,2*CELL_H)))[:,:,3]
            l=np.array(image.crop((col*CELL_W,2*CELL_H,(col+1)*CELL_W,3*CELL_H)))[:,:,3]
            assert np.array_equal(r[:,::-1],l), (form_id,col,'run mirror')
        idle=a[:CELL_H,:CELL_W]
        sleep=a[5*CELL_H:6*CELL_H,:CELL_W]
        assert not np.array_equal(idle,sleep), (form_id,'sleep is idle')
        print(f'CHECK {form_id}: 72 safe cells, connected anatomy, mirrored runs, distinct sleep')
    assert len(silhouettes)==10, 'Silhouettes must be unique'
    print('CHECK 720 cells; 10 distinct silhouettes; PASS')


def build_form(form_id):
    spec=FORMS[form_id]
    sheet=Image.new('RGBA',(COLS*CELL_W,ROWS*CELL_H))
    for row in range(ROWS):
        for col in range(COLS):
            sheet.paste(render_cell(form_id,row,col),(col*CELL_W,row*CELL_H))
    directory=PET_DIR/'forms'/form_id
    directory.mkdir(parents=True,exist_ok=True)
    sheet.save(directory/'spritesheet.webp','WEBP',quality=92,alpha_quality=100,method=6)
    first=sheet.crop((0,0,CELL_W,CELL_H))
    first=first.crop(first.getbbox())
    first.thumbnail((116,116),Image.Resampling.LANCZOS)
    avatar=Image.new('RGBA',(128,128))
    avatar.alpha_composite(first,((128-first.width)//2,(128-first.height)//2))
    avatar.save(directory/'avatar.png')
    # Metrics describe decoded shipped pixels, not an intermediate drawing.
    alpha=np.array(Image.open(directory/'spritesheet.webp').convert('RGBA'))[:,:,3]>0
    entry={**spec,'alphaHash':hashlib.sha256(np.packbits(alpha).tobytes()).hexdigest()[:16],
           'opaquePixels':int(alpha.sum())}
    print(f'BUILD {form_id}: {entry["opaquePixels"]} pixels, {entry["alphaHash"]}')
    return entry


def contact_sheet():
    poses=[('Idle',0,0),('Run right',1,2),('Celebrate',4,3),('Sleep',5,0)]
    image=Image.new('RGB',(172+4*CELL_W,32+10*CELL_H),'#e9e5de')
    d=ImageDraw.Draw(image)
    for col,(name,_,_) in enumerate(poses):
        d.text((184+col*CELL_W,10),name,fill='#493123')
    for i,(form_id,spec) in enumerate(FORMS.items()):
        y=32+i*CELL_H
        d.rectangle((0,y,image.width,y+CELL_H),fill='#f4f0e9' if i%2==0 else '#e9e5de')
        d.text((8,y+92),form_id,fill='#493123')
        path=PET_DIR/'forms'/form_id/'spritesheet.webp'
        if not path.exists():
            continue
        sheet=Image.open(path).convert('RGBA')
        for col,(_,row,frame) in enumerate(poses):
            cell=sheet.crop((frame*CELL_W,row*CELL_H,(frame+1)*CELL_W,(row+1)*CELL_H))
            image.paste(cell,(172+col*CELL_W,y),cell)
    image.save(CONTACT)
    print(f'CONTACT {CONTACT}')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('forms',nargs='*',help='Optional subset of existing form IDs')
    parser.add_argument('--check',action='store_true',help='Validate shipped geometry without rebuilding')
    args=parser.parse_args()
    unknown=set(args.forms)-FORMS.keys()
    if unknown:
        parser.error(f'Unknown forms: {", ".join(sorted(unknown))}')
    if args.check:
        check_assets()
        return
    manifest_path=PET_DIR/'forms/manifest.json'
    manifest=json.loads(manifest_path.read_text()) if manifest_path.exists() else {'pet':'pikachu','forms':{}}
    for form_id in args.forms or FORMS:
        manifest['forms'][form_id]=build_form(form_id)
        for alias,target in ALIASES.items():
            if target==form_id:
                dest=PET_DIR/'forms'/alias
                dest.mkdir(exist_ok=True)
                for name in ('spritesheet.webp','avatar.png'):
                    shutil.copyfile(PET_DIR/'forms'/target/name,dest/name)
    manifest['forms']={k:manifest['forms'][k] for k in FORMS if k in manifest['forms']}
    manifest_path.write_text(json.dumps(manifest,indent=2)+'\n')
    anchors = {form_id: [cell_anchors(form_id, row, frame)
                         for row in range(ROWS) for frame in range(COLS)] for form_id in FORMS}
    (PET_DIR/'forms/anchors.json').write_text(json.dumps(anchors,separators=(',', ':'))+'\n')
    contact_sheet()


if __name__=='__main__':
    main()
