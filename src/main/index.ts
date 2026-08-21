/** Electron main process entry point. */
import { app, BrowserWindow, net, protocol } from "electron";
import { autoUpdater } from "electron-updater";
import { mkdirSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { DB, initDatabase } from "./db";
import { registerIpc } from "./ipc";
import { seedTemplates } from "./seed";

protocol.registerSchemesAsPrivileged([
  { scheme: "media", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

let db: DB;
let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());

  if (process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  const dataDir = app.getPath("userData");
  const cacheDir = join(dataDir, "cache");
  mkdirSync(cacheDir, { recursive: true });

  db = initDatabase(join(dataDir, "albumforge.db"));
  seedTemplates(db);

  // Serve local photo assets (thumbnails/previews/originals) to the renderer without
  // exposing raw filesystem paths. The renderer requests `media://<kind>/<photoId>`.
  protocol.handle("media", (request) => {
    const url = new URL(request.url);
    const kind = url.hostname;
    const id = url.pathname.replace(/^\//, "");
    const row = db
      .prepare("SELECT file_path, thumbnail_path, preview_path FROM photos WHERE id = ?")
      .get(id) as { file_path: string; thumbnail_path: string | null; preview_path: string | null } | undefined;

    let p: string | null = null;
    if (kind === "thumb256") p = row?.thumbnail_path ?? null;
    else if (kind === "preview1024") p = row?.preview_path ?? null;
    else if (kind === "original") p = row?.file_path ?? null;
    if (!p) return new Response("not found", { status: 404 });
    return net.fetch(pathToFileURL(p).toString());
  });

  registerIpc({ db, cacheDir, dataDir, getWindow: () => mainWindow });

  createWindow();

  // Opt-in automatic update checks (packaged builds only; requires a publish provider
  // configured in electron-builder.yml / electron-updater).
  if (app.isPackaged && process.env.ALBUMFORGE_AUTO_UPDATE === "1") {
    autoUpdater.checkForUpdates().catch(() => {});
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
