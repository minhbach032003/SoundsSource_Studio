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
import { PingVectorIcon } from "@/components/radial/PingVectorIcon";
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
  Search,
  GripVertical,
  Flag,
  Radio,
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
  const [isDesktopOverlayActive, setIsDesktopOverlayActive] = useState(false);

  // Drag-and-Drop State
  const [draggedAssetId, setDraggedAssetId] = useState<string | null>(null);
  const [dragOverSlice, setDragOverSlice] = useState<number | null>(null);

  // Catalog Category & Search Filter
  const [catalogCategory, setCatalogCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

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

    invoke<boolean>("is_ping_overlay_open")
      .then((isOpen) => setIsDesktopOverlayActive(isOpen))
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

  // Filter catalog items by category and search
  const filteredCatalog = catalog.filter((item) => {
    const matchesCategory =
      catalogCategory === "all" ||
      item.category === catalogCategory ||
      (catalogCategory === "tactical" && item.category === "ping") ||
      (catalogCategory === "emotes" && item.category === "emote");

    const query = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !query ||
      item.name.toLowerCase().includes(query) ||
      item.id.toLowerCase().includes(query);

    return matchesCategory && matchesSearch;
  });

  // Test-fire a slice directly from workspace editor
  const handleTestFire = useCallback(
    (sliceIndex: number) => {
      const isEmote = activeSubTab === "emotes";
      const targetWheel = isEmote ? settings.emote_wheel : settings.wheel;
      const pingId = targetWheel[sliceIndex] ?? (isEmote ? "gg_heart" : "danger");
      const entry = catalog.find((c) => c.id === pingId);
      const name = entry?.name ?? formatAssetName(pingId);

      if (!settings.muted) {
        playPingChime(pingId, settings.volume);
      }
      showToast("success", `[${DIRECTIONS[sliceIndex]}] ${name} ${isEmote ? "emote" : "ping"} test-fired!`);
    },
    [activeSubTab, settings.emote_wheel, settings.wheel, catalog, settings.muted, settings.volume, showToast]
  );

  // Assign asset to a specific slice (used by Drag & Drop and Click-to-assign)
  const handleAssignAssetToSlice = (sliceIndex: number, assetId: string) => {
    const isEmote = activeSubTab === "emotes";
    const targetWheel = isEmote ? [...settings.emote_wheel] : [...settings.wheel];
    targetWheel[sliceIndex] = assetId;

    const next: PingloomSettings = isEmote
      ? { ...settings, emote_wheel: targetWheel }
      : { ...settings, wheel: targetWheel };

    updateSettings(next);

    const asset = catalog.find((c) => c.id === assetId);
    if (!settings.muted) {
      playPingChime(assetId, settings.volume);
    }
    showToast(
      "success",
      `Gán ${asset?.name ?? assetId} vào hướng ${DIRECTION_LABELS[DIRECTIONS[sliceIndex]]} (${DIRECTIONS[sliceIndex]})`
    );
  };

  // Toggle Desktop Transparent Ping Overlay
  const handleTogglePingOverlay = async () => {
    if (!isDesktop) return;
    try {
      const next = !isDesktopOverlayActive;
      const res = await invoke<boolean>("toggle_ping_overlay", { enable: next });
      setIsDesktopOverlayActive(res);
      showToast(
        "success",
        res ? "Đã kích hoạt Desktop Ping Overlay ngoài màn hình!" : "Đã đóng Desktop Ping Overlay"
      );
    } catch (err) {
      showToast("error", `Lỗi overlay: ${String(err)}`);
    }
  };

  // Assign asset to currently focused slice
  const handleAssignAsset = (assetId: string) => {
    handleAssignAssetToSlice(focusedSlice, assetId);
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
    showToast("success", "Đã áp dụng LoL Preset! Giữ phím Alt rồi rê chuột để ping.");
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
      showToast("success", "Cấu hình pings đã được lưu thành công!");
    } catch (e) {
      showToast("error", `Lỗi khi lưu cấu hình: ${String(e)}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Factory Reset
  const handleConfirmReset = () => {
    updateSettings(DEFAULT_PINGLOOM_SETTINGS);
    setIsResetModalOpen(false);
    showToast("info", "Đã khôi phục cài đặt vòng tròn ping mặc định");
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
      showToast("success", `Kích hoạt ${DIRECTIONS[focusedSlice]}: ${formatAssetName(pingId)}`);
    }
  };

  return (
    <div className="w-full h-full flex flex-col space-y-4 select-none min-h-0 flex-1 relative">
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
            Hold [{settings.trigger.toUpperCase()}] for Tactical Pings, [{settings.emote_trigger?.toUpperCase() ?? "CTRL"}] for Emotes
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
          {/* Left Column: Direct Interactive Radial Wheel & Drop Zone (5 cols) */}
          <div className="lg:col-span-5 flex flex-col items-center justify-start gap-4 p-5 rounded-2xl bg-[var(--surface)] border border-[var(--line)] shadow-sm">
            <div className="w-full flex items-center justify-between pb-2 border-b border-[var(--line)]">
              <span className="text-xs font-bold text-[var(--ink)] flex items-center gap-1.5">
                <Crosshair className="w-3.5 h-3.5 text-[var(--accent)]" />
                Radial Wheel (Drop Target)
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
              title="Kéo thả icon trực tiếp vào các múi hoặc click để chọn."
            >
              <svg className="w-full h-full" viewBox="0 0 280 280">
                <defs>
                  <linearGradient id="wheelSurface" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="var(--paper)" />
                    <stop offset="100%" stopColor="var(--surface)" />
                  </linearGradient>
                </defs>

                {/* Slices 0 to 7 (Drop Targets) */}
                {DIRECTIONS.map((dir, idx) => {
                  const aStart = ((idx * 45 - 22.5) * Math.PI) / 180;
                  const aEnd = (((idx + 1) * 45 - 22.5) * Math.PI) / 180;
                  const pathD = sectorPath(140, 140, 52, 136, aStart, aEnd);
                  const isFocused = focusedSlice === idx;
                  const isDup = duplicates.has(idx);
                  const isDropTarget = dragOverSlice === idx;

                  return (
                    <path
                      key={dir}
                      d={pathD}
                      fill={
                        isDropTarget
                          ? "color-mix(in srgb, var(--accent) 55%, var(--paper))"
                          : isFocused
                          ? "color-mix(in srgb, var(--accent) 30%, var(--paper))"
                          : isDup
                          ? "color-mix(in srgb, var(--warning-bg) 60%, var(--paper))"
                          : "var(--paper)"
                      }
                      stroke={
                        isDropTarget
                          ? "var(--accent)"
                          : isFocused
                          ? "var(--accent)"
                          : isDup
                          ? "var(--warning)"
                          : "var(--line)"
                      }
                      strokeWidth={isDropTarget ? "3.5" : isFocused ? "2.5" : "1"}
                      className="transition-all duration-100 cursor-pointer"
                      onClick={() => {
                        setFocusedSlice(idx);
                        if (settings.tick_sound) playSectorTick(settings.volume);
                      }}
                      onDoubleClick={() => {
                        handleTestFire(idx);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "copy";
                        if (dragOverSlice !== idx) setDragOverSlice(idx);
                      }}
                      onDragLeave={() => {
                        if (dragOverSlice === idx) setDragOverSlice(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const pingId = e.dataTransfer.getData("application/ping-id") || draggedAssetId;
                        if (pingId) {
                          handleAssignAssetToSlice(idx, pingId);
                        }
                        setDragOverSlice(null);
                        setDraggedAssetId(null);
                      }}
                    />
                  );
                })}

                {/* Outer & Inner Ring Boundaries */}
                <circle cx="140" cy="140" r="136" fill="none" stroke="var(--line)" strokeWidth="1" />
                <circle cx="140" cy="140" r="52" fill="none" stroke="var(--line)" strokeWidth="1" />
              </svg>

              {/* Center Hub Badge (Click to fire currently focused ping) */}
              <div
                onClick={() => {
                  handleTestFire(focusedSlice);
                }}
                className={cn(
                  "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full flex flex-col items-center justify-center p-2 text-center border bg-[var(--paper)] text-[var(--ink)] border-[var(--line)] shadow-sm transition-all duration-120 cursor-pointer hover:scale-105 active:scale-95 group z-20",
                  dragOverSlice !== null && "border-[var(--accent)] ring-2 ring-[var(--accent)]/50"
                )}
                title="Nhấp vào đây để bắn thử ping hướng đang chọn!"
              >
                {dragOverSlice !== null ? (
                  <>
                    <Target className="w-5 h-5 text-[var(--accent)] mb-0.5 animate-bounce" />
                    <span className="text-[10px] font-black uppercase tracking-wider text-[var(--accent)]">
                      THẢ VÀO {DIRECTIONS[dragOverSlice]}
                    </span>
                  </>
                ) : (
                  <>
                    <Radio className="w-4 h-4 text-[var(--accent)] mb-0.5 group-hover:animate-pulse" />
                    <span className="text-[10px] font-black group-hover:text-[var(--accent)] transition-colors">
                      BẮN THỬ PING
                    </span>
                    <span className="text-[8px] text-[var(--muted)]">
                      {DIRECTIONS[focusedSlice]} ({settings.drag_threshold_px}px)
                    </span>
                  </>
                )}
              </div>

              {/* Directional Perimeter Labels */}
              {DIRECTIONS.map((dir, idx) => {
                const angle = (idx * 45 * Math.PI) / 180;
                const r = 94;
                const x = 140 + r * Math.sin(angle);
                const y = 140 - r * Math.cos(angle);
                const isFocused = focusedSlice === idx;
                const isDup = duplicates.has(idx);
                const isDropTarget = dragOverSlice === idx;
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
                      isDropTarget
                        ? "scale-125 shadow-xl ring-2 ring-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
                        : isFocused
                        ? "scale-115 shadow-md ring-2 ring-[var(--accent)] bg-[var(--paper)]"
                        : "bg-[var(--surface)] border border-[var(--line)] hover:scale-105"
                    )}
                  >
                    <span
                      className="text-[9px] font-black leading-none"
                      style={{ color: isDropTarget ? "var(--accent-ink)" : asset?.color ?? "var(--ink)" }}
                    >
                      {dir}
                    </span>
                    <PingVectorIcon
                      pingId={assignedId}
                      iconKey={asset?.vectorIcon}
                      className="w-4 h-4 mt-0.5"
                      style={{ color: isDropTarget ? "var(--accent-ink)" : asset?.color }}
                    />
                    {isDup && !isDropTarget && (
                      <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-500 text-slate-950 text-[8px] flex items-center justify-center font-bold">
                        !
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Direct Test Fire Action */}
            <div className="w-full flex items-center justify-between gap-2 p-2 rounded-xl bg-[var(--paper)] border border-[var(--line)]">
              <div className="flex items-center gap-1.5 min-w-0">
                <PingVectorIcon
                  pingId={activeWheel[focusedSlice]}
                  className="w-4 h-4 text-[var(--accent)] shrink-0"
                />
                <span className="text-xs font-bold text-[var(--ink)] truncate">
                  {DIRECTIONS[focusedSlice]}: {catalog.find((c) => c.id === activeWheel[focusedSlice])?.name ?? "Ping"}
                </span>
              </div>
              <ButtonComponent
                variant="primary"
                size="sm"
                onClick={() => {
                  handleTestFire(focusedSlice);
                }}
                leftIcon={<Radio className="w-3.5 h-3.5 animate-pulse text-[var(--accent-ink)]" />}
                className="h-7.5 px-3 text-xs font-bold shrink-0"
              >
                Bắn Thử
              </ButtonComponent>
            </div>

            {/* Drag & Drop Hint Banner */}
            <div className="w-full p-2.5 rounded-xl border border-[var(--line)] bg-[var(--paper)] text-xs text-[var(--muted)] flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-medium">
                <GripVertical className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                Kéo icon từ danh sách bên phải và thả trực tiếp vào múi wheel.
              </span>
              <span className="font-mono text-[10px] text-[var(--accent)] font-semibold">Drop Ready</span>
            </div>
          </div>

          {/* Right Column: Directional Slot Editor & Expanded Draggable Catalog (7 cols) */}
          <div className="lg:col-span-7 flex flex-col gap-3.5 min-h-0">
            {/* Slot Editor Header */}
            <CardComponent
              variant="default"
              padding="md"
              title={
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[var(--accent)]" />
                  <span>8 Vị Trí Xuyên Tâm (Hỗ trợ kéo thả thả vào từng ô)</span>
                </div>
              }
              subtitle="Nhấp chuột để chọn múi hoặc kéo thả icon trực tiếp từ danh mục bên dưới."
            >
              {/* 8 Directions Drop Zone Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                {DIRECTIONS.map((dir, idx) => {
                  const assignedId = activeWheel[idx];
                  const asset = catalog.find((c) => c.id === assignedId);
                  const isFocused = focusedSlice === idx;
                  const isDup = duplicates.has(idx);
                  const isDropTarget = dragOverSlice === idx;

                  return (
                    <button
                      key={dir}
                      type="button"
                      onClick={() => {
                        setFocusedSlice(idx);
                        if (settings.tick_sound) playSectorTick(settings.volume);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "copy";
                        if (dragOverSlice !== idx) setDragOverSlice(idx);
                      }}
                      onDragLeave={() => {
                        if (dragOverSlice === idx) setDragOverSlice(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const pingId = e.dataTransfer.getData("application/ping-id") || draggedAssetId;
                        if (pingId) {
                          handleAssignAssetToSlice(idx, pingId);
                        }
                        setDragOverSlice(null);
                        setDraggedAssetId(null);
                      }}
                      className={cn(
                        "p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between min-h-[64px]",
                        isDropTarget
                          ? "border-[var(--accent)] bg-[var(--paper)] shadow-lg ring-2 ring-[var(--accent)] scale-102"
                          : isFocused
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
                            TRÙNG
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div
                          className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 border border-white/5"
                          style={{ backgroundColor: `${asset?.color ?? "var(--accent)"}20` }}
                        >
                          <PingVectorIcon
                            pingId={assignedId}
                            iconKey={asset?.vectorIcon}
                            className="w-3 h-3"
                            style={{ color: asset?.color ?? "var(--accent)" }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-[var(--ink)] truncate">
                          {asset?.name ?? assignedId}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardComponent>

            {/* Expanded Draggable Icon Catalog Grid */}
            <CardComponent
              variant="default"
              padding="md"
              title={
                <div className="flex items-center justify-between w-full flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span>Thư Viện Icon Pings & Emotes ({filteredCatalog.length} icons)</span>
                  </div>
                  <span className="text-[11px] font-normal text-[var(--muted)]">
                    Kéo thả sang múi hoặc click để gán vào {DIRECTIONS[focusedSlice]}
                  </span>
                </div>
              }
              className="flex-1 flex flex-col min-h-0"
            >
              {/* Category Filter Pills & Search Bar */}
              <div className="flex items-center justify-between gap-2.5 mb-3 flex-wrap">
                <div className="flex items-center gap-1 p-0.5 bg-[var(--paper)] border border-[var(--line)] rounded-lg shrink-0">
                  {[
                    { id: "all", label: "Tất cả", icon: Sparkles },
                    { id: "tactical", label: "Tactical LoL", icon: Target },
                    { id: "objectives", label: "Mục Tiêu Map", icon: Flag },
                    { id: "emotes", label: "Emotes & Sticker", icon: Smile },
                    { id: "audio", label: "Studio Audio", icon: Radio },
                  ].map((tab) => {
                    const Icon = tab.icon;
                    const isActive = catalogCategory === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setCatalogCategory(tab.id)}
                        className={cn(
                          "px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer flex items-center gap-1",
                          isActive
                            ? "bg-[var(--surface)] text-[var(--ink)] font-bold shadow-xs border border-[var(--line)]"
                            : "text-[var(--muted)] hover:text-[var(--ink)]"
                        )}
                      >
                        <Icon className="w-3 h-3" />
                        <span>{tab.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Search Input */}
                <div className="relative flex-1 min-w-[140px] max-w-[220px]">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tìm icon pings…"
                    className="w-full h-7 pl-8 pr-2.5 text-xs rounded-lg bg-[var(--paper)] text-[var(--ink)] border border-[var(--input-line)] focus:border-[var(--focus)] outline-none"
                  />
                </div>
              </div>

              {/* Draggable Icon Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 overflow-y-auto max-h-[280px] pr-1 pt-1">
                {filteredCatalog.map((item) => {
                  const isAssigned = activeWheel[focusedSlice] === item.id;
                  const isUsedElsewhere = activeWheel.includes(item.id);

                  return (
                    <div
                      key={item.id}
                      draggable={true}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("application/ping-id", item.id);
                        e.dataTransfer.setData("text/plain", item.id);
                        e.dataTransfer.effectAllowed = "copy";
                        setDraggedAssetId(item.id);
                      }}
                      onDragEnd={() => {
                        setDraggedAssetId(null);
                        setDragOverSlice(null);
                      }}
                      onClick={() => handleAssignAsset(item.id)}
                      className={cn(
                        "relative flex items-center gap-2 p-2.5 rounded-xl border transition-all cursor-grab active:cursor-grabbing select-none group",
                        isAssigned
                          ? "bg-[var(--paper)] border-[var(--accent)] ring-2 ring-[var(--accent)]/40 shadow-sm"
                          : "bg-[var(--surface)] border-[var(--line)] hover:border-[var(--focus)] hover:bg-[var(--paper)]"
                      )}
                      title={`Kéo thả hoặc click để gán: ${item.name}`}
                    >
                      {/* Drag Handle Icon */}
                      <GripVertical className="w-3 h-3 text-[var(--muted)] opacity-40 group-hover:opacity-100 shrink-0" />

                      {/* Vector Icon Emblem */}
                      <div
                        className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border border-white/5 shadow-xs"
                        style={{ backgroundColor: `${item.color}20` }}
                      >
                        <PingVectorIcon
                          pingId={item.id}
                          iconKey={item.vectorIcon}
                          className="w-3.5 h-3.5"
                          style={{ color: item.color }}
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="text-xs font-semibold text-[var(--ink)] leading-tight truncate">
                            {item.name}
                          </span>
                        </div>
                        <span className="text-[9px] text-[var(--muted)] block capitalize truncate">
                          {item.category}
                        </span>
                      </div>

                      {isAssigned && (
                        <span className="text-[8px] font-bold text-[var(--accent)] uppercase px-1 py-0.5 rounded bg-[var(--accent)]/15 shrink-0">
                          Slot
                        </span>
                      )}
                      {!isAssigned && isUsedElsewhere && (
                        <span className="text-[8px] text-[var(--muted)] shrink-0">
                          Đã dùng
                        </span>
                      )}
                    </div>
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

              <div className="pt-2 border-t border-[var(--line)]">
                <div className="flex items-center justify-between text-xs gap-3">
                  <div>
                    <span className="font-semibold text-[var(--ink)] block">Desktop Transparent Ping Overlay</span>
                    <span className="text-[11px] text-[var(--muted)] block mt-0.5">
                      Bật cửa sổ trong suốt để nhấn giữ Alt / Ctrl ping ở ngoài desktop và các ứng dụng khác.
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isDesktopOverlayActive}
                    onClick={handleTogglePingOverlay}
                    className={cn(
                      "w-10 h-5.5 rounded-full transition-colors relative cursor-pointer shrink-0 border border-transparent",
                      isDesktopOverlayActive ? "bg-[var(--accent)]" : "bg-[var(--input-line)]"
                    )}
                  >
                    <span
                      className={cn(
                        "w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform shadow-sm",
                        isDesktopOverlayActive ? "left-5" : "left-0.5"
                      )}
                    />
                  </button>
                </div>
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
