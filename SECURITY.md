# AlbumForge — Security

AlbumForge runs **entirely locally**. It does not send data over the network, has no
accounts, and makes no cloud requests. The security model is therefore about protecting the
user's local files and preventing abuse of the local process.

## Sandboxing

- The renderer runs with `contextIsolation: true` and `nodeIntegration: false`. Page scripts
  have no direct Node access; they can only call the typed `window.albumforge.*` bridge
  exposed via `contextBridge`.
- The `media://` protocol is the only way the renderer loads images. It resolves a `photoId`
  to a local file **in the main process**; raw filesystem paths are never exposed to page
  scripts.

## Local files

- Originals are **referenced in place** — the app never copies, moves, or modifies the
  user's original files.
- Writes are limited to: the thumbnail/preview cache (`%APPDATA%/AlbumForge/cache`), the
  SQLite database, and export outputs (user-chosen save path).
- File dialogs are native and driven by the user; the app imports only files the user
  explicitly selects.

## Input & media validation

- On import, `sharp` decodes the file to extract metadata; undecodable files are rejected
  (counted as failed) rather than ingested.
- MIME type is derived from the file extension and only for display; actual decoding is
  performed by sharp, which validates the file contents.
- The renderer never controls filesystem paths — only database IDs.

## Data integrity

- SQLite runs in WAL mode; the database and cache live under the per-user app-data directory.
- Album versioning provides point-in-time snapshots that can be restored.

## Future hardening (before wide distribution)

- [ ] Code-sign the Windows executable and installer.
- [ ] Add a CSP to the renderer.
- [ ] Consider read-only mounts / no-exec for the cache directory.
- [ ] Add an integrity check / migration path for the local DB schema.
