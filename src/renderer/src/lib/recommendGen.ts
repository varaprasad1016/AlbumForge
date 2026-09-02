/**
 * Renderer-driven design recommendation (MIGRATION.md Phase 4/6 pull-forward).
 *
 * Electron's `recommend:suggest` read a 64×64 downscale of each photo with
 * `sharp` (main process) and ran the pure k-means/rule engine. The engine
 * (`src/shared/recommend.ts`) is single-sourced and runs *here* in the
 * renderer; the only Node piece — preview decoding — is replaced by the
 * native `photos.palettes` command, which returns the same raw RGB pixels
 * (base64). Same inputs → same palette → same suggestion.
 *
 *   photos.palettes(ids) → decode RGB → kMeansPalette per photo
 *     → mergePalettes → suggestDesign(palette, eventType, fonts)
 */
import { kMeansPalette, mergePalettes, suggestDesign } from "@shared/recommend";
import type { DesignSuggestion } from "@shared/api";
import { native } from "./native";

function decodeRgb(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** `recommend:suggest` parity for the native shell. */
export async function suggestForPhotos(
  photoIds: string[],
  eventType: string,
): Promise<DesignSuggestion> {
  const samples = await native.photos.palettes(photoIds);
  const palettes = samples.map((s) => kMeansPalette(decodeRgb(s.rgb)));
  const fonts = await native.fonts.list();
  return suggestDesign(mergePalettes(palettes), eventType, fonts);
}
