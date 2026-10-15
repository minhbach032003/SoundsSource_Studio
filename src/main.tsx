import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { FloatingPetOverlayView } from "./views/FloatingPetOverlayView";
import { PingOverlayView } from "./views/PingOverlayView";
import { BreakOverlayWindowView } from "./views/BreakOverlayWindowView";
import "./styles.css";

const isPingOverlay =
  typeof window !== "undefined" &&
  (window.location.search.includes("ping_overlay") ||
    window.location.hash.includes("ping_overlay") ||
    !!(window as unknown as { __IS_PING_OVERLAY__?: boolean }).__IS_PING_OVERLAY__ ||
    (window as unknown as { __TAURI_WINDOW_LABEL__?: string }).__TAURI_WINDOW_LABEL__ === "ping-overlay" ||
    (window as unknown as { __TAURI_INTERNALS__?: { metadata?: { currentWindow?: { label?: string } } } })
      .__TAURI_INTERNALS__?.metadata?.currentWindow?.label === "ping-overlay");

const isBreakOverlay =
  typeof window !== "undefined" &&
  !isPingOverlay &&
  (window.location.search.includes("break_overlay") ||
    window.location.hash.includes("break_overlay") ||
    !!(window as unknown as { __IS_BREAK_OVERLAY__?: boolean }).__IS_BREAK_OVERLAY__ ||
    (window as unknown as { __TAURI_WINDOW_LABEL__?: string }).__TAURI_WINDOW_LABEL__?.startsWith("break-overlay") ||
    (window as unknown as { __TAURI_INTERNALS__?: { metadata?: { currentWindow?: { label?: string } } } })
      .__TAURI_INTERNALS__?.metadata?.currentWindow?.label?.startsWith("break-overlay"));

const isPetOverlay =
  typeof window !== "undefined" &&
  !isPingOverlay &&
  !isBreakOverlay &&
  (!!(window as unknown as { __IS_PET_OVERLAY__?: boolean }).__IS_PET_OVERLAY__ ||
    (window as unknown as { __TAURI_WINDOW_LABEL__?: string }).__TAURI_WINDOW_LABEL__ === "pet-overlay" ||
    (window as unknown as { __TAURI_INTERNALS__?: { metadata?: { currentWindow?: { label?: string } } } })
      .__TAURI_INTERNALS__?.metadata?.currentWindow?.label === "pet-overlay" ||
    window.location.search.includes("pet_overlay") ||
    window.location.search.includes("overlay") ||
    window.location.hash.includes("overlay"));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isPingOverlay ? (
      <PingOverlayView />
    ) : isBreakOverlay ? (
      <BreakOverlayWindowView />
    ) : isPetOverlay ? (
      <FloatingPetOverlayView />
    ) : (
      <App />
    )}
  </React.StrictMode>
);
