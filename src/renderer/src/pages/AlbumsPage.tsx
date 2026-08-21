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
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {albums.map((a) => (
          <li key={a.id}>
            <a href={`#/albums/${a.id}`} className="block rounded-lg border border-neutral-200 bg-white p-4 hover:border-brand">
              <div className="font-semibold">{a.name}</div>
              <div className="text-sm text-neutral-400">
                {a.pageCount} pages · variation {a.variationNumber}
              </div>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
