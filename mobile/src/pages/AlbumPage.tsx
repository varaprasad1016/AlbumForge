import { useEffect, useState } from "react";
import AlbumEditor from "../components/AlbumEditor";
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

  async function load() {
    const a = await window.albumforge.albums.get(albumId);
    setAlbum(a);
    setPages(await window.albumforge.albums.pages(albumId));
    setVersions(await window.albumforge.albums.versions(albumId));
    if (a.templateId) {
      const t = await window.albumforge.templates.get(a.templateId);
      if (t) setLayouts(t.layouts.map((l) => ({ key: l.key, name: l.name })));
    }
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

  async function doExport(kind: string, dpi = 300) {
    const job = await window.albumforge.exports.create(albumId, { kind, dpi, bleedMm: 3 });
    setExports((prev) => [...prev, job]);
    pollExport(job.id);
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
      <header className="mb-3 flex items-center gap-3">
        <a href="#/albums" className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </a>
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold">{album?.name ?? "Album"}</h1>
      </header>
      <div className="mb-3 flex rounded-xl bg-slate-100 p-1">
        {(["editor", "versions", "export"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold capitalize transition-colors ${
              tab === t ? "bg-white text-brand shadow-sm" : "text-slate-500"
            }`}
          >
            {t}
          </button>
        ))}
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
          <div className="flex gap-2">
            <button onClick={() => doExport("proof_pdf", 150)} className="btn-secondary">
              Proof PDF (watermarked)
            </button>
            <button onClick={() => doExport("preview_pdf")} className="btn-secondary">
              Preview PDF
            </button>
            <button onClick={() => doExport("highres_pdf")} className="btn-primary">
              High-res PDF (300 DPI)
            </button>
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
