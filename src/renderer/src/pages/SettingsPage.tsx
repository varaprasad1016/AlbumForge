import { useEffect, useState } from "react";
import type { AppInfo, UpdateEvent } from "@shared/api";

type UpdateStatus =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "available"; version: string }
  | { phase: "downloading"; percent: number }
  | { phase: "ready"; version: string }
  | { phase: "uptodate" }
  | { phase: "error"; message: string };

export default function SettingsPage() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [update, setUpdate] = useState<UpdateStatus>({ phase: "idle" });
  const [cacheCleared, setCacheCleared] = useState(false);

  useEffect(() => {
    window.albumforge.info().then(setInfo);
    const off = window.albumforge.onUpdateEvent((e: UpdateEvent) => {
      switch (e.type) {
        case "checking":
          setUpdate({ phase: "checking" });
          break;
        case "available":
          setUpdate({ phase: "available", version: e.version });
          break;
        case "not-available":
          setUpdate({ phase: "uptodate" });
          break;
        case "progress":
          setUpdate({ phase: "downloading", percent: e.percent });
          break;
        case "downloaded":
          setUpdate({ phase: "ready", version: e.version });
          break;
        case "error":
          setUpdate({ phase: "error", message: e.message });
          break;
      }
    });
    return off;
  }, []);

  async function clearCache() {
    await window.albumforge.clearCache();
    setCacheCleared(true);
    setTimeout(() => setCacheCleared(false), 2000);
  }

  async function checkUpdates() {
    setUpdate({ phase: "checking" });
    const msg = await window.albumforge.checkForUpdates();
    if (msg.startsWith("Update check failed") || msg.startsWith("Updates are only")) {
      setUpdate({ phase: "error", message: msg });
    }
  }

  function installUpdate() {
    void window.albumforge.installUpdate();
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold">Settings</h1>

      <div className="space-y-4">
        <section className="card p-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Storage</h2>
          <p className="text-sm text-slate-500">
            All data is stored locally on this computer. Original photos are never copied or moved.
          </p>
          <dl className="mt-3 space-y-1.5 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Data</dt>
              <dd className="truncate text-slate-700">{info?.dataPath}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Thumbnail cache</dt>
              <dd className="truncate text-slate-700">{info?.cachePath}</dd>
            </div>
          </dl>
          <div className="mt-4 flex items-center gap-2">
            <button onClick={() => window.albumforge.openDataFolder()} className="btn-secondary">
              Open data folder
            </button>
            <button onClick={clearCache} className="btn-secondary">
              Clear thumbnail cache
            </button>
            {cacheCleared && <span className="text-sm font-medium text-emerald-600">Cache cleared ✓</span>}
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Updates</h2>

          <div className="flex items-center gap-2">
            <button onClick={checkUpdates} disabled={update.phase === "checking" || update.phase === "downloading"} className="btn-secondary">
              Check for updates
            </button>
            {update.phase === "ready" && (
              <button onClick={installUpdate} className="btn-primary">
                Restart to install v{update.version}
              </button>
            )}
          </div>

          <div className="mt-3 text-sm">
            {update.phase === "checking" && <p className="text-slate-500">Checking for updates…</p>}
            {update.phase === "available" && <p className="text-slate-500">Update v{update.version} found — downloading…</p>}
            {update.phase === "downloading" && (
              <div>
                <p className="mb-1 text-slate-500">Downloading update… {update.percent}%</p>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-1.5 rounded-full bg-gradient-to-r from-indigo-500 to-violet-600 transition-all"
                    style={{ width: `${update.percent}%` }}
                  />
                </div>
              </div>
            )}
            {update.phase === "ready" && <p className="font-medium text-emerald-600">Update ready — restart to install.</p>}
            {update.phase === "uptodate" && <p className="text-emerald-600">You are up to date ✓</p>}
            {update.phase === "error" && <p className="text-red-600">{update.message}</p>}
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">About</h2>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-lg font-bold text-white shadow-sm">
              A
            </span>
            <div>
              <p className="font-semibold text-ink">AlbumForge</p>
              <p className="text-sm text-slate-500">Version {info?.version}</p>
            </div>
          </div>
          <dl className="mt-4 space-y-1.5 border-t border-slate-100 pt-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Author</dt>
              <dd className="font-medium text-slate-700">Vara</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Platform</dt>
              <dd className="text-slate-700">Fully local · no cloud</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
