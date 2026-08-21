# AlbumForge — Architecture

AlbumForge is a **local Windows desktop application** (Electron). A photography studio runs
it on their own machine; photographs and album data never leave that machine. There is no
server, no cloud storage, and no multi-tenant SaaS — the product is the offline composition
engine plus a lightweight editor.

It is **not** a photo editor. Photographs are already finished when they arrive; AlbumForge
turns thousands of them into professionally laid-out albums automatically.

---

## 1. Guiding principles

1. **Albums are data, not pixels.** An album is stored as *structured layout data*
   (pages → elements with normalized coordinates, crops, rotations). Pixels are produced
   only at render/export time, which is what enables editing-after-generation, re-export at
   any resolution, template switching and versioning.
2. **The photographer is the expert.** Everything the engine does is overridable by a human.
3. **Deterministic first, "AI" later.** The layout/generation engine is a deterministic,
   testable algorithm. Analysis providers sit behind small interfaces and can be swapped.
4. **Local only.** Originals are referenced in place (never copied or moved); thumbnails and
   previews are generated into a local cache; all state lives in an embedded SQLite database.
5. **Simple and reliable over clever.**

---

## 2. Process model

Electron splits the app into two processes that communicate over a typed IPC bridge:

```
┌────────────────────────── Renderer (Chromium) ──────────────────────────┐
│  React + TypeScript + Tailwind                                          │
│  Konva album editor, virtualised photo gallery                          │
│  Calls window.albumforge.* (contextBridge API)                          │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ IPC (invoke/handle)
┌───────────────────────────────▼─────────────────────────────────────────┐
│  Main process (Node.js)                                                 │
│  ├─ SQLite (better-sqlite3) — projects, photos, albums, templates, …    │
│  ├─ sharp — analysis + thumbnails + page compositing                    │
│  ├─ pdf-lib — print-ready PDF (trim/bleed/media boxes)                  │
│  ├─ engine/ — the proprietary layout & generation engine (pure TS)      │
│  └─ media:// protocol — streams local thumbnails/previews/originals     │
└─────────────────────────────────────────────────────────────────────────┘
```

The renderer never touches the filesystem or SQLite directly. It receives data as plain
DTOs and displays images via the `media://` custom protocol (registered in the main
process), which maps a `photoId` to its local file without exposing raw paths.

---

## 3. Repository layout

```
AlbumForge/
├── electron.vite.config.ts     # main/preload/renderer build config
├── electron-builder.yml        # Windows installer packaging
├── package.json
├── src/
│   ├── shared/api.ts           # ★ typed IPC contract (main ↔ renderer)
│   ├── main/
│   │   ├── index.ts            # app bootstrap, window, media:// protocol
│   │   ├── db.ts               # SQLite schema + helpers
│   │   ├── seed.ts             # 5 template families + 11 layouts
│   │   ├── ipc.ts              # IPC handlers (the application surface)
│   │   ├── imaging.ts          # sharp: metadata, blur, phash, thumbnails
│   │   ├── generate.ts         # DB ↔ engine bridge + persistence
│   │   ├── export.ts           # page compositing + PDF assembly
│   │   └── engine/             # ★ proprietary core (pure TypeScript)
│   │       ├── types.ts  layouts.ts  rng.ts
│   │       ├── templateEngine.ts  layoutEngine.ts  cropping.ts
│   │       ├── scoring.ts  selection.ts  grouping.ts  generator.ts
│   ├── preload/index.ts        # contextBridge → window.albumforge
│   └── renderer/               # React app
│       └── src/ (components, pages, App.tsx)
```

The **proprietary core** is isolated under `src/main/engine/` so it can be versioned,
licensed and tested independently of the Electron/UI plumbing.

---

## 4. Technology choices

| Concern | Choice | Rationale | License |
|---|---|---|---|
| Shell | Electron | Most mature desktop packaging, native dialogs/filesystem, Node for imaging | MIT |
| UI | React + TS + Tailwind | Productive, typed, standard | MIT |
| Editor | **Konva.js** | Scene-graph maps 1:1 to album data (see §5) | MIT |
| Storage | better-sqlite3 | Embedded, synchronous, zero-config, ideal for a desktop app | MIT |
| Image processing | sharp | Fast libvips-based, covers resize/crop/rotate/composite/convolution | Apache-2.0 |
| PDF export | pdf-lib | Low-level control of MediaBox/TrimBox/BleedBox for print | MIT |
| Gallery | react-window | Virtualised grid for 5,000+ photos | MIT |

---

## 5. Editor choice: Konva.js over Fabric.js

- **Scene graph == album data.** An album page *is* a scene graph (`Group`/`Image`/`Rect`/
  `Text`). Mapping `album_elements` ↔ Konva nodes is direct serialization, and the
  server-side (main-process) renderer uses the same primitive math with sharp, so editor
  and export agree.
- **Explicit crop/transform.** Konva `Image` supports a source crop rect plus node
  width/height, exactly matching our `crop` + normalized `x/y/width/height` schema.
- **Performance.** The editor renders one page at a time from 1024px previews.

---

## 6. Album as structured data

```
Album
 ├── metadata (name, page_size, template, variation)
 ├── album_versions ──> immutable snapshots (layout_json)
 └── album_pages
      └── album_elements[]
            { type: "image", photoId, x, y, width, height, rotation,
              crop: {x,y,width,height} }        # all normalized
            { type: "text", text, x, y, ... }
```

Coordinates are normalized to the page (0..1) so the same album renders at any DPI/page
size. Photos are referenced by `photoId`; the actual file is resolved to an original or a
preview at render/export time.

---

## 7. The generation pipeline

`src/main/engine/generator.ts` orchestrates:

1. **Select** (`selection.ts`) — all / selected / AI-ranked (diversity-aware, no LLM).
2. **Order** (`generator.ts`) — chronological by EXIF/mtime, or group-aware for
   non-chronological families; a different high-quality "lead" per variation.
3. **Compose** (`templateEngine.ts` + `layoutEngine.ts`) — pick a layout, assign photos to
   slots (aspect/orientation/quality), compute smart crops (`cropping.ts`).
4. **Persist** (`generate.ts`) — write album → pages → elements.

Variations are genuine (seed-driven layout stream, lead selection, bounded reordering) and
reproducible — same inputs always produce the same album.

---

## 8. Local data safety

- Originals are **referenced in place** — the app stores only their absolute path.
- Thumbnails/previews are written to `%APPDATA%/AlbumForge/cache`.
- The database lives at `%APPDATA%/AlbumForge/albumforge.db` (SQLite, WAL mode).
- The renderer accesses images only through the `media://` protocol, which resolves a
  `photoId` server-side; raw filesystem paths are never exposed to page scripts.

See `SECURITY.md`.

---

## 9. Proprietary vs. open-source

| Module | Status |
|---|---|
| `engine/*` (layouts, template engine, layout engine, cropping, scoring, selection, grouping, generator) | **Proprietary** (our IP) |
| Electron, React, Konva, sharp, better-sqlite3, pdf-lib, react-window, Tailwind | Open-source infrastructure |

All third-party licenses are documented in `THIRD_PARTY_LICENSES.md`.
