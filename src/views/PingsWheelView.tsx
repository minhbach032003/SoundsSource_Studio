import { useState, useEffect, useRef, useCallback, type FC } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  DIRECTIONS,
  DIRECTION_LABELS,
  TRIGGERS,
  DEFAULT_PINGLOOM_SETTINGS,
  DEFAULT_CATALOG,
  duplicateSlots,
  sectorPath,
  formatAssetName,
  type PingloomSettings,
  type CatalogEntry,
} from "@/lib/pingloom";
import { playSectorTick, playPingChime } from "@/lib/pingAudio";
import { useLolPingGesture } from "@/shared/lib/useLolPingGesture";
import { PingBurstMarker, type PingBurstItem } from "@/components/radial/PingBurstMarker";
import { ButtonComponent, BadgeComponent, CardComponent, SliderComponent, useToast } from "@/shared/ui";
import { ModalComponent } from "@/shared/ui/ModalComponent";
import {
  Target,
  Smile,
  Sliders,
  AlertTriangle,
  RotateCcw,
  Check,
  Crosshair,
  Volume2,
  VolumeX,
  Sparkles,
  Gamepad2,
} from "lucide-react";
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

function loadInitialSettings(): PingloomSettings {
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

export const PingsWheelView: FC = () => {
  const { showToast } = useToast();
  const isDesktop = isRunningInTauri();

  const [activeSubTab, setActiveSubTab] = useState<"pings" | "emotes" | "triggers">("pings");
  const [settings, setSettings] = useState<PingloomSettings>(loadInitialSettings);
  const [catalog, setCatalog] = useState<CatalogEntry[]>(DEFAULT_CATALOG);
  const [focusedSlice, setFocusedSlice] = useState<number>(0);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Active Ping Bursts dropping on screen
  const [bursts, setBursts] = useState<PingBurstItem[]>([]);

  // Wheel container reference
  const wheelContainerRef = useRef<HTMLDivElement>(null);

  // Load from Tauri backend if available
  useEffect(() => {
    if (!isDesktop) return;
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
  }, [isDesktop]);

  // Persist settings helper
  const updateSettings = useCallback(
    (next: PingloomSettings) => {
      setSettings(next);
      try {
        localStorage.setItem(PINGLOOM_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      if (isDesktop) {
        invoke("save_ping_settings", { settings: next }).catch(() => {});
      }
    },
    [isDesktop]
  );

  const activeWheel = activeSubTab === "emotes" ? settings.emote_wheel : settings.wheel;
  const duplicates = duplicateSlots(activeWheel);
  const activeCatalog = catalog.filter((c) =>
    activeSubTab === "emotes" ? c.category === "emote" : c.category === "ping"
  );

  // Expire ping bursts
  const handleExpireBurst = useCallback((id: string) => {
    setBursts((prev) => prev.filter((b) => b.id !== id));
  }, []);

  // Dispatch ping callback when LoL hotkey is released
  const handleDispatchLoLPing = useCallback(
    ({ sliceIndex, x, y }: { sliceIndex: number; x: number; y: number }) => {
      const pingId = activeWheel[sliceIndex] ?? "danger";
      const entry = catalog.find((c) => c.id === pingId);
      const name = entry?.name ?? formatAssetName(pingId);
      const color = entry?.color ?? "#ff3b55";

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
      showToast("success", `[${DIRECTIONS[sliceIndex]}] ${name} ping dropped!`);
    },
    [activeWheel, catalog, settings.muted, settings.volume, settings.ping_duration_s, showToast]
  );

  // Quick alert ping when hotkey is tapped without dragging
  const handleDispatchLoLQuickPing = useCallback(
    ({ x, y }: { x: number; y: number }) => {
      const pingId = settings.click_ping_id || "danger";
      const entry = catalog.find((c) => c.id === pingId);
      const name = entry?.name ?? formatAssetName(pingId);
      const color = entry?.color ?? "#ff3b55";

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
      showToast("info", `Quick Alert Ping dropped!`);
    },
    [settings.click_ping_id, settings.muted, settings.volume, settings.ping_duration_s, catalog, showToast]
  );

  // League of Legends Hold-Hotkey Gesture Hook
  const lolGesture = useLolPingGesture({
    triggerKey: settings.trigger,
    dragThreshold: settings.drag_threshold_px,
    clickPing: settings.click_ping,
    tickSound: settings.tick_sound,
    volume: settings.volume,
    enabled: true,
    onDispatch: handleDispatchLoLPing,
    onQuickPing: handleDispatchLoLQuickPing,
  });

  // Assign asset to currently focused slice
  const handleAssignAsset = (assetId: string) => {
    const isEmote = activeSubTab === "emotes";
    const targetWheel = isEmote ? [...settings.emote_wheel] : [...settings.wheel];
    targetWheel[focusedSlice] = assetId;

    const next: PingloomSettings = isEmote
      ? { ...settings, emote_wheel: targetWheel }
      : { ...settings, wheel: targetWheel };

    updateSettings(next);

    const asset = catalog.find((c) => c.id === assetId);
    if (!settings.muted) {
      playPingChime(assetId, settings.volume);
    }
    showToast(
      "info",
      `Assigned ${asset?.name ?? assetId} to ${DIRECTION_LABELS[DIRECTIONS[focusedSlice]]} (${DIRECTIONS[focusedSlice]})`
    );
  };

  // 1-Click "Apply LoL Smart Ping Preset"
  const handleApplyLoLPreset = () => {
    const lolSettings: PingloomSettings = {
      ...settings,
      trigger: "alt",
      emote_trigger: "ctrl",
      drag_threshold_px: 65,
      click_ping: true,
      click_ping_id: "danger",
      wheel: [
        "danger",      // North (Up)
        "push",        // North-East
        "omw",         // East (Right)
        "allin",       // South-East
        "assist",      // South (Down)
        "needvision",  // South-West
        "missing",     // West (Left)
        "enemyvision", // North-West
      ],
      ping_size_px: 52,
      ping_duration_s: 3.0,
      tick_sound: true,
      volume: 80,
    };

    updateSettings(lolSettings);
    if (!settings.muted) {
      playPingChime("omw", 80);
    }
    showToast("success", "LoL Smart Ping preset applied! Hold Alt and drag mouse to drop pings.");
  };

  // Save Settings explicitly
  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      localStorage.setItem(PINGLOOM_STORAGE_KEY, JSON.stringify(settings));
      if (isDesktop) {
        const saved = await invoke<PingloomSettings>("save_ping_settings", { settings });
        setSettings(saved);
      }
      showToast("success", "Tactical wheel configuration saved successfully!");
    } catch (e) {
      showToast("error", `Failed to save settings: ${String(e)}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Factory Reset
  const handleConfirmReset = () => {
    updateSettings(DEFAULT_PINGLOOM_SETTINGS);
    setIsResetModalOpen(false);
    showToast("info", "Tactical wheel restored to factory defaults");
  };

  // Keyboard navigation across slices
  const handleWheelKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      const next = (focusedSlice + 1) % 8;
      setFocusedSlice(next);
      if (settings.tick_sound) playSectorTick(settings.volume);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = (focusedSlice + 7) % 8;
      setFocusedSlice(next);
      if (settings.tick_sound) playSectorTick(settings.volume);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const pingId = activeWheel[focusedSlice];
      if (!settings.muted) playPingChime(pingId, settings.volume);
      showToast("success", `Dispatched ${DIRECTIONS[focusedSlice]}: ${formatAssetName(pingId)}`);
    }
  };

  return (
    <div className="w-full h-full flex flex-col space-y-4 select-none min-h-0 flex-1 relative">
      {/* Dynamic Active Ping Burst Particles Container */}
      <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
        {bursts.map((burst) => (
          <PingBurstMarker key={burst.id} burst={burst} onExpire={handleExpireBurst} />
        ))}
      </div>

      {/* Floating LoL Cursor-Centered Radial Wheel HUD */}
      {lolGesture.isHolding && lolGesture.origin && (
        <div
          style={{
            left: `${lolGesture.origin.x}px`,
            top: `${lolGesture.origin.y}px`,
          }}
          className="fixed -translate-x-1/2 -translate-y-1/2 w-[280px] h-[280px] z-[999] pointer-events-none select-none animate-in zoom-in-75 fade-in duration-100"
        >
          <svg className="w-full h-full" viewBox="0 0 280 280">
            <defs>
              <linearGradient id="floatingWheelSurface" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="rgba(30, 24, 35, 0.95)" />
                <stop offset="100%" stopColor="rgba(18, 14, 22, 0.95)" />
              </linearGradient>
            </defs>

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
                : "bg-slate-950/90 text-white border-white/20 shadow-md"
            )}
          >
            {lolGesture.activeSlice !== null ? (
              <>
                <span className="text-[10px] font-extrabold uppercase tracking-wider">
                  {DIRECTIONS[lolGesture.activeSlice]}
                </span>
                <span className="text-[11px] font-black leading-tight truncate max-w-[80px]">
                  {catalog.find((c) => c.id === activeWheel[lolGesture.activeSlice!])?.name ?? "Ping"}
                </span>
              </>
            ) : (
              <>
                <Target className="w-4 h-4 text-[var(--accent)] mb-0.5 animate-pulse" />
                <span className="text-[10px] font-black tracking-wider">DRAG AIM</span>
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
            const assignedId = activeWheel[idx];
            const asset = catalog.find((c) => c.id === assignedId);

            return (
              <div
                key={dir}
                style={{ left: `${x}px`, top: `${y}px` }}
                className={cn(
                  "absolute -translate-x-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex flex-col items-center justify-center transition-transform p-0.5 shadow-md",
                  isSelected
                    ? "scale-120 ring-2 ring-[var(--accent)] bg-[var(--paper)] text-[var(--ink)] shadow-xl"
                    : "bg-slate-900/90 text-slate-300 border border-white/15"
                )}
              >
                <span
                  className="text-[9px] font-black leading-none"
                  style={{ color: asset?.color ?? "var(--accent)" }}
                >
                  {dir}
                </span>
                <span className="text-[8px] font-bold truncate max-w-[38px] leading-tight mt-0.5">
                  {asset?.name ? asset.name.split(" ")[0] : assignedId}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* 1. Header Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3 pb-1 border-b border-[var(--line)]">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 p-0.5 bg-[var(--surface)] border border-[var(--line)] rounded-lg">
            <button
              type="button"
              onClick={() => {
                setActiveSubTab("pings");
                setFocusedSlice(0);
              }}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer flex items-center gap-1.5",
                activeSubTab === "pings"
                  ? "bg-[var(--paper)] text-[var(--ink)] shadow-sm border border-[var(--line)] font-bold"
                  : "text-[var(--muted)] hover:text-[var(--ink)]"
              )}
            >
              <Target className="w-3.5 h-3.5 text-[var(--accent)]" />
              Tactical Pings
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveSubTab("emotes");
                setFocusedSlice(0);
              }}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer flex items-center gap-1.5",
                activeSubTab === "emotes"
                  ? "bg-[var(--paper)] text-[var(--ink)] shadow-sm border border-[var(--line)] font-bold"
                  : "text-[var(--muted)] hover:text-[var(--ink)]"
              )}
            >
              <Smile className="w-3.5 h-3.5 text-amber-400" />
              Tactical Emotes
            </button>

            <button
              type="button"
              onClick={() => setActiveSubTab("triggers")}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer flex items-center gap-1.5",
                activeSubTab === "triggers"
                  ? "bg-[var(--paper)] text-[var(--ink)] shadow-sm border border-[var(--line)] font-bold"
                  : "text-[var(--muted)] hover:text-[var(--ink)]"
              )}
            >
              <Sliders className="w-3.5 h-3.5 text-purple-400" />
              Triggers & Shortcuts
            </button>
          </div>

          <ButtonComponent
            variant="outline"
            size="sm"
            onClick={handleApplyLoLPreset}
            leftIcon={<Gamepad2 className="w-3.5 h-3.5 text-emerald-400" />}
            className="border-emerald-500/30 hover:border-emerald-500/60 text-xs"
            title="Configure League of Legends smart ping defaults"
          >
            Apply LoL Preset
          </ButtonComponent>

          <BadgeComponent variant="default" className="text-[11px] font-mono px-2 py-0.5">
            Hold [{settings.trigger.toUpperCase()}] anywhere to Ping
          </BadgeComponent>
        </div>

        <div className="flex items-center gap-2">
          <ButtonComponent
            variant="outline"
            size="sm"
            onClick={() => setIsResetModalOpen(true)}
            leftIcon={<RotateCcw className="w-3.5 h-3.5 text-[var(--muted)]" />}
            title="Reset wheel to defaults"
          >
            Reset
          </ButtonComponent>

          <ButtonComponent
            variant="primary"
            size="sm"
            onClick={handleSaveSettings}
            loading={isSaving}
            leftIcon={<Check className="w-3.5 h-3.5" />}
          >
            Save Wheel
          </ButtonComponent>
        </div>
      </div>

      {/* 2. Main Workspace Layout */}
      {activeSubTab !== "triggers" ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-0">
          {/* Left Column: Direct Interactive Radial Wheel (5 cols) */}
          <div className="lg:col-span-5 flex flex-col items-center justify-start gap-4 p-5 rounded-2xl bg-[var(--surface)] border border-[var(--line)] shadow-sm">
            <div className="w-full flex items-center justify-between pb-2 border-b border-[var(--line)]">
              <span className="text-xs font-bold text-[var(--ink)] flex items-center gap-1.5">
                <Crosshair className="w-3.5 h-3.5 text-[var(--accent)]" />
                Radial Wheel Preview & Arena
              </span>
              <span className="text-[10px] text-[var(--muted)] font-mono">
                Slice: {DIRECTIONS[focusedSlice]} ({DIRECTION_LABELS[DIRECTIONS[focusedSlice]]})
              </span>
            </div>

            {/* Direct Interactive Wheel Canvas */}
            <div
              ref={wheelContainerRef}
              tabIndex={0}
              onKeyDown={handleWheelKeyDown}
              className="relative w-[280px] h-[280px] my-auto select-none outline-none focus:ring-2 focus:ring-[var(--accent)]/40 rounded-full"
              title="Click slices or hold trigger hotkey to drop pings."
            >
              <svg className="w-full h-full" viewBox="0 0 280 280">
                <defs>
                  <linearGradient id="wheelSurface" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="var(--paper)" />
                    <stop offset="100%" stopColor="var(--surface)" />
                  </linearGradient>
                </defs>

                {/* Slices 0 to 7 */}
                {DIRECTIONS.map((dir, idx) => {
                  const aStart = ((idx * 45 - 22.5) * Math.PI) / 180;
                  const aEnd = (((idx + 1) * 45 - 22.5) * Math.PI) / 180;
                  const pathD = sectorPath(140, 140, 52, 136, aStart, aEnd);
                  const isFocused = focusedSlice === idx;
                  const isDup = duplicates.has(idx);

                  return (
                    <path
                      key={dir}
                      d={pathD}
                      fill={
                        isFocused
                          ? "color-mix(in srgb, var(--accent) 30%, var(--paper))"
                          : isDup
                          ? "color-mix(in srgb, var(--warning-bg) 60%, var(--paper))"
                          : "var(--paper)"
                      }
                      stroke={
                        isFocused
                          ? "var(--accent)"
                          : isDup
                          ? "var(--warning)"
                          : "var(--line)"
                      }
                      strokeWidth={isFocused ? "2.5" : "1"}
                      className="transition-colors duration-100 cursor-pointer"
                      onClick={() => {
                        setFocusedSlice(idx);
                        if (settings.tick_sound) playSectorTick(settings.volume);
                      }}
                    />
                  );
                })}

                {/* Outer & Inner Ring Boundaries */}
                <circle cx="140" cy="140" r="136" fill="none" stroke="var(--line)" strokeWidth="1" />
                <circle cx="140" cy="140" r="52" fill="none" stroke="var(--line)" strokeWidth="1" />
              </svg>

              {/* Center Hub Badge */}
              <div
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full flex flex-col items-center justify-center p-2 text-center pointer-events-none border bg-[var(--paper)] text-[var(--ink)] border-[var(--line)] shadow-sm"
              >
                <Target className="w-4 h-4 text-[var(--accent)] mb-0.5" />
                <span className="text-[10px] font-black">HOLD [{settings.trigger.toUpperCase()}]</span>
                <span className="text-[8px] text-[var(--muted)]">{settings.drag_threshold_px}px threshold</span>
              </div>

              {/* Directional Perimeter Labels */}
              {DIRECTIONS.map((dir, idx) => {
                const angle = (idx * 45 * Math.PI) / 180;
                const r = 94;
                const x = 140 + r * Math.sin(angle);
                const y = 140 - r * Math.cos(angle);
                const isFocused = focusedSlice === idx;
                const isDup = duplicates.has(idx);
                const assignedId = activeWheel[idx];
                const asset = catalog.find((c) => c.id === assignedId);

                return (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => {
                      setFocusedSlice(idx);
                      if (settings.tick_sound) playSectorTick(settings.volume);
                    }}
                    style={{ left: `${x}px`, top: `${y}px` }}
                    className={cn(
                      "absolute -translate-x-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex flex-col items-center justify-center transition-transform p-0.5 cursor-pointer z-10",
                      isFocused
                        ? "scale-115 shadow-md ring-2 ring-[var(--accent)] bg-[var(--paper)]"
                        : "bg-[var(--surface)] border border-[var(--line)] hover:scale-105"
                    )}
                  >
                    <span
                      className="text-[9px] font-bold leading-none"
                      style={{ color: asset?.color ?? "var(--ink)" }}
                    >
                      {dir}
                    </span>
                    <span className="text-[8px] font-semibold text-[var(--muted)] truncate max-w-[38px] leading-tight mt-0.5">
                      {asset?.name ? asset.name.split(" ")[0] : assignedId}
                    </span>
                    {isDup && (
                      <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-500 text-slate-950 text-[8px] flex items-center justify-center font-bold">
                        !
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* LoL Hotkey Gesture Instructions Banner */}
            <div className="w-full p-3 rounded-xl border border-[var(--line)] bg-[var(--paper)] text-xs text-[var(--muted)] space-y-1">
              <div className="flex items-center gap-2 text-[var(--ink)] font-bold">
                <Gamepad2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>League of Legends Smart Ping Active:</span>
              </div>
              <p className="text-[11px] leading-relaxed m-0">
                1. <strong>Giữ phím {settings.trigger.toUpperCase()}</strong>: Vòng tròn xuyên tâm sẽ nở ngay tại con trỏ chuột.
                <br />
                2. <strong>Xoay/kéo chuột</strong>: Hướng về 8 phân vùng để chọn ping mong muốn.
                <br />
                3. <strong>Buông phím</strong>: Ping chiến thuật lập tức rơi xuống toạ độ đó kèm âm thanh LoL chân thực!
              </p>
            </div>
          </div>

          {/* Right Column: Directional Slot Editor & Catalog Tile Grid (7 cols) */}
          <div className="lg:col-span-7 flex flex-col gap-4 min-h-0">
            {/* Slot Editor Header */}
            <CardComponent
              variant="default"
              padding="md"
              title={
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[var(--accent)]" />
                  <span>Directional Slot Assignments ({activeSubTab === "pings" ? "Pings" : "Emotes"})</span>
                </div>
              }
              subtitle="Select a direction below then choose an asset to instantly update its slot."
            >
              {/* 8 Directions Row Selector */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                {DIRECTIONS.map((dir, idx) => {
                  const assignedId = activeWheel[idx];
                  const asset = catalog.find((c) => c.id === assignedId);
                  const isFocused = focusedSlice === idx;
                  const isDup = duplicates.has(idx);

                  return (
                    <button
                      key={dir}
                      type="button"
                      onClick={() => {
                        setFocusedSlice(idx);
                        if (settings.tick_sound) playSectorTick(settings.volume);
                      }}
                      className={cn(
                        "p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between min-h-[64px]",
                        isFocused
                          ? "border-[var(--accent)] bg-[var(--paper)] shadow-sm ring-1 ring-[var(--accent)]"
                          : "border-[var(--line)] bg-[var(--surface)] hover:border-[var(--focus)]"
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold text-[var(--muted)] uppercase">
                          {dir} · {DIRECTION_LABELS[dir]}
                        </span>
                        {isDup && (
                          <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-500 font-bold">
                            DUP
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: asset?.color ?? "var(--accent)" }}
                        />
                        <span className="text-xs font-semibold text-[var(--ink)] truncate">
                          {asset?.name ?? assignedId}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardComponent>

            {/* Asset Catalog Picker Grid */}
            <CardComponent
              variant="default"
              padding="md"
              title={
                <div className="flex items-center justify-between w-full">
                  <span>Catalog for {DIRECTION_LABELS[DIRECTIONS[focusedSlice]]} ({DIRECTIONS[focusedSlice]})</span>
                  <span className="text-xs font-normal text-[var(--muted)]">Click tile to assign & preview sound</span>
                </div>
              }
              className="flex-1 flex flex-col min-h-0"
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 overflow-y-auto max-h-[260px] pr-1 pt-1">
                {activeCatalog.map((item) => {
                  const isAssigned = activeWheel[focusedSlice] === item.id;
                  const isUsedElsewhere = activeWheel.includes(item.id);

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleAssignAsset(item.id)}
                      className={cn(
                        "relative flex flex-col items-center justify-center p-3 rounded-xl border transition-all cursor-pointer text-center gap-1.5",
                        isAssigned
                          ? "bg-[var(--paper)] border-[var(--accent)] ring-2 ring-[var(--accent)]/40 shadow-sm"
                          : "bg-[var(--surface)] border-[var(--line)] hover:border-[var(--focus)] hover:bg-[var(--paper)]"
                      )}
                    >
                      <span
                        className="w-4 h-4 rounded-full flex items-center justify-center shadow-xs"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-xs font-semibold text-[var(--ink)] leading-tight">
                        {item.name}
                      </span>
                      {isAssigned && (
                        <span className="text-[9px] font-bold text-[var(--accent)] uppercase tracking-wider">
                          Active
                        </span>
                      )}
                      {!isAssigned && isUsedElsewhere && (
                        <span className="text-[8px] text-[var(--muted)]">
                          Used
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </CardComponent>
          </div>
        </div>
      ) : (
        /* TAB 3: TRIGGERS & SHORTCUTS CONFIGURATION */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 flex-1 overflow-y-auto">
          {/* Card 1: Keybinds & Hold Trigger */}
          <CardComponent
            variant="default"
            padding="lg"
            title="LoL Hotkey & Activation Trigger"
            subtitle="Configure the modifier or character key held to bloom the radial ping HUD."
          >
            <div className="space-y-4 pt-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="ping-trigger-select" className="text-xs font-semibold text-[var(--ink)]">
                  Primary Ping Trigger Key
                </label>
                <select
                  id="ping-trigger-select"
                  value={settings.trigger}
                  onChange={(e) => updateSettings({ ...settings, trigger: e.target.value })}
                  className="h-9 px-3 rounded-lg bg-[var(--paper)] text-[var(--ink)] border border-[var(--input-line)] focus:border-[var(--focus)] text-xs cursor-pointer outline-none"
                >
                  {TRIGGERS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="emote-trigger-select" className="text-xs font-semibold text-[var(--ink)]">
                  Emote Wheel Trigger
                </label>
                <select
                  id="emote-trigger-select"
                  value={settings.emote_trigger ?? "none"}
                  onChange={(e) =>
                    updateSettings({
                      ...settings,
                      emote_trigger: e.target.value === "none" ? null : e.target.value,
                    })
                  }
                  className="h-9 px-3 rounded-lg bg-[var(--paper)] text-[var(--ink)] border border-[var(--input-line)] focus:border-[var(--focus)] text-xs cursor-pointer outline-none"
                >
                  <option value="none">Disabled / None</option>
                  {TRIGGERS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 border-t border-[var(--line)]">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[var(--ink)]">Instant Quick Alert Ping</span>
                  <input
                    type="checkbox"
                    checked={settings.click_ping}
                    onChange={(e) => updateSettings({ ...settings, click_ping: e.target.checked })}
                    className="w-4 h-4 rounded cursor-pointer accent-[var(--accent)]"
                  />
                </div>
                <p className="text-[11px] text-[var(--muted)] mt-1">
                  Single tap trigger key without dragging immediately drops the default alert ping at cursor.
                </p>
              </div>
            </div>
          </CardComponent>

          {/* Card 2: Geometry & Audio Feedback */}
          <CardComponent
            variant="default"
            padding="lg"
            title="LoL Gesture Geometry & Chime Audio"
            subtitle="Fine tune dead zone threshold, animation duration, and acoustic volume."
          >
            <div className="space-y-4 pt-2">
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-[var(--ink)]">Dead Zone Drag Threshold</span>
                  <span className="font-mono text-[var(--muted)]">{settings.drag_threshold_px} px</span>
                </div>
                <SliderComponent
                  value={settings.drag_threshold_px}
                  min={30}
                  max={200}
                  step={2}
                  unit="px"
                  onChange={(val) => updateSettings({ ...settings, drag_threshold_px: val })}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-[var(--ink)]">Tactical Ping Chime Volume</span>
                  <span className="font-mono text-[var(--muted)]">{settings.volume} %</span>
                </div>
                <SliderComponent
                  value={settings.volume}
                  min={0}
                  max={100}
                  step={1}
                  unit="%"
                  onChange={(val) => updateSettings({ ...settings, volume: val })}
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-[var(--line)] text-xs">
                <span className="font-semibold text-[var(--ink)] flex items-center gap-2">
                  {settings.tick_sound ? <Volume2 className="w-4 h-4 text-[var(--accent)]" /> : <VolumeX className="w-4 h-4 text-[var(--muted)]" />}
                  Direction Transition Tick Sound
                </span>
                <input
                  type="checkbox"
                  checked={settings.tick_sound}
                  onChange={(e) => updateSettings({ ...settings, tick_sound: e.target.checked })}
                  className="w-4 h-4 rounded cursor-pointer accent-[var(--accent)]"
                />
              </div>
            </div>
          </CardComponent>
        </div>
      )}

      {/* Confirmation Modal for Reset */}
      <ModalComponent
        open={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        title="Reset Tactical Wheel"
        description="Are you sure you want to restore the tactical ping and emote wheels back to factory defaults? Custom slot assignments will be replaced."
        confirmText="Reset to Defaults"
        confirmVariant="destructive"
        icon={<AlertTriangle className="w-5 h-5 text-rose-400" />}
        onConfirm={handleConfirmReset}
      />
    </div>
  );
};
