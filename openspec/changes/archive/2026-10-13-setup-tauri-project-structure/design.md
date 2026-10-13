## Context

Dự án `rust-sound` chuyển đổi từ `voice-macos` sang Rust. Theo yêu cầu người dùng, cấu trúc dự án cần được tổ chức lại theo cấu trúc repo chính thức của Tauri (https://github.com/tauri-apps/tauri) với Tauri v2, kết hợp giao diện TypeScript hiện đại và backend Rust hiệu năng cao.

## Goals / Non-Goals

**Goals:**
- Thiết lập cấu trúc Tauri v2 chuẩn với `src-tauri/` (Rust crate) và thư mục gốc (Vite + TypeScript + HTML/CSS).
- Di chuyển mã nguồn xử lý audio (`core` và `engine`) vào `src-tauri/src/`.
- Cung cấp các lệnh Tauri command an toàn kết nối state của router và preset store.
- Đảm bảo mã nguồn Rust và frontend TypeScript đều biên dịch thành công mà không có lỗi.

**Non-Goals:**
- Tự động đóng gói release `.dmg` trên máy production (chỉ thiết lập cấu trúc và build scripts).
- Thay thế hoàn toàn API CoreAudio nguyên bản (giữ nguyên cấu trúc tương thích macOS Sonoma 14.2+).

## Decisions

- **Tauri v2:** Lựa chọn phiên bản ổn định mới nhất của Tauri (v2) vì hỗ trợ cấu trúc phân tách rõ ràng và tương thích tốt với macOS AppKit / CoreAudio.
- **Vite + TypeScript:** Sử dụng Vite làm bundler cho frontend TypeScript để khởi động nhanh và tương thích tiêu chuẩn Tauri.
- **Tauri State & Mutex:** Sử dụng `tauri::State` với `Mutex<AudioRouter>` và `Mutex<PresetStore>` để quản lý trạng thái luồng xử lý và lưu trữ cài đặt an toàn giữa các command gọi từ TypeScript.

## Risks / Trade-offs

- [Yêu cầu môi trường Node/pnpm và Rust] → Dự án đã có sẵn pnpm và rustc 1.95+ trên máy local.
- [Đường dẫn config file khi chạy dev vs bundled] → Dùng `~/.config/rust-sound/presets.json` nhất quán cho cả hai chế độ.
