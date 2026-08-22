/** Mobile backend entry: builds `window.albumforge` from the module pieces. */
import type { AlbumForgeApi, UpdateEvent } from "./api";
import { initDb, persistDb } from "./db";
import { seedTemplates } from "./seed";
import { assetUrl, fontUrl, onProgress } from "./backend-helpers";
import { buildCrudApi } from "./backend-crud";
import { buildAlbumsApi } from "./backend-albums";
import { UpdateInstaller } from "./update-installer";

const APP_VERSION = __APP_VERSION__;

interface MobileReleaseInfo {
  html_url: string;
  version: string;
  assetUrl: string | null;
}

async function latestMobileRelease(): Promise<MobileReleaseInfo | null> {
  const res = await fetch("https://api.github.com/repos/varaprasad1016/AlbumForge/releases");
  if (!res.ok) return null;
  const releases = await res.json();
  const mobile = releases
    .filter((r: any) => (r.tag_name || "").startsWith("m-") && !r.draft)
    .sort((a: any, b: any) => (b.published_at || "").localeCompare(a.published_at || ""))[0];
  if (!mobile) return null;
  const apk = (mobile.assets || []).find((a: any) => String(a.name).endsWith(".apk"));
  return {
    html_url: mobile.html_url,
    version: String(mobile.tag_name).replace(/^m-/, ""),
    assetUrl: apk ? apk.browser_download_url : null,
  };
}

const updateListeners = new Set<(e: UpdateEvent) => void>();
function emitUpdate(e: UpdateEvent): void {
  for (const cb of updateListeners) cb(e);
}

let downloadedPath: string | null = null;

export async function initBackend(): Promise<void> {
  await initDb();
  seedTemplates();
  await persistDb();

  try {
    void UpdateInstaller.addListener("downloadProgress", (data) => {
      emitUpdate({ type: "progress", percent: data.percent });
    }).catch(() => {});
  } catch {
    /* updater plugin unavailable — updates still checkable via GitHub */
  }

  const api: AlbumForgeApi = {
    info: () =>
      Promise.resolve({ version: APP_VERSION, author: "Vara", dataPath: "App storage", cachePath: "App storage" }),
    openPath: () => Promise.resolve(),
    clearCache: async () => {},
    openDataFolder: async () => {},
    checkForUpdates: async () => {
      try {
        const mobile = await latestMobileRelease();
        if (!mobile || !mobile.assetUrl) return "No updates available.";
        if (mobile.version !== APP_VERSION) return `Update available: v${mobile.version}`;
        return "You are up to date.";
      } catch {
        return "Could not check for updates.";
      }
    },
    downloadUpdate: async () => {
      const mobile = await latestMobileRelease();
      if (!mobile || !mobile.assetUrl) throw new Error("No update available to download.");
      emitUpdate({ type: "checking" });
      try {
        const res = await UpdateInstaller.downloadApk({
          url: mobile.assetUrl,
          fileName: `AlbumForge-${mobile.version}.apk`,
        });
        downloadedPath = res.path;
        emitUpdate({ type: "downloaded", version: mobile.version });
      } catch (e) {
        emitUpdate({ type: "error", message: e instanceof Error ? e.message : String(e) });
        throw e;
      }
    },
    installUpdate: async () => {
      if (!downloadedPath) throw new Error("Download the update first.");
      const res = await UpdateInstaller.installApk({ path: downloadedPath });
      if (res.needsPermission) {
        emitUpdate({
          type: "error",
          message: "Allow installs from AlbumForge in the system settings that just opened, then tap Install update again.",
        });
      }
    },
    onUpdateEvent: (cb) => {
      updateListeners.add(cb);
      return () => updateListeners.delete(cb);
    },
    assets: {
      url: (kind: string, id: string) => assetUrl(kind, id),
      font: (family: string) => fontUrl(family),
    },
    dialogs: {
      chooseImages: () =>
        new Promise<File[] | null>((resolve) => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = "image/*";
          input.multiple = true;
          input.onchange = () => resolve(input.files ? Array.from(input.files) : null);
          input.oncancel = () => resolve(null);
          input.click();
        }),
      chooseAssets: () =>
        new Promise<File[] | null>((resolve) => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = "image/svg+xml,image/png,.svg,.png";
          input.multiple = true;
          input.onchange = () => resolve(input.files ? Array.from(input.files) : null);
          input.oncancel = () => resolve(null);
          input.click();
        }),
      chooseSavePath: () => Promise.resolve(null),
    },
    ...buildCrudApi(),
    ...buildAlbumsApi(),
  };

  (window as any).albumforge = api;
}
