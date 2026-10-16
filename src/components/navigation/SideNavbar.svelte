<script module lang="ts">
  import type { GoogleUser } from "@/lib/googleAuth.svelte";
  export type { GoogleUser };
  import type { NavTab } from "@/lib/navigation";
  export type { NavTab };
</script>

<script lang="ts">
  import {
    SlidersHorizontal,
    Music2,
    Timer,
    Target,
    Mic,
    Bot,
    Settings,
    User,
  } from "@lucide/svelte";
  import AppLogo from "@/components/icons/AppLogo.svelte";

  interface Props {
    activeTab: NavTab;
    onSelectTab: (tab: NavTab) => void;
    user: GoogleUser | null;
    isEngineReady?: boolean;
  }

  let {
    activeTab,
    onSelectTab,
    user,
    isEngineReady = true,
  }: Props = $props();

  const NAV_ITEMS = [
    { id: "spotify" as const, label: "Spotify", icon: Music2 },
    { id: "mixer" as const, label: "Mixer", icon: SlidersHorizontal },
    { id: "timer" as const, label: "Focus", icon: Timer },
    { id: "pings" as const, label: "Pings", icon: Target },
    { id: "voice" as const, label: "Voice AI", icon: Mic },
    { id: "pet" as const, label: "Agent Pet", icon: Bot },
    { id: "settings" as const, label: "Settings", icon: Settings },
  ];
</script>

<aside
  class="w-16 min-w-16 h-screen bg-(--surface) border-r border-(--line) flex flex-col items-center justify-between py-4 select-none z-30 shrink-0"
  aria-label="App Navigation"
>
  <!-- Top Brand Logo -->
  <div class="flex flex-col items-center gap-5">
    <button
      type="button"
      onclick={() => onSelectTab("mixer")}
      class="cursor-pointer hover:scale-105 active:scale-95 transition-transform"
      title="SoundsSource Studio"
    >
      <AppLogo size="md" variant="icon-only" animated />
    </button>

    <!-- Navigation Rail Items -->
    <nav class="flex flex-col items-center" aria-label="Main Navigation">
      <div class="flex flex-col items-center gap-2" role="tablist">
        {#each NAV_ITEMS as item (item.id)}
          {@const Icon = item.icon}
          {@const isActive = activeTab === item.id || (item.id === "pet" && activeTab === "pet-settings")}
          <button
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={item.label}
            title={item.label}
            onclick={() => onSelectTab(item.id)}
            class="relative w-11 h-11 rounded-xl flex flex-col items-center justify-center transition-all duration-150 cursor-pointer group {isActive ? 'bg-(--paper) text-(--ink) border border-(--line) shadow-sm font-semibold' : 'text-(--muted) hover:text-(--ink) hover:bg-(--paper) border border-transparent'}"
          >
            {#if isActive}
              <span
                class="absolute -left-1.5 w-1 h-6 rounded-r-md bg-(--accent)"
                aria-hidden="true"
              ></span>
            {/if}
            <Icon class="w-4 h-4 transition-transform group-hover:scale-110" />
            <span class="text-[9px] font-semibold tracking-tight mt-0.5">
              {item.label}
            </span>
          </button>
        {/each}
      </div>
    </nav>
  </div>

  <!-- Bottom Profile & Status -->
  <div class="flex flex-col items-center gap-3">
    <!-- Engine Status Dot -->
    <div
      class="flex items-center justify-center w-6 h-6 rounded-full bg-(--paper) border border-(--line) cursor-help"
      title={isEngineReady ? "CoreAudio Engine Active" : "CoreAudio Engine Offline"}
    >
      <span
        class="w-2 h-2 rounded-full {isEngineReady ? 'bg-emerald-500 shadow-[0_0_8px_var(--success)] status-pulse' : 'bg-slate-400'}"
      ></span>
    </div>

    <!-- User Profile Avatar / Sign In -->
    <button
      type="button"
      onclick={() => onSelectTab("settings")}
      class="w-9 h-9 rounded-xl flex items-center justify-center overflow-hidden border transition-all cursor-pointer shadow-sm {user ? 'border-(--accent) hover:scale-105' : 'border-(--line) bg-(--paper) text-(--muted) hover:text-(--ink) hover:border-(--focus)'}"
      title={user ? `${user.name} (${user.email})` : "Account & Google Sign In"}
    >
      {#if user?.avatar}
        <img
          src={user.avatar}
          alt={user.name}
          class="w-full h-full object-cover"
        />
      {:else if user}
        <span class="text-xs font-bold text-(--accent)">
          {user.name.slice(0, 1).toUpperCase()}
        </span>
      {:else}
        <User class="w-4 h-4" />
      {/if}
    </button>
  </div>
</aside>
