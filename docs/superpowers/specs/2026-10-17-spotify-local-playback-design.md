# Phát nhạc Spotify ngay trong rust-sound (không cần app Spotify)

Ngày: 2026-10-17 · Capability liên quan: `openspec/specs/spotify-audio-dsp/`

## 1. Ý định và lý do

Hôm nay muốn nghe nhạc Spotify qua rust-sound thì **bắt buộc phải mở app Spotify**: mọi
đường đi đều bám vào tiến trình `com.spotify.client`.

- `crates/core/src/spotify_tap.m` + `crates/app/src/spotify.rs`: tap tiến trình Spotify
  (CoreAudio process tap trong một aggregate device, `MutedWhenTapped`), đẩy PCM qua
  `process_audio()` → EQ per-app + master EQ + spectrum → render ra output device.
  Đây là pipeline DSP thật duy nhất của project.
- `crates/engine/src/spotify.rs`: Web API, chỉ là **điều khiển từ xa** — mọi lệnh
  play/pause/volume đều cần một `device_id` lấy từ `me/player/devices`.

Người dùng (chủ repo) muốn: **mở rust-sound là nghe được nhạc, không cần app Spotify ở
đâu cả, và tiếng đó phải đi qua mixer/EQ của rust-sound.**

Nghĩa là rust-sound phải tự trở thành một client Spotify, không còn là cái tap ký sinh
vào app khác.

## 2. Goals / Non-goals / Anti-goals

**Goals**

1. Trong rust-sound, chọn một bài trong tab Spotify → ra tiếng, không có tiến trình
   Spotify nào chạy trên máy.
2. Tiếng đó đi qua đúng chuỗi DSP hiện có: EQ kênh `com.spotify.client` → master EQ →
   clamp → spectrum. Kéo EQ trong app là nghe thay đổi.
3. Giữ nguyên đường remote control cũ (danh sách thiết bị Connect, phát sang app
   Spotify/điện thoại) như một chế độ song song — chủ repo yêu cầu rõ điều này.
4. Giữ nguyên đường tap cũ, không hồi quy: ai đang mở app Spotify vẫn dùng được.

**Non-goals**

- Tài khoản Free. Spotify không cho phát full track ngoài client của họ với Free; mọi
  đường đi (librespot, Web Playback SDK) đều đòi Premium. `preview_url` 30s cũng đã bị
  khóa với app mới từ cuối 2024. Tài khoản của chủ repo là Premium.
- Podcast có video, lyrics, offline cache, tải nhạc về máy.
- Gapless/crossfade, scrobbling, Spotify Connect multi-room.
- Zeroconf discovery (xem §5, quyết định của builder-side: tắt).

**Anti-goals** — làm được mà vẫn coi là thất bại nếu:

- Đường tap cũ hỏng, hoặc app đổi default output device của hệ thống.
- Nhạc ra loa nhưng **không** đi qua EQ (tức lại là một player rời, EQ chỉ để trang trí).
- Báo "đã xong, đã verify" khi chưa có người nghe thử thật. Project này có tiền sử
  WKWebView trả frame đen mà API vẫn báo OK — mọi claim về âm thanh phải có listening test.
- Phải đăng nhập Spotify hai lần mà không nói trước lý do cho người dùng.

## 3. Ràng buộc

- **Premium bắt buộc.** Không có đường nào khác.
- **librespot là client không chính thức** (reverse-engineered). ToS gray area; về lý
  thuyết tài khoản có thể bị cảnh báo, thực tế cộng đồng dùng nhiều năm. Protocol có thể
  bị Spotify đổi và vỡ bất cứ lúc nào — phải fail mềm, không panic, và luôn còn đường tap
  cũ + remote control để dùng tạm.
- Chất lượng tối đa 320 kbps Ogg Vorbis (`--bitrate 320`).
- **librespot chỉ chạy ở 44.1 kHz.** Wiki ghi rõ "does not currently support playback at
  any other sample rate". Output device của người dùng thường 48 kHz → phải resample ở
  đâu đó (xem §5).
- macOS 14.2+ only như cả project. `sound-engine` hiện build sạch trên Linux (CI/cloud
  session) — xem §5 về việc librespot làm thay đổi điều đó.
- Rust edition 2024, librespot 0.8 cần MSRV 1.85.
- Không được block audio thread: chuỗi DSP hiện tại dùng `try_lock` và cho qua khi
  contended — giữ nguyên nguyên tắc đó.

## 4. Kiến trúc

Nguồn âm thanh mới, đích cũ:

```
librespot session (Premium, OAuth)
   └─ decoder → Sink của rust-sound          [crates/engine]
         ├─ EQ kênh "com.spotify.client"  ─┐  (đúng code đang chạy cho tap)
         ├─ master EQ                      │
         ├─ clamp / NaN guard              │
         ├─ SpectrumBuffer.push_stereo     ─┘
         └─ output stream → loa
```

`Sink` là trait của `librespot-playback::audio_backend`:

```rust
pub trait Sink {
    fn write(&mut self, packet: AudioPacket, converter: &mut Converter) -> SinkResult<()>;
    fn start(&mut self) -> SinkResult<()> { ... }
    fn stop(&mut self) -> SinkResult<()> { ... }
}
```

`AudioPacket::Samples` mang f64 interleaved stereo 44.1 kHz. Sink của ta convert sang
f32 interleaved và chạy **cùng logic** `process_audio()` đang dùng cho tap — không viết
chuỗi DSP thứ hai. Tách phần thân của `process_audio` ra một hàm thuần
`process_spotify_frame(router, spectrum, &mut [f32], rate)` để cả tap FFI callback lẫn
Sink gọi chung; test hiện có (`actual_tap_callback_routes_spotify_through_eq_and_bypass`)
vẫn phải xanh.

**Đường ra loa — chọn rodio/cpal, không viết CoreAudio mới (quyết định của tôi, §5).**

**Kết nối với UI hiện có — điểm đẹp của thiết kế này.** librespot đăng nhập cùng tài
khoản Spotify ⇒ nó tự xuất hiện trong `me/player/devices` như một thiết bị Connect tên
`rust-sound`. Hệ quả:

- `spotify_devices()`, `spotify_select_device()`, `spotify_play_uri()`, `spotify_control()`,
  `web.playback()` **giữ nguyên, không sửa** — chúng điều khiển device của chính ta qua
  Web API y như điều khiển app Spotify.
- Điện thoại/máy khác cũng thấy `rust-sound` trong Spotify Connect và phát sang được.
- UI tab Spotify gần như không đổi: thiết bị mới chỉ là một dòng nữa trong danh sách,
  cần nhãn phân biệt "trong app này".

Ba chế độ cùng tồn tại, không loại nhau:

| Chế độ | Nguồn tiếng | Cần app Spotify? | Qua EQ? |
|---|---|---|---|
| Local player (mới) | librespot trong rust-sound | Không | Có |
| Tap (hiện có) | tiến trình Spotify trên máy | Có | Có |
| Remote (hiện có) | thiết bị Connect khác | Có/thiết bị khác | Không |

## 5. Những chỗ "how" đã chốt, và ai chốt

Chủ repo chốt:

- Dùng local player, không dùng Web Playback SDK trong WKWebView.
- Tiếng phải đi qua mixer/EQ.
- Giữ cả remote control hiện có.

Tôi chốt (builder có thể phản biện, nhưng đây là mặc định):

1. **librespot 0.8.x**, dep của `sound-engine`, `default-features = false` để không kéo
   alsa/pulse/jack. Session + player sống ở `crates/engine/src/spotify_player.rs`.
   *Đánh đổi:* `cargo test -p sound-engine` trong cloud session sẽ nặng/chậm hơn hẳn
   (protobuf, aes, vorbis). Chấp nhận; nếu nó phá CI thì đưa librespot vào một cargo
   feature mặc định bật, và cloud chạy `--no-default-features`.
2. **Đường ra loa dùng `rodio`/`cpal`** bên trong Sink, không viết `player_output.m`.
   Lý do: rodio tự xử lý device hiện tại + resample 44.1 → rate của device, còn viết một
   `AudioDeviceIOProc` + `AudioConverter` mới là thêm một mảng Objective-C FFI nữa phải
   tự lo jitter, device change, surround layout. Đổi lại: không chọn được output device
   riêng cho nhạc (đi theo default output của hệ thống), latency cao hơn tap.
   *Đường nâng cấp sau nếu cần per-device routing:* IOProc riêng, dùng lại phần render
   output của `spotify_tap.m` (đã xử lý planar/mono/surround) nhưng bỏ tap + aggregate.
3. **Zeroconf discovery tắt** (`--disable-discovery` tương đương). Ta đã đăng nhập bằng
   token nên device xuất hiện qua session; bật thêm mDNS chỉ thêm prompt firewall.
4. **Device name `rust-sound`, device type `computer`**, bitrate 320.
5. **Lưu credential dùng lại `spotify_keychain.m`** đang lưu refresh token, không đẻ file
   credential cache mới trong `~/Library`.
6. Khi local player đang phát, **không** tự tắt đường tap; chỉ cảnh báo trên UI nếu cả
   hai cùng chạy (double audio), vì tap chỉ sống khi có app Spotify.

## 6. Rủi ro số một: đăng nhập (phải spike trước khi code)

librespot nhận `--access-token` và yêu cầu token có scope `streaming`. Câu hỏi chưa chắc:
**token lấy từ client ID riêng của rust-sound có đăng nhập được session librespot không?**

Bằng chứng trái chiều: librespot issue #1331 cho thấy custom client ID xin được riêng
scope `streaming` (các scope khác 403); issue #1436 lại báo token mới tinh bị
"Login failed with reason: Bad credentials". Spotify cũng hạn chế `streaming` cho Web
Playback SDK.

**Spike (task đầu tiên, throwaway):** một binary nhỏ, lấy token qua luồng PKCE hiện có
của app + scope `streaming`, gọi `Credentials::with_access_token`, in kết quả.

- **Kết quả spike (2026-10-17):** `session.connect` với token của Client ID riêng **thành công**
  → lúc đó kết luận "một lần đăng nhập". **Kết luận này sai: spike là dương tính giả.**
- **Kiểm chứng lại sau khi implement (2026-10-17):** chạy thật `LocalPlayer` với token của
  Client ID riêng → `Spirc::new` trả `FailedPrecondition / INVALID_CREDENTIALS`. Ép session
  mang Client ID của rust-sound → `InvalidArgument / StatusCode(400)` ở bước `client_token`.
  Token lúc đó **đã có** scope `streaming` (đọc trực tiếp trường `scope` của token response),
  nên đây không phải chuyện scope.
- **Lý do:** `session.connect` chỉ là bước login. Spotify **Connect** đi thêm
  `spclient().client_token()` + `login5().auth_token()`, và hai bước đó chỉ chấp nhận
  Client ID của client desktop chính thức. Spike không chạm tới chúng nên không phát hiện ra.
- **Chốt phương án (đã kiểm chứng chạy được):** **hai danh tính.** Thư viện và điều khiển dùng
  Client ID riêng của rust-sound như cũ; phần phát nhạc đăng nhập qua `librespot-oauth` với
  `SessionConfig::default().client_id` (client desktop chính thức), scope `streaming`,
  redirect `http://127.0.0.1:5588/login`. Refresh token lưu Keychain dưới account
  `rust-sound-playback`, tách hẳn khỏi token thư viện (khoá theo Client ID), nên đăng xuất
  cái này không xoá nhầm cái kia. Người dùng bấm đăng nhập lần thứ hai **một lần duy nhất**.
- **Bẫy đã dính và đã sửa:** `Spirc::new` **tự gọi** `session.connect` sau khi đăng ký
  listener. Gọi `session.connect` trước đó làm Spirc hỏng với `Unavailable / NotConnected`.
  `main.rs` của librespot upstream cũng không bao giờ connect trước.

## 7. Verify — và giới hạn của verify

Tự động được:

- Unit test cho `process_spotify_frame`: synthetic buffer, bass +6 dB phải tăng năng
  lượng, bypass phải trả lại y nguyên, NaN → 0, kênh app khác không bị ảnh hưởng. (Mở
  rộng test đang có, đừng viết test song song.)
- Ring buffer / Sink: không panic khi buffer đầy, underrun ra silence chứ không ra rác.
- Token/scope: unit test parse, không gọi mạng.
- `cargo test -p sound-engine`, `pnpm build`.

**Không** tự động được, phải người nghe: có tiếng thật, đúng bài, không vỡ, kéo EQ nghe
đổi, rút tai nghe không crash, pause/next từ điện thoại ăn vào local player. Không được
viết "đã verify" cho mấy điều này nếu chưa nghe.

## 8. Việc để builder tự quyết

- Kích thước ring buffer / latency, và dither khi convert f64 → f32.
- Shape của state máy: ai giữ `Session`, reconnect khi mạng rớt, khi token hết hạn.
- Thiết bị Connect `rust-sound` hiện trong UI thế nào (nhãn, auto-select sau login).
- Có tạo `openspec/changes/<name>/` cho đợt này không — CLAUDE.md nói nên, và
  `spotify-audio-dsp/spec.md` sẽ phải cập nhật requirement về nguồn âm thanh.
- Chia PR/commit.
