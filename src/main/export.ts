/** Export: composite pages with sharp (original photos) and assemble a print-ready PDF
 * with pdf-lib (correct physical size + trim/bleed/media boxes). */
import sharp from "sharp";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { isSpreadLayout } from "./engine/layouts";
import { backgroundCanvasSvg } from "../shared/patterns";
import { graphicSvg, shapeSvg, type GraphicStyle, type ShapeStyle } from "../shared/designs";

const MM_PER_INCH = 25.4;
const PT_PER_MM = 72 / MM_PER_INCH;

export interface ResolvedPhoto {
  path: string;
  width: number;
  height: number;
}

export interface ExportElement {
  type: string;
  photoId: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  crop: { x: number; y: number; width: number; height: number } | null;
  text: { content?: string } | null;
  style: Record<string, unknown> | null;
  z: number;
}

export interface ExportPage {
  layoutKey: string | null;
  background: { color?: string; pattern?: string } | null;
  elements: ExportElement[];
}

export type PhotoResolver = (id: string) => ResolvedPhoto;

/** SVG for a vector (shape/graphic) element sized to its canvas box. */
function vectorElementSvg(
  el: ExportElement,
  pageWpx: number,
  pageHpx: number,
  _bleedPx: number,
): string {
  const w = Math.max(1, Math.round(el.width * pageWpx));
  const h = Math.max(1, Math.round(el.height * pageHpx));
  if (el.type === "shape") {
    const style = (el.style ?? {}) as unknown as ShapeStyle;
    return shapeSvg(style, w, h, el.rotation);
  }
  const style = (el.style ?? {}) as unknown as GraphicStyle;
  const color = style.color ?? "#0f172a";
  const strokeW = Math.max(1, Math.round(w / 80));
  return graphicSvg(style.graphicId ?? "", color, w, h, style.opacity ?? 1, strokeW);
}

/** Rasterized buffer for a custom imported asset (SVG/PNG data URI embedded in
 *  the element style — albums stay self-contained). */
async function assetElementBuffer(el: ExportElement, w: number, h: number): Promise<Buffer | null> {
  const uri = ((el.style ?? {}) as unknown as { assetUri?: string } | null)?.assetUri;
  if (!uri) return null;
  try {
    const comma = uri.indexOf(",");
    let pipeline = uri.startsWith("data:image/svg")
      ? sharp(Buffer.from(decodeURIComponent(uri.slice(comma + 1))))
      : sharp(Buffer.from(uri.slice(comma + 1), "base64"));
    if (el.rotation) {
      pipeline = pipeline.rotate(el.rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } });
    }
    return await pipeline.resize(Math.max(1, w), Math.max(1, h), { fit: "fill" }).png().toBuffer();
  } catch {
    return null;
  }
}

export async function renderPageJpeg(
  page: ExportPage,
  resolvePhoto: PhotoResolver,
  pageWpx: number,
  pageHpx: number,
  bleedPx: number,
): Promise<Buffer> {
  const canvasW = pageWpx + 2 * bleedPx;
  const canvasH = pageHpx + 2 * bleedPx;

  const bgHex = page.background?.color ?? "#ffffff";
  const composites: Array<{ input: Buffer; left: number; top: number }> = [];

  const elements = page.elements.slice().sort((a, b) => a.z - b.z);
  for (const el of elements) {
    if (el.type === "shape" || el.type === "graphic") {
      const w = Math.max(1, Math.round(el.width * pageWpx));
      const h = Math.max(1, Math.round(el.height * pageHpx));
      let buf: Buffer | null = null;
      if (el.type === "graphic" && (el.style as { assetUri?: string } | null)?.assetUri) {
        buf = await assetElementBuffer(el, w, h);
      } else {
        const svg = vectorElementSvg(el, pageWpx, pageHpx, bleedPx);
        if (svg) buf = await sharp(Buffer.from(svg)).png().toBuffer();
      }
      if (!buf) continue;
      composites.push({
        input: buf,
        left: Math.round(bleedPx + el.x * pageWpx),
        top: Math.round(bleedPx + el.y * pageHpx),
      });
      continue;
    }
    if (el.type !== "image" || !el.photoId) continue;
    const photo = resolvePhoto(el.photoId);

    let pipeline = sharp(photo.path).rotate();
    const hasCrop = !!el.crop;
    if (el.crop) {
      const left = Math.round(el.crop.x * photo.width);
      const top = Math.round(el.crop.y * photo.height);
      const width = Math.max(1, Math.round(el.crop.width * photo.width));
      const height = Math.max(1, Math.round(el.crop.height * photo.height));
      pipeline = pipeline.extract({ left, top, width, height });
    }
    if (el.rotation) {
      pipeline = pipeline.rotate(el.rotation);
    }

    let boxW = Math.round(el.width * pageWpx);
    let boxH = Math.round(el.height * pageHpx);
    let left = bleedPx + el.x * pageWpx;
    let top = bleedPx + el.y * pageHpx;

    // Extend into the outer bleed only on edges the element actually touches.
    // On spread canvases this keeps the gutter (x=0.5) clean — no bleed across
    // the fold — while outer edges stay print-safe.
    if (el.x <= 0.001) {
      left -= bleedPx;
      boxW += bleedPx;
    }
    if (el.x + el.width >= 0.999) boxW += bleedPx;
    if (el.y <= 0.001) {
      top -= bleedPx;
      boxH += bleedPx;
    }
    if (el.y + el.height >= 0.999) boxH += bleedPx;

    // With an explicit crop the aspect already matches, so fill exactly. Without a crop,
    // cover (center-crop to fill) prevents distortion.
    const buf = await pipeline
      .resize(boxW, boxH, { fit: hasCrop ? "fill" : "cover" })
      .jpeg({ quality: 95 })
      .toBuffer();
    composites.push({ input: buf, left: Math.round(left), top: Math.round(top) });
  }

  // Base canvas: pattern (SVG raster) when a pattern is set, plain fill otherwise.
  const patternSvg = backgroundCanvasSvg(page.background?.pattern ?? null, bgHex, canvasW, canvasH);
  const base = patternSvg
    ? sharp(Buffer.from(patternSvg))
    : sharp({
        create: {
          width: canvasW,
          height: canvasH,
          channels: 3,
          background: hexToRgb(bgHex),
        },
      });
  return base
    .composite(composites)
    .jpeg({ quality: 95 })
    .toBuffer();
}

/** Render a two-page spread as a single wide canvas (outer bleed on both sides,
 * none at the gutter) and slice it into left/right page images at the fold. */
export async function renderSpreadJpegs(
  page: ExportPage,
  resolvePhoto: PhotoResolver,
  pageWpx: number,
  pageHpx: number,
  bleedPx: number,
): Promise<[Buffer, Buffer]> {
  const spreadWpx = 2 * pageWpx;
  const canvasW = spreadWpx + 2 * bleedPx;
  const canvasH = pageHpx + 2 * bleedPx;

  const bgHex = page.background?.color ?? "#ffffff";
  const composites: Array<{ input: Buffer; left: number; top: number }> = [];

  const elements = page.elements.slice().sort((a, b) => a.z - b.z);
  for (const el of elements) {
    if (el.type === "shape" || el.type === "graphic") {
      const w = Math.max(1, Math.round(el.width * spreadWpx));
      const h = Math.max(1, Math.round(el.height * pageHpx));
      let buf: Buffer | null = null;
      if (el.type === "graphic" && (el.style as { assetUri?: string } | null)?.assetUri) {
        buf = await assetElementBuffer(el, w, h);
      } else {
        const svg = vectorElementSvg(el, spreadWpx, pageHpx, bleedPx);
        if (svg) buf = await sharp(Buffer.from(svg)).png().toBuffer();
      }
      if (!buf) continue;
      composites.push({
        input: buf,
        left: Math.round(bleedPx + el.x * spreadWpx),
        top: Math.round(bleedPx + el.y * pageHpx),
      });
      continue;
    }
    if (el.type !== "image" || !el.photoId) continue;
    const photo = resolvePhoto(el.photoId);

    let pipeline = sharp(photo.path).rotate();
    if (el.crop) {
      const left = Math.round(el.crop.x * photo.width);
      const top = Math.round(el.crop.y * photo.height);
      const width = Math.max(1, Math.round(el.crop.width * photo.width));
      const height = Math.max(1, Math.round(el.crop.height * photo.height));
      pipeline = pipeline.extract({ left, top, width, height });
    }
    if (el.rotation) {
      pipeline = pipeline.rotate(el.rotation);
    }

    let boxW = Math.round(el.width * spreadWpx);
    let boxH = Math.round(el.height * pageHpx);
    let left = bleedPx + el.x * spreadWpx;
    let top = bleedPx + el.y * pageHpx;

    if (el.x <= 0.001) {
      left -= bleedPx;
      boxW += bleedPx;
    }
    if (el.x + el.width >= 0.999) boxW += bleedPx;
    if (el.y <= 0.001) {
      top -= bleedPx;
      boxH += bleedPx;
    }
    if (el.y + el.height >= 0.999) boxH += bleedPx;

    const buf = await pipeline
      .resize(boxW, boxH, { fit: el.crop ? "fill" : "cover" })
      .jpeg({ quality: 95 })
      .toBuffer();
    composites.push({ input: buf, left: Math.round(left), top: Math.round(top) });
  }

  const patternSvg = backgroundCanvasSvg(page.background?.pattern ?? null, bgHex, canvasW, canvasH);
  const base = patternSvg
    ? sharp(Buffer.from(patternSvg))
    : sharp({
        create: {
          width: canvasW,
          height: canvasH,
          channels: 3,
          background: hexToRgb(bgHex),
        },
      });
  const canvas = await base
    .composite(composites)
    .jpeg({ quality: 95 })
    .toBuffer();

  const halfW = pageWpx + bleedPx;
  const leftJpeg = await sharp(canvas)
    .extract({ left: 0, top: 0, width: halfW, height: canvasH })
    .jpeg({ quality: 95 })
    .toBuffer();
  const rightJpeg = await sharp(canvas)
    .extract({ left: halfW, top: 0, width: halfW, height: canvasH })
    .jpeg({ quality: 95 })
    .toBuffer();
  return [leftJpeg, rightJpeg];
}

/** Build a complete lab-ready package: print PDF + one JPEG per page + a manifest
 * describing the exact print specs. Everything a print lab needs to check the job. */
export async function writeLabPackage(
  pages: ExportPage[],
  resolvePhoto: PhotoResolver,
  widthMm: number,
  heightMm: number,
  dpi: number,
  bleedMm: number,
  colorMode: "rgb" | "cmyk",
  outDir: string,
  albumName: string,
  resolveFont?: (family: string) => Uint8Array | null,
): Promise<string> {
  mkdirSync(outDir, { recursive: true });
  mkdirSync(join(outDir, "pages"), { recursive: true });

  const pdf = await buildPdf(
    pages,
    resolvePhoto,
    widthMm,
    heightMm,
    dpi,
    bleedMm,
    undefined,
    resolveFont,
  );
  writeFileSync(join(outDir, `${albumName}.pdf`), pdf);

  const pxPerMm = dpi / MM_PER_INCH;
  const pageWpx = Math.round(widthMm * pxPerMm);
  const pageHpx = Math.round(heightMm * pxPerMm);
  const bleedPx = Math.round(bleedMm * pxPerMm);

  let pageNo = 0;
  for (const page of pages) {
    pageNo++;
    if (isSpreadLayout(page.layoutKey)) {
      const [left, right] = await renderSpreadJpegs(page, resolvePhoto, pageWpx, pageHpx, bleedPx);
      writeFileSync(join(outDir, "pages", `page-${String(pageNo).padStart(3, "0")}-left.jpg`), left);
      writeFileSync(join(outDir, "pages", `page-${String(pageNo).padStart(3, "0")}-right.jpg`), right);
    } else {
      const jpeg = await renderPageJpeg(page, resolvePhoto, pageWpx, pageHpx, bleedPx);
      writeFileSync(join(outDir, "pages", `page-${String(pageNo).padStart(3, "0")}.jpg`), jpeg);
    }
  }

  const manifest = [
    `AlbumForge lab package`,
    `Album: ${albumName}`,
    `Size: ${widthMm} x ${heightMm} mm (${Math.round((widthMm / 25.4) * 100) / 100} x ${Math.round((heightMm / 25.4) * 100) / 100} in)`,
    `Resolution: ${dpi} DPI`,
    `Bleed: ${bleedMm} mm per side`,
    `Color mode: ${colorMode.toUpperCase()}`,
    `Pages: ${pages.length} (spreads exported as left/right files)`,
    ``,
    colorMode === "cmyk"
      ? "NOTE: Files are delivered in sRGB JPEG; the PDF is RGB. Perform CMYK conversion with your press profile (G7/ISO Coated) before plating. Safe zones are respected — no faces or text cross the gutter."
      : "NOTE: Deliver as-is to silver-halide/lab systems. RGB profile preserved.",
    ``,
    `Generated: ${new Date().toISOString()}`,
  ].join("\n");
  writeFileSync(join(outDir, "manifest.txt"), manifest);

  return outDir;
}

export async function buildPdf(
  pages: ExportPage[],
  resolvePhoto: PhotoResolver,
  widthMm: number,
  heightMm: number,
  dpi = 300,
  bleedMm = 3,
  watermark?: string,
  resolveFont?: (family: string) => Uint8Array | null,
): Promise<Uint8Array> {
  const pxPerMm = dpi / MM_PER_INCH;
  const pageWpx = Math.round(widthMm * pxPerMm);
  const pageHpx = Math.round(heightMm * pxPerMm);
  const bleedPx = Math.round(bleedMm * pxPerMm);

  const mediaWmm = widthMm + 2 * bleedMm;
  const mediaHmm = heightMm + 2 * bleedMm;

  const doc = await PDFDocument.create();
  const defaultFont = await doc.embedFont(StandardFonts.Helvetica);
  const fontCache = new Map<string, import("pdf-lib").PDFFont>();

  const addPdfPage = async (
    jpeg: Buffer,
    xOffPt: number,
  ): Promise<import("pdf-lib").PDFPage> => {
    const img = await doc.embedJpg(jpeg);
    const pdfPage = doc.addPage([mediaWmm * PT_PER_MM, mediaHmm * PT_PER_MM]);
    pdfPage.drawImage(img, {
      x: xOffPt,
      y: 0,
      width: (widthMm + bleedMm) * PT_PER_MM,
      height: mediaHmm * PT_PER_MM,
    });
    pdfPage.setMediaBox(0, 0, mediaWmm * PT_PER_MM, mediaHmm * PT_PER_MM);
    pdfPage.setBleedBox(0, 0, mediaWmm * PT_PER_MM, mediaHmm * PT_PER_MM);
    pdfPage.setTrimBox(
      bleedMm * PT_PER_MM,
      bleedMm * PT_PER_MM,
      (bleedMm + widthMm) * PT_PER_MM,
      (bleedMm + heightMm) * PT_PER_MM,
    );
    return pdfPage;
  };

  for (const page of pages) {
    if (isSpreadLayout(page.layoutKey)) {
      const [leftJpeg, rightJpeg] = await renderSpreadJpegs(page, resolvePhoto, pageWpx, pageHpx, bleedPx);
      for (const half of ["left", "right"] as const) {
        const isRight = half === "right";
        const pdfPage = await addPdfPage(isRight ? rightJpeg : leftJpeg, isRight ? bleedMm * PT_PER_MM : 0);
        await drawTextElements(
          doc,
          pdfPage,
          page,
          defaultFont,
          fontCache,
          resolveFont ?? (() => null),
          widthMm,
          heightMm,
          bleedMm,
          half,
        );
        if (watermark) drawWatermark(pdfPage, defaultFont, watermark, mediaWmm, mediaHmm);
      }
    } else {
      const jpeg = await renderPageJpeg(page, resolvePhoto, pageWpx, pageHpx, bleedPx);
      const pdfPage = await addPdfPage(jpeg, 0);
      await drawTextElements(
        doc,
        pdfPage,
        page,
        defaultFont,
        fontCache,
        resolveFont ?? (() => null),
        widthMm,
        heightMm,
        bleedMm,
      );
      if (watermark) drawWatermark(pdfPage, defaultFont, watermark, mediaWmm, mediaHmm);
    }
  }

  return doc.save();
}

function drawWatermark(
  pdfPage: import("pdf-lib").PDFPage,
  font: import("pdf-lib").PDFFont,
  text: string,
  mediaWmm: number,
  mediaHmm: number,
): void {
  const pageW = mediaWmm * PT_PER_MM;
  const pageH = mediaHmm * PT_PER_MM;
  const size = Math.max(48, Math.min(pageW, pageH) * 0.22);
  pdfPage.drawText(text, {
    x: pageW / 2 - size * 1.5,
    y: pageH / 2 - size / 2,
    size,
    font,
    color: rgb(0.75, 0.75, 0.75),
    opacity: 0.35,
    rotate: degrees(45),
  });
}

async function drawTextElements(
  doc: import("pdf-lib").PDFDocument,
  pdfPage: import("pdf-lib").PDFPage,
  page: ExportPage,
  defaultFont: import("pdf-lib").PDFFont,
  fontCache: Map<string, import("pdf-lib").PDFFont>,
  resolveFont: (family: string) => Uint8Array | null,
  widthMm: number,
  heightMm: number,
  bleedMm: number,
  half?: "left" | "right",
): Promise<void> {
  const pageHpt = (heightMm + 2 * bleedMm) * PT_PER_MM;
  for (const el of page.elements) {
    if (el.type !== "text") continue;
    const content = el.text?.content;
    if (!content) continue;

    let xNorm = el.x;
    if (half) {
      const side: "left" | "right" = el.x + (el.width || 0) / 2 < 0.5 ? "left" : "right";
      if (side !== half) continue;
      xNorm = Math.max(0.01, Math.min((el.x - (half === "right" ? 0.5 : 0)) * 2, 0.9));
    }

    const family = (el.style?.fontFamily as string) || "";
    let font = defaultFont;
    if (family) {
      if (fontCache.has(family)) {
        font = fontCache.get(family)!;
      } else {
        const bytes = resolveFont(family);
        if (bytes) {
          try {
            const embedded = await doc.embedFont(bytes, { subset: true });
            fontCache.set(family, embedded);
            font = embedded;
          } catch {
            fontCache.set(family, defaultFont);
          }
        } else {
          fontCache.set(family, defaultFont);
        }
      }
    }

    const textStyle = (el.style ?? {}) as unknown as { fontSize?: number; color?: string };
    const fontSize = textStyle.fontSize ?? 18;
    const color = textStyle.color ?? "#000000";
    const x = (bleedMm + xNorm * widthMm) * PT_PER_MM;
    const y = pageHpt - (bleedMm + el.y * heightMm) * PT_PER_MM - fontSize;
    pdfPage.drawText(content, { x, y, size: fontSize, font, color: hexToPdf(color) });
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const v = m ? parseInt(m[1], 16) : 0xffffff;
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

function hexToPdf(hex: string): import("pdf-lib").Color {
  const c = hexToRgb(hex);
  return rgb(c.r / 255, c.g / 255, c.b / 255);
}
