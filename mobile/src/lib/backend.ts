/** Mobile backend entry: builds `window.albumforge` from the module pieces. */
import type { AlbumForgeApi } from "./api";
import { initDb, persistDb } from "./db";
import { seedTemplates } from "./seed";
import { assetUrl, fontUrl, onProgress } from "./backend-helpers";
import { buildCrudApi } from "./backend-crud";
import { buildAlbumsApi } from "./backend-albums";

const MOBILE_VERSION = "0.1.3";

async function latestMobileRelease(): Promise<{ html_url: string; version: string } | null> {
  const res = await fetch("https://api.github.com/repos/varaprasad1016/AlbumForge/releases");
  if (!res.ok) return null;
  const releases = await res.json();
  const mobile = releases
    .filter((r: any) => (r.tag_name || "").startsWith("m-") && !r.draft)
    .sort((a: any, b: any) => (b.published_at || "").localeCompare(a.published_at || ""))[0];
  if (!mobile) return null;
  return { html_url: mobile.html_url, version: String(mobile.tag_name).replace(/^m-v/, "") };
}

export async function initBackend(): Promise<void> {
  await initDb();
  seedTemplates();
  await persistDb();

  const api: AlbumForgeApi = {
    info: () =>
      Promise.resolve({ version: MOBILE_VERSION, author: "Vara", dataPath: "App storage", cachePath: "App storage" }),
    openPath: () => Promise.resolve(),
    clearCache: async () => {},
    openDataFolder: async () => {},
    checkForUpdates: async () => {
      try {
        const mobile = await latestMobileRelease();
        if (!mobile) return "No updates available.";
        if (mobile.version && mobile.version !== MOBILE_VERSION) return `Update available: v${mobile.version}`;
        return "You are up to date.";
      } catch {
        return "Could not check for updates.";
      }
    },
    installUpdate: async () => {
      try {
        const mobile = await latestMobileRelease();
        window.open(mobile ? mobile.html_url : "https://github.com/varaprasad1016/AlbumForge/releases", "_blank");
      } catch {
        window.open("https://github.com/varaprasad1016/AlbumForge/releases", "_blank");
      }
    },
    downloadUpdate: async () => {},
    onUpdateEvent: () => () => {},
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
      chooseSavePath: () => Promise.resolve(null),
    },
    ...buildCrudApi(),
    ...buildAlbumsApi(),
  };

  (window as any).albumforge = api;
}
