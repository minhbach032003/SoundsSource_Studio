# Research: Rebuilding the Work Blue Cat (Cyber Coding Cat) Pet as Ten Distinct Per-Form Sprites

## 1. Overview & Objective

User request: "làm lại con Cyber Coding Cat" (rebuild the Cyber Coding Cat / `work-blue-cat` pet per-form sprites).
In the Evolution Forms & Models panel, all 10 forms of `work-blue-cat` previously showed the exact same pixel sprite with a flat palette tint. Every form had 0 differing alpha mask pixels (`TINT-ONLY mask-diff=0 opaque=1214625`).
The forms lacked distinct silhouettes, unique accessories matching their titles (headphones, coffee mug, glasses, retro shades, solar antennae, floating architect halo), and had no entries in `FORM_AURAS` in `src/shared/lib/petRenderer.ts`.

This document establishes:
1. Palette analysis and material classification of the source spritesheet (`public/pets/work-blue-cat/spritesheet.webp`).
2. Per-form visual traits, shape groups, accessories, palettes, and runtime auras.
3. The committed reproducible generation pipeline (`scripts/build-work-blue-cat-forms.py`).

---

## 2. Source Material Analysis

The source spritesheet is at `public/pets/work-blue-cat/spritesheet.webp` (1536 x 1872 px, 8 columns x 9 rows, 192 x 208 px cells).
Rows:
- 0: Idle (6 frames)
- 1: Run right (8 frames)
- 2: Run left (8 frames)
- 3: Wave / Done (4 frames)
- 4: Jump / Celebrate (5 frames)
- 5: Sleepy / Rest (8 frames, rest frame 4)
- 6: Waiting (6 frames)
- 7: Working (6 frames, typing at laptop)
- 8: Reading (6 frames)

### Material Bands (from Python HLS analysis):
- **Cat Fur**: Slate blue/gray body, head, tail, paws (`#505060` to `#6d6d75`, hue 230-260, lightness 0.30-0.50, saturation < 0.12).
- **Amber Eyes**: Amber/golden irises (`#92632d` to `#fed073`, hue 30-48, lightness 0.35-0.75, saturation > 0.40).
- **Inner Ears**: Salmon / pinkish warm interior (`#7b4c3c` to `#9e6953`, hue 5-25, lightness 0.30-0.50, saturation 0.15-0.45).
- **Cheek Whiskers**: Warm tan whisker stripes (`#9a8675` to `#b19c89`, hue 24-45, lightness 0.45-0.65, saturation 0.14-0.35).
- **Hoodie Fabric**: Sage green base (`#3d6b50` to `#63ae83`, hue 110-170, lightness 0.25-0.65, saturation > 0.20).
- **Hoodie Stripes**: Light knit stripes (`#bdd4b7` to `#f6f6f2`, lightness > 0.75, saturation < 0.30).
- **Laptop Case**: Warm taupe / slate chassis (`#857868` to `#877969`, hue 25-45, lightness 0.40-0.55, saturation 0.10-0.20).
- **Laptop Paw Logo**: Mint green glowing emblem (`#98ddad` to `#b1efc6`, hue 120-150, lightness 0.65-0.85, saturation > 0.25).
- **Outlines**: Black / dark charcoal outlines (`#000000` to `#202020`, lightness < 0.15).

---

## 3. Per-Form Specification & Shape Groups

| # | Form ID | Name | Lv | Shape Group & Accessory | Hoodie / Fur / Eye Palette | Aura |
|---|---|---|---|---|---|---|
| 1 | `classic` | Cozy Sage Hoodie | 1 | Base cat sitting at laptop | Sage green hoodie (`#3d6b50`/`#5ea077`), amber eyes (`#d97706`/`#fbbf24`), warm gray laptop | Soft amber/sage glow |
| 2 | `midnight` | Midnight Coder | 3 | Steaming coffee mug on desk beside laptop | Charcoal midnight hoodie (`#1f242d`/`#333f4f`), warm amber night eyes, obsidian laptop with amber paw | Deep indigo & amber shimmer |
| 3 | `indigo` | Midnight Indigo Flow | 5 | Coder blue-light spectacles / glasses on face | Deep midnight indigo hoodie (`#1e1b4b`/`#312e81`), cyan glowing eyes (`#06b6d4`/`#22d3ee`), navy laptop | Electric cyan & indigo pulse |
| 4 | `deep-work` | Deep Work Master | 8 | Over-ear noise-cancelling headphones + headband | Graphite black hoodie with crimson Pomodoro stripes (`#18181b`/`#dc2626`), ruby eyes (`#ef4444`), matte black laptop | Focus crimson & graphite halo |
| 5 | `lofi-study` | Lo-Fi Beats Companion | 12 | Studio DJ headphones + cozy knit neck scarf | Pastel peach/rose hoodie with cream knit stripes (`#be185d`/`#f472b6`), golden hazel eyes (`#eab308`), cozy olive laptop | Chillhop lavender & rose wave |
| 6 | `aurora` | Golden Amber Flow | 15 | Amber goggles / visor pushed up on forehead | Sunset amber/gold gradient hoodie (`#b45309`/`#f59e0b`), radiant golden eyes, champagne gold laptop | Golden amber & warm twilight aurora |
| 7 | `amber-flow` | Solar Resonator | 20 | Solar resonator cyber antennae on ear tips | Vibrant solar yellow-orange hoodie (`#ea580c`/`#f97316`), bright sunburst eyes, solar gold laptop | Solar flare warmth & sparks |
| 8 | `synthwave` | Retro Synthwave | 25 | 80s neon cyber shutter-shades / visor glasses | Neon synthwave magenta/purple hoodie (`#701a75`/`#c026d3`), neon cyan stripes & eyes (`#00f0ff`), cyber neon laptop | Neon magenta & cyan grid aura |
| 9 | `astral` | Astral Mind Cat | 30 | Celestial third eye star gem + cosmic horns | Cosmic deep violet hoodie with starlight dust (`#3b0764`/`#7e22ce`), celestial turquoise eyes (`#2dd4bf`), void laptop | Cosmic celestial violet & turquoise aura |
| 10 | `timeless` | Timeless Architect | 35 | Ethereal floating architect halo above head | Sacred ivory white hoodie with pure gold stripes (`#fafaf9`/`#eab308`), transcendent sky eyes (`#38bdf8`), pearl architect laptop | Transcendent pure gold & divine pearl halo |

---

## 4. Invariants

1. 8 x 9 grid and 192 x 208 cell dimensions preserved.
2. WebP saved with lossy quality 92, alpha_quality 100, method 6.
3. Every shape group produces a distinct alpha silhouette hash in `manifest.json`.
4. Runtime auras added to `FORM_AURAS` in `src/shared/lib/petRenderer.ts`.
5. Automated tests in `tests/pet-forms.test.mjs` verify manifests, palettes, and auras.
