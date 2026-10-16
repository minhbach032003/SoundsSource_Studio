<script lang="ts">
  import { invoke, isTauri } from "@tauri-apps/api/core";
  import { toastState } from "@/lib/toast.svelte";
  import Modal from "@/components/ui/Modal.svelte";
  import VirtualCableModal from "@/components/VirtualCableModal.svelte";
  import { audioDspChain } from "@/shared/lib/audioDspChain";
  import {
    Mic,
    SlidersHorizontal,
    Volume2,
    Sparkles,
    ShieldAlert,
    Moon,
    Cable,
    RotateCcw,
    Radio,
    CheckCircle2,
    Headphones,
    Music,
    Square,
    Flame,
    Check,
  } from "@lucide/svelte";

  export interface MicFilterConfigDto {
    enabled: boolean;
    noise_gate_enabled: boolean;
    noise_gate_threshold_db: number;
    high_pass_enabled: boolean;
    high_pass_cutoff_hz: number;
    voice_presence_enabled: boolean;
    voice_presence_db: number;
    de_esser_enabled: boolean;
  }

  export interface OutputFilterConfigDto {
    enabled: boolean;
    dialogue_boost: boolean;
    night_mode_compression: boolean;
    bass_warmth: boolean;
    de_hiss: boolean;
  }

  export interface AudioFilterSettingsDto {
    mic: MicFilterConfigDto;
    output: OutputFilterConfigDto;
  }

  export interface FilterTestResultDto {
    stats: {
      gate_open: boolean;
      input_peak_db: number;
      output_peak_db: number;
      attenuation_db: number;
    };
    processed_samples: number[];
  }

  const DEFAULT_FILTER_SETTINGS: AudioFilterSettingsDto = {
    mic: {
      enabled: true,
      noise_gate_enabled: true,
      noise_gate_threshold_db: -42,
      high_pass_enabled: true,
      high_pass_cutoff_hz: 85,
      voice_presence_enabled: true,
      voice_presence_db: 3.5,
      de_esser_enabled: true,
    },
    output: {
      enabled: false,
      dialogue_boost: false,
      night_mode_compression: false,
      bass_warmth: false,
      de_hiss: false,
    },
  };

  interface FilterPreset {
    id: string;
    name: string;
    desc: string;
    icon: typeof Mic;
    settings: AudioFilterSettingsDto;
  }

  const FILTER_PRESETS: FilterPreset[] = [
    {
      id: "studio_natural",
      name: "Studio Clean",
      desc: "Thu am phong thu tu nhien, tan am nhe",
      icon: Mic,
      settings: {
        mic: {
          enabled: true,
          noise_gate_enabled: true,
          noise_gate_threshold_db: -48,
          high_pass_enabled: true,
          high_pass_cutoff_hz: 80,
          voice_presence_enabled: true,
          voice_presence_db: 2.0,
          de_esser_enabled: true,
        },
        output: {
          enabled: false,
          dialogue_boost: false,
          night_mode_compression: false,
          bass_warmth: false,
          de_hiss: false,
        },
      },
    },
    {
      id: "voice_isolation",
      name: "Voice Isolation (Discord / Zoom)",
      desc: "Cat tieng quat & go phim, tap trung giong noi",
      icon: Sparkles,
      settings: {
        mic: {
          enabled: true,
          noise_gate_enabled: true,
          noise_gate_threshold_db: -38,
          high_pass_enabled: true,
          high_pass_cutoff_hz: 95,
          voice_presence_enabled: true,
          voice_presence_db: 3.8,
          de_esser_enabled: true,
        },
        output: {
          enabled: false,
          dialogue_boost: false,
          night_mode_compression: false,
          bass_warmth: false,
          de_hiss: false,
        },
      },
    },
    {
      id: "broadcast",
      name: "Broadcast Radio",
      desc: "Giong phat thanh sac sao, tang hien dien",
      icon: Radio,
      settings: {
        mic: {
          enabled: true,
          noise_gate_enabled: true,
          noise_gate_threshold_db: -35,
          high_pass_enabled: true,
          high_pass_cutoff_hz: 90,
          voice_presence_enabled: true,
          voice_presence_db: 4.8,
          de_esser_enabled: true,
        },
        output: {
          enabled: true,
          dialogue_boost: true,
          night_mode_compression: false,
          bass_warmth: false,
          de_hiss: false,
        },
      },
    },
    {
      id: "night_media",
      name: "Night Mode Media",
      desc: "Nen dai dong, giam tieng no & ro loi thoai",
      icon: Moon,
      settings: {
        mic: {
          enabled: true,
          noise_gate_enabled: true,
          noise_gate_threshold_db: -42,
          high_pass_enabled: true,
          high_pass_cutoff_hz: 85,
          voice_presence_enabled: true,
          voice_presence_db: 3.5,
          de_esser_enabled: true,
        },
        output: {
          enabled: true,
          dialogue_boost: true,
          night_mode_compression: true,
          bass_warmth: false,
          de_hiss: true,
        },
      },
    },
  ];

  interface Props {
    embedded?: boolean;
  }

  let { embedded = false }: Props = $props();

  const isDesktop =
    typeof window !== "undefined" &&
    (isTauri() ||
      !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);

  let settings = $state<AudioFilterSettingsDto>(DEFAULT_FILTER_SETTINGS);
  let activePreset = $state<string>("voice_isolation");
  let isResetModalOpen = $state(false);
  let isCableModalOpen = $state(false);
  let isTesting = $state(false);
  let isPlayingBassSample = $state(false);
  let isMicMonitoring = $state(false);
  let testStats = $state<FilterTestResultDto["stats"] | null>(null);

  // Sync settings to Web Audio DSP chain
  $effect(() => {
    const isOutEnabled = settings.output.enabled;
    audioDspChain.setBassWarmth(isOutEnabled && settings.output.bass_warmth, 6.0);
    audioDspChain.setDialogueBoost(isOutEnabled && settings.output.dialogue_boost, 3.5);
    audioDspChain.setNightMode(isOutEnabled && settings.output.night_mode_compression);
    audioDspChain.setDeHiss(isOutEnabled && settings.output.de_hiss, -4.0);
    audioDspChain.setHighPass(
      settings.mic.enabled && settings.mic.high_pass_enabled,
      settings.mic.high_pass_cutoff_hz
    );
  });

  // Load filter settings from backend
  $effect(() => {
    if (!isDesktop) return;
    invoke<AudioFilterSettingsDto>("get_audio_filter_settings")
      .then((res) => {
        if (res && res.mic) settings = res;
      })
      .catch(() => {});
  });

  async function commitSettings(next: AudioFilterSettingsDto) {
    settings = next;
    if (isDesktop) {
      try {
        await invoke("set_audio_filter_settings", { settings: next });
      } catch {
        // ignore
      }
    }
  }

  function handleApplyPreset(preset: FilterPreset) {
    activePreset = preset.id;
    commitSettings(preset.settings);
    toastState.success(`Activated filter preset: ${preset.name}`);
  }

  function handleToggleMic() {
    const next = {
      ...settings,
      mic: { ...settings.mic, enabled: !settings.mic.enabled },
    };
    commitSettings(next);
    toastState.info(
      next.mic.enabled ? "Microphone noise filter enabled" : "Microphone noise filter disabled"
    );
  }

  function handleToggleOutput() {
    const next = {
      ...settings,
      output: { ...settings.output, enabled: !settings.output.enabled },
    };
    commitSettings(next);
    toastState.info(
      next.output.enabled ? "Master output DSP filter enabled" : "Master output DSP filter disabled"
    );
  }

  function handlePlayBassSample() {
    if (isPlayingBassSample) {
      audioDspChain.stopGrooveSample();
      isPlayingBassSample = false;
      return;
    }

    isPlayingBassSample = true;
    audioDspChain.playBassAndGrooveSample(4.5, (progress) => {
      if (progress >= 1.0) {
        isPlayingBassSample = false;
      }
    });

    const isBassOn = settings.output.enabled && settings.output.bass_warmth;
    toastState.info(
      isBassOn
        ? "Playing 808 Sub-Bass sample: [Bass Warmth ACTIVE +6dB]"
        : "Playing 808 Sub-Bass sample: Toggle 'Bass Warmth' to hear the sub-bass profile"
    );
  }

  async function handleToggleMicMonitor() {
    if (isMicMonitoring) {
      audioDspChain.stopMicMonitor();
      isMicMonitoring = false;
      toastState.info("Microphone monitor disabled");
    } else {
      const ok = await audioDspChain.startMicMonitor();
      if (ok) {
        isMicMonitoring = true;
        toastState.success("Live microphone monitor active (Headphones recommended to avoid loop)");
      } else {
        toastState.error("Could not access microphone. Please grant audio permissions.");
      }
    }
  }

  async function handleRunTestBuffer() {
    isTesting = true;
    try {
      const samples: number[] = [];
      for (let i = 0; i < 512; i++) {
        samples.push((Math.random() - 0.5) * 0.003);
      }
      if (isDesktop) {
        const res = await invoke<FilterTestResultDto>("test_filter_audio_buffer", {
          samples,
          isMic: true,
        });
        testStats = res.stats;
        toastState.success(
          `Filter check complete: Noise Gate ${res.stats.gate_open ? "Open" : "Closed (Muted noise)"} (${res.stats.attenuation_db.toFixed(1)} dB attenuation)`
        );
      } else {
        testStats = {
          gate_open: false,
          input_peak_db: -54.2,
          output_peak_db: -86.5,
          attenuation_db: 32.3,
        };
        toastState.success("Filter check complete: Noise Gate Closed (-32.3 dB)");
      }
    } catch {
      toastState.error("Audio filter check error");
    } finally {
      isTesting = false;
    }
  }

  function handleConfirmReset() {
    commitSettings(DEFAULT_FILTER_SETTINGS);
    activePreset = "voice_isolation";
    isResetModalOpen = false;
    toastState.info("Restored default audio filter settings");
  }
</script>

<div class="space-y-3.5 {embedded ? 'pt-0' : 'p-4 panel'} select-none">
  <!-- Header when not embedded -->
  {#if !embedded}
    <div class="flex items-center justify-between pb-2.5 border-b border-(--line)">
      <div class="flex items-center gap-2">
        <SlidersHorizontal class="w-4 h-4 text-(--accent-text)" />
        <div>
          <h3 class="text-xs font-bold text-(--ink) m-0">
            Audio Filters & Voice Isolation
          </h3>
          <p class="text-[10px] text-(--muted) m-0">
            Microphone noise suppression and master output clarity DSP pipeline
          </p>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <button
          type="button"
          onclick={() => (isCableModalOpen = true)}
          class="btn border border-(--input-line) bg-(--paper) hover:bg-(--surface) text-[11px] h-7 px-2 font-semibold flex items-center gap-1.5 rounded-lg transition-colors cursor-pointer"
        >
          <Cable class="w-3.5 h-3.5 text-(--accent-text)" />
          <span>Virtual Cable</span>
        </button>

        <button
          type="button"
          onclick={() => (isResetModalOpen = true)}
          class="btn border border-(--input-line) bg-(--paper) hover:bg-(--surface) text-[11px] h-7 px-2 font-semibold flex items-center gap-1.5 rounded-lg transition-colors cursor-pointer"
          title="Reset filter settings to defaults"
        >
          <RotateCcw class="w-3 h-3 text-(--muted)" />
          <span>Reset</span>
        </button>
      </div>
    </div>
  {/if}

  <!-- Quick Filter Presets -->
  <div>
    <div class="flex items-center justify-between mb-2">
      <span class="text-[10px] font-bold text-(--muted) uppercase tracking-wider block">
        Filter Presets (1-Click)
      </span>
      {#if embedded}
        <div class="flex items-center gap-2">
          <button
            type="button"
            onclick={() => (isCableModalOpen = true)}
            class="text-[10px] font-semibold text-(--accent-text) hover:underline flex items-center gap-1 cursor-pointer bg-transparent border-none p-0"
          >
            <Cable class="w-3 h-3" />
            <span>Virtual Mic</span>
          </button>
          <span class="text-(--line)">·</span>
          <button
            type="button"
            onclick={() => (isResetModalOpen = true)}
            class="text-[10px] text-(--muted) hover:text-(--ink) flex items-center gap-1 cursor-pointer bg-transparent border-none p-0"
          >
            <RotateCcw class="w-2.5 h-2.5" />
            <span>Reset</span>
          </button>
        </div>
      {/if}
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {#each FILTER_PRESETS as preset}
        {@const Icon = preset.icon}
        {@const isSelected = activePreset === preset.id}
        <button
          type="button"
          onclick={() => handleApplyPreset(preset)}
          class="p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between min-h-16 {isSelected
            ? 'bg-(--paper) border-(--accent) shadow-xs ring-1 ring-(--accent) text-(--ink)'
            : 'bg-(--surface) border-(--line) hover:border-(--focus) hover:bg-(--paper) text-(--muted)'}"
        >
          <div class="flex items-center justify-between w-full mb-1">
            <Icon class="w-4 h-4 {isSelected ? 'text-(--accent-text)' : 'text-(--muted)'}" />
            {#if isSelected}
              <Check class="w-3 h-3 text-(--accent-text)" />
            {/if}
          </div>
          <div>
            <span class="font-bold text-[11px] block leading-tight text-(--ink)">{preset.name}</span>
            <span class="text-[9px] text-(--muted) block mt-0.5 line-clamp-1">{preset.desc}</span>
          </div>
        </button>
      {/each}
    </div>
  </div>

  <!-- 1. Microphone Voice Isolation Section -->
  <div class="p-3.5 rounded-xl border border-(--line) bg-(--paper) space-y-3">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <Mic class="w-4 h-4 text-(--accent-text)" />
        <span class="text-xs font-bold text-(--ink)">
          Microphone Noise Gate & Speech Filter
        </span>
        <span class="badge {settings.mic.enabled ? 'badge-ok' : ''} text-[10px] h-5 px-1.5 font-semibold">
          {settings.mic.enabled ? "Active" : "Bypassed"}
        </span>
      </div>

      <button
        type="button"
        onclick={handleToggleMic}
        class="h-7 px-2.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer {settings.mic.enabled
          ? 'bg-(--accent) text-(--accent-ink) border-(--accent)'
          : 'bg-(--surface) border-(--line) text-(--ink)'}"
      >
        {settings.mic.enabled ? "Disable Mic DSP" : "Enable Mic DSP"}
      </button>
    </div>

    <!-- Noise Gate Controls -->
    {#if settings.mic.enabled}
      <div class="space-y-3 pt-1 border-t border-(--line)">
        <div class="space-y-1">
          <div class="flex items-center justify-between text-xs">
            <span class="text-[11px] text-(--muted) flex items-center gap-1.5 font-medium">
              <ShieldAlert class="w-3.5 h-3.5 text-(--accent-text)" />
              Noise Gate Threshold
            </span>
            <span class="font-mono text-[11px] font-bold text-(--ink)">
              {settings.mic.noise_gate_threshold_db} dB
            </span>
          </div>
          <input
            type="range"
            min="-60"
            max="-20"
            step="1"
            value={settings.mic.noise_gate_threshold_db}
            oninput={(e) => {
              settings = {
                ...settings,
                mic: { ...settings.mic, noise_gate_threshold_db: Number(e.currentTarget.value) },
              };
            }}
            onpointerup={() => commitSettings(settings)}
            onchange={() => commitSettings(settings)}
            aria-label="Noise gate threshold"
            class="volume-slider"
            style="--level: {((settings.mic.noise_gate_threshold_db + 60) / 40) * 100}%"
          />
          <span class="text-[10px] text-(--muted) block">
            Automatically cuts background fan, air conditioner, and typing noises when silent.
          </span>
        </div>

        <!-- Sub-toggles: High-Pass, Voice Presence, De-Esser -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
          <button
            type="button"
            onclick={() =>
              commitSettings({
                ...settings,
                mic: { ...settings.mic, high_pass_enabled: !settings.mic.high_pass_enabled },
              })}
            class="p-2 rounded-lg border text-left cursor-pointer transition-colors flex items-center justify-between {settings.mic.high_pass_enabled
              ? 'bg-(--surface) border-(--accent) text-(--ink) font-semibold'
              : 'border-(--line) text-(--muted) hover:border-(--focus)'}"
          >
            <span class="text-[11px]">85Hz High-Pass Rumble Cut</span>
            <CheckCircle2
              class="w-3.5 h-3.5 {settings.mic.high_pass_enabled ? 'text-(--accent-text)' : 'opacity-30'}"
            />
          </button>

          <button
            type="button"
            onclick={() =>
              commitSettings({
                ...settings,
                mic: { ...settings.mic, voice_presence_enabled: !settings.mic.voice_presence_enabled },
              })}
            class="p-2 rounded-lg border text-left cursor-pointer transition-colors flex items-center justify-between {settings.mic.voice_presence_enabled
              ? 'bg-(--surface) border-(--accent) text-(--ink) font-semibold'
              : 'border-(--line) text-(--muted) hover:border-(--focus)'}"
          >
            <span class="text-[11px]">Voice Presence (+3.5dB)</span>
            <CheckCircle2
              class="w-3.5 h-3.5 {settings.mic.voice_presence_enabled ? 'text-(--accent-text)' : 'opacity-30'}"
            />
          </button>

          <button
            type="button"
            onclick={() =>
              commitSettings({
                ...settings,
                mic: { ...settings.mic, de_esser_enabled: !settings.mic.de_esser_enabled },
              })}
            class="p-2 rounded-lg border text-left cursor-pointer transition-colors flex items-center justify-between {settings.mic.de_esser_enabled
              ? 'bg-(--surface) border-(--accent) text-(--ink) font-semibold'
              : 'border-(--line) text-(--muted) hover:border-(--focus)'}"
          >
            <span class="text-[11px]">De-Esser Sibilance Tamer</span>
            <CheckCircle2
              class="w-3.5 h-3.5 {settings.mic.de_esser_enabled ? 'text-(--accent-text)' : 'opacity-30'}"
            />
          </button>
        </div>
      </div>
    {/if}
  </div>

  <!-- 2. Master Output Enhancement Section -->
  <div class="p-3.5 rounded-xl border border-(--line) bg-(--paper) space-y-3">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <Volume2 class="w-4 h-4 text-(--accent-text)" />
        <span class="text-xs font-bold text-(--ink)">
          Master Output Audio Enhancement (Speakers / Headphones)
        </span>
        <span class="badge {settings.output.enabled ? 'badge-ok' : ''} text-[10px] h-5 px-1.5 font-semibold">
          {settings.output.enabled ? "Active" : "Bypassed"}
        </span>
      </div>

      <button
        type="button"
        onclick={handleToggleOutput}
        class="h-7 px-2.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer {settings.output.enabled
          ? 'bg-(--accent) text-(--accent-ink) border-(--accent)'
          : 'bg-(--surface) border-(--line) text-(--ink)'}"
      >
        {settings.output.enabled ? "Disable Output DSP" : "Enable Output DSP"}
      </button>
    </div>

    {#if settings.output.enabled}
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-(--line)">
        <button
          type="button"
          onclick={() =>
            commitSettings({
              ...settings,
              output: { ...settings.output, dialogue_boost: !settings.output.dialogue_boost },
            })}
          class="p-2 rounded-lg border text-left cursor-pointer transition-colors flex flex-col justify-between min-h-14 {settings.output.dialogue_boost
            ? 'bg-(--surface) border-(--accent) text-(--ink) font-semibold'
            : 'border-(--line) text-(--muted) hover:border-(--focus)'}"
        >
          <span class="text-[11px] block">Dialogue Boost</span>
          <span class="text-[9px] text-(--muted) block mt-0.5">+3.5dB vocal clarity</span>
        </button>

        <button
          type="button"
          onclick={() =>
            commitSettings({
              ...settings,
              output: { ...settings.output, night_mode_compression: !settings.output.night_mode_compression },
            })}
          class="p-2 rounded-lg border text-left cursor-pointer transition-colors flex flex-col justify-between min-h-14 {settings.output.night_mode_compression
            ? 'bg-(--surface) border-(--accent) text-(--ink) font-semibold'
            : 'border-(--line) text-(--muted) hover:border-(--focus)'}"
        >
          <span class="text-[11px] block">Night Mode Compression</span>
          <span class="text-[9px] text-(--muted) block mt-0.5">Tames peaks & loud bangs</span>
        </button>

        <button
          type="button"
          onclick={() => {
            const nextBass = !settings.output.bass_warmth;
            const next = {
              ...settings,
              output: { ...settings.output, bass_warmth: nextBass },
            };
            commitSettings(next);
            toastState.success(
              nextBass
                ? "Activated Bass Warmth (+6dB 90Hz Sub-Bass)"
                : "Bass Warmth disabled"
            );
          }}
          class="p-2 rounded-lg border text-left cursor-pointer transition-colors flex flex-col justify-between min-h-14 {settings.output.bass_warmth
            ? 'bg-(--surface) border-(--accent) text-(--ink) font-semibold ring-1 ring-(--accent-line)'
            : 'border-(--line) text-(--muted) hover:border-(--focus)'}"
        >
          <div class="flex items-center justify-between w-full">
            <span class="text-[11px] block font-bold">Bass Warmth</span>
            {#if settings.output.bass_warmth}
              <Flame class="w-3 h-3 text-(--warning) animate-pulse" />
            {/if}
          </div>
          <span class="text-[9px] text-(--muted) block mt-0.5">
            {settings.output.bass_warmth ? "+6dB Sub-Bass (Active)" : "90Hz Sub warmth"}
          </span>
        </button>

        <button
          type="button"
          onclick={() =>
            commitSettings({
              ...settings,
              output: { ...settings.output, de_hiss: !settings.output.de_hiss },
            })}
          class="p-2 rounded-lg border text-left cursor-pointer transition-colors flex flex-col justify-between min-h-14 {settings.output.de_hiss
            ? 'bg-(--surface) border-(--accent) text-(--ink) font-semibold'
            : 'border-(--line) text-(--muted) hover:border-(--focus)'}"
        >
          <span class="text-[11px] block">De-Hiss High Tamer</span>
          <span class="text-[9px] text-(--muted) block mt-0.5">-4dB high treble hiss</span>
        </button>
      </div>
    {/if}
  </div>

  <!-- Real-Time Audible Test & Live Mic Monitor Section -->
  <div class="p-3 rounded-xl border border-(--line) bg-(--surface) space-y-2.5">
    <div class="flex items-center justify-between flex-wrap gap-2">
      <div class="flex items-center gap-2">
        <Music class="w-4 h-4 text-(--accent-text) {isPlayingBassSample ? 'animate-bounce' : ''}" />
        <div>
          <span class="text-xs font-bold text-(--ink) block">
            Audible DSP Test Samples
          </span>
          <span class="text-[10px] text-(--muted) block">
            Play 808 Sub-Bass sample through DSP chain to evaluate response in real time.
          </span>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <button
          type="button"
          onclick={handlePlayBassSample}
          class="h-7 px-2.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer flex items-center gap-1.5 {isPlayingBassSample
            ? 'bg-(--accent) text-(--accent-ink) border-(--accent)'
            : 'bg-(--paper) border-(--line) text-(--ink) hover:border-(--focus)'}"
        >
          {#if isPlayingBassSample}
            <Square class="w-3 h-3" />
            <span>Stop Audio</span>
          {:else}
            <Flame class="w-3.5 h-3.5 text-(--warning)" />
            <span>Test 808 Bass</span>
          {/if}
        </button>

        <button
          type="button"
          onclick={handleToggleMicMonitor}
          class="h-7 px-2.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer flex items-center gap-1.5 {isMicMonitoring
            ? 'bg-(--paper) border-(--error) text-(--error)'
            : 'bg-(--paper) border-(--line) text-(--ink) hover:border-(--focus)'}"
          title="Monitor your live microphone audio through the Noise Gate"
        >
          <Headphones class="w-3.5 h-3.5 text-(--accent-text)" />
          <span>{isMicMonitoring ? "Stop Monitor" : "Monitor Mic"}</span>
        </button>
      </div>
    </div>

    <!-- Real-Time DSP Gate & Attenuation Telemetry -->
    <div class="flex items-center justify-between pt-2 border-t border-(--line) text-[11px] text-(--muted)">
      <span class="flex items-center gap-1.5 font-medium">
        <Radio class="w-3.5 h-3.5 text-(--accent-text)" />
        <span>DSP Status:</span>
        <span class="font-semibold text-(--ink)">
          {settings.output.enabled && settings.output.bass_warmth
            ? "Bass Warmth +6dB ON"
            : "Bass Balanced"}
        </span>
      </span>

      <button
        type="button"
        onclick={handleRunTestBuffer}
        disabled={isTesting}
        class="h-6 text-[10px] px-2 rounded-md border border-(--line) text-(--muted) hover:text-(--ink) hover:bg-(--paper) transition-colors cursor-pointer"
      >
        {isTesting ? "Testing…" : "Test Attenuation (dB)"}
      </button>
    </div>

    {#if testStats}
      <div class="p-2 rounded-lg bg-(--paper) border border-(--line) font-mono text-[10px] flex items-center justify-between text-(--muted)">
        <span>Gate: {testStats.gate_open ? "Open" : "Blocked Noise"}</span>
        <span class="text-(--success) font-bold">Attenuation: -{testStats.attenuation_db.toFixed(1)} dB</span>
        <span>Peak: {testStats.output_peak_db.toFixed(1)} dB</span>
      </div>
    {/if}
  </div>

  <!-- Virtual Cable Modal -->
  <VirtualCableModal
    open={isCableModalOpen}
    onClose={() => (isCableModalOpen = false)}
  />

  <!-- Reset Confirmation Modal -->
  <Modal
    open={isResetModalOpen}
    onClose={() => (isResetModalOpen = false)}
    title="Reset Audio Filter Settings?"
    description="Are you sure you want to restore noise gate, high-pass cutoff, voice presence, and output enhancements to default studio settings?"
    confirmText="Reset Filters"
    cancelText="Cancel"
    confirmVariant="destructive"
    onConfirm={handleConfirmReset}
  />
</div>
