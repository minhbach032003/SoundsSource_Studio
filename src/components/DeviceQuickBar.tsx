import { useState, useEffect, type FC } from "react";
import {
  Volume2,
  VolumeX,
  SlidersHorizontal,
  Headphones,
  Speaker,
  Sliders,
} from "lucide-react";
import { SelectComponent, SliderComponent, ButtonComponent, BadgeComponent } from "@/shared/ui";
import { useLiveAudioMeters } from "@/shared/lib/useLiveAudioMeters";
import { cn } from "@/lib/utils";

export interface AudioDevice {
  name: string;
  uid: string;
  is_default: boolean;
}

export interface Preset {
  name: string;
  is_default: boolean;
}

interface DeviceQuickBarProps {
  devices: AudioDevice[];
  presets: Preset[];
  selectedDevice: string;
  selectedPreset: string;
  onDeviceChange?: (uid: string) => void;
  onPresetChange?: (name: string) => void;
  masterVolume?: number;
  onMasterVolumeChange?: (vol: number) => void;
  balance?: number;
  onBalanceChange?: (bal: number) => void;
  isMuted?: boolean;
  onMasterMuteToggle?: () => void;
  isAudioActive?: boolean;
  disabled?: boolean;
}

export const DeviceQuickBar: FC<DeviceQuickBarProps> = ({
  devices,
  presets,
  selectedDevice,
  selectedPreset,
  onDeviceChange,
  onPresetChange,
  masterVolume = 100,
  onMasterVolumeChange,
  balance = 0,
  onBalanceChange,
  isMuted = false,
  onMasterMuteToggle,
  isAudioActive = false,
  disabled = false,
}) => {
  const [internalMasterVol, setInternalMasterVol] = useState(masterVolume);
  const [internalBalance, setInternalBalance] = useState(balance);

  useEffect(() => {
    setInternalMasterVol(masterVolume);
  }, [masterVolume]);

  useEffect(() => {
    setInternalBalance(balance);
  }, [balance]);

  const liveMeters = useLiveAudioMeters(isAudioActive && !isMuted);
  const gainScalar = internalMasterVol / 100;
  const balL = internalBalance > 0 ? (100 - internalBalance) / 100 : 1;
  const balR = internalBalance < 0 ? (100 + internalBalance) / 100 : 1;

  const dynamicL = isMuted ? 0 : Math.round(liveMeters.levelL * gainScalar * balL);
  const dynamicR = isMuted ? 0 : Math.round(liveMeters.levelR * gainScalar * balR);

  const deviceOptions =
    devices.length === 0
      ? [{ label: "Loading devices…", value: "" }]
      : devices.map((d) => ({
          label: `${d.name}${d.is_default ? " (Default)" : ""}`,
          value: d.uid,
        }));

  const presetOptions =
    presets.length === 0
      ? [{ label: "Loading presets…", value: "" }]
      : presets.map((p) => ({
          label: `${p.name}${p.is_default ? " (Default)" : ""}`,
          value: p.name,
        }));

  const activeDeviceObj = devices.find((d) => d.uid === selectedDevice);
  const isHeadphones = activeDeviceObj
    ? /headphone|airpods|earphones/i.test(activeDeviceObj.name)
    : true;

  const handleVolumeCommit = (val: number) => {
    setInternalMasterVol(val);
    onMasterVolumeChange?.(val);
  };

  const handleBalanceCommit = (val: number) => {
    setInternalBalance(val);
    onBalanceChange?.(val);
  };

  return (
    <section
      className="p-4 rounded-2xl bg-gradient-to-b from-[#131924] to-[#0e121a] border border-white/10 shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-md"
      aria-label="Master Output Console"
    >
      {/* Console Header */}
      <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-white/6">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-sky-500/15 border border-sky-400/30 flex items-center justify-center text-sky-400">
            {isHeadphones ? (
              <Headphones className="w-4 h-4" />
            ) : (
              <Speaker className="w-4 h-4" />
            )}
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-100 tracking-tight m-0">
              Master Output Channel
            </h3>
            <p className="text-[10px] text-slate-400 m-0">
              Hardware CoreAudio Master Bus
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <BadgeComponent variant="emerald" dot={isAudioActive} className="text-[9px] px-2 py-0.5">
            {isAudioActive ? "Stream Active" : "Standby"}
          </BadgeComponent>
          <span className="text-[10px] text-slate-400 tabular-nums hidden sm:inline">
            48.0 kHz · 24-bit Stereo
          </span>
        </div>
      </div>

      {/* Selectors Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-3.5">
        <div className="min-w-0">
          <SelectComponent
            id="output-device-select"
            leftIcon={
              isHeadphones ? (
                <Headphones className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              )
            }
            options={deviceOptions}
            value={selectedDevice}
            onChange={onDeviceChange}
            disabled={disabled}
          />
        </div>

        <div className="min-w-0">
          <SelectComponent
            id="preset-select"
            leftIcon={<SlidersHorizontal className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
            options={presetOptions}
            value={selectedPreset}
            onChange={onPresetChange}
            disabled={disabled}
          />
        </div>
      </div>

      {/* Master Volume Slider & Stereo VU Meter */}
      <div className="flex flex-col gap-2.5 pt-1 border-t border-white/6">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-300 font-semibold flex items-center gap-1.5">
            <Volume2 className="w-3.5 h-3.5 text-sky-400" />
            Master Volume Fader
          </span>
          <span className="font-mono text-slate-400 text-[10px] tabular-nums">
            {internalMasterVol === 0
              ? "-∞ dB"
              : `${Math.round(((internalMasterVol - 100) / 100) * 24)} dB`}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <SliderComponent
              value={internalMasterVol}
              disabled={disabled}
              onCommit={handleVolumeCommit}
              aria-label="Master output volume"
              className={cn(isMuted && "opacity-40")}
            />
          </div>

          {/* Stereo VU Meter Simulation */}
          <div
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-950/80 border border-white/6 select-none shrink-0"
            title="Stereo Output VU Meter (L / R)"
            aria-label="Stereo Output VU Meter"
          >
            <span className="text-[9px] font-bold text-slate-500 font-mono">L</span>
            <div className="w-10 h-2 bg-slate-800 rounded-sm overflow-hidden flex">
              <div
                className={cn(
                  "h-full rounded-sm transition-all duration-75",
                  isAudioActive && !isMuted
                    ? dynamicL > 80
                      ? "bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-500"
                      : "bg-gradient-to-r from-emerald-500 to-sky-400"
                    : "bg-slate-700"
                )}
                style={{ width: `${dynamicL}%` }}
              />
            </div>

            <span className="text-[9px] font-bold text-slate-500 font-mono ml-0.5">R</span>
            <div className="w-10 h-2 bg-slate-800 rounded-sm overflow-hidden flex">
              <div
                className={cn(
                  "h-full rounded-sm transition-all duration-75",
                  isAudioActive && !isMuted
                    ? dynamicR > 80
                      ? "bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-500"
                      : "bg-gradient-to-r from-emerald-500 to-sky-400"
                    : "bg-slate-700"
                )}
                style={{ width: `${dynamicR}%` }}
              />
            </div>
          </div>

          {/* Master Mute Button */}
          <ButtonComponent
            variant={isMuted ? "destructive" : "outline"}
            size="icon"
            onClick={onMasterMuteToggle}
            disabled={disabled}
            aria-pressed={isMuted}
            aria-label={isMuted ? "Unmute master output" : "Mute master output"}
            title={isMuted ? "Unmute master output" : "Mute master output"}
            className="h-8 w-8 shrink-0"
            leftIcon={
              isMuted ? (
                <VolumeX className="w-4 h-4 text-rose-400" />
              ) : (
                <Volume2 className="w-4 h-4 text-slate-300" />
              )
            }
          />
        </div>

        {/* Stereo Balance Slider (L - C - R) */}
        <div className="flex items-center justify-between gap-3 pt-1 text-[10px] text-slate-400">
          <span className="shrink-0 flex items-center gap-1 font-semibold text-slate-300">
            <Sliders className="w-3 h-3 text-slate-400" />
            Balance
          </span>
          <div className="flex-1 max-w-[180px] flex items-center gap-2">
            <span className="font-mono text-[9px] text-slate-500">L</span>
            <input
              type="range"
              min="-100"
              max="100"
              value={internalBalance}
              disabled={disabled}
              onChange={(e) => setInternalBalance(Number(e.target.value))}
              onPointerUp={() => handleBalanceCommit(internalBalance)}
              className="w-full h-1.5 bg-slate-800 rounded-full appearance-none accent-sky-400 cursor-pointer"
            />
            <span className="font-mono text-[9px] text-slate-500">R</span>
          </div>
          <button
            onClick={() => handleBalanceCommit(0)}
            className="text-[10px] text-sky-400 hover:text-sky-300 transition-colors font-medium cursor-pointer"
            title="Reset balance to center"
          >
            {internalBalance === 0
              ? "Center (0)"
              : internalBalance < 0
              ? `L ${Math.abs(internalBalance)}%`
              : `R ${internalBalance}%`}
          </button>
        </div>
      </div>
    </section>
  );
};
