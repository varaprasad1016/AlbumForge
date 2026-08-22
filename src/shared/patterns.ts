/** Page background patterns — subtle print-safe tiles shared by the editor
 * preview and the export pipeline. Each pattern is an SVG fragment rendered
 * inside an SVG <pattern> tile (print: very low opacity, safe on any stock). */

export interface PagePattern {
  id: string;
  name: string;
  tileW: number;
  tileH: number;
  shapes: string;
}

export const PAGE_PATTERNS: PagePattern[] = [
  {
    id: "dots",
    name: "Soft dots",
    tileW: 40,
    tileH: 40,
    shapes: `<circle cx="20" cy="20" r="3" fill="#0f172a" fill-opacity="0.06"/>`,
  },
  {
    id: "diag",
    name: "Diagonal lines",
    tileW: 32,
    tileH: 32,
    shapes: `<path d="M0 32 L32 0" stroke="#0f172a" stroke-opacity="0.05" stroke-width="1"/>`,
  },
  {
    id: "grid",
    name: "Faint grid",
    tileW: 64,
    tileH: 64,
    shapes: `<path d="M64 0 H0 V64" fill="none" stroke="#0f172a" stroke-opacity="0.05" stroke-width="1"/>`,
  },
  {
    id: "chevron",
    name: "Chevron",
    tileW: 48,
    tileH: 48,
    shapes: `<path d="M0 12 L24 36 L48 12" fill="none" stroke="#0f172a" stroke-opacity="0.07" stroke-width="2"/>`,
  },
  {
    id: "stars",
    name: "Subtle stars",
    tileW: 80,
    tileH: 80,
    shapes: `<path d="M40 12 L44 36 L68 40 L44 44 L40 68 L36 44 L12 40 L36 36 Z" fill="#0f172a" fill-opacity="0.07"/>`,
  },
  {
    id: "damask",
    name: "Damask flourish",
    tileW: 96,
    tileH: 96,
    shapes: `<g fill="none" stroke="#0f172a" stroke-opacity="0.08" stroke-width="1.5"><circle cx="48" cy="48" r="18"/><path d="M48 22 L52 40 L70 44 L52 52 L48 70 L44 52 L26 44 L44 40 Z"/><circle cx="0" cy="0" r="8"/><circle cx="96" cy="0" r="8"/><circle cx="0" cy="96" r="8"/><circle cx="96" cy="96" r="8"/></g>`,
  },
];

export function findPattern(id: string | null | undefined): PagePattern | undefined {
  if (!id) return undefined;
  return PAGE_PATTERNS.find((p) => p.id === id);
}

/** Data URI of the pattern tile (editor preview + canvas fill). */
export function patternDataUri(id: string | null | undefined): string | null {
  const p = findPattern(id);
  if (!p) return null;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${p.tileW}" height="${p.tileH}" viewBox="0 0 ${p.tileW} ${p.tileH}">${p.shapes}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Full-canvas SVG (background color + tiled pattern) for rasterization in the
 * export pipeline. */
export function backgroundCanvasSvg(
  patternId: string | null | undefined,
  color: string,
  width: number,
  height: number,
): string {
  const p = findPattern(patternId);
  if (!p) return "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${color}"/>
  <defs><pattern id="afp" patternUnits="userSpaceOnUse" width="${p.tileW}" height="${p.tileH}">${p.shapes}</pattern></defs>
  <rect width="100%" height="100%" fill="url(#afp)"/>
</svg>`;
}
