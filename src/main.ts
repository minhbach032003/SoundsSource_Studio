import { invoke } from "@tauri-apps/api/core";

interface AudioProcess {
  object_id: number;
  pid: number;
  bundle_id: string;
  name: string;
  is_running_output: boolean;
  is_regular_app: boolean;
}

interface AudioDevice {
  id: number;
  name: string;
  uid: string;
  is_default: boolean;
}

interface Preset {
  name: string;
  is_default: boolean;
}

async function loadDevices() {
  const select = document.getElementById("output-device-select") as HTMLSelectElement;
  try {
    const devices = await invoke<AudioDevice[]>("get_audio_devices");
    select.innerHTML = "";
    devices.forEach((dev) => {
      const option = document.createElement("option");
      option.value = dev.uid;
      option.textContent = `${dev.name} ${dev.is_default ? "(Default)" : ""}`;
      if (dev.is_default) option.selected = true;
      select.appendChild(option);
    });
  } catch (err) {
    console.error("Failed to load devices", err);
  }
}

async function loadPresets() {
  const select = document.getElementById("preset-select") as HTMLSelectElement;
  try {
    const presets = await invoke<Preset[]>("get_presets");
    select.innerHTML = "";
    presets.forEach((preset) => {
      const option = document.createElement("option");
      option.value = preset.name;
      option.textContent = `${preset.name} ${preset.is_default ? "(Default)" : ""}`;
      select.appendChild(option);
    });
  } catch (err) {
    console.error("Failed to load presets", err);
  }
}

async function loadProcesses() {
  const container = document.getElementById("process-list") as HTMLDivElement;
  try {
    const processes = await invoke<AudioProcess[]>("get_audio_processes");
    container.innerHTML = "";

    if (processes.length === 0) {
      container.innerHTML = '<div class="loading">No active audio applications found.</div>';
      return;
    }

    processes.forEach((proc) => {
      const card = document.createElement("div");
      card.className = "process-card";

      const header = document.createElement("div");
      header.className = "process-header";
      header.innerHTML = `
        <span class="process-title">${proc.name || proc.bundle_id || `PID ${proc.pid}`}</span>
        ${proc.is_running_output ? '<span class="badge">Playing</span>' : ""}
      `;

      const controls = document.createElement("div");
      controls.className = "process-controls";

      const slider = document.createElement("input");
      slider.type = "range";
      slider.min = "0";
      slider.max = "100";
      slider.value = "100";
      slider.className = "volume-slider";
      slider.addEventListener("input", async () => {
        const vol = parseFloat(slider.value) / 100.0;
        await invoke("set_app_volume", { bundleId: proc.bundle_id, volume: vol });
      });

      const muteBtn = document.createElement("button");
      muteBtn.className = "mute-btn";
      muteBtn.textContent = "Mute";
      let isMuted = false;
      muteBtn.addEventListener("click", async () => {
        isMuted = !isMuted;
        muteBtn.classList.toggle("active", isMuted);
        muteBtn.textContent = isMuted ? "Unmute" : "Mute";
        await invoke("set_app_mute", { bundleId: proc.bundle_id, muted: isMuted });
      });

      controls.appendChild(slider);
      controls.appendChild(muteBtn);

      card.appendChild(header);
      card.appendChild(controls);
      container.appendChild(card);
    });
  } catch (err) {
    console.error("Failed to load processes", err);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  loadDevices();
  loadPresets();
  loadProcesses();

  const refreshBtn = document.getElementById("refresh-btn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", loadProcesses);
  }
});
