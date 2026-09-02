/** Album generator: order → layout selection → composition.

Pure and deterministic: same inputs → same album. Variations differ via seed-driven
layout stream, lead/hero selection, and bounded reordering for non-chronological
families — while remaining professionally coherent.
*/
import { timeBeats } from "./grouping";
import { composePage } from "./layoutEngine";
import { isSpreadLayout, LAYOUT_CATALOG } from "./layouts";
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

  // Event beats: positions where a new day/ceremony begins (large capture gap).
  // When a page lands exactly on a beat, open it with a dramatic spread.
  const beats = timeBeats(ordered, spec.beatGapSeconds ?? 1800);
  const beatStarts = new Set(beats.map((b) => b.index));

  const pages: AlbumResult["pages"] = [];
  const history: string[] = [];
  let remaining = ordered;
  let consumed = 0;

  // Cover page: lead photo full-bleed with the album title (keep one photo
  // in reserve for the back cover).
  if (remaining.length >= 2 && spec.coverTitle) {
    const coverPhoto = remaining[0];
    remaining = remaining.slice(1);
    const elements = composePage(LAYOUT_CATALOG["cover_front"], [coverPhoto], spec.pageAspect);
    elements.push({
      type: "text",
      photoId: null,
      x: 0.06,
      y: 0.8,
      width: 0.88,
      height: 0.1,
      rotation: 0,
      crop: null,
      z: elements.length,
      text: { content: spec.coverTitle },
      style: { color: "#ffffff", fontSize: 72, fontFamily: "Playfair Display" },
    });
    pages.push({ layoutKey: "cover_front", spread: false, elements });
  }

  while (remaining.length > 1 && pages.length < spec.pageCount) {
    // A beat at the very start of the album is the opening page — handled by the
    // cover; only real mid-album beats (consumed > 0) open with a spread.
    const atBeat = consumed > 0 && beatStarts.has(consumed);
    const layout = chooseLayout(family, remaining.length - 1, history, rng, atBeat ? { preferSpread: true } : undefined);
    const take = Math.min(layout.slots.length, remaining.length - 1);
    const pagePhotos = remaining.slice(0, take);
    remaining = remaining.slice(take);
    consumed += take;
    const spread = isSpreadLayout(layout.key);
    const elements = composePage(layout, pagePhotos, spec.pageAspect * (spread ? 2 : 1));
    pages.push({ layoutKey: layout.key, spread, elements });
    history.push(layout.key);
  }

  // Back cover: last remaining photo, full bleed.
  if (remaining.length > 0 && pages.length < spec.pageCount) {
    const backPhoto = remaining[remaining.length - 1];
    const elements = composePage(LAYOUT_CATALOG["cover_back"], [backPhoto], spec.pageAspect);
    pages.push({ layoutKey: "cover_back", spread: false, elements });
  }

  const photoCount = pages.reduce(
    (s, p) => s + p.elements.filter((e) => e.type === "image").length,
    0,
  );
  return {
    variation,
    pageCount: pages.length,
    photoCount,
    pages,
    score: albumScore(pages, photos),
  };
}
