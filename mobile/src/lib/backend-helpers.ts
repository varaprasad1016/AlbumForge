/** Shared helpers for the mobile backend. */
import { all, get, readDataFile } from "./db";
import { loadImage } from "./imaging";
import type { ImportProgress } from "./api";

const progressListeners = new Set<(p: ImportProgress) => void>();

export function emitProgress(p: ImportProgress): void {
  for (const cb of progressListeners) cb(p);
}

export function onProgress(cb: (p: ImportProgress) => void): () => void {
  progressListeners.add(cb);
  return () => progressListeners.delete(cb);
}

export async function assetUrl(kind: string, id: string): Promise<string> {
  const p = get("SELECT * FROM photos WHERE id = ?", [id]);
  if (!p) return "";
  if (kind === "thumb256" && p.thumbnail_path) return p.thumbnail_path;
  if (kind === "preview1024" && p.preview_path) return p.preview_path;
  if (kind === "original") {
    const data = await readDataFile(p.file_path);
    return data ? `data:image/jpeg;base64,${data}` : "";
  }
  return "";
}

export async function fontUrl(family: string): Promise<string> {
  const res = await fetch(`/fonts/${encodeURIComponent(family)}.ttf`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function resolveFont(family: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(`/fonts/${encodeURIComponent(family)}.ttf`);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export async function resolvePhoto(photoId: string): Promise<{ image: HTMLImageElement }> {
  const url = await assetUrl("original", photoId);
  return { image: await loadImage(url) };
}

export function groupsList(projectId: string) {
  return all(
    `SELECT g.*, (SELECT COUNT(*) FROM photos p WHERE p.group_id = g.id) AS photo_count
     FROM photo_groups g WHERE g.project_id = ? ORDER BY g.sort_order`,
    [projectId],
  ).map((r: any) => ({
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    color: r.color,
    sortOrder: r.sort_order,
    photoCount: r.photo_count,
  }));
}
