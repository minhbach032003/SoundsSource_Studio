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
  type GestureResult,
} from "@/lib/pingloom";
import { playSectorTick, playPingChime } from "@/lib/pingAudio";
import { ButtonComponent, BadgeComponent, CardComponent, SliderComponent, useToast } from "@/shared/ui";
import { ModalComponent } from "@/shared/ui/ModalComponent";
import {
  Target,
  Smile,
  Sliders,
  AlertTriangle,
  RotateCcw,
  Check,
  MousePointer,
  Crosshair,
  Volume2,
  VolumeX,
  Sparkles,
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

  // Mouse rotation & drag tracking state on the wheel
  const [isDraggingWheel, setIsDraggingWheel] = useState(false);
  const [pointerCoord, setPointerCoord] = useState<{ x: number; y: number } | null>(null);
  const [activeGesture, setActiveGesture] = useState<GestureResult | null>(null);
  const [rotationDegrees, setRotationDegrees] = useState<number>(0);
  const wheelContainerRef = useRef<HTMLDivElement>(null);
  const lastSliceRef = useRef<number>(0);

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

  // Direct mouse rotation & pointer gesture on the wheel canvas
  const handleWheelPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!wheelContainerRef.current) return;
    setIsDraggingWheel(true);
    wheelContainerRef.current.setPointerCapture(e.pointerId);
    handleWheelPointerMove(e);
  };

  const handleWheelPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!wheelContainerRef.current) return;
      const rect = wheelContainerRef.current.getBoundingClientRect();
      const currentX = e.clientX - rect.left;
      const currentY = e.clientY - rect.top;
      setPointerCoord({ x: currentX, y: currentY });

      // Wheel center is (140, 140) in the 280x280 container
      const dx = currentX - 140;
      const dy = currentY - 140;
      const dist = Math.hypot(dx, dy);

      // Raw angle in radians -> degrees clockwise from North
      const rawAngle = Math.atan2(dy, dx) * (180 / Math.PI);
      const clockwiseDeg = (rawAngle + 90 + 360) % 360;
      setRotationDegrees(clockwiseDeg);

      const deadZone = settings.drag_threshold_px;
      if (dist < deadZone) {
        setActiveGesture(null);
        return;
      }

      // Slice index 0..8 (North is centered at 0 deg, covering 337.5 to 22.5 deg)
      const sliceIdx = Math.floor(((clockwiseDeg + 22.5) % 360) / 45) % 8;

      if (sliceIdx !== lastSliceRef.current) {
        if (settings.tick_sound) {
          playSectorTick(settings.volume);
        }
        lastSliceRef.current = sliceIdx;
        setFocusedSlice(sliceIdx);
      }

      const pingId = activeWheel[sliceIdx] ?? "danger";
      const entry = catalog.find((c) => c.id === pingId);

      setActiveGesture({
        slice_index: sliceIdx,
        direction: DIRECTIONS[sliceIdx],
        ping_id: pingId,
        ping_name: entry?.name ?? formatAssetName(pingId),
        color: entry?.color ?? "#38bdf8",
      });
    },
    [settings.drag_threshold_px, settings.tick_sound, settings.volume, activeWheel, catalog]
  );

  const handleWheelPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDraggingWheel(false);
    setPointerCoord(null);
    if (wheelContainerRef.current && wheelContainerRef.current.hasPointerCapture(e.pointerId)) {
      wheelContainerRef.current.releasePointerCapture(e.pointerId);
    }

    if (activeGesture) {
      if (!settings.muted) {
        playPingChime(activeGesture.ping_id, settings.volume);
      }
      showToast(
        "success",
        `Activated [${activeGesture.direction}] ${activeGesture.ping_name}!`
      );
    }
    setActiveGesture(null);
  };

  return (
    <div className="w-full h-full flex flex-col space-y-4 select-none min-h-0 flex-1">
      {/* 1. Header Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3 pb-1 border-b border-[var(--line)]">
        <div className="flex items-center gap-2">
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

          <BadgeComponent variant="default" className="text-[11px] font-mono px-2 py-0.5">
            Hold {settings.trigger.toUpperCase()} + Rotate Mouse
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
                Interactive Radial Wheel
              </span>
              <span className="text-[10px] text-[var(--muted)] font-mono">
                {activeGesture ? `Angle: ${Math.round(rotationDegrees)}°` : `Slice: ${DIRECTIONS[focusedSlice]}`}
              </span>
            </div>

            {/* Direct Pointer Capture Radial Wheel Container */}
            <div
              ref={wheelContainerRef}
              tabIndex={0}
              onKeyDown={handleWheelKeyDown}
              onPointerDown={handleWheelPointerDown}
              onPointerMove={handleWheelPointerMove}
              onPointerUp={handleWheelPointerUp}
              className="relative w-[280px] h-[280px] my-auto select-none outline-none cursor-crosshair touch-none focus:ring-2 focus:ring-[var(--accent)]/40 rounded-full"
              title="Click and drag to rotate mouse around slices. Use arrow keys to cycle."
            >
              <svg className="w-full h-full pointer-events-none" viewBox="0 0 280 280">
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
                      className="transition-colors duration-100"
                    />
                  );
                })}

                {/* Outer & Inner Ring Boundaries */}
                <circle cx="140" cy="140" r="136" fill="none" stroke="var(--line)" strokeWidth="1" />
                <circle cx="140" cy="140" r="52" fill="none" stroke="var(--line)" strokeWidth="1" />

                {/* Dynamic Aiming Vector Needle when rotating */}
                {isDraggingWheel && pointerCoord && (
                  <line
                    x1="140"
                    y1="140"
                    x2={pointerCoord.x}
                    y2={pointerCoord.y}
                    stroke="var(--accent)"
                    strokeWidth="2.5"
                    strokeDasharray="4 3"
                    className="animate-pulse"
                  />
                )}
              </svg>

              {/* Center Dead Zone Pill */}
              <div
                className={cn(
                  "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full flex flex-col items-center justify-center p-2 text-center pointer-events-none border transition-all duration-120",
                  activeGesture
                    ? "bg-[var(--accent)] text-[var(--accent-ink)] border-[var(--accent)] shadow-lg scale-105"
                    : "bg-[var(--paper)] text-[var(--ink)] border-[var(--line)] shadow-sm"
                )}
              >
                {activeGesture ? (
                  <>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider">
                      {activeGesture.direction}
                    </span>
                    <span className="text-[11px] font-bold leading-tight truncate max-w-[80px]">
                      {activeGesture.ping_name}
                    </span>
                  </>
                ) : (
                  <>
                    <Target className="w-4 h-4 text-[var(--accent)] mb-0.5" />
                    <span className="text-[10px] font-bold">DRAG ROTATE</span>
                    <span className="text-[9px] text-[var(--muted)]">{settings.drag_threshold_px}px</span>
                  </>
                )}
              </div>

              {/* Directional Overlay Badges / Node Labels */}
              {DIRECTIONS.map((dir, idx) => {
                const angle = (idx * 45 * Math.PI) / 180;
                const r = 94; // radius for node center
                const x = 140 + r * Math.sin(angle);
                const y = 140 - r * Math.cos(angle);
                const isFocused = focusedSlice === idx;
                const isDup = duplicates.has(idx);
                const assignedId = activeWheel[idx];
                const asset = catalog.find((c) => c.id === assignedId);

                return (
                  <div
                    key={dir}
                    style={{ left: `${x}px`, top: `${y}px` }}
                    className={cn(
                      "absolute -translate-x-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex flex-col items-center justify-center pointer-events-none transition-transform p-0.5 z-10",
                      isFocused
                        ? "scale-115 shadow-md ring-2 ring-[var(--accent)] bg-[var(--paper)]"
                        : "bg-[var(--surface)] border border-[var(--line)]"
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
                  </div>
                );
              })}
            </div>

            {/* Gesture Feedback Instructions Banner */}
            <div className="w-full p-2.5 rounded-xl border border-[var(--line)] bg-[var(--paper)] text-[11px] text-[var(--muted)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MousePointer className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                <span>Drag mouse around wheel to rotate slices. Release to dispatch.</span>
              </div>
              <span className="font-mono text-[10px] text-[var(--ink)]">Arrow keys ◄►</span>
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
            title="Activation Keybinds"
            subtitle="Configure modifier keys that trigger the tactical radial wheel when held."
          >
            <div className="space-y-4 pt-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="ping-trigger-select" className="text-xs font-semibold text-[var(--ink)]">
                  Primary Ping Wheel Trigger
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
                  <span className="font-semibold text-[var(--ink)]">Instant Click Ping</span>
                  <input
                    type="checkbox"
                    checked={settings.click_ping}
                    onChange={(e) => updateSettings({ ...settings, click_ping: e.target.checked })}
                    className="w-4 h-4 rounded cursor-pointer accent-[var(--accent)]"
                  />
                </div>
                <p className="text-[11px] text-[var(--muted)] mt-1">
                  Single tap trigger key without dragging immediately drops the default alert ping.
                </p>
              </div>
            </div>
          </CardComponent>

          {/* Card 2: Geometry & Audio Feedback */}
          <CardComponent
            variant="default"
            padding="lg"
            title="Gesture Geometry & Audio"
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
                  <span className="font-semibold text-[var(--ink)]">Ping Audio Volume</span>
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
                  Direction Tick Sound
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
        description="Are you sure you want to restore the tactical ping and emote wheels back to Pingloom factory defaults? Custom slot assignments will be replaced."
        confirmText="Reset to Defaults"
        confirmVariant="destructive"
        icon={<AlertTriangle className="w-5 h-5 text-rose-400" />}
        onConfirm={handleConfirmReset}
      />
    </div>
  );
};
