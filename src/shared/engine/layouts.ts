/** Layout catalogue — pure data.

A layout defines image slots as normalized rectangles on the *trim* page (0..1).
Gutters are baked into the coordinates; the export pipeline applies the template's
bleed to full-bleed slots. Part of the proprietary core.
*/

export interface Slot {
  x: number;
  y: number;
  w: number;
  h: number;
  orientationHint: "landscape" | "portrait" | "square" | "any";
  bleed: boolean;
}

export interface Layout {
  key: string;
  name: string;
  slots: Slot[];
  weight: number;
}

function grid(
  rows: number,
  cols: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
  gutter: number,
  hint: Slot["orientationHint"] = "any",
): Slot[] {
  const cellW = (w - gutter * (cols - 1)) / cols;
  const cellH = (h - gutter * (rows - 1)) / rows;
  const slots: Slot[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      slots.push({
        x: x0 + c * (cellW + gutter),
        y: y0 + r * (cellH + gutter),
        w: cellW,
        h: cellH,
        orientationHint: hint,
        bleed: false,
      });
    }
  }
  return slots;
}

export const LAYOUT_CATALOG: Record<string, Layout> = {};

function register(layout: Layout): Layout {
  LAYOUT_CATALOG[layout.key] = layout;
  return layout;
}

register({
  key: "full_bleed",
  name: "Full bleed",
  weight: 1.0,
  slots: [{ x: 0, y: 0, w: 1, h: 1, orientationHint: "any", bleed: true }],
});

register({
  key: "hero_left",
  name: "Hero left",
  weight: 1.0,
  slots: [
    { x: 0.02, y: 0.03, w: 0.62, h: 0.94, orientationHint: "any", bleed: false },
    { x: 0.68, y: 0.03, w: 0.3, h: 0.94, orientationHint: "portrait", bleed: false },
  ],
});

register({
  key: "hero_right",
  name: "Hero right",
  weight: 1.0,
  slots: [
    { x: 0.68, y: 0.03, w: 0.3, h: 0.94, orientationHint: "portrait", bleed: false },
    { x: 0.02, y: 0.03, w: 0.62, h: 0.94, orientationHint: "any", bleed: false },
  ],
});

register({
  key: "two_vertical",
  name: "Two vertical",
  weight: 1.0,
  slots: [
    { x: 0.02, y: 0.03, w: 0.46, h: 0.94, orientationHint: "portrait", bleed: false },
    { x: 0.52, y: 0.03, w: 0.46, h: 0.94, orientationHint: "portrait", bleed: false },
  ],
});

register({
  key: "two_horizontal",
  name: "Two horizontal",
  weight: 1.0,
  slots: [
    { x: 0.02, y: 0.03, w: 0.96, h: 0.45, orientationHint: "landscape", bleed: false },
    { x: 0.02, y: 0.52, w: 0.96, h: 0.45, orientationHint: "landscape", bleed: false },
  ],
});

register({
  key: "three_grid",
  name: "Three grid",
  weight: 1.0,
  slots: [
    { x: 0.02, y: 0.03, w: 0.3, h: 0.94, orientationHint: "portrait", bleed: false },
    { x: 0.35, y: 0.03, w: 0.3, h: 0.94, orientationHint: "portrait", bleed: false },
    { x: 0.68, y: 0.03, w: 0.3, h: 0.94, orientationHint: "portrait", bleed: false },
  ],
});

register({
  key: "four_grid",
  name: "Four grid",
  weight: 1.0,
  slots: grid(2, 2, 0.02, 0.03, 0.96, 0.94, 0.03),
});

register({
  key: "five_asymmetric",
  name: "Five asymmetric",
  weight: 0.8,
  slots: [
    { x: 0.02, y: 0.03, w: 0.6, h: 0.94, orientationHint: "any", bleed: false },
    ...grid(2, 2, 0.66, 0.03, 0.32, 0.94, 0.03),
  ],
});

register({
  key: "six_collage",
  name: "Six collage",
  weight: 0.8,
  slots: [
    { x: 0.02, y: 0.03, w: 0.62, h: 0.6, orientationHint: "any", bleed: false },
    { x: 0.68, y: 0.03, w: 0.3, h: 0.6, orientationHint: "portrait", bleed: false },
    ...grid(2, 2, 0.02, 0.67, 0.62, 0.3, 0.03, "landscape"),
  ],
});

register({
  key: "eight_collage",
  name: "Eight collage",
  weight: 0.7,
  slots: [...grid(2, 3, 0.02, 0.03, 0.96, 0.46, 0.03), ...grid(2, 2, 0.02, 0.53, 0.96, 0.44, 0.03)],
});

register({
  key: "nine_collage",
  name: "Nine collage",
  weight: 0.6,
  slots: grid(3, 3, 0.02, 0.03, 0.96, 0.94, 0.03),
});

register({
  key: "hero_top",
  name: "Hero top",
  weight: 1.0,
  slots: [
    { x: 0.02, y: 0.03, w: 0.96, h: 0.62, orientationHint: "any", bleed: false },
    { x: 0.02, y: 0.69, w: 0.46, h: 0.28, orientationHint: "landscape", bleed: false },
    { x: 0.52, y: 0.69, w: 0.46, h: 0.28, orientationHint: "landscape", bleed: false },
  ],
});

register({
  key: "hero_bottom",
  name: "Hero bottom",
  weight: 1.0,
  slots: [
    { x: 0.02, y: 0.03, w: 0.46, h: 0.28, orientationHint: "landscape", bleed: false },
    { x: 0.52, y: 0.03, w: 0.46, h: 0.28, orientationHint: "landscape", bleed: false },
    { x: 0.02, y: 0.35, w: 0.96, h: 0.62, orientationHint: "any", bleed: false },
  ],
});

register({
  key: "centerpiece",
  name: "Centerpiece",
  weight: 0.8,
  slots: [
    { x: 0.3, y: 0.3, w: 0.4, h: 0.4, orientationHint: "any", bleed: false },
    { x: 0.03, y: 0.03, w: 0.23, h: 0.23, orientationHint: "square", bleed: false },
    { x: 0.74, y: 0.03, w: 0.23, h: 0.23, orientationHint: "square", bleed: false },
    { x: 0.03, y: 0.74, w: 0.23, h: 0.23, orientationHint: "square", bleed: false },
    { x: 0.74, y: 0.74, w: 0.23, h: 0.23, orientationHint: "square", bleed: false },
  ],
});

register({
  key: "big_three",
  name: "Big + three",
  weight: 0.9,
  slots: [
    { x: 0.02, y: 0.03, w: 0.6, h: 0.94, orientationHint: "any", bleed: false },
    { x: 0.66, y: 0.03, w: 0.32, h: 0.45, orientationHint: "landscape", bleed: false },
    { x: 0.66, y: 0.52, w: 0.32, h: 0.21, orientationHint: "landscape", bleed: false },
    { x: 0.66, y: 0.77, w: 0.32, h: 0.2, orientationHint: "landscape", bleed: false },
  ],
});

// ---- Spread layouts ------------------------------------------------------
// Spread layouts compose across two facing pages (the open canvas). Slot
// coordinates are normalized to the full 2-page canvas: x in [0..1] with the
// center gutter (fold) at x = 0.5. Slot edges that touch x=0 or x=1 (or the
// top/bottom of the canvas) extend into the outer bleed at export time.

register({
  key: "spread_hero",
  name: "Spread — full panorama",
  weight: 1.0,
  slots: [{ x: 0, y: 0, w: 1, h: 1, orientationHint: "landscape", bleed: true }],
});

register({
  key: "spread_two",
  name: "Spread — two facing",
  weight: 1.0,
  slots: [
    { x: 0, y: 0, w: 0.47, h: 1, orientationHint: "any", bleed: true },
    { x: 0.53, y: 0, w: 0.47, h: 1, orientationHint: "any", bleed: true },
  ],
});

register({
  key: "spread_triptych",
  name: "Spread — hero + two",
  weight: 0.9,
  slots: [
    { x: 0, y: 0, w: 0.5, h: 1, orientationHint: "any", bleed: true },
    { x: 0.52, y: 0.02, w: 0.48, h: 0.46, orientationHint: "landscape", bleed: false },
    { x: 0.52, y: 0.52, w: 0.48, h: 0.46, orientationHint: "landscape", bleed: false },
  ],
});

register({
  key: "spread_triptych_mirror",
  name: "Spread — two + hero",
  weight: 0.9,
  slots: [
    { x: 0.0, y: 0.02, w: 0.48, h: 0.46, orientationHint: "landscape", bleed: false },
    { x: 0.0, y: 0.52, w: 0.48, h: 0.46, orientationHint: "landscape", bleed: false },
    { x: 0.5, y: 0, w: 0.5, h: 1, orientationHint: "any", bleed: true },
  ],
});

register({
  key: "spread_grid_four",
  name: "Spread — four across",
  weight: 0.8,
  slots: [
    ...grid(2, 2, 0.01, 0.02, 0.47, 0.96, 0.02),
    ...grid(2, 2, 0.52, 0.02, 0.47, 0.96, 0.02),
  ],
});

// ---- Covers ---------------------------------------------------------------
// Generated explicitly by the generator (not part of family layout pools).

register({
  key: "cover_front",
  name: "Cover",
  weight: 1.0,
  slots: [{ x: 0, y: 0, w: 1, h: 1, orientationHint: "landscape", bleed: true }],
});

register({
  key: "cover_back",
  name: "Back cover",
  weight: 1.0,
  slots: [{ x: 0, y: 0, w: 1, h: 1, orientationHint: "any", bleed: true }],
});

export function layoutKeys(): string[] {
  return Object.keys(LAYOUT_CATALOG);
}

export function isSpreadLayout(key: string | null | undefined): boolean {
  return !!key && key.startsWith("spread_");
}
