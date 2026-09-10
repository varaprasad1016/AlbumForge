/** Export: composite pages with sharp (original photos) and assemble a print-ready PDF
 * with pdf-lib (correct physical size + trim/bleed/media boxes). */
import sharp from "sharp";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { isSpreadLayout } from "../shared/engine/layouts";
import { backgroundCanvasSvg } from "../shared/patterns";
import { graphicSvg, shapeMaskSvg, shapeSvg, type GraphicStyle, type ShapeStyle } from "../shared/designs";
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

/** Shapes that can frame a photo (Canva-style drop target). Line/arrow are open
 *  paths and cannot clip a photo — they stay plain shapes. */
const FRAME_SHAPES = new Set(["rect", "ellipse", "star"]);

function shapeFrameKind(style: unknown): string | null {
  const shape = (style as { shape?: string } | null)?.shape;
  return shape && FRAME_SHAPES.has(shape) ? shape : null;
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

/** Rotate a finished (unrotated) boxW×boxH RGBA tile about the box's TOP-LEFT
 *  corner by `deg` and return a sharp composite placed to land exactly where the
 *  editor shows it. The Konva group pivots at its origin (top-left); sharp
 *  rotates about the tile centre and expands to the rotated bounding box, so we
 *  map the box centre through the same rotation and offset by half the rotated
 *  size. Returns null when the rotated tile falls entirely off the canvas. */
async function placeRotated(
  tile: Buffer,
  boxW: number,
  boxH: number,
  deg: number,
  boxLeft: number,
  boxTop: number,
  blend?: string,
): Promise<sharp.OverlayOptions | null> {
  const rotated = await sharp(tile)
    .rotate(deg, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const meta = await sharp(rotated).metadata();
  const outW = meta.width ?? boxW;
  const outH = meta.height ?? boxH;
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // Page position of the box centre after rotating about the top-left corner.
  const cx = boxLeft + (boxW / 2) * cos - (boxH / 2) * sin;
  const cy = boxTop + (boxW / 2) * sin + (boxH / 2) * cos;
  let left = Math.round(cx - outW / 2);
  let top = Math.round(cy - outH / 2);
  // sharp's composite offset must be non-negative; clip the tile where it spills
  // past the top/left canvas edges (right/bottom overflow sharp clips itself).
  let src = rotated;
  let ex = 0;
  let ey = 0;
  let cw = outW;
  let ch = outH;
  if (left < 0) {
    ex = -left;
    cw = outW + left;
    left = 0;
  }
  if (top < 0) {
    ey = -top;
    ch = outH + top;
    top = 0;
  }
  if (cw <= 0 || ch <= 0) return null;
  if (ex > 0 || ey > 0 || cw !== outW || ch !== outH) {
    src = await sharp(rotated).extract({ left: ex, top: ey, width: cw, height: ch }).png().toBuffer();
  }
  return { input: src, left, top, ...(blend ? { blend: blend as sharp.OverlayOptions["blend"] } : {}) };
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
    // Plain vector shapes/graphics. A shape carrying a photo is a Canva-style
    // photo FRAME, not a plain vector — it must fall through to the frame block
    // below (otherwise it renders as an empty outline with no photo).
    const isPhotoFrame = el.type === "shape" && !!el.photoId && !!shapeFrameKind(el.style);
    if ((el.type === "shape" && !isPhotoFrame) || el.type === "graphic") {
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
    // Canva-style photo frame: a shape element carrying a photo renders the
    // cover-cropped photo clipped to the shape silhouette, then the stroke on
    // top (the stroke is the shape's own SVG with fill:none).
    if (el.type === "shape" && el.photoId && shapeFrameKind(el.style)) {
      const w = Math.max(1, Math.round(el.width * pageWpx));
      const h = Math.max(1, Math.round(el.height * pageHpx));
      const style = (el.style ?? {}) as unknown as ShapeStyle;
      const photo = resolvePhoto(el.photoId);
      if (el.rotation) {
        // Rotated frame: build the UNrotated tile (cover-crop → silhouette mask
        // → stroke) at box size, then rotate the whole tile about the box's
        // top-left corner exactly like the Konva group on screen — no photo
        // pre-rotation, no squish, no rotation-baked mask/corner loss.
        const maskUnrot = shapeMaskSvg(style, w, h, 0);
        if (!photo || !maskUnrot) continue;
        const frameFilters = (el.style as { filters?: Record<string, number> | null } | null)?.filters ?? undefined;
        let fp = applyImageFilters(sharp(photo.path).rotate(), frameFilters);
        if (el.crop) {
          fp = fp.extract({
            left: Math.round(el.crop.x * photo.width),
            top: Math.round(el.crop.y * photo.height),
            width: Math.max(1, Math.round(el.crop.width * photo.width)),
            height: Math.max(1, Math.round(el.crop.height * photo.height)),
          });
        }
        const photoBuf = await fp.resize(w, h, { fit: el.crop ? "fill" : "cover" }).png().toBuffer();
        // Mask in its OWN composite (dest-in must not share a composite() call
        // with the stroke — chaining dest-in with a later 'over' drops the photo),
        // then lay the silhouette stroke over the masked photo as a second pass.
        const maskPng = await sharp(Buffer.from(maskUnrot)).png().toBuffer();
        let tile = await sharp(photoBuf).composite([{ input: maskPng, blend: "dest-in" }]).png().toBuffer();
        if (!!style.strokeWidth && style.strokeWidth > 0 && style.stroke !== "none") {
          const outline = shapeSvg({ ...style, fill: "none" }, w, h, 0);
          const outlinePng = await sharp(Buffer.from(outline)).resize(w, h, { fit: "fill" }).png().toBuffer();
          tile = await sharp(tile).composite([{ input: outlinePng }]).png().toBuffer();
        }
        const rc = await placeRotated(tile, w, h, el.rotation, bleedPx + el.x * pageWpx, bleedPx + el.y * pageHpx, blend);
        if (rc) composites.push(rc);
        continue;
      }
      const maskSvg = shapeMaskSvg(style, w, h, el.rotation);
      if (!photo || !maskSvg) continue;

      let pipeline = sharp(photo.path).rotate();
      pipeline = applyImageFilters(
        pipeline,
        (el.style as { filters?: Record<string, number> | null } | null)?.filters ?? undefined,
      );
      const hasCrop = !!el.crop;
      if (el.crop) {
        pipeline = pipeline.extract({
          left: Math.round(el.crop.x * photo.width),
          top: Math.round(el.crop.y * photo.height),
          width: Math.max(1, Math.round(el.crop.width * photo.width)),
          height: Math.max(1, Math.round(el.crop.height * photo.height)),
        });
      }
      if (el.rotation) pipeline = pipeline.rotate(el.rotation);

      const photoBuf = await pipeline
        .resize(w, h, { fit: hasCrop ? "fill" : "cover" })
        .png()
        .toBuffer();
      const maskPng = await sharp(Buffer.from(maskSvg)).png().toBuffer();
      const masked = await sharp(photoBuf)
        .composite([{ input: maskPng, blend: "dest-in" }])
        .png()
        .toBuffer();

      // Bleed extension mirrors the plain-image path (page-touching edges only;
      // the frame sits inside the box, then is padded out to the bleed box).
      let left = bleedPx + el.x * pageWpx;
      let top = bleedPx + el.y * pageHpx;
      let boxW = w;
      let boxH = h;
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
      const padL = Math.max(0, Math.round(bleedPx + el.x * pageWpx - left));
      const padT = Math.max(0, Math.round(bleedPx + el.y * pageHpx - top));

      composites.push({
        input: await sharp(masked)
          .extend({
            left: padL,
            top: padT,
            right: Math.max(0, boxW - w - padL),
            bottom: Math.max(0, boxH - h - padT),
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .png()
          .toBuffer(),
        left: Math.round(left),
        top: Math.round(top),
        ...(blend ? { blend: blend as sharp.OverlayOptions["blend"] } : {}),
      });
      const strokeOnly = !!style.strokeWidth && style.strokeWidth > 0 && style.stroke !== "none";
      if (strokeOnly) {
        const outlineSvg = shapeSvg({ ...style, fill: "none" }, w, h, el.rotation);
        composites.push({
          input: await sharp(Buffer.from(outlineSvg)).resize(boxW, boxH, { fit: "fill" }).png().toBuffer(),
          left: Math.round(left),
          top: Math.round(top),
        });
      }
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
      // Rotated image: build the unrotated cover/fill tile at box size, then
      // rotate the whole tile about the box top-left (screen parity) instead of
      // pre-rotating the photo and squishing it into an upright box.
      const rBoxW = Math.max(1, Math.round(el.width * pageWpx));
      const rBoxH = Math.max(1, Math.round(el.height * pageHpx));
      let tile = await pipeline.resize(rBoxW, rBoxH, { fit: hasCrop ? "fill" : "cover" }).png().toBuffer();
      if (mattePath) {
        let mattePipeline = sharp(mattePath);
        if (cropPx) mattePipeline = mattePipeline.extract(cropPx);
        const matte = await mattePipeline.resize(rBoxW, rBoxH, { fit: "fill" }).png().toBuffer();
        tile = await sharp(tile).composite([{ input: matte, blend: "dest-in" }]).png().toBuffer();
      }
      const rc = await placeRotated(tile, rBoxW, rBoxH, el.rotation, bleedPx + el.x * pageWpx, bleedPx + el.y * pageHpx, blend);
      if (rc) composites.push(rc);
      continue;
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
    const isPhotoFrame = el.type === "shape" && !!el.photoId && !!shapeFrameKind(el.style);
    if ((el.type === "shape" && !isPhotoFrame) || el.type === "graphic") {
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
    // Canva-style photo frame on a spread (silhouette-masked photo + stroke,
    // rotated as one tile). Mirrors the single-page frame path with spreadWpx.
    if (isPhotoFrame) {
      const w = Math.max(1, Math.round(el.width * spreadWpx));
      const h = Math.max(1, Math.round(el.height * pageHpx));
      const style = (el.style ?? {}) as unknown as ShapeStyle;
      const photo = resolvePhoto(el.photoId!);
      const maskUnrot = shapeMaskSvg(style, w, h, 0);
      if (!photo || !maskUnrot) continue;
      const frameFilters = (el.style as { filters?: Record<string, number> | null } | null)?.filters ?? undefined;
      let fp = applyImageFilters(sharp(photo.path).rotate(), frameFilters);
      if (el.crop) {
        fp = fp.extract({
          left: Math.round(el.crop.x * photo.width),
          top: Math.round(el.crop.y * photo.height),
          width: Math.max(1, Math.round(el.crop.width * photo.width)),
          height: Math.max(1, Math.round(el.crop.height * photo.height)),
        });
      }
      const photoBuf = await fp.resize(w, h, { fit: el.crop ? "fill" : "cover" }).png().toBuffer();
      const maskPng = await sharp(Buffer.from(maskUnrot)).png().toBuffer();
      let tile = await sharp(photoBuf).composite([{ input: maskPng, blend: "dest-in" }]).png().toBuffer();
      if (!!style.strokeWidth && style.strokeWidth > 0 && style.stroke !== "none") {
        const outline = shapeSvg({ ...style, fill: "none" }, w, h, 0);
        const outlinePng = await sharp(Buffer.from(outline)).resize(w, h, { fit: "fill" }).png().toBuffer();
        tile = await sharp(tile).composite([{ input: outlinePng }]).png().toBuffer();
      }
      const boxLeft = bleedPx + el.x * spreadWpx;
      const boxTop = bleedPx + el.y * pageHpx;
      if (el.rotation) {
        const rc = await placeRotated(tile, w, h, el.rotation, boxLeft, boxTop, blend);
        if (rc) composites.push(rc);
      } else {
        composites.push({
          input: tile,
          left: Math.round(boxLeft),
          top: Math.round(boxTop),
          ...(blend ? { blend: blend as sharp.OverlayOptions["blend"] } : {}),
        });
      }
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
      // Rotated image on a spread: rotate the finished box tile about its
      // top-left (screen parity), not the source photo squished into an
      // upright box. Same model as the single-page path with spreadWpx.
      const rBoxW = Math.max(1, Math.round(el.width * spreadWpx));
      const rBoxH = Math.max(1, Math.round(el.height * pageHpx));
      let tile = await pipeline.resize(rBoxW, rBoxH, { fit: hasCrop ? "fill" : "cover" }).png().toBuffer();
      if (mattePath) {
        let mattePipeline = sharp(mattePath);
        if (cropPx) mattePipeline = mattePipeline.extract(cropPx);
        const matte = await mattePipeline.resize(rBoxW, rBoxH, { fit: "fill" }).png().toBuffer();
        tile = await sharp(tile).composite([{ input: matte, blend: "dest-in" }]).png().toBuffer();
      }
      const rc = await placeRotated(tile, rBoxW, rBoxH, el.rotation, bleedPx + el.x * spreadWpx, bleedPx + el.y * pageHpx, blend);
      if (rc) composites.push(rc);
      continue;
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
