import type { FC } from "react";
import { cn } from "@/lib/utils";

export interface AppLogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  variant?: "icon-only" | "with-wordmark";
  animated?: boolean;
  className?: string;
}

const SIZE_MAP = {
  sm: { icon: "w-7 h-7", container: "w-7 h-7", text: "text-xs", badge: "text-[9px]" },
  md: { icon: "w-9 h-9", container: "w-9 h-9", text: "text-sm", badge: "text-[10px]" },
  lg: { icon: "w-11 h-11", container: "w-11 h-11", text: "text-base", badge: "text-[11px]" },
  xl: { icon: "w-14 h-14", container: "w-14 h-14", text: "text-xl", badge: "text-xs" },
};

/**
 * Sonic S Waveform Brand Logo:
 * Biểu tượng nhận diện cao cấp cho SoundsSource Rust:
 * Kết hợp dải sóng âm liên tục tạo hình chữ 'S' biểu trưng (SoundsSource / Sonic Wave),
 * 3 vòng cung cộng hưởng âm sắc tần số cao (Harmonic Resonance Arcs)
 * và lõi phát âm trung tâm (Studio Phase Driver).
 */
export const AppLogo: FC<AppLogoProps> = ({
  size = "md",
  variant = "icon-only",
  animated = false,
  className,
}) => {
  const config = SIZE_MAP[size];

  const Emblem = (
    <div
      className={cn(
        "relative rounded-xl flex items-center justify-center p-1.5 overflow-hidden transition-all duration-300 select-none group",
        "bg-gradient-to-b from-[#131b29] via-[#0e1420] to-[#080d15]",
        "border border-white/14 shadow-[0_4px_18px_rgba(56,189,248,0.22)]",
        "hover:border-sky-400/40 hover:shadow-[0_6px_24px_rgba(56,189,248,0.35)]",
        config.container,
        className
      )}
    >
      {/* Specular Top-Light Glass Reflection */}
      <div className="absolute inset-x-0 top-0 h-[40%] bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />

      {/* Ambient Radial Sonic Glow */}
      <div className="absolute inset-0 bg-radial from-sky-400/25 via-transparent to-transparent opacity-80 group-hover:opacity-100 transition-opacity pointer-events-none" />

      {/* Vector Brandmark SVG */}
      <svg
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={cn("w-full h-full relative z-10", animated && "animate-pulse")}
      >
        <defs>
          {/* Electric Sky to Cyan Gradient */}
          <linearGradient id="sonicSky" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="50%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#2dd4bf" />
          </linearGradient>

          {/* Indigo to Violet Gradient */}
          <linearGradient id="sonicViolet" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#818cf8" />
            <stop offset="100%" stopColor="#6366f1" />
          </linearGradient>

          {/* Emerald Acoustic Gradient */}
          <linearGradient id="sonicTeal" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>

          {/* Core Specular Glow Filter */}
          <filter id="irisGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="0.8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Outer Acoustic Resonance Orbit Ring */}
        <circle
          cx="18"
          cy="18"
          r="15"
          stroke="url(#sonicSky)"
          strokeWidth="1.2"
          strokeDasharray="2.5 2"
          opacity="0.35"
        />

        {/* Dynamic Harmonic Sound Waves radiating from core */}
        {/* Left acoustic arc */}
        <path
          d="M 10 11 A 10 10 0 0 0 10 25"
          stroke="url(#sonicSky)"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.65"
        />

        {/* Right acoustic arc */}
        <path
          d="M 26 11 A 10 10 0 0 1 26 25"
          stroke="url(#sonicViolet)"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.65"
        />

        {/* Signature 'S' Continuous SoundWave Ribbon */}
        {/* Upper S-Curve loop */}
        <path
          d="M 23 11 C 23 7, 13 7, 13 13 C 13 18, 23 18, 23 23 C 23 29, 13 29, 13 25"
          stroke="url(#sonicSky)"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#irisGlow)"
        />

        {/* Center Studio Phase Driver Node */}
        <circle cx="18" cy="18" r="2.2" fill="#ffffff" filter="url(#irisGlow)" />
        <circle cx="18" cy="18" r="4.2" stroke="url(#sonicTeal)" strokeWidth="1.2" opacity="0.8" />
      </svg>
    </div>
  );

  if (variant === "icon-only") {
    return Emblem;
  }

  return (
    <div className="flex items-center gap-3 select-none">
      {Emblem}
      <div className="flex flex-col">
        <div className="flex items-center gap-1.5 leading-none">
          <span className={cn("font-bold tracking-tight text-white font-sans", config.text)}>
            SOUNDS<span className="text-sky-400 font-extrabold">SOURCE</span>
          </span>
          <span
            className={cn(
              "font-mono font-semibold uppercase tracking-widest text-slate-300 bg-white/6 px-1.5 py-0.5 rounded border border-white/8",
              config.badge
            )}
          >
            RUST
          </span>
        </div>
        <span className="text-[10px] text-slate-400 font-medium tracking-wide mt-0.5">
          macOS CoreAudio & AI Studio Hub
        </span>
      </div>
    </div>
  );
};
