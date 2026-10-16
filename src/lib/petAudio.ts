// Shared alert boundary: every renderer reads persisted mute/custom settings at playback time.
import { invoke, isTauri } from "@tauri-apps/api/core";
import { PET_KEYS, readPetPreferences, writePetStorage } from "./petPreferences";
import { toastState } from "./toast.svelte";

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  return audioCtx;
}

/**
 * Ascending pleasant harmonic chime synthesized via Web Audio API.
 * Triggered when an active agent transitions to "done".
 */
function synthesizeDone(ctx: AudioContext, volume: number) {

  const now = ctx.currentTime;
  const masterVol = Math.max(0.01, Math.min(1.0, volume / 100)) * 0.35;
  // Gentle ascending triad: C5 (523.25Hz), E5 (659.25Hz), C6 (1046.5Hz)
  const notes = [523.25, 659.25, 1046.5];

  notes.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t = now + idx * 0.08;

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t);

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(masterVol * 0.8, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.38);
  });
}

/**
 * Gentle submarine sonar ping synthesized via Web Audio API.
 * Triggered when an active agent transitions to "waiting".
 */
function synthesizeWaiting(ctx: AudioContext, volume: number) {

  const now = ctx.currentTime;
  const masterVol = Math.max(0.01, Math.min(1.0, volume / 100)) * 0.35;

  // Gentle submarine sonar ping: 440Hz fundamental with 880Hz overtone
  [440, 880].forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const volRatio = idx === 0 ? 0.9 : 0.35;

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.96, now + 0.45);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(masterVol * volRatio, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.58);
  });
}

export type PetSoundKind = "done" | "waiting";
export type PetNotificationPermission = "granted" | "provisional" | "denied" | "default" | "unavailable";
export const MAX_PET_SOUND_BYTES = 512 * 1024;
export const MAX_PET_SOUND_SECONDS = 15;
const uploads = { done: 0, waiting: 0 };
const customKey = (kind: PetSoundKind) => kind === "done" ? PET_KEYS.doneCustom : PET_KEYS.waitingCustom;
const customValue = (kind: PetSoundKind) => readPetPreferences()[kind === "done" ? "doneCustom" : "waitingCustom"];

function customRecord(raw: string | null): { name: string; data: string } | null {
  if (!raw) return null;
  if (raw.length > MAX_PET_SOUND_BYTES * 1.4 + 512) throw new Error("Saved sound is too large. Restore the default and upload again.");
  const record = JSON.parse(raw);
  if (typeof record.name !== "string" || record.name.length > 160 || typeof record.data !== "string"
    || !/^[A-Za-z0-9+/]+={0,2}$/.test(record.data) || record.data.length > Math.ceil(MAX_PET_SOUND_BYTES / 3) * 4) {
    throw new Error("Saved sound is invalid. Restore the default and upload again.");
  }
  return record;
}

export function petSoundName(kind: PetSoundKind): string {
  try { return customRecord(customValue(kind))?.name ?? "Synthesized default"; }
  catch { return "Invalid saved sound — restore default"; }
}

async function decodeSound(bytes: ArrayBuffer): Promise<AudioBuffer> {
  const ctx = getAudioContext();
  if (!ctx) throw new Error("Audio playback is unavailable in this window");
  let buffer: AudioBuffer;
  try { buffer = await ctx.decodeAudioData(bytes); }
  catch { throw new Error("This file cannot be decoded. Choose a valid WAV, MP3, M4A, OGG or FLAC sound."); }
  if (!Number.isFinite(buffer.duration) || buffer.duration <= 0 || buffer.duration > MAX_PET_SOUND_SECONDS
    || buffer.numberOfChannels > 2 || buffer.length * buffer.numberOfChannels > 2880000) {
    throw new Error("Choose a mono/stereo sound up to 15 seconds (maximum 2,880,000 decoded samples).");
  }
  return buffer;
}

export async function uploadPetSound(kind: PetSoundKind, file: File): Promise<void> {
  const token = ++uploads[kind], previous = customValue(kind);
  if (!file.size || file.size > MAX_PET_SOUND_BYTES) throw new Error("Choose an audio file smaller than 512 KiB.");
  if (!/\.(wav|mp3|m4a|aac|ogg|flac)$/i.test(file.name) || (file.type && !file.type.startsWith("audio/"))) {
    throw new Error("Choose a WAV, MP3, M4A, AAC, OGG or FLAC audio file.");
  }
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength !== file.size) throw new Error("Could not read the complete audio file. Choose it again.");
  await decodeSound(bytes.slice(0));
  if (token !== uploads[kind] || customValue(kind) !== previous) throw new Error("Sound changed while uploading. Choose the file again.");
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  // At most two 512 KiB files (~1.4 MiB base64 total); storage failures propagate before UI success.
  writePetStorage(customKey(kind), JSON.stringify({ name: file.name.slice(0, 160), data: btoa(binary) }));
}

export function resetPetSound(kind: PetSoundKind) {
  ++uploads[kind];
  writePetStorage(customKey(kind), "");
}

/** Explicit previews bypass per-kind mute, never notification mute. Failures propagate to UI. */
export async function playPetSound(kind: PetSoundKind, preview = false, volume = 75): Promise<boolean> {
  if (!preview && !readPetPreferences()[kind === "done" ? "doneSound" : "waitingSound"]) return false;
  const ctx = getAudioContext();
  if (!ctx) throw new Error("Audio playback is unavailable in this window");
  if (ctx.state === "suspended") await ctx.resume();
  if (ctx.state !== "running") throw new Error("Audio is blocked. Click Play in AgentPet Settings to enable playback.");
  const record = customRecord(customValue(kind));
  if (record) {
    const bytes = Uint8Array.from(atob(record.data), c => c.charCodeAt(0));
    const buffer = await decodeSound(bytes.buffer);
    // Mute/custom settings may have changed during decoding, including in another webview.
    if (!preview && !readPetPreferences()[kind === "done" ? "doneSound" : "waitingSound"]) return false;
    if (record.data !== customRecord(customValue(kind))?.data) throw new Error("Sound changed during playback preparation. Try again.");
    const source = ctx.createBufferSource(), gain = ctx.createGain();
    source.buffer = buffer;
    gain.gain.value = Math.max(0, Math.min(1, volume / 100));
    source.connect(gain); gain.connect(ctx.destination); source.start();
  } else {
    (kind === "done" ? synthesizeDone : synthesizeWaiting)(ctx, volume);
  }
  return true;
}

export function playPetDoneChime(volume = 75) {
  return playPetSound("done", false, volume).catch(error => { toastState.error(`AgentPet sound failed: ${String(error)}`); return false; });
}
export function playPetWaitingChime(volume = 75) {
  return playPetSound("waiting", false, volume).catch(error => { toastState.error(`AgentPet sound failed: ${String(error)}`); return false; });
}

export async function petNotificationPermission(request = false): Promise<PetNotificationPermission> {
  if (isTauri()) {
    const state = await invoke<string>(request ? "request_pet_notification_permission" : "pet_notification_status");
    if (!["granted", "provisional", "denied", "default", "unavailable"].includes(state)) throw new Error("Unexpected native notification permission status");
    return state as PetNotificationPermission;
  }
  if (typeof Notification === "undefined") return "unavailable";
  return request ? await Notification.requestPermission() : Notification.permission;
}

/** Background transitions never request authorization and never launch notification sound. */
export async function sendDesktopNotification(title: string, body: string): Promise<boolean> {
  if (!readPetPreferences().notifications) return false;
  try {
    const permission = await petNotificationPermission();
    if (!["granted", "provisional"].includes(permission) || !readPetPreferences().notifications) return false;
    if (isTauri()) await invoke("send_pet_notification", { title: title.slice(0, 200), body: body.slice(0, 1000) });
    else new Notification(title, { body, silent: true });
    return true;
  } catch (error) {
    toastState.error(`AgentPet notification failed: ${String(error)}`);
    return false;
  }
}

/**
 * Deduplication helper across multi-window instances (AgentPetView and PetOverlay).
 * Prevents double chime / duplicate notification within windowTtlMs.
 */
export function shouldTriggerPetAlert(
  sessionId: string,
  state: string,
  windowTtlMs: number = 10000
): boolean {
  if (typeof window === "undefined" || !sessionId) return true;
  const key = `rust_sound_pet_alert_${sessionId}_${state}`;
  try {
    const last = localStorage.getItem(key);
    const now = Date.now();
    if (last && now - Number(last) < windowTtlMs) {
      return false;
    }
    localStorage.setItem(key, String(now));
    return true;
  } catch {
    return true;
  }
}
