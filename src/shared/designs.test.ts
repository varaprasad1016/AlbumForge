/** Shared shape-frame geometry (Canva-style photo frames). */
import { describe, expect, it } from "vitest";
import { roundRectRadius, shapeMaskSvg, starPointsFor } from "./designs";

describe("shape frames", () => {
  it("star geometry: first vertex up, outer vertices on the bounding circle", () => {
    const pts = starPointsFor(200, 200);
    expect(pts).toHaveLength(10);
    expect(pts[0][0]).toBeCloseTo(100, 5);
    expect(pts[0][1]).toBeLessThan(100);
    pts.forEach(([x, y], i) => {
      if (i % 2 === 0) {
        const d = Math.hypot(x - 100, y - 100);
        expect(d).toBeCloseTo(100, 5);
      }
    });
  });

  it("star geometry insets by the stroke width", () => {
    const [plain] = starPointsFor(200, 200);
    const [stroked] = starPointsFor(200, 200, 10);
    expect(stroked[1]).toBeGreaterThan(plain[1]); // top vertex pushed down
  });

  it("roundRectRadius clamps to half the box", () => {
    expect(roundRectRadius({ radius: 8 }, 100, 100)).toBe(8);
    expect(roundRectRadius({ radius: 80 }, 100, 60)).toBe(30);
    expect(roundRectRadius({}, 100, 100)).toBe(0);
  });

  it("mask SVG: closed shapes produce a silhouette, open shapes cannot frame", () => {
    const ellipse = shapeMaskSvg({ shape: "ellipse", fill: "#6366f1" }, 100, 60);
    expect(ellipse).toContain("<ellipse");
    expect(ellipse).toContain('fill="#ffffff"');

    const rect = shapeMaskSvg({ shape: "rect", radius: 12 }, 100, 80);
    expect(rect).toContain('rx="12"');

    const star = shapeMaskSvg({ shape: "star" }, 100, 100);
    expect(star).toContain("<polygon");

    expect(shapeMaskSvg({ shape: "line" }, 100, 10)).toBe("");
    expect(shapeMaskSvg({ shape: "arrow" }, 100, 10)).toBe("");
  });

  it("mask SVG bakes rotation like the visible shape", () => {
    const rot = shapeMaskSvg({ shape: "rect" }, 100, 100, 45);
    expect(rot).toContain("rotate(45 50 50)");
    expect(shapeMaskSvg({ shape: "rect" }, 100, 100, 0)).not.toContain("rotate(");
  });
});
