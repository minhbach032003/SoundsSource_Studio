<script lang="ts">
  import { onMount } from "svelte";
  import { invoke, isTauri } from "@tauri-apps/api/core";
  import { Music2, Play, Search, LogIn, LogOut, RefreshCw, ChevronLeft, ChevronRight, ListMusic, Heart, SlidersHorizontal, AudioLines, Unplug, Activity } from "@lucide/svelte";
  import Modal from "@/components/ui/Modal.svelte";
  import StudioEQInspector from "@/components/audio/StudioEQInspector.svelte";
  import PerformanceDiagnosticsCard from "@/components/diagnostics/PerformanceDiagnosticsCard.svelte";
  import { spotifyState } from "@/lib/spotify.svelte";
  import { toastState } from "@/lib/toast.svelte";

  let confirmConnect = $state(false);
  let confirmLogout = $state(false);
  let query = $state(spotifyState.searchQuery);
  let narrow = $state(window.matchMedia("(max-width: 1099px)").matches);
  let eqOpen = $state(false);
  let diagnosticsOpen = $state(false);
  let preset = $state("");
  const status = $derived(spotifyState.status);
  const signedIn = $derived(spotifyState.account?.connected ?? false);
  const page = $derived(spotifyState.page);
  const dspLabel = $derived(status?.processing ? "Đang xử lý âm thanh" : status?.connected ? "Đã nối DSP · chờ âm thanh" : status?.enabled ? "Đang chờ kết nối DSP" : "Chưa nối DSP");
  onMount(() => {
    const media = window.matchMedia("(max-width: 1099px)");
    const resize = () => { narrow = media.matches; };
    media.addEventListener("change", resize);
    return () => media.removeEventListener("change", resize);
  });
  function paginate(offset: number) {
    void spotifyState.loadLibrary(spotifyState.kind, spotifyState.searchQuery, offset, spotifyState.playlistId);
  }
  function time(ms: number) {
    const seconds = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0;
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  }
  async function setBand(bandIndex: number, gainDb: number) {
    if (!isTauri()) return;
    try { await invoke("set_master_eq_band", { bandIndex, gainDb }); }
    catch (e) { toastState.error(String(e)); }
  }
  async function bypass(bypass: boolean) {
    if (!isTauri()) return;
    try {
      await invoke("set_master_eq_bypass", { bypass });
      toastState.info(bypass ? "Đã bỏ qua EQ Spotify" : "Đã bật EQ Spotify");
    } catch (e) { toastState.error(String(e)); }
  }
</script>

{#snippet rack()}
  <section class="panel eq-panel" aria-label="Bass / EQ Spotify">
    <div class="rack-heading">
      <span class="note" role="status">{dspLabel}</span>
      <button class="btn" type="button" disabled={!isTauri() || spotifyState.busy} onclick={() => status?.enabled ? spotifyState.connect(false) : (confirmConnect = true)}>
        {#if status?.enabled}<Unplug class="w-3.5 h-3.5" /> Ngắt DSP{:else}<AudioLines class="w-3.5 h-3.5" /> Kết nối DSP{/if}
      </button>
    </div>
    {#if status?.error}<p class="error" role="alert">{status.error}</p>{/if}
    {#if status?.warning && !status?.error}<p class="warning" role="status">{status.warning}</p>{/if}
    <StudioEQInspector embedded compact activePresetName={preset} isAudioActive={status?.processing ?? false}
      onPresetSelect={(name) => { preset = name; toastState.info(`Đã chọn EQ: ${name}`); }}
      onBandChange={setBand} onToggleBypass={bypass} />
  </section>
  <details class="panel diagnostics" bind:open={diagnosticsOpen}>
    <summary><Activity class="w-4 h-4" /> Chẩn đoán âm thanh <ChevronRight class="w-3.5 h-3.5 disclosure-chevron" /></summary>
    {#if diagnosticsOpen}
      <div class="diagnostics-content">
        <dl>
          <div><dt>Tài khoản Spotify</dt><dd>{signedIn ? "Đã kết nối thư viện" : "Chưa kết nối thư viện"}</dd></div>
          <div><dt>Âm thanh Spotify</dt><dd>{dspLabel}</dd></div>
          <div><dt>Sample rate</dt><dd>{status?.sample_rate ? `${status.sample_rate.toLocaleString()} Hz` : "Chưa có dữ liệu"}</dd></div>
          <div><dt>Frames đã xử lý</dt><dd>{status?.frames?.toLocaleString() ?? "0"}</dd></div>
        </dl>
        <p class="note">Tài khoản và DSP là hai kết nối riêng. Spotify vẫn phát nền; thoát rust-sound sẽ trả lại âm thanh trực tiếp.</p>
        {#if status?.playback_error?.includes("-1743") && !signedIn}<button class="btn" type="button" onclick={() => spotifyState.openAutomationSettings()}>Mở quyền Automation</button>{/if}
        <PerformanceDiagnosticsCard />
      </div>
    {/if}
  </details>
{/snippet}

<div class="spotify-workspace" class:narrow>
  <section class="panel library" aria-labelledby="spotify-library-title">
    <div class="library-heading">
      <h2 id="spotify-library-title">Thư viện của bạn</h2>
      {#if signedIn}
        <span class="account-status"><span class="connection-dot"></span> Đã kết nối Spotify</span>
        <button class="btn icon-button" type="button" aria-label="Ngắt tài khoản Spotify" title="Ngắt tài khoản Spotify" disabled={spotifyState.authBusy || spotifyState.libraryBusy || spotifyState.devicesBusy} onclick={() => confirmLogout = true}><LogOut class="w-4 h-4" /></button>
      {:else}
        <button class="btn btn-primary" type="button" disabled={!isTauri() || spotifyState.authBusy || spotifyState.account?.configured === false} onclick={() => spotifyState.login()}>
          <LogIn class="w-4 h-4" /> {spotifyState.authBusy ? "Đang kết nối…" : "Đăng nhập Spotify"}
        </button>
      {/if}
    </div>
    {#if !signedIn}
      <div class="signed-out">
        <Music2 class="w-8 h-8 text-(--accent-text)" />
        <h3>Nhạc của bạn, ngay tại đây</h3>
        <p class="note">Đăng nhập Spotify Premium để xem playlist, bài đã thích và tìm bài. Spotify là nguồn phát nền trên Mac; rust-sound điều khiển và xử lý bass / EQ.</p>
        {#if spotifyState.authBusy}<p class="note" role="status">Chọn Đồng ý trên trình duyệt rồi quay lại app. Yêu cầu hết hạn sau 3 phút.</p>{/if}
        {#if spotifyState.account?.configured === false}<p class="error" role="alert">Thiếu Client ID. Cấu hình SPOTIFY_CLIENT_ID trong .env rồi build lại app.</p>{/if}
      </div>
    {:else}
      <div class="device-row">
        <label for="spotify-device">Phát trên</label>
        <select id="spotify-device" value={spotifyState.account?.device_id ?? ""} disabled={spotifyState.devicesBusy || spotifyState.busy} onchange={(event) => spotifyState.selectDevice(event.currentTarget.value)}>
          <option value="" disabled>Chọn Spotify trên Mac này</option>
          {#each spotifyState.devices as device (device.id)}<option value={device.id}>{device.name}{device.is_active ? " · đang phát" : ""}</option>{/each}
        </select>
        <button class="btn icon-button" type="button" aria-label="Làm mới thiết bị Spotify" disabled={spotifyState.devicesBusy || spotifyState.busy} onclick={() => spotifyState.refreshDevices()}><RefreshCw class="w-4 h-4" /></button>
      </div>
      <p class="note device-hint">Bass / EQ chỉ áp dụng cho Spotify trên Mac này, không xử lý nhạc phát ở thiết bị khác.</p>
      <form class="spotify-search" onsubmit={(event) => { event.preventDefault(); void spotifyState.loadLibrary("search", query); }}>
        <input type="search" aria-label="Tìm bài hát trên Spotify" placeholder="Tìm bài hát hoặc nghệ sĩ…" maxlength="500" required bind:value={query} />
        <button class="btn icon-button" type="submit" aria-label="Tìm bài hát" disabled={!query.trim() || spotifyState.libraryBusy}><Search class="w-4 h-4" /></button>
      </form>
      <nav class="library-nav" aria-label="Danh sách nhạc Spotify">
        <button class="btn" type="button" aria-pressed={spotifyState.kind === "playlists" || spotifyState.kind === "playlist"} onclick={() => spotifyState.loadLibrary("playlists")}><ListMusic class="w-4 h-4" /> Playlist của tôi</button>
        <button class="btn" type="button" aria-pressed={spotifyState.kind === "saved"} onclick={() => spotifyState.loadLibrary("saved")}><Heart class="w-4 h-4" /> Bài đã thích</button>
      </nav>
    {/if}
    {#if narrow}
      <button class="btn eq-disclosure" type="button" aria-expanded={eqOpen} aria-controls="spotify-mobile-eq" onclick={() => eqOpen = !eqOpen}><SlidersHorizontal class="w-4 h-4" /> Bass / EQ <span class="note">{status?.processing ? "DSP đang xử lý" : status?.enabled ? "DSP đang chờ" : "DSP chưa nối"}</span><ChevronRight class={`w-4 h-4 disclosure-chevron ${eqOpen ? 'rotated' : ''}`} /></button>
      {#if eqOpen}<div id="spotify-mobile-eq" class="mobile-rack">{@render rack()}</div>{/if}
    {/if}
    {#if signedIn}
      <div class="list-heading">
        {#if spotifyState.kind === "playlist"}
          <button class="btn icon-button" type="button" aria-label="Trở về playlist" onclick={() => spotifyState.loadLibrary("playlists")}><ChevronLeft class="w-4 h-4" /></button>
          <h3 title={spotifyState.playlistName}>{spotifyState.playlistName}</h3>
          <button class="btn icon-button" type="button" aria-label="Phát playlist" disabled={spotifyState.busy || !spotifyState.account?.device_id} onclick={() => spotifyState.play(`spotify:playlist:${spotifyState.playlistId}`)}><Play class="w-4 h-4" /></button>
        {:else}
          <h3>{spotifyState.kind === "search" ? `Kết quả: ${spotifyState.searchQuery}` : spotifyState.kind === "saved" ? "Bài đã thích" : "Playlist của tôi"}</h3>
        {/if}
      </div>
      <div class="spotify-results" aria-busy={spotifyState.libraryBusy}>
        {#if spotifyState.libraryBusy}<p class="note empty-state" role="status">Đang tải nhạc từ Spotify…</p>
        {:else if spotifyState.libraryError}
          <div class="empty-state"><p class="error" role="alert">{spotifyState.libraryError}</p><button class="btn" type="button" onclick={() => paginate(page?.offset ?? 0)}><RefreshCw class="w-4 h-4" /> Thử lại</button></div>
        {:else if page?.items.length}
          <ul>
            {#each page.items as item}
              <li class:current-track={spotifyState.kind !== "playlists" && status?.title === item.name && status?.artist === item.artist}>
                {#if item.artwork?.startsWith("https://")}<img src={item.artwork} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<span class="artwork-placeholder"><Music2 class="w-4 h-4" /></span>{/if}
                {#if spotifyState.kind === "playlists"}
                  <button class="item-name" type="button" onclick={() => { spotifyState.playlistName = item.name; void spotifyState.loadLibrary("playlist", "", 0, item.id); }}><strong title={item.name}>{item.name}</strong><span>{item.artist || "Playlist"}</span></button>
                {:else}<div class="item-name"><strong title={item.name}>{item.name}</strong><span title={item.artist}>{item.artist}</span></div><span class="duration">{time(item.duration_ms)}</span>{/if}
                <button class="btn icon-button" type="button" aria-label={`Phát ${item.name}`} disabled={spotifyState.busy || !spotifyState.account?.device_id} onclick={() => spotifyState.play(item.uri)}><Play class="w-4 h-4" /></button>
              </li>
            {/each}
          </ul>
        {:else if page}<p class="note empty-state" role="status">{spotifyState.kind === "search" ? "Không tìm thấy bài hát. Thử tên bài hoặc nghệ sĩ khác." : "Danh sách chưa có bài khả dụng."}</p>{/if}
      </div>
      {#if page && (page.offset > 0 || page.next_offset !== null)}
        <div class="pagination">
          <button class="btn icon-button" type="button" aria-label="Trang trước" disabled={page.offset === 0 || spotifyState.libraryBusy} onclick={() => paginate(Math.max(0, page.offset - (spotifyState.kind === "search" ? 10 : 20)))}><ChevronLeft class="w-4 h-4" /></button>
          <span class="note">Trang {Math.floor(page.offset / (spotifyState.kind === "search" ? 10 : 20)) + 1}</span>
          <button class="btn icon-button" type="button" aria-label="Trang tiếp" disabled={page.next_offset === null || spotifyState.libraryBusy} onclick={() => { if (page?.next_offset != null) paginate(page.next_offset); }}><ChevronRight class="w-4 h-4" /></button>
        </div>
      {/if}
    {:else if spotifyState.libraryError}<p class="error" role="alert">{spotifyState.libraryError}</p>{/if}
  </section>
  {#if !narrow}<aside class="studio-rack" aria-label="Điều chỉnh âm thanh Spotify">{@render rack()}</aside>{/if}
</div>

<Modal open={confirmConnect} title="Đưa tiếng Spotify qua bass / EQ?"
  description="rust-sound sẽ thu riêng âm thanh Spotify, xử lý rồi phát ra thiết bị hiện tại. Các ứng dụng khác không đổi. macOS có thể yêu cầu quyền System Audio Recording. Khi thoát rust-sound, Spotify vẫn chạy và phát bình thường. Lần mở sau sẽ tự kết nối lại."
  confirmText="Cho phép và kết nối" cancelText="Để sau" onClose={() => confirmConnect = false}
  onConfirm={() => { confirmConnect = false; void spotifyState.connect(true); }} />
<Modal open={confirmLogout} title="Ngắt tài khoản Spotify?"
  description="Xóa phiên đăng nhập Spotify đã lưu trong Keychain của rust-sound. Spotify và kết nối bass / EQ vẫn hoạt động; cần đăng nhập lại để duyệt thư viện."
  confirmText="Ngắt tài khoản" cancelText="Giữ kết nối" onClose={() => confirmLogout = false}
  onConfirm={() => { confirmLogout = false; void spotifyState.logout(); }} />

<style>
  .spotify-workspace { display: grid; grid-template-columns: minmax(0,1.5fr) minmax(360px,1fr); gap: 20px; min-height: 0; flex: 1; }
  .library { display: flex; flex-direction: column; gap: 12px; padding: 20px; min-width: 0; min-height: 0; overflow: hidden; }
  .library-heading, .rack-heading, .list-heading { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .library-heading h2 { font-size: 14px; margin: 0; flex: 1; font-weight: 700; }
  .account-status { display: flex; align-items: center; gap: 6px; color: var(--success); font-size: 10px; }
  .connection-dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
  .icon-button { width: 36px; height: 36px; padding: 0; flex-shrink: 0; }
  .note { margin: 0; font-size: 11px; line-height: 1.5; color: var(--muted); overflow-wrap: anywhere; }
  .error { margin: 0; font-size: 12px; line-height: 1.5; color: var(--error); overflow-wrap: anywhere; }
  .warning { margin: 0; font-size: 12px; line-height: 1.5; color: var(--muted); overflow-wrap: anywhere; }
  .device-row { display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--muted); }
  .device-row select { flex: 1; min-width: 0; max-width: 100%; }
  .spotify-search { display: flex; gap: 8px; }
  .spotify-search input { flex: 1; min-width: 0; }
  .spotify-search input, select { height: 36px; border: 1px solid var(--input-line); border-radius: 8px; padding: 0 10px; color: var(--ink); background: var(--paper); font-size: 12px; }
  input:focus-visible, select:focus-visible, button:focus-visible, summary:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .library-nav { display: flex; flex-wrap: wrap; gap: 8px; }
  .library-nav button[aria-pressed="true"] { border-color: var(--accent); background: var(--soft); }
  .list-heading { border-bottom: 1px solid var(--line); padding-bottom: 10px; min-height: 30px; }
  .list-heading h3 { font-size: 12px; font-weight: 600; margin: 0; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .spotify-results { flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--line) transparent; }
  ul { list-style: none; padding: 0; margin: 0; }
  li { display: flex; gap: 12px; align-items: center; padding: 12px 8px; border-bottom: 1px solid var(--line); border-radius: 8px; }
  li:last-child { border-bottom: 0; }
  li:hover { background: var(--paper); }
  li.current-track { background: var(--soft); }
  li img, .artwork-placeholder { width: 40px; height: 40px; border-radius: 6px; flex-shrink: 0; object-fit: cover; background: var(--paper); }
  .artwork-placeholder { display: grid; place-items: center; color: var(--muted); }
  .item-name { display: grid; gap: 4px; min-width: 0; flex: 1; text-align: left; border: 0; padding: 0; color: var(--ink); background: transparent; }
  button.item-name { cursor: pointer; }
  button.item-name:hover strong { text-decoration: underline; text-underline-offset: 3px; }
  .item-name strong { font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .item-name span { font-size: 11px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .duration { font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .pagination { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-top: 8px; }
  .empty-state { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; padding: 24px 8px; }
  .signed-out { flex: 1; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 16px; padding: 32px 12px; }
  .signed-out h3 { margin: 0; font-size: 20px; }
  .signed-out p { max-width: 48ch; }
  .studio-rack, .mobile-rack { display: flex; flex-direction: column; gap: 12px; min-width: 0; min-height: 0; }
  .studio-rack { overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--line) transparent; }
  .eq-panel { padding: 16px; }
  .rack-heading { justify-content: space-between; margin-bottom: 12px; }
  .rack-heading button { font-size: 11px; }
  .diagnostics { flex-shrink: 0; }
  .diagnostics summary { display: flex; align-items: center; gap: 8px; cursor: pointer; list-style: none; padding: 14px 16px; font-size: 12px; color: var(--muted); }
  .diagnostics summary::-webkit-details-marker { display: none; }
  .diagnostics summary :global(.disclosure-chevron) { margin-left: auto; flex-shrink: 0; }
  .diagnostics[open] :global(.disclosure-chevron), .eq-disclosure :global(.rotated) { transform: rotate(90deg); }
  .diagnostics-content { padding: 0 16px 16px; display: grid; gap: 16px; }
  dl { margin: 0; display: grid; gap: 10px; font-size: 11px; }
  dl div { display: flex; justify-content: space-between; gap: 12px; }
  dt { color: var(--muted); } dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; }
  .narrow { display: block; }
  .narrow .library { min-height: 100%; overflow: visible; }
  .narrow .spotify-results { flex: none; overflow: visible; }
  .eq-disclosure { justify-content: flex-start; width: 100%; border-color: transparent; }
  .eq-disclosure .note { margin-left: auto; }
  .eq-disclosure :global(.disclosure-chevron) { margin-left: 0; flex-shrink: 0; }
  @media(max-width:600px) {
    .library { padding: 16px; gap: 12px; }
    .account-status { font-size: 9px; }
    .library-heading h2 { font-size: 13px; }
    .library-nav { gap: 6px; }
    .library-nav button { font-size: 11px; padding-left: 8px; padding-right: 8px; }
    li { padding-left: 0; padding-right: 0; gap: 8px; }
    li img, .artwork-placeholder { width: 32px; height: 32px; }
    .duration { display: none; }
    .device-hint { font-size: 10px; }
    .eq-panel { padding: 12px; }
  }
</style>
