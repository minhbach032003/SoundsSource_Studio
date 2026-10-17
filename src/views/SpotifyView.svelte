<script lang="ts">
  import { onMount } from "svelte";
  import { invoke, isTauri } from "@tauri-apps/api/core";
  import { Music2, Play, Search, LogIn, LogOut, RefreshCw, ChevronLeft, ChevronRight, ListMusic, Heart, SlidersHorizontal, AudioLines, Activity } from "@lucide/svelte";
  import Modal from "@/components/ui/Modal.svelte";
  import StudioEQInspector from "@/components/audio/StudioEQInspector.svelte";
  import PerformanceDiagnosticsCard from "@/components/diagnostics/PerformanceDiagnosticsCard.svelte";
  import { spotifyState } from "@/lib/spotify.svelte";
  import { toastState } from "@/lib/toast.svelte";

  let confirmLogout = $state(false);
  let query = $state(spotifyState.searchQuery);
  let narrow = $state(window.matchMedia("(max-width: 1099px)").matches);
  let eqOpen = $state(false);
  let diagnosticsOpen = $state(false);
  let preset = $state("");
  const status = $derived(spotifyState.status);
  const signedIn = $derived(spotifyState.account?.connected ?? false);
  const page = $derived(spotifyState.page);
  const dspLabel = $derived(
    status?.local_running
      ? (status?.processing ? "rust-sound đang phát · qua EQ" : "rust-sound sẵn sàng phát")
      : status?.processing ? "Đang xử lý âm thanh"
      : status?.connected ? "Đã nối DSP · chờ âm thanh"
      : status?.enabled ? "Đang chờ kết nối DSP"
      : status?.playback_signed_in ? "Chọn một bài để phát trong rust-sound"
      : "Chưa sẵn sàng phát");
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
      {#if status?.local_running}
        <span class="note status-pill"><AudioLines class="w-3.5 h-3.5 text-(--accent)" /> Đang phát trong rust-sound · DSP luôn bật</span>
      {:else if status?.playback_signed_in}
        <!-- rust-sound tự phát nhạc, nên chỗ này không còn là nơi nối DSP của app Spotify
             mà là nơi bật lại bộ phát của chính app khi nó chưa chạy. -->
        <button class="btn" type="button" disabled={!isTauri() || spotifyState.busy} onclick={() => spotifyState.setLocalPlayer(true)}>
          <AudioLines class="w-3.5 h-3.5" /> Bật phát trong rust-sound
        </button>
      {/if}
    </div>
    {#if status?.local_error || status?.error}<p class="error" role="alert">{status.local_error || status.error}</p>{/if}
    {#if status?.warning && !status?.error && !status?.local_error}<p class="warning" role="status">{status.warning}</p>{/if}
    <StudioEQInspector embedded compact wide={!narrow} activePresetName={preset} isAudioActive={status?.processing ?? false}
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

<div class="spotify-workspace">
  {#if narrow}
    <button class="btn eq-disclosure" type="button" aria-expanded={eqOpen} aria-controls="spotify-mobile-eq" onclick={() => eqOpen = !eqOpen}><SlidersHorizontal class="w-4 h-4" /> Bass / EQ <span class="note">{status?.processing ? "DSP đang xử lý" : status?.enabled ? "DSP đang chờ" : "DSP chưa nối"}</span><ChevronRight class={`w-4 h-4 disclosure-chevron ${eqOpen ? 'rotated' : ''}`} /></button>
    {#if eqOpen}<div id="spotify-mobile-eq" class="mobile-rack">{@render rack()}</div>{/if}
  {:else}
    <aside class="studio-rack" aria-label="Điều chỉnh âm thanh Spotify">{@render rack()}</aside>
  {/if}
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
        <p class="note">Đăng nhập Spotify Premium để xem playlist, bài đã thích và tìm bài. rust-sound tự phát nhạc, không cần mở app Spotify, và xử lý bass / EQ ngay trên đường phát.</p>
        {#if spotifyState.authBusy}<p class="note" role="status">Chọn Đồng ý trên trình duyệt rồi quay lại app. Yêu cầu hết hạn sau 3 phút.</p>{/if}
        {#if spotifyState.account?.configured === false}<p class="error" role="alert">Thiếu Client ID. Cấu hình SPOTIFY_CLIENT_ID trong .env rồi build lại app.</p>{/if}
      </div>
    {:else}
      <div class="device-row">
        <label for="spotify-device">Phát trên</label>
        <select
          id="spotify-device"
          value={status?.local_running ? (spotifyState.localDeviceId ?? "rust-sound") : (spotifyState.account?.device_id ?? "")}
          disabled={spotifyState.devicesBusy || spotifyState.busy}
          onchange={async (event) => {
            const val = event.currentTarget.value;
            if (val === "rust-sound" || val === spotifyState.localDeviceId) {
              // Phát trong app cần danh tính phát nhạc riêng; xin nó ngay tại đây.
              if (!status?.playback_signed_in && !(await spotifyState.loginPlayback())) return;
              await spotifyState.setLocalPlayer(true);
            } else {
              if (status?.local_running) {
                await spotifyState.setLocalPlayer(false);
              }
              await spotifyState.selectDevice(val);
            }
          }}
        >
          <option value="" disabled>Chọn thiết bị phát</option>
          {#if !spotifyState.devices.some(d => d.name.toLowerCase() === "rust-sound")}
            <option value="rust-sound">rust-sound (máy này)</option>
          {/if}
          {#each spotifyState.sortedDevices as device (device.id)}
            <option value={device.id}>
              {device.name.toLowerCase() === "rust-sound" ? "rust-sound (máy này)" : device.name}{device.is_active ? " · đang phát" : ""}
            </option>
          {/each}
        </select>
        <button class="btn icon-button" type="button" aria-label="Làm mới thiết bị Spotify" disabled={spotifyState.devicesBusy || spotifyState.busy} onclick={() => spotifyState.refreshDevices()}><RefreshCw class="w-4 h-4" /></button>
      </div>
      {#if !status?.playback_signed_in}
        <div class="device-row playback-auth-row">
          <button class="btn" type="button" disabled={spotifyState.playbackAuthBusy} onclick={() => spotifyState.loginPlayback()}>
            <LogIn class="w-3.5 h-3.5" /> Đăng nhập để phát trong app
          </button>
          <p class="note">Spotify chỉ cho phát nhạc qua phiên đăng nhập riêng, tách khỏi đăng nhập thư viện. Làm một lần, app nhớ luôn.</p>
        </div>
      {/if}
      <p class="note device-hint">Bass / EQ chỉ áp dụng cho nhạc phát trong rust-sound, không xử lý nhạc phát ở điện thoại hay thiết bị khác.</p>
      <form class="spotify-search" onsubmit={(event) => { event.preventDefault(); void spotifyState.loadLibrary("search", query); }}>
        <input type="search" aria-label="Tìm bài hát trên Spotify" placeholder="Tìm bài hát hoặc nghệ sĩ…" maxlength="500" required bind:value={query} />
        <button class="btn icon-button" type="submit" aria-label="Tìm bài hát" disabled={!query.trim() || spotifyState.libraryBusy}><Search class="w-4 h-4" /></button>
      </form>
      <nav class="library-nav" aria-label="Danh sách nhạc Spotify">
        <button class="btn" type="button" aria-pressed={spotifyState.kind === "playlists" || spotifyState.kind === "playlist"} onclick={() => spotifyState.loadLibrary("playlists")}><ListMusic class="w-4 h-4" /> Playlist của tôi</button>
        <button class="btn" type="button" aria-pressed={spotifyState.kind === "saved"} onclick={() => spotifyState.loadLibrary("saved")}><Heart class="w-4 h-4" /> Bài đã thích</button>
      </nav>
    {/if}
    {#if signedIn}
      <div class="list-heading">
        <h3>{spotifyState.kind === "search" ? `Kết quả: ${spotifyState.searchQuery}` : spotifyState.kind === "saved" ? "Bài đã thích" : "Playlist của tôi"}</h3>
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
                  <!-- Spotify không cho app đọc bài trong playlist của người khác, nên
                       bấm vào tên là phát cả playlist thay vì mở một màn luôn rỗng. -->
                  <button class="item-name" type="button" aria-label={`Phát playlist ${item.name}`} disabled={spotifyState.busy || !spotifyState.account?.device_id} onclick={() => spotifyState.play(item.uri)}><strong title={item.name}>{item.name}</strong><span>{item.artist || "Playlist"}</span></button>
                {:else}<div class="item-name"><strong title={item.name}>{item.name}</strong><span title={item.artist}>{item.artist}</span></div><span class="duration">{time(item.duration_ms)}</span>{/if}
                <!-- Bài lẻ đi kèm cả trang đang xem làm hàng đợi; playlist tự có ngữ cảnh. -->
                <button class="btn icon-button" type="button" aria-label={`Phát ${item.name}`} disabled={spotifyState.busy || !spotifyState.account?.device_id} onclick={() => spotifyState.kind === "playlists" ? spotifyState.play(item.uri) : spotifyState.playFromList(page?.items.map((t) => t.uri) ?? [], item.uri)}><Play class="w-4 h-4" /></button>
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
</div>

<Modal open={confirmLogout} title="Ngắt tài khoản Spotify?"
  description="Xóa phiên đăng nhập Spotify đã lưu trong Keychain của rust-sound. Spotify và kết nối bass / EQ vẫn hoạt động; cần đăng nhập lại để duyệt thư viện."
  confirmText="Ngắt tài khoản" cancelText="Giữ kết nối" onClose={() => confirmLogout = false}
  onConfirm={() => { confirmLogout = false; void spotifyState.logout(); }} />

<style>
  .spotify-workspace { display: grid; grid-template-columns: minmax(0,1fr); gap: 24px; min-height: 0; flex: none; }
  .library, .eq-panel, .diagnostics { background: var(--core); border: 1px solid var(--line); border-radius: 16px; box-shadow: none; }
  .library { display: flex; flex-direction: column; gap: 16px; padding: 24px; min-width: 0; }
  .library-heading, .rack-heading, .list-heading { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .library-heading h2 { font-size: 22px; margin: 0; flex: 1; font-weight: 700; }
  .account-status { display: flex; align-items: center; gap: 6px; color: var(--success); font-size: 12px; }
  .connection-dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
  .icon-button { width: 36px; height: 36px; padding: 0; flex-shrink: 0; }
  .note { margin: 0; font-size: 11px; line-height: 1.5; color: var(--muted); overflow-wrap: anywhere; }
  .error { margin: 0; font-size: 12px; line-height: 1.5; color: var(--error); overflow-wrap: anywhere; }
  .warning { margin: 0; font-size: 12px; line-height: 1.5; color: var(--muted); overflow-wrap: anywhere; }
  .playback-auth-row { flex-wrap: wrap; border-top: none; padding-top: 8px; }
  .playback-auth-row .note { flex: 1; min-width: 220px; }
  .device-row { display: flex; align-items: center; gap: 8px; padding-top: 12px; border-top: 1px solid var(--line); font-size: 12px; color: var(--muted); }
  .device-row select { flex: 1; min-width: 0; max-width: 100%; }
  .spotify-search { display: flex; gap: 8px; }
  .spotify-search input { flex: 1; min-width: 0; }
  .spotify-search input, select { height: 40px; border: 1px solid var(--input-line); border-radius: 8px; padding: 0 10px; color: var(--ink); background: var(--paper); font-size: 12px; }
  input:focus-visible, select:focus-visible, button:focus-visible, summary:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .library-nav { display: flex; flex-wrap: wrap; gap: 8px; padding-bottom: 12px; border-bottom: 1px solid var(--line); }
  .library-nav button[aria-pressed="true"] { border-color: var(--accent); background: var(--soft); }
  .list-heading { border-bottom: 1px solid var(--line); padding-bottom: 10px; min-height: 30px; }
  .list-heading h3 { font-size: 15px; font-weight: 600; margin: 0; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .spotify-results { min-width: 0; }
  ul { list-style: none; padding: 0; margin: 0; }
  li { display: flex; gap: 12px; align-items: center; padding: 16px 8px; border-bottom: 1px solid var(--line); border-radius: 8px; }
  li:last-child { border-bottom: 0; }
  li:hover { background: var(--paper); }
  li.current-track { background: var(--soft); }
  li img, .artwork-placeholder { width: 48px; height: 48px; border-radius: 8px; flex-shrink: 0; object-fit: cover; background: var(--paper); }
  .artwork-placeholder { display: grid; place-items: center; color: var(--muted); }
  .item-name { display: grid; gap: 4px; min-width: 0; flex: 1; text-align: left; border: 0; padding: 0; color: var(--ink); background: transparent; }
  button.item-name { cursor: pointer; }
  button.item-name:hover strong { text-decoration: underline; text-underline-offset: 3px; }
  .item-name strong { font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .item-name span { font-size: 11px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .duration { font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .pagination { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-top: 8px; }
  .empty-state { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; padding: 24px 8px; }
  .signed-out { flex: 1; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 16px; padding: 32px 12px; }
  .signed-out h3 { margin: 0; font-size: 20px; }
  .signed-out p { max-width: 48ch; }
  .studio-rack, .mobile-rack { display: flex; flex-direction: column; gap: 12px; min-width: 0; min-height: 0; }
  .eq-panel { padding: 20px; }
  .rack-heading { justify-content: space-between; padding-bottom: 16px; border-bottom: 1px solid var(--line); margin-bottom: 16px; }
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

  .eq-disclosure { justify-content: flex-start; width: 100%; border-color: transparent; }
  .eq-disclosure .note { margin-left: auto; }
  .eq-disclosure :global(.disclosure-chevron) { margin-left: 0; flex-shrink: 0; }
  @media(max-width:600px) {
    .library { padding: 16px; gap: 12px; }
    .spotify-workspace { gap: 16px; }
    .account-status { font-size: 11px; flex: 1; }
    .library-heading h2 { font-size: 18px; flex-basis: 100%; }
    .device-row { flex-wrap: wrap; }
    .device-row label { flex-basis: 100%; }
    .library-nav { gap: 6px; }
    .library-nav button { font-size: 11px; padding-left: 8px; padding-right: 8px; }
    li { padding-left: 0; padding-right: 0; gap: 8px; }
    li img, .artwork-placeholder { width: 32px; height: 32px; }
    .duration { display: none; }
    .device-hint { font-size: 10px; }
    .eq-panel { padding: 12px; }
  }
</style>
