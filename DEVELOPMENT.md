# AlbumForge — Development Guide

## Prerequisites

- Node.js 20+ and npm
- On Windows: nothing else required (Electron bundles Chromium; native modules ship prebuilds)

## Install

```bash
npm install
```

`postinstall` runs `electron-builder install-app-deps` to ensure `better-sqlite3` and
`sharp` are rebuilt/available for Electron's ABI.

## Run (dev)

```bash
npm run dev
```

This starts electron-vite: the main/preload processes are bundled, the renderer runs on a
Vite dev server, and the Electron window opens automatically (with hot reload for the
renderer).

## Run (native/Tauri dev — Rust backend, Phase 1)

```bash
npm run setup:native   # once: Rust toolchain + cargo check
npm run dev:native     # Tauri window + Vite dev server on :5173
```

`dev:native` runs `tauri dev` (via `scripts/dev-native.mjs`, which switches to
the GNU Rust toolchain on machines without MSVC Build Tools). The renderer has
hot reload from Vite; Rust edits trigger a rebuild automatically.

> Under the native shell the renderer boots against the typed backend seam
> (`src/renderer/src/lib/backend.ts`, installed in `main.tsx`): `projects` and
> `photos` (list/import) are served by real Rust commands over rusqlite (Phase
> 3), and photo grids render through the `mediaUrl(id, kind)` seam — Electron
> keeps `media://kind/<id>`, the native shell serves scoped `asset://` URLs
> (`convertFileSrc` over deterministic `<id>-thumb256.jpg` / `<id>-preview1024.jpg`
> / `<id>-matte.png` cache files; first native run adopts the legacy Electron
> DB **and** its proxy cache). Everything else rejects with a clear “Phase 4+”
> message until it lands. The sidebar badge shows the active shell. Electron
> keeps its full preload bridge. See `MIGRATION.md` for the phased plan and
> `NATIVE_BLUEPRINT.md` for the interface contract.
>
> **Rust tests on Windows:** `cargo test` needs MSVC Build Tools (or Linux/WSL).
> On the GNU+w64devkit fallback the tauri-linked test harness crashes at load
> (`STATUS_ENTRYPOINT_NOT_FOUND`, WebView2Loader) — use `cargo check` there
> (`npm run check:native`).

## Type-check

```bash
npm run typecheck
```

Runs `tsc --noEmit` for both the Node (main/preload) and web (renderer) configs.

## Build the app (unpacked, for testing)

```bash
npm run build          # electron-vite build → out/
npm run start          # preview the built app
```

## Build the Windows installer

```bash
npm run dist
```

Outputs:
- `dist/AlbumForge Setup <version>.exe` (NSIS installer)
- `dist/win-unpacked/` (portable, run `AlbumForge.exe` directly)

## Where data lives

| Data | Location |
|---|---|
| Database | `%APPDATA%/AlbumForge/albumforge.db` |
| Thumbnail/preview cache | `%APPDATA%/AlbumForge/cache/` |
| Exports | `%APPDATA%/AlbumForge/exports/` (or your chosen save location) |

Originals are never copied — the database stores absolute paths to your original files.

## Project structure

- `src/main/` — Electron main process (DB, imaging, export, IPC, engine)
- `src/preload/` — contextBridge (`window.albumforge`)
- `src/renderer/src/` — React app (pages, components)
- `src/shared/api.ts` — the typed IPC contract

## Adding an IPC method

1. Add the method signature to `AlbumForgeApi` in `src/shared/api.ts`.
2. Implement it in `src/preload/index.ts` (`ipcRenderer.invoke(...)`).
3. Implement the handler in `src/main/ipc.ts` (`ipcMain.handle(...)`).

Keep all DTOs in `src/shared/api.ts` so main and renderer stay in sync.

## Notes

- The engine (`src/main/engine/`) is pure and deterministic — no I/O, no SQLite. Logic
  changes there should be accompanied by reasoning in `ALBUM_ENGINE.md`.
- Never expose raw filesystem paths to the renderer; serve images via `media://`.
