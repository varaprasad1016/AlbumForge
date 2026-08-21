/** Smart cropping — non-destructive metadata-only crops.

Computes a normalized crop rect that matches a target aspect ratio while keeping the
salient region (faces if present, else image centre) inside the crop.
*/
import { CropRect, FaceBox } from "./types";

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

export function computeCrop(
  sourceWidth: number,
  sourceHeight: number,
  targetAspect: number,
  faceBoxes?: FaceBox[],
): CropRect {
  const sourceAspect = sourceWidth / sourceHeight;

  if (Math.abs(sourceAspect - targetAspect) < 1e-3) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }

  let cropW: number;
  let cropH: number;
  if (targetAspect > sourceAspect) {
    cropW = 1;
    cropH = sourceAspect / targetAspect;
  } else {
    cropH = 1;
    cropW = targetAspect / sourceAspect;
  }

  let cx = 0.5;
  let cy = 0.5;
  if (faceBoxes && faceBoxes.length > 0) {
    cx = faceBoxes.reduce((s, f) => s + f.x + f.width / 2, 0) / faceBoxes.length;
    cy = faceBoxes.reduce((s, f) => s + f.y + f.height / 2, 0) / faceBoxes.length;
  }

  let x = clamp(cx - cropW / 2, 0, 1 - cropW);
  let y = clamp(cy - cropH / 2, 0, 1 - cropH);

  if (faceBoxes && faceBoxes.length > 0) {
    [x, y] = fitFaces(x, y, cropW, cropH, faceBoxes);
  }

  return { x: round4(x), y: round4(y), width: round4(cropW), height: round4(cropH) };
}

function fitFaces(
  x: number,
  y: number,
  w: number,
  h: number,
  faces: FaceBox[],
): [number, number] {
  const left = Math.min(...faces.map((f) => f.x));
  const top = Math.min(...faces.map((f) => f.y));
  const right = Math.max(...faces.map((f) => f.x + f.width));
  const bottom = Math.max(...faces.map((f) => f.y + f.height));

  if (right - left > w) {
    x = clamp((left + right) / 2 - w / 2, 0, 1 - w);
  } else {
    x = clamp(x, clamp(right - w, 0, 1 - w), clamp(left, 0, 1 - w));
  }

  if (bottom - top > h) {
    y = clamp((top + bottom) / 2 - h / 2, 0, 1 - h);
  } else {
    y = clamp(y, clamp(bottom - h, 0, 1 - h), clamp(top, 0, 1 - h));
  }

  return [x, y];
}
