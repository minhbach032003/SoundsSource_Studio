<script lang="ts">
  import { toastState } from "@/lib/toast.svelte";
  import { getSigningIdentity, rebuildPermissionHint, type SigningIdentity } from "@/lib/appIdentity";
  import { googleAuthState } from "@/lib/googleAuth.svelte";
  import GoogleIcon from "@/components/icons/GoogleIcon.svelte";
  import Modal from "@/components/ui/Modal.svelte";
  import type { GoogleUser } from "@/components/navigation/SideNavbar.svelte";
  import {
    geminiLiveState,
    GEMINI_VIDEO_UPLINK_FPS,
    GEMINI_INPUT_SAMPLE_RATE,
    GEMINI_OUTPUT_SAMPLE_RATE,
    GEMINI_LIVE_MODELS,
    DEFAULT_GEMINI_LIVE_MODEL,
    type GeminiLiveMessage,
  } from "@/lib/geminiLive.svelte";
  import {
    Mic,
    MicOff,
    Video,
    VideoOff,
    PhoneCall,
    PhoneOff,
    SwitchCamera,
    Maximize2,
    Minimize2,
    Volume1,
    CameraOff,
    Bot,
    User,
    Sparkles,
    Trash2,
    Copy,
    Check,
    Loader2,
    Send,
    Sliders,
    AlertTriangle,
    KeyRound,
    Eye,
    EyeOff,
    Wrench,
    Volume2,
    VolumeX,
    Timer,
    RefreshCw,
    Captions,
    Zap,
    ScreenShare,
    ScreenShareOff,
    Cpu,
    Globe,
    RotateCcw,
    Activity,
    Settings2,
    ShieldAlert,
    Gauge,
  } from "@lucide/svelte";
  import {
    checkScreenCapturePermission,
    requestScreenCapturePermission,
    openScreenCaptureSettings,
  } from "@/audio";

  interface Props {
    user?: GoogleUser | null;
    onSignInGoogle?: () => void;
  }

  let {
    user = googleAuthState.user,
    onSignInGoogle = () => {
      googleAuthState.isLoginModalOpen = true;
    },
  }: Props = $props();

  /// An ad-hoc build is identified by its exact binary, so a rebuild loses every
  /// permission the user granted. Read it once so the help panel can say so.
  let signingIdentity = $state<SigningIdentity | null>(null);
  $effect(() => {
    getSigningIdentity().then((identity) => {
      signingIdentity = identity;
    });
  });

  const GEMINI_PERSONAS = [
    { label: "Aoede (Tự nhiên, trong trẻo)", value: "Aoede" },
    { label: "Puck (Sôi nổi, nhiệt tình)", value: "Puck" },
    { label: "Charon (Trầm ấm, điềm tĩnh)", value: "Charon" },
    { label: "Kore (Ấm áp, studio)", value: "Kore" },
    { label: "Fenrir (Rõ ràng, uy lực)", value: "Fenrir" },
  ];

  const QUICK_ACTIONS: { label: string; prompt: string; kind?: "general" | "mixer" }[] = [
    {
      label: "Giải thích màn hình",
      prompt: "Hãy xem màn hình tôi đang chia sẻ và giải thích ngắn gọn nội dung chính.",
      kind: "general",
    },
    {
      label: "Tin nổi bật hôm nay",
      prompt: "Tóm tắt 3 tin tức nổi bật nhất hôm nay ở Việt Nam và thế giới.",
      kind: "general",
    },
    {
      label: "Cân bằng Spotify & Trình duyệt",
      prompt: "Cân bằng âm lượng giữa Spotify và Brave Browser để ưu tiên giọng nói trong cuộc họp.",
    },
    {
      label: "Duck 50% nhạc nền",
      prompt: "Tự động giảm 50% tất cả nhạc nền của các ứng dụng khi có người nói.",
    },
    {
      label: "Tối ưu giọng nói",
      prompt: "Tăng cường dải tần vocal clarity ở 2.5kHz và 5kHz cho âm thanh micro.",
    },
    {
      label: "Tắt tiếng ứng dụng nền",
      prompt: "Tắt toàn bộ âm thanh nền từ ứng dụng khác, chỉ giữ lại cuộc gọi thoại.",
    },
  ];

  const MODEL_STORAGE_KEY = "gemini_live_model";

  function loadStoredModel(): string {
    try {
      const stored = localStorage.getItem(MODEL_STORAGE_KEY);
      if (stored && GEMINI_LIVE_MODELS.some((m) => m.value === stored)) return stored;
    } catch {}
    return DEFAULT_GEMINI_LIVE_MODEL;
  }

  let selectedPersona = $state("Aoede");
  /** macOS reported no Screen Recording grant; sharing would only produce black frames. */
  let screenPermissionMissing = $state(false);
  let isDiagnosticsOpen = $state(false);
  let selectedModel = $state(loadStoredModel());
  let inputText = $state("");
  let isClearModalOpen = $state(false);
  let isApiKeyModalOpen = $state(false);
  let apiKeyInput = $state("");
  let showKey = $state(false);
  let hasApiKey = $state(false);
  let copiedId = $state<string | null>(null);

  // PiP Controls
  let isCameraFlipped = $state(true);
  let isPipExpanded = $state(false);

  let pipVideoElement = $state<HTMLVideoElement | null>(null);
  let screenVideoElement = $state<HTMLVideoElement | null>(null);
  let messagesEndRef = $state<HTMLDivElement | null>(null);
  let messagesContainer = $state<HTMLDivElement | null>(null);

  // Derived state from geminiLiveState
  const callStatus = $derived(geminiLiveState.status);
  const userVolPct = $derived(Math.min(100, Math.round(geminiLiveState.userVolume * 100)));
  const aiVolPct = $derived(Math.min(100, Math.round(geminiLiveState.aiVolume * 100)));
  const isAiSpeaking = $derived(aiVolPct > 3);
  const isUserSpeaking = $derived(userVolPct > 3 && !geminiLiveState.isMuted);
  const outputVolPct = $derived(Math.round(geminiLiveState.outputVolume * 100));
  const searchBlocked = $derived(geminiLiveState.searchBlockedModels.includes(selectedModel));
  const uplinkLabel = $derived(`640x480 - ${GEMINI_VIDEO_UPLINK_FPS} fps uplink`);
  const pcmLabel = $derived(
    `Mic ${GEMINI_INPUT_SAMPLE_RATE / 1000} kHz - Out ${GEMINI_OUTPUT_SAMPLE_RATE / 1000} kHz PCM`
  );

  // Live call duration, ticked only while a session is actually open.
  let nowTick = $state(Date.now());
  $effect(() => {
    if (callStatus !== "connected" || geminiLiveState.callStartedAt === null) return;
    nowTick = Date.now();
    const id = setInterval(() => {
      nowTick = Date.now();
    }, 1000);
    return () => clearInterval(id);
  });
  const callDuration = $derived.by(() => {
    const started = geminiLiveState.callStartedAt;
    if (started === null) return "00:00";
    const total = Math.max(0, Math.floor((nowTick - started) / 1000));
    const minutes = String(Math.floor(total / 60)).padStart(2, "0");
    const seconds = String(total % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
  });

  // Check stored API key on mount
  $effect(() => {
    void (async () => {
      const key = await geminiLiveState.getApiKey();
      if (key && key.trim()) {
        hasApiKey = true;
        apiKeyInput = key.trim();
      } else {
        hasApiKey = false;
      }
    })();
  });

  // Bind video stream to PiP element
  $effect(() => {
    const stream = geminiLiveState.cameraStream;
    const isVideo = geminiLiveState.isVideoEnabled;
    if (pipVideoElement) {
      if (isVideo && stream) {
        if (pipVideoElement.srcObject !== stream) {
          pipVideoElement.srcObject = stream;
          pipVideoElement.play().catch(() => {});
        }
      } else {
        pipVideoElement.srcObject = null;
      }
    }
  });

  // Bind the shared screen to the stage preview
  $effect(() => {
    const stream = geminiLiveState.screenStream;
    if (!screenVideoElement) return;
    if (geminiLiveState.isScreenSharing && stream) {
      if (screenVideoElement.srcObject !== stream) {
        screenVideoElement.srcObject = stream;
        screenVideoElement.play().catch(() => {});
      }
    } else {
      screenVideoElement.srcObject = null;
    }
  });

  // Auto scroll transcript to bottom
  $effect(() => {
    if (geminiLiveState.transcript.length) {
      if (messagesEndRef) {
        messagesEndRef.scrollIntoView({ behavior: "smooth" });
      } else if (messagesContainer) {
        messagesContainer.scrollTo({
          top: messagesContainer.scrollHeight,
          behavior: "smooth",
        });
      }
    }
  });

  // Any click or key during a call is a user gesture: use it to un-suspend audio
  // contexts the webview may have created suspended from a socket callback.
  $effect(() => {
    if (typeof window === "undefined" || callStatus === "idle") return;
    const resume = () => void geminiLiveState.resumeAudio();
    window.addEventListener("pointerdown", resume, true);
    window.addEventListener("keydown", resume, true);
    return () => {
      window.removeEventListener("pointerdown", resume, true);
      window.removeEventListener("keydown", resume, true);
    };
  });

  // Spacebar Push-to-Talk listener during active calls
  $effect(() => {
    if (typeof window === "undefined") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        const activeTag = document.activeElement?.tagName.toLowerCase();
        if (activeTag === "input" || activeTag === "textarea" || activeTag === "select") {
          return;
        }
        if (callStatus === "connected" && geminiLiveState.isMuted) {
          e.preventDefault();
          geminiLiveState.setMuted(false);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        const activeTag = document.activeElement?.tagName.toLowerCase();
        if (activeTag === "input" || activeTag === "textarea" || activeTag === "select") {
          return;
        }
        if (callStatus === "connected" && !geminiLiveState.isMuted) {
          e.preventDefault();
          geminiLiveState.setMuted(true);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  });

  async function handleStartCall() {
    const existingKey = await geminiLiveState.getApiKey();
    if (!existingKey || !existingKey.trim()) {
      isApiKeyModalOpen = true;
      toastState.info("Vui lòng cấu hình Gemini API Key để bắt đầu cuộc gọi.");
      return;
    }

    try {
      toastState.info(`Đang kết nối Gemini Live với persona ${selectedPersona}...`);
      await geminiLiveState.connect({
        voiceName: selectedPersona,
        model: selectedModel,
        apiKey: existingKey.trim(),
        enableVideo: geminiLiveState.isVideoEnabled,
      });
      toastState.success("Đã kết nối Gemini Live Video 1-on-1!");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toastState.error(`Lỗi kết nối: ${msg}`);
    }
  }

  function handleEndCall() {
    geminiLiveState.disconnect();
    toastState.info("Đã kết thúc cuộc gọi Gemini Live.");
  }

  function toggleMic() {
    geminiLiveState.toggleMute();
    if (geminiLiveState.isMuted) {
      toastState.info("Micro đã tắt tiếng (Muted)");
    } else {
      toastState.success("Micro đã kích hoạt");
    }
  }

  async function toggleCamera() {
    if (geminiLiveState.isVideoEnabled) {
      geminiLiveState.disableVideo();
      toastState.info("Đã tắt camera");
    } else {
      await geminiLiveState.enableVideo();
      if (geminiLiveState.isVideoEnabled) {
        toastState.success("Đã bật camera");
      } else if (geminiLiveState.error) {
        toastState.error(geminiLiveState.error);
      }
    }
  }

  async function toggleScreenShare() {
    if (geminiLiveState.isScreenSharing) {
      geminiLiveState.stopScreenShare();
      toastState.info("Đã dừng chia sẻ màn hình");
      return;
    }

    // Ask macOS first: without the grant the webview still returns a stream, just black.
    const granted = await checkScreenCapturePermission();
    if (granted === false) {
      const afterPrompt = await requestScreenCapturePermission();
      if (afterPrompt !== true) {
        screenPermissionMissing = true;
        return;
      }
    }
    screenPermissionMissing = false;
    await startShareUnchecked();
  }

  /** Start the share without the TCC pre-check (also the "share anyway" escape hatch). */
  async function startShareUnchecked() {
    screenPermissionMissing = false;
    await geminiLiveState.startScreenShare();
    if (geminiLiveState.isScreenSharing) {
      toastState.success(
        callStatus === "connected"
          ? "Gemini đang xem màn hình bạn chia sẻ"
          : "Đã chọn màn hình, Gemini sẽ thấy khi cuộc gọi bắt đầu"
      );
    } else if (geminiLiveState.error) {
      toastState.error(geminiLiveState.error);
    }
  }

  async function handleOpenScreenSettings() {
    try {
      await openScreenCaptureSettings();
      toastState.info("Bật rust-sound trong Screen & System Audio Recording, rồi thoát hẳn app (Cmd+Q) và mở lại.");
    } catch (err) {
      toastState.error(err instanceof Error ? err.message : String(err));
    }
  }

  async function recheckScreenPermission() {
    const granted = await checkScreenCapturePermission();
    if (granted === false) {
      toastState.error("macOS vẫn chưa cấp quyền. Nếu vừa bật, hãy thoát hẳn app (Cmd+Q) rồi mở lại.");
      return;
    }
    await startShareUnchecked();
  }

  async function handleCopyDiagnostics() {
    try {
      await navigator.clipboard.writeText(geminiLiveState.diagnosticsReport());
      toastState.success("Đã sao chép log chẩn đoán");
    } catch {
      toastState.error("Không sao chép được, hãy bôi đen và copy thủ công");
    }
  }

  async function retryScreenShare() {
    geminiLiveState.stopScreenShare();
    await geminiLiveState.startScreenShare();
    if (geminiLiveState.error) {
      toastState.error(geminiLiveState.error);
    }
  }

  async function toggleWebSearch() {
    const next = !geminiLiveState.webSearchEnabled;
    geminiLiveState.setWebSearchEnabled(next);
    toastState.info(next ? "Đã bật Google Search cho câu hỏi thời sự" : "Đã tắt Google Search");
    // Tools are negotiated in the setup frame; the resumed session keeps the conversation.
    if (callStatus === "connected" || callStatus === "connecting") {
      await geminiLiveState.reconnect();
    }
  }

  function handleModelChange() {
    try {
      localStorage.setItem(MODEL_STORAGE_KEY, selectedModel);
    } catch {}
    const label = GEMINI_LIVE_MODELS.find((m) => m.value === selectedModel)?.label ?? selectedModel;
    toastState.success(`Model cho cuộc gọi tiếp theo: ${label}`);
  }

  function toggleCameraFlip() {
    isCameraFlipped = !isCameraFlipped;
    toastState.info(isCameraFlipped ? "Đã bật chế độ lật gương" : "Đã tắt chế độ lật gương");
  }

  async function handlePersonaChange() {
    const p = GEMINI_PERSONAS.find((item) => item.value === selectedPersona);
    const name = p?.label.split(" ")[0] || selectedPersona;

    // Gemini pins the voice for the lifetime of a session, so switching mid-call
    // re-opens the socket; the transcript survives the swap.
    if (callStatus === "connected" || callStatus === "connecting") {
      toastState.info(`Đang mở lại phiên với persona ${name}...`);
      try {
        await geminiLiveState.switchVoice(selectedPersona);
        toastState.success(`Đã áp dụng persona ${name}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toastState.error(`Không đổi được persona: ${msg}`);
      }
    } else {
      geminiLiveState.activeVoice = selectedPersona;
      toastState.success(`Đã chọn persona: ${name}`);
    }
  }

  async function handleReconnect() {
    toastState.info("Đang kết nối lại phiên Gemini Live...");
    try {
      await geminiLiveState.reconnect();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toastState.error(`Kết nối lại thất bại: ${msg}`);
    }
  }

  function handleOutputVolume(event: Event) {
    const value = Number((event.currentTarget as HTMLInputElement).value);
    geminiLiveState.setOutputVolume(Number.isFinite(value) ? value / 100 : 1);
  }

  function toggleAgentControl() {
    const next = !geminiLiveState.toolsEnabled;
    geminiLiveState.setToolsEnabled(next);
    if (next) {
      toastState.success("Agent Control: Gemini được phép điều khiển mixer");
    } else {
      toastState.info("Agent Control đã tắt, Gemini chỉ tư vấn chứ không chỉnh âm thanh");
    }
  }

  async function toggleCaptions() {
    const next = !geminiLiveState.captionsEnabled;
    geminiLiveState.setCaptionsEnabled(next);
    toastState.info(next ? "Đã bật phụ đề trực tiếp" : "Đã tắt phụ đề trực tiếp");
    // Transcription is negotiated in the setup frame, so an open session restarts.
    if (callStatus === "connected" || callStatus === "connecting") {
      await geminiLiveState.reconnect();
    }
  }

  async function handleSaveApiKey() {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) {
      toastState.error("API Key không được để trống.");
      return;
    }
    await geminiLiveState.setApiKey(trimmed);
    hasApiKey = true;
    isApiKeyModalOpen = false;
    toastState.success("Đã lưu Gemini API Key thành công.");

    if (callStatus === "idle" || callStatus === "error") {
      await handleStartCall();
    }
  }

  function handleConfirmClear() {
    geminiLiveState.clearTranscript();
    isClearModalOpen = false;
    toastState.info("Đã xóa lịch sử cuộc trò chuyện.");
  }

  function handleSendMessage(textToSend?: string) {
    const text = (textToSend || inputText).trim();
    if (!text) return;

    if (callStatus === "connected") {
      try {
        geminiLiveState.sendTextMessage(text);
        inputText = "";
        toastState.success("Đã gửi tin nhắn tới Gemini Live");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toastState.error(`Lỗi gửi: ${msg}`);
      }
    } else {
      // Connect and send or notify
      if (!hasApiKey) {
        isApiKeyModalOpen = true;
        toastState.info("Vui lòng nhập API Key để kết nối cuộc gọi.");
        return;
      }
      toastState.info("Đang bắt đầu cuộc gọi để gửi tin nhắn...");
      void handleStartCall().then(() => {
        setTimeout(() => {
          if (geminiLiveState.status === "connected") {
            geminiLiveState.sendTextMessage(text);
            inputText = "";
          }
        }, 1500);
      });
    }
  }

  function handleFormSubmit(e: SubmitEvent) {
    e.preventDefault();
    handleSendMessage();
  }

  async function handleCopyMessage(id: string, text: string) {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      }
      copiedId = id;
      toastState.success("Đã sao chép nội dung tin nhắn");
      setTimeout(() => {
        if (copiedId === id) {
          copiedId = null;
        }
      }, 1500);
    } catch {
      toastState.error("Không thể sao chép tin nhắn");
    }
  }

  function handleReplayAudio(message: GeminiLiveMessage) {
    // Prefer the cached 24 kHz PCM Gemini actually spoke.
    if (geminiLiveState.replayMessage(message.id)) {
      toastState.info("Đang phát lại giọng Gemini đã ghi...");
      return;
    }

    // Older turns fall out of the replay cache, so read the text with the OS voice.
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(message.text);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
        toastState.info("Audio gốc đã hết cache, đang đọc lại bằng giọng hệ thống...");
      } catch {
        toastState.error("Không thể phát lại âm thanh trên thiết bị này.");
      }
    } else {
      toastState.error("Không còn audio gốc để phát lại cho tin nhắn này.");
    }
  }

  function formatTime(date: Date | string | number): string {
    try {
      const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  }
</script>

<div class="w-full flex-1 flex flex-col space-y-4 select-none min-h-0">
  <!-- 1. Google Account & Live Connection Status Banner -->
  <div class="flex items-center justify-between flex-wrap gap-2.5 shrink-0">
    <div class="flex items-center gap-2 flex-wrap">
      <div
        class="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-linear-to-r from-rose-500/10 via-pink-500/10 to-indigo-500/10 border border-rose-400/25 shadow-xs"
      >
        <GoogleIcon class="w-4 h-4" />
        <span class="text-xs font-semibold text-(--ink)">
          Google Gemini Live Video 1-on-1
        </span>
        {#if callStatus === "connected"}
          <span
            class="w-1.5 h-1.5 rounded-full bg-(--success) shadow-[0_0_6px_var(--success)] animate-pulse"
          ></span>
          <span class="inline-flex items-center gap-1 text-[10px] text-(--accent-text) font-mono font-medium tabular-nums">
            <Timer class="w-3 h-3" />
            <span>{callDuration}</span>
            {#if geminiLiveState.tokensUsed > 0}
              <span class="text-(--muted)">· {geminiLiveState.tokensUsed} tokens</span>
            {/if}
          </span>
        {:else}
          <span class="w-1.5 h-1.5 rounded-full bg-(--muted)"></span>
          <span class="text-[10px] text-(--muted) font-mono font-medium">
            Multimodal Stream
          </span>
        {/if}
      </div>

      {#if !user}
        <button
          type="button"
          onclick={onSignInGoogle}
          class="btn h-7 text-[10px] px-2.5 bg-(--surface) hover:bg-(--paper) border-(--line) text-(--ink)"
        >
          <GoogleIcon class="w-3.5 h-3.5" />
          <span>Đăng nhập Google</span>
        </button>
      {/if}

      <button
        type="button"
        onclick={() => (isApiKeyModalOpen = true)}
        class="badge {hasApiKey
          ? 'badge-ok'
          : 'badge-warn'} h-7 px-2.5 text-[11px] flex items-center gap-1.5 cursor-pointer hover:opacity-90 transition-opacity"
        title="Quản lý Gemini API Key"
      >
        <KeyRound class="w-3.5 h-3.5" />
        <span>{hasApiKey ? "API Key: Đã lưu" : "Chưa có API Key"}</span>
      </button>

      <button
        type="button"
        onclick={() => (isDiagnosticsOpen = true)}
        class="badge h-7 px-2.5 text-[11px] flex items-center gap-1.5 cursor-pointer bg-(--surface) border-(--line) text-(--muted) hover:text-(--ink) transition-colors"
        title="Xem log kết nối, mic và chia sẻ màn hình"
      >
        <Activity class="w-3.5 h-3.5" />
        <span>Chẩn đoán</span>
      </button>
    </div>

    <!-- Active Call State Badge -->
    <div
      class="badge {callStatus === 'connected'
        ? 'badge-ok'
        : callStatus === 'connecting'
        ? 'badge-warn'
        : callStatus === 'error'
        ? 'bg-(--error)/15 text-(--error) border-(--error)/30'
        : 'bg-(--surface) border-(--line) text-(--muted)'} h-7 px-3 text-[11px] flex items-center gap-1.5"
    >
      {#if callStatus === "connecting"}
        <Loader2 class="w-3.5 h-3.5 animate-spin text-(--warning)" />
      {:else if callStatus === "connected"}
        <span class="w-1.5 h-1.5 rounded-full bg-(--success) animate-pulse"></span>
      {:else if callStatus === "error"}
        <AlertTriangle class="w-3.5 h-3.5 text-(--error)" />
      {:else}
        <span class="w-1.5 h-1.5 rounded-full bg-(--muted)"></span>
      {/if}
      <span>
        {callStatus === "connecting"
          ? "Đang kết nối WebSocket..."
          : callStatus === "connected"
          ? (isAiSpeaking ? "Gemini đang nói..." : isUserSpeaking ? "Đang lắng nghe bạn..." : "Cuộc gọi trực tiếp đang mở")
          : callStatus === "error"
          ? "Lỗi kết nối Gemini Live"
          : "Sẵn sàng (Standby)"}
      </span>
    </div>
  </div>

  {#if geminiLiveState.notice}
    <div
      class="shrink-0 flex items-start gap-2 px-3 py-2 rounded-xl bg-(--warning)/10 border border-(--warning)/25 text-[11px] text-(--ink)"
      role="status"
    >
      <AlertTriangle class="w-3.5 h-3.5 text-(--warning) shrink-0 mt-0.5" />
      <span class="flex-1">{geminiLiveState.notice}</span>
      <button
        type="button"
        onclick={() => (geminiLiveState.notice = null)}
        class="text-(--muted) hover:text-(--ink) transition-colors cursor-pointer"
        title="Ẩn thông báo"
      >
        <Check class="w-3.5 h-3.5" />
      </button>
    </div>
  {/if}

  {#if callStatus === "error"}
    <!-- Lỗi cuộc gọi: luôn hiện lý do thật từ máy chủ để không phải đoán -->
    <div
      class="shrink-0 flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-(--error)/10 border border-(--error)/30 text-[11px] text-(--ink)"
      role="alert"
    >
      <AlertTriangle class="w-4 h-4 text-(--error) shrink-0 mt-0.5" />
      <div class="flex-1 min-w-0 space-y-1">
        <p class="m-0 font-semibold">{geminiLiveState.error || "Cuộc gọi đã bị ngắt."}</p>
        {#if geminiLiveState.lastClose}
          <p class="m-0 font-mono text-[10px] text-(--muted) break-all">
            Máy chủ đóng kết nối: mã {geminiLiveState.lastClose.code}{geminiLiveState.lastClose.reason
              ? ` · ${geminiLiveState.lastClose.reason}`
              : " · (không kèm lý do)"}
          </p>
        {/if}
        <div class="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onclick={handleStartCall}
            class="h-7 px-2.5 rounded-lg bg-(--error)/15 hover:bg-(--error)/25 border border-(--error)/30 text-(--ink) text-[11px] font-medium flex items-center gap-1.5 cursor-pointer"
          >
            <PhoneCall class="w-3.5 h-3.5" />
            <span>Gọi lại</span>
          </button>
          <button
            type="button"
            onclick={handleCopyDiagnostics}
            class="h-7 px-2.5 rounded-lg bg-(--surface) hover:bg-(--paper) border border-(--line) text-(--ink) text-[11px] flex items-center gap-1.5 cursor-pointer"
          >
            <Copy class="w-3.5 h-3.5" />
            <span>Sao chép chẩn đoán</span>
          </button>
          <button
            type="button"
            onclick={() => (isDiagnosticsOpen = true)}
            class="h-7 px-2 rounded-lg text-(--muted) hover:text-(--ink) text-[11px] cursor-pointer"
          >
            Xem chi tiết
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- 2. Responsive 2-Column Workspace (Stage & Dialogue Rail) -->
  <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-0 items-stretch">
    <!-- Cột trái (Stage): Interactive Live Stage, PiP Webcam, Dual Visualizer & HUD -->
    <div
      class="lg:col-span-7 flex flex-col justify-between p-4 sm:p-5 panel relative overflow-hidden h-full min-h-125 gap-3"
    >
      <!-- Top Stage Bar: Persona Indicator & Device Telemetry -->
      <div class="flex items-center justify-between flex-wrap gap-x-3 gap-y-1.5 text-xs pb-1 shrink-0">
        <div class="flex items-center gap-1.5 flex-wrap whitespace-nowrap">
          <Sparkles class="w-3.5 h-3.5 text-(--accent-text)" />
          <span class="font-semibold text-(--ink) text-[11px] uppercase tracking-wider">
            Gemini Interactive Live Stage
          </span>
          <span class="badge text-[9px] px-1.5 py-0 bg-(--surface) border-(--line) text-(--muted) font-mono">
            {selectedPersona}
          </span>
          <label class="inline-flex items-center gap-1 text-[10px] text-(--muted)" title="Model Gemini Live">
            <Cpu class="w-3 h-3" />
            <select
              bind:value={selectedModel}
              onchange={handleModelChange}
              disabled={callStatus === "connected" || callStatus === "connecting"}
              class="bg-transparent text-[10px] font-mono text-(--ink) cursor-pointer focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Chọn model Gemini Live"
            >
              {#each GEMINI_LIVE_MODELS as m}
                <option value={m.value}>{m.label}</option>
              {/each}
            </select>
          </label>
        </div>
        <div class="flex items-center gap-2 flex-wrap whitespace-nowrap">
          <button
            type="button"
            onclick={toggleAgentControl}
            class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-medium transition-colors cursor-pointer {geminiLiveState.toolsEnabled
              ? 'bg-(--success)/15 border-(--success)/30 text-(--success)'
              : 'bg-(--surface) border-(--line) text-(--muted)'}"
            title="Cho phép Gemini gọi hàm điều khiển mixer (âm lượng, mute, EQ)"
          >
            <Zap class="w-3 h-3" />
            <span>Agent Control</span>
          </button>
          <button
            type="button"
            onclick={toggleWebSearch}
            class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-medium transition-colors cursor-pointer {geminiLiveState.webSearchEnabled && !searchBlocked
              ? 'bg-(--accent)/15 border-(--accent)/30 text-(--accent-text)'
              : 'bg-(--surface) border-(--line) text-(--muted)'} {searchBlocked ? 'line-through' : ''}"
            title={searchBlocked
              ? "Khóa API hết quota Google Search với model này; chọn Gemini 2.5 Flash Native Audio để tìm kiếm web"
              : "Cho phép Gemini tìm Google để trả lời tin tức, giá cả, thời tiết"}
            aria-pressed={geminiLiveState.webSearchEnabled}
          >
            <Globe class="w-3 h-3" />
            <span>Google Search</span>
          </button>
          <button
            type="button"
            onclick={toggleCaptions}
            class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-medium transition-colors cursor-pointer {geminiLiveState.captionsEnabled
              ? 'bg-(--accent)/15 border-(--accent)/30 text-(--accent-text)'
              : 'bg-(--surface) border-(--line) text-(--muted)'}"
            title="Ghi phụ đề trực tiếp cho cả giọng của bạn và của Gemini"
          >
            <Captions class="w-3 h-3" />
            <span>Phụ đề</span>
          </button>
          <label
            class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-(--line) bg-(--surface) text-[10px] font-medium text-(--muted)"
            title="Gemini chờ bạn im lặng bao lâu rồi mới trả lời. Càng thấp càng đáp nhanh, nhưng ngập ngừng giữa câu dễ bị cắt lời. Áp cho cuộc gọi kế tiếp."
          >
            <Gauge class="w-3 h-3" />
            <span class="sr-only">Tốc độ phản hồi</span>
            <select
              class="bg-transparent outline-none cursor-pointer"
              value={String(geminiLiveState.replyDelayMs)}
              onchange={(event) => {
                geminiLiveState.setReplyDelay(Number(event.currentTarget.value));
                toastState.info("Áp dụng từ cuộc gọi kế tiếp");
              }}
            >
              <option value="200">Phản hồi: Nhanh nhất</option>
              <option value="400">Phản hồi: Nhanh</option>
              <option value="800">Phản hồi: Thong thả</option>
            </select>
          </label>
          {#if geminiLiveState.isVideoEnabled || geminiLiveState.isScreenSharing}
            <span class="inline-flex items-center gap-1 text-[10px] text-(--success) font-mono font-medium">
              <span class="w-1.5 h-1.5 rounded-full bg-(--success) animate-pulse"></span>
              {geminiLiveState.isScreenSharing ? `Screen - ${GEMINI_VIDEO_UPLINK_FPS} fps uplink` : uplinkLabel}
            </span>
          {/if}
          <span class="text-[10px] text-(--muted) font-mono">
            {pcmLabel}
          </span>
        </div>
      </div>

      <!-- Main Video Stage Viewport -->
      <div
        class="relative flex-1 w-full rounded-2xl bg-stone-950 border border-(--line) overflow-hidden flex flex-col items-center justify-center min-h-75 sm:min-h-85 shadow-inner"
      >
        <!-- Subtle Ambient Background Glow -->
        <div
          class="absolute inset-0 transition-all duration-700 pointer-events-none {isAiSpeaking
            ? 'bg-emerald-950/20'
            : isUserSpeaking
            ? 'bg-rose-950/20'
            : 'bg-transparent'}"
        ></div>

        <!-- Màn hình đang chia sẻ: đây chính là khung hình Gemini nhận.
             Created per share (like the webcam PiP) instead of toggled with display:none,
             which WebKit may keep from painting the stream. -->
        {#if geminiLiveState.isScreenSharing && geminiLiveState.nativeScreenFrame}
          <!-- Desktop app: khung hình do macOS chụp, đúng cái Gemini đang nhận -->
          <img
            src={geminiLiveState.nativeScreenFrame}
            alt="Màn hình đang chia sẻ với Gemini"
            class="absolute inset-0 w-full h-full object-contain bg-stone-950 z-5"
          />
        {:else if geminiLiveState.isScreenSharing && geminiLiveState.screenStream}
          <video
            bind:this={screenVideoElement}
            autoplay
            playsinline
            muted
            onloadedmetadata={(e) => e.currentTarget.play().catch(() => {})}
            class="absolute inset-0 w-full h-full object-contain bg-stone-950 z-5"
          ></video>
        {/if}

        {#if screenPermissionMissing && !geminiLiveState.isScreenSharing}
          <!-- macOS chưa cấp quyền Screen Recording: không mở stream đen -->
          <div class="absolute inset-0 z-15 flex items-center justify-center p-4 bg-stone-950/85 backdrop-blur-sm">
            <div class="max-w-md w-full rounded-2xl border border-amber-500/40 bg-stone-900/95 p-4 text-stone-200 space-y-2.5 shadow-2xl">
              <div class="flex items-center gap-2 text-amber-300 font-semibold text-sm">
                <ShieldAlert class="w-4 h-4 shrink-0" />
                <span>rust-sound chưa có quyền ghi màn hình</span>
              </div>
              <p class="text-[11px] text-stone-400 m-0">
                macOS sẽ chỉ gửi khung đen cho đến khi bạn cấp quyền Screen Recording cho app.
              </p>
              <ol class="text-[11px] text-stone-300 m-0 pl-4 space-y-1 list-decimal">
                <li>Bấm "Mở System Settings" và bật <span class="font-semibold">rust-sound</span>
                  (chạy bằng <span class="font-mono">pnpm tauri dev</span> thì bật Terminal / iTerm / VS Code).</li>
                <li>Thoát hẳn app bằng Cmd+Q rồi mở lại.</li>
              </ol>
              <div class="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onclick={handleOpenScreenSettings}
                  class="h-8 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Settings2 class="w-3.5 h-3.5" />
                  <span>Mở System Settings</span>
                </button>
                <button
                  type="button"
                  onclick={recheckScreenPermission}
                  class="h-8 px-3 rounded-lg bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-200 text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw class="w-3.5 h-3.5" />
                  <span>Kiểm tra lại</span>
                </button>
                <button
                  type="button"
                  onclick={startShareUnchecked}
                  class="h-8 px-3 rounded-lg text-stone-400 hover:text-stone-200 text-xs cursor-pointer"
                  title="Bỏ qua kiểm tra của macOS và mở hộp chọn màn hình"
                >
                  Vẫn chia sẻ
                </button>
                <button
                  type="button"
                  onclick={() => (screenPermissionMissing = false)}
                  class="h-8 px-2 rounded-lg text-stone-500 hover:text-stone-300 text-xs cursor-pointer"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        {/if}

        {#if geminiLiveState.isScreenSharing && geminiLiveState.screenShareIssue}
          <!-- Hướng dẫn khi capture trả về khung đen / không có khung hình -->
          <div class="absolute inset-0 z-15 flex items-center justify-center p-4 bg-stone-950/85 backdrop-blur-sm">
            <div class="max-w-md w-full rounded-2xl border border-amber-500/40 bg-stone-900/95 p-4 text-stone-200 space-y-2.5 shadow-2xl">
              <div class="flex items-center gap-2 text-amber-300 font-semibold text-sm">
                <AlertTriangle class="w-4 h-4 shrink-0" />
                <span>
                  {geminiLiveState.screenShareIssue === "black"
                    ? "Màn hình chia sẻ đang trả về khung đen"
                    : "Chưa nhận được khung hình nào từ màn hình chia sẻ"}
                </span>
              </div>
              <p class="text-[11px] text-stone-400 m-0">
                Gemini sẽ không nhận khung đen để tránh đoán sai nội dung. Trên macOS nguyên nhân thường gặp nhất là
                app chưa có quyền ghi màn hình:
              </p>
              <ol class="text-[11px] text-stone-300 m-0 pl-4 space-y-1 list-decimal">
                <li>Mở System Settings → Privacy &amp; Security → Screen &amp; System Audio Recording.</li>
                <li>
                  Bật <span class="font-semibold">rust-sound</span>. Nếu đang chạy bằng
                  <span class="font-mono">pnpm tauri dev</span>, bật cho Terminal / iTerm / VS Code đang chạy lệnh đó.
                </li>
                <li>Thoát hẳn app bằng Cmd+Q rồi mở lại. macOS chỉ áp dụng quyền này sau khi khởi động lại.</li>
              </ol>

              {#if rebuildPermissionHint(signingIdentity)}
                <!-- Quyền đã cấp rồi mà vẫn bị hỏi lại sau mỗi lần build: nguyên nhân là
                     chữ ký ad-hoc, không phải người dùng bấm sai. Nói thẳng ra. -->
                <div class="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 space-y-1">
                  <span class="text-[11px] font-semibold text-amber-200 block">
                    Đã cấp quyền rồi mà build lại vẫn bị hỏi?
                  </span>
                  <p class="text-[11px] text-stone-300 m-0">{signingIdentity?.explanation}</p>
                  <p class="text-[11px] text-stone-400 m-0 font-mono break-all">
                    {rebuildPermissionHint(signingIdentity)}
                  </p>
                </div>
              {/if}
              <div class="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onclick={handleOpenScreenSettings}
                  class="h-8 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Settings2 class="w-3.5 h-3.5" />
                  <span>Mở System Settings</span>
                </button>
                <button
                  type="button"
                  onclick={retryScreenShare}
                  class="h-8 px-3 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw class="w-3.5 h-3.5" />
                  <span>Chọn lại màn hình</span>
                </button>
                <button
                  type="button"
                  onclick={toggleScreenShare}
                  class="h-8 px-3 rounded-lg bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-300 text-xs cursor-pointer"
                >
                  Dừng chia sẻ
                </button>
              </div>
            </div>
          </div>
        {/if}

        {#if geminiLiveState.isScreenSharing}
          <div
            class="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full bg-stone-900/90 border text-[11px] font-medium shadow-lg backdrop-blur-md {isAiSpeaking
              ? 'border-emerald-400/60 text-emerald-300'
              : isUserSpeaking
              ? 'border-rose-400/60 text-rose-300'
              : 'border-stone-700 text-stone-300'}"
          >
            <ScreenShare class="w-3.5 h-3.5" />
            <span>
              {callStatus === "connected"
                ? isAiSpeaking
                  ? "Gemini đang phản hồi về màn hình của bạn..."
                  : "Gemini đang xem màn hình bạn chia sẻ"
                : "Màn hình đã sẵn sàng, bắt đầu gọi để Gemini nhìn thấy"}
            </span>
          </div>
        {:else}
          <!-- Central Gemini Interactive Live Halo & Waves -->
          <div class="relative flex items-center justify-center w-44 h-44 sm:w-56 sm:h-56 z-10">
            <!-- Gemini Speaking Concentric Expansion Rings -->
            {#if isAiSpeaking}
              <span
                class="absolute inset-0 rounded-full border border-emerald-400/40 animate-ping opacity-60 pointer-events-none"
              ></span>
              <span
                class="absolute -inset-4 rounded-full border border-teal-400/30 animate-pulse opacity-50 pointer-events-none"
                style="transform: scale({1 + geminiLiveState.aiVolume * 0.35});"
              ></span>
              <span
                class="absolute -inset-8 rounded-full border border-cyan-400/20 opacity-30 pointer-events-none"
                style="transform: scale({1 + geminiLiveState.aiVolume * 0.65});"
              ></span>
            {/if}

            <!-- User Speaking Concentric Expansion Rings -->
            {#if isUserSpeaking}
              <span
                class="absolute inset-0 rounded-full border border-rose-400/40 animate-ping opacity-60 pointer-events-none"
              ></span>
              <span
                class="absolute -inset-4 rounded-full border border-pink-400/30 animate-pulse opacity-50 pointer-events-none"
                style="transform: scale({1 + geminiLiveState.userVolume * 0.35});"
              ></span>
            {/if}

            <!-- Standby Breathing Ring -->
            {#if !isAiSpeaking && !isUserSpeaking}
              <span
                class="absolute inset-0 rounded-full border border-stone-800 animate-pulse opacity-40 pointer-events-none"
              ></span>
              {#if callStatus === "connected"}
                <span
                  class="absolute -inset-3 rounded-full border border-emerald-500/20 animate-pulse opacity-30 pointer-events-none"
                ></span>
              {/if}
            {/if}

            <!-- Central Pulsating Orb -->
            <div
              class="w-24 h-24 sm:w-30 sm:h-30 rounded-full flex flex-col items-center justify-center transition-all duration-300 shadow-2xl z-10 {isAiSpeaking
                ? 'bg-linear-to-tr from-emerald-500 via-teal-400 to-cyan-400 text-slate-950 scale-105 shadow-emerald-500/50 border border-emerald-300'
                : isUserSpeaking
                ? 'bg-linear-to-tr from-rose-500 via-pink-400 to-indigo-400 text-stone-950 scale-105 shadow-rose-500/50 border border-rose-300'
                : callStatus === 'connected'
                ? 'bg-stone-900 text-emerald-400 border border-emerald-500/40 shadow-lg'
                : callStatus === 'connecting'
                ? 'bg-stone-900 text-amber-400 border border-amber-500/40 animate-pulse'
                : 'bg-stone-900/90 text-stone-400 border border-stone-800'}"
            >
              {#if callStatus === "connecting"}
                <Loader2 class="w-9 h-9 sm:w-11 sm:h-11 animate-spin text-amber-400" />
              {:else if isAiSpeaking}
                <Sparkles class="w-9 h-9 sm:w-11 sm:h-11 animate-pulse text-slate-950 stroke-[2.2]" />
              {:else if isUserSpeaking}
                <Mic class="w-9 h-9 sm:w-11 sm:h-11 animate-pulse text-stone-950 stroke-[2.2]" />
              {:else if callStatus === "connected"}
                <Sparkles class="w-8 h-8 sm:w-10 sm:h-10 text-emerald-400" />
              {:else}
                <Bot class="w-8 h-8 sm:w-10 sm:h-10 text-stone-500" />
              {/if}
            </div>
          </div>

          <!-- Dynamic State Text -->
          <p class="text-xs font-semibold text-stone-300 mt-3 text-center z-10 px-4">
            {#if callStatus === "connecting"}
              Đang khởi tạo phiên làm việc Gemini Live đa phương thức...
            {:else if callStatus === "connected"}
              {#if isAiSpeaking}
                Gemini đang phản hồi qua luồng âm thanh thời gian thực...
              {:else if isUserSpeaking}
                Đang nhận diện giọng nói của bạn...
              {:else}
                Sẵn sàng đàm thoại · Nói trực tiếp hoặc gửi tin nhắn
              {/if}
            {:else if callStatus === "error"}
              {geminiLiveState.error || "Có lỗi xảy ra khi kết nối. Vui lòng kiểm tra lại API Key."}
            {:else}
              Nhấn "Bắt đầu gọi" bên dưới để trò chuyện video 1-on-1 với Gemini
            {/if}
          </p>
        {/if}

        <!-- Khung PiP Webcam Người Dùng (Góc phải dưới của Viewport) -->
        <div
          class="absolute bottom-4 right-4 z-20 rounded-2xl overflow-hidden border border-stone-700 bg-stone-900/95 backdrop-blur-md shadow-2xl transition-all duration-300 group {isPipExpanded
            ? 'w-60 h-44 sm:w-72 sm:h-52'
            : 'w-36 h-26 sm:w-44 sm:h-32'}"
        >
          {#if geminiLiveState.isVideoEnabled && geminiLiveState.cameraStream}
            <video
              bind:this={pipVideoElement}
              autoplay
              playsinline
              muted
              class="w-full h-full object-cover transition-transform duration-200 {isCameraFlipped
                ? 'scale-x-[-1]'
                : ''}"
            ></video>
          {:else}
            <div
              class="w-full h-full flex flex-col items-center justify-center bg-stone-900 text-stone-400 gap-1.5 p-2"
            >
              <div
                class="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-stone-800 border border-stone-700 flex items-center justify-center text-stone-400"
              >
                <User class="w-4 h-4 text-stone-400" />
              </div>
              <div class="flex items-center gap-1 text-[10px] font-medium text-stone-400">
                <CameraOff class="w-3 h-3 text-stone-500" />
                <span>Camera Tắt</span>
              </div>
            </div>
          {/if}

          <!-- PiP Action Controls -->
          <div
            class="absolute top-2 right-2 flex items-center gap-1 opacity-90 group-hover:opacity-100 transition-opacity"
          >
            <button
              type="button"
              onclick={toggleCameraFlip}
              class="p-1 rounded-md bg-stone-900/80 hover:bg-stone-800 border border-stone-700 text-stone-200 transition-colors cursor-pointer shadow-xs"
              title={isCameraFlipped ? "Tắt lật gương" : "Lật gương webcam"}
            >
              <SwitchCamera class="w-3 h-3" />
            </button>
            <button
              type="button"
              onclick={() => (isPipExpanded = !isPipExpanded)}
              class="p-1 rounded-md bg-stone-900/80 hover:bg-stone-800 border border-stone-700 text-stone-200 transition-colors cursor-pointer shadow-xs"
              title={isPipExpanded ? "Thu nhỏ PiP" : "Phóng to PiP"}
            >
              {#if isPipExpanded}
                <Minimize2 class="w-3 h-3" />
              {:else}
                <Maximize2 class="w-3 h-3" />
              {/if}
            </button>
          </div>

          <!-- PiP Bottom Pill -->
          <div
            class="absolute bottom-1.5 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded bg-stone-900/85 border border-stone-700 text-[9px] text-stone-300 font-medium"
          >
            {#if geminiLiveState.isVideoEnabled}
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Webcam</span>
            {:else}
              <span class="w-1.5 h-1.5 rounded-full bg-stone-500"></span>
              <span>Bạn</span>
            {/if}
          </div>
        </div>

        <!-- Cụm Điều Khiển Nổi (Floating Call HUD) Ở Góc Trái Dưới Viewport -->
        <div
          class="absolute bottom-4 left-4 z-20 flex items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-2xl bg-stone-900/90 backdrop-blur-md border border-stone-700 shadow-2xl max-w-[calc(100%-12rem)] flex-wrap"
        >
          <!-- Nút Bật/Tắt Micro -->
          <button
            type="button"
            onclick={toggleMic}
            class="p-2 sm:p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-center {geminiLiveState.isMuted
              ? 'bg-rose-500/20 border-rose-500/40 text-rose-400'
              : 'bg-stone-800 hover:bg-stone-700 border-stone-700 text-stone-200'}"
            title={geminiLiveState.isMuted ? "Bật Micro (Unmute)" : "Tắt Micro (Mute)"}
          >
            {#if geminiLiveState.isMuted}
              <MicOff class="w-4 h-4 text-rose-400" />
            {:else}
              <Mic class="w-4 h-4 text-stone-200" />
            {/if}
          </button>

          <!-- Nút Bật/Tắt Camera -->
          <button
            type="button"
            onclick={toggleCamera}
            class="p-2 sm:p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-center {geminiLiveState.isVideoEnabled
              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
              : 'bg-stone-800 hover:bg-stone-700 border-stone-700 text-stone-400'}"
            title={geminiLiveState.isVideoEnabled ? "Tắt Camera" : "Bật Camera"}
          >
            {#if geminiLiveState.isVideoEnabled}
              <Video class="w-4 h-4 text-emerald-300" />
            {:else}
              <VideoOff class="w-4 h-4 text-stone-400" />
            {/if}
          </button>

          <!-- Nút Chia Sẻ Màn Hình -->
          <button
            type="button"
            onclick={toggleScreenShare}
            class="p-2 sm:p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-center {geminiLiveState.isScreenSharing
              ? 'bg-sky-500/20 border-sky-500/40 text-sky-300'
              : 'bg-stone-800 hover:bg-stone-700 border-stone-700 text-stone-400'}"
            title={geminiLiveState.isScreenSharing ? "Dừng chia sẻ màn hình" : "Chia sẻ màn hình cho Gemini"}
            aria-pressed={geminiLiveState.isScreenSharing}
          >
            {#if geminiLiveState.isScreenSharing}
              <ScreenShareOff class="w-4 h-4 text-sky-300" />
            {:else}
              <ScreenShare class="w-4 h-4 text-stone-400" />
            {/if}
          </button>

          <!-- Dropdown Chọn Voice Persona -->
          <select
            bind:value={selectedPersona}
            onchange={handlePersonaChange}
            class="h-8.5 sm:h-9 text-xs pl-2.5 pr-6 rounded-xl bg-stone-800 border border-stone-700 text-stone-200 font-medium cursor-pointer focus:outline-none focus:border-stone-500"
            title="Chọn Voice Persona"
          >
            {#each GEMINI_PERSONAS as p}
              <option value={p.value}>{p.label}</option>
            {/each}
          </select>

          <!-- Nút Kết Nối / Kết Thúc Cuộc Gọi -->
          {#if callStatus === "idle" || callStatus === "error"}
            <button
              type="button"
              onclick={handleStartCall}
              class="h-8.5 sm:h-9 px-3 sm:px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/30 transition-all cursor-pointer active:scale-95"
            >
              <PhoneCall class="w-4 h-4" />
              <span class="hidden sm:inline">Bắt đầu gọi</span>
            </button>
          {:else if callStatus === "connecting"}
            <button
              type="button"
              disabled
              class="h-8.5 sm:h-9 px-3 sm:px-4 rounded-xl bg-amber-600 text-white font-medium text-xs flex items-center gap-1.5 opacity-90 cursor-wait"
            >
              <Loader2 class="w-4 h-4 animate-spin" />
              <span class="hidden sm:inline">Đang kết nối...</span>
            </button>
          {:else if callStatus === "connected"}
            <button
              type="button"
              onclick={handleEndCall}
              class="h-8.5 sm:h-9 px-3 sm:px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs flex items-center gap-1.5 shadow-md shadow-rose-600/30 transition-all cursor-pointer active:scale-95"
            >
              <PhoneOff class="w-4 h-4" />
              <span class="hidden sm:inline">Kết thúc</span>
            </button>
          {/if}

          <!-- Nút Kết Nối Lại Phiên (giữ nguyên lịch sử hội thoại) -->
          {#if callStatus === "connected" || callStatus === "error"}
            <button
              type="button"
              onclick={handleReconnect}
              class="p-2 sm:p-2.5 rounded-xl border border-stone-700 bg-stone-800 hover:bg-stone-700 text-stone-300 transition-colors cursor-pointer"
              title="Kết nối lại phiên Gemini Live, giữ nguyên lịch sử"
            >
              <RefreshCw class="w-4 h-4" />
            </button>
          {/if}

          <!-- Nút Cấu Hình API Key -->
          <button
            type="button"
            onclick={() => (isApiKeyModalOpen = true)}
            class="p-2 sm:p-2.5 rounded-xl border border-stone-700 bg-stone-800 hover:bg-stone-700 text-stone-300 transition-colors cursor-pointer"
            title="Cấu hình Gemini API Key"
          >
            <KeyRound class="w-4 h-4 {hasApiKey ? 'text-emerald-400' : 'text-amber-400'}" />
          </button>
        </div>
      </div>

      <!-- Dual Visualizer Âm Thanh 2 Chiều: Mic Người Dùng & Gemini Live -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 shrink-0 pt-1">
        <!-- Dải Âm Lượng Mic Người Dùng (Màu hồng/accent) -->
        <div class="p-2.5 rounded-xl bg-(--surface) border border-(--line) space-y-1.5">
          <div class="flex items-center justify-between text-xs">
            <div class="flex items-center gap-1.5">
              <div
                class="w-5 h-5 rounded-md bg-rose-500/15 flex items-center justify-center text-rose-400"
              >
                {#if geminiLiveState.isMuted}
                  <MicOff class="w-3 h-3 text-(--error)" />
                {:else}
                  <Mic class="w-3 h-3 text-rose-400" />
                {/if}
              </div>
              <span class="font-medium text-[11px] text-(--ink)">Mic Người Dùng</span>
              {#if geminiLiveState.isMuted}
                <span
                  class="badge text-[9px] px-1 py-0 bg-(--error)/15 text-(--error) border-(--error)/20"
                >
                  Tắt tiếng
                </span>
              {/if}
            </div>
            <span class="text-[10px] font-mono text-(--muted) tabular-nums">
              {geminiLiveState.isMuted ? "0%" : `${userVolPct}%`}
            </span>
          </div>
          <div class="w-full h-2 rounded-full bg-(--paper) border border-(--line) overflow-hidden p-0.5">
            <div
              class="h-full rounded-full bg-linear-to-r from-rose-500 via-pink-500 to-indigo-500 transition-all duration-75 shadow-xs"
              style="width: {geminiLiveState.isMuted ? 0 : userVolPct}%"
            ></div>
          </div>
        </div>

        <!-- Dải Âm Lượng Gemini (Màu xanh ngọc/success) -->
        <div class="p-2.5 rounded-xl bg-(--surface) border border-(--line) space-y-1.5">
          <div class="flex items-center justify-between text-xs">
            <div class="flex items-center gap-1.5">
              <div
                class="w-5 h-5 rounded-md bg-emerald-500/15 flex items-center justify-center text-emerald-400"
              >
                <Sparkles class="w-3 h-3 text-emerald-400" />
              </div>
              <span class="font-medium text-[11px] text-(--ink)">Gemini Live AI</span>
              {#if isAiSpeaking}
                <span
                  class="badge text-[9px] px-1 py-0 bg-(--success)/15 text-(--success) border-(--success)/20 animate-pulse"
                >
                  Đang nói
                </span>
              {/if}
            </div>
            <span class="text-[10px] font-mono text-(--muted) tabular-nums">
              {aiVolPct}%
            </span>
          </div>
          <div class="w-full h-2 rounded-full bg-(--paper) border border-(--line) overflow-hidden p-0.5">
            <div
              class="h-full rounded-full bg-linear-to-r from-emerald-400 via-teal-400 to-cyan-400 transition-all duration-75 shadow-xs"
              style="width: {aiVolPct}%"
            ></div>
          </div>

          <!-- Speaker Gain cho giọng Gemini -->
          <div class="flex items-center gap-2 pt-0.5">
            <button
              type="button"
              onclick={() => geminiLiveState.setOutputVolume(geminiLiveState.outputVolume > 0 ? 0 : 1)}
              class="text-(--muted) hover:text-(--ink) transition-colors cursor-pointer"
              title={outputVolPct === 0 ? "Bỏ tắt tiếng Gemini" : "Tắt tiếng Gemini"}
            >
              {#if outputVolPct === 0}
                <VolumeX class="w-3.5 h-3.5 text-(--error)" />
              {:else}
                <Volume2 class="w-3.5 h-3.5" />
              {/if}
            </button>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={outputVolPct}
              oninput={handleOutputVolume}
              aria-label="Âm lượng phát lại giọng Gemini"
              class="flex-1 h-1 accent-(--accent) cursor-pointer"
            />
            <span class="text-[10px] font-mono text-(--muted) tabular-nums w-8 text-right">
              {outputVolPct}%
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Cột phải (Dialogue Console): Danh sách tin nhắn, Xóa lịch sử, Quick Actions & Chat -->
    <div
      class="lg:col-span-5 flex flex-col justify-between panel p-4 sm:p-5 shadow-sm h-full min-h-125"
    >
      <!-- Header & Thẻ Gợi Ý Nhanh Quick Actions -->
      <div class="space-y-2.5 pb-3 border-b border-(--line) shrink-0">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-xs font-semibold text-(--ink) tracking-tight">
              Dialogue Console
            </span>
            <span
              class="px-1.5 py-0 text-[10px] rounded-md bg-(--surface) text-(--muted) border border-(--line) font-medium"
            >
              {geminiLiveState.transcript.length} tin nhắn
            </span>
          </div>

          <!-- Nút Xóa Lịch Sử (Mở Modal Xác Nhận Theo AGENTS.md Rule 3) -->
          <button
            type="button"
            onclick={() => (isClearModalOpen = true)}
            disabled={geminiLiveState.transcript.length === 0}
            class="flex items-center gap-1 text-[11px] text-(--muted) hover:text-(--accent-text) transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title="Xóa toàn bộ lịch sử cuộc trò chuyện"
          >
            <Trash2 class="w-3.5 h-3.5" />
            <span>Xóa lịch sử</span>
          </button>
        </div>

        <!-- Thẻ Gợi Ý Nhanh Quick Actions -->
        <div class="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {#each QUICK_ACTIONS as action}
            <button
              type="button"
              onclick={() => handleSendMessage(action.prompt)}
              class="px-2.5 py-1 rounded-lg bg-(--paper) border border-(--line) hover:border-(--focus) text-[11px] text-(--ink) transition-all cursor-pointer whitespace-nowrap active:scale-95 flex items-center gap-1.5"
            >
              {#if action.kind === "general"}
                <Sparkles class="w-3 h-3 text-(--accent-text)" />
              {:else}
                <Sliders class="w-3 h-3 text-(--accent-text)" />
              {/if}
              <span>{action.label}</span>
            </button>
          {/each}
        </div>
      </div>

      <!-- Danh Sách Tin Nhắn Hội Thoại Thời Gian Thực (geminiLiveState.transcript) -->
      <div
        bind:this={messagesContainer}
        class="flex-1 overflow-y-auto space-y-3 py-3 pr-1 min-h-50"
      >
        {#if geminiLiveState.transcript.length === 0}
          <div
            class="h-full flex flex-col items-center justify-center text-center p-8 text-(--muted)"
          >
            <Bot class="w-10 h-10 opacity-30 text-(--accent-text) mb-2 stroke-[1.5]" />
            <p class="text-xs font-medium text-(--ink) m-0">
              Chưa có tin nhắn nào
            </p>
            <p class="text-[11px] text-(--muted) mt-1 max-w-xs">
              Nhấn "Bắt đầu gọi" để trò chuyện bằng giọng nói với Gemini hoặc gõ tin nhắn văn bản bên dưới.
            </p>
            <p class="text-[10px] text-(--muted)/80 mt-1.5 max-w-xs">
              Hỏi bất kỳ chủ đề nào, cho Gemini xem camera hoặc màn hình. Khi Agent Control bật, Gemini còn
              tự đặt âm lượng từng ứng dụng, mute và chỉnh 10 band EQ master khi bạn yêu cầu.
            </p>
          </div>
        {:else}
          {#each geminiLiveState.transcript as m (m.id)}
            {#if m.sender === "tool"}
              <!-- Hàng Tool Call: Gemini đã thực thi lệnh điều khiển mixer thật -->
              <div
                class="flex items-start gap-2.5 px-3 py-2 rounded-xl border text-xs mx-2 {m.toolOk
                  ? 'bg-(--success)/8 border-(--success)/25'
                  : 'bg-(--error)/8 border-(--error)/25'}"
              >
                <div
                  class="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 {m.toolOk
                    ? 'bg-(--success)/15 text-(--success) border border-(--success)/25'
                    : 'bg-(--error)/15 text-(--error) border border-(--error)/25'}"
                >
                  <Wrench class="w-3.5 h-3.5" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center justify-between gap-2">
                    <span class="font-mono text-[10px] text-(--muted) truncate">
                      {m.toolName}
                    </span>
                    <span class="text-[10px] text-(--muted) shrink-0">
                      {formatTime(m.timestamp)}
                    </span>
                  </div>
                  <p class="text-(--ink) text-[11px] m-0 mt-0.5 leading-normal">{m.text}</p>
                </div>
              </div>
            {:else}
              <div
                class="flex gap-2.5 p-3 rounded-xl border text-xs leading-relaxed transition-all {m.sender ===
                'user'
                  ? 'bg-(--paper) border-(--line) ml-6'
                  : 'bg-(--surface) border-(--line) mr-6 shadow-sm ring-1 ring-(--accent)/20'}"
              >
                <div
                  class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 {m.sender ===
                  'user'
                    ? 'bg-(--surface) text-(--ink) border border-(--line)'
                    : 'bg-(--accent)/15 text-(--accent-text) border border-(--accent)/25'}"
                >
                  {#if m.sender === "user"}
                    <User class="w-4 h-4" />
                  {:else}
                    <Sparkles class="w-4 h-4 text-(--accent-text)" />
                  {/if}
                </div>

                <div class="flex-1 min-w-0">
                  <div class="flex items-center justify-between mb-1">
                    <div class="flex items-center gap-1.5">
                      <span class="font-semibold text-(--ink) text-xs">
                        {m.sender === "user" ? "Bạn" : "Gemini Live"}
                      </span>
                      {#if m.source === "voice"}
                        <span
                          class="badge text-[9px] px-1.5 py-0 bg-(--accent)/15 text-(--accent-text) border-(--accent)/30"
                        >
                          Live Voice
                        </span>
                      {:else if m.sender === "ai"}
                        <span
                          class="badge text-[9px] px-1.5 py-0 bg-(--surface) text-(--muted) border-(--line)"
                        >
                          Text
                        </span>
                      {/if}
                      {#if m.isFinal === false}
                        <span
                          class="inline-flex items-center gap-1 text-[9px] text-(--muted) font-mono"
                        >
                          <Loader2 class="w-2.5 h-2.5 animate-spin" />
                          <span>đang ghi…</span>
                        </span>
                      {/if}
                    </div>
                    <div class="flex items-center gap-2">
                      <span class="text-[10px] text-(--muted)">
                        {formatTime(m.timestamp)}
                      </span>
                      <button
                        type="button"
                        onclick={() => handleCopyMessage(m.id, m.text)}
                        class="text-(--muted) hover:text-(--ink) transition-colors cursor-pointer p-0.5 rounded"
                        title="Sao chép nội dung tin nhắn"
                      >
                        {#if copiedId === m.id}
                          <Check class="w-3 h-3 text-(--success)" />
                        {:else}
                          <Copy class="w-3 h-3" />
                        {/if}
                      </button>
                    </div>
                  </div>

                  <p class="text-(--ink) text-xs m-0 leading-normal whitespace-pre-wrap">{m.text}</p>

                  {#if m.sender === "ai" && m.isFinal !== false}
                    <div
                      class="flex items-center gap-2 mt-2 pt-1.5 border-t border-(--line)"
                    >
                      <button
                        type="button"
                        onclick={() => handleReplayAudio(m)}
                        class="flex items-center gap-1 text-[10px] text-(--muted) hover:text-(--accent-text) transition-colors cursor-pointer"
                        title={m.hasAudio
                          ? "Phát lại chính đoạn audio Gemini đã nói"
                          : "Audio gốc đã hết cache, sẽ đọc lại bằng giọng hệ thống"}
                      >
                        <Volume1 class="w-3 h-3" />
                        <span>{m.hasAudio ? "Phát lại giọng Gemini" : "Đọc lại nội dung"}</span>
                      </button>
                    </div>
                  {/if}
                </div>
              </div>
            {/if}
          {/each}
        {/if}
        <div bind:this={messagesEndRef}></div>
      </div>

      <!-- Khung Nhập Tin Nhắn Văn Bản Dự Phòng -->
      <form
        onsubmit={handleFormSubmit}
        class="flex items-center gap-2 pt-2.5 border-t border-(--line) shrink-0"
      >
        <div class="relative flex-1">
          <input
            type="text"
            bind:value={inputText}
            placeholder="Hỏi Gemini bất cứ điều gì, hoặc ra lệnh chỉnh âm thanh…"
            class="field w-full h-9 pr-10 text-xs"
          />
          <button
            type="button"
            onclick={toggleMic}
            class="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md transition-colors cursor-pointer {geminiLiveState.isMuted
              ? 'text-(--muted) hover:text-(--ink)'
              : 'text-(--accent-text) bg-rose-500/20'}"
            title={geminiLiveState.isMuted ? "Bật Micro" : "Tắt Micro"}
          >
            {#if geminiLiveState.isMuted}
              <MicOff class="w-4 h-4" />
            {:else}
              <Mic class="w-4 h-4" />
            {/if}
          </button>
        </div>

        <button
          type="submit"
          disabled={!inputText.trim()}
          class="btn btn-primary h-9 px-4 shrink-0 text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Send class="w-3.5 h-3.5 text-(--accent-ink)" />
          <span>Gửi</span>
        </button>
      </form>
    </div>
  </div>

  <!-- Modal Xác Nhận Xóa Lịch Sử Hội Thoại (Tuân thủ AGENTS.md Rule 3) -->
  <Modal
    open={isClearModalOpen}
    onClose={() => (isClearModalOpen = false)}
    title="Xác nhận xóa lịch sử cuộc trò chuyện"
    description="Bạn có chắc chắn muốn xóa toàn bộ lịch sử hội thoại hiện tại không? Mọi văn bản đã ghi nhận sẽ bị xóa vĩnh viễn."
    confirmText="Xóa lịch sử"
    cancelText="Hủy"
    confirmVariant="destructive"
    onConfirm={handleConfirmClear}
  >
    {#snippet icon()}
      <AlertTriangle class="w-5 h-5 text-(--warning)" />
    {/snippet}
  </Modal>

  <!-- Modal Chẩn Đoán: log để gửi lại khi gọi trong WKWebView có vấn đề -->
  <Modal
    open={isDiagnosticsOpen}
    onClose={() => (isDiagnosticsOpen = false)}
    title="Chẩn đoán Gemini Live"
    description="Trạng thái kết nối, mic, audio và chia sẻ màn hình. Sao chép và gửi kèm khi báo lỗi."
    confirmText="Sao chép log"
    cancelText="Đóng"
    onConfirm={handleCopyDiagnostics}
  >
    {#snippet icon()}
      <Activity class="w-5 h-5 text-(--accent-text)" />
    {/snippet}

    <div class="grid grid-cols-3 gap-2 py-2 text-center">
      <div class="p-2 rounded-lg bg-(--paper) border border-(--line)">
        <div class="text-[10px] text-(--muted)">Audio gửi đi</div>
        <div class="text-sm font-mono text-(--ink) tabular-nums">{geminiLiveState.stats.audioSent}</div>
      </div>
      <div class="p-2 rounded-lg bg-(--paper) border border-(--line)">
        <div class="text-[10px] text-(--muted)">Audio nhận về</div>
        <div class="text-sm font-mono text-(--ink) tabular-nums">{geminiLiveState.stats.audioReceived}</div>
      </div>
      <div class="p-2 rounded-lg bg-(--paper) border border-(--line)">
        <div class="text-[10px] text-(--muted)">Frame gửi đi</div>
        <div class="text-sm font-mono text-(--ink) tabular-nums">{geminiLiveState.stats.framesSent}</div>
      </div>
    </div>
    <pre
      class="max-h-64 overflow-auto p-2.5 rounded-lg bg-(--paper) border border-(--line) text-[10px] leading-relaxed font-mono text-(--ink) whitespace-pre-wrap select-text"
    >{isDiagnosticsOpen ? geminiLiveState.diagnosticsReport() : ""}</pre>
  </Modal>

  <!-- Modal Cấu Hình Gemini API Key -->
  <Modal
    open={isApiKeyModalOpen}
    onClose={() => (isApiKeyModalOpen = false)}
    title="Cấu hình Google Gemini API Key"
    description="Nhập API Key để kích hoạt kết nối WebSocket trực tiếp đến Google Gemini Live API (v1beta)."
    confirmText="Lưu và Kết nối"
    cancelText="Hủy"
    onConfirm={handleSaveApiKey}
  >
    {#snippet icon()}
      <KeyRound class="w-5 h-5 text-(--accent-text)" />
    {/snippet}

    <div class="space-y-3 py-2">
      <div>
        <label for="gemini-key-input" class="block text-xs font-semibold text-(--ink) mb-1">
          Gemini API Key
        </label>
        <div class="relative">
          <input
            id="gemini-key-input"
            type={showKey ? "text" : "password"}
            bind:value={apiKeyInput}
            placeholder="AIzaSy..."
            class="field w-full h-9 pr-10 text-xs font-mono"
          />
          <button
            type="button"
            onclick={() => (showKey = !showKey)}
            class="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-(--muted) hover:text-(--ink) transition-colors cursor-pointer"
            title={showKey ? "Ẩn khóa" : "Hiện khóa"}
          >
            {#if showKey}
              <EyeOff class="w-3.5 h-3.5" />
            {:else}
              <Eye class="w-3.5 h-3.5" />
            {/if}
          </button>
        </div>
      </div>

      <div
        class="p-2.5 rounded-xl bg-(--paper) border border-(--line) text-[11px] text-(--muted) space-y-1"
      >
        <p class="m-0">
          Bạn có thể lấy Google Gemini API Key miễn phí tại
          <span class="text-(--accent-text) font-mono">Google AI Studio</span> (aistudio.google.com).
        </p>
        <p class="m-0 text-[10px] text-(--muted)/80 font-mono">
          Khóa được lưu cục bộ an toàn trên macOS và không chia sẻ cho bên thứ ba.
        </p>
      </div>
    </div>
  </Modal>
</div>
