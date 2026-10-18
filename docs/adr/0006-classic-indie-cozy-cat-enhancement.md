# 0006: Classic Indie Cozy Cat Visual Enhancement

## Context

The user selected Option 1: **Classic Indie Cozy** (inspired by polished indie pixel art like *Stardew Valley*) for the desktop companion archetype `work-blue-cat`. The goal is to elevate the visual aesthetic, rendering quality, and emotional charm while maintaining complete technical compatibility with the existing animation engine.

## Decisions

1. **Aesthetic Direction: Classic Indie Cozy**:
   - **Eyes**: Deep amber gaze with dual-tier specular highlight reflecting the laptop display glow.
   - **Coat & Features**: Soft charcoal velvet fur with clean pixel-art contours and subtle facial highlights.
   - **Sweater**: Sage-green cable knit sweater with textured ribbing on the collar and cuffs.
   - **Laptop**: Brushed aluminum finish with a luminous mint-cyan paw emblem on the lid.

2. **Technical Constraints & Grid Compatibility**:
   - The spritesheet must maintain the exact 8 columns × 9 rows architecture (1536 × 1872 px master, 192 × 208 px per cell).
   - Authoring offsets and slice envelope anchors must align across all states (0: Idle, 1: WalkRight, 2: WalkLeft, 3: Wave/Done, 4: Celebrate, 5: Sleepy, 6: Waiting, 7: Typing/Working, 8: Reading/Inspection).
   - Zero-blur rendering with integer pixel grid snapping must be preserved on Retina screens.

3. **Subagent Execution Plan**:
   - Subagent 1 (Visual Asset Engineering): Generate, refine, and pack the enhanced cozy cat asset preserving all frame bounds and alpha transparency.
   - Subagent 2 (Quality & Independent Review): Verify slice coordinates, frame count, transparent alpha thresholds, and test against `tests/pet-motion.test.mjs`.
   - Coordinating Lead: Review diffs, run verification, build the production app, and deploy.
