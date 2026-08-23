/** Pure layout math for the editor — crop cover/pan/zoom and layer stacking.

Kept free of DOM/Konva so it can be unit-tested directly. All crop rects are
normalized 0..1 to the source image; all coordinates 0..1 to the page.
*/

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** object-fit: cover crop for a source image into a target box (normalized to the source). */
export function coverCrop(srcW: number, srcH: number, nodeW: number, nodeH: number): CropRect {
  const srcAspect = srcW / srcH;
  const nodeAspect = nodeW / nodeH;
  if (srcAspect > nodeAspect) {
    const w = nodeAspect / srcAspect;
    return { x: (1 - w) / 2, y: 0, width: w, height: 1 };
  }
  const h = srcAspect / nodeAspect;
  return { x: 0, y: (1 - h) / 2, width: 1, height: h };
}

/** Clamp a normalized crop rect inside the source image. */
export function clampCrop(c: CropRect): CropRect {
  const width = Math.min(Math.max(c.width, 1e-4), 1);
  const height = Math.min(Math.max(c.height, 1e-4), 1);
  return {
    x: Math.min(Math.max(c.x, 0), 1 - width),
    y: Math.min(Math.max(c.y, 0), 1 - height),
    width,
    height,
  };
}

/** Pan a crop window by a cursor delta (canvas px), keeping the frame fixed.
 *  The crop moves by (delta × crop.width / nodeW) so content tracks the cursor 1:1. */
export function panCropRect(crop: CropRect, dxPx: number, dyPx: number, nodeW: number, nodeH: number): CropRect {
  if (dxPx === 0 && dyPx === 0) return crop;
  return clampCrop({
    x: crop.x + (dxPx * crop.width) / nodeW,
    y: crop.y + (dyPx * crop.height) / nodeH,
    width: crop.width,
    height: crop.height,
  });
}

/** Zoom a crop window around its centre. zoom = 1 → the full cover crop;
 *  larger values shrink the window (zoom in) but never beyond cover. */
export function zoomCropRect(crop: CropRect, cover: CropRect, zoom: number): CropRect {
  const nw = Math.min(Math.max(cover.width / zoom, 1e-4), cover.width);
  const nh = Math.min(Math.max(cover.height / zoom, 1e-4), cover.height);
  const cx = crop.x + crop.width / 2;
  const cy = crop.y + crop.height / 2;
  return clampCrop({ x: cx - nw / 2, y: cy - nh / 2, width: nw, height: nh });
}

export type LayerOp = "front" | "back" | "forward" | "backward";

/** Apply a stacking operation to elements ordered by `z`.
 *  Returns a new array (same order as input) with updated `z` values, or the
 *  input unchanged when the operation is a no-op. */
export function reorderLayer<T extends { id: string; z: number }>(elements: T[], id: string, op: LayerOp): T[] {
  const sorted = [...elements].sort((a, b) => a.z - b.z);
  const idx = sorted.findIndex((e) => e.id === id);
  if (idx < 0) return elements;

  if (op === "front") {
    if (sorted[sorted.length - 1].id === id) return elements;
    const maxZ = sorted[sorted.length - 1].z;
    return elements.map((e) => (e.id === id ? { ...e, z: maxZ + 1 } : e));
  }
  if (op === "back") {
    if (sorted[0].id === id) return elements;
    const minZ = sorted[0].z;
    return elements.map((e) => (e.id === id ? { ...e, z: minZ - 1 } : e));
  }

  const target = idx + (op === "forward" ? 1 : -1);
  if (target < 0 || target >= sorted.length) return elements;
  const zA = sorted[idx].z;
  const zB = sorted[target].z;
  return elements.map((e) =>
    e.id === sorted[idx].id ? { ...e, z: zB } : e.id === sorted[target].id ? { ...e, z: zA } : e,
  );
}
