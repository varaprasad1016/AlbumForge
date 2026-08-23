import { useEffect, useState } from "react";
import type { Photo } from "@shared/api";

export default function PhotoPicker({
  projectId,
  mode,
  onSelect,
  onClose,
}: {
  projectId: string;
  mode: "add" | "replace";
  onSelect: (photoId: string) => void;
  onClose: () => void;
}) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);

  async function load(reset: boolean) {
    const off = reset ? 0 : offset;
    const res = await window.albumforge.photos.list(projectId, { offset: off, limit: 100 });
    setPhotos(reset ? res.items : (prev) => [...prev, ...res.items]);
    setTotal(res.total);
    setOffset(off + res.items.length);
  }

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-80 flex-col border-l border-slate-200 bg-white shadow-2xl">
      <header className="border-b border-slate-100 px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">{mode === "add" ? "Add photos" : "Replace photo"}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>
        <p className="mt-1 text-[11px] text-slate-400">
          Drag onto a frame or the page · click to {mode === "add" ? "place" : "replace"}
        </p>
      </header>
      <div className="flex-1 overflow-auto p-3">
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <button
              key={p.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(
                  "application/x-albumforge-photo",
                  JSON.stringify({ id: p.id, w: p.width, h: p.height }),
                );
                e.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => onSelect(p.id)}
              className="aspect-square overflow-hidden rounded border border-transparent hover:border-brand"
              title={p.filename}
            >
              <img
                src={`media://thumb256/${p.id}`}
                alt={p.filename}
                className="h-full w-full object-cover"
                draggable={false}
              />
            </button>
          ))}
        </div>
        {offset < total && (
          <button onClick={() => load(false)} className="mt-3 w-full rounded border border-neutral-300 py-2 text-sm">
            Load more
          </button>
        )}
      </div>
    </div>
  );
}
