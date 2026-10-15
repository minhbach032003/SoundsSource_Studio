import { useState, useEffect, useRef, useCallback } from "react";
import { playSectorTick } from "@/lib/pingAudio";

export interface LolPingGestureOptions {
  triggerKey: string; // "alt" | "ctrl" | "shift" | "g" | "v" | "win"
  dragThreshold: number; // e.g. 65
  clickPing: boolean;
  tickSound: boolean;
  volume: number;
  enabled?: boolean;
  onDispatch: (result: { sliceIndex: number; x: number; y: number }) => void;
  onQuickPing: (result: { x: number; y: number }) => void;
  onCancel?: () => void;
}

export interface LolPingGestureState {
  isHolding: boolean;
  origin: { x: number; y: number } | null;
  currentPos: { x: number; y: number } | null;
  activeSlice: number | null;
  rotationDegrees: number;
  distance: number;
}

function matchesTrigger(e: KeyboardEvent, trigger: string): boolean {
  const norm = trigger.toLowerCase();
  if (norm === "alt") return e.key === "Alt";
  if (norm === "ctrl") return e.key === "Control";
  if (norm === "shift") return e.key === "Shift";
  if (norm === "win") return e.key === "Meta";
  if (norm === "g") return e.code === "KeyG" || e.key === "g" || e.key === "G";
  if (norm === "v") return e.code === "KeyV" || e.key === "v" || e.key === "V";
  return e.key.toLowerCase() === norm;
}

export function useLolPingGesture({
  triggerKey,
  dragThreshold,
  clickPing,
  tickSound,
  volume,
  enabled = true,
  onDispatch,
  onQuickPing,
  onCancel,
}: LolPingGestureOptions) {
  const [gestureState, setGestureState] = useState<LolPingGestureState>({
    isHolding: false,
    origin: null,
    currentPos: null,
    activeSlice: null,
    rotationDegrees: 0,
    distance: 0,
  });

  const mousePosRef = useRef<{ x: number; y: number }>({ x: 200, y: 200 });
  const isHoldingRef = useRef(false);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const activeSliceRef = useRef<number | null>(null);
  const lastTickSliceRef = useRef<number | null>(null);

  // Global mouse position tracking
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      mousePosRef.current = { x: e.clientX, y: e.clientY };

      if (!isHoldingRef.current || !originRef.current) return;

      const dx = e.clientX - originRef.current.x;
      const dy = e.clientY - originRef.current.y;
      const dist = Math.hypot(dx, dy);

      const rawAngle = Math.atan2(dy, dx) * (180 / Math.PI);
      const clockwiseDeg = (rawAngle + 90 + 360) % 360;

      if (dist < dragThreshold) {
        activeSliceRef.current = null;
        setGestureState((prev) => ({
          ...prev,
          currentPos: { x: e.clientX, y: e.clientY },
          activeSlice: null,
          rotationDegrees: clockwiseDeg,
          distance: dist,
        }));
        return;
      }

      // Compass sector 0..8 (North = 0)
      const sliceIdx = Math.floor(((clockwiseDeg + 22.5) % 360) / 45) % 8;

      if (sliceIdx !== lastTickSliceRef.current) {
        if (tickSound) {
          playSectorTick(volume);
        }
        lastTickSliceRef.current = sliceIdx;
      }

      activeSliceRef.current = sliceIdx;
      setGestureState({
        isHolding: true,
        origin: originRef.current,
        currentPos: { x: e.clientX, y: e.clientY },
        activeSlice: sliceIdx,
        rotationDegrees: clockwiseDeg,
        distance: dist,
      });
    };

    window.addEventListener("mousemove", handleGlobalMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleGlobalMouseMove);
  }, [dragThreshold, tickSound, volume]);

  // Keydown / Keyup / Cancellation
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing in input/textarea
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) {
        return;
      }

      if (e.key === "Escape" && isHoldingRef.current) {
        e.preventDefault();
        isHoldingRef.current = false;
        originRef.current = null;
        activeSliceRef.current = null;
        setGestureState({
          isHolding: false,
          origin: null,
          currentPos: null,
          activeSlice: null,
          rotationDegrees: 0,
          distance: 0,
        });
        onCancel?.();
        return;
      }

      if (!isHoldingRef.current && matchesTrigger(e, triggerKey) && !e.repeat) {
        isHoldingRef.current = true;
        const origin = { ...mousePosRef.current };
        originRef.current = origin;
        activeSliceRef.current = null;
        lastTickSliceRef.current = null;

        setGestureState({
          isHolding: true,
          origin,
          currentPos: origin,
          activeSlice: null,
          rotationDegrees: 0,
          distance: 0,
        });
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (isHoldingRef.current && matchesTrigger(e, triggerKey)) {
        const origin = originRef.current;
        const slice = activeSliceRef.current;
        const currentPos = { ...mousePosRef.current };

        isHoldingRef.current = false;
        originRef.current = null;
        activeSliceRef.current = null;
        lastTickSliceRef.current = null;

        setGestureState({
          isHolding: false,
          origin: null,
          currentPos: null,
          activeSlice: null,
          rotationDegrees: 0,
          distance: 0,
        });

        if (slice !== null) {
          onDispatch({ sliceIndex: slice, x: currentPos.x, y: currentPos.y });
        } else if (clickPing && origin) {
          onQuickPing({ x: origin.x, y: origin.y });
        } else {
          onCancel?.();
        }
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      if (isHoldingRef.current) {
        e.preventDefault();
        isHoldingRef.current = false;
        originRef.current = null;
        activeSliceRef.current = null;
        setGestureState({
          isHolding: false,
          origin: null,
          currentPos: null,
          activeSlice: null,
          rotationDegrees: 0,
          distance: 0,
        });
        onCancel?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("contextmenu", handleContextMenu);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [enabled, triggerKey, clickPing, onDispatch, onQuickPing, onCancel]);

  const cancelGesture = useCallback(() => {
    isHoldingRef.current = false;
    originRef.current = null;
    activeSliceRef.current = null;
    setGestureState({
      isHolding: false,
      origin: null,
      currentPos: null,
      activeSlice: null,
      rotationDegrees: 0,
      distance: 0,
    });
    onCancel?.();
  }, [onCancel]);

  return {
    ...gestureState,
    cancelGesture,
  };
}
