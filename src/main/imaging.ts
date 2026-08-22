/** Image analysis + thumbnail generation (sharp). All local, no network. */
import { join } from "path";
import sharp from "sharp";
import exifr from "exifr";

export interface ImageInfo {
  width: number;
  height: number;
  orientation: "landscape" | "portrait" | "square";
}

export interface AnalysisResult {
  blurScore: number;
  qualityScore: number;
  phash: bigint;
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

export async function imageInfo(filePath: string): Promise<ImageInfo> {
  const meta = await sharp(filePath).metadata();
  let w = meta.width ?? 0;
  let h = meta.height ?? 0;
  const o = meta.orientation;
  if (o && o >= 5 && o <= 8) [w, h] = [h, w];
  const orientation = w > h ? "landscape" : h > w ? "portrait" : "square";
  return { width: w, height: h, orientation };
}

/** Read the capture timestamp from EXIF (DateTimeOriginal, falling back to
 * CreateDate/ModifyDate). Returns null if no EXIF timestamp is present. */
export async function extractTimestamp(filePath: string): Promise<string | null> {
  try {
    const data = await exifr.parse(filePath, {
      pick: ["DateTimeOriginal", "CreateDate", "ModifyDate"],
    });
    const raw = data?.DateTimeOriginal ?? data?.CreateDate ?? data?.ModifyDate;
    if (!raw) return null;
    if (raw instanceof Date) return raw.toISOString();
    const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(raw));
    if (m) {
      return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])).toISOString();
    }
    const d = new Date(String(raw));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  } catch {
    return null;
  }
}

export async function phashOf(filePath: string): Promise<bigint> {
  const { data } = await sharp(filePath)
    .rotate()
    .greyscale()
    .resize(9, 8, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let bits = "";
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const left = data[row * 9 + col];
      const right = data[row * 9 + col + 1];
      bits += left > right ? "1" : "0";
    }
  }
  return BigInt(`0b${bits}`);
}

const LAPLACIAN = [0, 1, 0, 1, -4, 1, 0, 1, 0];

export async function analyzeImage(filePath: string): Promise<AnalysisResult> {
  const base = sharp(filePath).rotate();

  const grayStats = await base.clone().greyscale().stats();
  const mean = grayStats.channels[0].mean;

  let exposure: number;
  if (mean < 60) exposure = 0.3 + 0.7 * (mean / 60);
  else if (mean > 200) exposure = 0.3 + 0.7 * ((255 - mean) / 55);
  else exposure = 1.0;

  const lapStats = await base
    .clone()
    .greyscale()
    .convolve({ width: 3, height: 3, kernel: LAPLACIAN, scale: 1, offset: 0 })
    .stats();
  const variance = Math.pow(lapStats.channels[0].stdev, 2);
  const blur = 1 / (1 + variance / 150);
  const quality = 0.5 * (1 - blur) + 0.5 * exposure;

  const phash = await phashOf(filePath);
  return { blurScore: round4(blur), qualityScore: round4(quality), phash };
}

export interface GpsLocation {
  latitude: number;
  longitude: number;
}

/** Read GPS coordinates from EXIF (decimal degrees). Returns null when absent. */
export async function extractGps(filePath: string): Promise<GpsLocation | null> {
  try {
    const data = await exifr.parse(filePath, { gps: true });
    const lat = data?.latitude;
    const lng = data?.longitude;
    if (typeof lat === "number" && typeof lng === "number" && (lat !== 0 || lng !== 0)) {
      return { latitude: lat, longitude: lng };
    }
    return null;
  } catch {
    return null;
  }
}

export interface ThumbnailResult {
  thumb256: string;
  preview1024: string;
}

export async function generateThumbnails(
  filePath: string,
  outDir: string,
  id: string,
): Promise<ThumbnailResult> {
  const thumb256 = join(outDir, `${id}-thumb256.jpg`);
  const preview1024 = join(outDir, `${id}-preview1024.jpg`);

  await sharp(filePath)
    .rotate()
    .resize(256, 256, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toFile(thumb256);

  await sharp(filePath)
    .rotate()
    .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toFile(preview1024);

  return { thumb256, preview1024 };
}
