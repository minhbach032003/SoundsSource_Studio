## Why

Dự án `rust-sound` hiện đang là ứng dụng CLI thuần bằng Rust. Để cung cấp giao diện đồ họa (GUI) cho người dùng macOS điều khiển âm thanh từng ứng dụng theo chuẩn của Tauri (tham khảo https://github.com/tauri-apps/tauri), dự án cần chuyển đổi sang cấu trúc chuẩn Tauri v2 kết hợp frontend TypeScript và backend Rust.

## What Changes

- Thiết lập cấu trúc thư mục chuẩn Tauri v2:
  - Thư mục gốc chứa TypeScript UI với Vite, `@tauri-apps/api`, `package.json`, `tsconfig.json`.
  - Thư mục `src-tauri/` chứa Rust backend, `Cargo.toml`, `tauri.conf.json`, `capabilities/`, `build.rs`, `icons/`.
- Tích hợp CoreAudio engine và DSP router từ Rust vào Tauri commands (`get_audio_processes`, `get_audio_devices`, `set_app_volume`, `set_app_mute`, `get_presets`, `save_preset`).
- Cung cấp giao diện frontend TypeScript điều khiển danh sách ứng dụng, thanh kéo âm lượng, nút mute và bộ chỉnh EQ 10-band.
- Cập nhật Git, `.gitignore` và `README.md`.

## Capabilities

### New Capabilities
- `tauri-app-structure`: Cấu trúc project chuẩn Tauri v2 phân tách frontend TypeScript và backend Rust `src-tauri`.
- `tauri-audio-bridge`: Cầu nối IPC Tauri commands kết nối frontend với CoreAudio và DSP engine của Rust.

### Modified Capabilities
*(Không có spec cũ nào trước đó)*

## Impact

- Cấu trúc thư mục: Mã nguồn Rust được tổ chức bên trong `src-tauri/`, mã nguồn frontend nằm tại `src/` ở root.
- Dependencies: Thêm dependencies `@tauri-apps/api`, `@tauri-apps/cli`, `vite`, `typescript` vào `package.json`; thêm `tauri`, `tauri-build` vào `src-tauri/Cargo.toml`.
- Workflow build: Hỗ trợ cả `pnpm tauri dev`, `pnpm build`, và `cargo test --manifest-path src-tauri/Cargo.toml`.
