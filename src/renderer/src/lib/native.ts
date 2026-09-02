/**
 * Typed bridge to the native backend.
 *
 * The renderer never touches host APIs directly. Every heavy operation is a
 * typed call on `native`, which goes over Tauri's IPC channel through the
 * official `@tauri-apps/api` (`invoke`/`listen`).
 *
 * Keep the DTOs below byte-for-byte aligned with the Rust serde structs in
 * `src-tauri/src/core/*` (`#[serde(rename_all = "camelCase")]`).
 *
 * When running inside the Electron shell (no `__TAURI_INTERNALS__`) calls
 * reject with a clear message so a mis-wired screen fails loudly instead of
 * silently no-op'ing. Electron screens talk to `window.albumforge` directly
 * until the Phase-2 Backend adapter unifies them behind one interface.
 */

/* ---------- types (mirror the Rust serde structs, camelCase) ---------- */

export interface ScannedPhoto {
  path: string;
  filename: string;
  width: number;
  height: number;
  /** EXIF orientation tag (1 = as-is). Applied by the proxy/export stages. */
  orientation: number;
  fileSize: number;
  /** EXIF DateTimeOriginal, ISO-8601 when available. */
  takenAt: string | null;
  /** Camera make/model + ISO (gear-based grouping, smart-album ordering). */
  cameraMake: string | null;
  cameraModel: string | null;
  iso: number | null;
  latitude: number | null;
  longitude: number | null;
}

export interface ScanProgress {
  current: number;
  total: number;
}

export interface ProxyInfo {
  photoPath: string;
  proxyPath: string;
  width: number;
  height: number;
}

export interface ExportFilters {
  exposure: number;
  contrast: number;
  saturation: number;
}

export interface ExportCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExportElement {
  kind: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  src: string | null;
  crop: ExportCrop | null;
  filters: ExportFilters;
}

export interface ExportPage {
  widthPx: number;
  heightPx: number;
  elements: ExportElement[];
}

export interface ExportJobInput {
  pages: ExportPage[];
  dpi: number;
  outDir: string;
}

export interface ExportResult {
  pdfPath: string;
  pages: number;
}

/* ---------- host detection + invoke/listen via @tauri-apps/api ---------- */

import { convertFileSrc, invoke as tauriInvoke } from "@tauri-apps/api/core";
import { listen as tauriListen } from "@tauri-apps/api/event";
import { check as updaterCheck, type Update as UpdaterUpdate } from "@tauri-apps/plugin-updater";
import type {
  Album,
  AlbumPage,
  AlbumVersion,
  AppInfo,
  DesignAsset,
  DesignPageData,
  ExportJob,
  ImportProgress,
  ImportResult,
  PageDesign,
  PageSize,
  PageUpdate,
  Photo,
  PhotoGroup,
  Project,
  StockDownloadInput,
  StockSearchResult,
  ArchiveSummary,
  LicenseActivateResult,
  LicenseStatus,
  PrintQuote,
  PrintQuoteInput,
  PrintSpec,
  TemplateDetail,
  TemplateSummary,
  UpdateEvent,
} from "@shared/api";

/** `photos:list` filters — mirrors `PhotoListOpts` in `src-tauri/src/core/db.rs`. */
export interface PhotoListOpts {
  offset: number;
  limit: number;
  selected?: boolean;
  status?: string;
  groupId?: string;
  query?: string;
  sort?: "created" | "captured";
}

export interface PhotoListResponse {
  items: Photo[];
  total: number;
}

/** `projects:create` input — mirrors `CreateProjectInput` in `commands.rs`. */
export interface CreateProjectInput {
  name: string;
  clientName?: string;
  eventDate?: string;
}

/** Engine photo row (`photos:records`) — mirrors `PhotoRecord` in `db.rs`.
 *  `phash` is a decimal string (BigInt cannot cross IPC); `takenAt` is epoch
 *  seconds. The album-generation module rehydrates these into engine records.
 */
export interface PhotoRecordRow {
  id: string;
  width: number;
  height: number;
  orientation: string;
  qualityScore: number;
  blurScore: number;
  phash: string;
  takenAt: number | null;
  groupId: string | null;
}

/** One engine element to persist — mirrors `GeneratedElement` in `library.rs`. */
export interface GeneratedElement {
  type: string;
  z: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  photoId: string | null;
  crop: Record<string, unknown> | null;
  text: Record<string, unknown> | null;
  style: Record<string, unknown> | null;
}

/** `albums:saveGenerated` input — mirrors `AlbumPersistInput` in `library.rs`. */
export interface AlbumPersistInput {
  projectId: string;
  templateId: string;
  name: string;
  pageSize: PageSize;
  variation: number;
  background?: string;
  pattern?: string | null;
  pages: Array<{ layoutKey: string; elements: GeneratedElement[] }>;
}

/** `app_dirs` answer — mirrors `AppDirs` in `commands.rs` (camelCase). */
export interface AppDirs {
  cacheDir: string;
  dataDir: string;
}

/** Native `stock:download` answer — mirrors `StockDownloadRaw` in `stock.rs`.
 *  Vector assets carry the raw SVG text; the backend seam parses it with the
 *  shared `parseSvg` so Electron and the native shell agree byte-for-byte. */
export interface StockDownloadRaw {
  providerId: string;
  kind: string;
  width: number | null;
  height: number | null;
  svg: string | null;
  title: string;
  author: string | null;
  attributionRequired: boolean;
  fromCache: boolean;
}

/** One photo's raw-RGB preview sample — mirrors `PhotoPalette` in `palette.rs`. */
export interface PhotoPaletteRow {
  id: string;
  rgb: string;
}

let appDirsPromise: Promise<AppDirs> | null = null;

/** True when running inside the Tauri shell (native backend present). */
function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!inTauri()) {
    return Promise.reject(
      new Error(
        `native command "${cmd}" unavailable — run through the Tauri shell (npm run dev:native)`,
      ),
    );
  }
  return tauriInvoke<T>(cmd, args);
}

/** Subscribe to a native event; the returned function unsubscribes. */
function listen<T>(event: string, handler: (payload: T) => void): () => void {
  let disposed = false;
  let unlisten: (() => void) | undefined;
  void tauriListen<T>(event, (e) => {
    if (!disposed) handler(e.payload);
  }).then((u) => {
    if (disposed) u();
    else unlisten = u;
  });
  return () => {
    disposed = true;
    unlisten?.();
  };
}

/* ---------- public API ---------- */

export const native = {
  /** Scan a folder; `onProgress` fires live during the walk. */
  scanFolder(dir: string, onProgress: (p: ScanProgress) => void): Promise<ScannedPhoto[]> {
    const stop = listen<ScanProgress>("scanner-progress", onProgress);
    return invoke<ScannedPhoto[]>("scan_folder", { dir }).finally(stop);
  },

  /**
   * Generate editor proxies (lossy JPEG q85, long edge ≤ `maxDim` px) for
   * originals on the native low-priority background pool; `onProgress` fires
   * per file. Already-cached sources are skipped (idempotent re-imports).
   */
  generateProxies(
    paths: string[],
    onProgress: (p: ScanProgress & { filename: string }) => void,
    maxDim?: number,
  ): Promise<ProxyInfo[]> {
    const stop = listen("proxy-progress", onProgress);
    return invoke<ProxyInfo[]>("generate_proxies", { paths, maxDim: maxDim ?? 2048 }).finally(stop);
  },

  /** Resolve the cached proxy path for a source file. */
  proxyPath(photoPath: string): Promise<string> {
    return invoke<string>("proxy_path", { photoPath });
  },

  /** Headless 300 DPI export from a JSON layout state. */
  exportAlbum(job: ExportJobInput): Promise<ExportResult> {
    return invoke<ExportResult>("export_album", { job });
  },

  /**
   * Wrap an absolute file path in a scoped `asset://` URL served by the
   * native asset protocol (config scope: `$APPCACHE/**` + `$APPDATA/**`).
   * Platform-aware: `convertFileSrc` returns `http://asset.localhost/…` on
   * Windows/Android (WebView2 can't fetch a bare `asset://` scheme) and
   * `asset://localhost/…` on macOS/Linux.
   */
  assetUrl(filePath: string): string {
    return convertFileSrc(filePath);
  },

  /** Resolve the app cache/data dirs — resolved once, cached for the process. */
  appDirs(): Promise<AppDirs> {
    if (!appDirsPromise) appDirsPromise = invoke<AppDirs>("app_dirs");
    return appDirsPromise;
  },

  /* ---- Phase-4 dialogs (parity with Electron `dialog` IPC handlers) ---- */

  dialogs: {
    /** Multi-select image files for import; null when canceled. */
    chooseImages(): Promise<string[] | null> {
      return invoke<string[] | null>("choose_images");
    },
    /** Save dialog for a PDF path; null when canceled. */
    chooseSavePath(defaultName: string): Promise<string | null> {
      return invoke<string | null>("choose_save_path", { defaultName });
    },
    /** Folder picker; null when canceled. */
    chooseDirectory(): Promise<string | null> {
      return invoke<string | null>("choose_directory");
    },
    /** Single JSON feedback file; null when canceled. */
    chooseFeedback(): Promise<string | null> {
      return invoke<string | null>("choose_feedback");
    },
    /** Multi-select SVG/PNG graphics for the asset library; null when canceled. */
    chooseAssets(): Promise<string[] | null> {
      return invoke<string[] | null>("choose_assets");
    },
  },

  /* ---- Phase-4 library services (groups/templates/fonts/albums CRUD) ---- */

  groups: {
    /** Chronological event segmentation (parity with Electron `groups:auto`). */
    auto(projectId: string): Promise<PhotoGroup[]> {
      return invoke<PhotoGroup[]>("groups_auto", { projectId });
    },
    list(projectId: string): Promise<PhotoGroup[]> {
      return invoke<PhotoGroup[]>("groups_list", { projectId });
    },
    create(projectId: string, name: string): Promise<PhotoGroup> {
      return invoke<PhotoGroup>("groups_create", { projectId, name });
    },
    rename(groupId: string, name: string): Promise<void> {
      return invoke<void>("groups_rename", { groupId, name });
    },
    remove(groupId: string): Promise<void> {
      return invoke<void>("groups_remove", { groupId });
    },
    assign(groupId: string, photoIds: string[]): Promise<void> {
      return invoke<void>("groups_assign", { groupId, photoIds });
    },
    merge(projectId: string, groupIds: string[], name: string): Promise<PhotoGroup> {
      return invoke<PhotoGroup>("groups_merge", { projectId, groupIds, name });
    },
    split(projectId: string, groupId: string, photoIds: string[], name: string): Promise<PhotoGroup> {
      return invoke<PhotoGroup>("groups_split", { projectId, groupId, photoIds, name });
    },
    clear(projectId: string): Promise<void> {
      return invoke<void>("groups_clear", { projectId });
    },
  },

  templates: {
    list(): Promise<TemplateSummary[]> {
      return invoke<TemplateSummary[]>("templates_list");
    },
    get(id: string): Promise<TemplateDetail | null> {
      return invoke<TemplateDetail | null>("templates_get", { id });
    },
  },

  fonts: {
    /** Font families on disk (bundled + user fonts). */
    list(): Promise<string[]> {
      return invoke<string[]>("fonts_list");
    },
  },

  albums: {
    list(projectId?: string): Promise<Album[]> {
      return invoke<Album[]>("albums_list", { projectId: projectId ?? null });
    },
    get(id: string): Promise<Album> {
      return invoke<Album>("albums_get", { id });
    },
    pages(id: string): Promise<AlbumPage[]> {
      return invoke<AlbumPage[]>("albums_pages", { id });
    },
    savePage(albumId: string, pageId: string, update: PageUpdate): Promise<AlbumPage> {
      return invoke<AlbumPage>("albums_save_page", { albumId, pageId, update });
    },
    addPage(albumId: string): Promise<AlbumPage> {
      return invoke<AlbumPage>("albums_add_page", { albumId });
    },
    duplicatePage(albumId: string, pageId: string): Promise<AlbumPage> {
      return invoke<AlbumPage>("albums_duplicate_page", { albumId, pageId });
    },
    deletePage(albumId: string, pageId: string): Promise<void> {
      return invoke<void>("albums_delete_page", { albumId, pageId });
    },
    reorderPages(albumId: string, pageIds: string[]): Promise<void> {
      return invoke<void>("albums_reorder_pages", { albumId, pageIds });
    },
    versions(albumId: string): Promise<AlbumVersion[]> {
      return invoke<AlbumVersion[]>("albums_versions", { albumId });
    },
    snapshot(albumId: string): Promise<AlbumVersion> {
      return invoke<AlbumVersion>("albums_snapshot", { albumId });
    },
    restoreVersion(albumId: string, versionId: string): Promise<AlbumPage[]> {
      return invoke<AlbumPage[]>("albums_restore_version", { albumId, versionId });
    },
    /** Persist one engine-generated album (Phase 4 item 3; renderer drives the
     *  pure-TS engine, Rust stores the result — `persistAlbum` parity). */
    saveGenerated(input: AlbumPersistInput): Promise<Album> {
      return invoke<Album>("albums_save_generated", { input });
    },
  },

  /* ---- Phase-4 exports / designs / proofs + app services ---- */

  exports: {
    create(
      albumId: string,
      input: {
        kind: string;
        dpi: number;
        bleedMm: number;
        colorMode?: "rgb" | "cmyk";
        presetId?: string | null;
        targetPath?: string | null;
      },
    ): Promise<ExportJob> {
      return invoke<ExportJob>("exports_create", { albumId, input });
    },
    get(id: string): Promise<ExportJob> {
      return invoke<ExportJob>("exports_get", { id });
    },
  },

  designs: {
    list(): Promise<PageDesign[]> {
      return invoke<PageDesign[]>("designs_list");
    },
    save(name: string, page: DesignPageData): Promise<PageDesign> {
      return invoke<PageDesign>("designs_save", { name, page });
    },
    get(id: string): Promise<DesignPageData | null> {
      return invoke<DesignPageData | null>("designs_get", { id });
    },
    remove(id: string): Promise<void> {
      return invoke<void>("designs_remove", { id });
    },
  },

  proofs: {
    build(albumId: string, targetDir: string): Promise<{ dir: string; photos: number }> {
      return invoke<{ dir: string; photos: number }>("proofs_build", { albumId, targetDir });
    },
    importFeedback(
      projectId: string,
      filePath: string,
    ): Promise<{ favorited: number; commented: number }> {
      return invoke<{ favorited: number; commented: number }>("proofs_import_feedback", {
        projectId,
        filePath,
      });
    },
    notes(projectId: string): Promise<Array<{ photoId: string; filename: string; comment: string }>> {
      return invoke<Array<{ photoId: string; filename: string; comment: string }>>("proofs_notes", {
        projectId,
      });
    },
  },

  app: {
    info(): Promise<AppInfo> {
      return invoke<AppInfo>("app_info");
    },
    openPath(path: string): Promise<void> {
      return invoke<void>("app_open_path", { path });
    },
    openDataFolder(): Promise<void> {
      return invoke<void>("app_open_data_folder");
    },
    clearCache(): Promise<void> {
      return invoke<void>("app_clear_cache");
    },
  },

  /* ---- Phase-3 storage commands (rusqlite, parity with Electron IPC) ---- */

  projects: {
    /** List projects (thumbnail pinned like Electron `projects:list`). */
    list(): Promise<Project[]> {
      return invoke<Project[]>("projects_list");
    },
    /** Create a project (Electron `projects:create` parity). */
    create(input: CreateProjectInput): Promise<Project> {
      return invoke<Project>("projects_create", { input });
    },
  },

  photos: {
    /**
     * Import originals: native metadata + `<id>-thumb256.jpg` /
     * `<id>-preview1024.jpg` proxies + `'ready'` rows (Electron parity).
     * Live progress arrives via `onImportProgress` subscribers.
     */
    importPhotos(projectId: string, paths: string[]): Promise<ImportResult> {
      return invoke<ImportResult>("photos_import", { projectId, paths });
    },

    /** Paginated grid (Electron `photos:list` filter/sort parity). */
    list(projectId: string, opts: PhotoListOpts): Promise<PhotoListResponse> {
      return invoke<PhotoListResponse>("photos_list", { projectId, opts });
    },

    /** Subscribe to global `import-progress` events; returns an unsubscribe. */
    onImportProgress(cb: (p: ImportProgress) => void): () => void {
      return listen<ImportProgress>("import-progress", cb);
    },

    /** Engine-ready records for album generation (Phase 4 item 3). */
    records(projectId: string, mode: string): Promise<PhotoRecordRow[]> {
      return invoke<PhotoRecordRow[]>("photos_records", { projectId, mode });
    },

    /**
     * Raw-RGB preview samples (base64, ≤64 px fit-inside) for a set of photo
     * ids — the native sampler feeding the renderer's shared recommend engine
     * (`recommendGen.ts` mirrors Electron's `sharp` `extractPalette`).
     */
    palettes(photoIds: string[]): Promise<PhotoPaletteRow[]> {
      return invoke<PhotoPaletteRow[]>("photos_palettes", { photoIds });
    },
  },

  /* ---- Phase 4/6 pull-forward: assets / stock / gen (Electron parity) ---- */

  assets: {
    list(): Promise<DesignAsset[]> {
      return invoke<DesignAsset[]>("assets_list");
    },
    importAssets(paths: string[]): Promise<ImportResult> {
      return invoke<ImportResult>("assets_import", { paths });
    },
    remove(id: string): Promise<void> {
      return invoke<void>("assets_remove", { id });
    },
  },

  stock: {
    configured(): Promise<boolean> {
      return invoke<boolean>("stock_configured");
    },
    provider(): Promise<string> {
      return invoke<string>("stock_provider");
    },
    setProvider(provider: string): Promise<boolean> {
      return invoke<boolean>("stock_set_provider", { provider });
    },
    /** Key goes to the OS keychain (secrets.rs) — never crosses to disk. */
    setApiKey(provider: string, key: string): Promise<boolean> {
      return invoke<boolean>("stock_set_api_key", { provider, key });
    },
    recent(limit?: number): Promise<string[]> {
      return invoke<string[]>("stock_recent", { limit: limit ?? null });
    },
    search(
      term: string,
      kind: "vector" | "bitmap",
    ): Promise<{ items: StockSearchResult[]; cached: boolean }> {
      return invoke<{ items: StockSearchResult[]; cached: boolean }>("stock_search", {
        term,
        kind,
      });
    },
    /** Raw download — `svg` text for vector assets, parsed by the seam. */
    download(providerId: string, input?: StockDownloadInput): Promise<StockDownloadRaw> {
      return invoke<StockDownloadRaw>("stock_download", { providerId, input: input ?? null });
    },
  },

  gen: {
    configured(): Promise<boolean> {
      return invoke<boolean>("gen_configured");
    },
    provider(): Promise<string> {
      return invoke<string>("gen_provider");
    },
    setProvider(provider: string): Promise<boolean> {
      return invoke<boolean>("gen_set_provider", { provider });
    },
    /** BFL key to the OS keychain (secrets.rs); pollinations needs no key. */
    setApiKey(key: string): Promise<boolean> {
      return invoke<boolean>("gen_set_api_key", { key });
    },
    generate(
      prompt: string,
      opts?: { width?: number; height?: number },
    ): Promise<{ ok: boolean; asset?: { id: string; name: string; kind: "png"; dataUri: string }; error?: string }> {
      return invoke<{
        ok: boolean;
        asset?: { id: string; name: string; kind: "png"; dataUri: string };
        error?: string;
      }>("gen_generate", { prompt, opts: opts ?? null });
    },
  },

  /* ---- updates (electron-updater parity, driven by tauri-plugin-updater) ---- */

  updates: {
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    onUpdateEvent,
  },

  /* ---- commercial suite (blueprint §10 / MIGRATION Phase 9) ---- */

  license: {
    /** Pure local verdict — signature, seat binding, 7-day offline window. */
    status(): Promise<LicenseStatus> {
      return invoke<LicenseStatus>("license_status");
    },
    activate(key: string): Promise<LicenseActivateResult> {
      return invoke<LicenseActivateResult>("license_activate", { key });
    },
    deactivate(): Promise<void> {
      return invoke<void>("license_deactivate");
    },
  },

  print: {
    quote(input: PrintQuoteInput): Promise<PrintQuote> {
      return invoke<PrintQuote>("print_quote", { input });
    },
    payload(
      layout: unknown,
      spec: PrintSpec,
    ): Promise<{ manifest: unknown; prodigi: unknown; gelato: unknown }> {
      return invoke("print_payload", { layout, spec });
    },
  },

  project: {
    saveAlbumFile(targetPath: string, layout: unknown): Promise<ArchiveSummary> {
      return invoke<ArchiveSummary>("project_save_album_file", { targetPath, layout });
    },
    autosave(draftId: string, layout: unknown): Promise<void> {
      return invoke<void>("project_autosave", { draftId, layout });
    },
    recover(draftId: string): Promise<unknown | null> {
      return invoke<unknown | null>("project_recover", { draftId });
    },
    clearRecovery(draftId: string): Promise<void> {
      return invoke<void>("project_clear_recovery", { draftId });
    },
  },

  errors: {
    report(message: string): Promise<void> {
      return invoke<void>("errors_report", { message });
    },
    lastCrash(): Promise<string | null> {
      return invoke<string | null>("errors_last_crash");
    },
  },
};

/* ------------------------------------------------------------------ */
/* Updates — mirrors src/main/ipc.ts `app:checkForUpdates` semantics:
 * no auto-download (the Settings page asks first), events flow through the
 * shared `UpdateEvent` shape, and on Windows `install()` quits into the NSIS
 * installer exactly like electron-updater's `quitAndInstall`. The update is
 * hosted on the same GitHub Releases feed electron-builder publishes to.
 * ------------------------------------------------------------------ */

let pendingUpdate: UpdaterUpdate | null = null;
let downloadedBytes = 0;
let totalBytes = 0;
const updateListeners = new Set<(e: UpdateEvent) => void>();

function emitUpdate(e: UpdateEvent): void {
  for (const cb of updateListeners) cb(e);
}

/** Packaged builds run on the custom protocol (`tauri://` / http://tauri.localhost);
 *  the dev shell serves from `http://localhost:5173`. */
function nativePackaged(): boolean {
  try {
    const u = new URL(window.location.href);
    return u.protocol.startsWith("tauri") || u.hostname === "tauri.localhost";
  } catch {
    return false;
  }
}

function runtimeAvailable(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function checkForUpdates(): Promise<string> {
  if (!runtimeAvailable() || !nativePackaged()) {
    return "Updates are only available in the installed app.";
  }
  try {
    emitUpdate({ type: "checking" });
    const update = await updaterCheck();
    if (!update) {
      pendingUpdate = null;
      emitUpdate({ type: "not-available" });
      return "checking";
    }
    pendingUpdate = update;
    downloadedBytes = 0;
    totalBytes = 0;
    emitUpdate({ type: "available", version: update.version });
    return "checking";
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    emitUpdate({ type: "error", message: msg });
    return `Update check failed: ${msg}`;
  }
}

async function downloadUpdate(): Promise<void> {
  const u = pendingUpdate;
  if (!u) return;
  try {
    await u.download((ev) => {
      if (ev.event === "Started") {
        totalBytes = ev.data.contentLength ?? 0;
        downloadedBytes = 0;
      } else if (ev.event === "Progress") {
        downloadedBytes += ev.data.chunkLength;
        if (totalBytes > 0) {
          emitUpdate({
            type: "progress",
            percent: Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)),
          });
        }
      } else if (ev.event === "Finished") {
        emitUpdate({ type: "downloaded", version: u.version });
      }
    });
  } catch (e) {
    emitUpdate({ type: "error", message: e instanceof Error ? e.message : String(e) });
  }
}

async function installUpdate(): Promise<void> {
  const u = pendingUpdate;
  if (!u) return;
  try {
    // Windows: exits the app and launches the NSIS installer (quitAndInstall
    // parity); macOS/Linux relaunch the app afterwards.
    await u.install({ restartAfterInstall: true });
  } catch (e) {
    emitUpdate({ type: "error", message: e instanceof Error ? e.message : String(e) });
  }
}

function onUpdateEvent(cb: (e: UpdateEvent) => void): () => void {
  updateListeners.add(cb);
  return () => {
    updateListeners.delete(cb);
  };
}

export { inTauri };

export type Native = typeof native;
