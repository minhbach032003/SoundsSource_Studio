<script lang="ts">
  import { slice, type Rect } from "@/shared/lib/petRenderer";
  import { Clapperboard } from "@lucide/svelte";

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

  $effect(() => {
    // Avoid unused warning
    void hoveredClip;
  });

  let loadedImage = $state<HTMLImageElement | null>(null);
  let clips = $state<Rect[][]>([]);
  let canvases = new Map<number, HTMLCanvasElement>();
  let hoverTimer: number | null = null;
  let hoverFrame = 0;

  // Track currently bound clip for the selected state and slug
  let currentBoundClip = $derived.by(() => {
    if (typeof localStorage === "undefined") return 0;
    const bound = localStorage.getItem(`ap_bind_${slug}_${selectedState}`);
    if (bound !== null) {
      const parsed = parseInt(bound, 10);
      if (Number.isFinite(parsed) && parsed >= 0) {
        return Math.min(parsed, Math.max(0, clips.length - 1));
      }
    }
    // Defaults matching archetype or legacy
    if (selectedState === "working") return Math.min(1, Math.max(0, clips.length - 1));
    if (selectedState === "waiting") return Math.min(2, Math.max(0, clips.length - 1));
    if (selectedState === "done") return Math.min(3, Math.max(0, clips.length - 1));
    if (selectedState === "celebrate") return Math.min(4, Math.max(0, clips.length - 1));
    if (selectedState === "sleepy") return Math.min(5, Math.max(0, clips.length - 1));
    if (selectedState === "levelup") return Math.min(6, Math.max(0, clips.length - 1));
    return 0;
  });

  // Load and slice spritesheet when slug changes
  $effect(() => {
    const currentSlug = slug;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      loadedImage = img;
      const sliced = slice(img);
      clips = sliced.length > 0 ? sliced : [];
    };
    img.src = `/pets/${currentSlug}/spritesheet.webp`;
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
    if (cv && c) {
      hoverFrame = 0;
      hoverTimer = window.setInterval(() => {
        hoverFrame++;
        renderAnimationFrame(cv, c, hoverFrame);
      }, 100); // 10 FPS preview
    }
  }

  function bindClip(index: number) {
    try {
      localStorage.setItem(`ap_bind_${slug}_${selectedState}`, String(index));
      window.dispatchEvent(new Event("storage"));
    } catch {}
    onBindingChange?.(selectedState, index);
  }

  function registerCanvas(el: HTMLCanvasElement | null, index: number) {
    if (!el) {
      canvases.delete(index);
      return;
    }
    canvases.set(index, el);
    const c = clips[index];
    if (c) renderStaticFrame(el, c);
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
      {clips.length} Clips Available
    </span>
  </div>

  <!-- Clips Grid -->
  {#if clips.length > 0}
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
  {:else}
    <div class="text-center py-6 text-xs text-(--muted)">
      Loading animation clips for {slug}...
    </div>
  {/if}
</div>
