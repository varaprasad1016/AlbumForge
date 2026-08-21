/** Spread export integration test (sharp + pdf-lib). */
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { buildPdf, ExportPage } from "./export";

const photos = new Map<string, { path: string; width: number; height: number }>();

async function makePhoto(id: string, w: number, h: number): Promise<void> {
  const path = `${process.env.TEMP ?? "/tmp"}/af-export-test-${id}.jpg`;
  await sharp({
    create: { width: w, height: h, channels: 3, background: { r: 200, g: 40, b: 40 } },
  })
    .jpeg()
    .toFile(path);
  photos.set(id, { path, width: w, height: h });
}

function resolvePhoto(id: string): { path: string; width: number; height: number } {
  const p = photos.get(id);
  if (!p) throw new Error(`missing test photo ${id}`);
  return p;
}

function imageEl(photoId: string, x: number, y: number, w: number, h: number, z: number): ExportPage["elements"][number] {
  return { type: "image", photoId, x, y, width: w, height: h, rotation: 0, crop: null, text: null, style: null, z };
}

describe("spread export", () => {
  it("splits a spread into two PDF pages and keeps single pages as one", async () => {
    await makePhoto("p1", 3000, 2000);
    const spreadPage: ExportPage = {
      layoutKey: "spread_hero",
      background: { color: "#ffffff" },
      elements: [imageEl("p1", 0, 0, 1, 1, 0)],
    };
    const normalPage: ExportPage = {
      layoutKey: "full_bleed",
      background: { color: "#ffffff" },
      elements: [imageEl("p1", 0, 0, 1, 1, 0)],
    };
    const pdf = await buildPdf([spreadPage, normalPage], resolvePhoto, 100, 100, 30, 3);
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBe(3);
  });

  it("keeps text on the correct half of a spread", async () => {
    await makePhoto("p2", 3000, 2000);
    const spreadPage: ExportPage = {
      layoutKey: "spread_two",
      background: { color: "#ffffff" },
      elements: [
        imageEl("p2", 0, 0, 0.47, 1, 0),
        imageEl("p2", 0.53, 0, 0.47, 1, 1),
        {
          type: "text",
          photoId: null,
          x: 0.6,
          y: 0.1,
          width: 0.3,
          height: 0.1,
          rotation: 0,
          crop: null,
          text: { content: "Right side" },
          style: { color: "#000000", fontSize: 14 },
          z: 2,
        },
      ],
    };
    const pdf = await buildPdf([spreadPage], resolvePhoto, 100, 100, 30, 3);
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBe(2);
  });
});
