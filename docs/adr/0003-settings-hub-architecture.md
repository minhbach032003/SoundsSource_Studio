# 0003: Settings Hub Architecture and Categorization

## Context

The previous settings interface presented all 7 primary configuration panels (Atmosphere Wallpaper, Theme Palette, Google Auth, CoreAudio Hardware & Virtual Cable, Voice AI, Agent Pet, Pingloom CGEventTap Gestures, and Mach Task Performance Diagnostics) in a single linear, vertically stacked scrollview exceeding 1,400 lines of markup. This created visual clutter and excessive cognitive friction for studio operators adjusting specific audio or input parameters.

## Decision

We reorganize the Settings interface into a segmented **Settings Hub** with:
1. **Four Primary Operational Categories**:
   - `appearance` (Giao diện & Atmosphere): Studio Lighting Presets, Custom Image Upload, Dimming/Blur sliders, Pingloom Theme Palettes, and Compact Agent Pet Quick Link.
   - `audio` (Âm thanh & Voice AI): CoreAudio Sample Rate & Buffer Latency, Virtual Cable Routing Guide Modal, Whisper/Gemini Voice AI Model & Input Mode.
   - `gestures` (Cử chỉ & Điều khiển Pingloom): macOS CGEventTap Accessibility Permissions, Global Gesture toggles, Quick Ping, Radial Wheel Trigger keys, and Deadzone slider.
   - `system` (Hệ thống & Tài khoản): Google Cloud Sync & Dual-Auth, Neon DB connection status, Mach Task Memory/CPU diagnostics, Latency RTT Benchmark, Background RAM Saver, and Memory Purge.
2. **Horizontal Segmented Header**: Retains desktop layout ergonomics without splitting the horizontal workspace into nested vertical sidebars.
3. **Instant Search & Keyword Filtering**: Provides fast access to individual settings controls across all panels.
4. **Compact Agent Pet Card**: Integrates active pet switching directly into Settings while delegating in-depth progression and animations to the dedicated `AgentPetSettingsView` via `navigateTo("pet-settings")`.
