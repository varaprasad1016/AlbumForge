/** On-device subject segmentation (@imgly/background-removal-node, U²-Net class
 *  model + onnxruntime). Runs locally in the main process — photos never leave
 *  the machine. Produces a grayscale-with-alpha matte (alpha = subject coverage)
 *  that the editor preview and the sharp export pipeline apply via `dest-in`.
 *
 * The heavy dependency is lazy-loaded on first use so app startup stays fast.
 */
import { app } from "electron";
import { existsSync, writeFileSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import sharp from "sharp";

type RemoveBackgroundFn = (src: string | Blob, config?: Record<string, unknown>) => Promise<Blob>;

let removeBackgroundImpl: RemoveBackgroundFn | null = null;
let loading: Promise<RemoveBackgroundFn> | null = null;

/** Point the segmenter at the bundled model resources. The package default is
 *  `cwd`-relative, which is wrong inside a packaged app — resolve it from the
 *  app root instead (works in dev and in the asar bundle). */
function imglyPublicPath(): string {
  const dist = join(
    app.getAppPath(),
    "node_modules",
    "@imgly",
    "background-removal-node",
    "dist",
  );
  return pathToFileURL(dist).toString() + "/";
}

async function loadSegmenter(): Promise<RemoveBackgroundFn> {
  if (removeBackgroundImpl) return removeBackgroundImpl;
  if (!loading) {
    loading = import("@imgly/background-removal-node").then((mod) => {
      removeBackgroundImpl = mod.removeBackground as RemoveBackgroundFn;
      return removeBackgroundImpl;
    });
  }
  return loading;
}

/** Is a matte already cached for this photo? */
export function hasMatte(cacheDir: string, id: string): boolean {
  return existsSync(mattePath(cacheDir, id));
}

export function mattePath(cacheDir: string, id: string): string {
  return join(cacheDir, `${id}-matte.png`);
}

/** Run subject segmentation and write a grayscale+alpha matte to the cache.
 *  Returns the matte path. Throws with a readable message when unavailable. */
export async function segmentPhoto(inputPath: string, cacheDir: string, id: string): Promise<string> {
  const removeBackground = await loadSegmenter();
  const blob = await removeBackground(inputPath, { publicPath: imglyPublicPath() });
  const cutout = Buffer.from(await blob.arrayBuffer());
  const meta = await sharp(cutout).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) throw new Error("Segmentation produced an empty result");

  // alpha channel of the cutout → matte whose alpha channel carries subject coverage.
  const alphaPng = await sharp(cutout).extractChannel("alpha").png().toBuffer();
  // Black RGB base + alpha channel → RGBA matte whose alpha carries subject coverage.
  const matte = await sharp({ create: { width, height, channels: 3, background: { r: 0, g: 0, b: 0 } } })
    .joinChannel(alphaPng)
    .png()
    .toBuffer();

  const out = mattePath(cacheDir, id);
  writeFileSync(out, matte);
  return out;
}
