<script lang="ts">
  import { invoke, isTauri } from "@tauri-apps/api/core";
  import {
    DIRECTIONS,
    DIRECTION_LABELS,
    TRIGGERS,
    DEFAULT_PINGLOOM_SETTINGS,
    DEFAULT_CATALOG,
    duplicateSlots,
    sectorPath,
    formatAssetName,
    isEmoteId,
    createEmoteCatalogEntry,
    getPingloomAssetsManifest,
    playPingSound,
    type PingloomSettings,
    type CatalogEntry,
  } from "@/lib/pingloom";
  import { playSectorTick, playPingChime } from "@/lib/pingAudio";
  import PingVectorIcon from "@/components/radial/PingVectorIcon.svelte";
  import Modal from "@/components/ui/Modal.svelte";
  import { toastState } from "@/lib/toast.svelte";
  import {
    Target,
    Smile,
    Sliders,
    AlertTriangle,
    RotateCcw,
    Check,
    Crosshair,
    Volume2,
    VolumeX,
    Sparkles,
    Shield,
    Flame,
    Zap,
    Gamepad2,
    Search,
    GripVertical,
    Radio,
    Loader2,
  } from "@lucide/svelte";

  interface Props {
    showToast?: (type: "success" | "error" | "info", message: string) => void;
  }

  let { showToast }: Props = $props();

  const PINGLOOM_STORAGE_KEY = "rust-sound.pingloom-settings";

  function isRunningInTauri(): boolean {
    if (typeof window === "undefined") return false;
    return (
      isTauri() ||
      Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) ||
      Boolean((window as unknown as { __TAURI__?: unknown }).__TAURI__)
    );
  }

  function loadInitialSettings(): PingloomSettings {
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem(PINGLOOM_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.wheel) && parsed.wheel.length === 8) {
            return { ...DEFAULT_PINGLOOM_SETTINGS, ...parsed };
          }
        }
      } catch {}
    }
    return DEFAULT_PINGLOOM_SETTINGS;
  }

  function notify(type: "success" | "error" | "info", message: string) {
    if (showToast) {
      showToast(type, message);
    } else if (type === "success") {
      toastState.success(message);
    } else if (type === "error") {
      toastState.error(message);
    } else {
      toastState.info(message);
    }
  }

  const isDesktop = isRunningInTauri();

  let activeSubTab = $state<"pings" | "emotes" | "triggers">("pings");
  let settings = $state<PingloomSettings>(loadInitialSettings());
  let catalog = $state<CatalogEntry[]>(DEFAULT_CATALOG);
  let focusedSlice = $state<number>(0);
  let hoverSlice = $state<number | null>(null);
  let mouseAngleDeg = $state<number | null>(null);
  let isResetModalOpen = $state(false);
  let isSaving = $state(false);
  let isDesktopOverlayActive = $state(false);

  // Drag-and-Drop State
  let draggedAssetId = $state<string | null>(null);
  let dragOverSlice = $state<number | null>(null);

  // Catalog Category & Search Filter
  let catalogCategory = $state<string>("all");
  let searchQuery = $state<string>("");

  // Wheel container element reference
  let wheelContainerRef = $state<HTMLDivElement | null>(null);

  function playAudioPreview(id: string) {
    if (settings.muted) return;
    playPingSound(id).catch(() => {});
    playPingChime(id, settings.volume);
  }

  // Load from Tauri backend if available
  $effect(() => {
    if (!isDesktop) return;

    // Load settings via get_pingloom_settings with fallback to get_ping_settings
    invoke<PingloomSettings>("get_pingloom_settings")
      .catch(() => invoke<PingloomSettings>("get_ping_settings"))
      .then((s) => {
        if (s && s.wheel && s.wheel.length === 8) {
          settings = s;
          try {
            localStorage.setItem(PINGLOOM_STORAGE_KEY, JSON.stringify(s));
          } catch {}
        }
      })
      .catch(() => {});

    invoke<CatalogEntry[]>("get_ping_catalog")
      .then((cat) => {
        if (cat && cat.length > 0) catalog = cat;
      })
      .catch(() => {});

    // Populate full catalog including Pingloom manifest emotes
    getPingloomAssetsManifest()
      .then((manifest) => {
        if (manifest && Array.isArray(manifest.emotes)) {
          const currentIds = new Set(catalog.map((c) => c.id));
          const newEntries: CatalogEntry[] = [];
          for (const emoteId of manifest.emotes) {
            if (!currentIds.has(emoteId)) {
              newEntries.push(createEmoteCatalogEntry(emoteId));
              currentIds.add(emoteId);
            }
          }
          if (newEntries.length > 0) {
            catalog = [...catalog, ...newEntries];
          }
        }
      })
      .catch(() => {});

    invoke<boolean>("is_ping_overlay_open")
      .then((isOpen) => {
        isDesktopOverlayActive = isOpen;
      })
      .catch(() => {});
  });

  // Persist settings helper
  function updateSettings(next: PingloomSettings) {
    settings = next;
    try {
      localStorage.setItem(PINGLOOM_STORAGE_KEY, JSON.stringify(next));
    } catch {}
    if (isDesktop) {
      invoke("save_pingloom_settings", { settings: next })
        .catch(() => invoke("save_ping_settings", { settings: next }))
        .catch(() => {});
    }
  }

  const activeWheel = $derived(activeSubTab === "emotes" ? settings.emote_wheel : settings.wheel);
  const duplicates = $derived(duplicateSlots(activeWheel));

  // Filter catalog items by category and search
  const filteredCatalog = $derived(
    catalog.filter((item) => {
      const matchesCategory =
        catalogCategory === "all" ||
        item.category === catalogCategory ||
        (catalogCategory === "tactical" && (item.category === "ping" || item.category === "tactical")) ||
        (catalogCategory === "emotes" && (item.category === "emote" || item.category === "emotes"));

      const query = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !query ||
        item.name.toLowerCase().includes(query) ||
        item.id.toLowerCase().includes(query);

      return matchesCategory && matchesSearch;
    })
  );

  // Test-fire a slice directly from workspace editor
  function handleTestFire(sliceIndex: number) {
    const isEmote = activeSubTab === "emotes";
    const targetWheel = isEmote ? settings.emote_wheel : settings.wheel;
    const pingId = targetWheel[sliceIndex] ?? (isEmote ? "gg_heart" : "danger");
    const entry = catalog.find((c) => c.id === pingId);
    const name = entry?.name ?? formatAssetName(pingId);

    playAudioPreview(pingId);
    notify("success", `[${DIRECTIONS[sliceIndex]}] ${name} ${isEmote ? "emote" : "ping"} test-fired!`);
  }

  // Assign asset to a specific slice
  function handleAssignAssetToSlice(sliceIndex: number, assetId: string) {
    const isEmote = activeSubTab === "emotes";
    const targetWheel = isEmote ? [...settings.emote_wheel] : [...settings.wheel];
    targetWheel[sliceIndex] = assetId;

    const next: PingloomSettings = isEmote
      ? { ...settings, emote_wheel: targetWheel }
      : { ...settings, wheel: targetWheel };

    updateSettings(next);

    const asset = catalog.find((c) => c.id === assetId);
    playAudioPreview(assetId);
    notify(
      "success",
      `Gán ${asset?.name ?? assetId} vào hướng ${DIRECTION_LABELS[DIRECTIONS[sliceIndex]]} (${DIRECTIONS[sliceIndex]})`
    );
  }

  // Assign asset to currently focused slice
  function handleAssignAsset(assetId: string) {
    handleAssignAssetToSlice(focusedSlice, assetId);
  }

  // Toggle Desktop Transparent Ping Overlay
  async function handleTogglePingOverlay() {
    if (!isDesktop) return;
    try {
      const next = !isDesktopOverlayActive;
      const res = await invoke<boolean>("toggle_ping_overlay", { enable: next });
      isDesktopOverlayActive = res;
      notify(
        "success",
        res ? "Đã kích hoạt Desktop Ping Overlay ngoài màn hình!" : "Đã đóng Desktop Ping Overlay"
      );
    } catch (err) {
      notify("error", `Lỗi overlay: ${String(err)}`);
    }
  }

  // 1-Click "Apply LoL Smart Ping Preset"
  function handleApplyLoLPreset() {
    const lolSettings: PingloomSettings = {
      ...settings,
      trigger: "alt",
      emote_trigger: "ctrl",
      drag_threshold_px: 65,
      click_ping: true,
      click_ping_id: "danger",
      wheel: [
        "danger",      // North (Up)
        "push",        // North-East
        "omw",         // East (Right)
        "allin",       // South-East
        "assist",      // South (Down)
        "needvision",  // South-West
        "missing",     // West (Left)
        "enemyvision", // North-West
      ],
      ping_size_px: 52,
      ping_duration_s: 3.0,
      tick_sound: true,
      volume: 80,
    };

    updateSettings(lolSettings);
    if (!settings.muted) {
      playPingChime("omw", 80);
    }
    notify("success", "Đã áp dụng LoL Preset! Giữ Alt + chuột trái, kéo chọn hướng rồi thả chuột để ping.");
  }

  // Save Settings explicitly
  async function handleSaveSettings() {
    isSaving = true;
    try {
      localStorage.setItem(PINGLOOM_STORAGE_KEY, JSON.stringify(settings));
      if (isDesktop) {
        let saved: PingloomSettings | null = null;
        try {
          saved = await invoke<PingloomSettings>("save_pingloom_settings", { settings });
        } catch {
          saved = await invoke<PingloomSettings>("save_ping_settings", { settings });
        }
        if (saved && saved.wheel) {
          settings = saved;
        }
      }
      notify("success", "Cấu hình pings đã được lưu thành công!");
    } catch (e) {
      notify("error", `Lỗi khi lưu cấu hình: ${String(e)}`);
    } finally {
      isSaving = false;
    }
  }

  // Factory Reset
  function handleConfirmReset() {
    updateSettings({ ...DEFAULT_PINGLOOM_SETTINGS });
    isResetModalOpen = false;
    notify("info", "Đã khôi phục cài đặt vòng tròn ping mặc định");
  }

  // Keyboard navigation across slices
  function handleWheelKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      focusedSlice = (focusedSlice + 1) % 8;
      if (settings.tick_sound) playSectorTick(settings.volume);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      focusedSlice = (focusedSlice + 7) % 8;
      if (settings.tick_sound) playSectorTick(settings.volume);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const pingId = activeWheel[focusedSlice];
      if (!settings.muted) playPingChime(pingId, settings.volume);
      notify("success", `Kích hoạt ${DIRECTIONS[focusedSlice]}: ${formatAssetName(pingId)}`);
    }
  }

  // Real-time mouse tracking and angle calculation over preview wheel
  function handleWheelPointerMove(e: PointerEvent) {
    if (!wheelContainerRef) return;
    const rect = wheelContainerRef.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const scaleX = 280 / rect.width;
    const scaleY = 280 / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    const dx = x - 140;
    const dy = y - 140;
    const dist = Math.hypot(dx, dy);

    if (dist > 138) {
      hoverSlice = null;
      mouseAngleDeg = null;
      return;
    }

    const rawAngle = Math.atan2(dy, dx) * (180 / Math.PI);
    const clockwiseDeg = (rawAngle + 90 + 360) % 360;
    mouseAngleDeg = Math.round(clockwiseDeg);

    if (dist >= 50) {
      const slice = Math.floor(((clockwiseDeg + 22.5) % 360) / 45) % 8;
      if (hoverSlice !== slice) {
        hoverSlice = slice;
        if (settings.tick_sound) {
          playSectorTick(settings.volume);
        }
      }
    } else {
      hoverSlice = null;
    }
  }

  function handleWheelPointerLeave() {
    hoverSlice = null;
    mouseAngleDeg = null;
  }
</script>

<div class="w-full max-w-full flex flex-col space-y-4 select-none min-h-0 flex-1 relative overflow-x-hidden">
  <!-- 1. Header Toolbar -->
  <div class="flex items-center justify-between flex-wrap gap-2.5 pb-2 border-b border-(--line) min-w-0">
    <div class="flex items-center gap-2 flex-wrap min-w-0 flex-1">
      <div class="flex items-center gap-1 p-0.5 bg-(--surface) border border-(--line) rounded-lg shrink-0">
        <button
          type="button"
          onclick={() => {
            activeSubTab = "pings";
            focusedSlice = 0;
          }}
          class="px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer flex items-center gap-1.5 {activeSubTab === 'pings' ? 'bg-(--paper) text-(--ink) shadow-xs border border-(--line) font-bold' : 'text-(--muted) hover:text-(--ink)'}"
        >
          <Target class="w-3.5 h-3.5 text-(--accent)" />
          <span>Tactical Pings</span>
        </button>

        <button
          type="button"
          onclick={() => {
            activeSubTab = "emotes";
            focusedSlice = 0;
          }}
          class="px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer flex items-center gap-1.5 {activeSubTab === 'emotes' ? 'bg-(--paper) text-(--ink) shadow-xs border border-(--line) font-bold' : 'text-(--muted) hover:text-(--ink)'}"
        >
          <Smile class="w-3.5 h-3.5 text-(--warning)" />
          <span>Tactical Emotes</span>
        </button>

        <button
          type="button"
          onclick={() => {
            activeSubTab = "triggers";
          }}
          class="px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer flex items-center gap-1.5 {activeSubTab === 'triggers' ? 'bg-(--paper) text-(--ink) shadow-xs border border-(--line) font-bold' : 'text-(--muted) hover:text-(--ink)'}"
        >
          <Sliders class="w-3.5 h-3.5 text-(--accent)" />
          <span>Triggers & Shortcuts</span>
        </button>
      </div>

      <button
        type="button"
        onclick={handleApplyLoLPreset}
        class="btn h-8 px-2.5 text-xs flex items-center gap-1.5 border border-(--line) hover:border-(--focus) shrink-0"
        title="Configure League of Legends smart ping defaults"
      >
        <Gamepad2 class="w-3.5 h-3.5 text-(--success)" />
        <span>Apply LoL Preset</span>
      </button>

      <span class="text-[11px] font-mono px-2.5 py-1 rounded-md bg-(--surface) text-(--muted) border border-(--line) truncate max-w-xs xl:max-w-none">
        Hold [{settings.trigger.toUpperCase()}] for Tactical Pings, [{settings.emote_trigger ? settings.emote_trigger.toUpperCase() : "CTRL"}] for Emotes
      </span>
    </div>

    <div class="flex items-center gap-2 shrink-0">
      <button
        type="button"
        onclick={() => (isResetModalOpen = true)}
        class="btn h-8 px-3 text-xs flex items-center gap-1.5 border border-(--line) hover:border-(--focus)"
        title="Reset wheel to defaults"
      >
        <RotateCcw class="w-3.5 h-3.5 text-(--muted)" />
        <span>Reset</span>
      </button>

      <button
        type="button"
        onclick={handleSaveSettings}
        disabled={isSaving}
        class="btn btn-primary h-8 px-3.5 text-xs flex items-center gap-1.5 shrink-0"
      >
        {#if isSaving}
          <Loader2 class="w-3.5 h-3.5 animate-spin text-(--accent-ink)" />
          <span>Saving…</span>
        {:else}
          <Check class="w-3.5 h-3.5 text-(--accent-ink)" />
          <span>Save Wheel</span>
        {/if}
      </button>
    </div>
  </div>

  <!-- 2. Main Workspace Layout -->
  {#if activeSubTab !== "triggers"}
    <div class="grid grid-cols-1 xl:grid-cols-12 gap-4 sm:gap-5 flex-1 min-h-0 max-w-full">
      <!-- Left Column: Direct Interactive Radial Wheel & Drop Zone (5 cols) -->
      <div class="xl:col-span-5 flex flex-col items-center justify-between gap-4 p-4 sm:p-5 panel min-w-0 max-w-full">
        <div class="w-full flex items-center justify-between pb-2 border-b border-(--line)">
          <span class="text-xs font-bold text-(--ink) flex items-center gap-1.5">
            <Crosshair class="w-3.5 h-3.5 text-(--accent)" />
            <span>Radial Wheel (Interactive Cockpit)</span>
          </span>
          <span class="text-[10px] text-(--muted) font-mono">
            {#if mouseAngleDeg !== null}
              Angle: {mouseAngleDeg}° · Sector: {DIRECTIONS[hoverSlice ?? focusedSlice]} ({DIRECTION_LABELS[DIRECTIONS[hoverSlice ?? focusedSlice]]})
            {:else}
              Slice: {DIRECTIONS[focusedSlice]} ({DIRECTION_LABELS[DIRECTIONS[focusedSlice]]})
            {/if}
          </span>
        </div>

        <!-- Direct Interactive Wheel Canvas -->
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div
          bind:this={wheelContainerRef}
          role="region"
          aria-label="Interactive Radial Ping Wheel"
          tabindex="0"
          onkeydown={handleWheelKeyDown}
          onpointermove={handleWheelPointerMove}
          onpointerleave={handleWheelPointerLeave}
          class="relative w-[280px] h-[280px] shrink-0 aspect-square my-auto select-none outline-none focus:ring-2 focus:ring-(--accent)/40 rounded-full cursor-crosshair"
          title="Kéo thả icon trực tiếp vào các múi hoặc click để chọn."
        >
          <svg class="w-full h-full block" viewBox="0 0 280 280">
            <defs>
              <linearGradient id="wheelSurfaceGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="var(--paper)" />
                <stop offset="100%" stop-color="var(--surface)" />
              </linearGradient>
            </defs>

            <!-- Slices 0 to 7 (Drop Targets & Hover Highlights) -->
            {#each DIRECTIONS as dir, idx (dir)}
              {@const aStart = ((idx * 45 - 22.5) * Math.PI) / 180}
              {@const aEnd = (((idx + 1) * 45 - 22.5) * Math.PI) / 180}
              {@const pathD = sectorPath(140, 140, 52, 136, aStart, aEnd)}
              {@const isFocused = focusedSlice === idx}
              {@const isHovered = hoverSlice === idx}
              {@const isDup = duplicates.has(idx)}
              {@const isDropTarget = dragOverSlice === idx}

              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <path
                d={pathD}
                fill={
                  isDropTarget
                    ? "color-mix(in srgb, var(--accent) 55%, var(--paper))"
                    : isHovered
                    ? "color-mix(in srgb, var(--accent) 42%, var(--paper))"
                    : isFocused
                    ? "color-mix(in srgb, var(--accent) 26%, var(--paper))"
                    : isDup
                    ? "color-mix(in srgb, var(--warning-bg) 60%, var(--paper))"
                    : "var(--paper)"
                }
                stroke={
                  isDropTarget || isHovered || isFocused
                    ? "var(--accent)"
                    : isDup
                    ? "var(--warning)"
                    : "var(--line)"
                }
                stroke-width={isDropTarget || isHovered ? "3" : isFocused ? "2" : "1"}
                class="transition-all duration-100 cursor-pointer"
                onclick={() => {
                  focusedSlice = idx;
                  if (settings.tick_sound) playSectorTick(settings.volume);
                }}
                ondblclick={() => {
                  handleTestFire(idx);
                }}
                ondragover={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
                  if (dragOverSlice !== idx) dragOverSlice = idx;
                }}
                ondragleave={() => {
                  if (dragOverSlice === idx) dragOverSlice = null;
                }}
                ondrop={(e) => {
                  e.preventDefault();
                  const pingId = e.dataTransfer?.getData("application/ping-id") || draggedAssetId;
                  if (pingId) {
                    handleAssignAssetToSlice(idx, pingId);
                  }
                  dragOverSlice = null;
                  draggedAssetId = null;
                }}
              />
            {/each}

            <!-- Real-time angle guide ray -->
            {#if mouseAngleDeg !== null && hoverSlice !== null}
              {@const rad = ((mouseAngleDeg - 90) * Math.PI) / 180}
              <line
                x1="140"
                y1="140"
                x2={140 + 134 * Math.cos(rad)}
                y2={140 + 134 * Math.sin(rad)}
                stroke="var(--accent)"
                stroke-width="1.5"
                stroke-dasharray="3 3"
                opacity="0.6"
                pointer-events="none"
              />
            {/if}

            <!-- Outer & Inner Ring Boundaries -->
            <circle cx="140" cy="140" r="136" fill="none" stroke="var(--line)" stroke-width="1" />
            <circle cx="140" cy="140" r="52" fill="none" stroke="var(--line)" stroke-width="1" />
          </svg>

          <!-- Center Hub Badge (Click to fire currently focused or hovered ping) -->
          <button
            type="button"
            onclick={() => {
              handleTestFire(hoverSlice ?? focusedSlice);
            }}
            class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full flex flex-col items-center justify-center p-2 text-center border bg-(--paper) text-(--ink) border-(--line) shadow-xs transition-all duration-120 cursor-pointer hover:scale-105 active:scale-95 group z-20 {dragOverSlice !== null ? 'border-(--accent) ring-2 ring-(--accent)/50' : ''}"
            title="Nhấp vào đây để bắn thử ping hướng đang chọn!"
          >
            {#if dragOverSlice !== null}
              <Target class="w-5 h-5 text-(--accent) mb-0.5 animate-bounce" />
              <span class="text-[9px] font-black uppercase tracking-wider text-(--accent)">
                THẢ VÀO {DIRECTIONS[dragOverSlice]}
              </span>
            {:else if activeSubTab === "emotes" || isEmoteId(activeWheel[hoverSlice ?? focusedSlice])}
              <img
                src="/pingloom/emotes/{activeWheel[hoverSlice ?? focusedSlice]}.webp"
                alt="Emote Preview"
                class="w-9 h-9 object-contain drop-shadow-sm mb-0.5 group-hover:scale-110 transition-transform"
                onerror={(e) => {
                  const img = e.currentTarget as HTMLImageElement;
                  if (img.src.endsWith('.webp')) img.src = `/pingloom/emotes/${activeWheel[hoverSlice ?? focusedSlice]}.png`;
                }}
              />
              <span class="text-[9px] font-black group-hover:text-(--accent) transition-colors truncate max-w-20">
                {catalog.find((c) => c.id === activeWheel[hoverSlice ?? focusedSlice])?.name ?? formatAssetName(activeWheel[hoverSlice ?? focusedSlice])}
              </span>
            {:else}
              <Radio class="w-4 h-4 text-(--accent) mb-0.5 group-hover:animate-pulse" />
              <span class="text-[10px] font-black group-hover:text-(--accent) transition-colors">
                BẮN THỬ PING
              </span>
              <span class="text-[8px] text-(--muted)">
                {DIRECTIONS[hoverSlice ?? focusedSlice]} ({settings.drag_threshold_px}px)
              </span>
            {/if}
          </button>

          <!-- Directional Perimeter Labels (Percentage-anchored to concentric circle) -->
          {#each DIRECTIONS as dir, idx (dir)}
            {@const angle = (idx * 45 * Math.PI) / 180}
            {@const rPercent = (94 / 280) * 100}
            {@const leftPercent = 50 + rPercent * Math.sin(angle)}
            {@const topPercent = 50 - rPercent * Math.cos(angle)}
            {@const isFocused = focusedSlice === idx}
            {@const isHovered = hoverSlice === idx}
            {@const isDup = duplicates.has(idx)}
            {@const isDropTarget = dragOverSlice === idx}
            {@const assignedId = activeWheel[idx]}
            {@const asset = catalog.find((c) => c.id === assignedId)}

            <button
              type="button"
              onclick={() => {
                focusedSlice = idx;
                if (settings.tick_sound) playSectorTick(settings.volume);
                playAudioPreview(assignedId);
              }}
              style="left: {leftPercent}%; top: {topPercent}%;"
              class="absolute -translate-x-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex flex-col items-center justify-center transition-transform p-0.5 cursor-pointer z-10 {isDropTarget ? 'scale-125 shadow-xl ring-2 ring-(--accent) bg-(--accent) text-(--accent-ink)' : isHovered ? 'scale-120 shadow-md ring-2 ring-(--accent) bg-(--paper) text-(--ink)' : isFocused ? 'scale-115 shadow-sm ring-2 ring-(--accent) bg-(--paper) text-(--ink)' : 'bg-(--surface) border border-(--line) hover:scale-105'}"
            >
              <span
                class="text-[9px] font-black leading-none"
                style="color: {isDropTarget ? 'var(--accent-ink)' : asset?.color ?? 'var(--ink)'};"
              >
                {dir}
              </span>
              {#if activeSubTab === "emotes" || isEmoteId(assignedId)}
                <img
                  src="/pingloom/emotes/{assignedId}.webp"
                  alt={assignedId}
                  class="w-4 h-4 mt-0.5 object-contain"
                  onerror={(e) => {
                    const img = e.currentTarget as HTMLImageElement;
                    if (img.src.endsWith('.webp')) img.src = `/pingloom/emotes/${assignedId}.png`;
                  }}
                />
              {:else}
                <PingVectorIcon
                  pingId={assignedId}
                  iconKey={asset?.vectorIcon}
                  class="w-4 h-4 mt-0.5"
                  style="color: {isDropTarget ? 'var(--accent-ink)' : asset?.color};"
                />
              {/if}
              {#if isDup && !isDropTarget}
                <span class="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-(--warning) text-(--accent-ink) text-[8px] flex items-center justify-center font-bold">
                  !
                </span>
              {/if}
            </button>
          {/each}
        </div>

        <!-- Direct Test Fire Action Bar -->
        <div class="w-full flex items-center justify-between gap-2 p-2 rounded-xl bg-(--paper) border border-(--line) min-w-0">
          <div class="flex items-center gap-1.5 min-w-0 flex-1">
            <PingVectorIcon
              pingId={activeWheel[focusedSlice]}
              class="w-4 h-4 text-(--accent) shrink-0"
            />
            <span class="text-xs font-bold text-(--ink) truncate">
              {DIRECTIONS[focusedSlice]}: {catalog.find((c) => c.id === activeWheel[focusedSlice])?.name ?? "Ping"}
            </span>
          </div>
          <button
            type="button"
            onclick={() => {
              handleTestFire(focusedSlice);
            }}
            class="btn btn-primary h-7.5 px-3 text-xs font-bold shrink-0 flex items-center gap-1.5"
          >
            <Radio class="w-3.5 h-3.5 animate-pulse text-(--accent-ink)" />
            <span>Bắn Thử</span>
          </button>
        </div>

        <!-- Drag & Drop Hint Banner -->
        <div class="w-full p-2.5 rounded-xl border border-(--line) bg-(--paper) text-xs text-(--muted) flex items-center justify-between gap-2 min-w-0">
          <span class="flex items-center gap-1.5 font-medium truncate min-w-0">
            <GripVertical class="w-3.5 h-3.5 text-(--accent) shrink-0" />
            <span class="truncate">Kéo thả icon từ danh mục vào múi wheel.</span>
          </span>
          <span class="font-mono text-[10px] text-(--accent) font-semibold shrink-0">Drop Ready</span>
        </div>
      </div>

      <!-- Right Column: Directional Slot Editor & Expanded Draggable Catalog (7 cols) -->
      <div class="xl:col-span-7 flex flex-col gap-3.5 min-h-0 min-w-0 max-w-full">
        <!-- Slot Editor Section -->
        <div class="panel p-4 flex flex-col gap-2.5 min-w-0">
          <div class="flex items-center justify-between pb-2 border-b border-(--line) min-w-0 gap-2 flex-wrap">
            <div class="flex items-center gap-2 min-w-0">
              <Sparkles class="w-4 h-4 text-(--accent) shrink-0" />
              <span class="text-xs font-bold text-(--ink) truncate">8 Vị Trí Xuyên Tâm (Kéo thả vào từng ô)</span>
            </div>
            <span class="text-[11px] text-(--muted) truncate">
              Nhấp để chọn múi hoặc kéo thả icon trực tiếp từ danh mục bên dưới
            </span>
          </div>

          <!-- 8 Directions Drop Zone Cards -->
          <div class="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-2 pt-1 min-w-0">
            {#each DIRECTIONS as dir, idx (dir)}
              {@const assignedId = activeWheel[idx]}
              {@const asset = catalog.find((c) => c.id === assignedId)}
              {@const isFocused = focusedSlice === idx}
              {@const isHovered = hoverSlice === idx}
              {@const isDup = duplicates.has(idx)}
              {@const isDropTarget = dragOverSlice === idx}

              <button
                type="button"
                onclick={() => {
                  focusedSlice = idx;
                  if (settings.tick_sound) playSectorTick(settings.volume);
                }}
                ondragover={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
                  if (dragOverSlice !== idx) dragOverSlice = idx;
                }}
                ondragleave={() => {
                  if (dragOverSlice === idx) dragOverSlice = null;
                }}
                ondrop={(e) => {
                  e.preventDefault();
                  const pingId = e.dataTransfer?.getData("application/ping-id") || draggedAssetId;
                  if (pingId) {
                    handleAssignAssetToSlice(idx, pingId);
                  }
                  dragOverSlice = null;
                  draggedAssetId = null;
                }}
                class="p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between min-h-16 min-w-0 {isDropTarget ? 'border-(--accent) bg-(--paper) shadow-lg ring-2 ring-(--accent) scale-102' : isHovered ? 'border-(--accent) bg-(--paper) shadow-xs ring-1 ring-(--accent)' : isFocused ? 'border-(--accent) bg-(--paper) shadow-xs ring-1 ring-(--accent)' : 'border-(--line) bg-(--surface) hover:border-(--focus)'}"
              >
                <div class="flex items-center justify-between mb-1 gap-1 min-w-0">
                  <span class="text-[10px] font-bold text-(--muted) uppercase truncate">
                    {dir} · {DIRECTION_LABELS[dir]}
                  </span>
                  {#if isDup}
                    <span class="text-[9px] px-1 py-0.2 rounded bg-(--warning-bg) text-(--warning) font-bold shrink-0">
                      TRÙNG
                    </span>
                  {/if}
                </div>
                <div class="flex items-center gap-1.5 min-w-0">
                  <div
                    class="w-5 h-5 rounded-md flex items-center justify-center shrink-0 border border-(--shell-line)"
                    style="background-color: color-mix(in srgb, {asset?.color ?? 'var(--accent)'} 15%, transparent);"
                  >
                    {#if activeSubTab === "emotes" || isEmoteId(assignedId)}
                      <img
                        src="/pingloom/emotes/{assignedId}.webp"
                        alt={assignedId}
                        class="w-4 h-4 object-contain"
                        onerror={(e) => {
                          const img = e.currentTarget as HTMLImageElement;
                          if (img.src.endsWith('.webp')) img.src = `/pingloom/emotes/${assignedId}.png`;
                        }}
                      />
                    {:else}
                      <PingVectorIcon
                        pingId={assignedId}
                        iconKey={asset?.vectorIcon}
                        class="w-3 h-3"
                        style="color: {asset?.color ?? 'var(--accent)'};"
                      />
                    {/if}
                  </div>
                  <span class="text-xs font-semibold text-(--ink) truncate min-w-0 flex-1">
                    {asset?.name ?? assignedId}
                  </span>
                </div>
              </button>
            {/each}
          </div>
        </div>

        <!-- Expanded Draggable Icon Catalog Grid -->
        <div class="panel p-4 flex flex-col min-h-0 flex-1 min-w-0">
          <div class="flex items-center justify-between w-full flex-wrap gap-2 pb-2 border-b border-(--line) min-w-0">
            <div class="flex items-center gap-2 min-w-0">
              <Sparkles class="w-4 h-4 text-(--warning) shrink-0" />
              <span class="text-xs font-bold text-(--ink) truncate">
                Thư Viện Icon Pings & Emotes ({filteredCatalog.length} icons)
              </span>
            </div>
            <span class="text-[11px] font-normal text-(--muted) truncate">
              Kéo thả sang múi hoặc click để gán vào {DIRECTIONS[focusedSlice]}
            </span>
          </div>

          <!-- Category Filter Pills & Search Bar -->
          <div class="flex items-center justify-between gap-2 my-2.5 flex-wrap min-w-0">
            <div class="flex items-center gap-1 p-0.5 bg-(--paper) border border-(--line) rounded-lg flex-wrap shrink-0">
              <button
                type="button"
                onclick={() => { catalogCategory = "all"; }}
                class="px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer flex items-center gap-1 {catalogCategory === 'all' ? 'bg-(--surface) text-(--ink) font-bold shadow-xs border border-(--line)' : 'text-(--muted) hover:text-(--ink)'}"
              >
                <Sparkles class="w-3 h-3" />
                <span>Tất cả</span>
              </button>

              <button
                type="button"
                onclick={() => { catalogCategory = "tactical"; }}
                class="px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer flex items-center gap-1 {catalogCategory === 'tactical' ? 'bg-(--surface) text-(--ink) font-bold shadow-xs border border-(--line)' : 'text-(--muted) hover:text-(--ink)'}"
              >
                <Target class="w-3 h-3 text-(--accent)" />
                <span>Tactical LoL</span>
              </button>

              <button
                type="button"
                onclick={() => { catalogCategory = "objectives"; }}
                class="px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer flex items-center gap-1 {catalogCategory === 'objectives' ? 'bg-(--surface) text-(--ink) font-bold shadow-xs border border-(--line)' : 'text-(--muted) hover:text-(--ink)'}"
              >
                <Flame class="w-3 h-3 text-(--warning)" />
                <span>Mục Tiêu Map</span>
              </button>

              <button
                type="button"
                onclick={() => { catalogCategory = "emotes"; }}
                class="px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer flex items-center gap-1 {catalogCategory === 'emotes' ? 'bg-(--surface) text-(--ink) font-bold shadow-xs border border-(--line)' : 'text-(--muted) hover:text-(--ink)'}"
              >
                <Smile class="w-3 h-3 text-(--warning)" />
                <span>Emotes & Sticker</span>
              </button>

              <button
                type="button"
                onclick={() => { catalogCategory = "audio"; }}
                class="px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer flex items-center gap-1 {catalogCategory === 'audio' ? 'bg-(--surface) text-(--ink) font-bold shadow-xs border border-(--line)' : 'text-(--muted) hover:text-(--ink)'}"
              >
                <Radio class="w-3 h-3 text-(--accent)" />
                <span>Studio Audio</span>
              </button>
            </div>

            <!-- Search Input -->
            <div class="relative flex-1 min-w-32 max-w-50">
              <Search class="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-(--muted)" />
              <input
                type="text"
                bind:value={searchQuery}
                placeholder="Tìm icon pings…"
                class="w-full h-7 pl-8 pr-2.5 text-xs rounded-lg bg-(--paper) text-(--ink) border border-(--input-line) focus:border-(--focus) outline-none"
              />
            </div>
          </div>

          <!-- Draggable Icon Grid -->
          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-2 overflow-y-auto max-h-70 pr-1 pt-1 min-w-0">
            {#each filteredCatalog as item (item.id)}
              {@const isAssigned = activeWheel[focusedSlice] === item.id}
              {@const isUsedElsewhere = activeWheel.includes(item.id)}

              <div
                role="button"
                tabindex="0"
                draggable={true}
                ondragstart={(e) => {
                  e.dataTransfer?.setData("application/ping-id", item.id);
                  e.dataTransfer?.setData("text/plain", item.id);
                  if (e.dataTransfer) e.dataTransfer.effectAllowed = "copy";
                  draggedAssetId = item.id;
                }}
                ondragend={() => {
                  draggedAssetId = null;
                  dragOverSlice = null;
                }}
                onclick={() => {
                  handleAssignAsset(item.id);
                  playAudioPreview(item.id);
                }}
                onkeydown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleAssignAsset(item.id);
                    playAudioPreview(item.id);
                  }
                }}
                class="relative flex items-center gap-2 p-2 rounded-xl border transition-all cursor-grab active:cursor-grabbing select-none group min-w-0 overflow-hidden {isAssigned ? 'bg-(--paper) border-(--accent) ring-2 ring-(--accent)/40 shadow-xs' : 'bg-(--surface) border-(--line) hover:border-(--focus) hover:bg-(--paper)'}"
                title="Kéo thả hoặc click để gán: {item.name}"
              >
                <!-- Drag Handle Icon -->
                <GripVertical class="w-3 h-3 text-(--muted) opacity-40 group-hover:opacity-100 shrink-0" />

                <!-- Vector Icon or Animated WebP Emblem -->
                <div
                  class="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border border-(--shell-line) shadow-xs"
                  style="background-color: color-mix(in srgb, {item.color} 18%, transparent);"
                >
                  {#if item.category === "emotes" || item.category === "emote" || isEmoteId(item.id)}
                    <img
                      src="/pingloom/emotes/{item.id}.webp"
                      alt={item.name}
                      class="w-5 h-5 object-contain"
                      onerror={(e) => {
                        const img = e.currentTarget as HTMLImageElement;
                        if (img.src.endsWith('.webp')) img.src = `/pingloom/emotes/${item.id}.png`;
                      }}
                    />
                  {:else}
                    <PingVectorIcon
                      pingId={item.id}
                      iconKey={item.vectorIcon}
                      class="w-3.5 h-3.5"
                      style="color: {item.color};"
                    />
                  {/if}
                </div>

                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-1">
                    <span
                      class="w-1.5 h-1.5 rounded-full shrink-0"
                      style="background-color: {item.color};"
                    ></span>
                    <span class="text-xs font-semibold text-(--ink) leading-tight truncate">
                      {item.name}
                    </span>
                  </div>
                  <span class="text-[9px] text-(--muted) block capitalize truncate">
                    {item.category}
                  </span>
                </div>

                {#if isAssigned}
                  <span class="text-[8px] font-bold text-(--accent) uppercase px-1 py-0.5 rounded bg-(--accent)/15 shrink-0">
                    Slot
                  </span>
                {:else if isUsedElsewhere}
                  <span class="text-[8px] text-(--muted) shrink-0">
                    Đã dùng
                  </span>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      </div>
    </div>
  {:else}
    <!-- TAB 3: TRIGGERS & SHORTCUTS CONFIGURATION -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-5 flex-1 overflow-y-auto">
      <!-- Card 1: Keybinds & Hold Trigger -->
      <div class="panel p-5 space-y-4">
        <div class="pb-2 border-b border-(--line)">
          <div class="flex items-center gap-2">
            <Sliders class="w-4 h-4 text-(--accent)" />
            <h3 class="text-sm font-bold text-(--ink) m-0">LoL Hotkey & Activation Trigger</h3>
          </div>
          <p class="text-xs text-(--muted) mt-1 m-0">
            Giữ phím kích hoạt + chuột trái, kéo chọn hướng rồi thả chuột trái để ping. Thả phím trước để hủy.
          </p>
        </div>

        <div class="space-y-4 pt-1">
          <div class="flex flex-col gap-1.5">
            <label for="ping-trigger-select" class="text-xs font-semibold text-(--ink)">
              Primary Ping Trigger Key
            </label>
            <select
              id="ping-trigger-select"
              bind:value={settings.trigger}
              onchange={() => updateSettings(settings)}
              class="h-9 px-3 rounded-lg bg-(--paper) text-(--ink) border border-(--input-line) focus:border-(--focus) text-xs cursor-pointer outline-none"
            >
              {#each TRIGGERS as t (t.value)}
                <option value={t.value}>
                  {t.label}
                </option>
              {/each}
            </select>
          </div>

          <div class="flex flex-col gap-1.5">
            <label for="emote-trigger-select" class="text-xs font-semibold text-(--ink)">
              Emote Wheel Trigger
            </label>
            <select
              id="emote-trigger-select"
              value={settings.emote_trigger ?? "none"}
              onchange={(e) => {
                const val = (e.target as HTMLSelectElement).value;
                updateSettings({
                  ...settings,
                  emote_trigger: val === "none" ? null : val,
                });
              }}
              class="h-9 px-3 rounded-lg bg-(--paper) text-(--ink) border border-(--input-line) focus:border-(--focus) text-xs cursor-pointer outline-none"
            >
              <option value="none">Disabled / None</option>
              {#each TRIGGERS as t (t.value)}
                <option value={t.value}>
                  {t.label}
                </option>
              {/each}
            </select>
          </div>

          <div class="pt-2 border-t border-(--line)">
            <div class="flex items-center justify-between text-xs">
              <span class="font-semibold text-(--ink) flex items-center gap-1.5">
                <Zap class="w-3.5 h-3.5 text-(--accent)" />
                <span>Quick ping bằng nút chuột bên</span>
              </span>
              <input
                type="checkbox"
                bind:checked={settings.click_ping}
                disabled={!["mouse4", "mouse5"].includes(settings.trigger)}
                aria-label="Quick ping bằng nút chuột bên"
                onchange={() => updateSettings(settings)}
                class="w-4 h-4 rounded cursor-pointer accent-(--accent)"
              />
            </div>
            <p class="text-[11px] text-(--muted) mt-1">
              Chỉ áp dụng cho Mouse4 / Mouse5. Phím bàn phím luôn cần giữ chuột trái và kéo; click không kéo sẽ không ping.
            </p>
          </div>

          <div class="pt-2 border-t border-(--line)">
            <div class="flex items-center justify-between text-xs gap-3">
              <div>
                <span class="font-semibold text-(--ink) flex items-center gap-1.5">
                  <Shield class="w-3.5 h-3.5 text-(--accent)" />
                  <span>Desktop Transparent Ping Overlay</span>
                </span>
                <span class="text-[11px] text-(--muted) block mt-0.5">
                  Bật overlay để giữ Alt / Ctrl + chuột trái, kéo rồi thả chuột để ping ngoài desktop và trong ứng dụng khác.
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-label="Toggle Desktop Transparent Ping Overlay"
                aria-checked={isDesktopOverlayActive}
                onclick={handleTogglePingOverlay}
                class="w-10 h-5.5 rounded-full transition-colors relative cursor-pointer shrink-0 border border-transparent {isDesktopOverlayActive ? 'bg-(--accent)' : 'bg-(--input-line)'}"
              >
                <span
                  class="w-4 h-4 rounded-full bg-(--paper) absolute top-0.5 transition-transform shadow-xs {isDesktopOverlayActive ? 'left-5' : 'left-0.5'}"
                ></span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Card 2: Geometry & Audio Feedback -->
      <div class="panel p-5 space-y-4">
        <div class="pb-2 border-b border-(--line)">
          <div class="flex items-center gap-2">
            <Crosshair class="w-4 h-4 text-(--accent)" />
            <h3 class="text-sm font-bold text-(--ink) m-0">LoL Gesture Geometry & Chime Audio</h3>
          </div>
          <p class="text-xs text-(--muted) mt-1 m-0">
            Fine tune dead zone threshold, animation duration, and acoustic volume.
          </p>
        </div>

        <div class="space-y-4 pt-1">
          <div class="flex flex-col gap-1.5">
            <div class="flex justify-between items-center text-xs">
              <label for="drag-threshold-slider" class="font-semibold text-(--ink)">
                Dead Zone Drag Threshold
              </label>
              <span class="font-mono text-(--muted)">{settings.drag_threshold_px} px</span>
            </div>
            <input
              id="drag-threshold-slider"
              type="range"
              class="volume-slider"
              min="30"
              max="200"
              step="2"
              style="--level: {((settings.drag_threshold_px - 30) / (200 - 30)) * 100}%;"
              bind:value={settings.drag_threshold_px}
              oninput={() => updateSettings(settings)}
            />
          </div>

          <div class="flex flex-col gap-1.5">
            <div class="flex justify-between items-center text-xs">
              <label for="ping-volume-slider" class="font-semibold text-(--ink)">
                Tactical Ping Chime Volume
              </label>
              <span class="font-mono text-(--muted)">{settings.volume} %</span>
            </div>
            <input
              id="ping-volume-slider"
              type="range"
              class="volume-slider"
              min="0"
              max="100"
              step="1"
              style="--level: {settings.volume}%;"
              bind:value={settings.volume}
              oninput={() => updateSettings(settings)}
            />
          </div>

          <div class="flex items-center justify-between pt-2 border-t border-(--line) text-xs">
            <span class="font-semibold text-(--ink) flex items-center gap-2">
              {#if settings.tick_sound}
                <Volume2 class="w-4 h-4 text-(--accent)" />
              {:else}
                <VolumeX class="w-4 h-4 text-(--muted)" />
              {/if}
              <span>Direction Transition Tick Sound</span>
            </span>
            <input
              type="checkbox"
              bind:checked={settings.tick_sound}
              onchange={() => updateSettings(settings)}
              class="w-4 h-4 rounded cursor-pointer accent-(--accent)"
            />
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Confirmation Modal for Reset -->
  <Modal
    open={isResetModalOpen}
    onClose={() => (isResetModalOpen = false)}
    title="Reset Tactical Wheel"
    description="Are you sure you want to restore the tactical ping and emote wheels back to factory defaults? Custom slot assignments will be replaced."
    confirmText="Reset to Defaults"
    confirmVariant="destructive"
    onConfirm={handleConfirmReset}
  >
    {#snippet icon()}
      <AlertTriangle class="w-5 h-5 text-(--error)" />
    {/snippet}
  </Modal>
</div>
