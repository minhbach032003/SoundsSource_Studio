import { invoke, isTauri } from "@tauri-apps/api/core";
import { toastState } from "./toast.svelte";

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

  /// Nguồn nhạc người dùng chọn lần trước. rust-sound tự phát là mặc định; khoá cũ
  /// chỉ biết mỗi đường tap nên không được dùng nó để bật lại thứ cần app Spotify.
  private readSource(): "local" | "tap" | "none" {
    try {
      localStorage.removeItem("rust_sound_spotify_audio_consent");
      const stored = localStorage.getItem(this.sourceKey);
      if (stored === "local" || stored === "tap" || stored === "none") return stored;
    } catch { /* Storage may be unavailable. */ }
    return "local";
  }

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

  async refreshDevices() {
    if (this.devicesBusy) return;
    this.devicesBusy = true;
    try {
      this.devices = await invoke<SpotifyDevice[]>("spotify_devices");
      this.account = await invoke<SpotifyAccount>("spotify_account");
    } catch (e) { this.libraryError = String(e); }
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
    void (async () => {
      await poll();
      if (!alive) return;
      const source = this.readSource();
      // Bật tap khi không có app Spotify sẽ stall và giết luôn local player, nên chỉ
      // khôi phục nó khi app Spotify đang thật sự chạy.
      if (source === "tap" && this.status?.running) await this.connect(true);
      else if (source !== "tap" && this.status?.playback_signed_in) await this.setLocalPlayer(true);
    })();
    void this.restoreAccount();
    const timer = setInterval(poll, 1000);
    return () => { alive = false; clearInterval(timer); };
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

  async control(action: "play_pause" | "previous" | "next") {
    if (this.busy) return;
    this.busy = true;
    this.error = null;
    try {
      await invoke("spotify_control", { action });
      this.status = await invoke<SpotifyStatus>("get_spotify_status");
      toastState.info(action === "next" ? "Đã chuyển bài tiếp theo" : action === "previous" ? "Đã chuyển bài trước" : "Đã gửi lệnh phát / tạm dừng Spotify");
    } catch (e) { this.error = String(e); }
    finally { this.busy = false; }
  }
}

export const spotifyState = new SpotifyState();
