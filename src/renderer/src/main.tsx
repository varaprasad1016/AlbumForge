import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { installBackend } from "./lib/backend";
import { initTheme } from "./theme";

// Expose `window.albumforge` on shells without the Electron preload (Tauri /
// bare Vite) so screens boot against the typed stub instead of crashing. No-op
// under Electron where the preload already installed the real implementation.
// On the native shell this resolves the app cache dir first, so `mediaUrl()`
// (the Phase-3 media seam) is armed before the first frame renders images.
void installBackend().then(() => {
  initTheme();

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
