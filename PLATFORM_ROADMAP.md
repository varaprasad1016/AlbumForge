# AlbumForge → AI Album Design Platform — Implementation Roadmap

**Status:** Working plan · **Basis:** current codebase (v0.7, Electron + React + Konva + sharp)
**Goal:** turn the local composer into a SmartAlbums-speed / Canva-flexible / Photoshop-layered,
cloud-capable, AI-assisted album design platform aimed at high-end event (esp. multi-day Indian
wedding) photography.

This document is the deliverable for the six requested modules: it maps each module onto what
already exists, what is missing, and gives a phased build order, the architectural design, the
canvas stack recommendation, the database schema updates, and the two requested code deliverables
(Smart Frame drag-and-drop, layer order management) which are already implemented in the repo.

---

## 0. Headline findings

| Requested module | Current state | Gap |
|---|---|---|
| 1. Universal image ingestion | ✅ JPEG/PNG/WebP/TIFF/HEIC/HEIF + EXIF (time, GPS, camera) + local downscaling via sharp | — |
| 2. Advanced canvas + Smart Frames | ✅ Konva canvas, drag/transform, snap guides, align, zoom/pan, multi-select, Smart Frame drop + Crop/Pan mode, layer tree panel | First-class `frame` elements (mask shapes) still optional |
| 3. SmartAlbums auto-layout | ✅ deterministic engine: selection, ordering, slots, face-aware crops, variations | **Time-gap beat segmentation → done this pass** (spreads open new event beats); print-grid template depth still polish |
| 4. Canva-like graphics + AI recs | ✅ 200+ ornament graphics, shapes, text, SVG/PNG assets | **Recommendation engine → done this pass** (palette + event type → bg/ornament/fonts) |
| 5. Photoshop-lite layers | ✅ opacity, full z-order, **blend modes + filters → done this pass** | **On-device subject cutout → done this pass** (@imgly U²-Net); filters are image-only for now |
| 6. Print-ready export | ✅ 300/600 DPI PDF, bleed/trim/media boxes, lab presets, safe zones | Blend modes + filters + subject mattes now render in export identically; CMYK TIFF/JPEG spread export still open |
| Cloud | ❌ deliberately local-only (see ARCHITECTURE.md §4) | Requires a product decision — see §4 |

---

## 1. Architecture — recommended canvas stack

**Stay on Konva.js.** It is already the editor and it is the right choice for this product.

- The album data model *is* a scene graph (`AlbumPage → AlbumElement[]` with normalized
  `x/y/width/height/rotation/crop`). Konva nodes serialize 1:1 to that schema (see
  `src/renderer/src/components/AlbumEditor.tsx` → `ElementNode`).
- Export agreement: the main-process compositor (`src/main/export.ts`) uses the **same primitive
  math** with sharp, so what you see in the editor is what prints. Fabric.js would fight this;
  a WebGL engine (PixiJS) buys nothing at 10–50 elements per page and costs the exact-match
  export guarantee.
- Konva already gives us: group transforms, per-node opacity, clipping (`clipFunc` for masks),
  hit-testing (`stage.getIntersection` — used by the new drop handler), and a Transformer.

**Escalation path (record for later, don't build now):** if a future "smart design AI" needs to
preview hundreds of generated spreads at once, add a second, headless renderer — Konva → stage
`toDataURL` offscreen, or render candidates server-side with sharp and show thumbnails. The
layout engine already emits data-only albums, so previews are cheap either way.

**AI placement:** keep the deterministic engine (`src/main/engine/`) as the source of truth and
put every AI capability behind a small interface (like the existing analysis pipeline). Analysis
stays **local-first** (on-device models), with cloud as an optional accelerator — see §4.

---

## 2. Step-by-step implementation plan

Phases are ordered by dependency and value. Each maps to the requested module.

### Phase A — Ingest & analysis hardening (Module 1) — *mostly done*
- [x] HEIC/HEIF: added to `MIME_BY_EXT` + import dialog filters (`src/main/ipc.ts`). sharp 0.33
      prebuilt binaries include libheif, so decode/thumbnail/analysis work unchanged. **Verify on
      real iPhone exports** (some HEIC files carry rotation flags; `imageInfo` already handles
      EXIF orientation).
- [x] EXIF: timestamp, GPS already extracted (`src/main/imaging.ts`).
- [x] Downscale-for-editor / preserve-original-for-export already in place
      (`thumb256`/`preview1024` cache vs. in-place originals).
- [ ] Add a format capability check at import time (catch failed decodes with a clear per-file
      error instead of a silent `failed` counter).

### Phase B — Smart Frames + layer management (Module 2) — *done this pass*
Implemented and verified (typecheck + tests green):
- **Smart Frame drag-and-drop** — see §6.
- **Crop/Pan mode** — double-click a photo to enter; drag pans, zoom slider (1×–8×) zooms, Reset
  returns to object-fit cover, Esc/Done/select-elsewhere exits.
- **Full layer order** — Bring to Front / Send to Back / Forward / Backward + keyboard
  (`Ctrl+]`, `Ctrl+[`, `Ctrl+Shift+]`, `Ctrl+Shift+[`).
- **Layer tree panel** — top-to-bottom list with reorder + select.

Remaining in Module 2:
- [ ] **Frames as first-class elements** (optional): a `frame` element type with a mask shape
      (circle, arch, mandala, heart…) that a photo fills — schema note in §5. The drop handler
      already targets *image* elements; a frame element would be the same path with `photoId` on
      the frame.
- [ ] Background / Midground / Foreground grouping: either a `layer_group` column (see §5) or a
      computed bucketing in the layer panel (cheap, do this first).

### Phase C — Auto-layout depth (Module 3) — *mostly done, polish*
- [x] Selection → chronological/group-aware ordering → layout slots → face-aware crops →
      variations (`src/main/engine/`).
- [ ] **Time-gap spread segmentation:** in `grouping.ts`, cluster consecutive shots by capture
      gap (e.g., >15 min ⇒ new event beat) and bias spread boundaries to land between clusters —
      this is the "multi-day wedding" SuperPower.
- [ ] Expand the print-grid template library (TEMPLATES.md): add 300 DPI-safe grids with enforced
      gutter/bleed/safe-area constraints per `PageStyle`.
- [ ] Aspect-ratio reflow: when replacing a photo, optionally re-derive the layout for the new
      aspect (reuse `recomposePage`).

### Phase D — Color palette + AI recommendation engine (Module 4) — *done this pass*
- **`src/main/recommend.ts`** — k-means palette extraction (`kMeansPalette`, deterministic seeds),
  cross-photo merge, and pure `suggestDesign(palette, eventType, fonts)` rules:
  - warm palettes → gold accent (`#c9a227`), otherwise a complementary hue;
  - event type (wedding/mehndi/baraat/sangeet/reception) → ornament pool, background pattern, and a
    font pairing (script + display + body) validated against the installed font library;
  - background is a soft, palette-tinted ivory.
- **IPC** `recommend:suggest(photoIds, eventType)` reads the page's photos from the DB, extracts
  palettes from the cached previews (fast), and returns a `DesignSuggestion`.
- **UI** — “✨ Suggest design” in the editor's Page panel: applies background + ornament + title font
  in a single undoable commit.
- 8 unit tests in `src/main/recommend.test.ts`. The rule layer is the seam where an LLM/cloud
  provider can later be dropped in behind the same interface.

### Phase E — Photoshop-lite layer controls (Module 5) — *done this pass*
- **Blend modes:** stored in `style.blendMode` (`multiply`/`screen`/`overlay`/`soft-light`);
  renderer applies it on every element Group (`globalCompositeOperation`); `src/main/export.ts`
  passes it straight to sharp's `composite({ blend })` — same whitelist both sides.
- **Filters:** `style.filters` with canonical ranges (brightness/saturation/contrast multipliers,
  hue °, blur sigma) so preview and print agree: Konva maps them to `Brighten`/`HSL`/`Contrast`/
  `Blur` (`imageFilterProps` in the editor), sharp maps them to `modulate`/`linear`/`blur`
  (`applyImageFilters` in export). Image elements only for now; blend applies to every layer type.
- **AI background removal (on-device):** `src/main/segment.ts` runs
  `@imgly/background-removal-node` (U²-Net class model + onnxruntime, lazy-loaded) in the main
  process and writes a grayscale-with-alpha matte to the cache. `subject_mattes` table stores
  paths; `media://matte/<photoId>` serves them to the editor, which composites via a
  `destination-in` canvas pass; export applies the same matte with sharp `dest-in` (crop-aligned,
  original resolution). UI: “Remove background” button in the Element inspector — the subject is
  isolated so ornaments can sit behind the person. Fully local; photos never leave the machine.
  Notes: adds `@imgly/background-removal-node` (+`onnxruntime-node`) as a production dependency
  (~130 MB unpacked — the models are bundled), a `sharp` override to 0.33.5, and
  `allowScripts` entries for the native postinstalls.

### Phase F — Print-ready export v2 (Module 6) — *mostly done, extend*
- [x] PDF at true physical size, 300/600 DPI, TrimBox/BleedBox/MediaBox, lab presets, safe-zone +
      center-fold guides in the editor.
- [ ] **CMYK TIFF/JPEG spreads:** sharp converts RGB→CMYK (ICM profile via `sharp.cmyk()` /
      `.toColourspace('cmyk')`) — composite each spread at page DPI, export per-spread TIFF + a
      manifest (matches the existing package-manifest pattern in `src/main/export.ts`). Note: true
      ICC profile embedding is a sharp limitation; document the lab profile hand-off.
- [ ] **Bleed-aware editor toggle:** show trim vs. bleed edges on demand (guides already exist).

### Phase G — Cloud (product decision) — *see §4 before scheduling*

---

## 3. Architecture — current vs. target

```
CURRENT (local desktop)
┌──────────────────────────────────────────────────────────────┐
│ Renderer: React · Konva editor · media:// previews            │
│   └─ window.albumforge.* (typed IPC, src/shared/api.ts)       │
│ Main: SQLite (better-sqlite3) · sharp · pdf-lib · engine/     │
│   └─ local cache thumbnails; originals referenced in place    │
└──────────────────────────────────────────────────────────────┘

TARGET (local-first + optional cloud)
┌──────────────────────────────────────────────────────────────┐
│ Renderer: same, + layers panel, crop/pan, blend/filter UI,    │
│           AI suggest button                                   │
│ Main: engine/ (unchanged) + recommend/ + segment/ (new)       │
│       + export v2 (CMYK TIFF)                                 │
│ Sync layer (new, optional):                                    │
│   └─ outbox/queue of album ops → cloud workspace API          │
│       (albums, palettes, mattes; NOT original photo bytes)    │
│ Cloud services (optional):                                     │
│   └─ auth/workspace · object storage for mattes & exports ·   │
│       optional GPU segmentation/recommendation endpoints      │
└──────────────────────────────────────────────────────────────┘
```

**Cloud decision (do NOT assume):** the product is currently *local-only by design*
(ARCHITECTURE.md §4 — photos never leave the machine). Three viable strategies, cheapest first:

1. **Local-first + optional sync** — keep everything local; add an export/sync path so studios
   can push *finished albums* (data + previews, not RAW/HEIC originals) to a workspace for client
   proofing. Lowest risk, preserves the privacy promise.
2. **Hybrid compute** — same as (1), but heavy AI (segmentation, recommendation) can be routed to
   cloud endpoints when the user opts in.
3. **Full SaaS** — port to a web canvas (Konva runs in the browser; the engine is pure TS, so it
   ports nearly untouched) with server-side sharp/pdf-lib. Highest cost, removes the local-only
   differentiator.

**Recommendation:** build (1) now — it doesn't change the schema contract, keeps the 
"albums are data" invariant, and every feature in Phases A–F ships locally first. The typed IPC
surface (`src/shared/api.ts`) already acts as the seam where a sync adapter can be added.

---

## 4. Database schema updates

Additive, backward-compatible. All flexible fields remain JSON TEXT.

```sql
-- Photos: palette + event tagging for the recommendation engine (Phase D)
ALTER TABLE photos ADD COLUMN dominant_colors TEXT;      -- JSON [{hex, weight}...]
ALTER TABLE photos ADD COLUMN palette_updated_at TEXT;

-- Projects: event type drives recommendations
ALTER TABLE projects ADD COLUMN event_type TEXT;          -- 'wedding' | 'mehndi' | 'baraat' | 'reception' | ...

-- Per-layer Photoshop-lite state (Phase E)
-- IMPLEMENTED without migrations: blend_mode / filters / mask live in album_elements.style JSON
--   style.blendMode  = 'multiply' | 'screen' | 'overlay' | 'soft-light'
--   style.filters    = { brightness?, saturation?, hue?, contrast?, blur? } (canonical ranges)
--   style.mask       = { kind: 'alpha' } (matte resolved from the element's photoId)
ALTER TABLE album_elements ADD COLUMN hidden INTEGER DEFAULT 0;   -- layer tree visibility (future)
ALTER TABLE album_elements ADD COLUMN locked INTEGER DEFAULT 0;   -- layer tree lock (future)
ALTER TABLE album_elements ADD COLUMN layer_group TEXT;   -- 'background' | 'midground' | 'foreground' (future)

-- Frames as first-class elements (optional, Phase B)
-- No new table: extend album_elements.type with 'frame'; the frame's mask shape lives in
-- `style` (e.g. {maskShape:'mandala'}), and the photo that fills it in photo_id + crop.

-- Segmentation cache (Phase E) — IMPLEMENTED as-is in src/main/db.ts
CREATE TABLE IF NOT EXISTS subject_mattes (
  photo_id TEXT PRIMARY KEY,
  matte_path TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Recommendation cache (optional, Phase D): store the last suggestion so "regenerate" is cheap
CREATE TABLE IF NOT EXISTS design_recommendations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  event_type TEXT,
  palette TEXT,                   -- JSON colors used
  recommendation TEXT NOT NULL,   -- JSON {backgrounds[], graphicIds[], fontPairing}
  created_at TEXT NOT NULL
);

-- Cloud sync (Phase G, only if strategy 1/2 chosen)
ALTER TABLE albums ADD COLUMN server_id TEXT;
ALTER TABLE albums ADD COLUMN sync_state TEXT DEFAULT 'local';   -- 'local'|'pending'|'synced'
ALTER TABLE albums ADD COLUMN updated_at TEXT;
CREATE TABLE IF NOT EXISTS sync_operations (                    -- outbox
  id TEXT PRIMARY KEY,
  entity TEXT NOT NULL, entity_id TEXT NOT NULL,
  op TEXT NOT NULL,             -- 'upsert'|'delete'
  payload TEXT,                 -- JSON (album data + preview refs, never originals)
  status TEXT DEFAULT 'pending', created_at TEXT NOT NULL
);

-- Export v2
-- No schema change: reuse exports.kind ('cmyk_tiff_spreads' | 'cmyk_jpeg_spreads') + settings JSON.
```

`crop` needs no change for Crop/Pan mode: pan = shift `crop.x/y`, zoom = shrink `crop.width/height`
around the crop centre, `crop: NULL` = automatic object-fit cover. This keeps every existing
reader (engine, export, mobile) compatible.

---

## 5. Deliverable 1 — Smart Frame drag-and-drop (implemented)

Files: `src/renderer/src/components/PhotoPicker.tsx` (drag source) +
`src/renderer/src/components/AlbumEditor.tsx` (drop target + cover-crop).

**Interaction model.** An image element *is* a smart frame: a fixed bounding box that any photo
can fill. Dropping a photo onto it replaces the photo and re-derives the `object-fit: cover`
crop (`crop: null` → auto-centre/scale in `ElementNode`). Dropping on empty canvas adds a photo
centred at the drop point, sized to the photo's aspect ratio.

**Drag source** (`PhotoPicker`): each thumbnail is `draggable`; `onDragStart` puts
`{id, w, h}` on the dataTransfer (dimensions let the drop target size the new element):

```tsx
<button
  draggable
  onDragStart={(e) => {
    e.dataTransfer.setData(
      "application/x-albumforge-photo",
      JSON.stringify({ id: p.id, w: p.width, h: p.height }),
    );
    e.dataTransfer.effectAllowed = "copy";
  }}
  onClick={() => onSelect(p.id)}
>
```

**Drop target** (`AlbumEditor.handleCanvasDrop`): the stage container is the drop zone
(`onDragOver` preventDefault). The screen drop point is mapped into stage-local coordinates
(inverting the stage's absolute transform so zoom/pan don't break hit-testing), then
`stage.getIntersection` finds the topmost shape and we walk up to the owning element group
(each `ElementNode` root `Group` carries `id={el.id}`):

```ts
const inv = stage.getAbsoluteTransform().copy().invert();
const pos = inv.point({ x: e.clientX - rect.left, y: e.clientY - rect.top });

let hitEl: AlbumElement | undefined;
const top = stage.getIntersection(pos);
let n: Konva.Node | null = top;
while (n && n !== stage) {
  const nid = n.id();
  if (nid && elements.some((el) => el.id === nid)) {
    hitEl = elements.find((el) => el.id === nid);
    break;
  }
  n = n.getParent();
}

// Smart frame: replace photo, reset to auto cover-crop
if (hitEl?.type === "image") {
  persist(page with { ...el, photoId: data.id, crop: null });
}
```

**Cover-crop math** (`coverCrop` in `AlbumEditor.tsx`) — the same logic `ElementNode` uses to
render, so drop ⇒ render are identical:

```ts
function coverCrop(srcW: number, srcH: number, nodeW: number, nodeH: number): CropRect {
  const srcAspect = srcW / srcH;
  const nodeAspect = nodeW / nodeH;
  if (srcAspect > nodeAspect) {
    const w = nodeAspect / srcAspect;
    return { x: (1 - w) / 2, y: 0, width: w, height: 1 };
  }
  const h = srcAspect / nodeAspect;
  return { x: 0, y: (1 - h) / 2, width: 1, height: h };
}
```

**Crop/Pan mode** (`cropMode` state + `panCropMove` in `ElementNode`): double-click enters mode
(Transformer is disabled so its handles don't fight the pan). Dragging keeps the frame fixed and
moves the crop window instead — the group's position is reset every move while the crop rect is
shifted by the cursor delta, scaled by `crop.width / nodeWidth` so pan follows the cursor 1:1.
Zoom is a slider in the inspector that shrinks the crop around its centre (1× = full cover;
8× = tight detail). "Reset crop" sets `crop: null` → back to automatic cover. Live drag edits use
a no-history update + single history entry on release, so Ctrl+Z returns to the pre-pan state
rather than recording hundreds of steps.

---

## 6. Deliverable 2 — Layer order management (implemented)

File: `src/renderer/src/components/AlbumEditor.tsx`.

The four operations operate on the normalized `z` of `AlbumElement`. `z` values are not
required to be dense — bring-to-front uses `maxZ + 1`, send-to-back uses `minZ - 1` — so no
reindexing is needed and new elements always land on top (`maxZ + 1` in `addPhoto`/`addText`/…).

```ts
function zSorted(list: AlbumElement[]) {
  return [...list].sort((a, b) => a.z - b.z);
}

/** Swap stacking order with an adjacent layer (delta +1 = forward, -1 = backward). */
function moveZ(id: string, delta: number) {
  const sorted = zSorted(elements);
  const idx = sorted.findIndex((e) => e.id === id);
  const target = idx + delta;
  if (idx < 0 || target < 0 || target >= sorted.length) return;
  const zA = sorted[idx].z, zB = sorted[target].z;
  const next = elements.map((e) =>
    e.id === sorted[idx].id ? { ...e, z: zB } : e.id === sorted[target].id ? { ...e, z: zA } : e,
  );
  commit(pagesState.map((p) => (p.id === page.id ? { ...p, elements: next } : p)));
}

function bringToFront(id: string) {
  const sorted = zSorted(elements);
  if (sorted[sorted.length - 1].id === id) return;
  const maxZ = sorted[sorted.length - 1].z;
  const next = elements.map((e) => (e.id === id ? { ...e, z: maxZ + 1 } : e));
  commit(pagesState.map((p) => (p.id === page.id ? { ...p, elements: next } : p)));
}

function sendToBack(id: string) {
  const sorted = zSorted(elements);
  if (sorted[0].id === id) return;
  const minZ = sorted[0].z;
  const next = elements.map((e) => (e.id === id ? { ...e, z: minZ - 1 } : e));
  commit(pagesState.map((p) => (p.id === page.id ? { ...p, elements: next } : p)));
}
```

Surfaces wired up:
- **Inspector buttons** — Front / Forward / Backward / Back grid in the Element panel.
- **Layers panel** — top-to-bottom list (sorted by `z` desc) with per-row reorder + select;
  double as the Module-2 layer tree.
- **Keyboard** — `Ctrl+]` forward, `Ctrl+[` backward, `Ctrl+Shift+]` front, `Ctrl+Shift+[` back.
- Ordering is committed through `commit()` so every reorder is undoable and autosaves.

---

## 7. Verification done

- `npm run typecheck` — clean (both node + web projects).
- `npm test` — 49/49 passing (engine ×2, export).
- Note: UI interactions (drag/drop, crop pan) are not covered by unit tests; recommend a manual
  pass in `npm run dev` after merge.

---

## 8. Open questions for you

1. **Cloud strategy** — local-first + optional sync, hybrid compute, or full SaaS? (Affects
   Phase G and the sync schema in §5.)
2. **AI segmentation budget** — ship on-device U²-Net as the default (no data leaves the
   machine) with a cloud fallback, or cloud-only?
3. **Blend-mode scope** — the 4 modes sharp supports natively, or a wider canvas-only set with
   export approximations?
4. **Frames as elements** — do you want literal `frame` elements (mask shapes) now, or is the
   current "every image is a frame" model sufficient for the first release?
