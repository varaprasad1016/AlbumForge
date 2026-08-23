/** Generation orchestration: DB ↔ engine bridge + persistence. */
import { DB, newId, now } from "./db";
import { generateAlbum } from "./engine/generator";
import { selectForMode } from "./engine/selection";
import { PageStyle, PhotoRecord, TemplateFamily } from "./engine/types";
import type { Album, GenerateInput, PageSize } from "@shared/api";

const MM_PER_INCH = 25.4;

export function pageAspect(ps: PageSize): number {
  return ps.width / ps.height;
}

export function pageSizeMm(ps: PageSize): [number, number] {
  return ps.unit === "in" ? [ps.width * MM_PER_INCH, ps.height * MM_PER_INCH] : [ps.width, ps.height];
}

export function photoRecordsFor(db: DB, projectId: string, mode: string): PhotoRecord[] {
  let sql = "SELECT * FROM photos WHERE project_id = ?";
  const args: unknown[] = [projectId];
  if (mode === "selected") sql += " AND selected = 1";
  sql += " ORDER BY created_at";
  const rows = db.prepare(sql).all(...args) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: r.id as string,
    width: (r.width as number) ?? 3000,
    height: (r.height as number) ?? 2000,
    orientation: (r.orientation as PhotoRecord["orientation"]) ?? "landscape",
    qualityScore: (r.quality_score as number) ?? 0.5,
    blurScore: (r.blur_score as number) ?? 0.5,
    phash: BigInt((r.phash as string) ?? "0"),
    takenAt: r.exif_timestamp ? Date.parse(r.exif_timestamp as string) / 1000 : null,
    groupId: (r.group_id as string) ?? null,
    faceBoxes: [],
  }));
}

export function photoRecordById(db: DB, id: string): PhotoRecord {
  const r = db.prepare("SELECT * FROM photos WHERE id = ?").get(id) as Record<string, unknown>;
  if (!r) throw new Error(`Photo ${id} not found`);
  return {
    id: r.id as string,
    width: (r.width as number) ?? 3000,
    height: (r.height as number) ?? 2000,
    orientation: (r.orientation as PhotoRecord["orientation"]) ?? "landscape",
    qualityScore: (r.quality_score as number) ?? 0.5,
    blurScore: (r.blur_score as number) ?? 0.5,
    phash: BigInt((r.phash as string) ?? "0"),
    takenAt: r.exif_timestamp ? Date.parse(r.exif_timestamp as string) / 1000 : null,
    groupId: (r.group_id as string) ?? null,
    faceBoxes: [],
  };
}

export function familyFor(db: DB, templateId: string): TemplateFamily {
  const t = db.prepare("SELECT * FROM templates WHERE id = ?").get(templateId) as Record<string, unknown>;
  if (!t) throw new Error("Template not found");
  const layouts = db
    .prepare("SELECT key, weight FROM template_layouts WHERE template_id = ? ORDER BY sort_order")
    .all(templateId) as Array<{ key: string; weight: number }>;
  const style = JSON.parse((t.style as string) ?? "{}") as Record<string, unknown>;
  const pageStyle: PageStyle = {
    margin: (style.margin as number) ?? 0.02,
    gutter: (style.gutter as number) ?? 0.03,
    bleed: (style.bleed as number) ?? 0,
    safeArea: (style.safeArea as number) ?? 0.05,
    background: (style.background as string) ?? "#ffffff",
    pattern: (style.pattern as string) ?? undefined,
  };
  return {
    key: t.key as string,
    name: t.name as string,
    layouts: layouts.map((l) => [l.key, l.weight] as [string, number]),
    style: pageStyle,
    chronological: (style.chronological as boolean) ?? true,
  };
}

export function persistAlbum(
  db: DB,
  projectId: string,
  templateId: string,
  name: string,
  pageSize: PageSize,
  variation: number,
  result: ReturnType<typeof generateAlbum>,
  background = "#ffffff",
  pattern?: string,
): string {
  const albumId = newId();
  db.prepare(
    `INSERT INTO albums (id, project_id, template_id, name, page_size, page_count, variation_number, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'generated', ?)`,
  ).run(
    albumId,
    projectId,
    templateId,
    name,
    JSON.stringify(pageSize),
    result.pageCount,
    variation,
    now(),
  );

  const insertPage = db.prepare(
    "INSERT INTO album_pages (id, album_id, idx, layout_key, background) VALUES (?, ?, ?, ?, ?)",
  );
  const insertElement = db.prepare(
    `INSERT INTO album_elements
     (id, album_id, page_id, type, z, x, y, width, height, rotation, photo_id, crop, text, style)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  for (let i = 0; i < result.pages.length; i++) {
    const page = result.pages[i];
    const pageId = newId();
    insertPage.run(pageId, albumId, i, page.layoutKey, JSON.stringify({ color: background, pattern: pattern ?? null }));
    for (const el of page.elements) {
      insertElement.run(
        newId(),
        albumId,
        pageId,
        el.type,
        el.z,
        el.x,
        el.y,
        el.width,
        el.height,
        el.rotation,
        el.photoId,
        el.crop ? JSON.stringify(el.crop) : null,
        el.text ? JSON.stringify(el.text) : null,
        el.style ? JSON.stringify(el.style) : null,
      );
    }
  }
  return albumId;
}

export function generateAndPersist(db: DB, input: GenerateInput): string[] {
  const records = photoRecordsFor(db, input.projectId, input.selection);
  const selected = selectForMode(records, input.selection, input.targetPhotoCount ?? null);
  if (selected.length === 0) throw new Error("No photos available for generation");

  const family = familyFor(db, input.templateId);
  const aspect = pageAspect(input.pageSize);
  const project = db.prepare("SELECT name FROM projects WHERE id = ?").get(input.projectId) as
    | { name: string }
    | undefined;
  const spec = {
    pageCount: input.pageCount,
    pageAspect: aspect,
    style: family.style,
    coverTitle: project?.name ?? null,
    beatGapSeconds: 1800,
  } as const;

  const albumIds: string[] = [];
  for (let v = 1; v <= input.variations; v++) {
    const result = generateAlbum(selected, family, spec, v);
    albumIds.push(
      persistAlbum(
        db,
        input.projectId,
        input.templateId,
        `${family.name} v${v}`,
        input.pageSize,
        v,
        result,
        family.style.background ?? "#ffffff",
        family.style.pattern,
      ),
    );
  }
  return albumIds;
}

export function albumById(db: DB, id: string): Album {
  const row = db.prepare("SELECT * FROM albums WHERE id = ?").get(id) as Record<string, unknown>;
  if (!row) throw new Error("Album not found");
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    templateId: (row.template_id as string) ?? null,
    name: row.name as string,
    pageSize: JSON.parse(row.page_size as string),
    pageCount: row.page_count as number,
    variationNumber: row.variation_number as number,
    status: row.status as string,
    createdAt: row.created_at as string,
  };
}
