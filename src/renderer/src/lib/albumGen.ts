/**
 * Renderer-driven album generation (MIGRATION.md Phase 4 item 3).
 *
 * The engine (`src/shared/engine/*`) is pure TypeScript — no Node, no SQLite —
 * so it can run *in the renderer* instead of the Electron main process. This
 * module is the native-shell replacement for the `generateAndPersist` /
 * `recomposePage` orchestration in `src/main/generate.ts`:
 *
 *   read inputs via commands (records / templates / project) → run the engine
 *   unchanged → persist the result via `albums.saveGenerated` / `savePage`.
 *
 * The Electron main process keeps its own path (its DB access stays in
 * process); only the *execution site* differs. Deterministic: same inputs →
 * same albums, and `engine/*` tests remain the source of truth.
 */
import {
  LAYOUT_CATALOG,
  isSpreadLayout,
} from "@shared/engine/layouts";
import { composePage } from "@shared/engine/layoutEngine";
import { generateAlbum } from "@shared/engine/generator";
import { selectForMode } from "@shared/engine/selection";
import type {
  AlbumSpec,
  ElementDef,
  Orientation,
  PageStyle,
  PhotoRecord,
  TemplateFamily,
} from "@shared/engine/types";
import type {
  Album,
  AlbumPage,
  GenerateInput,
  PageSize,
  PageUpdate,
  TemplateDetail,
} from "@shared/api";
import { native } from "./native";
import type { PhotoRecordRow } from "./native";

/** `pageAspect` parity (`src/main/generate.ts`). */
export function pageAspect(ps: PageSize): number {
  return ps.width / ps.height;
}

/** `familyFor` parity (`src/main/generate.ts`) from a `TemplateDetail`. */
export function familyFromTemplate(t: TemplateDetail): TemplateFamily {
  const style = (t.style ?? {}) as Record<string, unknown>;
  const pageStyle: PageStyle = {
    margin: (style.margin as number) ?? 0.02,
    gutter: (style.gutter as number) ?? 0.03,
    bleed: (style.bleed as number) ?? 0,
    safeArea: (style.safeArea as number) ?? 0.05,
    background: (style.background as string) ?? "#ffffff",
    pattern: (style.pattern as string | undefined) ?? undefined,
  };
  const layouts = t.layouts
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((l) => [l.key, l.weight] as [string, number]);
  return {
    key: t.key,
    name: t.name,
    layouts,
    style: pageStyle,
    chronological: (style.chronological as boolean | undefined) ?? true,
  };
}

/** Rehydrate a `photos:records` row into an engine `PhotoRecord`. */
export function buildRecord(row: PhotoRecordRow): PhotoRecord {
  return {
    id: row.id,
    width: row.width,
    height: row.height,
    orientation: row.orientation as Orientation,
    qualityScore: row.qualityScore,
    blurScore: row.blurScore,
    phash: BigInt(row.phash || "0"),
    takenAt: row.takenAt,
    groupId: row.groupId,
    faceBoxes: [],
  };
}

/** Engine element → `PageUpdate` element (fresh id; `savePage` keeps it stable). */
function elementToUpdate(e: ElementDef, z = e.z): NonNullable<PageUpdate["elements"]>[number] {
  return {
    id: crypto.randomUUID(),
    type: e.type as NonNullable<PageUpdate["elements"]>[number]["type"],
    z,
    x: e.x,
    y: e.y,
    width: e.width,
    height: e.height,
    rotation: e.rotation,
    photoId: e.photoId,
    crop: e.crop ?? null,
    text: e.text ?? null,
    style: e.style ?? null,
  };
}

/**
 * `albums.generate` (native shell) — parity with `generateAndPersist` in
 * `src/main/generate.ts`: same record fetch, mode selection, family/spec
 * derivation, and per-variation `generateAlbum` calls; persistence happens via
 * the `albums_save_generated` command instead of in-process SQLite.
 */
export async function generateAlbums(input: GenerateInput): Promise<Album[]> {
  const projects = await native.projects.list();
  const coverTitle = projects.find((p) => p.id === input.projectId)?.name ?? null;

  const rows = await native.photos.records(input.projectId, input.selection);
  const records = rows.map(buildRecord);
  const selected = selectForMode(records, input.selection, input.targetPhotoCount ?? null);
  if (selected.length === 0) throw new Error("No photos available for generation");

  const detail = await native.templates.get(input.templateId);
  if (!detail) throw new Error("Template not found");
  const family = familyFromTemplate(detail);
  const spec: AlbumSpec = {
    pageCount: input.pageCount,
    pageAspect: pageAspect(input.pageSize),
    style: family.style,
    coverTitle,
    beatGapSeconds: 1800,
  };

  const albums: Album[] = [];
  for (let v = 1; v <= input.variations; v++) {
    const result = generateAlbum(selected, family, spec, v);
    const album = await native.albums.saveGenerated({
      projectId: input.projectId,
      templateId: input.templateId,
      name: `${family.name} v${v}`,
      pageSize: input.pageSize,
      variation: v,
      background: family.style.background ?? "#ffffff",
      pattern: family.style.pattern ?? null,
      pages: result.pages.map((p) => ({
        layoutKey: p.layoutKey,
        elements: p.elements.map((e) => ({
          type: e.type,
          z: e.z,
          x: e.x,
          y: e.y,
          width: e.width,
          height: e.height,
          rotation: e.rotation,
          photoId: e.photoId,
          crop: (e.crop ?? null) as Record<string, unknown> | null,
          text: (e.text ?? null) as Record<string, unknown> | null,
          style: (e.style ?? null) as Record<string, unknown> | null,
        })),
      })),
    });
    albums.push(album);
  }
  return albums;
}

/**
 * `albums.recomposePage` (native shell) — parity with the Electron handler:
 * read the page's current photos, compose them into the requested layout with
 * the engine, persist via `savePage`. Zero new persistence code — page
 * mutations already go through the Phase-4 CRUD surface.
 */
export async function recomposePage(
  albumId: string,
  pageId: string,
  layoutKey: string,
): Promise<AlbumPage> {
  const layout = LAYOUT_CATALOG[layoutKey];
  if (!layout) throw new Error("Unknown layout");
  const album = await native.albums.get(albumId);
  const aspect = pageAspect(album.pageSize) * (isSpreadLayout(layoutKey) ? 2 : 1);

  const pages = await native.albums.pages(albumId);
  const page = pages.find((p) => p.id === pageId);
  const photoIds = page?.elements.filter((e) => e.photoId).map((e) => e.photoId!) ?? [];
  const rows = await native.photos.records(album.projectId, "all");
  const want = new Set(photoIds);
  const records = rows.filter((r) => want.has(r.id)).map(buildRecord);

  const composed = composePage(layout, records, aspect);
  const update: PageUpdate = {
    layoutKey,
    elements: composed.map((e) => elementToUpdate(e)),
  };
  return native.albums.savePage(albumId, pageId, update);
}
