import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances = [];

  constructor(url) {
    this.url = url;
    this.sent = [];
    this.readyState = MockWebSocket.OPEN;
    this.bufferedAmount = 0;
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
    MockWebSocket.instances.push(this);
    setImmediate(() => {
      this.onopen?.({});
    });
  }

  send(data) {
    this.sent.push(data);
  }

  close(code = 1000, reason = "") {
    this.readyState = MockWebSocket.CLOSED;
    this.closed = { code, reason };
    this.onclose?.({ code, reason, wasClean: code === 1000 });
  }

  receive(obj) {
    return this.onmessage?.({ data: JSON.stringify(obj) });
  }
}

class MockAudioContext {
  constructor() {
    this.state = "running";
    this.sampleRate = 48000;
  }
  createMediaStreamSource() {
    return { connect() {} };
  }
  createScriptProcessor() {
    return { connect() {}, onaudioprocess: null };
  }
  createGain() {
    return { connect() {}, gain: { value: 1 } };
  }
  createBufferSource() {
    return {
      connect() {},
      start() {},
      stop() {},
      buffer: null,
      onended: null,
    };
  }
  createBuffer() {
    return {
      getChannelData: () => new Float32Array(1024),
    };
  }
  async resume() {
    this.state = "running";
  }
  async close() {
    this.state = "closed";
  }
}

class MockTrack {
  constructor(kind) {
    this.kind = kind;
    this.readyState = "live";
    this.muted = false;
    this.stopped = false;
  }
  stop() {
    this.stopped = true;
    this.readyState = "ended";
  }
  addEventListener() {}
}

class MockMediaStream {
  constructor(tracks) {
    this.tracks = tracks;
  }
  getTracks() {
    return this.tracks;
  }
  getVideoTracks() {
    return this.tracks.filter((t) => t.kind === "video");
  }
  getAudioTracks() {
    return this.tracks.filter((t) => t.kind === "audio");
  }
}

function stripModule(path) {
  return readFileSync(path, "utf8")
    .replace(/^import .*;$/gm, "")
    .replaceAll("export ", "");
}

function createHarness(options = {}) {
  MockWebSocket.instances = [];
  const micTracks = [];
  const drawnSources = [];
  const ipcInvocations = [];

  const sampleBase64Jpeg = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

  const context = vm.createContext({
    isTauri: () => options.isTauri ?? true,
    invoke: async (cmd, args) => {
      ipcInvocations.push({ cmd, args });
      if (cmd === "capture_screen_jpeg") {
        if (options.failCapture) {
          throw new Error("Screen Recording permission denied");
        }
        return sampleBase64Jpeg;
      }
      if (cmd === "get_audio_processes") {
        return [
          { pid: 101, bundle_id: "com.spotify.client", name: "Spotify", volume: 0.8, muted: false, supports_volume: true },
          { pid: 102, bundle_id: "com.brave.browser", name: "Brave", volume: 1.0, muted: false },
        ];
      }
      if (cmd === "set_app_volume") {
        return { success: true };
      }
      return null;
    },
    $state: (v) => v,
    crypto: { randomUUID: () => `test-uuid-${Math.random().toString(36).slice(2, 8)}` },
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
    WebSocket: MockWebSocket,
    AudioContext: MockAudioContext,
    Image: class MockImage {
      constructor() {
        this.naturalWidth = 1280;
        this.naturalHeight = 720;
      }
      set src(value) {
        this._src = value;
        queueMicrotask(() => this.onload?.());
      }
      get src() {
        return this._src;
      }
    },
    navigator: {
      mediaDevices: {
        getUserMedia: async () => {
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
            videoWidth: 1280,
            videoHeight: 720,
          };
        }
        if (tag === "canvas") {
          return {
            width: 0,
            height: 0,
            getContext: () => ({
              drawImage: (s) => drawnSources.push(s),
              getImageData: (x, y, w, h) => ({
                data: new Uint8ClampedArray(w * h * 4).fill(128),
              }),
            }),
            toDataURL: () => `data:image/jpeg;base64,${sampleBase64Jpeg}`,
          };
        }
        return {};
      },
    },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    setInterval: () => 1,
    setTimeout,
    clearTimeout,
    clearInterval: () => {},
    console,
  });

  context.window = context;

  const source = `${stripModule("src/lib/geminiAudioTools.ts")}\n${stripModule("src/lib/desktopControl.svelte.ts")}\n${stripModule("src/lib/geminiLive.svelte.ts")}`;
  vm.runInContext(
    ts.transpile(source) + "\nglobalThis.GeminiLiveService = GeminiLiveService;",
    context
  );

  const instance = new context.GeminiLiveService();
  return { instance, ipcInvocations, drawnSources, sampleBase64Jpeg };
}

test("AI direct screen interaction: starts native screen share via Tauri IPC", { timeout: 5000 }, async (t) => {
  const { instance, ipcInvocations, sampleBase64Jpeg } = createHarness({ isTauri: true });
  t.after(() => instance.disconnect());

  assert.equal(instance.isScreenSharing, false);
  await instance.startScreenShare();

  assert.equal(instance.isScreenSharing, true, "Screen sharing must be active");
  assert.ok(instance.nativeScreenFrame?.startsWith("data:image/jpeg;base64,"), "Native frame must be loaded");
  assert.equal(instance.nativeScreenBase64, sampleBase64Jpeg);

  const captureCall = ipcInvocations.find((c) => c.cmd === "capture_screen_jpeg");
  assert.ok(captureCall, "Must invoke capture_screen_jpeg via Tauri IPC");
  assert.equal(captureCall.args.maxEdge, 1280, "Must request 1280 max edge");
  assert.equal(captureCall.args.quality, 0.8, "Must request 0.8 quality");
});

test("AI direct screen interaction: uplinks screen frames to Gemini Live WebSocket", { timeout: 5000 }, async (t) => {
  const { instance, sampleBase64Jpeg } = createHarness({ isTauri: true });
  t.after(() => instance.disconnect());

  await instance.startScreenShare();
  await instance.connect({ apiKey: "test-fake-key" });
  await new Promise((r) => setImmediate(r));

  const ws = MockWebSocket.instances[0];
  assert.ok(ws, "WebSocket must be open");

  // Complete Gemini setup handshake before capturing another frame.
  await ws.receive({ setupComplete: {} });
  assert.equal(instance.status, "connected");

  // Reusing the same Image must complete on every src assignment, not just the first.
  await instance.captureAndSendVideoFrame(true);
  await instance.captureAndSendVideoFrame(true);
  assert.equal(instance.stats.framesSent, 2);
  assert.equal(MockWebSocket.instances.length, 1, "Must not spuriously reconnect");

  const screenMessage = ws.sent.find((raw) => {
    const data = JSON.parse(raw);
    const chunk = data?.realtimeInput?.video;
    return chunk?.mimeType === "image/jpeg" && chunk?.data === sampleBase64Jpeg;
  });

  assert.ok(screenMessage, "Gemini WebSocket must receive realtimeInput with screen frame");
});

test("AI direct screen interaction: AI recognizes screen context and executes function call", { timeout: 5000 }, async (t) => {
  const { instance, ipcInvocations } = createHarness({ isTauri: true });
  t.after(() => instance.disconnect());

  await instance.startScreenShare();
  await instance.connect({ apiKey: "test-fake-key" });
  await new Promise((r) => setImmediate(r));

  const ws = MockWebSocket.instances[0];
  await ws.receive({ setupComplete: {} });
  assert.equal(instance.status, "connected");

  // AI examines the screen and decides to adjust Spotify volume to 50%
  await ws.receive({
    toolCall: {
      functionCalls: [
        {
          id: "call-1",
          name: "set_app_volume",
          args: { app_name: "Spotify", volume: 50 },
        },
      ],
    },
  });

  // Verify IPC command was executed on desktop
  const setVolCall = ipcInvocations.find((c) => c.cmd === "set_app_volume");
  assert.ok(setVolCall, "Tauri IPC set_app_volume must be executed");
  assert.equal(setVolCall.args.bundleId, "com.spotify.client");
  assert.equal(setVolCall.args.volume, 0.5);

  // Verify toolResponse was sent back to Gemini Live
  const toolResponseRaw = ws.sent.find((raw) => raw.includes("toolResponse"));
  assert.ok(toolResponseRaw, "toolResponse must be returned to Gemini Live");
  const toolResp = JSON.parse(toolResponseRaw);
  assert.equal(toolResp.toolResponse.functionResponses[0].id, "call-1");
  assert.equal(toolResp.toolResponse.functionResponses[0].name, "set_app_volume");
  assert.equal(toolResp.toolResponse.functionResponses[0].response.ok, true);

  // Verify live conversation transcript contains the executed tool action
  const transcriptEntry = instance.transcript.find((t) => t.sender === "tool");
  assert.ok(transcriptEntry, "Transcript must record executed tool action");
  assert.equal(transcriptEntry.toolName, "set_app_volume");
  assert.equal(transcriptEntry.toolOk, true);
});

test("AI direct screen interaction: handles missing screen recording permission gracefully", { timeout: 5000 }, async (t) => {
  const { instance } = createHarness({ isTauri: true, failCapture: true });
  t.after(() => instance.disconnect());

  await instance.startScreenShare();

  assert.equal(instance.isScreenSharing, false, "Screen share must not be active on permission failure");
  assert.ok(instance.error?.includes("Screen Recording"), "Must surface human-readable Screen Recording notice");
});
