import { invoke, isTauri } from "@tauri-apps/api/core";
import type { AudioProcess } from "@/audio";

/**
 * Function-calling layer that lets Gemini Live drive the real rust-sound mixer.
 *
 * Every declaration below maps 1:1 onto a `#[tauri::command]` in
 * `crates/app/src/lib.rs`, so the model can only reach capabilities the app
 * already exposes to its own UI — nothing wider.
 */

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters?: {
    type: "OBJECT";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface GeminiToolResult {
  ok: boolean;
  /** Short Vietnamese line rendered as a tool row in the Dialogue Console. */
  summary: string;
  /** Structured payload handed back to the model in `toolResponse`. */
  data?: Record<string, unknown>;
  error?: string;
}

/** Master EQ centre frequencies, mirroring `DEFAULT_EQ_FREQUENCIES` in `crates/engine/src/eq.rs`. */
export const EQ_BANDS_HZ = [40, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;

/** Gain window the mixer UI itself offers, narrower than the backend's ±24 dB guard. */
export const EQ_GAIN_LIMIT_DB = 12;

/** Spoken names users actually say, mapped to the bundle id prefix they belong to. */
const APP_ALIASES: Record<string, string[]> = {
  "com.spotify.client": ["spotify", "nhạc spotify"],
  "com.brave.browser": ["brave", "brave browser", "trình duyệt brave"],
  "com.google.chrome": ["chrome", "google chrome", "trình duyệt chrome"],
  "com.apple.safari": ["safari"],
  "com.apple.music": ["apple music", "itunes"],
  "com.microsoft.edgemac": ["edge", "microsoft edge"],
  "com.hnc.discord": ["discord"],
  "us.zoom.xos": ["zoom"],
  "com.tinyspeck.slackmacgap": ["slack"],
  "com.apple.quicktimeplayer": ["quicktime"],
};

export function clampPercent(value: unknown): number | null {
  const n = typeof value === "string" ? Number.parseFloat(value) : (value as number);
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function clampGainDb(value: unknown): number | null {
  const n = typeof value === "string" ? Number.parseFloat(value) : (value as number);
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return Math.min(EQ_GAIN_LIMIT_DB, Math.max(-EQ_GAIN_LIMIT_DB, Math.round(n * 10) / 10));
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (["true", "1", "yes", "on", "bật", "mute", "tắt tiếng"].includes(v)) return true;
    if (["false", "0", "no", "off", "tắt", "unmute", "bỏ tắt tiếng"].includes(v)) return false;
  }
  return null;
}

/**
 * Resolve either a direct band index (0-9) or a frequency in Hz onto the
 * nearest master EQ band. Frequencies are matched on a log scale so that a
 * request for "2.5kHz vocal clarity" lands on the 2 kHz band, not on 4 kHz.
 */
export function resolveEqBandIndex(input: unknown): number | null {
  const n = typeof input === "string" ? Number.parseFloat(input) : (input as number);
  if (typeof n !== "number" || !Number.isFinite(n)) return null;

  if (Number.isInteger(n) && n >= 0 && n <= 9) return n;

  const hz = n > 0 && n < 25 ? n * 1000 : n; // tolerate "2.5" meaning 2.5 kHz
  if (hz <= 0) return null;

  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < EQ_BANDS_HZ.length; i++) {
    const distance = Math.abs(Math.log2(hz / EQ_BANDS_HZ[i]));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

/** Fuzzy-match a spoken app name against the live process list. */
export function resolveAudioApp(processes: AudioProcess[], query: unknown): AudioProcess | null {
  if (typeof query !== "string") return null;
  const needle = query.trim().toLowerCase();
  if (!needle) return null;

  const exactBundle = processes.find((p) => p.bundle_id.toLowerCase() === needle);
  if (exactBundle) return exactBundle;

  const exactName = processes.find((p) => p.name.toLowerCase() === needle);
  if (exactName) return exactName;

  for (const [bundleId, aliases] of Object.entries(APP_ALIASES)) {
    if (!aliases.some((alias) => needle.includes(alias) || alias.includes(needle))) continue;
    const hit = processes.find((p) => p.bundle_id.toLowerCase().startsWith(bundleId));
    if (hit) return hit;
  }

  return (
    processes.find((p) => p.name.toLowerCase().includes(needle)) ??
    processes.find((p) => needle.includes(p.name.toLowerCase())) ??
    processes.find((p) => p.bundle_id.toLowerCase().includes(needle)) ??
    null
  );
}

export const GEMINI_AUDIO_TOOL_DECLARATIONS: GeminiFunctionDeclaration[] = [
  {
    name: "list_audio_apps",
    description:
      "Liệt kê các ứng dụng đang phát âm thanh trên máy macOS này cùng bundle id. Luôn gọi hàm này trước khi điều chỉnh âm lượng một ứng dụng để biết tên chính xác.",
  },
  {
    name: "set_app_volume",
    description:
      "Đặt âm lượng của một ứng dụng cụ thể (ví dụ Spotify, Brave Browser) theo phần trăm 0-100.",
    parameters: {
      type: "OBJECT",
      properties: {
        app: { type: "STRING", description: "Tên ứng dụng hoặc bundle id, ví dụ 'Spotify'." },
        volume_percent: { type: "NUMBER", description: "Âm lượng mong muốn, 0 đến 100." },
      },
      required: ["app", "volume_percent"],
    },
  },
  {
    name: "set_app_mute",
    description: "Tắt tiếng hoặc bỏ tắt tiếng một ứng dụng cụ thể.",
    parameters: {
      type: "OBJECT",
      properties: {
        app: { type: "STRING", description: "Tên ứng dụng hoặc bundle id." },
        muted: { type: "BOOLEAN", description: "true để tắt tiếng, false để bật lại." },
      },
      required: ["app", "muted"],
    },
  },
  {
    name: "get_master_volume",
    description: "Đọc âm lượng tổng (master output) hiện tại của hệ thống, trả về phần trăm.",
  },
  {
    name: "set_master_volume",
    description: "Đặt âm lượng tổng của thiết bị đầu ra hệ thống theo phần trăm 0-100.",
    parameters: {
      type: "OBJECT",
      properties: {
        volume_percent: { type: "NUMBER", description: "Âm lượng tổng mong muốn, 0 đến 100." },
      },
      required: ["volume_percent"],
    },
  },
  {
    name: "set_master_mute",
    description: "Tắt tiếng hoặc bỏ tắt tiếng toàn bộ đầu ra hệ thống.",
    parameters: {
      type: "OBJECT",
      properties: {
        muted: { type: "BOOLEAN", description: "true để tắt tiếng master." },
      },
      required: ["muted"],
    },
  },
  {
    name: "get_master_eq",
    description:
      "Đọc toàn bộ 10 band EQ master hiện tại (tần số 32Hz đến 16kHz, gain dB) và trạng thái bypass.",
  },
  {
    name: "set_master_eq_band",
    description:
      "Điều chỉnh gain của một band EQ master. Chọn band bằng tần số Hz (sẽ khớp về band gần nhất trong 32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000 Hz).",
    parameters: {
      type: "OBJECT",
      properties: {
        frequency_hz: { type: "NUMBER", description: "Tần số trung tâm cần chỉnh, ví dụ 2000." },
        gain_db: { type: "NUMBER", description: `Gain dB, giới hạn -${EQ_GAIN_LIMIT_DB} đến +${EQ_GAIN_LIMIT_DB}.` },
      },
      required: ["frequency_hz", "gain_db"],
    },
  },
  {
    name: "reset_master_eq",
    description: "Đưa toàn bộ 10 band EQ master về 0 dB (flat).",
  },
  {
    name: "set_master_eq_bypass",
    description: "Bật hoặc tắt bypass cho EQ master.",
    parameters: {
      type: "OBJECT",
      properties: {
        bypass: { type: "BOOLEAN", description: "true để bypass EQ." },
      },
      required: ["bypass"],
    },
  },
];

/** Read-only, so it stays available even when Agent Control is off. */
export const NOTES_TOOL: GeminiFunctionDeclaration = {
  name: "search_notes",
  description:
    "Đọc ghi chú Obsidian của người dùng. Truyền path của ghi chú đã chọn từ danh sách ghi chú, cùng vài từ khoá chính (không truyền cả câu, kèm thuật ngữ tiếng Anh nếu có).",
  parameters: {
    type: "OBJECT",
    properties: {
      query: {
        type: "STRING",
        description: "Từ khoá lấy từ câu hỏi, giữ nguyên thuật ngữ người dùng nói (tên hàm, thư viện, công nghệ), thêm từ tiếng Anh tương ứng. Ví dụ: PyPDFLoader; xoá mềm soft delete",
      },
      path: { type: "STRING", description: "Path đúng như trong danh sách ghi chú, nếu đã chọn được" },
    },
    required: ["query"],
  },
};

/** Note paths appended to the Live system prompt so Gemini itself picks notes by meaning. */
export async function notesCatalogPrompt(): Promise<string> {
  if (typeof window === "undefined" || !isTauri()) return "";
  try {
    const paths = await invoke<string[]>("list_notes");
    return Array.isArray(paths) && paths.length ? `\n\nDanh sách ghi chú:\n${paths.join("\n")}` : "";
  } catch {
    return "";
  }
}

export const GEMINI_AUDIO_TOOL_NAMES: readonly string[] = GEMINI_AUDIO_TOOL_DECLARATIONS.map(
  (d) => d.name
);

interface MasterEqState {
  bands: { frequency: number; gain: number; bandwidth: number }[];
  bypass: boolean;
}

function fail(summary: string, error?: string): GeminiToolResult {
  return { ok: false, summary, error: error ?? summary };
}

/**
 * Execute one Gemini function call against the Tauri backend.
 * Never throws: a failure is reported back to the model so it can explain or retry.
 */
export async function runGeminiAudioTool(
  name: string,
  args: Record<string, unknown> = {}
): Promise<GeminiToolResult> {
  if (typeof window === "undefined" || !isTauri()) {
    return fail(
      "Không thể điều khiển âm thanh: chỉ hoạt động trong ứng dụng desktop rust-sound.",
      "Tauri bridge unavailable"
    );
  }

  try {
    switch (name) {
      case "list_audio_apps": {
        const processes = await invoke<AudioProcess[]>("get_audio_processes");
        const apps = processes
          .filter((p) => p.is_running_output || p.is_regular_app)
          .map((p) => ({
            name: p.name,
            bundle_id: p.bundle_id,
            supports_volume: p.supports_volume,
            is_playing: p.is_running_output,
          }));
        return {
          ok: true,
          summary: `Đã liệt kê ${apps.length} ứng dụng âm thanh`,
          data: { apps },
        };
      }

      case "set_app_volume": {
        const percent = clampPercent(args.volume_percent ?? args.volume);
        if (percent === null) return fail("Thiếu hoặc sai giá trị volume_percent (0-100).");
        const processes = await invoke<AudioProcess[]>("get_audio_processes");
        const target = resolveAudioApp(processes, args.app ?? args.app_name ?? args.name);
        if (!target) {
          return fail(
            `Không tìm thấy ứng dụng "${String(args.app ?? "")}" đang phát âm thanh.`,
            "app_not_found"
          );
        }
        if (!target.supports_volume) {
          return fail(
            `${target.name} không cho phép macOS điều chỉnh âm lượng riêng.`,
            "volume_unsupported"
          );
        }
        await invoke("set_app_volume", { bundleId: target.bundle_id, volume: percent / 100 });
        return {
          ok: true,
          summary: `Đặt âm lượng ${target.name} = ${percent}%`,
          data: { app: target.name, bundle_id: target.bundle_id, volume_percent: percent },
        };
      }

      case "set_app_mute": {
        const muted = asBoolean(args.muted ?? args.mute);
        if (muted === null) return fail("Thiếu hoặc sai giá trị muted (true/false).");
        const processes = await invoke<AudioProcess[]>("get_audio_processes");
        const target = resolveAudioApp(processes, args.app ?? args.app_name ?? args.name);
        if (!target) {
          return fail(
            `Không tìm thấy ứng dụng "${String(args.app ?? "")}" đang phát âm thanh.`,
            "app_not_found"
          );
        }
        await invoke("set_app_mute", { bundleId: target.bundle_id, muted });
        return {
          ok: true,
          summary: `${muted ? "Tắt tiếng" : "Bỏ tắt tiếng"} ${target.name}`,
          data: { app: target.name, bundle_id: target.bundle_id, muted },
        };
      }

      case "get_master_volume": {
        const volume = await invoke<number>("get_master_volume");
        const percent = Math.round((volume ?? 0) * 100);
        return {
          ok: true,
          summary: `Âm lượng tổng hiện tại ${percent}%`,
          data: { volume_percent: percent },
        };
      }

      case "set_master_volume": {
        const percent = clampPercent(args.volume_percent ?? args.volume);
        if (percent === null) return fail("Thiếu hoặc sai giá trị volume_percent (0-100).");
        await invoke("set_master_volume", { volume: percent / 100 });
        return {
          ok: true,
          summary: `Đặt âm lượng tổng = ${percent}%`,
          data: { volume_percent: percent },
        };
      }

      case "set_master_mute": {
        const muted = asBoolean(args.muted ?? args.mute);
        if (muted === null) return fail("Thiếu hoặc sai giá trị muted (true/false).");
        await invoke("set_master_mute", { muted });
        return {
          ok: true,
          summary: `${muted ? "Tắt tiếng" : "Bỏ tắt tiếng"} toàn hệ thống`,
          data: { muted },
        };
      }

      case "get_master_eq": {
        const eq = await invoke<MasterEqState>("get_master_eq_bands");
        return {
          ok: true,
          summary: `Đọc 10 band EQ master${eq?.bypass ? " (đang bypass)" : ""}`,
          data: {
            bypass: Boolean(eq?.bypass),
            bands: (eq?.bands ?? []).map((b) => ({ frequency_hz: b.frequency, gain_db: b.gain })),
          },
        };
      }

      case "set_master_eq_band": {
        const bandIndex = resolveEqBandIndex(
          args.frequency_hz ?? args.frequency ?? args.band_index ?? args.band
        );
        const gainDb = clampGainDb(args.gain_db ?? args.gain);
        if (bandIndex === null) return fail("Thiếu hoặc sai tần số band EQ (frequency_hz).");
        if (gainDb === null) return fail("Thiếu hoặc sai giá trị gain_db.");
        await invoke("set_master_eq_band", { bandIndex, gainDb });
        const hz = EQ_BANDS_HZ[bandIndex];
        const label = hz >= 1000 ? `${hz / 1000}kHz` : `${hz}Hz`;
        return {
          ok: true,
          summary: `EQ ${label} = ${gainDb > 0 ? "+" : ""}${gainDb} dB`,
          data: { band_index: bandIndex, frequency_hz: hz, gain_db: gainDb },
        };
      }

      case "reset_master_eq": {
        await invoke<MasterEqState>("reset_master_eq");
        return { ok: true, summary: "Đã reset EQ master về flat 0 dB", data: { reset: true } };
      }

      case "set_master_eq_bypass": {
        const bypass = asBoolean(args.bypass ?? args.bypassed);
        if (bypass === null) return fail("Thiếu hoặc sai giá trị bypass (true/false).");
        const applied = await invoke<boolean>("set_master_eq_bypass", { bypass });
        return {
          ok: true,
          summary: `${applied ? "Đã bypass" : "Đã kích hoạt"} EQ master`,
          data: { bypass: applied },
        };
      }

      case "search_notes": {
        const notes = await invoke<{ path: string; excerpt: string }[]>("search_notes", {
          query: String(args.query ?? ""),
          path: typeof args.path === "string" ? args.path : null,
        });
        return {
          ok: true,
          summary: notes.length ? `Tìm thấy ${notes.length} ghi chú: ${notes.map((n) => n.path).join(", ")}` : "Không có ghi chú phù hợp",
          data: { notes },
        };
      }

      default:
        return fail(`Hàm "${name}" không được hỗ trợ.`, "unknown_function");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(`Lỗi khi thực thi ${name}: ${msg}`, msg);
  }
}
