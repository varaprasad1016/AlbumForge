/** Vector design library — shapes and clip-art graphics shared by the editor
 * (Konva) and the export pipeline (SVG rasterization / canvas). All art is
 * single-color so it can be tinted per element. */

export interface GraphicPath {
  d: string;
  mode?: "fill" | "stroke";
}

export interface GraphicDef {
  id: string;
  name: string;
  w: number;
  h: number;
  paths: GraphicPath[];
}

export const GRAPHICS: GraphicDef[] = [
  {
    id: "heart",
    name: "Heart",
    w: 100,
    h: 92,
    paths: [{ d: "M50 88 C20 62 2 44 2 24 C2 10 12 2 24 2 C33 2 42 8 50 18 C58 8 67 2 76 2 C88 2 98 10 98 24 C98 44 80 62 50 88 Z", mode: "fill" }],
  },
  {
    id: "rings",
    name: "Wedding rings",
    w: 100,
    h: 64,
    paths: [
      { d: "M30 32 a22 22 0 1 1 44 0 a22 22 0 1 1 -44 0 Z", mode: "stroke" },
      { d: "M56 32 a22 22 0 1 1 44 0 a22 22 0 1 1 -44 0 Z", mode: "stroke" },
    ],
  },
  {
    id: "flourish",
    name: "Flourish",
    w: 200,
    h: 40,
    paths: [
      { d: "M4 26 C40 6 70 6 100 20 C130 34 160 34 196 14", mode: "stroke" },
      { d: "M100 20 C94 10 82 4 70 8 C64 10 62 16 66 20 C72 26 84 24 86 16", mode: "stroke" },
      { d: "M100 20 C106 30 118 36 130 32 C136 30 138 24 134 20 C128 14 116 16 114 24", mode: "stroke" },
    ],
  },
  {
    id: "divider",
    name: "Diamond divider",
    w: 200,
    h: 20,
    paths: [
      { d: "M10 10 H70", mode: "stroke" },
      { d: "M130 10 H190", mode: "stroke" },
      { d: "M100 4 L106 10 L100 16 L94 10 Z", mode: "fill" },
      { d: "M116 10 L118 12 L116 14 L114 12 Z", mode: "fill" },
      { d: "M84 10 L86 12 L84 14 L82 12 Z", mode: "fill" },
    ],
  },
  {
    id: "laurel",
    name: "Laurel branch",
    w: 160,
    h: 60,
    paths: [
      { d: "M6 30 C40 34 70 34 104 30 C118 28 132 30 154 30", mode: "stroke" },
      { d: "M40 30 C38 20 42 14 50 12 C54 18 50 26 44 28", mode: "fill" },
      { d: "M60 30 C60 18 66 12 76 12 C76 20 70 26 66 29", mode: "fill" },
      { d: "M88 30 C88 18 94 12 104 12 C104 20 98 26 94 29", mode: "fill" },
      { d: "M120 30 C118 20 122 14 130 12 C134 18 130 26 124 28", mode: "fill" },
    ],
  },
  {
    id: "frame_corner",
    name: "Ornate corner",
    w: 100,
    h: 100,
    paths: [
      { d: "M4 60 C4 24 24 4 60 4", mode: "stroke" },
      { d: "M4 48 C4 20 20 4 48 4", mode: "stroke" },
      { d: "M52 6 C44 18 44 30 52 42 C60 30 60 18 52 6 Z", mode: "fill" },
      { d: "M6 52 C18 44 30 44 42 52 C30 60 18 60 6 52 Z", mode: "fill" },
      { d: "M26 26 a10 10 0 1 1 20 0 a10 10 0 1 1 -20 0 Z", mode: "fill" },
    ],
  },
  {
    id: "monogram",
    name: "Monogram ring",
    w: 100,
    h: 100,
    paths: [{ d: "M50 4 a46 46 0 1 1 0 92 a46 46 0 1 1 0 -92 Z M50 16 a34 34 0 1 0 0 68 a34 34 0 1 0 0 -68 Z", mode: "fill" }],
  },
  {
    id: "leaf",
    name: "Leaf",
    w: 60,
    h: 100,
    paths: [
      { d: "M30 4 C54 22 58 56 40 88 C32 66 12 54 6 30 C10 14 18 8 30 4 Z", mode: "fill" },
      { d: "M30 14 L34 78", mode: "stroke" },
    ],
  },
  {
    id: "star5",
    name: "Star",
    w: 100,
    h: 96,
    paths: [{ d: "M50 4 L62 38 L98 38 L69 60 L80 96 L50 74 L20 96 L31 60 L2 38 L38 38 Z", mode: "fill" }],
  },
  {
    id: "sparkle",
    name: "Sparkle",
    w: 80,
    h: 80,
    paths: [
      { d: "M40 4 L47 32 L76 40 L47 48 L40 76 L33 48 L4 40 L33 32 Z", mode: "fill" },
      { d: "M66 12 L69 22 L80 26 L69 30 L66 40 L63 30 L52 26 L63 22 Z", mode: "fill" },
    ],
  },
  {
    id: "ribbon",
    name: "Banner ribbon",
    w: 200,
    h: 70,
    paths: [
      { d: "M8 12 H192 L184 26 L192 40 H8 L16 26 Z", mode: "fill" },
      { d: "M2 10 L8 14 L8 24 L2 28 Z M198 10 L192 14 L192 24 L198 28 Z", mode: "fill" },
      { d: "M28 10 V42 M44 10 V42 M156 10 V42 M172 10 V42", mode: "stroke" },
    ],
  },
  {
    id: "vines",
    name: "Vine border",
    w: 200,
    h: 60,
    paths: [
      { d: "M2 30 C40 34 70 34 110 30 C120 34 128 42 134 50", mode: "stroke" },
      { d: "M198 30 C160 34 130 34 90 30 C80 34 72 42 66 50", mode: "stroke" },
      { d: "M50 28 C48 20 52 14 58 12 C60 18 56 24 52 26 Z", mode: "fill" },
      { d: "M78 28 C80 20 76 14 70 12 C68 18 72 24 76 26 Z", mode: "fill" },
      { d: "M122 28 C120 20 124 14 130 12 C132 18 128 24 124 26 Z", mode: "fill" },
      { d: "M150 28 C152 20 148 14 142 12 C140 18 144 24 148 26 Z", mode: "fill" },
    ],
  },
  {
    id: "waves",
    name: "Wave divider",
    w: 200,
    h: 40,
    paths: [{ d: "M4 22 C20 8 32 8 48 22 C64 36 76 36 92 22 C108 8 120 8 136 22 C152 36 164 36 180 22 C188 14 194 12 196 12", mode: "stroke" }],
  },
];

export type ShapeKind = "rect" | "ellipse" | "line" | "arrow" | "star";

export interface ShapeStyle {
  shape: ShapeKind;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  radius?: number;
}

export interface GraphicStyle {
  graphicId?: string;
  color?: string;
  opacity?: number;
}

export function findGraphic(id: string | null | undefined): GraphicDef | undefined {
  if (!id) return undefined;
  return GRAPHICS.find((g) => g.id === id);
}

/** SVG markup for a graphic element (used by the export rasterizer). */
export function graphicSvg(
  graphicId: string,
  color: string,
  width: number,
  height: number,
  opacity = 1,
  strokeWidth = 2,
): string {
  const g = findGraphic(graphicId);
  if (!g) return "";
  const paths = g.paths
    .map((p) => {
      if (p.mode === "stroke") {
        return `<path d="${p.d}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linejoin="round" stroke-linecap="round"/>`;
      }
      return `<path d="${p.d}" fill="${color}"/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width)}" height="${Math.round(height)}" viewBox="0 0 ${g.w} ${g.h}" opacity="${opacity}">${paths}</svg>`;
}

/** SVG markup for a shape element. Rotation is baked around the element center. */
export function shapeSvg(style: ShapeStyle, width: number, height: number, rotationDeg = 0): string {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const fill = style.fill === "none" || !style.fill ? "none" : style.fill;
  const stroke = style.stroke && style.stroke !== "none" ? style.stroke : "#0f172a";
  const sw = Math.max(1, style.strokeWidth ?? 2);
  const op = style.opacity ?? 1;
  const rot = rotationDeg ? ` transform="rotate(${rotationDeg} ${w / 2} ${h / 2})"` : "";
  let body = "";
  if (style.shape === "ellipse") {
    body = `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2 - sw / 2}" ry="${h / 2 - sw / 2}"/>`;
  } else if (style.shape === "line") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"${rot}><line x1="${sw / 2}" y1="${h / 2}" x2="${w - sw / 2}" y2="${h / 2}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" opacity="${op}"/></svg>`;
  } else if (style.shape === "arrow") {
    const head = Math.min(14, h, w);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"${rot}><line x1="${sw / 2}" y1="${h / 2}" x2="${w - head}" y2="${h / 2}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" opacity="${op}"/><path d="M${w - head} ${h / 2 - head / 2} L${w - sw / 2} ${h / 2} L${w - head} ${h / 2 + head / 2} Z" fill="${stroke}" opacity="${op}"/></svg>`;
  } else if (style.shape === "star") {
    const cx = w / 2;
    const cy = h / 2;
    const rOuter = Math.min(w, h) / 2 - sw / 2;
    const rInner = rOuter * 0.42;
    const pts: string[] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? rOuter : rInner;
      const a = (Math.PI / 5) * i - Math.PI / 2;
      pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
    }
    body = `<polygon points="${pts.join(" ")}"/>`;
  } else {
    const r = Math.min(style.radius ?? 0, w / 2, h / 2);
    body = `<rect x="${sw / 2}" y="${sw / 2}" width="${Math.max(1, w - sw)}" height="${Math.max(1, h - sw)}" rx="${r}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"${rot}><g fill="${fill}" stroke="${stroke}" stroke-width="${sw}" opacity="${op}">${body}</g></svg>`;
}
