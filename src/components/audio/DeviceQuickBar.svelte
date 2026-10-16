<script lang="ts">
  import {
    Volume2,
    VolumeX,
    Mic,
    MicOff,
    Headphones,
    Check,
    ChevronDown,
    Play,
    Square,
    Speaker,
    Sliders,
    Volume1,
  } from "@lucide/svelte";
  import { liveAudioMetersState } from "@/lib/liveAudioMeters.svelte";
  import { playHeadphoneChannelTone } from "@/lib/headphoneTest";

  export interface AudioDevice {
    name: string;
    uid: string;
    is_default: boolean;
  }

  export interface Preset {
    name: string;
    is_default: boolean;
  }

  interface Props {
    devices?: AudioDevice[];
    inputDevices?: AudioDevice[];
    presets?: Preset[];
    selectedDevice?: string;
    selectedInputDevice?: string;
    selectedPreset?: string;
    onDeviceChange?: (uid: string) => void;
    onInputDeviceChange?: (uid: string) => void;
    onPresetChange?: (name: string) => void;
    masterVolume?: number;
    onMasterVolumeChange?: (vol: number) => void;
    onMasterVolumeCommit?: (vol: number) => void;
    inputVolume?: number;
    onInputVolumeChange?: (vol: number) => void;
    onInputVolumeCommit?: (vol: number) => void;
    balance?: number;
    onBalanceChange?: (bal: number) => void;
    onTestChannel?: (channel: "left" | "right") => void;
    isMuted?: boolean;
    onMasterMuteToggle?: () => void;
    isInputMuted?: boolean;
    onInputMuteToggle?: () => void;
    isAudioActive?: boolean;
    disabled?: boolean;
  }

  let {
    devices = [],
    inputDevices = [],
    presets = [],
    selectedDevice = "",
    selectedInputDevice = "",
    selectedPreset = "",
    onDeviceChange,
    onInputDeviceChange,
    onPresetChange,
    masterVolume = 100,
    onMasterVolumeChange,
    onMasterVolumeCommit,
    inputVolume = 85,
    onInputVolumeChange,
    onInputVolumeCommit,
    balance = 0,
    onBalanceChange,
    onTestChannel,
    isMuted = false,
    onMasterMuteToggle,
    isInputMuted = false,
    onInputMuteToggle,
    isAudioActive = false,
    disabled = false,
  }: Props = $props();

  let internalMasterVol = $state(100);
  let internalInputVol = $state(85);
  let internalBalance = $state(0);
  let testingChannel = $state<"left" | "right" | null>(null);
  let isAudiblePreviewPlaying = $state(false);

  // Sync internal state when external props change
  $effect(() => {
    internalMasterVol = masterVolume;
  });

  $effect(() => {
    internalInputVol = inputVolume;
  });

  $effect(() => {
    internalBalance = balance;
  });

  // Calculate dynamic stereo meter levels
  const gainScalar = $derived(internalMasterVol / 100);
  const balL = $derived(internalBalance > 0 ? (100 - internalBalance) / 100 : 1);
  const balR = $derived(internalBalance < 0 ? (100 + internalBalance) / 100 : 1);

  const dynamicL = $derived(
    isMuted
      ? 0
      : testingChannel === "left"
      ? 95
      : Math.round(liveAudioMetersState.levelL * gainScalar * balL)
  );

  const dynamicR = $derived(
    isMuted
      ? 0
      : testingChannel === "right"
      ? 95
      : Math.round(liveAudioMetersState.levelR * gainScalar * balR)
  );

  const activeDeviceObj = $derived(devices.find((d) => d.uid === selectedDevice));
  const isHeadphones = $derived(
    activeDeviceObj ? /headphone|airpods|earphones/i.test(activeDeviceObj.name) : true
  );

  function handleVolumeChange(val: number) {
    internalMasterVol = val;
    onMasterVolumeChange?.(val);
  }

  function handleVolumeCommit(val: number) {
    internalMasterVol = val;
    onMasterVolumeCommit?.(val);
  }

  function handleInputVolumeChange(val: number) {
    internalInputVol = val;
    onInputVolumeChange?.(val);
  }

  function handleInputVolumeCommit(val: number) {
    internalInputVol = val;
    onInputVolumeCommit?.(val);
  }

  function handleBalanceCommit(val: number) {
    internalBalance = val;
    onBalanceChange?.(val);
  }

  async function handlePlayStereoPreview() {
    if (isAudiblePreviewPlaying) return;
    isAudiblePreviewPlaying = true;
    try {
      await playHeadphoneChannelTone("left", { volume: 0.6, durationSeconds: 0.25 });
      await new Promise((r) => setTimeout(r, 80));
      await playHeadphoneChannelTone("right", { volume: 0.6, durationSeconds: 0.25 });
    } catch {
      // AudioContext fallback
    } finally {
      isAudiblePreviewPlaying = false;
    }
  }

  async function handleTestChannel(channel: "left" | "right") {
    testingChannel = channel;
    try {
      await playHeadphoneChannelTone(channel, {
        volume: Math.max(0.4, (internalMasterVol / 100) * 0.8),
      });
    } catch {
      // AudioContext fallback
    }
    onTestChannel?.(channel);
    setTimeout(() => {
      if (testingChannel === channel) {
        testingChannel = null;
      }
    }, 450);
  }
</script>

<section class="p-4 panel" aria-label="Master Output Console">
  <!-- Console Header -->
  <div class="flex items-center justify-between mb-3 pb-2.5 border-b border-(--line)">
    <div class="flex items-center gap-2.5">
      <div
        class="w-7 h-7 rounded-lg bg-(--soft) border border-(--line) flex items-center justify-center text-(--accent-text)"
      >
        {#if isHeadphones}
          <Headphones class="w-4 h-4" />
        {:else}
          <Speaker class="w-4 h-4" />
        {/if}
      </div>
      <div>
        <h3 class="text-xs font-bold text-(--ink) tracking-tight m-0">
          Master Output Channel
        </h3>
        <p class="text-[10px] text-(--muted) m-0">
          Hardware CoreAudio Master Bus
        </p>
      </div>
    </div>

    <div class="flex items-center gap-2">
      <!-- Quick Stereo Test Button -->
      <button
        type="button"
        onclick={handlePlayStereoPreview}
        disabled={disabled || isAudiblePreviewPlaying}
        class="px-2 py-0.5 rounded text-[10px] font-semibold transition-all cursor-pointer flex items-center gap-1 {isAudiblePreviewPlaying
          ? 'bg-(--accent) text-(--accent-ink)'
          : 'bg-(--surface) border border-(--line) text-(--muted) hover:text-(--ink)'}"
        title="Play stereo L-R test chimes"
      >
        {#if isAudiblePreviewPlaying}
          <Square class="w-2.5 h-2.5" />
          <span>Testing…</span>
        {:else}
          <Play class="w-2.5 h-2.5" />
          <span>Stereo Test</span>
        {/if}
      </button>

      <span class="badge {isAudioActive ? 'badge-ok' : ''} text-[9px] px-2 py-0.5">
        {#if isAudioActive}
          <Check class="w-3 h-3 text-(--success)" />
        {:else}
          <span class="w-1.5 h-1.5 rounded-full bg-(--muted)"></span>
        {/if}
        {isAudioActive ? "Stream Active" : "Standby"}
      </span>
      <span class="text-[10px] text-(--muted) tabular-nums hidden sm:inline">
        48.0 kHz · 24-bit Stereo
      </span>
    </div>
  </div>

  <!-- Device & Preset Selectors Row -->
  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-3.5">
    <!-- Output Device Selector -->
    <div class="min-w-0">
      <label for="output-device-select" class="text-[10px] font-semibold text-(--muted) mb-1 block">
        Output Audio Device
      </label>
      <div class="relative">
        <div class="absolute left-2.5 top-1/2 -translate-y-1/2 text-(--accent-text) pointer-events-none">
          {#if isHeadphones}
            <Headphones class="w-3.5 h-3.5" />
          {:else}
            <Volume2 class="w-3.5 h-3.5" />
          {/if}
        </div>
        <select
          id="output-device-select"
          value={selectedDevice}
          onchange={(e) => onDeviceChange?.(e.currentTarget.value)}
          disabled={disabled}
          class="w-full h-8 pl-8 pr-7 text-xs rounded-lg bg-(--paper) border border-(--input-line) text-(--ink) focus:outline-none focus:border-(--focus) appearance-none cursor-pointer truncate font-sans"
        >
          {#if devices.length === 0}
            <option value="">Loading devices…</option>
          {:else}
            {#each devices as d}
              <option value={d.uid}>
                {d.name}{d.is_default ? " (Default)" : ""}
              </option>
            {/each}
          {/if}
        </select>
        <ChevronDown class="w-3.5 h-3.5 text-(--muted) absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>
    </div>

    <!-- Acoustic Preset Selector -->
    <div class="min-w-0">
      <label for="preset-select" class="text-[10px] font-semibold text-(--muted) mb-1 block">
        Acoustic Profile
      </label>
      <div class="relative">
        <div class="absolute left-2.5 top-1/2 -translate-y-1/2 text-(--warning) pointer-events-none">
          <Sliders class="w-3.5 h-3.5" />
        </div>
        <select
          id="preset-select"
          value={selectedPreset}
          onchange={(e) => onPresetChange?.(e.currentTarget.value)}
          disabled={disabled}
          class="w-full h-8 pl-8 pr-7 text-xs rounded-lg bg-(--paper) border border-(--input-line) text-(--ink) focus:outline-none focus:border-(--focus) appearance-none cursor-pointer truncate font-sans"
        >
          {#if presets.length === 0}
            <option value="">Default Flat</option>
          {:else}
            {#each presets as p}
              <option value={p.name}>
                {p.name}{p.is_default ? " (Default)" : ""}
              </option>
            {/each}
          {/if}
        </select>
        <ChevronDown class="w-3.5 h-3.5 text-(--muted) absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>
    </div>
  </div>

  <!-- Optional Hardware Input Selector (if inputDevices provided) -->
  {#if inputDevices.length > 0}
    <div class="mb-3.5 pt-2 border-t border-(--line)">
      <div class="flex items-center justify-between mb-1">
        <label for="input-device-select" class="text-[10px] font-semibold text-(--muted) block">
          Hardware Input Microphone
        </label>
        <button
          type="button"
          onclick={onInputMuteToggle}
          class="text-[10px] font-semibold flex items-center gap-1 text-(--muted) hover:text-(--ink) cursor-pointer"
        >
          {#if isInputMuted}
            <MicOff class="w-3 h-3 text-(--error)" />
            <span class="text-(--error)">Mic Muted</span>
          {:else}
            <Mic class="w-3 h-3 text-(--accent-text)" />
            <span>Mic Live ({internalInputVol}%)</span>
          {/if}
        </button>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-center">
        <div class="relative">
          <div class="absolute left-2.5 top-1/2 -translate-y-1/2 text-(--accent-text) pointer-events-none">
            {#if isInputMuted}
              <MicOff class="w-3.5 h-3.5 text-(--error)" />
            {:else}
              <Mic class="w-3.5 h-3.5" />
            {/if}
          </div>
          <select
            id="input-device-select"
            value={selectedInputDevice}
            onchange={(e) => onInputDeviceChange?.(e.currentTarget.value)}
            disabled={disabled}
            class="w-full h-8 pl-8 pr-7 text-xs rounded-lg bg-(--paper) border border-(--input-line) text-(--ink) focus:outline-none focus:border-(--focus) appearance-none cursor-pointer truncate font-sans"
          >
            {#each inputDevices as d}
              <option value={d.uid}>
                {d.name}{d.is_default ? " (Default)" : ""}
              </option>
            {/each}
          </select>
          <ChevronDown class="w-3.5 h-3.5 text-(--muted) absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        <div class="flex items-center gap-2">
          <span class="text-[10px] text-(--muted) font-mono shrink-0">Gain:</span>
          <input
            type="range"
            min="0"
            max="100"
            value={internalInputVol}
            disabled={disabled || isInputMuted}
            oninput={(e) => handleInputVolumeChange(Number(e.currentTarget.value))}
            onpointerup={(e) => handleInputVolumeCommit(Number(e.currentTarget.value))}
            onchange={(e) => handleInputVolumeCommit(Number(e.currentTarget.value))}
            aria-label="Microphone input volume"
            class="volume-slider flex-1"
            style="--level: {internalInputVol}%"
          />
        </div>
      </div>
    </div>
  {/if}

  <!-- Master Volume Slider & Stereo VU Meter -->
  <div class="flex flex-col gap-2.5 pt-1 border-t border-(--line)">
    <div class="flex items-center justify-between text-[11px]">
      <span class="text-(--ink) font-semibold flex items-center gap-1.5">
        <Volume2 class="w-3.5 h-3.5 text-(--accent-text)" />
        Master Volume Fader
      </span>
      <div class="flex items-center gap-2">
        <button
          type="button"
          ondblclick={() => !disabled && handleVolumeCommit(100)}
          title="Double-click to reset to 100% (0 dB)"
          class="font-mono text-(--ink) text-[10px] tabular-nums font-semibold cursor-pointer hover:text-(--accent-text) bg-transparent border-none p-0"
        >
          {internalMasterVol}%
        </button>
        <span class="font-mono text-(--muted) text-[10px] tabular-nums">
          ({internalMasterVol === 0
            ? "-∞ dB"
            : `${Math.round(((internalMasterVol - 100) / 100) * 24)} dB`})
        </span>
      </div>
    </div>

    <div class="flex items-center gap-3">
      <!-- Volume Slider with commit on release -->
      <div class="flex-1 min-w-0 {isMuted ? 'opacity-40' : ''}">
        <input
          type="range"
          min="0"
          max="100"
          value={internalMasterVol}
          disabled={disabled}
          oninput={(e) => handleVolumeChange(Number(e.currentTarget.value))}
          onpointerup={(e) => handleVolumeCommit(Number(e.currentTarget.value))}
          onchange={(e) => handleVolumeCommit(Number(e.currentTarget.value))}
          aria-label="Master output volume"
          class="volume-slider"
          style="--level: {internalMasterVol}%"
        />
      </div>

      <!-- Stereo VU Meter Simulation -->
      <div
        class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-(--paper) border border-(--line) select-none shrink-0"
        title="Stereo Output VU Meter (L / R)"
        aria-label="Stereo Output VU Meter"
      >
        <span class="text-[9px] font-bold text-(--muted) font-mono">L</span>
        <div class="w-10 h-2 bg-(--line) rounded-sm overflow-hidden flex">
          <div
            class="h-full rounded-sm transition-all duration-75 {isAudioActive && !isMuted ? 'bg-(--accent)' : 'bg-(--muted)'}"
            style="width: {dynamicL}%"
          ></div>
        </div>

        <span class="text-[9px] font-bold text-(--muted) font-mono ml-0.5">R</span>
        <div class="w-10 h-2 bg-(--line) rounded-sm overflow-hidden flex">
          <div
            class="h-full rounded-sm transition-all duration-75 {isAudioActive && !isMuted ? 'bg-(--accent)' : 'bg-(--muted)'}"
            style="width: {dynamicR}%"
          ></div>
        </div>
      </div>

      <!-- Master Mute Button -->
      <button
        type="button"
        onclick={onMasterMuteToggle}
        disabled={disabled}
        aria-pressed={isMuted}
        aria-label={isMuted ? "Unmute master output" : "Mute master output"}
        title={isMuted ? "Unmute master output" : "Mute master output"}
        class="h-8 w-8 rounded-lg border flex items-center justify-center shrink-0 transition-colors cursor-pointer {isMuted
          ? 'bg-(--paper) border-(--error) text-(--error)'
          : 'bg-(--paper) border-(--line) text-(--ink) hover:border-(--focus) hover:bg-(--surface)'}"
      >
        {#if isMuted}
          <VolumeX class="w-4 h-4 text-(--error)" />
        {:else}
          <Volume2 class="w-4 h-4 text-(--ink)" />
        {/if}
      </button>
    </div>

    <!-- Stereo Balance Slider (L - C - R) & Left/Right Channel Audio Test Buttons -->
    <div class="flex flex-wrap items-center justify-between gap-2 pt-1 text-[10px] text-(--muted)">
      <div class="flex items-center gap-2 shrink-0">
        <span class="flex items-center gap-1 font-semibold text-(--ink)">
          <Sliders class="w-3 h-3 text-(--muted)" />
          Balance
        </span>

        <!-- Test Left / Test Right Buttons -->
        <div class="flex items-center gap-1 ml-1" role="group" aria-label="Headphone Left and Right Channel Test">
          <button
            type="button"
            onclick={() => handleTestChannel("left")}
            disabled={disabled || testingChannel !== null}
            class="px-2 py-0.5 rounded text-[10px] font-semibold transition-all cursor-pointer flex items-center gap-1 select-none {testingChannel === 'left'
              ? 'bg-(--accent) text-(--accent-ink) shadow-xs scale-105'
              : 'bg-(--paper) border border-(--line) text-(--ink) hover:border-(--focus) hover:bg-(--surface)'}"
            title="Test Left Headphone Channel (Play left earphone chime)"
          >
            {#if testingChannel === "left"}
              <Square class="w-2.5 h-2.5" />
            {:else}
              <Volume1 class="w-2.5 h-2.5 text-(--accent-text)" />
            {/if}
            <span>Test L</span>
          </button>

          <button
            type="button"
            onclick={() => handleTestChannel("right")}
            disabled={disabled || testingChannel !== null}
            class="px-2 py-0.5 rounded text-[10px] font-semibold transition-all cursor-pointer flex items-center gap-1 select-none {testingChannel === 'right'
              ? 'bg-(--accent) text-(--accent-ink) shadow-xs scale-105'
              : 'bg-(--paper) border border-(--line) text-(--ink) hover:border-(--focus) hover:bg-(--surface)'}"
            title="Test Right Headphone Channel (Play right earphone chime)"
          >
            {#if testingChannel === "right"}
              <Square class="w-2.5 h-2.5" />
            {:else}
              <Volume1 class="w-2.5 h-2.5 text-(--accent-text)" />
            {/if}
            <span>Test R</span>
          </button>
        </div>
      </div>

      <div class="flex-1 min-w-35 max-w-50 flex items-center gap-2">
        <span class="font-mono text-[9px] text-(--muted)">L</span>
        <input
          type="range"
          min="-100"
          max="100"
          value={internalBalance}
          disabled={disabled}
          oninput={(e) => (internalBalance = Number(e.currentTarget.value))}
          onpointerup={() => handleBalanceCommit(internalBalance)}
          onchange={() => handleBalanceCommit(internalBalance)}
          aria-label="Stereo balance"
          class="volume-slider"
          style="--level: {(internalBalance + 100) / 2}%"
        />
        <span class="font-mono text-[9px] text-(--muted)">R</span>
      </div>

      <button
        type="button"
        onclick={() => handleBalanceCommit(0)}
        class="text-[10px] text-(--accent-text) hover:opacity-80 transition-opacity font-medium cursor-pointer bg-transparent border-none p-0"
        title="Reset balance to center"
      >
        {#if internalBalance === 0}
          Center (0)
        {:else if internalBalance < 0}
          L {Math.abs(internalBalance)}%
        {:else}
          R {internalBalance}%
        {/if}
      </button>
    </div>
  </div>
</section>
