<script lang="ts">
  import { untrack } from "svelte";
  import { readPetPreferences, readPetBinding, subscribePetPreferences, writePetStorage } from "@/lib/petPreferences";
  import { DEFAULT_STATE_ROW, ARCHETYPE_STATE_ROW, slice, drawPetFrame, petAnimationFps, petFrameIndex, PET_MOTION, type Rect } from "@/shared/lib/petRenderer";
  import { Clapperboard } from "@lucide/svelte";
  import { toastState } from "@/lib/toast.svelte";

  interface Props {
    slug: string;
    onBindingChange?: (state: string, clipIndex: number) => void;
  }

  let { slug, onBindingChange }: Props = $props();

  const STATES = [
    { id: "idle", label: "Idle" },
    { id: "working", label: "Working" },
    { id: "reading", label: "Reading" },
    { id: "waiting", label: "Waiting" },
    { id: "done", label: "Done" },
    { id: "celebrate", label: "Celebrate" },
    { id: "sleepy", label: "Sleepy" },
    { id: "levelup", label: "Level up" },
  ];

  let selectedState = $state<string>("working");
  let hoveredClip = $state<number | null>(null);

  let loadedImage = $state<HTMLImageElement | null>(null);
  let loadedSlug = $state<string | null>(null);
  let loadError = $state(false);
  let clips = $state<Rect[][]>([]);
  let canvases = new Map<number, HTMLCanvasElement>();
  const visibleClips = new Set<number>();
  let hoverTimer: number | null = null;
  let hoverStart = 0;
  let reducedMotion = $state(false);
  let pageVisible = $state(true);
  $effect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => { reducedMotion = media.matches; pageVisible = !document.hidden; };
    update();
    media.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      media.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
    };
  });
  let prefs = $state(readPetPreferences());
  let bindingVersion = $state(0);
  $effect(() => {
    const unsubscribe = subscribePetPreferences(() => {
      prefs = readPetPreferences();
      bindingVersion = untrack(() => bindingVersion) + 1;
    });
    return () => { unsubscribe(); if (hoverTimer !== null) cancelAnimationFrame(hoverTimer); };
  });
  $effect(() => {
    void prefs;
    void selectedState;
    void reducedMotion;
    void pageVisible;
    untrack(() => handleClipHover(hoveredClip));
  });

  // Track currently bound clip for the selected state and slug
  let currentBoundClip = $derived.by(() => {
    void bindingVersion;
    const row = readPetBinding(slug, selectedState)
      ?? (ARCHETYPE_STATE_ROW[slug] || DEFAULT_STATE_ROW)[selectedState]
      ?? (selectedState === "levelup" ? 6 : 0);
    return Math.min(row, Math.max(0, clips.length - 1));
  });

  // Load and slice spritesheet when slug changes
  $effect(() => {
    const currentSlug = slug;
    let active = true;
    loadedSlug = null;
    loadedImage = null;
    clips = [];
    loadError = false;
    hoveredClip = null;
    if (hoverTimer !== null) cancelAnimationFrame(hoverTimer);
    hoverTimer = null;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!active || slug !== currentSlug) return;
      const sliced = slice(img);
      if (!sliced.length) {
        loadError = true;
        return;
      }
      loadedImage = img;
      clips = sliced;
      loadedSlug = currentSlug;
    };
    img.onerror = () => {
      if (active && slug === currentSlug) loadError = true;
    };
    img.src = `/pets/${currentSlug}/spritesheet.webp`;
    return () => {
      active = false;
      img.onload = null;
      img.onerror = null;
      if (hoverTimer !== null) cancelAnimationFrame(hoverTimer);
      hoverTimer = null;
    };
  });

  function renderStaticFrame(canvas: HTMLCanvasElement, clip: Rect[]) {
    renderAnimationFrame(canvas, clip, 0);
  }

  function renderAnimationFrame(canvas: HTMLCanvasElement, clip: Rect[], frame: number) {
    const ctx = canvas.getContext("2d");
    const r = clip[frame];
    if (loadedImage && ctx && r) drawPetFrame(ctx, loadedImage, r, slug);
  }

  function handleClipHover(index: number | null) {
    hoveredClip = index;
    if (hoverTimer !== null) {
      cancelAnimationFrame(hoverTimer);
      hoverTimer = null;
    }

    if (index === null) {
      // Re-render static frames
      canvases.forEach((cv, i) => {
        const c = clips[i];
        if (c) renderStaticFrame(cv, c);
      });
      return;
    }

    const cv = canvases.get(index);
    const c = clips[index];
    if (cv && c && visibleClips.has(index) && prefs.animate && !reducedMotion && pageVisible) {
      hoverStart = performance.now();
      let lastFrame = -1;
      const tick = (now: number) => {
        const step = Math.floor((now - hoverStart) * petAnimationFps(slug, index, prefs.fps) / 1000);
        const frame = petFrameIndex(slug, index, c.length, step);
        if (frame !== lastFrame) renderAnimationFrame(cv, c, frame);
        lastFrame = frame;
        hoverTimer = requestAnimationFrame(tick);
      };
      hoverTimer = requestAnimationFrame(tick);
    }
  }

  function bindClip(index: number) {
    if (loadedSlug !== slug || !clips[index]) return;
    try {
      writePetStorage(`ap_bind_${slug}_${selectedState}`, String(index));
      onBindingChange?.(selectedState, index);
      if (!onBindingChange) toastState.info("Animation binding saved");
    } catch (error) {
      toastState.error(`Could not save animation binding: ${String(error)}`);
    }
  }

  function registerCanvas(el: HTMLCanvasElement, index: number) {
    canvases.set(index, el);
    const c = clips[index];
    if (c) renderStaticFrame(el, c);
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) visibleClips.add(index);
      else visibleClips.delete(index);
      if (hoveredClip === index) handleClipHover(index);
    });
    observer.observe(el);
    return { destroy() {
      observer.disconnect();
      visibleClips.delete(index);
      if (canvases.get(index) === el) canvases.delete(index);
    } };
  }

  $effect(() => {
    // Redraw static frames whenever clips load or change
    if (clips.length > 0) {
      canvases.forEach((cv, i) => {
        const c = clips[i];
        if (c) renderStaticFrame(cv, c);
      });
    }
  });
</script>

<div class="panel p-4 sm:p-5 shadow-sm space-y-3 select-none">
  <!-- Header -->
  <div class="flex items-center justify-between pb-2 border-b border-(--line) gap-2">
    <div class="flex items-center gap-2">
      <div class="w-6 h-6 rounded-lg bg-(--surface) border border-(--line) flex items-center justify-center text-(--accent-text)">
        <Clapperboard class="w-3.5 h-3.5" />
      </div>
      <div>
        <h4 class="text-xs font-bold text-(--ink) tracking-tight m-0">Animations</h4>
        <p class="text-[10px] text-(--muted) m-0">
          Customize action clips per operational state
        </p>
      </div>
    </div>
  </div>

  <!-- Segmented States Selector -->
  <div class="flex items-center gap-1 p-0.5 bg-(--paper) border border-(--line) rounded-xl overflow-x-auto">
    {#each STATES as s (s.id)}
      {@const isSelected = selectedState === s.id}
      <button
        type="button"
        onclick={() => (selectedState = s.id)}
        class="flex-1 min-w-[70px] py-1 px-2.5 text-xs font-semibold rounded-lg transition-all cursor-pointer text-center whitespace-nowrap {isSelected
          ? 'bg-blue-600 text-white shadow-xs font-bold'
          : 'text-(--muted) hover:text-(--ink) hover:bg-(--surface)'}"
      >
        {s.label}
      </button>
    {/each}
  </div>

  <!-- Hint -->
  <div class="text-[11px] text-(--muted) flex items-center justify-between">
    <span>Hover or focus a clip to preview it. Click to bind to <b>{selectedState}</b>.</span>
    <span class="font-mono text-[10px] text-(--accent-text)">
      {loadedSlug === slug ? clips.length : 0} Clips Available
    </span>
  </div>

  <!-- Clips Grid -->
  {#if loadedSlug === slug && clips.length > 0}
    <div class="grid grid-cols-4 sm:grid-cols-7 lg:grid-cols-9 gap-2">
      {#each clips as _, i (i)}
        {@const isCurrent = i === currentBoundClip}
        <button
          type="button"
          onclick={() => bindClip(i)}
          onmouseenter={() => handleClipHover(i)}
          onmouseleave={() => handleClipHover(null)}
          onfocus={() => handleClipHover(i)}
          onblur={() => handleClipHover(null)}
          class="p-1.5 rounded-xl border flex flex-col items-center justify-between gap-1 transition-all group cursor-pointer relative {isCurrent
            ? 'bg-blue-600/15 border-blue-500 ring-2 ring-blue-500/30'
            : 'bg-(--paper) border-(--line) hover:border-(--focus)'}"
          title="Clip {i + 1}"
          aria-pressed={isCurrent}
        >
          <div class="w-13.5 h-11 flex items-center justify-center overflow-hidden">
            <canvas
              use:registerCanvas={i}
              width={108}
              height={88}
              style="width: 54px; height: 44px; image-rendering: {(PET_MOTION[slug]?.pixel ?? true) ? 'pixelated' : 'auto'};"
              class="pointer-events-none"
            ></canvas>
          </div>
          <span class="text-[10px] font-mono font-medium {isCurrent ? 'text-blue-400 font-bold' : 'text-(--muted)'}">
            Clip {i + 1}
          </span>
        </button>
      {/each}
    </div>
  {:else if loadError}
    <div role="alert" class="text-center py-6 text-xs text-(--muted)">
      Could not load animation clips for {slug}. Select another pet and try again.
    </div>
  {:else}
    <div role="status" class="text-center py-6 text-xs text-(--muted)">
      Loading animation clips for {slug}...
    </div>
  {/if}
</div>
