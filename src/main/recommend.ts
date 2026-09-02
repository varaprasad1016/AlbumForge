/** AI design recommendation — Electron main-process entry.
 *
 *  The pure colour/k-means/rule engine now lives in `src/shared/recommend.ts`
 *  (single-sourced: the native Tauri renderer runs the exact same code, fed by
 *  a native pixel-sampling command instead of `sharp`). This file keeps only
 *  the Node-only pieces: the `sharp` preview sampler and the file-based
 *  orchestration, plus re-exports so existing importers/tests stay put.
 */
import sharp from "sharp";
import { listFonts } from "./fonts";
import { kMeansPalette, mergePalettes, suggestDesign, type PaletteColor } from "../shared/recommend";

export * from "../shared/recommend";

/** Extract a palette from an image file (reads a small downscale — cheap). */
export async function extractPalette(filePath: string): Promise<PaletteColor[]> {
  const { data } = await sharp(filePath)
    .resize(64, 64, { fit: "inside", withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return kMeansPalette(data);
}

/** Suggest a design for a set of photo files (reads palettes from each, merges). */
export async function suggestForPhotos(
  filePaths: string[],
  eventType: string,
  availableFonts?: string[],
): Promise<ReturnType<typeof suggestDesign>> {
  const fonts = availableFonts ?? listFonts().map((f) => f.family);
  const palettes: PaletteColor[][] = [];
  for (const p of filePaths.slice(0, 6)) {
    try {
      palettes.push(await extractPalette(p));
    } catch {
      /* skip unreadable previews */
    }
  }
  return suggestDesign(mergePalettes(palettes), eventType, fonts);
}
