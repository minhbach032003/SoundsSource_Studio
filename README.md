# SoundsSource Studio (rust-sound)

An ultra-low latency, studio-grade macOS & cross-platform desktop application built with **Rust (Tauri v2)** and **Svelte 5 + Tailwind CSS v4**. It combines per-application CoreAudio routing, Spotify Connect local player with 10-band studio parametric EQ, native system cleaning & optimization (Mole-grade), Gemini Live 1:1 Voice AI, focus Pomodoro timer, and a desktop AgentPet companion.

---

## Architecture & Workspace Layout

SoundsSource Studio is organized as a modular **Cargo Monorepo Workspace** following a strict downward-only dependency hierarchy:

```text
app -> engine (thin coordinator) -> {dsp, spotify, auth, pet, calendar} -> core
                                                                        ↗
                                                               pingloom (standalone)
```

```text
rust-sound/
├── Cargo.toml                 # Root workspace manifest & release optimizations
├── Cargo.lock
├── package.json               # Frontend dependencies & Tauri scripts
├── pnpm-lock.yaml
├── index.html
├── vite.config.ts
├── tsconfig.json
├── src/                       # Frontend: Svelte 5 (runes $state/$derived/$effect) + Tailwind CSS v4
│   ├── main.ts                # Multi-window mounting & route initialization
│   ├── App.svelte             # Studio desktop shell & navigation rail
│   ├── views/                 # Cleaner, Mixer, Spotify, Timer, Pet, Voice AI, Settings
│   └── components/            # Reusable UI & audio/pet controls (@lucide/svelte icons)
├── crates/
│   ├── core/                  # sound-core: macOS CoreAudio hardware, process taps, ring buffer
│   ├── dsp/                   # sound-dsp: 10-band Parametric EQ, soft-clip, dynamic filters, spectrum
│   ├── auth/                  # sound-auth: JWT HMAC-SHA256, PKCE S256, Google OAuth, Neon PostgreSQL
│   ├── calendar/              # sound-calendar: Google Calendar PKCE sync, agenda schedule parsing
│   ├── spotify/               # sound-spotify: Embedded Librespot player, audio tap streaming, Web API
│   ├── pet/                   # sound-pet: AgentPet companion engine, care XP, IPC Unix domain socket
│   ├── pingloom/              # pingloom: CGEventTap radial wheel gestures & tactical pings
│   ├── engine/                # sound-engine: Coordinator, audio router, Pomodoro ducking, wheel wire
│   └── app/                   # rust-sound (desktop shell): Tauri commands, windowing, AppState
└── openspec/                  # OpenSpec specifications and verified change history
```

---

## Release & Packaging on GitHub

SoundsSource Studio uses **GitHub Actions** for automated testing, multi-platform compilation, packaging, and release delivery.

### 1. Automated GitHub Releases via Tags

Whenever a new version tag (starting with `v*`) is pushed to the repository, the release pipeline (`.github/workflows/release.yml`) automatically triggers:

```bash
# 1. Ensure you are on the main branch with all checks passing
git checkout main
git pull origin main

# 2. Create an annotated version tag
git tag -a v0.1.0 -m "Release v0.1.0: SoundsSource Studio with System Cleaner & Spotify Connect"

# 3. Push the tag to GitHub
git push origin v0.1.0
```

### 2. Multi-Platform Artifact Matrix

The GitHub Actions workflow builds and packages standalone production binaries for three platforms in parallel using `tauri-action`:

| Platform | Runner | Generated Release Artifacts | Description |
| :--- | :--- | :--- | :--- |
| **macOS** | `macos-latest` | `SoundsSource Studio.dmg`<br>`SoundsSource Studio.app.tar.gz` | Universal/Apple Silicon & Intel build with CoreAudio taps & codesign |
| **Windows** | `windows-latest` | `SoundsSource Studio_x64_en-US.msi`<br>`SoundsSource Studio_x64-setup.exe` | Windows 10/11 x64 installer with native cleanup & hardware monitor |
| **Linux** | `ubuntu-22.04` | `soundssource-studio_amd64.deb`<br>`soundssource-studio_amd64.AppImage` | Debian package and standalone AppImage |

Once compiled, GitHub Actions automatically attaches these assets to a draft or published **GitHub Release** under your repository's [Releases tab](https://github.com/minhbach032003/rust-sound/releases).

### 3. GitHub Packages & Container Integration

For libraries or automated runners, packages and build caches are integrated directly with GitHub Packages and GitHub Actions Cache (`swatinem/rust-cache` and `pnpm/action-setup`).

---

## Local Development & Packaging

### Prerequisites

- **macOS 14.2+** (recommended for CoreAudio process audio taps) or **Windows 10/11**.
- **Rust**: Stable toolchain supporting Rust edition 2024 (1.85+).
- **Node.js**: Version 20+ with `pnpm`.
- **macOS Command Line Tools**: `xcode-select --install`.

### Setup & Local Dev

```bash
# Clone the repository
git clone https://github.com/minhbach032003/rust-sound.git
cd rust-sound

# Install dependencies
pnpm install

# Start local Tauri live development server
pnpm tauri dev
```

### Local Production Build & Deployment

To build the standalone release binary and deploy it directly into your macOS `/Applications/` folder for immediate use:

```bash
# Rebuild, code-sign, and deploy to /Applications/SoundsSource Studio.app
pnpm rebuild:app
```

Or build bundles for distribution without deploying:

```bash
# Build desktop production bundles (DMG / app)
pnpm tauri build
```

---

## Cloudinary Pet Downloads

The companion gallery's **Pet trên Cloudinary** section lists published supported pets. **Tải về** stores the base sprite and all 10 evolution sheets/avatars in the app's persistent webview storage. Installed sprites work after restart without a network connection, including desktop pet windows. Downloading does not automatically equip a pet; clearing application website data removes offline installations. The eight supported archetypes remain bundled as fallbacks.

Publish the current assets and public catalog with the existing Cloudinary account (Node.js 20.12+). Keep `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` in the ignored `.env` or shell; never put them in `VITE_*` variables. The configured cloud is `mvvfpbof`.

```bash
pnpm pets:upload --dry-run  # inspect counts/size without uploading
pnpm pets:upload            # upload images, then publish pets/catalog.json
node --test tests/pet-cloud.test.mjs
node tests/pet-cloud-browser.mjs        # real UI/storage, fixture CDN responses
node tests/pet-cloud-browser.mjs --live # real Cloudinary download + offline restart
node tests/pet-cloud-browser.mjs --live --native # macOS WKWebView storage + image decoding
```

A failed publication leaves the previous catalog in place. A failed download or storage write preserves complete local installations; the gallery offers retry. No Cloudinary management credentials are included in the desktop frontend.

## Test & Verification Suite

We enforce a 100% test pass rate across the full workspace before committing and releasing:

```bash
# 1. Run all Rust unit and integration tests (31 unit + 10 E2E suites)
cargo test --workspace

# 2. Check Rust compile and type integrity
cargo check --workspace

# 3. Verify Svelte 5 frontend TypeScript types
pnpm check

# 4. Run full frontend Node.js test suite (211/211 passing tests)
node --test tests/*.test.mjs

# 5. Run automated browser E2E test with agent-browser
node tests/cleaner-browser.mjs
```

---

## Core Capabilities

- **macOS System Studio & Cleaner**: Mole-grade deep cleaning (user caches, logs, Xcode DerivedData, package manager caches, installers), smart app uninstaller with remnant discovery across `~/Library/`, and one-click system optimizer (DNS flush, QuickLook refresh, RAM memory pressure relief, LaunchServices rebuild).
- **Audio Mixer & CoreAudio Process Taps**: Per-application volume control, mute, stereo balance, and 10-band studio parametric EQ with soft-knee saturation protection against digital clipping.
- **Embedded Spotify Connect Player**: Native Librespot playback with audio tap streaming, spectrum analyzer, and offline token management.
- **AgentPet Desktop Companion**: Transparent floating animated companion that reacts to coding workflows, tool calls, and subagent parallel tasks.
- **Gemini Live 1:1 Voice AI**: Real-time conversational AI voice assistant with screen sharing and tool execution.
- **Tactical Pingloom Wheel**: Low-latency 8-directional radial gesture wheel with sound effects and custom emote markers.
- **Focus Pomodoro Timer & Google Calendar**: Smart break timer with audio ducking, screen lock overlays, timeboxed todos, and Google Calendar sync.
