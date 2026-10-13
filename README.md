# rust-sound (Tauri v2 + Rust CoreAudio)

Dự án viết lại ứng dụng **voice-macos** (SoundsSource) bằng **Rust** kết hợp giao diện **TypeScript / Tauri v2** (theo kiến trúc chuẩn của [tauri-apps/tauri](https://github.com/tauri-apps/tauri)). Cung cấp giải pháp điều khiển và định tuyến âm thanh độc lập cho từng ứng dụng trên macOS (Per-App Audio Control).

> **Yêu cầu hệ thống**: macOS 14.2 (Sonoma) trở lên. Sử dụng API **Audio Process Tapping** (`CATapDescription`, `AudioHardwareCreateProcessTap`) của Apple CoreAudio.

---

## ⚡ Tính năng chính

- **Giao diện người dùng Tauri v2 (TypeScript + Vite)**: Bảng điều khiển trực quan hiển thị danh sách ứng dụng phát âm thanh, thanh kéo âm lượng, nút mute tức thì và bộ chọn preset/thiết bị xuất.
- **Tách luồng âm thanh theo ứng dụng (Process Tapping)**: Bắt luồng audio của từng ứng dụng riêng biệt (Spotify, Chrome, Discord, Games...) thông qua Apple CoreAudio Process Tap.
- **Lock-Free Ring Buffer**: Bộ đệm vòng không khóa (SPSC) an toàn cho luồng xử lý âm thanh thời gian thực (real-time audio I/O threads).
- **Bộ cân bằng âm thanh Parametric EQ 10 dải**:
  - Dải tần: 32 Hz, 64 Hz, 125 Hz, 250 Hz, 500 Hz, 1 kHz, 2 kHz, 4 kHz, 8 kHz, 16 kHz.
  - Bộ lọc Biquad Peaking filter với hệ số động.
- **Định tuyến đầu ra (Audio Routing)**: Hỗ trợ chuyển hướng âm thanh của từng app tới các thiết bị phát khác nhau (loa ngoài, tai nghe, DAC).
- **Lưu trữ Presets**: Lưu cấu hình âm lượng, routing và EQ theo định dạng JSON tại `~/.config/rust-sound/presets.json`.

---

## 🏗 Cấu trúc dự án (Tauri v2 Architecture)

Dự án được cấu trúc theo chuẩn repo của `tauri-apps/tauri`:

```text
rust-sound/
├── package.json              # Quản lý dependencies Frontend (Vite, TypeScript, @tauri-apps/api)
├── tsconfig.json             # Cấu hình TypeScript
├── vite.config.ts            # Cấu hình Vite bundler cho Tauri
├── index.html                # Giao diện chính của ứng dụng
├── src/                      # Frontend TypeScript
│   ├── main.ts               # IPC invoke gọi các Tauri commands từ Rust
│   └── styles.css            # Giao diện Dark theme phong cách macOS
├── src-tauri/                # Backend Rust
│   ├── Cargo.toml            # Dependencies Rust (tauri, serde, CoreAudio)
│   ├── tauri.conf.json       # Cấu hình cửa sổ, định danh và bundle Tauri v2
│   ├── capabilities/         # Quyền hạn bảo mật IPC (core:default)
│   ├── build.rs              # Script build Tauri
│   ├── icons/                # Bộ biểu tượng ứng dụng macOS (.icns, .png)
│   ├── src/
│   │   ├── main.rs           # Entry point của ứng dụng Tauri
│   │   ├── lib.rs            # Tauri command handlers & AppState management
│   │   ├── core/
│   │   │   ├── mod.rs
│   │   │   ├── ring_buffer.rs # SPSC Lock-free ring buffer
│   │   │   ├── process.rs     # Quét danh sách tiến trình CoreAudio & chuẩn hóa Bundle ID
│   │   │   └── tap.rs         # CoreAudio Process Tap FFI (Sonoma 14.2+)
│   │   └── engine/
│   │       ├── mod.rs
│   │       ├── eq.rs          # 10-band Parametric EQ DSP
│   │       ├── device.rs      # Quét thiết bị xuất âm thanh macOS
│   │       ├── preset.rs      # Quản lý lưu trữ Preset JSON
│   │       └── router.rs      # Audio router stereo cho từng app
│   └── tests/
│       └── pipeline_e2e.rs   # Kiểm thử tích hợp toàn bộ pipeline
└── Cargo.toml                # Cargo workspace trỏ tới src-tauri
```

---

## 🚀 Hướng dẫn phát triển & Chạy thử

### 1. Cài đặt môi trường
- **Rust**: `rustup` (1.80+ hoặc 2024 edition).
- **Node.js**: v20+ & **pnpm**.
- **macOS**: 14.2+ (Sonoma) và Xcode Command Line Tools.

### 2. Cài đặt thư viện
```bash
pnpm install
```

### 3. Kiểm tra kiểm thử (Unit test & E2E)
```bash
# Chạy toàn bộ 11 test cases của Rust backend
cargo test

# Build kiểm tra Frontend TypeScript
pnpm build
```

### 4. Chạy ứng dụng chế độ Development
```bash
pnpm tauri dev
```
