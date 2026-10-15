import { useState, useEffect, type FC } from "react";
import { Mic, MicOff, Bell, BellOff, Sparkles } from "lucide-react";
import { SliderComponent, ButtonComponent, BadgeComponent, SelectComponent } from "@/shared/ui";
import type { AudioDevice } from "@/components/DeviceQuickBar";
import { useLiveAudioMeters } from "@/shared/lib/useLiveAudioMeters";
import { audioDspChain } from "@/shared/lib/audioDspChain";
import { cn } from "@/lib/utils";

interface AudioBusesProps {
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

export const AudioBuses: FC<AudioBusesProps> = ({
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
}) => {
  // Input Mic State
  const [internalMicVol, setInternalMicVol] = useState(inputVolume);
  const [internalSelectedMic, setInternalSelectedMic] = useState(selectedInputDevice);

  // System Sounds State
  const [sysVolume, setSysVolume] = useState(systemVolume);
  const [isSystemMuted, setIsSystemMuted] = useState(false);
  const [isPlayingChime, setIsPlayingChime] = useState(false);

  useEffect(() => {
    setInternalMicVol(inputVolume);
  }, [inputVolume]);

  useEffect(() => {
    if (selectedInputDevice) {
      setInternalSelectedMic(selectedInputDevice);
    }
  }, [selectedInputDevice]);

  useEffect(() => {
    setSysVolume(systemVolume);
  }, [systemVolume]);

  const handleMicVolumeChange = (val: number) => {
    setInternalMicVol(val);
    onInputVolumeChange?.(val);
  };

  const handleMicVolumeCommit = (val: number) => {
    setInternalMicVol(val);
    onInputVolumeCommit?.(val);
  };

  // Live input audio bouncing level meter
  const liveMeters = useLiveAudioMeters(!isInputMuted);
  const inputMeterLvl = isInputMuted
    ? 0
    : Math.round(liveMeters.levelL * (internalMicVol / 100));

  const micOptions =
    inputDevices.length === 0
      ? [{ label: "Default Microphone", value: "" }]
      : inputDevices.map((d) => ({
          label: `${d.name}${d.is_default ? " (Default)" : ""}`,
          value: d.uid,
        }));

  const handleTestChime = () => {
    setIsPlayingChime(true);
    // Play pleasant system chime routed through DSP chain
    try {
      const ctx = audioDspChain.getContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
      osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.15); // A6 note

      gain.gain.setValueAtTime((sysVolume / 100) * 0.20, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

      osc.connect(gain);
      // Connect to DSP input so EQ and Bass Warmth process the chime
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
    setTimeout(() => setIsPlayingChime(false), 500);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 select-none">
      {/* 1. Input Microphone Channel */}
      <div className="p-3.5 rounded-2xl bg-[var(--surface)] border border-[var(--line)] shadow-sm flex flex-col justify-between gap-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "w-6 h-6 rounded-lg flex items-center justify-center transition-colors",
                isInputMuted
                  ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                  : "bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30"
              )}
            >
              {isInputMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            </div>
            <div>
              <h4 className="text-xs font-bold text-[var(--ink)] tracking-tight m-0">
                Microphone Input
              </h4>
              <p className="text-[10px] text-[var(--muted)] m-0">Hardware Input Bus</p>
            </div>
          </div>

          <BadgeComponent
            variant={isInputMuted ? "coral" : "secondary"}
            className="text-[9px] px-1.5 py-0 font-mono"
          >
            {isInputMuted ? "MUTED" : "LIVE"}
          </BadgeComponent>
        </div>

        {/* Mic Source Dropdown */}
        <SelectComponent
          value={internalSelectedMic || (inputDevices.find((d) => d.is_default)?.uid ?? "")}
          onChange={(val) => {
            setInternalSelectedMic(val);
            onSelectInputDevice?.(val);
            const dev = inputDevices.find((d) => d.uid === val);
            onToast?.(`Microphone switched to ${dev ? dev.name : "System Default"}`);
          }}
          options={micOptions}
          className="h-7 text-xs bg-[var(--paper)]"
        />

        {/* Mic Gain Slider & VU Meter */}
        <div className="flex flex-col gap-1.5 pt-1 border-t border-[var(--line)]">
          <div className="flex items-center justify-between text-[11px] text-[var(--muted)] px-0.5">
            <span>Input Gain</span>
            <div className="flex items-center gap-1.5">
              <span
                onDoubleClick={() => !isInputMuted && handleMicVolumeCommit(85)}
                title="Double-click to reset to 85%"
                className="font-mono text-[var(--ink)] tabular-nums font-semibold cursor-pointer hover:text-[var(--accent)]"
              >
                {internalMicVol}%
              </span>
              <span className="font-mono text-[var(--muted)] text-[10px] tabular-nums">
                ({internalMicVol === 0
                  ? "-∞ dB"
                  : `${Math.round(((internalMicVol - 100) / 100) * 24)} dB`})
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="flex-1 min-w-0">
              <SliderComponent
                value={internalMicVol}
                disabled={isInputMuted}
                onChange={handleMicVolumeChange}
                onCommit={handleMicVolumeCommit}
                aria-label="Microphone input gain"
                className={cn(isInputMuted && "opacity-40")}
              />
            </div>

            {/* Input VU Meter */}
            <div
              className="w-10 h-2 bg-[var(--line)] rounded-sm overflow-hidden flex shrink-0"
              title={`Microphone Input Level (${inputMeterLvl}%)`}
            >
              <div
                className={cn(
                  "h-full rounded-sm transition-all duration-75",
                  !isInputMuted
                    ? inputMeterLvl > 75
                      ? "bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-400"
                      : "bg-[var(--accent)]"
                    : "bg-[var(--muted)]"
                )}
                style={{ width: `${inputMeterLvl}%` }}
              />
            </div>

            <ButtonComponent
              variant={isInputMuted ? "destructive" : "outline"}
              size="icon"
              onClick={onInputMuteToggle}
              className="h-7 w-7 shrink-0"
              aria-label={isInputMuted ? "Unmute microphone" : "Mute microphone"}
              title={isInputMuted ? "Unmute microphone" : "Mute microphone"}
              leftIcon={
                isInputMuted ? (
                  <MicOff className="w-3.5 h-3.5 text-rose-400" />
                ) : (
                  <Mic className="w-3.5 h-3.5 text-slate-300" />
                )
              }
            />
          </div>
        </div>
      </div>

      {/* 2. macOS System Alerts & Sounds Channel */}
      <div className="p-3.5 rounded-2xl bg-[var(--surface)] border border-[var(--line)] shadow-sm flex flex-col justify-between gap-2.5">
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
              <h4 className="text-xs font-bold text-[var(--ink)] tracking-tight m-0">
                macOS System Sounds
              </h4>
              <p className="text-[10px] text-[var(--muted)] m-0">Alerts, Chimes & Notifications</p>
            </div>
          </div>

          <button
            onClick={handleTestChime}
            className={cn(
              "px-2 py-0.5 rounded-md text-[10px] font-semibold border transition-all cursor-pointer flex items-center gap-1",
              isPlayingChime
                ? "bg-amber-500/20 border-amber-400 text-amber-200 shadow-sm"
                : "bg-[var(--paper)] border-[var(--line)] text-[var(--muted)] hover:text-[var(--ink)] hover:border-[var(--focus)]"
            )}
            title="Play sample macOS notification sound"
          >
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>Test Chime</span>
          </button>
        </div>

        <div className="flex items-center justify-between text-[11px] text-[var(--muted)] px-0.5">
          <span>Alert Effects Volume</span>
          <span className="font-mono text-[var(--ink)] tabular-nums">{sysVolume}%</span>
        </div>

        {/* Volume Slider & Mute */}
        <div className="flex items-center gap-2.5 pt-1 border-t border-[var(--line)]">
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
