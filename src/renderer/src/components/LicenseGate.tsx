import { useEffect, useState } from "react";
import type { LicenseStatus } from "@shared/api";

/**
 * Product license gate (Phase 9). `license.status()` returns typed reasons:
 * - `not-configured` / `absent` → this build has no Keygen env configured
 *   (dev/staging) — the app proceeds freely and Settings shows the status.
 * - real denials (`expired`, `fingerprint-mismatch`, `invalid-signature`) →
 *   a full-screen key-entry gate blocks the app until `activate` succeeds.
 * - `active` → no gate; Settings shows the remaining offline window.
 */
const DENIAL_REASONS = new Set(["expired", "fingerprint-mismatch", "invalid-signature"]);

export default function LicenseGate() {
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    window.albumforge.license
      .status()
      .then((s) => alive && setStatus(s))
      .catch(() => alive && setStatus({ active: false, reason: "unavailable", expiresAt: null, remainingSeconds: null, fingerprint: null, licenseId: null }));
    return () => {
      alive = false;
    };
  }, []);

  if (!status || status.active || !DENIAL_REASONS.has(status.reason)) return null;

  const reasonText: Record<string, string> = {
    expired: "Your license lease has expired and could not re-validate while offline.",
    "fingerprint-mismatch": "This license is bound to a different machine.",
    "invalid-signature": "The cached license could not be verified.",
  };

  async function activate() {
    if (!key.trim()) return;
    setBusy(true);
    setError("");
    try {
      const res = await window.albumforge.license.activate(key.trim());
      if (res.valid) {
        setStatus(await window.albumforge.license.status());
      } else {
        setError(`Activation rejected${res.detail ? `: ${String(res.detail)}` : "."}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/95 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-card">
        <div className="mb-1 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-yellow-700 text-lg font-bold text-white">
            A
          </span>
          <h1 className="text-xl font-bold">AlbumForge license required</h1>
        </div>
        <p className="mt-2 text-sm text-slate-600">{reasonText[status.reason] ?? "This license is not valid."}</p>
        {status.licenseId && (
          <p className="mt-1 text-xs text-slate-400">License {status.licenseId}</p>
        )}
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && activate()}
          placeholder="Paste your license key"
          autoFocus
          className="input mt-4 w-full"
          disabled={busy}
        />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex justify-end">
          <button onClick={activate} disabled={busy || !key.trim()} className="btn-primary">
            {busy ? "Activating…" : "Activate"}
          </button>
        </div>
        <p className="mt-3 text-center text-xs text-slate-400">
          Need help? Your licence key comes from the store where you bought AlbumForge.
        </p>
      </div>
    </div>
  );
}
