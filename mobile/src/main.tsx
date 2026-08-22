import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { initBackend } from "./lib/backend";
import { initTheme } from "./lib/theme";

async function boot() {
  initTheme();
  await initBackend();
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

boot();
