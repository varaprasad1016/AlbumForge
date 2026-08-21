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
