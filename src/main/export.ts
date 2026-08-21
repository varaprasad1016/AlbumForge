/** Export: composite pages with sharp (original photos) and assemble a print-ready PDF
 * with pdf-lib (correct physical size + trim/bleed/media boxes). */
import sharp from "sharp";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";

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
  style: { color?: string; fontSize?: number } | null;
  z: number;
}

export interface ExportPage {
  layoutKey: string | null;
  background: { color?: string } | null;
  elements: ExportElement[];
}

export type PhotoResolver = (id: string) => ResolvedPhoto;

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

    if (el.width >= 0.99 && el.height >= 0.99) {
      left -= bleedPx;
      top -= bleedPx;
      boxW += 2 * bleedPx;
      boxH += 2 * bleedPx;
    }

    // With an explicit crop the aspect already matches, so fill exactly. Without a crop,
    // cover (center-crop to fill) prevents distortion.
    const buf = await pipeline
      .resize(boxW, boxH, { fit: hasCrop ? "fill" : "cover" })
      .jpeg({ quality: 95 })
      .toBuffer();
    composites.push({ input: buf, left: Math.round(left), top: Math.round(top) });
  }

  return sharp({
    create: {
      width: canvasW,
      height: canvasH,
      channels: 3,
      background: hexToRgb(bgHex),
    },
  })
    .composite(composites)
    .jpeg({ quality: 95 })
    .toBuffer();
}

export async function buildPdf(
  pages: ExportPage[],
  resolvePhoto: PhotoResolver,
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
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (const page of pages) {
    const jpeg = await renderPageJpeg(page, resolvePhoto, pageWpx, pageHpx, bleedPx);
    const img = await doc.embedJpg(jpeg);

    const pdfPage = doc.addPage([mediaWmm * PT_PER_MM, mediaHmm * PT_PER_MM]);
    pdfPage.drawImage(img, {
      x: 0,
      y: 0,
      width: mediaWmm * PT_PER_MM,
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

    drawTextElements(pdfPage, page, font, widthMm, heightMm, bleedMm);
    if (watermark) drawWatermark(pdfPage, font, watermark, mediaWmm, mediaHmm);
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

function drawTextElements(
  pdfPage: import("pdf-lib").PDFPage,
  page: ExportPage,
  font: import("pdf-lib").PDFFont,
  widthMm: number,
  heightMm: number,
  bleedMm: number,
): void {
  const pageHpt = (heightMm + 2 * bleedMm) * PT_PER_MM;
  for (const el of page.elements) {
    if (el.type !== "text") continue;
    const content = el.text?.content;
    if (!content) continue;
    const fontSize = el.style?.fontSize ?? 18;
    const color = el.style?.color ?? "#000000";
    const x = (bleedMm + el.x * widthMm) * PT_PER_MM;
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
