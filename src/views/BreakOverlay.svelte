<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { EyeOff, VolumeX, SkipForward, Sparkles } from "@lucide/svelte";

  interface TimerStatus {
    phase: "idle" | "studying" | "warning" | "breaking";
    remaining_seconds: number;
    study_duration: number;
    break_duration: number;
    completed_sessions: number;
    is_ducked: boolean;
    screen_lock_enabled?: boolean;
  }

  let status = $state<TimerStatus>({
    phase: "breaking",
    remaining_seconds: 300,
    study_duration: 1500,
    break_duration: 300,
    completed_sessions: 0,
    is_ducked: true,
    screen_lock_enabled: true,
  });

  const isPrimary = $derived.by(() => {
    if (typeof window === "undefined") return true;
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has("primary")) {
      return urlParams.get("primary") === "true";
    }
    const win = window as unknown as { __BREAK_OVERLAY_PRIMARY__?: boolean };
    return win.__BREAK_OVERLAY_PRIMARY__ !== false;
  });

  const totalSec = $derived(Math.max(0, Math.floor(status.remaining_seconds)));
  const m = $derived(Math.floor(totalSec / 60));
  const s = $derived(totalSec % 60);
  const formattedCountdown = $derived(`${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);

  async function handleSkip() {
    try {
      await invoke("skip_break_timer");
      window.close();
    } catch {
      // Fallback: window close if invoke fails
      window.close();
    }
  }

  // Escape key handler on key overlay window
  $effect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleSkip();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  // Periodic poll to keep timer countdown accurate with backend wall clock
  $effect(() => {
    let active = true;
    const poll = async () => {
      try {
        const res = await invoke<TimerStatus>("get_break_timer_status");
        if (active) {
          status = res;
          if (res.phase !== "breaking") {
            // Break completed or stopped
            window.close();
          }
        }
      } catch {
        // Ignored
      }
    };

    poll();
    const interval = setInterval(poll, 500);
    return () => {
      active = false;
      clearInterval(interval);
    };
  });
</script>

{#if !isPrimary}
  <!-- Secondary monitor: dimmed ambient screen cover -->
  <div
    class="fixed inset-0 w-screen h-screen bg-black/85 backdrop-blur-md flex flex-col items-center justify-center select-none text-white pointer-events-auto"
    role="presentation"
  >
    <div class="flex flex-col items-center gap-4 opacity-40">
      <EyeOff size={64} class="w-16 h-16 text-rose-300 stroke-[1.5] animate-pulse" />
      <span class="text-sm font-mono tracking-widest uppercase text-white/70">
        Nghỉ ngơi mắt (Màn hình phụ)
      </span>
    </div>
  </div>
{:else}
  <div
    class="fixed inset-0 w-screen h-screen bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-6 select-none text-white pointer-events-auto"
    role="alertdialog"
    aria-modal="true"
    aria-label="Native Eye Rest and Break Screen Lock"
  >
    <div class="flex flex-col items-center text-center max-w-md w-full space-y-6">
      <!-- Animated Eye-Rest Icon with Glowing Ring -->
      <div class="relative flex items-center justify-center">
        <span class="absolute -inset-4 rounded-full bg-rose-500/20 blur-xl animate-pulse pointer-events-none"></span>
        <div class="w-20 h-20 rounded-full bg-white/10 border border-white/20 flex items-center justify-center shadow-2xl relative z-10">
          <EyeOff size={40} class="w-10 h-10 text-rose-300 stroke-[1.7] animate-pulse" />
        </div>
      </div>

      <!-- Big Monospaced Countdown Clock -->
      <div class="space-y-1">
        <span class="text-7xl sm:text-8xl font-light font-mono tracking-tight text-white tabular-nums drop-shadow-md block">
          {formattedCountdown}
        </span>
        <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-xs text-white/80 font-medium">
          <Sparkles size={14} class="w-3.5 h-3.5 text-rose-300" />
          <span>Thời gian nghỉ mắt & phục hồi năng lượng</span>
        </div>
      </div>

      <!-- Gentle Advice Message -->
      <div class="space-y-1.5 max-w-xs">
        <h2 class="text-xl font-semibold text-white tracking-tight m-0">
          Nghỉ mắt đi nào
        </h2>
        <p class="text-xs text-white/70 leading-relaxed m-0">
          Rời mắt khỏi màn hình, nhìn ra xa khoảng 6 mét hoặc nhắm mắt thư giãn cơ mặt trong vài phút.
        </p>
      </div>

      <!-- Audio Ducking Notice -->
      <div class="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-xs text-rose-200 font-medium">
        <VolumeX size={14} class="w-3.5 h-3.5 text-rose-300 shrink-0" />
        <span>Âm lượng nhạc nền đang tự động giảm còn 15%</span>
      </div>

      <!-- Skip / Escape Button -->
      <div class="pt-2 flex flex-col items-center gap-2">
        <button
          type="button"
          onclick={handleSkip}
          class="btn h-10 px-6 rounded-full bg-white/10 hover:bg-white/20 border-white/25 text-white font-semibold text-xs tracking-wide transition-all shadow-lg active:scale-95 cursor-pointer inline-flex items-center justify-center gap-2"
        >
          <SkipForward size={16} class="w-4 h-4 text-white" />
          <span>Bỏ qua (Tiếp tục làm việc)</span>
        </button>

        <span class="text-[10px] text-white/50 font-mono">
          Nhấn phím <kbd class="px-1.5 py-0.5 rounded bg-white/10 border border-white/15 text-white/80">Esc</kbd> để bỏ qua nhanh
        </span>
      </div>
    </div>
  </div>
{/if}
