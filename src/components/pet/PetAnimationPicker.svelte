<script lang="ts">
  import { untrack } from "svelte";
  import { readPetPreferences, readPetBinding, subscribePetPreferences, writePetStorage } from "@/lib/petPreferences";
  import { DEFAULT_STATE_ROW, ARCHETYPE_STATE_ROW, slice, type Rect } from "@/shared/lib/petRenderer";
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
  let hoverTimer: number | null = null;
  let hoverFrame = 0;
  let prefs = $state(readPetPreferences());
  let bindingVersion = $state(0);
  $effect(() => {
    const unsubscribe = subscribePetPreferences(() => {
      prefs = readPetPreferences();
      bindingVersion = untrack(() => bindingVersion) + 1;
    });
    return () => { unsubscribe(); if (hoverTimer !== null) clearInterval(hoverTimer); };
  });
  $effect(() => {
    void prefs;
    void selectedState;
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
    if (hoverTimer !== null) clearInterval(hoverTimer);
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
      if (hoverTimer !== null) clearInterval(hoverTimer);
      hoverTimer = null;
    };
  });

  // Render static frame on each canvas
  function renderStaticFrame(canvas: HTMLCanvasElement, clip: Rect[]) {
    if (!loadedImage || !clip || clip.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const r = clip[0]!;
    const maxW = Math.max(...clip.map((x) => x.w));
    const sc = Math.min(canvas.width / maxW, canvas.height / r.h);
    const dw = Math.round(r.w * sc);
    const dh = Math.round(r.h * sc);

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(
      loadedImage,
      r.x,
      r.y,
      r.w,
      r.h,
      Math.round((canvas.width - dw) / 2),
      Math.round(canvas.height - dh),
      dw,
      dh
    );
  }

  function renderAnimationFrame(canvas: HTMLCanvasElement, clip: Rect[], frame: number) {
    if (!loadedImage || !clip || clip.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const r = clip[frame % clip.length]!;
    const maxW = Math.max(...clip.map((x) => x.w));
    const sc = Math.min(canvas.width / maxW, canvas.height / r.h);
    const dw = Math.round(r.w * sc);
    const dh = Math.round(r.h * sc);

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(
      loadedImage,
      r.x,
      r.y,
      r.w,
      r.h,
      Math.round((canvas.width - dw) / 2),
      Math.round(canvas.height - dh),
      dw,
      dh
    );
  }

  function handleClipHover(index: number | null) {
    hoveredClip = index;
    if (hoverTimer) {
      clearInterval(hoverTimer);
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
    if (cv && c && prefs.animate) {
      hoverFrame = 0;
      hoverTimer = window.setInterval(() => {
        hoverFrame++;
        renderAnimationFrame(cv, c, hoverFrame);
      }, 1000 / (["idle", "sleepy"].includes(selectedState) ? Math.min(prefs.fps, 2) : prefs.fps));
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
    return { destroy() { if (canvases.get(index) === el) canvases.delete(index); } };
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
    <span>Hover a clip to preview it. Click to bind to <b>{selectedState}</b>.</span>
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
              style="width: 54px; height: 44px; image-rendering: pixelated;"
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
