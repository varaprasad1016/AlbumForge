import { useCallback, useEffect, useState } from "react";
import PhotoGallery from "../components/PhotoGallery";
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
    const name = window.prompt("Group name", g.name);
    if (name) {
      await window.albumforge.groups.rename(g.id, name);
      await loadGroups();
    }
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
    const name = window.prompt("New group name", "New group");
    if (!name) return;
    const created = await window.albumforge.groups.create(projectId, name);
    if (created) await window.albumforge.groups.assign(created.id, [...selected]);
    await loadGroups();
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
          <p className="text-sm text-neutral-400">
            {photos.length} shown · {total} total · {selected.size} selected
          </p>
        </div>
        <button
          onClick={handleImport}
          disabled={importing}
          className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {importing ? "Importing…" : "Import photos"}
        </button>
      </div>

      {total === 0 && !importing && (
        <div className="mb-6 rounded-lg border border-brand/20 bg-white p-8 text-center">
          <h2 className="text-lg font-semibold text-ink">No photos yet</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-neutral-500">
            Import your finished photographs to begin. AlbumForge analyses them locally and
            uses them to generate complete album layouts.
          </p>
          <button onClick={handleImport} className="mt-4 rounded bg-brand px-4 py-2 text-sm font-semibold text-white">
            Import photos
          </button>
        </div>
      )}

      {importing && progress && (
        <div className="mb-4 rounded border border-neutral-200 bg-white p-3 text-sm">
          <div className="mb-1 flex justify-between text-neutral-600">
            <span>{progress.filename}</span>
            <span>
              {progress.current} / {progress.total}
            </span>
          </div>
          <div className="h-1.5 w-full rounded bg-neutral-200">
            <div className="h-1.5 rounded bg-brand" style={{ width: `${(progress.current / progress.total) * 100}%` }} />
          </div>
        </div>
      )}

      {activeGroupId && (
        <div className="mb-2 flex items-center gap-2 text-sm">
          <span className="text-neutral-500">Filtering by group.</span>
          <button onClick={() => { setActiveGroupId(null); void loadPhotos(true); }} className="text-brand">
            Show all
          </button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <PhotoGallery
          photos={photos}
          selected={selected}
          onToggle={togglePhoto}
          onLoadMore={() => loadPhotos(false)}
          hasMore={hasMore}
        />

        <aside className="space-y-6">
          <section className="rounded-lg border border-neutral-200 bg-white p-4">
            <h2 className="mb-3 font-semibold">Generate albums</h2>
            <div className="space-y-3 text-sm">
              <div>
                <label className="mb-1 block text-neutral-600">Template</label>
                <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="w-full rounded border border-neutral-300 px-2 py-1.5">
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-neutral-600">Size</label>
                  <select value={pageSize} onChange={(e) => setPageSize(e.target.value)} className="w-full rounded border border-neutral-300 px-2 py-1.5">
                    <option value="12x12">12×12 in</option>
                    <option value="10x10">10×10 in</option>
                    <option value="A4">A4</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-neutral-600">Pages</label>
                  <input
                    type="number"
                    value={pageCount}
                    min={1}
                    onChange={(e) => setPageCount(Number(e.target.value))}
                    className="w-full rounded border border-neutral-300 px-2 py-1.5"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-neutral-600">Photo selection</label>
                <select value={selection} onChange={(e) => setSelection(e.target.value as "all" | "selected" | "ai")} className="w-full rounded border border-neutral-300 px-2 py-1.5">
                  <option value="all">All photos</option>
                  <option value="selected">Selected photos</option>
                  <option value="ai">AI-selected</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-neutral-600">Variations</label>
                <select value={variations} onChange={(e) => setVariations(Number(e.target.value))} className="w-full rounded border border-neutral-300 px-2 py-1.5">
                  {[1, 2, 3, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <button onClick={handleGenerate} disabled={generating} className="w-full rounded bg-brand py-2 font-semibold text-white disabled:opacity-50">
                {generating ? "Generating…" : "Generate albums"}
              </button>
            </div>
          </section>

          <section className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold">Groups</h2>
              <div className="flex gap-1">
                <button onClick={autoGroup} className="rounded border border-neutral-300 px-2 py-1 text-xs">
                  Auto-group
                </button>
                <button onClick={clearGroups} className="rounded border border-neutral-300 px-2 py-1 text-xs">
                  Clear
                </button>
              </div>
            </div>
            <ul className="space-y-1 text-sm">
              <li>
                <button
                  onClick={() => { setActiveGroupId(null); void loadPhotos(true); }}
                  className={`w-full rounded px-2 py-1 text-left ${activeGroupId === null ? "bg-brand/10 font-semibold" : "hover:bg-neutral-100"}`}
                >
                  All photos ({total})
                </button>
              </li>
              {groups.map((g) => (
                <li key={g.id} className="flex items-center">
                  <button
                    onClick={() => { setActiveGroupId(g.id); void loadPhotos(true); }}
                    className={`flex-1 rounded px-2 py-1 text-left ${activeGroupId === g.id ? "bg-brand/10 font-semibold" : "hover:bg-neutral-100"}`}
                  >
                    {g.name} ({g.photoCount})
                  </button>
                  <button onClick={() => renameGroup(g)} className="px-1 text-neutral-400 hover:text-neutral-700" title="Rename">
                    ✎
                  </button>
                  <button onClick={() => deleteGroup(g)} className="px-1 text-neutral-400 hover:text-red-600" title="Delete">
                    ✕
                  </button>
                </li>
              ))}
              {groups.length === 0 && <li className="text-neutral-400">No groups.</li>}
            </ul>
            {selected.size > 0 && (
              <div className="mt-3 space-y-1 border-t border-neutral-100 pt-2">
                <p className="text-xs text-neutral-500">{selected.size} photo(s) selected</p>
                <button onClick={() => activeGroupId && assignSelectedToGroup(activeGroupId)} disabled={!activeGroupId} className="w-full rounded border border-neutral-300 px-2 py-1 text-xs disabled:opacity-40">
                  Assign to this group
                </button>
                <button onClick={moveSelectedToNewGroup} className="w-full rounded border border-neutral-300 px-2 py-1 text-xs">
                  Move to new group
                </button>
              </div>
            )}
          </section>

          <section className="rounded-lg border border-neutral-200 bg-white p-4">
            <h2 className="mb-2 font-semibold">Albums</h2>
            <ul className="space-y-2">
              {albums.map((a) => (
                <li key={a.id}>
                  <a href={`#/albums/${a.id}`} className="block rounded border border-neutral-200 px-3 py-2 text-sm hover:border-brand">
                    {a.name} · {a.pageCount} pages
                  </a>
                </li>
              ))}
              {albums.length === 0 && <p className="text-sm text-neutral-400">No albums yet.</p>}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
