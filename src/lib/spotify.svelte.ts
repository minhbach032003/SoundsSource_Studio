import { invoke, isTauri } from "@tauri-apps/api/core";
import { toastState } from "./toast.svelte";

/// Fisher-Yates trên một bản sao: danh sách đang hiển thị không được đổi chỗ dưới tay
/// người dùng chỉ vì họ bấm phát.
function shuffled(uris: string[]): string[] {
  const out = [...uris];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface LastTrack {
  uri: string;
  title: string;
  artist: string;
  artwork: string;
  position: number;
  duration: number;
}

export interface SpotifyStatus {
  running: boolean;
  playing: boolean;
  uri: string;
  device_id: string;
  device_name: string;
  shuffle: boolean;
  can_shuffle: boolean;
  can_repeat: boolean;
  can_previous?: boolean;
  can_next?: boolean;
  repeat: "off" | "context" | "track";
  title: string;
  artist: string;
  album: string;
  artwork: string;
  position: number;
  duration: number;
  enabled: boolean;
  connected: boolean;
  processing: boolean;
  frames: number;
  sample_rate: number;
  error: string | null;
  warning: string | null;
  playback_error: string | null;
  local_running: boolean;
  local_error: string | null;
  playback_signed_in: boolean;
}

export interface SpotifyAccount { configured: boolean; connected: boolean; device_id: string | null }
export interface SpotifyDevice { id: string; name: string; is_active: boolean }
export interface SpotifyMusicItem { id: string; uri: string; name: string; artist: string; artwork: string; duration_ms: number }
export interface SpotifyMusicPage { items: SpotifyMusicItem[]; offset: number; next_offset: number | null }
export type SpotifyLibraryKind = "playlists" | "saved" | "search" | "playlist";

class SpotifyState {
  status = $state<SpotifyStatus | null>(null);
  busy = $state(false);
  /// Nút tua / phát phải có cờ riêng. Dùng chung `busy` thì mỗi lần app tự bật bộ phát
  /// nội bộ lúc khởi động (mất vài giây dò thiết bị) là mọi cú bấm rơi vào im lặng.
  controlBusy = $state(false);
  /// Phần đuổi kịp trạng thái chạy sau khi nút đã nhả ra. Giữ lại để kiểm thử chờ được.
  statusSettled: Promise<void> = Promise.resolve();
  error = $state<string | null>(null);
  account = $state<SpotifyAccount | null>(null);
  authBusy = $state(false);
  loginVersion = $state(0);
  volume = $state(1);
  muted = $state(false);
  volumeBusy = $state(false);
  libraryBusy = $state(false);
  libraryError = $state<string | null>(null);
  devices = $state<SpotifyDevice[]>([]);
  devicesBusy = $state(false);
  page = $state<SpotifyMusicPage | null>(null);
  kind = $state<SpotifyLibraryKind>("playlists");
  searchQuery = $state("");
  playlistId = $state<string | null>(null);
  playlistName = $state("");
  private libraryRequest = 0;
  private readonly sourceKey = "rust_sound_spotify_source";

  private writeSource(source: "local" | "tap" | "none") {
    try {
      localStorage.setItem(this.sourceKey, source);
      localStorage.removeItem("rust_sound_spotify_audio_consent");
    } catch { /* optional persistence */ }
  }

  async restoreAccount() {
    this.authBusy = true;
    try {
      this.account = await invoke<SpotifyAccount>("spotify_account");
      if (this.account.connected) {
        await Promise.all([this.loadLibrary("playlists"), this.refreshDevices()]);
      }
    } catch (e) { this.libraryError = String(e); }
    finally { this.authBusy = false; }
  }

  async login() {
    if (this.authBusy) return;
    this.authBusy = true;
    this.libraryError = null;
    try {
      this.account = await invoke<SpotifyAccount>("spotify_login");
      if (this.account.connected) this.loginVersion++;
      toastState.success("Đã đăng nhập Spotify");
      await Promise.all([this.loadLibrary("playlists"), this.refreshDevices()]);
    } catch (e) { this.libraryError = String(e); }
    finally { this.authBusy = false; }
  }

  async logout() {
    this.authBusy = true;
    this.libraryError = null;
    try {
      await invoke("spotify_logout");
      ++this.libraryRequest;
      this.libraryBusy = false;
      this.account = { configured: this.account?.configured ?? false, connected: false, device_id: null };
      this.page = null;
      this.devices = [];
      toastState.info("Đã ngắt tài khoản Spotify; Spotify vẫn chạy bình thường");
    } catch (e) { this.libraryError = String(e); }
    finally { this.authBusy = false; }
  }

  async loadLibrary(kind: SpotifyLibraryKind, query = "", offset = 0, playlistId: string | null = null) {
    const ticket = ++this.libraryRequest;
    this.libraryBusy = true;
    this.libraryError = null;
    this.kind = kind;
    this.searchQuery = query;
    this.playlistId = playlistId;
    this.page = null;
    try {
      const page = await invoke<SpotifyMusicPage>("spotify_browse", { kind, query, offset, playlistId });
      if (ticket === this.libraryRequest) this.page = page;
    } catch (e) { if (ticket === this.libraryRequest) this.libraryError = String(e); }
    finally { if (ticket === this.libraryRequest) this.libraryBusy = false; }
  }

  /// `silent`: lần làm mới định kỳ chạy nền. Nó không được khoá ô chọn hay ném lỗi
  /// đè lên thư viện — người dùng có bấm gì đâu mà báo hỏng.
  async refreshDevices(silent = false) {
    if (this.devicesBusy) return;
    this.devicesBusy = true;
    try {
      this.devices = await invoke<SpotifyDevice[]>("spotify_devices");
      this.account = await invoke<SpotifyAccount>("spotify_account");
    } catch (e) { if (!silent) this.libraryError = String(e); }
    finally { this.devicesBusy = false; }
  }

  get localDeviceId(): string | null {
    return this.devices.find((d) => d.name.toLowerCase() === "rust-sound")?.id ?? null;
  }

  get sortedDevices(): SpotifyDevice[] {
    return [...this.devices].sort((a, b) => {
      const aIsLocal = a.name.toLowerCase() === "rust-sound";
      const bIsLocal = b.name.toLowerCase() === "rust-sound";
      if (aIsLocal && !bIsLocal) return -1;
      if (!aIsLocal && bIsLocal) return 1;
      return 0;
    });
  }

  playbackAuthBusy = $state(false);

  /// Spotify Connect chỉ nhận token của client desktop chính thức, nên phần phát nhạc
  /// có một lần đăng nhập riêng, tách khỏi đăng nhập thư viện.
  async loginPlayback(): Promise<boolean> {
    this.playbackAuthBusy = true;
    this.error = null;
    try {
      await invoke("spotify_playback_login");
      toastState.info("Đã đăng nhập phần phát nhạc");
      return true;
    } catch (e) {
      this.error = String(e);
      toastState.error(String(e));
      return false;
    } finally {
      this.playbackAuthBusy = false;
    }
  }

  async setLocalPlayer(enabled: boolean): Promise<void> {
    this.busy = true;
    this.error = null;
    try {
      await invoke("spotify_local_player", { enabled });
      this.writeSource(enabled ? "local" : "none");
      toastState.info(enabled ? "Đang phát nhạc trực tiếp trong rust-sound" : "Đã tắt phát nhạc nội bộ");
      if (enabled) {
        // Spirc mất vài giây mới đăng ký thiết bị với Spotify. Chọn đích phát trước khi nó
        // xuất hiện thì lệnh play rơi vào thiết bị cũ và Spotify trả về 403.
        let localId: string | null = null;
        for (let attempt = 0; attempt < 6 && !localId; attempt++) {
          if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1000));
          await this.refreshDevices();
          localId = this.localDeviceId;
        }
        if (localId) await this.selectDevice(localId);
        else this.error = "Spotify chưa thấy thiết bị rust-sound. Bấm làm mới thiết bị rồi thử lại.";
      }
    } catch (e) {
      this.error = String(e);
      toastState.error(String(e));
    } finally {
      this.busy = false;
    }
  }

  async selectDevice(id: string) {
    this.devicesBusy = true;
    try {
      await invoke("spotify_select_device", { id });
      this.account = await invoke<SpotifyAccount>("spotify_account");
      toastState.info("Đã chọn thiết bị phát Spotify");
    } catch (e) { this.libraryError = String(e); }
    finally { this.devicesBusy = false; }
  }

  async play(uri: string, positionMs?: number) {
    if (this.busy) return;
    this.busy = true;
    this.error = null;
    try {
      await invoke("spotify_play_uri", { uri, positionMs: positionMs ?? null });
      toastState.info("Đã gửi bài đến Spotify");
    } catch (e) { this.error = String(e); }
    finally { this.busy = false; }
  }

  /// Trộn bài là lựa chọn của rust-sound, không phải của Spotify. Một danh sách bài rời
  /// (bài đã thích, kết quả tìm) tạo ngữ cảnh tạm mà Spotify cấm bật trộn, nên khi đó
  /// ta tự xáo thứ tự lúc gửi đi. Playlist có ngữ cảnh thật thì nhờ Spotify trộn.
  private readonly shuffleKey = "rust_sound_spotify_shuffle";
  shuffleOn = $state(false);

  private restoreShuffle() {
    try { this.shuffleOn = localStorage.getItem(this.shuffleKey) === "true"; } catch { }
  }

  async setShuffle(on: boolean) {
    if (this.controlBusy) return;
    this.shuffleOn = on;
    try { localStorage.setItem(this.shuffleKey, String(on)); } catch { }
    if (!this.status?.can_shuffle) {
      toastState.info(on ? "Trộn bài: áp dụng cho danh sách phát tiếp theo" : "Đã tắt trộn bài");
      return;
    }
    this.controlBusy = true;
    this.error = null;
    try {
      await invoke("spotify_set_shuffle", { on });
      toastState.info(on ? "Đã bật trộn bài" : "Đã tắt trộn bài");
    } catch (e) { this.error = String(e); toastState.error(String(e)); return; }
    finally { this.controlBusy = false; }
    this.statusSettled = this.settleStatus((status) => status.shuffle === on);
  }

  /// Vòng qua ba chế độ Spotify có: không lặp → lặp danh sách → lặp một bài.
  async cycleRepeat() {
    if (this.controlBusy) return;
    const mode = this.status?.repeat === "off" ? "context" : this.status?.repeat === "context" ? "track" : "off";
    this.controlBusy = true;
    this.error = null;
    try {
      await invoke("spotify_set_repeat", { mode });
      toastState.info(mode === "off" ? "Đã tắt lặp lại" : mode === "context" ? "Lặp lại danh sách" : "Lặp lại một bài");
    } catch (e) { this.error = String(e); toastState.error(String(e)); return; }
    finally { this.controlBusy = false; }
    this.statusSettled = this.settleStatus((status) => status.repeat === mode);
  }

  /// Phát một bài kèm cả danh sách đang xem, nếu không hết bài là Spotify dừng hẳn
  /// và nút tiếp / lùi không có gì để đi tới.
  async playFromList(uris: string[], start: string) {
    if (this.busy) return;
    this.busy = true;
    this.error = null;
    try {
      const queue = this.shuffleOn ? shuffled(uris) : uris;
      await invoke("spotify_play_tracks", { uris: queue, start, positionMs: null });
      toastState.info("Đã gửi bài đến Spotify");
    } catch (e) { this.error = String(e); }
    finally { this.busy = false; }
  }

  /// Spotify quên phiên phát khi không còn thiết bị nào hoạt động, nên rust-sound
  /// tự nhớ bài đang dở để mở app lên còn thấy lại nó.
  private readonly lastTrackKey = "rust_sound_spotify_last_track";
  lastTrack = $state<LastTrack | null>(null);

  private rememberTrack(status: SpotifyStatus) {
    if (!status.uri || !status.title) return;
    const track: LastTrack = {
      uri: status.uri,
      title: status.title,
      artist: status.artist,
      artwork: status.artwork,
      position: status.position,
      duration: status.duration,
    };
    this.lastTrack = track;
    try { localStorage.setItem(this.lastTrackKey, JSON.stringify(track)); } catch { }
  }

  private restoreLastTrack() {
    try {
      const raw = localStorage.getItem(this.lastTrackKey);
      if (!raw) return;
      const track = JSON.parse(raw) as LastTrack;
      if (typeof track?.uri === "string" && typeof track?.title === "string") this.lastTrack = track;
    } catch { }
  }

  /// Phát tiếp bài đang dở, đúng chỗ đã dừng.
  async resumeLastTrack() {
    const track = this.lastTrack;
    if (!track) return;
    // status.position tính bằng giây, Spotify nhận mili-giây.
    await this.play(track.uri, Math.max(0, Math.floor(track.position * 1000)));
  }

  async setVolume(volume: number) {
    if (this.volumeBusy || !Number.isFinite(volume)) return false;
    this.volumeBusy = true;
    this.error = null;
    try {
      const next = Math.max(0, Math.min(1, volume));
      await invoke("set_app_volume", { bundleId: "com.spotify.client", volume: next });
      this.volume = next;
      toastState.info("Đã chỉnh âm lượng Spotify");
      return true;
    } catch (e) { this.error = String(e); toastState.error(String(e)); return false; }
    finally { this.volumeBusy = false; }
  }

  async setMuted(muted: boolean) {
    if (this.volumeBusy) return false;
    this.volumeBusy = true;
    this.error = null;
    try {
      await invoke("set_app_mute", { bundleId: "com.spotify.client", muted });
      this.muted = muted;
      toastState.info(muted ? "Đã tắt tiếng Spotify" : "Đã bật tiếng Spotify");
      return true;
    } catch (e) { this.error = String(e); toastState.error(String(e)); return false; }
    finally { this.volumeBusy = false; }
  }

  async openAutomationSettings() {
    try { await invoke("spotify_open_automation_settings"); }
    catch (e) { this.error = String(e); }
  }

  start() {
    if (!isTauri()) return () => {};
    let alive = true;
    let pending = false;
    const poll = async () => {
      if (pending) return;
      pending = true;
      try {
        const status = await invoke<SpotifyStatus>("get_spotify_status");
        if (alive) {
          this.status = status;
          this.rememberTrack(status);
          // Spotify nắm quyền trộn khi ngữ cảnh cho phép; lúc đó nó là nguồn đúng.
          if (status.can_shuffle && status.shuffle !== this.shuffleOn && !this.controlBusy) {
            this.shuffleOn = status.shuffle;
          }
        }
        const channels = await invoke<Record<string, { volume: number; muted: boolean }>>("get_channel_states");
        const channel = channels["com.spotify.client"];
        if (alive && channel && !this.volumeBusy) {
          this.volume = channel.volume;
          this.muted = channel.muted;
        }
      } catch (e) {
        if (alive) this.error = String(e);
      } finally { pending = false; }
    };
    this.restoreLastTrack();
    this.restoreShuffle();
    void (async () => {
      await poll();
      if (!alive) return;
      // rust-sound là bộ phát mặc định: mở app lên là nó sẵn sàng, không phải chọn.
      // Đường tap của app Spotify không còn lối vào nào trong giao diện nữa.
      if (this.status?.playback_signed_in) await this.setLocalPlayer(true);
    })();
    void this.restoreAccount();
    const timer = setInterval(poll, 1000);
    // Thiết bị đến và đi ngoài tầm app: mở Spotify trên điện thoại, rút tai nghe, tắt máy
    // khác. Hỏi lại định kỳ để danh sách không nói sai, nhưng thưa hơn nhịp trạng thái.
    // Mỗi lần hỏi là một yêu cầu Web API thật; hỏi 5 giây một lần cộng với vòng thăm dò
    // trạng thái là đủ để Spotify trả 429, và lúc đó cả app trông như bị đơ.
    const devicesTimer = setInterval(() => {
      if (alive && this.account?.connected && !this.devicesBusy && !this.busy) void this.refreshDevices(true);
    }, 15000);
    return () => { alive = false; clearInterval(timer); clearInterval(devicesTimer); };
  }

  async connect(enabled: boolean) {
    this.busy = true;
    this.error = null;
    try {
      await invoke("connect_spotify_audio", { enabled });
      this.writeSource(enabled ? "tap" : "none");
      toastState.info(enabled ? "Đã yêu cầu kết nối DSP Spotify" : "Đã yêu cầu ngắt DSP Spotify");
    } catch (e) { this.error = String(e); }
    finally { this.busy = false; }
  }

  /// Rust chỉ hỏi Spotify theo nhịp, nên ngay sau một lệnh thì ảnh chụp trạng thái vẫn
  /// là của bài cũ. Lệnh đã đánh dấu cache hết hạn; ở đây hỏi lại vài nhịp ngắn cho đến
  /// khi nó thật sự đổi, thay vì đọc một lần rồi hiển thị sai suốt một vòng poll.
  private async settleStatus(changed: (status: SpotifyStatus) => boolean) {
    for (let attempt = 0; attempt < 6; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 200 + attempt * 200));
      let status: SpotifyStatus;
      try { status = await invoke<SpotifyStatus>("get_spotify_status"); } catch { return; }
      this.status = status;
      if (changed(status)) return;
    }
  }

  async control(action: "play_pause" | "previous" | "next") {
    if (this.controlBusy) return;
    if ((action === "previous" && this.status?.can_previous === false) ||
        (action === "next" && this.status?.can_next === false)) {
      toastState.info(action === "previous" ? "Spotify chưa cho phép quay lại bài trước trong phiên phát này." : "Spotify chưa cho phép chuyển bài tiếp theo trong phiên phát này.");
      return;
    }
    const before = this.status;
    this.controlBusy = true;
    this.error = null;
    try {
      await invoke("spotify_control", { action });
      toastState.info(action === "next" ? "Đã gửi lệnh chuyển bài tiếp theo" : action === "previous" ? "Đã gửi lệnh chuyển bài trước" : "Đã gửi lệnh phát / tạm dừng Spotify");
    } catch (e) { this.error = String(e); toastState.error(String(e)); return; }
    finally { this.controlBusy = false; }
    // Nút nhả ra ngay; phần đuổi kịp trạng thái chạy nền.
    this.statusSettled = this.settleStatus(action === "play_pause"
      ? (status) => status.playing !== before?.playing
      : (status) => status.uri !== before?.uri);
  }
}

export const spotifyState = new SpotifyState();
