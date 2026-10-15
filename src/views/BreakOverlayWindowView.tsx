import React, { useEffect, useState, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { EyeOff, VolumeX, SkipForward, Sparkles } from "lucide-react";
import { ButtonComponent } from "@/shared/ui";

interface TimerStatus {
  phase: "idle" | "studying" | "warning" | "breaking";
  remaining_seconds: number;
  study_duration: number;
  break_duration: number;
  completed_sessions: number;
  is_ducked: boolean;
  screen_lock_enabled?: boolean;
}

export const BreakOverlayWindowView: React.FC = () => {
  const [status, setStatus] = useState<TimerStatus>({
    phase: "breaking",
    remaining_seconds: 300,
    study_duration: 1500,
    break_duration: 300,
    completed_sessions: 0,
    is_ducked: true,
    screen_lock_enabled: true,
  });

  const isPrimary = useMemo(() => {
    if (typeof window === "undefined") return true;
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has("primary")) {
      return urlParams.get("primary") === "true";
    }
    const win = window as unknown as { __BREAK_OVERLAY_PRIMARY__?: boolean };
    return win.__BREAK_OVERLAY_PRIMARY__ !== false;
  }, []);

  const handleSkip = useCallback(async () => {
    try {
      await invoke("skip_break_timer");
    } catch {
      // Fallback: window close if invoke fails
      window.close();
    }
  }, []);

  // Escape key handler on key overlay window
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleSkip();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSkip]);

  // Periodic poll to keep timer countdown accurate with backend wall clock
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const res = await invoke<TimerStatus>("get_break_timer_status");
        if (active) {
          setStatus(res);
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
  }, []);

  const totalSec = Math.max(0, Math.floor(status.remaining_seconds));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const formattedCountdown = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

  if (!isPrimary) {
    // Secondary monitor: dimmed ambient screen cover
    return (
      <div
        className="fixed inset-0 w-screen h-screen bg-black/85 backdrop-blur-md flex flex-col items-center justify-center select-none text-white pointer-events-auto"
        role="presentation"
      >
        <div className="flex flex-col items-center gap-4 opacity-40">
          <EyeOff className="w-16 h-16 text-rose-300 stroke-[1.5] animate-pulse" />
          <span className="text-sm font-mono tracking-widest uppercase text-white/70">
            Nghỉ ngơi mắt (Màn hình phụ)
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 w-screen h-screen bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-6 select-none text-white pointer-events-auto"
      role="alertdialog"
      aria-modal="true"
      aria-label="Native Eye Rest and Break Screen Lock"
    >
      <div className="flex flex-col items-center text-center max-w-md w-full space-y-6">
        {/* Animated Eye-Rest Icon with Glowing Ring */}
        <div className="relative flex items-center justify-center">
          <span className="absolute -inset-4 rounded-full bg-rose-500/20 blur-xl animate-pulse pointer-events-none" />
          <div className="w-20 h-20 rounded-full bg-white/10 border border-white/20 flex items-center justify-center shadow-2xl relative z-10">
            <EyeOff className="w-10 h-10 text-rose-300 stroke-[1.7] animate-pulse" />
          </div>
        </div>

        {/* Big Monospaced Countdown Clock */}
        <div className="space-y-1">
          <span className="text-7xl sm:text-8xl font-light font-mono tracking-tight text-white tabular-nums drop-shadow-md block">
            {formattedCountdown}
          </span>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-xs text-white/80 font-medium">
            <Sparkles className="w-3.5 h-3.5 text-rose-300" />
            <span>Thời gian nghỉ mắt & phục hồi năng lượng</span>
          </div>
        </div>

        {/* Gentle Advice Message */}
        <div className="space-y-1.5 max-w-xs">
          <h2 className="text-xl font-semibold text-white tracking-tight m-0">
            Nghỉ mắt đi nào
          </h2>
          <p className="text-xs text-white/70 leading-relaxed m-0">
            Rời mắt khỏi màn hình, nhìn ra xa khoảng 6 mét hoặc nhắm mắt thư giãn cơ mặt trong vài phút.
          </p>
        </div>

        {/* Audio Ducking Notice */}
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-xs text-rose-200 font-medium">
          <VolumeX className="w-3.5 h-3.5 text-rose-300 shrink-0" />
          <span>Âm lượng nhạc nền đang tự động giảm còn 15%</span>
        </div>

        {/* Skip / Escape Button */}
        <div className="pt-2 flex flex-col items-center gap-2">
          <ButtonComponent
            variant="outline"
            size="md"
            onClick={handleSkip}
            leftIcon={<SkipForward className="w-4 h-4 text-white" />}
            className="h-10 px-6 rounded-full bg-white/10 hover:bg-white/20 border-white/25 text-white font-semibold text-xs tracking-wide transition-all shadow-lg active:scale-95 cursor-pointer"
          >
            Bỏ qua (Tiếp tục làm việc)
          </ButtonComponent>

          <span className="text-[10px] text-white/50 font-mono">
            Nhấn phím <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/15 text-white/80">Esc</kbd> để bỏ qua nhanh
          </span>
        </div>
      </div>
    </div>
  );
};
