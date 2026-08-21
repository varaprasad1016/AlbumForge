import { useEffect, useState } from "react";
import type { AppInfo } from "@shared/api";

export default function SettingsPage() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [updateMsg, setUpdateMsg] = useState("");
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
    setUpdateMsg(await window.albumforge.checkForUpdates());
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Settings</h1>
      <div className="max-w-xl space-y-4">
        <section className="rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="mb-2 font-semibold">Storage</h2>
          <p className="text-sm text-neutral-500">All data is stored locally on this computer. Original photos are never copied or moved.</p>
          <ul className="mt-2 space-y-1 text-sm">
            <li>
              Data: <span className="text-neutral-400">{info?.dataPath}</span>
            </li>
            <li>
              Thumbnail cache: <span className="text-neutral-400">{info?.cachePath}</span>
            </li>
          </ul>
          <div className="mt-3 flex items-center gap-2">
            <button onClick={() => window.albumforge.openDataFolder()} className="rounded border border-neutral-300 px-3 py-1.5 text-sm">
              Open data folder
            </button>
            <button onClick={clearCache} className="rounded border border-neutral-300 px-3 py-1.5 text-sm">
              Clear thumbnail cache
            </button>
            {cacheCleared && <span className="text-sm text-green-600">Cache cleared</span>}
          </div>
        </section>

        <section className="rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="mb-2 font-semibold">Updates</h2>
          <button onClick={checkUpdates} className="rounded border border-neutral-300 px-3 py-1.5 text-sm">
            Check for updates
          </button>
          {updateMsg && <p className="mt-2 text-sm text-neutral-500">{updateMsg}</p>}
        </section>

        <section className="rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="mb-2 font-semibold">About</h2>
          <p className="text-sm text-neutral-500">AlbumForge v{info?.version} — fully local, no cloud.</p>
        </section>
      </div>
    </div>
  );
}
