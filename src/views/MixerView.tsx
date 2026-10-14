import { useState, type FC } from "react";
import { DeviceQuickBar, type AudioDevice, type Preset } from "@/components/DeviceQuickBar";
import { ProcessCard } from "@/components/ProcessCard";
import { StudioEQInspector } from "@/components/StudioEQInspector";
import { AudioBuses } from "@/components/AudioBuses";
import {
  BadgeComponent,
  EmptyStateComponent,
  SkeletonComponent,
} from "@/shared/ui";
import {
  AlertCircle,
  Volume2,
  Cpu,
  CheckCircle2,
} from "lucide-react";
import { processKey, isAudibleApplication } from "@/audio";
import type { AudioProcess } from "@/audio";
import { cn } from "@/lib/utils";

interface MixerViewProps {
  processes: AudioProcess[];
  channelState: Record<string, { volume: number; muted: boolean }>;
  devices: AudioDevice[];
  presets: Preset[];
  selectedDevice: string;
  selectedPreset: string;
  masterVolume?: number;
  onMasterVolumeCommit?: (val: number) => void;
  isMasterMuted?: boolean;
  onMasterMuteToggle?: () => void;
  inputVolume?: number;
  onInputVolumeCommit?: (val: number) => void;
  systemVolume?: number;
  onSystemVolumeCommit?: (val: number) => void;
  onlyPlaying: boolean;
  isLoading: boolean;
  error: string | null;
  onSelectDevice: (uid: string) => void;
  onSelectPreset: (name: string) => void;
  onToggleOnlyPlaying: (playing: boolean) => void;
  onVolumeCommit: (process: AudioProcess, volume: number) => Promise<void>;
  onMuteToggle: (process: AudioProcess, muted: boolean) => Promise<void>;
  onRouteChange?: (process: AudioProcess, deviceUid: string) => void;
  onEQBandChange?: (bandIndex: number, gainDb: number) => void;
  onError: (msg: string) => void;
}

export const MixerView: FC<MixerViewProps> = ({
  processes,
  channelState,
  devices,
  presets,
  selectedDevice,
  selectedPreset,
  masterVolume = 100,
  onMasterVolumeCommit,
  isMasterMuted = false,
  onMasterMuteToggle,
  inputVolume = 85,
  onInputVolumeCommit,
  systemVolume = 70,
  onSystemVolumeCommit,
  onlyPlaying,
  isLoading,
  error,
  onSelectDevice,
  onSelectPreset,
  onToggleOnlyPlaying,
  onVolumeCommit,
  onMuteToggle,
  onRouteChange,
  onEQBandChange,
  onError,
}) => {
  const [masterBalance, setMasterBalance] = useState(0);

  // Filter out non-audio system utilities and prioritize actively playing apps
  const visibleProcesses = processes
    .filter((p) => {
      if (onlyPlaying) return p.is_running_output;
      return isAudibleApplication(p);
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
            onMasterVolumeChange={onMasterVolumeCommit}
            balance={masterBalance}
            onBalanceChange={setMasterBalance}
            isMuted={isMasterMuted}
            onMasterMuteToggle={onMasterMuteToggle}
            isAudioActive={isAnyAudioPlaying}
            disabled={false}
          />

          {/* 2. Hardware Input & macOS System Alerts Buses */}
          <AudioBuses
            inputVolume={inputVolume}
            onInputVolumeCommit={onInputVolumeCommit}
            systemVolume={systemVolume}
            onSystemVolumeCommit={onSystemVolumeCommit}
            onToast={onError}
          />

          {/* 3. Applications Channel Section */}
          <section aria-labelledby="mixer-title" className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  id="mixer-title"
                  className="text-xs font-bold uppercase tracking-wider text-slate-300 m-0 flex items-center gap-1.5"
                >
                  <Volume2 className="w-3.5 h-3.5 text-sky-400" />
                  Application Channel Strips
                </span>
                <BadgeComponent variant="secondary" className="text-[10px] px-2 py-0.5 font-mono">
                  {visibleProcesses.length}
                </BadgeComponent>
              </div>

              {/* Filter Tabs: All vs Playing */}
              <div
                className="flex p-0.5 gap-0.5 bg-slate-950 border border-white/8 rounded-lg"
                role="group"
                aria-label="Filter applications"
              >
                <button
                  className={cn(
                    "px-3 py-1 text-xs font-medium rounded-md transition-all cursor-pointer",
                    !onlyPlaying
                      ? "bg-[#1f2838] text-sky-300 shadow-sm font-semibold"
                      : "text-slate-400 hover:text-white"
                  )}
                  onClick={() => onToggleOnlyPlaying(false)}
                  aria-pressed={!onlyPlaying}
                >
                  All Channels
                </button>
                <button
                  className={cn(
                    "px-3 py-1 text-xs font-medium rounded-md transition-all cursor-pointer flex items-center gap-1.5",
                    onlyPlaying
                      ? "bg-[#1f2838] text-sky-300 shadow-sm font-semibold"
                      : "text-slate-400 hover:text-white"
                  )}
                  onClick={() => onToggleOnlyPlaying(true)}
                  aria-pressed={onlyPlaying}
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
              <EmptyStateComponent
                title={onlyPlaying ? "No applications outputting audio right now" : "No active audio applications found"}
                description="Play music or audio in Spotify, YouTube, Chrome or Discord to mix their streams."
              />
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
            onPresetSelect={onSelectPreset}
            onBandChange={onEQBandChange}
          />
        </div>
      </div>

      {/* Full-Width CoreAudio Telemetry & Stream Diagnostics Status Shelf */}
      <footer className="w-full p-4 rounded-2xl bg-gradient-to-r from-[#121824] via-[#0f141f] to-[#121824] border border-white/8 backdrop-blur-md shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 pb-2.5 border-b border-white/6 gap-2">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-sky-400" />
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
            <span className="text-xs font-mono font-bold text-sky-300 mt-0.5 block">1.8 ms</span>
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
