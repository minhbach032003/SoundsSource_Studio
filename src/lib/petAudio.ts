// Web Audio API Synthesizer for AgentPet Chimes (Waiting / Done) & Notifications
// Zero external audio assets required.

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Ascending pleasant harmonic chime synthesized via Web Audio API.
 * Triggered when an active agent transitions to "done".
 */
export function playPetDoneChime(volume: number = 75) {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const masterVol = Math.max(0.01, Math.min(1.0, volume / 100)) * 0.35;
  // Gentle ascending triad: C5 (523.25Hz), E5 (659.25Hz), C6 (1046.5Hz)
  const notes = [523.25, 659.25, 1046.5];

  notes.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t = now + idx * 0.08;

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t);

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(masterVol * 0.8, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.38);
  });
}

/**
 * Gentle submarine sonar ping synthesized via Web Audio API.
 * Triggered when an active agent transitions to "waiting".
 */
export function playPetWaitingChime(volume: number = 75) {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const masterVol = Math.max(0.01, Math.min(1.0, volume / 100)) * 0.35;

  // Gentle submarine sonar ping: 440Hz fundamental with 880Hz overtone
  [440, 880].forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const volRatio = idx === 0 ? 0.9 : 0.35;

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.96, now + 0.45);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(masterVol * volRatio, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.58);
  });
}

/**
 * Dispatches desktop notifications for agent state transitions (waiting / done).
 */
export function sendDesktopNotification(title: string, body: string) {
  if (typeof window === "undefined") return;

  if ("Notification" in window) {
    if (Notification.permission === "granted") {
      try {
        new Notification(title, { body });
      } catch {}
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission()
        .then((permission) => {
          if (permission === "granted") {
            try {
              new Notification(title, { body });
            } catch {}
          }
        })
        .catch(() => {});
    }
  }
}

/**
 * Deduplication helper across multi-window instances (AgentPetView and PetOverlay).
 * Prevents double chime / duplicate notification within windowTtlMs.
 */
export function shouldTriggerPetAlert(
  sessionId: string,
  state: string,
  windowTtlMs: number = 10000
): boolean {
  if (typeof window === "undefined" || !sessionId) return true;
  const key = `rust_sound_pet_alert_${sessionId}_${state}`;
  try {
    const last = localStorage.getItem(key);
    const now = Date.now();
    if (last && now - Number(last) < windowTtlMs) {
      return false;
    }
    localStorage.setItem(key, String(now));
    return true;
  } catch {
    return true;
  }
}
