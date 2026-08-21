/** Photo selection: all / selected / AI-ranked (diversity-aware, no LLM). */
import { seededRandom } from "./rng";
import { hamming } from "./scoring";
import { PhotoRecord } from "./types";

function selectionScore(photo: PhotoRecord, chosen: PhotoRecord[]): number {
  const quality = photo.qualityScore;
  const minDist = Math.min(...chosen.map((c) => hamming(photo.phash, c.phash)));
  const diversity = minDist / 64;
  return quality + 0.5 * diversity;
}

export function selectDiverse(
  photos: PhotoRecord[],
  targetCount: number,
  seed = 0,
): PhotoRecord[] {
  if (targetCount <= 0 || photos.length === 0) return [];
  if (targetCount >= photos.length) return photos.slice();

  const remaining = photos.slice();
  const chosen: PhotoRecord[] = [];
  let best = remaining[0];
  for (const p of remaining) if (p.qualityScore > best.qualityScore) best = p;
  chosen.push(best);
  remaining.splice(remaining.indexOf(best), 1);

  while (chosen.length < targetCount && remaining.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const s = selectionScore(remaining[i], chosen);
      if (s > bestScore) {
        bestScore = s;
        bestIdx = i;
      }
    }
    chosen.push(remaining[bestIdx]);
    remaining.splice(bestIdx, 1);
  }
  return chosen;
}

export function selectForMode(
  photos: PhotoRecord[],
  mode: "all" | "selected" | "ai",
  targetCount?: number | null,
  seed = 0,
): PhotoRecord[] {
  if (mode === "ai") {
    const n = targetCount ?? photos.length;
    return selectDiverse(photos, Math.min(n, photos.length), seed);
  }
  const result = photos.slice();
  if (targetCount != null && (mode === "all" || mode === "selected")) {
    return result.slice(0, targetCount);
  }
  return result;
}

export { seededRandom };
