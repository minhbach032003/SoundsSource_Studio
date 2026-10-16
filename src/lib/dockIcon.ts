import { invoke, isTauri } from "@tauri-apps/api/core";

/**
 * Renders a macOS-style squircle app logo dynamically styled with the active CSS tokens.
 * Returns a PNG data URL (image/png;base64,...).
 */
export function generateThemeDockIconPng(): string | null {
  if (typeof document === "undefined") return null;

  try {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const computed = getComputedStyle(document.documentElement);
    const paper = computed.getPropertyValue("--paper").trim() || "currentColor";
    const surface = computed.getPropertyValue("--surface").trim() || "currentColor";
    const core = computed.getPropertyValue("--core").trim() || "currentColor";
    const line = computed.getPropertyValue("--line").trim() || "currentColor";
    const strong = computed.getPropertyValue("--strong").trim() || "currentColor";
    const focus = computed.getPropertyValue("--focus").trim() || "currentColor";
    const accent = computed.getPropertyValue("--accent").trim() || "currentColor";
    const shadow = computed.getPropertyValue("--shadow").trim() || "transparent";

    // Clear canvas
    ctx.clearRect(0, 0, 256, 256);

    // Geometry of Apple squircle (size 220x220 centered in 256x256)
    const x = 18;
    const y = 18;
    const w = 220;
    const h = 220;
    const r = 52; // Corner radius for macOS icon squircle

    // Draw ambient drop shadow
    ctx.save();
    ctx.shadowColor = shadow;
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 8;

    // Squircle path
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();

    // Fill with vertical gradient (core -> surface -> paper)
    const bgGrad = ctx.createLinearGradient(x, y, x, y + h);
    bgGrad.addColorStop(0, core);
    bgGrad.addColorStop(0.5, surface);
    bgGrad.addColorStop(1, paper);
    ctx.fillStyle = bgGrad;
    ctx.fill();
    ctx.restore();

    // Squircle border
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.strokeStyle = line;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();

    // 5 Equalizer sound bars centered in squircle
    // Container coordinates: centered at (128, 128)
    const bars = [
      { rx: 56, ry: 98, rw: 20, rh: 60, opacity: 0.8 },
      { rx: 88, ry: 68, rw: 20, rh: 120, opacity: 0.92 },
      { rx: 120, ry: 48, rw: 20, rh: 160, opacity: 1.0 },
      { rx: 152, ry: 68, rw: 20, rh: 120, opacity: 0.92 },
      { rx: 184, ry: 98, rw: 20, rh: 60, opacity: 0.8 },
    ];

    // Sound gradient (diagonal from bottom-left to top-right)
    const soundGrad = ctx.createLinearGradient(56, 208, 204, 48);
    soundGrad.addColorStop(0, strong);
    soundGrad.addColorStop(0.5, focus);
    soundGrad.addColorStop(1, accent);

    for (const bar of bars) {
      ctx.save();
      ctx.globalAlpha = bar.opacity;
      ctx.fillStyle = soundGrad;
      const barRadius = 10;
      ctx.beginPath();
      ctx.moveTo(bar.rx + barRadius, bar.ry);
      ctx.arcTo(bar.rx + bar.rw, bar.ry, bar.rx + bar.rw, bar.ry + bar.rh, barRadius);
      ctx.arcTo(bar.rx + bar.rw, bar.ry + bar.rh, bar.rx, bar.ry + bar.rh, barRadius);
      ctx.arcTo(bar.rx, bar.ry + bar.rh, bar.rx, bar.ry, barRadius);
      ctx.arcTo(bar.rx, bar.ry, bar.rx + bar.rw, bar.ry, barRadius);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    return canvas.toDataURL("image/png");
  } catch (err) {
    console.warn("Failed to generate dynamic theme dock icon:", err);
    return null;
  }
}

/**
 * Renders the theme-colored dock icon and sends it to Rust via Tauri IPC.
 */
export async function syncDockIconToTheme(): Promise<void> {
  if (!isTauri()) return;

  const dataUrl = generateThemeDockIconPng();
  if (!dataUrl) return;

  try {
    await invoke<boolean>("update_dock_icon", { iconPngBase64: dataUrl });
  } catch (err) {
    // Non-fatal if Dock icon cannot be updated in test/mock environment
    console.warn("Failed to sync dock icon to macOS Dock:", err);
  }
}
