/** Assistive grouping: time segmentation + duplicate detection. */
import { hamming } from "./scoring";
import { PhotoRecord } from "./types";

export function segmentByTime(
  photos: PhotoRecord[],
  gapSeconds = 2700,
): PhotoRecord[][] {
  if (photos.length === 0) return [];
  const ordered = photos.slice().sort((a, b) => (a.takenAt ?? 0) - (b.takenAt ?? 0));
  const segments: PhotoRecord[][] = [];
  let current: PhotoRecord[] = [];
  for (const p of ordered) {
    if (
      current.length > 0 &&
      p.takenAt != null &&
      current[current.length - 1].takenAt != null &&
      (p.takenAt - (current[current.length - 1].takenAt as number) > gapSeconds)
    ) {
      segments.push(current);
      current = [];
    }
    current.push(p);
  }
  if (current.length > 0) segments.push(current);
  return segments;
}

export interface Beat {
  /** Index in the time-ordered array where a new beat (event segment) begins. */
  index: number;
  /** Gap in seconds to the previous photo. */
  gapSeconds: number;
}

/** Find event boundaries in a time-ordered photo list: consecutive shots with a
 *  capture gap larger than `gapSeconds` start a new beat (e.g. a Mehndi → Baraat
 *  transition in a multi-day wedding). */
export function timeBeats(ordered: PhotoRecord[], gapSeconds = 1800): Beat[] {
  const beats: Beat[] = [];
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1].takenAt;
    const cur = ordered[i].takenAt;
    if (prev != null && cur != null && cur - prev > gapSeconds) {
      beats.push({ index: i, gapSeconds: cur - prev });
    }
  }
  return beats;
}

export function findDuplicatePairs(
  photos: PhotoRecord[],
  threshold = 8,
  window = 64,
): Array<[string, string]> {
  const ordered = photos.slice().sort((a, b) => (a.phash < b.phash ? -1 : a.phash > b.phash ? 1 : 0));
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < ordered.length; i++) {
    for (let j = i + 1; j < Math.min(ordered.length, i + window); j++) {
      if (hamming(ordered[i].phash, ordered[j].phash) <= threshold) {
        pairs.push([ordered[i].id, ordered[j].id]);
      }
    }
  }
  return pairs;
}
