# 0004: Brand Identity and Logo Architecture

## Context

The application previously had conflicting brand identities: the technical workspace and repository used `rust-sound`, window titles and comments used variations of `SoundsSource Rust`, and the visual emblem was a basic set of five flat rectangles. The application required a cohesive, professional identity suitable for a high-end macOS audio tool.

## Decision

1. **Official Brand Name**:
   - The application is formally branded **SoundsSource Studio** (`CFBundleName`, `CFBundleDisplayName`, `productName`, and UI wordmarks).
   - The technical binary and crate naming (`rust-sound`) is retained for backend compilation stability and internal IPC channels, while the external bundle is `SoundsSource Studio.app` with a symlink to `rust-sound.app` to ensure CLI backwards compatibility.
2. **Brandmark Visual Architecture**:
   - The brandmark is codified as the **Tactical Sonic Loom**:
     - An outer precision tactical calibration aperture ring with cardinal crosshair ticks.
     - An ambient radial core glow.
     - Five harmonic frequency equalizer bars with capped pill geometry rendered using the dynamic studio theme gradient (`var(--strong)` -> `var(--focus)` -> `var(--accent)`).
     - A transverse resonant crest wave sweeping across the frequency bands.
3. **macOS System Icon Synchronization**:
   - Generated high-resolution 1024x1024 master assets and compiled a multi-resolution `.icns` bundle and standard PNGs for macOS Dock, Launchpad, and Finder presentation.
