/** Engine tests (pure, no Electron/sharp/SQLite). Run with `npm test`. */
import { describe, expect, it } from "vitest";
import { computeCrop } from "./cropping";
import { generateAlbum } from "./generator";
import { findDuplicatePairs, segmentByTime } from "./grouping";
import { composePage } from "./layoutEngine";
import { isSpreadLayout, LAYOUT_CATALOG } from "./layouts";
import { hamming, isNearDuplicate } from "./scoring";
import { selectDiverse } from "./selection";
import { chooseLayout } from "./templateEngine";
import { AlbumSpec, PageStyle, PhotoRecord, TemplateFamily } from "./types";

function makePhotos(n: number, duplicateEvery?: number): PhotoRecord[] {
  const dims = { landscape: [4000, 2667], portrait: [2667, 4000], square: [3000, 3000] } as const;
  const orientations = ["landscape", "portrait", "square"] as const;
  const photos: PhotoRecord[] = [];
  let prev: bigint = 0n;
  for (let i = 0; i < n; i++) {
    const orientation = orientations[i % 3];
    const [width, height] = dims[orientation];
    let phash = BigInt("0x" + (i * 2654435761).toString(16)) & 0xffffffffffffffffn;
    if (duplicateEvery && i > 0 && i % duplicateEvery === 0) {
      phash = prev ^ BigInt(Math.floor(Math.random() * 4));
    }
    photos.push({
      id: `photo-${i}`,
      width,
      height,
      orientation,
      qualityScore: 0.4 + ((i * 37) % 60) / 100,
      blurScore: ((i * 13) % 60) / 100,
      phash,
      takenAt: 1_600_000_000 + i * 30,
      groupId: null,
      faceBoxes: [],
    });
    prev = phash;
  }
  return photos;
}

const FAMILY: TemplateFamily = {
  key: "collage",
  name: "Collage",
  layouts: [
    ["full_bleed", 0.4],
    ["hero_left", 1.0],
    ["four_grid", 1.0],
    ["six_collage", 1.0],
    ["eight_collage", 1.0],
  ],
  style: { margin: 0.02, gutter: 0.03, bleed: 0, safeArea: 0.05 },
  chronological: false,
};

const SPEC: AlbumSpec = { pageCount: 20, pageAspect: 1, style: FAMILY.style };

describe("layouts", () => {
  it("has the 11 core layouts", () => {
    const expected = [
      "full_bleed", "hero_left", "hero_right", "two_vertical", "two_horizontal",
      "three_grid", "four_grid", "five_asymmetric", "six_collage", "eight_collage", "nine_collage",
    ];
    for (const key of expected) expect(LAYOUT_CATALOG[key]).toBeDefined();
  });

  it("slots are valid normalized rects", () => {
    for (const layout of Object.values(LAYOUT_CATALOG)) {
      for (const s of layout.slots) {
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.y).toBeGreaterThanOrEqual(0);
        expect(s.x + s.w).toBeLessThanOrEqual(1 + 1e-6);
        expect(s.y + s.h).toBeLessThanOrEqual(1 + 1e-6);
      }
    }
  });
});

describe("cropping", () => {
  it("same aspect returns full crop", () => {
    expect(computeCrop(3000, 2000, 1.5)).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });

  it("wider target crops vertically and matches aspect", () => {
    const c = computeCrop(2000, 3000, 1.5);
    expect(c.width).toBeCloseTo(1);
    const srcW = 2000 * c.width;
    const srcH = 3000 * c.height;
    expect(srcW / srcH).toBeCloseTo(1.5, 3);
  });

  it("faces shift crop toward subject", () => {
    const faces = [{ x: 0.4, y: 0.8, width: 0.2, height: 0.2 }];
    const noFace = computeCrop(3000, 2000, 2);
    const withFace = computeCrop(3000, 2000, 2, faces);
    expect(withFace.y).toBeGreaterThan(noFace.y);
  });
});

describe("scoring", () => {
  it("hamming distance works", () => {
    expect(hamming(0b1111n, 0b0000n)).toBe(4);
  });

  it("detects near duplicates", () => {
    expect(isNearDuplicate(12345n, 12345n)).toBe(true);
    expect(isNearDuplicate(0n, 0xffffffffffffffffn)).toBe(false);
  });
});

describe("template engine", () => {
  it("prefers layouts that fit remaining photos", () => {
    const rng = () => 0.5;
    const layout = chooseLayout(FAMILY, 1, [], rng);
    expect(layout.key).toBe("full_bleed");
  });

  it("avoids immediate repetition", () => {
    const rng = () => 0.5;
    for (let i = 0; i < 10; i++) {
      const layout = chooseLayout(FAMILY, 20, ["hero_left"], rng);
      expect(layout.key).not.toBe("hero_left");
    }
  });
});

describe("layout engine", () => {
  it("composes elements with valid coordinates", () => {
    const photos = makePhotos(20);
    for (const layout of Object.values(LAYOUT_CATALOG)) {
      for (const el of composePage(layout, photos, 1)) {
        expect(el.x + el.width).toBeLessThanOrEqual(1 + 1e-6);
        expect(el.y + el.height).toBeLessThanOrEqual(1 + 1e-6);
        expect(el.crop).toBeTruthy();
      }
    }
  });
});

describe("selection", () => {
  it("returns target count", () => {
    expect(selectDiverse(makePhotos(100), 30).length).toBe(30);
  });

  it("avoids burst duplicates", () => {
    const chosen = selectDiverse(makePhotos(40, 2), 15);
    for (let i = 1; i < chosen.length; i++) {
      expect(hamming(chosen[i].phash, chosen[i - 1].phash)).toBeGreaterThan(8);
    }
  });
});

describe("grouping", () => {
  it("segments by time gap", () => {
    const photos = makePhotos(10);
    for (let i = 5; i < 10; i++) photos[i].takenAt = (photos[i].takenAt ?? 0) + 10_000;
    expect(segmentByTime(photos, 3600).length).toBe(2);
  });

  it("finds duplicate pairs", () => {
    expect(findDuplicatePairs(makePhotos(30, 3)).length).toBeGreaterThan(0);
  });
});

describe("generator", () => {
  it("is deterministic for a given variation", () => {
    const a = generateAlbum(makePhotos(120), FAMILY, SPEC, 2);
    const b = generateAlbum(makePhotos(120), FAMILY, SPEC, 2);
    expect(a.pages).toEqual(b.pages);
  });

  it("produces genuinely different variations", () => {
    const a = generateAlbum(makePhotos(120), FAMILY, SPEC, 1);
    const b = generateAlbum(makePhotos(120), FAMILY, SPEC, 2);
    expect(a.pages).not.toEqual(b.pages);
  });

  it("respects page count and never reuses a photo", () => {
    const result = generateAlbum(makePhotos(200), FAMILY, { ...SPEC, pageCount: 10 }, 1);
    expect(result.pageCount).toBeLessThanOrEqual(10);
    const ids = result.pages.flatMap((p) => p.elements.map((e) => e.photoId));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("throws on empty photo set", () => {
    expect(() => generateAlbum([], FAMILY, SPEC, 1)).toThrow();
  });
});

describe("spreads", () => {
  const SPREAD_FAMILY: TemplateFamily = {
    key: "spready",
    name: "Spready",
    layouts: [
      ["spread_hero", 3.0],
      ["spread_triptych", 3.0],
      ["full_bleed", 1.0],
    ],
    style: { margin: 0.02, gutter: 0.03, bleed: 0, safeArea: 0.05 },
    chronological: true,
  };

  it("isSpreadLayout detects spread keys", () => {
    expect(isSpreadLayout("spread_hero")).toBe(true);
    expect(isSpreadLayout("spread_triptych")).toBe(true);
    expect(isSpreadLayout("full_bleed")).toBe(false);
    expect(isSpreadLayout(null)).toBe(false);
  });

  it("composes spread slots against the double page aspect", () => {
    const photos = makePhotos(10);
    for (const key of ["spread_hero", "spread_two", "spread_triptych", "spread_grid_four"]) {
      for (const el of composePage(LAYOUT_CATALOG[key], photos, 2)) {
        expect(el.x + el.width).toBeLessThanOrEqual(1 + 1e-6);
        expect(el.y + el.height).toBeLessThanOrEqual(1 + 1e-6);
        if (el.crop) {
          expect(el.crop.width / el.crop.height).toBeGreaterThan(0.5);
        }
      }
    }
  });

  it("generator flags spread pages and composes them across the open canvas", () => {
    const result = generateAlbum(makePhotos(120), SPREAD_FAMILY, SPEC, 1);
    const spreads = result.pages.filter((p) => p.spread);
    expect(spreads.length).toBeGreaterThan(0);
    for (const p of result.pages) {
      expect(p.spread).toBe(isSpreadLayout(p.layoutKey));
    }
    for (const p of spreads) {
      expect(p.elements.length).toBeGreaterThan(0);
    }
  });

  it("never places two spreads back to back", () => {
    const result = generateAlbum(makePhotos(300), SPREAD_FAMILY, { ...SPEC, pageCount: 30 }, 1);
    for (let i = 1; i < result.pages.length; i++) {
      expect(result.pages[i].spread && result.pages[i - 1].spread).toBe(false);
    }
  });

  it("adds a titled cover and a full-bleed back cover", () => {
    const result = generateAlbum(makePhotos(50), FAMILY, { ...SPEC, coverTitle: "Wedding" }, 1);
    expect(result.pages[0].layoutKey).toBe("cover_front");
    expect(
      result.pages[0].elements.some(
        (e) => e.type === "text" && (e.text as { content?: string } | undefined)?.content === "Wedding",
      ),
    ).toBe(true);
    expect(result.pages[result.pages.length - 1].layoutKey).toBe("cover_back");
    const ids = result.pages.flatMap((p) => p.elements.filter((e) => e.type === "image").map((e) => e.photoId));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
