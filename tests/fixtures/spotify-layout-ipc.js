// Browser-only native boundary. Never talks to Spotify or the macOS audio engine.
const params = new URLSearchParams(location.search);
if (params.has("area")) localStorage.setItem("rust_sound_active_area", params.get("area"));
localStorage.removeItem("rust_sound_spotify_audio_consent");
localStorage.setItem("rust-sound.ui-theme", JSON.stringify({ family: "catppuccin", mode: "light", darkFlavor: "mocha" }));
window.isTauri = true;
window.ipcCalls = [];
window.libraryMode = "data";
window.connected = !params.has("loggedout");
window.channel = { volume: 0.8, muted: false };
window.transportRestricted = false;
window.transportFailure = false;
window.eq = { bands: Array.from({ length: 10 }, () => ({ gain: 0 })), bypass: false };
const account = () => ({ configured: true, connected: window.connected, device_id: window.connected ? "local-mac" : null });
const tracks = Array.from({ length: 24 }, (_, index) => ({ id: String(index), uri: `spotify:track:sample${index}`, name: index === 0 ? "Đừng Kết Thúc Hôm Nay · dữ liệu kiểm thử" : `Bài hát kiểm thử ${index + 1}`, artist: index === 0 ? "Orange" : "Nghệ sĩ mẫu", artwork: "", duration_ms: 212000 }));
window.__TAURI_INTERNALS__ = {
  metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
  transformCallback: () => 1, unregisterCallback() {}, convertFileSrc: value => value,
  async invoke(command, args = {}) {
    window.ipcCalls.push({ command, args });
    if (command === "spotify_account") return account();
    if (command === "spotify_login") { await new Promise(resolve => window.finishLogin = resolve); window.connected = true; return account(); }
    if (command === "spotify_logout") { window.connected = false; return; }
    if (command === "spotify_devices") return [{ id: "local-mac", name: "Mac này", is_active: true }];
    if (command === "spotify_browse") {
      if (window.libraryMode === "loading") await new Promise(resolve => window.finishLibrary = resolve);
      if (window.libraryMode === "error") throw "Spotify API 502 · lỗi kiểm thử";
      return { items: window.libraryMode === "empty" ? [] : args.kind === "playlists" ? tracks.slice(0, 8).map((track, index) => ({ ...track, name: ["Nhạc chill buổi sáng", "40 Hz Binaural Beats", "432 hz Sleep Music", "WORKOUT PLAYLIST 2026", "Coding Music"][index % 5], artist: "Playlist mẫu", uri: `spotify:playlist:sample${index}` })) : tracks.slice(0, 12), offset: args.offset ?? 0, next_offset: args.offset ? null : args.kind === "playlists" ? null : 20 };
    }
    if (command === "spotify_control" && window.transportFailure) throw "Không chuyển được bài · lỗi kiểm thử";
    if (command === "get_spotify_status") return { can_previous: !window.transportRestricted, can_next: !window.transportRestricted, running: true, playing: false, title: tracks[0].name, artist: "Orange", album: "Dữ liệu kiểm thử", artwork: "", position: 70, duration: 212, enabled: true, connected: true, processing: false, frames: 48000, sample_rate: 48000, error: null, playback_error: null };
    if (command === "get_channel_states") return { "com.spotify.client": { ...window.channel } };
    if (command === "set_app_volume") { window.channel.volume = args.volume; return; }
    if (command === "set_app_mute") { window.channel.muted = args.muted; return; }
    if (command === "get_master_eq_bands") return structuredClone(window.eq);
    if (command === "set_master_eq_band") { window.eq.bands[args.bandIndex].gain = args.gainDb; return; }
    if (command === "set_master_eq_bypass") { window.eq.bypass = args.bypass; return args.bypass; }
    if (command === "get_spotify_spectrum") return { heights: Array(28).fill(0), receiving: false, has_signal: false, enabled: true, connected: true, error: null };
    if (command === "get_audio_processes") return [{ pid: 100, object_id: 100, bundle_id: "com.spotify.client", name: "Spotify", is_running_output: false, is_regular_app: true }];
    if (command === "get_audio_devices") return [{ name: "Mac speakers", uid: "local-output", is_default: true }];
    if (["get_audio_input_devices", "get_presets", "get_ping_catalog"].includes(command)) return [];
    if (["get_ping_settings", "auth_session"].includes(command)) return null;
    if (command === "toggle_pet_overlay") return false;
    if (command.startsWith("plugin:") || ["set_dock_icon", "spotify_play_uri", "spotify_control", "spotify_select_device", "connect_spotify_audio"].includes(command)) return;
    throw `Mock not implemented: ${command}`;
  },
};
