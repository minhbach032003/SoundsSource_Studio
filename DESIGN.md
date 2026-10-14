# Application mixer — macOS Dark Studio

Approved direction: modern macOS Dark Studio audio panel with refined obsidian surfaces, subtle frosted borders, electric cyan-blue audio accents, and tactile coral mute states. Built in vanilla TypeScript/CSS with zero runtime dependencies.

- Surface base: #0b0f14; elevated card: #151b23; card hover: #1b222c; border: rgba(255, 255, 255, 0.08).
- Text primary: #f1f5f9; secondary: #94a3b8; muted: #64748b.
- Audio Accent: #38bdf8 (electric cyan-blue) with vibrant track fills and focus rings.
- Mute/Alert Accent: #fb7185 / #f43f5e (coral red) with distinct active glow and muted card dimming.
- Live Status: #10b981 (vibrant emerald) with soft pulsing animation.
- Typography: macOS system sans (-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif); 13px base body; 16px maximum heading; tabular numeric volume percentages.
- App window: 520 × 740, minimum 360 × 500. Under 420px, configuration controls stack and slider padding contracts seamlessly without horizontal overflow.
- Hierarchy:
  1. Desktop toolbar (brand mark, title, live engine status indicator, tactile refresh button).
  2. Quick configuration bar (compact output device & preset selectors with custom chevrons).
  3. Mixer section header (application title, count pill, and segmented filter tabs).
  4. Elevated application channel cards (squircle avatar with gradient, process title & identifier, animated playing equalizer, glow volume slider, percentage badge, tactile mute toggle).
  5. Minimal macOS status footer.
- Micro-interactions:
  - Smooth slider volume tracking via `--level` CSS custom property.
  - Interactive tactile mute button with instant visual feedback and error rollback.
  - Skeletons with subtle shimmer gradient animation.
  - Accessible focus rings, ARIA labels, and `prefers-reduced-motion` compliance.

Verification: TypeScript/Vite build, Rust workspace tests, and frontend grouping/formatting tests pass cleanly. Browser fixture checks cover rendering at 520px and 375px without horizontal overflow.
