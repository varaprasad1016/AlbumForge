import { useEffect, useState } from "react";
import type { AppInfo } from "@shared/api";

type UpdatePhase = "idle" | "checking" | "uptodate" | "available" | "error";

export default function SettingsPage() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [phase, setPhase] = useState<UpdatePhase>("idle");
  const [version, setVersion] = useState("");
  const [error, setError] = useState("");
  const [cacheCleared, setCacheCleared] = useState(false);

  useEffect(() => {
    window.albumforge.info().then(setInfo);
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
                <button onClick={() => void window.albumforge.installUpdate()} className="btn-primary mt-2 w-full">
                  Download update
                </button>
              </div>
            )}
            {phase === "error" && <p className="text-red-600">{error}</p>}
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
