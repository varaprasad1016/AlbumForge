import type { AlbumForgeApi } from "./api";

declare global {
  interface Window {
    albumforge: AlbumForgeApi;
  }
}

export {};
