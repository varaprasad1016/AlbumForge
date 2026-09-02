/** IPC handlers: the entire application surface exposed to the renderer. */
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { autoUpdater } from "electron-updater";
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import { basename, extname, join } from "path";
import { DB, newId, now } from "./db";
import { analyzeImage, extractGps, extractTimestamp, generateThumbnails, imageInfo } from "./imaging";
import { buildPdf, ExportPage, MatteResolver, PhotoResolver, StockResolver, writeLabPackage } from "./export";
import { buildProofGallery, importFeedback, photoNotes } from "./proofing";
import { albumById, generateAndPersist, pageAspect, photoRecordById, photoRecordsFor } from "./generate";
import { composePage } from "../shared/engine/layoutEngine";
import { isSpreadLayout, LAYOUT_CATALOG } from "../shared/engine/layouts";
import { segmentByTime } from "../shared/engine/grouping";
import { listFonts, readFont } from "./fonts";
import { hasMatte, mattePath, segmentPhoto } from "./segment";
import { suggestForPhotos } from "./recommend";
import { parseSvg, StockService } from "./stock";
import { GenService } from "./gen";
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
  StockDownloadInput,
  TemplateDetail,
  TemplateSummary,
} from "@shared/api";

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".heif": "image/heif",
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
    thumbnailPhotoId: (row.thumbnail_photo_id as string) ?? null,
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
    isSpread: isSpreadLayout(pageRow.layout_key as string | null),
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

  // Auto-update lifecycle → renderer events. We do NOT auto-download: the renderer asks
  // the user first, then triggers downloadUpdate() explicitly.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  // Keep update checks pointed at the public GitHub release feed even when the
  // installer was built without a publish token. electron-builder supplies the
  // same owner/repo metadata, but an explicit feed avoids stale/missing config.
  autoUpdater.setFeedURL({
    provider: "github",
    owner: "varaprasad1016",
    repo: "AlbumForge",
    releaseType: "release",
  });
  const send = (ev: unknown) => getWindow()?.webContents.send("update:event", ev);
  autoUpdater.on("checking-for-update", () => send({ type: "checking" }));
  autoUpdater.on("update-available", (info) => send({ type: "available", version: info.version }));
  autoUpdater.on("update-not-available", () => send({ type: "not-available" }));
  autoUpdater.on("download-progress", (p) => send({ type: "progress", percent: Math.round(p.percent) }));
  autoUpdater.on("update-downloaded", (info) => send({ type: "downloaded", version: info.version }));
  autoUpdater.on("error", (err) => send({ type: "error", message: err?.message ?? String(err) }));

  ipcMain.handle("app:info", () => ({
    version: app.getVersion(),
    author: "Vara",
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
    if (!app.isPackaged) return "Updates are only available in the installed app.";
    try {
      // Clear a previously cached provider response before querying GitHub.
      await autoUpdater.checkForUpdatesAndNotify();
      return "checking";
    } catch (e) {
      return `Update check failed: ${String(e)}`;
    }
  });

  ipcMain.handle("app:downloadUpdate", () => {
    autoUpdater.downloadUpdate().catch(() => {});
  });

  ipcMain.handle("app:installUpdate", () => {
    autoUpdater.quitAndInstall();
  });

  ipcMain.handle("dialogs:chooseImages", async () => {
    const win = getWindow();
    const res = await dialog.showOpenDialog(win!, {
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "Images", extensions: ["jpg", "jpeg", "png", "webp", "heic", "heif", "tif", "tiff"] },
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

  ipcMain.handle("dialogs:chooseDirectory", async () => {
    const win = getWindow();
    const res = await dialog.showOpenDialog(win!, {
      properties: ["openDirectory", "createDirectory"],
    });
    return res.canceled ? null : (res.filePaths[0] ?? null);
  });

  ipcMain.handle("dialogs:chooseFeedback", async () => {
    const win = getWindow();
    const res = await dialog.showOpenDialog(win!, {
      properties: ["openFile"],
      filters: [{ name: "Feedback", extensions: ["json"] }],
    });
    return res.canceled ? null : (res.filePaths[0] ?? null);
  });

  ipcMain.handle("dialogs:chooseAssets", async () => {
    const win = getWindow();
    const res = await dialog.showOpenDialog(win!, {
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Graphics", extensions: ["svg", "png"] }],
    });
    return res.canceled ? null : res.filePaths;
  });

  // ---- Assets (custom graphics) --------------------------------------------
  ipcMain.handle("assets:list", () => {
    const rows = db.prepare("SELECT id, name, kind, data FROM assets ORDER BY created_at").all() as Array<
      Record<string, unknown>
    >;
    return rows.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      kind: r.kind as "svg" | "png",
      dataUri: r.data as string,
    }));
  });

  ipcMain.handle("assets:import", (_e, paths: string[]) => {
    let imported = 0;
    let failed = 0;
    const insert = db.prepare("INSERT INTO assets (id, name, kind, data, created_at) VALUES (?, ?, ?, ?, ?)");
    for (const p of paths) {
      try {
        const st = statSync(p);
        if (st.size > 2 * 1024 * 1024) {
          failed++;
          continue;
        }
        const ext = extname(p).toLowerCase();
        const buf = readFileSync(p);
        let kind: "svg" | "png";
        let dataUri: string;
        if (ext === ".svg") {
          kind = "svg";
          dataUri = `data:image/svg+xml;utf8,${encodeURIComponent(buf.toString("utf8"))}`;
        } else if (ext === ".png") {
          kind = "png";
          dataUri = `data:image/png;base64,${buf.toString("base64")}`;
        } else {
          failed++;
          continue;
        }
        insert.run(newId(), basename(p), kind, dataUri, now());
        imported++;
      } catch {
        failed++;
      }
    }
    return { imported, failed };
  });

  ipcMain.handle("assets:remove", (_e, id: string) => {
    db.prepare("DELETE FROM assets WHERE id = ?").run(id);
  });

  // ---- Designs (reusable page designs) -------------------------------------
  ipcMain.handle("designs:list", () => {
    const rows = db.prepare("SELECT id, name, created_at FROM designs ORDER BY created_at DESC").all() as Array<
      Record<string, unknown>
    >;
    return rows.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      createdAt: r.created_at as string,
    }));
  });

  ipcMain.handle("designs:save", (_e, name: string, page: unknown) => {
    const id = newId();
    db.prepare("INSERT INTO designs (id, name, layout_json, created_at) VALUES (?, ?, ?, ?)").run(
      id,
      name,
      JSON.stringify(page),
      now(),
    );
    return { id, name, createdAt: now() };
  });

  ipcMain.handle("designs:get", (_e, id: string) => {
    const row = db.prepare("SELECT layout_json FROM designs WHERE id = ?").get(id) as
      | { layout_json: string }
      | undefined;
    return row ? JSON.parse(row.layout_json) : null;
  });

  ipcMain.handle("designs:remove", (_e, id: string) => {
    db.prepare("DELETE FROM designs WHERE id = ?").run(id);
  });

  // ---- AI design recommendation (local palette + event rules) --------------
  ipcMain.handle("recommend:suggest", async (_e, photoIds: string[], eventType: string) => {
    const paths: string[] = [];
    if (photoIds.length > 0) {
      const placeholders = photoIds.map(() => "?").join(",");
      const rows = db
        .prepare(`SELECT preview_path FROM photos WHERE id IN (${placeholders})`)
        .all(...photoIds) as Array<{ preview_path: string | null }>;
      for (const r of rows) {
        if (r.preview_path) paths.push(r.preview_path);
      }
    }
    return suggestForPhotos(paths, eventType, listFonts().map((f) => f.family));
  });

  // ---- Module 7: external stock asset search (Freepik proxy) ----------------
  const stockService = new StockService({ db, cacheDir, dataDir });
  ipcMain.handle("stock:configured", () => stockService.isConfigured());
  ipcMain.handle("stock:provider", () => stockService.provider());
  ipcMain.handle("stock:setProvider", (_e, p: string) => stockService.setProvider(p));
  ipcMain.handle("stock:setApiKey", (_e, provider: string, key: string) => stockService.setApiKey(provider, key));
  ipcMain.handle("stock:recent", (_e, limit?: number) => stockService.recent(limit));
  ipcMain.handle("stock:search", (_e, term: string, kind: "vector" | "bitmap") =>
    stockService.search(term, kind),
  );
  ipcMain.handle("stock:download", (_e, providerId: string, input?: StockDownloadInput) =>
    stockService.download(providerId, input),
  );
  ipcMain.handle("stock:parseSvg", (_e, svg: string) => parseSvg(svg));

  // ---- AI element generation (text → graphic, saved to the assets library) --
  const genService = new GenService({ db, cacheDir, dataDir });
  ipcMain.handle("gen:configured", () => genService.configured());
  ipcMain.handle("gen:provider", () => genService.provider());
  ipcMain.handle("gen:setProvider", (_e, p: string) => genService.setProvider(p));
  ipcMain.handle("gen:setApiKey", (_e, provider: string, key: string) => genService.setApiKey(provider, key));
  ipcMain.handle("gen:generate", (_e, prompt: string, opts?: { width?: number; height?: number }) =>
    genService.generate(prompt, opts),
  );

  // ---- Subject segmentation (on-device background removal) -----------------
  ipcMain.handle("photos:segment", async (_e, photoId: string) => {
    const row = db.prepare("SELECT file_path FROM photos WHERE id = ?").get(photoId) as
      | { file_path: string }
      | undefined;
    if (!row) return { ok: false, error: "Photo not found" };
    if (hasMatte(cacheDir, photoId)) return { ok: true, cached: true };
    try {
      await segmentPhoto(row.file_path, cacheDir, photoId);
      db.prepare(
        "INSERT INTO subject_mattes (photo_id, matte_path, created_at) VALUES (?, ?, ?)",
      ).run(photoId, mattePath(cacheDir, photoId), now());
      return { ok: true, cached: false };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  // ---- Client proofing -----------------------------------------------------
  ipcMain.handle("proofs:build", (_e, albumId: string, targetDir: string) => {
    return buildProofGallery(db, albumId, targetDir);
  });

  ipcMain.handle("proofs:importFeedback", (_e, projectId: string, filePath: string) => {
    return importFeedback(db, projectId, filePath);
  });

  ipcMain.handle("proofs:notes", (_e, projectId: string) => {
    return photoNotes(db, projectId);
  });

  // ---- Projects ------------------------------------------------------------
  ipcMain.handle("projects:list", () => {
    const rows = db.prepare("SELECT * FROM projects ORDER BY created_at DESC").all() as Array<
      Record<string, unknown>
    >;
    const photoExists = db.prepare("SELECT 1 FROM photos WHERE id = ? LIMIT 1");
    const bestPhoto = db.prepare(
      "SELECT id FROM photos WHERE project_id = ? AND quality_score IS NOT NULL ORDER BY quality_score DESC, id ASC LIMIT 1",
    );
    const anyPhoto = db.prepare("SELECT id FROM photos WHERE project_id = ? ORDER BY id ASC LIMIT 1");
    const pinThumb = db.prepare("UPDATE projects SET thumbnail_photo_id = ? WHERE id = ?");
    const clearThumb = db.prepare("UPDATE projects SET thumbnail_photo_id = NULL WHERE id = ?");
    return rows.map((r) => {
      let thumb: string | null = (r.thumbnail_photo_id as string) ?? null;
      if (thumb && !photoExists.get(thumb)) {
        thumb = null;
        clearThumb.run(r.id);
      }
      if (!thumb) {
        const p = (bestPhoto.get(r.id) ?? anyPhoto.get(r.id)) as { id: string } | undefined;
        thumb = p?.id ?? null;
        if (thumb) pinThumb.run(thumb, r.id);
      }
      return { ...projectDto(r), thumbnailPhotoId: thumb };
    });
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

  ipcMain.handle("projects:setThumbnail", (_e, projectId: string, photoId: string) => {
    db.prepare("UPDATE projects SET thumbnail_photo_id = ? WHERE id = ?").run(photoId, projectId);
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
        thumbnail_path, preview_path, latitude, longitude, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'ready', 0, ?, ?, ?, ?, ?)`,
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
        const gps = await extractGps(p);
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
          gps?.latitude ?? null,
          gps?.longitude ?? null,
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
    (_e, projectId: string, opts: {
      offset: number;
      limit: number;
      selected?: boolean;
      status?: string;
      groupId?: string;
      query?: string;
      sort?: "created" | "captured";
    }) => {
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
      if (opts.query && opts.query.trim()) {
        where += " AND filename LIKE ?";
        args.push(`%${opts.query.trim()}%`);
      }
      const orderBy =
        opts.sort === "captured" ? "ORDER BY exif_timestamp IS NULL, exif_timestamp" : "ORDER BY created_at";
      const total = (db.prepare(`SELECT COUNT(*) AS c FROM photos ${where}`).get(...args) as { c: number }).c;
      const rows = db
        .prepare(`SELECT * FROM photos ${where} ${orderBy} LIMIT ? OFFSET ?`)
        .all(...args, opts.limit, opts.offset);
      return { items: (rows as Array<Record<string, unknown>>).map(photoDto), total };
    },
  );

  ipcMain.handle("photos:setSelected", (_e, photoId: string, selected: boolean) => {
    db.prepare("UPDATE photos SET selected = ? WHERE id = ?").run(selected ? 1 : 0, photoId);
  });

  ipcMain.handle("photos:geo", (_e, projectId: string) => {
    const rows = db
      .prepare(
        `SELECT id, filename, latitude, longitude, exif_timestamp
         FROM photos
         WHERE project_id = ? AND latitude IS NOT NULL AND longitude IS NOT NULL
         ORDER BY exif_timestamp`,
      )
      .all(projectId) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: r.id as string,
      filename: r.filename as string,
      latitude: r.latitude as number,
      longitude: r.longitude as number,
      takenAt: (r.exif_timestamp as string) ?? null,
    }));
  });

  ipcMain.handle("photos:remove", (_e, photoId: string) => {
    db.prepare("UPDATE projects SET thumbnail_photo_id = NULL WHERE thumbnail_photo_id = ?").run(photoId);
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
  ipcMain.handle("fonts:list", () => listFonts().map((f) => f.family));

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
    const aspect = pageAspect(album.pageSize) * (isSpreadLayout(layoutKey) ? 2 : 1);

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
          // Keep the client's element id stable across saves — regenerating ids
          // here unmounts every Konva node on the next render (keys change) and
          // breaks an in-flight drag right after inserting an element.
          el.id ?? newId(), albumId, pageId, el.type, el.z ?? i, el.x, el.y, el.width, el.height,
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
  ipcMain.handle(
    "exports:create",
    (
      _e,
      albumId: string,
      input: { kind: string; dpi: number; bleedMm: number; colorMode?: "rgb" | "cmyk"; presetId?: string; targetPath?: string },
    ) => {
      const id = newId();
      db.prepare(
        "INSERT INTO exports (id, album_id, kind, status, settings, created_at) VALUES (?, ?, ?, 'queued', ?, ?)",
      ).run(
        id,
        albumId,
        input.kind,
        JSON.stringify({
          dpi: input.dpi,
          bleedMm: input.bleedMm,
          colorMode: input.colorMode ?? "rgb",
          presetId: input.presetId ?? null,
        }),
        now(),
      );
      void runExport(id, input.targetPath ?? null);
      return exportJobDto(id);
    },
  );

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
      const settings = JSON.parse(row.settings as string) as {
        dpi: number;
        bleedMm: number;
        colorMode?: "rgb" | "cmyk";
      };

      const resolvePhoto: PhotoResolver = (photoId) => {
        const p = db.prepare("SELECT file_path, width, height FROM photos WHERE id = ?").get(photoId) as {
          file_path: string;
          width: number;
          height: number;
        };
        if (!p) throw new Error(`Photo ${photoId} not found`);
        return { path: p.file_path, width: p.width, height: p.height };
      };

      const resolveMatte: MatteResolver = (photoId) => {
        const m = db
          .prepare("SELECT matte_path FROM subject_mattes WHERE photo_id = ?")
          .get(photoId) as { matte_path: string } | undefined;
        return m?.matte_path ?? null;
      };

      const resolveStock: StockResolver = (providerId) => {
        const r = db
          .prepare("SELECT local_path FROM stock_assets WHERE provider_id = ?")
          .get(providerId) as { local_path: string } | undefined;
        return r ? { path: r.local_path } : null;
      };

      const [widthMm, heightMm] = [
        album.pageSize.unit === "in" ? album.pageSize.width * 25.4 : album.pageSize.width,
        album.pageSize.unit === "in" ? album.pageSize.height * 25.4 : album.pageSize.height,
      ];

      const exportPages: ExportPage[] = pages.map((p) => ({
        layoutKey: p.layoutKey,
        background: p.background as { color?: string; pattern?: string } | null,
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
      const colorMode = settings.colorMode ?? "rgb";

      if (row.kind === "lab_package") {
        if (!targetPath) throw new Error("Choose a destination folder for the lab package.");
        const outPath = await writeLabPackage(
          exportPages,
          resolvePhoto,
          widthMm,
          heightMm,
          settings.dpi,
          settings.bleedMm,
          colorMode,
          targetPath,
          album.name,
          (family) => readFont(family),
          resolveMatte,
          resolveStock,
        );
        db.prepare("UPDATE exports SET status = 'completed', file_path = ? WHERE id = ?").run(outPath, exportId);
        return;
      }

      const pdf = await buildPdf(
        exportPages,
        resolvePhoto,
        widthMm,
        heightMm,
        settings.dpi,
        settings.bleedMm,
        watermark,
        (family) => readFont(family),
        resolveMatte,
        resolveStock,
      );
      const outPath = targetPath ?? join(dataDir, "exports", `album-${album.id}.pdf`);
      mkdirSync(join(dataDir, "exports"), { recursive: true });
      writeFileSync(outPath, pdf);

      db.prepare("UPDATE exports SET status = 'completed', file_path = ? WHERE id = ?").run(outPath, exportId);
    } catch (e) {
      db.prepare("UPDATE exports SET status = 'failed', error = ? WHERE id = ?").run(String(e), exportId);
    }
  }
}
