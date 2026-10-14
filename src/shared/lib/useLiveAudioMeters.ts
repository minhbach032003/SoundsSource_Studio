import { useState, useEffect, useRef } from "react";

export interface LiveAudioMeters {
  levelL: number; // 0 to 100
  levelR: number; // 0 to 100
  spectrumHeights: number[]; // 28 values (0 to 100)
  isBeatHit: boolean;
}

const IDLE_HEIGHTS = Array.from({ length: 28 }).map((_, i) =>
  Math.max(4, Math.round(Math.sin(i * 0.4) * 3 + 6))
);

export function useLiveAudioMeters(isActive: boolean = false): LiveAudioMeters {
  const [meters, setMeters] = useState<LiveAudioMeters>({
    levelL: 0,
    levelR: 0,
    spectrumHeights: IDLE_HEIGHTS,
    isBeatHit: false,
  });

  const animFrameRef = useRef<number | null>(null);
  const currentLevelsRef = useRef<{
    l: number;
    r: number;
    bars: number[];
  }>({
    l: 0,
    r: 0,
    bars: [...IDLE_HEIGHTS],
  });

  useEffect(() => {
    let lastTime = performance.now();
    let lastStateDispatch = 0;
    let isMounted = true;

    const stopAnimation = () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };

    const updateFrame = (now: number) => {
      if (!isMounted) return;

      // When document is hidden (background / minimized), stop the animation loop immediately to save CPU & RAM
      if (typeof document !== "undefined" && document.hidden) {
        stopAnimation();
        return;
      }

      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;
      const t = now * 0.001;

      const curr = currentLevelsRef.current;

      if (!isActive) {
        // Smoothly decay to idle
        curr.l = Math.max(0, curr.l - dt * 150);
        curr.r = Math.max(0, curr.r - dt * 150);

        for (let i = 0; i < 28; i++) {
          const target = IDLE_HEIGHTS[i] ?? 4;
          curr.bars[i] = Math.max(target, curr.bars[i] - dt * 90);
        }

        // Throttle React state updates to ~30 FPS to prevent memory churn
        if (now - lastStateDispatch > 30) {
          lastStateDispatch = now;
          setMeters({
            levelL: Math.round(curr.l),
            levelR: Math.round(curr.r),
            spectrumHeights: [...curr.bars],
            isBeatHit: false,
          });
        }

        // Continue running animation loop only if decay is not complete
        if (curr.l > 0.5 || curr.bars.some((b, i) => b > (IDLE_HEIGHTS[i] ?? 4) + 0.5)) {
          animFrameRef.current = requestAnimationFrame(updateFrame);
        } else {
          stopAnimation();
        }
        return;
      }

      // ACTIVE AUDIO: 124 BPM simulated rhythmic pulse + transients
      const bpm = 124;
      const beatFreq = bpm / 60; // ~2.066 Hz
      const beatPhase = (t * beatFreq) % 1.0;
      const beatPulse = Math.pow(Math.max(0, 1.0 - beatPhase * 3.0), 2.5); // Sharp kick transient

      const snarePhase = ((t * beatFreq + 0.5) % 1.0);
      const snarePulse = Math.pow(Math.max(0, 1.0 - snarePhase * 4.0), 3.0);

      // Stereo panning flutter
      const panMod = Math.sin(t * 1.5) * 0.12;

      // Master stereo peaks
      const targetL = Math.min(
        98,
        Math.max(20, (beatPulse * 55 + snarePulse * 30 + Math.sin(t * 7.8) * 12 + 42) * (1 - panMod))
      );
      const targetR = Math.min(
        98,
        Math.max(20, (beatPulse * 52 + snarePulse * 34 + Math.cos(t * 8.2) * 14 + 40) * (1 + panMod))
      );

      // Ballistics: fast attack, realistic analog decay
      const attackSpeed = 0.55;
      const decaySpeed = 0.18;

      curr.l = targetL > curr.l ? curr.l + (targetL - curr.l) * attackSpeed : curr.l + (targetL - curr.l) * decaySpeed;
      curr.r = targetR > curr.r ? curr.r + (targetR - curr.r) * attackSpeed : curr.r + (targetR - curr.r) * decaySpeed;

      // Calculate 28 frequency spectrum bars
      for (let i = 0; i < 28; i++) {
        let barEnergy = 0;

        if (i < 7) {
          const bassWeight = 1.0 - i * 0.08;
          barEnergy =
            beatPulse * 75 * bassWeight +
            Math.sin(t * 12 + i * 0.7) * 18 +
            Math.cos(t * 5.5 + i) * 10 +
            35;
        } else if (i < 19) {
          const midIndex = i - 7;
          barEnergy =
            snarePulse * 50 +
            Math.sin(t * 16.5 + midIndex * 0.8) * 26 +
            Math.cos(t * 9.2 + midIndex * 1.2) * 18 +
            beatPulse * 25 +
            30;
        } else {
          const highIndex = i - 19;
          const shimmer = Math.sin(t * 32.0 + highIndex * 1.5) * 22;
          barEnergy =
            Math.abs(shimmer) +
            snarePulse * 30 +
            Math.cos(t * 14.0 + highIndex) * 14 +
            beatPulse * 15 +
            20;
        }

        const targetBar = Math.min(98, Math.max(8, barEnergy));
        curr.bars[i] =
          targetBar > curr.bars[i]
            ? curr.bars[i] + (targetBar - curr.bars[i]) * 0.45
            : curr.bars[i] + (targetBar - curr.bars[i]) * 0.22;
      }

      // Throttle React state dispatch to ~30 FPS to minimize GC pressure and DOM overhead
      if (now - lastStateDispatch > 30) {
        lastStateDispatch = now;
        setMeters({
          levelL: Math.round(curr.l),
          levelR: Math.round(curr.r),
          spectrumHeights: [...curr.bars],
          isBeatHit: beatPulse > 0.4,
        });
      }

      animFrameRef.current = requestAnimationFrame(updateFrame);
    };

    const startAnimation = () => {
      if (animFrameRef.current === null && (isActive || typeof document === "undefined" || !document.hidden)) {
        lastTime = performance.now();
        animFrameRef.current = requestAnimationFrame(updateFrame);
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopAnimation();
      } else {
        startAnimation();
      }
    };

    startAnimation();

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    return () => {
      isMounted = false;
      stopAnimation();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };
  }, [isActive]);

  return meters;
}
