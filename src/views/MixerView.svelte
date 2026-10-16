<script lang="ts">
  import { invoke, isTauri } from "@tauri-apps/api/core";
  import DeviceQuickBar, { type AudioDevice, type Preset } from "@/components/audio/DeviceQuickBar.svelte";
  import ProcessCard from "@/components/audio/ProcessCard.svelte";
  import { spotifyState } from "@/lib/spotify.svelte";
  import StudioEQInspector, { ACOUSTIC_PROFILES } from "@/components/audio/StudioEQInspector.svelte";
  import AudioFilterPanel from "@/components/audio/AudioFilterPanel.svelte";
  import AudioBuses from "@/components/audio/AudioBuses.svelte";
  import PerformanceDiagnosticsCard from "@/components/diagnostics/PerformanceDiagnosticsCard.svelte";
  import {
    AlertCircle,
    Volume2,
    Cpu,
    Search,
    X,
    Filter,
    Eye,
    SlidersHorizontal,
    Sparkles,
    RefreshCw,
  } from "@lucide/svelte";
  import {
    processKey,
    groupProcesses,
    isAudibleApplication,
    isMediaOrCommunicationApp,
    displayName,
    setMasterBalance as setBackendMasterBalance,
    testHeadphoneChannel,
  } from "@/audio";
  import type { AudioProcess } from "@/audio";
  import { toastState } from "@/lib/toast.svelte";

  const MOCK_PROCESSES: AudioProcess[] = [
    {
      pid: 14820,
      bundle_id: "com.spotify.client",
      name: "Spotify",
      object_id: 14820,
      is_running_output: true,
      is_regular_app: true,
      supports_volume: true,
    },
    {
      pid: 2841,
      bundle_id: "com.brave.Browser",
      name: "Brave Browser",
      object_id: 2841,
      is_running_output: true,
      is_regular_app: true,
      supports_volume: false,
    },
    {
      pid: 8932,
      bundle_id: "com.hnc.Discord",
      name: "Discord",
      object_id: 8932,
      is_running_output: false,
      is_regular_app: true,
      supports_volume: false,
    },
    {
      pid: 4210,
      bundle_id: "com.apple.logic10",
      name: "Logic Pro",
      object_id: 4210,
      is_running_output: false,
      is_regular_app: true,
      supports_volume: false,
    },
  ];

  const MOCK_DEVICES: AudioDevice[] = [
    { name: "MacBook Pro Speakers", uid: "builtin_speaker", is_default: true },
    { name: "External Studio Monitors", uid: "usb_dac", is_default: false },
    { name: "AirPods Pro", uid: "airpods_pro", is_default: false },
  ];

  const MOCK_INPUT_DEVICES: AudioDevice[] = [
    { name: "MOONDROP EDGE (Default)", uid: "moondrop_edge_in", is_default: true },
    { name: "UGREEN Camera 4K", uid: "ugreen_cam_in", is_default: false },
    { name: "MacBook Pro Microphone", uid: "builtin_mic", is_default: false },
  ];

  const MOCK_PRESETS: Preset[] = [
    { name: "Flat (Default)", is_default: true },
    { name: "Bass Boost", is_default: false },
    { name: "Vocal Clarity", is_default: false },
    { name: "Electronic / Dance", is_default: false },
  ];

  interface Props {
    processes?: AudioProcess[];
    channelState?: Record<string, { volume: number; muted: boolean }>;
    devices?: AudioDevice[];
    inputDevices?: AudioDevice[];
    presets?: Preset[];
    selectedDevice?: string;
    selectedInputDevice?: string;
    selectedPreset?: string;
    masterVolume?: number;
    onMasterVolumeChange?: (val: number) => void;
    onMasterVolumeCommit?: (val: number) => void;
    isMasterMuted?: boolean;
    onMasterMuteToggle?: () => void;
    inputVolume?: number;
    onInputVolumeChange?: (val: number) => void;
    onInputVolumeCommit?: (val: number) => void;
    isInputMuted?: boolean;
    onInputMuteToggle?: () => void;
    systemVolume?: number;
    onSystemVolumeCommit?: (val: number) => void;
    onlyPlaying?: boolean;
    isLoading?: boolean;
    error?: string | null;
    onSelectDevice?: (uid: string) => void;
    onSelectInputDevice?: (uid: string) => void;
    onSelectPreset?: (name: string) => void;
    onToggleOnlyPlaying?: (playing: boolean) => void;
    onVolumeCommit?: (process: AudioProcess, volume: number) => Promise<void> | void;
    onMuteToggle?: (process: AudioProcess, muted: boolean) => Promise<void> | void;
    onRouteChange?: (process: AudioProcess, deviceUid: string) => void;
    onEQBandChange?: (bandIndex: number, gainDb: number) => void;
    isEQBypassed?: boolean;
    onResetEQFlat?: () => void;
    onToggleEQBypass?: (bypassed: boolean) => void;
    onError?: (msg: string) => void;
    onRefresh?: () => void;
  }

  let {
    processes: propProcesses,
    channelState: propChannelState,
    devices: propDevices,
    inputDevices: propInputDevices,
    presets: propPresets,
    selectedDevice: propSelectedDevice,
    selectedInputDevice: propSelectedInputDevice,
    selectedPreset: propSelectedPreset,
    masterVolume: propMasterVolume,
    onMasterVolumeChange,
    onMasterVolumeCommit,
    isMasterMuted: propIsMasterMuted,
    onMasterMuteToggle,
    inputVolume: propInputVolume,
    onInputVolumeChange,
    onInputVolumeCommit,
    isInputMuted: propIsInputMuted,
    onInputMuteToggle,
    systemVolume: propSystemVolume,
    onSystemVolumeCommit,
    onlyPlaying: propOnlyPlaying,
    isLoading: propIsLoading,
    error: propError,
    onSelectDevice,
    onSelectInputDevice,
    onSelectPreset,
    onToggleOnlyPlaying,
    onVolumeCommit,
    onMuteToggle,
    onRouteChange,
    onEQBandChange,
    isEQBypassed: propIsEQBypassed,
    onResetEQFlat,
    onToggleEQBypass,
    onError,
    onRefresh,
  }: Props = $props();

  const isDesktop =
    typeof window !== "undefined" &&
    (isTauri() ||
      !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);

  // Internal state fallback when not supplied via props
  let internalProcesses = $state<AudioProcess[]>(isDesktop ? [] : groupProcesses(MOCK_PROCESSES));
  let internalChannelState = $state<Record<string, { volume: number; muted: boolean }>>({
    "com.spotify.client": { volume: 85, muted: false },
    "com.brave.Browser": { volume: 60, muted: false },
    "com.hnc.Discord": { volume: 100, muted: false },
  });
  let internalDevices = $state<AudioDevice[]>(isDesktop ? [] : MOCK_DEVICES);
  let internalInputDevices = $state<AudioDevice[]>(isDesktop ? [] : MOCK_INPUT_DEVICES);
  let internalPresets = $state<Preset[]>(isDesktop ? [] : MOCK_PRESETS);
  let internalSelectedDevice = $state<string>(isDesktop ? "" : MOCK_DEVICES[0].uid);
  let internalSelectedInputDevice = $state<string>(isDesktop ? "" : MOCK_INPUT_DEVICES[0].uid);
  let internalSelectedPreset = $state<string>("Flat (Default)");
  let internalMasterVol = $state(100);
  let internalMasterMuted = $state(false);
  let internalInputVol = $state(85);
  let internalInputMuted = $state(false);
  let internalSystemVol = $state(70);
  let internalOnlyPlaying = $state(false);
  let internalIsLoading = $state(isDesktop);
  let internalError = $state<string | null>(null);
  let internalIsEQBypassed = $state(false);
  let isManualRefreshing = $state(false);

  // Synced derived accessors
  const activeProcesses = $derived(propProcesses ?? internalProcesses);
  const activeChannelState = $derived(propChannelState ?? internalChannelState);
  const activeDevices = $derived(propDevices ?? internalDevices);
  const activeInputDevices = $derived(propInputDevices ?? internalInputDevices);
  const activePresets = $derived(propPresets ?? internalPresets);
  const activeSelectedDevice = $derived(propSelectedDevice ?? internalSelectedDevice);
  const activeSelectedInputDevice = $derived(propSelectedInputDevice ?? internalSelectedInputDevice);
  const activeSelectedPreset = $derived(propSelectedPreset ?? internalSelectedPreset);
  const activeMasterVolume = $derived(propMasterVolume ?? internalMasterVol);
  const activeIsMasterMuted = $derived(propIsMasterMuted ?? internalMasterMuted);
  const activeInputVolume = $derived(propInputVolume ?? internalInputVol);
  const activeIsInputMuted = $derived(propIsInputMuted ?? internalInputMuted);
  const activeSystemVolume = $derived(propSystemVolume ?? internalSystemVol);
  const activeOnlyPlaying = $derived(propOnlyPlaying ?? internalOnlyPlaying);
  const activeIsLoading = $derived(propIsLoading ?? internalIsLoading);
  const activeError = $derived(propError ?? internalError);
  const activeIsEQBypassed = $derived(propIsEQBypassed ?? internalIsEQBypassed);

  let masterBalance = $state(0);
  let dspRackTab = $state<"eq" | "filter">("eq");
  let diagnosticsOpen = $state(false);
  let searchQuery = $state("");
  let channelFilter = $state<"all" | "playing" | "media">("all");

  function initHiddenAppKeys(): Set<string> {
    if (typeof localStorage === "undefined") return new Set<string>();
    try {
      const raw = localStorage.getItem("rust_sound_hidden_apps");
      return raw ? new Set<string>(JSON.parse(raw)) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  }

  // Hidden apps persistence
  let hiddenAppKeys = $state<Set<string>>(initHiddenAppKeys());

  // Load hardware audio data if running in Tauri desktop and props were not supplied
  $effect(() => {
    if (!isDesktop || propProcesses !== undefined) return;

    let isMounted = true;
    async function loadAudioData() {
      try {
        const [procs, devs, inDevs, pres, chState] = await Promise.all([
          invoke<AudioProcess[]>("get_audio_processes").catch(() => []),
          invoke<AudioDevice[]>("get_audio_devices").catch(() => []),
          invoke<AudioDevice[]>("get_audio_input_devices").catch(() => []),
          invoke<Preset[]>("get_presets").catch(() => []),
          invoke<Record<string, { volume: number; muted: boolean }>>("get_channel_states").catch(() => ({})),
        ]);

        if (!isMounted) return;
        internalProcesses = groupProcesses(procs);
        internalDevices = devs;
        internalInputDevices = inDevs;
        internalPresets = pres;
        internalChannelState = Object.fromEntries(Object.entries(chState).map(([key, value]) => [key, { ...value, volume: value.volume * 100 }]));

        const eq = await invoke<{ bands: { gain: number }[]; bypass: boolean }>("get_master_eq_bands");
        internalIsEQBypassed = eq.bypass;
        const matchingProfile = ACOUSTIC_PROFILES.find((profile) => profile.gains.every((gain, index) => Math.abs(gain - (eq.bands[index]?.gain ?? 0)) < 0.01));
        internalSelectedPreset = matchingProfile?.name ?? "Custom";

        const defDev = devs.find((d) => d.is_default);
        if (defDev) internalSelectedDevice = defDev.uid;

        const defInDev = inDevs.find((d) => d.is_default);
        if (defInDev) internalSelectedInputDevice = defInDev.uid;

        internalIsLoading = false;
      } catch (err) {
        if (!isMounted) return;
        internalError = String(err);
        internalIsLoading = false;
      }
    }

    loadAudioData();

    // Background process polling
    const pollId = setInterval(async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const procs = await invoke<AudioProcess[]>("get_audio_processes");
        if (isMounted) {
          internalProcesses = groupProcesses(procs);
        }
      } catch {
        // ignore background poll errors
      }
    }, 2000);

    return () => {
      isMounted = false;
      clearInterval(pollId);
    };
  });

  async function handleBalanceCommit(val: number) {
    masterBalance = val;
    await setBackendMasterBalance(val / 100);
  }

  async function handleTestHeadphoneChannel(channel: "left" | "right") {
    const feedback = await testHeadphoneChannel(channel);
    toastState.info(feedback);
  }

  function handleHideApp(key: string, appName: string) {
    const next = new Set(hiddenAppKeys);
    next.add(key);
    hiddenAppKeys = next;
    try {
      localStorage.setItem("rust_sound_hidden_apps", JSON.stringify([...next]));
    } catch {
      // Ignore
    }
    toastState.info(`Hidden "${appName}" from mixer`);
  }

  function handleUnhideAll() {
    hiddenAppKeys = new Set();
    try {
      localStorage.removeItem("rust_sound_hidden_apps");
    } catch {
      // Ignore
    }
    toastState.info("Restored all hidden applications");
  }

  // Filter audible apps, search, category tabs, and hidden state
  const audibleProcesses = $derived(activeProcesses.filter((p) => isAudibleApplication(p)));

  const visibleProcesses = $derived(
    audibleProcesses
      .filter((p) => {
        const key = processKey(p);
        if (hiddenAppKeys.has(key)) return false;

        if (channelFilter === "playing" || activeOnlyPlaying) {
          if (!p.is_running_output) return false;
        } else if (channelFilter === "media") {
          if (!isMediaOrCommunicationApp(p) && !p.is_running_output) return false;
        }

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const name = displayName(p).toLowerCase();
          const bundle = (p.bundle_id || "").toLowerCase();
          return name.includes(q) || bundle.includes(q);
        }

        return true;
      })
      .sort((a, b) => {
        if (a.is_running_output && !b.is_running_output) return -1;
        if (!a.is_running_output && b.is_running_output) return 1;
        return a.name.localeCompare(b.name);
      })
  );

  const isAnyAudioPlaying = $derived(activeProcesses.some((p) => p.is_running_output));

  // Device & Preset Selection Handlers
  function handleSelectDevice(uid: string) {
    internalSelectedDevice = uid;
    onSelectDevice?.(uid);
    if (isDesktop) {
      invoke("set_default_output_device", { deviceUid: uid }).catch((e) => toastState.error(String(e)));
    }
    const dev = activeDevices.find((d) => d.uid === uid);
    toastState.info(`Master output routed to ${dev ? dev.name : uid}`);
  }

  function handleSelectInputDevice(uid: string) {
    internalSelectedInputDevice = uid;
    onSelectInputDevice?.(uid);
    if (isDesktop) {
      invoke("set_default_input_device", { deviceUid: uid }).catch((e) => toastState.error(String(e)));
    }
    const dev = activeInputDevices.find((d) => d.uid === uid);
    toastState.info(`Microphone input switched to ${dev ? dev.name : uid}`);
  }

  function handleSelectPreset(name: string) {
    internalSelectedPreset = name;
    onSelectPreset?.(name);
    ACOUSTIC_PROFILES.find((profile) => profile.name === name)?.gains.forEach((gain, index) => handleEQBandChange(index, gain));
    toastState.info(`Acoustic preset: ${name}`);
  }

  // Master & Input Volume Handlers
  function handleMasterVolumeChange(val: number) {
    internalMasterVol = val;
    onMasterVolumeChange?.(val);
  }

  function handleMasterVolumeCommit(val: number) {
    internalMasterVol = val;
    onMasterVolumeCommit?.(val);
    if (isDesktop) {
      invoke("set_master_volume", { volume: val / 100 }).catch((e) => toastState.error(String(e)));
    }
  }

  function handleMasterMuteToggle() {
    const next = !activeIsMasterMuted;
    internalMasterMuted = next;
    onMasterMuteToggle?.();
    if (isDesktop) {
      invoke("set_master_mute", { muted: next }).catch(() => {});
    }
    toastState.info(next ? "Master output muted" : "Master output unmuted");
  }

  function handleInputVolumeChange(val: number) {
    internalInputVol = val;
    onInputVolumeChange?.(val);
  }

  function handleInputVolumeCommit(val: number) {
    internalInputVol = val;
    onInputVolumeCommit?.(val);
    if (isDesktop) {
      invoke("set_input_volume", { volume: val / 100 }).catch((e) => toastState.error(String(e)));
    }
  }

  function handleInputMuteToggle() {
    const next = !activeIsInputMuted;
    internalInputMuted = next;
    onInputMuteToggle?.();
    if (isDesktop) {
      invoke("set_input_mute", { muted: next }).catch(() => {});
    }
    toastState.info(next ? "Microphone muted" : "Microphone unmuted");
  }

  function handleSystemVolumeCommit(val: number) {
    internalSystemVol = val;
    onSystemVolumeCommit?.(val);
    if (isDesktop) {
      invoke("set_system_sounds_volume", { volume: val / 100 }).catch((e) => toastState.error(String(e)));
    }
  }

  async function handleVolumeCommit(process: AudioProcess, vol: number) {
    if (onVolumeCommit) {
      await onVolumeCommit(process, vol);
    } else {
      if (isDesktop && process.bundle_id === "com.spotify.client") {
        await spotifyState.setVolume(vol / 100);
        return;
      }
      const key = processKey(process);
      if (isDesktop && process.bundle_id) {
        await invoke("set_app_volume", { bundleId: process.bundle_id, volume: vol / 100 });
      }
      internalChannelState = {
        ...internalChannelState,
        [key]: { volume: vol, muted: internalChannelState[key]?.muted ?? false },
      };
      toastState.info(`Đã chỉnh volume ${displayName(process)}`);
    }
  }

  async function handleMuteToggle(process: AudioProcess, muted: boolean) {
    if (onMuteToggle) {
      await onMuteToggle(process, muted);
    } else {
      if (isDesktop && process.bundle_id === "com.spotify.client") {
        await spotifyState.setMuted(muted);
        return;
      }
      const key = processKey(process);
      if (isDesktop && process.bundle_id) {
        await invoke("set_app_mute", { bundleId: process.bundle_id, muted });
      }
      internalChannelState = {
        ...internalChannelState,
        [key]: { volume: internalChannelState[key]?.volume ?? 100, muted },
      };
      toastState.info(muted ? `Đã tắt tiếng ${displayName(process)}` : `Đã bật tiếng ${displayName(process)}`);
    }
  }

  function handleEQBandChange(bandIndex: number, gainDb: number) {
    onEQBandChange?.(bandIndex, gainDb);
    if (isDesktop) void invoke("set_master_eq_band", { bandIndex, gainDb }).catch((e) => toastState.error(String(e)));
  }

  function handleEQReset() {
    onResetEQFlat?.();
    if (isDesktop) void invoke("reset_master_eq").catch((e) => toastState.error(String(e)));
  }

  function handleEQBypass(bypassed: boolean) {
    internalIsEQBypassed = bypassed;
    onToggleEQBypass?.(bypassed);
    if (isDesktop) void invoke("set_master_eq_bypass", { bypass: bypassed }).catch((e) => toastState.error(String(e)));
  }

  function handleTriggerRefresh() {
    isManualRefreshing = true;
    if (onRefresh) {
      onRefresh();
    } else if (isDesktop) {
      invoke<AudioProcess[]>("get_audio_processes")
        .then((procs) => {
          internalProcesses = groupProcesses(procs);
          toastState.info("Refreshed audio processes");
        })
        .catch(() => {});
    }
    setTimeout(() => {
      isManualRefreshing = false;
    }, 450);
  }
</script>

<div class="w-full select-none space-y-4">
  <!-- 2-Column Responsive Studio Console -->
  <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
    <!-- Left Column (7 cols): Master Output -> App Channel Strips -> Hardware Input & System Sounds -->
    <div class="lg:col-span-7 flex flex-col gap-4">
      <!-- 1. Master Output Channel Banner -->
      <DeviceQuickBar
        devices={activeDevices}
        inputDevices={activeInputDevices}
        presets={activePresets}
        selectedDevice={activeSelectedDevice}
        selectedInputDevice={activeSelectedInputDevice}
        selectedPreset={activeSelectedPreset}
        onDeviceChange={handleSelectDevice}
        onInputDeviceChange={handleSelectInputDevice}
        onPresetChange={handleSelectPreset}
        masterVolume={activeMasterVolume}
        onMasterVolumeChange={handleMasterVolumeChange}
        onMasterVolumeCommit={handleMasterVolumeCommit}
        inputVolume={activeInputVolume}
        onInputVolumeChange={handleInputVolumeChange}
        onInputVolumeCommit={handleInputVolumeCommit}
        balance={masterBalance}
        onBalanceChange={handleBalanceCommit}
        onTestChannel={handleTestHeadphoneChannel}
        isMuted={activeIsMasterMuted}
        onMasterMuteToggle={handleMasterMuteToggle}
        isInputMuted={activeIsInputMuted}
        onInputMuteToggle={handleInputMuteToggle}
        isAudioActive={isAnyAudioPlaying}
        disabled={false}
      />

      <!-- 2. Applications Channel Section -->
      <section aria-labelledby="mixer-title" class="space-y-2.5">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div class="flex items-center gap-2">
            <span
              id="mixer-title"
              class="text-xs font-bold uppercase tracking-wider text-(--ink) m-0 flex items-center gap-1.5"
            >
              <Volume2 class="w-3.5 h-3.5 text-(--accent-text)" />
              Application Channel Strips
            </span>
            <span class="badge text-[10px] px-2 py-0.5 font-mono">
              {visibleProcesses.length}
            </span>

            {#if hiddenAppKeys.size > 0}
              <button
                type="button"
                onclick={handleUnhideAll}
                class="text-[10px] text-(--warning) hover:opacity-80 bg-(--surface) px-2 py-0.5 rounded-full border border-(--line) flex items-center gap-1 transition-colors cursor-pointer"
                title="Click to restore all hidden applications"
              >
                <Eye class="w-3 h-3" />
                <span>{hiddenAppKeys.size} Hidden · Restore</span>
              </button>
            {/if}
          </div>

          <!-- Multi-Tier Filter Tabs -->
          <div
            class="flex p-0.5 gap-0.5 bg-(--paper) border border-(--line) rounded-lg shrink-0 overflow-x-auto max-w-full"
            role="group"
            aria-label="Filter applications"
          >
            <button
              type="button"
              class="px-2.5 py-1 text-xs font-medium rounded-md transition-all cursor-pointer {channelFilter === 'all' && !activeOnlyPlaying
                ? 'bg-(--surface) text-(--ink) font-bold border border-(--line) shadow-xs'
                : 'text-(--muted) hover:text-(--ink)'}"
              onclick={() => {
                channelFilter = "all";
                if (onToggleOnlyPlaying) onToggleOnlyPlaying(false);
                else internalOnlyPlaying = false;
              }}
              aria-pressed={channelFilter === "all" && !activeOnlyPlaying}
            >
              All Audible
            </button>

            <button
              type="button"
              class="px-2.5 py-1 text-xs font-medium rounded-md transition-all cursor-pointer {channelFilter === 'media'
                ? 'bg-(--surface) text-(--ink) font-bold border border-(--line) shadow-xs'
                : 'text-(--muted) hover:text-(--ink)'}"
              onclick={() => {
                channelFilter = "media";
                if (onToggleOnlyPlaying) onToggleOnlyPlaying(false);
                else internalOnlyPlaying = false;
              }}
              aria-pressed={channelFilter === "media"}
            >
              Media & Calling
            </button>

            <button
              type="button"
              class="px-2.5 py-1 text-xs font-medium rounded-md transition-all cursor-pointer flex items-center gap-1.5 {channelFilter === 'playing' || activeOnlyPlaying
                ? 'bg-(--surface) text-(--ink) font-bold border border-(--line) shadow-xs'
                : 'text-(--muted) hover:text-(--ink)'}"
              onclick={() => {
                channelFilter = "playing";
                if (onToggleOnlyPlaying) onToggleOnlyPlaying(true);
                else internalOnlyPlaying = true;
              }}
              aria-pressed={channelFilter === "playing" || activeOnlyPlaying}
            >
              <span
                class="w-1.5 h-1.5 rounded-full {isAnyAudioPlaying
                  ? 'bg-(--success) animate-pulse'
                  : 'bg-(--muted)'}"
              ></span>
              Playing Now
            </button>
          </div>
        </div>

        <!-- Quick Search & Refresh Toolbar -->
        <div class="flex items-center gap-2">
          <div class="relative flex-1">
            <Search class="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-(--muted) pointer-events-none" />
            <input
              type="text"
              bind:value={searchQuery}
              placeholder="Filter applications by name or bundle…"
              class="w-full h-8 pl-8 pr-7 text-xs rounded-lg bg-(--paper) border border-(--input-line) text-(--ink) placeholder:text-(--muted) focus:outline-none focus:border-(--focus) transition-all font-sans"
            />
            {#if searchQuery}
              <button
                type="button"
                onclick={() => (searchQuery = "")}
                class="absolute right-2 top-1/2 -translate-y-1/2 text-(--muted) hover:text-(--ink) p-0.5 rounded cursor-pointer"
                title="Clear search"
              >
                <X class="w-3.5 h-3.5" />
              </button>
            {/if}
          </div>

          <button
            type="button"
            onclick={handleTriggerRefresh}
            class="btn border border-(--input-line) bg-(--paper) hover:bg-(--surface) text-xs h-8 px-2.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
            title="Refresh active audio processes"
          >
            <RefreshCw class="w-3.5 h-3.5 {isManualRefreshing ? 'animate-spin text-(--accent-text)' : 'text-(--muted)'}" />
            <span class="hidden sm:inline">Refresh</span>
          </button>

          <span class="text-[11px] text-(--muted) font-mono shrink-0 hidden sm:inline-block">
            Showing {visibleProcesses.length} of {audibleProcesses.length} apps
          </span>
        </div>

        {#if activeError}
          <div
            class="flex items-center gap-2 p-3 text-xs text-(--error) bg-(--paper) border border-(--error) rounded-xl"
            role="alert"
          >
            <AlertCircle class="w-4 h-4 shrink-0 text-(--error)" />
            <span>{activeError}</span>
          </div>
        {/if}

        <!-- Keyed Channels List on Bundle ID -->
        {#if activeIsLoading}
          <div class="flex flex-col gap-2.5">
            <div class="p-4 panel animate-pulse h-14"></div>
            <div class="p-4 panel animate-pulse h-14"></div>
            <div class="p-4 panel animate-pulse h-14"></div>
            <p class="text-center text-xs text-(--muted) mt-2">
              Discovering audio application streams…
            </p>
          </div>
        {:else if visibleProcesses.length === 0}
          <div class="p-6 panel flex flex-col items-center justify-center text-center gap-2">
            <Filter class="w-7 h-7 text-(--muted) opacity-40 mb-1" />
            <h4 class="text-xs font-semibold text-(--ink) m-0">
              {searchQuery
                ? `No applications found matching "${searchQuery}"`
                : "No matching audio applications found"}
            </h4>
            <p class="text-[11px] text-(--muted) max-w-sm m-0">
              {searchQuery || channelFilter !== "all" || activeOnlyPlaying
                ? "Try clearing your search query or switching to All Audible channels."
                : "Play music or audio in Spotify, YouTube, Chrome, or Discord to mix their streams."}
            </p>
            {#if searchQuery || channelFilter !== "all" || activeOnlyPlaying || hiddenAppKeys.size > 0}
              <button
                type="button"
                onclick={() => {
                  searchQuery = "";
                  channelFilter = "all";
                  if (onToggleOnlyPlaying) onToggleOnlyPlaying(false);
                  else internalOnlyPlaying = false;
                  if (hiddenAppKeys.size > 0) handleUnhideAll();
                }}
                class="mt-2 text-xs font-medium text-(--accent-text) bg-(--soft) px-3 py-1.5 rounded-lg border border-(--line) transition-all cursor-pointer"
              >
                Reset Search & Filters
              </button>
            {/if}
          </div>
        {:else}
          <div class="flex flex-col gap-2">
            {#each visibleProcesses as process (process.bundle_id || `pid:${process.pid}`)}
              {@const key = processKey(process)}
              {@const state = isDesktop && key === "com.spotify.client" ? { volume: spotifyState.volume * 100, muted: spotifyState.muted } : activeChannelState[key] || { volume: 100, muted: false }}

              <ProcessCard
                process={process}
                initialVolume={state.volume}
                isMuted={state.muted}
                devices={activeDevices}
                onVolumeCommit={(val) => handleVolumeCommit(process, val)}
                onMuteToggle={(muted) => handleMuteToggle(process, muted)}
                onRouteChange={(devUid) => onRouteChange?.(process, devUid)}
                onHide={() => handleHideApp(key, displayName(process))}
                onError={(msg) => {
                  onError?.(msg);
                  toastState.error(msg);
                }}
              />
            {/each}
          </div>
        {/if}
      </section>

      <!-- 3. Hardware Input & macOS System Alerts Buses -->
      <div class="space-y-2 pt-1">
        <AudioBuses
          inputDevices={activeInputDevices}
          selectedInputDevice={activeSelectedInputDevice}
          onSelectInputDevice={handleSelectInputDevice}
          inputVolume={activeInputVolume}
          onInputVolumeChange={handleInputVolumeChange}
          onInputVolumeCommit={handleInputVolumeCommit}
          isInputMuted={activeIsInputMuted}
          onInputMuteToggle={handleInputMuteToggle}
          systemVolume={activeSystemVolume}
          onSystemVolumeCommit={handleSystemVolumeCommit}
          onToast={(msg) => toastState.info(msg)}
        />
      </div>
    </div>

    <!-- Right Column (5 cols): Studio DSP Processing Rack & Performance Card -->
    <div class="lg:col-span-5 flex flex-col gap-4">
      <div class="panel overflow-hidden flex flex-col">
        <!-- Segmented Rack Header Switcher -->
        <div class="p-3 border-b border-(--line) bg-(--paper) flex items-center justify-between flex-wrap gap-2">
          <div class="flex p-0.5 gap-1 bg-(--surface) border border-(--line) rounded-lg">
            <button
              type="button"
              onclick={() => (dspRackTab = "eq")}
              class="px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer flex items-center gap-1.5 {dspRackTab === 'eq'
                ? 'bg-(--paper) text-(--ink) font-bold border border-(--line) shadow-xs'
                : 'text-(--muted) hover:text-(--ink)'}"
            >
              <SlidersHorizontal class="w-3.5 h-3.5 text-(--accent-text)" />
              <span>Parametric EQ (10-Band)</span>
            </button>

            <button
              type="button"
              onclick={() => (dspRackTab = "filter")}
              class="px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer flex items-center gap-1.5 {dspRackTab === 'filter'
                ? 'bg-(--paper) text-(--ink) font-bold border border-(--line) shadow-xs'
                : 'text-(--muted) hover:text-(--ink)'}"
            >
              <Sparkles class="w-3.5 h-3.5 text-(--success)" />
              <span>Audio Filters & Isolation</span>
            </button>
          </div>

          <div class="flex items-center gap-1.5">
            <span class="badge badge-ok text-[10px] font-mono flex items-center gap-1">
              <span class="w-1.5 h-1.5 rounded-full bg-(--success) animate-pulse"></span>
              {spotifyState.status?.processing ? "SPOTIFY DSP ACTIVE" : "DSP WAITING"}
            </span>
          </div>
        </div>

        <!-- Content Slot -->
        <div class="p-4 flex-1">
          {#if dspRackTab === "eq"}
            <StudioEQInspector
              activePresetName={activeSelectedPreset}
              isAudioActive={spotifyState.status?.processing ?? false}
              isBypassed={activeIsEQBypassed}
              embedded={true}
              onPresetSelect={handleSelectPreset}
              onBandChange={handleEQBandChange}
              onResetFlat={handleEQReset}
              onToggleBypass={handleEQBypass}
            />
          {:else}
            <AudioFilterPanel embedded={true} />
          {/if}
        </div>
      </div>

    </div>
  </div>

  <details class="panel p-4" bind:open={diagnosticsOpen}>
    <summary class="text-xs text-(--muted) cursor-pointer"><Cpu class="inline w-4 h-4 mr-2" /> Chẩn đoán CoreAudio</summary>
    {#if diagnosticsOpen}
      <div class="mt-4 space-y-4">
        <p class="text-xs text-(--muted)">{spotifyState.status?.processing ? "Spotify Process Tap Active" : "Spotify Process Tap Waiting"} · {spotifyState.status?.sample_rate || "—"} Hz · {spotifyState.status?.frames?.toLocaleString() ?? "0"} frames</p>
        <PerformanceDiagnosticsCard />
      </div>
    {/if}
  </details>
</div>
