import type { AlbumForgeApi } from "@shared/api";

declare global {
  interface Window {
    albumforge: AlbumForgeApi;
  }
}

export {};
