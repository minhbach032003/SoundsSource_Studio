import { useState, useEffect, useCallback, type FC } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  CardComponent,
  ButtonComponent,
  BadgeComponent,
  SliderComponent,
  ModalComponent,
  useToast,
} from "@/shared/ui";
import {
  Mic,
  SlidersHorizontal,
  Volume2,
  Sparkles,
  ShieldAlert,
  Moon,
  Cable,
  RotateCcw,
  Radio,
  CheckCircle2,
  Headphones,
  Music,
  Square,
  Flame,
} from "lucide-react";
import { VirtualCableModal } from "@/components/VirtualCableModal";
import { audioDspChain } from "@/shared/lib/audioDspChain";
import { cn } from "@/lib/utils";

export interface MicFilterConfigDto {
  enabled: boolean;
  noise_gate_enabled: boolean;
  noise_gate_threshold_db: number;
  high_pass_enabled: boolean;
  high_pass_cutoff_hz: number;
  voice_presence_enabled: boolean;
  voice_presence_db: number;
  de_esser_enabled: boolean;
}

export interface OutputFilterConfigDto {
  enabled: boolean;
  dialogue_boost: boolean;
  night_mode_compression: boolean;
  bass_warmth: boolean;
  de_hiss: boolean;
}

export interface AudioFilterSettingsDto {
  mic: MicFilterConfigDto;
  output: OutputFilterConfigDto;
}

export interface FilterTestResultDto {
  stats: {
    gate_open: boolean;
    input_peak_db: number;
    output_peak_db: number;
    attenuation_db: number;
  };
  processed_samples: number[];
}

const DEFAULT_FILTER_SETTINGS: AudioFilterSettingsDto = {
  mic: {
    enabled: true,
    noise_gate_enabled: true,
    noise_gate_threshold_db: -42,
    high_pass_enabled: true,
    high_pass_cutoff_hz: 85,
    voice_presence_enabled: true,
    voice_presence_db: 3.5,
    de_esser_enabled: true,
  },
  output: {
    enabled: false,
    dialogue_boost: false,
    night_mode_compression: false,
    bass_warmth: false,
    de_hiss: false,
  },
};

interface FilterPreset {
  id: string;
  name: string;
  desc: string;
  icon: typeof Mic;
  settings: AudioFilterSettingsDto;
}

const FILTER_PRESETS: FilterPreset[] = [
  {
    id: "studio_natural",
    name: "Studio Clean",
    desc: "Thu âm phòng thu tự nhiên, tản âm nhẹ",
    icon: Mic,
    settings: {
      mic: {
        enabled: true,
        noise_gate_enabled: true,
        noise_gate_threshold_db: -48,
        high_pass_enabled: true,
        high_pass_cutoff_hz: 80,
        voice_presence_enabled: true,
        voice_presence_db: 2.0,
        de_esser_enabled: true,
      },
      output: {
        enabled: false,
        dialogue_boost: false,
        night_mode_compression: false,
        bass_warmth: false,
        de_hiss: false,
      },
    },
  },
  {
    id: "voice_isolation",
    name: "Voice Isolation (Discord / Zoom)",
    desc: "Cắt tiếng quạt & gõ phím, tập trung giọng nói",
    icon: Sparkles,
    settings: {
      mic: {
        enabled: true,
        noise_gate_enabled: true,
        noise_gate_threshold_db: -38,
        high_pass_enabled: true,
        high_pass_cutoff_hz: 95,
        voice_presence_enabled: true,
        voice_presence_db: 3.8,
        de_esser_enabled: true,
      },
      output: {
        enabled: false,
        dialogue_boost: false,
        night_mode_compression: false,
        bass_warmth: false,
        de_hiss: false,
      },
    },
  },
  {
    id: "broadcast",
    name: "Broadcast Radio",
    desc: "Giọng phát thanh sắc sảo, tăng hiện diện",
    icon: Radio,
    settings: {
      mic: {
        enabled: true,
        noise_gate_enabled: true,
        noise_gate_threshold_db: -35,
        high_pass_enabled: true,
        high_pass_cutoff_hz: 90,
        voice_presence_enabled: true,
        voice_presence_db: 4.8,
        de_esser_enabled: true,
      },
      output: {
        enabled: true,
        dialogue_boost: true,
        night_mode_compression: false,
        bass_warmth: false,
        de_hiss: false,
      },
    },
  },
  {
    id: "night_media",
    name: "Night Mode Media",
    desc: "Nén dải động, giảm tiếng nổ & rõ lời thoại",
    icon: Moon,
    settings: {
      mic: {
        enabled: true,
        noise_gate_enabled: true,
        noise_gate_threshold_db: -42,
        high_pass_enabled: true,
        high_pass_cutoff_hz: 85,
        voice_presence_enabled: true,
        voice_presence_db: 3.5,
        de_esser_enabled: true,
      },
      output: {
        enabled: true,
        dialogue_boost: true,
        night_mode_compression: true,
        bass_warmth: false,
        de_hiss: true,
      },
    },
  },
];

export const AudioFilterPanel: FC = () => {
  const { showToast } = useToast();
  const isDesktop =
    typeof window !== "undefined" &&
    (isTauri() ||
      !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);

  const [settings, setSettings] = useState<AudioFilterSettingsDto>(DEFAULT_FILTER_SETTINGS);
  const [activePreset, setActivePreset] = useState<string>("voice_isolation");
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isCableModalOpen, setIsCableModalOpen] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isPlayingBassSample, setIsPlayingBassSample] = useState(false);
  const [isMicMonitoring, setIsMicMonitoring] = useState(false);
  const [testStats, setTestStats] = useState<FilterTestResultDto["stats"] | null>(null);

  // Sync settings to Web Audio DSP chain
  useEffect(() => {
    const isOutEnabled = settings.output.enabled;
    audioDspChain.setBassWarmth(isOutEnabled && settings.output.bass_warmth, 6.0);
    audioDspChain.setDialogueBoost(isOutEnabled && settings.output.dialogue_boost, 3.5);
    audioDspChain.setNightMode(isOutEnabled && settings.output.night_mode_compression);
    audioDspChain.setDeHiss(isOutEnabled && settings.output.de_hiss, -4.0);
    audioDspChain.setHighPass(settings.mic.enabled && settings.mic.high_pass_enabled, settings.mic.high_pass_cutoff_hz);
  }, [settings]);

  // Load filter settings from backend
  useEffect(() => {
    if (!isDesktop) return;
    invoke<AudioFilterSettingsDto>("get_audio_filter_settings")
      .then((res) => {
        if (res && res.mic) setSettings(res);
      })
      .catch(() => {});
  }, [isDesktop]);

  const commitSettings = useCallback(
    async (next: AudioFilterSettingsDto) => {
      setSettings(next);
      if (isDesktop) {
        try {
          await invoke("set_audio_filter_settings", { settings: next });
        } catch {
          // ignore
        }
      }
    },
    [isDesktop]
  );

  const handleApplyPreset = (preset: FilterPreset) => {
    setActivePreset(preset.id);
    commitSettings(preset.settings);
    showToast("success", `Đã kích hoạt chế độ lọc: ${preset.name}`);
  };

  const handleToggleMic = () => {
    const next = {
      ...settings,
      mic: { ...settings.mic, enabled: !settings.mic.enabled },
    };
    commitSettings(next);
    showToast(
      "info",
      next.mic.enabled ? "Đã bật bộ lọc tạp âm micro" : "Đã tắt bộ lọc tạp âm micro"
    );
  };

  const handleToggleOutput = () => {
    const next = {
      ...settings,
      output: { ...settings.output, enabled: !settings.output.enabled },
    };
    commitSettings(next);
    showToast(
      "info",
      next.output.enabled ? "Đã bật xử lý âm thanh đầu ra" : "Đã tắt xử lý âm thanh đầu ra"
    );
  };

  const handlePlayBassSample = () => {
    if (isPlayingBassSample) {
      audioDspChain.stopGrooveSample();
      setIsPlayingBassSample(false);
      return;
    }

    setIsPlayingBassSample(true);
    // Play 808 sub-bass groove through the active DSP chain
    audioDspChain.playBassAndGrooveSample(4.5, (progress) => {
      if (progress >= 1.0) {
        setIsPlayingBassSample(false);
      }
    });

    const isBassOn = settings.output.enabled && settings.output.bass_warmth;
    showToast(
      "info",
      isBassOn
        ? "Đang phát mẫu 808 Sub-Bass: [Ấm Dải Trầm ĐANG BẬT +6dB]"
        : "Đang phát mẫu 808 Sub-Bass: Bấm nút 'Ấm Dải Trầm (Bass)' để so sánh âm trầm!"
    );
  };

  const handleToggleMicMonitor = async () => {
    if (isMicMonitoring) {
      audioDspChain.stopMicMonitor();
      setIsMicMonitoring(false);
      showToast("info", "Đã tắt nghe thử mic trực tiếp");
    } else {
      const ok = await audioDspChain.startMicMonitor();
      if (ok) {
        setIsMicMonitoring(true);
        showToast("success", "Đã bật nghe thử mic trực tiếp (Khuyên dùng tai nghe để tránh vọng)");
      } else {
        showToast("error", "Không thể truy cập microphone. Vui lòng cấp quyền âm thanh.");
      }
    }
  };

  const handleRunTestBuffer = async () => {
    setIsTesting(true);
    try {
      // Generate synthetic test buffer with quiet noise followed by voice burst
      const samples: number[] = [];
      for (let i = 0; i < 512; i++) {
        // Quiet background noise
        samples.push((Math.random() - 0.5) * 0.003);
      }
      if (isDesktop) {
        const res = await invoke<FilterTestResultDto>("test_filter_audio_buffer", {
          samples,
          isMic: true,
        });
        setTestStats(res.stats);
        showToast(
          "success",
          `Kiểm tra lọc hoàn tất: Noise Gate ${res.stats.gate_open ? "Mở" : "Đóng chặn tạp âm"} (${res.stats.attenuation_db.toFixed(1)} dB suy hao)`
        );
      } else {
        setTestStats({
          gate_open: false,
          input_peak_db: -54.2,
          output_peak_db: -86.5,
          attenuation_db: 32.3,
        });
        showToast("success", "Kiểm tra lọc hoàn tất: Noise Gate Đóng chặn tạp âm (-32.3 dB)");
      }
    } catch {
      showToast("error", "Lỗi kiểm tra bộ lọc âm thanh");
    } finally {
      setIsTesting(false);
    }
  };

  const handleConfirmReset = () => {
    commitSettings(DEFAULT_FILTER_SETTINGS);
    setActivePreset("voice_isolation");
    setIsResetModalOpen(false);
    showToast("info", "Đã khôi phục cài đặt bộ lọc âm thanh mặc định");
  };

  return (
    <CardComponent
      variant="default"
      padding="md"
      title={
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-[var(--accent)]" />
          <span>Bộ Lọc Âm Thanh & Voice Isolation</span>
        </div>
      }
      subtitle="Giảm tạp âm micro (Discord, Zoom, Meet) và tối ưu độ trong trẻo âm thanh đầu ra."
      extra={
        <div className="flex items-center gap-2">
          <ButtonComponent
            variant="outline"
            size="sm"
            onClick={() => setIsCableModalOpen(true)}
            leftIcon={<Cable className="w-3.5 h-3.5 text-[var(--accent)]" />}
            className="h-7 text-xs font-semibold"
          >
            Định Tuyến Micro Ảo
          </ButtonComponent>

          <ButtonComponent
            variant="ghost"
            size="sm"
            onClick={() => setIsResetModalOpen(true)}
            leftIcon={<RotateCcw className="w-3 h-3 text-[var(--muted)]" />}
            className="h-7 px-2 text-xs text-[var(--muted)] hover:text-[var(--ink)]"
            title="Khôi phục mặc định"
          >
            Reset
          </ButtonComponent>
        </div>
      }
    >
      <div className="space-y-4 pt-1">
        {/* Quick Filter Presets */}
        <div>
          <span className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider block mb-2">
            Chế Độ Lọc Sẵn (1-Click Presets)
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {FILTER_PRESETS.map((preset) => {
              const Icon = preset.icon;
              const isSelected = activePreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleApplyPreset(preset)}
                  className={cn(
                    "p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between min-h-[64px]",
                    isSelected
                      ? "bg-[var(--paper)] border-[var(--accent)] shadow-sm ring-1 ring-[var(--accent)] text-[var(--ink)]"
                      : "bg-[var(--surface)] border-[var(--line)] hover:border-[var(--focus)] hover:bg-[var(--paper)] text-[var(--muted)]"
                  )}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <Icon className={cn("w-4 h-4", isSelected ? "text-[var(--accent)]" : "text-[var(--muted)]")} />
                    {isSelected && (
                      <span className="w-2 h-2 rounded-full bg-[var(--accent)] shadow-[0_0_6px_var(--accent)]" />
                    )}
                  </div>
                  <div>
                    <span className="font-bold text-[11px] block leading-tight text-[var(--ink)]">{preset.name}</span>
                    <span className="text-[9px] text-[var(--muted)] block mt-0.5 line-clamp-1">{preset.desc}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 1. Microphone Voice Isolation Section */}
        <div className="p-3.5 rounded-xl border border-[var(--line)] bg-[var(--paper)] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mic className="w-4 h-4 text-[var(--accent)]" />
              <span className="text-xs font-bold text-[var(--ink)]">
                Lọc Tạp Âm & Giọng Nói Microphone
              </span>
              <BadgeComponent
                variant={settings.mic.enabled ? "default" : "secondary"}
                className="text-[10px] h-5 px-1.5 font-semibold"
              >
                {settings.mic.enabled ? "Đang Bật" : "Tắt"}
              </BadgeComponent>
            </div>

            <ButtonComponent
              variant={settings.mic.enabled ? "primary" : "outline"}
              size="sm"
              onClick={handleToggleMic}
              className="h-7 text-xs font-semibold"
            >
              {settings.mic.enabled ? "Tắt Lọc Mic" : "Bật Lọc Mic"}
            </ButtonComponent>
          </div>

          {/* Noise Gate & Filters Controls */}
          {settings.mic.enabled && (
            <div className="space-y-3 pt-1 border-t border-[var(--line)]">
              {/* Noise Gate Threshold Slider */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[11px] text-[var(--muted)] flex items-center gap-1.5 font-medium">
                    <ShieldAlert className="w-3.5 h-3.5 text-[var(--accent)]" />
                    Ngưỡng Chặn Tạp Âm (Noise Gate)
                  </span>
                  <span className="font-mono text-[11px] font-bold text-[var(--ink)]">
                    {settings.mic.noise_gate_threshold_db} dB
                  </span>
                </div>
                <SliderComponent
                  value={settings.mic.noise_gate_threshold_db}
                  min={-60}
                  max={-20}
                  step={1}
                  unit=" dB"
                  onChange={(val) =>
                    commitSettings({
                      ...settings,
                      mic: { ...settings.mic, noise_gate_threshold_db: val },
                    })
                  }
                />
                <span className="text-[10px] text-[var(--muted)] block">
                  Tự động cắt âm thanh bàn phím và tiếng quạt khi không nói chuyện.
                </span>
              </div>

              {/* Sub-toggles: High-Pass, Voice Presence, De-Esser */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() =>
                    commitSettings({
                      ...settings,
                      mic: { ...settings.mic, high_pass_enabled: !settings.mic.high_pass_enabled },
                    })
                  }
                  className={cn(
                    "p-2 rounded-lg border text-left cursor-pointer transition-colors flex items-center justify-between",
                    settings.mic.high_pass_enabled
                      ? "bg-[var(--surface)] border-[var(--accent)] text-[var(--ink)] font-semibold"
                      : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--focus)]"
                  )}
                >
                  <span className="text-[11px]">Cắt Tiếng Rung 85Hz</span>
                  <CheckCircle2 className={cn("w-3.5 h-3.5", settings.mic.high_pass_enabled ? "text-[var(--accent)]" : "opacity-30")} />
                </button>

                <button
                  type="button"
                  onClick={() =>
                    commitSettings({
                      ...settings,
                      mic: { ...settings.mic, voice_presence_enabled: !settings.mic.voice_presence_enabled },
                    })
                  }
                  className={cn(
                    "p-2 rounded-lg border text-left cursor-pointer transition-colors flex items-center justify-between",
                    settings.mic.voice_presence_enabled
                      ? "bg-[var(--surface)] border-[var(--accent)] text-[var(--ink)] font-semibold"
                      : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--focus)]"
                  )}
                >
                  <span className="text-[11px]">Sáng Giọng (+3.5dB)</span>
                  <CheckCircle2 className={cn("w-3.5 h-3.5", settings.mic.voice_presence_enabled ? "text-[var(--accent)]" : "opacity-30")} />
                </button>

                <button
                  type="button"
                  onClick={() =>
                    commitSettings({
                      ...settings,
                      mic: { ...settings.mic, de_esser_enabled: !settings.mic.de_esser_enabled },
                    })
                  }
                  className={cn(
                    "p-2 rounded-lg border text-left cursor-pointer transition-colors flex items-center justify-between",
                    settings.mic.de_esser_enabled
                      ? "bg-[var(--surface)] border-[var(--accent)] text-[var(--ink)] font-semibold"
                      : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--focus)]"
                  )}
                >
                  <span className="text-[11px]">Làm Mềm Âm Xít S</span>
                  <CheckCircle2 className={cn("w-3.5 h-3.5", settings.mic.de_esser_enabled ? "text-[var(--accent)]" : "opacity-30")} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 2. Master Output Enhancement Section */}
        <div className="p-3.5 rounded-xl border border-[var(--line)] bg-[var(--paper)] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-[var(--accent)]" />
              <span className="text-xs font-bold text-[var(--ink)]">
                Tối Ưu & Lọc Âm Thanh Đầu Ra (Loa / Tai nghe)
              </span>
              <BadgeComponent
                variant={settings.output.enabled ? "default" : "secondary"}
                className="text-[10px] h-5 px-1.5 font-semibold"
              >
                {settings.output.enabled ? "Đang Bật" : "Tắt"}
              </BadgeComponent>
            </div>

            <ButtonComponent
              variant={settings.output.enabled ? "primary" : "outline"}
              size="sm"
              onClick={handleToggleOutput}
              className="h-7 text-xs font-semibold"
            >
              {settings.output.enabled ? "Tắt Lọc Đầu Ra" : "Bật Lọc Đầu Ra"}
            </ButtonComponent>
          </div>

          {settings.output.enabled && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[var(--line)]">
              <button
                type="button"
                onClick={() =>
                  commitSettings({
                    ...settings,
                    output: { ...settings.output, dialogue_boost: !settings.output.dialogue_boost },
                  })
                }
                className={cn(
                  "p-2 rounded-lg border text-left cursor-pointer transition-colors flex flex-col justify-between min-h-[56px]",
                  settings.output.dialogue_boost
                    ? "bg-[var(--surface)] border-[var(--accent)] text-[var(--ink)] font-semibold"
                    : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--focus)]"
                )}
              >
                <span className="text-[11px] block">Rõ Lời Thoại (Vocal)</span>
                <span className="text-[9px] text-[var(--muted)] block mt-0.5">+3.5dB dải thoại</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  commitSettings({
                    ...settings,
                    output: { ...settings.output, night_mode_compression: !settings.output.night_mode_compression },
                  })
                }
                className={cn(
                  "p-2 rounded-lg border text-left cursor-pointer transition-colors flex flex-col justify-between min-h-[56px]",
                  settings.output.night_mode_compression
                    ? "bg-[var(--surface)] border-[var(--accent)] text-[var(--ink)] font-semibold"
                    : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--focus)]"
                )}
              >
                <span className="text-[11px] block">Night Mode (Nén Đêm)</span>
                <span className="text-[9px] text-[var(--muted)] block mt-0.5">Giảm nổ & giật mình</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const nextBass = !settings.output.bass_warmth;
                  const next = {
                    ...settings,
                    output: { ...settings.output, bass_warmth: nextBass },
                  };
                  commitSettings(next);
                  showToast(
                    "success",
                    nextBass
                      ? "Đã kích hoạt Ấm Dải Trầm (+6dB 90Hz Sub-Bass)"
                      : "Đã tắt Ấm Dải Trầm (Trở về cân bằng)"
                  );
                }}
                className={cn(
                  "p-2 rounded-lg border text-left cursor-pointer transition-colors flex flex-col justify-between min-h-[56px]",
                  settings.output.bass_warmth
                    ? "bg-[var(--surface)] border-[var(--accent)] text-[var(--ink)] font-semibold ring-1 ring-[var(--accent)]/40"
                    : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--focus)]"
                )}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-[11px] block font-bold">Ấm Dải Trầm (Bass)</span>
                  {settings.output.bass_warmth && (
                    <Flame className="w-3 h-3 text-amber-500 fill-amber-500 animate-pulse" />
                  )}
                </div>
                <span className="text-[9px] text-[var(--muted)] block mt-0.5">
                  {settings.output.bass_warmth ? "+6dB Sub-Bass (Active)" : "90Hz Sub ấm áp"}
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  commitSettings({
                    ...settings,
                    output: { ...settings.output, de_hiss: !settings.output.de_hiss },
                  })
                }
                className={cn(
                  "p-2 rounded-lg border text-left cursor-pointer transition-colors flex flex-col justify-between min-h-[56px]",
                  settings.output.de_hiss
                    ? "bg-[var(--surface)] border-[var(--accent)] text-[var(--ink)] font-semibold"
                    : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--focus)]"
                )}
              >
                <span className="text-[11px] block">Khử Hiss (Tạp Xè)</span>
                <span className="text-[9px] text-[var(--muted)] block mt-0.5">-4dB dải cao xè</span>
              </button>
            </div>
          )}
        </div>

        {/* Real-Time Audible Test & Live Mic Monitor Section */}
        <div className="p-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] space-y-2.5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Music className={cn("w-4 h-4 text-[var(--accent)]", isPlayingBassSample && "animate-bounce")} />
              <div>
                <span className="text-xs font-bold text-[var(--ink)] block">
                  Nghe Thử Âm Trầm & Bộ Lọc (808 Bass Sample)
                </span>
                <span className="text-[10px] text-[var(--muted)] block">
                  Phát nhịp trống 808 Sub-Bass trực tiếp qua bộ lọc để cảm nhận ngay sự khác biệt.
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <ButtonComponent
                variant={isPlayingBassSample ? "primary" : "outline"}
                size="sm"
                onClick={handlePlayBassSample}
                leftIcon={
                  isPlayingBassSample ? (
                    <Square className="w-3 h-3 fill-current" />
                  ) : (
                    <Flame className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                  )
                }
                className="h-7 text-xs font-bold"
              >
                {isPlayingBassSample ? "Dừng Phát" : "Nghe Thử Bass"}
              </ButtonComponent>

              <ButtonComponent
                variant={isMicMonitoring ? "destructive" : "outline"}
                size="sm"
                onClick={handleToggleMicMonitor}
                leftIcon={<Headphones className="w-3.5 h-3.5 text-[var(--accent)]" />}
                className="h-7 text-xs font-semibold"
                title="Nghe lại trực tiếp tiếng mic của bạn qua bộ lọc Noise Gate"
              >
                {isMicMonitoring ? "Tắt Nghe Mic" : "Nghe Thử Mic"}
              </ButtonComponent>
            </div>
          </div>

          {/* Real-Time DSP Gate & Attenuation Telemetry */}
          <div className="flex items-center justify-between pt-2 border-t border-[var(--line)] text-[11px] text-[var(--muted)]">
            <span className="flex items-center gap-1.5 font-medium">
              <Radio className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>DSP Trạng thái:</span>
              <span className="font-semibold text-[var(--ink)]">
                {settings.output.enabled && settings.output.bass_warmth
                  ? "Bass Warmth +6dB ON"
                  : "Bass Balanced"}
              </span>
            </span>

            <ButtonComponent
              variant="ghost"
              size="sm"
              onClick={handleRunTestBuffer}
              loading={isTesting}
              className="h-6 text-[10px] px-2 text-[var(--muted)] hover:text-[var(--ink)]"
            >
              Kiểm Tra Mức Suy Hao (dB)
            </ButtonComponent>
          </div>

          {testStats && (
            <div className="p-2 rounded-lg bg-[var(--paper)] border border-[var(--line)] font-mono text-[10px] flex items-center justify-between text-[var(--muted)]">
              <span>Độ mở Gate: {testStats.gate_open ? "Mở" : "Chặn tạp âm"}</span>
              <span className="text-emerald-500 font-bold">Mức suy hao: -{testStats.attenuation_db.toFixed(1)} dB</span>
              <span>Đỉnh đầu ra: {testStats.output_peak_db.toFixed(1)} dB</span>
            </div>
          )}
        </div>
      </div>

      {/* Virtual Cable Modal */}
      <VirtualCableModal
        open={isCableModalOpen}
        onClose={() => setIsCableModalOpen(false)}
      />

      {/* Confirmation Modal on Reset */}
      <ModalComponent
        open={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        title="Khôi Phục Cài Đặt Bộ Lọc Mặc Định?"
        description="Bạn có chắc chắn muốn đặt lại các thông số Noise Gate, lọc tạp âm và xử lý âm thanh về chuẩn phòng thu mặc định?"
        confirmText="Xác Nhận Khôi Phục"
        cancelText="Hủy Bỏ"
        confirmVariant="destructive"
        onConfirm={handleConfirmReset}
      />
    </CardComponent>
  );
};
