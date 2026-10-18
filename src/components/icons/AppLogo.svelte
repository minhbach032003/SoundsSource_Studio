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
    sm: { icon: "w-7 h-7", container: "w-7 h-7 p-1", text: "text-xs", badge: "text-[9px]" },
    md: { icon: "w-9 h-9", container: "w-9 h-9 p-1.5", text: "text-sm", badge: "text-[10px]" },
    lg: { icon: "w-11 h-11", container: "w-11 h-11 p-2", text: "text-base", badge: "text-[11px]" },
    xl: { icon: "w-14 h-14", container: "w-14 h-14 p-2.5", text: "text-xl", badge: "text-xs" },
  };

  const config = $derived(SIZE_MAP[size]);
</script>

{#snippet emblem()}
  <div
    class="relative rounded-xl flex items-center justify-center overflow-hidden transition-all duration-200 select-none group shrink-0 bg-linear-to-b from-(--core) via-(--surface) to-(--paper) border border-(--line) shadow-xs hover:border-(--accent) hover:shadow-md hover:shadow-(--shadow) {config.container} {className}"
    title="SoundsSource Studio (Rust CoreAudio)"
  >
    <!-- Specular Ambient Chamfer Arc -->
    <div class="absolute inset-x-0 top-0 h-[40%] bg-linear-to-b from-(--hi) to-transparent opacity-60 pointer-events-none"></div>

    <!-- Vector Brandmark: Tactical Sonic Loom (Acoustic Aperture + Equalizer Waves) -->
    <svg
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      class="w-full h-full relative z-10"
      aria-hidden="true"
    >
      <defs>
        <!-- Dynamic Studio Gradient: Strong -> Focus -> Accent -->
        <linearGradient id="appSonicGradient" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="var(--strong)" style="stop-color: var(--strong);" />
          <stop offset="50%" stop-color="var(--focus)" style="stop-color: var(--focus);" />
          <stop offset="100%" stop-color="var(--accent)" style="stop-color: var(--accent);" />
        </linearGradient>

        <linearGradient id="appSonicGlow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.3" />
          <stop offset="100%" stop-color="transparent" />
        </linearGradient>
      </defs>

      <!-- Outer Tactical Calibration Aperture Ring -->
      <circle
        cx="18"
        cy="18"
        r="15"
        stroke="var(--line)"
        stroke-width="1"
        stroke-dasharray="2 4"
        opacity="0.75"
      />

      <!-- Cardinal Precision Crosshair Ticks -->
      <line x1="18" y1="2" x2="18" y2="4.5" stroke="var(--focus)" stroke-width="1.2" stroke-linecap="round" />
      <line x1="18" y1="31.5" x2="18" y2="34" stroke="var(--focus)" stroke-width="1.2" stroke-linecap="round" />
      <line x1="2" y1="18" x2="4.5" y2="18" stroke="var(--focus)" stroke-width="1.2" stroke-linecap="round" />
      <line x1="31.5" y1="18" x2="34" y2="18" stroke="var(--focus)" stroke-width="1.2" stroke-linecap="round" />

      <!-- Center Ambient Core Glow -->
      <circle cx="18" cy="18" r="9" fill="url(#appSonicGlow)" />

      <!-- Rhythmic Studio Soundwave Bars (5 Frequency Bands with Rounded Caps) -->
      <rect
        x="7.5"
        y="13"
        width="2.8"
        height="10"
        rx="1.4"
        fill="url(#appSonicGradient)"
        opacity="0.7"
        class={animated ? "animate-pulse" : ""}
        style="animation-delay: 0.3s"
      />
      <rect
        x="12.2"
        y="8.5"
        width="2.8"
        height="19"
        rx="1.4"
        fill="url(#appSonicGradient)"
        opacity="0.9"
        class={animated ? "animate-pulse" : ""}
        style="animation-delay: 0.15s"
      />
      <!-- Dominant Center Harmonic Resonator -->
      <rect
        x="16.6"
        y="5.5"
        width="2.8"
        height="25"
        rx="1.4"
        fill="url(#appSonicGradient)"
        class={animated ? "animate-pulse" : ""}
      />
      <rect
        x="21"
        y="8.5"
        width="2.8"
        height="19"
        rx="1.4"
        fill="url(#appSonicGradient)"
        opacity="0.9"
        class={animated ? "animate-pulse" : ""}
        style="animation-delay: 0.15s"
      />
      <rect
        x="25.7"
        y="13"
        width="2.8"
        height="10"
        rx="1.4"
        fill="url(#appSonicGradient)"
        opacity="0.7"
        class={animated ? "animate-pulse" : ""}
        style="animation-delay: 0.3s"
      />

      <!-- Transverse Harmonic Resonant Crest Curve -->
      <path
        d="M6 18C10 14 14 22 18 18C22 14 26 22 30 18"
        stroke="var(--accent)"
        stroke-width="1.2"
        stroke-linecap="round"
        stroke-opacity="0.85"
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
          title="SoundsSource Studio (Rust Core)"
        >
          STUDIO · RUST
        </span>
      </div>
      <span class="text-[10px] text-(--muted) font-medium tracking-normal mt-0.5 truncate">
        macOS CoreAudio DSP & Tactical Companion
      </span>
    </div>
  </div>
{/if}
