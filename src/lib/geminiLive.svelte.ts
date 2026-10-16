import { invoke, isTauri } from "@tauri-apps/api/core";

export type GeminiLiveStatus = "idle" | "connecting" | "connected" | "error";

export interface GeminiLiveMessage {
  id: string;
  sender: "user" | "ai";
  text: string;
  timestamp: Date;
  isFinal?: boolean;
}

export interface GeminiLiveConnectOptions {
  apiKey?: string;
  voiceName?: "Aoede" | "Charon" | "Fenrir" | "Kore" | "Puck" | string;
  model?: string;
  systemInstruction?: string;
  enableVideo?: boolean;
}

const GEMINI_LIVE_WS_BASE =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent";

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `live-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function base64ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const sampleCount = Math.floor(binary.length / 2);
  const float32 = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const b0 = binary.charCodeAt(i * 2);
    const b1 = binary.charCodeAt(i * 2 + 1);
    let int16 = (b1 << 8) | b0;
    if (int16 >= 0x8000) {
      int16 -= 0x10000;
    }
    float32[i] = int16 < 0 ? int16 / 32768.0 : int16 / 32767.0;
  }
  return float32;
}

function float32ToInt16PCM(input: Float32Array): Uint8Array {
  const output = new Uint8Array(input.length * 2);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    const int16 = s < 0 ? Math.round(s * 32768) : Math.round(s * 32767);
    const u16 = int16 < 0 ? int16 + 65536 : int16;
    output[i * 2] = u16 & 0xff;
    output[i * 2 + 1] = (u16 >> 8) & 0xff;
  }
  return output;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function downsampleBuffer(
  buffer: Float32Array,
  inputSampleRate: number,
  outputSampleRate = 16000
): Float32Array {
  if (inputSampleRate === outputSampleRate) {
    return buffer;
  }
  if (inputSampleRate < outputSampleRate) {
    const ratio = (inputSampleRate - 1) / (outputSampleRate - 1);
    const result = new Float32Array(Math.round((buffer.length * outputSampleRate) / inputSampleRate));
    for (let i = 0; i < result.length; i++) {
      const pos = i * ratio;
      const index = Math.floor(pos);
      const nextIndex = Math.min(index + 1, buffer.length - 1);
      const weight = pos - index;
      result[i] = buffer[index] * (1 - weight) + buffer[nextIndex] * weight;
    }
    return result;
  }

  const ratio = inputSampleRate / outputSampleRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

export class GeminiLiveService {
  status = $state<GeminiLiveStatus>("idle");
  isMuted = $state<boolean>(false);
  isVideoEnabled = $state<boolean>(false);
  userVolume = $state<number>(0);
  aiVolume = $state<number>(0);
  error = $state<string | null>(null);
  transcript = $state<GeminiLiveMessage[]>([]);
  cameraStream = $state<MediaStream | null>(null);

  private ws: WebSocket | null = null;
  private micStream: MediaStream | null = null;
  private inputAudioContext: AudioContext | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private dummyInputGain: GainNode | null = null;

  private outputAudioContext: AudioContext | null = null;
  private outputGainNode: GainNode | null = null;
  private outputAnalyser: AnalyserNode | null = null;
  private activeSources: AudioBufferSourceNode[] = [];
  private nextPlayTime = 0;

  private videoElement: HTMLVideoElement | null = null;
  private canvasElement: HTMLCanvasElement | null = null;
  private videoCaptureInterval: number | null = null;

  private volumeAnimId: number | null = null;

  async getApiKey(): Promise<string | null> {
    if (typeof window !== "undefined" && isTauri()) {
      try {
        const key = await invoke<string | null>("get_gemini_api_key");
        if (key && key.trim()) {
          return key.trim();
        }
      } catch (err) {
        console.warn("Failed to get gemini api key from backend:", err);
      }
    }
    if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
      const local = localStorage.getItem("gemini_api_key");
      if (local && local.trim()) {
        return local.trim();
      }
    }
    return null;
  }

  async setApiKey(key: string): Promise<void> {
    const trimmed = key.trim();
    if (typeof window !== "undefined" && isTauri()) {
      try {
        await invoke("set_gemini_api_key", { key: trimmed });
      } catch (err) {
        console.warn("Failed to set gemini api key to backend:", err);
      }
    }
    if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
      if (trimmed) {
        localStorage.setItem("gemini_api_key", trimmed);
      } else {
        localStorage.removeItem("gemini_api_key");
      }
    }
  }

  async connect(options?: GeminiLiveConnectOptions): Promise<void> {
    if (this.status === "connecting" || this.status === "connected") {
      this.disconnect();
    }

    this.status = "connecting";
    this.error = null;

    let apiKey = options?.apiKey?.trim();
    if (!apiKey) {
      apiKey = (await this.getApiKey())?.trim();
    }

    if (!apiKey) {
      this.status = "error";
      this.error =
        "Chưa tìm thấy Gemini API Key. Vui lòng thiết lập biến môi trường GEMINI_API_KEY hoặc cấu hình API Key.";
      return;
    }

    const voiceName = options?.voiceName || "Aoede";
    const model = options?.model || "models/gemini-2.0-flash-exp";
    const systemInstruction = options?.systemInstruction;

    try {
      await this.setupMicrophone();
    } catch (err) {
      this.disconnect();
      this.status = "error";
      const msg = err instanceof Error ? err.message : String(err);
      this.error = `Không thể truy cập microphone: ${msg}`;
      return;
    }

    const wsUrl = `${GEMINI_LIVE_WS_BASE}?key=${encodeURIComponent(apiKey)}`;

    try {
      this.ws = new WebSocket(wsUrl);
    } catch (err) {
      this.disconnect();
      this.status = "error";
      const msg = err instanceof Error ? err.message : String(err);
      this.error = `Không thể khởi tạo kết nối WebSocket: ${msg}`;
      return;
    }

    this.ws.onopen = () => {
      const setupMessage = {
        setup: {
          model,
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName,
                },
              },
            },
          },
          ...(systemInstruction
            ? {
                systemInstruction: {
                  parts: [{ text: systemInstruction }],
                },
              }
            : {}),
        },
      };
      this.ws?.send(JSON.stringify(setupMessage));
      this.startVolumeMonitor();
    };

    this.ws.onmessage = async (event: MessageEvent) => {
      await this.handleServerMessage(event);
    };

    this.ws.onerror = (event: Event) => {
      console.error("Gemini Live WebSocket error:", event);
      if (this.status !== "idle") {
        this.status = "error";
        this.error = "Lỗi kết nối hoặc gián đoạn WebSocket tới Gemini Live API.";
      }
    };

    this.ws.onclose = (event: CloseEvent) => {
      if (this.status !== "idle") {
        if (event.code !== 1000 && !event.wasClean) {
          this.status = "error";
          this.error = `Gemini Live đã ngắt kết nối (${event.code}${
            event.reason ? `: ${event.reason}` : ""
          })`;
        } else {
          this.status = "idle";
        }
      }
      this.cleanupMedia();
    };

    if (options?.enableVideo) {
      await this.enableVideo();
    }
  }

  private async handleServerMessage(event: MessageEvent): Promise<void> {
    let rawText = "";
    if (typeof event.data === "string") {
      rawText = event.data;
    } else if (event.data instanceof Blob) {
      rawText = await event.data.text();
    } else if (event.data instanceof ArrayBuffer) {
      rawText = new TextDecoder().decode(event.data);
    } else {
      return;
    }

    try {
      const parsed = JSON.parse(rawText);

      if (parsed.setupComplete) {
        this.status = "connected";
      }

      if (parsed.error) {
        const message =
          typeof parsed.error === "object" && parsed.error && "message" in parsed.error
            ? String(parsed.error.message)
            : "Gemini Live API báo lỗi.";
        this.status = "error";
        this.error = message;
        return;
      }

      if (parsed.serverContent) {
        if (this.status === "connecting") {
          this.status = "connected";
        }

        const content = parsed.serverContent;

        if (content.interrupted) {
          this.stopAudioPlayback();
          const lastMsg = this.transcript[this.transcript.length - 1];
          if (lastMsg && lastMsg.sender === "ai") {
            lastMsg.isFinal = true;
          }
        }

        if (content.modelTurn?.parts) {
          for (const part of content.modelTurn.parts) {
            if (part.text) {
              const lastIndex = this.transcript.length - 1;
              const lastMsg = lastIndex >= 0 ? this.transcript[lastIndex] : null;

              if (lastMsg && lastMsg.sender === "ai" && !lastMsg.isFinal) {
                lastMsg.text += part.text;
              } else {
                this.transcript.push({
                  id: generateId(),
                  sender: "ai",
                  text: part.text,
                  timestamp: new Date(),
                  isFinal: false,
                });
              }
            }

            if (part.inlineData?.data) {
              const float32 = base64ToFloat32(part.inlineData.data);
              if (float32.length > 0) {
                this.playAudioChunk(float32);
              }
            }
          }
        }

        if (content.turnComplete) {
          const lastMsg = this.transcript[this.transcript.length - 1];
          if (lastMsg && lastMsg.sender === "ai") {
            lastMsg.isFinal = true;
          }
        }
      }
    } catch (parseErr) {
      console.warn("Failed to parse Gemini Live message:", parseErr);
    }
  }

  private async setupMicrophone(): Promise<void> {
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("Trình duyệt hoặc môi trường không hỗ trợ MediaDevices getUserMedia.");
    }

    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    this.inputAudioContext = new AudioContextClass({ sampleRate: 16000 });
    const actualSampleRate = this.inputAudioContext.sampleRate;

    const bufferSize = 2048;
    this.scriptProcessor = this.inputAudioContext.createScriptProcessor(bufferSize, 1, 1);
    this.micSource = this.inputAudioContext.createMediaStreamSource(this.micStream);
    this.micSource.connect(this.scriptProcessor);

    this.dummyInputGain = this.inputAudioContext.createGain();
    this.dummyInputGain.gain.value = 0;
    this.scriptProcessor.connect(this.dummyInputGain);
    this.dummyInputGain.connect(this.inputAudioContext.destination);

    this.scriptProcessor.onaudioprocess = (e: AudioProcessingEvent) => {
      if (this.isMuted) {
        this.userVolume = 0;
        return;
      }

      const inputChannel = e.inputBuffer.getChannelData(0);

      let sumSq = 0;
      for (let i = 0; i < inputChannel.length; i++) {
        sumSq += inputChannel[i] * inputChannel[i];
      }
      const rms = Math.sqrt(sumSq / inputChannel.length);
      const targetVol = Math.min(1, Math.max(0, rms * 4.5));
      this.userVolume = Math.max(this.userVolume * 0.2 + targetVol * 0.8, targetVol);

      if (
        !this.ws ||
        this.ws.readyState !== WebSocket.OPEN ||
        this.status !== "connected"
      ) {
        return;
      }

      const pcm16Float = downsampleBuffer(inputChannel, actualSampleRate, 16000);
      const pcm16Bytes = float32ToInt16PCM(pcm16Float);
      const base64Data = uint8ArrayToBase64(pcm16Bytes);

      const payload = {
        realtimeInput: {
          mediaChunks: [
            {
              mimeType: "audio/pcm;rate=16000",
              data: base64Data,
            },
          ],
        },
      };

      try {
        this.ws.send(JSON.stringify(payload));
      } catch (sendErr) {
        console.warn("Failed to send audio chunk to Gemini Live:", sendErr);
      }
    };
  }

  private playAudioChunk(float32: Float32Array): void {
    if (!this.outputAudioContext || this.outputAudioContext.state === "closed") {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.outputAudioContext = new AudioContextClass();
      this.outputAnalyser = this.outputAudioContext.createAnalyser();
      this.outputAnalyser.fftSize = 256;
      this.outputAnalyser.smoothingTimeConstant = 0.3;
      this.outputGainNode = this.outputAudioContext.createGain();
      this.outputGainNode.gain.value = 1.0;
      this.outputGainNode.connect(this.outputAnalyser);
      this.outputAnalyser.connect(this.outputAudioContext.destination);
    }

    if (this.outputAudioContext.state === "suspended") {
      void this.outputAudioContext.resume();
    }

    const audioBuffer = this.outputAudioContext.createBuffer(1, float32.length, 24000);
    audioBuffer.getChannelData(0).set(float32);

    const source = this.outputAudioContext.createBufferSource();
    source.buffer = audioBuffer;
    if (this.outputGainNode) {
      source.connect(this.outputGainNode);
    } else if (this.outputAnalyser) {
      source.connect(this.outputAnalyser);
    } else {
      source.connect(this.outputAudioContext.destination);
    }

    const currentTime = this.outputAudioContext.currentTime;
    if (this.nextPlayTime < currentTime) {
      this.nextPlayTime = currentTime + 0.02;
    }
    source.start(this.nextPlayTime);
    this.nextPlayTime += audioBuffer.duration;

    this.activeSources.push(source);
    source.onended = () => {
      const idx = this.activeSources.indexOf(source);
      if (idx !== -1) {
        this.activeSources.splice(idx, 1);
      }
    };
  }

  private stopAudioPlayback(): void {
    for (const source of this.activeSources) {
      try {
        source.stop();
        source.disconnect();
      } catch {
        // Ignored if already stopped
      }
    }
    this.activeSources = [];
    if (this.outputAudioContext) {
      this.nextPlayTime = this.outputAudioContext.currentTime;
    } else {
      this.nextPlayTime = 0;
    }
    this.aiVolume = 0;
  }

  async enableVideo(deviceId?: string): Promise<void> {
    if (this.isVideoEnabled && this.cameraStream && !deviceId) {
      return;
    }
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      this.error = "Trình duyệt hoặc môi trường không hỗ trợ truy cập camera.";
      return;
    }

    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      this.cameraStream = null;
    }

    try {
      const videoConstraints: MediaTrackConstraints = {
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 15 },
      };
      if (deviceId) {
        videoConstraints.deviceId = { exact: deviceId };
      }

      this.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
      });

      if (!this.videoElement) {
        this.videoElement = document.createElement("video");
        this.videoElement.autoplay = true;
        this.videoElement.muted = true;
        this.videoElement.playsInline = true;
      }
      this.videoElement.srcObject = this.cameraStream;
      await this.videoElement.play().catch(() => {});

      if (!this.canvasElement) {
        this.canvasElement = document.createElement("canvas");
      }

      this.isVideoEnabled = true;
      this.startVideoFrameCapture();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Camera access failed:", msg);
      this.error = `Không thể truy cập camera: ${msg}`;
      this.isVideoEnabled = false;
    }
  }

  disableVideo(): void {
    this.stopVideoFrameCapture();
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      this.cameraStream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
    this.isVideoEnabled = false;
  }

  async toggleVideo(): Promise<void> {
    if (this.isVideoEnabled) {
      this.disableVideo();
    } else {
      await this.enableVideo();
    }
  }

  private startVideoFrameCapture(): void {
    this.stopVideoFrameCapture();
    this.videoCaptureInterval = window.setInterval(() => {
      this.captureAndSendVideoFrame();
    }, 1000); // 1 FPS
  }

  private stopVideoFrameCapture(): void {
    if (this.videoCaptureInterval !== null) {
      clearInterval(this.videoCaptureInterval);
      this.videoCaptureInterval = null;
    }
  }

  private captureAndSendVideoFrame(): void {
    if (
      !this.isVideoEnabled ||
      !this.videoElement ||
      !this.canvasElement ||
      !this.ws ||
      this.ws.readyState !== WebSocket.OPEN ||
      this.status !== "connected"
    ) {
      return;
    }

    const v = this.videoElement;
    if (!v.videoWidth || !v.videoHeight) return;

    const maxWidth = 640;
    const scale = Math.min(1, maxWidth / v.videoWidth);
    const width = Math.round(v.videoWidth * scale);
    const height = Math.round(v.videoHeight * scale);

    this.canvasElement.width = width;
    this.canvasElement.height = height;

    const ctx = this.canvasElement.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(v, 0, 0, width, height);

    const dataUrl = this.canvasElement.toDataURL("image/jpeg", 0.7);
    const commaIdx = dataUrl.indexOf(",");
    if (commaIdx === -1) return;
    const base64Jpeg = dataUrl.substring(commaIdx + 1);

    const payload = {
      realtimeInput: {
        mediaChunks: [
          {
            mimeType: "image/jpeg",
            data: base64Jpeg,
          },
        ],
      },
    };

    try {
      this.ws.send(JSON.stringify(payload));
    } catch (err) {
      console.warn("Failed to send video frame to Gemini Live:", err);
    }
  }

  setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (this.micStream) {
      this.micStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }
    if (muted) {
      this.userVolume = 0;
    }
  }

  toggleMute(): void {
    this.setMuted(!this.isMuted);
  }

  sendTextMessage(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.status !== "connected") {
      throw new Error("Gemini Live chưa được kết nối.");
    }

    this.transcript.push({
      id: generateId(),
      sender: "user",
      text: trimmed,
      timestamp: new Date(),
      isFinal: true,
    });

    const payload = {
      clientContent: {
        turns: [
          {
            role: "user",
            parts: [{ text: trimmed }],
          },
        ],
        turnComplete: true,
      },
    };

    this.ws.send(JSON.stringify(payload));
  }

  clearTranscript(): void {
    this.transcript = [];
  }

  private startVolumeMonitor(): void {
    if (this.volumeAnimId !== null) return;
    const analyserData = new Uint8Array(128);

    const loop = () => {
      if (this.status === "idle") {
        this.volumeAnimId = null;
        this.aiVolume = 0;
        this.userVolume = 0;
        return;
      }

      if (this.outputAnalyser && this.activeSources.length > 0) {
        this.outputAnalyser.getByteTimeDomainData(analyserData);
        let sum = 0;
        for (let i = 0; i < analyserData.length; i++) {
          const norm = (analyserData[i] - 128) / 128;
          sum += norm * norm;
        }
        const rms = Math.sqrt(sum / analyserData.length);
        const targetAiVol = Math.min(1, Math.max(0, rms * 4.0));
        this.aiVolume = this.aiVolume * 0.3 + targetAiVol * 0.7;
      } else {
        this.aiVolume *= 0.65;
        if (this.aiVolume < 0.005) {
          this.aiVolume = 0;
        }
      }

      if (this.isMuted) {
        this.userVolume = 0;
      } else {
        this.userVolume *= 0.85;
        if (this.userVolume < 0.005) {
          this.userVolume = 0;
        }
      }

      this.volumeAnimId = requestAnimationFrame(loop);
    };

    this.volumeAnimId = requestAnimationFrame(loop);
  }

  private cleanupMedia(): void {
    this.stopVideoFrameCapture();

    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      this.cameraStream = null;
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }

    if (this.canvasElement) {
      this.canvasElement = null;
    }
    this.isVideoEnabled = false;

    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      this.micStream = null;
    }

    if (this.scriptProcessor) {
      this.scriptProcessor.onaudioprocess = null;
      try {
        this.scriptProcessor.disconnect();
      } catch {}
      this.scriptProcessor = null;
    }

    if (this.micSource) {
      try {
        this.micSource.disconnect();
      } catch {}
      this.micSource = null;
    }

    if (this.dummyInputGain) {
      try {
        this.dummyInputGain.disconnect();
      } catch {}
      this.dummyInputGain = null;
    }

    this.stopAudioPlayback();

    if (this.outputGainNode) {
      try {
        this.outputGainNode.disconnect();
      } catch {}
      this.outputGainNode = null;
    }

    if (this.outputAnalyser) {
      try {
        this.outputAnalyser.disconnect();
      } catch {}
      this.outputAnalyser = null;
    }

    if (this.inputAudioContext) {
      try {
        if (this.inputAudioContext.state !== "closed") {
          void this.inputAudioContext.close();
        }
      } catch {}
      this.inputAudioContext = null;
    }

    if (this.outputAudioContext) {
      try {
        if (this.outputAudioContext.state !== "closed") {
          void this.outputAudioContext.close();
        }
      } catch {}
      this.outputAudioContext = null;
    }

    if (this.volumeAnimId !== null) {
      cancelAnimationFrame(this.volumeAnimId);
      this.volumeAnimId = null;
    }
  }

  disconnect(): void {
    this.cleanupMedia();

    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      try {
        this.ws.close(1000, "User disconnected");
      } catch {}
      this.ws = null;
    }

    this.status = "idle";
    this.error = null;
    this.userVolume = 0;
    this.aiVolume = 0;
    this.isMuted = false;
    this.nextPlayTime = 0;
  }
}

export const geminiLive = new GeminiLiveService();
export const geminiLiveState = geminiLive;
