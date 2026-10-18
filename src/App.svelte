<script lang="ts">
  import { onMount } from "svelte";
  import { isTauri } from "@tauri-apps/api/core";
  import { restoreDesktopPet } from "@/lib/petVisibility";
  onMount(() => {
    if (isTauri()) restoreDesktopPet().catch(error =>
      toastState.error(`Could not restore desktop companion: ${String(error)}`));
  });
  import SideNavbar from "@/components/navigation/SideNavbar.svelte";
  import { restoreTab, rememberTab, takeNavigationRequest, subscribeNavigation, type NavTab } from "@/lib/navigation";
  import SpotifyView from "@/views/SpotifyView.svelte";
  import SpotifyPlayer from "@/components/audio/SpotifyPlayer.svelte";
  import ThemeControls from "@/components/ThemeControls.svelte";
  import ToastHost from "@/components/ui/ToastHost.svelte";
  import GlobalPingHost from "@/components/radial/GlobalPingHost.svelte";
  import MixerView from "@/views/MixerView.svelte";
  import VoiceAiView from "@/views/VoiceAiView.svelte";
  import PingsWheelView from "@/views/PingsWheelView.svelte";
  import SettingsView from "@/views/SettingsView.svelte";
  import TimerView from "@/views/TimerView.svelte";
  import AgentPetView from "@/views/AgentPetView.svelte";
  import AgentPetSettingsView from "@/views/AgentPetSettingsView.svelte";
  import GoogleLoginModal from "@/components/GoogleLoginModal.svelte";
  import { wallpaperState } from "@/lib/wallpaper.svelte";
  import { themeState } from "@/lib/theme.svelte";
  import { toastState } from "@/lib/toast.svelte";
  import { googleAuthState } from "@/lib/googleAuth.svelte";
  import { prefersReducedMotion } from "@/lib/utils";
  import {
    SlidersHorizontal,
    Music2,
    Timer,
    Target,
    Mic,
    Bot,
    Settings,
    User,
    RefreshCw,
  } from "@lucide/svelte";

  import { spotifyState } from "@/lib/spotify.svelte";
  $effect(() => spotifyState.start());

  let activeTab = $state<NavTab>(takeNavigationRequest() ?? restoreTab());
  onMount(() => subscribeNavigation(tab => { activeTab = tab; }));
  $effect(() => rememberTab(activeTab));
  $effect(() => { if (spotifyState.loginVersion > 0) activeTab = "spotify"; });
  let isRefreshing = $state(false);

  function spotlight(node: HTMLElement) {
    function handlePointerMove(event: PointerEvent) {
      if (event.pointerType === "touch" || prefersReducedMotion()) return;
      const panel = (event.target as HTMLElement)?.closest<HTMLElement>(".panel");
      if (!panel) return;
      const rect = panel.getBoundingClientRect();
      panel.style.setProperty("--mx", `${event.clientX - rect.left}px`);
      panel.style.setProperty("--my", `${event.clientY - rect.top}px`);
    }

    node.addEventListener("pointermove", handlePointerMove);
    return {
      destroy() {
        node.removeEventListener("pointermove", handlePointerMove);
      },
    };
  }

  function handleRefresh() {
    isRefreshing = true;
    toastState.info("Refreshed audio applications");
    setTimeout(() => {
      isRefreshing = false;
    }, 400);
  }

  const VIEWS: Record<NavTab, { title: string; subtitle: string; icon: typeof SlidersHorizontal }> = {
    spotify: {
      title: "Spotify",
      subtitle: "Thư viện nhạc · Playlist và bài đã thích",
      icon: Music2,
    },
    mixer: {
      title: "Audio Mixer",
      subtitle: "Per-application CoreAudio stream routing & volume control",
      icon: SlidersHorizontal,
    },
    timer: {
      title: "Focus Timer",
      subtitle: "Pomodoro timing with smart audio ducking",
      icon: Timer,
    },
    pings: {
      title: "Tactical Pings & Wheel",
      subtitle: "Pingloom 8-directional radial wheel gestures & tactical pings",
      icon: Target,
    },
    voice: {
      title: "Voice AI 1:1",
      subtitle: "Real-time conversational voice assistant",
      icon: Mic,
    },
    pet: {
      title: "Agent Pet Companion",
      subtitle: "Virtual companion responding to coding workflows",
      icon: Bot,
    },
    "pet-settings": {
      title: "AgentPet Settings",
      subtitle: "Desktop display and sprite animation preferences",
      icon: Settings,
    },
    settings: {
      title: "Settings & Account",
      subtitle: "Preferences, cloud sync, and socket connections",
      icon: Settings,
    },
  };

  const currentView = $derived(VIEWS[activeTab]);
</script>

<div
  class="flex h-screen bg-(--paper) text-(--ink) font-sans overflow-hidden relative"
  use:spotlight
>
  <!-- Global In-App Ping Gesture Engine & Overlay Bursts -->
  <GlobalPingHost />

  <!-- 0. Ambient Background Wallpaper Layer -->
  <div
    class="fixed inset-0 pointer-events-none z-0 transition-all duration-700 ease-out origin-center"
    style="background-image: {wallpaperState.backgroundStyle.backgroundImage}; background-size: {wallpaperState.backgroundStyle.backgroundSize}; background-position: {wallpaperState.backgroundStyle.backgroundPosition}; filter: blur({wallpaperState.wallpaper.blur}px); transform: scale(1.08);"
  ></div>

  <!-- Dynamic Contrast Dimming Overlay -->
  <div
    class="fixed inset-0 pointer-events-none z-0 transition-opacity duration-500 ease-out bg-(--paper)"
    style="opacity: {themeState.resolvedThemeMode === 'light' ? Math.max(0.92, wallpaperState.wallpaper.dim) : wallpaperState.wallpaper.dim};"
  ></div>

  <!-- Pingloom atmosphere: aurora drift + top glow, tinted by the active palette accent -->
  <div class="atmosphere" aria-hidden="true">
    <div class="top-glow"></div>
    <div class="aurora aurora-a"></div>
    <div class="aurora aurora-b"></div>
  </div>

  <!-- 1. Left Side Navigation Rail -->
  <div class="relative z-10 flex h-full shrink-0">
    <SideNavbar
      activeTab={activeTab}
      onSelectTab={(tab) => (activeTab = tab)}
      user={googleAuthState.user}
      isEngineReady={true}
    />
  </div>

  <!-- 2. Main Content Viewport -->
  <div class="flex-1 flex flex-col h-screen overflow-hidden min-w-0 relative z-10">
    <!-- Single Unified Header Toolbar (Pingloom desktop style) -->
    <header class="min-h-12 py-2 px-3 sm:px-5 border-b border-(--line) flex items-center justify-between shrink-0 bg-(--paper) z-20 gap-2">
      <div class="flex items-center gap-2.5 min-w-0 flex-1">
        <div class="min-w-0">
          <h1 class="text-sm font-bold text-(--ink) tracking-tight m-0 truncate">
            {currentView.title}
          </h1>
          <p class="text-[10px] sm:text-[11px] text-(--muted) m-0 mt-0.5 truncate hidden sm:block">
            {currentView.subtitle}
          </p>
        </div>

        <div class="status-indicator shell-engine-status pl-1 shrink-0">
          <span class="status-dot"></span>
          <span class="text-[10px] font-semibold text-(--success)">{spotifyState.status?.processing ? "Spotify DSP Active" : "CoreAudio Ready"}</span>
        </div>
      </div>

      <div class="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
        <!-- Pingloom Theme Controls -->
        <ThemeControls />

        {#if activeTab === "mixer"}
          <button
            id="refresh-btn"
            type="button"
            onclick={handleRefresh}
            class="btn border border-(--input-line) bg-(--paper) hover:bg-(--surface) hover:text-(--ink) hover:border-(--focus) h-8 px-2 sm:px-3 text-xs flex items-center gap-1.5 rounded-lg transition-colors cursor-pointer"
            title="Refresh audio applications"
          >
            <RefreshCw class="w-3.5 h-3.5 {isRefreshing ? 'animate-spin text-(--accent)' : 'text-(--muted)'}" />
            <span class="hidden sm:inline">Refresh</span>
          </button>
        {/if}

        {#if googleAuthState.user}
          <button
            type="button"
            onclick={() => (activeTab = "settings")}
            class="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-(--surface) border border-(--line) text-[11px] text-(--ink) hover:border-(--focus) transition-colors cursor-pointer shadow-sm max-w-30 sm:max-w-40 truncate"
            title="Account Settings"
          >
            {#if googleAuthState.user.avatar}
              <img
                src={googleAuthState.user.avatar}
                alt={googleAuthState.user.name}
                class="w-4 h-4 rounded-full object-cover border border-(--line) shrink-0"
              />
            {:else}
              <User class="w-3.5 h-3.5 shrink-0" />
            {/if}
            <span class="font-semibold truncate">{googleAuthState.user.name}</span>
          </button>
        {:else}
          <button
            type="button"
            onclick={() => (googleAuthState.isLoginModalOpen = true)}
            class="btn border border-(--input-line) bg-(--paper) hover:bg-(--surface) hover:text-(--ink) hover:border-(--focus) text-[11px] h-8 px-2 sm:px-3 font-semibold flex items-center gap-1.5 rounded-lg transition-colors cursor-pointer"
            title="Sign in with Google"
          >
            <User class="w-3.5 h-3.5 text-(--muted)" />
            <span class="hidden sm:inline">Google</span>
          </button>
        {/if}
      </div>
    </header>

    <!-- Scrollable View Content -->
    <main class="flex-1 overflow-y-auto p-3.5 sm:p-5 lg:p-6 flex flex-col min-w-0 min-h-0" aria-label={currentView.title}>
      {#if activeTab === "spotify"}
        <SpotifyView />
      {:else if activeTab === "mixer"}
        <MixerView />
      {:else if activeTab === "timer"}
        <TimerView
          user={googleAuthState.user}
          onSignInGoogle={() => (googleAuthState.isLoginModalOpen = true)}
        />
      {:else if activeTab === "pings"}
        <PingsWheelView />
      {:else if activeTab === "voice"}
        <VoiceAiView
          user={googleAuthState.user}
          onSignInGoogle={() => (googleAuthState.isLoginModalOpen = true)}
        />
      {:else if activeTab === "pet"}
        <AgentPetView />
      {:else if activeTab === "pet-settings"}
        <AgentPetSettingsView />
      {:else if activeTab === "settings"}
        <SettingsView
          user={googleAuthState.user}
          isLoadingAuth={googleAuthState.isLoading}
          onSignInGoogle={() => (googleAuthState.isLoginModalOpen = true)}
          onSignOutGoogle={async () => {
            try {
              await googleAuthState.signOut();
              toastState.info("Đã đăng xuất tài khoản Google");
            } catch (error) {
              toastState.error(error instanceof Error ? error.message : "Chưa đăng xuất được. Hãy thử lại.");
            }
          }}
        />
      {/if}
    </main>

    <SpotifyPlayer />
  </div>

  <!-- Google Authentication Modal -->
  <GoogleLoginModal
    open={googleAuthState.isLoginModalOpen}
    onClose={() => (googleAuthState.isLoginModalOpen = false)}
  />

  <!-- Toast Notification Host -->
  <ToastHost />
</div>

<style>
  @media (max-width: 767px) {
    header .shell-engine-status { display: none; }
  }
</style>
