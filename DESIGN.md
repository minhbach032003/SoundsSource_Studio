# Application mixer

Approved direction: graphite desktop audio panel with a restrained mint accent; implemented in vanilla TypeScript/CSS without new dependencies.

- Surface: #171c1b; grouped configuration: #202725; separators: #34403b.
- Text: #ecf1ef; secondary: #a0afa9; interaction accent: #85cfb6.
- Type: macOS system sans, 13px body; 26px maximum heading; tabular numeric volume values.
- App window: 520 × 740, minimum 360 × 500. At 400px and below configuration stacks and sliders use full row width.
- Hierarchy: brand, mixer introduction/refresh, read-only configuration, application rows, engine-preview disclosure.
- Rows use separators rather than nested cards; initials represent apps without actual icons. Playing status is sourced from CoreAudio, not decorative metering.
- Volume commits on change; mute changes after successful IPC. Refresh preserves session UI state. Process helpers share a row per bundle; missing bundle IDs have disabled controls.
- Native controls retain semantics and accessible labels; sliders have matching WebKit/Chromium tracks and thumbs. All/Playing filters, loading/empty/error states, focus outlines and reduced motion are supported.
- Device/preset selectors remain disabled until their actions are implemented. Live audio capture/output is not connected; preview labels must remain.

Verification: TypeScript/Vite build, 11 Rust tests and one frontend grouping test pass. Browser fixture checks cover rendering/volume/mute at 520px and 375px, no horizontal overflow and no WCAG A/AA axe violations. Native Tauri window inspected separately using real CoreAudio discovery. Browser fixtures are QA-only, not shipped data.
