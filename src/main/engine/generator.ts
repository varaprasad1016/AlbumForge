/** Album generator: order → layout selection → composition.

Pure and deterministic: same inputs → same album. Variations differ via seed-driven
layout stream, lead/hero selection, and bounded reordering for non-chronological
families — while remaining professionally coherent.
*/
import { composePage } from "./layoutEngine";
import { Rng, seededRandom, shuffle } from "./rng";
import { albumScore } from "./scoring";
import { chooseLayout } from "./templateEngine";
import { AlbumResult, AlbumSpec, PhotoRecord, TemplateFamily } from "./types";

const LEAD_POOL = 12;

function rotateLead(photos: PhotoRecord[], variation: number): PhotoRecord[] {
  if (photos.length < 2) return photos;
  const pool = photos
    .slice()
    .sort((a, b) => b.qualityScore - a.qualityScore)
    .slice(0, LEAD_POOL);
  const lead = pool[(variation - 1) % pool.length];
  const rest = photos.filter((p) => p.id !== lead.id);
  return [lead, ...rest];
}

function orderPhotos(
  photos: PhotoRecord[],
  family: TemplateFamily,
  variation: number,
  rng: Rng,
): PhotoRecord[] {
  const ordered = photos.slice();

  if (family.chronological) {
    ordered.sort((a, b) => (a.takenAt ?? 0) - (b.takenAt ?? 0));
    return rotateLead(ordered, variation);
  }

  ordered.sort((a, b) => {
    if ((a.groupId ?? "") !== (b.groupId ?? "")) return (a.groupId ?? "").localeCompare(b.groupId ?? "");
    return (a.takenAt ?? 0) - (b.takenAt ?? 0);
  });

  const groups = new Map<string, PhotoRecord[]>();
  const order: string[] = [];
  for (const p of ordered) {
    const key = p.groupId ?? "";
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(p);
  }

  const result: PhotoRecord[] = [];
  for (const key of order) {
    result.push(...shuffle(groups.get(key)!, rng));
  }
  return rotateLead(result, variation);
}

export function generateAlbum(
  photos: PhotoRecord[],
  family: TemplateFamily,
  spec: AlbumSpec,
  variation = 1,
  seed = "albumforge",
): AlbumResult {
  if (photos.length === 0) {
    throw new Error("Cannot generate an album from an empty photo set");
  }

  const rng = seededRandom(`${seed}:${family.key}:${variation}`);
  const ordered = orderPhotos(photos, family, variation, rng);

  const pages: AlbumResult["pages"] = [];
  const history: string[] = [];
  let remaining = ordered;

  while (remaining.length > 0 && pages.length < spec.pageCount) {
    const layout = chooseLayout(family, remaining.length, history, rng);
    const take = Math.min(layout.slots.length, remaining.length);
    const pagePhotos = remaining.slice(0, take);
    remaining = remaining.slice(take);
    const elements = composePage(layout, pagePhotos, spec.pageAspect);
    pages.push({ layoutKey: layout.key, elements });
    history.push(layout.key);
  }

  const photoCount = pages.reduce((s, p) => s + p.elements.length, 0);
  return {
    variation,
    pageCount: pages.length,
    photoCount,
    pages,
    score: albumScore(pages, photos),
  };
}
