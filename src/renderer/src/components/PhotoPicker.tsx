import { useEffect, useState } from "react";
import type { Photo } from "@shared/api";

export default function PhotoPicker({
  projectId,
  onSelect,
  onClose,
}: {
  projectId: string;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="max-h-[80vh] w-[760px] overflow-auto rounded-lg bg-white p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Choose a photo</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>
        <div className="grid grid-cols-6 gap-2">
          {photos.map((p) => (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className="aspect-square overflow-hidden rounded border border-transparent hover:border-brand"
            >
              <img src={`media://thumb256/${p.id}`} alt={p.filename} className="h-full w-full object-cover" draggable={false} />
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
