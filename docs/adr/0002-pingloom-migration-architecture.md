# 0002: Pingloom Gesture and Overlay Migration Architecture

## Status
Accepted

## Context
We are migrating the full desktop ping and emote gesture engine from Pingloom (`/Users/mac/Documents/pingloom`) into `rust-sound`. Pingloom implements trigger-held radial gestures, 8-slice directional selection, central deadzone cancellation, and expressive audio/visual feedback.

## Decision
We adopt a hybrid, multi-crate architecture:
1. **Isolated Workspace Crate (`crates/pingloom`)**: Domain models (`model.rs`, `geometry.rs`, `gesture.rs`, `animation.rs`, `settings.rs`) and low-level macOS input hooks (`CGEventTap`) live in an independent workspace crate to keep `crates/app` lean per `AGENTS.md`.
2. **Native Global Event Tap (`CGEventTap`)**: Low-level mouse and trigger key monitoring runs via native macOS CoreGraphics event tap, requiring standard macOS Accessibility permissions, ensuring gestures work over games and fullscreen spaces with zero lag.
3. **Hybrid Rendering Pipeline**: Rust owns the low-level input state machine and deadzone math, emitting high-level gesture events to the existing transparent Tauri overlay webview (`PingOverlay.svelte` / `GlobalPingHost.svelte`), rendered in Svelte 5 + Tailwind v4 + SVG.
4. **DSP Bus Audio Integration**: Ping and emote sounds are routed through `rust-sound`'s internal DSP audio chain (`crates/engine` System Sounds Bus) rather than standalone output devices, subjecting them to EQ, volume control, and ducking.

## Consequences
- Requires macOS Accessibility Permissions prompt when running for the first time.
- Clean separation between DSP/hardware audio (`crates/engine`), native gesture tapping (`crates/pingloom`), and the frontend GUI.
