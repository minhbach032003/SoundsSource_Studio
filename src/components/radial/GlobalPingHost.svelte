<script lang="ts">
  import { invoke, isTauri } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import {
    DIRECTIONS,
    DEFAULT_PINGLOOM_SETTINGS,
    DEFAULT_CATALOG,
    sectorPath,
    formatAssetName,
    isEmoteId,
    playPingSound,
    type PingloomSettings,
    type CatalogEntry,
    type PingloomActionPayload,
  } from "@/lib/pingloom";
  import { playPingChime, playSectorTick } from "@/lib/pingAudio";
  import { LolPingGestureMachine, type PingMode } from "@/lib/lolPingGesture.svelte";
  import PingBurstMarker, { type PingBurstItem } from "@/components/radial/PingBurstMarker.svelte";
  import PingVectorIcon from "@/components/radial/PingVectorIcon.svelte";
  import { Target } from "@lucide/svelte";

  const PINGLOOM_STORAGE_KEY = "rust-sound.pingloom-settings";

  function isRunningInTauri(): boolean {
    if (typeof window === "undefined") return false;
    return (
      isTauri() ||
      !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ ||
      !!(window as unknown as { __TAURI__?: unknown }).__TAURI__
    );
  }

  function loadSavedSettings(): PingloomSettings {
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

  interface Props {
    enabled?: boolean;
  }

  let { enabled = true }: Props = $props();

  const isDesktop = isRunningInTauri();
  const isNativeOverlay = isDesktop && new URLSearchParams(window.location.search).has("ping_overlay");

  let settings = $state<PingloomSettings>(loadSavedSettings());
  let catalog = $state<CatalogEntry[]>(DEFAULT_CATALOG);
  let bursts = $state<PingBurstItem[]>([]);

  // Native CGEventTap pingloom:action state
  let nativeHolding = $state<boolean>(false);
  let nativeOrigin = $state<{ x: number; y: number } | null>(null);
  let nativePos = $state<{ x: number; y: number } | null>(null);
  let nativeSlice = $state<number | null>(null);
  let nativeMode = $state<PingMode>("tactical");

  // Keep settings synchronized across tabs, windows, and backend
  $effect(() => {
    const handleStorage = () => {
      settings = loadSavedSettings();
    };
    window.addEventListener("storage", handleStorage);

    if (isDesktop) {
      invoke<PingloomSettings>("get_ping_settings")
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
    }

    return () => window.removeEventListener("storage", handleStorage);
  });

  function handleExpireBurst(id: string) {
    bursts = bursts.filter((b) => b.id !== id);
  }

  function handleDispatchLoLPing(result: { mode: PingMode; sliceIndex: number; x: number; y: number }, native = false) {
    const { mode, sliceIndex, x, y } = result;
    const isEmote = mode === "emote";
    const targetWheel = isEmote ? settings.emote_wheel : settings.wheel;
    const pingId = targetWheel[sliceIndex] ?? (isEmote ? "gg_heart" : "danger");
    const entry = catalog.find((c) => c.id === pingId);
    const name = entry?.name ?? formatAssetName(pingId);
    const color = entry?.color ?? (isEmote ? "#ec4899" : "#ff3b55");

    if (!native && !settings.muted) {
      playPingSound(pingId).catch(() => {});
      playPingChime(pingId, settings.volume);
    }

    const newBurst: PingBurstItem = {
      id: `${Date.now()}-${Math.random()}`,
      x,
      y,
      pingId,
      name,
      color,
      isEmote: isEmote || isEmoteId(pingId),
      emoteUrl: isEmote || isEmoteId(pingId) ? `/pingloom/emotes/${pingId}.webp` : undefined,
      durationMs: Math.round(settings.ping_duration_s * 1000),
    };

    bursts = [...bursts.slice(-9), newBurst];
  }

  function handleDispatchLoLQuickPing(result: { mode: PingMode; x: number; y: number }) {
    const { mode, x, y } = result;
    const isEmote = mode === "emote";
    const pingId = isEmote
      ? (settings.click_emote_id || "gg_heart")
      : (settings.click_ping_id || "danger");
    const entry = catalog.find((c) => c.id === pingId);
    const name = entry?.name ?? formatAssetName(pingId);
    const color = entry?.color ?? (isEmote ? "#ec4899" : "#ff3b55");

    if (!settings.muted) {
      playPingSound(pingId).catch(() => {});
      playPingChime(pingId, settings.volume);
    }

    const newBurst: PingBurstItem = {
      id: `${Date.now()}-${Math.random()}`,
      x,
      y,
      pingId,
      name: `Quick: ${name}`,
      color,
      isEmote: isEmote || isEmoteId(pingId),
      emoteUrl: isEmote || isEmoteId(pingId) ? `/pingloom/emotes/${pingId}.webp` : undefined,
      durationMs: Math.round(settings.ping_duration_s * 1000),
    };

    bursts = [...bursts.slice(-9), newBurst];
  }

  const gesture = new LolPingGestureMachine();

  $effect(() => {
    gesture.init({
      tacticalTrigger: settings.trigger,
      emoteTrigger: settings.emote_trigger,
      dragThreshold: settings.drag_threshold_px,
      clickPing: settings.click_ping,
      tickSound: settings.tick_sound,
      volume: settings.volume,
      enabled: enabled && !isDesktop,
      onDispatch: handleDispatchLoLPing,
      onQuickPing: handleDispatchLoLQuickPing,
    });

    let unlistenAction: (() => void) | undefined;
    let disposed = false;

    if (isNativeOverlay && enabled) {
      console.log('[PingOverlay] Native overlay mode active, subscribing to pingloom:action');
      let rafPending = false;
      let pendingPos: { x: number; y: number } | null = null;
      let pendingSlot: number | null | undefined = undefined;
      let pendingWheel: string | undefined = undefined;

      listen<PingloomActionPayload>("pingloom:action", (event) => {
        const payload = event.payload;
        if (!payload) return;
        const action = payload.action;
        const eventType = payload.event_type || action?.type;
        if (eventType === 'wheel_open' || eventType === 'select' || eventType === 'wheel_close') {
          console.log('[PingOverlay] event:', eventType, JSON.stringify(payload).slice(0, 200));
        }

        if (eventType === "wheel_open" || action?.type === "wheel_open") {
          const origin =
            payload.origin ||
            action?.data?.origin || {
              x: typeof window !== "undefined" ? window.innerWidth / 2 : 400,
              y: typeof window !== "undefined" ? window.innerHeight / 2 : 300,
            };
          const wheelKind: PingMode = action?.data?.wheel === "emote" ? "emote" : "tactical";
          nativeOrigin = origin;
          nativePos = origin;
          nativeSlice = null;
          nativeMode = wheelKind;
          nativeHolding = true;
        } else if (eventType === "wheel_slice" || action?.type === "wheel_move") {
          nativeHolding = true;
          if (action?.data?.point) pendingPos = action.data.point;
          if (action?.data?.wheel) pendingWheel = action.data.wheel;
          pendingSlot = action?.data?.slot;
          if (!rafPending) {
            rafPending = true;
            requestAnimationFrame(() => {
              rafPending = false;
              if (pendingPos) nativePos = pendingPos;
              if (pendingWheel) nativeMode = pendingWheel === "emote" ? "emote" : "tactical";
              const slot = pendingSlot;
              if (slot !== undefined && slot !== null && slot >= 0 && slot < 8) {
                if (nativeSlice !== slot && settings.tick_sound) {
                  playSectorTick(settings.volume);
                }
                nativeSlice = slot;
              } else {
                nativeSlice = null;
              }
            });
          }
        } else if (eventType === "wheel_close" || action?.type === "cancel") {
          nativeHolding = false;
          nativeSlice = null;
          nativeOrigin = null;
          nativePos = null;
        } else if (eventType === "select" || action?.type === "select") {
          const slot = action?.data?.slot;
          if (!Number.isInteger(slot) || slot == null || slot < 0 || slot >= 8) return;
          const point =
            action?.data?.point ??
            nativePos ??
            nativeOrigin ?? {
              x: typeof window !== "undefined" ? window.innerWidth / 2 : 400,
              y: typeof window !== "undefined" ? window.innerHeight / 2 : 300,
            };
          const wheelKind: PingMode =
            action?.data?.wheel === "emote" || nativeMode === "emote"
              ? "emote"
              : "tactical";
          nativeHolding = false;
          nativeSlice = null;
          nativeOrigin = null;
          nativePos = null;

          handleDispatchLoLPing({
            mode: wheelKind,
            sliceIndex: slot,
            x: point.x,
            y: point.y,
          }, true);
        } else if (eventType === "click" || action?.type === "click") {
          const point =
            action?.data?.point ??
            nativePos ??
            nativeOrigin ?? {
              x: typeof window !== "undefined" ? window.innerWidth / 2 : 400,
              y: typeof window !== "undefined" ? window.innerHeight / 2 : 300,
            };
          const wheelKind: PingMode =
            action?.data?.wheel === "emote" ? "emote" : "tactical";
          nativeHolding = false;
          nativeSlice = null;
          nativeOrigin = null;
          nativePos = null;

          handleDispatchLoLQuickPing({
            mode: wheelKind,
            x: point.x,
            y: point.y,
          });
        }
      })
        .then((unsub) => {
          if (disposed) unsub();
          else unlistenAction = unsub;
        })
        .catch(() => {});
    }

    return () => {
      disposed = true;
      gesture.destroy();
      unlistenAction?.();
    };
  });

  const isHolding = $derived(nativeHolding || gesture.isHolding);
  const currentOrigin = $derived(nativeHolding ? nativeOrigin : gesture.origin);
  const currentPos = $derived(nativeHolding ? nativePos : gesture.currentPos);
  const currentSlice = $derived(nativeHolding ? nativeSlice : gesture.activeSlice);
  const currentMode = $derived(nativeHolding ? nativeMode : gesture.activeMode);

  const hudWheel = $derived(
    currentMode === "emote" ? settings.emote_wheel : settings.wheel
  );
</script>

<!-- 1. Global Viewport Burst Particles -->
<div class="fixed inset-0 pointer-events-none z-[9998] overflow-hidden">
  {#each bursts as burst (burst.id)}
    <PingBurstMarker {burst} onExpire={handleExpireBurst} />
  {/each}
</div>

<!-- 2. Floating Cursor-Centered Radial Wheel HUD -->
{#if isHolding && currentOrigin}
  <div
    style="left: {currentOrigin.x}px; top: {currentOrigin.y}px;"
    class="fixed -translate-x-1/2 -translate-y-1/2 w-[280px] h-[280px] shrink-0 aspect-square z-[9999] pointer-events-none select-none animate-in zoom-in-75 fade-in duration-100"
  >
    <svg class="w-full h-full block" viewBox="0 0 280 280">
      <!-- Slices 0 to 7 -->
      {#each DIRECTIONS as dir, idx (dir)}
        {@const aStart = ((idx * 45 - 22.5) * Math.PI) / 180}
        {@const aEnd = (((idx + 1) * 45 - 22.5) * Math.PI) / 180}
        {@const pathD = sectorPath(140, 140, 52, 136, aStart, aEnd)}
        {@const isSelected = currentSlice === idx}
        <path
          d={pathD}
          fill={isSelected
            ? "color-mix(in srgb, var(--accent) 45%, rgba(20, 16, 25, 0.9))"
            : "rgba(25, 20, 30, 0.88)"}
          stroke={isSelected ? "var(--accent)" : "rgba(255, 255, 255, 0.15)"}
          stroke-width={isSelected ? "3" : "1"}
          class="transition-colors duration-75"
        />
      {/each}

      <!-- Boundary Rings -->
      <circle cx="140" cy="140" r="136" fill="none" stroke="rgba(255, 255, 255, 0.2)" stroke-width="1" />
      <circle cx="140" cy="140" r="52" fill="none" stroke="rgba(255, 255, 255, 0.2)" stroke-width="1" />

      <!-- Aiming Vector Needle Line -->
      {#if currentPos}
        <line
          x1="140"
          y1="140"
          x2={140 + (currentPos.x - currentOrigin.x)}
          y2={140 + (currentPos.y - currentOrigin.y)}
          stroke="var(--accent, #ff5588)"
          stroke-width="2.5"
          stroke-dasharray="6 4"
          stroke-linecap="round"
          opacity="0.92"
        />
      {/if}
    </svg>

    <!-- Center Hub Indicator -->
    <div
      class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full flex flex-col items-center justify-center p-2 text-center border backdrop-blur-md transition-all duration-100 {currentSlice !== null ? 'bg-(--accent) text-(--accent-ink) border-(--accent) shadow-xl scale-105' : 'bg-(--surface) text-(--ink) border-(--line) shadow-md'}"
    >
      {#if currentSlice !== null}
        {#if currentMode === "emote" || isEmoteId(hudWheel[currentSlice])}
          <img
            src="/pingloom/emotes/{hudWheel[currentSlice]}.webp"
            alt="Emote Preview"
            class="w-10 h-10 object-contain drop-shadow-sm mb-0.5"
            onerror={(e) => {
              const img = e.currentTarget as HTMLImageElement;
              if (img.src.endsWith('.webp')) img.src = `/pingloom/emotes/${hudWheel[currentSlice]}.png`;
            }}
          />
          <span class="text-[9px] font-black leading-tight truncate max-w-20">
            {catalog.find((c) => c.id === hudWheel[currentSlice])?.name ?? formatAssetName(hudWheel[currentSlice])}
          </span>
        {:else}
          <span class="text-[10px] font-extrabold uppercase tracking-wider">
            {DIRECTIONS[currentSlice]}
          </span>
          <span class="text-[11px] font-black leading-tight truncate max-w-20">
            {catalog.find((c) => c.id === hudWheel[currentSlice])?.name ?? "Ping"}
          </span>
        {/if}
      {:else}
        <Target class="w-4 h-4 text-(--accent) mb-0.5 animate-pulse" />
        <span class="text-[10px] font-black tracking-wider">
          {currentMode === "emote" ? "EMOTE AIM" : "TACTICAL AIM"}
        </span>
        <span class="text-[8px] opacity-75">{settings.drag_threshold_px}px deadzone</span>
      {/if}
    </div>

    <!-- Directional Perimeter Labels -->
    {#each DIRECTIONS as dir, idx (dir)}
      {@const angle = (idx * 45 * Math.PI) / 180}
      {@const rPercent = (94 / 280) * 100}
      {@const leftPercent = 50 + rPercent * Math.sin(angle)}
      {@const topPercent = 50 - rPercent * Math.cos(angle)}
      {@const isSelected = currentSlice === idx}
      {@const assignedId = hudWheel[idx]}
      {@const asset = catalog.find((c) => c.id === assignedId)}
      <div
        style="left: {leftPercent}%; top: {topPercent}%;"
        class="absolute -translate-x-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex flex-col items-center justify-center transition-transform p-0.5 shadow-md {isSelected ? 'scale-120 ring-2 ring-(--accent) bg-(--paper) text-(--ink) shadow-xl' : 'bg-(--surface) text-(--ink) border border-(--line)'}"
      >
        <span
          class="text-[9px] font-black leading-none"
          style={asset?.color ? `color: ${asset.color}` : "color: var(--accent)"}
        >
          {dir}
        </span>
        {#if currentMode === "emote" || isEmoteId(assignedId)}
          <img
            src="/pingloom/emotes/{assignedId}.webp"
            alt={assignedId}
            class="w-5 h-5 object-contain mt-0.5"
            onerror={(e) => {
              const img = e.currentTarget as HTMLImageElement;
              if (img.src.endsWith('.webp')) img.src = `/pingloom/emotes/${assignedId}.png`;
            }}
          />
        {:else}
          <PingVectorIcon
            assetId={assignedId}
            pingId={assignedId}
            iconKey={asset?.vectorIcon}
            class="w-3 h-3 mt-0.5"
            style={asset?.color ? `color: ${asset.color}` : undefined}
          />
        {/if}
      </div>
    {/each}
  </div>
{/if}
