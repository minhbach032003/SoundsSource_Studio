import { useState, useEffect, type FC } from "react";
import { Mic, MicOff, Bell, BellOff, Sparkles } from "lucide-react";
import { SliderComponent, ButtonComponent, BadgeComponent, SelectComponent } from "@/shared/ui";
import { cn } from "@/lib/utils";

interface AudioBusesProps {
  inputVolume?: number;
  onInputVolumeCommit?: (val: number) => void;
  systemVolume?: number;
  onSystemVolumeCommit?: (val: number) => void;
  onToast?: (msg: string) => void;
}

export const AudioBuses: FC<AudioBusesProps> = ({
  inputVolume = 85,
  onInputVolumeCommit,
  systemVolume = 70,
  onSystemVolumeCommit,
  onToast,
}) => {
  // Input Mic State
  const [micVolume, setMicVolume] = useState(inputVolume);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [selectedMic, setSelectedMic] = useState("builtin-mic");

  // System Sounds State
  const [sysVolume, setSysVolume] = useState(systemVolume);
  const [isSystemMuted, setIsSystemMuted] = useState(false);
  const [isPlayingChime, setIsPlayingChime] = useState(false);

  useEffect(() => {
    setMicVolume(inputVolume);
  }, [inputVolume]);

  useEffect(() => {
    setSysVolume(systemVolume);
  }, [systemVolume]);

  const handleTestChime = () => {
    setIsPlayingChime(true);
    // Play pleasant system chime via Web Audio API
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
      osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.15); // A6 note

      gain.gain.setValueAtTime((sysVolume / 100) * 0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.36);
    } catch {
      // AudioContext fallback
    }

    onToast?.("Playing macOS alert chime test 🔔");
    setTimeout(() => setIsPlayingChime(false), 500);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 select-none">
      {/* 1. Input Microphone Channel */}
      <div className="p-3.5 rounded-2xl bg-gradient-to-b from-[#131924] to-[#0e121a] border border-white/8 shadow-sm flex flex-col justify-between gap-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "w-6 h-6 rounded-lg flex items-center justify-center transition-colors",
                isMicMuted
                  ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                  : "bg-purple-500/15 text-purple-400 border border-purple-400/30"
              )}
            >
              {isMicMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-200 tracking-tight m-0">
                Microphone Input
              </h4>
              <p className="text-[10px] text-slate-400 m-0">Hardware Input Bus</p>
            </div>
          </div>

          <BadgeComponent variant="secondary" className="text-[9px] px-1.5 py-0 font-mono">
            {isMicMuted ? "MUTED" : "LIVE"}
          </BadgeComponent>
        </div>

        {/* Mic Source Dropdown */}
        <SelectComponent
          value={selectedMic}
          onChange={(val) => {
            setSelectedMic(val);
            onToast?.(`Microphone switched to ${val === "builtin-mic" ? "Built-in / External Mic" : "Studio Input"}`);
          }}
          options={[
            { label: "External Microphone (Default)", value: "builtin-mic" },
            { label: "Studio Aggregate Input", value: "studio-input" },
          ]}
          className="h-7 text-xs bg-slate-950/80"
        />

        {/* Mic Gain Slider & VU Meter */}
        <div className="flex items-center gap-2.5 pt-1 border-t border-white/5">
          <div className="flex-1 min-w-0">
            <SliderComponent
              value={micVolume}
              disabled={isMicMuted}
              onCommit={(val) => {
                setMicVolume(val);
                onInputVolumeCommit?.(val);
                onToast?.(`Microphone input gain set to ${val}%`);
              }}
              aria-label="Microphone input gain"
              className={cn(isMicMuted && "opacity-40")}
            />
          </div>

          {/* Input VU Meter */}
          <div
            className="w-10 h-2 bg-slate-800 rounded-sm overflow-hidden flex shrink-0"
            title="Microphone Input Level Meter"
          >
            <div
              className={cn(
                "h-full rounded-sm transition-all duration-150",
                !isMicMuted
                  ? "bg-gradient-to-r from-emerald-500 via-sky-400 to-purple-400 animate-pulse"
                  : "bg-slate-700"
              )}
              style={{ width: isMicMuted ? "0%" : "68%" }}
            />
          </div>

          <ButtonComponent
            variant={isMicMuted ? "destructive" : "outline"}
            size="icon"
            onClick={() => {
              const next = !isMicMuted;
              setIsMicMuted(next);
              onToast?.(next ? "Microphone input muted" : "Microphone input unmuted");
            }}
            className="h-7 w-7 shrink-0"
            aria-label={isMicMuted ? "Unmute microphone" : "Mute microphone"}
            title={isMicMuted ? "Unmute microphone" : "Mute microphone"}
            leftIcon={
              isMicMuted ? (
                <MicOff className="w-3.5 h-3.5 text-rose-400" />
              ) : (
                <Mic className="w-3.5 h-3.5 text-slate-300" />
              )
            }
          />
        </div>
      </div>

      {/* 2. macOS System Alerts & Sounds Channel */}
      <div className="p-3.5 rounded-2xl bg-gradient-to-b from-[#131924] to-[#0e121a] border border-white/8 shadow-sm flex flex-col justify-between gap-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "w-6 h-6 rounded-lg flex items-center justify-center transition-colors",
                isSystemMuted
                  ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                  : "bg-amber-500/15 text-amber-400 border border-amber-400/30"
              )}
            >
              {isSystemMuted ? <BellOff className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-200 tracking-tight m-0">
                macOS System Sounds
              </h4>
              <p className="text-[10px] text-slate-400 m-0">Alerts, Chimes & Notifications</p>
            </div>
          </div>

          <button
            onClick={handleTestChime}
            className={cn(
              "px-2 py-0.5 rounded-md text-[10px] font-semibold border transition-all cursor-pointer flex items-center gap-1",
              isPlayingChime
                ? "bg-amber-500/20 border-amber-400 text-amber-200 shadow-sm"
                : "bg-slate-900 border-white/10 text-slate-400 hover:text-white hover:border-white/20"
            )}
            title="Play sample macOS notification sound"
          >
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>Test Chime</span>
          </button>
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-400 px-0.5">
          <span>Alert Effects Volume</span>
          <span className="font-mono text-slate-300 tabular-nums">{sysVolume}%</span>
        </div>

        {/* Volume Slider & Mute */}
        <div className="flex items-center gap-2.5 pt-1 border-t border-white/5">
          <div className="flex-1 min-w-0">
            <SliderComponent
              value={sysVolume}
              disabled={isSystemMuted}
              onCommit={(val) => {
                setSysVolume(val);
                onSystemVolumeCommit?.(val);
                onToast?.(`System alerts volume set to ${val}%`);
              }}
              aria-label="System sounds volume"
              className={cn(isSystemMuted && "opacity-40")}
            />
          </div>

          <ButtonComponent
            variant={isSystemMuted ? "destructive" : "outline"}
            size="icon"
            onClick={() => {
              const next = !isSystemMuted;
              setIsSystemMuted(next);
              onToast?.(next ? "System sounds muted" : "System sounds unmuted");
            }}
            className="h-7 w-7 shrink-0"
            aria-label={isSystemMuted ? "Unmute system sounds" : "Mute system sounds"}
            title={isSystemMuted ? "Unmute system sounds" : "Mute system sounds"}
            leftIcon={
              isSystemMuted ? (
                <BellOff className="w-3.5 h-3.5 text-rose-400" />
              ) : (
                <Bell className="w-3.5 h-3.5 text-slate-300" />
              )
            }
          />
        </div>
      </div>
    </div>
  );
};
