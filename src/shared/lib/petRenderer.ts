// Renders and animates an authentic AgentPet spritesheet onto an HTML5 Canvas.
// Ported directly from AgentPet's SpriteSlicer + Canvas Renderer.
// Slices sheets with alpha-gutter detection to cleanly isolate frames without pulsing.

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

function segments(occ: Uint8Array): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let start = -1;
  for (let i = 0; i < occ.length; i++) {
    if (occ[i] && start < 0) start = i;
    else if (!occ[i] && start >= 0) {
      out.push([start, i]);
      start = -1;
    }
  }
  if (start >= 0) out.push([start, occ.length]);
  return out;
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

  const rowHas = new Uint8Array(h);
  for (let y = 0; y < h; y++) {
    const off = y * w * 4;
    for (let x = 0; x < w; x++) {
      if ((data[off + x * 4 + 3] ?? 0) > ALPHA_THRESHOLD) {
        rowHas[y] = 1;
        break;
      }
    }
  }

  const clips: Rect[][] = [];
  for (const [y0, y1] of segments(rowHas)) {
    const colHas = new Uint8Array(w);
    for (let y = y0; y < y1; y++) {
      const off = y * w * 4;
      for (let x = 0; x < w; x++) {
        if ((data[off + x * 4 + 3] ?? 0) > ALPHA_THRESHOLD) colHas[x] = 1;
      }
    }
    const clip = segments(colHas).map(([x0, x1]) => ({
      x: x0,
      y: y0,
      w: x1 - x0,
      h: y1 - y0,
    }));
    if (clip.length) clips.push(clip);
  }
  return clips;
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
  private state = "idle";
  private animate = true;
  private unsubscribe: () => void;
  private clipMaxW: number[] = [];
  private isDestroyed = false;
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
    this.unsubscribe = subscribePetPreferences(() => this.refreshPreferences());
  }

  setSlug(slug: string) {
    if (this.slug !== slug) {
      this.slug = slug;
      this.setState(this.state);
    }
  }

  load(spritesheetUrl: string) {
    this.loaded = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (this.isDestroyed) return;
      this.img = img;
      this.clips = slice(img);
      this.clipMaxW = this.clips.map((clip) =>
        Math.max(...clip.map((r) => r.w))
      );
      this.frame = 0;
      this.loaded = true;
      this.draw();
    };

    img.onerror = () => {
      if (this.isDestroyed) return;
      const plain = new Image();
      plain.onload = () => {
        if (this.isDestroyed) return;
        this.img = plain;
        this.clips = [];
        this.frame = 0;
        this.loaded = true;
        this.draw();
      };
      plain.src = spritesheetUrl;
    };

    img.src = spritesheetUrl;
  }

  setState(state: string) {
    this.state = state;
    const prefs = readPetPreferences();
    this.fps = ["idle", "registered", "sleepy"].includes(state) ? Math.min(prefs.fps, 2) : prefs.fps;
    const customRow = readPetBinding(this.slug, state);

    const petMap = ARCHETYPE_STATE_ROW[this.slug] || DEFAULT_STATE_ROW;
    const row = customRow ?? petMap[state] ?? DEFAULT_STATE_ROW[state] ?? 0;
    if (row !== this.row) {
      this.row = row;
      this.frame = 0;
      this.draw();
    }
  }

  private refreshPreferences() {
    this.animate = readPetPreferences().animate;
    this.setState(this.state);
    this.lastTick = performance.now();
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
    if (this.loaded && t - this.lastTick >= 1000 / this.fps) {
      this.lastTick = t;
      this.frame++;
      this.draw();
    }
    this.animId = requestAnimationFrame(this.loop);
  }

  public draw() {
    if (!this.loaded) return;
    const { width: W, height: H } = this.canvas;
    this.ctx.clearRect(0, 0, W, H);

    let r: Rect;
    let scaleW: number;
    const clip = this.currentClip();
    if (clip && clip.length > 0) {
      r = clip[this.frame % clip.length]!;
      scaleW =
        this.clipMaxW[Math.min(this.row, this.clips.length - 1)] || r.w;
    } else {
      const fw = this.img.naturalWidth / COLS;
      const fh = this.img.naturalHeight / ROWS;
      if (!fw || !fh) return;
      r = {
        x: (this.frame % COLS) * fw,
        y: Math.min(this.row, ROWS - 1) * fh,
        w: fw,
        h: fh,
      };
      scaleW = fw;
    }

    const fit = Math.min(W / scaleW, H / r.h);
    const s = fit >= 1 ? Math.floor(fit) : fit;
    const dw = Math.round(r.w * s);
    const dh = Math.round(r.h * s);
    const dx = Math.round((W - dw) / 2);
    const dy = Math.round(H - dh);

    this.headroom = (H - dh) / H;
    this.spriteRect = { x: dx, y: dy, w: dw, h: dh };
    this.ctx.drawImage(this.img, r.x, r.y, r.w, r.h, dx, dy, dw, dh);
  }

  destroy() {
    this.isDestroyed = true;
    this.unsubscribe();
    if (this.animId !== null) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
  }
}
