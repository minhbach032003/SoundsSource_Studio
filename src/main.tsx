import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { FloatingPetOverlayView } from "./views/FloatingPetOverlayView";
import { PingOverlayView } from "./views/PingOverlayView";
import "./styles.css";

const isPingOverlay =
  typeof window !== "undefined" &&
  (window.location.search.includes("ping_overlay") ||
    window.location.hash.includes("ping_overlay"));

const isPetOverlay =
  typeof window !== "undefined" &&
  !isPingOverlay &&
  (window.location.search.includes("overlay") ||
    window.location.hash.includes("overlay"));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isPingOverlay ? (
      <PingOverlayView />
    ) : isPetOverlay ? (
      <FloatingPetOverlayView />
    ) : (
      <App />
    )}
  </React.StrictMode>
);
