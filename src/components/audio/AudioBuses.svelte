<script lang="ts">
  import {
    Mic,
    MicOff,
    Bell,
    BellOff,
    Sparkles,
    SlidersHorizontal,
  } from "@lucide/svelte";
  import type { AudioDevice } from "./DeviceQuickBar.svelte";
  import { liveAudioMetersState } from "@/lib/liveAudioMeters.svelte";
  import { audioDspChain } from "@/shared/lib/audioDspChain";

  interface Props {
    inputDevices?: AudioDevice[];
    selectedInputDevice?: string;
    onSelectInputDevice?: (uid: string) => void;
    inputVolume?: number;
    onInputVolumeChange?: (val: number) => void;
    onInputVolumeCommit?: (val: number) => void;
    isInputMuted?: boolean;
    onInputMuteToggle?: () => void;
    systemVolume?: number;
    onSystemVolumeCommit?: (val: number) => void;
    onToast?: (msg: string) => void;
  }

  let {
    inputDevices = [],
    selectedInputDevice = "",
    onSelectInputDevice,
    inputVolume = 85,
    onInputVolumeChange,
    onInputVolumeCommit,
    isInputMuted = false,
    onInputMuteToggle,
    systemVolume = 70,
    onSystemVolumeCommit,
    onToast,
  }: Props = $props();

  // Input Mic State
  let internalMicVol = $state(85);
  let internalSelectedMic = $state("");

  // System Sounds State
  let sysVolume = $state(70);
  let isSystemMuted = $state(false);
  let isPlayingChime = $state(false);


  $effect(() => {
    internalMicVol = inputVolume;
  });

  $effect(() => {
    if (selectedInputDevice) {
      internalSelectedMic = selectedInputDevice;
    }
  });

  $effect(() => {
    sysVolume = systemVolume;
  });

  function handleMicVolumeChange(val: number) {
    internalMicVol = val;
    onInputVolumeChange?.(val);
  }

  function handleMicVolumeCommit(val: number) {
    internalMicVol = val;
    onInputVolumeCommit?.(val);
  }

  // Live input audio bouncing level meter
  const inputMeterLvl = $derived(
    isInputMuted ? 0 : Math.round(liveAudioMetersState.levelL * (internalMicVol / 100))
  );

  function handleTestChime() {
    isPlayingChime = true;
    try {
      const ctx = audioDspChain.getContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
      osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.15); // A6 note

      gain.gain.setValueAtTime((sysVolume / 100) * 0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

      osc.connect(gain);
      const input = audioDspChain.getInputNode();
      if (input) {
        gain.connect(input);
      } else {
        gain.connect(ctx.destination);
      }

      osc.start();
      osc.stop(ctx.currentTime + 0.36);
    } catch {
      // AudioContext fallback
    }

    onToast?.("Playing macOS alert chime test (routed through DSP)");
    setTimeout(() => {
      isPlayingChime = false;
    }, 500);
  }
</script>

<div class="space-y-3 select-none">
  <!-- Bus Rack Header & Sub-Tab Switcher -->
  <div class="flex items-center justify-between pb-1">
    <div class="flex items-center gap-2">
      <SlidersHorizontal class="w-3.5 h-3.5 text-(--accent-text)" />
      <span class="text-xs font-bold uppercase tracking-wider text-(--ink)">
        Studio Audio Routing Buses
      </span>
    </div>

  </div>

  <!-- 2. Hardware Input & System Sounds Channels Grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <!-- 1. Input Microphone Channel -->
      <div class="p-3.5 panel flex flex-col justify-between gap-2.5">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div
              class="w-6 h-6 rounded-lg flex items-center justify-center transition-colors {isInputMuted
                ? 'bg-(--paper) border border-(--error) text-(--error)'
                : 'bg-(--soft) border border-(--line) text-(--accent-text)'}"
            >
              {#if isInputMuted}
                <MicOff class="w-3.5 h-3.5" />
              {:else}
                <Mic class="w-3.5 h-3.5" />
              {/if}
            </div>
            <div>
              <h4 class="text-xs font-bold text-(--ink) tracking-tight m-0">
                Microphone Input
              </h4>
              <p class="text-[10px] text-(--muted) m-0">Hardware Input Bus</p>
            </div>
          </div>

          <span class="badge {isInputMuted ? 'badge-err' : 'badge-ok'} text-[9px] px-1.5 py-0 font-mono">
            {isInputMuted ? "MUTED" : "LIVE"}
          </span>
        </div>

        <!-- Mic Source Dropdown -->
        <select
          value={internalSelectedMic || (inputDevices.find((d) => d.is_default)?.uid ?? "")}
          onchange={(e) => {
            const val = e.currentTarget.value;
            internalSelectedMic = val;
            onSelectInputDevice?.(val);
            const dev = inputDevices.find((d) => d.uid === val);
            onToast?.(`Microphone switched to ${dev ? dev.name : "System Default"}`);
          }}
          class="w-full h-7 text-xs bg-(--paper) border border-(--input-line) text-(--ink) rounded-md px-2 focus:outline-none focus:border-(--focus) cursor-pointer truncate font-sans"
        >
          {#if inputDevices.length === 0}
            <option value="">Default Microphone</option>
          {:else}
            {#each inputDevices as d}
              <option value={d.uid}>
                {d.name}{d.is_default ? " (Default)" : ""}
              </option>
            {/each}
          {/if}
        </select>

        <!-- Mic Gain Slider & VU Meter -->
        <div class="flex flex-col gap-1.5 pt-1 border-t border-(--line)">
          <div class="flex items-center justify-between text-[11px] text-(--muted) px-0.5">
            <span>Input Gain</span>
            <div class="flex items-center gap-1.5">
              <button
                type="button"
                ondblclick={() => !isInputMuted && handleMicVolumeCommit(85)}
                title="Double-click to reset to 85%"
                class="font-mono text-(--ink) tabular-nums font-semibold cursor-pointer hover:text-(--accent-text) bg-transparent border-none p-0"
              >
                {internalMicVol}%
              </button>
              <span class="font-mono text-(--muted) text-[10px] tabular-nums">
                ({internalMicVol === 0
                  ? "-∞ dB"
                  : `${Math.round(((internalMicVol - 100) / 100) * 24)} dB`})
              </span>
            </div>
          </div>

          <div class="flex items-center gap-2.5">
            <div class="flex-1 min-w-0 {isInputMuted ? 'opacity-40' : ''}">
              <input
                type="range"
                min="0"
                max="100"
                value={internalMicVol}
                disabled={isInputMuted}
                oninput={(e) => handleMicVolumeChange(Number(e.currentTarget.value))}
                onpointerup={(e) => handleMicVolumeCommit(Number(e.currentTarget.value))}
                onchange={(e) => handleMicVolumeCommit(Number(e.currentTarget.value))}
                aria-label="Microphone input gain"
                class="volume-slider"
                style="--level: {internalMicVol}%"
              />
            </div>

            <!-- Input VU Meter -->
            <div
              class="w-10 h-2 bg-(--line) rounded-sm overflow-hidden flex shrink-0"
              title="Microphone Input Level ({inputMeterLvl}%)"
            >
              <div
                class="h-full rounded-sm transition-all duration-75 {!isInputMuted
                  ? 'bg-(--accent)'
                  : 'bg-(--muted)'}"
                style="width: {inputMeterLvl}%"
              ></div>
            </div>

            <button
              type="button"
              onclick={onInputMuteToggle}
              class="h-7 w-7 rounded-lg border flex items-center justify-center shrink-0 cursor-pointer {isInputMuted
                ? 'bg-(--paper) border-(--error) text-(--error)'
                : 'bg-(--paper) border-(--line) text-(--muted) hover:text-(--ink)'}"
              aria-label={isInputMuted ? "Unmute microphone" : "Mute microphone"}
              title={isInputMuted ? "Unmute microphone" : "Mute microphone"}
            >
              {#if isInputMuted}
                <MicOff class="w-3.5 h-3.5 text-(--error)" />
              {:else}
                <Mic class="w-3.5 h-3.5" />
              {/if}
            </button>
          </div>
        </div>
      </div>

      <!-- 2. macOS System Alerts & Sounds Channel -->
      <div class="p-3.5 panel flex flex-col justify-between gap-2.5">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div
              class="w-6 h-6 rounded-lg flex items-center justify-center transition-colors {isSystemMuted
                ? 'bg-(--paper) border border-(--error) text-(--error)'
                : 'bg-(--soft) border border-(--line) text-(--warning)'}"
            >
              {#if isSystemMuted}
                <BellOff class="w-3.5 h-3.5" />
              {:else}
                <Bell class="w-3.5 h-3.5" />
              {/if}
            </div>
            <div>
              <h4 class="text-xs font-bold text-(--ink) tracking-tight m-0">
                macOS System Sounds
              </h4>
              <p class="text-[10px] text-(--muted) m-0">Alerts, Chimes & Notifications</p>
            </div>
          </div>

          <button
            type="button"
            onclick={handleTestChime}
            class="px-2 py-0.5 rounded-md text-[10px] font-semibold border transition-all cursor-pointer flex items-center gap-1 {isPlayingChime
              ? 'bg-(--accent) border-(--accent) text-(--accent-ink) shadow-xs'
              : 'bg-(--paper) border-(--line) text-(--muted) hover:text-(--ink) hover:border-(--focus)'}"
            title="Play sample macOS notification sound"
          >
            <Sparkles class="w-3 h-3 text-(--warning)" />
            <span>Test Chime</span>
          </button>
        </div>

        <div class="flex items-center justify-between text-[11px] text-(--muted) px-0.5">
          <span>Alert Effects Volume</span>
          <span class="font-mono text-(--ink) tabular-nums">{sysVolume}%</span>
        </div>

        <!-- Volume Slider & Mute -->
        <div class="flex items-center gap-2.5 pt-1 border-t border-(--line)">
          <div class="flex-1 min-w-0 {isSystemMuted ? 'opacity-40' : ''}">
            <input
              type="range"
              min="0"
              max="100"
              value={sysVolume}
              disabled={isSystemMuted}
              oninput={(e) => (sysVolume = Number(e.currentTarget.value))}
              onpointerup={() => {
                onSystemVolumeCommit?.(sysVolume);
                onToast?.(`System alerts volume set to ${sysVolume}%`);
              }}
              onchange={() => {
                onSystemVolumeCommit?.(sysVolume);
                onToast?.(`System alerts volume set to ${sysVolume}%`);
              }}
              aria-label="System sounds volume"
              class="volume-slider"
              style="--level: {sysVolume}%"
            />
          </div>

          <button
            type="button"
            onclick={() => {
              isSystemMuted = !isSystemMuted;
              onToast?.(isSystemMuted ? "System sounds muted" : "System sounds unmuted");
            }}
            class="h-7 w-7 rounded-lg border flex items-center justify-center shrink-0 cursor-pointer {isSystemMuted
              ? 'bg-(--paper) border-(--error) text-(--error)'
              : 'bg-(--paper) border-(--line) text-(--muted) hover:text-(--ink)'}"
            aria-label={isSystemMuted ? "Unmute system sounds" : "Mute system sounds"}
            title={isSystemMuted ? "Unmute system sounds" : "Mute system sounds"}
          >
            {#if isSystemMuted}
              <BellOff class="w-3.5 h-3.5 text-(--error)" />
            {:else}
              <Bell class="w-3.5 h-3.5" />
            {/if}
          </button>
        </div>
      </div>
    </div>
</div>
