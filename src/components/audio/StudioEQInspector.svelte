<script module lang="ts">
  import {
    SlidersHorizontal,
    Activity,
    RotateCcw,
    Sparkles,
    Check,
    Disc,
    Headphones,
    Mic,
    Moon,
    Music,
    Play,
    Square,
  } from "@lucide/svelte";
  import { invoke, isTauri } from "@tauri-apps/api/core";
  import { audioDspChain } from "@/shared/lib/audioDspChain";
  import { toastState } from "@/lib/toast.svelte";

  export interface EQBandState {
    frequency: number;
    gain: number; // -12 to +12 dB
  }

  export const DEFAULT_BANDS: EQBandState[] = [
    { frequency: 40, gain: 0 },
    { frequency: 64, gain: 0 },
    { frequency: 125, gain: 0 },
    { frequency: 250, gain: 0 },
    { frequency: 500, gain: 0 },
    { frequency: 1000, gain: 0 },
    { frequency: 2000, gain: 0 },
    { frequency: 4000, gain: 0 },
    { frequency: 8000, gain: 0 },
    { frequency: 16000, gain: 0 },
  ];

  export interface AcousticProfile {
    id: string;
    name: string;
    description: string;
    icon: typeof Music;
    gains: number[];
  }

  export const ACOUSTIC_PROFILES: AcousticProfile[] = [
    {
      id: "flat",
      name: "Flat (Default)",
      description: "Uncolored studio monitor reference curve",
      icon: Disc,
      gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    },
    {
      id: "bass",
      name: "Bass Boost",
      description: "Deep punchy sub-bass & low-end warmth",
      icon: Headphones,
      gains: [5.5, 4.8, 3.2, 1.0, 0, 0, 0, 0.5, 1.2, 1.5],
    },
    {
      id: "vocal",
      name: "Vocal Clarity",
      description: "Brings dialogue & vocals forward in mix",
      icon: Mic,
      gains: [-2.0, -1.0, 0, 1.5, 3.2, 4.0, 3.5, 2.0, 0.5, 0],
    },
    {
      id: "electronic",
      name: "Electronic / Dance",
      description: "Punchy V-curve for synth & EDM rhythms",
      icon: Sparkles,
      gains: [6.0, 5.0, 2.0, -1.0, -1.5, 1.0, 2.5, 4.0, 5.2, 5.5],
    },
    {
      id: "podcast",
      name: "Podcast / Speech",
      description: "Cuts sub-rumble, enhances vocal articulation",
      icon: Activity,
      gains: [-4.0, -2.5, 0, 1.0, 2.5, 3.8, 2.5, 1.0, -1.0, -3.0],
    },
    {
      id: "latenight",
      name: "Late Night Soft",
      description: "Tamed highs & low fatigue listening",
      icon: Moon,
      gains: [-1.5, -1.0, 0, 0.5, 0.5, 0, -1.0, -2.0, -3.5, -4.5],
    },
  ];

</script>

<script lang="ts">
  interface Props {
    activePresetName?: string;
    isAudioActive?: boolean;
    isBypassed?: boolean;
    embedded?: boolean;
    compact?: boolean;
    wide?: boolean;
    onPresetSelect?: (presetName: string) => void;
    onBandChange?: (bandIndex: number, gainDb: number) => void;
    onResetFlat?: () => void;
    onToggleBypass?: (bypassed: boolean) => void;
  }

  let {
    activePresetName = "Flat (Default)",
    isAudioActive = false,
    isBypassed: externalBypassed = false,
    embedded = false,
    compact = false,
    wide = false,
    onPresetSelect,
    onBandChange,
    onResetFlat,
    onToggleBypass,
  }: Props = $props();

  let bands = $state<EQBandState[]>(DEFAULT_BANDS.map((b) => ({ ...b })));
  let internalBypassed = $state(false);
  let hoveredNode = $state<number | null>(null);
  let isPlayingTestTone = $state(false);

  let svgRef = $state<SVGSVGElement | null>(null);
  let activeDragNode = $state<number | null>(null);

  const effectiveBypassed = $derived(externalBypassed || internalBypassed);

  $effect(() => {
    if (!isTauri()) return;
    let alive = true;
    void invoke<{ bands: { gain: number }[]; bypass?: boolean }>("get_master_eq_bands").then((eq) => {
      if (alive) {
        bands = DEFAULT_BANDS.map((band, index) => ({ ...band, gain: eq.bands[index]?.gain ?? 0 }));
        internalBypassed = eq.bypass ?? false;
      }
    }).catch((error) => { if (alive) toastState.error(String(error)); });
    return () => { alive = false; };
  });

  // Sync bands with Web Audio DSP chain
  $effect(() => {
    if (effectiveBypassed) {
      audioDspChain.setEQBands(DEFAULT_BANDS.map(() => 0));
    } else {
      audioDspChain.setEQBands(bands.map((b) => b.gain));
    }
  });

  $effect(() => {
    internalBypassed = externalBypassed;
  });

  // Sync bands whenever preset changes
  $effect(() => {
    if (!activePresetName) return;
    const profile = ACOUSTIC_PROFILES.find((p) => p.name === activePresetName);
    if (profile) {
      bands = DEFAULT_BANDS.map((b, idx) => ({
        ...b,
        gain: profile.gains[idx] ?? 0,
      }));
    }
  });

  interface SpotifySpectrum {
    heights: number[];
    receiving: boolean;
    has_signal: boolean;
    enabled: boolean;
    connected: boolean;
    error: string | null;
  }
  const desktop = isTauri();
  let spectrum = $state<SpotifySpectrum | null>(null);
  let spectrumError = $state<string | null>(null);
  let animatedHeights = $state<number[]>(Array(28).fill(0));
  const spectrumActive = $derived(Boolean(spectrum?.enabled && spectrum.connected && spectrum.receiving && spectrum.has_signal && !spectrum.error && !spectrumError));
  const spectrumLabel = $derived(
    !desktop ? "DESKTOP REQUIRED" : spectrumError || spectrum?.error ? "CAPTURE ERROR" :
    !spectrum ? "CONNECTING" : !spectrum.enabled ? "DSP DISCONNECTED" :
    !spectrum.connected ? "CONNECTING" : !spectrum.receiving ? "NO SIGNAL" :
    spectrum.has_signal ? "SPOTIFY LIVE" : "SILENT"
  );
  const spectrumMessage = $derived(
    // The capture error itself is shown once, in the Spotify panel header.
    spectrumError ? spectrumError : spectrum?.error ? "Xem chi tiết lỗi ở bảng Spotify." : (!desktop ? "Open the desktop app to analyze Spotify audio." :
    !spectrum ? "Checking Spotify audio capture…" : !spectrum.enabled ? "Phát một bài trong rust-sound để phân tích âm thanh của nó." :
    !spectrum.connected ? "Waiting for the Spotify audio connection." : !spectrum.receiving ? "No recent Spotify audio. Check playback and the selected output device." :
    "Spotify only · measured after EQ")
  );

  $effect(() => {
    if (!desktop) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    // One in-flight request; hidden/unmounted inspectors do not keep analyzing PCM.
    const poll = async () => {
      if (!document.hidden) {
        try {
          const next = await invoke<SpotifySpectrum>("get_spotify_spectrum");
          if (!alive) return;
          if (!Array.isArray(next.heights) || next.heights.length !== 28 || next.heights.some(h => !Number.isFinite(h))) {
            throw new Error("Invalid Spotify spectrum data. Reconnect Spotify DSP.");
          }
          spectrum = next;
          spectrumError = null;
          animatedHeights = next.enabled && next.connected && next.receiving && !next.error
            ? next.heights.map(h => Math.max(0, Math.min(100, h))) : Array(28).fill(0);
        } catch (error) {
          if (!alive) return;
          spectrumError = String(error);
          animatedHeights = Array(28).fill(0);
        }
      }
      // Giãn chu kỳ thăm dò từ 50ms (20 FPS) lên 80ms (~12.5 FPS) để giải phóng tài nguyên IPC và CPU,
      // trong khi vẫn giữ hiệu ứng visualizer mượt mà qua CSS transition.
      if (alive) timer = setTimeout(poll, 80);
    };
    void poll();
    return () => { alive = false; clearTimeout(timer); };
  });

  function updateGain(idx: number, newGain: number) {
    const clamped = Math.max(-12, Math.min(12, Math.round(newGain * 2) / 2));
    bands[idx] = { ...bands[idx], gain: clamped };
    onBandChange?.(idx, clamped);
  }

  function handleSelectProfile(profile: AcousticProfile) {
    const nextBands = DEFAULT_BANDS.map((b, idx) => ({
      ...b,
      gain: profile.gains[idx] ?? 0,
    }));
    bands = nextBands;
    onPresetSelect?.(profile.name);
    nextBands.forEach((b, idx) => {
      onBandChange?.(idx, b.gain);
    });
  }

  function handleResetFlat() {
    bands = DEFAULT_BANDS.map((b) => ({ ...b }));
    onPresetSelect?.("Flat (Default)");
    onResetFlat?.();
    DEFAULT_BANDS.forEach((_, idx) => {
      onBandChange?.(idx, 0);
    });
  }

  function handleToggleBypass() {
    const next = !effectiveBypassed;
    internalBypassed = next;
    onToggleBypass?.(next);
  }

  // Node Drag handlers on SVG
  function handleNodePointerDown(index: number, e: PointerEvent) {
    if (effectiveBypassed) return;
    activeDragNode = index;
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function handleSvgPointerMove(e: PointerEvent) {
    if (activeDragNode === null || effectiveBypassed || !svgRef) return;
    const rect = svgRef.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const ratio = Math.max(0, Math.min(1, offsetY / rect.height));
    const calculatedGain = Math.round((12 - ratio * 24) * 2) / 2;
    updateGain(activeDragNode, calculatedGain);
  }

  function handleSvgPointerUp(e: PointerEvent) {
    if (activeDragNode !== null) {
      try {
        (e.target as Element).releasePointerCapture(e.pointerId);
      } catch {
        // Ignore capture release
      }
      activeDragNode = null;
    }
  }

  // Generate SVG curve points across 10 bands
  const width = 360;
  const height = 120;
  const zeroY = height / 2;

  const points = $derived(
    bands.map((b, i) => {
      const x = (i / (bands.length - 1)) * (width - 40) + 20;
      const y = zeroY - (b.gain / 12) * (zeroY - 14);
      return { x, y, gain: b.gain, frequency: b.frequency };
    })
  );

  const pathD = $derived(
    points.reduce((acc, pt, i, arr) => {
      if (i === 0) return `M ${pt.x} ${pt.y}`;
      const prev = arr[i - 1];
      const cpX = (prev.x + pt.x) / 2;
      return `${acc} C ${cpX} ${prev.y}, ${cpX} ${pt.y}, ${pt.x} ${pt.y}`;
    }, "")
  );

  const areaD = $derived(
    `${pathD} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`
  );

  // Fader drag helpers
  let activeFaderIdx = $state<number | null>(null);

  function handleFaderPointerDown(idx: number, e: PointerEvent, trackEl: HTMLElement) {
    if (effectiveBypassed) return;
    activeFaderIdx = idx;
    trackEl.setPointerCapture(e.pointerId);
    calculateFaderGain(idx, e.clientY, trackEl);
  }

  function handleFaderPointerMove(idx: number, e: PointerEvent, trackEl: HTMLElement) {
    if (activeFaderIdx !== idx || effectiveBypassed) return;
    calculateFaderGain(idx, e.clientY, trackEl);
  }

  function handleFaderPointerUp(trackEl: HTMLElement, e: PointerEvent) {
    if (activeFaderIdx !== null) {
      try {
        trackEl.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore release capture
      }
      activeFaderIdx = null;
    }
  }

  function calculateFaderGain(idx: number, clientY: number, trackEl: HTMLElement) {
    const rect = trackEl.getBoundingClientRect();
    const offsetY = clientY - rect.top;
    const ratio = Math.max(0, Math.min(1, offsetY / rect.height));
    const calculatedGain = 12 - ratio * 24;
    updateGain(idx, calculatedGain);
  }
</script>

<aside
  class="flex flex-col gap-3.5 select-none w-full {!embedded ? 'p-4 panel h-full' : ''}"
  class:compact
  class:wide
  aria-label="Studio 10-Band Parametric Equalizer Inspector"
>
  <!-- Inspector Header -->
  <div class="inspector-heading flex items-center justify-between pb-2.5 border-b border-(--line)">
    <div class="flex items-center gap-2">
      <div class="w-6 h-6 rounded-lg bg-(--soft) border border-(--line) flex items-center justify-center text-(--warning)">
        <SlidersHorizontal class="w-3.5 h-3.5" />
      </div>
      <div>
        <h3 class="text-xs font-bold text-(--ink) tracking-tight m-0">
          Parametric EQ & Spectrum
        </h3>
        <p class="text-[10px] text-(--muted) m-0">
          10-Band Spotify DSP · other apps unchanged
        </p>
      </div>
    </div>

    <div class="flex items-center gap-2">
      {#if !compact}
      <button
        type="button"
        onclick={() => {
          if (isPlayingTestTone) {
            audioDspChain.stopGrooveSample();
            isPlayingTestTone = false;
          } else {
            isPlayingTestTone = true;
            audioDspChain.playBassAndGrooveSample(3.5, (progress) => {
              if (progress >= 1.0) {
                isPlayingTestTone = false;
              }
            });
          }
        }}
        class="px-2 py-0.5 text-[10px] font-semibold rounded-md border transition-all cursor-pointer flex items-center gap-1 {isPlayingTestTone
          ? 'bg-(--accent) text-(--accent-ink) border-(--accent) shadow-xs animate-pulse'
          : 'bg-(--paper) border-(--line) text-(--ink) hover:border-(--focus)'}"
        title="Audition sound through the active EQ curve"
      >
        {#if isPlayingTestTone}
          <Square class="w-2.5 h-2.5" />
          <span>Stop</span>
        {:else}
          <Play class="w-2.5 h-2.5" />
          <span>Test EQ</span>
        {/if}
      </button>
      {/if}

      <button
        type="button"
        onclick={handleToggleBypass}
        class="px-2 py-0.5 text-[10px] font-semibold rounded-md border transition-all cursor-pointer {effectiveBypassed
          ? 'bg-(--paper) border-(--error) text-(--error)'
          : 'bg-(--surface) border-(--line) text-(--success)'}"
      >
        {effectiveBypassed ? "EQ BYPASS" : isAudioActive ? "EQ ACTIVE" : "EQ READY"}
      </button>

      <button
        type="button"
        onclick={handleResetFlat}
        class="p-1 rounded-md text-(--muted) hover:text-(--ink) hover:bg-(--surface) transition-colors cursor-pointer"
        title="Reset EQ to flat 0 dB"
      >
        <RotateCcw class="w-3.5 h-3.5" />
      </button>
    </div>
  </div>

  <!-- Interactive Frequency Response Curve Display -->
  <div class="curve-panel relative rounded-xl bg-(--paper) border border-(--line) p-3 overflow-hidden shadow-inner">
    <!-- dB Grid Lines -->
    <div class="absolute inset-x-2 top-2 bottom-2 flex flex-col justify-between pointer-events-none opacity-30">
      <div class="border-b border-dashed border-(--input-line) text-[8px] text-(--muted) font-mono">+12 dB</div>
      <div class="border-b border-dashed border-(--input-line) text-[8px] text-(--muted) font-mono">0 dB</div>
      <div class="border-b border-dashed border-(--input-line) text-[8px] text-(--muted) font-mono">-12 dB</div>
    </div>

    <!-- SVG Curve -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <svg
      bind:this={svgRef}
      viewBox="0 0 {width} {height}"
      preserveAspectRatio={compact ? "none" : "xMidYMid meet"}
      onpointermove={handleSvgPointerMove}
      onpointerup={handleSvgPointerUp}
      role="presentation"
      class="eq-curve w-full h-26 overflow-visible transition-opacity duration-200 {effectiveBypassed
        ? 'opacity-25 pointer-events-none'
        : ''}"
    >
      <defs>
        <linearGradient id="eqGlow" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.45" />
          <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.0" />
        </linearGradient>
      </defs>

      <!-- Area Fill -->
      <path d={areaD} fill="url(#eqGlow)" />

      <!-- Curve Stroke -->
      <path
        d={pathD}
        fill="none"
        stroke="var(--accent)"
        stroke-width="2.5"
        stroke-linecap="round"
      />

      <!-- Band Marker Nodes with Pointer Capture Dragging -->
      {#each points as pt, i}
        {@const isHovered = hoveredNode === i}
        {@const freqLabel = pt.frequency >= 1000 ? `${pt.frequency / 1000}k` : `${pt.frequency}`}
        <g>
          <!-- Touch / pointer hit target -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <circle
            cx={pt.x}
            cy={pt.y}
            r="14"
            fill="transparent"
            class="cursor-ns-resize"
            onpointerdown={(e) => handleNodePointerDown(i, e)}
            onpointerenter={() => (hoveredNode = i)}
            onpointerleave={() => (hoveredNode = null)}
            ondblclick={() => !effectiveBypassed && updateGain(i, 0)}
          />

          {#if isHovered}
            <circle
              cx={pt.x}
              cy={pt.y}
              r="8"
              fill="none"
              stroke="var(--accent)"
              stroke-width="1.5"
              class="animate-pulse"
            />
          {/if}

          <circle
            cx={pt.x}
            cy={pt.y}
            r="4.5"
            fill="var(--core)"
            stroke={pt.gain !== 0 ? "var(--accent)" : "var(--accent-text)"}
            stroke-width="2"
            class="pointer-events-none"
          />

          {#if isHovered}
            <g class="pointer-events-none">
              <rect
                x={pt.x - 28}
                y={pt.y < 28 ? pt.y + 10 : pt.y - 24}
                width="56"
                height="16"
                rx="4"
                fill="var(--core)"
                stroke="var(--accent)"
                stroke-width="1"
              />
              <text
                x={pt.x}
                y={pt.y < 28 ? pt.y + 21 : pt.y - 13}
                text-anchor="middle"
                fill="var(--ink)"
                font-size="9"
                font-weight="bold"
                font-family="'Plus Jakarta Sans', system-ui, sans-serif"
              >
                {freqLabel}: {pt.gain > 0 ? `+${pt.gain}` : pt.gain}dB
              </text>
            </g>
          {/if}
        </g>
      {/each}
    </svg>
  </div>

  <!-- 10-Band Custom Vertical Faders Rack -->
  <div class="faders grid grid-cols-10 gap-1 pt-1 pb-1 items-end justify-items-center">
    {#each bands as band, idx}
      {@const freqLabel = band.frequency >= 1000 ? `${band.frequency / 1000}k` : `${band.frequency}`}
      {@const normalized = (12 - band.gain) / 24}
      {@const topPercent = Math.max(0, Math.min(100, normalized * 100))}

      <div class="flex flex-col items-center gap-1 w-full select-none">
        <span
          class="text-[9px] font-mono tabular-nums leading-none {band.gain > 0
            ? 'text-(--accent-text) font-bold'
            : band.gain < 0
            ? 'text-(--warning)'
            : 'text-(--muted)'}"
        >
          {band.gain > 0 ? `+${band.gain.toFixed(0)}` : band.gain.toFixed(0)}
        </span>

        <!-- Fader Track -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          role="slider" tabindex={effectiveBypassed ? -1 : 0} aria-label={`${freqLabel} Hz`} aria-valuemin={-12} aria-valuemax={12} aria-valuenow={band.gain} aria-valuetext={`${band.gain} dB`} aria-disabled={effectiveBypassed}
          onkeydown={(event) => {
            if (effectiveBypassed) return;
            const changes: Record<string, number> = { ArrowUp: band.gain + 0.5, ArrowRight: band.gain + 0.5, ArrowDown: band.gain - 0.5, ArrowLeft: band.gain - 0.5, Home: -12, End: 12 };
            if (event.key in changes) { event.preventDefault(); updateGain(idx, changes[event.key]); }
          }}
          onpointerdown={(e) => handleFaderPointerDown(idx, e, e.currentTarget)}
          onpointermove={(e) => handleFaderPointerMove(idx, e, e.currentTarget)}
          onpointerup={(e) => handleFaderPointerUp(e.currentTarget, e)}
          ondblclick={() => !effectiveBypassed && updateGain(idx, 0)}
          class="studio-fader-track cursor-ns-resize {effectiveBypassed
            ? 'opacity-40 cursor-not-allowed'
            : ''}"
          title="{freqLabel} Hz: {band.gain > 0 ? `+${band.gain.toFixed(1)}` : band.gain.toFixed(1)} dB (Double-click to reset)"
        >
          <div class="studio-fader-groove"></div>
          <div class="studio-fader-zero-mark"></div>

          {#if band.gain !== 0}
            <div
              class="studio-fader-fill"
              style="top: {band.gain > 0 ? `${topPercent}%` : '50%'}; height: {Math.abs(topPercent - 50)}%; background-color: {band.gain > 0 ? 'var(--accent)' : 'var(--warning)'};"
            ></div>
          {/if}

          <div
            class="studio-fader-thumb"
            style="top: calc({topPercent}% - 6px);"
          ></div>
        </div>

        <span class="text-[9px] font-bold text-(--muted) leading-none">{freqLabel}</span>
      </div>
    {/each}
  </div>

  <!-- Acoustic Profiles Library -->
  <div class="profiles flex flex-col gap-2 pt-2 border-t border-(--line)">
    <div class="flex items-center justify-between">
      <span class="text-[10px] font-bold text-(--ink) uppercase tracking-wider flex items-center gap-1.5">
        <Sparkles class="w-3 h-3 text-(--accent-text)" />
        Acoustic Profiles Library
      </span>
      <span class="text-[10px] text-(--muted) font-mono">6 Master Curves</span>
    </div>

    <div class="grid grid-cols-2 gap-2">
      {#each ACOUSTIC_PROFILES as profile}
        {@const isSelected = activePresetName === profile.name}
        {@const Icon = profile.icon}
        <button
          type="button"
          onclick={() => handleSelectProfile(profile)}
          class="profile-choice p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-2.5 {isSelected
            ? 'bg-(--soft) border-(--accent) text-(--ink) shadow-xs ring-1 ring-(--accent-line)'
            : 'bg-(--paper) border-(--line) text-(--muted) hover:text-(--ink) hover:border-(--focus)'}"
        >
          <div
            class="profile-icon w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-colors {isSelected
              ? 'bg-(--accent) text-(--accent-ink) font-bold'
              : 'bg-(--surface) text-(--muted)'}"
          >
            <Icon class="w-3.5 h-3.5" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold text-(--ink) truncate block">
                {profile.name}
              </span>
              {#if isSelected}
                <Check class="w-3 h-3 text-(--accent-text) shrink-0 ml-1" />
              {/if}
            </div>
            <p class="profile-description text-[10px] text-(--muted) leading-tight mt-0.5 truncate">
              {profile.description}
            </p>
          </div>
        </button>
      {/each}
    </div>
  </div>

  <!-- 28-Bar High-Resolution Live Audio Spectrum Analyzer -->
  <div class="spectrum-panel p-3 rounded-xl bg-(--paper) border border-(--line) flex flex-col gap-2 mt-auto">
    <div class="flex items-center justify-between text-[10px]">
      <span class="text-(--ink) font-semibold flex items-center gap-1.5">
        <Activity class="w-3 h-3 text-(--accent-text)" />
        Live 28-Band Spectrum Analyzer
      </span>
      <span class="badge {spectrumActive ? 'badge-ok' : ''} text-[9px] px-1.5 py-0" aria-live="polite">
        <span class="w-1.5 h-1.5 rounded-full {spectrumActive ? 'bg-(--success)' : 'bg-(--muted)'}"></span>
        {spectrumLabel}
      </span>
    </div>

    <p class="text-[10px] text-(--muted) m-0 wrap-break-word" role="status">{spectrumMessage}</p>

    <!-- Actual Spotify PCM spectrum; never generated from playback metadata. -->
    <div class="flex items-end gap-1 h-12 w-full pt-1 px-1" aria-label="Spotify spectrum bars">
      {#each animatedHeights as h}
        <div
          class="flex-1 rounded-t-xs transition-[height] duration-75 motion-reduce:transition-none {spectrumActive
            ? 'bg-(--accent)'
            : 'bg-(--line)'}"
          style="height: {h}%; min-height: 2px"
        ></div>
      {/each}
    </div>

    <div class="flex justify-between text-[8px] font-mono text-(--muted) px-1 border-t border-(--line) pt-1">
      <span>20 Hz</span>
      <span>250 Hz</span>
      <span>1 kHz</span>
      <span>4 kHz</span>
      <span>20 kHz</span>
    </div>
  </div>
</aside>

<style>
  .compact { gap: 12px; }
  .compact .eq-curve { height: 64px; }
  .compact .studio-fader-track { height: 64px; }
  .compact .studio-fader-groove { height: 100%; }
  .compact .profile-choice { padding: 8px; gap: 6px; min-width: 0; align-items: center; border-radius: 8px; }
  .compact .profile-description, .compact .profile-icon { display: none; }
  .wide { display: grid; grid-template-columns: minmax(0,1.2fr) minmax(0,1fr); grid-template-areas: "heading heading" "curve profiles" "faders spectrum"; gap: 16px 28px; }
  .wide .inspector-heading { grid-area: heading; }
  .wide .inspector-heading h3 { font-size: 15px; }
  .wide .curve-panel { grid-area: curve; }
  .wide .eq-curve { height: 120px; }
  .wide .faders { grid-area: faders; }
  .wide .studio-fader-track { height: 90px; }
  .wide .profiles { grid-area: profiles; border-top: 0; padding-top: 0; min-width: 0; }
  .wide .profile-choice { padding: 8px 12px; min-height: 36px; }
  .wide .spectrum-panel { grid-area: spectrum; margin-top: 0; min-width: 0; }
  .studio-fader-track:focus-visible { outline: 2px solid var(--focus); outline-offset: 3px; }
</style>
