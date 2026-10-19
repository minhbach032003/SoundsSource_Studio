<script lang="ts">
  import { INSTALLED_PETS, type AgentSessionDto, type AgentIntegrationDto } from "./types";
  import { getPetForSession, getProjectName, setProjectPetBinding } from "@/lib/petMapping";
  import {
    Radio,
    CheckCircle2,
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
    Activity,
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

  let socketTab = $state<"status" | "sessions" | "hooks">("status");
</script>

<div class="panel p-4 sm:p-5 shadow-sm space-y-3.5 select-none">
  <!-- Header with Live Indicator -->
  <div class="flex items-center justify-between pb-2.5 border-b border-(--line) gap-2 flex-wrap">
    <div>
      <span class="text-xs font-semibold text-(--ink) tracking-tight block">
        IPC Socket & Desktop Bridge
      </span>
      <span class="text-[11px] text-(--muted)">
        Unix Domain Socket /tmp/rust-sound-agent-pet.sock
      </span>
    </div>

    <div class="flex items-center gap-2">
      <span class="badge badge-ok text-[10px] font-semibold py-0.5">
        <Radio class="w-3 h-3 text-(--success) animate-pulse" />
        Socket Active
      </span>
      {#if onSimulatePing}
        <button
          type="button"
          onclick={onSimulatePing}
          class="btn btn-ghost h-6 text-[10px] px-2 text-(--accent-text) border border-(--line)"
          title="Send test pulse event to pet"
        >
          <Send class="w-2.5 h-2.5 text-(--accent-text)" />
          Test Pulse
        </button>
      {/if}
    </div>
  </div>

  <!-- Diagnostic Grid -->
  <div class="grid grid-cols-2 gap-2 text-xs p-2.5 rounded-xl bg-(--paper) border border-(--line)">
    <div>
      <span class="text-[10px] text-(--muted) block mb-0.5">Connection State</span>
      <span class="text-(--success) font-semibold text-[11px] flex items-center gap-1">
        <CheckCircle2 class="w-3 h-3 text-(--success)" />
        Connected (1.2 ms)
      </span>
    </div>
    <div>
      <span class="text-[10px] text-(--muted) block mb-0.5">Socket Endpoint</span>
      <span class="text-(--ink) font-mono text-[10px] truncate block">/tmp/rust-sound-agent-pet.sock</span>
    </div>
    <div class="col-span-2 pt-1 border-t border-(--line) flex items-center justify-between text-[10px] text-(--muted)">
      <span class="flex items-center gap-1 text-(--muted)">
        <FolderGit2 class="w-3 h-3 text-(--accent-text)" />
        Workspace Context:
      </span>
      <span class="font-mono text-(--ink) truncate max-w-50">
        /Users/mac/Documents/rust-sound
      </span>
    </div>
  </div>

  <!-- Navigation Sub-tabs -->
  <div class="flex items-center gap-1 p-0.5 bg-(--paper) border border-(--line) rounded-lg">
    <button
      type="button"
      onclick={() => (socketTab = "status")}
      class="flex-1 px-2 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer flex items-center justify-center gap-1.5 {socketTab === 'status'
        ? 'bg-(--surface) text-(--ink) shadow-xs border border-(--line)'
        : 'text-(--muted) hover:text-(--ink)'}"
    >
      <Activity class="w-3.5 h-3.5" />
      Bridge Controls
    </button>
    <button
      type="button"
      onclick={() => (socketTab = "sessions")}
      class="flex-1 px-2 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer flex items-center justify-center gap-1.5 {socketTab === 'sessions'
        ? 'bg-(--surface) text-(--ink) shadow-xs border border-(--line)'
        : 'text-(--muted) hover:text-(--ink)'}"
    >
      <Bot class="w-3.5 h-3.5 text-(--success)" />
      Active Sessions
      {#if agentSessions.length > 0}
        <span class="w-4 h-4 rounded-full bg-(--surface) text-(--success) text-[9px] flex items-center justify-center font-bold border border-(--line)">
          {agentSessions.length}
        </span>
      {/if}
    </button>
    <button
      type="button"
      onclick={() => (socketTab = "hooks")}
      class="flex-1 px-2 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer flex items-center justify-center gap-1.5 {socketTab === 'hooks'
        ? 'bg-(--surface) text-(--ink) shadow-xs border border-(--line)'
        : 'text-(--muted) hover:text-(--ink)'}"
    >
      <Plug class="w-3.5 h-3.5 text-(--accent-text)" />
      Agent Hooks
    </button>
  </div>

  <!-- TAB 1: BRIDGE CONTROLS -->
  {#if socketTab === "status"}
    <div class="space-y-2 pt-0.5">
      <!-- Desktop Floating Overlay Toggle -->
      <div class="flex items-center justify-between p-2.5 rounded-xl bg-(--paper) border border-(--line)">
        <div class="flex items-center gap-2.5">
          <Laptop class="w-4 h-4 text-(--accent-text) shrink-0" />
          <div>
            <span class="text-xs font-semibold text-(--ink) block">Desktop Floating Overlay</span>
            <span class="text-[10px] text-(--muted) block">Render animated companion sticker on macOS desktop</span>
          </div>
        </div>
        <button
          type="button"
          onclick={onToggleDesktopOverlay}
          class="w-10 h-5.5 rounded-full transition-colors relative cursor-pointer {showDesktopOverlay
            ? 'bg-(--accent)'
            : 'bg-(--input-line)'}"
          role="switch"
          aria-checked={showDesktopOverlay}
          title="Toggle Desktop Floating Overlay"
        >
          <span
            class="w-4 h-4 rounded-full bg-white transition-transform block shadow-sm absolute top-0.75 {showDesktopOverlay
              ? 'left-5.25'
              : 'left-0.75'}"
          ></span>
        </button>
      </div>

      <!-- Audio-Reactive Mode Toggle -->
      <div class="flex items-center justify-between p-2.5 rounded-xl bg-(--paper) border border-(--line)">
        <div class="flex items-center gap-2.5">
          <Volume2 class="w-4 h-4 text-(--success) shrink-0" />
          <div>
            <span class="text-xs font-semibold text-(--ink) block">Audio-Reactive Rhythm</span>
            <span class="text-[10px] text-(--muted) block">Pulse visuals to active music stream</span>
          </div>
        </div>
        <button
          type="button"
          onclick={onToggleAudioReactive}
          class="w-10 h-5.5 rounded-full transition-colors relative cursor-pointer {audioReactive
            ? 'bg-(--accent)'
            : 'bg-(--input-line)'}"
          role="switch"
          aria-checked={audioReactive}
          title="Toggle Audio Reactive"
        >
          <span
            class="w-4 h-4 rounded-full bg-white transition-transform block shadow-sm absolute top-0.75 {audioReactive
              ? 'left-5.25'
              : 'left-0.75'}"
          ></span>
        </button>
      </div>

      <!-- Focus Break Timer Sync Toggle -->
      <div class="flex items-center justify-between p-2.5 rounded-xl bg-(--paper) border border-(--line)">
        <div class="flex items-center gap-2.5">
          <Eye class="w-4 h-4 text-(--warning) shrink-0" />
          <div>
            <span class="text-xs font-semibold text-(--ink) block">Break Timer Sync</span>
            <span class="text-[10px] text-(--muted) block">Duck audio and sleep companion during breaks</span>
          </div>
        </div>
        <button
          type="button"
          onclick={onToggleFocusTimerSync}
          class="w-10 h-5.5 rounded-full transition-colors relative cursor-pointer {focusTimerSync
            ? 'bg-(--accent)'
            : 'bg-(--input-line)'}"
          role="switch"
          aria-checked={focusTimerSync}
          title="Toggle Break Timer Sync"
        >
          <span
            class="w-4 h-4 rounded-full bg-white transition-transform block shadow-sm absolute top-0.75 {focusTimerSync
              ? 'left-5.25'
              : 'left-0.75'}"
          ></span>
        </button>
      </div>

      <!-- Activity Theme Selector -->
      <div class="p-2.5 rounded-xl bg-(--paper) border border-(--line) space-y-2">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <Sparkles class="w-4 h-4 text-(--accent-text) shrink-0" />
            <div>
              <span class="text-xs font-semibold text-(--ink) block">Activity Phrase Theme</span>
              <span class="text-[10px] text-(--muted) block">Stylizes agent tool actions & thinking lines</span>
            </div>
          </div>
          <span class="badge text-[10px] font-mono px-1.5 py-0">
            {activityTheme}
          </span>
        </div>

        <div class="grid grid-cols-5 gap-1 pt-1">
          {#each ["Chef", "Engineer", "Wizard", "Explorer", "Scientist"] as th}
            <button
              type="button"
              onclick={() => onActivityThemeChange?.(th)}
              class="py-1.5 px-1 text-center rounded-lg text-[10px] font-semibold transition-all cursor-pointer border truncate {activityTheme === th
                ? 'bg-(--surface) text-(--accent-text) border-(--accent) shadow-xs'
                : 'bg-transparent text-(--muted) border-transparent hover:text-(--ink) hover:border-(--line)'}"
              title="Select {th} phrase theme"
            >
              {th}
            </button>
          {/each}
        </div>
      </div>
    </div>

  <!-- TAB 2: ACTIVE SESSIONS -->
  {:else if socketTab === "sessions"}
    <div class="space-y-2 max-h-75 overflow-y-auto pr-1">
      {#if agentSessions.length === 0}
        <div class="flex flex-col items-center justify-center p-6 text-center text-(--muted) bg-(--paper) rounded-xl border border-(--line)">
          <Bot class="w-8 h-8 mb-2 opacity-30 text-(--accent-text)" />
          <span class="text-xs font-semibold text-(--ink)">No active coding sessions</span>
          <span class="text-[11px] text-(--muted) mt-1 max-w-xs">
            Run Claude Code, Codex, Cursor, or Pi in your terminal. Live work will stream here via /tmp/rust-sound-agent-pet.sock
          </span>
        </div>
      {:else}
        {#each agentSessions as sess, idx (sess.id)}
          {@const sessPet = getPetForSession(sess, idx)}
          {@const projName = getProjectName(sess.project)}
          <div class="p-3 rounded-xl bg-(--paper) border border-(--line) flex items-start justify-between gap-2.5 text-xs transition-colors hover:border-(--focus)">
            <img
              src={sessPet.avatarUrl}
              alt={sessPet.name}
              class="w-8 h-8 rounded-full border border-(--line) object-cover bg-(--surface) shrink-0 shadow-xs mt-0.5"
              title="{sessPet.name}: {sessPet.tagline}"
            />
            <div class="min-w-0 flex-1">
              <div class="flex items-center justify-between gap-2 mb-1">
                <div class="flex items-center gap-2 min-w-0">
                  {#if sess.agent_kind.toLowerCase() === "pi"}
                    <Terminal class="w-3.5 h-3.5 text-(--success) shrink-0" />
                  {:else if sess.agent_kind.toLowerCase() === "claude"}
                    <Bot class="w-3.5 h-3.5 text-(--warning) shrink-0" />
                  {:else if sess.agent_kind.toLowerCase() === "codex"}
                    <Code2 class="w-3.5 h-3.5 text-(--success) shrink-0" />
                  {:else if sess.agent_kind.toLowerCase() === "cursor"}
                    <MousePointer2 class="w-3.5 h-3.5 text-(--accent-text) shrink-0" />
                  {:else if sess.agent_kind.toLowerCase() === "gemini"}
                    <Sparkles class="w-3.5 h-3.5 text-(--accent-text) shrink-0" />
                  {:else}
                    <Cpu class="w-3.5 h-3.5 text-(--accent-text) shrink-0" />
                  {/if}
                  <span class="font-bold text-(--ink) text-xs capitalize truncate">
                    {projName}
                  </span>
                  <span class="badge text-[9px] px-1.5 py-0 uppercase font-semibold">
                    {sess.agent_kind}
                  </span>
                  <span class="badge {sess.state === 'working' ? 'badge-ok' : sess.state === 'waiting' ? 'badge-warn' : ''} text-[9px] uppercase font-bold px-1.5 py-0">
                    {sess.state}
                  </span>
                </div>

                <select
                  value={sessPet.id}
                  onchange={(e) => setProjectPetBinding(projName, e.currentTarget.value)}
                  class="field text-[10px] h-6 px-1.5 py-0 rounded max-w-28 text-(--muted) hover:text-(--ink) shrink-0"
                  title="Assign companion to {projName}"
                >
                  {#each INSTALLED_PETS as p}
                    <option value={p.id}>{p.name}</option>
                  {/each}
                </select>
              </div>

              <div class="flex items-center gap-1.5 text-[10px] text-(--muted) mb-1 font-medium">
                <span class="text-(--accent-text) font-semibold">{sessPet.name}</span>
                <span>•</span>
                <span class="truncate">{sessPet.tagline}</span>
              </div>

              {#if sess.project}
                <div class="text-[11px] text-(--accent-text) font-mono truncate flex items-center gap-1">
                  <FolderGit2 class="w-3 h-3 shrink-0" />
                  {sess.project}
                </div>
              {/if}

              {#if sess.tool_name || sess.tool_summary || sess.message}
                <div class="text-[11px] text-(--ink) font-mono bg-(--surface) px-2 py-1 rounded mt-1.5 truncate border border-(--line) flex items-center gap-1.5">
                  <span class="text-[10px] uppercase font-bold text-(--accent-text)">TOOL:</span>
                  <span>{sess.tool_name ? `${sess.tool_name}: ` : ""}{sess.tool_summary || sess.message || "Working"}</span>
                </div>
              {/if}
            </div>

            {#if onDismissSession}
              <button
                type="button"
                onclick={() => onDismissSession?.(sess.id)}
                class="text-(--muted) hover:text-(--error) p-1 rounded transition-colors cursor-pointer"
                title="Dismiss session"
              >
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            {/if}
          </div>
        {/each}
      {/if}
    </div>

  <!-- TAB 3: AGENT HOOK INTEGRATIONS -->
  {:else if socketTab === "hooks"}
    <div class="space-y-2 max-h-75 overflow-y-auto pr-1">
      <div class="p-2.5 rounded-xl bg-(--paper) border border-(--line) text-[11px] text-(--muted)">
        1-Click configure hooks into local developer tools. Lifecycle events stream directly into this AgentPet companion.
      </div>

      {#each agentIntegrations as agent (agent.kind)}
        <div class="p-3 rounded-xl bg-(--paper) border border-(--line) flex items-center justify-between gap-3 text-xs transition-colors hover:border-(--line)">
          <div class="flex items-start gap-2.5">
            <div class="w-7 h-7 rounded-lg bg-(--surface) border border-(--line) flex items-center justify-center shrink-0 mt-0.5">
              {#if agent.kind === "pi"}
                <Terminal class="w-3.5 h-3.5 text-(--success)" />
              {:else if agent.kind === "claude"}
                <Bot class="w-3.5 h-3.5 text-(--warning)" />
              {:else if agent.kind === "codex"}
                <Code2 class="w-3.5 h-3.5 text-(--success)" />
              {:else if agent.kind === "cursor"}
                <MousePointer2 class="w-3.5 h-3.5 text-(--accent-text)" />
              {:else if agent.kind === "gemini"}
                <Sparkles class="w-3.5 h-3.5 text-(--accent-text)" />
              {:else}
                <Cpu class="w-3.5 h-3.5 text-(--accent-text)" />
              {/if}
            </div>
            <div>
              <div class="flex items-center gap-2">
                <span class="font-semibold text-(--ink) text-xs">
                  {agent.display_name}
                </span>
                {#if agent.is_installed}
                  <span class="badge badge-ok text-[10px] font-medium py-0 px-1.5 flex items-center gap-1">
                    <CheckCircle2 class="w-3 h-3 text-(--success)" />
                    Hooked
                  </span>
                {:else}
                  <span class="badge text-[10px] text-(--muted) py-0 px-1.5">
                    Inactive
                  </span>
                {/if}
              </div>
              {#if agent.note}
                <p class="text-[10px] text-(--muted) m-0 mt-0.5">{agent.note}</p>
              {/if}
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={agent.is_installed}
            onclick={() => onToggleHook?.(agent.kind, agent.is_installed)}
            class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out {agent.is_installed
              ? 'bg-(--accent)'
              : 'bg-(--input-line)'}"
            title="Toggle hook for {agent.display_name}"
          >
            <span
              class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition duration-200 ease-in-out {agent.is_installed
                ? 'translate-x-4'
                : 'translate-x-0'}"
            ></span>
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>
