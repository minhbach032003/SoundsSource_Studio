import { playSectorTick } from "@/lib/pingAudio";

export type PingMode = "tactical" | "emote";

export interface LolPingGestureOptions {
  triggerKey?: string;
  tacticalTrigger?: string;
  emoteTrigger?: string | null;
  dragThreshold: number;
  clickPing: boolean;
  tickSound: boolean;
  volume: number;
  enabled?: boolean;
  onDispatch: (result: { mode: PingMode; sliceIndex: number; x: number; y: number }) => void;
  onQuickPing: (result: { mode: PingMode; x: number; y: number }) => void;
  onCancel?: () => void;
}

export interface LolPingGestureState {
  isHolding: boolean;
  activeMode: PingMode | null;
  origin: { x: number; y: number } | null;
  currentPos: { x: number; y: number } | null;
  activeSlice: number | null;
  rotationDegrees: number;
  distance: number;
}

function matchesTrigger(e: KeyboardEvent, trigger: string): boolean {
  const norm = trigger.toLowerCase();
  if (norm === "alt") return e.key === "Alt" || e.altKey;
  if (norm === "ctrl") return e.key === "Control" || e.ctrlKey;
  if (norm === "shift") return e.key === "Shift" || e.shiftKey;
  if (norm === "win") return e.key === "Meta" || e.metaKey;
  if (norm === "g") return e.code === "KeyG" || e.key === "g" || e.key === "G";
  if (norm === "v") return e.code === "KeyV" || e.key === "v" || e.key === "V";
  return e.key.toLowerCase() === norm;
}

function isModifierKeyActive(e: MouseEvent, trigger: string): boolean {
  const norm = trigger.toLowerCase();
  if (norm === "alt") return e.altKey;
  if (norm === "ctrl") return e.ctrlKey;
  if (norm === "shift") return e.shiftKey;
  if (norm === "win") return e.metaKey;
  return false;
}

export class LolPingGestureMachine {
  isHolding = $state(false);
  activeMode = $state<PingMode | null>(null);
  origin = $state<{ x: number; y: number } | null>(null);
  currentPos = $state<{ x: number; y: number } | null>(null);
  activeSlice = $state<number | null>(null);
  rotationDegrees = $state(0);
  distance = $state(0);

  private mousePos = { x: 400, y: 300 };
  private keysDown = new Set<string>();
  private activeTrigger: string | null = null;
  private lastTickSlice: number | null = null;

  private cleanupListeners: (() => void) | null = null;

  init(opts: LolPingGestureOptions) {
    if (this.cleanupListeners) {
      this.cleanupListeners();
      this.cleanupListeners = null;
    }

    this.cancel();
    this.keysDown.clear();
    if (typeof window === "undefined" || opts.enabled === false) return;

    const effectiveTactical = opts.tacticalTrigger ?? opts.triggerKey ?? "alt";
    const effectiveEmote = opts.emoteTrigger ?? null;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      this.mousePos = { x: e.clientX, y: e.clientY };
      if (!this.activeTrigger || !this.origin) return;

      const dx = e.clientX - this.origin.x;
      const dy = e.clientY - this.origin.y;
      const dist = Math.hypot(dx, dy);

      const rawAngle = Math.atan2(dy, dx) * (180 / Math.PI);
      const clockwiseDeg = (rawAngle + 90 + 360) % 360;
      const effectiveThreshold = opts.dragThreshold;

      if (dist < effectiveThreshold) {
        this.activeSlice = null;
        this.currentPos = { x: e.clientX, y: e.clientY };
        this.rotationDegrees = clockwiseDeg;
        this.distance = dist;
        return;
      }

      this.isHolding = true;
      const sliceIdx = Math.floor(((clockwiseDeg + 22.5) % 360) / 45) % 8;
      if (sliceIdx !== this.lastTickSlice) {
        if (opts.tickSound) {
          playSectorTick(opts.volume);
        }
        this.lastTickSlice = sliceIdx;
      }

      this.activeSlice = sliceIdx;
      this.currentPos = { x: e.clientX, y: e.clientY };
      this.rotationDegrees = clockwiseDeg;
      this.distance = dist;
    };

    const startHolding = (originPos: { x: number; y: number }, mode: PingMode, trigger: string) => {
      this.isHolding = false;
      this.activeMode = mode;
      this.activeTrigger = trigger;
      this.origin = originPos;
      this.currentPos = originPos;
      this.activeSlice = null;
      this.lastTickSlice = null;
      this.rotationDegrees = 0;
      this.distance = 0;
    };

    const finishGesture = () => {
      const mode = this.activeMode ?? "tactical";
      const slice = this.activeSlice;
      const current = { ...this.mousePos };

      this.cancel();

      if (slice !== null) {
        opts.onDispatch({ mode, sliceIndex: slice, x: current.x, y: current.y });
      } else {
        opts.onCancel?.();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) {
        return;
      }

      if (e.key === "Escape" && this.activeTrigger) {
        e.preventDefault();
        this.cancel();
        opts.onCancel?.();
        return;
      }

      if (!e.repeat) this.keysDown.add(e.key.toLowerCase());
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      this.keysDown.delete(e.key.toLowerCase());
      if (this.activeTrigger && matchesTrigger({ key: e.key, code: e.code } as KeyboardEvent, this.activeTrigger)) {
        this.cancel();
        opts.onCancel?.();
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 2 && this.activeTrigger) {
        this.cancel();
        opts.onCancel?.();
      }
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true'], button, a")) {
        return;
      }

      if (!this.activeTrigger) {
        if (isModifierKeyActive(e, effectiveTactical) || this.keysDown.has(effectiveTactical.toLowerCase())) {
          startHolding({ x: e.clientX, y: e.clientY }, "tactical", effectiveTactical);
        } else if (effectiveEmote && (isModifierKeyActive(e, effectiveEmote) || this.keysDown.has(effectiveEmote.toLowerCase()))) {
          startHolding({ x: e.clientX, y: e.clientY }, "emote", effectiveEmote);
        }
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 0 && this.activeTrigger) {
        handleGlobalMouseMove(e);
        finishGesture();
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      if (this.activeTrigger) {
        e.preventDefault();
        this.cancel();
        opts.onCancel?.();
      }
    };

    const handleBlur = () => {
      this.keysDown.clear();
      this.cancel();
      opts.onCancel?.();
    };
    window.addEventListener("blur", handleBlur);
    window.addEventListener("mousemove", handleGlobalMouseMove, { passive: true });
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("contextmenu", handleContextMenu);

    this.cleanupListeners = () => {
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("mousemove", handleGlobalMouseMove);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("contextmenu", handleContextMenu);
    };
  }

  cancel() {
    this.isHolding = false;
    this.activeMode = null;
    this.activeTrigger = null;
    this.origin = null;
    this.currentPos = null;
    this.activeSlice = null;
    this.lastTickSlice = null;
    this.rotationDegrees = 0;
    this.distance = 0;
  }

  destroy() {
    if (this.cleanupListeners) {
      this.cleanupListeners();
      this.cleanupListeners = null;
    }
    this.cancel();
  }
}

export const lolPingGestureMachine = new LolPingGestureMachine();
