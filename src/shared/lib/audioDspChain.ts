// Real-Time Web Audio API DSP Graph & Sub-Bass Synthesizer

export const EQ_FREQUENCIES = [
  40, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000,
];

class AudioDspChainManager {
  private ctx: AudioContext | null = null;
  private inputGain: GainNode | null = null;
  private highPassNode: BiquadFilterNode | null = null;
  private bassWarmthNode: BiquadFilterNode | null = null;
  private eqNodes: BiquadFilterNode[] = [];
  private dialogueNode: BiquadFilterNode | null = null;
  private deHissNode: BiquadFilterNode | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;

  private micStream: MediaStream | null = null;
  private micSourceNode: MediaStreamAudioSourceNode | null = null;
  private isMicMonitoring = false;

  private currentGrooveTimer: number | null = null;
  private isPlayingGroove = false;

  public getContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.initGraph();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private initGraph() {
    if (!this.ctx) return;
    const ctx = this.ctx;

    // 1. Input Stage
    this.inputGain = ctx.createGain();
    this.inputGain.gain.setValueAtTime(1.0, ctx.currentTime);

    // 2. High-Pass Filter (85Hz rumble removal)
    this.highPassNode = ctx.createBiquadFilter();
    this.highPassNode.type = "highpass";
    this.highPassNode.frequency.setValueAtTime(85, ctx.currentTime);
    this.highPassNode.Q.setValueAtTime(0.7071, ctx.currentTime);

    // 3. Low-Shelf Sub-Bass Warmth Filter (90Hz)
    this.bassWarmthNode = ctx.createBiquadFilter();
    this.bassWarmthNode.type = "lowshelf";
    this.bassWarmthNode.frequency.setValueAtTime(90, ctx.currentTime);
    this.bassWarmthNode.gain.setValueAtTime(0, ctx.currentTime);

    // 4. 10-Band Parametric EQ Nodes
    this.eqNodes = EQ_FREQUENCIES.map((freq) => {
      const node = ctx.createBiquadFilter();
      node.type = "peaking";
      node.frequency.setValueAtTime(freq, ctx.currentTime);
      node.Q.setValueAtTime(1.1, ctx.currentTime);
      node.gain.setValueAtTime(0, ctx.currentTime);
      return node;
    });

    // 5. Dialogue Presence Booster (3000Hz peaking)
    this.dialogueNode = ctx.createBiquadFilter();
    this.dialogueNode.type = "peaking";
    this.dialogueNode.frequency.setValueAtTime(3000, ctx.currentTime);
    this.dialogueNode.Q.setValueAtTime(1.2, ctx.currentTime);
    this.dialogueNode.gain.setValueAtTime(0, ctx.currentTime);

    // 6. High-Shelf De-Hiss (11kHz)
    this.deHissNode = ctx.createBiquadFilter();
    this.deHissNode.type = "highshelf";
    this.deHissNode.frequency.setValueAtTime(11000, ctx.currentTime);
    this.deHissNode.gain.setValueAtTime(0, ctx.currentTime);

    // 7. Dynamics Compressor (Night Mode limiter)
    this.compressorNode = ctx.createDynamicsCompressor();
    this.compressorNode.threshold.setValueAtTime(0, ctx.currentTime); // Off by default (0dB)
    this.compressorNode.knee.setValueAtTime(10, ctx.currentTime);
    this.compressorNode.ratio.setValueAtTime(4, ctx.currentTime);
    this.compressorNode.attack.setValueAtTime(0.003, ctx.currentTime);
    this.compressorNode.release.setValueAtTime(0.06, ctx.currentTime);

    // 8. Output Stage & Analyser
    this.masterGain = ctx.createGain();
    this.masterGain.gain.setValueAtTime(1.0, ctx.currentTime);

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 128;

    // Connect the audio processing chain:
    // inputGain -> highPass -> bassWarmth -> eqNodes -> dialogue -> deHiss -> compressor -> masterGain -> analyser -> destination
    let current: AudioNode = this.inputGain;
    current.connect(this.highPassNode);
    current = this.highPassNode;

    current.connect(this.bassWarmthNode);
    current = this.bassWarmthNode;

    for (const eqNode of this.eqNodes) {
      current.connect(eqNode);
      current = eqNode;
    }

    current.connect(this.dialogueNode);
    current = this.dialogueNode;

    current.connect(this.deHissNode);
    current = this.deHissNode;

    current.connect(this.compressorNode);
    current = this.compressorNode;

    current.connect(this.masterGain);
    this.masterGain.connect(this.analyser);
    this.analyser.connect(ctx.destination);
  }

  public getInputNode(): GainNode | null {
    this.getContext();
    return this.inputGain;
  }

  // --- Real-Time Filter Parameters ---

  public setBassWarmth(enabled: boolean, gainDb: number = 6.0) {
    this.getContext();
    if (!this.bassWarmthNode || !this.ctx) return;
    const targetGain = enabled ? Math.max(0, Math.min(12, gainDb)) : 0;
    this.bassWarmthNode.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.02);
  }

  public setHighPass(enabled: boolean, cutoffHz: number = 85) {
    this.getContext();
    if (!this.highPassNode || !this.ctx) return;
    const targetFreq = enabled ? cutoffHz : 20;
    this.highPassNode.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.02);
  }

  public setDialogueBoost(enabled: boolean, gainDb: number = 3.5) {
    this.getContext();
    if (!this.dialogueNode || !this.ctx) return;
    const target = enabled ? gainDb : 0;
    this.dialogueNode.gain.setTargetAtTime(target, this.ctx.currentTime, 0.02);
  }

  public setDeHiss(enabled: boolean, gainDb: number = -4.0) {
    this.getContext();
    if (!this.deHissNode || !this.ctx) return;
    const target = enabled ? gainDb : 0;
    this.deHissNode.gain.setTargetAtTime(target, this.ctx.currentTime, 0.02);
  }

  public setNightMode(enabled: boolean) {
    this.getContext();
    if (!this.compressorNode || !this.ctx) return;
    const targetThreshold = enabled ? -16 : 0;
    this.compressorNode.threshold.setTargetAtTime(targetThreshold, this.ctx.currentTime, 0.02);
  }

  public setEQBand(index: number, gainDb: number) {
    this.getContext();
    if (!this.ctx || !this.eqNodes[index]) return;
    const clamped = Math.max(-12, Math.min(12, gainDb));
    this.eqNodes[index].gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.02);
  }

  public setEQBands(gains: number[]) {
    this.getContext();
    if (!this.ctx) return;
    for (let i = 0; i < Math.min(gains.length, this.eqNodes.length); i++) {
      this.setEQBand(i, gains[i] ?? 0);
    }
  }

  public setMasterVolume(volumePct: number) {
    this.getContext();
    if (!this.masterGain || !this.ctx) return;
    const gain = Math.max(0, Math.min(1.0, volumePct / 100));
    this.masterGain.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.02);
  }

  // --- Real-Time 808 Sub-Bass & Musical Groove Player ---

  /**
   * Plays a punchy 808 sub-bass and harmonic acoustic groove through the DSP chain,
   * making sub-bass warmth (+6dB) and EQ bands immediately and audibly obvious.
   */
  public playBassAndGrooveSample(
    durationSeconds: number = 3.5,
    onProgress?: (progress: number) => void
  ): () => void {
    const ctx = this.getContext();
    if (!this.inputGain) return () => {};

    this.stopGrooveSample();
    this.isPlayingGroove = true;

    const startTime = ctx.currentTime;
    const now = startTime;

    // Pattern: 4 beats of heavy 808 sub-bass drops + harmonic chords
    // Beat 0: Deep 808 Sub Kick (drops from 150Hz to 48Hz)
    // Beat 1: Warm bass synth (55Hz / A1)
    // Beat 2: Heavy 808 Sub Kick (drops from 160Hz to 42Hz)
    // Beat 3: Deep bass synth (65Hz / C2) + Snare & Shaker
    const bpm = 110;
    const beatSec = 60 / bpm;

    for (let beat = 0; beat < 6; beat++) {
      const beatTime = now + beat * beatSec;

      if (beat === 0 || beat === 2 || beat === 4) {
        // --- 808 Sub-Bass Kick Drum ---
        const kickOsc = ctx.createOscillator();
        const kickGain = ctx.createGain();

        kickOsc.type = "sine";
        // Pitch drop: fast punch at 155Hz dropping to 48Hz deep sub-bass
        kickOsc.frequency.setValueAtTime(155, beatTime);
        kickOsc.frequency.exponentialRampToValueAtTime(48, beatTime + 0.08);

        // Amplitude envelope: strong hit with deep sub-bass tail
        kickGain.gain.setValueAtTime(0.75, beatTime);
        kickGain.gain.exponentialRampToValueAtTime(0.4, beatTime + 0.12);
        kickGain.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.55);

        kickOsc.connect(kickGain);
        kickGain.connect(this.inputGain);

        kickOsc.start(beatTime);
        kickOsc.stop(beatTime + 0.56);
      } else {
        // --- Warm Sub-Bass Synth Note ---
        const bassOsc = ctx.createOscillator();
        const bassGain = ctx.createGain();
        const bassFreq = beat === 1 ? 55.0 : 65.41;

        bassOsc.type = "triangle"; // Triangle has warm odd harmonics
        bassOsc.frequency.setValueAtTime(bassFreq, beatTime);

        bassGain.gain.setValueAtTime(0.45, beatTime);
        bassGain.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.45);

        bassOsc.connect(bassGain);
        bassGain.connect(this.inputGain);

        bassOsc.start(beatTime);
        bassOsc.stop(beatTime + 0.46);

        // Acoustic Snare / Clap (for testing midrange & speech clarity)
        const snareOsc = ctx.createOscillator();
        const snareGain = ctx.createGain();
        snareOsc.type = "sine";
        snareOsc.frequency.setValueAtTime(240, beatTime);
        snareOsc.frequency.exponentialRampToValueAtTime(90, beatTime + 0.07);

        snareGain.gain.setValueAtTime(0.25, beatTime);
        snareGain.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.14);

        snareOsc.connect(snareGain);
        snareGain.connect(this.inputGain);

        snareOsc.start(beatTime);
        snareOsc.stop(beatTime + 0.15);
      }

      // Crisp high-hat/shaker (for testing high-pass & de-hiss)
      const hihatOsc = ctx.createOscillator();
      const hihatGain = ctx.createGain();
      hihatOsc.type = "square";
      hihatOsc.frequency.setValueAtTime(7500, beatTime);

      hihatGain.gain.setValueAtTime(0.04, beatTime);
      hihatGain.gain.exponentialRampToValueAtTime(0.0001, beatTime + 0.04);

      hihatOsc.connect(hihatGain);
      hihatGain.connect(this.inputGain);

      hihatOsc.start(beatTime);
      hihatOsc.stop(beatTime + 0.045);
    }

    const interval = window.setInterval(() => {
      const elapsed = ctx.currentTime - startTime;
      const progress = Math.min(1.0, elapsed / durationSeconds);
      onProgress?.(progress);

      if (elapsed >= durationSeconds) {
        this.stopGrooveSample();
      }
    }, 50);

    this.currentGrooveTimer = interval;

    return () => this.stopGrooveSample();
  }

  public stopGrooveSample() {
    if (this.currentGrooveTimer !== null) {
      clearInterval(this.currentGrooveTimer);
      this.currentGrooveTimer = null;
    }
    this.isPlayingGroove = false;
  }

  public isGroovePlaying(): boolean {
    return this.isPlayingGroove;
  }

  // --- Live Microphone Monitoring Loop ---

  public async startMicMonitor(): Promise<boolean> {
    try {
      this.getContext();
      if (!this.inputGain || !this.ctx) return false;

      if (this.isMicMonitoring) return true;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      this.micStream = stream;
      this.micSourceNode = this.ctx.createMediaStreamSource(stream);

      // Safe monitor gain (-4dB) to avoid feedback
      const monitorAttenuator = this.ctx.createGain();
      monitorAttenuator.gain.setValueAtTime(0.65, this.ctx.currentTime);

      this.micSourceNode.connect(monitorAttenuator);
      monitorAttenuator.connect(this.inputGain);

      this.isMicMonitoring = true;
      return true;
    } catch (err) {
      console.warn("Failed to start live mic monitor:", err);
      return false;
    }
  }

  public stopMicMonitor() {
    if (this.micSourceNode) {
      this.micSourceNode.disconnect();
      this.micSourceNode = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    this.isMicMonitoring = false;
  }

  public isMonitoring(): boolean {
    return this.isMicMonitoring;
  }
}

export const audioDspChain = new AudioDspChainManager();
