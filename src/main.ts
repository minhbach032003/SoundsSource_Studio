import { invoke, isTauri } from "@tauri-apps/api/core";
import { displayName, groupProcesses, processKey } from "./audio";
import type { AudioProcess } from "./audio";

interface AudioDevice { name: string; uid: string; is_default: boolean }
interface Preset { name: string; is_default: boolean }
const container = document.querySelector<HTMLDivElement>("#process-list")!;
const feedback = document.querySelector<HTMLDivElement>("#feedback")!;
const refresh = document.querySelector<HTMLButtonElement>("#refresh-btn")!;
const channelState = new Map<string, { volume: number; muted: boolean }>();
let processes: AudioProcess[] = [];
let onlyPlaying = false;

function showError(message: string) {
  feedback.textContent = message;
  feedback.hidden = false;
}

function showEmpty(title: string, message: string) {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  const heading = document.createElement("strong");
  heading.textContent = title;
  const body = document.createElement("p");
  body.textContent = message;
  empty.append(heading, body);
  container.replaceChildren(empty);
}

const speakerIcon = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const mutedIcon = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Zm5 4 5 6m0-6-5 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function renderProcesses() {
  container.replaceChildren();
  const visible = processes.filter((process) => !onlyPlaying || process.is_running_output);
  document.querySelector("#app-count")!.textContent = String(visible.length);
  if (!visible.length) {
    showEmpty(onlyPlaying ? "Nothing playing right now" : "No audio applications found", "Play audio in an application, then refresh the list.");
    return;
  }
  for (const process of visible) {
    const name = displayName(process);
    const key = processKey(process);
    const state = channelState.get(key) || { volume: 100, muted: false };
    channelState.set(key, state);
    const row = document.createElement("article");
    row.className = "process-row";
    const header = document.createElement("div");
    header.className = "process-header";
    const avatar = document.createElement("span");
    avatar.className = "app-avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = name.slice(0, 2).toUpperCase();
    const label = document.createElement("div");
    label.className = "process-name";
    const title = document.createElement("h3");
    title.className = "process-title";
    title.textContent = name;
    const detail = document.createElement("p");
    detail.className = "process-detail";
    detail.textContent = process.bundle_id || `PID ${process.pid} · No application identifier`;
    label.append(title, detail);
    header.append(avatar, label);
    if (process.is_running_output) {
      const playing = document.createElement("span");
      playing.className = "playing";
      playing.textContent = "Playing";
      header.append(playing);
    }
    const controls = document.createElement("div");
    controls.className = "process-controls";
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.value = String(state.volume);
    slider.style.setProperty("--level", `${state.volume}%`);
    slider.className = "volume-slider";
    slider.setAttribute("aria-label", `${name} volume`);
    slider.disabled = !process.bundle_id;
    const output = document.createElement("output");
    output.className = "volume-value";
    output.textContent = `${state.volume}%`;
    slider.addEventListener("input", () => {
      output.textContent = `${slider.value}%`;
      slider.style.setProperty("--level", `${slider.value}%`);
    });
    // Commit on release/key action, not one concurrent IPC call per pointer pixel.
    slider.addEventListener("change", async () => {
      slider.disabled = true;
      try {
        await invoke("set_app_volume", { bundleId: process.bundle_id, volume: Number(slider.value) / 100 });
        state.volume = Number(slider.value);
      } catch {
        slider.value = String(state.volume);
        slider.style.setProperty("--level", `${state.volume}%`);
        output.textContent = `${state.volume}%`;
        showError(`Couldn't update ${name}'s volume. Please try again.`);
      } finally { slider.disabled = !process.bundle_id; }
    });
    const mute = document.createElement("button");
    mute.className = "mute-btn";
    mute.disabled = !process.bundle_id;
    function updateMute() {
      mute.innerHTML = state.muted ? mutedIcon : speakerIcon;
      mute.setAttribute("aria-pressed", String(state.muted));
      mute.setAttribute("aria-label", `${state.muted ? "Unmute" : "Mute"} ${name}`);
      mute.title = state.muted ? "Unmute" : "Mute";
      row.classList.toggle("is-muted", state.muted);
    }
    updateMute();
    mute.addEventListener("click", async () => {
      mute.disabled = true;
      try {
        await invoke("set_app_mute", { bundleId: process.bundle_id, muted: !state.muted });
        state.muted = !state.muted;
        updateMute();
      } catch { showError(`Couldn't update ${name}'s mute state. Please try again.`); }
      finally { mute.disabled = !process.bundle_id; }
    });
    controls.append(slider, output, mute);
    row.append(header, controls);
    container.append(row);
  }
}

async function loadProcesses() {
  refresh.disabled = true;
  feedback.hidden = true;
  container.setAttribute("aria-busy", "true");
  try {
    processes = groupProcesses(await invoke<AudioProcess[]>("get_audio_processes"));
    renderProcesses();
  } catch {
    showEmpty("Couldn't load applications", "Use the refresh button to try again.");
    showError("CoreAudio application discovery failed. Please refresh.");
  } finally {
    refresh.disabled = false;
    container.setAttribute("aria-busy", "false");
  }
}

async function loadConfiguration() {
  const devices = document.querySelector<HTMLSelectElement>("#output-device-select")!;
  const presets = document.querySelector<HTMLSelectElement>("#preset-select")!;
  await Promise.all([
    invoke<AudioDevice[]>("get_audio_devices").then((items) => {
      devices.replaceChildren(...items.map((item) => new Option(item.name, item.uid, item.is_default, item.is_default)));
      if (!items.length) devices.add(new Option("No devices found"));
    }).catch(() => { devices.replaceChildren(new Option("Devices unavailable")); showError("Couldn't load audio devices. Reopen the app to retry."); }),
    invoke<Preset[]>("get_presets").then((items) => {
      presets.replaceChildren(...items.map((item) => new Option(item.name, item.name, item.is_default, item.is_default)));
      if (!items.length) presets.add(new Option("No saved presets"));
    }).catch(() => { presets.replaceChildren(new Option("Presets unavailable")); showError("Couldn't load saved presets. Reopen the app to retry."); }),
  ]);
}

refresh.addEventListener("click", loadProcesses);
for (const [id, playing] of [["filter-all", false], ["filter-playing", true]] as const) {
  document.getElementById(id)!.addEventListener("click", () => {
    onlyPlaying = playing;
    document.querySelector("#filter-all")!.setAttribute("aria-pressed", String(!playing));
    document.querySelector("#filter-playing")!.setAttribute("aria-pressed", String(playing));
    renderProcesses();
  });
}

if (isTauri()) {
  void loadProcesses().then(loadConfiguration);
} else {
  container.setAttribute("aria-busy", "false");
  showEmpty("Open the desktop app", "Run pnpm tauri dev to discover your Mac's audio applications.");
  document.querySelector<HTMLSelectElement>("#output-device-select")!.replaceChildren(new Option("Available in desktop app"));
  document.querySelector<HTMLSelectElement>("#preset-select")!.replaceChildren(new Option("Available in desktop app"));
  refresh.disabled = true;
}
