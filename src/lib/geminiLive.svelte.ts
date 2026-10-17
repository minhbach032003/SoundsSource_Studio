import { invoke, isTauri } from "@tauri-apps/api/core";
import { GEMINI_AUDIO_TOOL_DECLARATIONS, runGeminiAudioTool, type GeminiToolResult } from "@/lib/geminiAudioTools";

export type GeminiLiveStatus = "idle" | "connecting" | "connected" | "error";

export type GeminiLiveSender = "user" | "ai" | "tool";

export interface GeminiLiveMessage {
  id: string;
  sender: GeminiLiveSender;
  text: string;
  timestamp: Date;
  isFinal?: boolean;
  /** How the turn reached the transcript: live speech or the typed fallback box. */
  source?: "voice" | "text";
  /** Set on `sender: "tool"` rows. */
  toolName?: string;
  toolOk?: boolean;
  /** True once the turn's PCM has been cached and can be replayed. */
  hasAudio?: boolean;
}

export interface GeminiLiveConnectOptions {
  apiKey?: string;
  voiceName?: "Aoede" | "Charon" | "Fenrir" | "Kore" | "Puck" | string;
  model?: string;
  systemInstruction?: string;
  enableVideo?: boolean;
}

const GEMINI_LIVE_WS_BASE =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

/**
 * Live-capable models verified against `bidiGenerateContent` on v1beta.
 * `gemini-2.0-flash-exp` is gone: the server closes the socket with 1008.
 */
export const GEMINI_LIVE_MODELS = [
  { value: "models/gemini-3.1-flash-live-preview", label: "Gemini 3.1 Flash Live" },
  { value: "models/gemini-2.5-flash-native-audio-latest", label: "Gemini 2.5 Flash Native Audio" },
] as const;

export const DEFAULT_GEMINI_LIVE_MODEL: string = GEMINI_LIVE_MODELS[0].value;

/** Im lặng bao lâu thì Live API coi như người dùng đã nói xong. Thấp = trả lời sớm hơn,
 * nhưng ngập ngừng giữa câu dễ bị cắt lời. Người dùng chỉnh được trong Voice AI. */
export const GEMINI_REPLY_DELAY_DEFAULT_MS = 400;
export const GEMINI_REPLY_DELAY_MIN_MS = 150;
export const GEMINI_REPLY_DELAY_MAX_MS = 1200;
const REPLY_DELAY_KEY = "gemini_reply_delay_ms";

function loadReplyDelay(): number {
  try {
    const raw = Number(localStorage.getItem(REPLY_DELAY_KEY));
    if (Number.isFinite(raw) && raw >= GEMINI_REPLY_DELAY_MIN_MS && raw <= GEMINI_REPLY_DELAY_MAX_MS) {
      return Math.round(raw);
    }
  } catch { /* Storage may be unavailable. */ }
  return GEMINI_REPLY_DELAY_DEFAULT_MS;
}

/** Mic coi như đang nói khi RMS vượt ngưỡng này; chỉ dùng để canh khung hình và đo độ trễ. */
const SPEAKING_RMS_THRESHOLD = 0.02;
/** Khung hình gần như y hệt khung đã gửi thì bỏ: màn hình đứng yên không đáng 258 token.
 * Ngưỡng tính trên chênh lệch luma trung bình của ảnh thu nhỏ 32x18, thang 0-255. */
const FRAME_CHANGE_THRESHOLD = 3;
/** Dù màn hình đứng yên vẫn gửi lại một khung sau ngần này, để Gemini không quên đang nhìn gì. */
const FRAME_HEARTBEAT_MS = 10_000;

/** Nén context sớm hơn mặc định (80% cửa sổ của model): context ngắn thì mỗi lượt trả lời
 * nhanh hơn, đổi lại Gemini quên phần hội thoại cũ sớm hơn. */
const CONTEXT_TRIGGER_TOKENS = 32_000;
const CONTEXT_TARGET_TOKENS = 12_000;

/** Còn ứ quá ngần này byte thì bỏ qua một khung hình thay vì nhét tiếp vào hàng đợi. */
const FRAME_BACKPRESSURE_BYTES = 192 * 1024;

/** Gemini Live accepts video at low frame rates; 1 fps is the documented uplink budget. */
export const GEMINI_VIDEO_UPLINK_FPS = 1;

/** Longest edge of an uplinked frame: camera stays small, screen keeps text legible. */
const CAMERA_FRAME_MAX_WIDTH = 640;
const SCREEN_FRAME_MAX_WIDTH = 1280;

/** Mic uplink rate required by the Live API, and the rate it speaks back at. */
export const GEMINI_INPUT_SAMPLE_RATE = 16000;
export const GEMINI_OUTPUT_SAMPLE_RATE = 24000;

/** Roughly two minutes of 24 kHz mono audio kept for replay, then the oldest turns drop. */
const AUDIO_CACHE_MAX_SAMPLES = GEMINI_OUTPUT_SAMPLE_RATE * 120;
const AUDIO_CACHE_MAX_TURNS = 12;

const DEFAULT_SYSTEM_INSTRUCTION = `Bạn là Gemini, một trợ lý AI đa năng đang trò chuyện trực tiếp bằng giọng nói với người dùng qua ứng dụng rust-sound trên macOS.

Phạm vi: trả lời mọi chủ đề người dùng hỏi — kiến thức chung, khoa học, y sinh, lập trình, công việc, học tập, đời sống, tin tức, giải thích những gì họ đang cho xem qua camera hoặc màn hình chia sẻ. Không tự giới hạn mình vào chủ đề âm thanh hay ứng dụng này.

Hình ảnh: khi có khung hình từ camera hoặc màn hình chia sẻ, hãy dựa vào nội dung thực sự nhìn thấy. Nếu khung hình đen, mờ hoặc không đọc được, nói thẳng là không thấy rõ; tuyệt đối không đoán hay bịa nội dung.

Thông tin mới: nếu có công cụ Google Search, dùng nó cho câu hỏi về sự kiện, giá cả, thời tiết hay dữ liệu thay đổi theo thời gian, rồi trả lời dựa trên kết quả tìm được.

Điều khiển âm thanh: bạn có thêm các hàm điều khiển mixer thật của máy (liệt kê ứng dụng đang phát tiếng, âm lượng và mute từng ứng dụng, âm lượng và mute master, 10 band EQ master). Chỉ gọi các hàm này khi người dùng yêu cầu thay đổi hoặc kiểm tra âm thanh. Trước khi chỉnh một ứng dụng, gọi list_audio_apps để lấy tên chính xác. Sau khi gọi, báo lại kết quả thực tế; nếu hàm lỗi thì nói rõ lý do, không nói là đã thành công.

Cách trả lời: dùng ngôn ngữ người dùng đang nói (mặc định tiếng Việt), giữ nguyên thuật ngữ chuyên ngành tiếng Anh, đi thẳng vào nội dung. Đây là hội thoại bằng giọng nói nên ưu tiên câu ngắn, rõ ràng; chỉ trình bày dài khi người dùng hỏi chi tiết.`;

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
  outputSampleRate = GEMINI_INPUT_SAMPLE_RATE
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

/**
 * Keep a capture-only <video> inside the document. Chromium decodes frames for
 * detached elements, WebKit (the macOS Tauri webview) does not reliably do so,
 * which leaves `drawImage` with empty frames. 2px at near-zero opacity keeps it
 * "visible" to WebKit's media policies without showing anything.
 */
function mountCaptureVideo(el: HTMLVideoElement): void {
  if (typeof document === "undefined" || !document.body || el.isConnected) return;
  el.setAttribute("aria-hidden", "true");
  el.style.cssText =
    "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:-1;";
  document.body.appendChild(el);
}

function unmountCaptureVideo(el: HTMLVideoElement | null): void {
  if (el && el.isConnected && typeof el.remove === "function") {
    el.remove();
  }
}

/** Frames whose brightest sampled pixel stays below this are treated as black. */
const BLACK_FRAME_MAX_LUMA = 16;
/** Consecutive bad ticks (at 1 fps) before the user is told the share is not working. */
const SCREEN_ISSUE_AFTER_TICKS = 3;

const DIAGNOSTICS_MAX_LINES = 80;

/**
 * WebKit can leave `resume()` pending until the next user gesture. Opening the
 * socket must not wait on that: the next click resumes it (see resumeAudio).
 */
async function resumeWithTimeout(ctx: AudioContext, ms = 600): Promise<void> {
  await Promise.race([
    ctx.resume().catch(() => {}),
    new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ]);
}
const SEARCH_BLOCKED_KEY = "gemini_live_search_blocked";
const SEARCH_BLOCK_TTL_MS = 24 * 60 * 60 * 1000;

/** Remember quota-blocked models for a day so every call does not pay a failed setup. */
function loadSearchBlocked(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(SEARCH_BLOCKED_KEY) || "{}") as Record<string, number>;
    const now = Date.now();
    return Object.entries(raw)
      .filter(([, at]) => typeof at === "number" && now - at < SEARCH_BLOCK_TTL_MS)
      .map(([model]) => model);
  } catch {
    return [];
  }
}

function persistSearchBlocked(models: string[]): void {
  try {
    const now = Date.now();
    localStorage.setItem(SEARCH_BLOCKED_KEY, JSON.stringify(Object.fromEntries(models.map((m) => [m, now]))));
  } catch {}
}

/** Turn a Live API close frame into something the user can act on. */
function describeCloseReason(code: number, reason: string, model: string): string {
  if (/api key not valid|api_key_invalid/i.test(reason)) {
    return "Gemini API Key không hợp lệ. Mở cấu hình API Key và nhập lại khóa từ Google AI Studio.";
  }
  if (/not found|not supported for bidiGenerateContent/i.test(reason)) {
    return `Model ${model.replace(/^models\//, "")} không hỗ trợ Live API với khóa này. Chọn model khác rồi gọi lại.`;
  }
  if (/quota|resource_exhausted|rate limit/i.test(reason) || code === 1011) {
    return `Gemini Live từ chối phiên (${code}): ${reason || "hết quota hoặc lỗi máy chủ"}.`;
  }
  return `Gemini Live đã ngắt kết nối (${code}${reason ? `: ${reason}` : ""})`;
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

  /** Playback gain applied to Gemini's voice, 0..1. */
  outputVolume = $state<number>(1);
  /** When off, Gemini's function calls are refused instead of touching the mixer. */
  toolsEnabled = $state<boolean>(true);
  /** When off, the session runs without input/output audio transcription. */
  captionsEnabled = $state<boolean>(true);
  /** Google Search grounding, so questions about current events get real answers. */
  webSearchEnabled = $state<boolean>(true);
  /**
   * Why the shared screen is not reaching Gemini, if it isn't: `black` means the
   * capture delivers empty frames (on macOS, missing Screen Recording permission),
   * `no-frames` means the stream never produced a decodable frame.
   */
  screenShareIssue = $state<"black" | "no-frames" | null>(null);
  /** Epoch ms of the moment the session became usable, for the call timer. */
  callStartedAt = $state<number | null>(null);
  /** Cumulative token count reported by the server for this session. */
  tokensUsed = $state<number>(0);
  /** Non-fatal session notice (feature downgrade, imminent expiry, reconnects). */
  notice = $state<string | null>(null);
  /** Voice persona the live session was actually opened with. */
  activeVoice = $state<string>("Aoede");
  /** Model the live session was actually opened with. */
  activeModel = $state<string>(DEFAULT_GEMINI_LIVE_MODEL);
  /** Screen/window capture currently uplinked to Gemini instead of the camera. */
  isScreenSharing = $state<boolean>(false);
  screenStream = $state<MediaStream | null>(null);

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
  private screenVideoElement: HTMLVideoElement | null = null;
  /** Latest natively captured screen frame (data URL), also what the stage previews. */
  nativeScreenFrame = $state<string | null>(null);
  private nativeScreenImage: HTMLImageElement | null = null;
  private nativeScreenPending = false;
  private canvasElement: HTMLCanvasElement | null = null;
  private videoCaptureInterval: number | null = null;

  private volumeAnimId: number | null = null;

  /** Options of the live session, replayed on persona switch and reconnect. */
  private lastOptions: GeminiLiveConnectOptions | null = null;
  /**
   * How much of the extended setup has been given up after a rejection:
   * 0 = transcription + tools, 1 = tools only, 2 = plain audio session.
   */
  private setupDowngradeLevel = 0;
  private reconnectAttempts = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private setupTimer: ReturnType<typeof setTimeout> | null = null;
  private sessionGeneration = 0;
  private restoreTranscript = false;
  private callTranscriptStart = 0;
  /** Latest resumable handle; re-opening with it keeps the conversation context. */
  private resumeHandle: string | null = null;
  /** The current notice only describes a re-open in progress and clears once it lands. */
  private noticeClearsOnConnect = false;
  /** Models whose key has no Search grounding quota: setup is closed with 1011 when asked. */
  searchBlockedModels = $state<string[]>(loadSearchBlocked());
  /** Rolling event log shown in the in-app diagnostics panel. */
  diagnostics = $state<string[]>([]);
  /** Wire counters, so "Gemini does not answer" can be told apart from "Gemini never heard you". */
  stats = $state({ audioSent: 0, audioReceived: 0, framesSent: 0, framesSkipped: 0, replyLatencyMs: 0 });
  /** Cửa sổ im lặng trước khi Gemini được phép trả lời. Áp ở lần mở phiên kế tiếp. */
  replyDelayMs = $state(loadReplyDelay());
  /** Lần cuối mic vượt ngưỡng, và thời điểm dứt câu đang chờ Gemini đáp. */
  private lastSpeechAt = 0;
  private awaitingReplySince = 0;
  /** Ảnh thu nhỏ của khung hình đã gửi gần nhất, để bỏ qua những khung không đổi gì. */
  private lastFrameSignature: Uint8Array | null = null;
  private lastFrameSentAt = 0;
  /** The server's last close frame, shown verbatim next to the error. */
  lastClose = $state<{ code: number; reason: string } | null>(null);
  private socketErrored = false;
  private lastSetupHadSearch = false;
  /** Consecutive screen ticks that were all-black, or had no decoded frame at all. */
  private blackFrameStreak = 0;
  private emptyFrameStreak = 0;
  private probeCanvas: HTMLCanvasElement | null = null;
  /** Whether the socket in flight was opened with `resumeHandle`. */
  private openedWithHandle = false;

  /** Streaming turn bookkeeping: which rows the next delta belongs to. */
  private activeAiMessageId: string | null = null;
  private activeUserMessageId: string | null = null;
  /** PCM of the AI turn in flight, moved into `audioCache` when the turn closes. */
  private turnAudio: Float32Array[] = [];
  private audioCache = new Map<string, Float32Array[]>();

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
    this.lastOptions = { ...(options ?? this.lastOptions ?? {}) };
    this.callTranscriptStart = this.transcript.length;
    this.callStartedAt = null;
    this.restoreTranscript = false;
    this.setupDowngradeLevel = 0;
    this.reconnectAttempts = 0;
    this.notice = null;
    this.resumeHandle = null;
    this.lastClose = null;
    await this.openSession(options ?? this.lastOptions ?? {});
  }

  /** Re-open the session with the last options; the resume handle keeps Gemini's context. */
  async reconnect(): Promise<void> {
    if (!this.lastOptions) return;
    await this.openSession({ ...this.lastOptions, enableVideo: this.isVideoEnabled });
  }

  /** Áp ngay cho phiên sau; phiên đang chạy giữ nguyên để không cắt cuộc gọi. */
  setReplyDelay(ms: number): void {
    const clamped = Math.min(GEMINI_REPLY_DELAY_MAX_MS, Math.max(GEMINI_REPLY_DELAY_MIN_MS, Math.round(ms)));
    this.replyDelayMs = clamped;
    try { localStorage.setItem(REPLY_DELAY_KEY, String(clamped)); } catch { /* optional persistence */ }
  }

  /** Gemini locks the voice per session, so a persona change re-opens the socket. */
  async switchVoice(voiceName: string): Promise<void> {
    this.lastOptions = { ...(this.lastOptions ?? {}), voiceName };
    if (this.status === "connected" || this.status === "connecting") {
      this.notice = `Đang áp dụng persona ${voiceName} cho phiên hiện tại...`;
      this.noticeClearsOnConnect = true;
      await this.openSession({ ...this.lastOptions, enableVideo: this.isVideoEnabled });
    }
  }

  private buildSetupMessage(
    model: string,
    voiceName: string,
    systemInstruction: string
  ): Record<string, unknown> {
    const withCaptions = this.captionsEnabled && this.setupDowngradeLevel < 1;
    const withTools = this.toolsEnabled && this.setupDowngradeLevel < 2;
    const withSearch =
      this.webSearchEnabled && this.setupDowngradeLevel < 2 && !this.searchBlockedModels.includes(model);
    this.lastSetupHadSearch = withSearch;

    const tools: Record<string, unknown>[] = [];
    if (withTools) tools.push({ functionDeclarations: GEMINI_AUDIO_TOOL_DECLARATIONS });
    if (withSearch) tools.push({ googleSearch: {} });

    return {
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
        systemInstruction: {
          parts: [{ text: `${systemInstruction}\n\n${withSearch
            ? 'Tìm kiếm theo yêu cầu: khi người dùng nói hoặc gõ “tìm tài liệu”, “search gg”, “search Google”, “tra Google”, “tìm trên mạng” hoặc yêu cầu tra cứu tương đương, hãy dùng công cụ Google Search trước khi trả lời, không chỉ hướng dẫn họ tự tìm. Dùng ngữ cảnh hội thoại để hiểu “tài liệu này”; nếu chưa xác định được thì hỏi lại ngắn gọn. Tóm tắt kết quả bằng giọng nói, ưu tiên nguồn chính thức và cung cấp tên nguồn cùng URL thực từ kết quả khi có. Không bịa đường dẫn hoặc nói đã tìm khi chưa có kết quả. Không cần tìm kiếm cho lời chào, lệnh điều khiển âm thanh hay trò chuyện thông thường. Nếu công cụ lỗi hoặc không có kết quả, nói rõ chưa tra cứu được.'
            : 'Google Search hiện không khả dụng trong phiên này. Khi người dùng yêu cầu tìm tài liệu, search gg hoặc tra Google, nói rõ chưa thể tra cứu web trong phiên này; không nói đã tìm, không bịa nguồn hay trình bày kiến thức sẵn có như kết quả tìm kiếm.'}` }],
        },
        // Audio-only responses carry no text, so transcription is what fills the
        // Dialogue Console for spoken turns on both sides.
        ...(withCaptions
          ? { inputAudioTranscription: {}, outputAudioTranscription: {} }
          : {}),
        ...(tools.length > 0 ? { tools } : {}),
        // Mặc định của Live API chờ im lặng khá lâu mới chốt lượt nói; đây là núm
        // chỉnh chính cho "Gemini trả lời nhanh tới đâu".
        realtimeInputConfig: {
          automaticActivityDetection: {
            silenceDurationMs: this.replyDelayMs,
            prefixPaddingMs: 20,
            endOfSpeechSensitivity: "END_SENSITIVITY_HIGH",
          },
        },
        sessionResumption: this.resumeHandle ? { handle: this.resumeHandle } : {},
        // Mặc định chỉ nén khi chạm 80% cửa sổ model, nên phiên dài tích token tới mức
        // mỗi lượt đều phải nhai lại cả đống context và chậm thấy rõ.
        contextWindowCompression: {
          triggerTokens: CONTEXT_TRIGGER_TOKENS,
          slidingWindow: { targetTokens: CONTEXT_TARGET_TOKENS },
        },
      },
    };
  }

  private async openSession(options: GeminiLiveConnectOptions): Promise<void> {
    this.cancelRetry();
    const generation = ++this.sessionGeneration;
    // Re-opening (persona switch, search/setup fallback, goAway, resume) swaps only
    // the socket. Tearing down and re-acquiring the mic and AudioContexts on every
    // re-open left WebKit with a silent mic: the call "connected" but never heard you.
    if (this.ws) {
      this.closeTransport();
    }

    this.status = "connecting";
    this.error = null;

    let apiKey = options?.apiKey?.trim();
    if (!apiKey) {
      apiKey = (await this.getApiKey())?.trim();
    }

    if (generation !== this.sessionGeneration) return;
    if (!apiKey) {
      this.status = "error";
      this.error =
        "Chưa tìm thấy Gemini API Key. Vui lòng thiết lập biến môi trường GEMINI_API_KEY hoặc cấu hình API Key.";
      return;
    }

    const voiceName = options?.voiceName || "Aoede";
    const model = options?.model || DEFAULT_GEMINI_LIVE_MODEL;
    const systemInstruction = options?.systemInstruction || DEFAULT_SYSTEM_INSTRUCTION;
    this.activeVoice = voiceName;
    this.activeModel = model;
    this.openedWithHandle = this.resumeHandle !== null;

    this.logDiag(
      `open session model=${model.replace(/^models\//, "")} voice=${voiceName} resume=${this.openedWithHandle} mic=${this.hasLiveMicrophone() ? "reused" : "new"}`
    );

    try {
      if (!this.hasLiveMicrophone()) {
        await this.setupMicrophone();
      }
    } catch (err) {
      if (generation !== this.sessionGeneration) return;
      this.logDiag(`mic failed: ${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}`);
      this.disconnect();
      this.status = "error";
      const msg = err instanceof Error ? err.message : String(err);
      this.error = `Không thể truy cập microphone: ${msg}`;
      return;
    }

    if (generation !== this.sessionGeneration) {
      if (["idle"].includes(this.status)) this.cleanupMedia();
      return;
    }
    const wsUrl = `${GEMINI_LIVE_WS_BASE}?key=${encodeURIComponent(apiKey)}`;

    try {
      this.ws = new WebSocket(wsUrl);
    } catch {
      this.logDiag("WebSocket creation failed; retrying");
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      const setup = this.buildSetupMessage(model, voiceName, systemInstruction);
      this.ws?.send(JSON.stringify(setup));
      this.logDiag(
        `setup sent search=${this.lastSetupHadSearch} tools=${this.toolsEnabled && this.setupDowngradeLevel < 2} captions=${this.captionsEnabled && this.setupDowngradeLevel < 1}`
      );
      this.startVolumeMonitor();
    };

    this.ws.onmessage = async (event: MessageEvent) => {
      await this.handleServerMessage(event, generation);
    };

    // `error` is always followed by `close`, which carries the code and reason.
    // Deciding here (as this used to) flipped the status to "error" before the
    // close handler ran, so WebKit skipped every recovery path and tore the call
    // down — screen share included.
    this.ws.onerror = () => {
      this.socketErrored = true;
      this.logDiag("socket error event");
    };

    this.ws.onclose = (event: CloseEvent) => this.handleClose(event);
    this.setupTimer = setTimeout(() => {
      if (generation === this.sessionGeneration && this.status === "connecting") {
        this.logDiag("setup timeout");
        this.scheduleReconnect();
      }
    }, 20_000);

    if (options?.enableVideo) {
      await this.enableVideo();
    }
    this.syncFrameCapture();
  }

  /**
   * The Live API rejects a setup by closing the socket (1007/1008) rather than
   * sending an `error` frame, so recovery decisions are made here.
   */
  private async handleClose(event: CloseEvent): Promise<void> {
    const reason = event.reason || "";
    const wasConnecting = this.status === "connecting";
    this.logDiag(`close code=${event.code} clean=${event.wasClean} while=${this.status} reason=${reason.slice(0, 120)}`);

    this.lastClose = { code: event.code, reason };

    // A close before setupComplete means the server refused this setup. Chromium
    // reports exactly why (1007 unknown field, 1011 quota) but WKWebView may hand
    // over a different code or an empty reason, and keying recovery on those
    // details is what killed the call on macOS right after "connecting". So any
    // setup-phase refusal that is not a bad key or a dead model sheds one optional
    // feature and retries: Google Search first, then captions, then tools.
    const fatalSetupError = /api key|api_key|not found|not supported for bidiGenerateContent/i.test(reason);
    const unknownField = event.code === 1007 && /unknown name|cannot find field/i.test(reason);
    const opaque = !reason || event.code === 1006;

    const rejectedHandle = wasConnecting && this.openedWithHandle &&
      /session.*(not found|expired|invalid)|(?:invalid|expired).*handle|resumption.*(invalid|expired)/i.test(reason);
    if (rejectedHandle) {
      this.resumeHandle = null;
      this.restoreTranscript = true;
      this.notice = "Phiên cũ hết hạn; đang khôi phục từ lịch sử chữ (không gồm audio/video cũ).";
      this.noticeClearsOnConnect = false;
      await this.reconnect();
      return;
    }

    if (wasConnecting && !fatalSetupError && (this.callStartedAt === null || unknownField)) {
      // The server named the field it rejects: shed exactly that (captions, then tools).
      if (unknownField && this.hasPendingSetupExtras()) {
        this.setupDowngradeLevel += 1;
        this.noticeClearsOnConnect = false;
        this.notice =
          this.setupDowngradeLevel === 1
            ? "Model không nhận audio transcription, đã tắt phụ đề và kết nối lại."
            : "Model không nhận tool-calling, đã kết nối lại ở chế độ thoại cơ bản.";
        await this.reconnect();
        return;
      }

      // Otherwise Google Search is the usual culprit (1011 quota on free keys), and
      // also the first thing to drop when the engine gave no usable reason.
      if (this.lastSetupHadSearch) {
        const quota = /quota|exceeded/i.test(reason);
        if (!this.searchBlockedModels.includes(this.activeModel)) {
          this.searchBlockedModels.push(this.activeModel);
          // Only confirmed quota failures persist; an opaque network blip is temporary.
          if (quota) persistSearchBlocked(this.searchBlockedModels);
        }
        this.noticeClearsOnConnect = false;
        this.notice = quota
          ? `Khóa API hết quota Google Search với ${this.activeModel.replace(/^models\//, "")}, đã tắt tìm kiếm web cho model này. Gemini vẫn trả lời mọi chủ đề từ kiến thức sẵn có; chọn Gemini 2.5 Flash Native Audio nếu cần tin tức mới.`
          : `Phiên có Google Search bị máy chủ đóng (mã ${event.code}), đã kết nối lại không kèm tìm kiếm web.`;
        await this.reconnect();
        return;
      }

      // No reason at all and nothing named: keep shedding optional features.
      if (opaque && this.hasPendingSetupExtras()) {
        this.setupDowngradeLevel += 1;
        this.noticeClearsOnConnect = false;
        this.notice =
          this.setupDowngradeLevel === 1
            ? `Máy chủ từ chối phiên (mã ${event.code}), đã tắt phụ đề và kết nối lại.`
            : `Máy chủ từ chối phiên (mã ${event.code}), đã kết nối lại ở chế độ thoại cơ bản.`;
        await this.reconnect();
        return;
      }
    }

    // Transport failures (including a normal server close) never end an active call.
    // Bad credentials/model/setup need intervention, not an endless request loop.
    if (!fatalSetupError && (event.code === 1000 || event.code === 1001 ||
        event.code === 1006 || event.code === 1011 || event.code === 1012 ||
        event.code === 1013 || /goaway|quota|exceeded|unavailable/i.test(reason))) {
      this.scheduleReconnect();
      return;
    }

    // User hangups detach this handler first, so every close that lands here came
    // from the server. Rejections arrive as *clean* 1007/1008 frames, so `wasClean`
    // says nothing about success: any close before setup, or with a non-1000 code, failed.
    if (this.status !== "idle") {
      if (wasConnecting || event.code !== 1000) {
        this.status = "error";
        this.error =
          event.code === 1006 || (this.socketErrored && !reason)
            ? `Mất kết nối tới Gemini Live (mã ${event.code}). Kiểm tra mạng rồi bấm thử lại.`
            : describeCloseReason(event.code, reason, this.activeModel);
      } else {
        this.status = "idle";
        this.notice = "Gemini Live đã kết thúc phiên từ phía máy chủ.";
      }
    }
    this.callStartedAt = null;
    this.cleanupMedia();
  }

  private cancelRetry(): void {
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private scheduleReconnect(): void {
    ++this.sessionGeneration;
    this.cancelRetry();
    this.closeTransport();
    this.status = "connecting";
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(this.reconnectAttempts++, 5));
    this.notice = `Mất kết nối; tự thử lại sau ${delay / 1000}s, giữ ngữ cảnh cuộc gọi.`;
    this.noticeClearsOnConnect = true;
    this.logDiag(`retry in ${delay}ms`);
    const generation = this.sessionGeneration;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (generation === this.sessionGeneration) void this.reconnect();
    }, delay);
  }

  private async handleServerMessage(event: MessageEvent, generation = this.sessionGeneration): Promise<void> {
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

    if (generation !== this.sessionGeneration) return;
    try {
      const parsed = JSON.parse(rawText);

      if (parsed.setupComplete) {
        this.logDiag("setupComplete");
        this.reconnectAttempts = 0;
        if (this.setupTimer !== null) clearTimeout(this.setupTimer);
        this.setupTimer = null;
        if (!this.openedWithHandle && (this.restoreTranscript || this.callStartedAt !== null)) {
          // ponytail: bound fallback history to 24k characters; summaries can retain older turns later.
          let remaining = 24_000;
          const turns = this.transcript.slice(this.callTranscriptStart).reverse()
            .filter((message) => (message.sender === "user" || message.sender === "ai") && message.text.trim())
            .flatMap((message) => {
              if (!remaining) return [];
              const text = message.text.slice(-remaining);
              remaining -= text.length;
              return [{ role: message.sender === "ai" ? "model" : "user", parts: [{ text }] }];
            }).reverse();
          if (turns.length) this.ws?.send(JSON.stringify({ clientContent: { turns, turnComplete: false } }));
          this.notice = turns.length
            ? "Đã khôi phục lịch sử chữ gần nhất (tối đa 24.000 ký tự); không gồm audio/video cũ."
            : "Không có lịch sử chữ để khôi phục ngữ cảnh phiên cũ.";
          this.noticeClearsOnConnect = false;
          this.restoreTranscript = false;
        }
        this.markConnected();
      }

      if (parsed.error) {
        const message =
          typeof parsed.error === "object" && parsed.error && "message" in parsed.error
            ? String(parsed.error.message)
            : "Gemini Live API báo lỗi.";

        if ([429, 500, 502, 503, 504].includes(Number(parsed.error?.code))) {
          this.scheduleReconnect();
          return;
        }

        // A setup rejected while we asked for transcription or tools is retried
        // with one feature less, so an older model never breaks the call outright.
        if (this.status === "connecting" && this.hasPendingSetupExtras()) {
          this.setupDowngradeLevel += 1;
          this.noticeClearsOnConnect = false;
          this.notice =
            this.setupDowngradeLevel === 1
              ? "Model không nhận audio transcription, đã tắt phụ đề và kết nối lại."
              : "Model không nhận tool-calling, đã kết nối lại ở chế độ thoại cơ bản.";
          await this.reconnect();
          return;
        }

        this.status = "error";
        this.error = message;
        return;
      }

      if (parsed.goAway) {
        this.logDiag("goAway: renewing session");
        this.notice = "Phiên Gemini Live sắp hết hạn, đang tự động kết nối lại...";
        this.noticeClearsOnConnect = true;
        // Scheduled expiry is not a failure: long calls must renew beyond two sessions.
        await this.reconnect();
        return;
      }

      if (parsed.sessionResumptionUpdate) {
        const update = parsed.sessionResumptionUpdate;
        if (update.resumable && typeof update.newHandle === "string" && update.newHandle) {
          this.resumeHandle = update.newHandle;
        }
      }

      if (parsed.usageMetadata?.totalTokenCount) {
        this.tokensUsed = Number(parsed.usageMetadata.totalTokenCount) || this.tokensUsed;
      }

      if (parsed.toolCall) {
        this.markConnected();
        await this.handleToolCall(parsed.toolCall);
        return;
      }

      if (parsed.toolCallCancellation) {
        return;
      }

      if (parsed.serverContent) {
        this.markConnected();

        const content = parsed.serverContent;

        if (content.inputTranscription?.text) {
          this.appendTurnText("user", content.inputTranscription.text, "voice");
        }

        if (content.outputTranscription?.text) {
          this.appendTurnText("ai", content.outputTranscription.text, "voice");
        }

        if (content.interrupted) {
          this.stopAudioPlayback();
          this.finalizeTurn();
        }

        if (content.modelTurn?.parts) {
          for (const part of content.modelTurn.parts) {
            // Native-audio models stream their reasoning as `thought` parts; never show it.
            if (part.thought) {
              continue;
            }

            if (part.text) {
              this.appendTurnText("ai", part.text, "text");
            }

            if (part.inlineData?.data) {
              this.stats.audioReceived += 1;
              if (this.awaitingReplySince > 0) {
                this.stats.replyLatencyMs = Date.now() - this.awaitingReplySince;
                this.awaitingReplySince = 0;
              }
              const float32 = base64ToFloat32(part.inlineData.data);
              if (float32.length > 0) {
                this.playAudioChunk(float32);
              }
            }
          }
        }

        if (content.turnComplete) {
          this.finalizeTurn();
        }
      }
    } catch (parseErr) {
      console.warn("Failed to parse Gemini Live message:", parseErr);
    }
  }

  /** True while the setup frame still carries a feature we could drop and retry. */
  private hasPendingSetupExtras(): boolean {
    if (this.setupDowngradeLevel < 1 && this.captionsEnabled) return true;
    if (this.setupDowngradeLevel < 2 && this.toolsEnabled) return true;
    return false;
  }

  private markConnected(): void {
    // Only an in-flight session may be promoted; never resurrect a closed or failed one.
    if (this.status !== "connecting" && this.status !== "connected") return;
    if (this.status !== "connected") {
      this.status = "connected";
      if (this.noticeClearsOnConnect) {
        this.notice = null;
        this.noticeClearsOnConnect = false;
      }
    }
    if (this.callStartedAt === null) {
      this.callStartedAt = Date.now();
    }
  }

  /** Append a streaming delta onto the open turn of `sender`, or start one. */
  private appendTurnText(
    sender: "user" | "ai",
    text: string,
    source: "voice" | "text"
  ): void {
    const activeId = sender === "ai" ? this.activeAiMessageId : this.activeUserMessageId;

    let target: GeminiLiveMessage | null = null;
    if (activeId) {
      const found = this.transcript.find((m) => m.id === activeId);
      if (found && !found.isFinal) {
        target = found;
      }
    }
    if (!target) {
      const last = this.transcript[this.transcript.length - 1];
      if (last && last.sender === sender && !last.isFinal) {
        target = last;
      }
    }

    if (target) {
      target.text += text;
    } else {
      target = {
        id: generateId(),
        sender,
        text,
        timestamp: new Date(),
        isFinal: false,
        source,
      };
      this.transcript.push(target);
    }

    if (sender === "ai") {
      this.activeAiMessageId = target.id;
    } else {
      this.activeUserMessageId = target.id;
    }
  }

  /** Close both open turns and hand the AI turn's PCM to the replay cache. */
  private finalizeTurn(): void {
    if (this.activeAiMessageId) {
      const aiMsg = this.transcript.find((m) => m.id === this.activeAiMessageId);
      if (aiMsg) {
        aiMsg.isFinal = true;
        if (this.turnAudio.length > 0) {
          this.audioCache.set(aiMsg.id, this.turnAudio);
          aiMsg.hasAudio = true;
          this.pruneAudioCache();
        }
      }
    }

    if (this.activeUserMessageId) {
      const userMsg = this.transcript.find((m) => m.id === this.activeUserMessageId);
      if (userMsg) {
        userMsg.isFinal = true;
      }
    }

    this.turnAudio = [];
    this.activeAiMessageId = null;
    this.activeUserMessageId = null;
  }

  private async handleToolCall(toolCall: {
    functionCalls?: { id?: string; name: string; args?: Record<string, unknown> }[];
  }): Promise<void> {
    const calls = toolCall?.functionCalls ?? [];
    if (calls.length === 0) return;

    // A tool call ends the spoken turn that requested it.
    this.finalizeTurn();

    const functionResponses: Record<string, unknown>[] = [];

    for (const call of calls) {
      let result: GeminiToolResult;
      if (!this.toolsEnabled) {
        result = {
          ok: false,
          summary: `Đã chặn ${call.name}: Agent Control đang tắt`,
          error: "agent_control_disabled",
        };
      } else {
        result = await runGeminiAudioTool(call.name, call.args ?? {});
      }

      this.transcript.push({
        id: generateId(),
        sender: "tool",
        text: result.summary,
        timestamp: new Date(),
        isFinal: true,
        toolName: call.name,
        toolOk: result.ok,
      });

      functionResponses.push({
        ...(call.id ? { id: call.id } : {}),
        name: call.name,
        response: {
          ok: result.ok,
          ...(result.data ?? {}),
          ...(result.error ? { error: result.error } : {}),
        },
      });
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ toolResponse: { functionResponses } }));
      } catch (err) {
        console.warn("Failed to send tool response to Gemini Live:", err);
      }
    }
  }

  private async setupMicrophone(): Promise<void> {
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("Trình duyệt hoặc môi trường không hỗ trợ MediaDevices getUserMedia.");
    }

    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: GEMINI_INPUT_SAMPLE_RATE,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    if (this.isMuted) {
      this.micStream.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
    }

    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    this.inputAudioContext = new AudioContextClass({ sampleRate: GEMINI_INPUT_SAMPLE_RATE });
    const actualSampleRate = this.inputAudioContext.sampleRate;
    if (this.inputAudioContext.state === "suspended") {
      await resumeWithTimeout(this.inputAudioContext);
    }
    const micTrack = this.micStream.getAudioTracks()[0];
    this.logDiag(
      `mic ok "${micTrack?.label ?? "?"}" ctx=${this.inputAudioContext.state} rate=${actualSampleRate}`
    );

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
      if (rms >= SPEAKING_RMS_THRESHOLD) {
        this.lastSpeechAt = Date.now();
        this.awaitingReplySince = 0;
      } else if (this.lastSpeechAt > 0 && this.awaitingReplySince === 0 && Date.now() - this.lastSpeechAt > 120) {
        // Vừa dứt câu: đây là lúc Gemini cần khung hình mới nhất, và là mốc đo độ trễ.
        this.awaitingReplySince = Date.now();
        void this.captureAndSendVideoFrame(true);
      }
      const targetVol = Math.min(1, Math.max(0, rms * 4.5));
      this.userVolume = Math.max(this.userVolume * 0.2 + targetVol * 0.8, targetVol);

      if (
        !this.ws ||
        this.ws.readyState !== WebSocket.OPEN ||
        this.status !== "connected"
      ) {
        return;
      }

      const pcm16Float = downsampleBuffer(inputChannel, actualSampleRate, GEMINI_INPUT_SAMPLE_RATE);
      const pcm16Bytes = float32ToInt16PCM(pcm16Float);
      const base64Data = uint8ArrayToBase64(pcm16Bytes);

      // `mediaChunks` is rejected with close 1007 on current models.
      const payload = {
        realtimeInput: {
          audio: {
            mimeType: `audio/pcm;rate=${GEMINI_INPUT_SAMPLE_RATE}`,
            data: base64Data,
          },
        },
      };

      try {
        this.ws.send(JSON.stringify(payload));
        this.stats.audioSent += 1;
      } catch (sendErr) {
        console.warn("Failed to send audio chunk to Gemini Live:", sendErr);
      }
    };
  }

  private ensureOutputGraph(): AudioContext {
    if (!this.outputAudioContext || this.outputAudioContext.state === "closed") {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.outputAudioContext = new AudioContextClass();
      this.outputAnalyser = this.outputAudioContext.createAnalyser();
      this.outputAnalyser.fftSize = 256;
      this.outputAnalyser.smoothingTimeConstant = 0.3;
      this.outputGainNode = this.outputAudioContext.createGain();
      this.outputGainNode.gain.value = this.outputVolume;
      this.outputGainNode.connect(this.outputAnalyser);
      this.outputAnalyser.connect(this.outputAudioContext.destination);
      this.nextPlayTime = 0;
    }

    if (this.outputAudioContext.state === "suspended") {
      void this.outputAudioContext.resume();
    }

    return this.outputAudioContext;
  }

  private playAudioChunk(float32: Float32Array, cacheForReplay = true): void {
    const ctx = this.ensureOutputGraph();

    if (cacheForReplay) {
      this.turnAudio.push(float32);
    }

    const audioBuffer = ctx.createBuffer(1, float32.length, GEMINI_OUTPUT_SAMPLE_RATE);
    audioBuffer.getChannelData(0).set(float32);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    if (this.outputGainNode) {
      source.connect(this.outputGainNode);
    } else if (this.outputAnalyser) {
      source.connect(this.outputAnalyser);
    } else {
      source.connect(ctx.destination);
    }

    const currentTime = ctx.currentTime;
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

  /** Keep the replay cache bounded; dropped turns lose their replay button. */
  private pruneAudioCache(): void {
    const dropped: string[] = [];

    while (this.audioCache.size > AUDIO_CACHE_MAX_TURNS) {
      const oldest = this.audioCache.keys().next();
      if (oldest.done) break;
      this.audioCache.delete(oldest.value);
      dropped.push(oldest.value);
    }

    let total = 0;
    for (const chunks of this.audioCache.values()) {
      for (const chunk of chunks) {
        total += chunk.length;
      }
    }

    while (total > AUDIO_CACHE_MAX_SAMPLES && this.audioCache.size > 1) {
      const oldest = this.audioCache.keys().next();
      if (oldest.done) break;
      const chunks = this.audioCache.get(oldest.value) ?? [];
      for (const chunk of chunks) {
        total -= chunk.length;
      }
      this.audioCache.delete(oldest.value);
      dropped.push(oldest.value);
    }

    for (const id of dropped) {
      const msg = this.transcript.find((m) => m.id === id);
      if (msg) {
        msg.hasAudio = false;
      }
    }
  }

  /** Replay a finished AI turn from its cached PCM. Returns false when nothing is cached. */
  replayMessage(id: string): boolean {
    const chunks = this.audioCache.get(id);
    if (!chunks || chunks.length === 0) {
      return false;
    }

    this.stopAudioPlayback();

    let total = 0;
    for (const chunk of chunks) {
      total += chunk.length;
    }
    const merged = new Float32Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    this.playAudioChunk(merged, false);
    this.startVolumeMonitor();
    return true;
  }

  hasReplayAudio(id: string): boolean {
    const chunks = this.audioCache.get(id);
    return Boolean(chunks && chunks.length > 0);
  }

  setOutputVolume(value: number): void {
    const clamped = Math.min(1, Math.max(0, value));
    this.outputVolume = clamped;
    if (this.outputGainNode) {
      this.outputGainNode.gain.value = clamped;
    }
  }

  setToolsEnabled(enabled: boolean): void {
    this.toolsEnabled = enabled;
  }

  setCaptionsEnabled(enabled: boolean): void {
    this.captionsEnabled = enabled;
  }

  setWebSearchEnabled(enabled: boolean): void {
    this.webSearchEnabled = enabled;
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
      mountCaptureVideo(this.videoElement);
      this.videoElement.srcObject = this.cameraStream;
      await this.videoElement.play().catch(() => {});

      if (!this.canvasElement) {
        this.canvasElement = document.createElement("canvas");
      }

      this.isVideoEnabled = true;
      this.syncFrameCapture();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Camera access failed:", msg);
      this.error = `Không thể truy cập camera: ${msg}`;
      this.isVideoEnabled = false;
    }
  }

  disableVideo(): void {
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
    this.syncFrameCapture();
  }

  async toggleVideo(): Promise<void> {
    if (this.isVideoEnabled) {
      this.disableVideo();
    } else {
      await this.enableVideo();
    }
  }

  /**
   * Share a screen or window. While sharing, its frames replace the camera's in
   * the uplink (Gemini takes one video stream); the camera keeps its PiP preview.
   */
  async startScreenShare(): Promise<void> {
    if (this.isScreenSharing && this.screenStream) {
      return;
    }
    // In the desktop app the frames come from macOS itself: WKWebView's
    // getDisplayMedia returns an all-black stream here however the Screen Recording
    // grant is set, and a black frame tells Gemini nothing.
    if (isTauri()) {
      if (!this.canvasElement) {
        this.canvasElement = document.createElement("canvas");
      }
      this.isScreenSharing = true;
      this.resetScreenDiagnostics();
      this.logDiag("screen share via native capture");
      this.syncFrameCapture();
      if (!(await this.captureNativeScreenFrame())) {
        this.stopScreenShare();
        this.error = "Không chụp được màn hình. Kiểm tra quyền Screen Recording cho rust-sound.";
        return;
      }
      return;
    }

    if (typeof window === "undefined" || !navigator.mediaDevices?.getDisplayMedia) {
      this.error = "Môi trường này không hỗ trợ chia sẻ màn hình (getDisplayMedia).";
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 5, max: 15 } },
        audio: false,
      });

      // Stopping from the OS/browser sharing indicator must end the share here too.
      stream.getVideoTracks().forEach((track) => {
        this.logDiag(`screen track "${track.label}" state=${track.readyState} muted=${track.muted}`);
        track.addEventListener("ended", () => {
          this.logDiag("screen track ended");
          if (this.screenStream === stream) {
            this.stopScreenShare();
          }
        });
        track.addEventListener("mute", () => this.logDiag("screen track muted (no frames)"));
        track.addEventListener("unmute", () => this.logDiag("screen track unmuted"));
      });

      this.attachScreenStream(stream);
    } catch (err) {
      // The user dismissing the picker is a choice, not an error. DOMException is
      // not reliably `instanceof Error`, so match on the name.
      if ((err as { name?: string } | null)?.name === "NotAllowedError") {
        this.error = null;
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      this.logDiag(`getDisplayMedia failed: ${(err as { name?: string } | null)?.name ?? "Error"}: ${msg}`);
      console.error("Screen capture failed:", msg);
      this.error = `Không thể chia sẻ màn hình: ${msg}`;
      this.isScreenSharing = false;
    }
  }

  private attachScreenStream(stream: MediaStream): void {
    this.screenStream = stream;
    if (!this.screenVideoElement) {
      this.screenVideoElement = document.createElement("video");
      this.screenVideoElement.autoplay = true;
      this.screenVideoElement.muted = true;
      this.screenVideoElement.playsInline = true;
    }
    mountCaptureVideo(this.screenVideoElement);
    this.screenVideoElement.srcObject = stream;
    void this.screenVideoElement.play().catch(() => {});
    this.resetScreenDiagnostics();

    if (!this.canvasElement) {
      this.canvasElement = document.createElement("canvas");
    }

    this.isScreenSharing = true;
    this.syncFrameCapture();
  }

  stopScreenShare(): void {
    if (this.screenStream) {
      this.screenStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      this.screenStream = null;
    }
    if (this.screenVideoElement) {
      this.screenVideoElement.srcObject = null;
    }
    this.nativeScreenFrame = null;
    this.isScreenSharing = false;
    this.resetScreenDiagnostics();
    this.syncFrameCapture();
  }

  private resetScreenDiagnostics(): void {
    this.blackFrameStreak = 0;
    this.emptyFrameStreak = 0;
    this.screenShareIssue = null;
  }

  /** Ảnh luma 32x18 của khung vừa vẽ, dùng để so xem màn hình có đổi gì không. */
  private frameSignature(): Uint8Array | null {
    try {
      if (!this.canvasElement) return null;
      if (!this.probeCanvas) {
        this.probeCanvas = document.createElement("canvas");
        this.probeCanvas.width = 32;
        this.probeCanvas.height = 18;
      }
      const ctx = this.probeCanvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | null;
      if (!ctx || typeof ctx.getImageData !== "function") return null;
      ctx.drawImage(this.canvasElement, 0, 0, 32, 18);
      const { data } = ctx.getImageData(0, 0, 32, 18);
      const signature = new Uint8Array(32 * 18);
      for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
        signature[p] = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) | 0;
      }
      return signature;
    } catch {
      return null;
    }
  }

  /** Màn hình đứng yên thì khung mới chỉ tốn token chứ không nói thêm điều gì. */
  private frameWorthSending(signature: Uint8Array | null, force: boolean): boolean {
    if (force || !signature) return true;
    const previous = this.lastFrameSignature;
    if (!previous || previous.length !== signature.length) return true;
    if (Date.now() - this.lastFrameSentAt >= FRAME_HEARTBEAT_MS) return true;
    let total = 0;
    for (let i = 0; i < signature.length; i += 1) total += Math.abs(signature[i] - previous[i]);
    return total / signature.length >= FRAME_CHANGE_THRESHOLD;
  }

  /**
   * Downscale the frame to 32x18 and return its brightest luma, or null when the
   * pixels cannot be read. Cheap enough to run on every 1 fps tick.
   */
  private sampleFrameMaxLuma(source: HTMLVideoElement): number | null {
    try {
      if (!this.probeCanvas) {
        this.probeCanvas = document.createElement("canvas");
        this.probeCanvas.width = 32;
        this.probeCanvas.height = 18;
      }
      const ctx = this.probeCanvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | null;
      if (!ctx || typeof ctx.getImageData !== "function") return null;
      ctx.drawImage(source, 0, 0, 32, 18);
      const { data } = ctx.getImageData(0, 0, 32, 18);
      let max = 0;
      for (let i = 0; i < data.length; i += 4) {
        const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        if (luma > max) max = luma;
      }
      return max;
    } catch {
      return null;
    }
  }

  /**
   * Track whether the shared screen is actually delivering content. Returns false
   * when this tick's frame must not be uplinked (no frame yet, or all black).
   */
  private checkScreenFrame(source: HTMLVideoElement): boolean {
    if (!source.videoWidth || !source.videoHeight) {
      this.emptyFrameStreak += 1;
      if (this.emptyFrameStreak >= SCREEN_ISSUE_AFTER_TICKS + 2 && this.screenShareIssue === null) {
        this.screenShareIssue = "no-frames";
      }
      return false;
    }
    this.emptyFrameStreak = 0;

    const maxLuma = this.sampleFrameMaxLuma(source);
    if (maxLuma !== null && maxLuma < BLACK_FRAME_MAX_LUMA) {
      this.blackFrameStreak += 1;
      if (this.blackFrameStreak >= SCREEN_ISSUE_AFTER_TICKS) {
        if (this.screenShareIssue !== "black") {
          this.logDiag(`screen frames black ${source.videoWidth}x${source.videoHeight}`);
        }
        this.screenShareIssue = "black";
      }
      // A black frame tells Gemini nothing and invites it to guess.
      return false;
    }

    this.blackFrameStreak = 0;
    this.screenShareIssue = null;
    return true;
  }

  async toggleScreenShare(): Promise<void> {
    if (this.isScreenSharing) {
      this.stopScreenShare();
    } else {
      await this.startScreenShare();
    }
  }

  /** Run the 1 fps uplink loop exactly while some video source is live. */
  private syncFrameCapture(): void {
    const hasSource = this.isScreenSharing || this.isVideoEnabled;
    if (hasSource && this.videoCaptureInterval === null) {
      this.videoCaptureInterval = window.setInterval(() => {
        void this.captureAndSendVideoFrame();
      }, Math.round(1000 / GEMINI_VIDEO_UPLINK_FPS));
    } else if (!hasSource) {
      this.stopVideoFrameCapture();
    }
  }

  private stopVideoFrameCapture(): void {
    if (this.videoCaptureInterval !== null) {
      clearInterval(this.videoCaptureInterval);
      this.videoCaptureInterval = null;
    }
  }

  /** Pull one frame from macOS and decode it; also what the stage preview shows. */
  private async captureNativeScreenFrame(): Promise<HTMLImageElement | null> {
    if (this.nativeScreenPending) return null;
    this.nativeScreenPending = true;
    try {
      const base64Jpeg = await invoke<string>("capture_screen_jpeg");
      const dataUrl = `data:image/jpeg;base64,${base64Jpeg}`;
      const img = this.nativeScreenImage ?? (this.nativeScreenImage = new Image());
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Khung hình không giải mã được"));
        img.src = dataUrl;
      });
      this.nativeScreenFrame = dataUrl;
      this.screenShareIssue = null;
      return img;
    } catch (err) {
      this.logDiag(`native screen capture failed: ${err instanceof Error ? err.message : String(err)}`);
      this.screenShareIssue = "no-frames";
      return null;
    } finally {
      this.nativeScreenPending = false;
    }
  }

  /** `force` là khung gửi ngay khi người dùng vừa dứt câu, không chịu bộ hãm bên dưới. */
  private async captureAndSendVideoFrame(force = false): Promise<void> {
    const nativeSharing = this.isScreenSharing && isTauri();
    const sharing = this.isScreenSharing && (nativeSharing || this.screenVideoElement !== null);

    // Diagnose the share even before the call connects, so a dead capture is
    // reported as soon as the user starts sharing.
    let nativeFrame: HTMLImageElement | null = null;
    if (nativeSharing) {
      nativeFrame = await this.captureNativeScreenFrame();
      if (!nativeFrame) return;
    } else if (sharing && this.screenVideoElement && !this.checkScreenFrame(this.screenVideoElement)) {
      return;
    }

    if (
      !this.canvasElement ||
      !this.ws ||
      this.ws.readyState !== WebSocket.OPEN ||
      this.status !== "connected"
    ) {
      return;
    }

    const v = nativeFrame ?? (sharing ? this.screenVideoElement : this.isVideoEnabled ? this.videoElement : null);
    if (!v) return;
    const srcWidth = nativeFrame ? nativeFrame.naturalWidth : (v as HTMLVideoElement).videoWidth;
    const srcHeight = nativeFrame ? nativeFrame.naturalHeight : (v as HTMLVideoElement).videoHeight;
    if (!srcWidth || !srcHeight) return;

    const maxWidth = sharing ? SCREEN_FRAME_MAX_WIDTH : CAMERA_FRAME_MAX_WIDTH;
    const scale = Math.min(1, maxWidth / srcWidth);
    const width = Math.round(srcWidth * scale);
    const height = Math.round(srcHeight * scale);

    this.canvasElement.width = width;
    this.canvasElement.height = height;

    const ctx = this.canvasElement.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(v, 0, 0, width, height);

    // Quyết định bỏ khung TRƯỚC khi mã hoá JPEG: encode một ảnh 1280px mỗi giây là
    // việc nặng, và khung bị bỏ thì không ai cần tới nó.
    const speaking = Date.now() - this.lastSpeechAt < 400;
    const signature = this.frameSignature();
    if (
      (!force && (speaking || this.ws.bufferedAmount > FRAME_BACKPRESSURE_BYTES)) ||
      !this.frameWorthSending(signature, force)
    ) {
      this.stats.framesSkipped += 1;
      return;
    }
    this.lastFrameSignature = signature;
    this.lastFrameSentAt = Date.now();

    // Screen text needs more JPEG quality than a face does.
    const dataUrl = this.canvasElement.toDataURL("image/jpeg", sharing ? 0.8 : 0.7);
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

    // Khung hình và tiếng mic đi chung một socket: một JPEG đang xếp hàng sẽ đẩy lùi
    // đúng câu người dùng vừa hỏi. Đang nói, hoặc hàng đợi còn ứ, thì bỏ qua nhịp này.

    try {
      this.ws.send(JSON.stringify(payload));
      this.stats.framesSent += 1;
    } catch (err) {
      console.warn("Failed to send video frame to Gemini Live:", err);
    }
  }

  setMuted(muted: boolean): void {
    const wasMuted = this.isMuted;
    this.isMuted = muted;
    if (this.micStream) {
      this.micStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }
    if (muted) {
      this.userVolume = 0;
      // Muting mid-sentence would otherwise leave the server waiting for more audio.
      if (!wasMuted && this.ws && this.ws.readyState === WebSocket.OPEN && this.status === "connected") {
        try {
          this.ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
        } catch {}
      }
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

    // A typed turn closes whatever speech turn was still open.
    this.finalizeTurn();

    this.transcript.push({
      id: generateId(),
      sender: "user",
      text: trimmed,
      timestamp: new Date(),
      isFinal: true,
      source: "text",
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
    this.callTranscriptStart = 0;
    this.transcript = [];
    this.audioCache.clear();
    this.turnAudio = [];
    this.activeAiMessageId = null;
    this.activeUserMessageId = null;
  }

  private startVolumeMonitor(): void {
    if (this.volumeAnimId !== null) return;
    const analyserData = new Uint8Array(128);

    const loop = () => {
      // Keep running past disconnect while a replay is still sounding.
      if (this.status === "idle" && this.activeSources.length === 0) {
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

    if (this.screenStream) {
      this.screenStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      this.screenStream = null;
    }
    if (this.screenVideoElement) {
      this.screenVideoElement.srcObject = null;
      unmountCaptureVideo(this.screenVideoElement);
      this.screenVideoElement = null;
    }
    this.isScreenSharing = false;
    this.resetScreenDiagnostics();

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
      unmountCaptureVideo(this.videoElement);
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

  /** Replace only the socket: mic, camera, screen and the audio graph stay live. */
  private closeTransport(): void {
    if (this.setupTimer !== null) clearTimeout(this.setupTimer);
    this.setupTimer = null;
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      try {
        this.ws.close(1000, "Session re-open");
      } catch {}
      this.ws = null;
    }
    // The old session's queued speech must not play over the new one.
    this.stopAudioPlayback();
    this.finalizeTurn();
    this.socketErrored = false;
    this.status = "idle";
  }

  /** True while the mic capture graph from an earlier open can be reused as is. */
  private hasLiveMicrophone(): boolean {
    const track = this.micStream?.getAudioTracks()[0];
    return Boolean(
      track &&
        track.readyState !== "ended" &&
        this.inputAudioContext &&
        this.inputAudioContext.state !== "closed" &&
        this.scriptProcessor
    );
  }

  /**
   * Resume AudioContexts the webview left suspended. Called from user gestures in
   * the view, since a context created from a socket callback may need one.
   */
  async resumeAudio(): Promise<void> {
    for (const ctx of [this.inputAudioContext, this.outputAudioContext]) {
      if (ctx && ctx.state === "suspended") {
        await resumeWithTimeout(ctx);
        this.logDiag(`resumed audio context -> ${ctx.state}`);
      }
    }
  }

  private logDiag(message: string): void {
    const time = new Date().toISOString().slice(11, 23);
    this.diagnostics.push(`${time} ${message}`);
    if (this.diagnostics.length > DIAGNOSTICS_MAX_LINES) {
      this.diagnostics.splice(0, this.diagnostics.length - DIAGNOSTICS_MAX_LINES);
    }
  }

  /** Plain-text report for the diagnostics panel's copy button. */
  diagnosticsReport(): string {
    const ctx = (c: AudioContext | null) => (c ? `${c.state}@${c.sampleRate}` : "none");
    const screenTrack = this.screenStream?.getVideoTracks()[0];
    return [
      `status=${this.status} model=${this.activeModel} voice=${this.activeVoice}`,
      `ws=${this.ws ? this.ws.readyState : "none"} error=${this.error ?? "-"}`,
      `audio sent=${this.stats.audioSent} received=${this.stats.audioReceived} frames sent=${this.stats.framesSent} skipped=${this.stats.framesSkipped}`,
      `reply delay setting=${this.replyDelayMs}ms · last measured latency=${this.stats.replyLatencyMs || "chưa đo"}ms`,
      `tokens=${this.tokensUsed} · compress at ${CONTEXT_TRIGGER_TOKENS} down to ${CONTEXT_TARGET_TOKENS}`,
      `mic=${this.micStream?.getAudioTracks()[0]?.readyState ?? "none"} muted=${this.isMuted} inCtx=${ctx(this.inputAudioContext)} outCtx=${ctx(this.outputAudioContext)}`,
      `screen=${this.isScreenSharing} native=${this.nativeScreenFrame !== null} track=${screenTrack ? `${screenTrack.readyState}/muted=${screenTrack.muted}` : "none"} size=${this.screenVideoElement?.videoWidth ?? 0}x${this.screenVideoElement?.videoHeight ?? 0} issue=${this.screenShareIssue ?? "-"}`,
      `search blocked=${this.searchBlockedModels.join(",") || "-"} getDisplayMedia=${typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getDisplayMedia)}`,
      "--- events ---",
      ...this.diagnostics,
    ].join("\n");
  }

  /** End the call: release every device and forget the conversation. */
  disconnect(): void {
    ++this.sessionGeneration;
    this.cancelRetry();
    this.restoreTranscript = false;
    this.cleanupMedia();
    this.closeTransport();

    this.error = null;
    this.userVolume = 0;
    this.aiVolume = 0;
    this.nextPlayTime = 0;
    this.callStartedAt = null;
    this.isMuted = false;
    this.notice = null;
    this.tokensUsed = 0;
    this.reconnectAttempts = 0;
    this.resumeHandle = null;
  }
}

export const geminiLive = new GeminiLiveService();
export const geminiLiveState = geminiLive;
