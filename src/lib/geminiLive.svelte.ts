import { invoke, isTauri } from "@tauri-apps/api/core";

export type GeminiLiveStatus = "idle" | "connecting" | "connected" | "error";

/** Gemini Live chỉ nhận một luồng video tại một thời điểm. */
export type GeminiVideoSource = "camera" | "screen";

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
  enableScreenShare?: boolean;
}

/**
 * Phân loại thất bại của một lần bắt tay:
 * - "config": server từ chối gói setup (model đã bị khai tử, field không hỗ trợ) -> thử tổ hợp kế tiếp.
 * - "transport": socket chưa bao giờ mở (sai key, chặn mạng, sai đường endpoint) -> nhảy sang endpoint khác.
 * - "fatal": vô ích nếu thử lại (API key không hợp lệ, hết quota, server im lặng).
 */
type AttemptFailure = "config" | "transport" | "fatal";

/** Kết quả một lần bắt tay (handshake) với BidiGenerateContent. */
type AttemptOutcome = { ok: true } | { ok: false; failure: AttemptFailure; message: string };

/**
 * `setup` đầy đủ (transcription + session resumption) hay rút gọn. Nếu server từ chối
 * một field tuỳ chọn, phiên bị đóng ngay sau `setup`; khi đó ta hạ xuống profile "minimal".
 */
type SetupProfile = "full" | "minimal";

/**
 * Endpoint BidiGenerateContent. `v1beta` là đường chính thức hiện tại; `v1alpha`
 * là đường cũ, giữ lại làm fallback cho model/tài khoản còn neo ở phiên bản đó.
 */
export interface GeminiLiveEndpoint {
  label: string;
  url: string;
}

export const GEMINI_LIVE_ENDPOINTS: readonly GeminiLiveEndpoint[] = [
  {
    label: "v1beta",
    url: "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent",
  },
  {
    label: "v1alpha",
    url: "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent",
  },
];

/**
 * Model Live API theo thứ tự ưu tiên. Google khai tử model Live khá nhanh
 * (`gemini-2.0-flash-exp` đã bị gỡ), nên service tự động thử lần lượt thay vì
 * hardcode một tên duy nhất rồi chết cứng khi tên đó bị retire.
 */
export const GEMINI_LIVE_MODEL_CANDIDATES: readonly string[] = [
  "models/gemini-3.1-flash-live-preview",
  "models/gemini-2.5-flash-native-audio-preview-12-2025",
  "models/gemini-live-2.5-flash-preview",
  "models/gemini-2.0-flash-live-001",
];

const MODEL_STORAGE_KEY = "gemini_live_model";
const ENDPOINT_STORAGE_KEY = "gemini_live_endpoint";
/** Chặn trần số lần bắt tay của một lệnh connect() (model x profile x endpoint). */
const MAX_SETUP_ATTEMPTS = 16;
const SETUP_TIMEOUT_MS = 10000;
const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
const FRAME_INTERVAL_MS = 1000;
const MAX_RECONNECT_ATTEMPTS = 2;
/** Phiên sống đủ lâu mới được cấp lại quota reconnect (chặn vòng lặp reconnect vô hạn). */
const STABLE_SESSION_MS = 30000;

/** Lỗi thuộc về API Key / quota: đổi model không cứu được, dừng ngay. */
const FATAL_SERVER_PATTERNS: readonly RegExp[] = [
  /api[\s_-]?key/i,
  /unauthenticated/i,
  /permission/i,
  /forbidden/i,
  /unregistered callers/i,
  /quota/i,
  /billing/i,
  /resource[\s_-]?exhausted/i,
];

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `live-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function describeClose(event: { code?: number; reason?: string }): string {
  const reason = typeof event.reason === "string" ? event.reason.trim() : "";
  const code = typeof event.code === "number" ? event.code : 0;
  return reason ? `code ${code}: ${reason}` : `code ${code}`;
}

function isFatalServerMessage(message: string): boolean {
  return FATAL_SERVER_PATTERNS.some((pattern) => pattern.test(message));
}

function normalizeModelName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("models/") ? trimmed : `models/${trimmed}`;
}

/** Model ưu tiên (người dùng chọn / lần trước chạy được) đứng đầu, sau đó tới danh sách mặc định. */
export function buildModelCandidates(preferred?: string | null): string[] {
  const ordered: string[] = [];
  const push = (name?: string | null) => {
    if (!name) return;
    const normalized = normalizeModelName(name);
    if (normalized && !ordered.includes(normalized)) {
      ordered.push(normalized);
    }
  };
  push(preferred);
  for (const candidate of GEMINI_LIVE_MODEL_CANDIDATES) push(candidate);
  return ordered;
}

/** Endpoint dùng được lần trước đứng đầu để lần sau không phải dò lại. */
export function orderEndpoints(preferredLabel?: string | null): GeminiLiveEndpoint[] {
  const preferred = GEMINI_LIVE_ENDPOINTS.find((endpoint) => endpoint.label === preferredLabel);
  if (!preferred) return [...GEMINI_LIVE_ENDPOINTS];
  return [preferred, ...GEMINI_LIVE_ENDPOINTS.filter((endpoint) => endpoint !== preferred)];
}

function describeDisplayMediaError(err: unknown): string {
  const name = err instanceof Error ? err.name : "";
  const message = errorText(err);
  if (name === "NotAllowedError" || name === "SecurityError") {
    return `Chia sẻ màn hình bị từ chối. Trên macOS hãy bật quyền Screen & System Audio Recording cho rust-sound tại System Settings › Privacy & Security rồi mở lại app (${message}).`;
  }
  if (name === "NotFoundError") {
    return `Không tìm thấy màn hình hoặc cửa sổ nào để chia sẻ (${message}).`;
  }
  if (name === "NotSupportedError" || name === "TypeError") {
    return `WebView hiện tại không hỗ trợ getDisplayMedia nên không chia sẻ được màn hình (${message}).`;
  }
  if (name === "AbortError") {
    return "Đã huỷ chọn màn hình để chia sẻ.";
  }
  return `Không thể bắt đầu chia sẻ màn hình: ${message}`;
}

function stopStream(stream: MediaStream | null): void {
  if (!stream) return;
  stream.getTracks().forEach((track) => {
    try {
      track.stop();
    } catch {
      // Track có thể đã dừng trước đó
    }
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
  outputSampleRate = INPUT_SAMPLE_RATE
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

interface GeminiBlob {
  mimeType?: string;
  data?: string;
}

interface GeminiPart {
  text?: string;
  inlineData?: GeminiBlob;
}

interface GeminiServerMessage {
  setupComplete?: unknown;
  error?: { message?: string; status?: string; code?: number } | string;
  goAway?: { timeLeft?: string };
  sessionResumptionUpdate?: { newHandle?: string; resumable?: boolean };
  serverContent?: {
    interrupted?: boolean;
    turnComplete?: boolean;
    generationComplete?: boolean;
    modelTurn?: { parts?: GeminiPart[] };
    inputTranscription?: { text?: string };
    outputTranscription?: { text?: string };
  };
}

export class GeminiLiveService {
  status = $state<GeminiLiveStatus>("idle");
  isMuted = $state<boolean>(false);
  isVideoEnabled = $state<boolean>(false);
  isScreenSharing = $state<boolean>(false);
  videoSource = $state<GeminiVideoSource | null>(null);
  videoFrameInfo = $state<string | null>(null);
  userVolume = $state<number>(0);
  aiVolume = $state<number>(0);
  error = $state<string | null>(null);
  transcript = $state<GeminiLiveMessage[]>([]);
  cameraStream = $state<MediaStream | null>(null);
  screenStream = $state<MediaStream | null>(null);
  /** Model Live API thực sự đang chạy (sau khi tự động dò candidate). */
  activeModel = $state<string | null>(null);

  private ws: WebSocket | null = null;
  /** Tăng mỗi lần bắt đầu/kết thúc phiên: callback của socket cũ bị bỏ qua. */
  private sessionSeq = 0;
  private handshake: { seq: number; settle: (outcome: AttemptOutcome) => void } | null = null;
  private setupProfile: SetupProfile = "full";
  private sessionEndpoint: GeminiLiveEndpoint = GEMINI_LIVE_ENDPOINTS[0];
  private resumptionHandle: string | null = null;
  private reconnectAttempts = 0;
  private connectedAt = 0;
  private sessionApiKey: string | null = null;
  private sessionVoiceName = "Aoede";
  private sessionSystemInstruction: string | undefined = undefined;

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

  // MARK: - API key & model preferences

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

  /** Model do người dùng ghim, hoặc model gần nhất bắt tay thành công. */
  getStoredModel(): string | null {
    if (typeof localStorage === "undefined") return null;
    const stored = localStorage.getItem(MODEL_STORAGE_KEY);
    return stored && stored.trim() ? stored.trim() : null;
  }

  setStoredModel(model: string): void {
    if (typeof localStorage === "undefined") return;
    const normalized = normalizeModelName(model);
    if (normalized) {
      localStorage.setItem(MODEL_STORAGE_KEY, normalized);
    } else {
      localStorage.removeItem(MODEL_STORAGE_KEY);
    }
  }

  getStoredEndpoint(): string | null {
    if (typeof localStorage === "undefined") return null;
    const stored = localStorage.getItem(ENDPOINT_STORAGE_KEY);
    return stored && stored.trim() ? stored.trim() : null;
  }

  private setStoredEndpoint(label: string): void {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(ENDPOINT_STORAGE_KEY, label);
  }

  // MARK: - Connection lifecycle

  /**
   * Mở phiên Gemini Live. Promise chỉ resolve khi đã nhận `setupComplete`
   * (true) hoặc đã thử hết candidate và thất bại (false) — không báo "đã kết nối"
   * khi socket còn đang bắt tay.
   */
  async connect(options?: GeminiLiveConnectOptions): Promise<boolean> {
    // Luôn dọn phiên cũ: socket cũ còn handler sẽ bắn onclose và kéo sập phiên mới.
    this.teardownSession();
    const seq = this.sessionSeq;

    this.status = "connecting";
    this.error = null;
    this.activeModel = null;
    this.reconnectAttempts = 0;
    this.resumptionHandle = null;

    let apiKey = options?.apiKey?.trim();
    if (!apiKey) {
      apiKey = (await this.getApiKey())?.trim();
    }
    if (this.sessionSeq !== seq) return false;

    if (!apiKey) {
      this.failSession(
        seq,
        "Chưa tìm thấy Gemini API Key. Vui lòng thiết lập biến môi trường GEMINI_API_KEY hoặc cấu hình API Key."
      );
      return false;
    }

    this.sessionApiKey = apiKey;
    this.sessionVoiceName = options?.voiceName || "Aoede";
    this.sessionSystemInstruction = options?.systemInstruction;

    try {
      await this.setupMicrophone();
    } catch (err) {
      this.failSession(seq, `Không thể truy cập microphone: ${errorText(err)}`);
      return false;
    }
    if (this.sessionSeq !== seq) return false;

    const candidates = buildModelCandidates(options?.model ?? this.getStoredModel());
    const endpoints = orderEndpoints(this.getStoredEndpoint());
    const triedModels: string[] = [];
    let headline: string | null = null;
    let attempts = 0;

    // Dò theo endpoint (ngoài) -> profile setup -> model. Mỗi lần server đóng vì
    // setup thì sang model kế; nếu socket không mở được thì bỏ hẳn endpoint đó.
    endpointLoop: for (const endpoint of endpoints) {
      for (const profile of ["full", "minimal"] as SetupProfile[]) {
        for (const model of candidates) {
          if (this.sessionSeq !== seq) return false;
          if (attempts >= MAX_SETUP_ATTEMPTS) break endpointLoop;
          attempts += 1;

          const outcome = await this.openSession(seq, endpoint, model, profile, null);
          if (this.sessionSeq !== seq) return false;

          if (outcome.ok) {
            this.setupProfile = profile;
            this.sessionEndpoint = endpoint;
            this.activeModel = model;
            this.setStoredModel(model);
            this.setStoredEndpoint(endpoint.label);
            this.connectedAt = Date.now();
            this.status = "connected";
            this.error = null;
            this.startVolumeMonitor();
            if (options?.enableVideo) await this.enableVideo();
            if (options?.enableScreenShare) await this.startScreenShare();
            return true;
          }

          this.teardownSocket();
          const label = model.replace("models/", "");
          if (!triedModels.includes(label)) triedModels.push(label);
          if (!headline) headline = outcome.message;

          if (outcome.failure === "fatal") {
            this.failSession(seq, outcome.message);
            return false;
          }
          if (outcome.failure === "transport") {
            continue endpointLoop;
          }
        }
      }
    }

    const detail = headline || "Không nhận được phản hồi setup từ Gemini Live.";
    this.failSession(
      seq,
      `Không mở được phiên Gemini Live. ${detail} Đã thử ${attempts} lần bắt tay với model: ` +
        `${triedModels.join(", ")}. Nếu model đã bị Google khai tử, hãy nhập model Live mới ` +
        "trong phần cấu hình API Key."
    );
    return false;
  }

  /** Một lần bắt tay: mở socket, gửi `setup`, chờ `setupComplete`. */
  private openSession(
    seq: number,
    endpoint: GeminiLiveEndpoint,
    model: string,
    profile: SetupProfile,
    resumptionHandle: string | null
  ): Promise<AttemptOutcome> {
    return new Promise<AttemptOutcome>((resolve) => {
      const apiKey = this.sessionApiKey;
      if (!apiKey) {
        resolve({ ok: false, failure: "fatal", message: "Thiếu Gemini API Key." });
        return;
      }

      let opened = false;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      this.handshake = {
        seq,
        settle: (outcome: AttemptOutcome) => {
          if (timeoutId !== null) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          resolve(outcome);
        },
      };

      let socket: WebSocket;
      try {
        socket = new WebSocket(`${endpoint.url}?key=${encodeURIComponent(apiKey)}`);
      } catch (err) {
        this.settleHandshake(seq, {
          ok: false,
          failure: "transport",
          message: `Không thể khởi tạo kết nối WebSocket: ${errorText(err)}`,
        });
        return;
      }
      this.ws = socket;

      socket.onopen = () => {
        if (this.sessionSeq !== seq) {
          try {
            socket.close(1000, "Stale session");
          } catch {
            // Socket có thể đã đóng
          }
          return;
        }
        opened = true;
        try {
          socket.send(JSON.stringify(this.buildSetupMessage(model, profile, resumptionHandle)));
        } catch (err) {
          this.settleHandshake(seq, {
            ok: false,
            failure: "transport",
            message: `Không gửi được gói setup: ${errorText(err)}`,
          });
        }
      };

      socket.onmessage = (event: MessageEvent) => {
        if (this.sessionSeq !== seq) return;
        void this.handleServerMessage(event, seq);
      };

      socket.onerror = () => {
        // Sự kiện 'error' của WebSocket không mang lý do; onclose ngay sau đó mới có code/reason.
        console.warn(`Gemini Live WebSocket error (model ${model})`);
      };

      socket.onclose = (event: CloseEvent) => {
        if (this.sessionSeq !== seq) return;
        const detail = describeClose(event);
        const settled = this.settleHandshake(seq, {
          ok: false,
          // Chưa mở được socket = sai key/mạng/đường endpoint, đổi model vô ích.
          failure: opened ? "config" : "transport",
          message: opened
            ? `Model ${model.replace("models/", "")} bị server đóng trước khi hoàn tất setup trên ${
                endpoint.label
              } (${detail}).`
            : `Không thiết lập được WebSocket tới Gemini Live (${detail}). Kiểm tra API Key và kết nối mạng.`,
        });
        if (settled) return;
        this.handleUnexpectedClose(seq, detail);
      };

      timeoutId = setTimeout(() => {
        // Server im lặng sau setup không phải lỗi model -> dừng dò để không cộng dồn timeout.
        this.settleHandshake(seq, {
          ok: false,
          failure: "fatal",
          message: `Gemini Live không trả về setupComplete sau ${Math.round(
            SETUP_TIMEOUT_MS / 1000
          )}s (model ${model.replace("models/", "")}, endpoint ${
            endpoint.label
          }). Kiểm tra mạng hoặc trạng thái dịch vụ.`,
        });
      }, SETUP_TIMEOUT_MS);
    });
  }

  private buildSetupMessage(
    model: string,
    profile: SetupProfile,
    resumptionHandle: string | null
  ): Record<string, unknown> {
    const setup: Record<string, unknown> = {
      model,
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: this.sessionVoiceName,
            },
          },
        },
      },
    };

    if (this.sessionSystemInstruction) {
      setup.systemInstruction = { parts: [{ text: this.sessionSystemInstruction }] };
    }

    if (profile === "full") {
      // responseModalities = AUDIO nên model không gửi part.text; transcript phải lấy từ
      // input/outputAudioTranscription, nếu không Dialogue Console sẽ trống suốt cuộc gọi.
      setup.inputAudioTranscription = {};
      setup.outputAudioTranscription = {};
      setup.sessionResumption = resumptionHandle ? { handle: resumptionHandle } : {};
    }

    return { setup };
  }

  private settleHandshake(seq: number, outcome: AttemptOutcome): boolean {
    const pending = this.handshake;
    if (!pending || pending.seq !== seq) return false;
    this.handshake = null;
    pending.settle(outcome);
    return true;
  }

  private failSession(seq: number, message: string): void {
    if (this.sessionSeq !== seq) return;
    this.teardownSocket();
    this.cleanupMedia();
    this.status = "error";
    this.error = message;
  }

  /** Socket rớt giữa cuộc gọi: thử nối lại (kèm session resumption handle nếu có). */
  private handleUnexpectedClose(seq: number, detail: string): void {
    if (this.sessionSeq !== seq || this.status === "idle") return;

    this.teardownSocket();

    if (this.connectedAt > 0 && Date.now() - this.connectedAt >= STABLE_SESSION_MS) {
      this.reconnectAttempts = 0;
    }

    const canReconnect =
      this.status === "connected" &&
      this.sessionApiKey !== null &&
      this.activeModel !== null &&
      this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS;

    if (!canReconnect) {
      this.cleanupMedia();
      this.status = "error";
      this.error = `Gemini Live đã ngắt kết nối (${detail}).`;
      return;
    }

    this.reconnectAttempts += 1;
    this.status = "connecting";
    void this.resumeSession(seq, detail);
  }

  private async resumeSession(seq: number, detail: string): Promise<void> {
    const model = this.activeModel;
    if (!model) return;

    await sleep(500 * this.reconnectAttempts);
    if (this.sessionSeq !== seq) return;

    const outcome = await this.openSession(
      seq,
      this.sessionEndpoint,
      model,
      this.setupProfile,
      this.resumptionHandle
    );
    if (this.sessionSeq !== seq) return;

    if (outcome.ok) {
      this.connectedAt = Date.now();
      this.status = "connected";
      this.error = null;
      this.startVolumeMonitor();
      return;
    }

    this.teardownSocket();
    this.cleanupMedia();
    this.status = "error";
    this.error = `Gemini Live đã ngắt kết nối (${detail}) và không kết nối lại được: ${outcome.message}`;
  }

  // MARK: - Server messages

  private async handleServerMessage(event: MessageEvent, seq: number): Promise<void> {
    const data: unknown = event.data;
    let rawText = "";

    if (typeof data === "string") {
      rawText = data;
    } else if (typeof Blob !== "undefined" && data instanceof Blob) {
      rawText = await data.text();
    } else if (typeof TextDecoder !== "undefined" && data instanceof ArrayBuffer) {
      rawText = new TextDecoder().decode(data);
    } else {
      return;
    }

    if (this.sessionSeq !== seq) return;

    let parsed: GeminiServerMessage;
    try {
      parsed = JSON.parse(rawText) as GeminiServerMessage;
    } catch (parseErr) {
      console.warn("Failed to parse Gemini Live message:", parseErr);
      return;
    }

    if (parsed.error) {
      const message =
        typeof parsed.error === "string"
          ? parsed.error
          : parsed.error.message || "Gemini Live API báo lỗi.";
      const failure: AttemptFailure = isFatalServerMessage(message) ? "fatal" : "config";
      if (!this.settleHandshake(seq, { ok: false, failure, message })) {
        this.status = "error";
        this.error = message;
      }
      return;
    }

    if (parsed.setupComplete) {
      this.status = "connected";
      this.settleHandshake(seq, { ok: true });
    }

    if (parsed.sessionResumptionUpdate?.resumable && parsed.sessionResumptionUpdate.newHandle) {
      this.resumptionHandle = parsed.sessionResumptionUpdate.newHandle;
    }

    if (parsed.goAway) {
      // Server sắp đóng phiên (hết thời lượng); onclose kế tiếp sẽ kích hoạt reconnect.
      console.info("Gemini Live goAway:", parsed.goAway.timeLeft ?? "unknown");
    }

    const content = parsed.serverContent;
    if (!content) return;

    if (this.status === "connecting") {
      this.status = "connected";
      this.settleHandshake(seq, { ok: true });
    }

    if (content.interrupted) {
      this.stopAudioPlayback();
      this.finalizeStream("ai");
    }

    if (content.inputTranscription?.text) {
      this.appendStreamText("user", content.inputTranscription.text);
    }

    if (content.outputTranscription?.text) {
      this.appendStreamText("ai", content.outputTranscription.text);
    }

    if (content.modelTurn?.parts) {
      for (const part of content.modelTurn.parts) {
        if (part.text) {
          this.appendStreamText("ai", part.text);
        }
        if (part.inlineData?.data) {
          const float32 = base64ToFloat32(part.inlineData.data);
          if (float32.length > 0) {
            this.playAudioChunk(float32);
          }
        }
      }
    }

    if (content.turnComplete || content.generationComplete) {
      this.finalizeStream("ai");
      this.finalizeStream("user");
    }
  }

  private appendStreamText(sender: "user" | "ai", text: string): void {
    if (!text) return;
    const last = this.transcript[this.transcript.length - 1];
    if (last && last.sender === sender && !last.isFinal) {
      last.text += text;
      return;
    }
    if (last && !last.isFinal) {
      last.isFinal = true;
    }
    this.transcript.push({
      id: generateId(),
      sender,
      text,
      timestamp: new Date(),
      isFinal: false,
    });
  }

  private finalizeStream(sender: "user" | "ai"): void {
    const last = this.transcript[this.transcript.length - 1];
    if (last && last.sender === sender) {
      last.isFinal = true;
    }
  }

  // MARK: - Microphone capture

  private async setupMicrophone(): Promise<void> {
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("Trình duyệt hoặc môi trường không hỗ trợ MediaDevices getUserMedia.");
    }

    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: INPUT_SAMPLE_RATE,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    try {
      this.inputAudioContext = new AudioContextClass({ sampleRate: INPUT_SAMPLE_RATE });
    } catch {
      // Một số thiết bị CoreAudio từ chối sampleRate cố định -> dùng rate mặc định rồi downsample.
      this.inputAudioContext = new AudioContextClass();
    }

    // WKWebView tạo AudioContext ở trạng thái "suspended"; không resume thì
    // onaudioprocess không bao giờ chạy và Gemini không nhận được tiếng nào.
    if (this.inputAudioContext.state === "suspended") {
      try {
        await this.inputAudioContext.resume();
      } catch (err) {
        console.warn("Không resume được input AudioContext:", err);
      }
    }

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

      if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.status !== "connected") {
        return;
      }

      const pcm16Float = downsampleBuffer(inputChannel, actualSampleRate, INPUT_SAMPLE_RATE);
      const pcm16Bytes = float32ToInt16PCM(pcm16Float);
      const base64Data = uint8ArrayToBase64(pcm16Bytes);

      // `realtimeInput.mediaChunks` đã bị khai tử; model Live mới chỉ chấp nhận audio/video/text.
      const payload = {
        realtimeInput: {
          audio: {
            mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}`,
            data: base64Data,
          },
        },
      };

      try {
        this.ws.send(JSON.stringify(payload));
      } catch (sendErr) {
        console.warn("Failed to send audio chunk to Gemini Live:", sendErr);
      }
    };
  }

  // MARK: - Audio playback

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

    const audioBuffer = this.outputAudioContext.createBuffer(1, float32.length, OUTPUT_SAMPLE_RATE);
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

  // MARK: - Camera

  async enableVideo(deviceId?: string): Promise<void> {
    if (this.isVideoEnabled && this.cameraStream && !deviceId) {
      return;
    }
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      this.error = "Trình duyệt hoặc môi trường không hỗ trợ truy cập camera.";
      return;
    }

    // Gemini Live chỉ nhận một luồng video: camera và chia sẻ màn hình loại trừ nhau.
    if (this.isScreenSharing) {
      this.stopScreenShare();
    }

    stopStream(this.cameraStream);
    this.cameraStream = null;

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

      this.isVideoEnabled = true;
      this.error = null;
      await this.attachVideoStream(this.cameraStream, "camera");
    } catch (err) {
      const msg = errorText(err);
      console.error("Camera access failed:", msg);
      this.error = `Không thể truy cập camera: ${msg}`;
      this.isVideoEnabled = false;
    }
  }

  disableVideo(): void {
    if (this.videoSource === "camera") {
      this.stopVideoPipeline();
    }
    stopStream(this.cameraStream);
    this.cameraStream = null;
    this.isVideoEnabled = false;
  }

  async toggleVideo(): Promise<void> {
    if (this.isVideoEnabled) {
      this.disableVideo();
    } else {
      await this.enableVideo();
    }
  }

  // MARK: - Screen share

  supportsScreenShare(): boolean {
    return (
      typeof navigator !== "undefined" &&
      typeof navigator.mediaDevices?.getDisplayMedia === "function"
    );
  }

  /** Mở bộ chọn màn hình của hệ thống và stream khung hình lên Gemini Live. */
  async startScreenShare(): Promise<boolean> {
    if (this.isScreenSharing && this.screenStream) {
      return true;
    }
    if (!this.supportsScreenShare()) {
      this.error =
        "WebView hiện tại không hỗ trợ getDisplayMedia nên không chia sẻ được màn hình. Hãy cập nhật macOS/WebKit hoặc bật quyền Screen & System Audio Recording cho rust-sound.";
      return false;
    }

    // Camera và màn hình loại trừ nhau — chỉ một luồng video được gửi đi.
    if (this.isVideoEnabled) {
      this.disableVideo();
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 5, max: 15 } },
        audio: false,
      });

      this.screenStream = stream;
      this.isScreenSharing = true;
      this.error = null;

      const [track] = stream.getVideoTracks();
      if (track) {
        // Người dùng bấm "Stop sharing" trên thanh hệ thống -> dừng pipeline ngay.
        track.onended = () => {
          this.stopScreenShare();
        };
      }

      await this.attachVideoStream(stream, "screen");
      return true;
    } catch (err) {
      stopStream(this.screenStream);
      this.screenStream = null;
      this.isScreenSharing = false;
      this.error = describeDisplayMediaError(err);
      return false;
    }
  }

  stopScreenShare(): void {
    if (!this.isScreenSharing && !this.screenStream) return;
    if (this.videoSource === "screen") {
      this.stopVideoPipeline();
    }
    stopStream(this.screenStream);
    this.screenStream = null;
    this.isScreenSharing = false;
  }

  async toggleScreenShare(): Promise<boolean> {
    if (this.isScreenSharing) {
      this.stopScreenShare();
      return false;
    }
    return this.startScreenShare();
  }

  // MARK: - Video frame pipeline (dùng chung cho camera và màn hình)

  private async attachVideoStream(stream: MediaStream, source: GeminiVideoSource): Promise<void> {
    if (typeof document === "undefined") return;

    if (!this.videoElement) {
      this.videoElement = document.createElement("video");
      this.videoElement.autoplay = true;
      this.videoElement.muted = true;
      this.videoElement.playsInline = true;
    }
    this.videoElement.srcObject = stream;
    await Promise.resolve(this.videoElement.play()).catch(() => {});

    if (!this.canvasElement) {
      this.canvasElement = document.createElement("canvas");
    }

    this.videoSource = source;
    this.startVideoFrameCapture();
  }

  private stopVideoPipeline(): void {
    this.stopVideoFrameCapture();
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
    this.videoSource = null;
    this.videoFrameInfo = null;
  }

  private startVideoFrameCapture(): void {
    this.stopVideoFrameCapture();
    if (typeof window === "undefined") return;
    this.videoCaptureInterval = window.setInterval(() => {
      this.captureAndSendVideoFrame();
    }, FRAME_INTERVAL_MS);
  }

  private stopVideoFrameCapture(): void {
    if (this.videoCaptureInterval !== null) {
      clearInterval(this.videoCaptureInterval);
      this.videoCaptureInterval = null;
    }
  }

  private captureAndSendVideoFrame(): void {
    if (
      !this.videoSource ||
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

    // Khung màn hình cần nhiều pixel hơn webcam để Gemini đọc được chữ trong UI.
    const maxWidth = this.videoSource === "screen" ? 1024 : 640;
    const quality = this.videoSource === "screen" ? 0.8 : 0.7;
    const scale = Math.min(1, maxWidth / v.videoWidth);
    const width = Math.round(v.videoWidth * scale);
    const height = Math.round(v.videoHeight * scale);

    this.canvasElement.width = width;
    this.canvasElement.height = height;

    const ctx = this.canvasElement.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(v, 0, 0, width, height);

    const dataUrl = this.canvasElement.toDataURL("image/jpeg", quality);
    const commaIdx = dataUrl.indexOf(",");
    if (commaIdx === -1) return;
    const base64Jpeg = dataUrl.substring(commaIdx + 1);

    const payload = {
      realtimeInput: {
        video: {
          mimeType: "image/jpeg",
          data: base64Jpeg,
        },
      },
    };

    try {
      this.ws.send(JSON.stringify(payload));
      this.videoFrameInfo = `${width}x${height} · 1fps`;
    } catch (err) {
      console.warn("Failed to send video frame to Gemini Live:", err);
    }
  }

  // MARK: - Controls

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

    this.finalizeStream("ai");
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
    if (typeof requestAnimationFrame !== "function") return;
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

  // MARK: - Teardown

  private teardownSocket(): void {
    const socket = this.ws;
    this.ws = null;
    if (!socket) return;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    try {
      socket.close(1000, "Client closed session");
    } catch {
      // Socket có thể đã đóng
    }
  }

  /** Vô hiệu hoá mọi callback của phiên hiện tại rồi dọn socket + media. */
  private teardownSession(): void {
    this.sessionSeq += 1;
    const pending = this.handshake;
    if (pending) {
      this.handshake = null;
      pending.settle({ ok: false, failure: "fatal", message: "Phiên Gemini Live đã bị huỷ." });
    }
    this.teardownSocket();
    this.cleanupMedia();
  }

  private cleanupMedia(): void {
    this.stopVideoPipeline();

    stopStream(this.cameraStream);
    this.cameraStream = null;
    this.isVideoEnabled = false;

    stopStream(this.screenStream);
    this.screenStream = null;
    this.isScreenSharing = false;

    if (this.videoElement) {
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }
    this.canvasElement = null;

    stopStream(this.micStream);
    this.micStream = null;

    if (this.scriptProcessor) {
      this.scriptProcessor.onaudioprocess = null;
      try {
        this.scriptProcessor.disconnect();
      } catch {
        // Node có thể đã ngắt kết nối
      }
      this.scriptProcessor = null;
    }

    if (this.micSource) {
      try {
        this.micSource.disconnect();
      } catch {
        // Node có thể đã ngắt kết nối
      }
      this.micSource = null;
    }

    if (this.dummyInputGain) {
      try {
        this.dummyInputGain.disconnect();
      } catch {
        // Node có thể đã ngắt kết nối
      }
      this.dummyInputGain = null;
    }

    this.stopAudioPlayback();

    if (this.outputGainNode) {
      try {
        this.outputGainNode.disconnect();
      } catch {
        // Node có thể đã ngắt kết nối
      }
      this.outputGainNode = null;
    }

    if (this.outputAnalyser) {
      try {
        this.outputAnalyser.disconnect();
      } catch {
        // Node có thể đã ngắt kết nối
      }
      this.outputAnalyser = null;
    }

    if (this.inputAudioContext) {
      try {
        if (this.inputAudioContext.state !== "closed") {
          void this.inputAudioContext.close();
        }
      } catch {
        // Context có thể đã đóng
      }
      this.inputAudioContext = null;
    }

    if (this.outputAudioContext) {
      try {
        if (this.outputAudioContext.state !== "closed") {
          void this.outputAudioContext.close();
        }
      } catch {
        // Context có thể đã đóng
      }
      this.outputAudioContext = null;
    }

    if (this.volumeAnimId !== null) {
      cancelAnimationFrame(this.volumeAnimId);
      this.volumeAnimId = null;
    }
  }

  disconnect(): void {
    this.teardownSession();

    this.status = "idle";
    this.error = null;
    this.userVolume = 0;
    this.aiVolume = 0;
    this.isMuted = false;
    this.nextPlayTime = 0;
    this.activeModel = null;
    this.videoFrameInfo = null;
    this.resumptionHandle = null;
    this.reconnectAttempts = 0;
    this.connectedAt = 0;
    this.sessionApiKey = null;
  }
}

export const geminiLive = new GeminiLiveService();
export const geminiLiveState = geminiLive;
