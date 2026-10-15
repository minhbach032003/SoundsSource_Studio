import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { FloatingPetOverlayView } from "./views/FloatingPetOverlayView";
import "./styles.css";

const isOverlay =
  typeof window !== "undefined" &&
  (window.location.search.includes("overlay") ||
    window.location.hash.includes("overlay"));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isOverlay ? <FloatingPetOverlayView /> : <App />}
  </React.StrictMode>
);
