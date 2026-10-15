import type { FC } from "react";
import { cn } from "@/lib/utils";

export interface AppLogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  variant?: "icon-only" | "with-wordmark";
  animated?: boolean;
  className?: string;
}

const SIZE_MAP = {
  sm: { icon: "w-7 h-7", container: "w-7 h-7 p-1.5", text: "text-xs", badge: "text-[9px]" },
  md: { icon: "w-9 h-9", container: "w-9 h-9 p-2", text: "text-sm", badge: "text-[10px]" },
  lg: { icon: "w-11 h-11", container: "w-11 h-11 p-2.5", text: "text-base", badge: "text-[11px]" },
  xl: { icon: "w-14 h-14", container: "w-14 h-14 p-3", text: "text-xl", badge: "text-xs" },
};

/**
 * Minimalist Studio Soundwave Logo:
 * Biểu tượng nhận diện âm thanh tối giản, thanh lịch cho SoundsSource Rust.
 * 5 dải sóng âm thanh phòng thu (Studio Audio Equalizer Waveform)
 * với đường cong âm sắc hài hòa, không chi tiết thừa, hiển thị sắc nét ở mọi kích thước.
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
        "relative rounded-xl flex items-center justify-center overflow-hidden transition-all duration-200 select-none group shrink-0",
        "bg-gradient-to-b from-[#221c2b] via-[#181320] to-[#0f0b14]",
        "border border-white/10 shadow-sm",
        "hover:border-[var(--accent)]/40 hover:shadow-md",
        config.container,
        className
      )}
      title="SoundsSource Rust"
    >
      {/* Subtle Specular Top Arc */}
      <div className="absolute inset-x-0 top-0 h-[35%] bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />

      {/* Vector Brandmark SVG: 5 Minimalist Sound Wave Bars */}
      <svg
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={cn("w-full h-full relative z-10")}
      >
        <defs>
          {/* Harmonic Studio Sound Gradient: Cyan -> Indigo -> Rose */}
          <linearGradient id="appSonicGradient" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="50%" stopColor="#818cf8" />
            <stop offset="100%" stopColor="#f472b6" />
          </linearGradient>
        </defs>

        {/* 5 Clean Rhythmic Equalizer Sound Bars with Rounded Caps */}
        <rect
          x="6.5"
          y="13"
          width="3.2"
          height="10"
          rx="1.6"
          fill="url(#appSonicGradient)"
          opacity="0.8"
          className={cn(animated && "animate-pulse")}
          style={{ animationDelay: "0.2s" }}
        />
        <rect
          x="11.8"
          y="8"
          width="3.2"
          height="20"
          rx="1.6"
          fill="url(#appSonicGradient)"
          opacity="0.92"
          className={cn(animated && "animate-pulse")}
          style={{ animationDelay: "0.1s" }}
        />
        <rect
          x="17.1"
          y="4.5"
          width="3.2"
          height="27"
          rx="1.6"
          fill="url(#appSonicGradient)"
          className={cn(animated && "animate-pulse")}
        />
        <rect
          x="22.4"
          y="8"
          width="3.2"
          height="20"
          rx="1.6"
          fill="url(#appSonicGradient)"
          opacity="0.92"
          className={cn(animated && "animate-pulse")}
          style={{ animationDelay: "0.1s" }}
        />
        <rect
          x="27.7"
          y="13"
          width="3.2"
          height="10"
          rx="1.6"
          fill="url(#appSonicGradient)"
          opacity="0.8"
          className={cn(animated && "animate-pulse")}
          style={{ animationDelay: "0.2s" }}
        />
      </svg>
    </div>
  );

  if (variant === "icon-only") {
    return Emblem;
  }

  return (
    <div className="flex items-center gap-2.5 select-none">
      {Emblem}
      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-1.5 leading-none">
          <span className={cn("font-bold tracking-tight text-[var(--ink)] font-heading truncate", config.text)}>
            Sounds<span className="text-[var(--accent)] font-extrabold">Source</span>
          </span>
          <span
            className={cn(
              "font-mono font-bold uppercase tracking-wider text-[var(--accent)] bg-[var(--accent)]/10 px-1.5 py-0.5 rounded border border-[var(--accent)]/20 shrink-0",
              config.badge
            )}
          >
            RUST
          </span>
        </div>
        <span className="text-[10px] text-[var(--muted)] font-medium tracking-normal mt-0.5 truncate">
          macOS CoreAudio & AI Studio Hub
        </span>
      </div>
    </div>
  );
};
