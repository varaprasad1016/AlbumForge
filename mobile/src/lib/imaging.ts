/** Canvas-based image analysis + thumbnail generation (replaces sharp on mobile). */

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export interface ImageInfo {
  width: number;
  height: number;
  orientation: "landscape" | "portrait" | "square";
}

export async function imageInfo(src: string): Promise<ImageInfo> {
  const img = await loadImage(src);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const orientation = w > h ? "landscape" : h > w ? "portrait" : "square";
  return { width: w, height: h, orientation };
}

function drawTo(img: HTMLImageElement, w: number, h: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.85);
}

export async function thumbnails(
  img: HTMLImageElement,
): Promise<{ thumb256: string; preview1024: string }> {
  const sw = img.naturalWidth;
  const sh = img.naturalHeight;
  const scale = (max: number) => {
    const r = Math.min(max / sw, max / sh);
    return { w: Math.max(1, Math.round(sw * r)), h: Math.max(1, Math.round(sh * r)) };
  };
  const t = scale(256);
  const p = scale(1024);
  return { thumb256: drawTo(img, t.w, t.h), preview1024: drawTo(img, p.w, p.h) };
}

export async function phashOf(img: HTMLImageElement): Promise<bigint> {
  const canvas = document.createElement("canvas");
  canvas.width = 9;
  canvas.height = 8;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, 9, 8);
  const d = ctx.getImageData(0, 0, 9, 8).data;
  const gray: number[] = [];
  for (let i = 0; i < 9 * 8; i++) {
    gray.push(d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11);
  }
  let bits = "";
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      bits += gray[r * 9 + c] > gray[r * 9 + c + 1] ? "1" : "0";
    }
  }
  return BigInt(`0b${bits}`);
}

export async function qualityOf(img: HTMLImageElement): Promise<{ blurScore: number; qualityScore: number }> {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, 64, 64);
  const d = ctx.getImageData(0, 0, 64, 64).data;
  let sum = 0;
  let sum2 = 0;
  const n = 64 * 64;
  for (let i = 0; i < n; i++) {
    const v = d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11;
    sum += v;
    sum2 += v * v;
  }
  const mean = sum / n;
  const variance = sum2 / n - mean * mean;
  const std = Math.sqrt(Math.max(0, variance));
  const blur = 1 / (1 + std / 40);
  const brightness = mean / 255;
  const exposure = brightness > 0.8 ? 0.7 : brightness < 0.15 ? 0.6 : 1;
  const quality = 0.5 * (1 - blur) + 0.5 * exposure;
  return {
    blurScore: Math.round(blur * 10000) / 10000,
    qualityScore: Math.round(quality * 10000) / 10000,
  };
}
