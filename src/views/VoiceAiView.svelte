<script lang="ts">
  import { toastState } from "@/lib/toast.svelte";
  import { googleAuthState } from "@/lib/googleAuth.svelte";
  import GoogleIcon from "@/components/icons/GoogleIcon.svelte";
  import Equalizer from "@/components/ui/Equalizer.svelte";
  import Modal from "@/components/ui/Modal.svelte";
  import type { GoogleUser } from "@/components/navigation/SideNavbar.svelte";
  import {
    Mic,
    MicOff,
    Volume2,
    Bot,
    User,
    Sparkles,
    Trash2,
    Copy,
    Check,
    Loader2,
    Send,
    Radio,
    Sliders,
    Volume1,
    AlertTriangle,
  } from "@lucide/svelte";

  export interface Message {
    id: string;
    sender: "user" | "ai";
    text: string;
    time: string;
    actionTaken?: string;
  }

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

  const INITIAL_MESSAGES: Message[] = [
    {
      id: "1",
      sender: "user",
      text: "Can you balance the audio between my Spotify playlist and the Brave Browser video?",
      time: "10:48 AM",
    },
    {
      id: "2",
      sender: "ai",
      text: "Done! I lowered Spotify to 60% and raised Brave Browser to 85% so speech remains crisp and intelligible.",
      time: "10:48 AM",
      actionTaken: "Adjusted Spotify to 60%, Brave to 85%",
    },
  ];

  const GEMINI_PERSONAS = [
    { label: "Aoede (Clear & Natural - Default)", value: "aoede" },
    { label: "Puck (Upbeat & Engaging)", value: "puck" },
    { label: "Charon (Deep & Calming)", value: "charon" },
    { label: "Kore (Warm & Studio)", value: "kore" },
    { label: "Fenrir (Crisp & Authoritative)", value: "fenrir" },
  ];

  const QUICK_ACTIONS = [
    {
      label: "Balance Spotify & Brave",
      prompt: "Balance audio between Spotify and Brave Browser for voice focus.",
      response: "Optimized balance: Lowered background music to 55% and prioritized voice speech at 90%.",
    },
    {
      label: "Duck background music 50%",
      prompt: "Duck all background music apps by 50%.",
      response: "Applied 50% ducking multiplier to all active background media streams.",
    },
    {
      label: "Boost voice clarity",
      prompt: "Boost mid-high frequencies for vocal clarity in meeting call.",
      response: "Configured 10-band EQ curve with +4dB boost at 2.5kHz and 5kHz for speech intelligibility.",
    },
    {
      label: "Mute background apps",
      prompt: "Mute all background applications except active call.",
      response: "Muted background media streams. Live call audio remains unhindered.",
    },
  ];

  let isListening = $state(false);
  let isMuted = $state(false);
  let inputMode = $state<"ptt" | "vad">("ptt");
  let selectedPersona = $state("aoede");
  let messages = $state<Message[]>(INITIAL_MESSAGES);
  let inputText = $state("");
  let status = $state<"idle" | "listening" | "thinking" | "speaking">("idle");
  let isClearModalOpen = $state(false);
  let copiedId = $state<string | null>(null);

  let messagesEndRef = $state<HTMLDivElement | null>(null);
  let messagesContainer = $state<HTMLDivElement | null>(null);

  // Synthesized web audio feedback cues
  function playAudioCue(type: "start" | "stop" | "success") {
    if (typeof window === "undefined") return;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      const gain = ctx.createGain();
      gain.connect(ctx.destination);

      if (type === "start") {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.14);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.18);
      } else if (type === "stop") {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(660, now);
        osc.frequency.exponentialRampToValueAtTime(330, now + 0.14);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.18);
      } else if (type === "success") {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(587.33, now);
        osc.frequency.setValueAtTime(880, now + 0.08);
        gain.gain.setValueAtTime(0.09, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.22);
      }
    } catch {
      // AudioContext fallback
    }
  }

  // Speech synthesis trigger for conversational responses
  function speakText(text: string) {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.05;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
      } catch {
        // Fallback
      }
    }
  }

  // Smooth scroll to bottom when new messages arrive
  $effect(() => {
    if (messages.length) {
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

  // Push-to-Talk Spacebar Listener
  $effect(() => {
    if (typeof window === "undefined") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && inputMode === "ptt") {
        const activeTag = document.activeElement?.tagName.toLowerCase();
        if (activeTag === "input" || activeTag === "textarea" || activeTag === "select") {
          return;
        }
        if (!isListening && status === "idle") {
          e.preventDefault();
          startListening();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" && inputMode === "ptt") {
        const activeTag = document.activeElement?.tagName.toLowerCase();
        if (activeTag === "input" || activeTag === "textarea" || activeTag === "select") {
          return;
        }
        if (isListening) {
          e.preventDefault();
          stopListeningAndProcess();
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

  function startListening() {
    if (isMuted) {
      isMuted = false;
    }
    isListening = true;
    status = "listening";
    playAudioCue("start");
    toastState.success(
      user
        ? `Gemini 2.5 Live Voice listening with persona ${selectedPersona.toUpperCase()}`
        : "Local speech capture active (Sign in with Google for Gemini AI)"
    );
  }

  function stopListeningAndProcess() {
    isListening = false;
    status = "thinking";
    playAudioCue("stop");

    setTimeout(() => {
      status = "speaking";
      const currentTime = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      const newAiMsg: Message = {
        id: `msg-${Date.now()}`,
        sender: "ai",
        text: user
          ? "Gemini 2.5 Live: I processed your audio command. CoreAudio streams are calibrated for your listening environment."
          : "Speech recognized. Sign in with Google to enable Gemini Live multimodal responses.",
        time: currentTime,
        actionTaken: "CoreAudio stream verified",
      };
      messages = [...messages, newAiMsg];
      speakText(newAiMsg.text);
      playAudioCue("success");

      setTimeout(() => {
        status = "idle";
      }, 2400);
    }, 1200);
  }

  function toggleListen() {
    if (isListening) {
      isListening = false;
      status = "idle";
      playAudioCue("stop");
      toastState.info("Voice microphone deactivated");
    } else {
      startListening();

      // In click-to-talk mode, cycle automatically after 3.5s
      setTimeout(() => {
        if (isListening && status === "listening") {
          stopListeningAndProcess();
        }
      }, 3500);
    }
  }

  function handleSendMessage(textToSend?: string) {
    const text = (textToSend || inputText).trim();
    if (!text) return;

    const currentTime = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      sender: "user",
      text,
      time: currentTime,
    };

    messages = [...messages, userMsg];
    inputText = "";
    status = "thinking";

    setTimeout(() => {
      status = "speaking";
      const matched = QUICK_ACTIONS.find((q) => q.prompt === text);
      const replyText = matched
        ? matched.response
        : user
        ? `Gemini 2.5 Live: Executed "${text}". Audio routing and parameters updated in real time.`
        : `Preview: Received "${text}". Connect Google Account to unlock real-time Gemini processing.`;

      const aiMsg: Message = {
        id: `msg-${Date.now() + 1}`,
        sender: "ai",
        text: replyText,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        actionTaken: "Live audio routing adjusted",
      };

      messages = [...messages, aiMsg];
      speakText(aiMsg.text);
      playAudioCue("success");
      toastState.success("AI audio command executed");

      setTimeout(() => {
        status = "idle";
      }, 1800);
    }, 800);
  }

  function handleFormSubmit(e: SubmitEvent) {
    e.preventDefault();
    handleSendMessage();
  }

  function handlePersonaChange() {
    const personaObj = GEMINI_PERSONAS.find((p) => p.value === selectedPersona);
    toastState.success(
      `Switched Gemini Voice Persona to ${personaObj?.label.split(" ")[0] || selectedPersona}`
    );
  }

  function handleConfirmClear() {
    messages = [];
    isClearModalOpen = false;
    toastState.info("Dialogue history cleared");
  }

  async function handleCopyMessage(msg: Message) {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(msg.text);
      }
      copiedId = msg.id;
      toastState.success("Message copied to clipboard");
      setTimeout(() => {
        if (copiedId === msg.id) {
          copiedId = null;
        }
      }, 1500);
    } catch {
      toastState.error("Failed to copy message");
    }
  }

  function handleReplayAudio(text: string) {
    toastState.info("Playing Gemini audio synthesis…");
    playAudioCue("success");
    speakText(text);
  }
</script>

<div class="w-full flex-1 flex flex-col space-y-4 select-none min-h-0">
  <!-- 1. Google Account & Model Status Banner -->
  <div class="flex items-center justify-between flex-wrap gap-2.5 shrink-0">
    <div class="flex items-center gap-2">
      {#if user}
        <div
          class="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-linear-to-r from-rose-500/10 via-pink-500/10 to-indigo-500/10 border border-rose-400/25 shadow-sm"
        >
          <GoogleIcon class="w-4 h-4" />
          <span class="text-xs font-semibold text-(--ink)">
            Google Gemini 2.5 Live Voice
          </span>
          <span
            class="w-1.5 h-1.5 rounded-full bg-(--success) shadow-[0_0_6px_var(--success)] animate-pulse"
          ></span>
          <span class="text-[10px] text-(--accent-text) font-mono font-medium">
            ~120ms Latency
          </span>
        </div>
      {:else}
        <div
          class="inline-flex items-center gap-2.5 px-3 py-1 rounded-xl bg-(--paper) border border-(--line) text-xs text-(--ink)"
        >
          <span class="text-[11px] text-(--muted)">
            Local Preview Mode · Connect Google for Gemini Live AI
          </span>
          <button
            type="button"
            onclick={onSignInGoogle}
            class="btn h-6 text-[10px] px-2.5 bg-(--surface) hover:bg-(--paper) border-(--line) text-(--ink)"
          >
            <GoogleIcon class="w-3.5 h-3.5" />
            <span>Sign in with Google</span>
          </button>
        </div>
      {/if}
    </div>

    <div
      class="badge {status === 'listening' || status === 'speaking'
        ? 'badge-ok'
        : status === 'thinking'
        ? 'badge-warn'
        : 'bg-(--surface) border-(--line) text-(--muted)'} h-7 px-3 text-[11px] flex items-center gap-1.5"
    >
      {#if status === "thinking"}
        <Loader2 class="w-3.5 h-3.5 animate-spin text-(--warning)" />
      {:else if status === "listening" || status === "speaking"}
        <span class="w-1.5 h-1.5 rounded-full bg-(--success) animate-pulse"></span>
      {:else}
        <span class="w-1.5 h-1.5 rounded-full bg-(--muted)"></span>
      {/if}
      <span>
        {status === "listening"
          ? "Listening to your voice…"
          : status === "thinking"
          ? "Gemini Thinking…"
          : status === "speaking"
          ? "Gemini Speaking…"
          : "Voice Engine Standby"}
      </span>
    </div>
  </div>

  <!-- 2. Responsive 2-Column Workspace -->
  <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-0 items-stretch">
    <!-- Left Column: Interactive Voice Stage & Hardware Controls -->
    <div
      class="lg:col-span-5 flex flex-col justify-between p-6 sm:p-7 panel relative overflow-hidden h-full min-h-115"
    >
      <!-- Top Stage Header: Google Persona Selector -->
      <div class="w-full space-y-2 shrink-0">
        <div class="flex items-center justify-between text-xs">
          <span
            class="text-[11px] font-semibold text-(--ink) uppercase tracking-wider flex items-center gap-1.5"
          >
            <Sparkles class="w-3.5 h-3.5 text-(--accent-text)" />
            <span>Voice Persona</span>
          </span>
          <span class="text-[10px] text-(--muted) font-mono">
            {user ? "Gemini Native Multimodal" : "Offline Preview"}
          </span>
        </div>

        <select
          bind:value={selectedPersona}
          onchange={handlePersonaChange}
          class="field w-full text-xs h-8.5"
        >
          {#each GEMINI_PERSONAS as p}
            <option value={p.value}>{p.label}</option>
          {/each}
        </select>
      </div>

      <!-- Central Pulsating Voice Orb Canvas -->
      <div class="relative flex flex-col items-center justify-center my-auto py-4">
        <!-- Ambient Animated Sound Wave Glow Rings -->
        <div class="relative flex items-center justify-center w-36 h-36 sm:w-44 sm:h-44">
          <!-- Listening Ring Animations -->
          {#if isListening}
            <span
              class="absolute inset-0 rounded-full border border-rose-400/40 animate-ping opacity-60 pointer-events-none"
            ></span>
            <span
              class="absolute -inset-4 rounded-full border border-rose-400/20 animate-pulse opacity-40 pointer-events-none"
            ></span>
            <span
              class="absolute -inset-8 rounded-full border border-rose-400/10 animate-pulse opacity-20 pointer-events-none"
            ></span>
          {/if}

          <!-- Speaking Ring Animations -->
          {#if status === "speaking"}
            <span
              class="absolute -inset-3 rounded-full border border-emerald-400/35 animate-pulse opacity-50 pointer-events-none"
            ></span>
            <span
              class="absolute -inset-7 rounded-full border border-emerald-400/15 animate-pulse opacity-25 pointer-events-none"
            ></span>
          {/if}

          <!-- Thinking Ring Animation -->
          {#if status === "thinking"}
            <span
              class="absolute -inset-3 rounded-full border border-(--accent)/35 animate-pulse opacity-40 pointer-events-none"
            ></span>
          {/if}

          <!-- Three Visual States for Mic Button (idle / listening / speaking) -->
          <button
            type="button"
            onclick={toggleListen}
            class="w-24 h-24 sm:w-28 sm:h-28 rounded-full flex flex-col items-center justify-center transition-all duration-300 shadow-2xl cursor-pointer z-10 active:scale-95 {isListening
              ? 'bg-linear-to-tr from-rose-400 via-pink-400 to-indigo-400 text-stone-950 scale-105 shadow-[0_0_36px_color-mix(in_srgb,var(--accent)_55%,transparent)] border border-(--accent)'
              : status === 'speaking'
              ? 'bg-linear-to-tr from-emerald-400 to-cyan-300 text-slate-950 shadow-[0_0_28px_color-mix(in_srgb,var(--success)_40%,transparent)] border border-emerald-400/40'
              : status === 'thinking'
              ? 'bg-(--surface) text-(--accent-text) border border-(--accent)/50 shadow-md'
              : 'bg-(--surface) hover:bg-(--core2) text-(--accent-text) border border-(--shell-line) hover:border-rose-400/40'}"
            title={isListening
              ? "Click to stop listening"
              : status === "speaking"
              ? "Gemini speaking - click to interrupt"
              : "Click to speak with AI (or hold Spacebar)"}
          >
            {#if isListening}
              <Mic class="w-9 h-9 sm:w-11 sm:h-11 animate-pulse text-stone-950 stroke-[2.2]" />
            {:else if status === "speaking"}
              <Volume2 class="w-9 h-9 sm:w-11 sm:h-11 animate-pulse text-slate-950 stroke-[2.2]" />
            {:else if status === "thinking"}
              <Loader2 class="w-9 h-9 sm:w-11 sm:h-11 animate-spin text-(--accent-text)" />
            {:else}
              <Mic class="w-8 h-8 sm:w-10 sm:h-10 text-rose-300" />
            {/if}
          </button>
        </div>

        <!-- Instruction Cue -->
        <p class="text-xs font-semibold text-(--ink) mt-3 text-center">
          {#if isListening}
            Listening… Speak your audio instruction
          {:else if status === "speaking"}
            Gemini speaking through CoreAudio output…
          {:else if status === "thinking"}
            Synthesizing multimodal audio command…
          {:else}
            Click microphone or hold Spacebar to talk
          {/if}
        </p>

        <!-- Live Audio Equalizer Waveform -->
        <div
          class="flex items-center gap-1.5 mt-2 h-4 px-3 py-1 rounded-full bg-(--paper) border border-(--line)"
        >
          <span class="text-[10px] text-(--muted) font-medium">Spectrum:</span>
          <Equalizer bars={5} active={isListening || status === "speaking"} />
        </div>
      </div>

      <!-- Bottom Hardware Controls -->
      <div class="space-y-3 shrink-0 pt-3 border-t border-(--line)">
        <div class="grid grid-cols-2 gap-2 text-xs">
          <button
            type="button"
            onclick={() => {
              isMuted = !isMuted;
              toastState.info(isMuted ? "Microphone muted" : "Microphone unmuted");
            }}
            class="btn {isMuted ? 'btn-danger' : ''} h-8 justify-start px-3"
          >
            {#if isMuted}
              <MicOff class="w-3.5 h-3.5" />
              <span>Mic Muted</span>
            {:else}
              <Mic class="w-3.5 h-3.5 text-(--accent-text)" />
              <span>Mic Active</span>
            {/if}
          </button>

          <button
            type="button"
            onclick={() => {
              inputMode = inputMode === "ptt" ? "vad" : "ptt";
              toastState.info(
                `Mode: ${
                  inputMode === "ptt"
                    ? "Push-to-Talk (Space)"
                    : "Voice Activity Detection"
                }`
              );
            }}
            class="btn h-8 justify-start px-3"
          >
            <Radio class="w-3.5 h-3.5 text-rose-400" />
            <span>{inputMode === "ptt" ? "Push-to-Talk" : "Hands-Free (VAD)"}</span>
          </button>
        </div>

        <div
          class="flex items-center justify-between p-2 rounded-xl bg-(--paper) border border-(--line) text-[11px] text-(--muted)"
        >
          <div class="flex items-center gap-2">
            <Volume2 class="w-3.5 h-3.5 text-(--accent-text)" />
            <span class="text-(--ink)">Output Stream</span>
          </div>
          <span class="text-(--muted) font-mono text-[10px]">
            CoreAudio 48.0 kHz
          </span>
        </div>
      </div>
    </div>

    <!-- Right Column: Full Dialogue Stream & Quick Actions Console -->
    <div
      class="lg:col-span-7 flex flex-col justify-between panel p-4 sm:p-5 shadow-sm h-full min-h-115"
    >
      <!-- Header & Quick Action Prompt Chips -->
      <div class="space-y-2.5 pb-3 border-b border-(--line) shrink-0">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-xs font-semibold text-(--ink) tracking-tight">
              Dialogue Console
            </span>
            <span
              class="px-1.5 py-0 text-[10px] rounded-md bg-(--surface) text-(--muted) border border-(--line) font-medium"
            >
              {messages.length} Messages
            </span>
          </div>

          <button
            type="button"
            onclick={() => (isClearModalOpen = true)}
            disabled={messages.length === 0}
            class="flex items-center gap-1 text-[11px] text-(--muted) hover:text-(--accent-text) transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title="Clear conversation history"
          >
            <Trash2 class="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        </div>

        <!-- Quick Audio Control Action Chips -->
        <div class="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {#each QUICK_ACTIONS as action}
            <button
              type="button"
              onclick={() => handleSendMessage(action.prompt)}
              class="px-2.5 py-1 rounded-lg bg-(--paper) border border-(--line) hover:border-(--focus) text-[11px] text-(--ink) transition-all cursor-pointer whitespace-nowrap active:scale-95 flex items-center gap-1.5"
            >
              <Sliders class="w-3 h-3 text-(--accent-text)" />
              <span>{action.label}</span>
            </button>
          {/each}
        </div>
      </div>

      <!-- Scrollable Conversation Stream -->
      <div
        bind:this={messagesContainer}
        class="flex-1 overflow-y-auto space-y-3 py-3 pr-1 min-h-50"
      >
        {#if messages.length === 0}
          <div
            class="h-full flex flex-col items-center justify-center text-center p-8 text-(--muted)"
          >
            <Bot class="w-10 h-10 opacity-30 text-(--accent-text) mb-2 stroke-[1.5]" />
            <p class="text-xs font-medium text-(--ink) m-0">
              No conversation messages yet
            </p>
            <p class="text-[11px] text-(--muted) mt-1 max-w-xs">
              Speak to the microphone or tap one of the quick audio action chips above to start controlling your sound.
            </p>
          </div>
        {:else}
          {#each messages as m (m.id)}
            <div
              class="flex gap-3 p-3.5 rounded-xl border text-xs leading-relaxed transition-all {m.sender ===
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
                      {m.sender === "user" ? "You" : "Google Gemini 2.5"}
                    </span>
                    {#if m.sender === "ai"}
                      <span
                        class="badge text-[9px] px-1.5 py-0 bg-(--accent)/15 text-(--accent-text) border-(--accent)/30"
                      >
                        Live Voice
                      </span>
                    {/if}
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-[10px] text-(--muted)">{m.time}</span>
                    <button
                      type="button"
                      onclick={() => handleCopyMessage(m)}
                      class="text-(--muted) hover:text-(--ink) transition-colors cursor-pointer p-0.5 rounded"
                      title="Copy message transcript"
                    >
                      {#if copiedId === m.id}
                        <Check class="w-3 h-3 text-(--success)" />
                      {:else}
                        <Copy class="w-3 h-3" />
                      {/if}
                    </button>
                  </div>
                </div>

                <p class="text-(--ink) text-xs m-0 leading-normal">{m.text}</p>

                {#if m.actionTaken}
                  <div
                    class="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-(--success)/10 border border-(--success)/20 text-[10px] text-(--success) font-medium"
                  >
                    <Check class="w-3 h-3" />
                    <span>Action: {m.actionTaken}</span>
                  </div>
                {/if}

                {#if m.sender === "ai"}
                  <div
                    class="flex items-center gap-2 mt-2 pt-1.5 border-t border-(--line)"
                  >
                    <button
                      type="button"
                      onclick={() => handleReplayAudio(m.text)}
                      class="flex items-center gap-1 text-[10px] text-(--muted) hover:text-(--accent-text) transition-colors cursor-pointer"
                    >
                      <Volume1 class="w-3 h-3" />
                      <span>Replay Audio</span>
                    </button>
                  </div>
                {/if}
              </div>
            </div>
          {/each}
        {/if}
        <div bind:this={messagesEndRef}></div>
      </div>

      <!-- Bottom Dual Input Bar (Text + Voice Trigger) -->
      <form
        onsubmit={handleFormSubmit}
        class="flex items-center gap-2 pt-2.5 border-t border-(--line) shrink-0"
      >
        <div class="relative flex-1">
          <input
            type="text"
            bind:value={inputText}
            placeholder="Type instruction (e.g. 'Boost vocal clarity for meeting')…"
            class="field w-full h-9 pr-10 text-xs"
          />
          <button
            type="button"
            onclick={toggleListen}
            class="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md transition-colors cursor-pointer {isListening
              ? 'text-(--accent-text) bg-rose-500/20 animate-pulse'
              : 'text-(--muted) hover:text-(--ink)'}"
            title="Tap to speak"
          >
            <Mic class="w-4 h-4" />
          </button>
        </div>

        <button
          type="submit"
          disabled={!inputText.trim()}
          class="btn btn-primary h-9 px-4 shrink-0 text-xs flex items-center gap-1.5"
        >
          <Send class="w-3.5 h-3.5 text-(--accent-ink)" />
          <span>Send</span>
        </button>
      </form>
    </div>
  </div>

  <!-- Confirmation Modal for Clearing Dialogue History -->
  <Modal
    open={isClearModalOpen}
    onClose={() => (isClearModalOpen = false)}
    title="Clear Dialogue History?"
    description="Are you sure you want to clear your conversation history? All recorded transcripts and audio action logs will be removed."
    confirmText="Clear History"
    cancelText="Cancel"
    confirmVariant="destructive"
    onConfirm={handleConfirmClear}
  >
    {#snippet icon()}
      <AlertTriangle class="w-5 h-5 text-(--warning)" />
    {/snippet}
  </Modal>
</div>
