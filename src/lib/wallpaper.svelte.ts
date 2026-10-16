import {
  WALLPAPER_PRESETS,
  DEFAULT_WALLPAPER,
  STORAGE_KEY,
  validateWallpaperFile,
  computeBackgroundStyle,
  type WallpaperPresetId,
  type WallpaperPreset,
  type WallpaperState,
} from "./wallpaper";

export type { WallpaperPresetId, WallpaperPreset, WallpaperState };
export { WALLPAPER_PRESETS, DEFAULT_WALLPAPER, STORAGE_KEY, validateWallpaperFile, computeBackgroundStyle };

export class WallpaperStore {
  wallpaper = $state<WallpaperState>({ ...DEFAULT_WALLPAPER });

  constructor() {
    try {
      const saved = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      if (saved) {
        this.wallpaper = { ...DEFAULT_WALLPAPER, ...JSON.parse(saved) };
      }
    } catch {
      this.wallpaper = { ...DEFAULT_WALLPAPER };
    }
  }

  get backgroundStyle() {
    return computeBackgroundStyle(this.wallpaper);
  }

  private persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.wallpaper));
    } catch (e) {
      console.warn("Failed to persist wallpaper to localStorage:", e);
      try {
        const minimalConfig: WallpaperState = {
          ...this.wallpaper,
          customImage: null,
          mode: "preset",
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(minimalConfig));
      } catch {
        // ignore
      }
    }
  }

  setPreset(presetId: WallpaperPresetId) {
    this.wallpaper.mode = "preset";
    this.wallpaper.presetId = presetId;
    this.persist();
  }

  activateCustomImage() {
    if (this.wallpaper.customImage) {
      this.wallpaper.mode = "custom";
      this.persist();
    }
  }

  removeCustomImage() {
    this.wallpaper.mode = "preset";
    this.wallpaper.customImage = null;
    this.persist();
  }

  setDim(dimRatio: number) {
    this.wallpaper.dim = Math.min(0.9, Math.max(0.2, dimRatio));
    this.persist();
  }

  setBlur(blurPx: number) {
    this.wallpaper.blur = Math.min(30, Math.max(0, blurPx));
    this.persist();
  }

  resetToDefault() {
    this.wallpaper = { ...DEFAULT_WALLPAPER };
    this.persist();
  }

  private processAndCompressImage(dataUrl: string): Promise<string> {
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
  }

  async uploadCustomImage(file: File): Promise<{ success: boolean; error?: string }> {
    const validation = validateWallpaperFile(file);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error || "Invalid image file.",
      };
    }

    try {
      const rawDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Failed to read image file"));
        reader.readAsDataURL(file);
      });

      const compressedUrl = await this.processAndCompressImage(rawDataUrl);
      this.wallpaper.mode = "custom";
      this.wallpaper.customImage = compressedUrl;
      this.persist();
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error reading image file";
      return { success: false, error: msg };
    }
  }
}

export const wallpaperState = new WallpaperStore();
