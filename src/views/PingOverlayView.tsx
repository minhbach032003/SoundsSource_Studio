import { useEffect, useState, type FC } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { GlobalPingHost } from "@/components/radial/GlobalPingHost";
import { ToastProvider } from "@/shared/ui";

interface GlobalModifierPayload {
  is_holding: boolean;
  mode?: "tactical" | "emote";
  screen_x: number;
  screen_y: number;
}

export const PingOverlayView: FC = () => {
  const isDesktop =
    typeof window !== "undefined" &&
    (isTauri() ||
      !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);

  const [_activePayload, setActivePayload] = useState<GlobalModifierPayload | null>(null);

  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    document.body.style.overflow = "hidden";
    document.body.style.margin = "0";
    document.body.style.padding = "0";

    if (!isDesktop) return;

    let unlistenChange: (() => void) | undefined;
    let unlistenRelease: (() => void) | undefined;

    (async () => {
      try {
        unlistenChange = await listen<GlobalModifierPayload>(
          "global-modifier-changed",
          (event) => {
            setActivePayload(event.payload);
          }
        );

        unlistenRelease = await listen<GlobalModifierPayload>(
          "global-modifier-released",
          (event) => {
            setActivePayload(event.payload);
          }
        );
      } catch (err) {
        console.error("Failed to bind global modifier listeners", err);
      }
    })();

    return () => {
      unlistenChange?.();
      unlistenRelease?.();
    };
  }, [isDesktop]);

  return (
    <ToastProvider>
      <div className="w-screen h-screen overflow-hidden select-none bg-transparent relative pointer-events-none">
        <GlobalPingHost enabled={true} />
      </div>
    </ToastProvider>
  );
};
