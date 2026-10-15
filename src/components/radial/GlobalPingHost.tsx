import { useState, useEffect, useCallback, type FC } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  DIRECTIONS,
  DEFAULT_PINGLOOM_SETTINGS,
  DEFAULT_CATALOG,
  sectorPath,
  formatAssetName,
  type PingloomSettings,
  type CatalogEntry,
} from "@/lib/pingloom";
import { playPingChime } from "@/lib/pingAudio";
import { useLolPingGesture, type PingMode } from "@/shared/lib/useLolPingGesture";
import { PingBurstMarker, type PingBurstItem } from "@/components/radial/PingBurstMarker";
import { PingVectorIcon } from "@/components/radial/PingVectorIcon";
import { useToast } from "@/shared/ui";
import { Target } from "lucide-react";
import { cn } from "@/lib/utils";

const PINGLOOM_STORAGE_KEY = "rust-sound.pingloom-settings";

function isRunningInTauri(): boolean {
  if (typeof window === "undefined") return false;
  return (
    isTauri() ||
    !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ ||
    !!(window as unknown as { __TAURI__?: unknown }).__TAURI__
  );
}

function loadSavedSettings(): PingloomSettings {
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(PINGLOOM_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.wheel) && parsed.wheel.length === 8) {
          return { ...DEFAULT_PINGLOOM_SETTINGS, ...parsed };
        }
      }
    } catch {}
  }
  return DEFAULT_PINGLOOM_SETTINGS;
}

export interface GlobalPingHostProps {
  /** If false, gesture listening is suspended */
  enabled?: boolean;
}

export const GlobalPingHost: FC<GlobalPingHostProps> = ({ enabled = true }) => {
  const { showToast } = useToast();
  const isDesktop = isRunningInTauri();

  const [settings, setSettings] = useState<PingloomSettings>(loadSavedSettings);
  const [catalog, setCatalog] = useState<CatalogEntry[]>(DEFAULT_CATALOG);
  const [bursts, setBursts] = useState<PingBurstItem[]>([]);

  // Keep settings synchronized across tabs and windows
  useEffect(() => {
    const handleStorage = () => {
      setSettings(loadSavedSettings());
    };
    window.addEventListener("storage", handleStorage);

    if (isDesktop) {
      invoke<PingloomSettings>("get_ping_settings")
        .then((s) => {
          if (s && s.wheel && s.wheel.length === 8) {
            setSettings(s);
            try {
              localStorage.setItem(PINGLOOM_STORAGE_KEY, JSON.stringify(s));
            } catch {}
          }
        })
        .catch(() => {});

      invoke<CatalogEntry[]>("get_ping_catalog")
        .then((cat) => {
          if (cat && cat.length > 0) setCatalog(cat);
        })
        .catch(() => {});
    }

    return () => window.removeEventListener("storage", handleStorage);
  }, [isDesktop]);

  const handleExpireBurst = useCallback((id: string) => {
    setBursts((prev) => prev.filter((b) => b.id !== id));
  }, []);

  // Dispatch ping callback when LoL hotkey is released
  const handleDispatchLoLPing = useCallback(
    ({ mode, sliceIndex, x, y }: { mode: PingMode; sliceIndex: number; x: number; y: number }) => {
      const targetWheel = mode === "emote" ? settings.emote_wheel : settings.wheel;
      const pingId = targetWheel[sliceIndex] ?? (mode === "emote" ? "gg_heart" : "danger");
      const entry = catalog.find((c) => c.id === pingId);
      const name = entry?.name ?? formatAssetName(pingId);
      const color = entry?.color ?? (mode === "emote" ? "#ec4899" : "#ff3b55");

      if (!settings.muted) {
        playPingChime(pingId, settings.volume);
      }

      const newBurst: PingBurstItem = {
        id: `${Date.now()}-${Math.random()}`,
        x,
        y,
        pingId,
        name,
        color,
        durationMs: Math.round(settings.ping_duration_s * 1000),
      };

      setBursts((prev) => [...prev.slice(-9), newBurst]);
      showToast("success", `[${DIRECTIONS[sliceIndex]}] ${name} ${mode === "emote" ? "emote" : "ping"} dropped!`);
    },
    [settings.emote_wheel, settings.wheel, catalog, settings.muted, settings.volume, settings.ping_duration_s, showToast]
  );

  // Quick alert ping when hotkey is tapped without dragging
  const handleDispatchLoLQuickPing = useCallback(
    ({ mode, x, y }: { mode: PingMode; x: number; y: number }) => {
      const isEmote = mode === "emote";
      const pingId = isEmote
        ? (settings.click_emote_id || "gg_heart")
        : (settings.click_ping_id || "danger");
      const entry = catalog.find((c) => c.id === pingId);
      const name = entry?.name ?? formatAssetName(pingId);
      const color = entry?.color ?? (isEmote ? "#ec4899" : "#ff3b55");

      if (!settings.muted) {
        playPingChime(pingId, settings.volume);
      }

      const newBurst: PingBurstItem = {
        id: `${Date.now()}-${Math.random()}`,
        x,
        y,
        pingId,
        name: `Quick: ${name}`,
        color,
        durationMs: Math.round(settings.ping_duration_s * 1000),
      };

      setBursts((prev) => [...prev.slice(-9), newBurst]);
      showToast("info", `${isEmote ? "Quick Emote Icon" : "Quick Tactical Ping"} dropped!`);
    },
    [settings.click_emote_id, settings.click_ping_id, settings.muted, settings.volume, settings.ping_duration_s, catalog, showToast]
  );

  // Top-level Gesture Engine
  const lolGesture = useLolPingGesture({
    tacticalTrigger: settings.trigger,
    emoteTrigger: settings.emote_trigger,
    dragThreshold: settings.drag_threshold_px,
    clickPing: settings.click_ping,
    tickSound: settings.tick_sound,
    volume: settings.volume,
    enabled,
    onDispatch: handleDispatchLoLPing,
    onQuickPing: handleDispatchLoLQuickPing,
  });

  const hudWheel = lolGesture.activeMode === "emote" ? settings.emote_wheel : settings.wheel;

  return (
    <>
      {/* 1. Global Viewport Burst Particles */}
      <div className="fixed inset-0 pointer-events-none z-[9998] overflow-hidden">
        {bursts.map((burst) => (
          <PingBurstMarker key={burst.id} burst={burst} onExpire={handleExpireBurst} />
        ))}
      </div>

      {/* 2. Floating Cursor-Centered Radial Wheel HUD */}
      {lolGesture.isHolding && lolGesture.origin && (
        <div
          style={{
            left: `${lolGesture.origin.x}px`,
            top: `${lolGesture.origin.y}px`,
          }}
          className="fixed -translate-x-1/2 -translate-y-1/2 w-[280px] h-[280px] z-[9999] pointer-events-none select-none animate-in zoom-in-75 fade-in duration-100"
        >
          <svg className="w-full h-full" viewBox="0 0 280 280">
            {/* Slices 0 to 7 */}
            {DIRECTIONS.map((dir, idx) => {
              const aStart = ((idx * 45 - 22.5) * Math.PI) / 180;
              const aEnd = (((idx + 1) * 45 - 22.5) * Math.PI) / 180;
              const pathD = sectorPath(140, 140, 52, 136, aStart, aEnd);
              const isSelected = lolGesture.activeSlice === idx;

              return (
                <path
                  key={dir}
                  d={pathD}
                  fill={
                    isSelected
                      ? "color-mix(in srgb, var(--accent) 45%, rgba(20, 16, 25, 0.9))"
                      : "rgba(25, 20, 30, 0.88)"
                  }
                  stroke={isSelected ? "var(--accent)" : "rgba(255, 255, 255, 0.15)"}
                  strokeWidth={isSelected ? "3" : "1"}
                  className="transition-colors duration-75"
                />
              );
            })}

            {/* Boundary Rings */}
            <circle cx="140" cy="140" r="136" fill="none" stroke="rgba(255, 255, 255, 0.2)" strokeWidth="1" />
            <circle cx="140" cy="140" r="52" fill="none" stroke="rgba(255, 255, 255, 0.2)" strokeWidth="1" />

            {/* Aiming Vector Needle Line */}
            {lolGesture.currentPos && (
              <line
                x1="140"
                y1="140"
                x2={140 + (lolGesture.currentPos.x - lolGesture.origin.x)}
                y2={140 + (lolGesture.currentPos.y - lolGesture.origin.y)}
                stroke="var(--accent)"
                strokeWidth="2.5"
                strokeDasharray="4 3"
                className="animate-pulse"
              />
            )}
          </svg>

          {/* Center Hub Indicator */}
          <div
            className={cn(
              "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full flex flex-col items-center justify-center p-2 text-center border backdrop-blur-md transition-all duration-100",
              lolGesture.activeSlice !== null
                ? "bg-[var(--accent)] text-[var(--accent-ink)] border-[var(--accent)] shadow-xl scale-105"
                : "bg-[var(--surface)] text-[var(--ink)] border-[var(--line)] shadow-md"
            )}
          >
            {lolGesture.activeSlice !== null ? (
              <>
                <span className="text-[10px] font-extrabold uppercase tracking-wider">
                  {DIRECTIONS[lolGesture.activeSlice]}
                </span>
                <span className="text-[11px] font-black leading-tight truncate max-w-[80px]">
                  {catalog.find((c) => c.id === hudWheel[lolGesture.activeSlice!])?.name ?? "Ping"}
                </span>
              </>
            ) : (
              <>
                <Target className="w-4 h-4 text-[var(--accent)] mb-0.5 animate-pulse" />
                <span className="text-[10px] font-black tracking-wider">
                  {lolGesture.activeMode === "emote" ? "EMOTE AIM" : "TACTICAL AIM"}
                </span>
                <span className="text-[8px] opacity-75">{settings.drag_threshold_px}px deadzone</span>
              </>
            )}
          </div>

          {/* Directional Perimeter Labels */}
          {DIRECTIONS.map((dir, idx) => {
            const angle = (idx * 45 * Math.PI) / 180;
            const r = 94;
            const x = 140 + r * Math.sin(angle);
            const y = 140 - r * Math.cos(angle);
            const isSelected = lolGesture.activeSlice === idx;
            const assignedId = hudWheel[idx];
            const asset = catalog.find((c) => c.id === assignedId);

            return (
              <div
                key={dir}
                style={{ left: `${x}px`, top: `${y}px` }}
                className={cn(
                  "absolute -translate-x-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex flex-col items-center justify-center transition-transform p-0.5 shadow-md",
                  isSelected
                    ? "scale-120 ring-2 ring-[var(--accent)] bg-[var(--paper)] text-[var(--ink)] shadow-xl"
                    : "bg-[var(--surface)] text-[var(--ink)] border border-[var(--line)]"
                )}
              >
                <span
                  className="text-[9px] font-black leading-none"
                  style={{ color: asset?.color ?? "var(--accent)" }}
                >
                  {dir}
                </span>
                <PingVectorIcon
                  pingId={assignedId}
                  iconKey={asset?.vectorIcon}
                  className="w-3 h-3 mt-0.5"
                  style={{ color: asset?.color }}
                />
              </div>
            );
          })}
        </div>
      )}
    </>
  );
};
