/** Layout engine: assign photos to slots and compose page elements. Deterministic. */
import { computeCrop } from "./cropping";
import { Layout, Slot } from "./layouts";
import { ElementDef, PhotoRecord, aspectRatio } from "./types";

export function slotTargetAspect(slot: Slot, pageAspect: number): number {
  return (slot.w / slot.h) * pageAspect;
}

function slotCost(photo: PhotoRecord, slot: Slot, targetAspect: number): number {
  const cropLoss = Math.abs(Math.log(aspectRatio(photo) / targetAspect));
  let orientationPenalty = 0;
  if (slot.orientationHint === "landscape" && photo.orientation === "portrait") {
    orientationPenalty = 0.6;
  } else if (slot.orientationHint === "portrait" && photo.orientation === "landscape") {
    orientationPenalty = 0.6;
  }
  const qualityTerm = (1 - photo.qualityScore) * 0.4;
  return cropLoss + orientationPenalty + qualityTerm;
}

export function assignPhotos(
  photos: PhotoRecord[],
  layout: Layout,
  pageAspect: number,
): Array<[Slot, PhotoRecord]> {
  const remaining = photos.slice();
  const orderedSlots = layout.slots.slice().sort((a, b) => b.w * b.h - a.w * a.h);
  const assignments: Array<[Slot, PhotoRecord]> = [];
  for (const slot of orderedSlots) {
    if (remaining.length === 0) break;
    const target = slotTargetAspect(slot, pageAspect);
    let bestIdx = 0;
    let bestCost = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const cost = slotCost(remaining[i], slot, target);
      if (cost < bestCost) {
        bestCost = cost;
        bestIdx = i;
      }
    }
    assignments.push([slot, remaining[bestIdx]]);
    remaining.splice(bestIdx, 1);
  }
  return assignments;
}

export function composePage(
  layout: Layout,
  photos: PhotoRecord[],
  pageAspect: number,
): ElementDef[] {
  const assignments = assignPhotos(photos, layout, pageAspect);
  const elements: ElementDef[] = [];
  let z = 0;
  for (const [slot, photo] of assignments) {
    const target = slotTargetAspect(slot, pageAspect);
    const crop = computeCrop(photo.width, photo.height, target, photo.faceBoxes.length ? photo.faceBoxes : undefined);
    elements.push({
      type: "image",
      photoId: photo.id,
      x: round4(slot.x),
      y: round4(slot.y),
      width: round4(slot.w),
      height: round4(slot.h),
      rotation: 0,
      crop,
      z: z++,
    });
  }
  return elements;
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}
