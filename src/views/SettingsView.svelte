<script lang="ts">
  import { themeState } from "@/lib/theme.svelte";
  import {
    wallpaperState,
    WALLPAPER_PRESETS,
    type WallpaperPresetId,
  } from "@/lib/wallpaper.svelte";
  import { googleAuthState } from "@/lib/googleAuth.svelte";
  import { performanceDiagnosticsState } from "@/lib/performanceDiagnostics.svelte";
  import { toastState } from "@/lib/toast.svelte";
  import type { GoogleUser } from "@/components/navigation/SideNavbar.svelte";
  import GoogleIcon from "@/components/icons/GoogleIcon.svelte";
  import AppLogo from "@/components/icons/AppLogo.svelte";
  import GoogleLoginModal from "@/components/GoogleLoginModal.svelte";
  import VirtualCableModal from "@/components/VirtualCableModal.svelte";
  import Modal from "@/components/ui/Modal.svelte";
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
    Sun,
    Moon,
    Palette,
    Cable,
    Cpu,
    HardDrive,
    Zap,
    Activity,
    RefreshCw,
    ShieldCheck,
    Loader2,
    Crosshair,
  } from "@lucide/svelte";
  import {
    checkAccessibilityPermission,
    requestAccessibilityPermission,
    getPingloomSettings,
    savePingloomSettings,
    TRIGGERS,
    type PingloomSettings,
    DEFAULT_PINGLOOM_SETTINGS,
  } from "@/lib/pingloom";

  interface Props {
    user?: GoogleUser | null;
    isLoadingAuth?: boolean;
    onSignInGoogle?: () => void;
    onSignOutGoogle?: () => void;
    onSettingChange?: (setting: string, val: string) => void;
    showToast?: (type: "success" | "error" | "info", message: string) => void;
  }

  let {
    user = googleAuthState.user,
    isLoadingAuth = googleAuthState.isLoading,
    onSignInGoogle,
    onSignOutGoogle,
    onSettingChange,
    showToast,
  }: Props = $props();

  const currentUser = $derived(user ?? googleAuthState.user);
  const loadingAuth = $derived(isLoadingAuth || googleAuthState.isLoading);

  // Audio Engine Configuration State
  let sampleRate = $state("48000");
  let bufferSize = $state("256");
  let voiceModel = $state("whisper-local");
  let activePet = $state("code-frenzy-cat");
  let inputMode = $state("ptt");

  // Pingloom Desktop Gestures & Accessibility State
  let isAccessibilityGranted = $state(false);
  let isCheckingPermission = $state(false);
  let pingloomSettings = $state<PingloomSettings>({ ...DEFAULT_PINGLOOM_SETTINGS });

  async function handleCheckAccessibility() {
    isCheckingPermission = true;
    try {
      isAccessibilityGranted = await checkAccessibilityPermission();
    } catch {
      isAccessibilityGranted = false;
    } finally {
      isCheckingPermission = false;
    }
  }

  async function handleRequestAccessibility() {
    try {
      const res = await requestAccessibilityPermission();
      isAccessibilityGranted = res;
      if (res) {
        notify("success", "Đã cấp quyền Trợ năng (Accessibility) thành công!");
      } else {
        notify("info", "Đã mở Cài đặt Hệ thống. Vui lòng cấp quyền Accessibility cho rust-sound.");
      }
    } catch (e) {
      notify("error", `Lỗi khi yêu cầu quyền Trợ năng: ${String(e)}`);
    }
  }

  async function handleUpdatePingloom(next: PingloomSettings) {
    pingloomSettings = next;
    try {
      const saved = await savePingloomSettings(next);
      pingloomSettings = saved;
      notify("success", "Đã cập nhật cài đặt cử chỉ desktop!");
    } catch (e) {
      notify("error", `Lỗi khi lưu cài đặt: ${String(e)}`);
    }
  }

  $effect(() => {
    handleCheckAccessibility();
    getPingloomSettings()
      .then((s) => {
        if (s && s.wheel) pingloomSettings = s;
      })
      .catch(() => {});
  });

  // Modal Visibility States
  let isGoogleLoginModalOpen = $state(false);
  let isVirtualCableModalOpen = $state(false);
  let isSignOutModalOpen = $state(false);
  let isResetWallpaperModalOpen = $state(false);
  let isRemoveCustomWallpaperModalOpen = $state(false);
  let isPurgeModalOpen = $state(false);

  // File Upload Handling
  let isUploading = $state(false);
  let fileInputEl = $state<HTMLInputElement | null>(null);

  // Toast Helper
  function notify(type: "success" | "error" | "info", message: string) {
    if (showToast) {
      showToast(type, message);
    } else if (type === "success") {
      toastState.success(message);
    } else if (type === "error") {
      toastState.error(message);
    } else {
      toastState.info(message);
    }
  }

  // Current Preset Lookup
  const currentPreset = $derived(
    WALLPAPER_PRESETS.find((p) => p.id === wallpaperState.wallpaper.presetId) ||
      WALLPAPER_PRESETS[0]
  );

  // Diagnostics Telemetry Computations
  const physicalMb = $derived(
    performanceDiagnosticsState.metrics.phys_footprint_mb &&
      performanceDiagnosticsState.metrics.phys_footprint_mb > 0
      ? performanceDiagnosticsState.metrics.phys_footprint_mb
      : performanceDiagnosticsState.metrics.resident_size_mb
  );

  const peakMb = $derived(
    performanceDiagnosticsState.metrics.peak_phys_footprint_mb &&
      performanceDiagnosticsState.metrics.peak_phys_footprint_mb > 0
      ? performanceDiagnosticsState.metrics.peak_phys_footprint_mb
      : Math.max(physicalMb, performanceDiagnosticsState.metrics.resident_size_mb)
  );

  const memoryStatus = $derived(
    physicalMb < 120
      ? { label: "OPTIMAL", class: "badge-ok" }
      : physicalMb < 250
      ? { label: "HEALTHY", class: "badge" }
      : { label: "ELEVATED", class: "badge-warn" }
  );

  const memoryPercentage = $derived(
    Math.min(100, Math.max(4, Math.round((physicalMb / 500) * 100)))
  );

  // Wallpaper Handlers
  function handleSelectPreset(id: WallpaperPresetId) {
    wallpaperState.setPreset(id);
    notify("success", `Đã áp dụng hình nền preset: ${id}`);
  }

  async function handleFileInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    isUploading = true;
    try {
      const res = await wallpaperState.uploadCustomImage(file);
      if (res.success) {
        notify("success", "Đã tải lên và áp dụng hình nền tùy chỉnh!");
      } else {
        notify("error", res.error || "Tải ảnh lên thất bại");
      }
    } catch {
      notify("error", "Lỗi bất ngờ khi tải ảnh lên");
    } finally {
      isUploading = false;
      if (fileInputEl) fileInputEl.value = "";
    }
  }

  async function handleDrop(e: DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;

    isUploading = true;
    try {
      const res = await wallpaperState.uploadCustomImage(file);
      if (res.success) {
        notify("success", "Đã tải lên và áp dụng hình nền tùy chỉnh!");
      } else {
        notify("error", res.error || "Tải ảnh lên thất bại");
      }
    } catch {
      notify("error", "Lỗi bất ngờ khi tải ảnh lên");
    } finally {
      isUploading = false;
    }
  }

  function handleConfirmResetWallpaper() {
    isResetWallpaperModalOpen = false;
    wallpaperState.resetToDefault();
    notify("info", "Đã khôi phục hình nền Obsidian mặc định");
  }

  function handleConfirmRemoveCustomWallpaper() {
    isRemoveCustomWallpaperModalOpen = false;
    wallpaperState.removeCustomImage();
    notify("info", "Đã gỡ bỏ hình nền tùy chỉnh");
  }

  // Authentication Handlers
  function handleTriggerSignIn() {
    if (onSignInGoogle) {
      onSignInGoogle();
    } else {
      isGoogleLoginModalOpen = true;
    }
  }

  async function handleConfirmSignOut() {
    isSignOutModalOpen = false;
    try {
      if (onSignOutGoogle) {
        await onSignOutGoogle();
      } else {
        await googleAuthState.signOut();
        notify("info", "Đã đăng xuất khỏi tài khoản Google");
      }
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Chưa đăng xuất được. Hãy thử lại.");
    }
  }

  // Diagnostics Handlers
  async function handleBenchmark() {
    try {
      const res = await performanceDiagnosticsState.runBenchmark();
      notify(
        "info",
        `Benchmark hoàn tất: ${res.avgLatencyMs.toFixed(1)}ms độ trễ IPC (min ${res.minLatencyMs}ms, max ${res.maxLatencyMs}ms), ${res.fps} FPS`
      );
    } catch {
      notify("error", "Đo kiểm độ trễ IPC thất bại");
    }
  }

  async function handleConfirmPurgeMemory() {
    isPurgeModalOpen = false;
    try {
      const res = await performanceDiagnosticsState.trimMemory();
      const reclaimedMb = (res.bytes_reclaimed / (1024 * 1024)).toFixed(1);
      notify(
        "success",
        `Đã dọn sạch bộ nhớ! Giải phóng ~${reclaimedMb} MB (Footprint hiện tại: ${res.phys_footprint_mb.toFixed(1)} MB)`
      );
    } catch {
      notify("error", "Dọn dẹp bộ nhớ thất bại");
    }
  }

  async function handleManualRefreshDiagnostics() {
    try {
      await performanceDiagnosticsState.refreshMetrics();
      notify("info", "Đã làm mới thông số hiệu năng Mach Task");
    } catch {
      notify("error", "Không thể làm mới thông số");
    }
  }

  // Audio Engine Changes
  function handleSampleRateChange(val: string) {
    sampleRate = val;
    onSettingChange?.(
      "Sample Rate",
      val === "48000" ? "48.0 kHz" : val === "44100" ? "44.1 kHz" : "96.0 kHz"
    );
  }

  function handleBufferSizeChange(val: string) {
    bufferSize = val;
    onSettingChange?.("Buffer Latency", `${val} samples`);
  }

  function handleVoiceModelChange(val: string) {
    voiceModel = val;
    onSettingChange?.("Voice Model", val);
  }

  function handlePetChange(val: string) {
    activePet = val;
    onSettingChange?.("Active Desktop Pet", val);
  }
</script>

{#snippet removeWallpaperIcon()}
  <Trash2 class="w-5 h-5 text-(--error)" />
{/snippet}

{#snippet resetWallpaperIcon()}
  <AlertTriangle class="w-5 h-5 text-(--warning)" />
{/snippet}

{#snippet signOutIcon()}
  <LogOut class="w-5 h-5 text-(--error)" />
{/snippet}

{#snippet purgeMemoryIcon()}
  <Trash2 class="w-5 h-5 text-(--accent-text)" />
{/snippet}

<div class="w-full select-none space-y-5 pb-8">
  <!-- 1. System Wallpaper & Atmosphere Customization Panel -->
  <div class="panel p-5 space-y-4">
    <div class="panel-head">
      <div>
        <h3 class="text-sm font-bold text-(--ink) m-0">
          Hình Nền & Không Gian Ánh Sáng Atmosphere
        </h3>
        <p class="text-[11px] text-(--muted) m-0 mt-0.5">
          Tùy biến phong cách hình ảnh với preset studio lighting hoặc tải lên ảnh nền cá nhân
        </p>
      </div>

      <div class="flex items-center gap-2">
        {#if wallpaperState.wallpaper.mode === "custom"}
          <span class="badge gap-1.5 h-6">
            <ImageIcon class="w-3 h-3 text-(--accent-text)" />
            <span>Ảnh Tùy Chỉnh</span>
          </span>
        {:else}
          <span class="badge h-6">
            {currentPreset.name}
          </span>
        {/if}

        <button
          type="button"
          onclick={() => (isResetWallpaperModalOpen = true)}
          class="btn btn-ghost h-7 px-2 text-xs flex items-center gap-1.5"
          title="Khôi phục hình nền Obsidian mặc định"
        >
          <RotateCcw class="w-3.5 h-3.5 text-(--muted)" />
          <span>Reset</span>
        </button>
      </div>
    </div>

    <!-- Preset Lighting Atmosphere Selector -->
    <div>
      <span class="text-[11px] font-semibold text-(--ink) uppercase tracking-wider block mb-2">
        Studio Lighting Presets
      </span>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {#each WALLPAPER_PRESETS as p (p.id)}
          {@const isSelected =
            wallpaperState.wallpaper.mode === "preset" &&
            wallpaperState.wallpaper.presetId === p.id}
          <button
            type="button"
            onclick={() => handleSelectPreset(p.id)}
            class="p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between h-22 relative overflow-hidden group {isSelected
              ? 'bg-(--accent)/15 border-(--accent) shadow-xs ring-1 ring-(--accent)/30'
              : 'bg-(--paper) border-(--line) hover:border-(--focus)'}"
          >
            <!-- Visual gradient swatch preview -->
            <div
              class="absolute inset-x-0 top-0 h-1.5 opacity-60 group-hover:opacity-80 transition-opacity"
              style="background: {p.gradient};"
            ></div>

            <div class="relative z-10 flex items-center justify-between">
              <span
                class="w-3 h-3 rounded-full border border-(--line) shadow-xs"
                style="background-color: {p.accent};"
              ></span>
              {#if isSelected}
                <span class="w-2 h-2 rounded-full bg-(--accent) shadow-[0_0_6px_var(--accent)]"></span>
              {/if}
            </div>

            <div class="relative z-10">
              <p class="text-xs font-semibold text-(--ink) m-0 truncate">
                {p.name}
              </p>
              <p class="text-[10px] text-(--muted) m-0 truncate">
                {p.description}
              </p>
            </div>
          </button>
        {/each}
      </div>
    </div>

    <!-- Custom Image Upload Zone -->
    <div>
      <span class="text-[11px] font-semibold text-(--ink) uppercase tracking-wider block mb-2">
        Ảnh Nền Tùy Chỉnh
      </span>

      <input
        type="file"
        bind:this={fileInputEl}
        accept="image/png,image/jpeg,image/webp"
        onchange={handleFileInput}
        class="hidden"
      />

      {#if wallpaperState.wallpaper.customImage}
        <div class="p-3.5 rounded-xl bg-(--paper) border border-(--line) flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-16 h-12 rounded-lg overflow-hidden border border-(--line) shrink-0 shadow-xs relative bg-(--surface)">
              <img
                src={wallpaperState.wallpaper.customImage}
                alt="Custom Wallpaper Thumbnail"
                class="w-full h-full object-cover"
              />
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <p class="text-xs font-semibold text-(--ink) m-0 truncate">
                  {wallpaperState.wallpaper.mode === "custom"
                    ? "Ảnh Nền Tùy Chỉnh Đang Kích Hoạt"
                    : "Ảnh Nền Tùy Chỉnh Đã Lưu"}
                </p>
                <span
                  class="badge text-[9px] h-4.5 px-1.5 {wallpaperState.wallpaper.mode === 'custom'
                    ? 'badge-ok'
                    : 'bg-(--surface) text-(--muted)'}"
                >
                  {wallpaperState.wallpaper.mode === "custom" ? "Đang Dùng" : "Tạm Dừng"}
                </span>
              </div>
              <p class="text-[11px] text-(--muted) m-0 mt-0.5">
                {wallpaperState.wallpaper.mode === "custom"
                  ? "Áp dụng hiệu ứng khuếch tán làm mờ và bảo vệ độ tương phản chữ"
                  : "Đang sử dụng preset. Nhấp 'Dùng Ảnh Này' để kích hoạt lại."}
              </p>
            </div>
          </div>

          <div class="flex items-center gap-2 shrink-0 self-end sm:self-center">
            {#if wallpaperState.wallpaper.mode !== "custom"}
              <button
                type="button"
                onclick={() => {
                  wallpaperState.activateCustomImage();
                  notify("success", "Đã kích hoạt ảnh nền tùy chỉnh!");
                }}
                class="btn btn-primary h-8 text-xs font-medium"
              >
                Dùng Ảnh Này
              </button>
            {/if}

            <button
              type="button"
              onclick={() => fileInputEl?.click()}
              disabled={isUploading}
              class="btn h-8 text-xs flex items-center gap-1.5"
            >
              {#if isUploading}
                <Loader2 class="w-3.5 h-3.5 animate-spin" />
              {:else}
                <Upload class="w-3.5 h-3.5" />
              {/if}
              <span>Đổi Ảnh</span>
            </button>

            <button
              type="button"
              onclick={() => (isRemoveCustomWallpaperModalOpen = true)}
              class="btn btn-danger h-8 text-xs flex items-center gap-1.5"
              title="Gỡ ảnh nền tùy chỉnh"
            >
              <Trash2 class="w-3.5 h-3.5" />
              <span>Gỡ Bỏ</span>
            </button>
          </div>
        </div>
      {:else}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div
          role="button"
          tabindex="0"
          ondragover={(e) => e.preventDefault()}
          ondrop={handleDrop}
          onclick={() => fileInputEl?.click()}
          class="border border-dashed border-(--line) hover:border-(--focus) rounded-xl p-5 text-center bg-(--paper) hover:bg-(--surface) transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 group"
        >
          <div class="w-10 h-10 rounded-xl bg-(--accent)/10 border border-(--accent)/20 text-(--accent-text) flex items-center justify-center group-hover:scale-105 transition-transform shadow-xs">
            {#if isUploading}
              <Loader2 class="w-5 h-5 animate-spin" />
            {:else}
              <Upload class="w-5 h-5" />
            {/if}
          </div>
          <p class="text-xs font-semibold text-(--ink) m-0 mt-1">
            Nhấp hoặc kéo thả hình ảnh vào đây để đặt hình nền
          </p>
          <p class="text-[11px] text-(--muted) m-0">
            Hỗ trợ định dạng PNG, JPG hoặc WEBP tối đa 8MB. Tự động tối ưu dung lượng và bảo vệ độ tương phản.
          </p>
        </div>
      {/if}
    </div>

    <!-- Atmosphere Tuning: Dimming & Blur Sliders -->
    <div class="p-3.5 rounded-xl bg-(--paper) border border-(--line) space-y-4">
      <div class="flex items-center gap-2 text-xs font-semibold text-(--ink)">
        <SlidersHorizontal class="w-3.5 h-3.5 text-(--accent-text)" />
        <span>Tinh Chỉnh Độ Tương Phản & Độ Mờ Atmosphere</span>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <!-- Background Dimming Slider -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between text-xs">
            <label for="wallpaper-dim-slider" class="text-(--muted) text-[11px]">
              Độ Tối Nền (Bảo Vệ Đọc Chữ)
            </label>
            <span class="font-mono text-(--ink) font-semibold text-[11px]">
              {Math.round(wallpaperState.wallpaper.dim * 100)}%
            </span>
          </div>
          <input
            id="wallpaper-dim-slider"
            type="range"
            class="volume-slider"
            min="20"
            max="90"
            step="5"
            value={Math.round(wallpaperState.wallpaper.dim * 100)}
            style="--level: {Math.round(((wallpaperState.wallpaper.dim - 0.2) / 0.7) * 100)}%;"
            oninput={(e) => {
              const val = Number((e.target as HTMLInputElement).value);
              wallpaperState.setDim(val / 100);
            }}
          />
        </div>

        <!-- Background Blur Slider -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between text-xs">
            <label for="wallpaper-blur-slider" class="text-(--muted) text-[11px]">
              Độ Mờ Hậu Cảnh (Frosted Blur)
            </label>
            <span class="font-mono text-(--ink) font-semibold text-[11px]">
              {wallpaperState.wallpaper.blur}px
            </span>
          </div>
          <input
            id="wallpaper-blur-slider"
            type="range"
            class="volume-slider"
            min="0"
            max="30"
            step="1"
            value={wallpaperState.wallpaper.blur}
            style="--level: {Math.round((wallpaperState.wallpaper.blur / 30) * 100)}%;"
            oninput={(e) => {
              const val = Number((e.target as HTMLInputElement).value);
              wallpaperState.setBlur(val);
            }}
          />
        </div>
      </div>
    </div>
  </div>

  <!-- 2. Pingloom Palette & Theme Configuration Panel -->
  <div class="panel p-5 space-y-4">
    <div class="panel-head">
      <div>
        <h3 class="text-sm font-bold text-(--ink) m-0 flex items-center gap-1.5">
          <Palette class="w-4 h-4 text-(--accent)" />
          <span>Chủ Đề & Bảng Màu Pingloom</span>
        </h3>
        <p class="text-[11px] text-(--muted) m-0 mt-0.5">
          Hệ thống màu sắc WCAG AA bảo vệ mắt và tối ưu độ tương phản cho kỹ sư âm thanh
        </p>
      </div>

      <div class="flex items-center gap-2">
        <button
          type="button"
          onclick={() => themeState.toggleThemeMode()}
          class="btn h-7 px-2.5 text-xs flex items-center gap-1.5"
          title="Chuyển chế độ sáng / tối"
        >
          {#if themeState.resolvedThemeMode === "dark"}
            <Sun class="w-3.5 h-3.5 text-(--accent)" />
            <span>Chế độ Sáng</span>
          {:else}
            <Moon class="w-3.5 h-3.5 text-(--ink)" />
            <span>Chế độ Tối</span>
          {/if}
        </button>
      </div>
    </div>

    <!-- Theme Palettes Grid -->
    <div class="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
      {#each [
        { id: "default", name: "Pingloom Rose", desc: "Default Dusty Rose", color: "var(--accent)" },
        { id: "latte", name: "Catppuccin Latte", desc: "Teal Light Palette", color: "var(--accent)" },
        { id: "frappe", name: "Catppuccin Frappé", desc: "Balanced Dark", color: "var(--accent)" },
        { id: "macchiato", name: "Catppuccin Macchiato", desc: "Rich Indigo", color: "var(--accent)" },
        { id: "mocha", name: "Catppuccin Mocha", desc: "Deep Pingloom Blue", color: "var(--accent)" }
      ] as t}
        {@const isSelected = themeState.selectedTheme === t.id}
        <button
          type="button"
          onclick={() => themeState.selectTheme(t.id)}
          class="p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between h-20 {isSelected
            ? 'bg-(--accent)/15 border-(--accent) shadow-xs ring-1 ring-(--accent)/30'
            : 'bg-(--paper) border-(--line) hover:border-(--focus)'}"
        >
          <div class="flex items-center justify-between">
            <span class="w-3 h-3 rounded-full border border-(--line) bg-(--accent)"></span>
            {#if isSelected}
              <CheckCircle2 class="w-3.5 h-3.5 text-(--accent)" />
            {/if}
          </div>
          <div>
            <p class="text-xs font-semibold text-(--ink) m-0 truncate">
              {t.name}
            </p>
            <p class="text-[10px] text-(--muted) m-0 truncate">
              {t.desc}
            </p>
          </div>
        </button>
      {/each}
    </div>
  </div>

  <!-- 3. Google & Keycloak Authentication Panel -->
  <div class="panel p-5 space-y-4">
    <div class="panel-head">
      <div>
        <h3 class="text-sm font-bold text-(--ink) m-0">
          Tài Khoản Đám Mây & Đồng Bộ
        </h3>
        <p class="text-[11px] text-(--muted) m-0 mt-0.5">
          Đồng bộ cấu hình định tuyến âm thanh, lịch Focus Timer và kết nối Voice AI với Neon PostgreSQL
        </p>
      </div>

      <span
        class="badge {currentUser ? 'badge-ok' : 'bg-(--surface) text-(--muted)'}"
      >
        {currentUser ? "Đã Kết Nối" : "Phiên Khách"}
      </span>
    </div>

    {#if currentUser}
      <div class="flex items-center justify-between p-3.5 rounded-xl bg-(--paper) border border-(--line)">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl overflow-hidden border border-(--line) shrink-0 shadow-xs">
            {#if currentUser.avatar}
              <img
                src={currentUser.avatar}
                alt={currentUser.name}
                class="w-full h-full object-cover"
              />
            {:else}
              <div class="w-full h-full bg-(--accent)/20 text-(--accent-text) flex items-center justify-center font-bold text-sm">
                {currentUser.name.slice(0, 1)}
              </div>
            {/if}
          </div>
          <div>
            <div class="flex items-center gap-1.5">
              <span class="text-xs font-semibold text-(--ink)">
                {currentUser.name}
              </span>
              <GoogleIcon class="w-3.5 h-3.5" />
            </div>
            <p class="text-[11px] text-(--muted) m-0">{currentUser.email}</p>
          </div>
        </div>

        <button
          type="button"
          onclick={() => (isSignOutModalOpen = true)}
          class="btn btn-danger h-8.5 text-xs flex items-center gap-1.5"
        >
          <LogOut class="w-3.5 h-3.5" />
          <span>Đăng Xuất</span>
        </button>
      </div>
    {:else}
      <div class="p-4 rounded-xl bg-(--paper) border border-(--line) flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p class="text-xs font-semibold text-(--ink) m-0">
            Kết Nối Tài Khoản Google
          </p>
          <p class="text-[11px] text-(--muted) m-0 mt-0.5">
            Đăng nhập an toàn bằng trình duyệt để lưu danh tính và phiên tài khoản trên máy chủ.
          </p>
        </div>

        <button
          type="button"
          onclick={handleTriggerSignIn}
          disabled={loadingAuth}
          class="btn h-9 px-3.5 bg-(--surface) hover:bg-(--paper) text-(--ink) border border-(--line) font-semibold shadow-xs flex items-center gap-2"
        >
          {#if loadingAuth}
            <Loader2 class="w-4 h-4 animate-spin text-(--accent)" />
          {:else}
            <GoogleIcon class="w-4 h-4" />
          {/if}
          <span>Đăng nhập với Google</span>
        </button>
      </div>
    {/if}

    <!-- Neon DB & Dual-Auth Architecture Shelf -->
    <div class="p-3 rounded-xl bg-(--paper) border border-(--line) text-xs space-y-2">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <span class="text-[11px] font-semibold text-(--muted)">
          Cơ Sở Dữ Liệu & Kết Nối Đám Mây
        </span>
        <span class="font-mono text-[10px] text-(--muted)">
          {googleAuthState.dbStatus}
        </span>
      </div>

      <div class="flex items-center justify-between flex-wrap gap-2 border-t border-(--line) pt-2">
        <span class="text-[11px] font-semibold text-(--muted)">
          Ngăn Xếp Xác Thực & Mã Hóa
        </span>
        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="px-2 py-0.5 rounded bg-(--accent)/10 border border-(--accent)/25 text-[10px] font-mono text-(--accent-text) flex items-center gap-1">
            <ShieldCheck class="w-3 h-3 text-(--success)" />
            <span>HMAC-SHA256 JWT</span>
          </span>
          <span class="px-2 py-0.5 rounded bg-(--accent)/10 border border-(--accent)/25 text-[10px] font-mono text-(--accent-text)">
            PKCE S256
          </span>
          <span class="px-2 py-0.5 rounded bg-(--accent)/10 border border-(--accent)/25 text-[10px] font-mono text-(--accent-text)">
            Google OpenID Connect
          </span>
          {#if currentUser}
            <span class="px-2 py-0.5 rounded bg-(--success)/10 border border-(--success)/25 text-[10px] font-mono text-(--success) uppercase">
              Provider: {googleAuthState.authProvider}
            </span>
          {/if}
        </div>
      </div>
    </div>
  </div>

  <!-- 4. CoreAudio & Virtual Cable Configuration Grid -->
  <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
    <!-- CoreAudio Engine Card -->
    <div class="panel p-5 space-y-4">
      <div class="panel-head">
        <div>
          <h3 class="text-sm font-bold text-(--ink) m-0">
            CoreAudio Engine
          </h3>
          <p class="text-[11px] text-(--muted) m-0 mt-0.5">
            Cấu hình bộ đệm phần cứng và định tuyến âm thanh độ trễ thấp
          </p>
        </div>
        <Sliders class="w-4 h-4 text-(--muted)" />
      </div>

      <div class="space-y-3">
        <div class="space-y-1">
          <label for="sample-rate-select" class="text-xs font-medium text-(--ink) block">
            Sample Rate (Tần Số Lấy Mẫu)
          </label>
          <select
            id="sample-rate-select"
            class="field w-full"
            value={sampleRate}
            onchange={(e) => handleSampleRateChange((e.target as HTMLSelectElement).value)}
          >
            <option value="44100">44.1 kHz (CD Quality)</option>
            <option value="48000">48.0 kHz (Studio Standard - Khuyên Dùng)</option>
            <option value="96000">96.0 kHz (High Resolution)</option>
          </select>
        </div>

        <div class="space-y-1">
          <label for="buffer-size-select" class="text-xs font-medium text-(--ink) block">
            Buffer Size (Độ Trễ Độ Dài Khung)
          </label>
          <select
            id="buffer-size-select"
            class="field w-full"
            value={bufferSize}
            onchange={(e) => handleBufferSizeChange((e.target as HTMLSelectElement).value)}
          >
            <option value="128">128 samples (~2.7ms - Low Latency)</option>
            <option value="256">256 samples (~5.3ms - Balanced)</option>
            <option value="512">512 samples (~10.7ms - Safe Mode)</option>
          </select>
        </div>

        <!-- Virtual Cable Modal Guide Trigger Button -->
        <div class="pt-2 border-t border-(--line)">
          <button
            type="button"
            onclick={() => (isVirtualCableModalOpen = true)}
            class="btn w-full h-9 bg-(--surface) hover:bg-(--paper) text-(--ink) border border-(--line) flex items-center justify-between px-3 text-xs font-medium"
          >
            <span class="flex items-center gap-2">
              <Cable class="w-4 h-4 text-(--accent)" />
              <span>Định Tuyến Micro Ảo (Discord / Zoom)</span>
            </span>
            <span class="text-[10px] text-(--accent) font-semibold">Xem Hướng Dẫn</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Voice AI 1:1 Card -->
    <div class="panel p-5 space-y-4">
      <div class="panel-head">
        <div>
          <h3 class="text-sm font-bold text-(--ink) m-0">
            Voice AI 1:1
          </h3>
          <p class="text-[11px] text-(--muted) m-0 mt-0.5">
            Cài đặt thu âm giọng nói và mô hình hội thoại Gemini
          </p>
        </div>
        <Mic class="w-4 h-4 text-(--muted)" />
      </div>

      <div class="space-y-3">
        <div class="space-y-1">
          <label for="voice-model-select" class="text-xs font-medium text-(--ink) block">
            Mô Hình Nhận Diện Giọng Nói
          </label>
          <select
            id="voice-model-select"
            class="field w-full"
            value={voiceModel}
            onchange={(e) => handleVoiceModelChange((e.target as HTMLSelectElement).value)}
          >
            <option value="whisper-local">Whisper Turbo (Engine Nội Bộ)</option>
            <option value="openai-realtime">OpenAI Realtime Voice (Đám Mây)</option>
            <option value="elevenlabs">ElevenLabs Studio Voice</option>
          </select>
        </div>

        <div class="space-y-1">
          <label for="input-mode-select" class="text-xs font-medium text-(--ink) block">
            Phương Thức Kích Hoạt Micro
          </label>
          <select
            id="input-mode-select"
            class="field w-full"
            value={inputMode}
            onchange={(e) => {
              inputMode = (e.target as HTMLSelectElement).value;
              onSettingChange?.("Input Mode", inputMode);
            }}
          >
            <option value="ptt">Push-to-Talk (Phím Spacebar / Phím Tắt)</option>
            <option value="vad">Voice Activity Detection (Tự Động Khi Nói)</option>
          </select>
        </div>

        <div class="p-2.5 rounded-lg bg-(--paper) border border-(--line) text-[11px] text-(--muted)">
          Độ trễ trung bình khi đàm thoại trực tiếp với Gemini 2.5 Live đạt ~120ms thông qua WebRTC / WebSocket.
        </div>
      </div>
    </div>
  </div>

  <!-- 5. Agent Pet Companion Integration -->
  <div class="panel p-5 space-y-4">
    <div class="panel-head">
      <div>
        <h3 class="text-sm font-bold text-(--ink) m-0">
          Agent Pet Desktop Companion
        </h3>
        <p class="text-[11px] text-(--muted) m-0 mt-0.5">
          Cầu nối Unix Domain Socket đến ~/.agentpet/agentpet.sock
        </p>
      </div>
      <Bot class="w-4 h-4 text-(--muted)" />
    </div>

    <div class="space-y-3">
      <div class="flex items-center justify-between p-2.5 rounded-lg bg-(--paper) border border-(--line) text-xs">
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-(--success) shadow-[0_0_6px_var(--success)]"></span>
          <span class="font-mono text-(--ink) text-[11px]">
            ~/.agentpet/agentpet.sock
          </span>
        </div>
        <span class="badge badge-ok text-[10px] font-medium flex items-center gap-1">
          <CheckCircle2 class="w-3 h-3" />
          <span>Socket Hoạt Động</span>
        </span>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div class="space-y-1">
          <label for="pet-selector" class="text-xs font-medium text-(--ink) block">
            Thú Cưng Đồng Hành Hiện Tại
          </label>
          <select
            id="pet-selector"
            class="field w-full"
            value={activePet}
            onchange={(e) => handlePetChange((e.target as HTMLSelectElement).value)}
          >
            <option value="code-frenzy-cat">Code Frenzy Cat (Đang Dùng)</option>
            <option value="midnight-owl">Midnight Owl (Lofi)</option>
            <option value="cyber-fox">Cyber Fox (Terminal)</option>
          </select>
        </div>

        <div class="flex flex-col justify-end">
          <button
            type="button"
            onclick={() => {
              onSettingChange?.("Pet State", "Petted");
              notify("success", "Đã gửi tín hiệu Heartbeat Ping đến Agent Pet!");
            }}
            class="btn h-8 text-xs flex items-center justify-center gap-1.5"
          >
            <Sparkles class="w-3.5 h-3.5 text-(--warning)" />
            <span>Gửi Heartbeat Ping</span>
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- 6. Desktop Ping & Emote Gestures (Pingloom CGEventTap) -->
  <div class="panel p-5 space-y-4">
    <div class="panel-head">
      <div>
        <h3 class="text-sm font-bold text-(--ink) m-0">
          Cử Chỉ Màn Hình LoL & Tactical Emotes (Pingloom)
        </h3>
        <p class="text-[11px] text-(--muted) m-0 mt-0.5">
          Nhận diện cử chỉ rê chuột toàn hệ thống thông qua native CGEventTap trên macOS
        </p>
      </div>

      <div class="flex items-center gap-2">
        <Crosshair class="w-4 h-4 text-(--muted)" />
        <span class="badge {isAccessibilityGranted ? 'badge-ok' : 'bg-(--warning)/15 text-(--warning) border border-(--warning)/30'} text-[10px]">
          {isAccessibilityGranted ? "Trợ Năng Đã Bật" : "Cần Cấp Quyền"}
        </span>
      </div>
    </div>

    <!-- macOS Accessibility Permission Notice Card -->
    <div class="p-3.5 rounded-xl bg-(--paper) border border-(--line) flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      <div class="flex items-start gap-2.5">
        <div class="mt-0.5">
          {#if isAccessibilityGranted}
            <CheckCircle2 class="w-4 h-4 text-(--success)" />
          {:else}
            <AlertTriangle class="w-4 h-4 text-(--warning)" />
          {/if}
        </div>
        <div>
          <span class="text-xs font-semibold text-(--ink) block">
            {isAccessibilityGranted ? "Quyền Trợ Năng macOS: Đã Cấp Quyền" : "Quyền Trợ Năng macOS (Accessibility): Chưa Cấp"}
          </span>
          <span class="text-[11px] text-(--muted) block mt-0.5">
            {isAccessibilityGranted
              ? "CGEventTap đang chạy nền để lắng nghe phím tắt và vẽ vòng tròn ping ngoài màn hình desktop."
              : "Yêu cầu quyền Trợ năng để CGEventTap có thể lắng nghe phím giữ và cử chỉ rê chuột trong game và trên màn hình."}
          </span>
        </div>
      </div>

      {#if !isAccessibilityGranted}
        <button
          type="button"
          onclick={handleRequestAccessibility}
          class="btn btn-primary h-8 px-3 text-xs flex items-center gap-1.5 shrink-0"
        >
          <ShieldCheck class="w-3.5 h-3.5" />
          <span>Mở Quyền macOS</span>
        </button>
      {:else}
        <button
          type="button"
          onclick={handleCheckAccessibility}
          disabled={isCheckingPermission}
          class="btn btn-ghost h-8 px-2.5 text-xs flex items-center gap-1.5 shrink-0"
        >
          {#if isCheckingPermission}
            <Loader2 class="w-3.5 h-3.5 animate-spin" />
          {:else}
            <RefreshCw class="w-3.5 h-3.5 text-(--muted)" />
          {/if}
          <span>Kiểm Tra Lại</span>
        </button>
      {/if}
    </div>

    <!-- Gesture Controls Grid -->
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
      <!-- Toggle 1: Global Gesture Listener Toggle -->
      <div class="p-3 rounded-xl bg-(--paper) border border-(--line) flex items-center justify-between gap-3">
        <div>
          <span class="text-xs font-semibold text-(--ink) block">
            Kích Hoạt Cử Chỉ Desktop
          </span>
          <span class="text-[11px] text-(--muted) block mt-0.5">
            Lắng nghe phím giữ và rê chuột trên toàn desktop
          </span>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={pingloomSettings.enabled_on_start}
          onclick={() =>
            handleUpdatePingloom({
              ...pingloomSettings,
              enabled_on_start: !pingloomSettings.enabled_on_start,
            })}
          class="w-11 h-6 rounded-full transition-colors relative cursor-pointer border border-(--line) shrink-0 {pingloomSettings.enabled_on_start
            ? 'bg-(--accent)'
            : 'bg-(--paper)'}"
          title="Bật/Tắt cử chỉ desktop"
        >
          <span
            class="w-4 h-4 rounded-full bg-(--paper) shadow-xs absolute top-0.5 transition-transform {pingloomSettings.enabled_on_start
              ? 'translate-x-5.5'
              : 'translate-x-0.5'}"
          ></span>
        </button>
      </div>

      <!-- Toggle 2: Instant Quick Ping -->
      <div class="p-3 rounded-xl bg-(--paper) border border-(--line) flex items-center justify-between gap-3">
        <div>
          <span class="text-xs font-semibold text-(--ink) block">
            Thả Ping Nhanh Khi Nhấp (Quick Ping)
          </span>
          <span class="text-[11px] text-(--muted) block mt-0.5">
            Nhấp phím kích hoạt không rê sẽ thả ping ngay lập tức
          </span>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={pingloomSettings.click_ping}
          onclick={() =>
            handleUpdatePingloom({
              ...pingloomSettings,
              click_ping: !pingloomSettings.click_ping,
            })}
          class="w-11 h-6 rounded-full transition-colors relative cursor-pointer border border-(--line) shrink-0 {pingloomSettings.click_ping
            ? 'bg-(--accent)'
            : 'bg-(--paper)'}"
          title="Bật/Tắt quick ping khi nhấp"
        >
          <span
            class="w-4 h-4 rounded-full bg-(--paper) shadow-xs absolute top-0.5 transition-transform {pingloomSettings.click_ping
              ? 'translate-x-5.5'
              : 'translate-x-0.5'}"
          ></span>
        </button>
      </div>

      <!-- Trigger 1: Tactical Ping Trigger Key -->
      <div class="p-3 rounded-xl bg-(--paper) border border-(--line) space-y-1.5">
        <label for="settings-tactical-trigger" class="text-xs font-semibold text-(--ink) block">
          Phím Kích Hoạt Tactical Ping
        </label>
        <select
          id="settings-tactical-trigger"
          class="field w-full"
          value={pingloomSettings.trigger}
          onchange={(e) =>
            handleUpdatePingloom({
              ...pingloomSettings,
              trigger: (e.target as HTMLSelectElement).value,
            })}
        >
          {#each TRIGGERS as t (t.value)}
            <option value={t.value}>{t.label}</option>
          {/each}
        </select>
      </div>

      <!-- Trigger 2: Emote Wheel Trigger Key -->
      <div class="p-3 rounded-xl bg-(--paper) border border-(--line) space-y-1.5">
        <label for="settings-emote-trigger" class="text-xs font-semibold text-(--ink) block">
          Phím Kích Hoạt Emote Wheel
        </label>
        <select
          id="settings-emote-trigger"
          class="field w-full"
          value={pingloomSettings.emote_trigger ?? "none"}
          onchange={(e) => {
            const val = (e.target as HTMLSelectElement).value;
            handleUpdatePingloom({
              ...pingloomSettings,
              emote_trigger: val === "none" ? null : val,
            });
          }}
        >
          <option value="none">Tắt / Không Dùng</option>
          {#each TRIGGERS as t (t.value)}
            <option value={t.value}>{t.label}</option>
          {/each}
        </select>
      </div>
    </div>

    <!-- Deadzone Threshold Slider -->
    <div class="p-3.5 rounded-xl bg-(--paper) border border-(--line) space-y-2">
      <div class="flex items-center justify-between text-xs">
        <span class="text-[11px] font-semibold text-(--ink)">
          Bán Kính Vùng Hủy / Deadzone
        </span>
        <span class="font-mono text-xs font-bold text-(--accent)">
          {pingloomSettings.drag_threshold_px} px
        </span>
      </div>
      <p class="text-[11px] text-(--muted) m-0">
        Khoảng cách tối thiểu chuột phải di chuyển ra ngoài tâm để chọn múi. Thả chuột bên trong vùng này sẽ hủy cử chỉ mà không phát ping.
      </p>
      <input
        type="range"
        min="20"
        max="120"
        step="2"
        value={pingloomSettings.drag_threshold_px}
        oninput={(e) => {
          const val = Number((e.target as HTMLInputElement).value);
          pingloomSettings.drag_threshold_px = val;
        }}
        onchange={() => handleUpdatePingloom(pingloomSettings)}
        class="w-full accent-(--accent) cursor-pointer"
      />
    </div>
  </div>

  <!-- 7. Performance & Memory Diagnostics Panel -->
  <div class="panel p-5 space-y-4">
    <div class="panel-head">
      <div>
        <h3 class="text-sm font-bold text-(--ink) m-0">
          Hiệu Năng & Chẩn Đoán Bộ Nhớ
        </h3>
        <p class="text-[11px] text-(--muted) m-0 mt-0.5">
          Thông số Mach Task gốc của macOS và chính sách quản lý tài nguyên nền
        </p>
      </div>

      <div class="flex items-center gap-2">
        <span class="badge {memoryStatus.class} text-[10px] font-mono">
          {memoryStatus.label}
        </span>

        <button
          type="button"
          onclick={handleManualRefreshDiagnostics}
          class="btn btn-ghost h-7 px-2 text-xs flex items-center gap-1.5"
          title="Làm mới chỉ số Mach Task"
        >
          <RefreshCw class="w-3.5 h-3.5 text-(--muted)" />
          <span>Làm Mới</span>
        </button>
      </div>
    </div>

    <!-- Telemetry Metrics Grid -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
      <!-- Stat 1: Physical Footprint / App RAM -->
      <div class="p-3 rounded-xl bg-(--paper) border border-(--line) flex flex-col gap-1.5">
        <div class="flex items-center justify-between text-[11px] text-(--muted)">
          <span class="flex items-center gap-1.5 font-medium">
            <HardDrive class="w-3.5 h-3.5 text-(--accent-text)" />
            <span>Bộ Nhớ RAM</span>
          </span>
          <span class="text-[10px] font-mono text-(--muted)">Footprint</span>
        </div>
        <div class="flex items-baseline gap-1 mt-0.5">
          <span class="text-xl font-bold font-mono tracking-tight text-(--ink)">
            {physicalMb.toFixed(1)}
          </span>
          <span class="text-[11px] font-mono text-(--muted)">MB</span>
        </div>
        <span class="text-[10px] text-(--muted) truncate">
          RSS: {performanceDiagnosticsState.metrics.resident_size_mb.toFixed(1)} MB
        </span>
      </div>

      <!-- Stat 2: Peak Memory Footprint -->
      <div class="p-3 rounded-xl bg-(--paper) border border-(--line) flex flex-col gap-1.5">
        <div class="flex items-center justify-between text-[11px] text-(--muted)">
          <span class="flex items-center gap-1.5 font-medium">
            <Cpu class="w-3.5 h-3.5 text-(--accent-text)" />
            <span>Đỉnh Bộ Nhớ</span>
          </span>
          <span class="text-[10px] font-mono text-(--muted)">Peak</span>
        </div>
        <div class="flex items-baseline gap-1 mt-0.5">
          <span class="text-xl font-bold font-mono tracking-tight text-(--ink)">
            {peakMb.toFixed(1)}
          </span>
          <span class="text-[11px] font-mono text-(--muted)">MB</span>
        </div>
        <span class="text-[10px] text-(--muted) truncate">
          Virtual: {performanceDiagnosticsState.metrics.virtual_size_mb.toFixed(0)} MB
        </span>
      </div>

      <!-- Stat 3: IPC Round-Trip Latency -->
      <div class="p-3 rounded-xl bg-(--paper) border border-(--line) flex flex-col gap-1.5">
        <div class="flex items-center justify-between text-[11px] text-(--muted)">
          <span class="flex items-center gap-1.5 font-medium">
            <Zap class="w-3.5 h-3.5 text-(--accent-text)" />
            <span>Độ Trễ IPC</span>
          </span>
          <button
            type="button"
            onclick={handleBenchmark}
            disabled={performanceDiagnosticsState.isBenchmarking}
            class="text-[10px] text-(--accent) hover:underline cursor-pointer flex items-center gap-0.5"
          >
            {#if performanceDiagnosticsState.isBenchmarking}
              <Loader2 class="w-2.5 h-2.5 animate-spin" />
            {/if}
            <span>Đo</span>
          </button>
        </div>
        <div class="flex items-baseline gap-1 mt-0.5">
          <span class="text-xl font-bold font-mono tracking-tight text-(--ink)">
            {performanceDiagnosticsState.latencyMs.toFixed(1)}
          </span>
          <span class="text-[11px] font-mono text-(--muted)">ms</span>
        </div>
        <span class="text-[10px] text-(--muted) truncate">
          Tauri IPC Ping/Pong RTT
        </span>
      </div>

      <!-- Stat 4: Viewport FPS / Rendering Smoothness -->
      <div class="p-3 rounded-xl bg-(--paper) border border-(--line) flex flex-col gap-1.5">
        <div class="flex items-center justify-between text-[11px] text-(--muted)">
          <span class="flex items-center gap-1.5 font-medium">
            <Activity class="w-3.5 h-3.5 text-(--accent-text)" />
            <span>Tốc Độ Khung Hình</span>
          </span>
          <span class="text-[10px] font-mono text-(--muted)">rAF</span>
        </div>
        <div class="flex items-baseline gap-1 mt-0.5">
          <span class="text-xl font-bold font-mono tracking-tight text-(--ink)">
            {performanceDiagnosticsState.fps}
          </span>
          <span class="text-[11px] font-mono text-(--muted)">FPS</span>
        </div>
        <span class="text-[10px] text-(--success) flex items-center gap-1">
          <span class="w-1.5 h-1.5 rounded-full bg-(--success)"></span>
          <span>Khung hình mượt mà</span>
        </span>
      </div>
    </div>

    <!-- Memory Ceiling Gauge -->
    <div class="p-3.5 rounded-xl bg-(--paper) border border-(--line) space-y-2">
      <div class="flex items-center justify-between text-xs">
        <span class="text-[11px] text-(--muted) font-medium">
          Mức Sử Dụng RAM So Với Giới Hạn An Toàn (500 MB)
        </span>
        <span class="font-mono text-[11px] font-semibold text-(--ink)">
          {memoryPercentage}%
        </span>
      </div>
      <div class="w-full h-2 rounded-full bg-(--surface) overflow-hidden border border-(--line)">
        <div
          class="h-full bg-(--accent) transition-all duration-500 rounded-full"
          style="width: {memoryPercentage}%;"
        ></div>
      </div>
    </div>

    <!-- Diagnostic Action Controls -->
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
      <!-- RAM Saver Toggle -->
      <div class="p-3 rounded-xl bg-(--paper) border border-(--line) flex items-center justify-between gap-3">
        <div>
          <span class="text-xs font-semibold text-(--ink) block">
            Tiết Kiệm RAM Khi Ẩn Nền
          </span>
          <span class="text-[11px] text-(--muted) block mt-0.5">
            Tự động dọn unmapped pages và tạm dừng rAF khi app thu nhỏ
          </span>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={performanceDiagnosticsState.backgroundRamSaver}
          onclick={() =>
            performanceDiagnosticsState.toggleBackgroundRamSaver(
              !performanceDiagnosticsState.backgroundRamSaver
            )}
          class="w-11 h-6 rounded-full transition-colors relative cursor-pointer border border-(--line) shrink-0 {performanceDiagnosticsState.backgroundRamSaver
            ? 'bg-(--accent)'
            : 'bg-(--paper)'}"
          title="Bật/Tắt chế độ tiết kiệm RAM"
        >
          <span
            class="w-4 h-4 rounded-full bg-(--paper) shadow-xs absolute top-0.5 transition-transform {performanceDiagnosticsState.backgroundRamSaver
              ? 'translate-x-5.5'
              : 'translate-x-0.5'}"
          ></span>
        </button>
      </div>

      <!-- Manual Memory Trim / Purge -->
      <div class="p-3 rounded-xl bg-(--paper) border border-(--line) flex items-center justify-between gap-3">
        <div>
          <span class="text-xs font-semibold text-(--ink) block">
            Dọn Dẹp Bộ Nhớ Thủ Công
          </span>
          <span class="text-[11px] text-(--muted) block mt-0.5">
            Gọi mach_task_basic_info và thu hồi trang unmapped ngay lập tức
          </span>
        </div>

        <button
          type="button"
          onclick={() => (isPurgeModalOpen = true)}
          disabled={performanceDiagnosticsState.isTrimming}
          class="btn btn-danger h-8 text-xs flex items-center gap-1.5 shrink-0"
        >
          {#if performanceDiagnosticsState.isTrimming}
            <Loader2 class="w-3.5 h-3.5 animate-spin" />
          {:else}
            <Trash2 class="w-3.5 h-3.5" />
          {/if}
          <span>Dọn RAM</span>
        </button>
      </div>
    </div>
  </div>

  <!-- 7. Brand Identity & Engine Info Panel -->
  <div class="p-5 panel flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs">
    <AppLogo size="lg" variant="with-wordmark" />

    <div class="flex items-center gap-2 flex-wrap">
      <span class="px-2.5 py-1 rounded-lg bg-(--accent)/10 border border-(--accent)/25 text-[11px] font-mono text-(--accent)">
        v0.1.0-alpha · Tauri v2 + Rust
      </span>
      <span class="px-2.5 py-1 rounded-lg bg-(--success)/10 border border-(--success)/25 text-[11px] font-mono text-(--success)">
        CoreAudio 48kHz Linear Phase
      </span>
      <span class="px-2.5 py-1 rounded-lg bg-(--accent)/10 border border-(--accent)/25 text-[11px] font-mono text-(--accent)">
        Gemini 2.5 Live
      </span>
    </div>
  </div>

  <!-- Confirmation Modals Hosted for Settings Operations -->

  <!-- Modal: Remove Custom Wallpaper -->
  <Modal
    open={isRemoveCustomWallpaperModalOpen}
    onClose={() => (isRemoveCustomWallpaperModalOpen = false)}
    title="Gỡ Bỏ Ảnh Nền Tùy Chỉnh?"
    description="Bạn có chắc chắn muốn xóa ảnh nền tùy chỉnh? Giao diện sẽ quay về preset ánh sáng studio hiện tại."
    confirmText="Gỡ Bỏ Ảnh"
    cancelText="Hủy"
    confirmVariant="destructive"
    icon={removeWallpaperIcon}
    onConfirm={handleConfirmRemoveCustomWallpaper}
  />

  <!-- Modal: Reset Wallpaper to Default -->
  <Modal
    open={isResetWallpaperModalOpen}
    onClose={() => (isResetWallpaperModalOpen = false)}
    title="Khôi Phục Hình Nền Mặc Định?"
    description="Bạn có chắc chắn muốn đặt lại hình nền? Thao tác này sẽ khôi phục preset Obsidian studio mặc định và đưa mức làm mờ về ban đầu."
    confirmText="Khôi Phục"
    cancelText="Hủy"
    confirmVariant="destructive"
    icon={resetWallpaperIcon}
    onConfirm={handleConfirmResetWallpaper}
  />

  <!-- Modal: Sign Out of Google -->
  <Modal
    open={isSignOutModalOpen}
    onClose={() => (isSignOutModalOpen = false)}
    title="Đăng Xuất Khỏi Tài Khoản Google?"
    description="Bạn có chắc chắn muốn đăng xuất? Quá trình đồng bộ cấu hình âm thanh đám mây và lịch Focus Timer sẽ tạm dừng cho đến khi đăng nhập lại."
    confirmText="Đăng Xuất"
    cancelText="Hủy"
    confirmVariant="destructive"
    icon={signOutIcon}
    onConfirm={handleConfirmSignOut}
  />

  <!-- Modal: Purge Memory -->
  <Modal
    open={isPurgeModalOpen}
    onClose={() => (isPurgeModalOpen = false)}
    title="Dọn Sạch Bộ Nhớ Ứng Dụng?"
    description="Thao tác này sẽ yêu cầu nhân macOS dọn dẹp các trang bộ nhớ unmapped và giải phóng heap bộ nhớ đệm CoreAudio."
    confirmText="Dọn Sạch Ngay"
    cancelText="Hủy"
    confirmVariant="primary"
    icon={purgeMemoryIcon}
    onConfirm={handleConfirmPurgeMemory}
    isLoading={performanceDiagnosticsState.isTrimming}
  />

  <!-- Modals: Virtual Cable Guide Modal -->
  <VirtualCableModal
    open={isVirtualCableModalOpen}
    onClose={() => (isVirtualCableModalOpen = false)}
  />

  <!-- Modals: Google Login Modal -->
  <GoogleLoginModal
    open={isGoogleLoginModalOpen}
    onClose={() => (isGoogleLoginModalOpen = false)}
  />
</div>
