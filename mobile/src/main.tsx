import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { initBackend } from "./lib/backend";

async function boot() {
  await initBackend();
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

boot();
