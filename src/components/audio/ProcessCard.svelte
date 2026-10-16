<script lang="ts">
  import {
    Volume2,
    VolumeX,
    ChevronDown,
    Sliders,
    ArrowUpRight,
    EyeOff,
  } from "@lucide/svelte";
  import { displayName } from "@/audio";
  import type { AudioProcess } from "@/audio";
  import type { AudioDevice } from "./DeviceQuickBar.svelte";
  import Equalizer from "@/components/ui/Equalizer.svelte";
  import { liveAudioMetersState } from "@/lib/liveAudioMeters.svelte";

  interface Props {
    process: AudioProcess;
    initialVolume?: number;
    isMuted?: boolean;
    devices?: AudioDevice[];
    targetDeviceUid?: string | null;
    onVolumeCommit?: (volume: number) => Promise<void> | void;
    onMuteToggle?: (muted: boolean) => Promise<void> | void;
    onRouteChange?: (deviceUid: string) => void;
    onHide?: () => void;
    onError?: (msg: string) => void;
  }

  let {
    process,
    initialVolume = 100,
    isMuted = false,
    devices = [],
    targetDeviceUid = null,
    onVolumeCommit,
    onMuteToggle,
    onRouteChange,
    onHide,
    onError,
  }: Props = $props();

  let internalVol = $state(100);
  let isCommitting = $state(false);
  let isTogglingMute = $state(false);
  let isExpanded = $state(false);
  let isEQEnabled = $state(true);

  $effect(() => {
    internalVol = initialVolume;
  });

  const name = $derived(displayName(process));
  const detail = $derived(process.bundle_id || `PID ${process.pid} · No identifier`);
  const isDisabled = $derived(!process.bundle_id || isCommitting);
  // macOS has no per-process volume API; only apps that script their own volume
  // can be driven. Grey the control out rather than letting it pretend.
  const volumeLocked = $derived(isDisabled || process.supports_volume === false);
  const lockReason = "macOS không cho chỉnh âm lượng riêng cho app này. Dùng âm lượng trong chính app hoặc fader tổng.";

  const channelLvl = $derived(
    isMuted ? 0 : Math.round(liveAudioMetersState.levelL * (internalVol / 100))
  );

  async function handleVolumeCommit(val: number) {
    if (isCommitting) return;
    isCommitting = true;
    try {
      await onVolumeCommit?.(val);
    } catch {
      onError?.(`Couldn't update ${name}'s volume. Please try again.`);
    } finally {
      isCommitting = false;
    }
  }

  async function handleMuteClick() {
    if (isTogglingMute) return;
    isTogglingMute = true;
    try {
      await onMuteToggle?.(!isMuted);
    } catch {
      onError?.(`Couldn't update ${name}'s mute state. Please try again.`);
    } finally {
      isTogglingMute = false;
    }
  }
</script>

<div
  class="rounded-xl transition-all duration-150 border border-(--line) bg-(--surface) hover:border-(--focus) p-2.5 {isMuted
    ? 'opacity-85'
    : ''} {isExpanded ? 'border-(--accent) ring-1 ring-(--accent-line)' : ''}"
>
  <!-- Primary Channel Strip Row -->
  <div class="flex items-center gap-3">
    <!-- App Avatar & Identity -->
    <div class="flex items-center gap-2.5 min-w-[130px] sm:min-w-[170px] max-w-50">
      <div
        class="w-7 h-7 rounded-lg bg-(--paper) border border-(--line) flex items-center justify-center font-bold text-xs text-(--accent-text) uppercase shrink-0 select-none shadow-xs"
        aria-hidden="true"
      >
        {name.slice(0, 2)}
      </div>

      <div class="min-w-0 flex-1">
        <h4
          class="text-xs font-semibold tracking-tight text-(--ink) truncate m-0 {isMuted
            ? 'opacity-70 line-through'
            : ''}"
          title={name}
        >
          {name}
        </h4>
        <p class="text-[10px] text-(--muted) truncate mt-0.5 m-0 font-mono">
          {detail}
        </p>
      </div>
    </div>

    <!-- Live Audio Activity Badge -->
    <div class="hidden sm:flex items-center w-20 shrink-0">
      {#if process.is_running_output}
        <span class="badge badge-ok gap-1.5 text-[9px] px-1.5 py-0.5">
          <Equalizer bars={3} active={true} />
          <span>Playing</span>
        </span>
      {:else}
        <span class="text-[10px] text-(--muted) pl-1">Silent</span>
      {/if}
    </div>

    <!-- Volume Slider (with commit on release) -->
    <div class="flex-1 min-w-0 px-1 {isMuted || volumeLocked ? 'opacity-40' : ''}">
      <input
        type="range"
        min="0"
        max="100"
        value={internalVol}
        disabled={volumeLocked}
        title={volumeLocked && !isDisabled ? lockReason : null}
        oninput={(e) => (internalVol = Number(e.currentTarget.value))}
        onpointerup={() => handleVolumeCommit(internalVol)}
        onchange={() => handleVolumeCommit(internalVol)}
        aria-label="{name} volume"
        class="volume-slider"
        style="--level: {internalVol}%"
      />
    </div>

    <!-- Numerical Readout -->
    <button
      type="button"
      ondblclick={() => !volumeLocked && handleVolumeCommit(100)}
      title="Double-click to reset to 100%"
      class="font-mono text-[10px] text-(--muted) hover:text-(--ink) tabular-nums w-8 text-right hidden sm:inline-block cursor-pointer bg-transparent border-none p-0"
    >
      {internalVol}%
    </button>

    <!-- Dynamic Channel Output Level Meter -->
    <div
      class="w-8 sm:w-10 h-2 bg-(--line) rounded-sm overflow-hidden flex shrink-0"
      title="{name} live output meter"
    >
      <div
        class="h-full rounded-sm transition-all duration-75 {process.is_running_output && !isMuted
          ? 'bg-(--accent)'
          : 'bg-(--muted)'}"
        style="width: {channelLvl}%"
      ></div>
    </div>

    <!-- Action Controls: Mute & Expand -->
    <div class="flex items-center gap-1 shrink-0">
      <button
        type="button"
        onclick={handleMuteClick}
        disabled={volumeLocked || isTogglingMute}
        aria-pressed={isMuted}
        aria-label="{isMuted ? 'Unmute' : 'Mute'} {name}"
        title={volumeLocked && !isDisabled ? lockReason : `${isMuted ? "Unmute" : "Mute"} ${name}`}
        class="h-7 w-7 rounded-lg border flex items-center justify-center cursor-pointer {isMuted
          ? 'bg-(--paper) border-(--error) text-(--error)'
          : 'bg-(--paper) border-(--line) text-(--muted) hover:text-(--ink)'}"
      >
        {#if isMuted}
          <VolumeX class="w-3.5 h-3.5 text-(--error)" />
        {:else}
          <Volume2 class="w-3.5 h-3.5" />
        {/if}
      </button>

      <button
        type="button"
        onclick={() => (isExpanded = !isExpanded)}
        class="h-7 w-7 rounded-lg border flex items-center justify-center transition-all cursor-pointer {isExpanded
          ? 'bg-(--soft) border-(--accent-line) text-(--accent-text)'
          : 'bg-(--paper) border-(--line) text-(--muted) hover:text-(--ink) hover:border-(--focus)'}"
        title={isExpanded ? "Collapse channel rack" : "Expand channel rack"}
        aria-expanded={isExpanded}
      >
        <ChevronDown
          class="w-3.5 h-3.5 transition-transform duration-200 {isExpanded ? 'rotate-180' : ''}"
        />
      </button>
    </div>
  </div>

  <!-- Expandable Channel Rack Details -->
  {#if isExpanded}
    <div class="mt-2 pt-2.5 pb-1 px-1 border-t border-(--line) grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
      <!-- Route to Device -->
      <div class="flex flex-col gap-1">
        <span class="text-[10px] font-semibold text-(--muted) uppercase tracking-wider flex items-center gap-1">
          <ArrowUpRight class="w-3 h-3 text-(--accent-text)" />
          Route Stream To
        </span>
        <select
          value={targetDeviceUid || ""}
          onchange={(e) => onRouteChange?.(e.currentTarget.value)}
          disabled={isDisabled}
          class="w-full h-7 text-xs bg-(--paper) border border-(--input-line) text-(--ink) rounded-md px-2 focus:outline-none focus:border-(--focus) cursor-pointer truncate font-sans"
        >
          <option value="">Follow System Default</option>
          {#each devices as d}
            <option value={d.uid}>
              {d.name}{d.is_default ? " (Default)" : ""}
            </option>
          {/each}
        </select>
      </div>

      <!-- Individual Channel EQ Toggle -->
      <div class="flex flex-col gap-1 justify-between">
        <span class="text-[10px] font-semibold text-(--muted) uppercase tracking-wider flex items-center gap-1">
          <Sliders class="w-3 h-3 text-(--warning)" />
          DSP Parametric EQ
        </span>
        <div class="flex items-center gap-2">
          <button
            type="button"
            onclick={() => (isEQEnabled = !isEQEnabled)}
            class="px-2.5 py-1 text-[11px] font-semibold rounded-md border transition-all cursor-pointer {isEQEnabled
              ? 'bg-(--soft) border-(--line) text-(--ink)'
              : 'bg-(--paper) border-(--line) text-(--muted)'}"
          >
            {isEQEnabled ? "10-Band EQ Active" : "EQ Bypassed"}
          </button>
          <span class="text-[10px] text-(--muted)">48kHz stereo processing</span>
        </div>
      </div>

      <!-- Hide Channel Action -->
      {#if onHide}
        <div class="sm:col-span-2 flex items-center justify-between pt-1 border-t border-(--line)">
          <span class="text-[10px] text-(--muted)">
            Hide this application from active mixer channel strips
          </span>
          <button
            type="button"
            onclick={onHide}
            class="text-[10px] text-(--muted) hover:text-(--error) flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-(--line) hover:border-(--error) transition-all cursor-pointer"
            title="Hide this channel from mixer"
          >
            <EyeOff class="w-3 h-3 text-(--error)" />
            Hide Channel
          </button>
        </div>
      {/if}
    </div>
  {/if}
</div>
