import { useState, useEffect, useCallback, type FC } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { AgentPetSprite } from "@/components/AgentPetSprite";
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

export const FloatingPetOverlayView: FC = () => {
  const isDesktop =
    typeof window !== "undefined" &&
    (isTauri() ||
      !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);

  const [petSlug, setPetSlug] = useState<string>("code-frenzy-cat");
  const [sessions, setSessions] = useState<AgentSessionDto[]>([]);
  const [_care, setCare] = useState<PetCareStateDto | null>(null);
  const [isInteracting, setIsInteracting] = useState(false);

  useEffect(() => {
    // Set transparent background on HTML and body
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    document.body.style.overflow = "hidden";
    document.body.style.margin = "0";
    document.body.style.padding = "0";

    const saved = localStorage.getItem("rust_sound_pet_slug");
    if (saved) setPetSlug(saved);
  }, []);

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

  // Derive display values matching screenshot: ● π Ui · Working ×5
  const agentSymbol = topSession
    ? topSession.agent_kind === "pi"
      ? "π"
      : topSession.agent_kind === "claude"
      ? "CL"
      : topSession.agent_kind === "codex"
      ? "CX"
      : topSession.agent_kind === "cursor"
      ? "CR"
      : "AG"
    : "π";

  const projectName = topSession?.project
    ? topSession.project.split("/").filter(Boolean).pop() || "Ui"
    : "Ui";

  const stateLabel = topSession
    ? topSession.state === "working"
      ? "Working"
      : topSession.state === "waiting"
      ? "Waiting"
      : topSession.state === "done"
      ? "Done"
      : "Idle"
    : "Working";

  const multiplier = Math.max(1, sessions.length || 5);

  const handlePetClick = () => {
    setIsInteracting(true);
    if (isDesktop) {
      invoke("feed_pet_action", { action: "pet" }).catch(() => {});
    }
    setTimeout(() => setIsInteracting(false), 1200);
  };

  return (
    <div
      data-tauri-drag-region
      className="w-full h-screen flex flex-col items-center justify-center select-none bg-transparent overflow-hidden cursor-grab active:cursor-grabbing p-2"
    >
      {/* 1. Status Pill matching user's screenshot: ● π Ui · Working ×5 */}
      <div
        data-tauri-drag-region
        className="relative z-20 mb-1 flex flex-col items-center animate-in fade-in zoom-in-95 duration-200"
      >
        <div
          data-tauri-drag-region
          className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#1e1e24]/95 border border-white/12 shadow-[0_4px_20px_rgba(0,0,0,0.5)] backdrop-blur-md text-xs font-sans text-slate-100"
        >
          {/* Pulsing Status Dot */}
          <span className="relative flex h-2.5 w-2.5 items-center justify-center">
            <span
              className={cn(
                "absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping",
                mood === "working"
                  ? "bg-sky-400"
                  : mood === "waiting"
                  ? "bg-amber-400"
                  : "bg-emerald-400"
              )}
            />
            <span
              className={cn(
                "relative inline-flex rounded-full h-2 w-2",
                mood === "working"
                  ? "bg-sky-500 shadow-[0_0_6px_#38bdf8]"
                  : mood === "waiting"
                  ? "bg-amber-500"
                  : "bg-emerald-500"
              )}
            />
          </span>

          {/* Agent Symbol */}
          <span className="font-bold text-sky-400 font-mono text-[13px] leading-none">
            {agentSymbol}
          </span>

          {/* Project Name */}
          <span className="font-semibold text-slate-200 text-[11px] leading-none truncate max-w-[80px]">
            {projectName}
          </span>

          <span className="text-slate-500 font-bold leading-none">·</span>

          {/* State Label */}
          <span className="font-semibold text-slate-200 text-[11px] leading-none">
            {stateLabel}
          </span>

          {/* Session / Multiplier Badge */}
          <span className="px-1.5 py-0.5 rounded-full bg-white/10 text-slate-300 font-mono font-bold text-[9px] leading-none">
            ×{multiplier}
          </span>
        </div>

        {/* Small pointer tail pointing at pet's head */}
        <div
          data-tauri-drag-region
          className="w-2 h-2 bg-[#1e1e24] border-r border-b border-white/12 transform rotate-45 -mt-1 shadow-sm"
        />
      </div>

      {/* 2. Authentic Animated Pixel Pet Sprite */}
      <div
        data-tauri-drag-region
        onClick={handlePetClick}
        className={cn(
          "relative z-10 flex items-center justify-center transition-transform duration-200",
          isInteracting ? "scale-110 rotate-2" : "hover:scale-105"
        )}
        title="AgentPet Desktop Companion (Click to pet, drag to move)"
      >
        <AgentPetSprite
          slug={petSlug}
          mood={mood}
          size={160}
          className="cursor-pointer drop-shadow-[0_12px_24px_rgba(0,0,0,0.6)]"
        />
      </div>
    </div>
  );
};
