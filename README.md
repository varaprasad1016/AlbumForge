# AlbumForge

Automatically turn thousands of finished photographs into professionally laid-out physical
albums — in minutes, not hours. **AlbumForge is a local Windows desktop application.** Your
photos never leave your machine: no cloud, no accounts, no uploads.

> AlbumForge is **not** a photo editor. No filters, brushes, curves, retouching, RAW editing,
> or generative tools. Your photographs are already finished; AlbumForge solves the
> composition problem — turning 3,000–5,000+ finished images into preset collage album
> templates automatically.

## What it does

1. Create a project (e.g. "Wedding — John & Sarah").
2. Import a folder of finished photos (thousands at once).
3. Photos are auto-analysed locally (quality, sharpness, perceptual hash, duplicate detection).
4. Choose a preset template family (Classic, Luxury, Modern, Editorial, Collage), page size,
   page count, selection mode, and number of variations.
5. Click **Generate albums** — the engine composes complete album proposals (20–50 pages),
   each with genuinely different layout decisions.
6. Review and make minor layout adjustments in the built-in editor (drag, crop, rotate,
   replace, delete, add, text, undo/redo).
7. **Export a print-ready PDF** (300 DPI, correct physical size + bleed/trim boxes).

Everything is stored **locally** in an embedded SQLite database; originals are referenced
in place (never copied or moved), and thumbnails are generated into a local cache.

## Stack

| Layer | Tech |
|---|---|
| Shell | Electron |
| UI | React + TypeScript + Tailwind + Konva |
| Engine | TypeScript (deterministic, proprietary layout engine) |
| Storage | better-sqlite3 (embedded, local) |
| Image processing | sharp |
| PDF export | pdf-lib |

## Run (development)

```bash
npm install
npm run dev
```

## Build the Windows installer

```bash
npm run dist
```

Produces `dist/AlbumForge Setup <version>.exe` (NSIS installer, per-user, optional install
directory).

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — design and decisions
- [DEVELOPMENT.md](DEVELOPMENT.md) — running, typechecking, building
- [DATABASE.md](DATABASE.md) — local SQLite schema
- [ALBUM_ENGINE.md](ALBUM_ENGINE.md) — the layout/generation engine
- [TEMPLATES.md](TEMPLATES.md) — template system
- [AI_PIPELINE.md](AI_PIPELINE.md) — analysis & selection
- [API.md](API.md) — the IPC contract (preload bridge)
- [SECURITY.md](SECURITY.md) — local data safety
- [DEPLOYMENT.md](DEPLOYMENT.md) — packaging & distribution
- [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) — dependency licenses

## License

Proprietary. See `THIRD_PARTY_LICENSES.md` for open-source dependencies.
