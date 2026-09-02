/** Scoring primitives: hamming distance, quality, near-duplicate detection, album score. */
import { PageDef, PhotoRecord } from "./types";

export const DUPLICATE_THRESHOLD = 8;

export function hamming(a: bigint, b: bigint): number {
  let n = a ^ b;
  let count = 0;
  while (n > 0n) {
    n &= n - 1n;
    count++;
  }
  return count;
}

export function isNearDuplicate(a: bigint, b: bigint): boolean {
  return hamming(a, b) <= DUPLICATE_THRESHOLD;
}

export function baseQuality(p: PhotoRecord): number {
  const sharpness = 1 - p.blurScore;
  const faceBonus = Math.min(p.faceBoxes.length * 0.05, 0.15);
  return Math.round((0.6 * sharpness + 0.4 * p.qualityScore + faceBonus) * 10000) / 10000;
}

export function albumScore(pages: PageDef[], photos: PhotoRecord[]): number {
  if (pages.length === 0) return Infinity;

  let totalCropLoss = 0;
  let elements = 0;
  for (const page of pages) {
    for (const el of page.elements) {
      if (el.type !== "image" || !el.crop) continue;
      const area = el.crop.width * el.crop.height;
      totalCropLoss += 1 - area;
      elements++;
    }
  }
  const cropTerm = totalCropLoss / Math.max(1, elements);

  const phashById = new Map(photos.map((p) => [p.id, p.phash]));
  let dupPenalty = 0;
  const lastPos = new Map<string, number>();
  let idx = 0;
  for (const page of pages) {
    for (const el of page.elements) {
      if (el.type !== "image" || !el.photoId) continue;
      const ph = phashById.get(el.photoId);
      if (ph === undefined) continue;
      const key = ph.toString();
      if (lastPos.has(key) && idx - (lastPos.get(key) as number) <= 3) dupPenalty += 0.1;
      lastPos.set(key, idx);
      idx++;
    }
  }

  const coverage = elements / Math.max(1, photos.length);
  const coverageTerm = 1 - coverage;

  return Math.round((cropTerm * 0.5 + dupPenalty * 0.3 + coverageTerm * 0.2) * 10000) / 10000;
}
