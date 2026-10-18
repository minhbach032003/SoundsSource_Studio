// Renders and animates an authentic AgentPet spritesheet onto an HTML5 Canvas.
// Ported directly from AgentPet's SpriteSlicer + Canvas Renderer.
// Keeps the sheet's authored cell anchors: trimming each frame independently causes jitter.

import { readPetPreferences, readPetBinding, subscribePetPreferences } from "../../lib/petPreferences";

const COLS = 8;
const ROWS = 9;
const ALPHA_THRESHOLD = 16;

// Row index mappings per archetype, matching the legacy AgentPet PetBindings & SpriteSlicer.
// 0 Idle, 1 RunRight/Walk, 2 RunLeft, 3 Waving (Done), 4 Jumping (Celebrate), 5 Sleepy/Failed, 6 Waiting, 7 Frantic Coding, 8 Reading/Review
export const DEFAULT_STATE_ROW: Record<string, number> = {
  idle: 0,
  registered: 0,
  working: 7, // Frantically typing / running
  reading: 8, // Reading docs / review
  waiting: 6, // Looking around, waiting for input
  done: 3, // Waving goodbye to completed task
  celebrate: 4, // Jumping with joy
  sleepy: 5,
  levelup: 6,
};

// Archetype-specific row mappings for pets that arrange animations differently
export const ARCHETYPE_STATE_ROW: Record<string, Record<string, number>> = {
  "work-blue-cat": {
    idle: 0,
    registered: 0,
    working: 7, // Coding on green keyboard
    reading: 8, // Reading documentation / inspecting
    waiting: 6,
    done: 3,
    celebrate: 4,
    sleepy: 5,
  },
  "code-frenzy-cat": {
    idle: 0,
    registered: 0,
    working: 7, // Frantic laptop typing
    reading: 8, // Inspecting terminal
    waiting: 6,
    done: 3,
    celebrate: 4,
    sleepy: 5,
  },
  "wode-daodun-3d": {
    idle: 0,
    registered: 0,
    working: 1, // Sword & Shield guard run
    reading: 1,
    waiting: 2, // Shield defense
    done: 3,
    celebrate: 4, // Victory jump
    sleepy: 5,
  },
  boba: {
    idle: 0,
    registered: 0,
    working: 7,
    reading: 8,
    waiting: 6,
    done: 3,
    celebrate: 4,
    sleepy: 5,
  },
  eddy: {
    idle: 0,
    registered: 0,
    working: 7,
    reading: 8,
    waiting: 6,
    done: 3,
    celebrate: 4,
    sleepy: 5,
  },
  "shinchan-3": {
    idle: 0,
    registered: 0,
    working: 7,
    reading: 8,
    waiting: 6,
    done: 3,
    celebrate: 4,
    sleepy: 5,
  },
  "super-saiyan-goku": {
    idle: 0,
    registered: 0,
    working: 7,
    reading: 8,
    waiting: 6,
    done: 3,
    celebrate: 4,
    sleepy: 5,
  },
};

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Frames are hand-authored, not interpolated: keep pixel art crisp and avoid ghosting.
// The existing frame-rate slider remains an upper bound, not a global forced rate.
export const PET_MOTION: Record<string, {
  rates: readonly number[];
  restFrame: number;
  pixel: boolean;
  dynamics: {
    idleBreathSpeed: number; // Hz (cycles/sec)
    idleBreathHeight: number; // px at standard scale
    workBobSpeed: number;
    workBobHeight: number;
    swayAngle: number; // degrees
    glowPulse?: boolean;
  };
}> = {
  boba: {
    rates: [6, 10, 10, 8, 10, 5, 6, 9, 6],
    restFrame: 7,
    pixel: true,
    dynamics: { idleBreathSpeed: 1.2, idleBreathHeight: 2.2, workBobSpeed: 3.0, workBobHeight: 1.5, swayAngle: 1.2 },
  },
  eddy: {
    rates: [6, 11, 11, 9, 11, 6, 7, 10, 7],
    restFrame: 6,
    pixel: true,
    dynamics: { idleBreathSpeed: 1.4, idleBreathHeight: 2.0, workBobSpeed: 3.8, workBobHeight: 2.0, swayAngle: 1.8 },
  },
  "code-frenzy-cat": {
    rates: [7, 12, 12, 10, 12, 6, 8, 12, 8],
    restFrame: 5,
    pixel: true,
    dynamics: { idleBreathSpeed: 1.6, idleBreathHeight: 1.8, workBobSpeed: 5.5, workBobHeight: 2.6, swayAngle: 1.5 },
  },
  "work-blue-cat": {
    rates: [6, 11, 11, 8, 11, 6, 7, 12, 7],
    restFrame: 7,
    pixel: true,
    dynamics: { idleBreathSpeed: 1.3, idleBreathHeight: 1.9, workBobSpeed: 4.8, workBobHeight: 2.2, swayAngle: 1.2 },
  },
  "shinchan-3": {
    rates: [7, 12, 12, 10, 12, 6, 8, 11, 8],
    restFrame: 7,
    pixel: true,
    dynamics: { idleBreathSpeed: 1.8, idleBreathHeight: 2.5, workBobSpeed: 4.2, workBobHeight: 3.0, swayAngle: 2.5 },
  },
  "super-saiyan-goku": {
    rates: [7, 12, 12, 10, 12, 6, 8, 12, 8],
    restFrame: 6,
    pixel: true,
    dynamics: { idleBreathSpeed: 1.5, idleBreathHeight: 2.0, workBobSpeed: 5.0, workBobHeight: 2.8, swayAngle: 1.0, glowPulse: true },
  },
  "wode-daodun-3d": {
    rates: [6, 11, 11, 8, 11, 6, 7, 11, 7],
    restFrame: 5,
    pixel: false,
    dynamics: { idleBreathSpeed: 1.1, idleBreathHeight: 2.4, workBobSpeed: 3.4, workBobHeight: 1.8, swayAngle: 1.6 },
  },
};

export function petAnimationFps(slug: string, row: number, preference: number): number {
  const rate = (PET_MOTION[slug] ?? PET_MOTION["work-blue-cat"]!).rates[row] ?? 8;
  return Math.min(rate, Math.min(12, Math.max(1, preference)));
}

export function petFrameIndex(slug: string, row: number, count: number, step: number): number {
  if (count <= 1) return 0;
  step = Math.max(0, Math.floor(step));
  // Sleep is a settling action, not an endless collapse / wake-up loop.
  if (row === 5) return Math.min(step, count - 1, (PET_MOTION[slug] ?? PET_MOTION["work-blue-cat"]!).restFrame);
  // Thoughtful head turns and looking around return through the intermediate poses.
  if (row === 6 || row === 8) {
    const phase = step % (2 * count - 2);
    return phase < count ? phase : 2 * count - 2 - phase;
  }
  // Let the neutral pose breathe and a wave / landing resolve before repeating.
  const hold = row === 0 ? 2 : row === 3 ? 1 : row === 4 ? 2 : 0;
  const phase = step % (count + hold);
  return row === 0 ? Math.max(0, phase - hold) : Math.min(phase, count - 1);
}

export function drawPetFrame(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  r: Rect,
  slug: string,
  canvas = ctx.canvas,
  dynamicsOffset: { offsetY: number; rotationDeg: number; squashY: number } = { offsetY: 0, rotationDeg: 0, squashY: 1 }
): Rect {
  const { width, height } = canvas;
  const scale = Math.min(width / r.w, height / r.h);
  // Nearest-neighbor sampling keeps pixel art crisp without whole-step size jumps
  // when resizing. The shaded 3D pet alone uses smooth resampling.
  const pixel = PET_MOTION[slug]?.pixel ?? true;
  const w = Math.round(r.w * scale), h = Math.round(r.h * scale);
  const x = Math.round((width - w) / 2), y = height - h;
  ctx.imageSmoothingEnabled = !pixel;
  ctx.clearRect(0, 0, width, height);

  const { offsetY, rotationDeg, squashY } = dynamicsOffset;
  const hasTransform = (offsetY !== 0 || rotationDeg !== 0 || squashY !== 1) && typeof ctx.save === "function";

  if (hasTransform) {
    ctx.save();
    // Pivot around bottom center of sprite so ground contacts stay anchored
    const pivotX = width / 2;
    const pivotY = height;
    if (typeof ctx.translate === "function") ctx.translate(pivotX, pivotY + offsetY);
    if (rotationDeg !== 0 && typeof ctx.rotate === "function") ctx.rotate((rotationDeg * Math.PI) / 180);
    if (squashY !== 1 && typeof ctx.scale === "function") ctx.scale(1 / Math.sqrt(squashY), squashY);
    if (typeof ctx.translate === "function") ctx.translate(-pivotX, -pivotY);
  }

  ctx.drawImage(img, r.x, r.y, r.w, r.h, x, y, w, h);

  if (hasTransform) {
    ctx.restore();
  }

  return { x, y: y + Math.round(offsetY), w, h };
}

export function slice(img: HTMLImageElement): Rect[][] {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return [];
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0);

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return []; // Fall back to fixed grid if CORS blocked
  }

  // All bundled sheets use an 8 × 9 grid; empty trailing cells are not frames.
  // A single local-space envelope across the sheet preserves hand/foot placement,
  // jump height and body size across frames AND state changes.
  if (w % COLS || h % ROWS) return [];
  const fw = w / COLS, fh = h / ROWS;
  const occupied = Array.from({ length: ROWS }, () => new Set<number>());
  let left = fw, top = fh, right = 0, bottom = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if ((data[(y * w + x) * 4 + 3] ?? 0) <= ALPHA_THRESHOLD) continue;
      occupied[Math.floor(y / fh)]!.add(Math.floor(x / fw));
      const lx = x % fw, ly = y % fh;
      left = Math.min(left, lx); top = Math.min(top, ly);
      right = Math.max(right, lx + 1); bottom = Math.max(bottom, ly + 1);
    }
  }
  if (right <= left || bottom <= top) return [];
  return occupied.map((columns, row) => Array.from(columns).sort((a, b) => a - b).map(col => ({
    x: col * fw + left, y: row * fh + top,
    w: right - left, h: bottom - top,
  })));
}

export class PetRenderer {
  private ctx: CanvasRenderingContext2D;
  private img = new Image();
  private loaded = false;
  private clips: Rect[][] = [];
  private frame = 0;
  private row = 0;
  private lastTick = 0;
  private fps = 12;
  private dynamicsTime = 0;
  private state = "idle";
  private animate = true;
  private unsubscribe: () => void;
  private reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  private inView = true;
  private observer: IntersectionObserver | null = null;
  private onPlaybackChange = () => this.refreshPreferences();
  private isDestroyed = false;
  private loadVersion = 0;
  private animId: number | null = null;

  public headroom = 0;
  public spriteRect: Rect | null = null;

  private slug: string = "code-frenzy-cat";

  constructor(private canvas: HTMLCanvasElement, slug: string = "code-frenzy-cat") {
    const c = canvas.getContext("2d");
    if (!c) throw new Error("no 2d canvas context");
    this.ctx = c;
    this.ctx.imageSmoothingEnabled = false;
    this.slug = slug;
    this.loop = this.loop.bind(this);
    this.reducedMotion?.addEventListener("change", this.onPlaybackChange);
    if (typeof document !== "undefined") document.addEventListener?.("visibilitychange", this.onPlaybackChange);
    if (typeof IntersectionObserver !== "undefined") {
      this.observer = new IntersectionObserver(entries => {
        this.inView = entries[0]?.isIntersecting ?? true;
        this.refreshPreferences();
      });
      this.observer.observe(canvas);
    }
    this.unsubscribe = subscribePetPreferences(() => this.refreshPreferences());
  }

  setSlug(slug: string) {
    if (this.slug !== slug) {
      this.slug = slug;
      this.row = -1;
      this.setState(this.state);
    }
  }

  load(spritesheetUrl: string) {
    if (this.isDestroyed) return;
    const version = ++this.loadVersion;
    const isCurrent = () => !this.isDestroyed && version === this.loadVersion;
    this.loaded = false;
    this.clips = [];
    this.spriteRect = null;
    this.headroom = 0;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!isCurrent()) return;
      this.img = img;
      this.clips = slice(img);
      this.frame = 0;
      this.lastTick = performance.now();
      this.loaded = true;
      this.draw();
    };

    img.onerror = () => {
      if (!isCurrent()) return;
      const plain = new Image();
      plain.onload = () => {
        if (!isCurrent()) return;
        this.img = plain;
        this.clips = [];
        this.frame = 0;
        this.lastTick = performance.now();
        this.loaded = true;
        this.draw();
      };
      plain.src = spritesheetUrl;
    };

    img.src = spritesheetUrl;
  }

  setState(state: string) {
    this.state = state;
    const customRow = readPetBinding(this.slug, state);

    const petMap = ARCHETYPE_STATE_ROW[this.slug] || DEFAULT_STATE_ROW;
    const row = customRow ?? petMap[state] ?? DEFAULT_STATE_ROW[state] ?? 0;
    const fps = petAnimationFps(this.slug, row, readPetPreferences().fps);
    if (row !== this.row || fps !== this.fps) this.lastTick = performance.now();
    this.fps = fps;
    if (row !== this.row) {
      this.row = row;
      this.frame = 0;
      this.draw();
    }
  }

  private refreshPreferences() {
    const animate = readPetPreferences().animate && !this.reducedMotion?.matches
      && (typeof document === "undefined" || !document.hidden) && this.inView;
    if (animate !== this.animate) this.lastTick = performance.now();
    this.animate = animate;
    this.setState(this.state);
    if (!this.animate && this.animId !== null) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    } else if (this.animate && this.animId === null && !this.isDestroyed) {
      this.animId = requestAnimationFrame(this.loop);
    }
  }

  private currentClip(): Rect[] | null {
    if (!this.clips.length) return null;
    return this.clips[Math.min(this.row, this.clips.length - 1)] ?? null;
  }

  private loop(t: number) {
    this.animId = null;
    if (this.isDestroyed || !this.animate) return;

    // Track smooth 60fps dynamics continuous clock
    this.dynamicsTime = t / 1000;

    let shouldRedraw = false;
    if (this.loaded && t - this.lastTick >= 1000 / this.fps) {
      const interval = 1000 / this.fps;
      // Retain the fractional remainder; never replay an unbounded background backlog.
      const steps = Math.min(COLS, Math.floor((t - this.lastTick) / interval));
      this.lastTick = t - (t - this.lastTick) % interval;
      const count = this.currentClip()?.length || COLS;
      const previous = petFrameIndex(this.slug, this.row, count, this.frame);
      this.frame += steps;
      if (previous !== petFrameIndex(this.slug, this.row, count, this.frame)) shouldRedraw = true;
    }

    // Always redraw at display refresh rate for silky smooth subpixel physics if animated
    if (this.loaded && (shouldRedraw || this.hasContinuousDynamics())) {
      this.draw();
    }

    this.animId = requestAnimationFrame(this.loop);
  }

  private hasContinuousDynamics(): boolean {
    if (!this.animate || this.reducedMotion?.matches) return false;
    // States that feature continuous micro-dynamics
    return ["idle", "working", "reading", "celebrate", "waiting"].includes(this.state);
  }

  public draw() {
    if (!this.loaded) return;
    const { width: W, height: H } = this.canvas;
    if (!W || !H) return;

    let r: Rect;
    const clip = this.currentClip();
    if (clip && clip.length > 0) {
      r = clip[petFrameIndex(this.slug, this.row, clip.length, this.frame)]!;
    } else {
      const fw = this.img.naturalWidth / COLS;
      const fh = this.img.naturalHeight / ROWS;
      if (!fw || !fh) return;
      r = {
        x: petFrameIndex(this.slug, this.row, COLS, this.frame) * fw,
        y: Math.min(this.row, ROWS - 1) * fh,
        w: fw,
        h: fh,
      };
    }

    // Compute subpixel procedural dynamics for ultra-smooth 60fps motion
    const dynamicsOffset = this.computeDynamicsOffset();

    this.spriteRect = drawPetFrame(this.ctx, this.img, r, this.slug, this.canvas, dynamicsOffset);
    this.headroom = this.spriteRect.y / H;
  }

  private computeDynamicsOffset(): { offsetY: number; rotationDeg: number; squashY: number } {
    if (!this.animate || this.reducedMotion?.matches || !this.hasContinuousDynamics()) {
      return { offsetY: 0, rotationDeg: 0, squashY: 1 };
    }

    const dyn = PET_MOTION[this.slug]?.dynamics ?? PET_MOTION["work-blue-cat"]!.dynamics;
    const time = this.dynamicsTime;

    if (this.state === "idle" || this.state === "waiting") {
      // Gentle sine-wave breathing curve
      const breath = Math.sin(time * Math.PI * 2 * dyn.idleBreathSpeed);
      const offsetY = breath * dyn.idleBreathHeight;
      const sway = Math.sin(time * Math.PI * dyn.idleBreathSpeed * 0.5) * (dyn.swayAngle * 0.4);
      const squashY = 1 + breath * 0.015;
      return { offsetY, rotationDeg: sway, squashY };
    }

    if (this.state === "working" || this.state === "reading") {
      // Typing bounce rhythm
      const bob = Math.abs(Math.sin(time * Math.PI * 2 * dyn.workBobSpeed));
      const offsetY = -bob * dyn.workBobHeight;
      const sway = Math.sin(time * Math.PI * dyn.workBobSpeed * 0.5) * dyn.swayAngle;
      const squashY = 1 + (bob - 0.5) * 0.02;
      return { offsetY, rotationDeg: sway, squashY };
    }

    if (this.state === "celebrate") {
      // Energetic celebratory bounce
      const jump = Math.sin(time * Math.PI * 6);
      const offsetY = jump * 3.5;
      const sway = Math.cos(time * Math.PI * 3) * 2.5;
      const squashY = 1 + (jump > 0 ? 0.04 : -0.04);
      return { offsetY, rotationDeg: sway, squashY };
    }

    return { offsetY: 0, rotationDeg: 0, squashY: 1 };
  }

  destroy() {
    this.isDestroyed = true;
    this.unsubscribe();
    this.observer?.disconnect();
    this.reducedMotion?.removeEventListener("change", this.onPlaybackChange);
    if (typeof document !== "undefined") document.removeEventListener?.("visibilitychange", this.onPlaybackChange);
    if (this.animId !== null) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
  }
}
