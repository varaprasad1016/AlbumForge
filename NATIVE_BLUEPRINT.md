# AlbumForge Native Architecture — Interface Blueprint (Tauri 2 / Rust)

Companion to `MIGRATION.md` (phases/gates) and `src-tauri/README.md` (module
map). This document is the **engineering contract**: how the frontend calls
native operations, how errors and memory are managed, and where the
canvas/GPU layers of the product spec land. "Today" markers = on `main` now.

---

## 1. Guiding rules

1. **Renderer is a stateless presenter.** All heavy work and all persistence
   live behind typed commands; the canvas renders a normalized JSON state tree
   and nothing else.
2. **No raw filesystem paths in the DOM.** Files are served through the scoped
   `asset://` protocol or wrapped by `native.assetUrl()`.
3. **Secrets never cross the IPC boundary to the renderer.** Commands that need
   a key read it in Rust (`core/secrets.rs` — env now, OS keychain next) and
   only the *result* is returned.
4. **Fail loudly, degrade gracefully.** A missing command/feature is a typed
   error, never a silent no-op (see §5).
5. **Deterministic-first.** Native code is pure where possible (`core/*` is
   Tauri-free except the thin command layer) and testable with `cargo test`.

## 2. Target repository layout

```
src-tauri/
├── Cargo.toml · build.rs · tauri.conf.json · capabilities/default.json
├── src/
│   ├── main.rs                 # thin entry → albumforge_lib::run()
│   ├── lib.rs                  # AppState {cache_dir, db}, setup, handler list
│   ├── commands.rs             # thin IPC handlers (validate → core::* → emit)
│   └── core/                   # ★ host-independent logic (unit-testable)
│       ├── mod.rs
│       ├── db.rs               # [today: Electron db.ts] rusqlite port, 19 tables
│       ├── seed.rs             # [today: Electron seed.ts] templates + designs
│       ├── scanner.rs          # ✓ rayon folder walk + EXIF/GPS/camera (+ISO)
│       ├── proxy.rs            # ✓ JPEG q85 ≤2048px, background pool, cache
│       ├── export.rs           # ◐ 300/600 DPI raster → PDF/X-4 (WIP)
│       ├── http.rs             # [planned] reqwest for stock/gen providers
│       ├── secrets.rs          # ✓ env reads (BFL/stock); keychain next
│       └── error.rs            # [planned] AppError taxonomy (§5)

src/renderer/src/lib/
├── native.ts                   # ✓ typed invoke/listen shims over __TAURI_INTERNALS__
├── backend.ts                  # [Phase 2] Backend interface + impl selector
└── api.ts (src/shared)         # AlbumForgeApi DTOs — single source of truth

Legend: ✓ shipped · ◐ partial · [n/a] planned phase
```

## 3. Data flow (scan → canvas → export)

```
1. photos:import(dir)
     └─ scan_folder          rayon walk; ScannedPhoto[] light rows;
        events scanner-progress {current,total}
     └─ generate_proxies     background pool (2–6 threads, capped);
        JPEG q85, long edge ≤ 2048 px, EXIF-orientation applied;
        events proxy-progress {current,total,filename}; skips cache hits
     └─ db:insert            photos rows; preview_path = proxy path
2. UI renders <img src=native.assetUrl(proxyPath)>   // scope: cache+appdata
3. editor session          page JSON patches via albums:savePage (undo in UI)
4. exports:create(job)     native re-opens originals, reapplies layout matrix
                           + crops + filters + mattes at print DPI (§6 of MIGRATION)
```

**Jobs never block the UI:** every long command runs on
`tauri::async_runtime::spawn_blocking` (commands are `async fn`), progress is
pushed via `Emitter`, and the UI thread only renders counters.

## 4. Command surface

All commands return `Result<T, AppError>`; long ones take an `AppHandle` and
emit events. DTO field names are camelCase in JSON, matching `serde
rename_all` and `native.ts`.

### Today (implemented, verified `cargo check`)

| Command | In → Out | Events | Errors |
|---|---|---|---|
| `scan_folder` | `{dir}` → `ScannedPhoto[]` | `scanner-progress` | not-a-directory, walk I/O |
| `generate_proxies` | `{paths[], maxDim?}` → `ProxyInfo[]` | `proxy-progress` | per-file decode failures aggregated; `N of M failed: …` |
| `proxy_path` | `{photoPath}` → cache path string | — | — (frontend wraps with `assetUrl`) |
| `export_album` | `{job}` → `ExportResult` | `export-progress` | decode/IO (WIP surface) |

### Planned namespaces (mirror `AlbumForgeApi`; each lands with its Phase)

`app` (info/openPath/clearCache/openDataFolder/update), `dialogs` (Tauri dialog
plugin — file picks stay native), `projects`, `photos` (import/list/geo/
remove/segment), `templates`, `fonts`, `groups`, `albums`, `exports`,
`proofs`, `assets`, `designs`, `recommend`, `stock`, `gen`, `secrets` (set/use
only — never reads keys back).

**Call pattern (secure):**
- Renderer code calls the `Backend` interface (§2 of MIGRATION.md); the native
  impl goes through `native.ts` → `window.__TAURI_INTERNALS__.invoke` —
  **never** hand-built IPC strings.
- Capabilities (`capabilities/default.json`) stay least-privilege:
  `core:default`, `core:event:default`; the asset protocol scope is
  `$APPCACHE/**` + `$APPDATA/**`. New commands that touch files outside the
  scope must extend the capability list explicitly and be reviewed.

## 5. Error taxonomy & mapping

### Rust side — `AppError` (planned, `core/error.rs`)
```rust
pub enum AppErrorKind {
    InvalidInput,     // malformed args / unsupported format
    NotFound,         // missing row / file
    DecodeFailed,     // corrupt/unreadable image
    Storage,          // sqlite/fs failure
    Network,          // provider HTTP failure (stock/gen)
    Cancelled,        // user aborted a long job
    OutOfMemory,      // decode budget exceeded (see §6)
    Internal,         // bug — never leak internals
}
// Serialized to the renderer as { code, message, details? }.
// `details` may hold a redacted context (e.g. filename), never secrets/paths.
```
Every `core` fn returns `Result<T, String>` today; commands normalize strings
into `AppErrorKind` as they cross the boundary. Deriving `Serialize` keeps the
contract in `native.ts` (`NativeError { code, message }`) byte-aligned.

### Frontend mapping
- `backend.*` rejects with `NativeError`; screens show a per-kind message
  (e.g. `DecodeFailed` on a corrupt file in an import row — never a blanket
  failure).
- Progress events carry `{current, total}` so long jobs degrade to counters.
- Batch semantics: `generate_proxies` **aggregates** per-file failures and
  returns successes, so one corrupt file cannot block a 5,000-image shoot.

## 6. Memory management rules

**Rust (native core):**
- Decode scope is per-file: `image::open` → process → drop before the next
  item; only proxy files (not buffers) accumulate on disk.
- Concurrency is *bounded*: rayon `background_pool()` = half the cores,
  clamped 2–6 (`proxy.rs`). The pool is FIFO; nothing starves.
- Scan rows are metadata-only (no pixel buffers ever retained in RAM).
- *Planned:* a decode byte-budget semaphore (OOM guard for huge panoramas) and
  cancellable long jobs (job id returned to the renderer; drop = cancel token).

**Renderer (canvas / viewport):**
- The JSON state tree is the only source of truth; pages/elements are
  re-derived, never mutated in place.
- Virtualization contract (Phase 8): only the active page + adjacent viewport
  nodes are mounted; scrolling out destroys Konva nodes, their image textures
  and cached canvases. Proxies are the only pixels the canvas ever loads.
- Texture cache keyed by `proxyPath` with an LRU bound in pixels (not files),
  so a 5,000-photo shoot never grows GPU/decoded memory without bound.
- Image decode/`createImageBitmap` concurrency is capped in the renderer too —
  the webview must not request 200 proxies at once.

## 7. Codec & colour roadmap (proxy + export)

| Stage | Codec | Notes |
|---|---|---|
| Editor proxy (today) | **JPEG q85**, ≤2048px | Exact parity with legacy sharp pipeline (jpg previews the UI already renders); EXIF orientation applied in Rust. |
| Lossy WebP slot | `webp` crate (C `libwebp`) | `image` 0.25 is lossless-WebP-only (VP8L) — 3–10× larger than q85 JPEG on photos. Swap is one module fn when a C toolchain is guaranteed (CI Linux already has one). |
| Export (planned) | originals + ICC → PDF/X-4, CMYK TIFF | Originals keep embedded profiles; conversion via printpdf/ICM in Phase 5. Proxies assume sRGB (webview target). |

## 8. Canvas / GPU roadmap (product-spec layers 2–3)

Land after the cutover (Phase 8 of MIGRATION.md); nothing here is needed to
replace the Electron shell.

1. **Data-driven virtual viewport.** Enforce what the model already is: every
   page renders purely from normalized JSON; hidden/off-screen pages and their
   textures are destroyed (§6 renderer rules).
2. **Snapping & constraints engine.** Pure TS module (unit-testable like
   `engine/*`): edge-intersection, grid baselines, print safe/bleed zones over
   a localized spatial index of the active page's elements.
3. **Hardware filter pipeline.** Exposure/contrast/highlights/shadows/
   saturation/hue pass parameters to **WebGL fragment shaders** applied to the
   proxy texture of the active image node (non-destructive: the texture lives
   inside the clip-path matrix; pan/scale/rotate inside the frame mutates only
   the crop, never the source or the layout grid). Fallback = the current
   CPU/canvas filters so old hardware keeps parity with export.
4. **GPU memory budget guard.** Combined texture pixel budget across the LRU
   (§6) so a 5,000-photo album can't exhaust VRAM.

## 9. Testing & CI

- `cargo check` on every push (CI `native` job) + `npm run check:native`
  locally. `cargo test` once `core/*` fixtures land (scanner EXIF matrix,
  proxy cache idempotency, crop math parity with `engine`).
- The Electron harness (`npm test`, 49 tests) stays green until the cutover
  gate; export parity is proven by golden-diff (§5 of MIGRATION.md), not by
  assertion.
- Never commit secrets, `.env`, `config.json`, or generated `gen/`/`target/`
  paths (all already ignored).
