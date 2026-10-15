import { useState, useEffect, type FC } from "react";
import { formatAssetName } from "@/lib/pingloom";
import { cn } from "@/lib/utils";

export interface PingBurstItem {
  id: string;
  x: number;
  y: number;
  pingId: string;
  name: string;
  color: string;
  durationMs?: number;
}

interface PingBurstMarkerProps {
  burst: PingBurstItem;
  onExpire?: (id: string) => void;
}

export const PingBurstMarker: FC<PingBurstMarkerProps> = ({
  burst,
  onExpire,
}) => {
  const [stage, setStage] = useState<"arrive" | "pulse" | "fade">("arrive");

  useEffect(() => {
    const duration = burst.durationMs ?? 3000;
    const pulseTimer = setTimeout(() => setStage("pulse"), 150);
    const fadeTimer = setTimeout(() => setStage("fade"), duration - 400);
    const expireTimer = setTimeout(() => onExpire?.(burst.id), duration);

    return () => {
      clearTimeout(pulseTimer);
      clearTimeout(fadeTimer);
      clearTimeout(expireTimer);
    };
  }, [burst.id, burst.durationMs, onExpire]);

  return (
    <div
      style={{ left: `${burst.x}px`, top: `${burst.y}px` }}
      className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none z-50 flex flex-col items-center justify-center"
    >
      {/* Expanding Harmonic Outer Ring Wave */}
      <div
        className={cn(
          "absolute w-20 h-20 rounded-full border-2 transition-all duration-700 ease-out",
          stage === "arrive" && "scale-50 opacity-100",
          stage === "pulse" && "scale-150 opacity-40 animate-ping",
          stage === "fade" && "scale-175 opacity-0"
        )}
        style={{ borderColor: burst.color }}
      />

      {/* Secondary Inner Acoustic Ripple */}
      <div
        className={cn(
          "absolute w-12 h-12 rounded-full border transition-all duration-500 ease-out",
          stage === "arrive" && "scale-75 opacity-80",
          stage === "pulse" && "scale-125 opacity-20",
          stage === "fade" && "scale-140 opacity-0"
        )}
        style={{ borderColor: burst.color, backgroundColor: `${burst.color}15` }}
      />

      {/* Center Tactical Ping Diamond / Node Badge */}
      <div
        className={cn(
          "relative w-9 h-9 rounded-xl flex items-center justify-center shadow-lg transition-transform duration-200 transform",
          stage === "arrive" && "scale-110",
          stage === "pulse" && "scale-100",
          stage === "fade" && "scale-75 opacity-0"
        )}
        style={{
          backgroundColor: burst.color,
          boxShadow: `0 0 18px ${burst.color}80, 0 4px 12px rgba(0,0,0,0.5)`,
        }}
      >
        <span className="text-white text-[11px] font-black uppercase tracking-wider">
          {burst.name.slice(0, 2).toUpperCase()}
        </span>
      </div>

      {/* Floating Tactical Label */}
      <span
        className={cn(
          "mt-1.5 px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-widest text-white shadow-md transition-opacity duration-300",
          stage === "fade" ? "opacity-0" : "opacity-100"
        )}
        style={{
          backgroundColor: "rgba(15, 12, 18, 0.85)",
          border: `1px solid ${burst.color}80`,
          boxShadow: `0 2px 8px rgba(0,0,0,0.6)`,
        }}
      >
        {burst.name || formatAssetName(burst.pingId)}
      </span>
    </div>
  );
};
