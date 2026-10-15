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

function isRunningInTauri(): boolean {
  if (typeof window === "undefined") return false;
  return (
    isTauri() ||
    !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ ||
    !!(window as unknown as { __TAURI__?: unknown }).__TAURI__
  );
}

export const PingsWheelView: FC = () => {
  const { showToast } = useToast();
  const isDesktop = isRunningInTauri();

  const [activeSubTab, setActiveSubTab] = useState<"pings" | "emotes" | "triggers">("pings");
  const [settings, setSettings] = useState<PingloomSettings>(DEFAULT_PINGLOOM_SETTINGS);
  const [catalog, setCatalog] = useState<CatalogEntry[]>(DEFAULT_CATALOG);
  const [focusedSlice, setFocusedSlice] = useState<number>(0);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Gesture Simulation Pad State
  const [gestureOrigin, setGestureOrigin] = useState<{ x: number; y: number } | null>(null);
  const [activeGesture, setActiveGesture] = useState<GestureResult | null>(null);
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const padRef = useRef<HTMLDivElement>(null);

  // Load initial settings and catalog from backend if available
  useEffect(() => {
    if (!isDesktop) return;
    invoke<PingloomSettings>("get_ping_settings")
      .then((s) => {
        if (s) setSettings(s);
      })
      .catch(() => {});

    invoke<CatalogEntry[]>("get_ping_catalog")
      .then((cat) => {
        if (cat && cat.length > 0) setCatalog(cat);
      })
      .catch(() => {});
  }, [isDesktop]);

  const activeWheel = activeSubTab === "emotes" ? settings.emote_wheel : settings.wheel;
  const duplicates = duplicateSlots(activeWheel);
  const activeCatalog = catalog.filter((c) =>
    activeSubTab === "emotes" ? c.category === "emote" : c.category === "ping"
  );

  // Assign asset to currently focused slice
  const handleAssignAsset = (assetId: string) => {
    setSettings((prev) => {
      const isEmote = activeSubTab === "emotes";
      const targetWheel = isEmote ? [...prev.emote_wheel] : [...prev.wheel];
      targetWheel[focusedSlice] = assetId;

      const next = isEmote
        ? { ...prev, emote_wheel: targetWheel }
        : { ...prev, wheel: targetWheel };

      return next;
    });

    const asset = catalog.find((c) => c.id === assetId);
    showToast(
      "info",
      `Assigned ${asset?.name ?? assetId} to ${DIRECTION_LABELS[DIRECTIONS[focusedSlice]]} (${DIRECTIONS[focusedSlice]})`
    );
  };

  // Save Settings via IPC
  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
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
    setSettings(DEFAULT_PINGLOOM_SETTINGS);
    setIsResetModalOpen(false);
    if (isDesktop) {
      invoke("save_ping_settings", { settings: DEFAULT_PINGLOOM_SETTINGS }).catch(() => {});
    }
    showToast("info", "Tactical wheel restored to factory defaults");
  };

  // Gesture simulation pad handlers
  const handlePadPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!padRef.current) return;
    const rect = padRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setGestureOrigin({ x, y });
    setDragOffset({ dx: 0, dy: 0 });
    setActiveGesture(null);
    padRef.current.setPointerCapture(e.pointerId);
  };

  const handlePadPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!gestureOrigin || !padRef.current) return;
      const rect = padRef.current.getBoundingClientRect();
      const currentX = e.clientX - rect.left;
      const currentY = e.clientY - rect.top;
      const dx = currentX - gestureOrigin.x;
      const dy = currentY - gestureOrigin.y;
      setDragOffset({ dx, dy });

      const deadZone = settings.drag_threshold_px;
      const dist = Math.hypot(dx, dy);

      if (dist < deadZone) {
        setActiveGesture(null);
        return;
      }

      // Calculate clockwise degrees from North (screen coordinates: dy < 0 is North)
      const degrees = ((Math.atan2(dy, dx) * (180 / Math.PI) + 90 + 22.5 + 360) % 360);
      const sliceIdx = Math.floor(degrees / 45) % 8;
      setFocusedSlice(sliceIdx);

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
    [gestureOrigin, settings.drag_threshold_px, activeWheel, catalog]
  );

  const handlePadPointerUp = () => {
    if (activeGesture) {
      showToast(
        "success",
        `Triggered: [${activeGesture.direction}] ${activeGesture.ping_name}!`
      );
    }
    setGestureOrigin(null);
    setActiveGesture(null);
    setDragOffset({ dx: 0, dy: 0 });
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
            Hold {settings.trigger.toUpperCase()} + Drag
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
          {/* Left Column: 8-Slice Interactive Radial Wheel (5 cols) */}
          <div className="lg:col-span-5 flex flex-col items-center justify-start gap-4 p-5 rounded-2xl bg-[var(--surface)] border border-[var(--line)] shadow-sm">
            <div className="w-full flex items-center justify-between pb-2 border-b border-[var(--line)]">
              <span className="text-xs font-bold text-[var(--ink)] flex items-center gap-1.5">
                <Crosshair className="w-3.5 h-3.5 text-[var(--accent)]" />
                8-Directional Radial Wheel
              </span>
              <span className="text-[10px] text-[var(--muted)] font-mono">
                Slice: {DIRECTIONS[focusedSlice]} ({DIRECTION_LABELS[DIRECTIONS[focusedSlice]]})
              </span>
            </div>

            {/* Radial SVG Wheel Canvas */}
            <div className="relative w-[280px] h-[280px] my-auto select-none">
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
                          ? "color-mix(in srgb, var(--accent) 35%, var(--paper))"
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
                      className="transition-colors duration-120 pointer-events-auto cursor-pointer"
                      onClick={() => setFocusedSlice(idx)}
                    />
                  );
                })}

                {/* Outer & Inner Ring Boundaries */}
                <circle cx="140" cy="140" r="136" fill="none" stroke="var(--line)" strokeWidth="1" />
                <circle cx="140" cy="140" r="52" fill="none" stroke="var(--line)" strokeWidth="1" />
              </svg>

              {/* Center Dead Zone Pill */}
              <div
                className={cn(
                  "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full flex flex-col items-center justify-center p-2 text-center pointer-events-none border transition-all duration-150",
                  activeGesture
                    ? "bg-[var(--accent)] text-[var(--accent-ink)] border-[var(--accent)] shadow-md"
                    : "bg-[var(--paper)] text-[var(--ink)] border-[var(--line)] shadow-sm"
                )}
              >
                {activeGesture ? (
                  <>
                    <span className="text-[10px] font-bold uppercase tracking-wider">
                      {activeGesture.direction}
                    </span>
                    <span className="text-[11px] font-bold leading-tight truncate max-w-[80px]">
                      {activeGesture.ping_name}
                    </span>
                  </>
                ) : (
                  <>
                    <Target className="w-4 h-4 text-[var(--accent)] mb-0.5" />
                    <span className="text-[10px] font-bold">DEAD ZONE</span>
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
                  <button
                    key={dir}
                    type="button"
                    onClick={() => setFocusedSlice(idx)}
                    style={{ left: `${x}px`, top: `${y}px` }}
                    className={cn(
                      "absolute -translate-x-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex flex-col items-center justify-center cursor-pointer transition-transform p-0.5 z-10",
                      isFocused
                        ? "scale-110 shadow-md ring-2 ring-[var(--accent)] bg-[var(--paper)]"
                        : "hover:scale-105 bg-[var(--surface)] border border-[var(--line)]"
                    )}
                    title={`${DIRECTION_LABELS[dir]}: ${asset?.name ?? assignedId}`}
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

            {/* Gesture Simulator Test Pad */}
            <div
              ref={padRef}
              onPointerDown={handlePadPointerDown}
              onPointerMove={handlePadPointerMove}
              onPointerUp={handlePadPointerUp}
              className="w-full h-24 rounded-xl border border-dashed border-[var(--line)] bg-[var(--paper)] flex flex-col items-center justify-center p-3 text-center cursor-crosshair touch-none relative overflow-hidden"
            >
              {gestureOrigin ? (
                <div className="flex flex-col items-center gap-1 z-10">
                  <span className="text-xs font-bold text-[var(--accent)]">
                    Dragging: Δx={Math.round(dragOffset.dx)}, Δy={Math.round(dragOffset.dy)}
                  </span>
                  <span className="text-[10px] text-[var(--muted)]">
                    Release mouse to dispatch ping gesture
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-[var(--muted)] z-10">
                  <MousePointer className="w-4 h-4 text-[var(--accent)]" />
                  <span>Click and drag here to simulate gesture</span>
                </div>
              )}
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
              subtitle="Select a direction then pick an asset from the catalog grid below to assign."
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
                      onClick={() => setFocusedSlice(idx)}
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
                  <span>Asset Catalog for {DIRECTION_LABELS[DIRECTIONS[focusedSlice]]} ({DIRECTIONS[focusedSlice]})</span>
                  <span className="text-xs font-normal text-[var(--muted)]">Click tile to assign</span>
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
                  onChange={(e) => setSettings({ ...settings, trigger: e.target.value })}
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
                    setSettings({
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
                    onChange={(e) => setSettings({ ...settings, click_ping: e.target.checked })}
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
                  onChange={(val) => setSettings({ ...settings, drag_threshold_px: val })}
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
                  onChange={(val) => setSettings({ ...settings, volume: val })}
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
                  onChange={(e) => setSettings({ ...settings, tick_sound: e.target.checked })}
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
