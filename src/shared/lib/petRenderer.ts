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
    levelup: 4, // Powering up: the jump pose under a full aura burst
  },
  pikachu: {
    idle: 0,
    registered: 0,
    working: 7,
    reading: 8,
    waiting: 6,
    done: 3,
    celebrate: 4,
    sleepy: 5,
    levelup: 4, // 100,000 Volts / Evolution celebration jump
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
    rates: [5, 10, 10, 7, 10, 5, 5, 7, 5],
    restFrame: 7,
    pixel: true,
    dynamics: { idleBreathSpeed: 0.55, idleBreathHeight: 1.2, workBobSpeed: 1.25, workBobHeight: 0.8, swayAngle: 0.5 },
  },
  eddy: {
    rates: [5, 10, 10, 6, 9, 5, 5, 9, 5],
    restFrame: 6,
    pixel: true,
    dynamics: { idleBreathSpeed: 0.35, idleBreathHeight: 0.9, workBobSpeed: 1.5, workBobHeight: 0.7, swayAngle: 0.4 },
  },
  "code-frenzy-cat": {
    rates: [5, 12, 12, 9, 12, 5, 6, 12, 6],
    restFrame: 6,
    pixel: true,
    dynamics: { idleBreathSpeed: 0.70, idleBreathHeight: 1.4, workBobSpeed: 2.0, workBobHeight: 1.5, swayAngle: 0.8, glowPulse: true },
  },
  "work-blue-cat": {
    rates: [6, 10, 10, 7, 10, 5, 5, 12, 5],
    restFrame: 7,
    pixel: true,
    dynamics: { idleBreathSpeed: 0.45, idleBreathHeight: 0.7, workBobSpeed: 1.5, workBobHeight: 0.8, swayAngle: 0.45, glowPulse: true },
  },
  "shinchan-3": {
    rates: [6, 12, 12, 9, 12, 5, 6, 11, 6],
    restFrame: 7,
    pixel: true,
    dynamics: { idleBreathSpeed: 0.85, idleBreathHeight: 1.6, workBobSpeed: 1.8, workBobHeight: 1.6, swayAngle: 1.4 },
  },
  "super-saiyan-goku": {
    rates: [5, 12, 12, 8, 12, 5, 5, 12, 5],
    restFrame: 4,
    pixel: true,
    dynamics: { idleBreathSpeed: 0.50, idleBreathHeight: 1.4, workBobSpeed: 1.85, workBobHeight: 1.5, swayAngle: 0.5, glowPulse: true },
  },
  "wode-daodun-3d": {
    rates: [5, 11, 11, 7, 10, 5, 5, 9, 5],
    restFrame: 5,
    pixel: false,
    dynamics: { idleBreathSpeed: 0.40, idleBreathHeight: 1.2, workBobSpeed: 1.38, workBobHeight: 0.9, swayAngle: 0.6 },
  },
  pikachu: {
    rates: [6, 12, 12, 8, 12, 5, 5, 12, 5],
    restFrame: 5,
    pixel: false,
    dynamics: { idleBreathSpeed: 0.65, idleBreathHeight: 0.9, workBobSpeed: 1.85, workBobHeight: 1.2, swayAngle: 0.7, glowPulse: true },
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
  // Let a wave / landing resolve before repeating.
  // Row 0 (Idle) runs continuous smooth breathing cycles without an artificial 3-frame freeze.
  const hold = row === 3 ? 1 : row === 4 ? 2 : 0;
  const phase = step % (count + hold);
  return Math.min(phase, count - 1);
}

export interface ArchetypeLighting {
  coreX: number;
  coreY: number;
  radiusRatio: number;
  stops: readonly [number, string][];
  groundColor: string;
}

export const ARCHETYPE_LIGHTING: Record<string, ArchetypeLighting> = {
  "super-saiyan-goku": {
    coreX: 0.50,
    coreY: 0.46,
    radiusRatio: 0.65,
    stops: [
      [0, "rgba(254, 240, 138, 0.45)"],
      [0.35, "rgba(250, 204, 21, 0.30)"],
      [0.72, "rgba(103, 232, 249, 0.22)"],
      [1, "rgba(254, 240, 138, 0)"],
    ],
    groundColor: "rgba(250, 204, 21, 0.35)",
  },
  "code-frenzy-cat": {
    coreX: 0.50,
    coreY: 0.72,
    radiusRatio: 0.55,
    stops: [
      [0, "rgba(103, 232, 249, 0.42)"],
      [0.40, "rgba(56, 189, 248, 0.28)"],
      [0.75, "rgba(244, 114, 182, 0.20)"],
      [1, "rgba(103, 232, 249, 0)"],
    ],
    groundColor: "rgba(6, 182, 212, 0.35)",
  },
  "wode-daodun-3d": {
    coreX: 0.50,
    coreY: 0.54,
    radiusRatio: 0.62,
    stops: [
      [0, "rgba(255, 255, 255, 0.40)"],
      [0.35, "rgba(186, 230, 253, 0.28)"],
      [0.70, "rgba(56, 189, 248, 0.16)"],
      [1, "rgba(186, 230, 253, 0)"],
    ],
    groundColor: "rgba(14, 165, 233, 0.35)",
  },
  "work-blue-cat": {
    coreX: 0.48,
    coreY: 0.70,
    radiusRatio: 0.48,
    stops: [
      [0, "rgba(254, 240, 199, 0.32)"],
      [0.35, "rgba(251, 211, 141, 0.22)"],
      [0.70, "rgba(167, 243, 208, 0.16)"],
      [1, "rgba(254, 240, 199, 0)"],
    ],
    groundColor: "rgba(245, 158, 11, 0.30)",
  },
  boba: {
    coreX: 0.50,
    coreY: 0.50,
    radiusRatio: 0.55,
    stops: [
      [0, "rgba(254, 205, 211, 0.40)"],
      [0.45, "rgba(254, 215, 170, 0.26)"],
      [0.80, "rgba(233, 213, 255, 0.18)"],
      [1, "rgba(254, 205, 211, 0)"],
    ],
    groundColor: "rgba(244, 114, 182, 0.32)",
  },
  "shinchan-3": {
    coreX: 0.50,
    coreY: 0.46,
    radiusRatio: 0.58,
    stops: [
      [0, "rgba(254, 240, 138, 0.42)"],
      [0.45, "rgba(251, 146, 60, 0.26)"],
      [0.80, "rgba(248, 113, 113, 0.16)"],
      [1, "rgba(254, 240, 138, 0)"],
    ],
    groundColor: "rgba(250, 204, 21, 0.32)",
  },
  eddy: {
    coreX: 0.50,
    coreY: 0.50,
    radiusRatio: 0.58,
    stops: [
      [0, "rgba(216, 180, 254, 0.42)"],
      [0.45, "rgba(165, 180, 252, 0.28)"],
      [0.80, "rgba(103, 232, 249, 0.18)"],
      [1, "rgba(216, 180, 254, 0)"],
    ],
    groundColor: "rgba(168, 85, 247, 0.32)",
  },
  pikachu: {
    coreX: 0.50,
    coreY: 0.50,
    radiusRatio: 0.62,
    stops: [
      [0, "rgba(254, 240, 138, 0.55)"],
      [0.35, "rgba(250, 204, 21, 0.35)"],
      [0.70, "rgba(56, 189, 248, 0.20)"],
      [1, "rgba(254, 240, 138, 0)"],
    ],
    groundColor: "rgba(234, 179, 8, 0.38)",
  },
};

/** Per-form ki aura, drawn behind the sprite instead of tinting the sprite pixels. */
export interface PetAura {
  inner: string; // hex
  outer?: string; // hex; a second, larger envelope (Blue Kaio-ken, God)
  sparks?: string; // hex; bio-electric bolts around the body (SSJ2, SSJ3)
  intensity?: number;
  calm?: boolean; // Ultra Instinct keeps a faint shimmer even while asleep
}

// Ki aura per evolution form, keyed "<slug>/<formId>". Colours follow
// docs/engineering/goku-form-sprite-redesign-research.md (3.3).
export const FORM_AURAS: Record<string, PetAura> = {
  "super-saiyan-goku/base": { inner: "#f4f7ff", intensity: 0.45 },
  "super-saiyan-goku/kaioken": { inner: "#e0232b", intensity: 0.9 },
  "super-saiyan-goku/ss1": { inner: "#ffd23f" },
  "super-saiyan-goku/ss2": { inner: "#ffd23f", sparks: "#9fe8ff", intensity: 1.05 },
  "super-saiyan-goku/ss3": { inner: "#ffc72c", sparks: "#9fe8ff", intensity: 1.2 },
  "super-saiyan-goku/god": { inner: "#ff4d2e", outer: "#ffb347", intensity: 0.85 },
  "super-saiyan-goku/ssblue": { inner: "#3ecbff" },
  "super-saiyan-goku/blue-kaioken": { inner: "#3ecbff", outer: "#e0232b", intensity: 1.15 },
  "super-saiyan-goku/ui-sign": { inner: "#e8f2ff", outer: "#5aa9ff", calm: true },
  "super-saiyan-goku/mui": { inner: "#f4f7ff", outer: "#bcd6ff", calm: true },
};

export function petFormAura(slug: string, formId: string | null | undefined): PetAura | null {
  return formId ? FORM_AURAS[`${slug}/${formId}`] ?? null : null;
}

const AURA_STATE_STRENGTH: Record<string, number> = {
  idle: 0.55,
  registered: 0.55,
  waiting: 0.5,
  reading: 0.5,
  working: 0.85,
  done: 0.85,
  celebrate: 1.15,
  levelup: 1.45,
  sleepy: 0,
};

function hexRgb(hex: string): string {
  const v = hex.replace("#", "");
  const n = parseInt(v.length === 3 ? v.replace(/./g, (c) => c + c) : v, 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

function auraStrength(aura: PetAura, state: string): number {
  const base = AURA_STATE_STRENGTH[state] ?? 0.55;
  const strength = state === "sleepy" && aura.calm ? 0.2 : base;
  return strength * (aura.intensity ?? 1);
}

// Flame envelope: a soft body glow plus upward-licking tongues around the silhouette.
function drawAuraLayer(
  ctx: CanvasRenderingContext2D,
  rgb: string,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  strength: number,
  t: number
) {
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, ry);
  glow.addColorStop(0, `rgba(${rgb}, ${(0.55 * strength).toFixed(3)})`);
  glow.addColorStop(0.6, `rgba(${rgb}, ${(0.32 * strength).toFixed(3)})`);
  glow.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(rx / ry, 1);
  ctx.translate(-cx, -cy);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, ry, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const tongues = 11;
  ctx.fillStyle = `rgba(${rgb}, ${Math.min(0.7, 0.4 * strength).toFixed(3)})`;
  for (let i = 0; i < tongues; i++) {
    // Spread over the sides and top; tongues all lean upward like rising ki.
    const a = Math.PI * (0.92 + (1.16 * i) / (tongues - 1));
    const flicker = 0.75 + 0.25 * Math.sin(t * 9 + i * 1.7);
    const bx = cx + Math.cos(a) * rx * 0.86;
    const by = cy + Math.sin(a) * ry * 0.86;
    const len = ry * 0.32 * flicker * (0.7 + 0.3 * Math.abs(Math.sin(a)));
    const half = rx * 0.13;
    const tipX = bx + Math.cos(a) * len * 0.35 + Math.sin(t * 6 + i) * half * 0.3;
    const tipY = by - len;
    ctx.beginPath();
    ctx.moveTo(bx - half, by + half * 0.4);
    if (typeof ctx.quadraticCurveTo === "function") {
      // Curved flanks read as flame rather than as flat spikes.
      ctx.quadraticCurveTo(bx - half * 0.9, by - len * 0.45, tipX, tipY);
      ctx.quadraticCurveTo(bx + half * 0.9, by - len * 0.45, bx + half, by + half * 0.4);
    } else {
      ctx.lineTo(tipX, tipY);
      ctx.lineTo(bx + half, by + half * 0.4);
    }
    ctx.fill();
  }
}

function drawFormAura(ctx: CanvasRenderingContext2D, aura: PetAura, x: number, y: number, w: number, h: number, strength: number, t: number) {
  if (
    strength <= 0 ||
    typeof ctx.save !== "function" ||
    typeof ctx.createRadialGradient !== "function" ||
    typeof ctx.beginPath !== "function" ||
    typeof ctx.arc !== "function" ||
    typeof ctx.moveTo !== "function" ||
    typeof ctx.lineTo !== "function" ||
    typeof ctx.fill !== "function" ||
    typeof ctx.scale !== "function" ||
    typeof ctx.translate !== "function"
  ) {
    return;
  }
  const cx = x + w / 2;
  const cy = y + h * 0.55;
  if (aura.outer) drawAuraLayer(ctx, hexRgb(aura.outer), cx, cy, w * 0.46, h * 0.5, strength * 0.9, t + 0.4);
  drawAuraLayer(ctx, hexRgb(aura.inner), cx, cy, w * 0.36, h * 0.44, strength, t);
}

function drawAuraSparks(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number, t: number) {
  if (typeof ctx.save !== "function" || typeof ctx.moveTo !== "function" || typeof ctx.lineTo !== "function" || typeof ctx.stroke !== "function") {
    return;
  }
  ctx.save();
  ctx.strokeStyle = `rgba(${hexRgb(color)}, 0.9)`;
  ctx.lineWidth = Math.max(1.2, w / 120);
  // A new bolt layout roughly every 140ms reads as crackling rather than drifting.
  const seed = Math.floor(t * 7);
  for (let i = 0; i < 3; i++) {
    const r1 = Math.abs(Math.sin(seed * 12.9898 + i * 78.233)) % 1;
    const r2 = Math.abs(Math.sin(seed * 39.3468 + i * 11.135)) % 1;
    const side = i % 2 === 0 ? -1 : 1;
    let px = x + w / 2 + side * w * (0.18 + 0.16 * r1);
    let py = y + h * (0.12 + 0.6 * r2);
    ctx.beginPath();
    ctx.moveTo(px, py);
    for (let k = 0; k < 3; k++) {
      px += side * w * 0.025 * (k % 2 === 0 ? 1 : -0.6);
      py += h * 0.035;
      ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  ctx.restore();
}

export function drawPetFrame(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  r: Rect,
  slug: string,
  canvas = ctx.canvas,
  dynamicsOffset: { offsetY: number; rotationDeg: number; squashY: number; glow?: number } = { offsetY: 0, rotationDeg: 0, squashY: 1, glow: 1 },
  state: string = "",
  aura: PetAura | null = null
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

  const archetypeLighting = ARCHETYPE_LIGHTING[slug] ?? ARCHETYPE_LIGHTING["work-blue-cat"];
  // A form with its own aura keeps its authored colours: only the floor glow takes the aura hue.
  const lighting = aura && archetypeLighting
    ? { ...archetypeLighting, groundColor: `rgba(${hexRgb(aura.outer ?? aura.inner)}, 0.35)` }
    : archetypeLighting;
  const auraTime = typeof performance !== "undefined" ? performance.now() / 1000 : 0;
  const sheetRow = img.naturalHeight ? Math.floor((r.y + 1) / (img.naturalHeight / ROWS)) : -1;
  const isWorkOrRead = state === "working" || state === "reading" || (state === "" && (sheetRow === 7 || sheetRow === 8));
  const isCeleb = state === "celebrate" || state === "done";

  // 3D Isometric Pedestal Disc & Dynamic Floor Shadow:
  // Rendered with subpixel squash & stretch anchored to pet vertical oscillation
  if (
    lighting &&
    typeof ctx.save === "function" &&
    typeof ctx.createRadialGradient === "function" &&
    typeof ctx.beginPath === "function" &&
    typeof ctx.arc === "function" &&
    typeof ctx.fill === "function" &&
    typeof ctx.scale === "function" &&
    typeof ctx.translate === "function"
  ) {
    ctx.save();
    const isAct = isWorkOrRead || isCeleb;
    const baseGroundAlpha = isCeleb ? 0.95 : isAct ? 0.75 : 0.45;
    const gMult = (dynamicsOffset.glow ?? 1) * baseGroundAlpha;
    const gX = width / 2;
    // Ground plane sits at bottom base of canvas
    const gY = height - Math.max(3, Math.round(h * 0.05));
    
    // Dynamic 3D shadow squashes/stretches inversely with vertical bobbing (height jump)
    const normJump = Math.max(-10, Math.min(10, dynamicsOffset.offsetY));
    const shadowFactor = Math.max(0.6, Math.min(1.4, 1.0 - normJump * 0.05));
    const shadowAlpha = Math.max(0.2, Math.min(1.0, 1.0 + normJump * 0.04));

    const rx = Math.max(14, Math.round(w * 0.46 * shadowFactor));
    const ry = Math.max(5, Math.round(rx * 0.28));
    ctx.translate(gX, gY);
    ctx.scale(1, ry / rx);

    // Outer subtle 3D glowing rim
    const gGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    gGrad.addColorStop(0, lighting.groundColor.replace(/[\d.]+\)$/, `${(0.48 * gMult * shadowAlpha).toFixed(3)})`));
    gGrad.addColorStop(0.55, lighting.groundColor.replace(/[\d.]+\)$/, `${(0.22 * gMult * shadowAlpha).toFixed(3)})`));
    gGrad.addColorStop(1, lighting.groundColor.replace(/[\d.]+\)$/, "0)"));
    ctx.fillStyle = gGrad;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();

    // Inner contact shadow (dark ground occlusion)
    const innerRx = Math.max(6, Math.round(rx * 0.55));
    const innerGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, innerRx);
    innerGrad.addColorStop(0, `rgba(0, 0, 0, ${(0.42 * shadowAlpha).toFixed(3)})`);
    innerGrad.addColorStop(0.7, `rgba(0, 0, 0, ${(0.15 * shadowAlpha).toFixed(3)})`);
    innerGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = innerGrad;
    ctx.beginPath();
    ctx.arc(0, 0, innerRx, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Subpixel 60fps continuous micro-dynamics (hermite interpolated)
  const effOffsetY = pixel ? Math.round(dynamicsOffset.offsetY) : dynamicsOffset.offsetY;
  const effRotation = pixel ? 0 : dynamicsOffset.rotationDeg;
  const effSquash = pixel ? 1 : dynamicsOffset.squashY;
  const hasTransform = (effOffsetY !== 0 || effRotation !== 0 || effSquash !== 1) && typeof ctx.save === "function";

  if (hasTransform) {
    ctx.save();
    // Pivot around bottom center of sprite so ground contacts stay anchored
    const pivotX = width / 2;
    const pivotY = height;
    if (typeof ctx.translate === "function") ctx.translate(pivotX, pivotY + effOffsetY);
    if (effRotation !== 0 && typeof ctx.rotate === "function") ctx.rotate((effRotation * Math.PI) / 180);
    if (effSquash !== 1 && typeof ctx.scale === "function") ctx.scale(1 / Math.sqrt(effSquash), effSquash);
    if (typeof ctx.translate === "function") ctx.translate(-pivotX, -pivotY);
  }

  if (aura) drawFormAura(ctx, aura, x, y, w, h, auraStrength(aura, state), auraTime);

  ctx.drawImage(img, r.x, r.y, r.w, r.h, x, y, w, h);

  if (aura?.sparks && state !== "sleepy") drawAuraSparks(ctx, aura.sparks, x, y, w, h, auraTime);

  // Archetype lighting and screen reflections composite (source-atop preserves sprite silhouette)
  if (
    lighting &&
    !aura &&
    typeof ctx.save === "function" &&
    typeof ctx.createRadialGradient === "function" &&
    typeof ctx.beginPath === "function" &&
    typeof ctx.arc === "function" &&
    typeof ctx.fill === "function"
  ) {
    ctx.save();
    const glowMult = dynamicsOffset.glow ?? 1;
    const stateAlpha = isCeleb ? 1.35 : (state === "working" || sheetRow === 7) ? 1.0 : isWorkOrRead ? 0.8 : 0.42;
    const effGlow = glowMult * stateAlpha;

    const screenX = x + w * lighting.coreX;
    const screenY = y + h * lighting.coreY;
    const glowRadius = Math.max(w, h) * lighting.radiusRatio;

    const grad = ctx.createRadialGradient(screenX, screenY, 2, screenX, screenY - h * 0.08, glowRadius);
    for (const [pos, col] of lighting.stops) {
      if (pos === 1) {
        grad.addColorStop(1, col);
      } else {
        const match = col.match(/^rgba\(([\d\s,]+),\s*([\d.]+)\)$/);
        if (match) {
          const rgb = match[1];
          const a = (parseFloat(match[2]!) * effGlow).toFixed(3);
          grad.addColorStop(pos, `rgba(${rgb}, ${a})`);
        } else {
          grad.addColorStop(pos, col);
        }
      }
    }

    if (typeof ctx.globalCompositeOperation === "string") {
      ctx.globalCompositeOperation = "source-atop";
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(screenX, screenY - h * 0.06, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    // Archetype special micro-effects on character silhouette
    if (
      slug === "super-saiyan-goku" &&
      (isWorkOrRead || isCeleb) &&
      typeof ctx.moveTo === "function" &&
      typeof ctx.lineTo === "function" &&
      typeof ctx.stroke === "function"
    ) {
      ctx.strokeStyle = (dynamicsOffset.glow ?? 1) > 0.85 ? "rgba(103, 232, 249, 0.85)" : "rgba(254, 240, 138, 0.75)";
      ctx.lineWidth = 1.5;
      const sparkPhase = (dynamicsOffset.glow ?? 1) * 12;
      const sparkX1 = x + w * 0.35 + Math.sin(sparkPhase) * 3;
      const sparkY1 = y + h * 0.22;
      ctx.beginPath();
      ctx.moveTo(sparkX1, sparkY1);
      ctx.lineTo(sparkX1 + 3, sparkY1 + 4);
      ctx.lineTo(sparkX1 - 2, sparkY1 + 8);
      ctx.stroke();

      const sparkX2 = x + w * 0.65 + Math.cos(sparkPhase) * 3;
      const sparkY2 = y + h * 0.26;
      ctx.beginPath();
      ctx.moveTo(sparkX2, sparkY2);
      ctx.lineTo(sparkX2 - 3, sparkY2 + 4);
      ctx.lineTo(sparkX2 + 2, sparkY2 + 8);
      ctx.stroke();
    } else if (
      slug === "code-frenzy-cat" &&
      (isWorkOrRead || isCeleb) &&
      typeof ctx.fillRect === "function"
    ) {
      const pulse = dynamicsOffset.glow ?? 1;
      ctx.fillStyle = `rgba(103, 232, 249, ${(0.28 * pulse).toFixed(3)})`;
      const scanY = y + h * 0.68 + (pulse * 6) % 10;
      ctx.fillRect(x + w * 0.28, scanY, w * 0.44, 1.5);
    } else if (
      slug === "wode-daodun-3d" &&
      (isWorkOrRead || isCeleb) &&
      typeof ctx.arc === "function" &&
      typeof ctx.save === "function"
    ) {
      // Blade and shield dynamic shimmer
      const pulse = dynamicsOffset.glow ?? 1;
      const glintX = x + w * 0.35;
      const glintY = y + h * 0.42;
      const glintR = 2.5 + pulse * 1.5;
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      ctx.beginPath();
      ctx.arc(glintX, glintY, glintR, 0, Math.PI * 2);
      ctx.fill();

      // Shield rim metallic gleam
      const shieldX = x + w * 0.68;
      const shieldY = y + h * 0.62;
      ctx.fillStyle = `rgba(186, 230, 253, ${(0.35 * pulse).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(shieldX, shieldY, 4 * pulse, 0, Math.PI * 2);
      ctx.fill();
    } else if (
      slug === "pikachu" &&
      (isWorkOrRead || isCeleb) &&
      typeof ctx.moveTo === "function" &&
      typeof ctx.lineTo === "function" &&
      typeof ctx.stroke === "function"
    ) {
      // Thunderbolt cheek sparks & electric tail lightning bolts
      if (typeof ctx.globalCompositeOperation === "string") {
        ctx.globalCompositeOperation = "source-over";
      }
      const pulse = dynamicsOffset.glow ?? 1;
      const isReading = state === "reading" || (state === "" && sheetRow === 8);
      const isCelebration = isCeleb;
      const tick = Math.floor(auraTime * (isCelebration ? 18 : isReading ? 7 : 13));
      const j1 = ((tick * 7) % 5) - 2;
      const j2 = ((tick * 11) % 5) - 2;
      const j3 = ((tick * 13) % 4) - 1;

      // Electric bolt styling: crisp miter joins and round caps
      ctx.lineWidth = isCelebration ? 2.0 : 1.5;
      if (typeof ctx.lineCap === "string") ctx.lineCap = "round";
      if (typeof ctx.lineJoin === "string") ctx.lineJoin = "miter";

      // Cyan-gold alternating electric discharge
      const cyanStroke = "rgba(56, 189, 248, 0.95)";
      const goldStroke = "rgba(250, 204, 21, 0.95)";
      const brightGold = "rgba(254, 240, 138, 0.95)";

      // Left cheek electric zigzag bolt
      const c1X = x + w * 0.37;
      const c1Y = y + h * 0.52;
      ctx.strokeStyle = tick % 2 === 0 ? cyanStroke : goldStroke;
      ctx.beginPath();
      ctx.moveTo(c1X, c1Y);
      ctx.lineTo(c1X - 4 + j1, c1Y + 2);
      ctx.lineTo(c1X - 1 + j2, c1Y + 5);
      ctx.lineTo(c1X - 5 + j3, c1Y + 8);
      if (isCelebration) {
        ctx.lineTo(c1X - 2, c1Y + 11);
      }
      ctx.stroke();

      // Right cheek electric zigzag bolt (mirrored)
      if (!isReading || pulse > 0.9) {
        const c2X = x + w * 0.63;
        const c2Y = y + h * 0.52;
        ctx.strokeStyle = tick % 2 === 0 ? goldStroke : cyanStroke;
        ctx.beginPath();
        ctx.moveTo(c2X, c2Y);
        ctx.lineTo(c2X + 4 - j2, c2Y + 2);
        ctx.lineTo(c2X + 1 - j1, c2Y + 5);
        ctx.lineTo(c2X + 5 - j3, c2Y + 8);
        if (isCelebration) {
          ctx.lineTo(c2X + 2, c2Y + 11);
        }
        ctx.stroke();
      }

      // Tail lightning spark tip (in working and celebration)
      if (!isReading) {
        const tX = x + w * 0.82;
        const tY = y + h * 0.56;
        ctx.strokeStyle = isCelebration ? brightGold : pulse > 0.88 ? cyanStroke : goldStroke;
        ctx.beginPath();
        ctx.moveTo(tX, tY);
        ctx.lineTo(tX + 4 + j3, tY - 3);
        ctx.lineTo(tX + 1 + j1, tY - 7);
        ctx.lineTo(tX + 5 + j2, tY - 10);
        if (isCelebration) {
          // Additional lightning fork branch for 100,000 Volts victory!
          ctx.lineTo(tX + 2, tY - 14);
          ctx.moveTo(tX + 1 + j1, tY - 7);
          ctx.lineTo(tX - 3, tY - 10);
        }
        ctx.stroke();
      }
    } else if (
      slug === "work-blue-cat" &&
      (isWorkOrRead || isCeleb) &&
      typeof ctx.fillRect === "function" &&
      typeof ctx.createLinearGradient === "function"
    ) {
      // Cozy Indie Coder: Warm soft laptop screen glow & floating code reflection
      const pulse = dynamicsOffset.glow ?? 1;
      const screenX = x + w * 0.12;
      const screenY = y + h * 0.70;
      const screenW = w * 0.38;
      const screenH = h * 0.22;

      // Soft upward terminal screen ambient fan
      const screenGrad = ctx.createLinearGradient(screenX, screenY + screenH, screenX + screenW * 0.5, screenY);
      screenGrad.addColorStop(0, `rgba(56, 189, 248, ${(0.22 * pulse).toFixed(3)})`);
      screenGrad.addColorStop(0.5, `rgba(52, 211, 153, ${(0.14 * pulse).toFixed(3)})`);
      screenGrad.addColorStop(1, "rgba(56, 189, 248, 0)");
      ctx.fillStyle = screenGrad;
      ctx.fillRect(screenX, screenY, screenW, screenH);

      // Subtle IDE code line glimmer reflections across screen edge
      const lineY1 = screenY + screenH * 0.35 + ((auraTime * 8) % (screenH * 0.45));
      ctx.fillStyle = `rgba(186, 230, 253, ${(0.32 * pulse).toFixed(3)})`;
      ctx.fillRect(screenX + 4, lineY1, screenW * 0.55, 1.2);

      if (isCeleb) {
        // Build success: warm green compiler pass flash on the laptop
        ctx.fillStyle = `rgba(74, 222, 128, ${(0.28 * pulse).toFixed(3)})`;
        ctx.fillRect(screenX + 2, screenY + 2, screenW - 4, screenH - 4);
      }
    }

    ctx.restore();
  }

  if (hasTransform) {
    ctx.restore();
  }

  return { x, y: y + Math.round(effOffsetY), w, h };
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

export const CLOUDINARY_PETS_BASE = "https://res.cloudinary.com/mvvfpbof/image/upload/pets";

interface CachedSpriteSheet {
  img: HTMLImageElement;
  clips: Rect[][];
}
const SHEET_CACHE = new Map<string, CachedSpriteSheet>();

export function resolvePetSpritesheetUrls(slugOrPath: string): { cdnUrl: string; localUrl: string } {
  // If a direct form path is passed, e.g. /pets/super-saiyan-goku/forms/ss4/spritesheet.webp
  if (slugOrPath.startsWith("/pets/") && slugOrPath.includes("/forms/")) {
    return {
      cdnUrl: slugOrPath,
      localUrl: slugOrPath,
    };
  }

  const match = slugOrPath.match(/^\/?pets\/([^/]+)\/spritesheet\.webp$/);
  const slug = match ? match[1] : slugOrPath;
  return {
    cdnUrl: `${CLOUDINARY_PETS_BASE}/${slug}/spritesheet.webp`,
    localUrl: `/pets/${slug}/spritesheet.webp`,
  };
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
  private phase = 0;
  private prevPose = { offsetY: 0, rotationDeg: 0, squashY: 1, glow: 1 };
  private transitionStart = 0;
  private transitionDuration = 0.22; // 220ms smooth C2 quintic hermite blend
  private lastRafTime: number | null = null;
  private lastDrawTime = 0;
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
  private aura: PetAura | null = null;

  constructor(private canvas: HTMLCanvasElement, slug: string = "code-frenzy-cat") {
    const c = canvas.getContext("2d");
    if (!c) throw new Error("no 2d canvas context");
    this.ctx = c;
    this.ctx.imageSmoothingEnabled = false;
    this.slug = slug;
    this.loop = this.loop.bind(this);
    this.reducedMotion?.addEventListener("change", this.onPlaybackChange);
    if (typeof document !== "undefined") document.addEventListener?.("visibilitychange", this.onPlaybackChange);
    // Observe visibility for regular DOM flows, with safe fallback to prevent stalls on transparent/floating overlay windows
    if (typeof IntersectionObserver !== "undefined") {
      this.observer = new IntersectionObserver(entries => {
        // If intersectionRatio is zero but element has natural client bounds, keep inView active (Tauri transparent window safeguard)
        const entry = entries[0];
        const isVisible = entry ? (entry.isIntersecting || entry.intersectionRatio > 0 || (canvas.offsetWidth > 0 && canvas.offsetHeight > 0)) : true;
        this.inView = isVisible;
        this.refreshPreferences();
      });
      try {
        this.observer.observe(canvas);
      } catch {}
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

  setAura(aura: PetAura | null) {
    if (this.aura !== aura) {
      this.aura = aura;
      this.draw();
    }
  }

  getCurrentUrl(): string {
    return this.img?.src || "";
  }

  load(spritesheetUrl: string) {
    if (this.isDestroyed) return;
    const version = ++this.loadVersion;
    const isCurrent = () => !this.isDestroyed && version === this.loadVersion;

    const { cdnUrl, localUrl } = resolvePetSpritesheetUrls(
      spritesheetUrl.startsWith("/pets/") ? spritesheetUrl : this.slug
    );
    const primaryUrl = spritesheetUrl.startsWith("http") ? spritesheetUrl : cdnUrl;
    const fallbackUrl = spritesheetUrl.startsWith("http") ? undefined : localUrl;

    // Check in-memory sheet cache first to avoid re-slicing and canvas flickering
    const cached = SHEET_CACHE.get(primaryUrl) || (fallbackUrl ? SHEET_CACHE.get(fallbackUrl) : undefined);
    if (cached) {
      this.img = cached.img;
      this.clips = cached.clips;
      this.frame = 0;
      this.lastTick = performance.now();
      this.loaded = true;
      this.draw();
      return;
    }

    this.loaded = false;
    this.clips = [];
    this.spriteRect = null;
    this.headroom = 0;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const tryLoad = (url: string, nextFallback?: () => void) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        if (!isCurrent()) return;
        this.img = img;
        this.clips = slice(img);
        SHEET_CACHE.set(url, { img, clips: this.clips });
        this.frame = 0;
        this.lastTick = performance.now();
        this.loaded = true;
        this.draw();
      };

      img.onerror = () => {
        if (!isCurrent()) return;
        if (nextFallback) {
          nextFallback();
        } else {
          const plain = new Image();
          plain.onload = () => {
            if (!isCurrent()) return;
            this.img = plain;
            this.clips = [];
            SHEET_CACHE.set(url, { img: plain, clips: [] });
            this.frame = 0;
            this.lastTick = performance.now();
            this.loaded = true;
            this.draw();
          };
          plain.src = url;
        }
      };

      img.src = url;
    };

    if (fallbackUrl && fallbackUrl !== primaryUrl) {
      tryLoad(primaryUrl, () => tryLoad(fallbackUrl));
    } else {
      tryLoad(primaryUrl);
    }
  }

  setState(state: string) {
    this.state = state;
    const customRow = readPetBinding(this.slug, state);

    const petMap = ARCHETYPE_STATE_ROW[this.slug] || DEFAULT_STATE_ROW;
    const row = customRow ?? petMap[state] ?? DEFAULT_STATE_ROW[state] ?? 0;
    const fps = petAnimationFps(this.slug, row, readPetPreferences().fps);
    if (row !== this.row) {
      this.lastTick = performance.now();
      // Capture current outgoing procedural pose for seamless C2 blending into new state
      this.prevPose = this.computeRawStatePose(this.state);
      this.transitionStart = performance.now() / 1000;
      this.row = row;
      this.frame = 0;
      this.draw();
    } else if (fps !== this.fps) {
      this.lastTick = performance.now();
    }
    this.fps = fps;
  }

  private refreshPreferences() {
    const isDocVisible = typeof document === "undefined" || !document.hidden;
    const animate = readPetPreferences().animate && !this.reducedMotion?.matches && isDocVisible && this.inView;
    if (animate !== this.animate) {
      this.lastTick = performance.now();
      this.lastRafTime = null;
    }
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

  // Continuous smooth micro-dynamics: dynamic redraw up to 60 FPS
  // for active states and 45 FPS for idle breathing to preserve fluid motion
  private loop(t: number) {
    this.animId = null;
    if (this.isDestroyed || !this.animate) {
      this.lastRafTime = null;
      return;
    }

    const nowSec = t / 1000;
    // Bound dt between 0 and 100ms; avoid accumulator explosions or negative steps
    const dt = this.lastRafTime === null ? 0.016 : Math.min(Math.max(nowSec - this.lastRafTime, 0), 0.1);
    this.lastRafTime = nowSec;

    // Continuous smooth phase integration (prevents clock jumps on pause/resume)
    const dyn = PET_MOTION[this.slug]?.dynamics ?? PET_MOTION["work-blue-cat"]!.dynamics;
    const speed = (this.state === "working" || this.state === "reading") ? dyn.workBobSpeed : dyn.idleBreathSpeed;
    this.phase = (this.phase + Math.PI * 2 * speed * dt) % (Math.PI * 2);

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

    // Smooth 60fps micro-dynamics: allow fluid redraw intervals for all states
    const isIdle = this.state === "idle";
    // ~30fps for idle, full 60fps for actions
    const minDynamicsInterval = isIdle ? 33 : 0;
    // A flickering aura alone (done, level up) needs ~20fps, not 60.
    const auraOnly = !["idle", "working", "reading", "celebrate", "waiting"].includes(this.state);
    const canDrawDynamics = this.hasContinuousDynamics() && (t - this.lastDrawTime >= minDynamicsInterval) && (!auraOnly || t - this.lastDrawTime >= 50);

    if (this.loaded && (shouldRedraw || canDrawDynamics)) {
      this.lastDrawTime = t;
      this.draw();
    }

    this.animId = requestAnimationFrame(this.loop);
  }

  private hasContinuousDynamics(): boolean {
    if (!this.animate || this.reducedMotion?.matches) return false;
    // States that feature continuous micro-dynamics; a ki aura flickers in every waking state.
    if (this.aura && this.state !== "sleepy") return true;
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

    this.spriteRect = drawPetFrame(this.ctx, this.img, r, this.slug, this.canvas, dynamicsOffset, this.state, this.aura);
    this.headroom = this.spriteRect.y / H;
  }

  private computeRawStatePose(state: string): { offsetY: number; rotationDeg: number; squashY: number; glow: number } {
    const dyn = PET_MOTION[this.slug]?.dynamics ?? PET_MOTION["work-blue-cat"]!.dynamics;
    const p = this.phase;

    if (state === "idle" || state === "waiting") {
      // Smooth sinusoidal natural respiration (no velocity cusp)
      const breath = Math.sin(p);
      const offsetY = breath * dyn.idleBreathHeight;
      const sway = Math.sin(p * 0.5) * (dyn.swayAngle * 0.4);
      const squashY = 1 + breath * 0.012;
      return { offsetY, rotationDeg: sway, squashY, glow: 1 };
    }

    if (state === "working") {
      // Harmonic bounce with zero velocity cusp at ground contact
      const bob = 0.5 - 0.5 * Math.cos(p);
      const offsetY = -bob * dyn.workBobHeight;
      const sway = Math.sin(p * 0.5) * dyn.swayAngle;
      const squashY = 1 + bob * 0.015;
      const glow = dyn.glowPulse ? 0.75 + 0.25 * Math.sin(p * 2) : 1;
      return { offsetY, rotationDeg: sway, squashY, glow };
    }

    if (state === "reading") {
      // Calm inspection: quiet head tilt, no typing bounce
      const sway = Math.sin(p * 0.5) * (dyn.swayAngle * 0.6);
      const breath = Math.sin(p);
      const glow = dyn.glowPulse ? 0.85 + 0.15 * Math.sin(p) : 1;
      return { offsetY: breath * (dyn.idleBreathHeight * 0.5), rotationDeg: sway, squashY: 1, glow };
    }

    if (state === "celebrate") {
      // Smooth continuous celebratory bounce (no sign-flip step jump)
      const jump = 0.5 - 0.5 * Math.cos(p * 2);
      const offsetY = -jump * 2.8;
      const sway = Math.sin(p) * 1.5;
      const squashY = 1 + (0.5 - jump) * 0.03;
      return { offsetY, rotationDeg: sway, squashY, glow: 1 };
    }

    return { offsetY: 0, rotationDeg: 0, squashY: 1, glow: 1 };
  }

  private computeDynamicsOffset(): { offsetY: number; rotationDeg: number; squashY: number; glow: number } {
    if (!this.animate || this.reducedMotion?.matches || !this.hasContinuousDynamics()) {
      return { offsetY: 0, rotationDeg: 0, squashY: 1, glow: 1 };
    }

    const currentPose = this.computeRawStatePose(this.state);

    // C2 Quintic Hermite transition blending to completely eliminate sudden jerk on state change
    const nowSec = performance.now() / 1000;
    const elapsed = nowSec - this.transitionStart;
    if (elapsed < this.transitionDuration) {
      const u = Math.min(Math.max(elapsed / this.transitionDuration, 0), 1);
      // Quintic smoothstep: 6u^5 - 15u^4 + 10u^3 (zero 1st and 2nd derivatives at endpoints)
      const w = u * u * u * (u * (u * 6 - 15) + 10);
      const prevGlow = this.prevPose.glow ?? 1;
      const currGlow = currentPose.glow ?? 1;
      return {
        offsetY: this.prevPose.offsetY * (1 - w) + currentPose.offsetY * w,
        rotationDeg: this.prevPose.rotationDeg * (1 - w) + currentPose.rotationDeg * w,
        squashY: this.prevPose.squashY * (1 - w) + currentPose.squashY * w,
        glow: prevGlow * (1 - w) + currGlow * w,
      };
    }

    return currentPose;
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
