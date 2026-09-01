# AlbumForge native backend (Tauri 2 / Rust)

Every heavy operation lives here; the React renderer is a pure presentation
layer that talks to these modules through typed commands
(`src/renderer/src/lib/native.ts`).

## Module map

| Path | Responsibility | Replaces (Electron) |
| --- | --- | --- |
| `src/main.rs` | Thin entry point | `src/main/index.ts` (partially) |
| `src/lib.rs` | Builder, `AppState`, command registration | `src/main/ipc.ts` wiring |
| `src/commands.rs` | Typed IPC surface, progress events | `src/main/ipc.ts` handlers |
| `src/core/scanner.rs` | Rayon-parallel folder scan + EXIF/GPS | `exifr` + import loop |
| `src/core/proxy.rs` | WebP proxy pipeline (max 1000 px) | `sharp` thumbnail pass |
| `src/core/export.rs` | Headless 300 DPI raster + PDF/TIFF (WIP) | `sharp` + `pdf-lib` |
| `src/core/secrets.rs` | Env-var key access (never logged/persisted) | `process.env.*` reads |

## Data flow (scan → canvas)

1. `native.scanFolder(dir)` → rayon walk, `scanner-progress` events, light JSON rows.
2. `native.generateProxies(paths)` → WebP proxies in the app cache, `proxy-progress` events.
3. `native.proxyPath(path)` → cache path, wrapped by `native.assetUrl()` into a
   scoped `asset://` URL. Raw filesystem paths never reach the DOM.
4. Canvas renders proxies; on export, `native.exportAlbum(job)` re-opens
   originals and rasterises at print resolution with the same filter stack.

## Toolchain setup

After pulling an update, run once:

```sh
npm run setup:native   # installs Rust via rustup if missing, then cargo check
npm run check:native   # report only (exit 1 when the toolchain is missing)
```

The GitHub release workflow also installs the Rust toolchain and runs
`cargo check` on every push, so a broken native backend is caught before it
ships.

## Migration notes

- `.env` / `.gitignore` / `config.json` are untouched by design. Keys are read
  from environment variables (`BFL_API_KEY`, `PIXABAY_API_KEY`, …) or the OS
  keychain later — never compiled in.
- `better-sqlite3` → `rusqlite` (bundled). The schema in
  `src/main/db.ts` ports over as-is.
- `target/` is ignored by the root `.gitignore`; `src-tauri/gen/` is generated
  at build time and also ignored.
