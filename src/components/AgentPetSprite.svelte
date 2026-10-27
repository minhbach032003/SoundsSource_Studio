<script lang="ts">
  import { untrack } from "svelte";
  import { PetRenderer, PET_MOTION } from "@/shared/lib/petRenderer";
  import { INSTALLED_PETS, resolvePetActiveForm } from "@/components/pet/types";
  import { readPetFormPreference } from "@/lib/petPreferences";
  import { Zap, Sparkles } from "@lucide/svelte";

  interface Props {
    slug: string;
    formId?: string;
    spritesheetPath?: string;
    mood: "idle" | "working" | "reading" | "waiting" | "done" | "celebrate" | "sleepy";
    size?: number;
    revision?: number;
    class?: string;
    onclick?: () => void;
  }

  let {
    slug,
    formId,
    spritesheetPath,
    mood,
    size = 200,
    revision,
    class: className = "",
    onclick,
  }: Props = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);
  let renderer = $state<PetRenderer | null>(null);
  let lastLoadedPath = $state<string>("");

  function computeSpritesheetPath(currentSlug: string, currentForm?: string, directPath?: string): string {
    if (directPath) return directPath;
    if (currentForm && currentForm !== "default" && currentForm !== "auto") {
      return `/pets/${currentSlug}/forms/${currentForm}/spritesheet.webp`;
    }
    const archetype = INSTALLED_PETS.find((p) => p.id === currentSlug);
    if (archetype?.forms && archetype.forms.length > 0) {
      const pref = currentForm && currentForm !== "default" ? currentForm : readPetFormPreference(currentSlug);
      const active = resolvePetActiveForm(archetype, 1, pref);
      if (active?.spritesheetPath) return active.spritesheetPath;
    }
    return `/pets/${currentSlug}/spritesheet.webp`;
  }

  // Initialize PetRenderer, load spritesheet, call setState(mood), and clean up on destroy
  $effect(() => {
    if (!canvas) return;
    const currentSlug = slug;
    const path = computeSpritesheetPath(slug, formId, spritesheetPath);
    const r = new PetRenderer(canvas, currentSlug);
    renderer = r;
    lastLoadedPath = path;
    r.load(path);
    untrack(() => {
      r.setState(mood);
    });

    return () => {
      r.destroy();
      renderer = null;
    };
  });

  // Canvas dimension changes clear its pixels, including while animation is frozen.
  $effect(() => {
    void size;
    renderer?.draw();
  });

  // Update renderer.setSlug, renderer.load, and renderer.setState(mood) reactively
  $effect(() => {
    void revision;
    const currentSlug = slug;
    const currentMood = mood;
    const path = computeSpritesheetPath(currentSlug, formId, spritesheetPath);
    if (renderer) {
      renderer.setSlug(currentSlug);
      if (lastLoadedPath !== path) {
        lastLoadedPath = path;
        renderer.load(path);
      }
      renderer.setState(currentMood);
    }
  });
  let tiltX = $state(0);
  let tiltY = $state(0);
  let isHovered = $state(false);

  function handleMouseMove(e: MouseEvent) {
    if (!canvas) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    tiltX = Number((-y * 14).toFixed(1));
    tiltY = Number((x * 14).toFixed(1));
  }

  function handleMouseLeave() {
    isHovered = false;
    tiltX = 0;
    tiltY = 0;
  }

  function handleMouseEnter() {
    isHovered = true;
  }

  const auraFilterClass = $derived.by(() => {
    if (slug === "super-saiyan-goku") {
      switch (formId) {
        case "kaioken":
          return "aura-goku-kaioken";
        case "ss1":
          return "aura-goku-ss1";
        case "ss2":
          return "aura-goku-ss2";
        case "ss3":
          return "aura-goku-ss3";
        case "god":
          return "aura-goku-god";
        case "ssblue":
          return "aura-goku-ssblue";
        case "blue-kaioken":
          return "aura-goku-blue-kaioken";
        case "ui-sign":
          return "aura-goku-ui-sign";
        case "mui":
          return "aura-goku-mui";
        default:
          return "aura-goku-default";
      }
    }
    return "";
  });
</script>

<svelte:element
  this={onclick ? "button" : "div"}
  type={onclick ? "button" : undefined}
  {onclick}
  onmousemove={handleMouseMove}
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
  role={onclick ? undefined : "img"}
  aria-label={`${slug} — ${mood}${onclick ? ", pet companion" : ""}`}
  class="{className} {auraFilterClass} pet-3d-stage relative flex items-center justify-center"
  style="width: {size}px; height: {size}px; padding: 0; border: 0; background: transparent; perspective: 600px;"
>
  {#if slug === "super-saiyan-goku"}
    <!-- Dynamic Ambient Pulsing Energy Field for Goku Ki Aura -->
    <div
      class="absolute inset-0 rounded-full pointer-events-none opacity-45 blur-2xl transition-all duration-300 animate-pulse {formId === 'kaioken' || formId === 'god'
        ? 'bg-red-500'
        : formId === 'ssblue'
        ? 'bg-sky-400'
        : formId === 'blue-kaioken'
        ? 'bg-gradient-to-tr from-sky-400 via-purple-500 to-rose-500'
        : formId === 'ui-sign'
        ? 'bg-indigo-300'
        : formId === 'mui'
        ? 'bg-slate-100 shadow-[0_0_30px_rgba(255,255,255,0.8)]'
        : 'bg-amber-400'}"
    ></div>
    <!-- Radial Concentrated Inner Aura Core -->
    <div
      class="absolute inset-2 rounded-full pointer-events-none opacity-50 blur-lg transition-all duration-300 {formId === 'kaioken' || formId === 'god'
        ? 'bg-rose-400'
        : formId === 'ssblue'
        ? 'bg-cyan-300'
        : formId === 'blue-kaioken'
        ? 'bg-gradient-to-b from-cyan-300 to-rose-400'
        : formId === 'ui-sign' || formId === 'mui'
        ? 'bg-white'
        : 'bg-yellow-200'}"
    ></div>

    <!-- Divine Ki Flare & Bio-electric Lightning Spark Overlays -->
    {#if formId === "ss2" || formId === "ss3"}
      <div class="pointer-events-none absolute inset-0 z-20 overflow-visible" aria-hidden="true">
        <span class="absolute top-1 left-2 text-cyan-400 animate-pulse drop-shadow-sm"><Zap size={13} /></span>
        <span class="absolute bottom-2 right-2 text-sky-300 animate-bounce drop-shadow-sm"><Zap size={11} /></span>
        <span class="absolute top-4 right-1 text-cyan-300 animate-pulse drop-shadow-sm"><Zap size={10} /></span>
      </div>
    {:else if formId === "god" || formId === "ssblue" || formId === "blue-kaioken" || formId === "ui-sign" || formId === "mui"}
      <div class="pointer-events-none absolute inset-0 z-20 overflow-visible" aria-hidden="true">
        <span class="absolute top-1 right-3 text-amber-200 animate-ping opacity-60 drop-shadow-sm"><Sparkles size={11} /></span>
        <span class="absolute bottom-3 left-2 text-cyan-200 animate-pulse opacity-75 drop-shadow-sm"><Sparkles size={10} /></span>
        <span class="absolute top-6 left-1 text-white animate-pulse opacity-80 drop-shadow-sm"><Sparkles size={9} /></span>
      </div>
    {/if}
  {/if}

  <canvas
    bind:this={canvas}
    width={size * 2}
    height={size * 2}
    style="width: {size}px; height: {size}px; transform: rotateX({tiltX}deg) rotateY({tiltY}deg) {isHovered ? 'scale(1.03)' : 'scale(1)'}; transition: transform 0.15s cubic-bezier(0.2, 0.8, 0.2, 1); {(PET_MOTION[slug]?.pixel ?? true) ? 'image-rendering: -webkit-optimize-contrast; image-rendering: crisp-edges; image-rendering: pixelated;' : 'image-rendering: auto;'}"
    class="cursor-pointer select-none drop-shadow-md relative z-10"
  ></canvas>
</svelte:element>
