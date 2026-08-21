import { useEffect, useState } from "react";
import type { AppInfo, UpdateEvent } from "@shared/api";

type UpdatePhase = "idle" | "checking" | "uptodate" | "available" | "downloading" | "downloaded" | "error";

export default function SettingsPage() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [phase, setPhase] = useState<UpdatePhase>("idle");
  const [version, setVersion] = useState("");
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState("");
  const [cacheCleared, setCacheCleared] = useState(false);

  useEffect(() => {
    window.albumforge.info().then(setInfo);
    const off = window.albumforge.onUpdateEvent((e: UpdateEvent) => {
      if (e.type === "progress") {
        setPercent(e.percent);
        setPhase("downloading");
      } else if (e.type === "downloaded") {
        setPhase("downloaded");
      } else if (e.type === "error") {
        setError(e.message);
        setPhase("error");
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
    setPhase("checking");
    setError("");
    try {
      const msg = await window.albumforge.checkForUpdates();
      if (msg.startsWith("Update available")) {
        setVersion(msg.replace("Update available: v", ""));
        setPhase("available");
      } else if (msg.startsWith("You are up to date")) {
        setPhase("uptodate");
      } else {
        setError(msg);
        setPhase("error");
      }
    } catch {
      setError("Could not check for updates.");
      setPhase("error");
    }
  }

  async function downloadUpdate() {
    setError("");
    setPercent(0);
    setPhase("downloading");
    try {
      await window.albumforge.downloadUpdate();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }

  async function installUpdate() {
    setError("");
    try {
      await window.albumforge.installUpdate();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">Settings</h1>

      <div className="space-y-4">
        <section className="card p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Updates</h2>
          <button onClick={checkUpdates} disabled={phase === "checking"} className="btn-secondary w-full">
            {phase === "checking" ? "Checking…" : "Check for updates"}
          </button>

          <div className="mt-3 text-sm">
            {phase === "uptodate" && <p className="text-emerald-600">You are up to date ✓</p>}
            {phase === "available" && (
              <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-3">
                <p className="font-medium text-ink">Version v{version} is available</p>
                <button onClick={downloadUpdate} className="btn-primary mt-2 w-full">
                  Download update
                </button>
              </div>
            )}
            {phase === "downloading" && (
              <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-3">
                <p className="font-medium text-ink">Downloading update… {percent}%</p>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-indigo-100">
                  <div className="h-2 rounded-full bg-gradient-to-r from-indigo-500 to-violet-600 transition-all" style={{ width: `${percent}%` }} />
                </div>
              </div>
            )}
            {phase === "downloaded" && (
              <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3">
                <p className="font-medium text-ink">Update v{version} downloaded</p>
                <button onClick={installUpdate} className="btn-primary mt-2 w-full">
                  Install update
                </button>
                <p className="mt-2 text-xs text-slate-500">
                  Your device will ask you to confirm the installation.
                </p>
              </div>
            )}
            {phase === "error" && (
              <div className="rounded-lg border border-red-100 bg-red-50 p-3">
                <p className="text-red-600">{error}</p>
                {version && (
                  <button onClick={installUpdate} className="btn-secondary mt-2 w-full">
                    Install update
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="card p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Storage</h2>
          <p className="text-sm text-slate-500">All data is stored locally on this device. Original photos are never uploaded.</p>
          <div className="mt-3 flex items-center gap-2">
            <button onClick={clearCache} className="btn-secondary">
              Clear thumbnail cache
            </button>
            {cacheCleared && <span className="text-sm font-medium text-emerald-600">Cleared ✓</span>}
          </div>
        </section>

        <section className="card p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">About</h2>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-lg font-bold text-white">
              A
            </span>
            <div>
              <p className="font-semibold text-ink">AlbumForge</p>
              <p className="text-sm text-slate-500">Version {info?.version}</p>
            </div>
          </div>
          <dl className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Author</dt>
              <dd className="font-medium text-slate-700">Vara</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Platform</dt>
              <dd className="text-slate-700">Fully local · no cloud</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
