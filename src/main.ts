import { mount } from "svelte";
import App from "./App.svelte";
import BreakOverlay from "./views/BreakOverlay.svelte";
import PetOverlay from "./views/PetOverlay.svelte";
import PetPopover from "./views/PetPopover.svelte";
import PingOverlay from "./views/PingOverlay.svelte";
import "./styles.css";
import { restoreInstalledPets, subscribePetInstallations } from "./lib/petCloud";

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
  !window.location.search.includes("popover") &&
  (window as unknown as { __TAURI_WINDOW_LABEL__?: string }).__TAURI_WINDOW_LABEL__ !== "pet-popover" &&
  (!!(window as unknown as { __IS_PET_OVERLAY__?: boolean }).__IS_PET_OVERLAY__ ||
    (window as unknown as { __TAURI_WINDOW_LABEL__?: string }).__TAURI_WINDOW_LABEL__ === "pet-overlay" ||
    (window as unknown as { __TAURI_INTERNALS__?: { metadata?: { currentWindow?: { label?: string } } } })
      .__TAURI_INTERNALS__?.metadata?.currentWindow?.label === "pet-overlay" ||
    window.location.search.includes("pet_overlay") ||
    window.location.search.includes("overlay") ||
    window.location.hash.includes("overlay"));

const isPopover =
  typeof window !== "undefined" &&
  !isPingOverlay &&
  !isBreakOverlay &&
  (window.location.search.includes("popover") ||
    window.location.hash.includes("popover") ||
    !!(window as unknown as { __IS_PET_POPOVER__?: boolean }).__IS_PET_POPOVER__ ||
    (window as unknown as { __TAURI_WINDOW_LABEL__?: string }).__TAURI_WINDOW_LABEL__ === "pet-popover" ||
    (window as unknown as { __TAURI_INTERNALS__?: { metadata?: { currentWindow?: { label?: string } } } })
      .__TAURI_INTERNALS__?.metadata?.currentWindow?.label === "pet-popover");

const rootElement = document.getElementById("root")!;

async function start() {
  try { await restoreInstalledPets(); } catch (error) { console.warn("Offline pet storage unavailable:", error); }
  subscribePetInstallations();
  if (isBreakOverlay) {
    mount(BreakOverlay, { target: rootElement });
  } else if (isPopover) {
    mount(PetPopover, { target: rootElement });
  } else if (isPetOverlay) {
    mount(PetOverlay, { target: rootElement });
  } else if (isPingOverlay) {
    mount(PingOverlay, { target: rootElement });
  } else {
    mount(App, { target: rootElement });
  }
}
void start();
