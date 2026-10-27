<script lang="ts">
  import { untrack } from "svelte";
  import { PetRenderer, PET_MOTION } from "@/shared/lib/petRenderer";

  interface Props {
    slug: string;
    mood: "idle" | "working" | "reading" | "waiting" | "done" | "celebrate" | "sleepy";
    size?: number;
    class?: string;
    onclick?: () => void;
  }

  let {
    slug,
    mood,
    size = 200,
    class: className = "",
    onclick,
  }: Props = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);
  let renderer = $state<PetRenderer | null>(null);

  // Initialize PetRenderer, load spritesheet, call setState(mood), and clean up on destroy
  $effect(() => {
    if (!canvas) return;
    const currentSlug = slug;
    const r = new PetRenderer(canvas, currentSlug);
    renderer = r;
    r.load(`/pets/${currentSlug}/spritesheet.webp`);
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

  // Update renderer.setSlug and renderer.setState(mood)
  $effect(() => {
    const currentSlug = slug;
    const currentMood = mood;
    if (renderer) {
      renderer.setSlug(currentSlug);
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
  class="{className} pet-3d-stage"
  style="width: {size}px; height: {size}px; padding: 0; border: 0; background: transparent; perspective: 600px;"
>
  <canvas
    bind:this={canvas}
    width={size * 2}
    height={size * 2}
    style="width: {size}px; height: {size}px; transform: rotateX({tiltX}deg) rotateY({tiltY}deg) {isHovered ? 'scale(1.03)' : 'scale(1)'}; transition: transform 0.15s cubic-bezier(0.2, 0.8, 0.2, 1); {(PET_MOTION[slug]?.pixel ?? true) ? 'image-rendering: -webkit-optimize-contrast; image-rendering: crisp-edges; image-rendering: pixelated;' : 'image-rendering: auto;'}"
    class="cursor-pointer select-none drop-shadow-md"
  ></canvas>
</svelte:element>
