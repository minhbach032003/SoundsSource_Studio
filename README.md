# rust-sound

Bản viết lại `voice-macos` bằng Rust, với frontend TypeScript/Vite và ứng dụng desktop Tauri v2. Backend dùng **Cargo workspace nhiều crate**, tham khảo cách tổ chức monorepo của [tauri-apps/tauri](https://github.com/tauri-apps/tauri), không sao chép toàn bộ framework Tauri.

## Cấu trúc

```text
rust-sound/
├── Cargo.toml                 # Workspace và release profile
├── Cargo.lock
├── package.json               # Frontend và lệnh Tauri từ root
├── pnpm-lock.yaml
├── index.html
├── vite.config.ts
├── tsconfig.json
├── src/                       # Frontend TypeScript/CSS, giữ nguyên
│   ├── main.ts
│   └── styles.css
├── crates/
│   ├── core/                  # Package: sound-core (không phụ thuộc Tauri)
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── device.rs      # CoreAudio devices và CoreFoundation FFI
│   │       ├── process.rs     # Audio process enumeration
│   │       ├── ring_buffer.rs
│   │       └── tap.rs         # Process Tap FFI
│   ├── engine/                # Package: sound-engine
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── eq.rs          # Parametric EQ 10-band
│   │       ├── preset.rs      # JSON presets
│   │       └── router.rs      # DSP và trạng thái từng kênh
│   └── app/                   # Package: rust-sound, library: rust_sound_lib
│       ├── Cargo.toml
│       ├── build.rs
│       ├── tauri.conf.json
│       ├── capabilities/
│       ├── icons/
│       ├── src/
│       │   ├── lib.rs         # Tauri IPC commands và AppState
│       │   └── main.rs
│       └── tests/pipeline_e2e.rs
└── openspec/                  # Specs và lịch sử thay đổi
```

Chiều phụ thuộc: **app → engine → core**; app cũng dùng core trực tiếp. Core không tham chiếu engine. `engine::device` re-export thiết bị từ core; `rust_sound_lib::core` và `rust_sound_lib::engine` vẫn dùng được để giữ tương thích.

## Yêu cầu

- macOS 14.2+ (CoreAudio Process Tap); hiện không hỗ trợ build backend trên Windows/Linux.
- Rust hỗ trợ edition 2024 (tối thiểu 1.85; dependencies có thể cần bản mới hơn). Đã kiểm tra bằng Rust 1.95.
- Node.js 20+ và pnpm; Xcode Command Line Tools cho build desktop.

## Phát triển

Chạy các lệnh ở **root repository**:

```bash
pnpm install
pnpm tauri dev
```

Script `pnpm tauri` đặt `TAURI_APP_PATH=crates/app` và `TAURI_FRONTEND_PATH=.` để CLI tìm đúng backend và frontend. Config ứng dụng dùng `frontendDist: ../../dist`.

```bash
# Kiểm tra toàn workspace (11 tests hiện có)
cargo test --workspace
cargo check --workspace

# Test riêng thư viện, không build Tauri app
cargo test -p sound-core
cargo test -p sound-engine

# Frontend
pnpm build

# Build desktop debug, chưa đóng gói installer
pnpm tauri build --debug --no-bundle

# Đóng gói ứng dụng
pnpm tauri build
```

## Trạng thái thực tế

Hiện có: giao diện liệt kê process/thiết bị qua CoreAudio, IPC cập nhật trạng thái volume/mute/EQ, DSP xử lý PCM tổng hợp và lưu preset tại `~/.config/rust-sound/presets.json`.

**Chưa có pipeline capture → DSP → phát ra thiết bị thật được nối hoàn chỉnh.** Thanh volume/mute hiện cập nhật router state, chưa chứng minh thay đổi âm thanh Spotify/Chrome đang phát. Bộ chọn thiết bị/preset trên UI mới liệt kê dữ liệu. Các test `pipeline_e2e` kiểm tra dữ liệu tổng hợp và truy vấn hệ thống, không phải nghiệm thu audio live end-to-end. Việc tách crate không thay đổi các giới hạn này.
