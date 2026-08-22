/** Engine data model — plain types decoupled from the DB layer.

The engine is pure and deterministic: no filesystem, no SQLite, no I/O. It consumes
`PhotoRecord`s and emits a structured album (pages → elements with normalized
coordinates and crops).
*/

export type Orientation = "landscape" | "portrait" | "square";

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence?: number;
}

export interface PhotoRecord {
  id: string;
  width: number;
  height: number;
  orientation: Orientation;
  qualityScore: number; // 0..1
  blurScore: number; // 0..1 (1 = blurry)
  phash: bigint;
  takenAt: number | null; // epoch seconds
  groupId: string | null;
  faceBoxes: FaceBox[];
}

export interface PageStyle {
  margin: number; // normalized outer margin
  gutter: number; // normalized gap between slots
  bleed: number; // normalized bleed beyond trim (export)
  safeArea: number; // normalized inset considered safe
  background?: string; // default page background color (hex)
  pattern?: string; // default page background pattern id
}

export interface AlbumSpec {
  pageCount: number;
  pageAspect: number; // page width / height
  style: PageStyle;
  coverTitle?: string | null;
}

export interface TemplateFamily {
  key: string;
  name: string;
  layouts: Array<[string, number]>; // [layoutKey, weight]
  style: PageStyle;
  chronological: boolean;
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ElementDef {
  type: "image" | "text" | "background";
  photoId: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  crop: CropRect | null;
  z: number;
  text?: Record<string, unknown> | null;
  style?: Record<string, unknown> | null;
}

export interface PageDef {
  layoutKey: string;
  spread: boolean;
  elements: ElementDef[];
}

export interface AlbumResult {
  variation: number;
  pageCount: number;
  photoCount: number;
  pages: PageDef[];
  score: number;
}

export function aspectRatio(p: PhotoRecord): number {
  return p.height ? p.width / p.height : 1;
}
