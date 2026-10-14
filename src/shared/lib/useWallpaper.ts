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
    description: "Deep neutral dark studio aesthetic",
    gradient: "radial-gradient(ellipse at 50% -20%, #17202c 0%, #0b0f14 70%)",
    accent: "#38bdf8",
  },
  {
    id: "aurora",
    name: "Ambient Aurora",
    description: "Atmospheric emerald and teal acoustic glow",
    gradient: "radial-gradient(circle at 20% 20%, #064e3b 0%, #062e24 40%, #0b0f14 85%), radial-gradient(circle at 80% 80%, #042f2e 0%, #0b0f14 70%)",
    accent: "#34d399",
  },
  {
    id: "cyber",
    name: "Cyber Wave",
    description: "Deep synthwave violet and indigo lighting",
    gradient: "radial-gradient(circle at 75% 15%, #3b0764 0%, #1e1b4b 45%, #0b0f14 85%), radial-gradient(circle at 20% 85%, #1e1035 0%, #0b0f14 70%)",
    accent: "#c084fc",
  },
  {
    id: "nebula",
    name: "Deep Nebula",
    description: "Midnight sapphire and ultramarine space glow",
    gradient: "radial-gradient(circle at 50% 30%, #172554 0%, #0f172a 50%, #0b0f14 90%), radial-gradient(circle at 85% 70%, #1e3a8a 0%, #0b0f14 65%)",
    accent: "#60a5fa",
  },
];

export interface WallpaperState {
  mode: "preset" | "custom";
  presetId: WallpaperPresetId;
  customImage: string | null;
  dim: number; // 0.2 to 0.9 (overlay darkness ratio)
  blur: number; // 0 to 30 (pixels)
}

const STORAGE_KEY = "ss_wallpaper_config";
const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8MB boundary check
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

const DEFAULT_WALLPAPER: WallpaperState = {
  mode: "preset",
  presetId: "obsidian",
  customImage: null,
  dim: 0.65,
  blur: 8,
};

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

  // Persist to local storage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(wallpaper));
    } catch (e) {
      console.warn("Failed to persist wallpaper to localStorage:", e);
    }
  }, [wallpaper]);

  const setPreset = useCallback((presetId: WallpaperPresetId) => {
    setWallpaper((prev) => ({
      ...prev,
      mode: "preset",
      presetId,
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
   * Resizes large images before storing as DataURL to avoid exceeding localStorage limits
   */
  const processAndCompressImage = (dataUrl: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const maxDimension = 1920;
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
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/webp", 0.85));
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
      // 1. Validate file type
      if (!ALLOWED_TYPES.includes(file.type)) {
        return {
          success: false,
          error: "Invalid file format. Please upload PNG, JPG, or WEBP.",
        };
      }

      // 2. Validate boundary file size
      if (file.size > MAX_FILE_SIZE) {
        return {
          success: false,
          error: `File size exceeds ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)}MB limit.`,
        };
      }

      // 3. Read and encode file
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
        const msg = err instanceof Error ? err.message : "Error reading image file";
        return { success: false, error: msg };
      }
    },
    []
  );

  // Background style computation
  const backgroundStyle = useMemo(() => {
    if (wallpaper.mode === "custom" && wallpaper.customImage) {
      return {
        backgroundImage: `url(${wallpaper.customImage})`,
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
  }, [wallpaper.mode, wallpaper.customImage, wallpaper.presetId]);

  return {
    wallpaper,
    setPreset,
    setDim,
    setBlur,
    resetToDefault,
    uploadCustomImage,
    backgroundStyle,
  };
}
