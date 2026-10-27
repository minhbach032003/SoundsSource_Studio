# Research: Dragon Ball Goku Ki & Aura Specifications per Evolution Form

> Superseded by `goku-form-sprite-redesign-research.md`, which covers hair, eyes and gi per form and corrects the aura colours below.

## 1. Overview & Objective

This document analyzes the canonical visual attributes, dynamics, colors, and particle physics of Son Goku's Ki auras across each of the 10 progression forms in the Dragon Ball franchise (Toriyama, Shueisha, Toei Animation *Dragon Ball Z* & *Dragon Ball Super*). It serves as the engineering baseline for rendering authentic dynamic CSS/Canvas Ki aura shaders in SoundsSource Studio.

---

## 2. Lore Analysis by Form Tier

### Tier 1: Base Form (Goku Base)
- **Lore Context**: Goku's natural state. Mortal ki remains dormant or gently circulated.
- **Visual Attributes**:
  - **Aura**: Faint white/translucent ambient ripple only when powering up. Transparent under resting flow.
  - **Color**: Clear white / subtle ivory (`rgba(255, 255, 255, 0.25)`).
  - **Dynamics**: Gentle ground dust displacement; minimal air distortion.

### Tier 2: Kaio-ken (x20)
- **Lore Context**: Ancient technique taught by King Kai on North Kaio's planet. Multiplies the user's mortal ki reservoir at great cardiovascular and muscular strain.
- **Visual Attributes**:
  - **Aura**: Turbulent, crimson-red fiery envelope with jagged edges rising rapidly upward.
  - **Color**: Deep crimson red (`#ef4444` / `#dc2626`) with bright scarlet core.
  - **Dynamics**: High-speed pulsing energy waves; outward sonic shockwaves.

### Tier 3: Super Saiyan 1 (Full Power / Grade 4)
- **Lore Context**: Legendary transformation triggered by profound emotional rage and S-cells concentration on Planet Namek.
- **Visual Attributes**:
  - **Aura**: Steady, radiant golden flame rising upward continuously.
  - **Color**: Bright solar yellow-gold (`#facc15` / `#eab308`).
  - **Dynamics**: Flowing laminar flame; slight illumination of skin and surroundings.

### Tier 4: Super Saiyan 2 (Ascended / Cell Games)
- **Lore Context**: Breakthrough beyond the Super Saiyan barrier. First demonstrated by Gohan, later mastered by Goku during Otherworld training.
- **Visual Attributes**:
  - **Aura**: Sharper, intensely agitated golden flame with spikier energy contours.
  - **Particles & Lightning**: Intermittent bio-electric lightning discharges and sparks (`#38bdf8` / `#67e8f9`) crackling across the torso and limbs.
  - **Dynamics**: High frequency, rapid pulsation.

### Tier 5: Super Saiyan 3
- **Lore Context**: Pushing Saiyan biology to its absolute extreme by drawing out every drop of latent power. Revealed against Majin Buu.
- **Visual Attributes**:
  - **Aura**: Gigantic, roaring golden ki tempest forming an expansive oval envelope.
  - **Lightning**: Dense, continuous jagged electric bolts snapping relentlessly around the perimeter.
  - **Color**: Deep amber-gold core with bright electric highlights (`#f59e0b` / `#fbbf24`).
  - **Dynamics**: Earth-shaking vibration, high atmospheric density.

### Tier 6: Super Saiyan God (*Super Saiyan God*)
- **Lore Context**: Divine ritual involving five righteous Saiyans infusing spirit into a sixth. First encountered in the battle against Beerus, God of Destruction.
- **Visual Attributes**:
  - **Aura**: Fluid, vermilion/ruby flame-like divine ki resembling real burning fire rather than spiky ki blasts.
  - **Particles**: Tiny floating embers and fire-like solar sparks drifting upward.
  - **Color**: Fiery magenta-crimson with warm orange core (`#f43f5e` / `#e11d48`).
  - **Dynamics**: Fluid, wavy, zero-spikiness; Goku's body frame appears slimmer and more youthful.

### Tier 7: Super Saiyan Blue (*Super Saiyan God Super Saiyan*)
- **Lore Context**: The power of Super Saiyan God absorbed and channeled through the Super Saiyan transformation. Mastered under Whis.
- **Visual Attributes**:
  - **Aura**: Dual-layer tranquil god ki. Inner vivid cerulean/cyan flame surrounded by a delicate yellow god ki outer rim.
  - **Particles**: Shimmering diamond-like stardust particles floating within the blue flame.
  - **Color**: Electric cyan-blue (`#38bdf8` / `#0ea5e9`) with subtle golden-yellow edge.
  - **Dynamics**: Calmer, high-pressure divine concentration with sparkling particle dissipation.

### Tier 8: Super Saiyan Blue Kaio-ken (x20)
- **Lore Context**: Pinnacle technique combining God Ki's supreme energy control with Kaio-ken's multiplicative power. Unveiled against Hit in the Universe 6 tournament.
- **Visual Attributes**:
  - **Aura**: Phenomenon of two distinct layered auras: internal calm blue divine flame enveloped entirely by an outer roaring, violent red Kaio-ken shell.
  - **Color**: Multi-spectral gradient: Cyan-azure core (`#06b6d4`) inside a ferocious crimson scarlet halo (`#ef4444`).
  - **Dynamics**: Extreme visual contrast between internal serenity and external violent turbulence.

### Tier 9: Ultra Instinct -Sign- (*Migatte no Gokui "Kizashi"*)
- **Lore Context**: The prelude to the divine autonomous martial arts state where the body reacts without conscious thought.
- **Visual Attributes**:
  - **Aura**: Ghostly, flowing heat vapor and shimmering indigo-silver mirage.
  - **Particles**: Deep blue and bright silver crystal particles floating lazily upward.
  - **Color**: Dark cobalt blue, slate, and ethereal platinum silver (`#e2e8f0` / `#94a3b8` / `#6366f1`).
  - **Dynamics**: Intense heat distortion waves; tranquil, eerie stillness.

### Tier 10: Mastered Ultra Instinct (*Migatte no Gokui*)
- **Lore Context**: Complete divine mastery of Autonomous Ultra Instinct during the Tournament of Power against Jiren.
- **Visual Attributes**:
  - **Aura**: Blinding, radiant silver-white cosmic aurora with multi-directional celestial light rays.
  - **Particles**: Brilliant diamond galaxy dust and heat ripples radiating outward.
  - **Color**: Pure celestial silver-white (`#ffffff` / `#bae6fd` / `#cbd5e1`).
  - **Dynamics**: Omnidirectional divine radiance, immense calm, frictionless movement.

---

## 3. Sources & Citations
1. **Dragon Ball Official Site**: Official Character & Transformation Encyclopedia ([dragon-ball-official.com](https://en.dragon-ball-official.com/)).
2. **Kanzenshuu Animation Guides**: *Dragon Ball Super* character model sheets and animation supervisor notes (Tadayoshi Yamamuro, Naoki Tate).
3. **Toei Animation Production Archives**: *Dragon Ball Z: Battle of Gods* & *Dragon Ball Super: Broly* visual effects documentation.
