/**
 * Typed bridge to the native backend.
 *
 * The renderer never touches host APIs directly. Every heavy operation is a
 * typed call on `native`, which talks to Tauri's IPC channel via
 * `window.__TAURI_INTERNALS__` (the same channel `@tauri-apps/api` wraps —
 * swap to the official package's `invoke`/`listen` when it is installed; the
 * signatures below are identical).
 *
 * While the Electron shell still exists, calls reject with a clear message so
 * a mis-wired screen fails loudly instead of silently no-op'ing.
 */

/* ---------- types (mirror the Rust serde structs, camelCase) ---------- */

export interface ScannedPhoto {
  path: string;
  filename: string;
  width: number;
  height: number;
  orientation: number;
  fileSize: number;
  takenAt: string | null;
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

/* ---------- host detection + invoke/listen shims ---------- */

type InvokeArgs = Record<string, unknown>;

interface TauriInternals {
  invoke(cmd: string, args?: InvokeArgs): Promise<unknown>;
  event?: {
    listen(event: string, handler: (e: { payload: unknown }) => void): Promise<() => void>;
  };
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: TauriInternals;
  }
}

function internals(): TauriInternals | undefined {
  return typeof window !== "undefined" ? window.__TAURI_INTERNALS__ : undefined;
}

function invoke<T>(cmd: string, args?: InvokeArgs): Promise<T> {
  const i = internals();
  if (!i) {
    return Promise.reject(
      new Error(
        `native command "${cmd}" unavailable — run through the Tauri shell (npm run tauri dev)`,
      ),
    );
  }
  return i.invoke(cmd, args) as Promise<T>;
}

/** Subscribe to a native event; the returned function unsubscribes. */
function listen<T>(event: string, handler: (payload: T) => void): () => void {
  const i = internals();
  if (!i?.event) return () => undefined;
  let disposed = false;
  void i.event
    .listen(event, (e) => {
      if (!disposed) handler(e.payload as T);
    })
    .then((unlisten) => {
      if (disposed) unlisten();
    });
  return () => {
    disposed = true;
  };
}

/* ---------- public API ---------- */

export const native = {
  /** Scan a folder; `onProgress` fires live during the walk. */
  scanFolder(dir: string, onProgress: (p: ScanProgress) => void): Promise<ScannedPhoto[]> {
    const stop = listen<ScanProgress>("scanner-progress", onProgress);
    return invoke<ScannedPhoto[]>("scan_folder", { dir }).finally(stop);
  },

  /** Generate WebP proxies for originals; `onProgress` fires per file. */
  generateProxies(
    paths: string[],
    onProgress: (p: ScanProgress & { filename: string }) => void,
    maxDim?: number,
  ): Promise<ProxyInfo[]> {
    const stop = listen("proxy-progress", onProgress);
    return invoke<ProxyInfo[]>("generate_proxies", { paths, maxDim: maxDim ?? 1000 }).finally(stop);
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
   * native asset protocol (scope: app cache + app data dirs). Equivalent to
   * `convertFileSrc` from `@tauri-apps/api/core`.
   */
  assetUrl(filePath: string): string {
    return `asset://localhost/${encodeURIComponent(filePath)}`;
  },
};

export type Native = typeof native;
