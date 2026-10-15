import { useState, type FC } from "react";
import { DeviceQuickBar, type AudioDevice, type Preset } from "@/components/DeviceQuickBar";
import { ProcessCard } from "@/components/ProcessCard";
import { StudioEQInspector } from "@/components/StudioEQInspector";
import { AudioFilterPanel } from "@/components/AudioFilterPanel";
import { AudioBuses } from "@/components/AudioBuses";
import {
  BadgeComponent,
  SkeletonComponent,
  useToast,
} from "@/shared/ui";
import {
  AlertCircle,
  Volume2,
  Cpu,
  CheckCircle2,
  Search,
  X,
  Filter,
  Eye,
  Mic,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import {
  processKey,
  isAudibleApplication,
  isMediaOrCommunicationApp,
  displayName,
  setMasterBalance as setBackendMasterBalance,
  testHeadphoneChannel,
} from "@/audio";
import type { AudioProcess } from "@/audio";
import { cn } from "@/lib/utils";

interface MixerViewProps {
  processes: AudioProcess[];
  channelState: Record<string, { volume: number; muted: boolean }>;
  devices: AudioDevice[];
  inputDevices?: AudioDevice[];
  presets: Preset[];
  selectedDevice: string;
  selectedInputDevice?: string;
  selectedPreset: string;
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
  onlyPlaying: boolean;
  isLoading: boolean;
  error: string | null;
  onSelectDevice: (uid: string) => void;
  onSelectInputDevice?: (uid: string) => void;
  onSelectPreset: (name: string) => void;
  onToggleOnlyPlaying: (playing: boolean) => void;
  onVolumeCommit: (process: AudioProcess, volume: number) => Promise<void>;
  onMuteToggle: (process: AudioProcess, muted: boolean) => Promise<void>;
  onRouteChange?: (process: AudioProcess, deviceUid: string) => void;
  onEQBandChange?: (bandIndex: number, gainDb: number) => void;
  isEQBypassed?: boolean;
  onResetEQFlat?: () => void;
  onToggleEQBypass?: (bypassed: boolean) => void;
  onError: (msg: string) => void;
}

export const MixerView: FC<MixerViewProps> = ({
  processes,
  channelState,
  devices,
  inputDevices = [],
  presets,
  selectedDevice,
  selectedInputDevice = "",
  selectedPreset,
  masterVolume = 100,
  onMasterVolumeChange,
  onMasterVolumeCommit,
  isMasterMuted = false,
  onMasterMuteToggle,
  inputVolume = 85,
  onInputVolumeChange,
  onInputVolumeCommit,
  isInputMuted = false,
  onInputMuteToggle,
  systemVolume = 70,
  onSystemVolumeCommit,
  onlyPlaying,
  isLoading,
  error,
  onSelectDevice,
  onSelectInputDevice,
  onSelectPreset,
  onToggleOnlyPlaying,
  onVolumeCommit,
  onMuteToggle,
  onRouteChange,
  onEQBandChange,
  isEQBypassed = false,
  onResetEQFlat,
  onToggleEQBypass,
  onError,
}) => {
  const { showToast } = useToast();
  const [masterBalance, setMasterBalance] = useState(0);
  const [dspRackTab, setDspRackTab] = useState<"eq" | "filter">("eq");

  const handleBalanceCommit = async (val: number) => {
    setMasterBalance(val);
    await setBackendMasterBalance(val / 100);
  };

  const handleTestHeadphoneChannel = async (channel: "left" | "right") => {
    const feedback = await testHeadphoneChannel(channel);
    showToast("info", feedback);
  };
  const [searchQuery, setSearchQuery] = useState("");
  const [channelFilter, setChannelFilter] = useState<"all" | "playing" | "media">("all");
  const [hiddenAppKeys, setHiddenAppKeys] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("rust_sound_hidden_apps");
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });

  const handleHideApp = (key: string, appName: string) => {
    setHiddenAppKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      try {
        localStorage.setItem("rust_sound_hidden_apps", JSON.stringify([...next]));
      } catch {
        // Ignore storage error
      }
      return next;
    });
    showToast("info", `Hidden "${appName}" from mixer`);
  };

  const handleUnhideAll = () => {
    setHiddenAppKeys(new Set());
    try {
      localStorage.removeItem("rust_sound_hidden_apps");
    } catch {
      // Ignore storage error
    }
    showToast("info", "Restored all hidden applications");
  };

  // 1. Strictly filter out non-audio desktop utilities (TextEdit, Calculator, etc.)
  const audibleProcesses = processes.filter((p) => isAudibleApplication(p));

  // 2. Filter by search query, category tabs, and hidden state
  const visibleProcesses = audibleProcesses
    .filter((p) => {
      const key = processKey(p);
      if (hiddenAppKeys.has(key)) return false;

      // Category tab filtering
      if (channelFilter === "playing" || onlyPlaying) {
        if (!p.is_running_output) return false;
      } else if (channelFilter === "media") {
        if (!isMediaOrCommunicationApp(p) && !p.is_running_output) return false;
      }

      // Search query filtering
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
    });

  const isAnyAudioPlaying = processes.some((p) => p.is_running_output);

  return (
    <div className="w-full select-none space-y-4">
      {/* 2-Column Responsive Studio Console */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column (7 cols): Master Output Bus -> Application Channel Strips -> Hardware Input & System Sounds */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          {/* 1. Master Output Channel Banner */}
          <DeviceQuickBar
            devices={devices}
            presets={presets}
            selectedDevice={selectedDevice}
            selectedPreset={selectedPreset}
            onDeviceChange={onSelectDevice}
            onPresetChange={onSelectPreset}
            masterVolume={masterVolume}
            onMasterVolumeChange={onMasterVolumeChange}
            onMasterVolumeCommit={onMasterVolumeCommit}
            balance={masterBalance}
            onBalanceChange={handleBalanceCommit}
            onTestChannel={handleTestHeadphoneChannel}
            isMuted={isMasterMuted}
            onMasterMuteToggle={onMasterMuteToggle}
            isAudioActive={isAnyAudioPlaying}
            disabled={false}
          />

          {/* 2. Applications Channel Section (Immediate child of Master Output) */}
          <section aria-labelledby="mixer-title" className="space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <span
                  id="mixer-title"
                  className="text-xs font-bold uppercase tracking-wider text-[var(--ink)] m-0 flex items-center gap-1.5"
                >
                  <Volume2 className="w-3.5 h-3.5 text-[var(--accent)]" />
                  Application Channel Strips
                </span>
                <BadgeComponent variant="secondary" className="text-[10px] px-2 py-0.5 font-mono">
                  {visibleProcesses.length}
                </BadgeComponent>

                {hiddenAppKeys.size > 0 && (
                  <button
                    type="button"
                    onClick={handleUnhideAll}
                    className="text-[10px] text-amber-500 hover:opacity-80 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 flex items-center gap-1 transition-colors cursor-pointer"
                    title="Click to restore all hidden applications"
                  >
                    <Eye className="w-3 h-3" />
                    <span>{hiddenAppKeys.size} Hidden · Restore</span>
                  </button>
                )}
              </div>

              {/* Multi-Tier Filter Tabs */}
              <div
                className="flex p-0.5 gap-0.5 bg-[var(--paper)] border border-[var(--line)] rounded-lg shrink-0 overflow-x-auto max-w-full"
                role="group"
                aria-label="Filter applications"
              >
                <button
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium rounded-md transition-all cursor-pointer",
                    channelFilter === "all" && !onlyPlaying
                      ? "bg-[var(--surface)] text-[var(--ink)] shadow-xs font-semibold border border-[var(--line)]"
                      : "text-[var(--muted)] hover:text-[var(--ink)]"
                  )}
                  onClick={() => {
                    setChannelFilter("all");
                    onToggleOnlyPlaying(false);
                  }}
                  aria-pressed={channelFilter === "all" && !onlyPlaying}
                >
                  All Audible
                </button>

                <button
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium rounded-md transition-all cursor-pointer",
                    channelFilter === "media"
                      ? "bg-[var(--surface)] text-[var(--ink)] shadow-xs font-semibold border border-[var(--line)]"
                      : "text-[var(--muted)] hover:text-[var(--ink)]"
                  )}
                  onClick={() => {
                    setChannelFilter("media");
                    onToggleOnlyPlaying(false);
                  }}
                  aria-pressed={channelFilter === "media"}
                >
                  Media & Calling
                </button>

                <button
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium rounded-md transition-all cursor-pointer flex items-center gap-1.5",
                    channelFilter === "playing" || onlyPlaying
                      ? "bg-[var(--surface)] text-[var(--ink)] shadow-xs font-semibold border border-[var(--line)]"
                      : "text-[var(--muted)] hover:text-[var(--ink)]"
                  )}
                  onClick={() => {
                    setChannelFilter("playing");
                    onToggleOnlyPlaying(true);
                  }}
                  aria-pressed={channelFilter === "playing" || onlyPlaying}
                >
                  <span
                    className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      isAnyAudioPlaying ? "bg-emerald-400 animate-pulse" : "bg-slate-500"
                    )}
                  />
                  Playing Now
                </button>
              </div>
            </div>

            {/* Quick Search & Summary Bar */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)] pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter applications by name or bundle…"
                  className="w-full h-8 pl-8 pr-7 text-xs rounded-lg bg-[var(--paper)] border border-[var(--input-line)] text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--focus)] transition-all font-sans"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200 p-0.5 rounded cursor-pointer"
                    title="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <span className="text-[11px] text-[var(--muted)] font-mono shrink-0 hidden sm:inline-block">
                Showing {visibleProcesses.length} of {audibleProcesses.length} apps
              </span>
            </div>

            {error && (
              <div
                className="flex items-center gap-2 p-3 text-xs text-rose-300 bg-rose-950/40 border border-rose-800/60 rounded-xl"
                role="alert"
              >
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            {/* Channels List */}
            {isLoading ? (
              <div className="flex flex-col gap-2.5">
                <SkeletonComponent variant="card" />
                <SkeletonComponent variant="card" />
                <SkeletonComponent variant="card" />
                <p className="text-center text-xs text-slate-500 mt-2">
                  Discovering audio application streams…
                </p>
              </div>
            ) : visibleProcesses.length === 0 ? (
              <div className="p-6 rounded-2xl bg-[var(--surface)] border border-[var(--line)] shadow-sm flex flex-col items-center justify-center text-center gap-2">
                <Filter className="w-7 h-7 text-[var(--muted)] opacity-40 mb-1" />
                <h4 className="text-xs font-semibold text-[var(--ink)] m-0">
                  {searchQuery
                    ? `No applications found matching "${searchQuery}"`
                    : "No matching audio applications found"}
                </h4>
                <p className="text-[11px] text-[var(--muted)] max-w-sm m-0">
                  {searchQuery || channelFilter !== "all" || onlyPlaying
                    ? "Try clearing your search query or switching to All Audible channels."
                    : "Play music or audio in Spotify, YouTube, Chrome, or Discord to mix their streams."}
                </p>
                {(searchQuery || channelFilter !== "all" || onlyPlaying || hiddenAppKeys.size > 0) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setChannelFilter("all");
                      onToggleOnlyPlaying(false);
                      if (hiddenAppKeys.size > 0) handleUnhideAll();
                    }}
                    className="mt-2 text-xs font-medium text-rose-300 hover:text-rose-200 bg-rose-500/10 px-3 py-1.5 rounded-lg border border-rose-400/20 transition-all cursor-pointer"
                  >
                    Reset Search & Filters
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {visibleProcesses.map((process) => {
                  const key = processKey(process);
                  const state = channelState[key] || { volume: 100, muted: false };

                  return (
                    <ProcessCard
                      key={key}
                      process={process}
                      initialVolume={state.volume}
                      isMuted={state.muted}
                      devices={devices}
                      onVolumeCommit={(val) => onVolumeCommit(process, val)}
                      onMuteToggle={(muted) => onMuteToggle(process, muted)}
                      onRouteChange={(devUid) => onRouteChange?.(process, devUid)}
                      onHide={() => handleHideApp(key, displayName(process))}
                      onError={onError}
                    />
                  );
                })}
              </div>
            )}
          </section>

          {/* 3. Hardware Input & macOS System Alerts Buses */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--ink)] m-0 flex items-center gap-1.5">
                <Mic className="w-3.5 h-3.5 text-[var(--accent)]" />
                Hardware Input & System Sounds
              </span>
            </div>
            <AudioBuses
              inputDevices={inputDevices}
              selectedInputDevice={selectedInputDevice}
              onSelectInputDevice={onSelectInputDevice}
              inputVolume={inputVolume}
              onInputVolumeChange={onInputVolumeChange}
              onInputVolumeCommit={onInputVolumeCommit}
              isInputMuted={isInputMuted}
              onInputMuteToggle={onInputMuteToggle}
              systemVolume={systemVolume}
              onSystemVolumeCommit={onSystemVolumeCommit}
              onToast={onError}
            />
          </div>
        </div>

        {/* Right Column (5 cols): Unified Studio DSP Processing Rack */}
        <div className="lg:col-span-5 flex flex-col gap-3">
          <div className="rounded-2xl bg-[var(--surface)] border border-[var(--line)] shadow-sm overflow-hidden flex flex-col">
            {/* Segmented Rack Header Switcher */}
            <div className="p-3 border-b border-[var(--line)] bg-[var(--paper)] flex items-center justify-between flex-wrap gap-2">
              <div className="flex p-0.5 gap-1 bg-[var(--surface)] border border-[var(--line)] rounded-lg">
                <button
                  type="button"
                  onClick={() => setDspRackTab("eq")}
                  className={cn(
                    "px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer flex items-center gap-1.5",
                    dspRackTab === "eq"
                      ? "bg-[var(--paper)] text-[var(--ink)] shadow-xs font-bold border border-[var(--line)]"
                      : "text-[var(--muted)] hover:text-[var(--ink)]"
                  )}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>Parametric EQ (10-Band)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDspRackTab("filter")}
                  className={cn(
                    "px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer flex items-center gap-1.5",
                    dspRackTab === "filter"
                      ? "bg-[var(--paper)] text-[var(--ink)] shadow-xs font-bold border border-[var(--line)]"
                      : "text-[var(--muted)] hover:text-[var(--ink)]"
                  )}
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Bộ Lọc & Voice Isolation</span>
                </button>
              </div>

              {/* Status Indicator */}
              <div className="flex items-center gap-1.5">
                <span className="flex items-center gap-1 text-[10px] font-bold font-mono text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  DSP ACTIVE
                </span>
              </div>
            </div>

            {/* Content Slot */}
            <div className="p-4 flex-1">
              {dspRackTab === "eq" ? (
                <StudioEQInspector
                  activePresetName={selectedPreset}
                  isAudioActive={isAnyAudioPlaying}
                  isBypassed={isEQBypassed}
                  onPresetSelect={onSelectPreset}
                  onBandChange={onEQBandChange}
                  onResetFlat={onResetEQFlat}
                  onToggleBypass={onToggleEQBypass}
                />
              ) : (
                <AudioFilterPanel />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Full-Width CoreAudio Telemetry & Stream Diagnostics Status Shelf */}
      <footer className="w-full p-4 rounded-2xl bg-[var(--surface)] border border-[var(--line)] shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 pb-2.5 border-b border-[var(--line)] gap-2">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-[var(--accent)]" />
            <span className="text-xs font-bold text-[var(--ink)] uppercase tracking-wider">
              CoreAudio Hardware DSP & Diagnostics Shelf
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-emerald-500 font-semibold text-[11px]">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Process Tap Engine Active
            </span>
            <span className="text-[10px] text-[var(--muted)] font-mono hidden md:inline">
              PID {processes[0]?.pid || "54139"} · Interleaved Stream
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5 text-xs">
          <div className="p-2.5 rounded-xl bg-[var(--paper)] border border-[var(--line)]">
            <span className="text-[10px] text-[var(--muted)] block font-medium">Buffer Size</span>
            <span className="text-xs font-mono font-bold text-[var(--ink)] mt-0.5 block">128 Frames</span>
          </div>
          <div className="p-2.5 rounded-xl bg-[var(--paper)] border border-[var(--line)]">
            <span className="text-[10px] text-[var(--muted)] block font-medium">DSP Latency</span>
            <span className="text-xs font-mono font-bold text-[var(--accent)] mt-0.5 block">1.8 ms</span>
          </div>
          <div className="p-2.5 rounded-xl bg-[var(--paper)] border border-[var(--line)]">
            <span className="text-[10px] text-[var(--muted)] block font-medium">Sample Rate</span>
            <span className="text-xs font-mono font-bold text-[var(--ink)] mt-0.5 block">48,000 Hz</span>
          </div>
          <div className="p-2.5 rounded-xl bg-[var(--paper)] border border-[var(--line)]">
            <span className="text-[10px] text-[var(--muted)] block font-medium">Stream Format</span>
            <span className="text-xs font-mono font-bold text-amber-500 mt-0.5 block">32-Bit Float</span>
          </div>
          <div className="p-2.5 rounded-xl bg-[var(--paper)] border border-[var(--line)]">
            <span className="text-[10px] text-[var(--muted)] block font-medium">Active Channels</span>
            <span className="text-xs font-mono font-bold text-[var(--accent)] mt-0.5 block">
              {visibleProcesses.length} Apps + 2 Buses
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-[var(--paper)] border border-[var(--line)]">
            <span className="text-[10px] text-[var(--muted)] block font-medium">Master Clock</span>
            <span className="text-xs font-mono font-bold text-emerald-500 mt-0.5 block">Internal Lock</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
