<script lang="ts">
  interface Props {
    size?: "sm" | "md" | "lg" | "xl";
    variant?: "icon-only" | "with-wordmark";
    animated?: boolean;
    class?: string;
  }

  let {
    size = "md",
    variant = "icon-only",
    animated = false,
    class: className = "",
  }: Props = $props();

  const SIZE_MAP = {
    sm: { icon: "w-7 h-7", container: "w-7 h-7 p-1.5", text: "text-xs", badge: "text-[9px]" },
    md: { icon: "w-9 h-9", container: "w-9 h-9 p-2", text: "text-sm", badge: "text-[10px]" },
    lg: { icon: "w-11 h-11", container: "w-11 h-11 p-2.5", text: "text-base", badge: "text-[11px]" },
    xl: { icon: "w-14 h-14", container: "w-14 h-14 p-3", text: "text-xl", badge: "text-xs" },
  };

  const config = $derived(SIZE_MAP[size]);
</script>

{#snippet emblem()}
  <div
    class="relative rounded-xl flex items-center justify-center overflow-hidden transition-all duration-200 select-none group shrink-0 bg-linear-to-b from-(--core) via-(--surface) to-(--paper) border border-(--line) shadow-sm hover:border-(--accent) hover:shadow-md hover:shadow-(--shadow) {config.container} {className}"
    title="SoundsSource Rust"
  >
    <!-- Subtle Specular Top Arc -->
    <div class="absolute inset-x-0 top-0 h-[35%] bg-linear-to-b from-(--hi) to-transparent pointer-events-none"></div>

    <!-- Vector Brandmark SVG: 5 Minimalist Sound Wave Bars -->
    <svg
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      class="w-full h-full relative z-10"
    >
      <defs>
        <!-- Harmonic Studio Sound Gradient: Dynamic Theme Spectrum -->
        <linearGradient id="appSonicGradient" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="var(--strong)" style="stop-color: var(--strong);" />
          <stop offset="50%" stop-color="var(--focus)" style="stop-color: var(--focus);" />
          <stop offset="100%" stop-color="var(--accent)" style="stop-color: var(--accent);" />
        </linearGradient>
      </defs>

      <!-- 5 Clean Rhythmic Equalizer Sound Bars with Rounded Caps -->
      <rect
        x="6.5"
        y="13"
        width="3.2"
        height="10"
        rx="1.6"
        fill="url(#appSonicGradient)"
        opacity="0.8"
        class={animated ? "animate-pulse" : ""}
        style="animation-delay: 0.2s"
      />
      <rect
        x="11.8"
        y="8"
        width="3.2"
        height="20"
        rx="1.6"
        fill="url(#appSonicGradient)"
        opacity="0.92"
        class={animated ? "animate-pulse" : ""}
        style="animation-delay: 0.1s"
      />
      <rect
        x="17.1"
        y="4.5"
        width="3.2"
        height="27"
        rx="1.6"
        fill="url(#appSonicGradient)"
        class={animated ? "animate-pulse" : ""}
      />
      <rect
        x="22.4"
        y="8"
        width="3.2"
        height="20"
        rx="1.6"
        fill="url(#appSonicGradient)"
        opacity="0.92"
        class={animated ? "animate-pulse" : ""}
        style="animation-delay: 0.1s"
      />
      <rect
        x="27.7"
        y="13"
        width="3.2"
        height="10"
        rx="1.6"
        fill="url(#appSonicGradient)"
        opacity="0.8"
        class={animated ? "animate-pulse" : ""}
        style="animation-delay: 0.2s"
      />
    </svg>
  </div>
{/snippet}

{#if variant === "icon-only"}
  {@render emblem()}
{:else}
  <div class="flex items-center gap-2.5 select-none">
    {@render emblem()}
    <div class="flex flex-col min-w-0">
      <div class="flex items-center gap-1.5 leading-none">
        <span class="font-bold tracking-tight text-(--ink) font-heading truncate {config.text}">
          Sounds<span class="text-(--accent) font-extrabold">Source</span>
        </span>
        <span
          class="font-mono font-bold uppercase tracking-wider text-(--accent) bg-(--accent)/10 px-1.5 py-0.5 rounded border border-(--accent)/20 shrink-0 {config.badge}"
        >
          RUST
        </span>
      </div>
      <span class="text-[10px] text-(--muted) font-medium tracking-normal mt-0.5 truncate">
        macOS CoreAudio & AI Studio Hub
      </span>
    </div>
  </div>
{/if}
