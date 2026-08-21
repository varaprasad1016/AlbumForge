/** Albums + exports API (mobile). */
import { Directory, Filesystem } from "@capacitor/filesystem";
import { all, get, newId, now, persistDb, run } from "./db";
import { buildPdf, ExportPage } from "./export";
import { isSpreadLayout, LAYOUT_CATALOG } from "./engine/layouts";
import { composePage } from "./engine/layoutEngine";
import { resolveFont, resolvePhoto } from "./backend-helpers";
import { albumDto, albumPages, generateAndPersist, pageAspect, pageDto, pageSizeMm } from "./generate";

function photoRecordById(id: string): any {
  const r = get("SELECT * FROM photos WHERE id = ?", [id]);
  if (!r) throw new Error("Photo not found");
  return {
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
  };
}

function snapshotPages(albumId: string): any {
  return { pages: albumPages(albumId).map((p) => ({
    index: p.index,
    layoutKey: p.layoutKey,
    background: p.background,
    elements: p.elements.map((e) => ({
      type: e.type, z: e.z, x: e.x, y: e.y, width: e.width, height: e.height,
      rotation: e.rotation, photoId: e.photoId, crop: e.crop, text: e.text, style: e.style,
    })),
  })) };
}

export function buildAlbumsApi(): any {
  return {
    albums: {
      list: async (projectId?: string) => {
        const rows = projectId
          ? all("SELECT * FROM albums WHERE project_id = ? ORDER BY created_at DESC", [projectId])
          : all("SELECT * FROM albums ORDER BY created_at DESC");
        return rows.map(albumDto);
      },
      get: async (id: string) => albumDto(get("SELECT * FROM albums WHERE id = ?", [id])),
      generate: async (input: any) => {
        const ids = generateAndPersist(input);
        await persistDb();
        return ids.map((id) => albumDto(get("SELECT * FROM albums WHERE id = ?", [id])));
      },
      pages: async (id: string) => albumPages(id),

      recomposePage: async (albumId: string, pageId: string, layoutKey: string) => {
        const layout = LAYOUT_CATALOG[layoutKey];
        if (!layout) throw new Error("Unknown layout");
        const album = albumDto(get("SELECT * FROM albums WHERE id = ?", [albumId]));
        const aspect = pageAspect(album.pageSize) * (isSpreadLayout(layoutKey) ? 2 : 1);
        const els = all("SELECT photo_id FROM album_elements WHERE page_id = ? ORDER BY z", [pageId]);
        const photos = els.filter((e: any) => e.photo_id).map((e: any) => photoRecordById(e.photo_id));
        const composed = composePage(layout, photos, aspect);
        run("DELETE FROM album_elements WHERE page_id = ?", [pageId]);
        run("UPDATE album_pages SET layout_key = ? WHERE id = ?", [layoutKey, pageId]);
        composed.forEach((el, i) => {
          run("INSERT INTO album_elements (id, album_id, page_id, type, z, x, y, width, height, rotation, photo_id, crop) VALUES (?, ?, ?, 'image', ?, ?, ?, ?, ?, 0, ?, ?)", [newId(), albumId, pageId, i, el.x, el.y, el.width, el.height, el.photoId, JSON.stringify(el.crop)]);
        });
        await persistDb();
        return pageDto(get("SELECT * FROM album_pages WHERE id = ?", [pageId]));
      },

      savePage: async (albumId: string, pageId: string, update: any) => {
        if (update.layoutKey != null) run("UPDATE album_pages SET layout_key = ? WHERE id = ?", [update.layoutKey, pageId]);
        if (update.background != null) run("UPDATE album_pages SET background = ? WHERE id = ?", [JSON.stringify(update.background), pageId]);
        if (update.elements) {
          run("DELETE FROM album_elements WHERE page_id = ?", [pageId]);
          update.elements.forEach((el: any, i: number) => {
            run(
              "INSERT INTO album_elements (id, album_id, page_id, type, z, x, y, width, height, rotation, photo_id, crop, text, style) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
              [newId(), albumId, pageId, el.type, el.z ?? i, el.x, el.y, el.width, el.height, el.rotation, el.photoId, el.crop ? JSON.stringify(el.crop) : null, el.text ? JSON.stringify(el.text) : null, el.style ? JSON.stringify(el.style) : null],
            );
          });
        }
        await persistDb();
        return pageDto(get("SELECT * FROM album_pages WHERE id = ?", [pageId]));
      },

      addPage: async (albumId: string) => {
        const count = (get("SELECT COUNT(*) AS c FROM album_pages WHERE album_id = ?", [albumId])?.c as number) ?? 0;
        const id = newId();
        run("INSERT INTO album_pages (id, album_id, idx) VALUES (?, ?, ?)", [id, albumId, count]);
        run("UPDATE albums SET page_count = ? WHERE id = ?", [count + 1, albumId]);
        await persistDb();
        return pageDto(get("SELECT * FROM album_pages WHERE id = ?", [id]));
      },

      duplicatePage: async (albumId: string, pageId: string) => {
        const src = get("SELECT * FROM album_pages WHERE id = ?", [pageId]);
        if (!src) throw new Error("Page not found");
        const count = (get("SELECT COUNT(*) AS c FROM album_pages WHERE album_id = ?", [albumId])?.c as number) ?? 0;
        const id = newId();
        run("INSERT INTO album_pages (id, album_id, idx, layout_key, background) VALUES (?, ?, ?, ?, ?)", [id, albumId, count, src.layout_key, src.background]);
        const elements = all("SELECT * FROM album_elements WHERE page_id = ?", [pageId]);
        for (const el of elements) {
          run("INSERT INTO album_elements (id, album_id, page_id, type, z, x, y, width, height, rotation, photo_id, crop, text, style) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [newId(), albumId, id, el.type, el.z, el.x, el.y, el.width, el.height, el.rotation, el.photo_id, el.crop, el.text, el.style]);
        }
        run("UPDATE albums SET page_count = ? WHERE id = ?", [count + 1, albumId]);
        await persistDb();
        return pageDto(get("SELECT * FROM album_pages WHERE id = ?", [id]));
      },

      deletePage: async (albumId: string, pageId: string) => {
        run("DELETE FROM album_elements WHERE page_id = ?", [pageId]);
        run("DELETE FROM album_pages WHERE id = ?", [pageId]);
        const rows = all("SELECT id FROM album_pages WHERE album_id = ? ORDER BY idx", [albumId]);
        rows.forEach((r: any, i: number) => run("UPDATE album_pages SET idx = ? WHERE id = ?", [i, r.id]));
        run("UPDATE albums SET page_count = ? WHERE id = ?", [rows.length, albumId]);
        await persistDb();
      },

      reorderPages: async (_albumId: string, pageIds: string[]) => {
        pageIds.forEach((id, i) => run("UPDATE album_pages SET idx = ? WHERE id = ?", [i, id]));
        await persistDb();
      },

      versions: async (albumId: string) =>
        all("SELECT id, version_number, created_at FROM album_versions WHERE album_id = ? ORDER BY version_number DESC", [albumId]).map((r: any) => ({
          id: r.id, versionNumber: r.version_number, createdAt: r.created_at,
        })),

      snapshot: async (albumId: string) => {
        const next = ((get("SELECT COALESCE(MAX(version_number), 0) AS m FROM album_versions WHERE album_id = ?", [albumId])?.m as number) ?? 0) + 1;
        const id = newId();
        run("INSERT INTO album_versions (id, album_id, version_number, layout_json, created_at) VALUES (?, ?, ?, ?, ?)", [id, albumId, next, JSON.stringify(snapshotPages(albumId)), now()]);
        await persistDb();
        return { id, versionNumber: next, createdAt: now() };
      },

      restoreVersion: async (albumId: string, versionId: string) => {
        const v = get("SELECT layout_json FROM album_versions WHERE id = ?", [versionId]);
        if (!v) throw new Error("Version not found");
        const { pages } = JSON.parse(v.layout_json);
        run("DELETE FROM album_pages WHERE album_id = ?", [albumId]);
        for (const page of pages) {
          const pid = newId();
          run("INSERT INTO album_pages (id, album_id, idx, layout_key, background) VALUES (?, ?, ?, ?, ?)", [pid, albumId, page.index, page.layoutKey, page.background ? JSON.stringify(page.background) : null]);
          for (const el of page.elements) {
            run("INSERT INTO album_elements (id, album_id, page_id, type, z, x, y, width, height, rotation, photo_id, crop, text, style) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [newId(), albumId, pid, el.type, el.z, el.x, el.y, el.width, el.height, el.rotation, el.photoId, el.crop ? JSON.stringify(el.crop) : null, el.text ? JSON.stringify(el.text) : null, el.style ? JSON.stringify(el.style) : null]);
          }
        }
        run("UPDATE albums SET page_count = ? WHERE id = ?", [pages.length, albumId]);
        await persistDb();
        return albumPages(albumId);
      },
    },
    exports: {
      create: async (albumId: string, input: { kind: string; dpi: number; bleedMm: number; targetPath?: string | null }) => {
        const id = newId();
        run("INSERT INTO exports (id, album_id, kind, status, settings, created_at) VALUES (?, ?, ?, 'queued', ?, ?)", [id, albumId, input.kind, JSON.stringify({ dpi: input.dpi, bleedMm: input.bleedMm }), now()]);
        await persistDb();
        runExport(id);
        return { id, albumId, kind: input.kind, status: "queued", filePath: null, error: null, createdAt: now() };
      },
      get: async (id: string) => {
        const r = get("SELECT * FROM exports WHERE id = ?", [id]);
        return {
          id: r.id, albumId: r.album_id, kind: r.kind, status: r.status, filePath: r.file_path, error: r.error, createdAt: r.created_at,
        };
      },
    },
  };
}

async function runExport(exportId: string): Promise<void> {
  try {
    const row = get("SELECT * FROM exports WHERE id = ?", [exportId]);
    const album = albumDto(get("SELECT * FROM albums WHERE id = ?", [row.album_id]));
    const pages = albumPages(row.album_id);
    const settings = JSON.parse(row.settings);
    const [widthMm, heightMm] = pageSizeMm(album.pageSize);

    const exportPages: ExportPage[] = pages.map((p) => ({
      layoutKey: p.layoutKey,
      background: p.background as { color?: string } | null,
      elements: p.elements.map((el) => ({
        type: el.type, photoId: el.photoId, x: el.x, y: el.y, width: el.width, height: el.height,
        rotation: el.rotation, crop: el.crop,
        text: el.text as { content?: string } | null,
        style: el.style as { color?: string; fontSize?: number; fontFamily?: string } | null,
        z: el.z,
      })),
    }));

    const watermark = row.kind === "proof_pdf" ? "PROOF" : undefined;
    const pdf = await buildPdf(exportPages, resolvePhoto, resolveFont, widthMm, heightMm, settings.dpi, settings.bleedMm, watermark);

    const path = `AlbumForge-${exportId}.pdf`;
    await Filesystem.writeFile({ path, data: btoa(String.fromCharCode(...pdf)), directory: Directory.Documents, recursive: true });

    run("UPDATE exports SET status = 'completed', file_path = ? WHERE id = ?", [path, exportId]);
    await persistDb();
  } catch (e) {
    run("UPDATE exports SET status = 'failed', error = ? WHERE id = ?", [String(e), exportId]);
    await persistDb();
  }
}
