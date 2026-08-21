# AlbumForge — API (IPC contract)

There is no HTTP API. The renderer talks to the Electron main process over a typed IPC
bridge. The single source of truth is `src/shared/api.ts`; the bridge is exposed to the
renderer as `window.albumforge`.

## Structure

```ts
window.albumforge = {
  info(), openPath(path),
  dialogs:  { chooseImages(), chooseSavePath(name) },
  projects: { list(), create(), get(), remove() },
  photos:   { importPhotos(), list(), setSelected(), remove(), onImportProgress() },
  templates:{ list(), get() },
  albums:   { list(), get(), generate(), pages(), savePage(), addPage(),
              duplicatePage(), deletePage(), reorderPages(),
              versions(), snapshot(), restoreVersion() },
  exports:  { create(), get() },
}
```

## Methods (summary)

### app
- `info()` → `{ version, dataPath, cachePath }`
- `openPath(path)` → open a file/folder with the OS default application.
- `clearCache()` → rebuild the thumbnail cache directory.
- `openDataFolder()` → open the app-data directory in Explorer.
- `checkForUpdates()` → status string (packaged builds only).

### dialogs
- `chooseImages()` → `string[] | null` — native multi-select image dialog.
- `chooseSavePath(defaultName)` → `string | null` — native save dialog.

### projects
- `list()` → `Project[]`
- `create({ name, clientName?, eventDate? })` → `Project`
- `get(id)` → `Project | null`
- `remove(id)` → `void`

### photos
- `importPhotos(projectId, paths)` → `{ imported, failed }` — analyse + thumbnail each file.
- `list(projectId, { offset, limit, selected?, status? })` → `{ items, total }`
- `setSelected(photoId, selected)` → `void`
- `remove(photoId)` → `void`
- `onImportProgress(cb)` → unsubscribe fn — receives `{ current, total, filename, status }`.

### groups
- `auto(projectId)` → `PhotoGroup[]` — segment by capture time.
- `list(projectId)` → `PhotoGroup[]`
- `create(projectId, name)` → `PhotoGroup`
- `rename(groupId, name)` / `remove(groupId)` → `void`
- `assign(groupId, photoIds)` → `void`
- `merge(projectId, groupIds, name)` → `PhotoGroup`
- `split(projectId, groupId, photoIds, name)` → `PhotoGroup`
- `clear(projectId)` → `void`

### templates
- `list()` → `TemplateSummary[]`
- `get(id)` → `TemplateDetail` (includes layouts)

### albums
- `list(projectId?)` → `Album[]`
- `get(id)` → `Album`
- `generate(input)` → `Album[]` — synchronous generation, returns created albums.
- `pages(id)` → `AlbumPage[]`
- `recomposePage(albumId, pageId, layoutKey)` → `AlbumPage` — re-layout a page's photos.
- `savePage(albumId, pageId, { layoutKey?, background?, elements? })` → `AlbumPage`
- `addPage(albumId)` / `duplicatePage(albumId, pageId)` → `AlbumPage`
- `deletePage(albumId, pageId)` → `void`
- `reorderPages(albumId, pageIds)` → `void`
- `versions(id)` → `AlbumVersion[]`
- `snapshot(id)` → `AlbumVersion`
- `restoreVersion(albumId, versionId)` → `AlbumPage[]`

### exports
- `create(albumId, { kind, dpi, bleedMm, targetPath? })` → `ExportJob` (async; poll `get`).
- `get(id)` → `ExportJob` (status `queued`/`running`/`completed`/`failed`, `filePath`).

## Key DTOs

`Album` has `pageSize: { width, height, unit: "mm" | "in" }`. `AlbumElement` coordinates are
normalized (0..1); `crop` is normalized to the source image. See `src/shared/api.ts` for the
full definitions.

## Media protocol

Images are displayed via `media://<kind>/<photoId>` where `kind` is `thumb256`,
`preview1024`, or `original`. The main process resolves the ID to a local file and streams
it — no filesystem paths leak into the renderer.
