import { useState, useEffect, useCallback, type FC } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { AgentPetSprite } from "@/components/AgentPetSprite";
import {
  Terminal,
  Bot,
  Code2,
  MousePointer2,
  Sparkles,
  Cpu,
  Activity,
  Zap,
  Heart,
  GripHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AgentSessionDto {
  id: string;
  agent_kind: string;
  state: "registered" | "working" | "waiting" | "done" | "idle";
  project?: string | null;
  message?: string | null;
  model?: string | null;
  tool_name?: string | null;
  tool_summary?: string | null;
  started_at: number;
  last_event_at: number;
}

interface PetCareStateDto {
  xp: number;
  level: number;
  display_level: number;
  progress: number;
  stage_name: string;
  stage_index: number;
  hunger: string;
  tokens_today: number;
  meals_today: number;
  total_tokens: number;
  total_meals: number;
  streak_days: number;
}

const IDLE_BOOST_LINES = [
  "One clean diff can fix the whole afternoon.",
  "Let's grill some bugs.",
  "I miss you. Open a branch for me.",
  "Tiny commit, tiny dopamine.",
  "The build is quiet. Too quiet.",
  "Ship something small. Future you is watching.",
  "Your TODOs are pretending not to see us.",
  "No agents running. The keyboard has entered standby drama.",
  "Turn coffee into code. Carefully.",
  "Open one file. Intimidate it professionally.",
  "The repo is calm. Suspicious, but calm.",
  "Refactor lightly. Leave with dignity.",
];

export const FloatingPetOverlayView: FC = () => {
  const isDesktop =
    typeof window !== "undefined" &&
    (isTauri() ||
      !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);

  const [petSlug, setPetSlug] = useState<string>("code-frenzy-cat");
  const [sessions, setSessions] = useState<AgentSessionDto[]>([]);
  const [_care, setCare] = useState<PetCareStateDto | null>(null);
  const [isInteracting, setIsInteracting] = useState(false);
  const [idleLineIndex, setIdleLineIndex] = useState(0);

  // Sync pet archetype from local storage across windows
  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.documentElement.style.backgroundColor = "transparent";
    document.body.style.background = "transparent";
    document.body.style.backgroundColor = "transparent";
    document.body.classList.remove("bg-[var(--paper)]");
    document.body.style.overflow = "hidden";
    document.body.style.margin = "0";
    document.body.style.padding = "0";

    const updateSlug = () => {
      const saved = localStorage.getItem("rust_sound_pet_slug");
      if (saved && saved !== petSlug) {
        setPetSlug(saved);
      }
    };

    updateSlug();
    window.addEventListener("storage", updateSlug);
    const interval = setInterval(updateSlug, 1000);
    return () => {
      window.removeEventListener("storage", updateSlug);
      clearInterval(interval);
    };
  }, [petSlug]);

  // Window position tracking on desktop in logical coordinates
  useEffect(() => {
    if (!isDesktop) return;
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        unlisten = await win.onMoved(async () => {
          try {
            const factor = await win.scaleFactor();
            const pos = await win.outerPosition();
            const logicalPos = {
              x: Math.round(pos.x / factor),
              y: Math.round(pos.y / factor),
            };
            localStorage.setItem("rust_sound_pet_overlay_pos", JSON.stringify(logicalPos));
          } catch {}
        });
      } catch {}
    })();
    return () => {
      unlisten?.();
    };
  }, [isDesktop]);

  // Periodic polling for real agentpet backend state
  const pollStatus = useCallback(async () => {
    if (!isDesktop) return;
    try {
      const [sessList, careState] = await Promise.all([
        invoke<AgentSessionDto[]>("get_agent_sessions"),
        invoke<PetCareStateDto>("get_pet_care_state"),
      ]);
      if (sessList) setSessions(sessList);
      if (careState) setCare(careState);
    } catch {
      // Ignore poll error
    }
  }, [isDesktop]);

  useEffect(() => {
    pollStatus();
    const interval = setInterval(pollStatus, 1000);
    return () => clearInterval(interval);
  }, [pollStatus]);

  // Cycle idle chatter quotes every 12 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setIdleLineIndex((prev) => (prev + 1) % IDLE_BOOST_LINES.length);
    }, 12000);
    return () => clearInterval(timer);
  }, []);

  // Find most active session
  const activeWorking = sessions.find((s) => s.state === "working");
  const activeWaiting = sessions.find((s) => s.state === "waiting");
  const topSession = activeWorking || activeWaiting || sessions[0];

  const mood: "idle" | "working" | "waiting" | "done" | "celebrate" | "sleepy" =
    isInteracting
      ? "celebrate"
      : activeWorking
      ? "working"
      : activeWaiting
      ? "waiting"
      : sessions.some((s) => s.state === "done")
      ? "done"
      : "idle";

  const projectName = topSession?.project
    ? topSession.project.split("/").filter(Boolean).pop() || "workspace"
    : "workspace";

  const multiplier = Math.max(1, sessions.length || 1);

  // Dynamic bubble activity text from AgentPet logic
  const getActivityText = () => {
    if (isInteracting) return "Purring happily! (+15 XP)";
    if (topSession) {
      const projPrefix = projectName && projectName !== "workspace" ? `[${projectName}] ` : "";
      if (topSession.state === "working") {
        return (
          topSession.tool_summary ||
          topSession.message ||
          (topSession.tool_name ? `${projPrefix}${topSession.tool_name}` : `${projPrefix}Working...`)
        );
      }
      if (topSession.state === "waiting") {
        return topSession.message || `${projPrefix}Waiting for input`;
      }
      if (topSession.state === "done") {
        return `${projPrefix}Task completed!`;
      }
    }
    return IDLE_BOOST_LINES[idleLineIndex % IDLE_BOOST_LINES.length];
  };

  const renderAgentIcon = () => {
    if (!topSession) {
      return <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
    }
    const kind = (topSession.agent_kind || "pi").toLowerCase();
    switch (kind) {
      case "pi":
        return <Terminal className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
      case "claude":
        return <Bot className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
      case "codex":
        return <Code2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
      case "cursor":
        return <MousePointer2 className="w-3.5 h-3.5 text-rose-400 shrink-0" />;
      case "gemini":
        return <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />;
      case "droid":
        return <Cpu className="w-3.5 h-3.5 text-purple-400 shrink-0" />;
      default:
        return <Activity className="w-3.5 h-3.5 text-rose-300 shrink-0" />;
    }
  };

  const handlePetClick = () => {
    setIsInteracting(true);
    if (isDesktop) {
      invoke("feed_pet_action", { action: "pet" }).catch(() => {});
    }
    setTimeout(() => setIsInteracting(false), 1200);
  };

  // Unified drag-or-tap gesture handler
  const handlePointerDown = async (e: React.PointerEvent) => {
    if (e.button !== 0) return; // Only primary button
    const startX = e.clientX;
    const startY = e.clientY;
    const startTime = Date.now();

    const handlePointerUp = (upEvt: PointerEvent) => {
      window.removeEventListener("pointerup", handlePointerUp);
      const dist = Math.hypot(upEvt.clientX - startX, upEvt.clientY - startY);
      const elapsed = Date.now() - startTime;
      // Quick tap without movement -> pet the pet!
      if (dist < 6 && elapsed < 350) {
        handlePetClick();
      }
    };
    window.addEventListener("pointerup", handlePointerUp);

    // In Tauri, calling startDragging on pointer down triggers smooth native OS window drag
    if (isDesktop) {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        await getCurrentWindow().startDragging();
      } catch (err) {
        console.warn("Native startDragging:", err);
      }
    }
  };

  return (
    <div
      onPointerDown={handlePointerDown}
      className="w-full h-screen flex flex-col items-center justify-center select-none bg-transparent overflow-hidden cursor-grab active:cursor-grabbing p-2"
    >
      {/* 1. Status Pill & Speech Bubble from AgentPet */}
      <div className="relative z-20 mb-1 flex flex-col items-center animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1e1e24]/95 border border-white/14 shadow-[0_6px_24px_rgba(0,0,0,0.55)] backdrop-blur-md text-xs font-sans text-slate-100 max-w-[240px]">
          {/* Status Dot / Heart on petting */}
          {isInteracting ? (
            <Heart className="w-3.5 h-3.5 text-rose-400 fill-rose-400 animate-bounce shrink-0" />
          ) : (
            <span className="relative flex h-2.5 w-2.5 items-center justify-center shrink-0">
              <span
                className={cn(
                  "absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping",
                  mood === "working"
                    ? "bg-rose-400"
                    : mood === "waiting"
                    ? "bg-amber-400"
                    : "bg-emerald-400"
                )}
              />
              <span
                className={cn(
                  "relative inline-flex rounded-full h-2 w-2",
                  mood === "working"
                    ? "bg-rose-500 shadow-[0_0_6px_#fb7185]"
                    : mood === "waiting"
                    ? "bg-amber-500"
                    : "bg-emerald-500"
                )}
              />
            </span>
          )}

          {/* Agent Icon */}
          {renderAgentIcon()}

          {/* Dynamic Activity Line / Chatter */}
          <span className="font-semibold text-slate-200 text-[11px] leading-tight truncate">
            {getActivityText()}
          </span>

          {/* Multiplier / Drag Indicator */}
          {topSession ? (
            <span className="px-1.5 py-0.5 rounded-full bg-white/10 text-slate-300 font-mono font-bold text-[9px] leading-none flex items-center gap-0.5 shrink-0">
              <Zap className="w-2.5 h-2.5 text-amber-400 shrink-0" />
              <span>×{multiplier}</span>
            </span>
          ) : (
            <GripHorizontal className="w-3 h-3 text-slate-500 shrink-0 opacity-70" />
          )}
        </div>

        {/* Pointer tail pointing at pet's head */}
        <div className="w-2 h-2 bg-[#1e1e24] border-r border-b border-white/14 transform rotate-45 -mt-1 shadow-sm" />
      </div>

      {/* 2. Authentic Animated Pixel Pet Sprite */}
      <div
        className={cn(
          "relative z-10 flex items-center justify-center transition-transform duration-200",
          isInteracting ? "scale-115 rotate-2" : "hover:scale-105"
        )}
        title="AgentPet Desktop Companion (Click to pet, drag to move)"
      >
        <AgentPetSprite
          slug={petSlug}
          mood={mood}
          size={160}
          className="cursor-pointer drop-shadow-[0_12px_24px_rgba(0,0,0,0.65)]"
        />
      </div>
    </div>
  );
};
