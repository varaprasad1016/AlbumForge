/**
 * Single Backend interface (MIGRATION.md Phase 2).
 *
 * Screens keep calling `window.albumforge.*` (the `AlbumForgeApi` contract in
 * `src/shared/api.ts` — the single source of truth for every DTO and method).
 * This module decides *which implementation* that global is at boot:
 *
 *  - **Electron shell** (`npm run dev`): the preload `contextBridge` already
 *    exposed the real implementation — nothing to do, 100% of commands work.
 *  - **Tauri / native shell** (`npm run dev:native`): no preload exists, so we
 *    install a typed stub implementation. Every command rejects with a clear
 *    "not yet available on the native backend" error naming the migration
 *    phase it lands in — never a silent no-op, and never a crash at boot.
 *  - **No host** (bare `npm run dev:renderer` in a browser): same stubs with a
 *    "no host bridge" message, so the UI still renders for styling work.
 *
 * `native.ts` remains the low-level typed channel to the Rust commands that DO
 * exist (scan/proxy/export) and gets wired into these namespaces in Phases 3–4
 * as the backend commands land. `backendCapabilities` lets UI gate screens on
 * what the active shell can actually do.
 */
import type {
  AlbumForgeApi,
  StockDownloadResult,
  StockVectorData,
  TemplateDetail,
} from "@shared/api";
import { parseSvg } from "@shared/stockParse";
import { generateAlbums, recomposePage } from "./albumGen";
import { suggestForPhotos } from "./recommendGen";
import { inTauri, native, type StockDownloadRaw } from "./native";

export type Shell = "electron" | "tauri" | "none";

/** Which host shell is running this renderer? */
export function detectShell(): Shell {
  if (typeof window === "undefined") return "none";
  if (inTauri()) return "tauri";
  if (typeof window.albumforge?.info === "function") return "electron";
  return "none";
}

export const shell: Shell = detectShell();

/** True when the Rust/Tauri native backend hosts this window. */
export const nativeShell = shell === "tauri";

/** True when the Electron preload bridge is live (full command set). */
export const electronShell = shell === "electron";

/**
 * Per-top-level-namespace capability flags for the active shell. On Electron
 * every namespace works; on the native backend only the namespaces backed by
 * a real Rust command report true (`projects`, `photos` — Phase 3; the rest
 * land in Phases 4–6).
 */
export const backendCapabilities: Record<string, boolean> = (() => {
  const NAMESPACES = [
    "info", "openPath", "clearCache", "openDataFolder",
    "checkForUpdates", "downloadUpdate", "installUpdate", "onUpdateEvent",
    "dialogs", "projects", "photos", "groups", "templates", "fonts",
    "albums", "exports", "proofs", "assets", "designs", "recommend",
    "stock", "gen",
  ] as const;
  const map: Record<string, boolean> = {};
  for (const ns of NAMESPACES) map[ns] = electronShell;
  if (nativeShell) {
    // Phase 3: storage + import/asset pipeline landed on Rust.
    map["projects"] = true;
    map["photos"] = true; // list/import/importProgress real; remove/segment/geo still stub
    // Phase 4: native file dialogs (tauri-plugin-dialog) — import is now
    // click-to-click under the native shell.
    map["dialogs"] = true;
    // Phase 4: library read/write namespaces landed on Rust. Note the gaps:
    // fonts file rendering (font:// seam) and template seed data still
    // stub/absent.
    map["groups"] = true;
    map["templates"] = true;
    map["fonts"] = true;
    // albums: full CRUD + renderer-driven generation (the pure-TS engine runs
    // in this webview — Phase 4 item 3) persisting via commands.
    map["albums"] = true;
    // exports/designs/proofs + app services landed on Rust. Update lifecycle
    // (checkForUpdates/download/install/onUpdateEvent) stays off until the
    // Phase 7 packaging/updater pass.
    map["exports"] = true; // job rows real; native PDF runner is Phase 5
    map["designs"] = true;
    map["proofs"] = true;
    map["info"] = true;
    map["openPath"] = true;
    map["clearCache"] = true;
    map["openDataFolder"] = true;
    // Phase 4/6 pull-forward: assets CRUD + stock/gen (reqwest HTTP providers,
    // keys in env/OS keychain) + recommend (native sampling + shared engine).
    // `photos.segment` (U²-Net mattes) and the updater stay off until their
    // Phase-6/7 decisions.
    map["assets"] = true;
    map["stock"] = true; // search/download real; parseSvg runs shared TS here
    map["gen"] = true;
    map["recommend"] = true;
    // Phase 7: auto-update parity with electron-updater — tauri-plugin-updater
    // checks the same GitHub Releases feed; events map to UpdateEvent 1:1.
    map["checkForUpdates"] = true;
    map["downloadUpdate"] = true;
    map["installUpdate"] = true;
    map["onUpdateEvent"] = true;
  }
  return map;
})();

/** Short human-readable badge for the sidebar (active shell + health). */
export const backendBadge: { dot: string; text: string; hint: string } =
  shell === "tauri"
    ? {
        dot: "bg-indigo-500",
        text: "Native backend",
        hint: "Tauri 2 / Rust shell — data commands land in MIGRATION.md Phases 3–4; the layout/data UI needs the Electron shell until then.",
      }
    : shell === "electron"
      ? {
          dot: "bg-emerald-500",
          text: "Electron shell",
          hint: "Full IPC via the preload bridge.",
        }
      : {
          dot: "bg-amber-500",
          text: "No host bridge",
          hint: "Launch the app with `npm run dev` (Electron) or `npm run dev:native` (Tauri).",
        };

/* ---------- media URL seam (Phase 3 tail) ---------- */

/** Media variants the renderer can display for a photo id. */
export type MediaKind = "thumb256" | "preview1024" | "matte";

/**
 * Deterministic filename suffix per kind — byte-for-byte the names the import
 * pipeline writes: Rust `core/import.rs` and Electron `imaging.ts` both render
 * `<id>-thumb256.jpg` / `<id>-preview1024.jpg` into their cache root, and the
 * subject matte is `<id>-matte.png` (Electron `segment.ts`; mirrored by the
 * first-run legacy-cache adoption in `src-tauri/src/lib.rs`).
 */
const MEDIA_SUFFIX: Record<MediaKind, string> = {
  thumb256: "-thumb256.jpg",
  preview1024: "-preview1024.jpg",
  matte: "-matte.png",
};

/** Native app cache dir, resolved once in `installBackend()` before render. */
let nativeCacheDir: string | null = null;

/**
 * Resolve a photo's display URL for the active shell.
 *
 * - **Electron** (and the no-host styling shell): the `media://kind/<id>`
 *   scheme its registered privileged protocol serves.
 * - **Native/Tauri**: a scoped `asset://` URL (`convertFileSrc`) over the
 *   deterministic cache file. Zero IPC per image — the only native round-trip
 *   is the single `app_dirs` call at boot. This is what makes photo grids
 *   render under the native shell (WebView2 cannot fetch a bare `media://`
 *   scheme; the Windows form is `http://asset.localhost/…`).
 */
export function mediaUrl(photoId: string, kind: MediaKind): string {
  if (nativeShell && nativeCacheDir) {
    return native.assetUrl(`${nativeCacheDir}/${photoId}${MEDIA_SUFFIX[kind]}`);
  }
  return `media://${kind}/${photoId}`;
}

/* ---------- stub implementation (native / no-host shells) ---------- */

function stubReason(path: string): string {
  const base = `albumforge.${path}()`;
  if (shell === "tauri") {
    return `${base} is not available on the native backend yet — it lands in MIGRATION.md Phase 3/4. Use the Electron shell (npm run dev) for full functionality.`;
  }
  return `${base} failed: no host bridge is present. Launch via npm run dev (Electron) or npm run dev:native (Tauri).`;
}

/** Command stub: rejects loudly with a phase-labelled message. */
const reject = (path: string) => (..._args: any[]): Promise<never> =>
  Promise.reject(new Error(stubReason(path)));

/** Update-lifecycle stub — not a service gap but a packaging one. */
const rejectUpdate = (path: string) => (..._args: any[]): Promise<never> =>
  Promise.reject(
    new Error(
      `albumforge.${path}(): auto-update requires the packaged app — the native updater lands in MIGRATION.md Phase 7 (packaging).`,
    ),
  );

/** Event-subscription stub: never fires, returns a no-op disposer. */
const listenNoop = (path: string) => (_cb: any): (() => void) => {
  console.warn(`albumforge.${path}() listener registered but no events exist on this shell yet.`);
  return () => undefined;
};

/** Typed against `AlbumForgeApi` so the compiler flags any drift from the contract. */
const stubApi: AlbumForgeApi = {
  // ---- app / updates ----
  info: reject("info"),
  openPath: reject("openPath"),
  clearCache: reject("clearCache"),
  openDataFolder: reject("openDataFolder"),
  // The updater needs the packaged app + signing — it lands with packaging
  // (MIGRATION.md Phase 7), not the service-command passes.
  checkForUpdates: rejectUpdate("checkForUpdates"),
  downloadUpdate: rejectUpdate("downloadUpdate"),
  installUpdate: rejectUpdate("installUpdate"),
  onUpdateEvent: listenNoop("onUpdateEvent"),
  // ---- dialogs ----
  dialogs: {
    chooseImages: reject("dialogs.chooseImages"),
    chooseSavePath: reject("dialogs.chooseSavePath"),
    chooseDirectory: reject("dialogs.chooseDirectory"),
    chooseFeedback: reject("dialogs.chooseFeedback"),
    chooseAssets: reject("dialogs.chooseAssets"),
  },
  // ---- projects ----
  projects: {
    list: reject("projects.list"),
    create: reject("projects.create"),
    get: reject("projects.get"),
    remove: reject("projects.remove"),
    setThumbnail: reject("projects.setThumbnail"),
  },
  // ---- photos ----
  photos: {
    importPhotos: reject("photos.importPhotos"),
    list: reject("photos.list"),
    geo: reject("photos.geo"),
    setSelected: reject("photos.setSelected"),
    remove: reject("photos.remove"),
    segment: reject("photos.segment"),
    onImportProgress: listenNoop("photos.onImportProgress"),
  },
  // ---- groups ----
  groups: {
    auto: reject("groups.auto"),
    list: reject("groups.list"),
    create: reject("groups.create"),
    rename: reject("groups.rename"),
    remove: reject("groups.remove"),
    assign: reject("groups.assign"),
    merge: reject("groups.merge"),
    split: reject("groups.split"),
    clear: reject("groups.clear"),
  },
  // ---- templates / fonts ----
  templates: {
    list: reject("templates.list"),
    get: reject("templates.get"),
  },
  fonts: { list: reject("fonts.list") },
  // ---- albums ----
  albums: {
    list: reject("albums.list"),
    get: reject("albums.get"),
    generate: reject("albums.generate"),
    pages: reject("albums.pages"),
    recomposePage: reject("albums.recomposePage"),
    savePage: reject("albums.savePage"),
    addPage: reject("albums.addPage"),
    duplicatePage: reject("albums.duplicatePage"),
    deletePage: reject("albums.deletePage"),
    reorderPages: reject("albums.reorderPages"),
    versions: reject("albums.versions"),
    snapshot: reject("albums.snapshot"),
    restoreVersion: reject("albums.restoreVersion"),
  },
  // ---- exports / proofs ----
  exports: {
    create: reject("exports.create"),
    get: reject("exports.get"),
  },
  proofs: {
    build: reject("proofs.build"),
    importFeedback: reject("proofs.importFeedback"),
    notes: reject("proofs.notes"),
  },
  // ---- assets / designs ----
  assets: {
    list: reject("assets.list"),
    importAssets: reject("assets.importAssets"),
    remove: reject("assets.remove"),
  },
  designs: {
    list: reject("designs.list"),
    save: reject("designs.save"),
    get: reject("designs.get"),
    remove: reject("designs.remove"),
  },
  // ---- recommend / stock / gen ----
  recommend: { suggest: reject("recommend.suggest") },
  stock: {
    configured: reject("stock.configured"),
    provider: reject("stock.provider"),
    setProvider: reject("stock.setProvider"),
    setApiKey: reject("stock.setApiKey"),
    search: reject("stock.search"),
    download: reject("stock.download"),
    parseSvg: reject("stock.parseSvg"),
    recent: reject("stock.recent"),
  },
  gen: {
    configured: reject("gen.configured"),
    provider: reject("gen.provider"),
    setProvider: reject("gen.setProvider"),
    setApiKey: reject("gen.setApiKey"),
    generate: reject("gen.generate"),
  },
};

/**
 * Point the `AlbumForgeApi` namespaces that have real Rust commands at the
 * native implementation (Phase 3: `projects` + `photos`). Everything else
 * keeps its loud stub until its Phase lands.
 */
function wireNativeCommands(api: AlbumForgeApi): void {
  api.projects.list = () => native.projects.list();
  api.projects.create = (input) => native.projects.create(input);
  api.photos.list = (projectId, opts) => native.photos.list(projectId, opts);
  api.photos.importPhotos = (projectId, paths) => native.photos.importPhotos(projectId, paths);
  api.photos.onImportProgress = (cb) => native.photos.onImportProgress(cb);
  api.dialogs.chooseImages = () => native.dialogs.chooseImages();
  api.dialogs.chooseSavePath = (defaultName) => native.dialogs.chooseSavePath(defaultName);
  api.dialogs.chooseDirectory = () => native.dialogs.chooseDirectory();
  api.dialogs.chooseFeedback = () => native.dialogs.chooseFeedback();
  api.dialogs.chooseAssets = () => native.dialogs.chooseAssets();
  // Phase 4: app services + exports / designs / proofs.
  api.info = () => native.app.info();
  api.openPath = (p) => native.app.openPath(p);
  api.clearCache = () => native.app.clearCache();
  api.openDataFolder = () => native.app.openDataFolder();
  api.exports.create = (albumId, input) => native.exports.create(albumId, input);
  api.exports.get = (id) => native.exports.get(id);
  api.designs.list = () => native.designs.list();
  api.designs.save = (name, page) => native.designs.save(name, page);
  api.designs.get = (id) => native.designs.get(id);
  api.designs.remove = (id) => native.designs.remove(id);
  api.proofs.build = (albumId, targetDir) => native.proofs.build(albumId, targetDir);
  api.proofs.importFeedback = (projectId, filePath) =>
    native.proofs.importFeedback(projectId, filePath);
  api.proofs.notes = (projectId) => native.proofs.notes(projectId);
  // Phase 4: groups / templates / fonts / albums CRUD.
  api.groups.list = (projectId) => native.groups.list(projectId);
  api.groups.auto = (projectId) => native.groups.auto(projectId);
  api.groups.create = (projectId, name) => native.groups.create(projectId, name);
  api.groups.rename = (groupId, name) => native.groups.rename(groupId, name);
  api.groups.remove = (groupId) => native.groups.remove(groupId);
  api.groups.assign = (groupId, photoIds) => native.groups.assign(groupId, photoIds);
  api.groups.merge = (projectId, groupIds, name) => native.groups.merge(projectId, groupIds, name);
  api.groups.split = (projectId, groupId, photoIds, name) =>
    native.groups.split(projectId, groupId, photoIds, name);
  api.groups.clear = (projectId) => native.groups.clear(projectId);
  api.templates.list = () => native.templates.list();
  // Electron's handler returns null for a missing row although the shared
  // contract types it non-null (screens filter `d !== null`); keep parity.
  api.templates.get = (id) => native.templates.get(id) as Promise<TemplateDetail>;
  api.fonts.list = () => native.fonts.list();
  api.albums.list = (projectId) => native.albums.list(projectId);
  api.albums.get = (id) => native.albums.get(id);
  api.albums.pages = (id) => native.albums.pages(id);
  api.albums.savePage = (albumId, pageId, update) => native.albums.savePage(albumId, pageId, update);
  api.albums.addPage = (albumId) => native.albums.addPage(albumId);
  api.albums.duplicatePage = (albumId, pageId) => native.albums.duplicatePage(albumId, pageId);
  api.albums.deletePage = (albumId, pageId) => native.albums.deletePage(albumId, pageId);
  api.albums.reorderPages = (albumId, pageIds) => native.albums.reorderPages(albumId, pageIds);
  api.albums.versions = (albumId) => native.albums.versions(albumId);
  api.albums.snapshot = (albumId) => native.albums.snapshot(albumId);
  api.albums.restoreVersion = (albumId, versionId) =>
    native.albums.restoreVersion(albumId, versionId);
  // Phase 4 item 3: the pure-TS engine runs in the renderer; records and
  // persistence go through commands (`generateAlbums` mirrors Electron's
  // `generateAndPersist`; `recomposePage` mirrors the IPC handler).
  api.albums.generate = (input) => generateAlbums(input);
  api.albums.recomposePage = (albumId, pageId, layoutKey) =>
    recomposePage(albumId, pageId, layoutKey);
  // Phase 4/6 pull-forward: assets / stock / gen / recommend.
  api.assets.list = () => native.assets.list();
  api.assets.importAssets = (paths) => native.assets.importAssets(paths);
  api.assets.remove = (id) => native.assets.remove(id);
  api.stock.configured = () => native.stock.configured();
  api.stock.provider = () => native.stock.provider();
  api.stock.setProvider = (provider) => native.stock.setProvider(provider);
  api.stock.setApiKey = (provider, key) => native.stock.setApiKey(provider, key);
  api.stock.search = (term, kind) => native.stock.search(term, kind);
  api.stock.recent = (limit) => native.stock.recent(limit);
  // Raw native download → full result: vector SVGs return as raw text and are
  // parsed with the shared `parseSvg` — the same code Electron's main process
  // runs, so both hosts agree on recolourable path groups byte-for-byte.
  api.stock.download = async (providerId, input) =>
    toDownloadResult(await native.stock.download(providerId, input));
  api.stock.parseSvg = (svg) => Promise.resolve(parseSvg(svg));
  api.gen.configured = () => native.gen.configured();
  api.gen.provider = () => native.gen.provider();
  api.gen.setProvider = (provider) => native.gen.setProvider(provider);
  api.gen.setApiKey = (provider, key) =>
    provider === "bfl" ? native.gen.setApiKey(key) : Promise.resolve(false);
  api.gen.generate = (prompt, opts) => native.gen.generate(prompt, opts);
  api.recommend.suggest = (photoIds, eventType) => suggestForPhotos(photoIds, eventType);
  // Phase 7: auto-update parity with the Electron shell (electron-updater).
  api.checkForUpdates = () => native.updates.checkForUpdates();
  api.downloadUpdate = () => native.updates.downloadUpdate();
  api.installUpdate = () => native.updates.installUpdate();
  api.onUpdateEvent = (cb) => native.updates.onUpdateEvent(cb);
}

/** Map the native raw download onto the shared `StockDownloadResult`, parsing
 *  vector SVG text with the single-source `parseSvg` (Electron parity — an
 *  unparseable SVG yields `vector: null`, never a thrown IPC error). */
function toDownloadResult(raw: StockDownloadRaw): StockDownloadResult {
  let vector: StockVectorData | null = null;
  if (raw.kind === "vector" && raw.svg) {
    try {
      vector = parseSvg(raw.svg);
    } catch {
      vector = null;
    }
  }
  return {
    providerId: raw.providerId,
    kind: raw.kind as StockDownloadResult["kind"],
    width: raw.width,
    height: raw.height,
    vector,
    title: raw.title,
    author: raw.author,
    attributionRequired: raw.attributionRequired,
    fromCache: raw.fromCache,
  };
}

/**
 * Boot hook — `await` it once before the first render (see `main.tsx`). Under
 * Electron the preload has already installed the real `window.albumforge`, so
 * this resolves immediately. On the native shell it first resolves the app
 * cache dir (the media seam needs it synchronously when screens build image
 * URLs), then installs the typed stub so screens mount and fail loudly
 * instead of crashing on an undefined global. Never rejects.
 */
export async function installBackend(): Promise<void> {
  if (typeof window === "undefined") return;
  if (typeof window.albumforge === "object") return;
  if (nativeShell) {
    try {
      const dirs = await native.appDirs();
      nativeCacheDir = dirs.cacheDir;
    } catch (e) {
      console.warn(
        "[backend] app dirs unavailable — media URLs fall back to the Electron scheme (images will not load on the native shell).",
        e,
      );
    }
    wireNativeCommands(stubApi);
  }
  window.albumforge = stubApi;
  console.info(
    `[backend] no Electron preload detected — installed ${shell} shell implementation (${Object.keys(backendCapabilities).filter((k) => backendCapabilities[k]).length}/${Object.keys(backendCapabilities).length} namespaces live).`,
  );
}
