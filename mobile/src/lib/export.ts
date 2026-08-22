/** Export: Canvas-based page compositing + pdf-lib assembly (mobile). */
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import { isSpreadLayout } from "./engine/layouts";
import { patternDataUri } from "./patterns";
import { findGraphic, type GraphicStyle, type ShapeStyle } from "./designs";

const MM_PER_INCH = 25.4;
const PT_PER_MM = 72 / MM_PER_INCH;

export interface ResolvedPhoto {
  image: HTMLImageElement;
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
  style: { color?: string; fontSize?: number; fontFamily?: string } | null;
  z: number;
}

export interface ExportPage {
  layoutKey: string | null;
  background: { color?: string; pattern?: string } | null;
  elements: ExportElement[];
}

export type PhotoResolver = (id: string) => Promise<ResolvedPhoto>;

async function drawBackground(
  ctx: CanvasRenderingContext2D,
  background: { color?: string; pattern?: string } | null,
  width: number,
  height: number,
): Promise<void> {
  ctx.fillStyle = background?.color ?? "#ffffff";
  ctx.fillRect(0, 0, width, height);
  const uri = patternDataUri(background?.pattern ?? null);
  if (!uri) return;
  try {
    const img = new Image();
    img.src = uri;
    await new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
    });
    const pattern = ctx.createPattern(img, "repeat");
    if (pattern) {
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, width, height);
    }
  } catch {
    /* pattern is decorative */
  }
}

function drawVectorElement(
  ctx: CanvasRenderingContext2D,
  el: ExportElement,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): void {
  ctx.save();
  ctx.translate(bx + bw / 2, by + bh / 2);
  if (el.rotation) ctx.rotate((el.rotation * Math.PI) / 180);
  ctx.translate(-bw / 2, -bh / 2);
  ctx.globalAlpha = 1;

  if (el.type === "shape") {
    const s = (el.style ?? {}) as ShapeStyle;
    ctx.globalAlpha = s.opacity ?? 1;
    ctx.fillStyle = s.fill && s.fill !== "none" ? s.fill : "rgba(0,0,0,0)";
    ctx.strokeStyle = s.stroke && s.stroke !== "none" ? s.stroke : "#0f172a";
    ctx.lineWidth = Math.max(1, s.strokeWidth ?? 2);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (s.shape === "ellipse") {
      ctx.beginPath();
      ctx.ellipse(bw / 2, bh / 2, Math.max(0.5, bw / 2 - ctx.lineWidth / 2), Math.max(0.5, bh / 2 - ctx.lineWidth / 2), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (s.shape === "line") {
      ctx.beginPath();
      ctx.moveTo(ctx.lineWidth / 2, bh / 2);
      ctx.lineTo(bw - ctx.lineWidth / 2, bh / 2);
      ctx.stroke();
    } else if (s.shape === "arrow") {
      const head = Math.min(14, bh, bw);
      ctx.beginPath();
      ctx.moveTo(ctx.lineWidth / 2, bh / 2);
      ctx.lineTo(bw - head, bh / 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(bw - head, bh / 2 - head / 2);
      ctx.lineTo(bw - ctx.lineWidth / 2, bh / 2);
      ctx.lineTo(bw - head, bh / 2 + head / 2);
      ctx.closePath();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
    } else if (s.shape === "star") {
      const cx = bw / 2;
      const cy = bh / 2;
      const rO = Math.min(bw, bh) / 2 - ctx.lineWidth / 2;
      const rI = rO * 0.42;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? rO : rI;
        const a = (Math.PI / 5) * i - Math.PI / 2;
        if (i === 0) ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
        else ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      const r = Math.min(s.radius ?? 0, bw / 2, bh / 2);
      ctx.beginPath();
      if (typeof (ctx as CanvasRenderingContext2D & { roundRect?: unknown }).roundRect === "function") {
        (ctx as CanvasRenderingContext2D & { roundRect: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect(
          ctx.lineWidth / 2, ctx.lineWidth / 2, Math.max(1, bw - ctx.lineWidth), Math.max(1, bh - ctx.lineWidth), r,
        );
      } else {
        ctx.rect(ctx.lineWidth / 2, ctx.lineWidth / 2, Math.max(1, bw - ctx.lineWidth), Math.max(1, bh - ctx.lineWidth));
      }
      ctx.fill();
      ctx.stroke();
    }
  } else if (el.type === "graphic") {
    const gs = (el.style ?? {}) as GraphicStyle;
    const g = findGraphic(gs.graphicId);
    ctx.globalAlpha = gs.opacity ?? 1;
    if (!g) {
      ctx.restore();
      return;
    }
    const color = gs.color ?? "#0f172a";
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, bw / 80);
    ctx.save();
    ctx.scale(bw / g.w, bh / g.h);
    for (const p of g.paths) {
      const path = new Path2D(p.d);
      if (p.mode === "stroke") {
        ctx.stroke(path);
      } else {
        ctx.fill(path);
      }
    }
    ctx.restore();
  }
  ctx.restore();
}

async function renderPageJpeg(
  page: ExportPage,
  resolvePhoto: PhotoResolver,
  pageWpx: number,
  pageHpx: number,
  bleedPx: number,
): Promise<string> {
  const canvasW = pageWpx + 2 * bleedPx;
  const canvasH = pageHpx + 2 * bleedPx;
  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d")!;
  await drawBackground(ctx, page.background, canvasW, canvasH);

  const elements = page.elements.slice().sort((a, b) => a.z - b.z);
  for (const el of elements) {
    if (el.type === "shape" || el.type === "graphic") {
      drawVectorElement(
        ctx,
        el,
        bleedPx + el.x * pageWpx,
        bleedPx + el.y * pageHpx,
        el.width * pageWpx,
        el.height * pageHpx,
      );
      continue;
    }
    if (el.type !== "image" || !el.photoId) continue;
    const { image } = await resolvePhoto(el.photoId);

    let sx = 0;
    let sy = 0;
    let sw = image.naturalWidth;
    let sh = image.naturalHeight;
    if (el.crop) {
      sx = el.crop.x * image.naturalWidth;
      sy = el.crop.y * image.naturalHeight;
      sw = el.crop.width * image.naturalWidth;
      sh = el.crop.height * image.naturalHeight;
    }

    let bx = bleedPx + el.x * pageWpx;
    let by = bleedPx + el.y * pageHpx;
    let bw = el.width * pageWpx;
    let bh = el.height * pageHpx;
    // Extend into the outer bleed only on edges the element actually touches
    // (keeps the gutter clean on spread canvases).
    if (el.x <= 0.001) {
      bx -= bleedPx;
      bw += bleedPx;
    }
    if (el.x + el.width >= 0.999) bw += bleedPx;
    if (el.y <= 0.001) {
      by -= bleedPx;
      bh += bleedPx;
    }
    if (el.y + el.height >= 0.999) bh += bleedPx;

    const cx = bx + bw / 2;
    const cy = by + bh / 2;
    ctx.save();
    ctx.translate(cx, cy);
    if (el.rotation) ctx.rotate((el.rotation * Math.PI) / 180);
    ctx.drawImage(image, sx, sy, sw, sh, -bw / 2, -bh / 2, bw, bh);
    ctx.restore();
  }

  return canvas.toDataURL("image/jpeg", 0.95);
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.split(",")[1];
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function renderSpreadCanvas(
  page: ExportPage,
  resolvePhoto: PhotoResolver,
  pageWpx: number,
  pageHpx: number,
  bleedPx: number,
): Promise<HTMLCanvasElement> {
  const spreadWpx = 2 * pageWpx;
  const canvasW = spreadWpx + 2 * bleedPx;
  const canvasH = pageHpx + 2 * bleedPx;
  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d")!;
  await drawBackground(ctx, page.background, canvasW, canvasH);

  const elements = page.elements.slice().sort((a, b) => a.z - b.z);
  for (const el of elements) {
    if (el.type === "shape" || el.type === "graphic") {
      drawVectorElement(
        ctx,
        el,
        bleedPx + el.x * spreadWpx,
        bleedPx + el.y * pageHpx,
        el.width * spreadWpx,
        el.height * pageHpx,
      );
      continue;
    }
    if (el.type !== "image" || !el.photoId) continue;
    const { image } = await resolvePhoto(el.photoId);

    let sx = 0;
    let sy = 0;
    let sw = image.naturalWidth;
    let sh = image.naturalHeight;
    if (el.crop) {
      sx = el.crop.x * image.naturalWidth;
      sy = el.crop.y * image.naturalHeight;
      sw = el.crop.width * image.naturalWidth;
      sh = el.crop.height * image.naturalHeight;
    }

    let bx = bleedPx + el.x * spreadWpx;
    let by = bleedPx + el.y * pageHpx;
    let bw = el.width * spreadWpx;
    let bh = el.height * pageHpx;
    if (el.x <= 0.001) {
      bx -= bleedPx;
      bw += bleedPx;
    }
    if (el.x + el.width >= 0.999) bw += bleedPx;
    if (el.y <= 0.001) {
      by -= bleedPx;
      bh += bleedPx;
    }
    if (el.y + el.height >= 0.999) bh += bleedPx;

    const cx = bx + bw / 2;
    const cy = by + bh / 2;
    ctx.save();
    ctx.translate(cx, cy);
    if (el.rotation) ctx.rotate((el.rotation * Math.PI) / 180);
    ctx.drawImage(image, sx, sy, sw, sh, -bw / 2, -bh / 2, bw, bh);
    ctx.restore();
  }

  return canvas;
}

export async function buildPdf(
  pages: ExportPage[],
  resolvePhoto: PhotoResolver,
  resolveFont: (family: string) => Promise<Uint8Array | null>,
  widthMm: number,
  heightMm: number,
  dpi = 300,
  bleedMm = 3,
  watermark?: string,
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

  for (const page of pages) {
    if (isSpreadLayout(page.layoutKey)) {
      const spreadCanvas = await renderSpreadCanvas(page, resolvePhoto, pageWpx, pageHpx, bleedPx);
      const halfW = pageWpx + bleedPx;
      for (const half of ["left", "right"] as const) {
        const isRight = half === "right";
        const halfCanvas = document.createElement("canvas");
        halfCanvas.width = halfW;
        halfCanvas.height = spreadCanvas.height;
        const hctx = halfCanvas.getContext("2d")!;
        hctx.drawImage(
          spreadCanvas,
          isRight ? halfW : 0, 0, halfW, spreadCanvas.height,
          0, 0, halfW, halfCanvas.height,
        );
        const img = await doc.embedJpg(dataUrlToBytes(halfCanvas.toDataURL("image/jpeg", 0.95)));

        const pdfPage = doc.addPage([mediaWmm * PT_PER_MM, mediaHmm * PT_PER_MM]);
        pdfPage.drawImage(img, {
          x: isRight ? bleedMm * PT_PER_MM : 0,
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

        await drawTextElements(doc, pdfPage, page, defaultFont, fontCache, resolveFont, widthMm, heightMm, bleedMm, half);
        if (watermark) drawWatermark(pdfPage, defaultFont, watermark, mediaWmm, mediaHmm);
      }
    } else {
      const jpeg = await renderPageJpeg(page, resolvePhoto, pageWpx, pageHpx, bleedPx);
      const img = await doc.embedJpg(dataUrlToBytes(jpeg));

      const pdfPage = doc.addPage([mediaWmm * PT_PER_MM, mediaHmm * PT_PER_MM]);
      pdfPage.drawImage(img, { x: 0, y: 0, width: mediaWmm * PT_PER_MM, height: mediaHmm * PT_PER_MM });
      pdfPage.setMediaBox(0, 0, mediaWmm * PT_PER_MM, mediaHmm * PT_PER_MM);
      pdfPage.setBleedBox(0, 0, mediaWmm * PT_PER_MM, mediaHmm * PT_PER_MM);
      pdfPage.setTrimBox(
        bleedMm * PT_PER_MM,
        bleedMm * PT_PER_MM,
        (bleedMm + widthMm) * PT_PER_MM,
        (bleedMm + heightMm) * PT_PER_MM,
      );

      await drawTextElements(doc, pdfPage, page, defaultFont, fontCache, resolveFont, widthMm, heightMm, bleedMm);
      if (watermark) drawWatermark(pdfPage, defaultFont, watermark, mediaWmm, mediaHmm);
    }
  }

  return doc.save();
}

async function drawTextElements(
  doc: import("pdf-lib").PDFDocument,
  pdfPage: import("pdf-lib").PDFPage,
  page: ExportPage,
  defaultFont: import("pdf-lib").PDFFont,
  fontCache: Map<string, import("pdf-lib").PDFFont>,
  resolveFont: (family: string) => Promise<Uint8Array | null>,
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
        const bytes = await resolveFont(family);
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

    const fontSize = el.style?.fontSize ?? 18;
    const color = el.style?.color ?? "#000000";
    const x = (bleedMm + xNorm * widthMm) * PT_PER_MM;
    const y = pageHpt - (bleedMm + el.y * heightMm) * PT_PER_MM - fontSize;
    pdfPage.drawText(content, { x, y, size: fontSize, font, color: hexToPdf(color) });
  }
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

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const v = m ? parseInt(m[1], 16) : 0xffffff;
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

function hexToPdf(hex: string): import("pdf-lib").Color {
  const c = hexToRgb(hex);
  return rgb(c.r / 255, c.g / 255, c.b / 255);
}
