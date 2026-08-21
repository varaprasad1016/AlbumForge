/** Mobile backend entry: builds `window.albumforge` from the module pieces. */
import type { AlbumForgeApi } from "./api";
import { initDb, persistDb } from "./db";
import { seedTemplates } from "./seed";
import { assetUrl, fontUrl, onProgress } from "./backend-helpers";
import { buildCrudApi } from "./backend-crud";
import { buildAlbumsApi } from "./backend-albums";

export async function initBackend(): Promise<void> {
  await initDb();
  seedTemplates();
  await persistDb();

  const api: AlbumForgeApi = {
    info: () =>
      Promise.resolve({ version: "0.1.0", author: "Vara", dataPath: "App storage", cachePath: "App storage" }),
    openPath: () => Promise.resolve(),
    clearCache: async () => {},
    openDataFolder: async () => {},
    checkForUpdates: async () => {
      try {
        const res = await fetch("https://api.github.com/repos/varaprasad1016/AlbumForge/releases/latest");
        if (!res.ok) return "Could not check for updates.";
        const rel = await res.json();
        const latest = String(rel.tag_name || "").replace(/^v/, "");
        return latest && latest !== "0.1.0" ? `Update available: v${latest}` : "You are up to date.";
      } catch {
        return "Could not check for updates.";
      }
    },
    installUpdate: async () => {
      window.open("https://github.com/varaprasad1016/AlbumForge/releases/latest", "_blank");
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
