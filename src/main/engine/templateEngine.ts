/** Template engine: weighted, non-repetitive layout selection per template family. */
import { LAYOUT_CATALOG, Layout } from "./layouts";
import { Rng, weightedChoice } from "./rng";
import { TemplateFamily } from "./types";

export function resolveLayouts(family: TemplateFamily): Array<[Layout, number]> {
  const out: Array<[Layout, number]> = [];
  for (const [key, weight] of family.layouts) {
    const layout = LAYOUT_CATALOG[key];
    if (layout) out.push([layout, weight]);
  }
  if (out.length === 0) {
    throw new Error(`Template family '${family.key}' has no valid layouts`);
  }
  return out;
}

export function chooseLayout(
  family: TemplateFamily,
  remainingPhotos: number,
  history: string[],
  rng: Rng,
): Layout {
  const layouts = resolveLayouts(family);

  let pool = layouts.filter(([l]) => l.slots.length <= remainingPhotos);
  if (pool.length === 0) {
    const smallest = layouts.reduce((a, b) => (a[0].slots.length <= b[0].slots.length ? a : b));
    pool = [smallest];
  }

  if (pool.length > 1 && history.length > 0) {
    const filtered = pool.filter(([l]) => l.key !== history[history.length - 1]);
    if (filtered.length > 0) pool = filtered;
  }

  return weightedChoice(
    pool.map(([l]) => l),
    pool.map(([, w]) => w),
    rng,
  );
}
