import { useEffect, useState } from "react";
import type { Album } from "@shared/api";

export default function AlbumsPage() {
  const [albums, setAlbums] = useState<Album[]>([]);

  useEffect(() => {
    window.albumforge.albums.list().then(setAlbums);
  }, []);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Albums</h1>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {albums.map((a) => (
          <li key={a.id}>
            <a
              href={`#/albums/${a.id}`}
              className="card group block p-5 transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-100 to-violet-100 text-sm font-bold text-indigo-600">
                  {a.name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="truncate font-semibold text-ink group-hover:text-brand">{a.name}</div>
                  <div className="text-sm text-slate-400">
                    {a.pageCount} pages · variation {a.variationNumber}
                  </div>
                </div>
              </div>
            </a>
          </li>
        ))}
        {albums.length === 0 && <p className="col-span-full text-slate-400">No albums yet.</p>}
      </ul>
    </div>
  );
}
