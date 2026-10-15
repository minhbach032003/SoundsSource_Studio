import { useState, useRef, useEffect, type FC, type FormEvent } from "react";
import {
  ButtonComponent,
  BadgeComponent,
  InputComponent,
  SelectComponent,
  ModalComponent,
  EqualizerComponent,
  useToast,
} from "@/shared/ui";
import { GoogleIcon } from "@/components/icons/GoogleIcon";
import type { GoogleUser } from "@/components/navigation/SideNavbar";
import {
  Mic,
  MicOff,
  Volume2,
  Bot,
  User,
  Sparkles,
  Send,
  Trash2,
  Volume1,
  Sliders,
  CheckCircle2,
  Radio,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  sender: "user" | "ai";
  text: string;
  time: string;
  actionTaken?: string;
}

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

interface VoiceAiViewProps {
  user: GoogleUser | null;
  onSignInGoogle: () => void;
}

export const VoiceAiView: FC<VoiceAiViewProps> = ({
  user,
  onSignInGoogle,
}) => {
  const { showToast } = useToast();

  const [isListening, setIsListening] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [inputMode, setInputMode] = useState<"ptt" | "vad">("ptt");
  const [selectedPersona, setSelectedPersona] = useState("aoede");
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [inputText, setInputText] = useState("");
  const [status, setStatus] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const toggleListen = () => {
    if (isListening) {
      setIsListening(false);
      setStatus("idle");
      showToast("info", "Voice microphone deactivated");
    } else {
      if (isMuted) {
        setIsMuted(false);
      }
      setIsListening(true);
      setStatus("listening");
      showToast(
        "success",
        user
          ? `Gemini 2.5 Live Voice listening with persona ${selectedPersona.toUpperCase()}`
          : "Local speech capture active (Sign in with Google for Gemini AI)"
      );

      // Simulate AI thinking and response cycle after 3.5 seconds of listening
      setTimeout(() => {
        setStatus("thinking");
        setTimeout(() => {
          setStatus("speaking");
          const currentTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          const newAiMsg: Message = {
            id: `msg-${Date.now()}`,
            sender: "ai",
            text: user
              ? "Gemini 2.5 Live: I processed your audio command. CoreAudio streams are calibrated for your listening environment."
              : "Speech recognized. Sign in with Google to enable Gemini Live multimodal responses.",
            time: currentTime,
            actionTaken: "CoreAudio stream verified",
          };
          setMessages((prev) => [...prev, newAiMsg]);
          setTimeout(() => {
            setStatus("idle");
            setIsListening(false);
          }, 2400);
        }, 1200);
      }, 3500);
    }
  };

  const handleSendMessage = (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text) return;

    const currentTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      sender: "user",
      text,
      time: currentTime,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText("");
    setStatus("thinking");

    setTimeout(() => {
      setStatus("speaking");
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

      setMessages((prev) => [...prev, aiMsg]);
      showToast("success", "AI audio command executed");

      setTimeout(() => {
        setStatus("idle");
      }, 1600);
    }, 800);
  };

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    handleSendMessage();
  };

  const handlePersonaChange = (personaVal: string) => {
    setSelectedPersona(personaVal);
    const personaObj = GEMINI_PERSONAS.find((p) => p.value === personaVal);
    showToast("success", `Switched Gemini Voice Persona to ${personaObj?.label.split(" ")[0] || personaVal}`);
  };

  const handleConfirmClear = () => {
    setMessages([]);
    setIsClearModalOpen(false);
    showToast("info", "Dialogue history cleared");
  };

  return (
    <div className="w-full h-full flex flex-col space-y-4 select-none min-h-0 flex-1">
      {/* 1. Google Account & Model Status Banner (Responsive Header) */}
      <div className="flex items-center justify-between flex-wrap gap-2.5 shrink-0">
        <div className="flex items-center gap-2">
          {user ? (
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-gradient-to-r from-rose-500/10 via-pink-500/10 to-indigo-500/10 border border-rose-400/25 shadow-sm">
              <GoogleIcon className="w-4 h-4" />
              <span className="text-xs font-semibold text-stone-100">
                Google Gemini 2.5 Live Voice
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_var(--success)] animate-pulse" />
              <span className="text-[10px] text-rose-300 font-mono font-medium">
                ~120ms Latency
              </span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-2.5 px-3 py-1 rounded-xl bg-[var(--paper)] border border-[var(--line)] text-xs text-[var(--ink)]">
              <span className="text-[11px] text-[var(--muted)]">
                Local Preview Mode · Connect Google for Gemini Live AI
              </span>
              <ButtonComponent
                variant="outline"
                size="sm"
                onClick={onSignInGoogle}
                leftIcon={<GoogleIcon className="w-3.5 h-3.5" />}
                className="h-6 text-[10px] px-2.5 bg-[var(--surface)] hover:bg-[var(--paper)] border-[var(--line)] text-[var(--ink)]"
              >
                Sign in with Google
              </ButtonComponent>
            </div>
          )}
        </div>

        <BadgeComponent
          variant={
            status === "listening"
              ? "emerald"
              : status === "thinking"
              ? "default"
              : status === "speaking"
              ? "playing"
              : "outline"
          }
          dot={status !== "idle"}
          className="h-7 px-3 text-[11px]"
        >
          {status === "listening"
            ? "Listening to your voice…"
            : status === "thinking"
            ? "Gemini Thinking…"
            : status === "speaking"
            ? "Gemini Speaking…"
            : "Voice Engine Standby"}
        </BadgeComponent>
      </div>

      {/* 2. Fluid 2-Column Responsive Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-0 items-stretch">
        {/* Left Column (lg:col-span-5): Interactive Voice Stage & Audio Hardware Controls */}
        <div className="lg:col-span-5 flex flex-col justify-between p-6 sm:p-7 panel relative overflow-hidden h-full min-h-[460px]">
          {/* Top Stage Header: Google Persona Selector */}
          <div className="w-full space-y-2 shrink-0">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[11px] font-semibold text-[var(--ink)] uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                <span>Voice Persona</span>
              </span>
              <span className="text-[10px] text-[var(--muted)] font-mono">
                {user ? "Gemini Native Multimodal" : "Offline Preview"}
              </span>
            </div>

            <SelectComponent
              value={selectedPersona}
              onChange={handlePersonaChange}
              options={GEMINI_PERSONAS}
              className="h-8.5 text-xs"
            />
          </div>

          {/* Central Pulsating Voice Orb Canvas */}
          <div className="relative flex flex-col items-center justify-center my-auto py-4">
            {/* Ambient Animated Sound Wave Glow Rings */}
            <div className="relative flex items-center justify-center w-36 h-36 sm:w-44 sm:h-44">
              {isListening && (
                <>
                  <span className="absolute inset-0 rounded-full border border-rose-400/40 animate-ping opacity-60 pointer-events-none" />
                  <span className="absolute -inset-4 rounded-full border border-rose-400/20 animate-pulse opacity-40 pointer-events-none" />
                  <span className="absolute -inset-8 rounded-full border border-rose-400/10 animate-pulse opacity-20 pointer-events-none" />
                </>
              )}

              {/* Central Mic Button */}
              <button
                onClick={toggleListen}
                className={cn(
                  "w-24 h-24 sm:w-28 sm:h-28 rounded-full flex flex-col items-center justify-center transition-all duration-300 shadow-2xl cursor-pointer z-10 active:scale-95",
                  isListening
                    ? "bg-gradient-to-tr from-rose-400 via-pink-400 to-indigo-400 text-stone-950 scale-105 shadow-[0_0_36px_color-mix(in_srgb,var(--accent)_55%,transparent)]"
                    : status === "speaking"
                    ? "bg-gradient-to-tr from-emerald-400 to-cyan-300 text-slate-950 shadow-[0_0_28px_color-mix(in_srgb,var(--success)_40%,transparent)]"
                    : "bg-[var(--surface)] hover:bg-[var(--core2)] text-stone-200 border border-[var(--shell-line)] hover:border-rose-400/40"
                )}
                title={isListening ? "Click to stop listening" : "Click to speak with AI"}
              >
                {isListening ? (
                  <Mic className="w-9 h-9 sm:w-11 sm:h-11 animate-pulse text-stone-950 stroke-[2.2]" />
                ) : (
                  <Mic className="w-8 h-8 sm:w-10 sm:h-10 text-rose-300" />
                )}
              </button>
            </div>

            {/* Instruction Cue */}
            <p className="text-xs font-semibold text-[var(--ink)] mt-3 text-center">
              {isListening
                ? "Listening… Speak your audio instruction"
                : status === "speaking"
                ? "Gemini speaking through CoreAudio output…"
                : status === "thinking"
                ? "Synthesizing multimodal audio command…"
                : "Click microphone or hold Spacebar to talk"}
            </p>

            {/* Live Audio Equalizer Waveform */}
            <div className="flex items-center gap-1.5 mt-2 h-4 px-3 py-1 rounded-full bg-[var(--paper)] border border-[var(--line)]">
              <span className="text-[10px] text-[var(--muted)] font-medium">Spectrum:</span>
              <EqualizerComponent bars={5} active={isListening || status === "speaking"} />
            </div>
          </div>

          {/* Bottom Hardware Controls */}
          <div className="space-y-3 shrink-0 pt-3 border-t border-[var(--line)]">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <ButtonComponent
                variant={isMuted ? "destructive" : "outline"}
                size="sm"
                onClick={() => {
                  setIsMuted(!isMuted);
                  showToast("info", isMuted ? "Microphone unmuted" : "Microphone muted");
                }}
                leftIcon={isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                className="h-8 justify-start px-3"
              >
                {isMuted ? "Mic Muted" : "Mic Active"}
              </ButtonComponent>

              <ButtonComponent
                variant="outline"
                size="sm"
                onClick={() => {
                  const nextMode = inputMode === "ptt" ? "vad" : "ptt";
                  setInputMode(nextMode);
                  showToast("info", `Mode: ${nextMode === "ptt" ? "Push-to-Talk (Space)" : "Voice Activity Detection"}`);
                }}
                leftIcon={<Radio className="w-3.5 h-3.5 text-rose-400" />}
                className="h-8 justify-start px-3"
              >
                {inputMode === "ptt" ? "Push-to-Talk" : "Hands-Free (VAD)"}
              </ButtonComponent>
            </div>

            <div className="flex items-center justify-between p-2 rounded-xl bg-[var(--paper)] border border-[var(--line)] text-[11px] text-[var(--muted)]">
              <div className="flex items-center gap-2">
                <Volume2 className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                <span className="text-[var(--ink)]">Output Stream</span>
              </div>
              <span className="text-[var(--muted)] font-mono text-[10px]">
                CoreAudio 48.0 kHz
              </span>
            </div>
          </div>
        </div>

        {/* Right Column (lg:col-span-7): Full Dialogue Stream & Quick Actions Console */}
        <div className="lg:col-span-7 flex flex-col justify-between panel p-4 sm:p-5 shadow-sm h-full min-h-[460px]">
          {/* Header & Quick Action Prompt Chips */}
          <div className="space-y-2.5 pb-3 border-b border-[var(--line)] shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[var(--ink)] tracking-tight">
                  Dialogue Console
                </span>
                <BadgeComponent variant="secondary" className="px-1.5 py-0 text-[10px]">
                  {messages.length} Messages
                </BadgeComponent>
              </div>

              <button
                onClick={() => setIsClearModalOpen(true)}
                disabled={messages.length === 0}
                className="flex items-center gap-1 text-[11px] text-[var(--muted)] hover:text-[var(--accent-text)] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                title="Clear conversation history"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            </div>

            {/* Quick Audio Control Action Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.label}
                  onClick={() => handleSendMessage(action.prompt)}
                  className="px-2.5 py-1 rounded-lg bg-[var(--paper)] border border-[var(--line)] hover:border-[var(--focus)] text-[11px] text-[var(--ink)] transition-all cursor-pointer whitespace-nowrap active:scale-95 flex items-center gap-1.5"
                >
                  <Sliders className="w-3 h-3 text-[var(--accent)]" />
                  <span>{action.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Scrollable Conversation Stream */}
          <div className="flex-1 overflow-y-auto space-y-3 py-3 pr-1 min-h-[200px]">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-[var(--muted)]">
                <Bot className="w-10 h-10 opacity-30 text-[var(--accent-text)] mb-2 stroke-[1.5]" />
                <p className="text-xs font-medium text-[var(--ink)] m-0">
                  No conversation messages yet
                </p>
                <p className="text-[11px] text-[var(--muted)] mt-1 max-w-xs">
                  Speak to the microphone or tap one of the quick audio action chips above to start controlling your sound.
                </p>
              </div>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "flex gap-3 p-3.5 rounded-xl border text-xs leading-relaxed transition-all",
                    m.sender === "user"
                      ? "bg-[var(--paper)] border-[var(--line)] ml-6"
                      : "bg-[var(--surface)] border-[var(--line)] mr-6 shadow-sm ring-1 ring-[var(--accent)]/20"
                  )}
                >
                  <div
                    className={cn(
                      "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                      m.sender === "user"
                        ? "bg-[var(--surface)] text-[var(--ink)] border border-[var(--line)]"
                        : "bg-[var(--accent)]/15 text-[var(--accent-text)] border border-[var(--accent)]/25"
                    )}
                  >
                    {m.sender === "user" ? (
                      <User className="w-4 h-4" />
                    ) : (
                      <Sparkles className="w-4 h-4 text-[var(--accent-text)]" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-[var(--ink)] text-xs">
                          {m.sender === "user" ? "You" : "Google Gemini 2.5"}
                        </span>
                        {m.sender === "ai" && (
                          <BadgeComponent variant="default" className="text-[9px] px-1.5 py-0">
                            Live Voice
                          </BadgeComponent>
                        )}
                      </div>
                      <span className="text-[10px] text-[var(--muted)]">{m.time}</span>
                    </div>

                    <p className="text-[var(--ink)] text-xs m-0 leading-normal">{m.text}</p>

                    {m.actionTaken && (
                      <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-[var(--success)] font-medium">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Action: {m.actionTaken}</span>
                      </div>
                    )}

                    {m.sender === "ai" && (
                      <div className="flex items-center gap-2 mt-2 pt-1.5 border-t border-[var(--line)]">
                        <button
                          onClick={() => showToast("info", "Playing Gemini audio synthesis…")}
                          className="flex items-center gap-1 text-[10px] text-[var(--muted)] hover:text-[var(--accent-text)] transition-colors cursor-pointer"
                        >
                          <Volume1 className="w-3 h-3" />
                          <span>Replay Audio</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Bottom Dual Input Bar (Text + Voice Trigger) */}
          <form
            onSubmit={handleFormSubmit}
            className="flex items-center gap-2 pt-2.5 border-t border-[var(--line)] shrink-0"
          >
            <div className="relative flex-1">
              <InputComponent
                placeholder="Type instruction (e.g. 'Boost vocal clarity for meeting')…"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                fullWidth
                className="h-9 pr-10 text-xs"
              />
              <button
                type="button"
                onClick={toggleListen}
                className={cn(
                  "absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md transition-colors cursor-pointer",
                  isListening ? "text-[var(--accent-text)] bg-rose-500/20 animate-pulse" : "text-[var(--muted)] hover:text-[var(--ink)]"
                )}
                title="Tap to speak"
              >
                <Mic className="w-4 h-4" />
              </button>
            </div>

            <ButtonComponent
              type="submit"
              variant="primary"
              size="sm"
              disabled={!inputText.trim()}
              leftIcon={<Send className="w-3.5 h-3.5 text-[var(--accent-ink)]" />}
              className="h-9 px-4 shrink-0"
            >
              Send
            </ButtonComponent>
          </form>
        </div>
      </div>

      {/* Confirmation Modal for Clearing Dialogue History */}
      <ModalComponent
        open={isClearModalOpen}
        onClose={() => setIsClearModalOpen(false)}
        title="Clear Dialogue History?"
        description="Are you sure you want to clear your conversation history? All recorded transcripts and audio action logs will be removed."
        confirmText="Clear History"
        cancelText="Cancel"
        confirmVariant="destructive"
        icon={<AlertTriangle className="w-5 h-5 text-amber-400" />}
        onConfirm={handleConfirmClear}
      />
    </div>
  );
};
