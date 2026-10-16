<script lang="ts">
  import { invoke, isTauri } from "@tauri-apps/api/core";
  import { toastState } from "@/lib/toast.svelte";
  import { googleAuthState } from "@/lib/googleAuth.svelte";
  import {
    googleCalendarState,
  } from "@/lib/googleCalendar.svelte";
  import type { GoogleUser } from "@/components/navigation/SideNavbar.svelte";
  import GoogleIcon from "@/components/icons/GoogleIcon.svelte";
  import BreakScreenLockOverlay from "@/components/BreakScreenLockOverlay.svelte";
  import Modal from "@/components/ui/Modal.svelte";
  import {
    Play,
    Square,
    RotateCcw,
    Volume2,
    VolumeX,
    Clock,
    Calendar,
    CheckCircle2,
    ListTodo,
    Plus,
    Minus,
    Trash2,
    Settings,
    SkipForward,
    Circle,
    AlertTriangle,
    Flame,
    Check,
    Headphones,
    SlidersHorizontal,
    Edit3,
    Target,
    ArrowRight,
    RefreshCw,
    Video,
    Timer,
    ShieldCheck,
  } from "@lucide/svelte";

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
    screen_lock_enabled?: boolean;
  }

  interface Props {
    status?: TimerStatus;
    user?: GoogleUser | null;
    screenLockEnabled?: boolean;
    onToggleScreenLock?: (enabled: boolean) => void;
    onSignInGoogle?: () => void;
    showToast?: (type: "success" | "error" | "info", message: string) => void;
  }

  let {
    status: initialStatus,
    user: initialUser,
    screenLockEnabled: initialScreenLock,
    onToggleScreenLock: propOnToggleScreenLock,
    onSignInGoogle,
    showToast: propShowToast,
  }: Props = $props();

  const TODOS_STORAGE_KEY = "rust-sound.timer-todos";

  function notify(type: "success" | "error" | "info", message: string) {
    if (propShowToast) {
      propShowToast(type, message);
    } else if (type === "success") {
      toastState.success(message);
    } else if (type === "error") {
      toastState.error(message);
    } else {
      toastState.info(message);
    }
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
    const newH = Math.floor((((totalM % 1440) + 1440) % 1440) / 60);
    const newM = ((totalM % 60) + 60) % 60;
    return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
  }

  function diffMinutesBetween(startTimeStr: string, endTimeStr: string): number {
    const [h1, m1] = startTimeStr.split(":").map(Number);
    const [h2, m2] = endTimeStr.split(":").map(Number);
    if (isNaN(h1) || isNaN(m1) || isNaN(h2) || isNaN(m2)) return 25;
    let diff = h2 * 60 + m2 - (h1 * 60 + m1);
    if (diff < 0) diff += 1440;
    return Math.max(1, Math.min(180, diff));
  }

  function isRunningInTauri(): boolean {
    if (typeof window === "undefined") return false;
    return (
      isTauri() ||
      Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) ||
      Boolean((window as unknown as { __TAURI__?: unknown }).__TAURI__)
    );
  }

  const PRESETS = [
    { label: "25m Pomodoro", study: 25 * 60, breakDur: 5 * 60 },
    { label: "20m Eye Rest", study: 20 * 60, breakDur: 20 },
    { label: "50m Deep Work", study: 50 * 60, breakDur: 10 * 60 },
  ];

  // Core state
  let status = $state<TimerStatus>({
    phase: "idle",
    remaining_seconds: 25 * 60,
    study_duration: 25 * 60,
    break_duration: 5 * 60,
    completed_sessions: 0,
    is_ducked: false,
    screen_lock_enabled: true,
  });

  let screenLockEnabled = $state<boolean>(true);
  let todos = $state<TodoItem[]>([]);

  $effect(() => {
    if (initialStatus) {
      status = initialStatus;
    }
  });

  $effect(() => {
    if (initialScreenLock !== undefined) {
      screenLockEnabled = initialScreenLock;
    }
  });

  // Task form state
  let newTodoTitle = $state("");
  let showTimeboxOptions = $state(false);
  let newStartTime = $state(formatClockTime(new Date()));
  let newEndTime = $state(addMinutesToTime(formatClockTime(new Date()), 25));

  // Active goal & filter
  let activeGoalId = $state<string | null>(null);
  let activeFilter = $state<"all" | "calendar" | "tasks">("all");

  // Modals state
  let isStopModalOpen = $state(false);
  let isCustomModalOpen = $state(false);

  // Custom modal inputs
  let modalStudyMinutes = $state(25);
  let modalBreakVal = $state(5);
  let breakUnit = $state<"min" | "sec">("min");
  let modalStartTime = $state(formatClockTime(new Date()));
  let modalEndTime = $state(addMinutesToTime(formatClockTime(new Date()), 25));
  let customError = $state<string | null>(null);

  // Wall-clock ticker
  let currentTime = $state(new Date());

  function persistLocalTodos() {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(TODOS_STORAGE_KEY, JSON.stringify(todos));
      } catch {}
    }
  }

  // Derived state
  const isIdle = $derived(status.phase === "idle");
  const isStudying = $derived(status.phase === "studying");
  const isWarning = $derived(status.phase === "warning");
  const isBreaking = $derived(status.phase === "breaking");

  const currentUser = $derived(initialUser ?? googleAuthState.user);
  const calendarEvents = $derived(googleCalendarState.events);
  const isLoadingCalendar = $derived(googleCalendarState.isLoading);

  const unifiedItems = $derived.by(() => {
    const calendarItems: TodoItem[] = calendarEvents.map((ev) => ({
      id: ev.id,
      title: ev.summary,
      is_completed: ev.is_completed,
      start_time: ev.start_time,
      end_time: ev.end_time,
      duration_minutes: ev.duration_minutes,
      source: "google-calendar" as const,
      hangout_link: ev.hangout_link,
    }));

    const taskItems: TodoItem[] = todos.map((t) => ({
      ...t,
      source: "manual" as const,
    }));

    if (activeFilter === "calendar") return calendarItems;
    if (activeFilter === "tasks") return taskItems;
    return [...calendarItems, ...taskItems];
  });

  const activeGoal = $derived(
    activeGoalId ? unifiedItems.find((it) => it.id === activeGoalId) || null : null
  );

  const sessionSecondsLeft = $derived(
    isIdle ? status.study_duration : status.remaining_seconds
  );
  const expectedEndDate = $derived(
    new Date(currentTime.getTime() + sessionSecondsLeft * 1000)
  );
  const expectedEndClockStr = $derived(formatClockTime(expectedEndDate));
  const nowClockStr = $derived(formatClockTime(currentTime));

  const totalDuration = $derived(
    isBreaking ? status.break_duration : isWarning ? 10 : status.study_duration
  );
  const currentSeconds = $derived(
    isIdle ? status.study_duration : status.remaining_seconds
  );
  const progressRatio = $derived(
    totalDuration > 0
      ? Math.max(0, Math.min(1, (totalDuration - status.remaining_seconds) / totalDuration))
      : 0
  );

  const radius = 94;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = $derived(
    isIdle ? 0 : circumference * (1 - progressRatio)
  );

  const matchedPreset = $derived(
    PRESETS.find(
      (p) => status.study_duration === p.study && status.break_duration === p.breakDur
    )
  );
  const isCustomPreset = $derived(!matchedPreset);

  const completedCount = $derived(
    unifiedItems.filter((t) => t.is_completed).length
  );

  // Periodic wall-clock timer
  $effect(() => {
    const timer = setInterval(() => {
      currentTime = new Date();
    }, 5000);
    return () => clearInterval(timer);
  });

  // Initial load of todos and screen lock preference
  $effect(() => {
    if (isRunningInTauri()) {
      invoke<TodoItem[]>("get_todo_items")
        .then((res) => {
          if (res && res.length > 0) todos = res;
        })
        .catch(() => {});
      invoke<boolean>("get_break_screen_lock_status")
        .then((res) => {
          screenLockEnabled = res;
        })
        .catch(() => {});
    } else {
      try {
        const savedTodos = localStorage.getItem(TODOS_STORAGE_KEY);
        if (savedTodos) {
          todos = JSON.parse(savedTodos);
        }
        const savedLock = localStorage.getItem("rust-sound.screen-lock-enabled");
        if (savedLock !== null) {
          screenLockEnabled = JSON.parse(savedLock);
        }
      } catch {}
    }
  });

  // Simulated break event listener for development/testing
  $effect(() => {
    const handleSimBreak = () => {
      status = {
        ...status,
        phase: "breaking",
        remaining_seconds: status.break_duration,
        is_ducked: true,
      };
    };
    window.addEventListener("simulate-break-phase", handleSimBreak);
    return () => window.removeEventListener("simulate-break-phase", handleSimBreak);
  });

  // Periodic poll to keep timer countdown accurate with backend wall clock
  $effect(() => {
    let active = true;

    const poll = async () => {
      if (!active) return;
      if (isRunningInTauri()) {
        try {
          const res = await invoke<TimerStatus>("get_break_timer_status");
          if (active) {
            status = res;
          }
        } catch {
          // Ignore background timer poll error
        }
      } else {
        // Browser preview simulated countdown
        if (status.phase === "idle") return;
        if (status.remaining_seconds > 1) {
          const nextRemaining = status.remaining_seconds - 1;
          const nextPhase =
            status.phase === "studying" && nextRemaining <= 10
              ? "warning"
              : status.phase;
          status = {
            ...status,
            phase: nextPhase,
            remaining_seconds: nextRemaining,
          };
        } else if (status.phase === "warning" || status.phase === "studying") {
          notify("info", "Eye-rest break started! Audio ducked.");
          status = {
            ...status,
            phase: "breaking",
            remaining_seconds: status.break_duration,
            is_ducked: true,
          };
        } else if (status.phase === "breaking") {
          notify("success", "Break complete! Ready for next session.");
          status = {
            ...status,
            phase: "studying",
            remaining_seconds: status.study_duration,
            completed_sessions: status.completed_sessions + 1,
            is_ducked: false,
          };
        }
      }
    };

    poll();
    const interval = setInterval(poll, isRunningInTauri() ? 500 : 1000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  });

  // Timer actions
  async function handleStartTimer() {
    if (isRunningInTauri()) {
      try {
        const res = await invoke<TimerStatus>("start_break_timer");
        status = res;
      } catch {
        status = {
          ...status,
          phase: "studying",
          remaining_seconds: status.study_duration,
          is_ducked: false,
        };
      }
    } else {
      status = {
        ...status,
        phase: "studying",
        remaining_seconds: status.study_duration,
        is_ducked: false,
      };
    }
    notify("success", "Deep focus session started!");
  }

  async function handleStopTimer() {
    if (isRunningInTauri()) {
      try {
        const res = await invoke<TimerStatus>("stop_break_timer");
        status = res;
      } catch {
        status = {
          ...status,
          phase: "idle",
          remaining_seconds: status.study_duration,
          is_ducked: false,
        };
      }
    } else {
      status = {
        ...status,
        phase: "idle",
        remaining_seconds: status.study_duration,
        is_ducked: false,
      };
    }
    notify("info", "Focus timer reset to idle.");
  }

  async function handleResetSession() {
    await handleStopTimer();
    activeGoalId = null;
  }

  async function handleSkipTimer() {
    if (isRunningInTauri()) {
      try {
        const res = await invoke<TimerStatus>("skip_break_timer");
        status = res;
      } catch {
        status = {
          ...status,
          phase: "studying",
          remaining_seconds: status.study_duration,
          completed_sessions: status.completed_sessions + 1,
          is_ducked: false,
        };
      }
    } else {
      status = {
        ...status,
        phase: "studying",
        remaining_seconds: status.study_duration,
        completed_sessions: status.completed_sessions + 1,
        is_ducked: false,
      };
    }
    notify("info", "Break skipped. Resuming focus session.");
  }

  async function handleSnoozeTimer() {
    if (isRunningInTauri()) {
      try {
        const res = await invoke<TimerStatus>("snooze_break_timer");
        status = res;
      } catch {
        status = {
          ...status,
          phase: "studying",
          remaining_seconds: 300,
          is_ducked: false,
        };
      }
    } else {
      status = {
        ...status,
        phase: "studying",
        remaining_seconds: 300,
        is_ducked: false,
      };
    }
    notify("success", "Break snoozed by +5 minutes.");
  }

  async function handleSetDurations(studySec: number, breakSec: number) {
    if (isRunningInTauri()) {
      try {
        const res = await invoke<TimerStatus>("set_timer_durations", {
          studySec,
          breakSec,
        });
        status = res;
      } catch {
        status = {
          ...status,
          study_duration: studySec,
          break_duration: breakSec,
          remaining_seconds: studySec,
        };
      }
    } else {
      status = {
        ...status,
        study_duration: studySec,
        break_duration: breakSec,
        remaining_seconds: studySec,
      };
    }
    const studyM = Math.round(studySec / 60);
    const breakM = breakSec >= 60 ? `${Math.round(breakSec / 60)}m` : `${breakSec}s`;
    notify("success", `Timer set to ${studyM}m study / ${breakM} break`);
  }

  async function handleToggleScreenLock(enabled: boolean) {
    screenLockEnabled = enabled;
    if (propOnToggleScreenLock) {
      propOnToggleScreenLock(enabled);
    }
    if (isRunningInTauri()) {
      invoke("sync_break_screen_lock", { enabled }).catch(() => {});
    }
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("rust-sound.screen-lock-enabled", JSON.stringify(enabled));
      } catch {}
    }
    notify("info", `Screen lock ${enabled ? "enabled" : "disabled"} for breaks`);
  }

  // Steppers
  function handleStepStudy(deltaMin: number) {
    if (!isIdle) return;
    const currentMin = Math.round(status.study_duration / 60);
    const newMin = Math.max(1, Math.min(180, currentMin + deltaMin));
    handleSetDurations(newMin * 60, status.break_duration);
  }

  function handleStepBreak(deltaUnit: number) {
    if (!isIdle) return;
    if (status.break_duration < 60) {
      const newSec = Math.max(10, Math.min(59, status.break_duration + deltaUnit * 10));
      handleSetDurations(status.study_duration, newSec);
    } else {
      const currentMin = Math.round(status.break_duration / 60);
      const newMin = Math.max(1, Math.min(60, currentMin + deltaUnit));
      handleSetDurations(status.study_duration, newMin * 60);
    }
  }

  // Todo operations
  async function handleAddTodo(e?: Event) {
    e?.preventDefault();
    const trimmed = newTodoTitle.trim();
    if (!trimmed) return;

    const durationM = showTimeboxOptions
      ? diffMinutesBetween(newStartTime, newEndTime)
      : undefined;
    const start = showTimeboxOptions ? newStartTime : undefined;
    const end = showTimeboxOptions ? newEndTime : undefined;

    if (isRunningInTauri()) {
      try {
        const res = await invoke<TodoItem[]>("add_todo_item", {
          title: trimmed,
          startTime: start ?? null,
          endTime: end ?? null,
          durationMinutes: durationM ?? null,
        });
        todos = res;
      } catch {
        todos = [
          ...todos,
          {
            id: `task-${Date.now()}`,
            title: trimmed,
            is_completed: false,
            start_time: start,
            end_time: end,
            duration_minutes: durationM,
            source: "manual",
          },
        ];
      }
    } else {
      todos = [
        ...todos,
        {
          id: `task-${Date.now()}`,
          title: trimmed,
          is_completed: false,
          start_time: start,
          end_time: end,
          duration_minutes: durationM,
          source: "manual",
        },
      ];
    }

    const timeInfo = start && end ? ` (${start} - ${end})` : "";
    notify("success", `Task added: "${trimmed}"${timeInfo}`);
    newTodoTitle = "";
    showTimeboxOptions = false;
    persistLocalTodos();
  }

  async function handleToggleTodo(id: string) {
    if (isRunningInTauri()) {
      try {
        const res = await invoke<TodoItem[]>("toggle_todo_item", { id });
        todos = res;
      } catch {
        todos = todos.map((t) => (t.id === id ? { ...t, is_completed: !t.is_completed } : t));
      }
    } else {
      todos = todos.map((t) => (t.id === id ? { ...t, is_completed: !t.is_completed } : t));
    }
    notify("info", "Task status updated");
    persistLocalTodos();
  }

  async function handleDeleteTodo(id: string) {
    if (activeGoalId === id) activeGoalId = null;
    if (isRunningInTauri()) {
      try {
        const res = await invoke<TodoItem[]>("delete_todo_item", { id });
        todos = res;
      } catch {
        todos = todos.filter((t) => t.id !== id);
      }
    } else {
      todos = todos.filter((t) => t.id !== id);
    }
    notify("info", "Task removed");
    persistLocalTodos();
  }

  function handleFocusGoal(item: TodoItem) {
    activeGoalId = item.id;
    if (isIdle && item.duration_minutes) {
      handleSetDurations(item.duration_minutes * 60, status.break_duration);
    }
  }

  // Google Calendar integrations
  async function handleSyncCalendar() {
    const res = await googleCalendarState.syncCalendar(currentUser);
    if (res.success) {
      notify("success", `Google Calendar synced (${res.count} events today)`);
    } else {
      notify("info", "Connect Google account to sync calendar");
    }
  }

  function handleSignInGoogle() {
    if (onSignInGoogle) {
      onSignInGoogle();
    } else {
      googleAuthState.isLoginModalOpen = true;
    }
  }

  function handleToggleCalendarEvent(id: string) {
    googleCalendarState.toggleEventComplete(id);
    notify("info", "Calendar event status updated");
  }

  function handleDeleteCalendarEvent(id: string) {
    if (activeGoalId === id) activeGoalId = null;
    googleCalendarState.deleteEvent(id);
    notify("info", "Calendar event removed from view");
  }

  // Custom modal handlers
  function handleOpenCustomModal() {
    const nowStr = formatClockTime(new Date());
    const studyM = Math.round(status.study_duration / 60);
    modalStudyMinutes = studyM;
    modalStartTime = nowStr;
    modalEndTime = addMinutesToTime(nowStr, studyM);

    if (status.break_duration >= 60) {
      modalBreakVal = Math.round(status.break_duration / 60);
      breakUnit = "min";
    } else {
      modalBreakVal = status.break_duration;
      breakUnit = "sec";
    }
    customError = null;
    isCustomModalOpen = true;
  }

  function handleModalDurationChange(minutes: number) {
    modalStudyMinutes = minutes;
    modalEndTime = addMinutesToTime(modalStartTime, minutes);
    customError = null;
  }

  function handleModalEndTimeChange(endStr: string) {
    modalEndTime = endStr;
    const diff = diffMinutesBetween(modalStartTime, endStr);
    modalStudyMinutes = diff;
    customError = null;
  }

  function handleModalStartTimeChange(startStr: string) {
    modalStartTime = startStr;
    modalEndTime = addMinutesToTime(startStr, modalStudyMinutes);
    customError = null;
  }

  function handleSaveCustomDurations() {
    if (modalStudyMinutes < 1 || modalStudyMinutes > 180) {
      customError = "Focus duration must be between 1 and 180 minutes.";
      return;
    }

    const calculatedBreakSec =
      breakUnit === "min" ? modalBreakVal * 60 : modalBreakVal;

    if (calculatedBreakSec < 10 || calculatedBreakSec > 3600) {
      customError = "Break duration must be between 10 seconds and 60 minutes.";
      return;
    }

    handleSetDurations(modalStudyMinutes * 60, calculatedBreakSec);
    isCustomModalOpen = false;
  }
</script>

<!-- Screen lock scrim overlay hosted by TimerView -->
<BreakScreenLockOverlay
  active={status.phase === "breaking"}
  remainingSeconds={status.remaining_seconds}
  onSkip={handleSkipTimer}
  enabled={screenLockEnabled}
/>

<div class="w-full h-full flex flex-col space-y-4 select-none min-h-0 flex-1">
  <!-- 1. Top Bar: Preset Selector (Left) & Screen Lock / Session Stats (Right) -->
  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
    <!-- Left Container: Preset Pills -->
    <div class="inline-flex p-1 gap-1 rounded-xl bg-(--paper) border border-(--line) backdrop-blur-md shrink-0 overflow-x-auto max-w-full">
      {#each PRESETS as p}
        {@const isSelected = status.study_duration === p.study && status.break_duration === p.breakDur}
        <button
          type="button"
          disabled={!isIdle}
          onclick={() => handleSetDurations(p.study, p.breakDur)}
          class="px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap {isSelected ? 'bg-(--surface) text-(--ink) font-semibold border border-(--line) shadow-xs' : 'text-(--muted) hover:text-(--ink) hover:bg-(--surface)/50 border border-transparent'} {!isIdle ? 'opacity-50 cursor-not-allowed' : ''}"
        >
          {p.label}
        </button>
      {/each}

      <!-- Custom Duration Button / Pill -->
      <button
        type="button"
        disabled={!isIdle}
        onclick={handleOpenCustomModal}
        class="px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 {isCustomPreset ? 'bg-(--surface) text-(--ink) font-semibold border border-(--line) shadow-xs' : 'text-(--muted) hover:text-(--ink) hover:bg-(--surface)/50 border border-transparent'} {!isIdle ? 'opacity-50 cursor-not-allowed' : ''}"
        title="Setup custom study and break intervals with clock timeline"
      >
        <SlidersHorizontal class="w-3 h-3 text-(--accent-text)" />
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

    <!-- Right Container: Screen Lock Toggle + Sessions Completed Today Counter -->
    <div class="inline-flex items-center gap-2 p-1 rounded-xl bg-(--paper) border border-(--line) backdrop-blur-md shrink-0 self-start sm:self-auto">
      <!-- Screen Lock Toggle Button -->
      <button
        type="button"
        onclick={() => handleToggleScreenLock(!screenLockEnabled)}
        class="px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 select-none {screenLockEnabled ? 'bg-(--surface) text-(--ink) font-semibold shadow-xs border border-(--line)' : 'text-(--muted) hover:text-(--ink)'}"
        title={screenLockEnabled ? "Khóa màn hình khi đến giờ nghỉ: BẬT" : "Khóa màn hình khi đến giờ nghỉ: TẮT"}
      >
        <ShieldCheck class="w-3.5 h-3.5 {screenLockEnabled ? 'text-(--success)' : 'text-(--muted)'}" />
        <span>Khóa Khi Nghỉ</span>
        <span
          class="text-[9px] px-1.5 py-0.2 rounded-full font-bold uppercase {screenLockEnabled ? 'bg-(--success)/15 text-(--success)' : 'bg-(--line) text-(--muted)'}"
        >
          {screenLockEnabled ? "Bật" : "Tắt"}
        </span>
      </button>

      <div class="w-px h-4 bg-(--line)"></div>

      <!-- Sessions Completed Today -->
      <div class="flex items-center gap-1.5 px-2 py-1 text-xs text-(--ink) font-semibold">
        <Flame class="w-3.5 h-3.5 text-(--warning) shrink-0" />
        <span>
          Hôm nay: <strong class="font-mono text-(--accent-text)">{status.completed_sessions}</strong>
        </span>
      </div>
    </div>
  </div>

  <!-- 2. Fluid 2-Column Grid Filling 100% Width and Height -->
  <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-0 items-stretch">
    <!-- Left Column (lg:col-span-7): Studio Focus Timer Cockpit -->
    <div class="lg:col-span-7 flex flex-col justify-between p-5 sm:p-6 lg:p-7 panel relative overflow-hidden h-full min-h-125">
      <!-- 1. Cockpit Header Bar -->
      <div class="flex items-center justify-between gap-3 pb-3 border-b border-(--line) w-full shrink-0">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-xl bg-(--accent)/15 border border-(--accent)/30 flex items-center justify-center text-(--accent)">
            <Timer class="w-4 h-4" />
          </div>
          <div>
            <h3 class="text-xs font-bold text-(--ink) tracking-tight m-0">
              Focus Timer Cockpit
            </h3>
            <p class="text-[10px] text-(--muted) m-0">
              Pomodoro Smart Ducking & Session Automation
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          {#if status.is_ducked}
            <span class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-(--accent)/15 border border-(--accent)/30 text-(--accent-text) text-[10px] font-semibold animate-pulse">
              <VolumeX class="w-3 h-3" />
              <span>Ducking Active (15%)</span>
            </span>
          {:else}
            <span class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-(--success)/10 border border-(--success)/25 text-(--success) text-[10px] font-semibold">
              <span class="w-1.5 h-1.5 rounded-full bg-(--success) animate-pulse"></span>
              <Volume2 class="w-3 h-3" />
              <span>Engine Armed</span>
            </span>
          {/if}
        </div>
      </div>

      <!-- 2. Central Gauge & Circular Dial -->
      <div class="relative flex flex-col items-center justify-center my-auto py-3">
        <div class="relative w-64 h-64 sm:w-72 sm:h-72 lg:w-80 lg:h-80 flex items-center justify-center">
          <svg
            class="w-full h-full transform -rotate-90 drop-shadow-md"
            viewBox="0 0 220 220"
          >
            <defs>
              <!-- --strong is pingloom's deeper accent; the others fade toward
                  --paper so the ring keeps depth in light and dark alike. -->
              <linearGradient id="studyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="var(--accent)" />
                <stop offset="100%" stop-color="var(--strong)" />
              </linearGradient>
              <linearGradient id="breakGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="var(--success)" />
                <stop offset="100%" stop-color="color-mix(in srgb, var(--success) 65%, var(--paper))" />
              </linearGradient>
              <linearGradient id="warnGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="var(--warning)" />
                <stop offset="100%" stop-color="color-mix(in srgb, var(--warning) 65%, var(--paper))" />
              </linearGradient>
              <filter id="dialGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <!-- Background Track Ring -->
            <circle
              cx="110"
              cy="110"
              r={radius}
              fill="none"
              stroke="var(--line)"
              stroke-width="7"
            />

            <!-- Foreground Progress Ring -->
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
                  : "color-mix(in srgb, var(--accent) 25%, transparent)"
              }
              stroke-width="7"
              stroke-linecap="round"
              stroke-dasharray={circumference}
              stroke-dashoffset={strokeDashoffset}
              filter={!isIdle ? "url(#dialGlow)" : undefined}
              class="transition-[stroke-dashoffset] duration-300 ease-out"
            />
          </svg>

          <!-- Center Countdown, Active Task Banner & Real-Time Schedule -->
          <div class="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
            {#if activeGoal}
              <div
                class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-(--accent)/15 border border-(--accent)/40 text-(--accent-text) text-[11px] font-semibold mb-1 max-w-55 truncate shadow-sm"
                title={`Active Goal: ${activeGoal.title}`}
              >
                {#if activeGoal.source === "google-calendar"}
                  <GoogleIcon class="w-3.5 h-3.5 shrink-0" />
                {:else}
                  <Target class="w-3.5 h-3.5 text-(--accent) shrink-0" />
                {/if}
                <span class="truncate">{activeGoal.title}</span>
              </div>
            {:else}
              <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-(--paper) border border-(--line) text-[11px] font-semibold uppercase tracking-wider mb-1">
                <span
                  class="w-2 h-2 rounded-full {isBreaking
                    ? 'bg-(--error) shadow-[0_0_6px_var(--accent)] animate-ping'
                    : isWarning
                    ? 'bg-(--warning) shadow-[0_0_6px_var(--warning)] animate-pulse'
                    : isStudying
                    ? 'bg-(--success) shadow-[0_0_6px_var(--success)] animate-pulse'
                    : 'bg-(--muted)'}"
                ></span>
                <span
                  class={isBreaking
                    ? 'text-(--error)'
                    : isWarning
                    ? 'text-(--warning)'
                    : isStudying
                    ? 'text-(--success)'
                    : 'text-(--muted)'}
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
            {/if}

            <!-- Countdown Numbers -->
            <span class="text-5xl sm:text-6xl lg:text-7xl font-bold font-mono tracking-tight text-(--ink) tabular-nums drop-shadow-sm my-0.5">
              {formatCountdown(currentSeconds)}
            </span>

            <!-- Real Wall-Clock Timeline -->
            <div class="text-[11px] font-medium tracking-tight mt-1 flex items-center gap-1.5 text-(--muted) bg-(--paper) px-3 py-1 rounded-full border border-(--line)">
              <Clock class="w-3 h-3 text-(--accent) shrink-0" />
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
      </div>

      <!-- 3. Primary Actions & Session Telemetry Footer -->
      <div class="space-y-3.5 pt-3 border-t border-(--line) w-full shrink-0">
        <!-- Primary Start / Stop Controls -->
        <div class="flex items-center justify-center gap-3">
          {#if isIdle}
            <button
              type="button"
              onclick={handleStartTimer}
              class="h-11 px-8 rounded-xl bg-(--accent) hover:opacity-90 text-(--accent-ink) font-bold text-xs tracking-tight shadow-md transition-all cursor-pointer active:scale-95 flex items-center gap-2"
            >
              <Play class="w-4 h-4 fill-current" />
              <span>
                {activeGoal
                  ? `Start: "${activeGoal.title.slice(0, 20)}…"`
                  : "Start Focus Session"}
              </span>
            </button>
          {:else}
            <button
              type="button"
              onclick={() => (isStopModalOpen = true)}
              class="h-11 px-6 rounded-xl bg-(--error)/15 hover:bg-(--error)/25 border border-(--error)/30 text-(--error) font-bold text-xs transition-all cursor-pointer active:scale-95 flex items-center gap-2 shadow-sm"
            >
              <Square class="w-4 h-4 fill-current" />
              <span>Stop Session</span>
            </button>

            {#if isBreaking || isWarning}
              <button
                type="button"
                onclick={handleSkipTimer}
                class="btn border border-(--line) bg-(--paper) hover:bg-(--surface) text-(--ink) h-11 px-5 text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <SkipForward class="w-4 h-4" />
                <span>Skip Break</span>
              </button>
            {/if}

            {#if isWarning}
              <button
                type="button"
                onclick={handleSnoozeTimer}
                class="btn border border-(--warning)/40 bg-(--warning)/15 hover:bg-(--warning)/25 text-(--ink) h-11 px-5 text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Clock class="w-4 h-4 text-(--warning)" />
                <span>Snooze (+5m)</span>
              </button>
            {/if}

            <button
              type="button"
              onclick={handleResetSession}
              class="btn border border-(--line) bg-(--paper) hover:bg-(--surface) text-(--muted) hover:text-(--ink) h-11 px-3 rounded-xl flex items-center justify-center cursor-pointer shadow-sm"
              title="Reset session to idle"
            >
              <RotateCcw class="w-4 h-4" />
            </button>
          {/if}
        </div>

        <!-- Quick Session Stats Bar -->
        <div class="grid grid-cols-3 gap-2 text-center text-xs p-2 rounded-xl bg-(--paper) border border-(--line)">
          <div>
            <span class="text-[10px] text-(--muted) block">Completed Today</span>
            <span class="font-mono font-bold text-(--ink) text-xs">
              {status.completed_sessions} Sessions
            </span>
          </div>
          <div class="border-x border-(--line)">
            <span class="text-[10px] text-(--muted) block">Rest Duration</span>
            <span class="font-mono font-bold text-(--ink) text-xs">
              {status.break_duration >= 60
                ? `${Math.round(status.break_duration / 60)}m`
                : `${status.break_duration}s`}
            </span>
          </div>
          <div>
            <span class="text-[10px] text-(--muted) block">Audio Ducking</span>
            <span class="font-mono font-bold text-(--success) text-xs">
              {status.is_ducked ? "15% (Ducked)" : "Armed (15%)"}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Right Column (lg:col-span-5): Tasks Checklist & Interactive Session Configuration -->
    <div class="lg:col-span-5 flex flex-col gap-4 h-full min-h-0">
      <!-- 3. Focus Tasks & Google Calendar Card -->
      <div class="flex-1 flex flex-col panel p-4 sm:p-5 shadow-sm min-h-65">
        <!-- Task Header with Google Calendar Sync & Filter Tabs -->
        <div class="flex items-center justify-between pb-3 mb-3 border-b border-(--line) shrink-0">
          <div class="flex items-center gap-2">
            <ListTodo class="w-3.5 h-3.5 text-(--accent)" />
            <span class="text-xs font-semibold text-(--ink) tracking-tight">
              Focus Schedule
            </span>
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-(--surface) text-(--muted) text-[10px] font-semibold border border-(--line)">
              <CheckCircle2 class="w-2.5 h-2.5 text-(--success)" />
              <span>{completedCount}/{unifiedItems.length} Done</span>
            </span>
          </div>

          <!-- Google Calendar Sync Action / Status -->
          <div class="flex items-center gap-2">
            {#if currentUser}
              <button
                type="button"
                onclick={handleSyncCalendar}
                disabled={isLoadingCalendar}
                class="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-(--accent)/15 hover:bg-(--accent)/25 border border-(--accent)/30 text-(--accent-text) text-[11px] font-semibold cursor-pointer transition-colors"
                title="Sync events from Google Calendar"
              >
                <GoogleIcon class="w-3 h-3" />
                <RefreshCw
                  class="w-3 h-3 {isLoadingCalendar ? 'animate-spin text-(--accent)' : ''}"
                />
                <span>{isLoadingCalendar ? "Syncing…" : "Sync Calendar"}</span>
              </button>
            {:else}
              <button
                type="button"
                onclick={handleSignInGoogle}
                class="flex items-center gap-1 px-2 py-1 rounded-lg bg-(--surface) hover:bg-(--paper) text-(--ink) text-[11px] border border-(--line) cursor-pointer transition-colors"
                title="Sign in with Google to sync calendar"
              >
                <GoogleIcon class="w-3 h-3" />
                <span>Connect Calendar</span>
              </button>
            {/if}

            <button
              type="button"
              onclick={() => (showTimeboxOptions = !showTimeboxOptions)}
              class="text-[11px] flex items-center gap-1 cursor-pointer transition-colors px-2 py-0.5 rounded-md {showTimeboxOptions
                ? 'text-(--accent-text) bg-(--accent)/15 border border-(--accent)/30'
                : 'text-(--muted) hover:text-(--ink)'}"
              title="Toggle manual time schedule"
            >
              <Calendar class="w-3 h-3 text-(--accent)" />
              <span>{showTimeboxOptions ? "Hide" : "+ Timebox"}</span>
            </button>
          </div>
        </div>

        <!-- Filter Tabs: All / Calendar / Tasks -->
        <div class="flex items-center gap-1.5 mb-3 shrink-0">
          <button
            type="button"
            onclick={() => (activeFilter = "all")}
            class="px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer {activeFilter === 'all'
              ? 'bg-(--paper) text-(--ink) font-semibold border border-(--line) shadow-xs'
              : 'text-(--muted) hover:text-(--ink)'}"
          >
            All ({calendarEvents.length + todos.length})
          </button>

          <button
            type="button"
            onclick={() => (activeFilter = "calendar")}
            class="px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer flex items-center gap-1 {activeFilter === 'calendar'
              ? 'bg-(--paper) text-(--ink) font-semibold border border-(--line) shadow-xs'
              : 'text-(--muted) hover:text-(--ink)'}"
          >
            <GoogleIcon class="w-2.5 h-2.5" />
            <span>Google Calendar ({calendarEvents.length})</span>
          </button>

          <button
            type="button"
            onclick={() => (activeFilter = "tasks")}
            class="px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer {activeFilter === 'tasks'
              ? 'bg-(--paper) text-(--ink) font-semibold border border-(--line) shadow-xs'
              : 'text-(--muted) hover:text-(--ink)'}"
          >
            Manual Goals ({todos.length})
          </button>
        </div>

        <!-- Guest Connection Prompt Banner if not logged in -->
        {#if !currentUser}
          <div class="p-3 rounded-xl bg-(--paper) border border-(--line) flex items-center justify-between gap-3 mb-3 shrink-0">
            <div class="flex items-center gap-2.5 min-w-0">
              <div class="w-7 h-7 rounded-lg bg-(--accent)/15 border border-(--accent)/30 flex items-center justify-center shrink-0">
                <GoogleIcon class="w-3.5 h-3.5" />
              </div>
              <div class="min-w-0">
                <p class="text-xs font-semibold text-(--ink) m-0 truncate">
                  Google Calendar Sync
                </p>
                <p class="text-[10px] text-(--muted) m-0 truncate">
                  Connect to view today's meetings and activities automatically
                </p>
              </div>
            </div>

            <button
              type="button"
              onclick={handleSignInGoogle}
              class="btn btn-primary h-7 text-[11px] shrink-0 px-2.5 rounded-lg flex items-center gap-1 cursor-pointer"
            >
              <GoogleIcon class="w-3 h-3" />
              <span>Connect</span>
            </button>
          </div>
        {/if}

        <!-- Task Creation Form with Timebox Input -->
        <form onsubmit={handleAddTodo} class="space-y-2 mb-3 shrink-0">
          <div class="flex items-center gap-2">
            <input
              type="text"
              placeholder="Add custom milestone or task…"
              bind:value={newTodoTitle}
              class="flex-1 h-8.5 text-xs bg-(--surface) border border-(--line) rounded-lg px-2.5 text-(--ink) placeholder-(--muted) focus:outline-none focus:border-(--focus)"
            />
            <button
              type="submit"
              disabled={!newTodoTitle.trim()}
              class="btn border border-(--line) bg-(--surface) hover:bg-(--paper) disabled:opacity-40 text-(--ink) text-xs h-8.5 shrink-0 px-3.5 rounded-lg flex items-center gap-1 cursor-pointer"
            >
              <Plus class="w-3.5 h-3.5" />
              <span>Add</span>
            </button>
          </div>

          <!-- Timebox Inputs (Start Time -> End Time) -->
          {#if showTimeboxOptions}
            <div class="p-2.5 rounded-xl bg-(--paper) border border-(--line) space-y-2 text-xs">
              <div class="flex items-center justify-between text-[11px] text-(--muted)">
                <span class="flex items-center gap-1">
                  <Clock class="w-3 h-3 text-(--accent-text)" />
                  Time-blocking schedule:
                </span>
                <span class="font-mono text-(--accent-text) font-semibold">
                  {diffMinutesBetween(newStartTime, newEndTime)} minutes
                </span>
              </div>

              <div class="grid grid-cols-2 gap-2">
                <div>
                  <span class="text-[10px] text-(--muted) block mb-0.5">
                    Start Time
                  </span>
                  <input
                    type="time"
                    bind:value={newStartTime}
                    class="w-full h-7 bg-(--surface) border border-(--line) rounded-lg px-2 text-xs text-(--ink) font-mono"
                  />
                </div>
                <div>
                  <span class="text-[10px] text-(--muted) block mb-0.5">
                    End Time
                  </span>
                  <input
                    type="time"
                    bind:value={newEndTime}
                    class="w-full h-7 bg-(--surface) border border-(--line) rounded-lg px-2 text-xs text-(--ink) font-mono"
                  />
                </div>
              </div>

              <!-- Quick duration presets for task -->
              <div class="flex items-center gap-1.5 pt-1">
                {#each [25, 45, 60, 90] as dur}
                  <button
                    type="button"
                    onclick={() => {
                      const nowStr = formatClockTime(new Date());
                      newStartTime = nowStr;
                      newEndTime = addMinutesToTime(nowStr, dur);
                    }}
                    class="px-2 py-0.5 rounded bg-(--surface) hover:bg-(--paper) text-[10px] text-(--ink) border border-(--line) cursor-pointer"
                  >
                    +{dur}m
                  </button>
                {/each}
              </div>
            </div>
          {/if}
        </form>

        <!-- Schedule List Items (Unified Calendar + Tasks) -->
        <div class="flex-1 overflow-y-auto space-y-2 pr-1 min-h-35">
          {#if unifiedItems.length === 0}
            <div class="h-full flex flex-col items-center justify-center p-6 text-center text-xs text-(--muted) space-y-2.5 my-auto">
              <div class="w-12 h-12 rounded-2xl bg-(--accent)/10 border border-(--accent)/20 flex items-center justify-center text-(--accent) shadow-sm">
                <Calendar class="w-6 h-6 stroke-[1.8]" />
              </div>
              <div>
                <p class="font-semibold text-xs text-(--ink) m-0">
                  {activeFilter === "calendar"
                    ? "Không có lịch hẹn Google Calendar hôm nay"
                    : "Chưa có mục tiêu hoặc công việc nào"}
                </p>
                <p class="text-[11px] text-(--muted) mt-1 max-w-xs m-0">
                  {activeFilter === "calendar"
                    ? "Kết nối tài khoản Google để tự động đồng bộ lịch hẹn."
                    : "Thêm công việc vào ô phía trên để bắt đầu phiên tập trung."}
                </p>
              </div>
            </div>
          {:else}
            {#each unifiedItems as item (item.id)}
              {@const isActive = activeGoalId === item.id}
              {@const isGCal = item.source === "google-calendar"}
              <div
                class="group flex items-center justify-between p-2.5 rounded-xl border transition-all text-xs {isActive
                  ? 'bg-(--accent)/15 border-(--accent) shadow-sm ring-1 ring-(--accent)/30 text-(--ink)'
                  : item.is_completed
                  ? 'bg-(--paper) border-(--line) opacity-60 text-(--muted)'
                  : 'bg-(--paper) border-(--line) hover:border-(--focus) text-(--ink)'}"
              >
                <!-- Completion check & Title -->
                <div class="flex items-center gap-2.5 min-w-0 flex-1">
                  <button
                    type="button"
                    onclick={() => {
                      if (isGCal) {
                        handleToggleCalendarEvent(item.id);
                      } else {
                        handleToggleTodo(item.id);
                      }
                    }}
                    class="w-4.5 h-4.5 rounded-full flex items-center justify-center shrink-0 border transition-all cursor-pointer {item.is_completed
                      ? 'bg-(--success) border-(--success) text-(--accent-ink)'
                      : 'border-(--muted) group-hover:border-(--accent) bg-transparent'}"
                    title="Toggle completion"
                  >
                    {#if item.is_completed}
                      <Check class="w-2.5 h-2.5 stroke-[3]" />
                    {:else}
                      <Circle class="w-2.5 h-2.5 opacity-0" />
                    {/if}
                  </button>

                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1.5 flex-wrap">
                      {#if isGCal}
                        <span class="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-(--accent)/15 border border-(--accent)/30 text-[9px] font-semibold text-(--accent-text)">
                          <GoogleIcon class="w-2.5 h-2.5" />
                          G-Cal
                        </span>
                      {/if}
                      <p
                        class="truncate font-medium m-0 {item.is_completed
                          ? 'line-through text-(--muted)'
                          : 'text-(--ink)'}"
                      >
                        {item.title}
                      </p>
                    </div>

                    <!-- Timeblock indicator -->
                    <div class="flex items-center gap-2 mt-0.5 text-[10px] text-(--muted) font-mono">
                      {#if item.start_time || item.duration_minutes}
                        <div class="flex items-center gap-1">
                          <Clock class="w-3 h-3 text-(--accent)" />
                          <span>
                            {item.start_time && item.end_time
                              ? `${item.start_time} - ${item.end_time}`
                              : `${item.duration_minutes} min`}
                          </span>
                          {#if item.duration_minutes && item.start_time}
                            <span class="text-(--muted)">
                              ({item.duration_minutes}m)
                            </span>
                          {/if}
                        </div>
                      {/if}

                      {#if item.hangout_link}
                        <a
                          href={item.hangout_link}
                          target="_blank"
                          rel="noreferrer"
                          class="text-(--success) hover:opacity-80 flex items-center gap-0.5 transition-colors font-sans text-[10px]"
                          title="Open Google Meet link"
                        >
                          <Video class="w-3 h-3" />
                          <span>Meet</span>
                        </a>
                      {/if}
                    </div>
                  </div>
                </div>

                <!-- Right actions: Focus target button & Delete -->
                <div class="flex items-center gap-1.5 shrink-0 ml-2">
                  {#if !item.is_completed}
                    <button
                      type="button"
                      onclick={() => handleFocusGoal(item)}
                      class="px-2 py-1 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition-all cursor-pointer {isActive
                        ? 'bg-(--accent) text-(--accent-ink) font-bold shadow-sm'
                        : 'bg-(--surface) text-(--ink) hover:bg-(--accent)/20 hover:text-(--accent-text) border border-(--line)'}"
                      title="Focus on this event in the timer"
                    >
                      <Target class="w-3 h-3" />
                      <span>{isActive ? "Active" : "Focus"}</span>
                    </button>
                  {/if}

                  <button
                    type="button"
                    onclick={() => {
                      if (isGCal) {
                        handleDeleteCalendarEvent(item.id);
                      } else {
                        handleDeleteTodo(item.id);
                      }
                    }}
                    class="opacity-0 group-hover:opacity-100 text-(--muted) hover:text-(--error) p-1 rounded transition-opacity cursor-pointer shrink-0"
                    title="Remove item"
                  >
                    <Trash2 class="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            {/each}
          {/if}
        </div>
      </div>

      <!-- 4. Interactive Session Configuration Card with Real Clock Times -->
      <div class="panel p-4 sm:p-5 shadow-sm space-y-3 shrink-0">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5">
            <Settings class="w-3.5 h-3.5 text-(--muted)" />
            <span class="text-xs font-bold text-(--ink) uppercase tracking-wider block">
              Session Configuration & Clock
            </span>
          </div>

          {#if isIdle}
            <button
              type="button"
              onclick={handleOpenCustomModal}
              class="flex items-center gap-1 text-[11px] text-(--accent) hover:opacity-80 font-semibold transition-opacity cursor-pointer"
            >
              <Edit3 class="w-3 h-3" />
              <span>Setup Custom</span>
            </button>
          {/if}
        </div>

        <!-- Interactive Steppers Grid for Study and Break -->
        <div class="grid grid-cols-2 gap-2.5 text-xs">
          <!-- Study Duration Card with Stepper -->
          <div class="p-3 rounded-xl bg-(--paper) border border-(--line) flex flex-col justify-between">
            <span class="text-[10px] text-(--muted) block mb-1">
              Focus Duration
            </span>

            <div class="flex items-center justify-between gap-1 my-1">
              <span class="font-semibold text-(--ink) text-sm tabular-nums">
                {Math.round(status.study_duration / 60)} min
              </span>

              {#if isIdle}
                <div class="flex items-center gap-1">
                  <button
                    type="button"
                    onclick={() => handleStepStudy(-5)}
                    class="w-6 h-6 rounded-md bg-(--surface) hover:bg-(--paper) active:scale-95 text-(--ink) flex items-center justify-center transition-all cursor-pointer border border-(--line) shadow-xs"
                    title="Decrease focus by 5 minutes"
                  >
                    <Minus class="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onclick={() => handleStepStudy(5)}
                    class="w-6 h-6 rounded-md bg-(--surface) hover:bg-(--paper) active:scale-95 text-(--ink) flex items-center justify-center transition-all cursor-pointer border border-(--line) shadow-xs"
                    title="Increase focus by 5 minutes"
                  >
                    <Plus class="w-3 h-3" />
                  </button>
                </div>
              {:else}
                <span class="text-[9px] text-(--muted) uppercase font-mono">Locked</span>
              {/if}
            </div>
          </div>

          <!-- Rest Duration Card with Stepper -->
          <div class="p-3 rounded-xl bg-(--paper) border border-(--line) flex flex-col justify-between">
            <span class="text-[10px] text-(--muted) block mb-1">
              Rest Duration
            </span>

            <div class="flex items-center justify-between gap-1 my-1">
              <span class="font-semibold text-(--ink) text-sm tabular-nums">
                {status.break_duration >= 60
                  ? `${Math.round(status.break_duration / 60)} min`
                  : `${status.break_duration} sec`}
              </span>

              {#if isIdle}
                <div class="flex items-center gap-1">
                  <button
                    type="button"
                    onclick={() => handleStepBreak(-1)}
                    class="w-6 h-6 rounded-md bg-(--surface) hover:bg-(--paper) active:scale-95 text-(--ink) flex items-center justify-center transition-all cursor-pointer border border-(--line) shadow-xs"
                    title="Decrease break duration"
                  >
                    <Minus class="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onclick={() => handleStepBreak(1)}
                    class="w-6 h-6 rounded-md bg-(--surface) hover:bg-(--paper) active:scale-95 text-(--ink) flex items-center justify-center transition-all cursor-pointer border border-(--line) shadow-xs"
                    title="Increase break duration"
                  >
                    <Plus class="w-3 h-3" />
                  </button>
                </div>
              {:else}
                <span class="text-[9px] text-(--muted) uppercase font-mono">Locked</span>
              {/if}
            </div>
          </div>
        </div>

        <!-- Real Clock Timeline Indicator -->
        <div class="flex items-center justify-between p-2.5 rounded-xl bg-(--paper) text-[11px] text-(--muted) border border-(--line)">
          <div class="flex items-center gap-2">
            <Clock class="w-3.5 h-3.5 text-(--accent)" />
            <span>Session Timeline</span>
          </div>
          <span class="text-(--ink) font-mono text-[11px] font-semibold">
            {nowClockStr} ➔ {expectedEndClockStr}
          </span>
        </div>

        <div class="flex items-center justify-between p-2.5 rounded-xl bg-(--paper) text-[11px] text-(--muted) border border-(--line)">
          <div class="flex items-center gap-2">
            <Headphones class="w-3.5 h-3.5 text-(--accent)" />
            <span>Audio Ducking</span>
          </div>
          <span class="text-(--success) font-semibold font-mono">Automatic (15%)</span>
        </div>
      </div>
    </div>
  </div>

  <!-- 5. Custom Duration & Clock-Time Setup Modal -->
  <Modal
    open={isCustomModalOpen}
    onClose={() => (isCustomModalOpen = false)}
    title="Setup Focus Schedule & Durations"
    description="Configure focus sessions with real wall-clock start/end times and eye-rest intervals."
    confirmText="Apply Schedule & Durations"
    cancelText="Cancel"
    confirmVariant="primary"
    onConfirm={handleSaveCustomDurations}
  >
    {#snippet icon()}
      <SlidersHorizontal class="w-5 h-5 text-(--accent)" />
    {/snippet}

    <div class="space-y-4 pt-1">
      <!-- Real Wall-Clock Timeline Visual Strip -->
      <div class="p-3 rounded-xl bg-(--paper) border border-(--line) space-y-2">
        <span class="text-[11px] font-semibold text-(--ink) flex items-center gap-1.5">
          <Clock class="w-3.5 h-3.5 text-(--accent-text)" />
          <span>Real-Time Timeline Preview</span>
        </span>

        <div class="flex items-center gap-2 text-xs font-mono">
          <div class="flex-1 p-2 rounded-lg bg-(--accent)/15 border border-(--accent)/30 text-(--accent-text) text-center">
            <span class="block text-[10px] text-(--accent) uppercase font-sans font-semibold">
              Focus Session ({modalStudyMinutes}m)
            </span>
            <span class="font-bold">
              {modalStartTime} ➔ {modalEndTime}
            </span>
          </div>

          <ArrowRight class="w-4 h-4 text-(--muted) shrink-0" />

          <div class="flex-1 p-2 rounded-lg bg-(--accent)/15 border border-(--accent)/30 text-(--accent-text) text-center">
            <span class="block text-[10px] text-(--accent) uppercase font-sans font-semibold">
              Rest ({modalBreakVal}{breakUnit})
            </span>
            <span class="font-bold">
              {modalEndTime} ➔ {addMinutesToTime(
                modalEndTime,
                breakUnit === "min" ? modalBreakVal : 1
              )}
            </span>
          </div>
        </div>
      </div>

      <!-- Wall-Clock Pickers -->
      <div class="grid grid-cols-2 gap-3 pt-1">
        <div class="space-y-1">
          <span class="text-xs font-semibold text-(--ink)">
            Start Time
          </span>
          <input
            type="time"
            value={modalStartTime}
            oninput={(e) => handleModalStartTimeChange((e.target as HTMLInputElement).value)}
            class="w-full h-9 bg-(--paper) border border-(--line) rounded-lg px-3 text-sm text-(--ink) font-mono font-semibold"
          />
        </div>

        <div class="space-y-1">
          <span class="text-xs font-semibold text-(--ink)">
            End Time
          </span>
          <input
            type="time"
            value={modalEndTime}
            oninput={(e) => handleModalEndTimeChange((e.target as HTMLInputElement).value)}
            class="w-full h-9 bg-(--paper) border border-(--line) rounded-lg px-3 text-sm text-(--ink) font-mono font-semibold"
          />
        </div>
      </div>

      <!-- Focus Duration (Minutes) -->
      <div class="space-y-2">
        <div class="flex justify-between items-center text-xs">
          <span class="font-semibold text-(--ink)">
            Focus Duration (Minutes)
          </span>
          <span class="text-(--muted) font-mono text-[11px]">
            {modalStudyMinutes} min ({Math.round((modalStudyMinutes / 60) * 10) / 10}h)
          </span>
        </div>

        <input
          type="number"
          min="1"
          max="180"
          value={modalStudyMinutes}
          oninput={(e) => handleModalDurationChange(Number((e.target as HTMLInputElement).value))}
          class="w-full h-9 bg-(--surface) border border-(--line) rounded-lg px-3 font-mono font-semibold text-sm text-(--ink)"
        />

        <!-- Quick Chips for Focus -->
        <div class="flex items-center gap-1.5 flex-wrap pt-1">
          {#each [15, 25, 35, 45, 50, 60, 90] as m}
            <button
              type="button"
              onclick={() => handleModalDurationChange(m)}
              class="px-2.5 py-1 rounded-md text-[11px] border transition-all cursor-pointer {modalStudyMinutes === m
                ? 'bg-(--accent)/20 text-(--accent-text) border-(--accent)/40 font-semibold'
                : 'bg-(--paper) border-(--line) text-(--muted) hover:text-(--ink)'}"
            >
              {m}m
            </button>
          {/each}
        </div>
      </div>

      <!-- Break Duration Input with Unit Toggle -->
      <div class="space-y-2 pt-2 border-t border-(--line)">
        <div class="flex justify-between items-center text-xs">
          <span class="font-semibold text-(--ink)">
            Break Duration
          </span>

          <!-- Unit Toggle: Minutes vs Seconds -->
          <div class="inline-flex p-0.5 rounded-lg bg-(--paper) border border-(--line) text-[10px]">
            <button
              type="button"
              onclick={() => {
                if (breakUnit === "sec") {
                  modalBreakVal = Math.max(1, Math.round(modalBreakVal / 60));
                  breakUnit = "min";
                }
              }}
              class="px-2 py-0.5 rounded cursor-pointer transition-colors {breakUnit === 'min'
                ? 'bg-(--surface) text-(--ink) font-semibold shadow-xs'
                : 'text-(--muted) hover:text-(--ink)'}"
            >
              Minutes
            </button>
            <button
              type="button"
              onclick={() => {
                if (breakUnit === "min") {
                  modalBreakVal = modalBreakVal * 60;
                  breakUnit = "sec";
                }
              }}
              class="px-2 py-0.5 rounded cursor-pointer transition-colors {breakUnit === 'sec'
                ? 'bg-(--surface) text-(--ink) font-semibold shadow-xs'
                : 'text-(--muted) hover:text-(--ink)'}"
            >
              Seconds (Eye-Rest)
            </button>
          </div>
        </div>

        <input
          type="number"
          min={breakUnit === "min" ? 1 : 10}
          max={breakUnit === "min" ? 60 : 3600}
          value={modalBreakVal}
          oninput={(e) => {
            modalBreakVal = Number((e.target as HTMLInputElement).value);
            customError = null;
          }}
          class="w-full h-9 bg-(--surface) border border-(--line) rounded-lg px-3 font-mono font-semibold text-sm text-(--ink)"
        />

        <!-- Quick Chips for Break -->
        <div class="flex items-center gap-1.5 flex-wrap pt-1">
          {#if breakUnit === "min"}
            {#each [3, 5, 7, 10, 15, 20] as m}
              <button
                type="button"
                onclick={() => (modalBreakVal = m)}
                class="px-2.5 py-1 rounded-md text-[11px] border transition-all cursor-pointer {modalBreakVal === m
                  ? 'bg-(--accent)/20 text-(--accent-text) border-(--accent)/40 font-semibold'
                  : 'bg-(--paper) border-(--line) text-(--muted) hover:text-(--ink)'}"
              >
                {m}m
              </button>
            {/each}
          {:else}
            {#each [20, 30, 45, 60] as s}
              <button
                type="button"
                onclick={() => (modalBreakVal = s)}
                class="px-2.5 py-1 rounded-md text-[11px] border transition-all cursor-pointer {modalBreakVal === s
                  ? 'bg-(--accent)/20 text-(--accent-text) border-(--accent)/40 font-semibold'
                  : 'bg-(--paper) border-(--line) text-(--muted) hover:text-(--ink)'}"
              >
                {s}s
              </button>
            {/each}
          {/if}
        </div>
      </div>

      <!-- Validation Error Banner -->
      {#if customError}
        <div class="p-2.5 rounded-lg bg-(--error)/15 border border-(--error)/30 text-(--error) text-xs flex items-center gap-2">
          <AlertTriangle class="w-4 h-4 shrink-0 text-(--error)" />
          <span>{customError}</span>
        </div>
      {/if}
    </div>
  </Modal>

  <!-- 6. Confirmation Modal Before Stopping Active Session -->
  <Modal
    open={isStopModalOpen}
    onClose={() => (isStopModalOpen = false)}
    title="Stop Active Focus Session?"
    description="Are you sure you want to stop? Your countdown will be reset to idle and progress will be lost."
    confirmText="Stop Session"
    cancelText="Resume"
    confirmVariant="destructive"
    onConfirm={async () => {
      isStopModalOpen = false;
      await handleStopTimer();
    }}
  >
    {#snippet icon()}
      <AlertTriangle class="w-5 h-5 text-(--warning)" />
    {/snippet}
  </Modal>
</div>
