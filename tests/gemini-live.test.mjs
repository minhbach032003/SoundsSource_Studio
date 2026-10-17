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
    this.listeners = {};
  }
  stop() {
    this.stopped = true;
  }
  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }
  /** Simulates the user pressing "Stop sharing" in the OS/browser indicator. */
  fire(type) {
    for (const fn of this.listeners[type] || []) fn();
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

function stripModule(path) {
  return readFileSync(path, "utf8")
    .replace(/^import .*;$/gm, "")
    .replaceAll("export ", "");
}

function createGeminiLiveHarness(options) {
  MockWebSocket.instances = [];
  const micTracks = [];
  const camTracks = [];
  const screenTracks = [];
  const drawnSources = [];

  const opts = typeof options === "function" ? { invoke: options } : options || {};
  const frame = { luma: 200 };
  const timers = new Map();
  let timerId = 0;

  // geminiLive imports its function-calling layer, so both modules share one scope.
  const source = `${stripModule("src/lib/geminiAudioTools.ts")}\n${stripModule(
    "src/lib/geminiLive.svelte.ts"
  )}`;

  const localStorageData = new Map();

  const context = vm.createContext({
    isTauri: () => opts.isTauri ?? false,
    invoke: opts.invoke || (async () => null),
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
        getDisplayMedia: async () => {
          if (opts.denyScreen) {
            const err = new Error("Permission denied");
            err.name = "NotAllowedError";
            throw err;
          }
          const track = new MockTrack("video");
          track.label = "screen";
          screenTracks.push(track);
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
            getContext: () => ({
              drawImage(source) {
                drawnSources.push(source);
              },
              getImageData(x, y, w, h) {
                return { data: new Uint8ClampedArray(w * h * 4).fill(frame.luma) };
              },
            }),
            toDataURL: () => "data:image/jpeg;base64,mockframedata",
          };
        }
        return {};
      },
    },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    setInterval: () => 1,
    setTimeout: (fn, ms) => {
      const id = ++timerId;
      timers.set(id, { fn, ms });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    clearInterval: () => {},
    console,
  });

  context.window = context;

  vm.runInContext(
    ts.transpile(source) +
      "\nglobalThis.GeminiLiveService = GeminiLiveService;" +
      "\nglobalThis.resolveEqBandIndex = resolveEqBandIndex;" +
      "\nglobalThis.resolveAudioApp = resolveAudioApp;" +
      "\nglobalThis.runGeminiAudioTool = runGeminiAudioTool;" +
      "\nglobalThis.GEMINI_AUDIO_TOOL_DECLARATIONS = GEMINI_AUDIO_TOOL_DECLARATIONS;",
    context
  );

  const instance = new context.GeminiLiveService();
  return {
    instance,
    timers,
    async retry() {
      const entry = [...timers.entries()].find(([, timer]) => timer.ms >= 1000);
      assert.ok(entry, "retry is scheduled");
      timers.delete(entry[0]);
      await entry[1].fn();
      await Promise.resolve();
    },
    micTracks,
    camTracks,
    screenTracks,
    drawnSources,
    setFrameLuma: (v) => {
      frame.luma = v;
    },
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
  // gemini-2.0-flash-exp is closed with 1008 by the live service; 3.1 Flash Live is the verified default.
  assert.equal(
    setupPayload.setup.model,
    "models/gemini-3.1-flash-live-preview",
    "default model is a live-capable model"
  );
  assert.ok(ws.url.includes(".v1beta."), "connects to the v1beta Live endpoint");
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

const MOCK_PROCESSES = [
  {
    object_id: 1,
    pid: 501,
    bundle_id: "com.spotify.client",
    name: "Spotify",
    is_running_output: true,
    is_regular_app: true,
    supports_volume: true,
  },
  {
    object_id: 2,
    pid: 502,
    bundle_id: "com.brave.browser",
    name: "Brave Browser",
    is_running_output: true,
    is_regular_app: true,
    supports_volume: true,
  },
  {
    object_id: 3,
    pid: 503,
    bundle_id: "com.apple.finder",
    name: "Finder",
    is_running_output: false,
    is_regular_app: true,
    supports_volume: false,
  },
];

function createMixerInvoke(calls) {
  return async (command, args) => {
    calls.push({ command, args });
    switch (command) {
      case "get_audio_processes":
        return MOCK_PROCESSES;
      case "get_master_volume":
        return 0.42;
      case "get_master_eq_bands":
        return {
          bands: [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000].map((frequency) => ({
            frequency,
            gain: 0,
            bandwidth: 1,
          })),
          bypass: false,
        };
      case "set_master_eq_bypass":
        return Boolean(args.bypass);
      default:
        return null;
    }
  };
}

async function openLiveSession(harness, apiKey = "AIzaTestKey-Session") {
  await harness.instance.connect({ apiKey });
  const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
  ws.onopen();
  await ws.onmessage({ data: JSON.stringify({ setupComplete: true }) });
  return ws;
}

test("setup frame negotiates transcription, tools and a system instruction", async () => {
  const { instance } = createGeminiLiveHarness();

  await instance.connect({ apiKey: "AIzaTestKey-Setup", voiceName: "Puck" });
  const ws = MockWebSocket.instances[0];
  ws.onopen();

  const setup = JSON.parse(ws.sent[0]).setup;

  assert.equal(
    setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName,
    "Puck",
    "requested persona reaches the setup frame"
  );
  assert.ok(setup.inputAudioTranscription, "asks for user speech transcription");
  assert.ok(setup.outputAudioTranscription, "asks for model speech transcription");
  assert.ok(setup.systemInstruction?.parts?.[0]?.text?.includes("rust-sound"), "ships a system instruction");

  const declared = setup.tools[0].functionDeclarations.map((d) => d.name);
  for (const name of [
    "list_audio_apps",
    "set_app_volume",
    "set_app_mute",
    "set_master_volume",
    "set_master_mute",
    "set_master_eq_band",
    "reset_master_eq",
  ]) {
    assert.ok(declared.includes(name), `declares mixer tool ${name}`);
  }

  instance.disconnect();
});

test("a rejected setup is retried one feature at a time, keeping tool calling", async () => {
  const { instance } = createGeminiLiveHarness();

  await instance.connect({ apiKey: "AIzaTestKey-Downgrade" });
  const first = MockWebSocket.instances[0];
  first.onopen();
  const firstSetup = JSON.parse(first.sent[0]).setup;
  assert.ok(firstSetup.tools, "first attempt asks for tools");
  assert.ok(firstSetup.inputAudioTranscription, "first attempt asks for transcription");

  // Step 1: a model without transcription keeps its function calling.
  await first.onmessage({
    data: JSON.stringify({ error: { message: "Unknown field: inputAudioTranscription" } }),
  });
  assert.equal(MockWebSocket.instances.length, 2, "reconnected after the first rejection");
  const second = MockWebSocket.instances[1];
  second.onopen();
  const secondSetup = JSON.parse(second.sent[0]).setup;
  assert.equal(secondSetup.inputAudioTranscription, undefined, "retry drops transcription");
  assert.ok(secondSetup.tools, "retry still declares the mixer tools");
  assert.equal(instance.status, "connecting", "retry keeps the call alive instead of failing");
  assert.match(instance.notice, /phụ đề/, "explains that captions were dropped");

  // Step 2: only then is tool calling given up.
  await second.onmessage({
    data: JSON.stringify({ error: { message: "Unknown field: tools" } }),
  });
  assert.equal(MockWebSocket.instances.length, 3, "reconnected after the second rejection");
  const third = MockWebSocket.instances[2];
  third.onopen();
  const thirdSetup = JSON.parse(third.sent[0]).setup;
  assert.equal(thirdSetup.tools, undefined, "second retry drops tool declarations");
  assert.match(instance.notice, /thoại cơ bản/, "explains the fallback to a plain session");

  // Nothing left to drop: the next rejection is a real error.
  await third.onmessage({ data: JSON.stringify({ error: { message: "Invalid API key" } }) });
  assert.equal(instance.status, "error", "final rejection reports the error");
  assert.equal(instance.error, "Invalid API key");
  assert.equal(MockWebSocket.instances.length, 3, "no further retries");

  instance.disconnect();
});

test("spoken turns land in the transcript through audio transcription", async () => {
  const harness = createGeminiLiveHarness();
  const { instance } = harness;
  const ws = await openLiveSession(harness);

  await ws.onmessage({
    data: JSON.stringify({ serverContent: { inputTranscription: { text: "Giảm Spotify " } } }),
  });
  await ws.onmessage({
    data: JSON.stringify({ serverContent: { inputTranscription: { text: "xuống 40%" } } }),
  });

  assert.equal(instance.transcript.length, 1, "user speech opens exactly one row");
  assert.equal(instance.transcript[0].sender, "user");
  assert.equal(instance.transcript[0].text, "Giảm Spotify xuống 40%", "deltas append to the open turn");
  assert.equal(instance.transcript[0].source, "voice", "row is tagged as live voice");
  assert.equal(instance.transcript[0].isFinal, false, "turn stays open while streaming");

  await ws.onmessage({
    data: JSON.stringify({ serverContent: { outputTranscription: { text: "Đã giảm Spotify." } } }),
  });
  await ws.onmessage({ data: JSON.stringify({ serverContent: { turnComplete: true } }) });

  assert.equal(instance.transcript.length, 2, "model speech opens its own row");
  assert.equal(instance.transcript[1].sender, "ai");
  assert.equal(instance.transcript[1].text, "Đã giảm Spotify.");
  assert.equal(instance.transcript[0].isFinal, true, "user turn finalised on turnComplete");
  assert.equal(instance.transcript[1].isFinal, true, "ai turn finalised on turnComplete");

  // The next spoken turn must not append onto the finalised rows.
  await ws.onmessage({
    data: JSON.stringify({ serverContent: { inputTranscription: { text: "Cảm ơn" } } }),
  });
  assert.equal(instance.transcript.length, 3, "a new turn starts a new row");

  instance.disconnect();
});

test("Gemini function calls drive the real mixer and are answered with toolResponse", async () => {
  const calls = [];
  const harness = createGeminiLiveHarness({ isTauri: true, invoke: createMixerInvoke(calls) });
  const { instance } = harness;
  const ws = await openLiveSession(harness);

  await ws.onmessage({
    data: JSON.stringify({
      toolCall: {
        functionCalls: [
          { id: "fc-1", name: "set_app_volume", args: { app: "spotify", volume_percent: 55 } },
          { id: "fc-2", name: "set_master_eq_band", args: { frequency_hz: 2500, gain_db: 4 } },
        ],
      },
    }),
  });

  const volumeCall = calls.find((c) => c.command === "set_app_volume");
  assert.ok(volumeCall, "invoked the set_app_volume Tauri command");
  assert.equal(volumeCall.args.bundleId, "com.spotify.client", "resolved 'spotify' to its bundle id");
  assert.ok(Math.abs(volumeCall.args.volume - 0.55) < 1e-6, "percent converted to 0..1 gain");

  const eqCall = calls.find((c) => c.command === "set_master_eq_band");
  assert.ok(eqCall, "invoked the set_master_eq_band Tauri command");
  assert.equal(eqCall.args.bandIndex, 6, "2.5kHz request snapped to the 2kHz band");
  assert.equal(eqCall.args.gainDb, 4);

  const toolRows = instance.transcript.filter((m) => m.sender === "tool");
  assert.equal(toolRows.length, 2, "both executions are visible in the Dialogue Console");
  assert.ok(toolRows.every((row) => row.toolOk === true), "rows report success");
  assert.match(toolRows[0].text, /Spotify/, "row names the app that changed");

  const reply = JSON.parse(ws.sent[ws.sent.length - 1]);
  assert.equal(reply.toolResponse.functionResponses.length, 2, "answers every function call");
  assert.equal(reply.toolResponse.functionResponses[0].id, "fc-1", "echoes the call id");
  assert.equal(reply.toolResponse.functionResponses[0].response.ok, true);

  instance.disconnect();
});

test("Agent Control off refuses function calls without touching the mixer", async () => {
  const calls = [];
  const harness = createGeminiLiveHarness({ isTauri: true, invoke: createMixerInvoke(calls) });
  const { instance } = harness;
  instance.setToolsEnabled(false);
  const ws = await openLiveSession(harness);

  const offTools = JSON.parse(ws.sent[0]).setup.tools || [];
  assert.equal(
    offTools.some((t) => t.functionDeclarations),
    false,
    "no mixer functions declared while off (Google Search may remain)"
  );

  await ws.onmessage({
    data: JSON.stringify({
      toolCall: { functionCalls: [{ id: "fc-9", name: "set_master_mute", args: { muted: true } }] },
    }),
  });

  assert.equal(
    calls.filter((c) => c.command === "set_master_mute").length,
    0,
    "the mixer command is never invoked"
  );
  const row = instance.transcript.find((m) => m.sender === "tool");
  assert.equal(row.toolOk, false, "the refusal is recorded");
  const reply = JSON.parse(ws.sent[ws.sent.length - 1]);
  assert.equal(reply.toolResponse.functionResponses[0].response.ok, false);
  assert.equal(reply.toolResponse.functionResponses[0].response.error, "agent_control_disabled");

  instance.disconnect();
});

test("AI turns cache their PCM for replay and respect the speaker gain", async () => {
  const harness = createGeminiLiveHarness();
  const { instance } = harness;
  const ws = await openLiveSession(harness);

  const pcm = Buffer.from(new Int16Array([800, -800, 1600, -1600]).buffer).toString("base64");

  await ws.onmessage({
    data: JSON.stringify({ serverContent: { outputTranscription: { text: "Xong rồi." } } }),
  });
  await ws.onmessage({
    data: JSON.stringify({
      serverContent: {
        modelTurn: { parts: [{ inlineData: { mimeType: "audio/pcm;rate=24000", data: pcm } }] },
      },
    }),
  });

  const pending = instance.transcript[instance.transcript.length - 1];
  assert.equal(pending.hasAudio, undefined, "audio is only attached once the turn closes");

  await ws.onmessage({ data: JSON.stringify({ serverContent: { turnComplete: true } }) });

  const row = instance.transcript[instance.transcript.length - 1];
  assert.equal(row.hasAudio, true, "finished turn exposes its replay audio");
  assert.equal(instance.hasReplayAudio(row.id), true);
  assert.equal(instance.replayMessage(row.id), true, "replay plays the cached PCM");
  assert.equal(instance.replayMessage("no-such-id"), false, "unknown ids report no audio");

  instance.setOutputVolume(0.5);
  assert.equal(instance.outputVolume, 0.5, "speaker gain is stored");
  instance.setOutputVolume(4);
  assert.equal(instance.outputVolume, 1, "speaker gain clamps to 1");
  instance.setOutputVolume(-2);
  assert.equal(instance.outputVolume, 0, "speaker gain clamps to 0");

  instance.clearTranscript();
  assert.equal(instance.hasReplayAudio(row.id), false, "clearing history drops the audio cache");

  instance.disconnect();
});

test("session telemetry tracks call start, tokens and expiry reconnects", async () => {
  const harness = createGeminiLiveHarness();
  const { instance } = harness;

  assert.equal(instance.callStartedAt, null, "no call timer before connecting");
  const ws = await openLiveSession(harness);
  assert.equal(typeof instance.callStartedAt, "number", "call timer starts on setupComplete");

  await ws.onmessage({ data: JSON.stringify({ usageMetadata: { totalTokenCount: 1234 } }) });
  assert.equal(instance.tokensUsed, 1234, "token usage is surfaced");

  await ws.onmessage({ data: JSON.stringify({ goAway: { timeLeft: "10s" } }) });
  assert.match(instance.notice, /kết nối lại/, "warns before the session expires");
  assert.equal(MockWebSocket.instances.length, 2, "reconnects automatically on goAway");

  instance.disconnect();
  assert.equal(instance.callStartedAt, null, "call timer resets on hangup");
  assert.equal(instance.tokensUsed, 0, "token counter resets on hangup");
});

test("switchVoice re-opens the session with the new persona and keeps the transcript", async () => {
  const harness = createGeminiLiveHarness();
  const { instance } = harness;
  const ws = await openLiveSession(harness);

  instance.sendTextMessage("Giữ lại tin nhắn này");
  assert.equal(instance.transcript.length, 1);

  await instance.switchVoice("Charon");

  assert.equal(MockWebSocket.instances.length, 2, "opened a second session for the new voice");
  const next = MockWebSocket.instances[1];
  next.onopen();
  assert.equal(
    JSON.parse(next.sent[0]).setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig
      .voiceName,
    "Charon",
    "new session requests the selected persona"
  );
  assert.equal(instance.activeVoice, "Charon");
  assert.equal(instance.transcript.length, 1, "transcript survives the persona swap");
  assert.equal(ws.readyState, MockWebSocket.CLOSED, "the previous socket is closed");

  instance.disconnect();
});

test("mixer tool helpers resolve apps and EQ bands the way users describe them", () => {
  const { context } = createGeminiLiveHarness();

  assert.equal(context.resolveEqBandIndex(2000), 6, "exact band frequency");
  assert.equal(context.resolveEqBandIndex(2500), 6, "2.5kHz snaps to the nearest band on a log scale");
  assert.equal(context.resolveEqBandIndex(5000), 7, "5kHz snaps to 4kHz");
  assert.equal(context.resolveEqBandIndex(2.5), 6, "a bare 2.5 is read as kHz");
  assert.equal(context.resolveEqBandIndex(0), 0, "index 0 stays the 32Hz band");
  assert.equal(context.resolveEqBandIndex("not a number"), null, "garbage is rejected");

  assert.equal(context.resolveAudioApp(MOCK_PROCESSES, "Spotify").bundle_id, "com.spotify.client");
  assert.equal(context.resolveAudioApp(MOCK_PROCESSES, "brave").bundle_id, "com.brave.browser");
  assert.equal(
    context.resolveAudioApp(MOCK_PROCESSES, "trình duyệt brave").bundle_id,
    "com.brave.browser",
    "Vietnamese alias resolves"
  );
  assert.equal(context.resolveAudioApp(MOCK_PROCESSES, "Zalo"), null, "unknown app resolves to null");
});

test("mixer tools refuse to act outside the desktop app", async () => {
  const { context } = createGeminiLiveHarness({ isTauri: false });
  const result = await context.runGeminiAudioTool("set_master_volume", { volume_percent: 30 });
  assert.equal(result.ok, false);
  assert.match(result.summary, /desktop/, "explains why it cannot act");
});

function lastSent(ws) {
  return JSON.parse(ws.sent[ws.sent.length - 1]);
}

test("mic and video uplinks use realtimeInput.audio/video, never the rejected mediaChunks", async () => {
  const harness = createGeminiLiveHarness();
  const { instance } = harness;
  const ws = await openLiveSession(harness);

  instance.scriptProcessor.onaudioprocess({
    inputBuffer: { getChannelData: () => new Float32Array(2048).fill(0.2) },
  });
  const audioMsg = lastSent(ws);
  assert.equal(audioMsg.realtimeInput.audio.mimeType, "audio/pcm;rate=16000");
  assert.ok(audioMsg.realtimeInput.audio.data.length > 0, "carries PCM payload");
  assert.equal(audioMsg.realtimeInput.mediaChunks, undefined, "no deprecated mediaChunks");

  await instance.enableVideo();
  // Khung hình đi chung socket với tiếng mic, nên nó nhường đường lúc người dùng đang nói.
  const sentWhileSpeaking = ws.sent.length;
  instance.captureAndSendVideoFrame();
  assert.equal(ws.sent.length, sentWhileSpeaking, "đang nói thì bỏ qua khung hình");
  instance.lastSpeechAt = 0;
  instance.captureAndSendVideoFrame();
  const videoMsg = lastSent(ws);
  assert.equal(videoMsg.realtimeInput.video.mimeType, "image/jpeg");
  assert.equal(videoMsg.realtimeInput.mediaChunks, undefined, "no deprecated mediaChunks");

  for (const raw of ws.sent) {
    assert.equal(raw.includes("mediaChunks"), false, "nothing on the wire uses mediaChunks");
  }

  instance.disconnect();
});

test("setup khai báo cửa sổ im lặng do người dùng chọn, và khung hình gửi ngay khi dứt câu", async () => {
  const harness = createGeminiLiveHarness();
  const { instance } = harness;
  instance.setReplyDelay(200);
  const ws = await openLiveSession(harness);

  const setup = JSON.parse(ws.sent[0]).setup;
  assert.equal(setup.realtimeInputConfig.automaticActivityDetection.silenceDurationMs, 200);
  assert.equal(
    setup.realtimeInputConfig.automaticActivityDetection.endOfSpeechSensitivity,
    "END_SENSITIVITY_HIGH"
  );

  await instance.enableVideo();
  // Nói, rồi im: lúc dứt câu là lúc Gemini cần khung hình mới nhất.
  instance.scriptProcessor.onaudioprocess({
    inputBuffer: { getChannelData: () => new Float32Array(2048).fill(0.2) },
  });
  instance.lastSpeechAt = Date.now() - 200;
  const before = ws.sent.length;
  instance.scriptProcessor.onaudioprocess({
    inputBuffer: { getChannelData: () => new Float32Array(2048).fill(0) },
  });
  assert.ok(ws.sent.length > before, "dứt câu phải đẩy một khung hình đi ngay");
  assert.ok(
    ws.sent.slice(before).some((raw) => raw.includes("image/jpeg")),
    "khung đó là JPEG màn hình/camera"
  );

  instance.disconnect();
});

test("native-audio thought parts never reach the transcript", async () => {
  const harness = createGeminiLiveHarness();
  const { instance } = harness;
  const ws = await openLiveSession(harness);

  await ws.onmessage({
    data: JSON.stringify({
      serverContent: {
        modelTurn: { parts: [{ text: "**Responding to greeting**\nI've processed...", thought: true }] },
      },
    }),
  });
  assert.equal(instance.transcript.length, 0, "reasoning is dropped");

  await ws.onmessage({
    data: JSON.stringify({ serverContent: { outputTranscription: { text: "Chào bạn!" } } }),
  });
  assert.equal(instance.transcript.length, 1);
  assert.equal(instance.transcript[0].text, "Chào bạn!", "only the spoken answer is shown");

  instance.disconnect();
});

test("close 1007 for an unknown setup field degrades instead of failing", async () => {
  const { instance } = createGeminiLiveHarness();
  await instance.connect({ apiKey: "AIzaTestKey-Close1007" });
  const first = MockWebSocket.instances[0];
  first.onopen();

  // Exact close reason the live service sends for an unsupported setup field.
  await first.onclose({
    code: 1007,
    reason: 'Invalid JSON payload received. Unknown name "inputAudioTranscription" at \'setup\': Cannot find field.',
    wasClean: true,
  });

  assert.equal(MockWebSocket.instances.length, 2, "re-opened after the rejection");
  const second = MockWebSocket.instances[1];
  second.onopen();
  const setup = JSON.parse(second.sent[0]).setup;
  assert.equal(setup.inputAudioTranscription, undefined, "transcription dropped");
  assert.ok(setup.tools, "tools kept");
  assert.equal(instance.status, "connecting");

  instance.disconnect();
});

test("an invalid key or a dead model fails with an actionable message and no retry", async () => {
  const { instance } = createGeminiLiveHarness();

  await instance.connect({ apiKey: "AIzaBAD" });
  const ws = MockWebSocket.instances[0];
  ws.onopen();
  await ws.onclose({ code: 1007, reason: "API key not valid. Please pass a valid API key.", wasClean: true });
  assert.equal(instance.status, "error");
  assert.match(instance.error, /API Key không hợp lệ/);
  assert.equal(MockWebSocket.instances.length, 1, "a bad key is not retried");

  await instance.connect({ apiKey: "AIzaOK", model: "models/gemini-2.0-flash-exp" });
  const ws2 = MockWebSocket.instances[1];
  ws2.onopen();
  await ws2.onclose({
    code: 1008,
    reason: "models/gemini-2.0-flash-exp is not found for API version v1alpha, or is not supported for bidiGenerateContent.",
    wasClean: true,
  });
  assert.equal(instance.status, "error");
  assert.match(instance.error, /gemini-2.0-flash-exp không hỗ trợ Live API/);
});

test("GoAway renewals continue indefinitely without releasing devices", async () => {
  const { instance, micTracks, screenTracks } = createGeminiLiveHarness();
  await instance.connect({ apiKey: "test-key" });
  await instance.startScreenShare();

  for (let i = 0; i < 4; i++) {
    const ws = MockWebSocket.instances.at(-1);
    ws.onopen();
    await ws.onmessage({ data: JSON.stringify({ setupComplete: {} }) });
    await ws.onmessage({
      data: JSON.stringify({ sessionResumptionUpdate: { resumable: true, newHandle: `handle-${i}` } }),
    });
    const startedAt = instance.callStartedAt;
    await ws.onmessage({ data: JSON.stringify({ goAway: { timeLeft: "60s" } }) });
    assert.equal(MockWebSocket.instances.length, i + 2, "every expiry opens a replacement");
    assert.equal(ws.closed.code, 1000, "old transport is closed before the deadline");
    const next = MockWebSocket.instances.at(-1);
    next.onopen();
    assert.deepEqual(JSON.parse(next.sent[0]).setup.sessionResumption, { handle: `handle-${i}` });
    assert.equal(instance.callStartedAt, startedAt);
    assert.equal(micTracks.length, 1);
    assert.equal(micTracks[0].stopped, false);
    assert.equal(screenTracks[0].stopped, false);
    assert.equal(instance.isScreenSharing, true);
  }

  instance.disconnect();
});

test("retries survive extended outages, keep context, and stop on hangup", async () => {
  const harness = createGeminiLiveHarness();
  const { instance, timers } = harness;
  const first = await openLiveSession(harness);
  await first.onmessage({ data: JSON.stringify({ sessionResumptionUpdate: { resumable: true, newHandle: "keep-me" } }) });
  await first.onclose({ code: 1000, reason: "", wasClean: true });
  for (let i = 0; i < 8; i++) {
    assert.equal(instance.status, "connecting");
    assert.equal(timers.size, 1);
    assert.equal([...timers.values()][0].ms, Math.min(30_000, 1000 * 2 ** i));
    await harness.retry();
    const ws = MockWebSocket.instances.at(-1);
    ws.onopen();
    assert.deepEqual(JSON.parse(ws.sent[0]).setup.sessionResumption, { handle: "keep-me" });
    await ws.onclose({ code: 1006, reason: "", wasClean: false });
  }
  await harness.retry();
  const recovered = MockWebSocket.instances.at(-1);
  recovered.onopen();
  await recovered.onmessage({ data: JSON.stringify({ setupComplete: {} }) });
  assert.equal(instance.status, "connected");
  await recovered.onclose({ code: 1011, reason: "Internal error", wasClean: true });
  assert.equal([...timers.values()][0].ms, 1000, "success resets backoff");
  const staleRetry = [...timers.values()][0].fn;
  const count = MockWebSocket.instances.length;
  instance.disconnect();
  await staleRetry();
  assert.equal(timers.size, 0);
  assert.equal(instance.status, "idle");
  assert.equal(MockWebSocket.instances.length, count, "late timer cannot resurrect a hung-up call");
});

test("a stalled setup retries and hangup cancels a pending setup", async () => {
  const harness = createGeminiLiveHarness();
  await harness.instance.connect({ apiKey: "test-key" });
  const first = MockWebSocket.instances[0];
  first.onopen();
  // Nén sớm hơn mặc định của Live API, nếu không phiên dài sẽ chậm dần theo context.
  assert.deepEqual(JSON.parse(first.sent[0]).setup.contextWindowCompression, {
    triggerTokens: 32_000,
    slidingWindow: { targetTokens: 12_000 },
  });
  assert.equal([...harness.timers.values()][0].ms, 20_000);
  await harness.retry(); // setup watchdog
  assert.equal(first.closed.code, 1000);
  await harness.retry(); // backoff
  assert.equal(MockWebSocket.instances.length, 2);
  harness.instance.disconnect();
  assert.equal(harness.timers.size, 0);
});

test("expired context replays only this call's transcript and never repeats it after resumption", async () => {
  const harness = createGeminiLiveHarness();
  const { instance } = harness;
  instance.transcript.push({ sender: "user", text: "previous call" });
  const ws = await openLiveSession(harness);
  instance.transcript.push({ sender: "user", text: "My name is An" }, { sender: "ai", text: "Hello An" });
  await ws.onmessage({ data: JSON.stringify({ sessionResumptionUpdate: { resumable: true, newHandle: "expired" } }) });
  await instance.reconnect();
  await MockWebSocket.instances.at(-1).onclose({ code: 1008, reason: "Session not found", wasClean: true });
  const fresh = MockWebSocket.instances.at(-1);
  fresh.onopen();
  await fresh.onmessage({ data: JSON.stringify({ setupComplete: {} }) });
  const history = JSON.parse(fresh.sent[1]).clientContent;
  assert.deepEqual(history, { turns: [
    { role: "user", parts: [{ text: "My name is An" }] },
    { role: "model", parts: [{ text: "Hello An" }] },
  ], turnComplete: false });
  assert.match(instance.notice, /audio\/video/);
  await fresh.onmessage({ data: JSON.stringify({ sessionResumptionUpdate: { resumable: true, newHandle: "new" } }) });
  await instance.reconnect();
  const resumed = MockWebSocket.instances.at(-1);
  resumed.onopen();
  await resumed.onmessage({ data: JSON.stringify({ setupComplete: {} }) });
  assert.equal(resumed.sent.length, 1, "native resume does not duplicate history");
  instance.disconnect();
});

test("ngữ cảnh dài tự tóm gọn rồi mở lại phiên bằng bản tóm tắt", async () => {
  const harness = createGeminiLiveHarness();
  const { instance, context } = harness;
  let summaryCalls = 0;
  context.fetch = async () => {
    summaryCalls += 1;
    return {
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "- Người dùng tên An, đang sửa Spotify" }] } }],
      }),
    };
  };

  const ws = await openLiveSession(harness);
  for (let i = 0; i < 10; i += 1) {
    instance.transcript.push({ sender: "user", text: `câu hỏi ${i}` }, { sender: "ai", text: `trả lời ${i}` });
  }

  await ws.onmessage({ data: JSON.stringify({ usageMetadata: { totalTokenCount: 30_000 } }) });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(summaryCalls, 1, "tóm tắt đúng một lần");
  assert.equal(instance.tokensUsed, 0, "phiên mới bắt đầu lại từ 0 token");

  const fresh = MockWebSocket.instances.at(-1);
  fresh.onopen();
  await fresh.onmessage({ data: JSON.stringify({ setupComplete: {} }) });
  const history = JSON.parse(fresh.sent[1]).clientContent;
  assert.match(history.turns[0].parts[0].text, /Tóm tắt phần trước/);
  assert.match(history.turns[0].parts[0].text, /tên An/);
  assert.equal(history.turns.length, 1 + 6, "tóm tắt cộng 6 lượt gần nhất giữ nguyên văn");
  assert.equal(instance.transcript.length, 20, "transcript trên màn hình không bị cắt");

  instance.disconnect();
});

test("session resumption keeps Gemini's context across reconnects but not across new calls", async () => {
  const harness = createGeminiLiveHarness();
  const { instance } = harness;
  const ws = await openLiveSession(harness);

  assert.deepEqual(JSON.parse(ws.sent[0]).setup.sessionResumption, {}, "first call asks for resumable handles");

  await ws.onmessage({
    data: JSON.stringify({ sessionResumptionUpdate: { newHandle: "handle-1", resumable: true } }),
  });
  await ws.onmessage({
    data: JSON.stringify({ sessionResumptionUpdate: { newHandle: "handle-ignored", resumable: false } }),
  });

  await instance.switchVoice("Charon");
  const resumed = MockWebSocket.instances[1];
  resumed.onopen();
  assert.deepEqual(
    JSON.parse(resumed.sent[0]).setup.sessionResumption,
    { handle: "handle-1" },
    "persona switch resumes the same conversation"
  );

  // An expired handle falls back to a fresh conversation instead of stranding the call.
  await resumed.onclose({ code: 1008, reason: "Session not found", wasClean: true });
  assert.equal(MockWebSocket.instances.length, 3, "retried without the handle");
  const fresh = MockWebSocket.instances[2];
  fresh.onopen();
  assert.deepEqual(JSON.parse(fresh.sent[0]).setup.sessionResumption, {}, "fresh context after expiry");
  assert.match(instance.notice, /hết hạn/);

  instance.disconnect();
  await instance.connect({ apiKey: "AIzaNewCall" });
  const next = MockWebSocket.instances[MockWebSocket.instances.length - 1];
  next.onopen();
  assert.deepEqual(JSON.parse(next.sent[0]).setup.sessionResumption, {}, "a new call never resumes the old one");
  instance.disconnect();
});

test("screen share replaces the camera in the uplink and survives a persona switch", async () => {
  const harness = createGeminiLiveHarness();
  const { instance, screenTracks, camTracks, drawnSources } = harness;
  const ws = await openLiveSession(harness);

  await instance.enableVideo();
  await instance.startScreenShare();
  assert.equal(instance.isScreenSharing, true);
  assert.equal(screenTracks.length, 1);
  assert.equal(instance.isVideoEnabled, true, "camera stays on for the PiP");

  drawnSources.length = 0;
  const framesBefore = uplinkedFrames(ws);
  instance.captureAndSendVideoFrame();
  assert.ok(drawnSources.length >= 1, "the tick drew a frame");
  assert.ok(
    // Canvas tự vẽ lại chính nó để lấy chữ ký so khung; chỉ xét nguồn video thật.
    drawnSources
      .filter((src) => "srcObject" in src)
      .every((src) => src.srcObject === instance.screenStream),
    "every sampled/uplinked frame is the screen, never the camera"
  );
  assert.equal(uplinkedFrames(ws) - framesBefore, 1, "exactly one frame uplinked per tick");
  assert.ok(lastSent(ws).realtimeInput.video, "frame sent as realtimeInput.video");

  await instance.switchVoice("Kore");
  assert.equal(screenTracks[0].stopped, false, "re-opening the session does not kill the share");
  assert.equal(instance.isScreenSharing, true);
  const next = MockWebSocket.instances[1];
  next.onopen();
  await next.onmessage({ data: JSON.stringify({ setupComplete: true }) });
  drawnSources.length = 0;
  instance.captureAndSendVideoFrame();
  assert.equal(drawnSources[0]?.srcObject, instance.screenStream, "new session still receives the screen");

  // User clicks "Stop sharing" in the OS indicator.
  screenTracks[0].fire("ended");
  assert.equal(instance.isScreenSharing, false, "OS-level stop is reflected");
  assert.equal(instance.screenStream, null);

  instance.disconnect();
  assert.equal(camTracks.every((t) => t.stopped), true, "hangup stops the camera");
});

test("hangup stops an active screen share; dismissing the picker is not an error", async () => {
  const harness = createGeminiLiveHarness();
  const { instance, screenTracks } = harness;
  await openLiveSession(harness);
  await instance.startScreenShare();
  instance.disconnect();
  assert.equal(screenTracks[0].stopped, true, "screen capture released on hangup");
  assert.equal(instance.isScreenSharing, false);

  const denied = createGeminiLiveHarness({ denyScreen: true });
  await denied.instance.startScreenShare();
  assert.equal(denied.instance.isScreenSharing, false);
  assert.equal(denied.instance.error, null, "cancelling the picker shows no error");
});

test("muting mid-call flushes the server VAD with audioStreamEnd once", async () => {
  const harness = createGeminiLiveHarness();
  const { instance } = harness;
  const ws = await openLiveSession(harness);
  const before = ws.sent.length;

  instance.setMuted(true);
  instance.setMuted(true);
  const ends = ws.sent.slice(before).filter((raw) => JSON.parse(raw).realtimeInput?.audioStreamEnd);
  assert.equal(ends.length, 1, "exactly one audioStreamEnd per mute");

  instance.disconnect();
});

test("a persona switch is one continuous call: timer kept, transient notice cleared", async () => {
  const harness = createGeminiLiveHarness();
  const { instance } = harness;
  await openLiveSession(harness);
  const startedAt = instance.callStartedAt;
  assert.equal(typeof startedAt, "number");

  await instance.switchVoice("Puck");
  assert.match(instance.notice, /Puck/, "announces the switch while it is in flight");
  assert.equal(instance.callStartedAt, startedAt, "timer survives the re-open");

  const next = MockWebSocket.instances[1];
  next.onopen();
  await next.onmessage({ data: JSON.stringify({ setupComplete: true }) });
  assert.match(instance.notice, /Không có lịch sử chữ/, "missing context is disclosed when no handle was received");
  assert.equal(instance.callStartedAt, startedAt, "still the same call");

  instance.disconnect();
  assert.equal(instance.callStartedAt, null, "hangup ends the timer");
});

test("a downgrade notice stays visible after the degraded session connects", async () => {
  const { instance } = createGeminiLiveHarness();
  await instance.connect({ apiKey: "AIzaPersistNotice" });
  const first = MockWebSocket.instances[0];
  first.onopen();
  await first.onclose({ code: 1007, reason: 'Unknown name "inputAudioTranscription": Cannot find field.', wasClean: true });
  const second = MockWebSocket.instances[1];
  second.onopen();
  await second.onmessage({ data: JSON.stringify({ setupComplete: true }) });
  assert.equal(instance.status, "connected");
  assert.match(instance.notice, /phụ đề/, "the user still learns captions were turned off");
  instance.disconnect();
});

test("màn hình đứng yên không gửi lại khung; đổi nội dung là gửi ngay", async () => {
  const harness = createGeminiLiveHarness();
  const { instance, setFrameLuma } = harness;
  const ws = await openLiveSession(harness);
  await instance.enableVideo();
  instance.lastSpeechAt = 0;

  setFrameLuma(120);
  instance.captureAndSendVideoFrame();
  const afterFirst = uplinkedFrames(ws);
  assert.ok(afterFirst >= 1, "khung đầu luôn được gửi");

  instance.captureAndSendVideoFrame();
  assert.equal(uplinkedFrames(ws), afterFirst, "màn hình y nguyên thì không tốn thêm token");

  setFrameLuma(40);
  instance.captureAndSendVideoFrame();
  assert.equal(uplinkedFrames(ws), afterFirst + 1, "màn hình đổi thì gửi ngay");

  instance.disconnect();
});

function uplinkedFrames(ws) {
  return ws.sent.filter((raw) => JSON.parse(raw).realtimeInput?.video).length;
}

test("the assistant is general-purpose, not limited to the mixer", async () => {
  const { instance } = createGeminiLiveHarness();
  await instance.connect({ apiKey: "AIzaGeneral" });
  const ws = MockWebSocket.instances[0];
  ws.onopen();
  const prompt = JSON.parse(ws.sent[0]).setup.systemInstruction.parts[0].text;
  assert.match(prompt, /mọi chủ đề/, "explicitly answers any topic");
  assert.match(prompt, /Không tự giới hạn/, "tells the model not to restrict itself");
  assert.match(prompt, /không đoán hay bịa/, "forbids inventing what a frame shows");
  assert.match(prompt, /Chỉ gọi các hàm này khi người dùng yêu cầu/, "mixer tools only on request");
  instance.disconnect();
});

test("Google Search grounding is declared alongside the mixer tools", async () => {
  const { instance } = createGeminiLiveHarness();
  await instance.connect({ apiKey: "AIzaSearch" });
  const ws = MockWebSocket.instances[0];
  ws.onopen();
  const tools = JSON.parse(ws.sent[0]).setup.tools;
  assert.ok(tools.some((t) => t.googleSearch), "googleSearch tool present");
  const instruction = JSON.parse(ws.sent[0]).setup.systemInstruction.parts[0].text;
  assert.match(instruction, /tìm tài liệu.*search gg.*tra Google/);
  assert.match(instruction, /dùng công cụ Google Search trước khi trả lời/);
  assert.match(instruction, /Không bịa đường dẫn/);
  assert.ok(tools.some((t) => t.functionDeclarations), "mixer functions still present");
  instance.disconnect();

  instance.setWebSearchEnabled(false);
  await instance.connect({ apiKey: "AIzaSearch" });
  const off = MockWebSocket.instances[1];
  off.onopen();
  assert.equal(
    JSON.parse(off.sent[0]).setup.tools.some((t) => t.googleSearch),
    false,
    "the toggle removes search"
  );
  assert.match(JSON.parse(off.sent[0]).setup.systemInstruction.parts[0].text,
    /Google Search hiện không khả dụng/);
  instance.disconnect();
});

test("a key without Search quota keeps the call and drops search for that model only", async () => {
  const { instance } = createGeminiLiveHarness();
  await instance.connect({ apiKey: "AIzaNoSearchQuota" });
  const first = MockWebSocket.instances[0];
  first.onopen();

  // Exact close the live service sends for gemini-3.1-flash-live + googleSearch on a free key.
  await first.onclose({
    code: 1011,
    reason: "You exceeded your current quota, please check your plan and billing details.",
    wasClean: true,
  });

  assert.equal(MockWebSocket.instances.length, 2, "re-opened instead of failing");
  const retry = MockWebSocket.instances[1];
  retry.onopen();
  const retryTools = JSON.parse(retry.sent[0]).setup.tools;
  assert.equal(retryTools.some((t) => t.googleSearch), false, "search dropped");
  assert.ok(retryTools.some((t) => t.functionDeclarations), "mixer tools kept");
  assert.match(instance.notice, /quota Google Search/, "user learns why search is off");
  assert.equal(instance.status, "connecting");

  // General quota exhaustion backs off rather than hammering the server.
  await retry.onclose({ code: 1011, reason: "You exceeded your current quota", wasClean: true });
  assert.equal(instance.status, "connecting");
  assert.equal(MockWebSocket.instances.length, 2);

  // Later calls on that model skip search; another model still gets it.
  await instance.connect({ apiKey: "AIzaNoSearchQuota" });
  const again = MockWebSocket.instances[2];
  again.onopen();
  assert.equal(JSON.parse(again.sent[0]).setup.tools.some((t) => t.googleSearch), false);
  instance.disconnect();

  await instance.connect({ apiKey: "AIzaNoSearchQuota", model: "models/gemini-2.5-flash-native-audio-latest" });
  const other = MockWebSocket.instances[3];
  other.onopen();
  assert.ok(JSON.parse(other.sent[0]).setup.tools.some((t) => t.googleSearch), "other model keeps search");
  instance.disconnect();
});

test("an all-black screen share is never uplinked and is reported after 3 seconds", async () => {
  const harness = createGeminiLiveHarness();
  const { instance } = harness;
  const ws = await openLiveSession(harness);
  await instance.startScreenShare();

  harness.setFrameLuma(0);
  instance.captureAndSendVideoFrame();
  instance.captureAndSendVideoFrame();
  assert.equal(instance.screenShareIssue, null, "a couple of dark frames are tolerated");
  instance.captureAndSendVideoFrame();
  assert.equal(instance.screenShareIssue, "black", "persistent black capture is flagged");
  assert.equal(uplinkedFrames(ws), 0, "black frames never reach Gemini");

  harness.setFrameLuma(180);
  instance.captureAndSendVideoFrame();
  assert.equal(instance.screenShareIssue, null, "real content clears the warning");
  assert.equal(uplinkedFrames(ws), 1, "real content is uplinked");

  instance.disconnect();
});

test("a black capture is diagnosed before the call even starts", async () => {
  const harness = createGeminiLiveHarness();
  const { instance } = harness;
  harness.setFrameLuma(0);
  await instance.startScreenShare();
  for (let i = 0; i < 3; i++) instance.captureAndSendVideoFrame();
  assert.equal(instance.screenShareIssue, "black", "user is warned while still in standby");
  instance.stopScreenShare();
  assert.equal(instance.screenShareIssue, null, "stopping the share clears the warning");
});

test("a share that never decodes a frame is reported as no-frames", async () => {
  const harness = createGeminiLiveHarness();
  const { instance } = harness;
  await openLiveSession(harness);
  await instance.startScreenShare();
  instance.screenVideoElement.videoWidth = 0;
  for (let i = 0; i < 4; i++) instance.captureAndSendVideoFrame();
  assert.equal(instance.screenShareIssue, null, "startup latency is tolerated");
  instance.captureAndSendVideoFrame();
  assert.equal(instance.screenShareIssue, "no-frames");
  instance.disconnect();
});

test("re-opening a session keeps the same mic, camera and screen (no device re-acquisition)", async () => {
  const harness = createGeminiLiveHarness();
  const { instance, micTracks, camTracks, screenTracks } = harness;
  await openLiveSession(harness);
  await instance.enableVideo();
  await instance.startScreenShare();
  const ctxBefore = instance.inputAudioContext;

  await instance.switchVoice("Fenrir");
  await instance.reconnect();

  assert.equal(micTracks.length, 1, "mic acquired exactly once across re-opens");
  assert.equal(micTracks[0].stopped, false, "mic track still live");
  assert.equal(instance.inputAudioContext, ctxBefore, "input AudioContext reused");
  assert.equal(camTracks.length, 1, "camera not re-acquired");
  assert.equal(camTracks[0].stopped, false);
  assert.equal(screenTracks[0].stopped, false, "screen share untouched");
  assert.equal(MockWebSocket.instances.length, 3, "only the socket was replaced");
  assert.equal(MockWebSocket.instances[0].readyState, MockWebSocket.CLOSED);

  instance.disconnect();
  assert.equal(micTracks[0].stopped, true, "hangup still releases the mic");
});

test("WebKit order (error event, then close 1011) still falls back and keeps the share", async () => {
  const harness = createGeminiLiveHarness();
  const { instance, micTracks, screenTracks } = harness;
  await instance.startScreenShare();
  await instance.connect({ apiKey: "AIzaWebKitOrder" });
  const first = MockWebSocket.instances[0];
  first.onopen();

  // WebKit may fire `error` before the server's close frame is delivered.
  first.onerror(new Event("error"));
  assert.equal(instance.status, "connecting", "an error event alone decides nothing");
  await first.onclose({ code: 1011, reason: "You exceeded your current quota", wasClean: true });

  assert.equal(MockWebSocket.instances.length, 2, "search fallback still ran");
  assert.equal(screenTracks[0].stopped, false, "screen share survived");
  assert.equal(instance.isScreenSharing, true);
  assert.equal(micTracks.length, 1, "mic was not re-acquired");
  const second = MockWebSocket.instances[1];
  second.onopen();
  await second.onmessage({ data: JSON.stringify({ setupComplete: true }) });
  assert.equal(instance.status, "connected", "call comes up");
  instance.disconnect();
});

test("a dropped network (error then 1006) is reported as a connection loss", async () => {
  const harness = createGeminiLiveHarness();
  const { instance } = harness;
  const ws = await openLiveSession(harness);
  ws.onerror(new Event("error"));
  await ws.onclose({ code: 1006, reason: "", wasClean: false });
  assert.equal(instance.status, "connecting");
  assert.match(instance.notice, /Mất kết nối/);
  assert.deepEqual({ ...instance.lastClose }, { code: 1006, reason: "" }, "close is kept for the UI");
  instance.disconnect();
  assert.equal(harness.timers.size, 0, "hangup cancels pending retries");
});

test("search quota blocks are remembered across app launches", async () => {
  const harness = createGeminiLiveHarness();
  const { instance, context, localStorageData } = harness;
  await instance.connect({ apiKey: "AIzaPersist" });
  const first = MockWebSocket.instances[0];
  first.onopen();
  await first.onclose({ code: 1011, reason: "You exceeded your current quota", wasClean: true });
  instance.disconnect();
  assert.ok(localStorageData.get("gemini_live_search_blocked"), "block persisted");

  // A fresh service (next launch) skips search on that model without a failed setup.
  const relaunched = new context.GeminiLiveService();
  await relaunched.connect({ apiKey: "AIzaPersist" });
  const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
  ws.onopen();
  assert.equal(JSON.parse(ws.sent[0]).setup.tools.some((t) => t.googleSearch), false);
  relaunched.disconnect();

  // Entries older than a day are dropped so a plan upgrade is picked up.
  localStorageData.set(
    "gemini_live_search_blocked",
    JSON.stringify({ "models/gemini-3.1-flash-live-preview": Date.now() - 25 * 3600 * 1000 })
  );
  const later = new context.GeminiLiveService();
  assert.deepEqual([...later.searchBlockedModels], [], "stale block expired");
});

test("diagnostics count the wire and explain what happened", async () => {
  const harness = createGeminiLiveHarness();
  const { instance } = harness;
  const ws = await openLiveSession(harness);

  instance.scriptProcessor.onaudioprocess({
    inputBuffer: { getChannelData: () => new Float32Array(2048).fill(0.2) },
  });
  const pcm = Buffer.from(new Int16Array([100, -100]).buffer).toString("base64");
  await ws.onmessage({
    data: JSON.stringify({ serverContent: { modelTurn: { parts: [{ inlineData: { data: pcm } }] } } }),
  });

  assert.equal(instance.stats.audioSent, 1);
  assert.equal(instance.stats.audioReceived, 1);
  const report = instance.diagnosticsReport();
  assert.match(report, /audio sent=1 received=1/);
  assert.match(report, /setupComplete/);
  assert.match(report, /mic ok/);
  assert.match(report, /open session model=gemini-3.1-flash-live-preview/);
  instance.disconnect();
});

test("resumeAudio wakes suspended audio contexts", async () => {
  const harness = createGeminiLiveHarness();
  const { instance } = harness;
  await openLiveSession(harness);
  instance.inputAudioContext.state = "suspended";
  await instance.resumeAudio();
  assert.equal(instance.inputAudioContext.state, "running");
  instance.disconnect();
});

test("WKWebView-style opaque setup closes still bring the call up", async () => {
  // What "connect, then immediately off" looks like when the engine does not pass
  // the server's 1011 + reason through: an abnormal close with no reason at all.
  const harness = createGeminiLiveHarness();
  const { instance, micTracks, localStorageData } = harness;
  await instance.connect({ apiKey: "AIzaOpaque" });

  const first = MockWebSocket.instances[0];
  first.onopen();
  assert.ok(JSON.parse(first.sent[0]).setup.tools.some((t) => t.googleSearch));
  first.onerror(new Event("error"));
  await first.onclose({ code: 1006, reason: "", wasClean: false });

  assert.equal(MockWebSocket.instances.length, 2, "retried instead of hanging up");
  const second = MockWebSocket.instances[1];
  second.onopen();
  assert.equal(JSON.parse(second.sent[0]).setup.tools.some((t) => t.googleSearch), false, "search shed first");
  assert.match(instance.notice, /mã 1006/);
  assert.equal(localStorageData.get("gemini_live_search_blocked"), undefined, "a blip is not remembered for a day");

  await second.onmessage({ data: JSON.stringify({ setupComplete: true }) });
  assert.equal(instance.status, "connected", "the call is up");
  assert.equal(micTracks.length, 1, "same mic throughout");
  instance.disconnect();
});

test("opaque initial closes shed captions then tools, then wait for network recovery", async () => {
  const harness = createGeminiLiveHarness();
  const { instance } = harness;
  instance.setWebSearchEnabled(false);
  await instance.connect({ apiKey: "AIzaOpaque2" });

  for (let i = 0; i < 2; i++) {
    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    ws.onopen();
    await ws.onclose({ code: 1006, reason: "", wasClean: false });
  }
  const third = MockWebSocket.instances[2];
  third.onopen();
  const setup = JSON.parse(third.sent[0]).setup;
  assert.equal(setup.inputAudioTranscription, undefined, "captions shed");
  assert.equal(setup.tools, undefined, "tools shed");

  await third.onclose({ code: 1006, reason: "", wasClean: false });
  assert.equal(MockWebSocket.instances.length, 3, "waits rather than spinning");
  assert.equal(instance.status, "connecting");
  assert.equal(instance.lastClose.code, 1006);
  await harness.retry();
  assert.equal(MockWebSocket.instances.length, 4);
  instance.disconnect();
});

test("a bad key during setup is never retried, even with search declared", async () => {
  const harness = createGeminiLiveHarness();
  const { instance } = harness;
  await instance.connect({ apiKey: "AIzaBadKey" });
  const ws = MockWebSocket.instances[0];
  ws.onopen();
  await ws.onclose({ code: 1007, reason: "API key not valid. Please pass a valid API key.", wasClean: true });
  assert.equal(MockWebSocket.instances.length, 1);
  assert.equal(instance.status, "error");
  assert.match(instance.error, /API Key không hợp lệ/);
  assert.equal(instance.lastClose.reason, "API key not valid. Please pass a valid API key.");
});
