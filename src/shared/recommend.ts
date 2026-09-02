/** AI design recommendation — pure rules, no models, no network, no Node.
 *
 *  Palette analysis (deterministic k-means over raw RGB pixels) plus
 *  event-type rules produce a page-level suggestion: background colour,
 *  pattern, an ornament graphic, and a font pairing. Everything here is pure
 *  TypeScript and single-sourced in `src/shared/` so both hosts run the same
 *  code: Electron's main process (via `src/main/recommend.ts`, where the
 *  Node-only `sharp` preview sampler lives) and the native Tauri renderer
 *  (which feeds downscaled RGB pixels from a native sampling command).
 *
 *  Keep pure — the renderer bundles this file, so no Node imports allowed.
 */
import { findGraphic, GRAPHICS } from "./designs";
import { PAGE_PATTERNS } from "./patterns";

export interface PaletteColor {
  hex: string;
  weight: number; // 0..1 share of the sampled pixels
}

export interface DesignSuggestion {
  background: { color: string; pattern: string | null };
  accent: string;
  ornament: {
    graphicId: string;
    color: string;
    x: number;
    y: number;
    width: number;
    height: number;
    opacity: number;
  } | null;
  titleFont: string;
  bodyFont: string;
  palette: PaletteColor[];
  rationale: string;
}

export const EVENT_TYPES = ["wedding", "mehndi", "baraat", "sangeet", "reception"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

// ---- colour helpers --------------------------------------------------------

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const v = m ? parseInt(m[1], 16) : 0xffffff;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = (((h % 360) + 360) % 360) / 360;
  let r: number;
  let g: number;
  let b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const f = (t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    r = f(h + 1 / 3);
    g = f(h);
    b = f(h - 1 / 3);
  }
  return [r * 255, g * 255, b * 255];
}

function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const f = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

// ---- palette analysis ------------------------------------------------------

/** k-means colour quantization (k ≤ 5) over raw RGB pixels. Deterministic seeds. */
export function kMeansPalette(pixels: Uint8Array, k = 5): PaletteColor[] {
  const n = pixels.length / 3;
  if (n === 0) return [{ hex: "#8a8a8a", weight: 1 }];

  const luminance: number[] = [];
  for (let i = 0; i < n; i++) {
    luminance.push(pixels[i * 3] * 0.299 + pixels[i * 3 + 1] * 0.587 + pixels[i * 3 + 2] * 0.114);
  }
  const order = luminance.map((_, i) => i).sort((a, b) => luminance[a] - luminance[b]);
  const kk = Math.min(k, n);
  const centroids: Array<[number, number, number]> = [];
  for (let c = 0; c < kk; c++) {
    const idx = order[Math.floor((c * (n - 1)) / Math.max(1, kk - 1))];
    centroids.push([pixels[idx * 3], pixels[idx * 3 + 1], pixels[idx * 3 + 2]]);
  }

  const counts = new Array<number>(kk).fill(0);
  for (let iter = 0; iter < 10; iter++) {
    const sums = centroids.map(() => [0, 0, 0]);
    counts.fill(0);
    for (let i = 0; i < n; i++) {
      const r = pixels[i * 3];
      const g = pixels[i * 3 + 1];
      const b = pixels[i * 3 + 2];
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < kk; c++) {
        const dr = r - centroids[c][0];
        const dg = g - centroids[c][1];
        const db = b - centroids[c][2];
        const d = dr * dr + dg * dg + db * db;
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      sums[best][0] += r;
      sums[best][1] += g;
      sums[best][2] += b;
      counts[best]++;
    }
    for (let c = 0; c < kk; c++) {
      if (counts[c] > 0) {
        centroids[c] = [sums[c][0] / counts[c], sums[c][1] / counts[c], sums[c][2] / counts[c]];
      }
    }
  }

  return centroids
    .map(([r, g, b], i) => ({ hex: rgbToHex(r, g, b), weight: counts[i] / n }))
    .filter((c) => c.weight > 0.005)
    .sort((a, b) => b.weight - a.weight);
}

/** Merge palettes from several photos into one (weighted union, nearest-merge). */
export function mergePalettes(palettes: PaletteColor[][], cap = 6): PaletteColor[] {
  const flat: PaletteColor[] = [];
  for (const pal of palettes) {
    const total = pal.reduce((s, c) => s + c.weight, 0) || 1;
    for (const c of pal) flat.push({ hex: c.hex, weight: c.weight / total / Math.max(1, palettes.length) });
  }
  flat.sort((a, b) => b.weight - a.weight);
  const out: PaletteColor[] = [];
  for (const c of flat) {
    let merged = false;
    for (const o of out) {
      const [r1, g1, b1] = hexToRgb(c.hex);
      const [r2, g2, b2] = hexToRgb(o.hex);
      if (Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2) < 90) {
        o.weight += c.weight;
        merged = true;
        break;
      }
    }
    if (!merged) out.push({ ...c });
  }
  return out.sort((a, b) => b.weight - a.weight).slice(0, cap);
}

// ---- recommendation rules --------------------------------------------------

const FONT_SETS: Record<string, { title: string; body: string; script?: string }> = {
  wedding: { title: "Cormorant", body: "Lato", script: "Sacramento" },
  mehndi: { title: "Cormorant Garamond", body: "Montserrat", script: "Great Vibes" },
  baraat: { title: "Cinzel", body: "Jost", script: "Parisienne" },
  sangeet: { title: "Marcellus", body: "Poppins", script: "Alex Brush" },
  reception: { title: "Playfair Display", body: "Inter", script: "Allura" },
};

const ORNAMENT_BY_EVENT: Record<string, string[]> = {
  wedding: ["medallion", "monogram_luxe", "frame_oval", "wreath"],
  mehndi: ["mandala", "paisley", "swash_l", "divider_diamond"],
  baraat: ["lantern", "peacock", "arch", "corner_filigree"],
  sangeet: ["medallion", "mandala", "divider_floral"],
  reception: ["corner_filigree", "banner_scallop", "ring_seal"],
};

const PATTERN_BY_EVENT: Record<string, string | null> = {
  wedding: "damask",
  mehndi: "diag",
  baraat: "chevron",
  sangeet: "damask",
  reception: "stars",
};

const GRAPHIC_IDS = new Set(GRAPHICS.map((g) => g.id));
const PATTERN_IDS = new Set(PAGE_PATTERNS.map((p) => p.id));

export function eventOrnamentIds(eventType: string): string[] {
  return ORNAMENT_BY_EVENT[eventType] ?? ORNAMENT_BY_EVENT.wedding;
}

/** Build a page-level design suggestion from a palette and event type. Pure. */
export function suggestDesign(
  palette: PaletteColor[],
  eventType: string,
  availableFonts: string[],
): DesignSuggestion {
  const ev = eventType in FONT_SETS ? eventType : "wedding";
  const pickFont = (candidates: Array<string | undefined>) =>
    candidates.find((f) => f && availableFonts.includes(f)) ?? "Playfair Display";

  const dominant = palette[0]?.hex ?? "#8a7a5e";
  const lum = relativeLuminance(dominant);

  // Soft, palette-tinted page background.
  const background = lum > 0.45 ? mixHex(dominant, "#ffffff", 0.88) : mixHex(dominant, "#ffffff", 0.82);

  // Accent: warm palettes get a gold accent (Indian wedding standard), otherwise a
  // complementary hue at readable saturation.
  const [h, s] = rgbToHsl(...hexToRgb(dominant));
  const warm = h < 60 || h > 330;
  const accent = warm ? "#c9a227" : rgbToHex(...hslToRgb(h + 180, Math.min(0.55, Math.max(0.15, s)), 0.42));

  // Ornament from the event pool, tinted with the accent, top-left corner.
  const graphicId = eventOrnamentIds(ev).find((id) => GRAPHIC_IDS.has(id)) ?? null;
  let ornament: DesignSuggestion["ornament"] = null;
  if (graphicId) {
    const def = findGraphic(graphicId);
    const width = 0.2;
    const height = def ? (width * def.h) / def.w : width;
    ornament = { graphicId, color: accent, x: 0.02, y: 0.02, width, height, opacity: 0.55 };
  }

  const pattern = PATTERN_BY_EVENT[ev] ?? null;
  const safePattern = pattern && PATTERN_IDS.has(pattern) ? pattern : null;

  return {
    background: { color: background, pattern: safePattern },
    accent,
    ornament,
    titleFont: pickFont([FONT_SETS[ev].script, FONT_SETS[ev].title]),
    bodyFont: pickFont([FONT_SETS[ev].body]),
    palette,
    rationale: `${ev} palette ${palette.slice(0, 3).map((c) => c.hex).join(", ")} → ${accent} accent`,
  };
}
