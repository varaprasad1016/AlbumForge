import { useCallback, useEffect, useState } from "react";
import PhotoGallery from "../components/PhotoGallery";
import PromptModal from "../components/PromptModal";
import type { Album, ImportProgress, Photo, PhotoGroup, Project, TemplateSummary } from "@shared/api";

const PAGE_LIMIT = 200;
type View = "photos" | "generate" | "groups" | "albums";

export default function ProjectPage({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const [groups, setGroups] = useState<PhotoGroup[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);

  const [templateId, setTemplateId] = useState("");
  const [pageSize, setPageSize] = useState("12x12");
  const [pageCount, setPageCount] = useState(20);
  const [selection, setSelection] = useState<"all" | "selected" | "ai">("all");
  const [variations, setVariations] = useState(1);

  const [view, setView] = useState<View>("photos");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [importNote, setImportNote] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [prompt, setPrompt] = useState<{ title: string; initial: string; onConfirm: (v: string) => void } | null>(null);

  const loadPhotos = useCallback(
    async (reset: boolean) => {
      const off = reset ? 0 : offset;
      const res = await window.albumforge.photos.list(projectId, {
        offset: off,
        limit: PAGE_LIMIT,
        groupId: activeGroupId ?? undefined,
      });
      setPhotos(reset ? res.items : (prev) => [...prev, ...res.items]);
      setTotal(res.total);
      setHasMore(off + res.items.length < res.total);
      setOffset(off + res.items.length);
    },
    [projectId, offset, activeGroupId],
  );

  const loadGroups = useCallback(async () => {
    setGroups(await window.albumforge.groups.list(projectId));
  }, [projectId]);

  useEffect(() => {
    window.albumforge.projects.get(projectId).then(setProject);
    window.albumforge.templates.list().then((t) => {
      setTemplates(t);
      if (t.length) setTemplateId(t[0].id);
    });
    window.albumforge.albums.list(projectId).then(setAlbums);
    loadGroups();
    loadPhotos(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    const off = window.albumforge.photos.onImportProgress(setProgress);
    return off;
  }, []);

  function togglePhoto(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        void window.albumforge.photos.setSelected(id, false);
      } else {
        next.add(id);
        void window.albumforge.photos.setSelected(id, true);
      }
      return next;
    });
  }

  async function deletePhoto(photoId: string) {
    if (!window.confirm("Delete this photo?")) return;
    await window.albumforge.photos.remove(photoId);
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(photoId);
      return next;
    });
    await loadPhotos(true);
  }

  async function deleteSelected() {
    if (!window.confirm(`Delete ${selected.size} selected photo(s)?`)) return;
    for (const id of selected) await window.albumforge.photos.remove(id);
    setSelected(new Set());
    await loadPhotos(true);
  }

  async function setThumbnail(photoId: string) {
    await window.albumforge.projects.setThumbnail(projectId, photoId);
  }

  async function handleImport() {
    const files = await window.albumforge.dialogs.chooseImages();
    if (!files || files.length === 0) return;
    setImporting(true);
    setImportNote("");
    try {
      const result = await window.albumforge.photos.importPhotos(projectId, files);
      setImportNote(
        result.failed > 0
          ? `${result.imported} imported, ${result.failed} failed`
          : `${result.imported} imported`,
      );
      await loadGroups();
      await loadPhotos(true);
    } finally {
      setImporting(false);
      setProgress(null);
    }
  }

  async function handleGenerate() {
    const sizeMap: Record<string, { width: number; height: number; unit: "mm" | "in" }> = {
      "12x12": { width: 12, height: 12, unit: "in" },
      "10x10": { width: 10, height: 10, unit: "in" },
      A4: { width: 210, height: 297, unit: "mm" },
    };
    setGenerating(true);
    setGenError("");
    try {
      const created = await window.albumforge.albums.generate({
        projectId,
        templateId,
        pageCount,
        pageSize: sizeMap[pageSize] ?? sizeMap["12x12"],
        selection,
        variations,
      });
      setAlbums(await window.albumforge.albums.list(projectId));
      if (created.length) setView("albums");
    } catch (e) {
      setGenError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }

  async function autoGroup() {
    setGroups(await window.albumforge.groups.auto(projectId));
    setActiveGroupId(null);
    await loadPhotos(true);
  }

  async function renameGroup(g: PhotoGroup) {
    setPrompt({
      title: "Rename group",
      initial: g.name,
      onConfirm: async (name) => {
        if (name) {
          await window.albumforge.groups.rename(g.id, name);
          await loadGroups();
        }
      },
    });
  }

  async function deleteGroup(g: PhotoGroup) {
    await window.albumforge.groups.remove(g.id);
    if (activeGroupId === g.id) setActiveGroupId(null);
    await loadGroups();
    await loadPhotos(true);
  }

  async function assignSelectedToGroup(groupId: string) {
    await window.albumforge.groups.assign(groupId, [...selected]);
    await loadGroups();
  }

  async function moveSelectedToNewGroup() {
    setPrompt({
      title: "New group name",
      initial: "",
      onConfirm: async (name) => {
        if (!name) return;
        const created = await window.albumforge.groups.create(projectId, name);
        if (created) await window.albumforge.groups.assign(created.id, [...selected]);
        await loadGroups();
      },
    });
  }

  async function clearGroups() {
    await window.albumforge.groups.clear(projectId);
    setActiveGroupId(null);
    await loadGroups();
    await loadPhotos(true);
  }

  return (
    <div>
      <header className="mb-3 flex items-center gap-3">
        <a href="#/projects" className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </a>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold">{project?.name ?? "Project"}</h1>
          <p className="text-xs text-slate-400">
            {total} photos{selected.size > 0 ? ` · ${selected.size} selected` : ""}
          </p>
        </div>
        <button onClick={handleImport} disabled={importing} className="btn-primary !px-3 !py-2 text-sm">
          {importing ? "Importing…" : "Import"}
        </button>
      </header>

      {importing && progress && (
        <div className="card mb-3 p-3 text-sm">
          <div className="mb-1.5 flex justify-between text-slate-600">
            <span className="truncate">{progress.filename}</span>
            <span className="shrink-0 text-slate-400">
              {progress.current}/{progress.total}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-1.5 rounded-full bg-gradient-to-r from-indigo-500 to-violet-600" style={{ width: `${(progress.current / progress.total) * 100}%` }} />
          </div>
        </div>
      )}

      {importNote && !importing && (
        <div className="mb-3 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{importNote}</div>
      )}

      {/* Segmented tabs */}
      <div className="mb-3 flex rounded-xl bg-slate-100 p-1">
        {(
          [
            ["photos", "Photos"],
            ["generate", "Generate"],
            ["groups", "Groups"],
            ["albums", `Albums${albums.length ? ` (${albums.length})` : ""}`],
          ] as [View, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${
              view === key ? "bg-white text-brand shadow-sm" : "text-slate-500"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "photos" && (
        <>
          {selected.size > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {selected.size === 1 && (
                <button onClick={() => setThumbnail([...selected][0])} className="btn-secondary !px-3 !py-1.5 text-xs">
                  ★ Set as thumbnail
                </button>
              )}
              <button onClick={deleteSelected} className="btn-secondary !px-3 !py-1.5 text-xs !text-red-600">
                Delete selected ({selected.size})
              </button>
              <button onClick={() => setSelected(new Set())} className="btn-secondary !px-3 !py-1.5 text-xs">
                Clear
              </button>
            </div>
          )}

          {activeGroupId && (
            <div className="mb-2 flex items-center gap-2 text-sm">
              <span className="text-slate-500">Filtering by group.</span>
              <button
                onClick={() => {
                  setActiveGroupId(null);
                  void loadPhotos(true);
                }}
                className="font-semibold text-brand"
              >
                Show all
              </button>
            </div>
          )}

          {total === 0 && !importing ? (
            <div className="card p-8 text-center">
              <p className="font-semibold text-ink">No photos yet</p>
              <p className="mt-1 text-sm text-slate-500">Import your finished photographs to begin.</p>
              <button onClick={handleImport} className="btn-primary mt-4">
                Import photos
              </button>
            </div>
          ) : (
            <PhotoGallery
              photos={photos}
              selected={selected}
              onToggle={togglePhoto}
              onDelete={deletePhoto}
              onSetThumbnail={setThumbnail}
              onLoadMore={() => loadPhotos(false)}
              hasMore={hasMore}
            />
          )}
        </>
      )}

      {view === "generate" && (
        <div className="card p-4">
          <h2 className="mb-3 font-semibold">Generate albums</h2>
          <div className="space-y-3 text-sm">
            <div>
              <label className="field-label">Template</label>
              <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="input">
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="field-label">Size</label>
                <select value={pageSize} onChange={(e) => setPageSize(e.target.value)} className="input">
                  <option value="12x12">12×12 in</option>
                  <option value="10x10">10×10 in</option>
                  <option value="A4">A4</option>
                </select>
              </div>
              <div>
                <label className="field-label">Pages</label>
                <input type="number" value={pageCount} min={1} onChange={(e) => setPageCount(Number(e.target.value))} className="input" />
              </div>
            </div>
            <div>
              <label className="field-label">Photo selection</label>
              <select value={selection} onChange={(e) => setSelection(e.target.value as "all" | "selected" | "ai")} className="input">
                <option value="all">All photos</option>
                <option value="selected">Selected photos</option>
                <option value="ai">AI-selected</option>
              </select>
            </div>
            <div>
              <label className="field-label">Variations</label>
              <select value={variations} onChange={(e) => setVariations(Number(e.target.value))} className="input">
                {[1, 2, 3, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <button onClick={handleGenerate} disabled={generating} className="btn-primary w-full">
              {generating ? "Generating…" : "Generate albums"}
            </button>
            {genError && <p className="text-sm text-red-600">{genError}</p>}
          </div>
        </div>
      )}

      {view === "groups" && (
        <div className="card p-4">
          <div className="mb-3 flex gap-2">
            <button onClick={autoGroup} className="btn-secondary flex-1">
              Auto-group by time
            </button>
            <button onClick={clearGroups} className="btn-secondary">
              Clear
            </button>
          </div>
          <ul className="space-y-1.5">
            <li>
              <button
                onClick={() => {
                  setActiveGroupId(null);
                  setView("photos");
                  void loadPhotos(true);
                }}
                className={`w-full rounded-lg px-3 py-2.5 text-left text-sm ${activeGroupId === null ? "bg-indigo-50 font-semibold text-brand" : "hover:bg-slate-50"}`}
              >
                All photos ({total})
              </button>
            </li>
            {groups.map((g) => (
              <li key={g.id} className="flex items-center gap-1 rounded-lg border border-slate-100">
                <button
                  onClick={() => {
                    setActiveGroupId(g.id);
                    setView("photos");
                    void loadPhotos(true);
                  }}
                  className="flex-1 px-3 py-2.5 text-left text-sm"
                >
                  {g.name} <span className="text-slate-400">({g.photoCount})</span>
                </button>
                <button onClick={() => renameGroup(g)} className="px-2 text-slate-400">
                  ✎
                </button>
                <button onClick={() => deleteGroup(g)} className="px-2 text-slate-400">
                  ✕
                </button>
              </li>
            ))}
            {groups.length === 0 && <li className="py-2 text-sm text-slate-400">No groups yet.</li>}
          </ul>
          {selected.size > 0 && (
            <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
              <p className="text-xs text-slate-500">{selected.size} photo(s) selected</p>
              <button onClick={moveSelectedToNewGroup} className="btn-secondary w-full">
                Move selected to new group
              </button>
            </div>
          )}
        </div>
      )}

      {view === "albums" && (
        <ul className="space-y-2">
          {albums.map((a) => (
            <li key={a.id}>
              <a href={`#/albums/${a.id}`} className="card flex items-center gap-3 p-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-100 to-violet-100 text-sm font-bold text-indigo-600">
                  {a.name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="truncate font-semibold text-ink">{a.name}</div>
                  <div className="text-xs text-slate-400">{a.pageCount} pages · variation {a.variationNumber}</div>
                </div>
              </a>
            </li>
          ))}
          {albums.length === 0 && <li className="py-6 text-center text-sm text-slate-400">No albums yet — generate one.</li>}
        </ul>
      )}

      {prompt && (
        <PromptModal
          title={prompt.title}
          defaultValue={prompt.initial}
          onConfirm={(v) => {
            prompt.onConfirm(v);
            setPrompt(null);
          }}
          onCancel={() => setPrompt(null)}
        />
      )}
    </div>
  );
}
