import { useEffect, useState } from "react";
import AlbumEditor from "../components/AlbumEditor";
import { LAB_PRESETS } from "@shared/api";
import type { Album, AlbumPage, AlbumVersion, ExportJob } from "@shared/api";

type Tab = "editor" | "versions" | "export";

interface LayoutOption {
  key: string;
  name: string;
}

export default function AlbumPage({ albumId }: { albumId: string }) {
  const [album, setAlbum] = useState<Album | null>(null);
  const [pages, setPages] = useState<AlbumPage[]>([]);
  const [tab, setTab] = useState<Tab>("editor");
  const [versions, setVersions] = useState<AlbumVersion[]>([]);
  const [exports, setExports] = useState<ExportJob[]>([]);
  const [layouts, setLayouts] = useState<LayoutOption[]>([]);
  const [presetId, setPresetId] = useState<string>(LAB_PRESETS[0].id);
  const [customDpi, setCustomDpi] = useState("");
  const [proofInfo, setProofInfo] = useState("");
  const [notes, setNotes] = useState<Array<{ photoId: string; filename: string; comment: string }>>([]);

  function effectiveDpi(presetDpi: number): number {
    const n = parseInt(customDpi, 10);
    if (Number.isFinite(n)) return Math.max(72, Math.min(1200, n));
    return presetDpi;
  }

  async function load() {
    const a = await window.albumforge.albums.get(albumId);
    setAlbum(a);
    setPages(await window.albumforge.albums.pages(albumId));
    setVersions(await window.albumforge.albums.versions(albumId));
    if (a.templateId) {
      const t = await window.albumforge.templates.get(a.templateId);
      if (t) setLayouts(t.layouts.map((l) => ({ key: l.key, name: l.name })));
    }
    setNotes(await window.albumforge.proofs.notes(a.projectId));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [albumId]);

  function onPageUpdated(updated: AlbumPage) {
    setPages((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }

  async function snapshot() {
    await window.albumforge.albums.snapshot(albumId);
    setVersions(await window.albumforge.albums.versions(albumId));
  }

  async function restore(versionId: string) {
    setPages(await window.albumforge.albums.restoreVersion(albumId, versionId));
  }

  async function doExport(kind: string, dpiOverride?: number) {
    const path = await window.albumforge.dialogs.chooseSavePath(`${album?.name ?? "album"}.pdf`);
    if (!path) return;
    const preset = LAB_PRESETS.find((p) => p.id === presetId) ?? LAB_PRESETS[0];
    const job = await window.albumforge.exports.create(albumId, {
      kind,
      dpi: dpiOverride ?? effectiveDpi(preset.dpi),
      bleedMm: preset.bleedMm,
      colorMode: preset.colorMode,
      presetId: preset.id,
      targetPath: path,
    });
    setExports((prev) => [...prev, job]);
    pollExport(job.id);
  }

  async function doExportPackage() {
    const dir = await window.albumforge.dialogs.chooseDirectory();
    if (!dir) return;
    const preset = LAB_PRESETS.find((p) => p.id === presetId) ?? LAB_PRESETS[0];
    const job = await window.albumforge.exports.create(albumId, {
      kind: "lab_package",
      dpi: effectiveDpi(preset.dpi),
      bleedMm: preset.bleedMm,
      colorMode: preset.colorMode,
      presetId: preset.id,
      targetPath: dir,
    });
    setExports((prev) => [...prev, job]);
    pollExport(job.id);
  }

  async function exportProofGallery() {
    const dir = await window.albumforge.dialogs.chooseDirectory();
    if (!dir) return;
    const res = await window.albumforge.proofs.build(albumId, dir);
    setProofInfo(`Proof gallery ready: ${res.dir} (${res.photos} photos). Send the folder to your client.`);
  }

  async function importClientFeedback() {
    if (!album) return;
    const file = await window.albumforge.dialogs.chooseFeedback();
    if (!file) return;
    const res = await window.albumforge.proofs.importFeedback(album.projectId, file);
    setProofInfo(`Feedback imported: ${res.favorited} favourites selected, ${res.commented} comments saved.`);
    setNotes(await window.albumforge.proofs.notes(album.projectId));
  }

  async function pollExport(exportId: string) {
    const timer = setInterval(async () => {
      const job = await window.albumforge.exports.get(exportId);
      setExports((prev) => prev.map((e) => (e.id === exportId ? job : e)));
      if (job.status === "completed" || job.status === "failed") clearInterval(timer);
    }, 500);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{album?.name ?? "Album"}</h1>
        <div className="flex gap-2">
          {(["editor", "versions", "export"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold capitalize transition-colors ${
                tab === t
                  ? "bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === "editor" && album && (
        <AlbumEditor
          albumId={albumId}
          projectId={album.projectId}
          pages={pages}
          pageSize={album.pageSize}
          layouts={layouts}
          onPageUpdated={onPageUpdated}
          onPagesChanged={setPages}
        />
      )}

      {tab === "versions" && (
        <div className="space-y-3">
          <button onClick={snapshot} className="btn-primary">
            Snapshot current state
          </button>
          <ul className="space-y-2">
            {versions.map((v) => (
              <li key={v.id} className="flex items-center gap-3 rounded border border-slate-200 p-3">
                <span className="text-sm">Version {v.versionNumber}</span>
                <span className="text-xs text-slate-400">{new Date(v.createdAt).toLocaleString()}</span>
                <button onClick={() => restore(v.id)} className="btn-secondary ml-auto !px-3 !py-1">
                  Restore
                </button>
              </li>
            ))}
            {versions.length === 0 && <p className="text-sm text-slate-400">No versions yet.</p>}
          </ul>
        </div>
      )}

      {tab === "export" && (
        <div className="space-y-4">
          <div className="card max-w-xl p-4">
            <label className="field-label">Lab preset</label>
            <div className="flex items-center gap-2">
              <select value={presetId} onChange={(e) => setPresetId(e.target.value)} className="input flex-1">
                {LAB_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.dpi} DPI · {p.bleedMm} mm bleed · {p.colorMode.toUpperCase()}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={72}
                max={1200}
                step={50}
                value={customDpi}
                onChange={(e) => setCustomDpi(e.target.value)}
                placeholder="Custom DPI"
                className="input !w-32"
              />
            </div>
            <p className="mt-2 text-xs text-slate-400">
              {customDpi
                ? `Custom resolution ${effectiveDpi(300)} DPI — overrides the preset.`
                : LAB_PRESETS.find((p) => p.id === presetId)?.description}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => doExport("proof_pdf")} className="btn-secondary">
              Proof PDF (watermarked)
            </button>
            <button onClick={() => doExport("preview_pdf")} className="btn-secondary">
              Preview PDF
            </button>
            <button onClick={() => doExport("highres_pdf")} className="btn-primary">
              High-res PDF
            </button>
            <button onClick={doExportPackage} className="btn-primary">
              Export lab package
            </button>
          </div>

          <div className="card max-w-xl p-4">
            <h3 className="font-semibold">Client proofing</h3>
            <p className="mt-1 text-xs text-slate-400">
              Export a self-contained proof gallery your client can open in any browser, mark favourites
              and leave comments — then import their feedback.json back here.
            </p>
            <div className="mt-3 flex gap-2">
              <button onClick={exportProofGallery} className="btn-secondary">
                Export proof gallery
              </button>
              <button onClick={importClientFeedback} className="btn-primary">
                Import client feedback
              </button>
            </div>
            {proofInfo && <p className="mt-2 text-sm text-emerald-600">{proofInfo}</p>}
            {notes.length > 0 && (
              <ul className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
                {notes.map((n) => (
                  <li key={n.photoId} className="text-sm">
                    <span className="font-medium text-slate-600">{n.filename}</span>
                    <span className="text-slate-400"> — {n.comment}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <ul className="space-y-2">
            {exports.map((e) => (
              <li key={e.id} className="flex items-center gap-3 rounded border border-slate-200 p-3 text-sm">
                <span>{e.kind}</span>
                <span className="text-slate-400">{e.status}</span>
                {e.filePath && (
                  <button onClick={() => window.albumforge.openPath(e.filePath!)} className="ml-auto text-brand">
                    Open
                  </button>
                )}
                {e.error && <span className="text-red-600">{e.error}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
