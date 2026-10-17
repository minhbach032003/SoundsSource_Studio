# Spotify Local Playback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** rust-sound tự phát nhạc Spotify Premium, không cần app Spotify chạy trên máy, và tiếng đó đi qua đúng chuỗi EQ/mixer hiện có.

**Architecture:** librespot 0.8 chạy trong `sound-engine` làm nguồn nhạc. Một `Sink` tự viết nhận PCM 44.1 kHz từ decoder, đẩy qua đúng chuỗi DSP mà đường tap đang dùng (EQ kênh `com.spotify.client` → master EQ → clamp → spectrum) rồi ra loa bằng `rodio`. Vì librespot đăng nhập cùng tài khoản Spotify, thiết bị tên `rust-sound` tự hiện trong `me/player/devices`, nên toàn bộ command Web API hiện có (`spotify_play_uri`, `spotify_control`, `spotify_devices`) điều khiển nó mà không phải sửa.

**Tech Stack:** Rust edition 2024 (máy đang dùng rustc 1.95.0), librespot 0.8.x (`-core`, `-connect`, `-playback`, `-metadata`, `-oauth`), tokio, rodio 0.22, Tauri 2, Svelte 5, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-10-17-spotify-local-playback-design.md` — **đọc hết spec trước khi làm task đầu tiên.** Plan này chỉ nói *làm gì*; spec nói *tại sao* và liệt kê các anti-goal.

---

## 0. Luật chung cho đội subagent

Đọc mục này trước. Nó áp cho mọi task.

**Môi trường**

- Máy macOS, repo tại `/Users/mac/Documents/rust-sound`, nhánh làm việc là nhánh hiện tại (`git branch --show-current`). Không tự tạo nhánh mới, không rebase, không force push.
- Export sẵn hai biến trước khi chạy app, nếu không app panic lúc khởi động: `RUST_SOUND_JWT_SECRET`, `RUST_SOUND_NEON_URL`.
- Entry point Tauri duy nhất là `pnpm tauri ...` từ repo root. `tauri` trần sẽ lỗi.

**Lệnh được dùng**

| Việc | Lệnh |
|---|---|
| Test engine | `cargo test -p sound-engine` |
| Test app | `cargo test -p rust-sound` |
| Một test | `cargo test -p rust-sound <tên_test> -- --nocapture` |
| Frontend | `pnpm build` (tsc + vite — đây là check duy nhất của frontend) |
| Spec | `npx @fission-ai/openspec validate --specs` |
| Build app thật | `pnpm rebuild:app` (chỉ Task 9) |

**Không bao giờ**

- Không chạy `cargo build` / `cargo test` ở root workspace (kéo theo `pingloom`, chậm và không liên quan).
- Không dùng emoji unicode làm icon, nhãn, badge, hay trong commit message. Chỉ `@lucide/svelte` hoặc inline SVG. Đây là luật cứng của repo.
- Không đổi default output device của hệ thống.
- Không `unwrap()` / `expect()` trên đường chạy thật (test thì được).
- Không block audio thread: giữ nguyên kiểu `try_lock()` rồi cho buffer đi qua nếu contended.
- Không sửa `process_audio` theo cách làm đổi hành vi đường tap. Test `actual_tap_callback_routes_spotify_through_eq_and_bypass` phải xanh sau **mọi** task.
- Không viết "đã verify", "đã hoạt động" cho bất cứ điều gì về âm thanh. Chỉ Task 9 (người thật nghe) mới kết luận được.

**Commit**

Mỗi task một commit, prefix `feat:` / `fix:` / `refactor:` / `docs:` / `chore:`, nội dung tiếng Anh, kết thúc bằng:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

Không push giữa chừng; push một lần sau khi cả plan xong, hoặc khi người dùng bảo push.

**Khi bí**

Nếu một bước không khớp thực tế (API librespot khác tài liệu, test cũ đỏ vì lý do không hiểu), **dừng và báo**, kèm output thật. Không tự đổi scope, không tự bỏ test, không comment-out test đang đỏ.

---

## Global Constraints

- macOS 14.2+ only. `crates/core`, `crates/app` không build được trên Linux.
- Spotify **Premium** bắt buộc. Free không có đường nào.
- librespot chỉ phát **44.1 kHz** (wiki: "does not currently support playback at any other sample rate"). DSP chạy ở 44.1 kHz trong Sink; resample lên rate của device do rodio lo.
- Bitrate 320 kbps. `ConnectConfig.name = "rust-sound"`, `device_type = DeviceType::Computer`, zeroconf discovery **tắt**.
- Local player và tap **loại trừ nhau**: bật cái này thì tắt cái kia.
- Mọi chuỗi hiển thị cho người dùng bằng tiếng Việt.
- librespot 0.8 cần MSRV 1.85; rodio 0.22 cần ≥1.87. Máy đang 1.95.0 → ổn.

## Review Focus

Năm thứ spec ngụ ý mà không task nào tự nhiên test tới. Mỗi dòng đã được gắn test vào task sở hữu nó.

1. **Token hết hạn giữa bài** — session phải tự lấy token mới và phát tiếp, không đứng im. (Task 4, Step 6)
2. **Mất mạng giữa bài** — lỗi tiếng Việt lên UI, dừng sạch, không panic, không kẹt trạng thái "đang phát". (Task 4, Step 6)
3. **Rút tai nghe / đổi output device khi đang phát** — mở lại trên device mới hoặc báo lỗi; không crash app. (Task 5, Step 6)
4. **Buffer underrun** — Sink chưa có dữ liệu phải ra im lặng, không ra tiếng rác, không lặp buffer cũ. (Task 5, Step 1)
5. **Bật tap khi local đang phát** — phải tắt local trước, không để hai nguồn chung một bộ biquad. (Task 6, Step 1)

---

### Task 1: Spike đăng nhập — CHẶN MỌI TASK LIÊN QUAN LOGIN

Mục đích: trả lời **một** câu hỏi — token lấy từ client ID của rust-sound có đăng nhập được session librespot không? Đây là code vứt đi, không giữ lại.

Cần người dùng ngồi cạnh để bấm đăng nhập trên trình duyệt. Task 2 và 3 không phụ thuộc task này, chạy song song được.

**Files:**
- Modify: `crates/engine/src/spotify.rs:19` (hằng `SCOPES`)
- Create: `crates/engine/examples/librespot_login_spike.rs` — **xoá ở Step 5**

- [x] **Step 1: Thêm scope `streaming`**

Dòng 19 hiện là:

```rust
const SCOPES: &str = "playlist-read-private playlist-read-collaborative user-library-read user-read-playback-state user-modify-playback-state";
```

Nối ` streaming` vào cuối chuỗi, giữ nguyên thứ tự các scope cũ.

- [x] **Step 2: Thêm dep tạm và viết example**

Thêm `librespot-core = "0.8"` và `tokio = { version = "1", features = ["rt-multi-thread", "macros"] }` vào `crates/engine/Cargo.toml`.

Example đọc token từ biến môi trường `SPOTIFY_ACCESS_TOKEN`, rồi:

```rust
let session = Session::new(SessionConfig::default(), None);
let credentials = Credentials::with_access_token(token);
match session.connect(credentials, false).await {
    Ok(()) => println!("OK: session connected, device_id={}", session.device_id()),
    Err(e) => println!("FAIL: {e:?}"),
}
```

- [x] **Step 3: Người dùng lấy token thật**

Đăng nhập trong app như bình thường (sau Step 1 thì token mới đã có scope `streaming`), lấy access token ra, rồi:

Run: `SPOTIFY_ACCESS_TOKEN=... cargo run -p sound-engine --example librespot_login_spike`

- [x] **Step 4: Chốt đường login, ghi vào spec**

Sửa §6 của spec, ghi rõ kết quả thật và ngày chạy:

- **OK** → **một lần đăng nhập**. Task 4 dùng `Credentials::with_access_token(token)` với token của `SpotifyWeb`.
- **FAIL** → **hai danh tính**. Task 4 dùng `librespot-oauth` (client ID riêng của librespot), lưu credential qua `sound_core::spotify::refresh_token` với `account = "librespot"`; Task 7 phải thêm nút đăng nhập thứ hai, kèm câu tiếng Việt giải thích tại sao có hai nút; `spotify_logout` phải xoá cả hai.

- [x] **Step 5: Xoá example, giữ lại thay đổi `SCOPES` và dep**

- [x] **Step 6: Commit**

```bash
git add crates/engine/src/spotify.rs crates/engine/Cargo.toml docs/superpowers/specs/2026-10-17-spotify-local-playback-design.md
git commit -m "chore: settle how librespot authenticates"
```

---

### Task 2: Tách chuỗi DSP dùng chung cho cả hai nguồn

Hiện chuỗi DSP nằm trong `process_audio` — một `extern "C"` callback, Sink không gọi được. Tách ra hàm Rust thuần.

**Files:**
- Modify: `crates/app/src/spotify.rs` (hàm `process_audio` ~dòng 163-186, và mod tests cuối file)

**Interfaces:**
- Produces:

```rust
pub fn process_spotify_frame(
    router: &Mutex<AudioRouter>,
    spectrum: &Mutex<SpectrumBuffer>,
    samples: &mut [f32],      // interleaved stereo
    rate: f32,
    apply_channel_gain: bool,
)
```

`apply_channel_gain = true` chỉ cho local player. Đường tap truyền `false` vì âm lượng ở đó đã do AppleScript (`AudioProcess::set_app_volume`) xử lý — áp thêm gain nữa là giảm hai lần.

- [x] **Step 1: Viết test thất bại**

Thêm vào mod tests sẵn có trong `crates/app/src/spotify.rs`:

```rust
#[test]
fn channel_volume_applies_only_to_the_local_player() {
    let router = Arc::new(Mutex::new(AudioRouter::new(44100.0)));
    let spectrum: Arc<Mutex<SpectrumBuffer>> = Default::default();
    router.lock().unwrap().master_eq_mut().set_master_bypass(true);
    router.lock().unwrap().set_app_volume("com.spotify.client", 0.5);
    let tone = vec![0.5f32; 512];

    let mut local = tone.clone();
    process_spotify_frame(&router, &spectrum, &mut local, 44100.0, true);
    assert!(local[0] < 0.3, "local player phải ăn volume của mixer");

    let mut tapped = tone.clone();
    process_spotify_frame(&router, &spectrum, &mut tapped, 44100.0, false);
    assert_eq!(tapped[0], 0.5, "đường tap không được giảm âm lượng hai lần");

    router.lock().unwrap().set_app_mute("com.spotify.client", true);
    let mut muted = tone.clone();
    process_spotify_frame(&router, &spectrum, &mut muted, 44100.0, true);
    assert_eq!(muted, vec![0.0; 512]);
}
```

- [x] **Step 2: Chạy, phải fail**

Run: `cargo test -p rust-sound channel_volume_applies_only_to_the_local_player`
Expected: không compile — `cannot find function process_spotify_frame`.

- [x] **Step 3: Implement**

Chuyển nguyên thân `process_audio` (từ chỗ `if let Ok(mut router) = processor.router.try_lock()` đến hết phần push spectrum) sang `process_spotify_frame`. Khi `apply_channel_gain == true`, gọi `AppAudioChannel::process` **trước** EQ. `process_audio` chỉ còn giữ phần kiểm tra con trỏ/độ dài/rate rồi gọi hàm mới với `false`.

Giữ nguyên: `try_lock` (không `lock`), việc đồng bộ `eq.sample_rate` + `recalculate_all()` khi rate đổi, clamp NaN → 0, push spectrum.

- [x] **Step 4: Chạy toàn bộ test Spotify**

Run: `cargo test -p rust-sound spotify`
Expected: PASS, gồm cả `actual_tap_callback_routes_spotify_through_eq_and_bypass` cũ.

- [x] **Step 5: Commit** — `refactor: share the Spotify DSP chain between tap and local player`

---

### Task 3: Ring buffer nối decoder với loa

Decoder librespot chạy trên thread của nó, output stream của rodio chạy trên thread audio. Cần một hàng đợi lock-free ở giữa.

**Files:**
- Create: `crates/engine/src/pcm_queue.rs`
- Modify: `crates/engine/src/lib.rs` (thêm `pub mod pcm_queue;`)

**Interfaces:**
- Produces:

```rust
pub struct PcmQueue;
impl PcmQueue {
    pub fn new(capacity_frames: usize) -> Self;   // capacity tính theo frame stereo
    pub fn push(&self, samples: &[f32]) -> usize; // trả số sample đã nhận; đầy thì bỏ phần dư
    pub fn pop(&self, out: &mut [f32]) -> usize;  // trả số sample đã lấy; thiếu thì phần còn lại là 0.0
    pub fn clear(&self);
    pub fn available(&self) -> usize;
}
```

Dùng `sound_core::ring_buffer::RingBuffer` bên dưới (nó đã lock-free, API theo byte: `write(&[u8]) -> usize`, `read(&mut [u8]) -> usize`, `clear()`, `bytes_available_for_read()`). `PcmQueue` chỉ là lớp bọc đổi đơn vị byte ↔ f32.

- [x] **Step 1: Viết test thất bại**

```rust
#[test]
fn queue_drops_overflow_and_pads_underrun_with_silence() {
    let q = PcmQueue::new(4);                       // 4 frame = 8 sample
    assert_eq!(q.push(&[1.0; 16]), 8, "đầy thì bỏ phần dư, không panic");
    let mut out = [9.9f32; 12];
    assert_eq!(q.pop(&mut out), 8);
    assert_eq!(&out[..8], &[1.0; 8]);
    assert_eq!(&out[8..], &[0.0; 4], "underrun phải là im lặng, không phải rác");
    q.clear();
    assert_eq!(q.available(), 0);
}
```

- [x] **Step 2: Chạy, phải fail.** Run: `cargo test -p sound-engine pcm_queue`

- [x] **Step 3: Implement `PcmQueue`** bằng `f32::to_ne_bytes` / `from_ne_bytes` qua `RingBuffer`. Không cấp phát trong `pop` (dùng buffer tạm cố định trên stack theo chunk).

- [x] **Step 4: Chạy test** — PASS.

- [x] **Step 5: Commit** — `feat: add a lock-free PCM queue between the decoder and the output`

---

### Task 4: Session librespot trong engine

**Files:**
- Modify: `crates/engine/Cargo.toml`
- Create: `crates/engine/src/spotify_player.rs`
- Modify: `crates/engine/src/lib.rs` (thêm `pub mod spotify_player;`)

**Interfaces:**
- Consumes: kết quả Task 1 (một hay hai danh tính).
- Produces:

```rust
#[derive(Clone, Default, serde::Serialize)]
pub struct LocalPlayerState { pub running: bool, pub playing: bool, pub error: Option<String> }

pub struct LocalPlayer;
impl LocalPlayer {
    pub fn new() -> Self;
    /// `sink_builder` được gọi một lần khi player khởi động, trên thread của librespot.
    pub fn start(
        &self,
        access_token: &str,
        sink_builder: Box<dyn FnOnce() -> Box<dyn Sink> + Send + 'static>,
    ) -> Result<(), String>;
    pub fn stop(&self);
    pub fn state(&self) -> LocalPlayerState;
}
```

Chữ ký librespot 0.8 đã tra từ docs.rs, dùng đúng như sau:

```rust
Session::new(SessionConfig::default(), None) -> Session
session.connect(credentials: Credentials, store_credentials: bool) -> Result<(), Error>   // async
Credentials::with_access_token(token: impl Into<String>) -> Credentials
Player::new(config: PlayerConfig, session: Session, volume_getter: Box<dyn VolumeGetter + Send>, sink_builder: F) -> Arc<Player>
    where F: FnOnce() -> Box<dyn Sink> + Send + 'static
Spirc::new(config: ConnectConfig, session: Session, credentials: Credentials, player: Arc<Player>, mixer: Arc<dyn Mixer>)
    -> Result<(Spirc, impl Future<Output = ()>), Error>   // async; future phải được spawn, nếu không device không hoạt động
```

`ConnectConfig` có đúng 6 field: `name`, `device_type`, `is_group`, `initial_volume`, `disable_volume`, `volume_steps`. Đặt `name = "rust-sound"`, `device_type = DeviceType::Computer`, còn lại mặc định.

Mixer: dùng `librespot_playback::mixer::softmixer::SoftMixer` qua `Mixer::open(MixerConfig::default())`. `volume_getter` lấy từ `mixer.get_soft_volume()`.

- [x] **Step 1: Thêm dep** vào `crates/engine/Cargo.toml`
- [x] **Step 2: Viết test thất bại** (không chạm mạng)
- [x] **Step 3: Chạy, phải fail.** Run: `cargo test -p sound-engine spotify_player`
- [x] **Step 4: Implement `LocalPlayer`**
- [x] **Step 5: Chạy test** — `cargo test -p sound-engine` → PASS.
- [x] **Step 6: Review Focus 1 và 2 — token hết hạn và mất mạng**
- [x] **Step 7: Commit** — `feat: embed a librespot session as the local Spotify source`

---

### Task 5: Sink đưa nhạc qua DSP rồi ra loa

**Files:**
- Create: `crates/app/src/spotify_sink.rs`
- Modify: `crates/app/src/spotify.rs` (thêm `mod spotify_sink;` ở đầu file)
- Modify: `crates/app/Cargo.toml` (thêm `rodio = "0.22"`, `librespot-playback = { version = "0.8", default-features = false }`)

**Interfaces:**
- Consumes: `process_spotify_frame` (Task 2), `PcmQueue` (Task 3).
- Produces:

```rust
pub struct RustSoundSink;
impl RustSoundSink {
    pub fn new(router: Arc<Mutex<AudioRouter>>, spectrum: Arc<Mutex<SpectrumBuffer>>) -> Result<Self, String>;
}
impl librespot_playback::audio_backend::Sink for RustSoundSink { /* write, start, stop */ }
```

Trait cần implement (docs.rs 0.8.0):

```rust
pub trait Sink {
    fn write(&mut self, packet: AudioPacket, converter: &mut Converter) -> SinkResult<()>;
    fn start(&mut self) -> SinkResult<()> { ... }
    fn stop(&mut self) -> SinkResult<()> { ... }
}
```

`AudioPacket` là enum `Samples(Vec<f64>)` | `Raw(Vec<u8>)`, có `samples() -> AudioPacketResult<&[f64]>`, `raw()`, `is_empty()`. Ta chỉ xử lý `Samples`; gặp `Raw` thì trả lỗi tiếng Việt (ta không bật passthrough).

**Cảnh báo API:** rodio 0.22 đã đổi tên so với 0.21 — `OutputStreamBuilder` → `DeviceSinkBuilder`, `open_default_stream` → `open_default_sink`, `Sink` → `Player`, `OutputStream` → `MixerDeviceSink`. Mở `https://docs.rs/rodio/0.22.2/` xác nhận trước khi viết, đừng tin trí nhớ. Đặt alias khi import để không đụng tên `Sink` của librespot.

- [x] **Step 1: Viết test thất bại** (không mở device thật — tách phần xử lý ra hàm thuần)
- [x] **Step 2: Chạy, phải fail.** Run: `cargo test -p rust-sound the_sink_runs_audio_through_the_eq_and_pads_underrun`
- [x] **Step 3: Implement hàm thuần**
- [x] **Step 4: Implement `RustSoundSink`**
- [x] **Step 5: Chạy test** — PASS.
- [x] **Step 6: Review Focus 3 — mất output device**
- [x] **Step 7: Commit** — `feat: route librespot audio through the rust-sound EQ chain`

---

### Task 6: Nối vào app — bỏ auto-launch, hai nguồn loại trừ nhau

**Files:**
- Modify: `crates/app/src/spotify.rs` (`SpotifyIntegration`, `SpotifyStatus`, `SpotifyIntegration::start`, `connect_spotify_audio`)
- Modify: `crates/app/src/lib.rs` (dòng 2 import, `generate_handler!` ~dòng 1911-1920)

**Interfaces:**
- Produces:

```rust
#[tauri::command]
pub async fn spotify_local_player(enabled: bool, state: State<'_, AppState>) -> Result<(), String>;
```

`SpotifyStatus` thêm:

```rust
pub local_running: bool,
pub local_error: Option<String>,
```

- [x] **Step 1: Viết test thất bại — Review Focus 5**
- [x] **Step 2: Chạy, phải fail.** Run: `cargo test -p rust-sound spotify`
- [x] **Step 3: Bỏ auto-launch**
- [x] **Step 4: Implement loại trừ nhau**
- [x] **Step 5: Đăng ký command** — thêm `spotify_local_player` vào import dòng 2 và vào `generate_handler!`.
- [x] **Step 6: Chạy test** — `cargo test -p rust-sound` → PASS, test tap cũ xanh.
- [x] **Step 7: Commit** — `feat: make the local player and the tap mutually exclusive, stop auto-launching Spotify`

---

### Task 7: Frontend

**Files:**
- Modify: `src/lib/spotify.svelte.ts` (interface `SpotifyStatus` dòng 4-20, class `SpotifyState`)
- Modify: `src/views/SpotifyView.svelte` (nút DSP dòng 53-55, ô thiết bị dòng 109-117)

- [x] **Step 1: Thêm field và hàm**
- [x] **Step 2: Ô "Phát trên"**
- [x] **Step 3: Nút "Kết nối DSP"**
- [x] **Step 4: Sửa câu ở dòng 117**
- [x] **Step 5: Hiện `local_error`** ở chỗ đang hiện `status.error`, cùng kiểu `role="alert"`.
- [x] **Step 6: Chạy** `pnpm build` → PASS (tsc không lỗi type).
- [x] **Step 7: Commit** — `feat: pick rust-sound itself as the Spotify playback device`

---

### Task 8: Spec và glossary

**Files:**
- Modify: `CONTEXT.md` (mục `### Spotify Audio`, dòng 25-52)
- Modify: `openspec/specs/spotify-audio-dsp/spec.md`
- Modify: `CLAUDE.md` (đoạn "Trạng thái thực tế … không có live capture → DSP → output pipeline")

- [ ] **Step 1: Sửa glossary**

`CONTEXT.md` hiện định nghĩa **Spotify Integration** là "with Spotify running in the background as the music source", **Now-Playing Bar** "controls background Spotify rather than being a separate playback engine", và ghi `_Avoid_: Embedded Spotify, built-in Spotify player`. Tất cả đều mâu thuẫn với tính năng này.

Thêm term mới:

```
**Spotify Local Player**:
rust-sound tự là nguồn nhạc Spotify: phát không cần app Spotify trên máy. Loại trừ với Spotify DSP Connection — mỗi lúc chỉ một nguồn.
_Avoid_: tap, remote device
```

Sửa `Spotify Integration` và `Now-Playing Bar` để nói có **hai** nguồn; bỏ dòng `_Avoid_: Embedded Spotify, built-in Spotify player` đã lỗi thời. `CONTEXT.md` là glossary — **không** đưa chi tiết kỹ thuật (librespot, rodio, 44.1 kHz) vào đó.

- [ ] **Step 2: Cập nhật `openspec/specs/spotify-audio-dsp/spec.md`** với requirement mới theo đúng định dạng SHALL + WHEN/THEN đang dùng: nguồn local, hai nguồn loại trừ nhau, EQ áp cho cả hai, không tự mở app Spotify.

- [ ] **Step 3: Sửa `CLAUDE.md`** — câu "there is no live capture → DSP → output pipeline" nay sai với Spotify. Ghi đúng: có pipeline cho Spotify (tap và local player), phần còn lại của mixer vẫn chỉ là state.

- [ ] **Step 4: Validate** — `npx @fission-ai/openspec validate --specs` → PASS.

- [ ] **Step 5: Commit** — `docs: model rust-sound as a Spotify source, not only a tap`

---

### Task 9: Nghe thử thật — người làm, không phải agent

Agent **không** được đánh dấu xong các bước này thay người dùng.

- [ ] **Step 1:** `pnpm rebuild:app`
- [ ] **Step 2:** Thoát hẳn app Spotify; `pgrep -fl Spotify` không còn gì.
- [ ] **Step 3:** Mở rust-sound, đăng nhập, chọn một bài → ra tiếng.
- [ ] **Step 4:** Kéo bass EQ → nghe đổi ngay.
- [ ] **Step 5:** Kéo volume / bấm mute kênh Spotify trong mixer → ăn ngay.
- [ ] **Step 6:** Mở Spotify trên điện thoại → thấy thiết bị `rust-sound`; bấm pause/next từ điện thoại → local theo.
- [ ] **Step 7:** Rút tai nghe giữa bài → không crash, có báo hoặc tự chuyển.
- [ ] **Step 8:** Tắt wifi giữa bài → lỗi tiếng Việt, không treo.
- [ ] **Step 9:** Mở app Spotify rồi bật nguồn tap → local tự tắt, không nghe hai tiếng chồng nhau.
- [ ] **Step 10:** Ghi lại bước nào đạt, bước nào không. **Chỉ sau bước này mới được nói tính năng đã hoạt động.**
- [ ] **Step 11:** `git push`
