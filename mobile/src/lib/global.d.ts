import type { AlbumForgeApi } from "./api";

declare global {
  interface Window {
    albumforge: AlbumForgeApi;
  }
  const __APP_VERSION__: string;
}

export {};
