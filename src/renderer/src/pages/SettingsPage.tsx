import { useEffect, useState } from "react";
import type { AppInfo, LicenseStatus, UpdateEvent } from "@shared/api";
import { setLang, t, useLang, type Lang } from "../i18n";
import { useTheme } from "../theme";

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
  const [license, setLicense] = useState<LicenseStatus | null>(null);
  const [licenseKey, setLicenseKey] = useState("");
  const [licenseBusy, setLicenseBusy] = useState(false);
  const [licenseMsg, setLicenseMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const { dark, toggle } = useTheme();
  const lang = useLang();

  useEffect(() => {
    void refreshLicense();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  async function refreshLicense() {
    try {
      setLicense(await window.albumforge.license.status());
      setLicenseMsg(null);
    } catch (e) {
      setLicenseMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    }
  }

  async function activateLicense() {
    if (!licenseKey.trim()) return;
    setLicenseBusy(true);
    setLicenseMsg(null);
    try {
      const res = await window.albumforge.license.activate(licenseKey.trim());
      if (res.valid) {
        setLicenseKey("");
        setLicenseMsg({
          kind: "ok",
          text: `License activated.${res.offlineLease ? " Offline lease armed for 7 days." : " No offline lease returned by Keygen (online validation only)."}`,
        });
      } else {
        setLicenseMsg({ kind: "err", text: `Activation rejected${res.detail ? `: ${String(res.detail)}` : "."}` });
      }
      await refreshLicense();
    } catch (e) {
      setLicenseMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setLicenseBusy(false);
    }
  }

  async function deactivateLicense() {
    setLicenseBusy(true);
    try {
      await window.albumforge.license.deactivate();
      setLicenseMsg({ kind: "ok", text: "Local license lease cleared." });
      await refreshLicense();
    } catch (e) {
      setLicenseMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setLicenseBusy(false);
    }
  }

  function startDownload() {
    setUpdate((prev) => (prev.phase === "available" ? { phase: "downloading", percent: 0 } : prev));
    void window.albumforge.downloadUpdate();
  }

  function installNow() {
    void window.albumforge.installUpdate();
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold">Settings</h1>

      <div className="space-y-4">
        <section className="card p-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{t("settings.appearance")}</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-ink">{t("settings.darkMode")}</p>
              <p className="text-xs text-slate-400">{t("settings.darkModeHint")}</p>
            </div>
            <button
              onClick={toggle}
              className={`relative h-7 w-12 rounded-full transition-colors ${dark ? "bg-indigo-500" : "bg-slate-300"}`}
              title={dark ? t("nav.light") : t("nav.dark")}
            >
              <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${dark ? "left-6" : "left-1"}`} />
            </button>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <div>
              <p className="font-medium text-ink">{t("settings.language")}</p>
              <p className="text-xs text-slate-400">{t("settings.languageHint")}</p>
            </div>
            <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} className="input !w-32">
              <option value="en">English</option>
              <option value="fr">Français</option>
              <option value="hi">हिन्दी</option>
            </select>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{t("settings.storage")}</h2>
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
              {t("settings.clearCache")}
            </button>
            {cacheCleared && <span className="text-sm font-medium text-emerald-600">{t("settings.cleared")}</span>}
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{t("settings.updates")}</h2>
          <button
            onClick={checkUpdates}
            disabled={update.phase === "checking" || update.phase === "downloading"}
            className="btn-secondary"
          >
            {t("settings.check")}
          </button>

          <div className="mt-3 text-sm">
            {update.phase === "checking" && <p className="text-slate-500">{t("settings.checking")}</p>}
            {update.phase === "idle" && info?.version && <p className="text-slate-400">Current version: v{info.version}</p>}
            {update.phase === "downloading" && (
              <div>
                <p className="mb-1 text-slate-500">{t("settings.downloading", { percent: update.percent })}</p>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-1.5 rounded-full bg-gradient-to-r from-amber-500 to-yellow-700 transition-all"
                    style={{ width: `${update.percent}%` }}
                  />
                </div>
              </div>
            )}
            {update.phase === "uptodate" && <p className="text-emerald-600">{t("settings.uptodate")}</p>}
            {update.phase === "error" && <p className="text-red-600">{update.message}</p>}
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Licensing</h2>
          <div className="text-sm">
            {!license && <p className="text-slate-400">Checking license state…</p>}
            {license && license.active && (
              <p className="text-emerald-600">
                License active
                {license.expiresAt != null
                  ? ` — offline lease valid until ${new Date(license.expiresAt * 1000).toLocaleString()} (${Math.max(0, Math.ceil((license.expiresAt * 1000 - Date.now()) / 86_400_000))}d left)`
                  : ""}
              </p>
            )}
            {license && !license.active && license.reason === "not-configured" && (
              <p className="text-slate-500">
                Licensing is not configured on this build (no <code className="rounded bg-slate-100 px-1">ALBUMFORGE_KEYGEN_*</code> environment). The app runs
                unlicensed — set the environment keys on the native host to enable seat enforcement.
              </p>
            )}
            {license && !license.active && license.reason === "absent" && (
              <p className="text-slate-500">No license activated yet. Paste a key to activate.</p>
            )}
            {license && !license.active && !["absent", "not-configured"].includes(license.reason) && (
              <p className="text-red-600">
                License not active — {license.reason}
                {license.expiresAt != null ? ` (expired ${new Date(license.expiresAt * 1000).toLocaleString()})` : ""}.
              </p>
            )}
          </div>
          {license && (license.reason === "absent" || license.reason === "not-configured" || !license.active) && (
            <div className="mt-3 flex items-center gap-2">
              <input
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && activateLicense()}
                placeholder="License key"
                disabled={licenseBusy}
                className="input flex-1"
              />
              <button onClick={activateLicense} disabled={licenseBusy || !licenseKey.trim()} className="btn-primary">
                Activate
              </button>
            </div>
          )}
          {licenseMsg && (
            <p className={`mt-2 text-sm ${licenseMsg.kind === "ok" ? "text-emerald-600" : "text-red-600"}`}>{licenseMsg.text}</p>
          )}
          {license && license.active && (
            <button onClick={deactivateLicense} disabled={licenseBusy} className="btn-secondary mt-3">
              Deactivate on this machine
            </button>
          )}
        </section>

        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">About</h2>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-yellow-700 text-lg font-bold text-white shadow-sm">
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

      {update.phase === "available" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-96 rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-yellow-700 text-white">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 16l-4-4 4-4m10 8l4-4-4-4M14 4l-4 16" />
                </svg>
              </span>
              <div>
                <h3 className="font-semibold text-ink">Update available</h3>
                <p className="text-sm text-slate-500">A new version (v{update.version}) is available.</p>
              </div>
            </div>
            <p className="mt-3 text-sm text-slate-500">Do you want to download and install it?</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setUpdate({ phase: "idle" })} className="btn-secondary">
                Not now
              </button>
              <button onClick={startDownload} className="btn-primary">
                Download &amp; install
              </button>
            </div>
          </div>
        </div>
      )}

      {update.phase === "ready" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-96 rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
            <h3 className="font-semibold text-ink">Update downloaded</h3>
            <p className="mt-2 text-sm text-slate-500">
              Version v{update.version} is ready. Restart AlbumForge now to install it?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setUpdate({ phase: "idle" })} className="btn-secondary">
                Later
              </button>
              <button onClick={installNow} className="btn-primary">
                Restart now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
