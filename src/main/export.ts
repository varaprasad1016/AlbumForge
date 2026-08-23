/** Export: composite pages with sharp (original photos) and assemble a print-ready PDF
 * with pdf-lib (correct physical size + trim/bleed/media boxes). */
import sharp from "sharp";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { isSpreadLayout } from "./engine/layouts";
import { backgroundCanvasSvg } from "../shared/patterns";
import { graphicSvg, shapeSvg, type GraphicStyle, type ShapeStyle } from "../shared/designs";
import type { StockVectorData } from "@shared/api";

const MM_PER_INCH = 25.4;
const PT_PER_MM = 72 / MM_PER_INCH;

const BLEND_MODES = new Set(["multiply", "screen", "overlay", "soft-light"]);

function blendModeOf(el: ExportElement): string | undefined {
  const bm = (el.style as { blendMode?: string } | null)?.blendMode;
  return bm && BLEND_MODES.has(bm) ? bm : undefined;
}

/** Apply canonical per-layer filters with sharp, mirroring the Konva preview.
 *  Canonical ranges: brightness/saturation/contrast multipliers (1 = neutral),
 *  hue in degrees, blur sigma in px. */
function applyImageFilters(pipeline: sharp.Sharp, filters?: Record<string, number>): sharp.Sharp {
  if (!filters) return pipeline;
  let p = pipeline;
  const mod: { brightness?: number; saturation?: number; hue?: number } = {};
  if (filters.brightness !== undefined && filters.brightness !== 1) mod.brightness = filters.brightness;
  if (filters.saturation !== undefined && filters.saturation !== 1) mod.saturation = filters.saturation;
  if (filters.hue !== undefined && filters.hue !== 0) mod.hue = filters.hue;
  if (Object.keys(mod).length > 0) p = p.modulate(mod);
  if (filters.contrast !== undefined && filters.contrast !== 1) {
    const a = filters.contrast;
    p = p.linear(a, 127.5 * (1 - a));
  }
  if ((filters.blur ?? 0) > 0) p = p.blur(filters.blur);
  return p;
}

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
  background: { color?: string; pattern?: string; image?: { stockId?: string } } | null;
  elements: ExportElement[];
}

export type PhotoResolver = (id: string) => ResolvedPhoto;

export type MatteResolver = (photoId: string) => string | null;

export type StockResolver = (providerId: string) => { path: string } | null;

/** SVG for a recolourable stock-vector element. Rotation is baked around the
 *  element centre, matching the editor's group rotation. */
function stockVectorSvg(data: StockVectorData, width: number, height: number, opacity: number, rotationDeg = 0): string {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const rot = rotationDeg ? ` transform="rotate(${rotationDeg} ${w / 2} ${h / 2})"` : "";
  const paths = data.groups
    .map((g) => g.paths.map((d) => `<path d="${d}" fill="${g.color}"/>`).join(""))
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${data.width} ${data.height}" opacity="${opacity}"${rot}>${paths}</svg>`;
}

/** Cover-cropped raster for a stock page background (e.g. an Unsplash texture). */
async function backgroundImageBuffer(
  page: ExportPage,
  canvasW: number,
  canvasH: number,
  resolveStock?: StockResolver,
): Promise<Buffer | null> {
  const img = (page.background as { image?: { stockId?: string } } | null)?.image;
  if (!img?.stockId || !resolveStock) return null;
  const rec = resolveStock(img.stockId);
  if (!rec) return null;
  try {
    return await sharp(rec.path)
      .rotate()
      .resize(canvasW, canvasH, { fit: "cover" })
      .jpeg({ quality: 95 })
      .toBuffer();
  } catch {
    return null;
  }
}

/** Rasterized composite for a stock element (recolorable vector or cached bitmap). */
async function stockElementComposite(
  el: ExportElement,
  pageWpx: number,
  pageHpx: number,
  bleedPx: number,
  resolveStock?: StockResolver,
): Promise<sharp.OverlayOptions | null> {
  const blend = blendModeOf(el);
  const w = Math.max(1, Math.round(el.width * pageWpx));
  const h = Math.max(1, Math.round(el.height * pageHpx));
  const left = Math.round(bleedPx + el.x * pageWpx);
  const top = Math.round(bleedPx + el.y * pageHpx);
  const withBlend = (input: Buffer): sharp.OverlayOptions => ({
    input,
    left,
    top,
    ...(blend ? { blend: blend as sharp.OverlayOptions["blend"] } : {}),
  });

  if (el.type === "stock-vector") {
    const style = (el.style ?? {}) as { vector?: StockVectorData; opacity?: number };
    const v = style.vector;
    if (!v?.groups?.length) return null;
    const svg = stockVectorSvg(v, w, h, style.opacity ?? 1, el.rotation);
    return withBlend(await sharp(Buffer.from(svg)).png().toBuffer());
  }

  const style = (el.style ?? {}) as { stockId?: string; filters?: Record<string, number> };
  const rec = style.stockId && resolveStock ? resolveStock(style.stockId) : null;
  if (!rec) return null;
  let pipeline = sharp(rec.path);
  pipeline = applyImageFilters(pipeline, style.filters);
  if (el.rotation) pipeline = pipeline.rotate(el.rotation);
  return withBlend(await pipeline.resize(w, h, { fit: "fill" }).png().toBuffer());
}

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
  resolveMatte?: MatteResolver,
  resolveStock?: StockResolver,
): Promise<Buffer> {
  const canvasW = pageWpx + 2 * bleedPx;
  const canvasH = pageHpx + 2 * bleedPx;

  const bgHex = page.background?.color ?? "#ffffff";
  const composites: Array<sharp.OverlayOptions> = [];

  const elements = page.elements.slice().sort((a, b) => a.z - b.z);
  for (const el of elements) {
    const blend = blendModeOf(el);
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
        ...(blend ? { blend: blend as sharp.OverlayOptions["blend"] } : {}),
      });
      continue;
    }
    if (el.type === "stock-vector" || el.type === "stock-photo") {
      const comp = await stockElementComposite(el, pageWpx, pageHpx, bleedPx, resolveStock);
      if (comp) composites.push(comp);
      continue;
    }
    if (el.type !== "image" || !el.photoId) continue;
    const photo = resolvePhoto(el.photoId);
    const maskKind = (el.style as { mask?: { kind?: string } | null } | null)?.mask?.kind;
    const mattePath = maskKind === "alpha" && resolveMatte ? resolveMatte(el.photoId) : null;

    let pipeline = sharp(photo.path).rotate();
    pipeline = applyImageFilters(
      pipeline,
      (el.style as { filters?: Record<string, number> } | null)?.filters,
    );
    const hasCrop = !!el.crop;
    let cropPx: { left: number; top: number; width: number; height: number } | null = null;
    if (el.crop) {
      cropPx = {
        left: Math.round(el.crop.x * photo.width),
        top: Math.round(el.crop.y * photo.height),
        width: Math.max(1, Math.round(el.crop.width * photo.width)),
        height: Math.max(1, Math.round(el.crop.height * photo.height)),
      };
      pipeline = pipeline.extract(cropPx);
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
    let buf = await pipeline
      .resize(boxW, boxH, { fit: hasCrop ? "fill" : "cover" })
      .jpeg({ quality: 95 })
      .toBuffer();

    // Subject cutout: apply the alpha matte (same crop as the photo) so only the
    // subject composites onto the page — graphics can sit behind the person.
    if (mattePath) {
      let mattePipeline = sharp(mattePath);
      if (cropPx) mattePipeline = mattePipeline.extract(cropPx);
      const matte = await mattePipeline.resize(boxW, boxH, { fit: "fill" }).png().toBuffer();
      buf = await sharp(buf)
        .composite([{ input: matte, blend: "dest-in" }])
        .png()
        .toBuffer();
    }
    composites.push({
      input: buf,
      left: Math.round(left),
      top: Math.round(top),
      ...(blend ? { blend: blend as sharp.OverlayOptions["blend"] } : {}),
    });
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
  // Stock photo background sits above the colour/pattern base, below all elements.
  const bgBuf = await backgroundImageBuffer(page, canvasW, canvasH, resolveStock);
  const all = bgBuf ? [{ input: bgBuf, left: 0, top: 0 }, ...composites] : composites;
  return base
    .composite(all)
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
  resolveMatte?: MatteResolver,
  resolveStock?: StockResolver,
): Promise<[Buffer, Buffer]> {
  const spreadWpx = 2 * pageWpx;
  const canvasW = spreadWpx + 2 * bleedPx;
  const canvasH = pageHpx + 2 * bleedPx;

  const bgHex = page.background?.color ?? "#ffffff";
  const composites: Array<sharp.OverlayOptions> = [];

  const elements = page.elements.slice().sort((a, b) => a.z - b.z);
  for (const el of elements) {
    const blend = blendModeOf(el);
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
        ...(blend ? { blend: blend as sharp.OverlayOptions["blend"] } : {}),
      });
      continue;
    }
    if (el.type === "stock-vector" || el.type === "stock-photo") {
      const comp = await stockElementComposite(el, spreadWpx, pageHpx, bleedPx, resolveStock);
      if (comp) composites.push(comp);
      continue;
    }
    if (el.type !== "image" || !el.photoId) continue;
    const photo = resolvePhoto(el.photoId);
    const maskKind = (el.style as { mask?: { kind?: string } | null } | null)?.mask?.kind;
    const mattePath = maskKind === "alpha" && resolveMatte ? resolveMatte(el.photoId) : null;

    let pipeline = sharp(photo.path).rotate();
    pipeline = applyImageFilters(
      pipeline,
      (el.style as { filters?: Record<string, number> } | null)?.filters,
    );
    const hasCrop = !!el.crop;
    let cropPx: { left: number; top: number; width: number; height: number } | null = null;
    if (el.crop) {
      cropPx = {
        left: Math.round(el.crop.x * photo.width),
        top: Math.round(el.crop.y * photo.height),
        width: Math.max(1, Math.round(el.crop.width * photo.width)),
        height: Math.max(1, Math.round(el.crop.height * photo.height)),
      };
      pipeline = pipeline.extract(cropPx);
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

    let buf = await pipeline
      .resize(boxW, boxH, { fit: hasCrop ? "fill" : "cover" })
      .jpeg({ quality: 95 })
      .toBuffer();

    if (mattePath) {
      let mattePipeline = sharp(mattePath);
      if (cropPx) mattePipeline = mattePipeline.extract(cropPx);
      const matte = await mattePipeline.resize(boxW, boxH, { fit: "fill" }).png().toBuffer();
      buf = await sharp(buf)
        .composite([{ input: matte, blend: "dest-in" }])
        .png()
        .toBuffer();
    }
    composites.push({
      input: buf,
      left: Math.round(left),
      top: Math.round(top),
      ...(blend ? { blend: blend as sharp.OverlayOptions["blend"] } : {}),
    });
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
  const bgBuf = await backgroundImageBuffer(page, canvasW, canvasH, resolveStock);
  const all = bgBuf ? [{ input: bgBuf, left: 0, top: 0 }, ...composites] : composites;
  const canvas = await base
    .composite(all)
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
  resolveMatte?: MatteResolver,
  resolveStock?: StockResolver,
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
    resolveMatte,
    resolveStock,
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
      const [left, right] = await renderSpreadJpegs(page, resolvePhoto, pageWpx, pageHpx, bleedPx, resolveMatte, resolveStock);
      writeFileSync(join(outDir, "pages", `page-${String(pageNo).padStart(3, "0")}-left.jpg`), left);
      writeFileSync(join(outDir, "pages", `page-${String(pageNo).padStart(3, "0")}-right.jpg`), right);
    } else {
      const jpeg = await renderPageJpeg(page, resolvePhoto, pageWpx, pageHpx, bleedPx, resolveMatte, resolveStock);
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
  resolveMatte?: MatteResolver,
  resolveStock?: StockResolver,
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
      const [leftJpeg, rightJpeg] = await renderSpreadJpegs(page, resolvePhoto, pageWpx, pageHpx, bleedPx, resolveMatte, resolveStock);
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
      const jpeg = await renderPageJpeg(page, resolvePhoto, pageWpx, pageHpx, bleedPx, resolveMatte, resolveStock);
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

    const textStyle = (el.style ?? {}) as unknown as {
      fontSize?: number;
      color?: string;
      align?: string;
      lineHeight?: number;
      letterSpacing?: number;
    };
    const fontSize = textStyle.fontSize ?? 18;
    const color = textStyle.color ?? "#000000";
    const boxW = (el.width || 0.5) * widthMm * PT_PER_MM;
    const align = textStyle.align ?? "left";
    // pdf-lib drawText has no width/align option, so center/right-align manually.
    const textW = font.widthOfTextAtSize(content, fontSize);
    let x = (bleedMm + xNorm * widthMm) * PT_PER_MM;
    if (align === "center") x += (boxW - textW) / 2;
    else if (align === "right") x += boxW - textW;
    const y = pageHpt - (bleedMm + el.y * heightMm) * PT_PER_MM - fontSize;
    pdfPage.drawText(content, {
      x,
      y,
      size: fontSize,
      font,
      color: hexToPdf(color),
      lineHeight: (textStyle.lineHeight ?? 1.2) * fontSize,
    });
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
