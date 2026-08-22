/** Generation + DTO helpers (mobile). */
import { all, get, newId, now, run } from "./db";
import { generateAlbum } from "./engine/generator";
import { isSpreadLayout } from "./engine/layouts";
import { selectForMode } from "./engine/selection";
import { PageStyle, PhotoRecord, TemplateFamily } from "./engine/types";
import type { Album, AlbumPage, GenerateInput, Photo, Project } from "./api";

const MM_PER_INCH = 25.4;

export function pageAspect(ps: { width: number; height: number }): number {
  return ps.width / ps.height;
}

export function pageSizeMm(ps: { width: number; height: number; unit: string }): [number, number] {
  return ps.unit === "in" ? [ps.width * MM_PER_INCH, ps.height * MM_PER_INCH] : [ps.width, ps.height];
}

export function photoDto(r: any): Photo {
  return {
    id: r.id,
    projectId: r.project_id,
    filename: r.filename,
    width: r.width,
    height: r.height,
    orientation: r.orientation,
    fileSize: r.file_size,
    qualityScore: r.quality_score,
    blurScore: r.blur_score,
    faceCount: r.face_count ?? 0,
    processingStatus: r.processing_status,
    selected: !!r.selected,
    groupId: r.group_id,
    createdAt: r.created_at,
  };
}

export function projectDto(r: any): Project {
  return {
    id: r.id,
    name: r.name,
    clientName: r.client_name,
    eventDate: r.event_date,
    status: r.status,
    thumbnailPhotoId: r.thumbnail_photo_id,
    createdAt: r.created_at,
  };
}

export function albumDto(r: any): Album {
  return {
    id: r.id,
    projectId: r.project_id,
    templateId: r.template_id,
    name: r.name,
    pageSize: JSON.parse(r.page_size),
    pageCount: r.page_count,
    variationNumber: r.variation_number,
    status: r.status,
    createdAt: r.created_at,
  };
}

export function pageDto(row: any): AlbumPage {
  const elements = all("SELECT * FROM album_elements WHERE page_id = ? ORDER BY z", [row.id]);
  return {
    id: row.id,
    index: row.idx,
    layoutKey: row.layout_key,
    isSpread: isSpreadLayout(row.layout_key),
    background: row.background ? JSON.parse(row.background) : null,
    elements: elements.map((el: any) => ({
      id: el.id,
      type: el.type,
      z: el.z,
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
      rotation: el.rotation,
      photoId: el.photo_id,
      crop: el.crop ? JSON.parse(el.crop) : null,
      text: el.text ? JSON.parse(el.text) : null,
      style: el.style ? JSON.parse(el.style) : null,
    })),
  };
}

export function albumPages(albumId: string): AlbumPage[] {
  return all("SELECT * FROM album_pages WHERE album_id = ? ORDER BY idx", [albumId]).map(pageDto);
}

export function photoRecordsFor(projectId: string, mode: string): PhotoRecord[] {
  let sql = "SELECT * FROM photos WHERE project_id = ?";
  const args: any[] = [projectId];
  if (mode === "selected") sql += " AND selected = 1";
  sql += " ORDER BY created_at";
  return all(sql, args).map((r: any) => ({
    id: r.id,
    width: r.width ?? 3000,
    height: r.height ?? 2000,
    orientation: r.orientation ?? "landscape",
    qualityScore: r.quality_score ?? 0.5,
    blurScore: r.blur_score ?? 0.5,
    phash: BigInt(r.phash ?? "0"),
    takenAt: r.exif_timestamp ? Date.parse(r.exif_timestamp) / 1000 : null,
    groupId: r.group_id ?? null,
    faceBoxes: [],
  }));
}

export function familyFor(templateId: string): TemplateFamily {
  const t = get("SELECT * FROM templates WHERE id = ?", [templateId]);
  if (!t) throw new Error("Template not found");
  const layouts = all("SELECT key, weight FROM template_layouts WHERE template_id = ? ORDER BY sort_order", [templateId]);
  const style = JSON.parse(t.style ?? "{}");
  const pageStyle: PageStyle = {
    margin: style.margin ?? 0.02,
    gutter: style.gutter ?? 0.03,
    bleed: style.bleed ?? 0,
    safeArea: style.safeArea ?? 0.05,
    background: style.background ?? "#ffffff",
    pattern: style.pattern ?? undefined,
  };
  return {
    key: t.key,
    name: t.name,
    layouts: layouts.map((l: any) => [l.key, l.weight]),
    style: pageStyle,
    chronological: style.chronological ?? true,
  };
}

export function generateAndPersist(input: GenerateInput): string[] {
  const records = photoRecordsFor(input.projectId, input.selection);
  const selected = selectForMode(records, input.selection, input.targetPhotoCount ?? null);
  if (!selected.length) throw new Error("No photos available");
  const family = familyFor(input.templateId);
  const aspect = pageAspect(input.pageSize);
  const project = get("SELECT name FROM projects WHERE id = ?", [input.projectId]) as { name: string } | undefined;
  const spec = { pageCount: input.pageCount, pageAspect: aspect, style: family.style, coverTitle: project?.name ?? null };

  const ids: string[] = [];
  for (let v = 1; v <= input.variations; v++) {
    const result = generateAlbum(selected, family, spec, v);
    const albumId = newId();
    run(
      "INSERT INTO albums (id, project_id, template_id, name, page_size, page_count, variation_number, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'generated', ?)",
      [albumId, input.projectId, input.templateId, `${family.name} v${v}`, JSON.stringify(input.pageSize), result.pageCount, v, now()],
    );
    for (let i = 0; i < result.pages.length; i++) {
      const page = result.pages[i];
      const pageId = newId();
      run("INSERT INTO album_pages (id, album_id, idx, layout_key, background) VALUES (?, ?, ?, ?, ?)", [
        pageId,
        albumId,
        i,
        page.layoutKey,
        JSON.stringify({ color: family.style.background ?? "#ffffff", pattern: family.style.pattern ?? null }),
      ]);
      for (const el of page.elements) {
        run(
          "INSERT INTO album_elements (id, album_id, page_id, type, z, x, y, width, height, rotation, photo_id, crop, text, style) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [newId(), albumId, pageId, el.type, el.z, el.x, el.y, el.width, el.height, el.rotation, el.photoId, el.crop ? JSON.stringify(el.crop) : null, el.text ? JSON.stringify(el.text) : null, el.style ? JSON.stringify(el.style) : null],
        );
      }
    }
    ids.push(albumId);
  }
  return ids;
}
