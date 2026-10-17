import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

class MockTrack {
  constructor(kind) {
    this.kind = kind;
    this.enabled = true;
    this.stopped = false;
    this.onended = null;
  }
  stop() {
    this.stopped = true;
  }
}

class MockMediaStream {
  constructor(tracks = []) {
    this._tracks = tracks;
  }
  getTracks() {
    return this._tracks;
  }
  getAudioTracks() {
    return this._tracks.filter((t) => t.kind === "audio");
  }
  getVideoTracks() {
    return this._tracks.filter((t) => t.kind === "video");
  }
}

/**
 * Socket giả lập vòng đời thật của BidiGenerateContent: mở async, nhận `setup`,
 * rồi phản hồi theo kịch bản (`plan`) để test được cả nhánh failover.
 *
 * plan[i] áp cho socket thứ i: "accept" | "close:<code>:<reason>" | "error:<message>"
 * | "silent" | function(ws, setup).
 */
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances = [];
  static plan = [];
  static autoOpen = true;

  static reset(plan = [], autoOpen = true) {
    MockWebSocket.instances = [];
    MockWebSocket.plan = plan;
    MockWebSocket.autoOpen = autoOpen;
  }

  constructor(url) {
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
    this.sent = [];
    this.setup = null;
    this.index = MockWebSocket.instances.length;
    MockWebSocket.instances.push(this);
    if (MockWebSocket.autoOpen) {
      setTimeout(() => this.fireOpen(), 0);
    }
  }

  get behavior() {
    const plan = MockWebSocket.plan;
    if (plan.length === 0) return "accept";
    return this.index < plan.length ? plan[this.index] : plan[plan.length - 1];
  }

  fireOpen() {
    if (this.readyState !== MockWebSocket.CONNECTING) return;
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  send(data) {
    this.sent.push(data);
    const parsed = JSON.parse(data);
    if (!parsed.setup) return;
    this.setup = parsed.setup;
    setTimeout(() => this.applyBehavior(), 0);
  }

  applyBehavior() {
    const behavior = this.behavior;
    if (typeof behavior === "function") {
      behavior(this, this.setup);
      return;
    }
    if (behavior === "accept") {
      this.emit({ setupComplete: {} });
      return;
    }
    if (behavior === "silent") {
      return;
    }
    if (behavior.startsWith("close:")) {
      const [, code, ...rest] = behavior.split(":");
      this.close(Number(code), rest.join(":"));
      return;
    }
    if (behavior.startsWith("error:")) {
      this.emit({ error: { message: behavior.slice("error:".length) } });
      return;
    }
    throw new Error(`Unknown MockWebSocket behavior: ${behavior}`);
  }

  emit(payload) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  close(code = 1000, reason = "") {
    if (this.readyState === MockWebSocket.CLOSED) return;
    this.readyState = MockWebSocket.CLOSED;
    this.closed = { code, reason };
    this.onclose?.({ code, reason, wasClean: code === 1000 });
  }
}

class MockAudioContext {
  constructor(opts = {}) {
    this.sampleRate = opts.sampleRate || 16000;
    this.state = "running";
    this.currentTime = 0;
    MockAudioContext.instances.push(this);
  }

  static instances = [];
  static processors = [];

  createScriptProcessor() {
    const node = {
      connect() {},
      disconnect() {},
      onaudioprocess: null,
    };
    MockAudioContext.processors.push(node);
    return node;
  }

  createMediaStreamSource() {
    return { connect() {}, disconnect() {} };
  }

  createGain() {
    return { gain: { value: 1.0 }, connect() {}, disconnect() {} };
  }

  createAnalyser() {
    return {
      fftSize: 256,
      smoothingTimeConstant: 0.3,
      connect() {},
      disconnect() {},
      getByteTimeDomainData(arr) {
        arr.fill(128);
      },
    };
  }

  createBuffer(channels, length, sampleRate) {
    return {
      duration: length / sampleRate,
      getChannelData() {
        return new Float32Array(length);
      },
    };
  }

  createBufferSource() {
    const src = {
      buffer: null,
      connect() {},
      disconnect() {},
      start() {},
      stop() {
        src.stopped = true;
      },
      onended: null,
      stopped: false,
    };
    return src;
  }

  async resume() {
    this.state = "running";
  }

  async close() {
    this.state = "closed";
  }
}

function createGeminiLiveHarness(options = {}) {
  const { invoke: customInvoke, plan = [], autoOpen = true, supportsDisplayMedia = true } = options;

  MockWebSocket.reset(plan, autoOpen);
  MockAudioContext.instances = [];
  MockAudioContext.processors = [];

  const micTracks = [];
  const camTracks = [];
  const screenTracks = [];
  const intervals = [];

  const source = readFileSync("src/lib/geminiLive.svelte.ts", "utf8")
    .replace(/^import .*;$/gm, "")
    .replaceAll("export ", "");

  const localStorageData = new Map();

  const mediaDevices = {
    getUserMedia: async (constraints) => {
      if (constraints.video) {
        const track = new MockTrack("video");
        camTracks.push(track);
        return new MockMediaStream([track]);
      }
      const track = new MockTrack("audio");
      micTracks.push(track);
      return new MockMediaStream([track]);
    },
  };

  if (supportsDisplayMedia) {
    mediaDevices.getDisplayMedia = async () => {
      const track = new MockTrack("video");
      screenTracks.push(track);
      return new MockMediaStream([track]);
    };
  }

  const context = vm.createContext({
    isTauri: () => false,
    invoke: customInvoke || (async () => null),
    $state: (v) => v,
    crypto: { randomUUID: () => `test-uuid-${Math.random().toString(36).slice(2, 8)}` },
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    localStorage: {
      getItem(k) {
        return localStorageData.get(k) || null;
      },
      setItem(k, v) {
        localStorageData.set(k, String(v));
      },
      removeItem(k) {
        localStorageData.delete(k);
      },
    },
    WebSocket: MockWebSocket,
    AudioContext: MockAudioContext,
    navigator: { mediaDevices },
    document: {
      createElement(tag) {
        if (tag === "video") {
          return {
            autoplay: true,
            muted: true,
            playsInline: true,
            srcObject: null,
            play: async () => {},
            videoWidth: 1920,
            videoHeight: 1080,
          };
        }
        if (tag === "canvas") {
          return {
            width: 0,
            height: 0,
            getContext: () => ({ drawImage() {} }),
            toDataURL: () => "data:image/jpeg;base64,mockframedata",
          };
        }
        return {};
      },
    },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    setTimeout,
    clearTimeout,
    setInterval: (fn) => {
      intervals.push(fn);
      return intervals.length;
    },
    clearInterval: () => {},
    console,
  });

  context.window = context;

  vm.runInContext(
    ts.transpile(source) +
      "\nglobalThis.GeminiLiveService = GeminiLiveService;" +
      "\nglobalThis.GEMINI_LIVE_MODEL_CANDIDATES = GEMINI_LIVE_MODEL_CANDIDATES;" +
      "\nglobalThis.buildModelCandidates = buildModelCandidates;",
    context
  );

  const instance = new context.GeminiLiveService();
  return {
    instance,
    micTracks,
    camTracks,
    screenTracks,
    intervals,
    localStorageData,
    context,
    candidates: context.GEMINI_LIVE_MODEL_CANDIDATES,
  };
}

/** Giả lập một block audio từ ScriptProcessorNode. */
function pumpAudioFrame(samples = 2048) {
  const processor = MockAudioContext.processors[MockAudioContext.processors.length - 1];
  assert.ok(processor?.onaudioprocess, "script processor has an onaudioprocess handler");
  const channel = new Float32Array(samples).fill(0.25);
  processor.onaudioprocess({ inputBuffer: { getChannelData: () => channel } });
}

test("GeminiLiveService initial state and camera/mic defaults", async () => {
  const { instance } = createGeminiLiveHarness();

  assert.equal(instance.status, "idle", "status starts as idle");
  assert.equal(instance.isMuted, false, "isMuted starts as false");
  assert.equal(instance.isVideoEnabled, false, "isVideoEnabled starts as false");
  assert.equal(instance.isScreenSharing, false, "isScreenSharing starts as false");
  assert.equal(instance.videoSource, null, "videoSource starts empty");
  assert.equal(instance.activeModel, null, "activeModel starts empty");
  assert.equal(instance.userVolume, 0, "userVolume starts at 0");
  assert.equal(instance.aiVolume, 0, "aiVolume starts at 0");
  assert.equal(instance.error, null, "error starts as null");
  assert.equal(instance.transcript.length, 0, "transcript starts empty");

  instance.toggleMute();
  assert.equal(instance.isMuted, true, "isMuted becomes true after toggleMute");
  instance.toggleMute();
  assert.equal(instance.isMuted, false, "isMuted toggles back to false");

  await instance.enableVideo();
  assert.equal(instance.isVideoEnabled, true, "isVideoEnabled becomes true after enableVideo");
  assert.equal(instance.videoSource, "camera", "camera becomes the active video source");

  instance.disableVideo();
  assert.equal(instance.isVideoEnabled, false, "isVideoEnabled becomes false after disableVideo");
  assert.equal(instance.videoSource, null, "video source cleared after disableVideo");

  await instance.toggleVideo();
  assert.equal(instance.isVideoEnabled, true, "toggleVideo enables video when off");
  await instance.toggleVideo();
  assert.equal(instance.isVideoEnabled, false, "toggleVideo disables video when on");
});

test("GeminiLiveService WebSocket connection lifecycle (v1beta setup, connect, disconnect)", async () => {
  const { instance, micTracks, localStorageData, candidates } = createGeminiLiveHarness();

  await instance.connect({ apiKey: "" });
  assert.equal(instance.status, "error", "connect without API key sets status to error");
  assert.match(instance.error, /Chưa tìm thấy Gemini API Key/, "provides clear error message");

  const connected = await instance.connect({ apiKey: "AIzaFakeTestKey-12345" });
  assert.equal(connected, true, "connect resolves true only after setupComplete");
  assert.equal(instance.status, "connected", "status is connected once the handshake finishes");

  assert.equal(MockWebSocket.instances.length, 1, "created one WebSocket instance");
  const ws = MockWebSocket.instances[0];
  assert.ok(
    ws.url.includes("v1beta.GenerativeService.BidiGenerateContent"),
    "connects to the v1beta BidiGenerateContent endpoint"
  );
  assert.ok(ws.url.includes("key=AIzaFakeTestKey-12345"), "ws URL includes API key query parameter");

  const setupPayload = JSON.parse(ws.sent[0]);
  assert.ok(setupPayload.setup, "first client message is the setup message");
  assert.equal(setupPayload.setup.model, candidates[0], "starts from the first model candidate");
  assert.deepEqual(
    setupPayload.setup.generationConfig.responseModalities,
    ["AUDIO"],
    "response modality is AUDIO"
  );
  assert.equal(
    setupPayload.setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName,
    "Aoede",
    "default voice persona is requested"
  );
  assert.ok(
    setupPayload.setup.inputAudioTranscription && setupPayload.setup.outputAudioTranscription,
    "requests input and output audio transcription so the transcript can fill"
  );
  assert.ok(setupPayload.setup.sessionResumption, "requests a session resumption handle");

  assert.equal(instance.activeModel, candidates[0], "exposes the negotiated model");
  assert.equal(
    localStorageData.get("gemini_live_model"),
    candidates[0],
    "remembers the working model for the next call"
  );

  instance.disconnect();
  assert.equal(instance.status, "idle", "status returns to idle after disconnect");
  assert.equal(ws.readyState, MockWebSocket.CLOSED, "websocket is closed on disconnect");
  assert.ok(micTracks[0].stopped, "mic audio track is stopped on disconnect");
});

test("GeminiLiveService fails over to the next model when a model is retired", async () => {
  const { instance, micTracks, localStorageData, candidates } = createGeminiLiveHarness({
    // Model đầu bị Google gỡ: server đóng ngay sau setup (đúng triệu chứng "vừa kết nối đã ngắt").
    plan: ["close:1007:models/gemini-x is not found for API version v1beta", "accept"],
  });

  const connected = await instance.connect({ apiKey: "AIzaFailover" });
  assert.equal(connected, true, "connect succeeds on the fallback model");
  assert.equal(instance.status, "connected", "status reaches connected after failover");
  assert.equal(MockWebSocket.instances.length, 2, "tried exactly two sockets");
  assert.equal(instance.activeModel, candidates[1], "second candidate becomes the active model");
  assert.equal(
    localStorageData.get("gemini_live_model"),
    candidates[1],
    "stores the model that actually worked"
  );
  assert.equal(micTracks.length, 1, "microphone is acquired once and reused across attempts");
  assert.equal(micTracks[0].stopped, false, "microphone survives the failover");
  assert.equal(instance.error, null, "no error is surfaced once a candidate connects");

  instance.disconnect();
});

test("GeminiLiveService falls back to the legacy endpoint when v1beta refuses every model", async () => {
  const { instance, localStorageData, candidates } = createGeminiLiveHarness({
    // v1beta từ chối mọi model/profile; chỉ endpoint v1alpha chấp nhận setup.
    plan: [
      (ws) => {
        if (ws.url.includes("v1alpha.")) {
          ws.emit({ setupComplete: {} });
        } else {
          ws.close(1007, "unsupported setup");
        }
      },
    ],
  });

  const connected = await instance.connect({ apiKey: "AIzaEndpointFallback" });
  assert.equal(connected, true, "connect succeeds on the fallback endpoint");

  const sockets = MockWebSocket.instances;
  assert.equal(sockets.length, candidates.length * 2 + 1, "probes v1beta fully before switching");
  assert.ok(sockets[0].url.includes("v1beta."), "starts on the documented v1beta endpoint");
  assert.ok(sockets[sockets.length - 1].url.includes("v1alpha."), "falls back to v1alpha");
  assert.equal(
    localStorageData.get("gemini_live_endpoint"),
    "v1alpha",
    "remembers the endpoint that worked"
  );

  const beta = sockets.filter((ws) => ws.url.includes("v1beta."));
  assert.ok(
    beta.some((ws) => JSON.parse(ws.sent[0]).setup.inputAudioTranscription),
    "the full setup profile is attempted first"
  );
  assert.ok(
    beta.some((ws) => JSON.parse(ws.sent[0]).setup.inputAudioTranscription === undefined),
    "then the minimal setup profile, for servers rejecting optional fields"
  );

  instance.disconnect();
});

test("GeminiLiveService stops immediately on API key failures instead of cycling models", async () => {
  const { instance } = createGeminiLiveHarness({
    plan: ["error:API key not valid. Please pass a valid API key."],
  });

  const connected = await instance.connect({ apiKey: "bad-key" });
  assert.equal(connected, false, "connect resolves false");
  assert.equal(instance.status, "error", "status is error");
  assert.equal(MockWebSocket.instances.length, 1, "does not retry other models on an auth failure");
  assert.match(instance.error, /API key not valid/, "surfaces the server message verbatim");
});

test("GeminiLiveService reports a handshake that never opens", async () => {
  const { instance } = createGeminiLiveHarness({ autoOpen: false });

  const pending = instance.connect({ apiKey: "AIzaNeverOpens" });
  // Mô phỏng upgrade thất bại (403 -> 1006, onopen không bao giờ chạy) cho mọi socket.
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    MockWebSocket.instances[MockWebSocket.instances.length - 1].close(1006, "");
  }
  const connected = await pending;

  assert.equal(connected, false, "connect resolves false");
  assert.equal(instance.status, "error", "status is error");
  assert.equal(
    MockWebSocket.instances.length,
    2,
    "a transport failure skips the rest of that endpoint and only escalates once per endpoint"
  );
  assert.ok(
    MockWebSocket.instances[1].url.includes("v1alpha."),
    "the second attempt switches endpoint instead of cycling models"
  );
  assert.match(instance.error, /code 1006/, "close code is reported for diagnosis");
  assert.match(instance.error, /API Key/, "points at the likely cause");
});

test("GeminiLiveService streams audio with realtimeInput.audio and fills the transcript", async () => {
  const { instance } = createGeminiLiveHarness();

  await instance.connect({ apiKey: "AIzaTestKey-Multi" });
  const ws = MockWebSocket.instances[0];
  assert.equal(instance.status, "connected");

  // 1. Audio đi lên bằng field `audio` (mediaChunks đã bị khai tử).
  pumpAudioFrame();
  const audioMsg = JSON.parse(ws.sent[ws.sent.length - 1]);
  assert.ok(audioMsg.realtimeInput?.audio, "uses realtimeInput.audio for mic PCM");
  assert.equal(
    audioMsg.realtimeInput.audio.mimeType,
    "audio/pcm;rate=16000",
    "declares 16 kHz PCM"
  );
  assert.ok(audioMsg.realtimeInput.audio.data.length > 0, "carries base64 PCM payload");
  assert.equal(audioMsg.realtimeInput.mediaChunks, undefined, "never sends the deprecated field");

  // 2. Transcription của người dùng và của model đều vào transcript.
  ws.emit({ serverContent: { inputTranscription: { text: "Giảm nhạc Spotify" } } });
  assert.equal(instance.transcript.length, 1, "user transcription creates a message");
  assert.equal(instance.transcript[0].sender, "user");
  assert.equal(instance.transcript[0].text, "Giảm nhạc Spotify");

  ws.emit({ serverContent: { outputTranscription: { text: "Đã giảm Spotify" } } });
  ws.emit({ serverContent: { outputTranscription: { text: " xuống 55%." } } });
  assert.equal(instance.transcript.length, 2, "model transcription starts a new message");
  assert.equal(instance.transcript[1].sender, "ai");
  assert.equal(instance.transcript[1].text, "Đã giảm Spotify xuống 55%.", "chunks are appended");
  assert.equal(instance.transcript[1].isFinal, false, "stays open while streaming");

  ws.emit({ serverContent: { turnComplete: true } });
  assert.equal(instance.transcript[1].isFinal, true, "turnComplete finalizes the message");

  // 3. Text parts (khi model trả text) vẫn được gộp như trước.
  ws.emit({ serverContent: { modelTurn: { parts: [{ text: "Xong." }] } } });
  assert.equal(instance.transcript.length, 3, "text part appends a new AI message");
  assert.equal(instance.transcript[2].text, "Xong.");

  // 4. Audio PCM 24 kHz từ server được phát lại.
  const pcmSamples = new Int16Array([500, -500, 1000, -1000, 200, -200]);
  const pcmBase64 = Buffer.from(pcmSamples.buffer).toString("base64");
  ws.emit({
    serverContent: {
      modelTurn: { parts: [{ inlineData: { mimeType: "audio/pcm;rate=24000", data: pcmBase64 } }] },
    },
  });

  // 5. Tin nhắn văn bản của người dùng.
  instance.sendTextMessage("Tối ưu hóa âm bass cho Spotify");
  const clientMsg = JSON.parse(ws.sent[ws.sent.length - 1]);
  assert.equal(clientMsg.clientContent.turns[0].parts[0].text, "Tối ưu hóa âm bass cho Spotify");
  assert.equal(clientMsg.clientContent.turnComplete, true);

  // 6. Interrupt dừng phát và chốt lượt AI.
  ws.emit({ serverContent: { interrupted: true } });
  assert.equal(instance.aiVolume, 0, "aiVolume resets on interrupt");

  // 7. Session resumption handle được ghi nhận cho lần reconnect.
  ws.emit({ sessionResumptionUpdate: { newHandle: "handle-abc", resumable: true } });

  instance.disconnect();
});

test("GeminiLiveService screen sharing streams frames and releases the display", async () => {
  const { instance, screenTracks, camTracks, intervals } = createGeminiLiveHarness();

  assert.equal(instance.supportsScreenShare(), true, "detects getDisplayMedia support");

  await instance.connect({ apiKey: "AIzaScreenShare", enableVideo: true });
  assert.equal(instance.status, "connected");
  assert.equal(instance.isVideoEnabled, true, "camera is on before sharing");

  const started = await instance.startScreenShare();
  assert.equal(started, true, "startScreenShare resolves true");
  assert.equal(instance.isScreenSharing, true, "isScreenSharing flips on");
  assert.equal(instance.videoSource, "screen", "screen becomes the active video source");
  assert.equal(instance.isVideoEnabled, false, "camera is released: Live API takes one video stream");
  assert.ok(camTracks[0].stopped, "camera track is stopped when screen sharing starts");
  assert.ok(instance.screenStream, "exposes the screen stream for the preview element");

  // Khung hình màn hình đi lên bằng realtimeInput.video, scale xuống 1024px.
  const capture = intervals[intervals.length - 1];
  capture();
  const ws = MockWebSocket.instances[0];
  const frameMsg = JSON.parse(ws.sent[ws.sent.length - 1]);
  assert.ok(frameMsg.realtimeInput?.video, "uses realtimeInput.video for frames");
  assert.equal(frameMsg.realtimeInput.video.mimeType, "image/jpeg", "frames are JPEG");
  assert.equal(frameMsg.realtimeInput.video.data, "mockframedata", "sends the base64 payload only");
  assert.equal(instance.videoFrameInfo, "1024x576 · 1fps", "reports the real frame geometry");

  // Người dùng bấm "Stop sharing" trên thanh hệ thống macOS.
  screenTracks[0].onended();
  assert.equal(instance.isScreenSharing, false, "track ended stops the share");
  assert.equal(instance.screenStream, null, "screen stream reference cleared");
  assert.equal(instance.videoSource, null, "video source cleared");

  // Bật lại rồi tắt bằng toggle.
  assert.equal(await instance.toggleScreenShare(), true, "toggle starts sharing again");
  assert.equal(instance.isScreenSharing, true);
  assert.equal(await instance.toggleScreenShare(), false, "toggle stops sharing");
  assert.equal(instance.isScreenSharing, false);
  assert.ok(screenTracks[1].stopped, "second display track is released");

  // Bật camera trở lại phải dừng chia sẻ màn hình (và ngược lại).
  await instance.startScreenShare();
  await instance.enableVideo();
  assert.equal(instance.isScreenSharing, false, "enabling the camera stops the screen share");
  assert.equal(instance.videoSource, "camera", "camera is the active source again");

  instance.disconnect();
  assert.equal(instance.isScreenSharing, false, "disconnect leaves no active share");
});

test("GeminiLiveService explains why screen sharing is unavailable", async () => {
  const { instance } = createGeminiLiveHarness({ supportsDisplayMedia: false });

  assert.equal(instance.supportsScreenShare(), false, "reports missing getDisplayMedia");
  const started = await instance.startScreenShare();
  assert.equal(started, false, "startScreenShare resolves false");
  assert.match(instance.error, /getDisplayMedia/, "names the missing capability");
  assert.equal(instance.isScreenSharing, false, "state stays off");
});

test("GeminiLiveService ignores callbacks from a superseded socket", async () => {
  const { instance } = createGeminiLiveHarness();

  await instance.connect({ apiKey: "AIzaFirstSession" });
  const firstWs = MockWebSocket.instances[0];
  assert.equal(instance.status, "connected");

  await instance.connect({ apiKey: "AIzaSecondSession" });
  assert.equal(MockWebSocket.instances.length, 2, "second connect opens a new socket");
  assert.equal(instance.status, "connected", "second session is connected");

  // Socket cũ bị tháo handler: onclose muộn của nó không được phép kéo sập phiên mới.
  assert.equal(firstWs.onclose, null, "stale socket handlers are detached");
  firstWs.close(1011, "late close from the old session");
  assert.equal(instance.status, "connected", "new session is unaffected by the old socket");

  instance.disconnect();
});

test("GeminiLiveService resumes a session dropped mid-call", async () => {
  const { instance, micTracks } = createGeminiLiveHarness({ plan: ["accept", "accept"] });

  await instance.connect({ apiKey: "AIzaResume" });
  assert.equal(instance.status, "connected");
  const firstWs = MockWebSocket.instances[0];
  firstWs.emit({ sessionResumptionUpdate: { newHandle: "handle-xyz", resumable: true } });

  // Server đóng phiên giữa cuộc gọi (hết thời lượng / mất mạng tạm thời).
  firstWs.close(1011, "internal error");
  assert.equal(instance.status, "connecting", "goes back to connecting instead of dying");

  await new Promise((resolve) => setTimeout(resolve, 900));
  assert.equal(instance.status, "connected", "session is restored automatically");
  assert.equal(MockWebSocket.instances.length, 2, "opened exactly one replacement socket");
  const resumeSetup = JSON.parse(MockWebSocket.instances[1].sent[0]).setup;
  assert.equal(
    resumeSetup.sessionResumption.handle,
    "handle-xyz",
    "replays the resumption handle so the conversation continues"
  );
  assert.equal(micTracks.length, 1, "microphone is not re-acquired for a resume");

  instance.disconnect();
});

test("GeminiLiveService gives up after repeated drops instead of looping forever", async () => {
  const { instance } = createGeminiLiveHarness({
    plan: ["accept", "close:1011:still broken", "close:1011:still broken"],
  });

  await instance.connect({ apiKey: "AIzaFlaky" });
  assert.equal(instance.status, "connected");

  MockWebSocket.instances[0].close(1011, "internal error");
  await new Promise((resolve) => setTimeout(resolve, 2000));

  assert.equal(instance.status, "error", "ends in a reported error");
  assert.match(instance.error, /không kết nối lại được/, "explains the reconnect failed");
  assert.ok(
    MockWebSocket.instances.length <= 3,
    `bounded retries, opened ${MockWebSocket.instances.length} sockets`
  );
});

test("GeminiLiveService cleans up media tracks on disconnect", async () => {
  const { instance, micTracks, camTracks } = createGeminiLiveHarness();

  await instance.connect({ apiKey: "AIzaTestKey-MediaCleanup", enableVideo: true });

  assert.equal(micTracks.length, 1, "initialized 1 microphone track");
  assert.equal(camTracks.length, 1, "initialized 1 camera track");
  assert.equal(micTracks[0].stopped, false, "mic track active before disconnect");
  assert.equal(camTracks[0].stopped, false, "cam track active before disconnect");
  assert.equal(instance.isVideoEnabled, true, "video enabled before disconnect");

  instance.disconnect();

  assert.equal(instance.status, "idle", "status is idle after disconnect");
  assert.equal(instance.isVideoEnabled, false, "isVideoEnabled reset to false");
  assert.equal(micTracks[0].stopped, true, "microphone track stopped on disconnect");
  assert.equal(camTracks[0].stopped, true, "camera track stopped on disconnect");
  assert.equal(instance.cameraStream, null, "cameraStream reference cleared");
  assert.equal(instance.activeModel, null, "activeModel cleared on disconnect");

  instance.transcript.push({
    id: "test-msg",
    sender: "user",
    text: "Sample text",
    timestamp: new Date(),
  });
  assert.equal(instance.transcript.length, 1);
  instance.clearTranscript();
  assert.equal(instance.transcript.length, 0, "clearTranscript empties transcript");
});

test("buildModelCandidates puts the preferred model first without duplicates", () => {
  const { context, candidates } = createGeminiLiveHarness();
  const build = context.buildModelCandidates;

  // join(): mảng tạo trong vm context khác realm nên deepStrictEqual trên Array sẽ fail.
  assert.equal(
    build(null).join(","),
    [...candidates].join(","),
    "defaults to the built-in candidate order"
  );

  const pinned = build("gemini-9.9-flash-live");
  assert.equal(pinned[0], "models/gemini-9.9-flash-live", "normalizes and prioritizes the override");
  assert.equal(pinned.length, candidates.length + 1, "keeps the fallbacks behind the override");

  const duplicate = build(candidates[2]);
  assert.equal(duplicate[0], candidates[2], "a known model moves to the front");
  assert.equal(duplicate.length, candidates.length, "no duplicate entries");
});
