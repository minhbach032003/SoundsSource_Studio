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

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances = [];

  constructor(url) {
    this.url = url;
    this.readyState = MockWebSocket.OPEN;
    this.sent = [];
    MockWebSocket.instances.push(this);
  }

  send(data) {
    this.sent.push(data);
  }

  close(code = 1000, reason = "") {
    this.readyState = MockWebSocket.CLOSED;
    this.closed = { code, reason };
    if (this.onclose) {
      this.onclose({ code, reason, wasClean: code === 1000 });
    }
  }
}

class MockAudioContext {
  constructor(opts = {}) {
    this.sampleRate = opts.sampleRate || 16000;
    this.state = "running";
    this.currentTime = 0;
  }

  createScriptProcessor() {
    const node = {
      connect() {},
      disconnect() {},
      onaudioprocess: null,
    };
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

function createGeminiLiveHarness(customInvoke) {
  MockWebSocket.instances = [];
  const micTracks = [];
  const camTracks = [];

  const source = readFileSync("src/lib/geminiLive.svelte.ts", "utf8")
    .replace(/^import .*;$/gm, "")
    .replaceAll("export ", "");

  const localStorageData = new Map();

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
    navigator: {
      mediaDevices: {
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
      },
    },
    document: {
      createElement(tag) {
        if (tag === "video") {
          return {
            autoplay: true,
            muted: true,
            playsInline: true,
            srcObject: null,
            play: async () => {},
            videoWidth: 640,
            videoHeight: 480,
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
    setInterval: () => 1,
    clearInterval: () => {},
    console,
  });

  context.window = context;

  vm.runInContext(
    ts.transpile(source) + "\nglobalThis.GeminiLiveService = GeminiLiveService;",
    context
  );

  const instance = new context.GeminiLiveService();
  return {
    instance,
    micTracks,
    camTracks,
    localStorageData,
    context,
  };
}

test("GeminiLiveService initial state and camera/mic defaults", async () => {
  const { instance } = createGeminiLiveHarness();

  // Initial state verification
  assert.equal(instance.status, "idle", "status starts as idle");
  assert.equal(instance.isMuted, false, "isMuted starts as false");
  assert.equal(instance.isVideoEnabled, false, "isVideoEnabled starts as false");
  assert.equal(instance.userVolume, 0, "userVolume starts at 0");
  assert.equal(instance.aiVolume, 0, "aiVolume starts at 0");
  assert.equal(instance.error, null, "error starts as null");
  assert.equal(instance.transcript.length, 0, "transcript starts empty");

  // Toggle mute behavior
  instance.toggleMute();
  assert.equal(instance.isMuted, true, "isMuted becomes true after toggleMute");
  instance.toggleMute();
  assert.equal(instance.isMuted, false, "isMuted toggles back to false");

  // Enable video transitions isVideoEnabled to true
  await instance.enableVideo();
  assert.equal(instance.isVideoEnabled, true, "isVideoEnabled becomes true after enableVideo");

  // Disable video transitions isVideoEnabled to false
  instance.disableVideo();
  assert.equal(instance.isVideoEnabled, false, "isVideoEnabled becomes false after disableVideo");

  // Toggle video transitions
  await instance.toggleVideo();
  assert.equal(instance.isVideoEnabled, true, "toggleVideo enables video when off");
  await instance.toggleVideo();
  assert.equal(instance.isVideoEnabled, false, "toggleVideo disables video when on");
});

test("GeminiLiveService WebSocket connection lifecycle (connect, setup, and disconnect)", async () => {
  const { instance, micTracks } = createGeminiLiveHarness();

  // Connecting without API key errors gracefully
  await instance.connect({ apiKey: "" });
  assert.equal(instance.status, "error", "connect without API key sets status to error");
  assert.match(instance.error, /Chưa tìm thấy Gemini API Key/, "provides clear error message");

  // Connect with valid API key
  const connectPromise = instance.connect({ apiKey: "AIzaFakeTestKey-12345" });
  await connectPromise;
  assert.equal(instance.status, "connecting", "status is connecting while WS opens");

  assert.equal(MockWebSocket.instances.length, 1, "created one WebSocket instance");
  const ws = MockWebSocket.instances[0];
  assert.ok(ws.url.includes("key=AIzaFakeTestKey-12345"), "ws URL includes API key query parameter");

  // Trigger ws.onopen -> sends setup message
  ws.onopen();
  assert.equal(ws.sent.length, 1, "setup payload sent on open");
  const setupPayload = JSON.parse(ws.sent[0]);
  assert.ok(setupPayload.setup, "payload contains setup key");
  assert.equal(setupPayload.setup.model, "models/gemini-2.0-flash-exp", "default model is gemini-2.0-flash-exp");
  assert.deepEqual(
    setupPayload.setup.generationConfig.responseModalities,
    ["AUDIO"],
    "response modality is AUDIO"
  );

  // Trigger setupComplete from server -> status becomes connected
  await ws.onmessage({ data: JSON.stringify({ setupComplete: true }) });
  assert.equal(instance.status, "connected", "status transitions to connected after setupComplete");

  // Disconnect lifecycle
  instance.disconnect();
  assert.equal(instance.status, "idle", "status returns to idle after disconnect");
  assert.equal(ws.readyState, MockWebSocket.CLOSED, "websocket is closed on disconnect");
  assert.ok(micTracks[0].stopped, "mic audio track is stopped on disconnect");
});

test("GeminiLiveService handles serverContent with text and inline audio PCM", async () => {
  const { instance } = createGeminiLiveHarness();

  await instance.connect({ apiKey: "AIzaTestKey-Multi" });
  const ws = MockWebSocket.instances[0];
  ws.onopen();
  await ws.onmessage({ data: JSON.stringify({ setupComplete: true }) });
  assert.equal(instance.status, "connected");

  // 1. Streaming text part 1
  await ws.onmessage({
    data: JSON.stringify({
      serverContent: {
        modelTurn: {
          parts: [{ text: "Chào bạn! Tôi là Gemini Live." }],
        },
      },
    }),
  });
  assert.equal(instance.transcript.length, 1, "one message added to transcript");
  assert.equal(instance.transcript[0].sender, "ai");
  assert.equal(instance.transcript[0].text, "Chào bạn! Tôi là Gemini Live.");
  assert.equal(instance.transcript[0].isFinal, false, "message is not final while streaming");

  // 2. Streaming text part 2 (continuation on active ai turn)
  await ws.onmessage({
    data: JSON.stringify({
      serverContent: {
        modelTurn: {
          parts: [{ text: " Tôi có thể hỗ trợ điều chỉnh âm thanh cho bạn." }],
        },
        turnComplete: true,
      },
    }),
  });
  assert.equal(instance.transcript.length, 1, "text appended to same message");
  assert.equal(
    instance.transcript[0].text,
    "Chào bạn! Tôi là Gemini Live. Tôi có thể hỗ trợ điều chỉnh âm thanh cho bạn."
  );
  assert.equal(instance.transcript[0].isFinal, true, "message marked final on turnComplete");

  // 3. Audio inlineData chunk handling
  const pcmSamples = new Int16Array([500, -500, 1000, -1000, 200, -200]);
  const pcmBase64 = Buffer.from(pcmSamples.buffer).toString("base64");

  await ws.onmessage({
    data: JSON.stringify({
      serverContent: {
        modelTurn: {
          parts: [
            {
              inlineData: {
                mimeType: "audio/pcm;rate=24000",
                data: pcmBase64,
              },
            },
          ],
        },
      },
    }),
  });

  // 4. User sends text message
  instance.sendTextMessage("Tối ưu hóa âm bass cho Spotify");
  assert.equal(instance.transcript.length, 2, "user message appended to transcript");
  assert.equal(instance.transcript[1].sender, "user");
  assert.equal(instance.transcript[1].text, "Tối ưu hóa âm bass cho Spotify");
  assert.equal(instance.transcript[1].isFinal, true);

  const clientMsg = JSON.parse(ws.sent[ws.sent.length - 1]);
  assert.equal(clientMsg.clientContent.turns[0].parts[0].text, "Tối ưu hóa âm bass cho Spotify");
  assert.equal(clientMsg.clientContent.turnComplete, true);

  // 5. Interrupted event clears playback and marks final
  await ws.onmessage({
    data: JSON.stringify({
      serverContent: {
        interrupted: true,
      },
    }),
  });
  assert.equal(instance.aiVolume, 0, "aiVolume resets on interrupt");

  instance.disconnect();
});

test("GeminiLiveService cleans up media tracks on disconnect", async () => {
  const { instance, micTracks, camTracks } = createGeminiLiveHarness();

  // Connect with video enabled
  await instance.connect({
    apiKey: "AIzaTestKey-MediaCleanup",
    enableVideo: true,
  });

  assert.equal(micTracks.length, 1, "initialized 1 microphone track");
  assert.equal(camTracks.length, 1, "initialized 1 camera track");
  assert.equal(micTracks[0].stopped, false, "mic track active before disconnect");
  assert.equal(camTracks[0].stopped, false, "cam track active before disconnect");
  assert.equal(instance.isVideoEnabled, true, "video enabled before disconnect");

  // Disconnect
  instance.disconnect();

  assert.equal(instance.status, "idle", "status is idle after disconnect");
  assert.equal(instance.isVideoEnabled, false, "isVideoEnabled reset to false");
  assert.equal(micTracks[0].stopped, true, "microphone track stopped on disconnect");
  assert.equal(camTracks[0].stopped, true, "camera track stopped on disconnect");
  assert.equal(instance.cameraStream, null, "cameraStream reference cleared");

  // Transcript clear verification
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
