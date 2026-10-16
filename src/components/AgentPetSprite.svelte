<script lang="ts">
  import { untrack } from "svelte";
  import { PetRenderer } from "@/shared/lib/petRenderer";

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
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  {onclick}
  class={className}
  style="width: {size}px; height: {size}px;"
>
  <canvas
    bind:this={canvas}
    width={size * 2}
    height={size * 2}
    style="width: {size}px; height: {size}px; image-rendering: pixelated;"
    class="cursor-pointer select-none"
  ></canvas>
</div>
