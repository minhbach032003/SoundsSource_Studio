import { useState, useEffect, useCallback, type FC } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { SideNavbar, type NavTab } from "@/components/navigation/SideNavbar";
import { MixerView } from "@/views/MixerView";
import { TimerView, type TimerStatus, type TodoItem } from "@/views/TimerView";
import { VoiceAiView } from "@/views/VoiceAiView";
import { AgentPetView } from "@/views/AgentPetView";
import { SettingsView } from "@/views/SettingsView";
import { useGoogleAuth } from "@/shared/lib/useGoogleAuth";
import { useWallpaper } from "@/shared/lib/useWallpaper";
import { useGoogleCalendar } from "@/shared/lib/useGoogleCalendar";
import { ButtonComponent, ToastProvider, useToast } from "@/shared/ui";
import { GoogleIcon } from "@/components/icons/GoogleIcon";
import { RefreshCw } from "lucide-react";
import { groupProcesses, processKey, displayName } from "@/audio";
import type { AudioProcess } from "@/audio";
import type { AudioDevice, Preset } from "@/components/DeviceQuickBar";

function isRunningInTauri(): boolean {
  if (typeof window === "undefined") return false;
  return (
    isTauri() ||
    !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ ||
    !!(window as unknown as { __TAURI__?: unknown }).__TAURI__
  );
}

const MOCK_PROCESSES: AudioProcess[] = [
  {
    pid: 14820,
    bundle_id: "com.spotify.client",
    name: "Spotify",
    object_id: 14820,
    is_running_output: true,
    is_regular_app: true,
  },
  {
    pid: 2841,
    bundle_id: "com.brave.Browser",
    name: "Brave Browser",
    object_id: 2841,
    is_running_output: true,
    is_regular_app: true,
  },
  {
    pid: 8932,
    bundle_id: "com.hnc.Discord",
    name: "Discord",
    object_id: 8932,
    is_running_output: false,
    is_regular_app: true,
  },
  {
    pid: 4210,
    bundle_id: "com.apple.logic10",
    name: "Logic Pro",
    object_id: 4210,
    is_running_output: false,
    is_regular_app: true,
  },
];

const MOCK_DEVICES: AudioDevice[] = [
  { name: "MacBook Pro Speakers", uid: "builtin_speaker", is_default: true },
  { name: "External Studio Monitors", uid: "usb_dac", is_default: false },
  { name: "AirPods Pro", uid: "airpods_pro", is_default: false },
];

const MOCK_PRESETS: Preset[] = [
  { name: "Flat (Default)", is_default: true },
  { name: "Bass Boost", is_default: false },
  { name: "Vocal Clarity", is_default: false },
  { name: "Electronic / Dance", is_default: false },
];

const INITIAL_TIMER_STATUS: TimerStatus = {
  phase: "idle",
  remaining_seconds: 1500,
  study_duration: 1500,
  break_duration: 300,
  completed_sessions: 0,
  is_ducked: false,
};

const INITIAL_TODOS: TodoItem[] = [
  {
    id: "task-1",
    title: "Review CoreAudio aggregate device setup",
    is_completed: true,
    start_time: "15:00",
    end_time: "15:30",
    duration_minutes: 30,
  },
  {
    id: "task-2",
    title: "Calibrate 10-band parametric EQ curves",
    is_completed: false,
    start_time: "16:00",
    end_time: "16:45",
    duration_minutes: 45,
  },
];

interface ChannelStateDto {
  volume: number;
  muted: boolean;
  target_device_uid?: string | null;
}

const AppContent: FC = () => {
  const [activeTab, setActiveTab] = useState<NavTab>("mixer");
  const { user, isLoading: isLoadingAuth, signInWithGoogle, signOut } = useGoogleAuth();
  const {
    events: calendarEvents,
    isLoading: isLoadingCalendar,
    syncCalendar,
    toggleEventComplete: toggleCalendarEventComplete,
    deleteEvent: deleteCalendarEvent,
  } = useGoogleCalendar(user);
  const {
    wallpaper,
    setPreset: setWallpaperPreset,
    setDim: setWallpaperDim,
    setBlur: setWallpaperBlur,
    resetToDefault: resetWallpaperToDefault,
    uploadCustomImage: uploadWallpaperImage,
    backgroundStyle,
  } = useWallpaper();
  const { showToast } = useToast();

  const isDesktop = isRunningInTauri();

  // Audio Mixer State
  const [processes, setProcesses] = useState<AudioProcess[]>(() =>
    isDesktop ? [] : groupProcesses(MOCK_PROCESSES)
  );
  const [channelState, setChannelState] = useState<
    Record<string, { volume: number; muted: boolean }>
  >(() =>
    (isDesktop
      ? {}
      : {
          "com.spotify.client": { volume: 85, muted: false },
          "com.brave.Browser": { volume: 60, muted: false },
          "com.hnc.Discord": { volume: 100, muted: false },
        }) as Record<string, { volume: number; muted: boolean }>
  );

  const [onlyPlaying, setOnlyPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(isDesktop);
  const [error, setError] = useState<string | null>(null);

  const [devices, setDevices] = useState<AudioDevice[]>(() =>
    isDesktop ? [] : MOCK_DEVICES
  );
  const [presets, setPresets] = useState<Preset[]>(() =>
    isDesktop ? [] : MOCK_PRESETS
  );
  const [selectedDevice, setSelectedDevice] = useState<string>(() =>
    isDesktop ? "" : MOCK_DEVICES[0].uid
  );
  const [selectedPreset, setSelectedPreset] = useState<string>(() =>
    isDesktop ? "" : MOCK_PRESETS[0].name
  );

  // System Hardware Audio States
  const [masterVolume, setMasterVolume] = useState<number>(100);
  const [isMasterMuted, setIsMasterMuted] = useState<boolean>(false);
  const [inputVolume, setInputVolume] = useState<number>(85);
  const [systemSoundsVolume, setSystemSoundsVolume] = useState<number>(70);

  // Timer & Todo State
  const [timerStatus, setTimerStatus] = useState<TimerStatus>(INITIAL_TIMER_STATUS);
  const [todos, setTodos] = useState<TodoItem[]>(INITIAL_TODOS);

  // Poll timer status
  const pollTimer = useCallback(async () => {
    if (isDesktop) {
      try {
        const res = await invoke<TimerStatus>("get_break_timer_status");
        setTimerStatus(res);
      } catch {
        // Ignore background timer poll error
      }
    } else {
      // Browser preview simulated countdown
      setTimerStatus((prev) => {
        if (prev.phase === "idle") return prev;
        if (prev.remaining_seconds > 1) {
          const nextRemaining = prev.remaining_seconds - 1;
          const nextPhase =
            prev.phase === "studying" && nextRemaining <= 10
              ? "warning"
              : prev.phase;
          return { ...prev, phase: nextPhase, remaining_seconds: nextRemaining };
        } else if (prev.phase === "warning" || prev.phase === "studying") {
          // Transition to break
          showToast("info", "Eye-rest break started! Audio ducked.");
          return {
            ...prev,
            phase: "breaking",
            remaining_seconds: prev.break_duration,
            is_ducked: true,
          };
        } else if (prev.phase === "breaking") {
          // End break -> loop back to studying
          showToast("success", "Break complete! Resuming focus session.");
          return {
            ...prev,
            phase: "studying",
            remaining_seconds: prev.study_duration,
            completed_sessions: prev.completed_sessions + 1,
            is_ducked: false,
          };
        }
        return prev;
      });
    }
  }, [isDesktop, showToast]);

  useEffect(() => {
    const timerId = setInterval(pollTimer, 1000);
    return () => clearInterval(timerId);
  }, [pollTimer]);

  // Periodic background audio process & playing status polling (every 1.5 seconds)
  useEffect(() => {
    if (!isDesktop) return;

    const pollAudioProcesses = async () => {
      // Suspend background polling when document is hidden to conserve RAM & CPU
      if (typeof document !== "undefined" && document.hidden) return;

      try {
        const raw = await invoke<AudioProcess[]>("get_audio_processes");
        const grouped = groupProcesses(raw);
        setProcesses((prev) => {
          const hasChanged =
            prev.length !== grouped.length ||
            prev.some((p, i) => {
              const g = grouped[i];
              return (
                !g ||
                p.is_running_output !== g.is_running_output ||
                p.pid !== g.pid ||
                p.bundle_id !== g.bundle_id
              );
            });
          return hasChanged ? grouped : prev;
        });
      } catch {
        // Ignore background poll errors
      }
    };

    const intervalId = setInterval(pollAudioProcesses, 1500);
    return () => clearInterval(intervalId);
  }, [isDesktop]);

  // Adaptive background memory trimming on window blur/minimize
  useEffect(() => {
    if (!isDesktop) return;

    const handleVisibilityChange = async () => {
      const isHidden = typeof document !== "undefined" && document.hidden;
      try {
        await invoke("set_background_mode", { enabled: isHidden });
        if (isHidden) {
          await invoke("trim_memory");
        } else {
          loadProcesses(false);
        }
      } catch {
        // Fallback
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isDesktop]);

  const loadProcesses = useCallback(async (showFeedback = false) => {
    setIsLoading(true);
    setError(null);

    if (!isDesktop) {
      setTimeout(() => {
        setProcesses(groupProcesses(MOCK_PROCESSES));
        setIsLoading(false);
        if (showFeedback) showToast("info", "Audio applications refreshed");
      }, 350);
      return;
    }

    try {
      const [raw, channels] = await Promise.all([
        invoke<AudioProcess[]>("get_audio_processes"),
        invoke<Record<string, ChannelStateDto>>("get_channel_states").catch(
          () => ({} as Record<string, ChannelStateDto>)
        ),
      ]);
      const grouped = groupProcesses(raw);
      setProcesses(grouped);
      setChannelState((prev) => {
        const next = { ...prev };
        for (const [bundleId, state] of Object.entries(channels)) {
          next[bundleId] = {
            volume: Math.round(state.volume * 100),
            muted: state.muted,
          };
        }
        return next;
      });
      if (showFeedback) showToast("info", `Discovered ${grouped.length} audio applications`);
    } catch {
      setError("CoreAudio application discovery failed. Please refresh.");
      showToast("error", "CoreAudio discovery failed");
    } finally {
      setIsLoading(false);
    }
  }, [isDesktop, showToast]);

  const loadConfiguration = useCallback(async () => {
    if (!isDesktop) {
      setDevices(MOCK_DEVICES);
      setPresets(MOCK_PRESETS);
      setSelectedDevice(MOCK_DEVICES[0].uid);
      setSelectedPreset(MOCK_PRESETS[0].name);
      return;
    }

    try {
      const devList = await invoke<AudioDevice[]>("get_audio_devices");
      setDevices(devList);
      const defDev = devList.find((d) => d.is_default) || devList[0];
      if (defDev) setSelectedDevice(defDev.uid);
    } catch {
      setError("Couldn't load audio devices.");
    }

    try {
      const preList = await invoke<Preset[]>("get_presets");
      setPresets(preList);
      const defPre = preList.find((p) => p.is_default) || preList[0];
      if (defPre) setSelectedPreset(defPre.name);
    } catch {
      setError("Couldn't load saved presets.");
    }

    try {
      const sysSettings = await invoke<{
        output_volume: number;
        output_muted: boolean;
        input_volume: number;
        alert_volume: number;
      }>("get_system_volume_settings");
      if (sysSettings) {
        setMasterVolume(Math.round(sysSettings.output_volume * 100));
        setIsMasterMuted(sysSettings.output_muted);
        setInputVolume(Math.round(sysSettings.input_volume * 100));
        setSystemSoundsVolume(Math.round(sysSettings.alert_volume * 100));
      }
    } catch {
      // Ignore system volume fetch errors
    }

    try {
      const initialTimer = await invoke<TimerStatus>("get_break_timer_status");
      setTimerStatus(initialTimer);
      const initialTodos = await invoke<TodoItem[]>("get_todo_items");
      setTodos(initialTodos);
    } catch {
      // Ignore initial timer fetch on start
    }
  }, [isDesktop]);

  useEffect(() => {
    void loadProcesses().then(loadConfiguration);
  }, [loadProcesses, loadConfiguration]);

  // Audio Handlers
  const handleVolumeCommit = async (process: AudioProcess, volume: number) => {
    if (!process.bundle_id) return;
    const key = processKey(process);
    const name = displayName(process);

    if (isDesktop) {
      await invoke("set_app_volume", {
        bundleId: process.bundle_id,
        volume: volume / 100,
      });
    }

    setChannelState((prev) => ({
      ...prev,
      [key]: { volume, muted: prev[key]?.muted ?? false },
    }));

    showToast("success", `${name} volume set to ${volume}%`);
  };

  const handleMuteToggle = async (process: AudioProcess, muted: boolean) => {
    if (!process.bundle_id) return;
    const key = processKey(process);
    const name = displayName(process);

    if (isDesktop) {
      await invoke("set_app_mute", {
        bundleId: process.bundle_id,
        muted,
      });
    }

    setChannelState((prev) => ({
      ...prev,
      [key]: { volume: prev[key]?.volume ?? 100, muted },
    }));

    showToast("info", `${name} ${muted ? "muted" : "unmuted"}`);
  };

  const handleSelectDevice = async (uid: string) => {
    setSelectedDevice(uid);
    const dev = devices.find((d) => d.uid === uid);
    if (isDesktop) {
      try {
        await invoke("set_default_output_device", { deviceUid: uid });
      } catch {
        // Fallback
      }
    }
    if (dev) showToast("info", `Audio output routed to ${dev.name}`);
  };

  const handleMasterVolumeCommit = async (vol: number) => {
    setMasterVolume(vol);
    if (isDesktop) {
      try {
        await invoke("set_master_volume", { volume: vol / 100 });
      } catch {
        // Fallback
      }
    }
    showToast("info", `Master output volume set to ${vol}%`);
  };

  const handleMasterMuteToggle = async () => {
    const next = !isMasterMuted;
    setIsMasterMuted(next);
    if (isDesktop) {
      try {
        await invoke("set_master_mute", { muted: next });
      } catch {
        // Fallback
      }
    }
    showToast("info", next ? "Master output muted" : "Master output unmuted");
  };

  const handleInputVolumeCommit = async (vol: number) => {
    setInputVolume(vol);
    if (isDesktop) {
      try {
        await invoke("set_input_volume", { volume: vol / 100 });
      } catch {
        // Fallback
      }
    }
    showToast("info", `Microphone input gain set to ${vol}%`);
  };

  const handleSystemSoundsVolumeCommit = async (vol: number) => {
    setSystemSoundsVolume(vol);
    if (isDesktop) {
      try {
        await invoke("set_system_sounds_volume", { volume: vol / 100 });
      } catch {
        // Fallback
      }
    }
    showToast("info", `System alerts volume set to ${vol}%`);
  };

  const handleSelectPreset = (name: string) => {
    setSelectedPreset(name);
    showToast("success", `Audio preset applied: ${name}`);
  };

  const handleRouteChange = (process: AudioProcess, deviceUid: string) => {
    const name = displayName(process);
    const targetDev = devices.find((d) => d.uid === deviceUid);
    const devName = targetDev ? targetDev.name : "System Default";
    showToast("info", `Routed ${name} audio to ${devName}`);
  };

  const handleEQBandChange = async (bandIndex: number, gainDb: number) => {
    if (isDesktop && processes.length > 0) {
      try {
        // Apply EQ to active playing processes
        const active = processes.filter((p) => p.is_running_output && p.bundle_id);
        for (const p of active) {
          await invoke("set_app_eq_band", {
            bundleId: p.bundle_id,
            bandIndex,
            gainDb,
          });
        }
      } catch {
        // Ignore minor EQ update errors
      }
    }
  };

  // Timer Handlers
  const handleStartTimer = async () => {
    if (isDesktop) {
      const res = await invoke<TimerStatus>("start_break_timer");
      setTimerStatus(res);
    } else {
      setTimerStatus((prev) => ({
        ...prev,
        phase: "studying",
        remaining_seconds: prev.study_duration,
      }));
    }
    showToast("success", "Deep focus session started!");
  };

  const handleStopTimer = async () => {
    if (isDesktop) {
      const res = await invoke<TimerStatus>("stop_break_timer");
      setTimerStatus(res);
    } else {
      setTimerStatus((prev) => ({
        ...prev,
        phase: "idle",
        remaining_seconds: prev.study_duration,
        is_ducked: false,
      }));
    }
    showToast("info", "Focus timer reset to idle.");
  };

  const handleSkipTimer = async () => {
    if (isDesktop) {
      const res = await invoke<TimerStatus>("skip_break_timer");
      setTimerStatus(res);
    } else {
      setTimerStatus((prev) => ({
        ...prev,
        phase: "studying",
        remaining_seconds: prev.study_duration,
        completed_sessions: prev.completed_sessions + 1,
        is_ducked: false,
      }));
    }
    showToast("info", "Break skipped. Resuming focus session.");
  };

  const handleSnoozeTimer = async () => {
    if (isDesktop) {
      const res = await invoke<TimerStatus>("snooze_break_timer");
      setTimerStatus(res);
    } else {
      setTimerStatus((prev) => ({
        ...prev,
        phase: "studying",
        remaining_seconds: 300,
      }));
    }
    showToast("success", "Break snoozed by +5 minutes.");
  };

  const handleSetDurations = async (studySec: number, breakSec: number) => {
    if (isDesktop) {
      const res = await invoke<TimerStatus>("set_timer_durations", {
        studySec,
        breakSec,
      });
      setTimerStatus(res);
    } else {
      setTimerStatus((prev) => ({
        ...prev,
        study_duration: studySec,
        break_duration: breakSec,
        remaining_seconds: studySec,
      }));
    }
    const studyM = Math.round(studySec / 60);
    const breakM = breakSec >= 60 ? `${Math.round(breakSec / 60)}m` : `${breakSec}s`;
    showToast("success", `Timer set to ${studyM}m study / ${breakM} break`);
  };

  // Todo Handlers
  const handleAddTodo = async (
    title: string,
    startTime?: string,
    endTime?: string,
    durationMinutes?: number
  ) => {
    if (isDesktop) {
      const res = await invoke<TodoItem[]>("add_todo_item", {
        title,
        startTime: startTime || null,
        endTime: endTime || null,
        durationMinutes: durationMinutes || null,
      });
      setTodos(res);
    } else {
      const newItem: TodoItem = {
        id: `task-${Date.now()}`,
        title,
        is_completed: false,
        start_time: startTime,
        end_time: endTime,
        duration_minutes: durationMinutes,
      };
      setTodos((prev) => [...prev, newItem]);
    }
    const timeInfo = startTime && endTime ? ` (${startTime} - ${endTime})` : "";
    showToast("success", `Task added: "${title}"${timeInfo}`);
  };

  const handleToggleTodo = async (id: string) => {
    if (isDesktop) {
      const res = await invoke<TodoItem[]>("toggle_todo_item", { id });
      setTodos(res);
    } else {
      setTodos((prev) =>
        prev.map((it) => (it.id === id ? { ...it, is_completed: !it.is_completed } : it))
      );
    }
    showToast("info", "Task status updated");
  };

  const handleDeleteTodo = async (id: string) => {
    if (isDesktop) {
      const res = await invoke<TodoItem[]>("delete_todo_item", { id });
      setTodos(res);
    } else {
      setTodos((prev) => prev.filter((it) => it.id !== id));
    }
    showToast("info", "Task removed");
  };

  const handleSignInGoogle = async () => {
    await signInWithGoogle();
    showToast("success", "Signed in with Google successfully!");
  };

  const handleSignOutGoogle = () => {
    signOut();
    showToast("info", "Signed out of Google Account");
  };

  const handleSettingChange = (setting: string, val: string) => {
    showToast("success", `${setting} updated: ${val}`);
  };

  return (
    <div className="flex h-screen bg-[#0b0f14] text-slate-100 font-sans overflow-hidden relative">
      {/* 0. Ambient Background Wallpaper Layer */}
      <div
        className="fixed inset-0 pointer-events-none z-0 transition-all duration-700 ease-out origin-center"
        style={{
          ...backgroundStyle,
          filter: `blur(${wallpaper.blur}px)`,
          transform: "scale(1.08)",
        }}
      />
      {/* Dynamic Contrast Dimming Overlay */}
      <div
        className="fixed inset-0 pointer-events-none z-0 transition-opacity duration-500 ease-out bg-[#0b0f14]"
        style={{
          opacity: wallpaper.dim,
        }}
      />

      {/* 1. Left Side Navigation Rail */}
      <div className="relative z-10 flex h-full shrink-0">
        <SideNavbar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          user={user}
          isEngineReady={true}
        />
      </div>

      {/* 2. Main Content Viewport */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden min-w-0 relative z-10">
        {/* Single Unified Header Toolbar */}
        <header className="h-13 px-5 border-b border-white/8 flex items-center justify-between shrink-0 bg-[#0e1218]/80 backdrop-blur-md z-20">
          <div>
            <h1 className="text-sm font-bold text-slate-100 tracking-tight m-0">
              {activeTab === "mixer"
                ? "Audio Mixer"
                : activeTab === "timer"
                ? "Focus Timer"
                : activeTab === "voice"
                ? "Voice AI 1:1"
                : activeTab === "pet"
                ? "Agent Pet Companion"
                : "Settings & Account"}
            </h1>
            <p className="text-[11px] text-slate-400 m-0 mt-0.5">
              {activeTab === "mixer"
                ? "Per-application CoreAudio stream routing & volume control"
                : activeTab === "timer"
                ? "Pomodoro timing with smart audio ducking"
                : activeTab === "voice"
                ? "Real-time conversational voice assistant"
                : activeTab === "pet"
                ? "Virtual companion responding to coding workflows"
                : "Preferences, cloud sync, and socket connections"}
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {activeTab === "mixer" && (
              <ButtonComponent
                id="refresh-btn"
                variant="outline"
                size="sm"
                onClick={() => loadProcesses(true)}
                disabled={isLoading}
                leftIcon={
                  <RefreshCw
                    className={
                      isLoading
                        ? "animate-spin text-sky-400 w-3.5 h-3.5"
                        : "text-slate-400 w-3.5 h-3.5"
                    }
                  />
                }
              >
                Refresh
              </ButtonComponent>
            )}

            {user ? (
              <button
                onClick={() => setActiveTab("settings")}
                className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-white/4 border border-white/8 text-[11px] text-slate-300 hover:bg-white/8 transition-colors cursor-pointer shadow-sm"
                title="Account Settings"
              >
                <GoogleIcon className="w-3.5 h-3.5" />
                <span className="font-semibold truncate max-w-[120px]">{user.name}</span>
              </button>
            ) : (
              <ButtonComponent
                variant="outline"
                size="sm"
                onClick={handleSignInGoogle}
                loading={isLoadingAuth}
                leftIcon={<GoogleIcon className="w-3.5 h-3.5" />}
                className="text-[11px] h-7.5 bg-white/5 hover:bg-white/10 border-white/10"
              >
                Sign In
              </ButtonComponent>
            )}
          </div>
        </header>

        {/* Scrollable View Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-7 flex flex-col min-w-0">
          {activeTab === "mixer" && (
            <MixerView
              processes={processes}
              channelState={channelState}
              devices={devices}
              presets={presets}
              selectedDevice={selectedDevice}
              selectedPreset={selectedPreset}
              masterVolume={masterVolume}
              onMasterVolumeCommit={handleMasterVolumeCommit}
              isMasterMuted={isMasterMuted}
              onMasterMuteToggle={handleMasterMuteToggle}
              inputVolume={inputVolume}
              onInputVolumeCommit={handleInputVolumeCommit}
              systemVolume={systemSoundsVolume}
              onSystemVolumeCommit={handleSystemSoundsVolumeCommit}
              onlyPlaying={onlyPlaying}
              isLoading={isLoading}
              error={error}
              onSelectDevice={handleSelectDevice}
              onSelectPreset={handleSelectPreset}
              onToggleOnlyPlaying={setOnlyPlaying}
              onVolumeCommit={handleVolumeCommit}
              onMuteToggle={handleMuteToggle}
              onRouteChange={handleRouteChange}
              onEQBandChange={handleEQBandChange}
              onError={(msg) => {
                setError(msg);
                showToast("error", msg);
              }}
            />
          )}

          {activeTab === "timer" && (
            <TimerView
              status={timerStatus}
              todos={todos}
              user={user}
              calendarEvents={calendarEvents}
              isLoadingCalendar={isLoadingCalendar}
              onStart={handleStartTimer}
              onStop={handleStopTimer}
              onSkip={handleSkipTimer}
              onSnooze={handleSnoozeTimer}
              onSetDurations={handleSetDurations}
              onAddTodo={handleAddTodo}
              onToggleTodo={handleToggleTodo}
              onDeleteTodo={handleDeleteTodo}
              onSyncCalendar={async () => {
                const res = await syncCalendar();
                if (res.success) {
                  showToast("success", `Google Calendar synced (${res.count} events today)`);
                } else {
                  showToast("info", "Connect Google account to sync calendar");
                }
              }}
              onSignInGoogle={handleSignInGoogle}
              onToggleCalendarEvent={(id) => {
                toggleCalendarEventComplete(id);
                showToast("info", "Calendar event status updated");
              }}
              onDeleteCalendarEvent={(id) => {
                deleteCalendarEvent(id);
                showToast("info", "Calendar event removed from view");
              }}
            />
          )}

          {activeTab === "voice" && (
            <VoiceAiView
              user={user}
              onSignInGoogle={handleSignInGoogle}
            />
          )}

          {activeTab === "pet" && <AgentPetView />}

          {activeTab === "settings" && (
            <SettingsView
              user={user}
              isLoadingAuth={isLoadingAuth}
              wallpaper={wallpaper}
              onSetWallpaperPreset={(id) => {
                setWallpaperPreset(id);
                showToast("success", `Wallpaper preset applied: ${id}`);
              }}
              onSetWallpaperDim={(dim) => {
                setWallpaperDim(dim);
              }}
              onSetWallpaperBlur={(blur) => {
                setWallpaperBlur(blur);
              }}
              onUploadWallpaper={async (file) => {
                const res = await uploadWallpaperImage(file);
                if (res.success) {
                  showToast("success", "Custom wallpaper uploaded and applied!");
                } else {
                  showToast("error", res.error || "Failed to upload image");
                }
                return res;
              }}
              onResetWallpaper={() => {
                resetWallpaperToDefault();
                showToast("info", "Wallpaper reset to Default Obsidian theme");
              }}
              onSignInGoogle={handleSignInGoogle}
              onSignOutGoogle={handleSignOutGoogle}
              onSettingChange={handleSettingChange}
              showToast={showToast}
            />
          )}
        </main>
      </div>
    </div>
  );
};

export const App: FC = () => {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
};
