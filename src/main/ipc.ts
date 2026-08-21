/** IPC handlers: the entire application surface exposed to the renderer. */
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { autoUpdater } from "electron-updater";
import { mkdirSync, rmSync, statSync, writeFileSync } from "fs";
import { basename, extname, join } from "path";
import { DB, newId, now } from "./db";
import { analyzeImage, extractTimestamp, generateThumbnails, imageInfo } from "./imaging";
import { buildPdf, ExportPage, PhotoResolver } from "./export";
import { albumById, generateAndPersist, pageAspect, photoRecordById, photoRecordsFor } from "./generate";
import { composePage } from "./engine/layoutEngine";
import { LAYOUT_CATALOG } from "./engine/layouts";
import { segmentByTime } from "./engine/grouping";
import type {
  Album,
  AlbumElement,
  AlbumPage,
  ExportJob,
  GenerateInput,
  ImportProgress,
  PageUpdate,
  Photo,
  PhotoGroup,
  Project,
  TemplateDetail,
  TemplateSummary,
} from "@shared/api";

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
};

export interface IpcContext {
  db: DB;
  cacheDir: string;
  dataDir: string;
  getWindow: () => BrowserWindow | null;
}

function photoDto(row: Record<string, unknown>): Photo {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    filename: row.filename as string,
    width: row.width as number | null,
    height: row.height as number | null,
    orientation: row.orientation as string | null,
    fileSize: row.file_size as number | null,
    qualityScore: row.quality_score as number | null,
    blurScore: row.blur_score as number | null,
    faceCount: row.face_count as number,
    processingStatus: row.processing_status as string,
    selected: !!row.selected,
    groupId: row.group_id as string | null,
    createdAt: row.created_at as string,
  };
}

function projectDto(row: Record<string, unknown>): Project {
  return {
    id: row.id as string,
    name: row.name as string,
    clientName: row.client_name as string | null,
    eventDate: row.event_date as string | null,
    status: row.status as string,
    createdAt: row.created_at as string,
  };
}

function pageDto(db: DB, pageRow: Record<string, unknown>): AlbumPage {
  const elements = db
    .prepare("SELECT * FROM album_elements WHERE page_id = ? ORDER BY z")
    .all(pageRow.id as string) as Array<Record<string, unknown>>;
  return {
    id: pageRow.id as string,
    index: pageRow.idx as number,
    layoutKey: pageRow.layout_key as string | null,
    background: pageRow.background ? JSON.parse(pageRow.background as string) : null,
    elements: elements.map((el) => ({
      id: el.id as string,
      type: el.type as AlbumElement["type"],
      z: el.z as number,
      x: el.x as number,
      y: el.y as number,
      width: el.width as number,
      height: el.height as number,
      rotation: el.rotation as number,
      photoId: el.photo_id as string | null,
      crop: el.crop ? JSON.parse(el.crop as string) : null,
      text: el.text ? JSON.parse(el.text as string) : null,
      style: el.style ? JSON.parse(el.style as string) : null,
    })),
  };
}

function albumPages(db: DB, albumId: string): AlbumPage[] {
  const rows = db
    .prepare("SELECT * FROM album_pages WHERE album_id = ? ORDER BY idx")
    .all(albumId) as Array<Record<string, unknown>>;
  return rows.map((r) => pageDto(db, r));
}

function templateSummaryDto(row: Record<string, unknown>): TemplateSummary {
  return {
    id: row.id as string,
    key: row.key as string,
    name: row.name as string,
    description: row.description as string | null,
    isSystem: !!row.is_system,
  };
}

export function registerIpc(ctx: IpcContext): void {
  const { db, cacheDir, dataDir, getWindow } = ctx;

  ipcMain.handle("app:info", () => ({
    version: "0.1.0",
    dataPath: dataDir,
    cachePath: cacheDir,
  }));

  ipcMain.handle("app:openPath", (_e, path: string) => {
    void shell.openPath(path);
  });

  ipcMain.handle("app:clearCache", () => {
    rmSync(cacheDir, { recursive: true, force: true });
    mkdirSync(cacheDir, { recursive: true });
  });

  ipcMain.handle("app:openDataFolder", () => {
    void shell.openPath(dataDir);
  });

  ipcMain.handle("app:checkForUpdates", async () => {
    if (!app.isPackaged) return "Updates are only checked in the packaged app.";
    try {
      const result = await autoUpdater.checkForUpdates();
      return result && result.updateInfo.version
        ? `Update available: ${result.updateInfo.version}`
        : "You are up to date.";
    } catch (e) {
      return `Update check failed: ${String(e)}`;
    }
  });

  ipcMain.handle("dialogs:chooseImages", async () => {
    const win = getWindow();
    const res = await dialog.showOpenDialog(win!, {
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "Images", extensions: ["jpg", "jpeg", "png", "webp", "tif", "tiff"] },
      ],
    });
    return res.canceled ? null : res.filePaths;
  });

  ipcMain.handle("dialogs:chooseSavePath", async (_e, defaultName: string) => {
    const win = getWindow();
    const res = await dialog.showSaveDialog(win!, {
      defaultPath: defaultName,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    return res.canceled ? null : res.filePath;
  });

  // ---- Projects ------------------------------------------------------------
  ipcMain.handle("projects:list", () => {
    const rows = db.prepare("SELECT * FROM projects ORDER BY created_at DESC").all();
    return (rows as Array<Record<string, unknown>>).map(projectDto);
  });

  ipcMain.handle("projects:create", (_e, input: { name: string; clientName?: string; eventDate?: string }) => {
    const id = newId();
    db.prepare(
      "INSERT INTO projects (id, name, client_name, event_date, status, created_at) VALUES (?, ?, ?, ?, 'active', ?)",
    ).run(id, input.name, input.clientName ?? null, input.eventDate ?? null, now());
    return projectDto(db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as Record<string, unknown>);
  });

  ipcMain.handle("projects:get", (_e, id: string) => {
    const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as Record<string, unknown>;
    return row ? projectDto(row) : null;
  });

  ipcMain.handle("projects:remove", (_e, id: string) => {
    db.prepare("DELETE FROM photos WHERE project_id = ?").run(id);
    db.prepare("DELETE FROM albums WHERE project_id = ?").run(id);
    db.prepare("DELETE FROM projects WHERE id = ?").run(id);
  });

  // ---- Photos --------------------------------------------------------------
  ipcMain.handle("photos:import", async (_e, projectId: string, paths: string[]) => {
    let imported = 0;
    let failed = 0;
    const win = getWindow();
    const total = paths.length;
    const send = (p: ImportProgress) => win?.webContents.send("import:progress", p);

    const insert = db.prepare(
      `INSERT INTO photos
       (id, project_id, file_path, filename, width, height, orientation, file_size, mime_type,
        exif_timestamp, quality_score, blur_score, face_count, phash, processing_status, selected,
        thumbnail_path, preview_path, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'ready', 0, ?, ?, ?)`,
    );

    for (let i = 0; i < paths.length; i++) {
      const p = paths[i];
      send({ current: i + 1, total, filename: basename(p), status: "analyzing" });
      try {
        const id = newId();
        const info = await imageInfo(p);
        const analysis = await analyzeImage(p);
        const thumbs = await generateThumbnails(p, cacheDir, id);
        const st = statSync(p);
        const capturedAt = (await extractTimestamp(p)) ?? st.mtime.toISOString();
        insert.run(
          id,
          projectId,
          p,
          basename(p),
          info.width,
          info.height,
          info.orientation,
          st.size,
          MIME_BY_EXT[extname(p).toLowerCase()] ?? "image/jpeg",
          capturedAt,
          analysis.qualityScore,
          analysis.blurScore,
          analysis.phash.toString(),
          thumbs.thumb256,
          thumbs.preview1024,
          now(),
        );
        imported++;
        send({ current: i + 1, total, filename: basename(p), status: "done" });
      } catch {
        failed++;
        send({ current: i + 1, total, filename: basename(p), status: "error" });
      }
    }
    return { imported, failed };
  });

  ipcMain.handle(
    "photos:list",
    (_e, projectId: string, opts: { offset: number; limit: number; selected?: boolean; status?: string; groupId?: string }) => {
      let where = "WHERE project_id = ?";
      const args: unknown[] = [projectId];
      if (opts.selected != null) {
        where += " AND selected = ?";
        args.push(opts.selected ? 1 : 0);
      }
      if (opts.status) {
        where += " AND processing_status = ?";
        args.push(opts.status);
      }
      if (opts.groupId === "__none__") {
        where += " AND group_id IS NULL";
      } else if (opts.groupId) {
        where += " AND group_id = ?";
        args.push(opts.groupId);
      }
      const total = (db.prepare(`SELECT COUNT(*) AS c FROM photos ${where}`).get(...args) as { c: number }).c;
      const rows = db
        .prepare(`SELECT * FROM photos ${where} ORDER BY created_at LIMIT ? OFFSET ?`)
        .all(...args, opts.limit, opts.offset);
      return { items: (rows as Array<Record<string, unknown>>).map(photoDto), total };
    },
  );

  ipcMain.handle("photos:setSelected", (_e, photoId: string, selected: boolean) => {
    db.prepare("UPDATE photos SET selected = ? WHERE id = ?").run(selected ? 1 : 0, photoId);
  });

  ipcMain.handle("photos:remove", (_e, photoId: string) => {
    db.prepare("DELETE FROM photos WHERE id = ?").run(photoId);
  });

  // ---- Groups --------------------------------------------------------------
  function groupsList(projectId: string): PhotoGroup[] {
    const rows = db
      .prepare(
        `SELECT g.*, (SELECT COUNT(*) FROM photos p WHERE p.group_id = g.id) AS photo_count
         FROM photo_groups g WHERE g.project_id = ? ORDER BY g.sort_order`,
      )
      .all(projectId) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: r.id as string,
      projectId: r.project_id as string,
      name: r.name as string,
      color: r.color as string | null,
      sortOrder: r.sort_order as number,
      photoCount: r.photo_count as number,
    }));
  }

  ipcMain.handle("groups:list", (_e, projectId: string) => groupsList(projectId));

  ipcMain.handle("groups:auto", (_e, projectId: string) => {
    db.prepare("DELETE FROM photo_groups WHERE project_id = ?").run(projectId);
    db.prepare("UPDATE photos SET group_id = NULL WHERE project_id = ?").run(projectId);
    const records = photoRecordsFor(db, projectId, "all");
    const segments = segmentByTime(records);
    const upd = db.prepare("UPDATE photos SET group_id = ? WHERE id = ?");
    segments.forEach((seg, i) => {
      const gid = newId();
      db.prepare(
        "INSERT INTO photo_groups (id, project_id, name, sort_order, created_at) VALUES (?, ?, ?, ?, ?)",
      ).run(gid, projectId, `Group ${i + 1}`, i, now());
      for (const p of seg) upd.run(gid, p.id);
    });
    return groupsList(projectId);
  });

  ipcMain.handle("groups:create", (_e, projectId: string, name: string) => {
    const gid = newId();
    const sort = (db.prepare("SELECT COUNT(*) AS c FROM photo_groups WHERE project_id = ?").get(projectId) as { c: number }).c;
    db.prepare(
      "INSERT INTO photo_groups (id, project_id, name, sort_order, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run(gid, projectId, name, sort, now());
    return groupsList(projectId).find((g) => g.id === gid);
  });

  ipcMain.handle("groups:rename", (_e, groupId: string, name: string) => {
    db.prepare("UPDATE photo_groups SET name = ? WHERE id = ?").run(name, groupId);
  });

  ipcMain.handle("groups:remove", (_e, groupId: string) => {
    db.prepare("UPDATE photos SET group_id = NULL WHERE group_id = ?").run(groupId);
    db.prepare("DELETE FROM photo_groups WHERE id = ?").run(groupId);
  });

  ipcMain.handle("groups:assign", (_e, groupId: string, photoIds: string[]) => {
    const upd = db.prepare("UPDATE photos SET group_id = ? WHERE id = ?");
    for (const pid of photoIds) upd.run(groupId, pid);
  });

  ipcMain.handle("groups:merge", (_e, projectId: string, groupIds: string[], name: string) => {
    const gid = newId();
    db.prepare(
      "INSERT INTO photo_groups (id, project_id, name, sort_order, created_at) VALUES (?, ?, ?, 0, ?)",
    ).run(gid, projectId, name, now());
    const upd = db.prepare("UPDATE photos SET group_id = ? WHERE group_id = ?");
    for (const g of groupIds) upd.run(gid, g);
    const del = db.prepare("DELETE FROM photo_groups WHERE id = ?");
    for (const g of groupIds) del.run(g);
    return groupsList(projectId).find((x) => x.id === gid);
  });

  ipcMain.handle(
    "groups:split",
    (_e, projectId: string, groupId: string, photoIds: string[], name: string) => {
      const gid = newId();
      const sort = (db.prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS m FROM photo_groups WHERE project_id = ?").get(projectId) as { m: number }).m;
      db.prepare(
        "INSERT INTO photo_groups (id, project_id, name, sort_order, created_at) VALUES (?, ?, ?, ?, ?)",
      ).run(gid, projectId, name, sort, now());
      const upd = db.prepare("UPDATE photos SET group_id = ? WHERE id = ?");
      for (const pid of photoIds) upd.run(gid, pid);
      return groupsList(projectId).find((x) => x.id === gid);
    },
  );

  ipcMain.handle("groups:clear", (_e, projectId: string) => {
    db.prepare("UPDATE photos SET group_id = NULL WHERE project_id = ?").run(projectId);
    db.prepare("DELETE FROM photo_groups WHERE project_id = ?").run(projectId);
  });

  // ---- Templates -----------------------------------------------------------
  ipcMain.handle("templates:list", () => {
    const rows = db.prepare("SELECT * FROM templates ORDER BY is_system DESC, name").all();
    return (rows as Array<Record<string, unknown>>).map(templateSummaryDto);
  });

  ipcMain.handle("templates:get", (_e, id: string): TemplateDetail | null => {
    const row = db.prepare("SELECT * FROM templates WHERE id = ?").get(id) as Record<string, unknown>;
    if (!row) return null;
    const layouts = db
      .prepare("SELECT * FROM template_layouts WHERE template_id = ? ORDER BY sort_order")
      .all(id) as Array<Record<string, unknown>>;
    return {
      ...templateSummaryDto(row),
      style: JSON.parse((row.style as string) ?? "{}"),
      layouts: layouts.map((l) => ({
        id: l.id as string,
        key: l.key as string,
        name: l.name as string,
        slots: JSON.parse(l.slots as string),
        weight: l.weight as number,
        maxPhotos: l.max_photos as number,
        sortOrder: l.sort_order as number,
      })),
    };
  });

  // ---- Albums --------------------------------------------------------------
  ipcMain.handle("albums:list", (_e, projectId?: string) => {
    const rows = projectId
      ? (db.prepare("SELECT * FROM albums WHERE project_id = ? ORDER BY created_at DESC").all(projectId) as Array<Record<string, unknown>>)
      : (db.prepare("SELECT * FROM albums ORDER BY created_at DESC").all() as Array<Record<string, unknown>>);
    return rows.map((r) => albumById(db, r.id as string));
  });

  ipcMain.handle("albums:get", (_e, id: string) => albumById(db, id));

  ipcMain.handle("albums:generate", (_e, input: GenerateInput): Album[] => {
    const ids = generateAndPersist(db, input);
    return ids.map((id) => albumById(db, id));
  });

  ipcMain.handle("albums:pages", (_e, id: string) => albumPages(db, id));

  ipcMain.handle("albums:recomposePage", (_e, albumId: string, pageId: string, layoutKey: string) => {
    const layout = LAYOUT_CATALOG[layoutKey];
    if (!layout) throw new Error("Unknown layout");
    const album = albumById(db, albumId);
    const aspect = pageAspect(album.pageSize);

    const els = db
      .prepare("SELECT photo_id FROM album_elements WHERE page_id = ? ORDER BY z")
      .all(pageId) as Array<{ photo_id: string | null }>;
    const photos = els.filter((e) => e.photo_id).map((e) => photoRecordById(db, e.photo_id as string));
    const composed = composePage(layout, photos, aspect);

    db.prepare("DELETE FROM album_elements WHERE page_id = ?").run(pageId);
    db.prepare("UPDATE album_pages SET layout_key = ? WHERE id = ?").run(layoutKey, pageId);
    const insert = db.prepare(
      `INSERT INTO album_elements (id, album_id, page_id, type, z, x, y, width, height, rotation, photo_id, crop)
       VALUES (?, ?, ?, 'image', ?, ?, ?, ?, ?, 0, ?, ?)`,
    );
    composed.forEach((el, i) => {
      insert.run(newId(), albumId, pageId, i, el.x, el.y, el.width, el.height, el.photoId, JSON.stringify(el.crop));
    });
    const row = db.prepare("SELECT * FROM album_pages WHERE id = ?").get(pageId) as Record<string, unknown>;
    return pageDto(db, row);
  });

  ipcMain.handle("albums:savePage", (_e, albumId: string, pageId: string, update: PageUpdate) => {
    if (update.layoutKey != null) {
      db.prepare("UPDATE album_pages SET layout_key = ? WHERE id = ?").run(update.layoutKey, pageId);
    }
    if (update.background != null) {
      db.prepare("UPDATE album_pages SET background = ? WHERE id = ?").run(JSON.stringify(update.background), pageId);
    }
    if (update.elements) {
      db.prepare("DELETE FROM album_elements WHERE page_id = ?").run(pageId);
      const insert = db.prepare(
        `INSERT INTO album_elements
         (id, album_id, page_id, type, z, x, y, width, height, rotation, photo_id, crop, text, style)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      update.elements.forEach((el, i) => {
        insert.run(
          newId(), albumId, pageId, el.type, el.z ?? i, el.x, el.y, el.width, el.height,
          el.rotation, el.photoId, el.crop ? JSON.stringify(el.crop) : null,
          el.text ? JSON.stringify(el.text) : null, el.style ? JSON.stringify(el.style) : null,
        );
      });
    }
    const row = db.prepare("SELECT * FROM album_pages WHERE id = ?").get(pageId) as Record<string, unknown>;
    return pageDto(db, row);
  });

  ipcMain.handle("albums:addPage", (_e, albumId: string) => {
    const count = (db.prepare("SELECT COUNT(*) AS c FROM album_pages WHERE album_id = ?").get(albumId) as { c: number }).c;
    const id = newId();
    db.prepare("INSERT INTO album_pages (id, album_id, idx) VALUES (?, ?, ?)").run(id, albumId, count);
    db.prepare("UPDATE albums SET page_count = ? WHERE id = ?").run(count + 1, albumId);
    return pageDto(db, db.prepare("SELECT * FROM album_pages WHERE id = ?").get(id) as Record<string, unknown>);
  });

  ipcMain.handle("albums:duplicatePage", (_e, albumId: string, pageId: string) => {
    const src = db.prepare("SELECT * FROM album_pages WHERE id = ?").get(pageId) as Record<string, unknown>;
    if (!src) throw new Error("Page not found");
    const count = (db.prepare("SELECT COUNT(*) AS c FROM album_pages WHERE album_id = ?").get(albumId) as { c: number }).c;
    const id = newId();
    db.prepare("INSERT INTO album_pages (id, album_id, idx, layout_key, background) VALUES (?, ?, ?, ?, ?)").run(
      id, albumId, count, src.layout_key, src.background,
    );
    const elements = db.prepare("SELECT * FROM album_elements WHERE page_id = ?").all(pageId) as Array<Record<string, unknown>>;
    const insert = db.prepare(
      `INSERT INTO album_elements (id, album_id, page_id, type, z, x, y, width, height, rotation, photo_id, crop, text, style)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const el of elements) {
      insert.run(
        newId(), albumId, id, el.type, el.z, el.x, el.y, el.width, el.height, el.rotation,
        el.photo_id, el.crop, el.text, el.style,
      );
    }
    db.prepare("UPDATE albums SET page_count = ? WHERE id = ?").run(count + 1, albumId);
    return pageDto(db, db.prepare("SELECT * FROM album_pages WHERE id = ?").get(id) as Record<string, unknown>);
  });

  ipcMain.handle("albums:deletePage", (_e, albumId: string, pageId: string) => {
    db.prepare("DELETE FROM album_elements WHERE page_id = ?").run(pageId);
    db.prepare("DELETE FROM album_pages WHERE id = ?").run(pageId);
    const rows = db.prepare("SELECT id FROM album_pages WHERE album_id = ? ORDER BY idx").all(albumId) as Array<{ id: string }>;
    const upd = db.prepare("UPDATE album_pages SET idx = ? WHERE id = ?");
    rows.forEach((r, i) => upd.run(i, r.id));
    db.prepare("UPDATE albums SET page_count = ? WHERE id = ?").run(rows.length, albumId);
  });

  ipcMain.handle("albums:reorderPages", (_e, _albumId: string, pageIds: string[]) => {
    const upd = db.prepare("UPDATE album_pages SET idx = ? WHERE id = ?");
    pageIds.forEach((id, i) => upd.run(i, id));
  });

  ipcMain.handle("albums:versions", (_e, albumId: string) => {
    const rows = db
      .prepare("SELECT id, version_number, created_at FROM album_versions WHERE album_id = ? ORDER BY version_number DESC")
      .all(albumId) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: r.id as string,
      versionNumber: r.version_number as number,
      createdAt: r.created_at as string,
    }));
  });

  ipcMain.handle("albums:snapshot", (_e, albumId: string) => {
    const pages = albumPages(db, albumId);
    const next = (db.prepare("SELECT COALESCE(MAX(version_number), 0) AS m FROM album_versions WHERE album_id = ?").get(albumId) as { m: number }).m + 1;
    const id = newId();
    db.prepare("INSERT INTO album_versions (id, album_id, version_number, layout_json, created_at) VALUES (?, ?, ?, ?, ?)").run(
      id, albumId, next, JSON.stringify({ pages }), now(),
    );
    return { id, versionNumber: next, createdAt: now() };
  });

  ipcMain.handle("albums:restoreVersion", (_e, albumId: string, versionId: string) => {
    const v = db.prepare("SELECT layout_json FROM album_versions WHERE id = ?").get(versionId) as { layout_json: string };
    if (!v) throw new Error("Version not found");
    const { pages } = JSON.parse(v.layout_json) as { pages: AlbumPage[] };

    db.prepare("DELETE FROM album_pages WHERE album_id = ?").run(albumId);
    const insertPage = db.prepare("INSERT INTO album_pages (id, album_id, idx, layout_key, background) VALUES (?, ?, ?, ?, ?)");
    const insertEl = db.prepare(
      `INSERT INTO album_elements (id, album_id, page_id, type, z, x, y, width, height, rotation, photo_id, crop, text, style)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const page of pages) {
      const pid = newId();
      insertPage.run(pid, albumId, page.index, page.layoutKey, page.background ? JSON.stringify(page.background) : null);
      for (const el of page.elements) {
        insertEl.run(
          newId(), albumId, pid, el.type, el.z, el.x, el.y, el.width, el.height, el.rotation,
          el.photoId, el.crop ? JSON.stringify(el.crop) : null,
          el.text ? JSON.stringify(el.text) : null, el.style ? JSON.stringify(el.style) : null,
        );
      }
    }
    db.prepare("UPDATE albums SET page_count = ? WHERE id = ?").run(pages.length, albumId);
    return albumPages(db, albumId);
  });

  // ---- Exports -------------------------------------------------------------
  ipcMain.handle("exports:create", (_e, albumId: string, input: { kind: string; dpi: number; bleedMm: number; targetPath?: string }) => {
    const id = newId();
    db.prepare(
      "INSERT INTO exports (id, album_id, kind, status, settings, created_at) VALUES (?, ?, ?, 'queued', ?, ?)",
    ).run(id, albumId, input.kind, JSON.stringify({ dpi: input.dpi, bleedMm: input.bleedMm }), now());
    void runExport(id, input.targetPath ?? null);
    return exportJobDto(id);
  });

  ipcMain.handle("exports:get", (_e, id: string) => exportJobDto(id));

  function exportJobDto(id: string): ExportJob {
    const row = db.prepare("SELECT * FROM exports WHERE id = ?").get(id) as Record<string, unknown>;
    return {
      id: row.id as string,
      albumId: row.album_id as string,
      kind: row.kind as string,
      status: row.status as string,
      filePath: row.file_path as string | null,
      error: row.error as string | null,
      createdAt: row.created_at as string,
    };
  }

  async function runExport(exportId: string, targetPath: string | null): Promise<void> {
    try {
      const row = db.prepare("SELECT * FROM exports WHERE id = ?").get(exportId) as Record<string, unknown>;
      const album = albumById(db, row.album_id as string);
      const pages = albumPages(db, row.album_id as string);
      const settings = JSON.parse(row.settings as string) as { dpi: number; bleedMm: number };

      const resolvePhoto: PhotoResolver = (photoId) => {
        const p = db.prepare("SELECT file_path, width, height FROM photos WHERE id = ?").get(photoId) as {
          file_path: string;
          width: number;
          height: number;
        };
        if (!p) throw new Error(`Photo ${photoId} not found`);
        return { path: p.file_path, width: p.width, height: p.height };
      };

      const [widthMm, heightMm] = [
        album.pageSize.unit === "in" ? album.pageSize.width * 25.4 : album.pageSize.width,
        album.pageSize.unit === "in" ? album.pageSize.height * 25.4 : album.pageSize.height,
      ];

      const exportPages: ExportPage[] = pages.map((p) => ({
        layoutKey: p.layoutKey,
        background: p.background as { color?: string } | null,
        elements: p.elements.map((el) => ({
          type: el.type,
          photoId: el.photoId,
          x: el.x,
          y: el.y,
          width: el.width,
          height: el.height,
          rotation: el.rotation,
          crop: el.crop,
          text: el.text as { content?: string } | null,
          style: el.style as { color?: string; fontSize?: number } | null,
          z: el.z,
        })),
      }));

      const watermark = row.kind === "proof_pdf" ? "PROOF" : undefined;
      const pdf = await buildPdf(exportPages, resolvePhoto, widthMm, heightMm, settings.dpi, settings.bleedMm, watermark);
      const outPath = targetPath ?? join(dataDir, "exports", `album-${album.id}.pdf`);
      mkdirSync(join(dataDir, "exports"), { recursive: true });
      writeFileSync(outPath, pdf);

      db.prepare("UPDATE exports SET status = 'completed', file_path = ? WHERE id = ?").run(outPath, exportId);
    } catch (e) {
      db.prepare("UPDATE exports SET status = 'failed', error = ? WHERE id = ?").run(String(e), exportId);
    }
  }
}
