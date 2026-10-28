<script lang="ts">
  import { untrack } from "svelte";
  import { PetRenderer, PET_MOTION, petFormAura } from "@/shared/lib/petRenderer";
  import { INSTALLED_PETS, resolvePetActiveForm, type PetFormMeta } from "@/components/pet/types";
  import { readPetFormPreference } from "@/lib/petPreferences";

  interface Props {
    slug: string;
    formId?: string;
    spritesheetPath?: string;
    mood: "idle" | "working" | "reading" | "waiting" | "done" | "celebrate" | "sleepy";
    size?: number;
    /** Level used to resolve the form when no formId is given. */
    level?: number;
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
    level = 1,
    revision,
    class: className = "",
    onclick,
  }: Props = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);
  let renderer = $state<PetRenderer | null>(null);
  let lastLoadedPath = $state<string>("");

  function resolveForm(currentSlug: string, currentForm: string | undefined, currentLevel: number): PetFormMeta | null {
    const archetype = INSTALLED_PETS.find((p) => p.id === currentSlug);
    if (!archetype?.forms?.length) return null;
    const pref = currentForm && currentForm !== "default" ? currentForm : readPetFormPreference(currentSlug);
    return resolvePetActiveForm(archetype, currentLevel, pref);
  }

  function computeSpritesheetPath(currentSlug: string, currentForm?: string, directPath?: string): string {
    if (directPath) return directPath;
    if (currentForm && currentForm !== "default" && currentForm !== "auto") {
      return resolveForm(currentSlug, currentForm, level)?.spritesheetPath
        ?? `/pets/${currentSlug}/forms/${currentForm}/spritesheet.webp`;
    }
    return resolveForm(currentSlug, currentForm, level)?.spritesheetPath ?? `/pets/${currentSlug}/spritesheet.webp`;
  }

  const activeForm = $derived(resolveForm(slug, formId, level));
  const activeAura = $derived(petFormAura(slug, activeForm?.id));

  // Reaching a new form plays a short power-up: the jump clip under a full aura burst.
  const LEVEL_UP_MS = 2400;
  let previousForm: PetFormMeta | null = null;
  let poweringUp = $state(false);
  $effect(() => {
    const form = activeForm;
    const before = untrack(() => previousForm);
    previousForm = form;
    if (!form || !before || before.id === form.id || form.minLevel <= before.minLevel) return;
    poweringUp = true;
    const timer = setTimeout(() => (poweringUp = false), LEVEL_UP_MS);
    return () => {
      clearTimeout(timer);
      poweringUp = false;
    };
  });

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
      r.setAura(activeAura);
      r.setState(poweringUp ? "levelup" : mood);
    });

    return () => {
      r.destroy();
      renderer = null;
    };
  });

  // Backing store in device pixels, so the pet is equally crisp on 1x, 2x and 3x displays.
  const readDpr = () => Math.min(3, Math.max(1, window.devicePixelRatio || 1));
  let dpr = $state(readDpr());
  // Moving the window to a display with another pixel ratio flips this query.
  $effect(() => {
    const query = window.matchMedia?.(`(resolution: ${dpr}dppx)`);
    if (!query) return;
    const update = () => (dpr = readDpr());
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  });

  // Canvas dimension changes clear its pixels, including while animation is frozen.
  $effect(() => {
    void size;
    void dpr;
    renderer?.draw();
  });

  // Update renderer.setSlug, renderer.load, and renderer.setState(mood) reactively
  $effect(() => {
    void revision;
    const currentSlug = slug;
    const currentMood = poweringUp ? "levelup" : mood;
    const path = computeSpritesheetPath(currentSlug, formId, spritesheetPath);
    const aura = activeAura;
    if (renderer) {
      renderer.setSlug(currentSlug);
      renderer.setAura(aura);
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
  class="{className} pet-3d-stage relative flex items-center justify-center"
  style="width: {size}px; height: {size}px; padding: 0; border: 0; background: transparent; perspective: 600px;"
>
  <canvas
    bind:this={canvas}
    width={Math.round(size * dpr)}
    height={Math.round(size * dpr)}
    style="width: {size}px; height: {size}px; transform: rotateX({tiltX}deg) rotateY({tiltY}deg) {isHovered ? 'scale(1.03)' : 'scale(1)'}; transition: transform 0.15s cubic-bezier(0.2, 0.8, 0.2, 1); {(PET_MOTION[slug]?.pixel ?? true) ? 'image-rendering: -webkit-optimize-contrast; image-rendering: crisp-edges; image-rendering: pixelated;' : 'image-rendering: auto;'}"
    class="cursor-pointer select-none drop-shadow-md relative z-10"
  ></canvas>
</svelte:element>
