import { useState, useEffect, useRef, type FC, type PointerEvent } from "react";
import {
  SlidersHorizontal,
  Activity,
  RotateCcw,
  Sparkles,
  Check,
  Disc,
  Headphones,
  Mic,
  Moon,
  Music,
} from "lucide-react";
import { BadgeComponent } from "@/shared/ui";
import { useLiveAudioMeters } from "@/shared/lib/useLiveAudioMeters";
import { cn } from "@/lib/utils";

export interface EQBandState {
  frequency: number;
  gain: number; // -12 to +12 dB
}

export const DEFAULT_BANDS: EQBandState[] = [
  { frequency: 32, gain: 0 },
  { frequency: 64, gain: 0 },
  { frequency: 125, gain: 0 },
  { frequency: 250, gain: 0 },
  { frequency: 500, gain: 0 },
  { frequency: 1000, gain: 0 },
  { frequency: 2000, gain: 0 },
  { frequency: 4000, gain: 0 },
  { frequency: 8000, gain: 0 },
  { frequency: 16000, gain: 0 },
];

export interface AcousticProfile {
  id: string;
  name: string;
  description: string;
  icon: typeof Music;
  gains: number[];
}

export const ACOUSTIC_PROFILES: AcousticProfile[] = [
  {
    id: "flat",
    name: "Flat (Default)",
    description: "Uncolored studio monitor reference curve",
    icon: Disc,
    gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  {
    id: "bass",
    name: "Bass Boost",
    description: "Deep punchy sub-bass & low-end warmth",
    icon: Headphones,
    gains: [5.5, 4.8, 3.2, 1.0, 0, 0, 0, 0.5, 1.2, 1.5],
  },
  {
    id: "vocal",
    name: "Vocal Clarity",
    description: "Brings dialogue & vocals forward in mix",
    icon: Mic,
    gains: [-2.0, -1.0, 0, 1.5, 3.2, 4.0, 3.5, 2.0, 0.5, 0],
  },
  {
    id: "electronic",
    name: "Electronic / Dance",
    description: "Punchy V-curve for synth & EDM rhythms",
    icon: Sparkles,
    gains: [6.0, 5.0, 2.0, -1.0, -1.5, 1.0, 2.5, 4.0, 5.2, 5.5],
  },
  {
    id: "podcast",
    name: "Podcast / Speech",
    description: "Cuts sub-rumble, enhances vocal articulation",
    icon: Activity,
    gains: [-4.0, -2.5, 0, 1.0, 2.5, 3.8, 2.5, 1.0, -1.0, -3.0],
  },
  {
    id: "latenight",
    name: "Late Night Soft",
    description: "Tamed highs & low fatigue listening",
    icon: Moon,
    gains: [-1.5, -1.0, 0, 0.5, 0.5, 0, -1.0, -2.0, -3.5, -4.5],
  },
];

interface StudioEQInspectorProps {
  activePresetName: string;
  isAudioActive?: boolean;
  onPresetSelect?: (presetName: string) => void;
  onBandChange?: (bandIndex: number, gainDb: number) => void;
}

export const StudioEQInspector: FC<StudioEQInspectorProps> = ({
  activePresetName,
  isAudioActive = false,
  onPresetSelect,
  onBandChange,
}) => {
  const [bands, setBands] = useState<EQBandState[]>(DEFAULT_BANDS);
  const [isBypassed, setIsBypassed] = useState(false);
  const liveMeters = useLiveAudioMeters(isAudioActive && !isBypassed);

  // Sync bands whenever preset changes
  useEffect(() => {
    const profile = ACOUSTIC_PROFILES.find((p) => p.name === activePresetName);
    if (profile) {
      setBands(
        DEFAULT_BANDS.map((b, idx) => ({
          ...b,
          gain: profile.gains[idx] ?? 0,
        }))
      );
    }
  }, [activePresetName]);

  const updateGain = (idx: number, newGain: number) => {
    const clamped = Math.max(-12, Math.min(12, Math.round(newGain * 2) / 2));
    setBands((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], gain: clamped };
      return next;
    });
    onBandChange?.(idx, clamped);
  };

  const handleResetFlat = () => {
    setBands(DEFAULT_BANDS);
    onPresetSelect?.("Flat (Default)");
  };

  // Generate SVG curve points across 10 bands
  const width = 360;
  const height = 120;
  const zeroY = height / 2;

  const points = bands.map((b, i) => {
    const x = (i / (bands.length - 1)) * (width - 40) + 20;
    const y = zeroY - (b.gain / 12) * (zeroY - 14);
    return { x, y };
  });

  const pathD = points.reduce((acc, pt, i, arr) => {
    if (i === 0) return `M ${pt.x} ${pt.y}`;
    const prev = arr[i - 1];
    const cpX = (prev.x + pt.x) / 2;
    return `${acc} C ${cpX} ${prev.y}, ${cpX} ${pt.y}, ${pt.x} ${pt.y}`;
  }, "");

  const areaD = `${pathD} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

  return (
    <aside
      className="p-4 rounded-2xl bg-gradient-to-b from-[#131924] via-[#10141c] to-[#0c0f16] border border-white/10 shadow-[0_12px_36px_rgba(0,0,0,0.4)] backdrop-blur-md flex flex-col gap-4.5 select-none h-full"
      aria-label="Studio 10-Band Parametric Equalizer Inspector"
    >
      {/* Inspector Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-white/6">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-amber-500/15 border border-amber-400/30 flex items-center justify-center text-amber-400">
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-100 tracking-tight m-0">
              Parametric EQ & Spectrum
            </h3>
            <p className="text-[10px] text-slate-400 m-0">
              10-Band Linear Phase DSP Studio Rack
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsBypassed((prev) => !prev)}
            className={cn(
              "px-2 py-0.5 text-[10px] font-semibold rounded-md border transition-all cursor-pointer",
              isBypassed
                ? "bg-rose-500/15 border-rose-500/40 text-rose-300"
                : "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
            )}
          >
            {isBypassed ? "EQ BYPASS" : "EQ ACTIVE"}
          </button>
          <button
            onClick={handleResetFlat}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Reset EQ to flat 0 dB"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Interactive Frequency Response Curve Display */}
      <div className="relative rounded-xl bg-slate-950/80 border border-white/8 p-3 overflow-hidden shadow-inner">
        {/* dB Grid Lines */}
        <div className="absolute inset-x-2 top-2 bottom-2 flex flex-col justify-between pointer-events-none opacity-20">
          <div className="border-b border-dashed border-white text-[8px] text-slate-400 font-mono">+12 dB</div>
          <div className="border-b border-dashed border-white text-[8px] text-slate-400 font-mono">0 dB</div>
          <div className="border-b border-dashed border-white text-[8px] text-slate-400 font-mono">-12 dB</div>
        </div>

        {/* SVG Curve */}
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className={cn(
            "w-full h-26 overflow-visible transition-opacity duration-200",
            isBypassed && "opacity-25"
          )}
        >
          <defs>
            <linearGradient id="eqGlow" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#0284c7" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Area Fill */}
          <path d={areaD} fill="url(#eqGlow)" />

          {/* Curve Stroke */}
          <path
            d={pathD}
            fill="none"
            stroke="#38bdf8"
            strokeWidth="2.5"
            strokeLinecap="round"
          />

          {/* Band Marker Nodes */}
          {points.map((pt, i) => (
            <g key={i}>
              <circle
                cx={pt.x}
                cy={pt.y}
                r="4.5"
                fill="#ffffff"
                stroke="#0284c7"
                strokeWidth="2"
              />
            </g>
          ))}
        </svg>
      </div>

      {/* 10-Band Custom Vertical Faders Rack */}
      <div className="grid grid-cols-10 gap-1 pt-1 pb-1 items-end justify-items-center">
        {bands.map((band, idx) => {
          const freqLabel =
            band.frequency >= 1000
              ? `${band.frequency / 1000}k`
              : `${band.frequency}`;

          return (
            <CustomVerticalFader
              key={band.frequency}
              frequencyLabel={freqLabel}
              gain={band.gain}
              disabled={isBypassed}
              onChange={(val) => updateGain(idx, val)}
            />
          );
        })}
      </div>

      {/* Acoustic Profiles Library */}
      <div className="flex flex-col gap-2 pt-2 border-t border-white/6">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-sky-400" />
            Acoustic Profiles Library
          </span>
          <span className="text-[10px] text-slate-500 font-mono">6 Master Curves</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {ACOUSTIC_PROFILES.map((profile) => {
            const isSelected = activePresetName === profile.name;
            const Icon = profile.icon;

            return (
              <button
                key={profile.id}
                onClick={() => onPresetSelect?.(profile.name)}
                className={cn(
                  "p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-2.5 group",
                  isSelected
                    ? "bg-sky-500/15 border-sky-400/40 text-sky-100 shadow-[0_2px_12px_rgba(56,189,248,0.15)] ring-1 ring-sky-400/20"
                    : "bg-slate-950/60 border-white/6 text-slate-400 hover:text-slate-200 hover:border-white/14 hover:bg-slate-900/60"
                )}
              >
                <div
                  className={cn(
                    "w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                    isSelected
                      ? "bg-sky-500 text-slate-950 font-bold"
                      : "bg-slate-800 text-slate-400 group-hover:text-white"
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-200 truncate block">
                      {profile.name}
                    </span>
                    {isSelected && <Check className="w-3 h-3 text-sky-400 shrink-0 ml-1" />}
                  </div>
                  <p className="text-[10px] text-slate-400 leading-tight mt-0.5 truncate">
                    {profile.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 28-Bar High-Resolution Live Audio Spectrum Analyzer */}
      <div className="p-3 rounded-xl bg-slate-950/80 border border-white/6 flex flex-col gap-2 mt-auto">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-slate-300 font-semibold flex items-center gap-1.5">
            <Activity className="w-3 h-3 text-emerald-400" />
            Live 28-Band Spectrum Analyzer
          </span>
          <BadgeComponent variant="emerald" dot={isAudioActive} className="text-[9px] px-1.5 py-0">
            {isAudioActive ? "ACTIVE AUDIO STREAM" : "IDLE"}
          </BadgeComponent>
        </div>

        {/* 28 Frequency Spectrum Bars */}
        <div className="flex items-end gap-1 h-12 w-full pt-1 px-1">
          {liveMeters.spectrumHeights.map((h, i) => {
            return (
              <div
                key={i}
                className={cn(
                  "flex-1 rounded-t-sm transition-all duration-75",
                  isAudioActive
                    ? h > 75
                      ? "bg-gradient-to-t from-sky-500 via-emerald-400 to-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.35)]"
                      : h > 45
                      ? "bg-gradient-to-t from-sky-500 to-emerald-400"
                      : "bg-gradient-to-t from-sky-600 to-sky-400"
                    : "bg-slate-800"
                )}
                style={{
                  height: `${h}%`,
                }}
              />
            );
          })}
        </div>

        <div className="flex justify-between text-[8px] font-mono text-slate-400 px-1 border-t border-white/4 pt-1">
          <span>20 Hz</span>
          <span>250 Hz</span>
          <span>1 kHz</span>
          <span>4 kHz</span>
          <span>20 kHz</span>
        </div>
      </div>
    </aside>
  );
};

interface CustomVerticalFaderProps {
  frequencyLabel: string;
  gain: number;
  disabled?: boolean;
  onChange: (newGain: number) => void;
}

const CustomVerticalFader: FC<CustomVerticalFaderProps> = ({
  frequencyLabel,
  gain,
  disabled = false,
  onChange,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  // Convert gain (-12 to +12) to top percentage (0% to 100%)
  // gain = +12 -> top = 0%
  // gain = 0   -> top = 50%
  // gain = -12 -> top = 100%
  const normalized = (12 - gain) / 24; // 0.0 to 1.0
  const topPercent = Math.max(0, Math.min(100, normalized * 100));

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    isDragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    calculateGain(e.clientY);
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current || disabled) return;
    calculateGain(e.clientY);
  };

  const handlePointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore capture release error
    }
  };

  const calculateGain = (clientY: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const offsetY = clientY - rect.top;
    const ratio = Math.max(0, Math.min(1, offsetY / rect.height));
    const calculatedGain = 12 - ratio * 24;
    onChange(calculatedGain);
  };

  return (
    <div className="flex flex-col items-center gap-1 w-full select-none">
      {/* Gain Numeric readout */}
      <span
        className={cn(
          "text-[9px] font-mono tabular-nums leading-none",
          gain > 0 ? "text-sky-300 font-bold" : gain < 0 ? "text-amber-400" : "text-slate-500"
        )}
      >
        {gain > 0 ? `+${gain.toFixed(0)}` : gain.toFixed(0)}
      </span>

      {/* Fader Track */}
      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={() => !disabled && onChange(0)}
        className={cn(
          "studio-fader-track cursor-ns-resize",
          disabled && "opacity-40 cursor-not-allowed"
        )}
        title={`${frequencyLabel} Hz: ${gain > 0 ? `+${gain.toFixed(1)}` : gain.toFixed(1)} dB (Double-click to reset)`}
      >
        {/* Dark Groove */}
        <div className="studio-fader-groove" />

        {/* 0 dB Center Notch */}
        <div className="studio-fader-zero-mark" />

        {/* Colored Fill indicator */}
        {gain !== 0 && (
          <div
            className="studio-fader-fill"
            style={{
              top: gain > 0 ? `${topPercent}%` : "50%",
              height: `${Math.abs(topPercent - 50)}%`,
              backgroundColor: gain > 0 ? "#38bdf8" : "#f59e0b",
            }}
          />
        )}

        {/* Fader Thumb Handle */}
        <div
          className="studio-fader-thumb"
          style={{
            top: `calc(${topPercent}% - 6px)`,
          }}
        />
      </div>

      {/* Frequency Label */}
      <span className="text-[9px] font-bold text-slate-400 leading-none">{frequencyLabel}</span>
    </div>
  );
};
