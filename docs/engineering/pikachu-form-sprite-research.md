# Research: Rebuilding the Pikachu Pet as Ten Distinct Per-Form Sprites

## 1. Overview & Objective

Following the successful rebuild of Son Goku (`scripts/build-goku-forms.py`), the Pikachu pet companion (`public/pets/pikachu/`) suffers from the identical defect:
- `python3 -I .agents/skills/pet-form-sprites/scripts/audit_forms.py pikachu` shows **10/10 forms share the root silhouette exactly (TINT-ONLY)**.
- Every form is just a flat hue-shifted/tinted version of the root 3D Pikachu model.
- Pichu is just a yellow Pikachu.
- Champion Cap Pikachu has no cap.
- Iron Tail has no steel metallic tail.
- Electro Ball has no electric sphere.
- Gigantamax has no giant lightning tail or cloud.
- Classic Pikachu has no retro chubby silhouette.

This research documents the canon visual traits for all 10 Pikachu evolution forms, establishes their shape groups, color palettes, accessory overlays, and runtime ki/spark auras.

---

## 2. Forms & Visual Canon

| Form ID | Form Name | Min Lvl | Canon Traits & Silhouette | Body / Fur Ramp | Tail & Features | Aura & Sparks |
|---|---|---|---|---|---|---|
| `pichu` | Pichu Spark | 1 | Pichu baby silhouette: shorter proportions, diamond-shaped ears with thick black edges, black neck collar patch, small spiky tail. | Pale yellow `#fef18f` to `#fae348` | Black collar & ear outlines, pinkish cheeks `#f2647c` | Gentle yellow electric sparks |
| `classic` | Pikachu (Classic) | 3 | Gen 1 Retro Chubby "Chonkachu": rounder, stockier body, classic Gen 1 slightly paler pastel cream-yellow, slightly thicker base tail. | Classic warm cream `#f9e266` / `#f3d13e` | Classic brown tail base & back stripes | Retro pixel electric sparks |
| `spark` | Spark Volt | 5 | Standard Pikachu silhouette, high-voltage energized cheeks with intense crimson `#f02030` and crackling cheeks arcs. | Vibrant Pikachu yellow `#ffd700` | Golden lightning tail | Bright yellow electric arcs (`#ffe600`) |
| `studio` | Pikachu (Studio HD) | 8 | Refined sleek studio lighting: rich golden honey tones, specular micro-highlights on ears and eyes. | Warm gold `#ffcc00` to `#e6a800` | Sharp crisp lightning tail | Soft golden ambient glow (`#ffe875`) |
| `electro-ball` | Electro Ball | 12 | Crackling golden-cyan plasma sphere hovering at the tail tip, dynamic energy tendrils. | Electric yellow | Plasma sphere (`#4deeea` core, `#ffe600` outer) on tail tip | Blue-cyan + gold electrical burst |
| `iron-tail` | Iron Tail Strike | 15 | Hardened steel tail transformed into metallic silver / chrome with gleam glints (`#e0e8f5`, `#9bb0cc`, `#ffffff`). | Standard Pikachu yellow | Chrome metallic tail replacing yellow tail | Metallic silver glint & white sparks |
| `thunderbolt` | Thunderbolt 100K Volts | 20 | 100,000 Volts surging: crackling lightning bolts encircling body and ears, bright electrified eyes. | Radiant high-voltage neon yellow | Electrified bright tail | Violent yellow-white thunderbolts (`#ffffff` / `#ffeb3b`) |
| `overcharge` | Pikachu (Raichu Aura) | 25 | Raichu tribute: rich orange-amber fur (`#ff9f22`), darker ear contours, surging hyper-voltage. | Raichu warm amber-orange `#f58e1e` / `#d66f08` | Rich amber tail with glowing tip | Deep amber-orange high-voltage aura |
| `gigantamax` | Gigantamax Thunder | 30 | Gigantamax Pikachu: stocky colossal proportions, massive glowing crimson-yellow towering lightning tail, red Dynamax clouds. | Deep golden red-shifted | Colossal towering lightning tail (`#ffe033` with `#ff3344` Dynamax swirl) | Towering red-gold storm aura with red clouds |
| `ash-cap` | Champion Cap Pikachu | 35 | Ash Ketchum's Champion World Cap worn proudly on the head between ears: iconic red cap with white front & green/teal Pokéball crest. | Canonical vibrant Pikachu yellow | Standard lightning tail | Champion rainbow / golden electric prestige aura |

---

## 3. Shape Groups & Art Pipeline

1. **Shape Group A (Pichu)**: Baby Pichu proportions, oversized triangular ears with thick black perimeter, black neck bib/collar, pink cheeks.
2. **Shape Group B (Classic / Chonkachu)**: Chubby round body expansion, retro Gen 1 proportions.
3. **Shape Group C (Base / Studio / Spark / Thunderbolt / Overcharge)**: Canonical Pikachu silhouette, modulated by fur ramps, cheek intensity, and electrical discharges.
4. **Shape Group D (Iron Tail)**: Metallic chrome tail replacement with specular sheen.
5. **Shape Group E (Electro Ball)**: High-energy crackling plasma sphere composited at tail tip.
6. **Shape Group F (Gigantamax)**: Massive elongated lightning tail extension reaching skyward with Dynamax aura cues.
7. **Shape Group G (Ash Cap)**: Ash Ketchum's world champion cap drawn and fitted onto Pikachu's head between the ears across all animation frames.

---

## 4. Palette & Mask Specifications

- **Yellow Body**: Hue 42° - 62°, Lightness 0.45 - 0.85, Saturation > 0.40.
- **Cheeks**: Hue 340° - 15° (Red), Saturation > 0.50, Lightness > 0.30.
- **Ear Tips & Eyes**: Lightness < 0.20 (Black / Dark charcoal).
- **Back Stripes / Tail Base**: Hue 20° - 35° (Brown), Lightness 0.30 - 0.55.
- **Eye Highlights**: Lightness > 0.85, Saturation < 0.25 (White).

All forms will be generated deterministically via `scripts/build-pikachu-forms.py`, validated by tests, and rendered with custom runtime auras in `FORM_AURAS`.
