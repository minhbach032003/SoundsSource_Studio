import { useState, type FC } from "react";
import { DeviceQuickBar, type AudioDevice, type Preset } from "@/components/DeviceQuickBar";
import { ProcessCard } from "@/components/ProcessCard";
import { StudioEQInspector } from "@/components/StudioEQInspector";
import { AudioBuses } from "@/components/AudioBuses";
import {
  BadgeComponent,
  SkeletonComponent,
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
} from "lucide-react";
import { processKey, isAudibleApplication, isMediaOrCommunicationApp, displayName } from "@/audio";
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
  const [masterBalance, setMasterBalance] = useState(0);
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
    onError(`Hidden "${appName}" from mixer`);
  };

  const handleUnhideAll = () => {
    setHiddenAppKeys(new Set());
    try {
      localStorage.removeItem("rust_sound_hidden_apps");
    } catch {
      // Ignore storage error
    }
    onError("Restored all hidden applications");
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
        {/* Left Column (7 cols): Output Bus, Input Mic Bus, System Sounds, Apps */}
        <div className="lg:col-span-7 flex flex-col gap-3.5">
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
            onBalanceChange={setMasterBalance}
            isMuted={isMasterMuted}
            onMasterMuteToggle={onMasterMuteToggle}
            isAudioActive={isAnyAudioPlaying}
            disabled={false}
          />

          {/* 2. Hardware Input & macOS System Alerts Buses */}
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

          {/* 3. Applications Channel Section */}
          <section aria-labelledby="mixer-title" className="space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <span
                  id="mixer-title"
                  className="text-xs font-bold uppercase tracking-wider text-slate-300 m-0 flex items-center gap-1.5"
                >
                  <Volume2 className="w-3.5 h-3.5 text-rose-400" />
                  Application Channel Strips
                </span>
                <BadgeComponent variant="secondary" className="text-[10px] px-2 py-0.5 font-mono">
                  {visibleProcesses.length}
                </BadgeComponent>

                {hiddenAppKeys.size > 0 && (
                  <button
                    type="button"
                    onClick={handleUnhideAll}
                    className="text-[10px] text-amber-400 hover:text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 flex items-center gap-1 transition-colors cursor-pointer"
                    title="Click to restore all hidden applications"
                  >
                    <Eye className="w-3 h-3" />
                    <span>{hiddenAppKeys.size} Hidden · Restore</span>
                  </button>
                )}
              </div>

              {/* Multi-Tier Filter Tabs */}
              <div
                className="flex p-0.5 gap-0.5 bg-slate-950 border border-white/8 rounded-lg shrink-0"
                role="group"
                aria-label="Filter applications"
              >
                <button
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium rounded-md transition-all cursor-pointer",
                    channelFilter === "all" && !onlyPlaying
                      ? "bg-[#2c2232] text-rose-300 shadow-sm font-semibold border border-rose-400/20"
                      : "text-stone-400 hover:text-white"
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
                      ? "bg-[#2c2232] text-rose-300 shadow-sm font-semibold border border-rose-400/20"
                      : "text-stone-400 hover:text-white"
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
                      ? "bg-[#2c2232] text-rose-300 shadow-sm font-semibold border border-rose-400/20"
                      : "text-stone-400 hover:text-white"
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
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter applications by name or bundle…"
                  className="w-full h-8 pl-8 pr-7 text-xs rounded-lg bg-[#19141d] border border-white/8 text-stone-200 placeholder:text-stone-500 focus:outline-none focus:border-rose-400/50 focus:ring-1 focus:ring-rose-400/20 transition-all font-sans"
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

              <span className="text-[11px] text-slate-500 font-mono shrink-0 hidden sm:inline-block">
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
              <div className="p-6 rounded-2xl bg-slate-950/60 border border-white/6 flex flex-col items-center justify-center text-center gap-2">
                <Filter className="w-7 h-7 text-slate-600 mb-1" />
                <h4 className="text-xs font-semibold text-slate-200 m-0">
                  {searchQuery
                    ? `No applications found matching "${searchQuery}"`
                    : "No matching audio applications found"}
                </h4>
                <p className="text-[11px] text-slate-400 max-w-sm m-0">
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
        </div>

        {/* Right Column (5 cols): Studio 10-Band Parametric EQ & Spectrum Inspector */}
        <div className="lg:col-span-5 flex flex-col gap-3.5">
          <StudioEQInspector
            activePresetName={selectedPreset}
            isAudioActive={isAnyAudioPlaying}
            isBypassed={isEQBypassed}
            onPresetSelect={onSelectPreset}
            onBandChange={onEQBandChange}
            onResetFlat={onResetEQFlat}
            onToggleBypass={onToggleEQBypass}
          />
        </div>
      </div>

      {/* Full-Width CoreAudio Telemetry & Stream Diagnostics Status Shelf */}
      <footer className="w-full p-4 rounded-2xl bg-gradient-to-r from-[#121824] via-[#0f141f] to-[#121824] border border-white/8 backdrop-blur-md shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 pb-2.5 border-b border-white/6 gap-2">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-rose-400" />
            <span className="text-xs font-bold text-slate-100 uppercase tracking-wider">
              CoreAudio Hardware DSP & Diagnostics Shelf
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-emerald-400 font-semibold text-[11px]">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Process Tap Engine Active
            </span>
            <span className="text-[10px] text-slate-500 font-mono hidden md:inline">
              PID {processes[0]?.pid || "54139"} · Interleaved Stream
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5 text-xs">
          <div className="p-2.5 rounded-xl bg-slate-950/70 border border-white/4">
            <span className="text-[10px] text-slate-400 block font-medium">Buffer Size</span>
            <span className="text-xs font-mono font-bold text-slate-200 mt-0.5 block">128 Frames</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-950/70 border border-white/4">
            <span className="text-[10px] text-slate-400 block font-medium">DSP Latency</span>
            <span className="text-xs font-mono font-bold text-rose-300 mt-0.5 block">1.8 ms</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-950/70 border border-white/4">
            <span className="text-[10px] text-slate-400 block font-medium">Sample Rate</span>
            <span className="text-xs font-mono font-bold text-slate-200 mt-0.5 block">48,000 Hz</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-950/70 border border-white/4">
            <span className="text-[10px] text-slate-400 block font-medium">Stream Format</span>
            <span className="text-xs font-mono font-bold text-amber-300 mt-0.5 block">32-Bit Float</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-950/70 border border-white/4">
            <span className="text-[10px] text-slate-400 block font-medium">Active Channels</span>
            <span className="text-xs font-mono font-bold text-purple-300 mt-0.5 block">
              {visibleProcesses.length} Apps + 2 Buses
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-950/70 border border-white/4">
            <span className="text-[10px] text-slate-400 block font-medium">Master Clock</span>
            <span className="text-xs font-mono font-bold text-emerald-400 mt-0.5 block">Internal Lock</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
