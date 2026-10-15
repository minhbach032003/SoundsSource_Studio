import { useState, useRef, type FC, type ChangeEvent } from "react";
import {
  CardComponent,
  ButtonComponent,
  BadgeComponent,
  SelectComponent,
  SliderComponent,
  ModalComponent,
} from "@/shared/ui";
import { GoogleIcon } from "@/components/icons/GoogleIcon";
import { AppLogo } from "@/components/icons/AppLogo";
import type { GoogleUser } from "@/components/navigation/SideNavbar";
import {
  WALLPAPER_PRESETS,
  type WallpaperState,
  type WallpaperPresetId,
} from "@/shared/lib/useWallpaper";
import {
  Sliders,
  Mic,
  Bot,
  LogOut,
  CheckCircle2,
  Sparkles,
  Image as ImageIcon,
  Upload,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  AlertTriangle,
  Cpu,
  Activity,
  Zap,
  HardDrive,
  RefreshCw,
} from "lucide-react";
import { usePerformanceDiagnostics } from "@/shared/lib/usePerformanceDiagnostics";
import { cn } from "@/lib/utils";

interface SettingsViewProps {
  user: GoogleUser | null;
  isLoadingAuth: boolean;
  wallpaper: WallpaperState;
  authProvider?: string;
  dbStatus?: string;
  onSetWallpaperPreset: (id: WallpaperPresetId) => void;
  onActivateCustomWallpaper?: () => void;
  onRemoveCustomWallpaper?: () => void;
  onSetWallpaperDim: (dim: number) => void;
  onSetWallpaperBlur: (blur: number) => void;
  onUploadWallpaper: (file: File) => Promise<{ success: boolean; error?: string }>;
  onResetWallpaper: () => void;
  onSignInGoogle: () => void;
  onSignOutGoogle: () => void;
  onSettingChange?: (setting: string, val: string) => void;
  showToast?: (type: "success" | "error" | "info", message: string) => void;
}

export const SettingsView: FC<SettingsViewProps> = ({
  user,
  isLoadingAuth,
  wallpaper,
  authProvider = "google",
  dbStatus = "Neon PostgreSQL Pooler Active",
  onSetWallpaperPreset,
  onActivateCustomWallpaper,
  onRemoveCustomWallpaper,
  onSetWallpaperDim,
  onSetWallpaperBlur,
  onUploadWallpaper,
  onResetWallpaper,
  onSignInGoogle,
  onSignOutGoogle,
  onSettingChange,
  showToast,
}) => {
  const [sampleRate, setSampleRate] = useState("48000");
  const [bufferSize, setBufferSize] = useState("256");
  const [voiceModel, setVoiceModel] = useState("whisper-local");
  const [activePet, setActivePet] = useState("code-frenzy-cat");
  const [inputMode, setInputMode] = useState("ptt");

  // Confirmation Modals
  const [isSignOutModalOpen, setIsSignOutModalOpen] = useState(false);
  const [isResetWallpaperModalOpen, setIsResetWallpaperModalOpen] = useState(false);
  const [isRemoveCustomWallpaperModalOpen, setIsRemoveCustomWallpaperModalOpen] = useState(false);
  const [isPurgeModalOpen, setIsPurgeModalOpen] = useState(false);

  const [isUploading, setIsUploading] = useState(false);

  // Performance Diagnostics
  const {
    metrics,
    fps,
    latencyMs,
    backgroundRamSaver,
    isBenchmarking,
    isTrimming,
    toggleBackgroundRamSaver,
    runBenchmark,
    trimMemory,
  } = usePerformanceDiagnostics();

  const handleBenchmark = async () => {
    try {
      const res = await runBenchmark();
      showToast?.("info", `Benchmark complete: ${res.avgLatencyMs}ms avg latency, ${res.fps} FPS`);
    } catch {
      showToast?.("error", "Benchmark failed");
    }
  };

  const handleConfirmPurgeMemory = async () => {
    setIsPurgeModalOpen(false);
    try {
      const res = await trimMemory();
      showToast?.(
        "success",
        `Memory purged! Reclaimed ~${(res.bytes_reclaimed / (1024 * 1024)).toFixed(1)} MB (Current RSS: ${res.resident_size_mb.toFixed(1)} MB)`
      );
    } catch {
      showToast?.("error", "Failed to purge memory");
    }
  };
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleConfirmSignOut = () => {
    setIsSignOutModalOpen(false);
    onSignOutGoogle();
  };

  const handleConfirmResetWallpaper = () => {
    setIsResetWallpaperModalOpen(false);
    onResetWallpaper();
  };

  const handleConfirmRemoveCustomWallpaper = () => {
    setIsRemoveCustomWallpaperModalOpen(false);
    onRemoveCustomWallpaper?.();
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      await onUploadWallpaper(file);
    } catch {
      showToast?.("error", "Unexpected error uploading wallpaper");
    } finally {
      setIsUploading(false);
      // Reset input value so same file can be re-uploaded if desired
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      await onUploadWallpaper(file);
    } catch {
      showToast?.("error", "Unexpected error uploading wallpaper");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSampleRateChange = (val: string) => {
    setSampleRate(val);
    onSettingChange?.(
      "Sample Rate",
      val === "48000" ? "48.0 kHz" : val === "44100" ? "44.1 kHz" : "96.0 kHz"
    );
  };

  const handleBufferSizeChange = (val: string) => {
    setBufferSize(val);
    onSettingChange?.("Buffer Latency", `${val} samples`);
  };

  const handleVoiceModelChange = (val: string) => {
    setVoiceModel(val);
    onSettingChange?.("Voice Model", val);
  };

  const handlePetChange = (val: string) => {
    setActivePet(val);
    onSettingChange?.("Active Desktop Pet", val);
  };

  const currentPreset =
    WALLPAPER_PRESETS.find((p) => p.id === wallpaper.presetId) ||
    WALLPAPER_PRESETS[0];

  return (
    <div className="w-full select-none space-y-5">
      {/* 1. System Wallpaper & Atmosphere Customization Card */}
      <CardComponent
        title="System Wallpaper & Atmosphere"
        subtitle="Personalize application appearance with studio lighting presets or custom image uploads"
        extra={
          <div className="flex items-center gap-2">
            {wallpaper.mode === "custom" ? (
              <BadgeComponent variant="default" className="gap-1.5 h-6">
                <ImageIcon className="w-3 h-3 text-[var(--accent-text)]" />
                Custom Image Active
              </BadgeComponent>
            ) : (
              <BadgeComponent variant="secondary" className="h-6">
                {currentPreset.name}
              </BadgeComponent>
            )}

            <ButtonComponent
              variant="ghost"
              size="sm"
              onClick={() => setIsResetWallpaperModalOpen(true)}
              leftIcon={<RotateCcw className="w-3.5 h-3.5 text-[var(--muted)]" />}
              className="h-7 px-2 text-xs text-[var(--muted)] hover:text-[var(--ink)]"
              title="Reset wallpaper to default obsidian theme"
            >
              Reset
            </ButtonComponent>
          </div>
        }
      >
        <div className="space-y-4 pt-1">
          {/* Preset Lighting Atmosphere Selector */}
          <div>
            <span className="text-[11px] font-semibold text-[var(--ink)] uppercase tracking-wider block mb-2">
              Studio Lighting Presets
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {WALLPAPER_PRESETS.map((p) => {
                const isSelected =
                  wallpaper.mode === "preset" && wallpaper.presetId === p.id;

                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onSetWallpaperPreset(p.id)}
                    className={cn(
                      "p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between h-22 relative overflow-hidden group",
                      isSelected
                        ? "bg-[var(--accent)]/15 border-[var(--accent)] shadow-sm ring-1 ring-[var(--accent)]/30"
                        : "bg-[var(--paper)] border-[var(--line)] hover:border-[var(--focus)]"
                    )}
                  >
                    {/* Visual gradient swatch preview */}
                    <div
                      className="absolute inset-x-0 top-0 h-1.5 opacity-60 group-hover:opacity-80 transition-opacity"
                      style={{ background: p.gradient }}
                    />

                    <div className="relative z-10 flex items-center justify-between">
                      <span
                        className="w-3 h-3 rounded-full border border-[var(--line)] shadow-sm"
                        style={{ backgroundColor: p.accent }}
                      />
                      {isSelected && (
                        <span className="w-2 h-2 rounded-full bg-rose-400 shadow-[0_0_6px_#fb7185]" />
                      )}
                    </div>

                    <div className="relative z-10">
                      <p className="text-xs font-semibold text-[var(--ink)] m-0 truncate">
                        {p.name}
                      </p>
                      <p className="text-[10px] text-[var(--muted)] m-0 truncate">
                        {p.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Image Upload Zone */}
          <div>
            <span className="text-[11px] font-semibold text-[var(--ink)] uppercase tracking-wider block mb-2">
              Custom Wallpaper Image
            </span>

            <input
              type="file"
              ref={fileInputRef}
              accept="image/png,image/jpeg,image/webp"
              onChange={handleFileChange}
              className="hidden"
            />

            {wallpaper.customImage ? (
              <div className="p-3.5 rounded-xl bg-[var(--paper)] border border-[var(--line)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-16 h-12 rounded-lg overflow-hidden border border-[var(--line)] shrink-0 shadow-sm relative bg-[var(--surface)]">
                    <img
                      src={wallpaper.customImage}
                      alt="Custom Wallpaper Thumbnail"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold text-[var(--ink)] m-0 truncate">
                        {wallpaper.mode === "custom"
                          ? "Custom Wallpaper Active"
                          : "Saved Custom Wallpaper"}
                      </p>
                      <BadgeComponent
                        variant={wallpaper.mode === "custom" ? "default" : "secondary"}
                        className="text-[9px] h-4.5 px-1.5"
                      >
                        {wallpaper.mode === "custom" ? "Active" : "Inactive"}
                      </BadgeComponent>
                    </div>
                    <p className="text-[11px] text-[var(--muted)] m-0 mt-0.5">
                      {wallpaper.mode === "custom"
                        ? "Applied with liquid blur & contrast dimming"
                        : "Preset is active. Click 'Use Custom Image' to re-activate."}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  {wallpaper.mode !== "custom" && onActivateCustomWallpaper && (
                    <ButtonComponent
                      variant="primary"
                      size="sm"
                      onClick={onActivateCustomWallpaper}
                      className="h-8 text-xs font-medium"
                    >
                      Use Custom Image
                    </ButtonComponent>
                  )}

                  <ButtonComponent
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    loading={isUploading}
                    leftIcon={<Upload className="w-3.5 h-3.5" />}
                    className="h-8 text-xs"
                  >
                    Change Image
                  </ButtonComponent>

                  <ButtonComponent
                    variant="destructive"
                    size="sm"
                    onClick={() => setIsRemoveCustomWallpaperModalOpen(true)}
                    leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                    className="h-8 text-xs"
                    title="Remove custom wallpaper"
                  >
                    Remove
                  </ButtonComponent>
                </div>
              </div>
            ) : (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border border-dashed border-[var(--line)] hover:border-[var(--focus)] rounded-xl p-5 text-center bg-[var(--paper)] hover:bg-[var(--surface)] transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 group"
              >
                <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-400/20 text-[var(--accent-text)] flex items-center justify-center group-hover:scale-105 transition-transform shadow-sm">
                  <Upload className="w-5 h-5" />
                </div>
                <p className="text-xs font-semibold text-[var(--ink)] m-0 mt-1">
                  Click or drag image here to set custom background
                </p>
                <p className="text-[11px] text-[var(--muted)] m-0">
                  Supports PNG, JPG, or WEBP up to 8MB. Automatically scaled and contrast-protected.
                </p>
              </div>
            )}
          </div>

          {/* Atmosphere Tuning: Dimming & Blur Sliders */}
          <div className="p-3.5 rounded-xl bg-[var(--paper)] border border-[var(--line)] space-y-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--ink)]">
              <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--accent-text)]" />
              <span>Atmosphere Contrast & Readability Tuning</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Background Dimming Slider */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--muted)] text-[11px]">
                    Background Dimming (Contrast Protection)
                  </span>
                  <span className="font-mono text-[var(--ink)] font-semibold text-[11px]">
                    {Math.round(wallpaper.dim * 100)}%
                  </span>
                </div>
                <SliderComponent
                  value={Math.round(wallpaper.dim * 100)}
                  min={20}
                  max={90}
                  step={5}
                  unit="%"
                  showValue={false}
                  onChange={(val) => onSetWallpaperDim(val / 100)}
                />
              </div>

              {/* Background Blur Slider */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--muted)] text-[11px]">
                    Background Blur (Frosted Diffusion)
                  </span>
                  <span className="font-mono text-[var(--ink)] font-semibold text-[11px]">
                    {wallpaper.blur}px
                  </span>
                </div>
                <SliderComponent
                  value={wallpaper.blur}
                  min={0}
                  max={30}
                  step={1}
                  unit="px"
                  showValue={false}
                  onChange={(val) => onSetWallpaperBlur(val)}
                />
              </div>
            </div>
          </div>
        </div>
      </CardComponent>

      {/* 2. Google Account & Authentication */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        <div className="lg:col-span-2">
          <CardComponent
            title="Google Account"
            subtitle="Secure cloud sync for audio routing, presets, and companion metadata"
            extra={
              user ? (
                <BadgeComponent variant="emerald" dot>
                  Connected
                </BadgeComponent>
              ) : (
                <BadgeComponent variant="outline">Guest Session</BadgeComponent>
              )
            }
          >
            {user ? (
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-[var(--paper)] border border-[var(--line)]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl overflow-hidden border border-[var(--line)] shrink-0 shadow-md">
                    {user.avatar ? (
                      <img
                        src={user.avatar}
                        alt={user.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-rose-500/20 text-[var(--accent-text)] flex items-center justify-center font-bold text-sm">
                        {user.name.slice(0, 1)}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-[var(--ink)]">
                        {user.name}
                      </span>
                      <GoogleIcon className="w-3.5 h-3.5" />
                    </div>
                    <p className="text-[11px] text-[var(--muted)] m-0">{user.email}</p>
                  </div>
                </div>

                <ButtonComponent
                  variant="destructive"
                  size="sm"
                  onClick={() => setIsSignOutModalOpen(true)}
                  leftIcon={<LogOut className="w-3.5 h-3.5" />}
                  className="h-8.5 text-xs"
                >
                  Sign Out
                </ButtonComponent>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-[var(--paper)] border border-[var(--line)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-[var(--ink)] m-0">
                    Connect with Google
                  </p>
                  <p className="text-[11px] text-[var(--muted)] m-0 mt-0.5">
                    Sign in with one click to synchronize presets and device profiles securely.
                  </p>
                </div>

                <ButtonComponent
                  variant="outline"
                  size="md"
                  onClick={onSignInGoogle}
                  loading={isLoadingAuth}
                  leftIcon={<GoogleIcon className="w-4 h-4" />}
                  className="bg-[var(--surface)] hover:bg-[var(--paper)] text-[var(--ink)] border border-[var(--line)] font-semibold shadow-sm"
                >
                  Sign in with Google
                </ButtonComponent>
              </div>
            )}

            {/* Neon DB & Dual-Auth Architecture Shelf */}
            <div className="mt-3.5 p-3 rounded-xl bg-[var(--paper)] border border-[var(--line)] text-xs space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-[11px] font-semibold text-[var(--muted)]">
                  Database & Cloud Connection
                </span>
                <span className="font-mono text-[10px] text-[var(--success)] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_#34d399]" />
                  {dbStatus}
                </span>
              </div>

              <div className="flex items-center justify-between flex-wrap gap-2 border-t border-[var(--line)] pt-2">
                <span className="text-[11px] font-semibold text-[var(--muted)]">
                  Auth & Cryptography Stack
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="px-2 py-0.5 rounded bg-rose-500/10 border border-rose-400/25 text-[10px] font-mono text-[var(--accent-text)]">
                    HMAC-SHA256 JWT
                  </span>
                  <span className="px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-400/25 text-[10px] font-mono text-[var(--accent-text)]">
                    PKCE S256
                  </span>
                  <span className="px-2 py-0.5 rounded bg-purple-500/10 border border-purple-400/25 text-[10px] font-mono text-[var(--accent-text)]">
                    Keycloak OIDC
                  </span>
                  {user && (
                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-400/25 text-[10px] font-mono text-[var(--success)] uppercase">
                      Provider: {authProvider}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </CardComponent>
        </div>

        {/* 3. Audio Engine Configuration */}
        <CardComponent
          title="CoreAudio Engine"
          subtitle="Low-level audio buffer and routing performance options"
          extra={<Sliders className="w-4 h-4 text-[var(--muted)]" />}
        >
          <div className="space-y-3">
            <SelectComponent
              label="Sample Rate"
              value={sampleRate}
              onChange={handleSampleRateChange}
              options={[
                { label: "44.1 kHz (CD Quality)", value: "44100" },
                { label: "48.0 kHz (Studio Standard)", value: "48000" },
                { label: "96.0 kHz (High Resolution)", value: "96000" },
              ]}
            />

            <SelectComponent
              label="Buffer Size (Latency)"
              value={bufferSize}
              onChange={handleBufferSizeChange}
              options={[
                { label: "128 samples (~2.7ms - Low Latency)", value: "128" },
                { label: "256 samples (~5.3ms - Balanced)", value: "256" },
                { label: "512 samples (~10.7ms - Safe)", value: "512" },
              ]}
            />
          </div>
        </CardComponent>

        {/* 4. Voice AI Configuration */}
        <CardComponent
          title="Voice AI 1:1"
          subtitle="Microphone capture and conversational intelligence settings"
          extra={<Mic className="w-4 h-4 text-[var(--muted)]" />}
        >
          <div className="space-y-3">
            <SelectComponent
              label="Speech Recognition Model"
              value={voiceModel}
              onChange={handleVoiceModelChange}
              options={[
                { label: "Whisper Turbo (Local Engine)", value: "whisper-local" },
                { label: "OpenAI Realtime Voice (Cloud)", value: "openai-realtime" },
                { label: "ElevenLabs Studio Voice", value: "elevenlabs" },
              ]}
            />

            <SelectComponent
              label="Input Activation"
              value={inputMode}
              onChange={setInputMode}
              options={[
                { label: "Push-to-Talk (Spacebar / Shortcut)", value: "ptt" },
                { label: "Voice Activity Detection (Hands-free)", value: "vad" },
              ]}
            />
          </div>
        </CardComponent>

        {/* 5. Agent Pet Integration */}
        <div className="lg:col-span-2">
          <CardComponent
            title="Agent Pet Desktop Companion"
            subtitle="Socket bridge to ~/.agentpet/agentpet.sock"
            extra={<Bot className="w-4 h-4 text-[var(--muted)]" />}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--paper)] border border-[var(--line)] text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981]" />
                  <span className="font-mono text-[var(--ink)] text-[11px]">
                    ~/.agentpet/agentpet.sock
                  </span>
                </div>
                <span className="text-[10px] font-medium text-[var(--success)] bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Socket Active
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <SelectComponent
                  label="Selected Desktop Pet"
                  value={activePet}
                  onChange={handlePetChange}
                  leftIcon={<Sparkles className="w-3.5 h-3.5 text-[var(--warning)]" />}
                  options={[
                    { label: "Code Frenzy Cat (Active)", value: "code-frenzy-cat" },
                    { label: "Midnight Owl (Lofi)", value: "midnight-owl" },
                    { label: "Cyber Fox (Terminal)", value: "cyber-fox" },
                  ]}
                />

                <div className="flex flex-col justify-end">
                  <ButtonComponent
                    variant="outline"
                    size="md"
                    onClick={() => onSettingChange?.("Pet State", "Petted")}
                    leftIcon={<Sparkles className="w-3.5 h-3.5 text-[var(--warning)]" />}
                    className="w-full h-9 text-xs"
                  >
                    Send Heartbeat Ping
                  </ButtonComponent>
                </div>
              </div>
            </div>
          </CardComponent>
        </div>

        {/* 6. Performance & Memory Diagnostics */}
        <div className="lg:col-span-2">
          <CardComponent
            title="Performance & Memory Diagnostics"
            subtitle="Native macOS Mach task info & low-overhead background resource management"
            extra={<Cpu className="w-4 h-4 text-[var(--accent-text)]" />}
          >
            <div className="space-y-4">
              {/* Telemetry Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-xl bg-[var(--paper)] border border-[var(--line)] flex flex-col gap-1">
                  <div className="flex items-center justify-between text-[11px] text-[var(--muted)]">
                    <span className="flex items-center gap-1.5">
                      <HardDrive className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                      RAM (RSS)
                    </span>
                    <BadgeComponent
                      variant={
                        metrics.resident_size_mb < 90
                          ? "emerald"
                          : metrics.resident_size_mb < 200
                          ? "default"
                          : "coral"
                      }
                      className="text-[9px] px-1 py-0"
                    >
                      {metrics.resident_size_mb < 90 ? "OPTIMAL" : "ELEVATED"}
                    </BadgeComponent>
                  </div>
                  <span className="text-lg font-bold font-mono text-[var(--ink)] tracking-tight">
                    {metrics.resident_size_mb.toFixed(1)}{" "}
                    <span className="text-xs font-normal text-[var(--muted)]">MB</span>
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-[var(--paper)] border border-[var(--line)] flex flex-col gap-1">
                  <div className="flex items-center justify-between text-[11px] text-[var(--muted)]">
                    <span className="flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                      Virtual RAM
                    </span>
                    <span className="text-[10px] font-mono text-[var(--muted)]">64-bit Mach</span>
                  </div>
                  <span className="text-lg font-bold font-mono text-[var(--ink)] tracking-tight">
                    {(metrics.virtual_size_mb / 1024).toFixed(1)}{" "}
                    <span className="text-xs font-normal text-[var(--muted)]">GB</span>
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-[var(--paper)] border border-[var(--line)] flex flex-col gap-1">
                  <div className="flex items-center justify-between text-[11px] text-[var(--muted)]">
                    <span className="flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-[var(--success)]" />
                      Render Rate
                    </span>
                    <BadgeComponent variant="emerald" className="text-[9px] px-1 py-0">
                      VSYNC
                    </BadgeComponent>
                  </div>
                  <span className="text-lg font-bold font-mono text-[var(--ink)] tracking-tight">
                    {fps} <span className="text-xs font-normal text-[var(--muted)]">FPS</span>
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-[var(--paper)] border border-[var(--line)] flex flex-col gap-1">
                  <div className="flex items-center justify-between text-[11px] text-[var(--muted)]">
                    <span className="flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 text-[var(--warning)]" />
                      IPC Latency
                    </span>
                    <span className="text-[10px] font-mono text-[var(--muted)]">RTT</span>
                  </div>
                  <span className="text-lg font-bold font-mono text-[var(--ink)] tracking-tight">
                    {latencyMs.toFixed(1)}{" "}
                    <span className="text-xs font-normal text-[var(--muted)]">ms</span>
                  </span>
                </div>
              </div>

              {/* Resource Controls */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl bg-[var(--paper)] border border-[var(--line)]">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={backgroundRamSaver}
                    onClick={() => {
                      toggleBackgroundRamSaver(!backgroundRamSaver);
                      showToast?.(
                        "info",
                        `Background RAM Saver ${!backgroundRamSaver ? "enabled" : "disabled"}`
                      );
                    }}
                    className={cn(
                      "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                      backgroundRamSaver ? "bg-emerald-500" : "bg-[var(--input-line)]"
                    )}
                  >
                    <span
                      className={cn(
                        "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
                        backgroundRamSaver ? "translate-x-4" : "translate-x-0"
                      )}
                    />
                  </button>
                  <div>
                    <span className="text-xs font-medium text-[var(--ink)] block">
                      Background Eco & RAM Saver
                    </span>
                    <span className="text-[11px] text-[var(--muted)] block">
                      Auto-throttles 60FPS visualizers and trims inactive memory heap when minimized
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <ButtonComponent
                    variant="outline"
                    size="sm"
                    onClick={handleBenchmark}
                    disabled={isBenchmarking}
                    leftIcon={<RefreshCw className={cn("w-3.5 h-3.5", isBenchmarking && "animate-spin")} />}
                    className="text-xs"
                  >
                    {isBenchmarking ? "Testing…" : "Benchmark IPC"}
                  </ButtonComponent>

                  <ButtonComponent
                    variant="destructive"
                    size="sm"
                    onClick={() => setIsPurgeModalOpen(true)}
                    disabled={isTrimming}
                    leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                    className="text-xs"
                  >
                    Purge RAM
                  </ButtonComponent>
                </div>
              </div>
            </div>
          </CardComponent>
        </div>

        {/* 7. Brand Identity & Engine Info */}
        <div className="lg:col-span-2">
          <div className="p-5 rounded-2xl bg-[var(--surface)] border border-[var(--line)] flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
            <AppLogo size="lg" variant="with-wordmark" />

            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-1 rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/25 text-[11px] font-mono text-[var(--accent)]">
                v0.1.0-alpha · Tauri v2 + Rust
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-[11px] font-mono text-[var(--success)]">
                CoreAudio 48kHz Linear Phase
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-purple-500/10 border border-purple-500/25 text-[11px] font-mono text-purple-500">
                Gemini 2.5 Live
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal for Removing Custom Wallpaper */}
      <ModalComponent
        open={isRemoveCustomWallpaperModalOpen}
        onClose={() => setIsRemoveCustomWallpaperModalOpen(false)}
        title="Remove Custom Wallpaper?"
        description="Are you sure you want to remove your custom wallpaper? The background will revert to the active lighting preset."
        confirmText="Remove Wallpaper"
        cancelText="Cancel"
        confirmVariant="destructive"
        icon={<Trash2 className="w-5 h-5 text-[var(--accent-text)]" />}
        onConfirm={handleConfirmRemoveCustomWallpaper}
      />

      {/* Confirmation Modal for Resetting Wallpaper */}
      <ModalComponent
        open={isResetWallpaperModalOpen}
        onClose={() => setIsResetWallpaperModalOpen(false)}
        title="Reset Wallpaper to Default?"
        description="Are you sure you want to reset your wallpaper? This will restore the default Obsidian studio theme and reset blur and dimming levels."
        confirmText="Reset Theme"
        cancelText="Cancel"
        confirmVariant="destructive"
        icon={<AlertTriangle className="w-5 h-5 text-[var(--warning)]" />}
        onConfirm={handleConfirmResetWallpaper}
      />

      {/* Confirmation Modal for Google Sign Out */}
      <ModalComponent
        open={isSignOutModalOpen}
        onClose={() => setIsSignOutModalOpen(false)}
        title="Sign Out of Google Account?"
        description="Are you sure you want to sign out? Your cloud profile sync and online preferences will pause until you sign in again."
        confirmText="Sign Out"
        cancelText="Cancel"
        confirmVariant="destructive"
        icon={<AlertTriangle className="w-5 h-5 text-[var(--accent-text)]" />}
        onConfirm={handleConfirmSignOut}
      />

      {/* Confirmation Modal for Purging Memory Cache */}
      <ModalComponent
        open={isPurgeModalOpen}
        onClose={() => setIsPurgeModalOpen(false)}
        title="Purge Inactive Memory Cache?"
        description="This will trigger native macOS memory pressure relief (malloc_zone_pressure_relief) to release idle heap blocks and audio ringbuffers. Audio processing will remain active."
        confirmText="Purge Memory"
        cancelText="Cancel"
        confirmVariant="destructive"
        icon={<Trash2 className="w-5 h-5 text-[var(--warning)]" />}
        onConfirm={handleConfirmPurgeMemory}
      />
    </div>
  );
};
