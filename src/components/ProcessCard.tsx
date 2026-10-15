import { useState, type FC } from "react";
import { Volume2, VolumeX, ChevronDown, Sliders, ArrowUpRight, EyeOff } from "lucide-react";
import {
  ButtonComponent,
  CardComponent,
  SliderComponent,
  AvatarComponent,
  EqualizerComponent,
  BadgeComponent,
  SelectComponent,
} from "@/shared/ui";
import { displayName } from "@/audio";
import type { AudioProcess } from "@/audio";
import type { AudioDevice } from "@/components/DeviceQuickBar";
import { useLiveAudioMeters } from "@/shared/lib/useLiveAudioMeters";
import { cn } from "@/lib/utils";

interface ProcessCardProps {
  process: AudioProcess;
  initialVolume: number;
  isMuted: boolean;
  devices?: AudioDevice[];
  targetDeviceUid?: string | null;
  onVolumeCommit: (volume: number) => Promise<void>;
  onMuteToggle: (muted: boolean) => Promise<void>;
  onRouteChange?: (deviceUid: string) => void;
  onHide?: () => void;
  onError: (msg: string) => void;
}

export const ProcessCard: FC<ProcessCardProps> = ({
  process,
  initialVolume,
  isMuted,
  devices = [],
  targetDeviceUid,
  onVolumeCommit,
  onMuteToggle,
  onRouteChange,
  onHide,
  onError,
}) => {
  const [isCommitting, setIsCommitting] = useState(false);
  const [isTogglingMute, setIsTogglingMute] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEQEnabled, setIsEQEnabled] = useState(true);

  const liveMeters = useLiveAudioMeters(process.is_running_output && !isMuted);
  const channelLvl = isMuted ? 0 : Math.round(liveMeters.levelL * (initialVolume / 100));

  const name = displayName(process);
  const detail = process.bundle_id || `PID ${process.pid} · No identifier`;
  const isDisabled = !process.bundle_id || isCommitting;

  const handleVolumeCommit = async (val: number) => {
    setIsCommitting(true);
    try {
      await onVolumeCommit(val);
    } catch {
      onError(`Couldn't update ${name}'s volume. Please try again.`);
    } finally {
      setIsCommitting(false);
    }
  };

  const handleMuteClick = async () => {
    setIsTogglingMute(true);
    try {
      await onMuteToggle(!isMuted);
    } catch {
      onError(`Couldn't update ${name}'s mute state. Please try again.`);
    } finally {
      setIsTogglingMute(false);
    }
  };

  const deviceOptions = [
    { label: "Follow System Default", value: "" },
    ...devices.map((d) => ({
      label: `${d.name}${d.is_default ? " (Default)" : ""}`,
      value: d.uid,
    })),
  ];

  return (
    <CardComponent
      variant={isMuted ? "muted" : "default"}
      padding="sm"
      className={cn(
        "transition-all duration-150 border border-white/8 hover:border-white/16 hover:shadow-[0_4px_16px_rgba(0,0,0,0.3)] bg-gradient-to-r from-[#141b24] to-[#10141c]",
        isExpanded && "border-sky-500/30 ring-1 ring-sky-500/20"
      )}
    >
      {/* Primary Channel Strip Row */}
      <div className="flex items-center gap-3 p-1.5">
        {/* App Avatar & Identity */}
        <div className="flex items-center gap-2.5 min-w-[130px] sm:min-w-[170px] max-w-[200px]">
          <AvatarComponent name={name} size="sm" shape="squircle" />

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h4
                className={cn(
                  "text-xs font-semibold tracking-tight text-slate-100 truncate m-0",
                  isMuted && "opacity-80 line-through"
                )}
                title={name}
              >
                {name}
              </h4>
            </div>
            <p className="text-[10px] text-slate-400 truncate mt-0.5 m-0 font-mono">
              {detail}
            </p>
          </div>
        </div>

        {/* Live Audio Activity Badge */}
        <div className="hidden sm:flex items-center w-20 shrink-0">
          {process.is_running_output ? (
            <BadgeComponent variant="playing" className="gap-1.5 text-[9px] px-1.5 py-0.5">
              <EqualizerComponent bars={3} active={true} />
              <span>Playing</span>
            </BadgeComponent>
          ) : (
            <span className="text-[10px] text-slate-500 pl-1">Silent</span>
          )}
        </div>

        {/* Volume Slider */}
        <div className="flex-1 min-w-0 px-1">
          <SliderComponent
            value={initialVolume}
            disabled={isDisabled}
            onCommit={handleVolumeCommit}
            aria-label={`${name} volume`}
            className={cn(isMuted && "opacity-40")}
          />
        </div>

        {/* Dynamic Channel Output Level Meter */}
        <div
          className="w-8 sm:w-10 h-2 bg-slate-900 border border-white/6 rounded-sm overflow-hidden flex shrink-0"
          title={`${name} live output meter`}
        >
          <div
            className={cn(
              "h-full rounded-sm transition-all duration-75",
              process.is_running_output && !isMuted
                ? channelLvl > 75
                  ? "bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-500"
                  : "bg-gradient-to-r from-emerald-500 to-sky-400"
                : "bg-slate-800"
            )}
            style={{ width: `${channelLvl}%` }}
          />
        </div>

        {/* Action Controls: Mute & Expand */}
        <div className="flex items-center gap-1 shrink-0">
          <ButtonComponent
            variant={isMuted ? "destructive" : "outline"}
            size="icon"
            onClick={handleMuteClick}
            disabled={isDisabled || isTogglingMute}
            aria-pressed={isMuted}
            aria-label={`${isMuted ? "Unmute" : "Mute"} ${name}`}
            title={isMuted ? "Unmute" : "Mute"}
            className="h-7 w-7"
            leftIcon={
              isMuted ? (
                <VolumeX className="w-3.5 h-3.5 text-rose-400" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 text-slate-300" />
              )
            }
          />

          <button
            onClick={() => setIsExpanded((prev) => !prev)}
            className={cn(
              "h-7 w-7 rounded-lg border flex items-center justify-center transition-all cursor-pointer",
              isExpanded
                ? "bg-sky-500/15 border-sky-400/40 text-sky-400"
                : "bg-slate-900 border-white/8 text-slate-400 hover:text-white hover:border-white/20"
            )}
            title={isExpanded ? "Collapse channel rack" : "Expand channel rack"}
            aria-expanded={isExpanded}
          >
            <ChevronDown
              className={cn(
                "w-3.5 h-3.5 transition-transform duration-200",
                isExpanded && "rotate-180"
              )}
            />
          </button>
        </div>
      </div>

      {/* Expandable Channel Rack Details */}
      {isExpanded && (
        <div className="mt-2 pt-2.5 pb-1 px-2 border-t border-white/6 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs animate-in slide-in-from-top-1 duration-150">
          {/* Route to Device */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <ArrowUpRight className="w-3 h-3 text-sky-400" />
              Route Stream To
            </span>
            <SelectComponent
              value={targetDeviceUid || ""}
              onChange={(uid) => onRouteChange?.(uid)}
              options={deviceOptions}
              disabled={isDisabled}
              className="h-7 text-xs bg-slate-950/90"
            />
          </div>

          {/* Individual Channel EQ Toggle */}
          <div className="flex flex-col gap-1 justify-between">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Sliders className="w-3 h-3 text-amber-400" />
              DSP Parametric EQ
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsEQEnabled((prev) => !prev)}
                className={cn(
                  "px-2.5 py-1 text-[11px] font-semibold rounded-md border transition-all cursor-pointer",
                  isEQEnabled
                    ? "bg-amber-500/15 border-amber-500/30 text-amber-300"
                    : "bg-slate-900 border-white/10 text-slate-400"
                )}
              >
                {isEQEnabled ? "10-Band EQ Active" : "EQ Bypassed"}
              </button>
              <span className="text-[10px] text-slate-500">48kHz stereo processing</span>
            </div>
          </div>

          {/* Hide Channel Action */}
          {onHide && (
            <div className="sm:col-span-2 flex items-center justify-between pt-1 border-t border-white/6">
              <span className="text-[10px] text-slate-500">
                Hide this application from active mixer channel strips
              </span>
              <button
                type="button"
                onClick={onHide}
                className="text-[10px] text-slate-400 hover:text-rose-400 flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-white/6 hover:border-rose-500/30 hover:bg-rose-500/10 transition-all cursor-pointer"
                title="Hide this channel from mixer"
              >
                <EyeOff className="w-3 h-3 text-rose-400" />
                Hide Channel
              </button>
            </div>
          )}
        </div>
      )}
    </CardComponent>
  );
};
