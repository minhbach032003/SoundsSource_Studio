<script lang="ts">
  import type { AgentSessionDto, AgentIntegrationDto } from "./types";
  import { getPetForSession, getProjectName } from "@/lib/petMapping";
  import {
    Radio,
    FolderGit2,
    Laptop,
    Volume2,
    Eye,
    Sparkles,
    Terminal,
    Bot,
    Code2,
    MousePointer2,
    Cpu,
    Send,
    Trash2,
    Plug,
  } from "@lucide/svelte";

  interface Props {
    agentSessions: AgentSessionDto[];
    agentIntegrations: AgentIntegrationDto[];
    showDesktopOverlay: boolean;
    audioReactive: boolean;
    focusTimerSync: boolean;
    activityTheme: string;
    onToggleDesktopOverlay?: () => void;
    onToggleAudioReactive?: () => void;
    onToggleFocusTimerSync?: () => void;
    onActivityThemeChange?: (theme: string) => void;
    onSimulatePing?: () => void;
    onDismissSession?: (id: string) => void;
    onToggleHook?: (kind: string, isInstalled: boolean) => void;
  }

  let {
    agentSessions = [],
    agentIntegrations = [],
    showDesktopOverlay = false,
    audioReactive = true,
    focusTimerSync = true,
    activityTheme = "Chef",
    onToggleDesktopOverlay,
    onToggleAudioReactive,
    onToggleFocusTimerSync,
    onActivityThemeChange,
    onSimulatePing,
    onDismissSession,
    onToggleHook,
  }: Props = $props();

  let isSimulating = $state(false);

  const activeSessionsCount = $derived(
    agentSessions.filter((s) => s.state === "working" || s.state === "waiting").length
  );
  const installedHooksCount = $derived(
    agentIntegrations.filter((i) => i.is_installed).length
  );
</script>

<div class="w-full space-y-4 select-none pb-6">
  <!-- Top Bridge Telemetry Strip -->
  <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
    <div class="p-3.5 rounded-2xl bg-(--surface) border border-(--line) flex items-center justify-between shadow-xs">
      <div>
        <span class="text-[10px] text-(--muted) uppercase tracking-wider font-semibold block">Socket Status</span>
        <span class="text-xs font-bold text-emerald-400 flex items-center gap-1.5 mt-1">
          <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          Connected (1.2 ms)
        </span>
      </div>
      <div class="w-8 h-8 rounded-xl bg-(--paper) border border-(--line) flex items-center justify-center text-emerald-400">
        <Radio size={16} />
      </div>
    </div>

    <div class="p-3.5 rounded-2xl bg-(--surface) border border-(--line) flex items-center justify-between shadow-xs">
      <div>
        <span class="text-[10px] text-(--muted) uppercase tracking-wider font-semibold block">Active Sessions</span>
        <span class="text-lg font-bold text-(--ink) font-mono">{activeSessionsCount} <span class="text-xs text-(--muted) font-normal">running</span></span>
      </div>
      <div class="w-8 h-8 rounded-xl bg-(--paper) border border-(--line) flex items-center justify-center text-(--accent-text)">
        <Bot size={16} />
      </div>
    </div>

    <div class="p-3.5 rounded-2xl bg-(--surface) border border-(--line) flex items-center justify-between shadow-xs">
      <div>
        <span class="text-[10px] text-(--muted) uppercase tracking-wider font-semibold block">CLI Agent Hooks</span>
        <span class="text-lg font-bold text-(--success) font-mono">{installedHooksCount} / {agentIntegrations.length} <span class="text-xs text-(--muted) font-normal">installed</span></span>
      </div>
      <div class="w-8 h-8 rounded-xl bg-(--paper) border border-(--line) flex items-center justify-center text-(--success)">
        <Plug size={16} />
      </div>
    </div>
  </div>

  <!-- Main 2-Column Balanced Studio Layout -->
  <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
    <!-- LEFT COLUMN: Bridge Controls & Thematic Automation (lg:col-span-6) -->
    <div class="lg:col-span-6 space-y-4 flex flex-col">
      <div class="panel p-4 sm:p-5 shadow-xs space-y-4">
        <div class="flex items-center justify-between pb-3 border-b border-(--line)">
          <div class="flex items-center gap-2">
            <Radio size={16} class="text-(--accent-text)" />
            <h3 class="text-xs font-bold text-(--ink) m-0">Bridge & Desktop Automation</h3>
          </div>
          {#if onSimulatePing}
            <button
              type="button"
              onclick={() => {
                isSimulating = true;
                onSimulatePing?.();
                setTimeout(() => { isSimulating = false; }, 300);
              }}
              disabled={isSimulating}
              class="btn btn-ghost h-7 text-[10px] px-2 text-(--accent-text) border border-(--line)"
              title="Send test pulse event to pet"
            >
              <Send size={11} class="text-(--accent-text)" />
              Test Pulse
            </button>
          {/if}
        </div>

        <!-- Socket Endpoint Card -->
        <div class="p-3 rounded-xl bg-(--paper) border border-(--line) text-xs space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-(--muted) text-[11px]">Unix Domain Socket</span>
            <span class="font-mono text-[10px] text-(--ink) bg-(--surface) px-2 py-0.5 rounded border border-(--line)">/tmp/rust-sound-agent-pet.sock</span>
          </div>
          <div class="flex items-center justify-between pt-1 border-t border-(--line) text-[10px] text-(--muted)">
            <span class="flex items-center gap-1">
              <FolderGit2 size={12} class="text-(--accent-text)" />
              Workspace Context
            </span>
            <span class="font-mono text-(--ink) truncate max-w-44">/Users/mac/Documents/rust-sound</span>
          </div>
        </div>

        <!-- Controls Toggles -->
        <div class="space-y-2 pt-1">
          <!-- Desktop Floating Overlay -->
          <div class="flex items-center justify-between p-3 rounded-xl bg-(--paper) border border-(--line)">
            <div class="flex items-center gap-2.5">
              <Laptop size={15} class="text-(--accent-text) shrink-0" />
              <div>
                <span class="text-xs font-semibold text-(--ink) block">Desktop Floating Companion</span>
                <span class="text-[10px] text-(--muted) block">Render transparent sprite window on macOS desktop</span>
              </div>
            </div>
            <button
              type="button"
              onclick={onToggleDesktopOverlay}
              class="w-10 h-5.5 rounded-full transition-colors relative cursor-pointer {showDesktopOverlay ? 'bg-(--accent)' : 'bg-(--input-line)'}"
              role="switch"
              aria-checked={showDesktopOverlay}
              title="Toggle Desktop Floating Overlay"
            >
              <span class="w-4 h-4 rounded-full bg-white transition-transform block shadow-xs absolute top-0.75 {showDesktopOverlay ? 'left-5.25' : 'left-0.75'}"></span>
            </button>
          </div>

          <!-- Audio-Reactive Rhythm -->
          <div class="flex items-center justify-between p-3 rounded-xl bg-(--paper) border border-(--line)">
            <div class="flex items-center gap-2.5">
              <Volume2 size={15} class="text-(--success) shrink-0" />
              <div>
                <span class="text-xs font-semibold text-(--ink) block">Audio-Reactive Rhythm</span>
                <span class="text-[10px] text-(--muted) block">BPM pulsing and dance sync to Spotify audio playback</span>
              </div>
            </div>
            <button
              type="button"
              onclick={onToggleAudioReactive}
              class="w-10 h-5.5 rounded-full transition-colors relative cursor-pointer {audioReactive ? 'bg-(--accent)' : 'bg-(--input-line)'}"
              role="switch"
              aria-checked={audioReactive}
              title="Toggle Audio Reactive"
            >
              <span class="w-4 h-4 rounded-full bg-white transition-transform block shadow-xs absolute top-0.75 {audioReactive ? 'left-5.25' : 'left-0.75'}"></span>
            </button>
          </div>

          <!-- Break Timer Sync -->
          <div class="flex items-center justify-between p-3 rounded-xl bg-(--paper) border border-(--line)">
            <div class="flex items-center gap-2.5">
              <Eye size={15} class="text-(--warning) shrink-0" />
              <div>
                <span class="text-xs font-semibold text-(--ink) block">Pomodoro Break Sync</span>
                <span class="text-[10px] text-(--muted) block">Ducks audio and sends companion to sleep during focus breaks</span>
              </div>
            </div>
            <button
              type="button"
              onclick={onToggleFocusTimerSync}
              class="w-10 h-5.5 rounded-full transition-colors relative cursor-pointer {focusTimerSync ? 'bg-(--accent)' : 'bg-(--input-line)'}"
              role="switch"
              aria-checked={focusTimerSync}
              title="Toggle Break Timer Sync"
            >
              <span class="w-4 h-4 rounded-full bg-white transition-transform block shadow-xs absolute top-0.75 {focusTimerSync ? 'left-5.25' : 'left-0.75'}"></span>
            </button>
          </div>
        </div>

        <!-- Activity Theme Selector -->
        <div class="p-3 rounded-xl bg-(--paper) border border-(--line) space-y-2">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <Sparkles size={14} class="text-(--accent-text)" />
              <span class="text-xs font-semibold text-(--ink)">Activity Phrase Theme</span>
            </div>
            <span class="badge text-[10px] font-mono px-1.5 py-0">{activityTheme}</span>
          </div>
          <div class="grid grid-cols-5 gap-1.5 pt-1">
            {#each ["Chef", "Engineer", "Wizard", "Explorer", "Scientist"] as th}
              <button
                type="button"
                onclick={() => onActivityThemeChange?.(th)}
                class="py-1.5 px-1 text-center rounded-lg text-[10px] font-semibold transition-all cursor-pointer border truncate {activityTheme === th
                  ? 'bg-(--surface) text-(--accent-text) border-(--accent) shadow-xs'
                  : 'bg-transparent text-(--muted) border-transparent hover:text-(--ink) hover:border-(--line)'}"
              >
                {th}
              </button>
            {/each}
          </div>
        </div>
      </div>
    </div>

    <!-- RIGHT COLUMN: Connected Sessions & CLI Agent Hooks (lg:col-span-6) -->
    <div class="lg:col-span-6 space-y-4 flex flex-col">
      <!-- Active Sessions Section -->
      <div class="panel p-4 sm:p-5 shadow-xs space-y-3.5">
        <div class="flex items-center justify-between pb-3 border-b border-(--line)">
          <div class="flex items-center gap-2">
            <Bot size={16} class="text-(--accent-text)" />
            <h3 class="text-xs font-bold text-(--ink) m-0">Live Agent Sessions ({agentSessions.length})</h3>
          </div>
          <span class="text-[10px] font-mono text-(--muted)">Auto-detected via Socket</span>
        </div>

        <div class="space-y-2 max-h-56 overflow-y-auto pr-1">
          {#if agentSessions.length === 0}
            <div class="py-8 flex flex-col items-center justify-center text-center text-(--muted) bg-(--paper) rounded-xl border border-dashed border-(--line)">
              <Bot size={24} class="mb-1.5 opacity-30 text-(--accent-text)" />
              <span class="text-xs font-semibold text-(--ink)">No active coding sessions</span>
              <span class="text-[10px] text-(--muted) mt-0.5 max-w-xs">Run Pi, Claude Code, or Codex in your terminal to stream live telemetry.</span>
            </div>
          {:else}
            {#each agentSessions as sess, idx (sess.id)}
              {@const sessPet = getPetForSession(sess, idx)}
              {@const projName = getProjectName(sess.project)}
              <div class="p-2.5 rounded-xl bg-(--paper) border border-(--line) flex items-center justify-between gap-2.5 text-xs">
                <img
                  src={sessPet.avatarUrl}
                  alt={sessPet.name}
                  class="w-7 h-7 rounded-full border border-(--line) object-cover bg-(--surface) shrink-0 shadow-xs"
                />
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-1.5">
                    <span class="w-1.5 h-1.5 rounded-full {sess.state === 'working' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'} shrink-0"></span>
                    <span class="font-bold text-(--ink) text-xs truncate">{projName}</span>
                    <span class="badge text-[9px] px-1 py-0 uppercase">{sess.agent_kind}</span>
                  </div>
                  <span class="text-[10px] text-(--accent-text) font-semibold block truncate mt-0.5">{sessPet.name}</span>
                </div>
                {#if onDismissSession}
                  <button
                    type="button"
                    onclick={() => onDismissSession(sess.id)}
                    class="btn btn-ghost h-6 text-[10px] px-2 text-(--muted) hover:text-rose-400"
                    title="Dismiss session"
                  >
                    <Trash2 size={11} />
                  </button>
                {/if}
              </div>
            {/each}
          {/if}
        </div>
      </div>

      <!-- CLI Agent Integration Hooks Hub -->
      <div class="panel p-4 sm:p-5 shadow-xs space-y-3.5">
        <div class="flex items-center justify-between pb-3 border-b border-(--line)">
          <div class="flex items-center gap-2">
            <Plug size={16} class="text-(--accent-text)" />
            <h3 class="text-xs font-bold text-(--ink) m-0">Agent Hooks Hub</h3>
          </div>
          <span class="text-[10px] font-mono text-(--muted)">One-click Installation</span>
        </div>

        <div class="space-y-2">
          {#each agentIntegrations as integ (integ.kind)}
            <div class="p-2.5 rounded-xl bg-(--paper) border border-(--line) flex items-center justify-between gap-3 text-xs">
              <div class="flex items-center gap-2.5 min-w-0">
                <div class="w-7 h-7 rounded-lg bg-(--surface) border border-(--line) flex items-center justify-center text-(--accent-text) shrink-0">
                  {#if integ.kind === "pi"}
                    <Terminal size={14} class="text-emerald-400" />
                  {:else if integ.kind === "claude"}
                    <Bot size={14} class="text-amber-400" />
                  {:else if integ.kind === "codex"}
                    <Code2 size={14} class="text-emerald-400" />
                  {:else if integ.kind === "cursor"}
                    <MousePointer2 size={14} class="text-rose-400" />
                  {:else}
                    <Cpu size={14} class="text-purple-400" />
                  {/if}
                </div>
                <div class="min-w-0">
                  <span class="font-bold text-(--ink) text-xs block truncate">{integ.display_name}</span>
                  <span class="text-[10px] text-(--muted) block truncate">{integ.note || "Native event hook integration"}</span>
                </div>
              </div>

              {#if onToggleHook}
                <button
                  type="button"
                  onclick={() => onToggleHook(integ.kind, integ.is_installed)}
                  class="btn h-7 text-[11px] px-2.5 font-semibold shrink-0 {integ.is_installed
                    ? 'btn-ghost border border-(--line) text-(--muted)'
                    : 'btn-primary shadow-xs'}"
                >
                  {integ.is_installed ? "Uninstall" : "Install Hook"}
                </button>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    </div>
  </div>
</div>
