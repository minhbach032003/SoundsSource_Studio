# rust-sound

Dự án viết lại ứng dụng **voice-macos** (SoundsSource) bằng ngôn ngữ **Rust**, cung cấp giải pháp điều khiển và định tuyến âm thanh độc lập cho từng ứng dụng trên macOS (Per-App Audio Control).

> **Yêu cầu hệ thống**: macOS 14.2 (Sonoma) trở lên. Sử dụng API **Audio Process Tapping** (`CATapDescription`, `AudioHardwareCreateProcessTap`) của Apple CoreAudio.

---

## ⚡ Tính năng chính

- **Tách luồng âm thanh theo ứng dụng (Process Tapping)**: Bắt luồng audio của từng ứng dụng riêng biệt (Spotify, Chrome, Discord, Games...) thông qua Apple CoreAudio Process Tap.
- **Lock-Free Ring Buffer**: Bộ đệm vòng không khóa (SPSC) an toàn cho luồng xử lý âm thanh thời gian thực (real-time audio I/O threads).
- **Bộ cân bằng âm thanh Parametric EQ 10 dải**:
  - Dải tần tiêu chuẩn: 32 Hz, 64 Hz, 125 Hz, 250 Hz, 500 Hz, 1 kHz, 2 kHz, 4 kHz, 8 kHz, 16 kHz.
  - Bộ lọc Biquad Peaking filter với hệ số động.
- **Định tuyến đầu ra (Audio Routing)**: Hỗ trợ chuyển hướng âm thanh của từng app tới các thiết bị phát khác nhau (loa ngoài, tai nghe, DAC).
- **Điều chỉnh Volume & Mute độc lập**: Can thiệp âm lượng trực tiếp trên từng kênh PCM mà không làm méo âm thanh.
- **Lưu trữ & Quản lý Presets**: Lưu cấu hình âm lượng, routing và EQ theo định dạng JSON tại `~/.config/rust-sound/presets.json`.
- **Chuẩn hóa tiến trình thông minh**: Tự động nhận diện và gộp các tiến trình con (Helper, Renderer, WebContent...) về ứng dụng cha (VD: `com.google.Chrome.helper` -> `com.google.Chrome`).

---

## 🏗 Kiến trúc dự án

Dự án được phân tầng tương tự cấu trúc gốc của `voice-macos`:

```text
rust-sound/
├── Cargo.toml
├── src/
│   ├── lib.rs              # Thư viện core & engine export
│   ├── main.rs             # CLI & Runner demo
│   ├── core/
│   │   ├── mod.rs
│   │   ├── ring_buffer.rs  # Lock-free SPSC circular buffer cho real-time thread
│   │   ├── process.rs      # AudioProcess, chuẩn hóa Bundle ID & phát hiện helper
│   │   └── tap.rs          # CoreAudio Process Tap FFI & wrappers (macOS 14.2+)
│   └── engine/
│       ├── mod.rs
│       ├── eq.rs           # 10-band Parametric EQ & Biquad filter DSP
│       ├── device.rs       # Quản lý thiết bị xuất âm thanh (AudioDevice)
│       ├── preset.rs       # PresetStore & lưu trữ cấu hình JSON
│       └── router.rs       # AudioRouter & xử lý tín hiệu stereo cho từng app
└── tests/
```

---

## 🚀 Hướng dẫn cài đặt & Chạy

### 1. Yêu cầu
- Rust 1.80+ (hỗ trợ Cargo edition 2024 / 2021).
- macOS 14.2 (Sonoma) trở lên với Xcode Command Line Tools.

### 2. Kiểm tra & Chạy thử
```bash
# Chạy bộ unit tests (RingBuffer, EQ DSP, PresetStore, Process normalization)
cargo test

# Chạy bản demo CLI
cargo run
```

---

## 📋 Git & Tiếp nối từ `voice-macos`

Dự án gốc `voice-macos` được viết bằng Swift (SwiftUI + AVFoundation + CoreAudio). Bản Rust này thay thế tầng CoreAudio C-FFI và DSP Audio Engine bằng Rust an toàn bộ nhớ (memory-safe), giảm thiểu overhead và tối ưu luồng thời gian thực.
