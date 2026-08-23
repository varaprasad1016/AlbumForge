import { describe, expect, it } from "vitest";
import { clampCrop, coverCrop, panCropRect, reorderLayer, stageToPage, zoomCropRect } from "./layoutMath";

describe("coverCrop — object-fit cover", () => {
  it("fills a landscape node from a landscape source", () => {
    expect(coverCrop(3000, 2000, 600, 400)).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });

  it("crops the source width for a portrait node", () => {
    const c = coverCrop(3000, 2000, 300, 400);
    expect(c.width).toBeCloseTo(0.5);
    expect(c.height).toBe(1);
    expect(c.x).toBeCloseTo(0.25); // centered horizontally
    expect(c.y).toBe(0);
  });

  it("crops the source height for a wide node", () => {
    const c = coverCrop(2000, 3000, 600, 300);
    expect(c.width).toBe(1);
    expect(c.height).toBeCloseTo(1 / 3);
    expect(c.x).toBe(0);
    expect(c.y).toBeCloseTo(1 / 3);
  });
});

describe("stageToPage — drag coordinate conversion", () => {
  it("subtracts the page offset and normalizes", () => {
    // Element at normalized (0.5, 0.25) on a 600×400 page sits at stage (340, 140).
    expect(stageToPage(340, 140, 40, 40, 600, 400)).toEqual({ x: 0.5, y: 0.25 });
  });

  it("keeps an element where it was dropped (no offset drift)", () => {
    // Drag an element from (0.1, 0.1) to (0.35, 0.62) in normalized space.
    const start = stageToPage(40 + 0.1 * 600, 40 + 0.1 * 400, 40, 40, 600, 400);
    const end = stageToPage(40 + 0.35 * 600, 40 + 0.62 * 400, 40, 40, 600, 400);
    expect(start).toEqual({ x: 0.1, y: 0.1 });
    expect(end).toEqual({ x: 0.35, y: 0.62 }); // exactly where the cursor dropped it
  });
});

describe("clampCrop", () => {
  it("keeps an interior crop unchanged", () => {
    expect(clampCrop({ x: 0.1, y: 0.2, width: 0.5, height: 0.5 })).toEqual({
      x: 0.1,
      y: 0.2,
      width: 0.5,
      height: 0.5,
    });
  });

  it("pushes an overhanging crop back inside the image", () => {
    expect(clampCrop({ x: -0.2, y: 0.7, width: 0.5, height: 0.5 })).toEqual({
      x: 0,
      y: 0.5,
      width: 0.5,
      height: 0.5,
    });
  });
});

describe("panCropRect", () => {
  const crop = { x: 0.1, y: 0.1, width: 0.5, height: 0.5 };
  it("moves the crop window with the cursor", () => {
    // node 600×400, drag +60px → crop.x += 60 * 0.5 / 600 = +0.05
    expect(panCropRect(crop, 60, 0, 600, 400).x).toBeCloseTo(0.15);
    expect(panCropRect(crop, 0, -40, 600, 400).y).toBeCloseTo(0.05);
  });

  it("clamps at the image edges", () => {
    const p = panCropRect(crop, 1e9, 0, 600, 400);
    expect(p.x).toBe(0.5); // 1 - width
    expect(p.y).toBe(0.1);
  });
});

describe("zoomCropRect", () => {
  const cover = { x: 0, y: 0.25, width: 1, height: 0.5 };
  it("returns cover at zoom 1", () => {
    expect(zoomCropRect(cover, cover, 1)).toEqual(cover);
  });

  it("shrinks around the crop centre at zoom 2", () => {
    const z = zoomCropRect(cover, cover, 2);
    expect(z.width).toBeCloseTo(0.5);
    expect(z.height).toBeCloseTo(0.25);
    expect(z.x).toBeCloseTo(0.25);
    expect(z.y).toBeCloseTo(0.375); // 0.25 + 0.25/2 - 0.25/2... centre preserved
  });

  it("keeps a panned centre while zooming", () => {
    const panned = { x: 0.25, y: 0.1, width: 0.5, height: 0.5 };
    const z = zoomCropRect(panned, cover, 4);
    expect(z.x + z.width / 2).toBeCloseTo(0.5); // centre x preserved at 0.5
    expect(z.y + z.height / 2).toBeCloseTo(0.35); // centre y preserved
  });
});

describe("reorderLayer", () => {
  const els = (zs: number[]): Array<{ id: string; z: number }> =>
    zs.map((z, i) => ({ id: `e${i}`, z }));

  it("moves an element forward/backward one step", () => {
    const fwd = reorderLayer(els([0, 10, 20]), "e0", "forward");
    expect(fwd.find((e) => e.id === "e0")!.z).toBe(10);
    expect(fwd.find((e) => e.id === "e1")!.z).toBe(0);

    const back = reorderLayer(els([0, 10, 20]), "e2", "backward");
    expect(back.find((e) => e.id === "e2")!.z).toBe(10);
    expect(back.find((e) => e.id === "e1")!.z).toBe(20);
  });

  it("brings to front / sends to back", () => {
    const front = reorderLayer(els([0, 10, 20]), "e0", "front");
    expect(front.find((e) => e.id === "e0")!.z).toBe(21);
    expect(front.map((e) => e.z).sort((a, b) => a - b)).toEqual([10, 20, 21]);

    const back = reorderLayer(els([0, 10, 20]), "e2", "back");
    expect(back.find((e) => e.id === "e2")!.z).toBe(-1);
    expect(back.map((e) => e.z).sort((a, b) => a - b)).toEqual([-1, 0, 10]);
  });

  it("is a no-op at the boundaries (returns the same array instance)", () => {
    const a = els([0, 10]);
    expect(reorderLayer(a, "e0", "backward")).toBe(a);
    const b = els([0, 10]);
    expect(reorderLayer(b, "e1", "forward")).toBe(b);
    const c = els([0, 10]);
    expect(reorderLayer(c, "e1", "front")).toBe(c);
    const d = els([0, 10]);
    expect(reorderLayer(d, "e0", "back")).toBe(d);
  });

  it("preserves array length and element identity on reorder", () => {
    const input = els([5, 1, 9]);
    const out = reorderLayer(input, "e1", "front");
    expect(out).toHaveLength(3);
    expect(out.map((e) => e.id)).toEqual(["e0", "e1", "e2"]);
    expect(out.filter((e) => e.id === "e0")[0]).toBe(input[0]);
  });
});
