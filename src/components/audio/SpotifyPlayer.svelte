<script lang="ts">
  import { isTauri } from "@tauri-apps/api/core";
  import { Music2, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Shuffle, Repeat, Repeat1 } from "@lucide/svelte";
  import { spotifyState } from "@/lib/spotify.svelte";

  const status = $derived(spotifyState.status);
  const canControl = $derived(isTauri() && Boolean(spotifyState.account?.connected || status?.running || status?.local_running));
  /// Thanh này từng chỉ biết kể chuyện app Spotify chạy nền; giờ rust-sound tự phát.
  /// Nhạc chạy ở thiết bị khác thì phải nói ra tên nó, nếu không thanh này trông như
  /// hỏng trong khi thật ra nhạc vẫn đang phát, chỉ là ở chỗ khác.
  const elsewhere = $derived(
    Boolean(status?.device_name) && status?.device_id !== spotifyState.account?.device_id
      ? status?.device_name
      : ""
  );
  const sourceLabel = $derived(
    elsewhere ? `Đang phát trên ${elsewhere}` :
    status?.local_running ? "Đang phát trong rust-sound" :
    status?.running ? "Spotify trên Mac này" :
    "Chưa có nguồn phát"
  );
  /// Spotify quên phiên phát khi mọi thiết bị đã tắt, nên khi chưa có gì đang phát ta
  /// hiện lại bài dở mà rust-sound tự nhớ — tạm dừng, chờ bấm phát.
  const resuming = $derived(!status?.title && !elsewhere && Boolean(spotifyState.lastTrack));
  const shown = $derived(resuming ? spotifyState.lastTrack : null);
  const title = $derived(status?.title || shown?.title || "");
  const artist = $derived(status?.artist || shown?.artist || "");
  const position = $derived(status?.title ? (status?.position ?? 0) : (shown?.position ?? 0));
  const duration = $derived(status?.title ? (status?.duration ?? 0) : (shown?.duration ?? 0));
  const art = $derived(status?.artwork || shown?.artwork || "");
  const artwork = $derived(art.startsWith("https://") ? art : "");
  let volume = $state(100);
  let editingVolume = $state(false);
  $effect(() => { if (!editingVolume) volume = Math.round(spotifyState.volume * 100); });
  function time(seconds: number) {
    const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
    return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
  }
</script>

<footer class="spotify-player" aria-label="Thanh phát Spotify">
  <div class="now-playing">
    <div class="artwork">
      {#if artwork}<img src={artwork} alt="Bìa album {status?.album ?? ''}" referrerpolicy="no-referrer" />{:else}<Music2 class="w-5 h-5" />{/if}
    </div>
    <div class="track-copy">
      <p title={title}>{title || "Chưa chọn bài hát"}</p>
      <span title={artist || sourceLabel}>{resuming ? `${artist} · đang dở` : artist || sourceLabel}</span>
    </div>
  </div>
  <div class="playback">
    <div class="transport">
      <button class="btn icon-button" type="button" aria-label="Trộn bài" aria-pressed={status?.shuffle ?? false} disabled={!canControl || spotifyState.busy} onclick={() => spotifyState.setShuffle(!(status?.shuffle ?? false))}><Shuffle class="w-4 h-4" /></button>
      <button class="btn icon-button" type="button" aria-label="Bài trước" disabled={!canControl || spotifyState.busy} onclick={() => spotifyState.control("previous")}><SkipBack class="w-4 h-4" /></button>
      <button class="btn btn-primary icon-button play-button" type="button" aria-label={status?.playing ? "Tạm dừng Spotify" : resuming ? `Phát tiếp ${title}` : "Phát Spotify"} disabled={!canControl || spotifyState.busy} onclick={() => resuming ? spotifyState.resumeLastTrack() : spotifyState.control("play_pause")}>
        {#if status?.playing}<Pause class="w-4 h-4" />{:else}<Play class="w-4 h-4" />{/if}
      </button>
      <button class="btn icon-button" type="button" aria-label="Bài tiếp theo" disabled={!canControl || spotifyState.busy} onclick={() => spotifyState.control("next")}><SkipForward class="w-4 h-4" /></button>
      <button class="btn icon-button" type="button" aria-label={status?.repeat === "track" ? "Đang lặp một bài" : status?.repeat === "context" ? "Đang lặp danh sách" : "Lặp lại"} aria-pressed={(status?.repeat ?? "off") !== "off"} disabled={!canControl || spotifyState.busy} onclick={() => spotifyState.cycleRepeat()}>
        {#if status?.repeat === "track"}<Repeat1 class="w-4 h-4" />{:else}<Repeat class="w-4 h-4" />{/if}
      </button>
    </div>
    <div class="progress-row">
      <span>{time(position)}</span>
      <progress aria-label="Tiến độ bài hát" max={duration || 1} value={Math.min(position, duration || 0)}></progress>
      <span>{time(duration)}</span>
    </div>
  </div>
  <div class="volume-control">
    <button class="btn icon-button" type="button" aria-label={spotifyState.muted ? "Bật tiếng Spotify" : "Tắt tiếng Spotify"} aria-pressed={spotifyState.muted} disabled={!canControl || spotifyState.volumeBusy} onclick={() => spotifyState.setMuted(!spotifyState.muted)}>
      {#if spotifyState.muted}<VolumeX class="w-4 h-4" />{:else}<Volume2 class="w-4 h-4" />{/if}
    </button>
    <label for="spotify-volume">Spotify</label>
    <input id="spotify-volume" aria-label="Âm lượng Spotify" type="range" min="0" max="100" step="1" bind:value={volume} disabled={!canControl || spotifyState.volumeBusy} onfocus={() => editingVolume = true} onblur={() => editingVolume = false} onchange={async () => { if (!await spotifyState.setVolume(volume / 100)) volume = Math.round(spotifyState.volume * 100); }} />
    <output for="spotify-volume">{spotifyState.muted ? "Tắt" : `${volume}%`}</output>
  </div>
  {#if spotifyState.error || status?.playback_error}
    <p class="player-error" role="alert">{spotifyState.error || status?.playback_error}</p>
  {/if}
</footer>

<style>
  .spotify-player { display: grid; grid-template-columns: minmax(0,1fr) minmax(220px,1.25fr) minmax(190px,1fr); align-items: center; gap: 12px 24px; padding: 12px 24px; border-top: 1px solid var(--line); background: var(--paper); flex-shrink: 0; z-index: 20; }
  .now-playing { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .artwork { width: 48px; height: 48px; border-radius: 8px; background: var(--surface); color: var(--muted); flex-shrink: 0; display: grid; place-items: center; overflow: hidden; }
  .artwork img { width: 100%; height: 100%; object-fit: cover; }
  .track-copy { min-width: 0; }
  .track-copy p { margin: 0 0 4px; font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .track-copy span { display: block; font-size: 11px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .playback { display: grid; gap: 6px; min-width: 0; }
  .transport { display: flex; justify-content: center; gap: 8px; }
  .icon-button { width: 32px; height: 32px; padding: 0; flex-shrink: 0; }
  /* Cùng cách đánh dấu đang bật với thanh điều hướng thư viện. */
  .transport button[aria-pressed="true"] { border-color: var(--accent); background: var(--soft); }
  .play-button { border-radius: 50%; }
  .progress-row { display: flex; align-items: center; gap: 10px; font-size: 10px; color: var(--muted); font-variant-numeric: tabular-nums; }
  progress { flex: 1; min-width: 0; width: 100%; height: 4px; accent-color: var(--accent); }
  progress::-webkit-progress-bar { background: var(--line); border-radius: 4px; }
  progress::-webkit-progress-value { background: var(--accent); border-radius: 4px; }
  progress::-moz-progress-bar { background: var(--accent); border-radius: 4px; }
  .volume-control { display: flex; gap: 8px; align-items: center; justify-content: flex-end; font-size: 10px; color: var(--muted); }
  .volume-control input { min-width: 0; width: 88px; accent-color: var(--accent); cursor: pointer; }
  .volume-control output { width: 32px; text-align: right; font-variant-numeric: tabular-nums; }
  .player-error { grid-column: 1 / -1; margin: 0; max-height: 48px; overflow-y: auto; font-size: 11px; color: var(--error); overflow-wrap: anywhere; }
  @media (max-width: 900px) {
    .spotify-player { grid-template-columns: minmax(0,1fr) auto; gap: 10px; padding: 12px; }
    .now-playing { grid-column: 1; grid-row: 1; }
    .volume-control { grid-column: 2; grid-row: 1; }
    .volume-control label, .volume-control output { display: none; }
    .volume-control input { width: 64px; }
    .playback { grid-column: 1 / -1; grid-row: 2; display: flex; align-items: center; gap: 12px; }
    .progress-row { flex: 1; min-width: 0; gap: 6px; }
    .transport { gap: 4px; }
    .icon-button { width: 30px; height: 32px; }
    .artwork { width: 32px; height: 32px; border-radius: 6px; }
  }
</style>
