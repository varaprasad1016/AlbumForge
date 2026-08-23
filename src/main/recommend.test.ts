import { describe, expect, it } from "vitest";
import {
  eventOrnamentIds,
  hexToRgb,
  kMeansPalette,
  mergePalettes,
  rgbToHex,
  suggestDesign,
  type PaletteColor,
} from "./recommend";

function solidPixels(hex: string, count = 64): Uint8Array {
  const [r, g, b] = hexToRgb(hex);
  const out = new Uint8Array(count * 3);
  for (let i = 0; i < count; i++) {
    out[i * 3] = r;
    out[i * 3 + 1] = g;
    out[i * 3 + 2] = b;
  }
  return out;
}

describe("colour helpers", () => {
  it("round-trips hex ↔ rgb", () => {
    expect(hexToRgb("#ff8040")).toEqual([255, 128, 64]);
    expect(rgbToHex(255, 128, 64)).toBe("#ff8040");
  });
});

describe("kMeansPalette", () => {
  it("finds the dominant colour of a solid image", () => {
    const pal = kMeansPalette(solidPixels("#c9a227"), 3);
    expect(pal[0].weight).toBeGreaterThan(0.99);
    expect(pal[0].hex).toBe("#c9a227");
  });

  it("separates two distinct colours", () => {
    const data = new Uint8Array(128 * 3);
    const [r1, g1, b1] = hexToRgb("#111111");
    const [r2, g2, b2] = hexToRgb("#eeeeee");
    for (let i = 0; i < 64; i++) {
      data[i * 3] = r1;
      data[i * 3 + 1] = g1;
      data[i * 3 + 2] = b1;
    }
    for (let i = 64; i < 128; i++) {
      data[i * 3] = r2;
      data[i * 3 + 1] = g2;
      data[i * 3 + 2] = b2;
    }
    const pal = kMeansPalette(data, 2);
    expect(pal).toHaveLength(2);
    expect(Math.max(pal[0].weight, pal[1].weight)).toBeGreaterThan(0.4);
  });
});

describe("mergePalettes", () => {
  it("merges and caps the result", () => {
    const a: PaletteColor[] = [{ hex: "#ff0000", weight: 1 }];
    const b: PaletteColor[] = [{ hex: "#ff0000", weight: 1 }];
    const merged = mergePalettes([a, b], 4);
    expect(merged[0].hex).toBe("#ff0000");
    expect(merged[0].weight).toBeGreaterThan(0.5);
    expect(merged.length).toBeLessThanOrEqual(4);
  });
});

describe("suggestDesign", () => {
  const fonts = ["Playfair Display", "Cormorant", "Montserrat", "Inter", "Cinzel", "Great Vibes"];

  it("picks fonts that exist in the library", () => {
    const s = suggestDesign([{ hex: "#c9a227", weight: 1 }], "wedding", fonts);
    expect(fonts).toContain(s.titleFont);
    expect(fonts).toContain(s.bodyFont);
  });

  it("falls back gracefully for unknown event types", () => {
    const s = suggestDesign([{ hex: "#111111", weight: 1 }], "banquet", fonts);
    expect(s.background.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(s.accent).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("returns an ornament for every event type", () => {
    for (const ev of ["wedding", "mehndi", "baraat", "sangeet", "reception"]) {
      const s = suggestDesign([{ hex: "#8a7a5e", weight: 1 }], ev, fonts);
      expect(s.ornament).not.toBeNull();
      expect(eventOrnamentIds(ev)).toContain(s.ornament!.graphicId);
      expect(s.ornament!.width).toBeGreaterThan(0);
    }
  });

  it("picks a valid pattern id (or null)", () => {
    const s = suggestDesign([{ hex: "#8a7a5e", weight: 1 }], "wedding", fonts);
    expect([null, "dots", "diag", "grid", "chevron", "stars", "damask"]).toContain(s.background.pattern);
  });
});
