import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { initBackend } from "./lib/backend";
import { initTheme } from "./lib/theme";

function installErrorOverlay(): void {
  const show = (msg: string) => {
    try {
      const el = document.createElement("div");
      el.style.cssText =
        "position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#7f1d1d;color:#fff;font:12px monospace;padding:8px;white-space:pre-wrap;max-height:40vh;overflow:auto";
      el.textContent = msg;
      document.body.appendChild(el);
    } catch {
      /* ignore */
    }
  };
  window.addEventListener("error", (e) => show(String(e.message)));
  window.addEventListener("unhandledrejection", (e) => show(String((e as PromiseRejectionEvent).reason)));
}

function BootError({ message }: { message: string }) {
  return (
    <div style={{ padding: 24, fontFamily: "system-ui", color: "#111" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>AlbumForge could not start</h1>
      <p style={{ marginTop: 8, fontSize: 14 }}>Please share the details below with support.</p>
      <pre
        style={{
          marginTop: 12,
          whiteSpace: "pre-wrap",
          fontSize: 12,
          background: "#fee2e2",
          padding: 12,
          borderRadius: 8,
        }}
      >
        {message}
      </pre>
    </div>
  );
}

async function boot() {
  installErrorOverlay();
  try {
    initTheme();
  } catch {
    /* theme is cosmetic */
  }
  let backendError: string | null = null;
  try {
    await initBackend();
  } catch (e) {
    backendError = e instanceof Error ? (e.stack || e.message) : String(e);
    console.error("initBackend failed", e);
  }
  const root = ReactDOM.createRoot(document.getElementById("root")!);
  root.render(
    <React.StrictMode>{backendError ? <BootError message={backendError} /> : <App />}</React.StrictMode>,
  );
}

void boot();
