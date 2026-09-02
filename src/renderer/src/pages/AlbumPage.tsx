import { useEffect, useRef, useState } from "react";
import AlbumEditor from "../components/AlbumEditor";
import { LAB_PRESETS } from "@shared/api";
import type { Album, AlbumPage, AlbumVersion, ExportJob, PrintQuote } from "@shared/api";

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
  // ---- Phase 9: recovery journal + .album / print tools ----
  const [recovery, setRecovery] = useState<{ pages: AlbumPage[]; at: string } | null>(null);
  const [albumMsg, setAlbumMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const pagesRef = useRef<AlbumPage[]>(pages);
  pagesRef.current = pages;
  const journalLastRef = useRef<string | null>(null);
  // Print-order builder inputs.
  const [printSizeW, setPrintSizeW] = useState("254");
  const [printSizeH, setPrintSizeH] = useState("254");
  const [printCopies, setPrintCopies] = useState("1");
  const [printColor, setPrintColor] = useState<string>("rgb");
  const [printDpi, setPrintDpi] = useState("300");
  const [printBase, setPrintBase] = useState("5000");
  const [printMarkup, setPrintMarkup] = useState("40");
  const [printTax, setPrintTax] = useState("0");
  const [printQuote, setPrintQuote] = useState<PrintQuote | null>(null);
  const [printPayloadJson, setPrintPayloadJson] = useState("");
  const [printBusy, setPrintBusy] = useState(false);

  function effectiveDpi(presetDpi: number): number {
    const n = parseInt(customDpi, 10);
    if (Number.isFinite(n)) return Math.max(72, Math.min(1200, n));
    return presetDpi;
  }

  async function load() {
    const a = await window.albumforge.albums.get(albumId);
    setAlbum(a);
    const pagesLoaded = await window.albumforge.albums.pages(albumId);
    setPages(pagesLoaded);
    setVersions(await window.albumforge.albums.versions(albumId));
    if (a.templateId) {
      const t = await window.albumforge.templates.get(a.templateId);
      if (t) setLayouts(t.layouts.map((l) => ({ key: l.key, name: l.name })));
    }
    setNotes(await window.albumforge.proofs.notes(a.projectId));
    // Phase 9 boot hook: an uncommitted recovery delta means the last session
    // ended unexpectedly with newer work than what reached the DB. Offer the
    // restore only when the journal differs from the committed pages; when it
    // matches, sweep the shadow file. (Native-only — Electron rejects.)
    try {
      const snap = await window.albumforge.project.recover(albumId);
      if (snap && Array.isArray((snap as { pages?: unknown }).pages)) {
        const s = snap as { pages: AlbumPage[]; at?: string };
        if (JSON.stringify(s.pages) !== JSON.stringify(pagesLoaded)) {
          setRecovery({ pages: s.pages, at: s.at ?? "" });
        } else {
          await window.albumforge.project.clearRecovery(albumId);
        }
      }
    } catch {
      // No recovery journal on this shell — fine.
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [albumId]);

  /** Phase 9 journaled autosave: whole-album snapshot every 60 s (only when
   *  the pages actually changed since the last journal write). The journal is
   *  native-side storage; the tick lives here in the renderer. */
  useEffect(() => {
    const id = window.setInterval(() => {
      const cur = pagesRef.current;
      if (!cur.length) return;
      const payload = JSON.stringify({ at: Date.now(), pages: cur });
      if (payload === journalLastRef.current) return;
      journalLastRef.current = payload;
      window.albumforge.project.autosave(albumId, JSON.parse(payload)).catch(() => undefined);
    }, 60_000);
    return () => window.clearInterval(id);
  }, [albumId]);

  async function restoreRecoveredDraft() {
    if (!recovery) return;
    setPages(recovery.pages);
    try {
      await window.albumforge.project.clearRecovery(albumId);
    } catch {
      // native-only
    }
    setRecovery(null);
    setAlbumMsg({ kind: "ok", text: "Recovered the unsaved draft." });
  }

  async function discardRecoveredDraft() {
    try {
      await window.albumforge.project.clearRecovery(albumId);
    } catch {
      // native-only
    }
    setRecovery(null);
  }

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

  function albumPhotoCount(pagesList: AlbumPage[]): number {
    const ids = new Set<string>();
    for (const p of pagesList) for (const e of p.elements) if (e.photoId) ids.add(e.photoId);
    return ids.size;
  }

  /** Package the workspace into a portable `.album` archive (layout.json +
   *  embedded proxy thumbnails) via the native file engine. */
  async function saveAlbumFile() {
    if (!album) return;
    const path = await window.albumforge.dialogs.chooseSavePath(`${album.name}.album`);
    if (!path) return;
    setAlbumMsg(null);
    try {
      const layout = {
        id: albumId,
        name: album.name,
        projectId: album.projectId,
        pageCount: pages.length,
        photoCount: albumPhotoCount(pages),
        pages,
      };
      const summary = await window.albumforge.project.saveAlbumFile(path, layout);
      setAlbumMsg({
        kind: "ok",
        text: `Saved .album: ${summary.entries.length} entries (${(summary.bytes / 1024).toFixed(1)} KB) → ${path}`,
      });
    } catch (e) {
      setAlbumMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    }
  }

  /** White-label quote + structural Prodigi/Gelato payloads for this album.
   *  Pure local compile — no order is placed from here. */
  async function buildPrintOrder() {
    if (!album || !pages.length) return;
    setPrintBusy(true);
    setAlbumMsg(null);
    try {
      const spec = {
        productKey: `${album.name} ${printSizeW}×${printSizeH}`, // SKU filled by the retail catalogue later
        sizeMm: { widthMm: Math.max(1, parseFloat(printSizeW) || 254), heightMm: Math.max(1, parseFloat(printSizeH) || 254) },
        bleedMm: (LAB_PRESETS.find((p) => p.id === presetId) ?? LAB_PRESETS[0]).bleedMm,
        copies: Math.max(1, parseInt(printCopies, 10) || 1),
        dpi: Math.max(72, parseInt(printDpi, 10) || 300),
        colorMode: printColor,
        currency: "USD",
      };
      const q = await window.albumforge.print.quote({
        baseCostCents: Math.max(0, parseInt(printBase, 10) || 0),
        markupPercent: Math.max(0, parseFloat(printMarkup) || 0),
        taxPercent: Math.max(0, parseFloat(printTax) || 0),
        currency: "USD",
      });
      setPrintQuote(q);
      const layout = {
        id: albumId,
        photoCount: albumPhotoCount(pages),
        pages: pages.map((p) => ({ id: p.id, index: p.index, isSpread: p.isSpread })),
      };
      const payloads = await window.albumforge.print.payload(layout, spec);
      setPrintPayloadJson(
        JSON.stringify({ manifest: payloads.manifest, prodigi: payloads.prodigi, gelato: payloads.gelato }, null, 2),
      );
      setAlbumMsg({ kind: "ok", text: "Quote + order payloads compiled locally. No order was placed." });
    } catch (e) {
      setAlbumMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setPrintBusy(false);
    }
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
                  ? "bg-gradient-to-br from-amber-500 to-yellow-700 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {recovery && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
          <span className="font-medium text-amber-800">
            Unsaved changes found from a previous session
            {recovery.at ? ` (${new Date(Number(recovery.at) || recovery.at).toLocaleString()})` : ""} — restore
            them?
          </span>
          <div className="ml-auto flex gap-2">
            <button onClick={restoreRecoveredDraft} className="btn-primary !px-3 !py-1">
              Restore draft
            </button>
            <button onClick={discardRecoveredDraft} className="btn-secondary !px-3 !py-1">
              Discard
            </button>
          </div>
        </div>
      )}

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

          <div className="card max-w-xl space-y-4 p-4">
            <h3 className="font-semibold">Album tools</h3>
            <p className="text-xs text-slate-400">
              Phase 9 — portable <code className="rounded bg-slate-100 px-1">.album</code> file (layout JSON + embedded proxy
              thumbnails) and a local white-label print quote + Prodigi/Gelato order payload compile.
            </p>
            {albumMsg && (
              <p className={`text-sm ${albumMsg.kind === "ok" ? "text-emerald-600" : "text-red-600"}`}>{albumMsg.text}</p>
            )}

            <div>
              <button onClick={saveAlbumFile} className="btn-secondary">Save .album file…</button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <label className="field-label !mb-0">
                Width mm
                <input type="number" value={printSizeW} onChange={(e) => setPrintSizeW(e.target.value)} className="input mt-1" />
              </label>
              <label className="field-label !mb-0">
                Height mm
                <input type="number" value={printSizeH} onChange={(e) => setPrintSizeH(e.target.value)} className="input mt-1" />
              </label>
              <label className="field-label !mb-0">
                Copies
                <input type="number" min={1} value={printCopies} onChange={(e) => setPrintCopies(e.target.value)} className="input mt-1" />
              </label>
              <label className="field-label !mb-0">
                Colour
                <select value={printColor} onChange={(e) => setPrintColor(e.target.value)} className="input mt-1">
                  <option value="rgb">RGB</option>
                  <option value="cmyk">CMYK (needs profiler)</option>
                </select>
              </label>
              <label className="field-label !mb-0">
                DPI
                <input type="number" min={72} value={printDpi} onChange={(e) => setPrintDpi(e.target.value)} className="input mt-1" />
              </label>
              <label className="field-label !mb-0">
                Bleed (preset)
                <div className="mt-1 rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-500">
                  {(LAB_PRESETS.find((p) => p.id === presetId) ?? LAB_PRESETS[0]).bleedMm} mm
                </div>
              </label>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <label className="field-label !mb-0">
                Lab base (¢)
                <input type="number" min={0} value={printBase} onChange={(e) => setPrintBase(e.target.value)} className="input mt-1" />
              </label>
              <label className="field-label !mb-0">
                Markup %
                <input type="number" min={0} value={printMarkup} onChange={(e) => setPrintMarkup(e.target.value)} className="input mt-1" />
              </label>
              <label className="field-label !mb-0">
                Tax %
                <input type="number" min={0} value={printTax} onChange={(e) => setPrintTax(e.target.value)} className="input mt-1" />
              </label>
            </div>

            <div className="flex items-center gap-3">
              <button onClick={buildPrintOrder} disabled={printBusy || !pages.length} className="btn-primary">
                {printBusy ? "Compiling…" : "Quote + build order payloads"}
              </button>
              {printQuote && (
                <p className="text-sm">
                  <span className="font-semibold text-ink">
                    ${(printQuote.totalCents / 100).toFixed(2)} {printQuote.currency}
                  </span>
                  <span className="text-slate-400">
                    {" "}(base ${(printQuote.baseCostCents / 100).toFixed(2)} + {printQuote.markupCents / 100} markup +{" "}
                    {printQuote.taxCents / 100} tax)
                  </span>
                </p>
              )}
            </div>
            {printPayloadJson && (
              <details className="rounded border border-slate-200">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-slate-600">
                  Review Prodigi / Gelato order payloads
                </summary>
                <pre className="max-h-72 overflow-auto border-t border-slate-100 bg-slate-50 p-3 text-[11px] leading-relaxed">
                  {printPayloadJson}
                </pre>
              </details>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
