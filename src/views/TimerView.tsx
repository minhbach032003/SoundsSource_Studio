import { useState, useEffect, useMemo, type FC, type FormEvent } from "react";
import {
  ButtonComponent,
  BadgeComponent,
  InputComponent,
  ModalComponent,
} from "@/shared/ui";
import { GoogleIcon } from "@/components/icons/GoogleIcon";
import type { GoogleUser } from "@/components/navigation/SideNavbar";
import type { GoogleCalendarEvent } from "@/shared/lib/useGoogleCalendar";
import {
  Play,
  Square,
  SkipForward,
  Clock,
  Circle,
  Trash2,
  Plus,
  Minus,
  VolumeX,
  AlertTriangle,
  Flame,
  Check,
  Headphones,
  SlidersHorizontal,
  Edit3,
  Target,
  ArrowRight,
  Calendar,
  RefreshCw,
  Video,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type TimerPhase = "idle" | "studying" | "warning" | "breaking";

export interface TodoItem {
  id: string;
  title: string;
  is_completed: boolean;
  start_time?: string;
  end_time?: string;
  duration_minutes?: number;
  source?: "manual" | "google-calendar";
  hangout_link?: string;
}

export interface TimerStatus {
  phase: TimerPhase;
  remaining_seconds: number;
  study_duration: number;
  break_duration: number;
  completed_sessions: number;
  is_ducked: boolean;
}

interface TimerViewProps {
  status: TimerStatus;
  todos: TodoItem[];
  user: GoogleUser | null;
  calendarEvents: GoogleCalendarEvent[];
  isLoadingCalendar: boolean;
  onStart: () => void;
  onStop: () => void;
  onSkip: () => void;
  onSnooze: () => void;
  onSetDurations: (studySec: number, breakSec: number) => void;
  onAddTodo: (
    title: string,
    startTime?: string,
    endTime?: string,
    durationMinutes?: number
  ) => void;
  onToggleTodo: (id: string) => void;
  onDeleteTodo: (id: string) => void;
  onSyncCalendar: () => void;
  onSignInGoogle: () => void;
  onToggleCalendarEvent: (id: string) => void;
  onDeleteCalendarEvent: (id: string) => void;
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatClockTime(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function addMinutesToTime(timeStr: string, minutes: number): string {
  const [h, m] = timeStr.split(":").map(Number);
  const totalM = (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m) + minutes;
  const newH = Math.floor((totalM % 1440) / 60);
  const newM = totalM % 60;
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
}

function diffMinutesBetween(startTimeStr: string, endTimeStr: string): number {
  const [h1, m1] = startTimeStr.split(":").map(Number);
  const [h2, m2] = endTimeStr.split(":").map(Number);
  if (isNaN(h1) || isNaN(m1) || isNaN(h2) || isNaN(m2)) return 25;
  let diff = h2 * 60 + m2 - (h1 * 60 + m1);
  if (diff < 0) diff += 1440; // crosses midnight
  return Math.max(1, Math.min(180, diff));
}

const PRESETS = [
  { label: "25m Pomodoro", study: 25 * 60, breakDur: 5 * 60 },
  { label: "20m Eye Rest", study: 20 * 60, breakDur: 20 },
  { label: "50m Deep Work", study: 50 * 60, breakDur: 10 * 60 },
];

export const TimerView: FC<TimerViewProps> = ({
  status,
  todos,
  user,
  calendarEvents,
  isLoadingCalendar,
  onStart,
  onStop,
  onSkip,
  onSnooze,
  onSetDurations,
  onAddTodo,
  onToggleTodo,
  onDeleteTodo,
  onSyncCalendar,
  onSignInGoogle,
  onToggleCalendarEvent,
  onDeleteCalendarEvent,
}) => {
  // Task input state
  const [newTodoTitle, setNewTodoTitle] = useState("");
  const [showTimeboxOptions, setShowTimeboxOptions] = useState(false);
  const [newStartTime, setNewStartTime] = useState(() => formatClockTime(new Date()));
  const [newEndTime, setNewEndTime] = useState(() =>
    addMinutesToTime(formatClockTime(new Date()), 25)
  );

  // Active Task for session
  const [activeGoalId, setActiveGoalId] = useState<string | null>(null);

  // Filter tabs: "all" | "calendar" | "tasks"
  const [activeFilter, setActiveFilter] = useState<"all" | "calendar" | "tasks">("all");

  // Modals state
  const [isStopModalOpen, setIsStopModalOpen] = useState(false);
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);

  // Custom modal state
  const [modalStudyMinutes, setModalStudyMinutes] = useState(
    Math.round(status.study_duration / 60)
  );
  const [modalBreakVal, setModalBreakVal] = useState(
    status.break_duration >= 60
      ? Math.round(status.break_duration / 60)
      : status.break_duration
  );
  const [breakUnit, setBreakUnit] = useState<"min" | "sec">(
    status.break_duration >= 60 ? "min" : "sec"
  );
  const [modalStartTime, setModalStartTime] = useState(() =>
    formatClockTime(new Date())
  );
  const [modalEndTime, setModalEndTime] = useState(() =>
    addMinutesToTime(formatClockTime(new Date()), Math.round(status.study_duration / 60))
  );
  const [customError, setCustomError] = useState<string | null>(null);

  // Wall-clock current time for ticker display
  const [currentTime, setCurrentTime] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 5000);
    return () => clearInterval(timer);
  }, []);

  // Sync modal when opened
  useEffect(() => {
    if (isCustomModalOpen) {
      const nowStr = formatClockTime(new Date());
      const studyM = Math.round(status.study_duration / 60);
      setModalStudyMinutes(studyM);
      setModalStartTime(nowStr);
      setModalEndTime(addMinutesToTime(nowStr, studyM));

      if (status.break_duration >= 60) {
        setModalBreakVal(Math.round(status.break_duration / 60));
        setBreakUnit("min");
      } else {
        setModalBreakVal(status.break_duration);
        setBreakUnit("sec");
      }
      setCustomError(null);
    }
  }, [isCustomModalOpen, status.study_duration, status.break_duration]);

  const isIdle = status.phase === "idle";
  const isStudying = status.phase === "studying";
  const isWarning = status.phase === "warning";
  const isBreaking = status.phase === "breaking";

  // Combine unified schedule items
  const unifiedItems = useMemo(() => {
    const calendarItems: TodoItem[] = calendarEvents.map((ev) => ({
      id: ev.id,
      title: ev.summary,
      is_completed: ev.is_completed,
      start_time: ev.start_time,
      end_time: ev.end_time,
      duration_minutes: ev.duration_minutes,
      source: "google-calendar",
      hangout_link: ev.hangout_link,
    }));

    const taskItems: TodoItem[] = todos.map((t) => ({
      ...t,
      source: "manual",
    }));

    if (activeFilter === "calendar") {
      return calendarItems;
    }
    if (activeFilter === "tasks") {
      return taskItems;
    }
    return [...calendarItems, ...taskItems];
  }, [calendarEvents, todos, activeFilter]);

  // Find active goal
  const activeGoal = useMemo(() => {
    if (!activeGoalId) return null;
    return unifiedItems.find((it) => it.id === activeGoalId) || null;
  }, [activeGoalId, unifiedItems]);

  // Real-world expected end time calculation
  const sessionSecondsLeft = isIdle ? status.study_duration : status.remaining_seconds;
  const expectedEndDate = new Date(currentTime.getTime() + sessionSecondsLeft * 1000);
  const expectedEndClockStr = formatClockTime(expectedEndDate);
  const nowClockStr = formatClockTime(currentTime);

  // Circular progress calculation
  const totalDuration = isBreaking
    ? status.break_duration
    : isWarning
    ? 10
    : status.study_duration;

  const currentSeconds = isIdle ? status.study_duration : status.remaining_seconds;
  const progressRatio =
    totalDuration > 0
      ? Math.max(0, Math.min(1, (totalDuration - status.remaining_seconds) / totalDuration))
      : 0;

  const radius = 94;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = isIdle ? 0 : circumference * (1 - progressRatio);

  const matchedPreset = PRESETS.find(
    (p) => status.study_duration === p.study && status.break_duration === p.breakDur
  );
  const isCustomPreset = !matchedPreset;

  const handleAddTodo = (e?: FormEvent) => {
    e?.preventDefault();
    if (!newTodoTitle.trim()) return;

    if (showTimeboxOptions) {
      const durationM = diffMinutesBetween(newStartTime, newEndTime);
      onAddTodo(newTodoTitle.trim(), newStartTime, newEndTime, durationM);
    } else {
      onAddTodo(newTodoTitle.trim());
    }

    setNewTodoTitle("");
    setShowTimeboxOptions(false);
  };

  const handleFocusGoal = (item: TodoItem) => {
    setActiveGoalId(item.id);
    if (isIdle && item.duration_minutes) {
      onSetDurations(item.duration_minutes * 60, status.break_duration);
    }
  };

  const handleConfirmStop = () => {
    setIsStopModalOpen(false);
    onStop();
  };

  // Inline steppers
  const handleStepStudy = (deltaMin: number) => {
    if (!isIdle) return;
    const currentMin = Math.round(status.study_duration / 60);
    const newMin = Math.max(1, Math.min(180, currentMin + deltaMin));
    onSetDurations(newMin * 60, status.break_duration);
  };

  const handleStepBreak = (deltaUnit: number) => {
    if (!isIdle) return;
    if (status.break_duration < 60) {
      const newSec = Math.max(10, Math.min(59, status.break_duration + deltaUnit * 10));
      onSetDurations(status.study_duration, newSec);
    } else {
      const currentMin = Math.round(status.break_duration / 60);
      const newMin = Math.max(1, Math.min(60, currentMin + deltaUnit));
      onSetDurations(status.study_duration, newMin * 60);
    }
  };

  // Custom modal handlers with bidirectional time sync
  const handleModalDurationChange = (minutes: number) => {
    setModalStudyMinutes(minutes);
    setModalEndTime(addMinutesToTime(modalStartTime, minutes));
    setCustomError(null);
  };

  const handleModalEndTimeChange = (endStr: string) => {
    setModalEndTime(endStr);
    const diff = diffMinutesBetween(modalStartTime, endStr);
    setModalStudyMinutes(diff);
    setCustomError(null);
  };

  const handleModalStartTimeChange = (startStr: string) => {
    setModalStartTime(startStr);
    setModalEndTime(addMinutesToTime(startStr, modalStudyMinutes));
    setCustomError(null);
  };

  const handleSaveCustomDurations = () => {
    if (modalStudyMinutes < 1 || modalStudyMinutes > 180) {
      setCustomError("Focus duration must be between 1 and 180 minutes.");
      return;
    }

    const calculatedBreakSec =
      breakUnit === "min" ? modalBreakVal * 60 : modalBreakVal;

    if (calculatedBreakSec < 10 || calculatedBreakSec > 3600) {
      setCustomError("Break duration must be between 10 seconds and 60 minutes.");
      return;
    }

    onSetDurations(modalStudyMinutes * 60, calculatedBreakSec);
    setIsCustomModalOpen(false);
  };

  const completedCount = unifiedItems.filter((t) => t.is_completed).length;

  return (
    <div className="w-full h-full flex flex-col space-y-4 select-none min-h-0 flex-1">
      {/* 1. Top Bar: Preset Selector with Custom Setup & Stats */}
      <div className="flex items-center justify-between flex-wrap gap-2.5 shrink-0">
        <div className="inline-flex p-1 gap-1 rounded-xl bg-slate-950/80 border border-white/8 backdrop-blur-md">
          {PRESETS.map((p) => {
            const isSelected =
              status.study_duration === p.study && status.break_duration === p.breakDur;

            return (
              <button
                key={p.label}
                disabled={!isIdle}
                onClick={() => onSetDurations(p.study, p.breakDur)}
                className={cn(
                  "px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap",
                  isSelected
                    ? "bg-sky-500/20 text-sky-300 font-semibold border border-sky-400/35 shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent",
                  !isIdle && "opacity-50 cursor-not-allowed"
                )}
              >
                {p.label}
              </button>
            );
          })}

          {/* Custom Duration Button / Pill */}
          <button
            disabled={!isIdle}
            onClick={() => setIsCustomModalOpen(true)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5",
              isCustomPreset
                ? "bg-sky-500/20 text-sky-300 font-semibold border border-sky-400/35 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent",
              !isIdle && "opacity-50 cursor-not-allowed"
            )}
            title="Setup custom study and break intervals with clock timeline"
          >
            <SlidersHorizontal className="w-3 h-3 text-sky-400" />
            <span>
              {isCustomPreset
                ? `Custom (${Math.round(status.study_duration / 60)}m / ${
                    status.break_duration >= 60
                      ? `${Math.round(status.break_duration / 60)}m`
                      : `${status.break_duration}s`
                  })`
                : "Custom Setup…"}
            </span>
          </button>
        </div>

        <BadgeComponent variant="secondary" className="gap-1.5 select-none h-7 px-3">
          <Flame className="w-3.5 h-3.5 text-amber-400" />
          <span>Sessions Completed Today: {status.completed_sessions}</span>
        </BadgeComponent>
      </div>

      {/* 2. Fluid 2-Column Grid Filling 100% Width and Height */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-0 items-stretch">
        {/* Left Column (lg:col-span-7): Circular Dial Canvas & Controls */}
        <div className="lg:col-span-7 flex flex-col items-center justify-center p-6 sm:p-8 rounded-2xl bg-gradient-to-b from-[#141a24] to-[#10141c] border border-white/8 shadow-[0_8px_32px_rgba(0,0,0,0.35)] relative overflow-hidden h-full min-h-[460px]">
          {/* Audio Ducking Pill Indicator */}
          {status.is_ducked && (
            <div className="absolute top-4 flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[11px] font-semibold tracking-wide animate-pulse">
              <VolumeX className="w-3.5 h-3.5" />
              <span>CoreAudio Streams Ducked (15%) for Rest</span>
            </div>
          )}

          {/* Circular Dial Gauge */}
          <div className="relative w-64 h-64 sm:w-72 sm:h-72 lg:w-80 lg:h-80 flex items-center justify-center my-auto py-2">
            <svg
              className="w-full h-full transform -rotate-90 drop-shadow-md"
              viewBox="0 0 220 220"
            >
              <defs>
                <linearGradient id="studyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#38bdf8" />
                  <stop offset="100%" stopColor="#0284c7" />
                </linearGradient>
                <linearGradient id="breakGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#fb7185" />
                  <stop offset="100%" stopColor="#e11d48" />
                </linearGradient>
                <linearGradient id="warnGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#fbbf24" />
                  <stop offset="100%" stopColor="#f59e0b" />
                </linearGradient>
                <filter id="dialGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3.5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Background Track Ring */}
              <circle
                cx="110"
                cy="110"
                r={radius}
                fill="none"
                stroke="rgba(255, 255, 255, 0.05)"
                strokeWidth="7"
              />

              {/* Foreground Progress Ring */}
              <circle
                cx="110"
                cy="110"
                r={radius}
                fill="none"
                stroke={
                  isBreaking
                    ? "url(#breakGrad)"
                    : isWarning
                    ? "url(#warnGrad)"
                    : isStudying
                    ? "url(#studyGrad)"
                    : "rgba(56, 189, 248, 0.25)"
                }
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                filter={!isIdle ? "url(#dialGlow)" : undefined}
                className="transition-[stroke-dashoffset] duration-300 ease-out"
              />
            </svg>

            {/* Center Countdown, Active Task Banner & Real-Time Schedule */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
              {/* Active Task / Calendar Goal Banner */}
              {activeGoal ? (
                <div
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-500/20 border border-sky-400/40 text-sky-200 text-[11px] font-semibold mb-1 max-w-[220px] truncate shadow-sm"
                  title={`Active Goal: ${activeGoal.title}`}
                >
                  {activeGoal.source === "google-calendar" ? (
                    <GoogleIcon className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <Target className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  )}
                  <span className="truncate">{activeGoal.title}</span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-white/4 border border-white/8 text-[11px] font-semibold uppercase tracking-wider mb-1">
                  <span
                    className={cn(
                      "w-2 h-2 rounded-full",
                      isBreaking
                        ? "bg-rose-400 shadow-[0_0_6px_#fb7185] animate-ping"
                        : isWarning
                        ? "bg-amber-400 shadow-[0_0_6px_#fbbf24] animate-pulse"
                        : isStudying
                        ? "bg-emerald-400 shadow-[0_0_6px_#10b981] animate-pulse"
                        : "bg-slate-500"
                    )}
                  />
                  <span
                    className={cn(
                      isBreaking
                        ? "text-rose-300"
                        : isWarning
                        ? "text-amber-300"
                        : isStudying
                        ? "text-emerald-300"
                        : "text-slate-400"
                    )}
                  >
                    {isBreaking
                      ? "Resting Eyes"
                      : isWarning
                      ? "Break in ~10s"
                      : isStudying
                      ? "Focusing"
                      : "Ready"}
                  </span>
                </div>
              )}

              {/* Countdown Numbers */}
              <span className="text-5xl sm:text-6xl lg:text-7xl font-bold font-mono tracking-tight text-white tabular-nums drop-shadow-sm my-0.5">
                {formatCountdown(currentSeconds)}
              </span>

              {/* Real Wall-Clock Timeline (từ mấy giờ đến mấy giờ) */}
              <div className="text-[11px] font-medium tracking-tight mt-1 flex items-center gap-1.5 text-slate-300 bg-black/40 px-3 py-1 rounded-full border border-white/8">
                <Clock className="w-3 h-3 text-sky-400 shrink-0" />
                <span>
                  {isBreaking
                    ? `Break Ends at ${expectedEndClockStr}`
                    : isStudying
                    ? `Ends at ${expectedEndClockStr}`
                    : `${nowClockStr} → ${expectedEndClockStr}`}
                </span>
              </div>
            </div>
          </div>

          {/* Primary & Secondary Action Controls */}
          <div className="flex items-center justify-center gap-3 mt-4 shrink-0">
            {isIdle ? (
              <button
                onClick={onStart}
                className="h-11 px-8 rounded-xl bg-gradient-to-r from-sky-400 to-sky-500 hover:from-sky-300 hover:to-sky-400 text-slate-950 font-bold text-xs tracking-tight shadow-[0_2px_18px_rgba(56,189,248,0.35)] transition-all cursor-pointer active:scale-95 flex items-center gap-2"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>
                  {activeGoal
                    ? `Start: "${activeGoal.title.slice(0, 18)}…"`
                    : "Start Focus Session"}
                </span>
              </button>
            ) : (
              <>
                <button
                  onClick={() => setIsStopModalOpen(true)}
                  className="h-10 px-5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 font-semibold text-xs transition-all cursor-pointer active:scale-95 flex items-center gap-2 shadow-sm"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Stop Session</span>
                </button>

                {(isBreaking || isWarning) && (
                  <ButtonComponent
                    variant="outline"
                    size="md"
                    onClick={onSkip}
                    leftIcon={<SkipForward className="w-4 h-4" />}
                    className="h-10 px-5"
                  >
                    Skip Break
                  </ButtonComponent>
                )}

                {isWarning && (
                  <ButtonComponent
                    variant="secondary"
                    size="md"
                    onClick={onSnooze}
                    leftIcon={<Clock className="w-4 h-4 text-amber-400" />}
                    className="h-10 px-5"
                  >
                    Snooze (+5m)
                  </ButtonComponent>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right Column (lg:col-span-5): Tasks Checklist & Interactive Session Configuration */}
        <div className="lg:col-span-5 flex flex-col gap-4 h-full min-h-0">
          {/* 3. Focus Tasks & Google Calendar Card */}
          <div className="flex-1 flex flex-col rounded-2xl bg-[#141a24] border border-white/8 p-4 sm:p-5 shadow-sm min-h-[260px]">
            {/* Task Header with Google Calendar Sync & Filter Tabs */}
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/5 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-200 tracking-tight">
                  Focus Schedule
                </span>
                <BadgeComponent variant="secondary" className="px-2 py-0 text-[10px]">
                  {completedCount}/{unifiedItems.length} Done
                </BadgeComponent>
              </div>

              {/* Google Calendar Sync Action / Status */}
              <div className="flex items-center gap-2">
                {user ? (
                  <button
                    type="button"
                    onClick={onSyncCalendar}
                    disabled={isLoadingCalendar}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/30 text-sky-300 text-[11px] font-semibold cursor-pointer transition-colors"
                    title="Sync events from Google Calendar"
                  >
                    <GoogleIcon className="w-3 h-3" />
                    <RefreshCw
                      className={cn("w-3 h-3", isLoadingCalendar && "animate-spin")}
                    />
                    <span>{isLoadingCalendar ? "Syncing…" : "Sync Calendar"}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onSignInGoogle}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-[11px] border border-white/8 cursor-pointer transition-colors"
                    title="Sign in with Google to sync calendar"
                  >
                    <GoogleIcon className="w-3 h-3" />
                    <span>Connect Calendar</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowTimeboxOptions((prev) => !prev)}
                  className={cn(
                    "text-[11px] flex items-center gap-1 cursor-pointer transition-colors px-2 py-0.5 rounded-md",
                    showTimeboxOptions
                      ? "text-sky-300 bg-sky-500/20"
                      : "text-slate-400 hover:text-slate-200"
                  )}
                  title="Toggle manual time schedule"
                >
                  <Calendar className="w-3 h-3 text-sky-400" />
                  <span>{showTimeboxOptions ? "Hide" : "+ Timebox"}</span>
                </button>
              </div>
            </div>

            {/* Filter Tabs: All / Calendar / Tasks */}
            <div className="flex items-center gap-1.5 mb-3 shrink-0">
              <button
                type="button"
                onClick={() => setActiveFilter("all")}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer",
                  activeFilter === "all"
                    ? "bg-slate-800 text-sky-300 font-semibold"
                    : "text-slate-400 hover:text-white"
                )}
              >
                All ({calendarEvents.length + todos.length})
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter("calendar")}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer flex items-center gap-1",
                  activeFilter === "calendar"
                    ? "bg-sky-500/20 text-sky-300 font-semibold border border-sky-400/30"
                    : "text-slate-400 hover:text-white"
                )}
              >
                <GoogleIcon className="w-2.5 h-2.5" />
                <span>Google Calendar ({calendarEvents.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter("tasks")}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer",
                  activeFilter === "tasks"
                    ? "bg-slate-800 text-sky-300 font-semibold"
                    : "text-slate-400 hover:text-white"
                )}
              >
                Manual Goals ({todos.length})
              </button>
            </div>

            {/* Guest Connection Prompt Banner if not logged in */}
            {!user && (
              <div className="p-3 rounded-xl bg-gradient-to-r from-sky-500/10 via-slate-900/60 to-slate-950/80 border border-sky-400/20 flex items-center justify-between gap-3 mb-3 shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-sky-500/15 border border-sky-400/30 flex items-center justify-center shrink-0">
                    <GoogleIcon className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-100 m-0 truncate">
                      Google Calendar Sync
                    </p>
                    <p className="text-[10px] text-slate-400 m-0 truncate">
                      Connect to view today's meetings and activities automatically
                    </p>
                  </div>
                </div>

                <ButtonComponent
                  variant="outline"
                  size="sm"
                  onClick={onSignInGoogle}
                  leftIcon={<GoogleIcon className="w-3 h-3" />}
                  className="h-7 text-[11px] shrink-0 bg-white hover:bg-slate-100 text-slate-900 border-none font-semibold hover:text-slate-950 px-2.5"
                >
                  Connect
                </ButtonComponent>
              </div>
            )}

            {/* Task Creation Form with Timebox Input */}
            <form onSubmit={handleAddTodo} className="space-y-2 mb-3 shrink-0">
              <div className="flex items-center gap-2">
                <InputComponent
                  placeholder="Add custom milestone or task…"
                  value={newTodoTitle}
                  onChange={(e) => setNewTodoTitle(e.target.value)}
                  fullWidth
                  className="h-8.5 bg-slate-950/70 text-xs"
                />
                <ButtonComponent
                  type="submit"
                  variant="outline"
                  size="sm"
                  disabled={!newTodoTitle.trim()}
                  leftIcon={<Plus className="w-3.5 h-3.5" />}
                  className="h-8.5 shrink-0 px-3.5"
                >
                  Add
                </ButtonComponent>
              </div>

              {/* Timebox Inputs (Start Time -> End Time) */}
              {showTimeboxOptions && (
                <div className="p-2.5 rounded-xl bg-slate-950/70 border border-white/6 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-sky-400" />
                      Time-blocking schedule:
                    </span>
                    <span className="font-mono text-sky-300 font-semibold">
                      {diffMinutesBetween(newStartTime, newEndTime)} minutes
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-slate-500 block mb-0.5">
                        Start Time
                      </span>
                      <input
                        type="time"
                        value={newStartTime}
                        onChange={(e) => setNewStartTime(e.target.value)}
                        className="w-full h-7 bg-slate-900 border border-white/10 rounded-lg px-2 text-xs text-slate-200 font-mono"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block mb-0.5">
                        End Time
                      </span>
                      <input
                        type="time"
                        value={newEndTime}
                        onChange={(e) => setNewEndTime(e.target.value)}
                        className="w-full h-7 bg-slate-900 border border-white/10 rounded-lg px-2 text-xs text-slate-200 font-mono"
                      />
                    </div>
                  </div>

                  {/* Quick duration presets for task */}
                  <div className="flex items-center gap-1.5 pt-1">
                    {[25, 45, 60, 90].map((dur) => (
                      <button
                        type="button"
                        key={dur}
                        onClick={() => {
                          const nowStr = formatClockTime(new Date());
                          setNewStartTime(nowStr);
                          setNewEndTime(addMinutesToTime(nowStr, dur));
                        }}
                        className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-[10px] text-slate-300 border border-white/5 cursor-pointer"
                      >
                        +{dur}m
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </form>

            {/* Schedule List Items (Unified Calendar + Tasks) */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[140px]">
              {unifiedItems.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center p-6 text-center text-xs text-slate-500 italic space-y-2">
                  <Calendar className="w-8 h-8 text-slate-600 stroke-[1.5]" />
                  <span>
                    {activeFilter === "calendar"
                      ? "No Google Calendar events for today."
                      : "No scheduled activities yet. Connect Google Calendar or add a task above."}
                  </span>
                </div>
              ) : (
                unifiedItems.map((item) => {
                  const isActive = activeGoalId === item.id;
                  const isGCal = item.source === "google-calendar";

                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "group flex items-center justify-between p-2.5 rounded-xl border transition-all text-xs",
                        isActive
                          ? "bg-sky-500/10 border-sky-400/40 shadow-sm"
                          : item.is_completed
                          ? "bg-slate-950/30 border-transparent opacity-60"
                          : isGCal
                          ? "bg-slate-950/70 border-sky-500/15 hover:border-sky-500/30"
                          : "bg-slate-950/60 border-white/5 hover:border-white/10"
                      )}
                    >
                      {/* Completion check & Title */}
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (isGCal) {
                              onToggleCalendarEvent(item.id);
                            } else {
                              onToggleTodo(item.id);
                            }
                          }}
                          className={cn(
                            "w-4.5 h-4.5 rounded-full flex items-center justify-center shrink-0 border transition-all cursor-pointer",
                            item.is_completed
                              ? "bg-emerald-500 border-emerald-400 text-slate-950"
                              : "border-slate-500 group-hover:border-sky-400 bg-transparent"
                          )}
                          title="Toggle completion"
                        >
                          {item.is_completed ? (
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                          ) : (
                            <Circle className="w-2.5 h-2.5 opacity-0" />
                          )}
                        </button>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {isGCal && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-sky-500/10 border border-sky-400/25 text-[9px] font-semibold text-sky-300">
                                <GoogleIcon className="w-2.5 h-2.5" />
                                G-Cal
                              </span>
                            )}
                            <p
                              className={cn(
                                "truncate font-medium m-0",
                                item.is_completed
                                  ? "line-through text-slate-500"
                                  : "text-slate-200"
                              )}
                            >
                              {item.title}
                            </p>
                          </div>

                          {/* Timeblock indicator (từ mấy giờ đến mấy giờ) */}
                          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400 font-mono">
                            {(item.start_time || item.duration_minutes) && (
                              <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3 text-sky-400" />
                                <span>
                                  {item.start_time && item.end_time
                                    ? `${item.start_time} - ${item.end_time}`
                                    : `${item.duration_minutes} min`}
                                </span>
                                {item.duration_minutes && item.start_time && (
                                  <span className="text-slate-500">
                                    ({item.duration_minutes}m)
                                  </span>
                                )}
                              </div>
                            )}

                            {item.hangout_link && (
                              <a
                                href={item.hangout_link}
                                target="_blank"
                                rel="noreferrer"
                                className="text-emerald-400 hover:text-emerald-300 flex items-center gap-0.5 transition-colors font-sans text-[10px]"
                                title="Open Google Meet link"
                              >
                                <Video className="w-3 h-3" />
                                <span>Meet</span>
                              </a>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right actions: Focus target button & Delete */}
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {!item.is_completed && (
                          <button
                            type="button"
                            onClick={() => handleFocusGoal(item)}
                            className={cn(
                              "px-2 py-1 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition-all cursor-pointer",
                              isActive
                                ? "bg-sky-500 text-slate-950 shadow-sm"
                                : "bg-white/5 text-slate-300 hover:bg-sky-500/20 hover:text-sky-300 border border-white/5"
                            )}
                            title="Focus on this event in the timer"
                          >
                            <Target className="w-3 h-3" />
                            <span>{isActive ? "Active" : "Focus"}</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            if (activeGoalId === item.id) setActiveGoalId(null);
                            if (isGCal) {
                              onDeleteCalendarEvent(item.id);
                            } else {
                              onDeleteTodo(item.id);
                            }
                          }}
                          className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 p-1 rounded transition-opacity cursor-pointer shrink-0"
                          title="Remove item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* 4. Interactive Session Configuration Card with Real Clock Times */}
          <div className="rounded-2xl bg-[#141a24] border border-white/8 p-4 sm:p-5 shadow-sm space-y-3 shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Session Configuration & Clock
              </span>

              {isIdle && (
                <button
                  onClick={() => setIsCustomModalOpen(true)}
                  className="flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300 font-medium transition-colors cursor-pointer"
                >
                  <Edit3 className="w-3 h-3" />
                  <span>Setup Custom</span>
                </button>
              )}
            </div>

            {/* Interactive Steppers Grid for Study and Break */}
            <div className="grid grid-cols-2 gap-2.5 text-xs">
              {/* Study Duration Card with Stepper */}
              <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 flex flex-col justify-between">
                <span className="text-[10px] text-slate-500 block mb-1">
                  Focus Duration
                </span>

                <div className="flex items-center justify-between gap-1 my-1">
                  <span className="font-semibold text-slate-100 text-sm tabular-nums">
                    {Math.round(status.study_duration / 60)} min
                  </span>

                  {isIdle ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleStepStudy(-5)}
                        className="w-6 h-6 rounded-md bg-white/5 hover:bg-white/10 active:scale-95 text-slate-300 flex items-center justify-center transition-all cursor-pointer border border-white/5"
                        title="Decrease focus by 5 minutes"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => handleStepStudy(5)}
                        className="w-6 h-6 rounded-md bg-white/5 hover:bg-white/10 active:scale-95 text-slate-300 flex items-center justify-center transition-all cursor-pointer border border-white/5"
                        title="Increase focus by 5 minutes"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-[9px] text-slate-500 uppercase">Locked</span>
                  )}
                </div>
              </div>

              {/* Rest Duration Card with Stepper */}
              <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 flex flex-col justify-between">
                <span className="text-[10px] text-slate-500 block mb-1">
                  Rest Duration
                </span>

                <div className="flex items-center justify-between gap-1 my-1">
                  <span className="font-semibold text-slate-100 text-sm tabular-nums">
                    {status.break_duration >= 60
                      ? `${Math.round(status.break_duration / 60)} min`
                      : `${status.break_duration} sec`}
                  </span>

                  {isIdle ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleStepBreak(-1)}
                        className="w-6 h-6 rounded-md bg-white/5 hover:bg-white/10 active:scale-95 text-slate-300 flex items-center justify-center transition-all cursor-pointer border border-white/5"
                        title="Decrease break duration"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => handleStepBreak(1)}
                        className="w-6 h-6 rounded-md bg-white/5 hover:bg-white/10 active:scale-95 text-slate-300 flex items-center justify-center transition-all cursor-pointer border border-white/5"
                        title="Increase break duration"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-[9px] text-slate-500 uppercase">Locked</span>
                  )}
                </div>
              </div>
            </div>

            {/* Real Clock Timeline Indicator */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/50 text-[11px] text-slate-400 border border-white/5">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-sky-400" />
                <span>Session Timeline</span>
              </div>
              <span className="text-slate-200 font-mono text-[11px] font-semibold">
                {nowClockStr} ➔ {expectedEndClockStr}
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/50 text-[11px] text-slate-400 border border-white/5">
              <div className="flex items-center gap-2">
                <Headphones className="w-3.5 h-3.5 text-sky-400" />
                <span>Audio Ducking</span>
              </div>
              <span className="text-emerald-400 font-medium">Automatic (15%)</span>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Custom Duration & Clock-Time Setup Modal */}
      <ModalComponent
        open={isCustomModalOpen}
        onClose={() => setIsCustomModalOpen(false)}
        title="Setup Focus Schedule & Durations"
        description="Configure focus sessions with real wall-clock start/end times and eye-rest intervals."
        confirmText="Apply Schedule & Durations"
        cancelText="Cancel"
        confirmVariant="primary"
        icon={<SlidersHorizontal className="w-5 h-5 text-sky-400" />}
        onConfirm={handleSaveCustomDurations}
      >
        <div className="space-y-4 pt-1">
          {/* Real Wall-Clock Timeline Visual Strip */}
          <div className="p-3 rounded-xl bg-slate-950/80 border border-white/8 space-y-2">
            <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-sky-400" />
              <span>Real-Time Timeline Preview</span>
            </span>

            <div className="flex items-center gap-2 text-xs font-mono">
              <div className="flex-1 p-2 rounded-lg bg-sky-500/15 border border-sky-400/30 text-sky-200 text-center">
                <span className="block text-[10px] text-sky-400 uppercase font-sans font-semibold">
                  Focus Session ({modalStudyMinutes}m)
                </span>
                <span className="font-bold">
                  {modalStartTime} ➔ {modalEndTime}
                </span>
              </div>

              <ArrowRight className="w-4 h-4 text-slate-500 shrink-0" />

              <div className="flex-1 p-2 rounded-lg bg-rose-500/15 border border-rose-400/30 text-rose-200 text-center">
                <span className="block text-[10px] text-rose-400 uppercase font-sans font-semibold">
                  Rest ({modalBreakVal}
                  {breakUnit})
                </span>
                <span className="font-bold">
                  {modalEndTime} ➔{" "}
                  {addMinutesToTime(
                    modalEndTime,
                    breakUnit === "min" ? modalBreakVal : 1
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Wall-Clock Pickers (Từ mấy giờ đến mấy giờ) */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-200">
                Start Time
              </span>
              <input
                type="time"
                value={modalStartTime}
                onChange={(e) => handleModalStartTimeChange(e.target.value)}
                className="w-full h-9 bg-slate-950/80 border border-white/10 rounded-lg px-3 text-sm text-slate-200 font-mono font-semibold"
              />
            </div>

            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-200">
                End Time
              </span>
              <input
                type="time"
                value={modalEndTime}
                onChange={(e) => handleModalEndTimeChange(e.target.value)}
                className="w-full h-9 bg-slate-950/80 border border-white/10 rounded-lg px-3 text-sm text-slate-200 font-mono font-semibold"
              />
            </div>
          </div>

          {/* Focus Duration (Minutes) */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-slate-200">
                Focus Duration (Minutes)
              </span>
              <span className="text-slate-400 font-mono text-[11px]">
                {modalStudyMinutes} min (
                {Math.round((modalStudyMinutes / 60) * 10) / 10}h)
              </span>
            </div>

            <InputComponent
              type="number"
              min={1}
              max={180}
              value={modalStudyMinutes}
              onChange={(e) => handleModalDurationChange(Number(e.target.value))}
              fullWidth
              className="h-9 bg-slate-950/80 font-mono font-semibold text-sm"
            />

            {/* Quick Chips for Focus */}
            <div className="flex items-center gap-1.5 flex-wrap pt-1">
              {[15, 25, 35, 45, 50, 60, 90].map((m) => (
                <button
                  type="button"
                  key={m}
                  onClick={() => handleModalDurationChange(m)}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-[11px] border transition-all cursor-pointer",
                    modalStudyMinutes === m
                      ? "bg-sky-500/20 text-sky-300 border-sky-400/40 font-semibold"
                      : "bg-slate-900/60 border-white/8 text-slate-400 hover:text-white"
                  )}
                >
                  {m}m
                </button>
              ))}
            </div>
          </div>

          {/* Break Duration Input with Unit Toggle */}
          <div className="space-y-2 pt-2 border-t border-white/5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-slate-200">
                Break Duration
              </span>

              {/* Unit Toggle: Minutes vs Seconds */}
              <div className="inline-flex p-0.5 rounded-lg bg-slate-950 border border-white/8 text-[10px]">
                <button
                  type="button"
                  onClick={() => {
                    if (breakUnit === "sec") {
                      setModalBreakVal(Math.max(1, Math.round(modalBreakVal / 60)));
                      setBreakUnit("min");
                    }
                  }}
                  className={cn(
                    "px-2 py-0.5 rounded cursor-pointer transition-colors",
                    breakUnit === "min"
                      ? "bg-slate-800 text-sky-300 font-semibold"
                      : "text-slate-400 hover:text-white"
                  )}
                >
                  Minutes
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (breakUnit === "min") {
                      setModalBreakVal(modalBreakVal * 60);
                      setBreakUnit("sec");
                    }
                  }}
                  className={cn(
                    "px-2 py-0.5 rounded cursor-pointer transition-colors",
                    breakUnit === "sec"
                      ? "bg-slate-800 text-sky-300 font-semibold"
                      : "text-slate-400 hover:text-white"
                  )}
                >
                  Seconds (Eye-Rest)
                </button>
              </div>
            </div>

            <InputComponent
              type="number"
              min={breakUnit === "min" ? 1 : 10}
              max={breakUnit === "min" ? 60 : 3600}
              value={modalBreakVal}
              onChange={(e) => {
                setModalBreakVal(Number(e.target.value));
                setCustomError(null);
              }}
              fullWidth
              className="h-9 bg-slate-950/80 font-mono font-semibold text-sm"
            />

            {/* Quick Chips for Break */}
            <div className="flex items-center gap-1.5 flex-wrap pt-1">
              {breakUnit === "min"
                ? [3, 5, 7, 10, 15, 20].map((m) => (
                    <button
                      type="button"
                      key={m}
                      onClick={() => setModalBreakVal(m)}
                      className={cn(
                        "px-2.5 py-1 rounded-md text-[11px] border transition-all cursor-pointer",
                        modalBreakVal === m
                          ? "bg-rose-500/20 text-rose-300 border-rose-400/40 font-semibold"
                          : "bg-slate-900/60 border-white/8 text-slate-400 hover:text-white"
                      )}
                    >
                      {m}m
                    </button>
                  ))
                : [20, 30, 45, 60].map((s) => (
                    <button
                      type="button"
                      key={s}
                      onClick={() => setModalBreakVal(s)}
                      className={cn(
                        "px-2.5 py-1 rounded-md text-[11px] border transition-all cursor-pointer",
                        modalBreakVal === s
                          ? "bg-rose-500/20 text-rose-300 border-rose-400/40 font-semibold"
                          : "bg-slate-900/60 border-white/8 text-slate-400 hover:text-white"
                      )}
                    >
                      {s}s
                    </button>
                  ))}
            </div>
          </div>

          {/* Validation Error Banner */}
          {customError && (
            <div className="p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{customError}</span>
            </div>
          )}
        </div>
      </ModalComponent>

      {/* 6. Confirmation Modal Before Stopping Active Session */}
      <ModalComponent
        open={isStopModalOpen}
        onClose={() => setIsStopModalOpen(false)}
        title="Stop Active Focus Session?"
        description="Are you sure you want to stop? Your countdown will be reset to idle and progress will be lost."
        confirmText="Stop Session"
        cancelText="Resume"
        confirmVariant="destructive"
        icon={<AlertTriangle className="w-5 h-5 text-amber-400" />}
        onConfirm={handleConfirmStop}
      />
    </div>
  );
};
