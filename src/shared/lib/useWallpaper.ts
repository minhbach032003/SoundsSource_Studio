import { useState, useEffect, useCallback, useMemo } from "react";

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

export function useWallpaper() {
  const [wallpaper, setWallpaper] = useState<WallpaperState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return { ...DEFAULT_WALLPAPER, ...JSON.parse(saved) };
      }
    } catch {
      // Storage error fallback
    }
    return DEFAULT_WALLPAPER;
  });

  // Persist to local storage with quota-overflow guard
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(wallpaper));
    } catch (e) {
      console.warn("Failed to persist wallpaper to localStorage:", e);
      // Graceful fallback: if quota exceeded, clear stale item or save config without huge payload
      try {
        const minimalConfig: WallpaperState = {
          ...wallpaper,
          customImage: null,
          mode: "preset",
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(minimalConfig));
      } catch {
        // Storage completely unavailable
      }
    }
  }, [wallpaper]);

  const setPreset = useCallback((presetId: WallpaperPresetId) => {
    setWallpaper((prev) => ({
      ...prev,
      mode: "preset",
      presetId,
    }));
  }, []);

  const activateCustomImage = useCallback(() => {
    setWallpaper((prev) => {
      if (!prev.customImage) return prev;
      return {
        ...prev,
        mode: "custom",
      };
    });
  }, []);

  const removeCustomImage = useCallback(() => {
    setWallpaper((prev) => ({
      ...prev,
      mode: "preset",
      customImage: null,
    }));
  }, []);

  const setDim = useCallback((dimRatio: number) => {
    const clamped = Math.min(0.9, Math.max(0.2, dimRatio));
    setWallpaper((prev) => ({ ...prev, dim: clamped }));
  }, []);

  const setBlur = useCallback((blurPx: number) => {
    const clamped = Math.min(30, Math.max(0, blurPx));
    setWallpaper((prev) => ({ ...prev, blur: clamped }));
  }, []);

  const resetToDefault = useCallback(() => {
    setWallpaper(DEFAULT_WALLPAPER);
  }, []);

  /**
   * Resizes large images to max 1280px and compresses to JPEG at 0.82 quality
   * Keeping base64 payload under ~150KB to safely fit within browser localStorage.
   */
  const processAndCompressImage = (dataUrl: string): Promise<string> => {
    return new Promise((resolve) => {
      if (typeof window === "undefined" || typeof Image === "undefined") {
        resolve(dataUrl);
        return;
      }

      const img = new Image();
      img.onload = () => {
        const maxDimension = 1280;
        let { width, height } = img;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          // Fill background with dark tone in case of transparent PNG to ensure solid contrast
          ctx.fillStyle = "#0b0f14";
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", 0.82));
        } else {
          resolve(dataUrl);
        }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  };

  const uploadCustomImage = useCallback(
    async (file: File): Promise<{ success: boolean; error?: string }> => {
      // 1. Boundary & format validation
      const validation = validateWallpaperFile(file);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error || "Invalid image file.",
        };
      }

      // 2. Read and encode file
      try {
        const rawDataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error("Failed to read image file"));
          reader.readAsDataURL(file);
        });

        const compressedUrl = await processAndCompressImage(rawDataUrl);

        setWallpaper((prev) => ({
          ...prev,
          mode: "custom",
          customImage: compressedUrl,
        }));

        return { success: true };
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Error reading image file";
        return { success: false, error: msg };
      }
    },
    []
  );

  // Background style computation
  const backgroundStyle = useMemo(() => {
    return computeBackgroundStyle(wallpaper);
  }, [wallpaper.mode, wallpaper.customImage, wallpaper.presetId]);

  return {
    wallpaper,
    setPreset,
    activateCustomImage,
    removeCustomImage,
    setDim,
    setBlur,
    resetToDefault,
    uploadCustomImage,
    backgroundStyle,
  };
}
