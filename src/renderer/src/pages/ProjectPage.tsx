import { useCallback, useEffect, useState } from "react";
import PhotoGallery from "../components/PhotoGallery";
import PromptModal from "../components/PromptModal";
import type { Album, ImportProgress, Photo, PhotoGroup, Project, TemplateSummary } from "@shared/api";

const PAGE_LIMIT = 200;

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

  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [generating, setGenerating] = useState(false);
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
    for (const id of selected) {
      await window.albumforge.photos.remove(id);
    }
    setSelected(new Set());
    await loadPhotos(true);
  }

  async function handleImport() {
    const paths = await window.albumforge.dialogs.chooseImages();
    if (!paths || paths.length === 0) return;
    setImporting(true);
    try {
      await window.albumforge.photos.importPhotos(projectId, paths);
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
    try {
      await window.albumforge.albums.generate({
        projectId,
        templateId,
        pageCount,
        pageSize: sizeMap[pageSize] ?? sizeMap["12x12"],
        selection,
        variations,
      });
      setAlbums(await window.albumforge.albums.list(projectId));
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
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{project?.name ?? "Project"}</h1>
          <p className="text-sm text-slate-400">
            {photos.length} shown · {total} total · {selected.size} selected
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button onClick={deleteSelected} className="btn-secondary !text-red-600 hover:!bg-red-50">
              Delete selected ({selected.size})
            </button>
          )}
          <button onClick={handleImport} disabled={importing} className="btn-primary">
            {importing ? "Importing…" : "Import photos"}
          </button>
        </div>
      </div>

      {total === 0 && !importing && (
        <div className="card mb-6 overflow-hidden">
          <div className="bg-gradient-to-br from-indigo-500 to-violet-600 p-8 text-center text-white">
            <h2 className="text-lg font-semibold">No photos yet</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-indigo-100">
              Import your finished photographs to begin. AlbumForge analyses them locally
              and uses them to generate complete album layouts.
            </p>
            <button
              onClick={handleImport}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition-colors hover:bg-white/30"
            >
              Import photos
            </button>
          </div>
        </div>
      )}

      {importing && progress && (
        <div className="card mb-4 p-3 text-sm">
          <div className="mb-1.5 flex justify-between text-slate-600">
            <span className="truncate">{progress.filename}</span>
            <span className="shrink-0 text-slate-400">
              {progress.current} / {progress.total}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-1.5 rounded-full bg-gradient-to-r from-indigo-500 to-violet-600 transition-all"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
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
            className="font-semibold text-brand hover:underline"
          >
            Show all
          </button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <PhotoGallery
          photos={photos}
          selected={selected}
          onToggle={togglePhoto}
          onDelete={deletePhoto}
          onLoadMore={() => loadPhotos(false)}
          hasMore={hasMore}
        />

        <aside className="space-y-6">
          <section className="card p-4">
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
                  <input
                    type="number"
                    value={pageCount}
                    min={1}
                    onChange={(e) => setPageCount(Number(e.target.value))}
                    className="input"
                  />
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
            </div>
          </section>

          <section className="card p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold">Groups</h2>
              <div className="flex gap-1">
                <button onClick={autoGroup} className="btn-secondary !px-2.5 !py-1 text-xs">
                  Auto-group
                </button>
                <button onClick={clearGroups} className="btn-secondary !px-2.5 !py-1 text-xs">
                  Clear
                </button>
              </div>
            </div>
            <ul className="space-y-1 text-sm">
              <li>
                <button
                  onClick={() => {
                    setActiveGroupId(null);
                    void loadPhotos(true);
                  }}
                  className={`w-full rounded-lg px-2.5 py-1.5 text-left transition-colors ${
                    activeGroupId === null ? "bg-indigo-50 font-semibold text-brand" : "hover:bg-slate-50"
                  }`}
                >
                  All photos ({total})
                </button>
              </li>
              {groups.map((g) => (
                <li key={g.id} className="flex items-center">
                  <button
                    onClick={() => {
                      setActiveGroupId(g.id);
                      void loadPhotos(true);
                    }}
                    className={`flex-1 rounded-lg px-2.5 py-1.5 text-left transition-colors ${
                      activeGroupId === g.id ? "bg-indigo-50 font-semibold text-brand" : "hover:bg-slate-50"
                    }`}
                  >
                    {g.name} ({g.photoCount})
                  </button>
                  <button onClick={() => renameGroup(g)} className="px-1.5 text-slate-400 hover:text-slate-700" title="Rename">
                    ✎
                  </button>
                  <button onClick={() => deleteGroup(g)} className="px-1.5 text-slate-400 hover:text-red-600" title="Delete">
                    ✕
                  </button>
                </li>
              ))}
              {groups.length === 0 && <li className="px-2.5 py-1 text-slate-400">No groups.</li>}
            </ul>
            {selected.size > 0 && (
              <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
                <p className="text-xs text-slate-500">{selected.size} photo(s) selected</p>
                <button
                  onClick={() => activeGroupId && assignSelectedToGroup(activeGroupId)}
                  disabled={!activeGroupId}
                  className="btn-secondary w-full !px-2.5 !py-1.5 text-xs"
                >
                  Assign to this group
                </button>
                <button onClick={moveSelectedToNewGroup} className="btn-secondary w-full !px-2.5 !py-1.5 text-xs">
                  Move to new group
                </button>
              </div>
            )}
          </section>

          <section className="card p-4">
            <h2 className="mb-2 font-semibold">Albums</h2>
            <ul className="space-y-2">
              {albums.map((a) => (
                <li key={a.id}>
                  <a
                    href={`#/albums/${a.id}`}
                    className="block rounded-lg border border-slate-200 px-3 py-2 text-sm transition-colors hover:border-brand hover:bg-indigo-50/50"
                  >
                    {a.name} · {a.pageCount} pages
                  </a>
                </li>
              ))}
              {albums.length === 0 && <p className="text-sm text-slate-400">No albums yet.</p>}
            </ul>
          </section>
        </aside>
      </div>

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
