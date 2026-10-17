<script lang="ts">
  import { untrack } from "svelte";
  import { readPetPreferences, subscribePetPreferences, writePetPreference, petOverlayWindowSize } from "@/lib/petPreferences";
  import { toastState } from "@/lib/toast.svelte";
  import ToastHost from "@/components/ui/ToastHost.svelte";
  import { invoke, isTauri } from "@tauri-apps/api/core";
  import AgentPetSprite from "@/components/AgentPetSprite.svelte";
  import {
    playPetDoneChime,
    playPetWaitingChime,
    sendDesktopNotification,
    shouldTriggerPetAlert,
  } from "@/lib/petAudio";
  import type { AgentSessionDto, PetCareStateDto } from "@/components/pet/types";
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
    X,
  } from "@lucide/svelte";

  interface OverlayParticle {
    id: number;
    type: "heart" | "sparkle";
    x: number;
    y: number;
    size: number;
    color: string;
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

  const isDesktop =
    typeof window !== "undefined" &&
    (isTauri() ||
      !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);

  let petSlug = $state<string>("work-blue-cat");
  let petSize = $state(readPetPreferences().size);
  $effect(() => subscribePetPreferences(() => { petSize = readPetPreferences().size; }));
  let resizeError = $state("");
  $effect(() => {
    const size = petSize;
    if (!isDesktop) return;
    let active = true;
    (async () => {
      try {
        const { getCurrentWindow, LogicalSize } = await import("@tauri-apps/api/window");
        if (!active) return;
        const bounds = petOverlayWindowSize(size);
        // setSize retains the saved logical top-left; no new window or routing changes.
        await getCurrentWindow().setSize(new LogicalSize(bounds.width, bounds.height));
        if (active) resizeError = "";
      } catch (error) {
        if (active) {
          resizeError = `Could not resize desktop companion: ${String(error)}`;
          toastState.error(resizeError);
        }
      }
    })();
    return () => { active = false; };
  });
  function resizePet(size: number) {
    try { writePetPreference("size", size); toastState.info("Pet size preference saved"); }
    catch (error) { toastState.error(`Could not save pet size: ${String(error)}`); }
  }
  let showActionMenu = $state<boolean>(false);
  let sessions = $state<AgentSessionDto[]>([]);
  let care = $state<PetCareStateDto | null>(null);
  let isInteracting = $state<boolean>(false);
  let idleLineIndex = $state<number>(0);

  // Celebrate burst & multi-agent bubble mode states
  let isCelebrating = $state<boolean>(false);
  let bubbleMode = $state<"carousel" | "compact">("carousel");
  let carouselIndex = $state<number>(0);
  let currentTimestampSec = $state<number>(Math.floor(Date.now() / 1000));
  let particles = $state<OverlayParticle[]>([]);

  let nextParticleId = 0;
  let celebrateTimer: ReturnType<typeof setTimeout> | null = null;
  const prevSessionStates = new Map<string, string>();

  $effect(() => {
    // Track care state for future overlay progression indicators and avoid noUnusedLocals
    void care;
  });

  // Load persisted bubble mode
  $effect(() => {
    if (typeof localStorage !== "undefined") {
      const savedMode = localStorage.getItem("rust_sound_pet_bubble_mode");
      if (savedMode === "carousel" || savedMode === "compact") {
        bubbleMode = savedMode;
      }
    }
  });

  // Second-level ticker for elapsed calculation
  $effect(() => {
    const timer = setInterval(() => {
      currentTimestampSec = Math.floor(Date.now() / 1000);
    }, 1000);
    return () => clearInterval(timer);
  });

  // Sync pet archetype from local storage across windows and style document body
  $effect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.style.background = "transparent";
      document.documentElement.style.backgroundColor = "transparent";
      document.body.style.background = "transparent";
      document.body.style.backgroundColor = "transparent";
      document.body.classList.remove("bg-(--paper)");
      document.body.style.overflow = "hidden";
      document.body.style.margin = "0";
      document.body.style.padding = "0";
    }

    const updateSlug = () => {
      if (typeof localStorage === "undefined") return;
      const saved = localStorage.getItem("rust_sound_pet_slug");
      const current = untrack(() => petSlug);
      if (saved && saved !== current) {
        petSlug = saved;
      }
    };

    updateSlug();
    window.addEventListener("storage", updateSlug);
    const interval = setInterval(updateSlug, 1000);
    return () => {
      window.removeEventListener("storage", updateSlug);
      clearInterval(interval);
    };
  });

  // Window position tracking with getCurrentWindow().onMoved() and logical position calculation
  $effect(() => {
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
  });

  function triggerCelebrationBurst() {
    isCelebrating = true;
    spawnParticles("sparkle", 8);
    if (celebrateTimer) clearTimeout(celebrateTimer);
    celebrateTimer = setTimeout(() => {
      isCelebrating = false;
    }, 3000);
  }

  function spawnParticles(type: "heart" | "sparkle", count: number = 6) {
    const newItems: OverlayParticle[] = [];
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const dist = 24 + Math.random() * 36;
      const x = Math.cos(angle) * dist;
      const y = -14 - Math.random() * 40;
      const size = 12 + Math.floor(Math.random() * 6);
      const color =
        type === "heart"
          ? ["text-rose-400", "text-pink-400", "text-red-400"][Math.floor(Math.random() * 3)]
          : ["text-amber-300", "text-yellow-400", "text-emerald-300", "text-cyan-300"][
              Math.floor(Math.random() * 4)
            ];

      newItems.push({
        id: ++nextParticleId,
        type,
        x,
        y,
        size,
        color,
      });
    }
    particles = [...particles, ...newItems];
    setTimeout(() => {
      particles = particles.filter((p) => !newItems.some((n) => n.id === p.id));
    }, 1000);
  }

  // Periodic polling for real agentpet backend state
  $effect(() => {
    if (!isDesktop) return;
    let active = true;

    const pollStatus = async () => {
      try {
        const [sessList, careState] = await Promise.all([
          invoke<AgentSessionDto[]>("get_agent_sessions"),
          invoke<PetCareStateDto>("get_pet_care_state"),
        ]);
        if (active) {
          if (sessList) {
            const nowSec = Date.now() / 1000;
            let shouldBurst = false;

            for (const s of sessList) {
              const prevState = prevSessionStates.get(s.id);
              const eventSec = s.last_event_at > 1e11 ? s.last_event_at / 1000 : s.last_event_at;
              const isRecentDone = !prevState && s.state === "done" && Math.abs(nowSec - eventSec) <= 3;

              if ((prevState === "working" && s.state === "done") || isRecentDone) {
                shouldBurst = true;
              }

              // Audio & notification triggers on state transition
              if (prevState && prevState !== s.state) {
                const agentName = s.agent_kind
                  ? s.agent_kind.charAt(0).toUpperCase() + s.agent_kind.slice(1)
                  : "Agent";
                if (s.state === "waiting") {
                  if (shouldTriggerPetAlert(s.id, "waiting")) {
                    playPetWaitingChime();
                    sendDesktopNotification(
                      `[${agentName}] needs input`,
                      s.message || "Waiting for your input"
                    );
                  }
                } else if (s.state === "done") {
                  if (shouldTriggerPetAlert(s.id, "done")) {
                    playPetDoneChime();
                    sendDesktopNotification(`[${agentName}] finished`, "Task completed");
                  }
                }
              }

              prevSessionStates.set(s.id, s.state);
            }

            if (shouldBurst && !isCelebrating) {
              triggerCelebrationBurst();
            }

            sessions = sessList;
          }
          if (careState) care = careState;
        }
      } catch {
        // Ignore poll error
      }
    };

    pollStatus();
    const interval = setInterval(pollStatus, 1000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  });

  // Idle line chatter interval (12000ms) with cleanup
  $effect(() => {
    const timer = setInterval(() => {
      idleLineIndex = (untrack(() => idleLineIndex) + 1) % IDLE_BOOST_LINES.length;
    }, 12000);
    return () => clearInterval(timer);
  });

  // Active sessions collection
  const activeSessions = $derived(
    sessions.filter((s) => s.state === "working" || s.state === "waiting" || s.state === "done")
  );

  // Multi-agent carousel rotation (every 3 seconds)
  $effect(() => {
    const count = activeSessions.length;
    if (count <= 1 || bubbleMode !== "carousel") return;

    const timer = setInterval(() => {
      carouselIndex = (untrack(() => carouselIndex) + 1) % count;
    }, 3000);

    return () => clearInterval(timer);
  });

  // Derived state: topSession, displayedSession, mood, projectName, multiplier, activityText
  const topSession = $derived(
    sessions.find((s) => s.state === "working") ||
      sessions.find((s) => s.state === "waiting") ||
      sessions[0]
  );

  const displayedSession = $derived(
    activeSessions.length > 0
      ? activeSessions[carouselIndex % activeSessions.length]
      : topSession
  );

  const mood = $derived<"idle" | "working" | "reading" | "waiting" | "done" | "celebrate" | "sleepy">(
    isInteracting || isCelebrating
      ? "celebrate"
      : sessions.some((s) => s.state === "working")
      ? (() => {
          const active = sessions.find((s) => s.state === "working");
          const tool = (active?.tool_name || "").toLowerCase();
          if (
            tool.includes("read") ||
            tool.includes("grep") ||
            tool.includes("find") ||
            tool.includes("search") ||
            tool.includes("inspect")
          ) {
            return "reading";
          }
          return "working";
        })()
      : sessions.some((s) => s.state === "waiting")
      ? "waiting"
      : sessions.some((s) => s.state === "done")
      ? "done"
      : "idle"
  );

  const projectName = $derived(
    topSession?.project
      ? topSession.project.split("/").filter(Boolean).pop() || "workspace"
      : "workspace"
  );

  const multiplier = $derived(Math.max(1, sessions.length || 1));

  const activityText = $derived.by(() => {
    if (isInteracting) return "Purring happily! (+15 XP)";
    if (isCelebrating) return "Milestone celebration! (+25 XP)";
    const current = displayedSession || topSession;
    if (current) {
      const proj = current.project
        ? current.project.split("/").filter(Boolean).pop() || projectName
        : projectName;
      const projPrefix = proj && proj !== "workspace" ? `[${proj}] ` : "";
      if (current.state === "working") {
        return (
          current.tool_summary ||
          current.message ||
          (current.tool_name ? `${projPrefix}${current.tool_name}` : `${projPrefix}Working...`)
        );
      }
      if (current.state === "waiting") {
        return current.message || `${projPrefix}Waiting for input`;
      }
      if (current.state === "done") {
        return `${projPrefix}Task completed!`;
      }
    }
    return IDLE_BOOST_LINES[idleLineIndex % IDLE_BOOST_LINES.length];
  });

  function formatElapsed(startedAt: number): string {
    if (!startedAt) return "0:00";
    const startSec = startedAt > 1e11 ? Math.floor(startedAt / 1000) : startedAt;
    const elapsed = Math.max(0, currentTimestampSec - startSec);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  function toggleBubbleMode(e?: Event) {
    e?.stopPropagation();
    bubbleMode = bubbleMode === "carousel" ? "compact" : "carousel";
    try {
      localStorage.setItem("rust_sound_pet_bubble_mode", bubbleMode);
    } catch {}
  }

  function handlePetClick() {
    isInteracting = true;
    spawnParticles("heart", 6);
    if (isDesktop) {
      invoke("feed_pet_action", { action: "pet" }).catch(() => {});
    }
    setTimeout(() => {
      isInteracting = false;
    }, 1200);
  }

  // Pointer down handler calling getCurrentWindow().startDragging() in desktop mode and handling quick tap (<6px, <350ms) to trigger feed_pet_action
  async function handlePointerDown(e: PointerEvent) {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button, input, select, a")) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const startTime = Date.now();
    let dragged = false;
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cleanup);
    };
    const move = async (event: PointerEvent) => {
      if (dragged || Math.hypot(event.clientX - startX, event.clientY - startY) < 6) return;
      dragged = true;
      cleanup(); // Native dragging may consume pointerup.
      if (isDesktop) {
        try {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          await getCurrentWindow().startDragging();
        } catch (error) {
          console.warn("Could not drag desktop companion:", error);
        }
      }
    };
    const up = () => {
      cleanup();
      if (!dragged && Date.now() - startTime < 350) handlePetClick();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cleanup);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  onpointerdown={handlePointerDown}
  class="w-full h-screen flex flex-col items-center justify-center select-none bg-transparent overflow-hidden cursor-grab active:cursor-grabbing p-2"
>
  {#if resizeError}
    <p role="alert" class="absolute top-2 inset-x-2 text-xs text-(--error) bg-(--paper) border border-(--line) rounded-lg p-2 z-50">{resizeError}</p>
  {/if}
  <!-- 1. Status Pill & Speech Bubble with Multi-Agent Carousel & Compact Modes -->
  <div class="relative z-20 mb-1 flex flex-col items-center animate-in fade-in zoom-in-95 duration-200">
    {#if bubbleMode === "compact"}
      <!-- Compact Mode: Dot indicator, elapsed counter, and agent icon -->
      <button
        type="button"
        onclick={toggleBubbleMode}
        class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-(--core) border border-(--input-line) shadow-md text-xs font-sans text-(--ink) cursor-pointer hover:bg-(--surface) transition-colors"
        title="Compact mode. Click to expand multi-agent carousel."
      >
        <!-- Status Dot / Heart on petting -->
        {#if isInteracting}
          <Heart size={12} class="w-3 h-3 text-rose-400 fill-rose-400 animate-bounce shrink-0" />
        {:else}
          <span class="relative flex h-2 w-2 items-center justify-center shrink-0">
            <span
              class="relative inline-flex rounded-full h-2 w-2 {displayedSession?.state === 'working'
                ? 'bg-rose-500 shadow-[0_0_6px_var(--accent)]'
                : displayedSession?.state === 'waiting'
                ? 'bg-amber-500'
                : isCelebrating
                ? 'bg-amber-400 animate-ping'
                : 'bg-emerald-500'}"
            ></span>
          </span>
        {/if}

        <!-- Agent Icon -->
        {#if !displayedSession}
          <Sparkles size={12} class="w-3 h-3 text-amber-400 shrink-0" />
        {:else}
          {@const kind = (displayedSession.agent_kind || "pi").toLowerCase()}
          {#if kind === "pi"}
            <Terminal size={12} class="w-3 h-3 text-emerald-400 shrink-0" />
          {:else if kind === "claude"}
            <Bot size={12} class="w-3 h-3 text-amber-400 shrink-0" />
          {:else if kind === "codex"}
            <Code2 size={12} class="w-3 h-3 text-emerald-400 shrink-0" />
          {:else if kind === "cursor"}
            <MousePointer2 size={12} class="w-3 h-3 text-rose-400 shrink-0" />
          {:else if kind === "gemini"}
            <Sparkles size={12} class="w-3 h-3 text-indigo-400 shrink-0" />
          {:else if kind === "droid"}
            <Cpu size={12} class="w-3 h-3 text-purple-400 shrink-0" />
          {:else}
            <Activity size={12} class="w-3 h-3 text-rose-300 shrink-0" />
          {/if}
        {/if}

        <!-- Elapsed Counter -->
        <span class="font-mono font-semibold text-[10px] text-(--ink) shrink-0">
          {displayedSession ? formatElapsed(displayedSession.started_at) : "0:00"}
        </span>

        <!-- Multi-agent Dot Strip (if > 1 active session) -->
        {#if activeSessions.length > 1}
          <div class="flex items-center gap-1 pl-1 border-l border-(--shell-line) shrink-0">
            {#each activeSessions as s, idx}
              <span
                class="h-1.5 w-1.5 rounded-full transition-all {idx === carouselIndex % activeSessions.length
                  ? 'ring-1 ring-(--ink) scale-125 '
                  : ''}{s.state === 'working' ? 'bg-rose-400' : s.state === 'waiting' ? 'bg-amber-400' : 'bg-emerald-400'}"
              ></span>
            {/each}
          </div>
        {/if}
      </button>
    {:else}
      <!-- Carousel Mode: Rotating every 3s through active sessions -->
      <div class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-(--core) border border-(--input-line) shadow-md text-xs font-sans text-(--ink) max-w-72">
        <!-- Status Dot / Heart on petting -->
        {#if isInteracting}
          <Heart size={14} class="w-3.5 h-3.5 text-rose-400 fill-rose-400 animate-bounce shrink-0" />
        {:else}
          <span class="relative flex h-2.5 w-2.5 items-center justify-center shrink-0">
            <span
              class="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping {mood === 'working'
                ? 'bg-rose-400'
                : mood === 'waiting'
                ? 'bg-amber-400'
                : isCelebrating
                ? 'bg-amber-300'
                : 'bg-emerald-400'}"
            ></span>
            <span
              class="relative inline-flex rounded-full h-2 w-2 {mood === 'working'
                ? 'bg-rose-500 shadow-[0_0_6px_var(--accent)]'
                : mood === 'waiting'
                ? 'bg-amber-500'
                : isCelebrating
                ? 'bg-amber-400'
                : 'bg-emerald-500'}"
            ></span>
          </span>
        {/if}

        <!-- Agent Icon -->
        {#if !displayedSession}
          <Sparkles size={14} class="w-3.5 h-3.5 text-amber-400 shrink-0" />
        {:else}
          {@const kind = (displayedSession.agent_kind || "pi").toLowerCase()}
          {#if kind === "pi"}
            <Terminal size={14} class="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          {:else if kind === "claude"}
            <Bot size={14} class="w-3.5 h-3.5 text-amber-400 shrink-0" />
          {:else if kind === "codex"}
            <Code2 size={14} class="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          {:else if kind === "cursor"}
            <MousePointer2 size={14} class="w-3.5 h-3.5 text-rose-400 shrink-0" />
          {:else if kind === "gemini"}
            <Sparkles size={14} class="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          {:else if kind === "droid"}
            <Cpu size={14} class="w-3.5 h-3.5 text-purple-400 shrink-0" />
          {:else}
            <Activity size={14} class="w-3.5 h-3.5 text-rose-300 shrink-0" />
          {/if}
        {/if}

        <!-- Dynamic Activity Line / Chatter -->
        <span class="font-semibold text-(--ink) text-[11px] leading-tight truncate">
          {activityText}
        </span>

        <!-- Elapsed Counter for active session -->
        {#if displayedSession && (displayedSession.state === 'working' || displayedSession.state === 'waiting')}
          <span class="font-mono text-[9px] text-(--muted) shrink-0">
            {formatElapsed(displayedSession.started_at)}
          </span>
        {/if}

        <!-- Multi-agent Carousel indicator or Multiplier -->
        {#if activeSessions.length > 1}
          <button
            type="button"
            onclick={toggleBubbleMode}
            class="px-1.5 py-0.5 rounded-full bg-(--shell) hover:bg-(--surface) text-(--ink) font-mono font-bold text-[9px] leading-none flex items-center gap-0.5 shrink-0 transition-colors cursor-pointer"
            title="Carousel ({carouselIndex % activeSessions.length + 1}/{activeSessions.length}). Click to switch to compact mode."
          >
            <Zap size={10} class="w-2.5 h-2.5 text-amber-400 shrink-0" />
            <span>{(carouselIndex % activeSessions.length) + 1}/{activeSessions.length}</span>
          </button>
        {:else if topSession}
          <span
            class="px-1.5 py-0.5 rounded-full bg-(--shell) text-(--ink) font-mono font-bold text-[9px] leading-none flex items-center gap-0.5 shrink-0"
          >
            <Zap size={10} class="w-2.5 h-2.5 text-amber-400 shrink-0" />
            <span>×{multiplier}</span>
          </span>
        {:else}
          <GripHorizontal size={12} class="w-3 h-3 text-(--muted) shrink-0" />
        {/if}
      </div>
    {/if}

    <!-- Pointer tail pointing at pet's head -->
    <div class="w-2 h-2 bg-(--core) border-r border-b border-(--input-line) transform rotate-45 -mt-1"></div>
  </div>

  <!-- 2. Authentic Animated Pixel Pet Sprite & Floating Particles FX -->
  <div
    class="relative z-10 flex items-center justify-center transition-transform duration-200 {isInteracting
      ? 'scale-115 rotate-2'
      : isCelebrating
      ? 'scale-110'
      : 'hover:scale-105'}"
    title="AgentPet Desktop Companion (Click to pet, drag to move)"
  >
    <!-- Floating Particles FX (Hearts / Sparkles) -->
    {#each particles as p (p.id)}
      <div
        class="pointer-events-none absolute z-30 transition-all duration-1000 ease-out"
        style="--px: {p.x}px; --py: {p.y}px; animation: petParticleFloat 1s ease-out forwards;"
      >
        {#if p.type === "heart"}
          <Heart size={p.size} class="{p.color} fill-current drop-shadow-md animate-pulse" />
        {:else}
          <Sparkles size={p.size} class="{p.color} fill-current drop-shadow-md animate-spin" />
        {/if}
      </div>
    {/each}

    <div
      role="button"
      tabindex="0"
      oncontextmenu={(e) => {
        e.preventDefault();
        if (isDesktop) {
          invoke("toggle_pet_popover", {
            x: Math.max(20, e.screenX - 160),
            y: Math.max(30, e.screenY - 260),
          }).catch(() => {
            showActionMenu = !showActionMenu;
          });
        } else {
          showActionMenu = !showActionMenu;
        }
      }}
    >
      <AgentPetSprite
        slug={petSlug}
        {mood}
        size={petSize}
        class="pet-silhouette cursor-pointer"
      />
    </div>

    <!-- Right-Click Quick Care Menu & Size Switcher -->
    {#if showActionMenu}
      <div
        class="absolute -top-32 left-1/2 -translate-x-1/2 z-40 bg-(--core) border border-(--line) shadow-2xl rounded-2xl p-2 flex flex-col gap-1.5 min-w-44 backdrop-blur-md animate-in fade-in zoom-in-95 select-none"
      >
        <div class="flex items-center justify-between pb-1 border-b border-(--line) px-1 text-[10px] font-bold text-(--muted)">
          <span>Care Actions</span>
          <button
            type="button"
            onclick={() => (showActionMenu = false)}
            class="hover:text-(--ink) cursor-pointer"
            aria-label="Close care actions"
          >
            <X size={12} />
          </button>
        </div>

        <div class="grid grid-cols-2 gap-1 text-[10px]">
          <button
            type="button"
            onclick={() => {
              handlePetClick();
              showActionMenu = false;
            }}
            class="px-2 py-1 rounded-lg bg-(--surface) hover:bg-(--paper) text-(--ink) font-semibold flex items-center gap-1 cursor-pointer"
          >
            <Heart size={12} class="text-rose-400" />
            <span>Pet (+15)</span>
          </button>
          <button
            type="button"
            onclick={() => {
              if (isDesktop) invoke("feed_pet_action", { action: "coffee" }).catch(() => {});
              spawnParticles("sparkle", 5);
              showActionMenu = false;
            }}
            class="px-2 py-1 rounded-lg bg-(--surface) hover:bg-(--paper) text-(--ink) font-semibold flex items-center gap-1 cursor-pointer"
          >
            <Zap size={12} class="text-amber-400" />
            <span>Coffee (+25)</span>
          </button>
          <button
            type="button"
            onclick={() => {
              if (isDesktop) invoke("feed_pet_action", { action: "tuna" }).catch(() => {});
              spawnParticles("heart", 5);
              showActionMenu = false;
            }}
            class="px-2 py-1 rounded-lg bg-(--surface) hover:bg-(--paper) text-(--ink) font-semibold flex items-center gap-1 cursor-pointer"
          >
            <Sparkles size={12} class="text-teal-400" />
            <span>Tuna (+20)</span>
          </button>
          <button
            type="button"
            onclick={() => {
              if (isDesktop) invoke("feed_pet_action", { action: "rest" }).catch(() => {});
              showActionMenu = false;
            }}
            class="px-2 py-1 rounded-lg bg-(--surface) hover:bg-(--paper) text-(--ink) font-semibold flex items-center gap-1 cursor-pointer"
          >
            <Activity size={12} class="text-indigo-400" />
            <span>Rest (+10)</span>
          </button>
        </div>

        <div class="pt-1 border-t border-(--line) flex items-center justify-between px-1 text-[10px] text-(--muted)">
          <span>Scale</span>
          <div class="flex items-center gap-1">
            <button
              type="button"
              onclick={() => resizePet(140)}
              class="px-1.5 py-0.5 rounded {petSize === 140 ? 'bg-(--accent) text-black font-bold' : 'hover:text-(--ink)'} cursor-pointer"
            >
              S
            </button>
            <button
              type="button"
              onclick={() => resizePet(180)}
              class="px-1.5 py-0.5 rounded {petSize === 180 ? 'bg-(--accent) text-black font-bold' : 'hover:text-(--ink)'} cursor-pointer"
            >
              M
            </button>
            <button
              type="button"
              onclick={() => resizePet(240)}
              class="px-1.5 py-0.5 rounded {petSize === 240 ? 'bg-(--accent) text-black font-bold' : 'hover:text-(--ink)'} cursor-pointer"
            >
              L
            </button>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<ToastHost />

<style>
  /* Follow each animated frame's alpha, not the rectangular sprite canvas.
     A light keyline and dark shadow stay visible over arbitrary desktop colors. */
  :global(.pet-silhouette canvas) {
    filter: drop-shadow(1px 0 0 #fff) drop-shadow(-1px 0 0 #fff)
      drop-shadow(0 1px 0 #fff) drop-shadow(0 -1px 0 #fff)
      drop-shadow(0 2px 3px rgb(0 0 0 / 55%));
  }

  @keyframes petParticleFloat {
    0% {
      opacity: 1;
      transform: translate(var(--px, 0), var(--py, 0)) scale(0.6);
    }
    50% {
      opacity: 0.95;
      transform: translate(calc(var(--px, 0) * 1.2), calc(var(--py, 0) - 24px)) scale(1.15);
    }
    100% {
      opacity: 0;
      transform: translate(calc(var(--px, 0) * 1.4), calc(var(--py, 0) - 52px)) scale(0.7);
    }
  }
</style>
