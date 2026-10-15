/**
 * Headphone Stereo Channel Audio Synthesizer (Web Audio API)
 * Plays an audible, spatialized stereo test chime strictly in the Left or Right earphone.
 */

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!sharedAudioCtx) {
    const AudioCtxClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtxClass) {
      sharedAudioCtx = new AudioCtxClass();
    }
  }
  if (sharedAudioCtx && sharedAudioCtx.state === "suspended") {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

export interface PlayChannelTestOptions {
  volume?: number; // 0.0 to 1.0 (default 0.7)
  durationSeconds?: number;
}

/**
 * Play a spatialized stereo test chime into either the "left" or "right" headphone channel.
 * - Left channel: C5 (523.25 Hz) with 100% Left pan (-1.0)
 * - Right channel: G5 (783.99 Hz) with 100% Right pan (+1.0)
 */
export async function playHeadphoneChannelTone(
  channel: "left" | "right",
  options: PlayChannelTestOptions = {}
): Promise<void> {
  const ctx = getAudioContext();
  if (!ctx) return;

  const { volume = 0.7, durationSeconds = 0.35 } = options;
  const now = ctx.currentTime;

  // 1. Oscillator: Left = 523.25Hz (C5), Right = 783.99Hz (G5)
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(channel === "left" ? 523.25 : 783.99, now);

  // Add subtle second harmonic for warmth
  const harmonic = ctx.createOscillator();
  harmonic.type = "triangle";
  harmonic.frequency.setValueAtTime((channel === "left" ? 523.25 : 783.99) * 2, now);

  // 2. Gain envelope (gentle attack, smooth decay bell chime)
  const mainGain = ctx.createGain();
  mainGain.gain.setValueAtTime(0.001, now);
  mainGain.gain.linearRampToValueAtTime(volume * 0.45, now + 0.02);
  mainGain.gain.exponentialRampToValueAtTime(0.0001, now + durationSeconds);

  const harmonicGain = ctx.createGain();
  harmonicGain.gain.setValueAtTime(0.001, now);
  harmonicGain.gain.linearRampToValueAtTime(volume * 0.12, now + 0.02);
  harmonicGain.gain.exponentialRampToValueAtTime(0.0001, now + durationSeconds * 0.8);

  osc.connect(mainGain);
  harmonic.connect(harmonicGain);

  const mixer = ctx.createGain();
  mainGain.connect(mixer);
  harmonicGain.connect(mixer);

  // 3. Stereo Spatial Panner (-1.0 for Left, +1.0 for Right)
  if (typeof ctx.createStereoPanner === "function") {
    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(channel === "left" ? -1.0 : 1.0, now);
    mixer.connect(panner);
    panner.connect(ctx.destination);
  } else {
    // Fallback using ChannelMerger if StereoPanner is unavailable
    const merger = ctx.createChannelMerger(2);
    if (channel === "left") {
      mixer.connect(merger, 0, 0); // Connect to Left channel only
    } else {
      mixer.connect(merger, 0, 1); // Connect to Right channel only
    }
    merger.connect(ctx.destination);
  }

  osc.start(now);
  harmonic.start(now);
  osc.stop(now + durationSeconds + 0.05);
  harmonic.stop(now + durationSeconds + 0.05);

  return new Promise((resolve) => {
    setTimeout(resolve, (durationSeconds + 0.06) * 1000);
  });
}
