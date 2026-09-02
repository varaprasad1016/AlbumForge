/** Parse an external SVG into recolourable vector path data (Module 7).
 *
 *  Single source of truth for `stock.parseSvg`: Electron's main process calls
 *  it through `src/main/stock.ts`, and the native (Tauri) shell runs it in the
 *  renderer — the only imports are the pure `svgpath` / `svgson` libraries, so
 *  it bundles cleanly into both hosts (MIGRATION.md Phase 4/6). Pure, no Node.
 */
import svgpath from "svgpath";
import { parseSync, type INode } from "svgson";
import type { StockVectorData } from "./api";

const DEFAULT_DIM = 100;

function num(v: string | undefined, fallback: number): number {
  if (v === undefined) return fallback;
  const n = Number.parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

/** Effective fill colour for a node: its fill, else inherited, else its stroke
 *  when the shape is stroke-only. `undefined` means the shape is invisible. */
function effectiveColor(attrs: Record<string, string>, inheritedFill: string | undefined): string | undefined {
  const fill = attrs["fill"] ?? inheritedFill;
  if (fill !== undefined && fill.trim().toLowerCase() !== "none") return fill.trim().toLowerCase();
  const stroke = attrs["stroke"];
  if (stroke && stroke.trim().toLowerCase() !== "none") return stroke.trim().toLowerCase();
  return undefined;
}

function pointsToPath(points: string | undefined, close: boolean): string {
  if (!points) return "";
  const pts = points
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((p) => Number.parseFloat(p));
  if (pts.length < 4) return "";
  let d = `M${pts[0]} ${pts[1]}`;
  for (let i = 2; i + 1 < pts.length; i += 2) d += `L${pts[i]} ${pts[i + 1]}`;
  if (close) d += "Z";
  return d;
}

const SKIP_SUBTREES = new Set([
  "defs",
  "clipPath",
  "mask",
  "filter",
  "pattern",
  "symbol",
  "linearGradient",
  "radialGradient",
  "metadata",
  "title",
  "desc",
  "style",
  "use",
]);

function visit(node: INode, inheritedFill: string | undefined, inheritedTransform: string, out: Map<string, string[]>): void {
  const attrs = node.attributes ?? {};
  const transform = [inheritedTransform, attrs["transform"]].filter(Boolean).join(" ");
  const fill = effectiveColor(attrs, inheritedFill);

  const push = (d: string | undefined): void => {
    if (!d || !fill) return;
    let p = svgpath(d);
    if (transform) p = p.transform(transform);
    p = p.round(2);
    const flat = p.toString();
    if (!flat) return;
    const bucket = out.get(fill) ?? [];
    bucket.push(flat);
    out.set(fill, bucket);
  };

  switch (node.name) {
    case "path":
      push(attrs["d"]);
      break;
    case "circle": {
      const r = num(attrs["r"], 0);
      if (r > 0) {
        const cx = num(attrs["cx"], 0);
        const cy = num(attrs["cy"], 0);
        push(`M${cx - r} ${cy}A${r} ${r} 0 1 0 ${cx + r} ${cy}A${r} ${r} 0 1 0 ${cx - r} ${cy}Z`);
      }
      break;
    }
    case "ellipse": {
      const rx = num(attrs["rx"], 0);
      const ry = num(attrs["ry"], 0);
      if (rx > 0 && ry > 0) {
        const cx = num(attrs["cx"], 0);
        const cy = num(attrs["cy"], 0);
        push(`M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`);
      }
      break;
    }
    case "rect": {
      const x = num(attrs["x"], 0);
      const y = num(attrs["y"], 0);
      const w = num(attrs["width"], 0);
      const h = num(attrs["height"], 0);
      if (w > 0 && h > 0) push(`M${x} ${y}h${w}v${h}h${-w}Z`);
      break;
    }
    case "line": {
      const x1 = num(attrs["x1"], 0);
      const y1 = num(attrs["y1"], 0);
      const x2 = num(attrs["x2"], 0);
      const y2 = num(attrs["y2"], 0);
      push(`M${x1} ${y1}L${x2} ${y2}`);
      break;
    }
    case "polygon":
      push(pointsToPath(attrs["points"], true));
      break;
    case "polyline":
      push(pointsToPath(attrs["points"], false));
      break;
  }

  for (const child of node.children ?? []) {
    if (!SKIP_SUBTREES.has(child.name)) visit(child, fill, transform, out);
  }
}

/** Parse an external SVG into recolourable path groups (bucketed by fill
 *  colour), with all transforms flattened into the path data. */
export function parseSvg(svg: string): StockVectorData {
  let root: INode;
  try {
    root = parseSync(svg);
  } catch {
    throw new Error("Could not parse SVG — unsupported or malformed markup.");
  }
  const attrs = root.attributes ?? {};
  let width = DEFAULT_DIM;
  let height = DEFAULT_DIM;
  const vb = (attrs["viewBox"] ?? "").trim().split(/[\s,]+/).filter(Boolean).map((s) => Number.parseFloat(s));
  if (vb.length >= 4 && vb.every(Number.isFinite)) {
    width = vb[2];
    height = vb[3];
  } else {
    width = num(attrs["width"], DEFAULT_DIM);
    height = num(attrs["height"], width);
  }
  const groups = new Map<string, string[]>();
  visit(root, undefined, "", groups);
  if (groups.size === 0) throw new Error("No drawable paths found in the SVG.");
  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
    groups: [...groups.entries()].map(([color, paths]) => ({ color, paths })),
  };
}
