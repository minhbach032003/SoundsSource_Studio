export type WallpaperPresetId = "obsidian" | "aurora" | "cyber" | "nebula";

export interface WallpaperPreset {
  id: WallpaperPresetId;
  name: string;
  description: string;
  gradient: string;
  accent: string;
}

export const WALLPAPER_PRESETS: WallpaperPreset[] = [
  {
    id: "obsidian",
    name: "Default Obsidian",
    description: "Warm espresso dark studio aesthetic",
    gradient: "radial-gradient(ellipse at 50% -20%, #261f2c 0%, #131115 70%)",
    accent: "#fb7185",
  },
  {
    id: "aurora",
    name: "Ambient Aurora",
    description: "Atmospheric emerald and teal acoustic glow",
    gradient: "radial-gradient(circle at 20% 20%, #064e3b 0%, #062e24 40%, #131115 85%), radial-gradient(circle at 80% 80%, #042f2e 0%, #131115 70%)",
    accent: "#34d399",
  },
  {
    id: "cyber",
    name: "Cyber Wave",
    description: "Deep synthwave rose, violet and indigo lighting",
    gradient: "radial-gradient(circle at 75% 15%, #4c0d38 0%, #2e1028 45%, #131115 85%), radial-gradient(circle at 20% 85%, #251230 0%, #131115 70%)",
    accent: "#f472b6",
  },
  {
    id: "nebula",
    name: "Deep Nebula",
    description: "Midnight sapphire and ultramarine space glow",
    gradient: "radial-gradient(circle at 50% 30%, #201734 0%, #151124 50%, #131115 90%), radial-gradient(circle at 85% 70%, #2b143a 0%, #131115 65%)",
    accent: "#a78bfa",
  },
];

export interface WallpaperState {
  mode: "preset" | "custom";
  presetId: WallpaperPresetId;
  customImage: string | null;
  dim: number; // 0.2 to 0.9 (overlay darkness ratio)
  blur: number; // 0 to 30 (pixels)
}

export const STORAGE_KEY = "ss_wallpaper_config";
export const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8MB boundary check
export const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/jpg",
];
export const ALLOWED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"];

export const DEFAULT_WALLPAPER: WallpaperState = {
  mode: "preset",
  presetId: "obsidian",
  customImage: null,
  dim: 0.65,
  blur: 8,
};

/**
 * Validates a file for wallpaper upload (boundary checks & format verification)
 */
export function validateWallpaperFile(file: {
  name?: string;
  type?: string;
  size: number;
}): { valid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size exceeds ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)}MB limit.`,
    };
  }

  const mime = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();

  const isMimeAllowed = ALLOWED_TYPES.includes(mime);
  const isExtAllowed = ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext));

  if (!isMimeAllowed && !isExtAllowed) {
    return {
      valid: false,
      error: "Invalid file format. Please upload PNG, JPG, or WEBP.",
    };
  }

  return { valid: true };
}

/**
 * Computes the CSS background style dictionary with quoted data URLs for spec compliance
 */
export function computeBackgroundStyle(
  wallpaper: Pick<WallpaperState, "mode" | "customImage" | "presetId">
): {
  backgroundImage: string;
  backgroundSize: string;
  backgroundPosition: string;
} {
  if (wallpaper.mode === "custom" && wallpaper.customImage) {
    return {
      backgroundImage: `url("${wallpaper.customImage}")`,
      backgroundSize: "cover",
      backgroundPosition: "center center",
    };
  }

  const currentPreset =
    WALLPAPER_PRESETS.find((p) => p.id === wallpaper.presetId) ||
    WALLPAPER_PRESETS[0];

  return {
    backgroundImage: currentPreset.gradient,
    backgroundSize: "cover",
    backgroundPosition: "center center",
  };
}
