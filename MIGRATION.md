# AlbumForge — Electron → Tauri (Rust) Migration Plan

**Status:** Working plan · **Base:** `main` @ v0.10.13 · **Shell today:** Electron
(electron-vite / electron-builder) · **Native backend:** `src-tauri` (Tauri 2 /
Rust) — scaffolded, compiles in CI, **not yet the runtime** (see §2).

The goal is a staged, reversible cutover: every phase lands behind the typed
renderer bridge and keeps the Electron build shippable until the Rust stack
proves parity, so a broken native phase can never strand a release.

---

## 1. Non-negotiable invariants (from the product spec)

- **No edits** to `.env`, `.env.*`, `config.json`, or any secrets file; `.gitignore`
  paths stay untouched; history is never rewritten.
- **Secrets** come only from process env vars or the OS keychain (native
  `core/secrets.rs`; keyring landing later). Never compiled in, never logged,
  never persisted by the app.
- **Albums are data** — normalized JSON state tree; pixels are produced only at
  render/export time. The migration must not change the schema contract of the
  editor/engine.
- **Local-only.** Originals are referenced in place; only proxies/DB live in the
  app cache dir. Raw filesystem paths never reach the DOM (protocol-scoped URLs
  only).
- **Deterministic engine stays TS** (`src/main/engine/` is pure, unit-tested,
  Node-free) until a Rust/WASM port is justified — see Phase 4.
- Database changes are **additive** (no destructive migrations); downgrade =
  run the previous installer against the same data dir.

## 2. Where we are (ground truth, verified on `main`)

| Area | State |
|---|---|
| App runtime | Electron. `package.json`: `main: ./out/main/index.js`, `dev` = `electron-vite dev`, packaging `electron-builder`, `postinstall` rebuilds `better-sqlite3`/`sharp`. |
| Renderer bridge | `window.albumforge.*` via preload `contextBridge` (full `AlbumForgeApi`, `src/shared/api.ts`). |
| Rust backend | `src-tauri/` — `core/{scanner,proxy,export,secrets}.rs` + `commands.rs` + `lib.rs`. `cargo check` green (CI `native` job + `npm run check:native`). |
| Renderer → Rust | `src/renderer/src/lib/native.ts` typed bridge exists but **nothing imports/calls it** (searched `src/`). |
| Tauri tooling | `@tauri-apps/cli` 2.11 + `@tauri-apps/api` 2.11 installed; `dev:renderer` / `dev:native` / `tauri` scripts added (Phase 1, executed). |
| `tauri.conf.json` | Scaffold state: `beforeDevCommand: "npm run dev"` (recursive!), `devUrl: http://localhost:5173`, windows 1440×920 parity, asset protocol scope = cache + appdata. |
| Export (Rust) | `core/export.rs` is a foundation/WIP (prints DPI field warning: unused). |
| DB (Rust) | Not ported. Electron `src/main/db.ts`: 19 tables + `seed.ts` (5 template families, designs). |
| Docs | `ARCHITECTURE.md`, `DEVELOPMENT.md`, `README.md`, `PLATFORM_ROADMAP.md` still describe the Electron shell. |

## 3. Target architecture

```
┌──────────────────────────────────────────────────────────────────┐
│ Renderer (webview) — React + TS + Tailwind                       │
│  React screens → one typed Backend interface (Phase 2 seam)      │
│  Konva canvas = stateless presenter over the immutable JSON      │
│  state tree (albums/pages/elements, normalized 0..1 coords)      │
│  Deterministic engine/* (pure TS) runs here (Phase 4)            │
└───────────────┬──────────────────────────────────────────────────┘
                │ typed invoke / listen — never raw paths
┌───────────────▼──────────────────────────────────────────────────┐
│ Native shell (Tauri 2 / Rust) — commands.rs → core/*            │
│  rusqlite (bundled) — 19 tables ported from db.ts               │
│  core/scanner   — rayon walk, EXIF/GPS/camera, progress events  │
│  core/proxy     — JPEG q85 ≤2048px, background pool, cache      │
│  core/export    — 300/600 DPI raster → PDF/X-4 (WIP)            │
│  core/secrets   — env / OS keychain only                        │
│  asset:// protocol (scoped to cache + appdata) replaces          │
│    media://, stock://, font://  (resolve via DB, never DOM)      │
└──────────────────────────────────────────────────────────────────┘
```

## 4. Phases

Each phase has **definition of done** (verification commands) and is
independently mergeable. `npm test` (49 tests), `npm run typecheck`, `cargo
check`, and a manual dev run stay green after every phase.

### Phase 0 — Native foundation — *DONE*
Toolchain bootstrap (`scripts/setup-native.mjs`, GNU fallback on bare Windows),
CI `cargo check`, `src-tauri` scaffold compiling.
**Remaining gaps:** no runnable `tauri dev`; bridge dead code; export WIP;
no DB port; docs stale.

### Phase 1 — Tauri dev tooling + dual-shell dev loop — *EXECUTED*
Goal: `npm run dev:native` opens the **same renderer** in a Tauri window while
`npm run dev` keeps Electron as the regression harness.

1. [x] Deps: `@tauri-apps/api` 2.11 (runtime), `@tauri-apps/cli` 2.11 (dev).
2. [x] Renderer-only Vite dev server on a fixed port:
   - `vite.renderer.config.ts` (React plugin + the same aliases as
     `electron.vite.config.ts`'s renderer block; `root: src/renderer`,
     `server: { port: 5173, strictPort: true }`).
   - `package.json`: `dev:renderer`, `dev:native` (= `node
     scripts/dev-native.mjs`), `tauri` scripts.
3. [x] `src-tauri/tauri.conf.json`: `beforeDevCommand: "npm run dev:renderer"`;
   `frontendDist` stays `../out/renderer` for prod builds.
4. [x] `scripts/dev-native.mjs` launcher — resolves the toolchain like
   `setup-native.mjs` (GNU fallback when MSVC Build Tools are missing) so
   `npm run dev:native` works on bare Windows, then runs `tauri dev`.
5. [x] `native.ts` now calls the official `@tauri-apps/api` (`invoke`/`listen`)
   instead of hand-rolled `__TAURI_INTERNALS__` shims; exports `inTauri()` for
   the Phase-2 backend selector.
6. [ ] **Menu/devtools parity** (Tauri has no default app menu): add JS
   keybindings or a menu plugin — deferred, non-blocking for the dev loop.
7. **DoD (verified):** on a bare-Windows box (GNU fallback toolchain),
   `cargo build` produces `albumforge.exe`; `npm run dev:native` compiles,
   launches the window, and the renderer answers HTTP 200 on :5173 with hot
   reload. NOTE: data screens calling `window.albumforge.*` error under the
   native shell until the Phase-2 Backend adapter — expected.
   Rollback: delete the `dev:native` script — Electron path untouched.

### Phase 2 — One Backend interface (the adapter seam) — *EXECUTED*
Renderer screens keep calling the same namespaces; a bootstrap picks the impl
by runtime detection (`window.__TAURI_INTERNALS__` present ⇒ native).

1. [x] `src/renderer/src/lib/backend.ts`: `AlbumForgeApi` (the shared contract)
   **is** the single Backend interface. `detectShell()` returns
   `electron | tauri | none`; under Electron the preload bridge is untouched;
   under Tauri (or a bare Vite tab) `installBackend()` installs a typed
   `stubApi` on `window.albumforge` — every command rejects with a message
   naming the landing phase (`MIGRATION.md Phase 3/4`), listeners no-op with a
   console warning — so screens boot and fail loudly, never silently.
2. [x] Per-namespace `backendCapabilities` map (all true on Electron, all false
   on the native shell until Phases 3–4 wire commands in) + `backendBadge`
   (sidebar dot shows the active shell: Electron / Native / No-host).
3. [x] Boot hook in `main.tsx` before first render; `native.ts` (official
   `@tauri-apps/api`) remains the low-level channel the Phase-3 namespaces will
   call into.
4. **DoD (verified):** typecheck + electron-vite production build green; under
   `npm run dev:native` the renderer serves, `@tauri-apps/api` deps optimize,
   and the window boots with the stub installed (no crash on the missing
   preload). Under Electron nothing changes (preload short-circuits).

### Phase 3 — Storage + asset pipeline on Rust — *core EXECUTED + media seam DONE*
Ports the data plane; after this the native shell owns all persistence.
Photo grids render under the native shell (photos imported natively, or an
adopted Electron studio).

1. [x] **Schema port** → `src-tauri/src/core/db.rs` (rusqlite bundled; WAL;
   foreign keys). DDL **byte-identical** to `db.ts` (all 19 tables + indexes +
   the two additive migrations); `EXPECTED_TABLES` parity check in `cargo
   test`. DTOs mirror `src/shared/api.ts` (camelCase serde). DB opens at
   `app_data_dir/albumforge.db` with **copy-on-first-run** from the legacy
   Electron data dirs (Windows).
2. [ ] **Seed parity** `seed.ts` (templates/layouts/designs) → Rust — still
   open; templates stay Electron-only until then (blocks native album
   generation, not import).
3. [x] **Import pipeline** (Async Data Core): `core/import.rs` mirrors Electron
   `photos:import` — native EXIF/dims/GPS (`scanner::inspect_photo`),
   `<id>-thumb256.jpg` / `<id>-preview1024.jpg` proxies in the cache dir
   (Electron naming/dims; original decoded **once** via
   `proxy::render_proxy_sizes`), `'ready'` rows, per-file `import-progress`
   events, failure counting. Commands: `photos_import`, `photos_list`,
   `projects_create`, `projects_list` (incl. thumbnail pinning).
4. [x] **Protocols** (`media://` → scoped `asset://` on native): DONE —
   `mediaUrl(id, kind)` seam in `src/renderer/src/lib/backend.ts`. Electron
   keeps its privileged `media://kind/<id>` scheme (string-passthrough); the
   native shell returns `convertFileSrc(cacheDir/{id}-{suffix})` — WebView2
   cannot fetch a bare non-standard scheme (wry only intercepts
   `http://asset.localhost/…` on Windows; the asset protocol is scope-locked
   to `$APPCACHE`/`$APPDATA` and is what `convertFileSrc` emits per platform).
   Deterministic by construction: `{id}-thumb256.jpg` / `{id}-preview1024.jpg`
   (import) + `{id}-matte.png` (segment parity) — **zero IPC per image**, the
   only native round-trip is one `app_dirs` call fetched by the now-async
   `installBackend()` before first render. Legacy Electron cache adopted on
   first native run alongside the DB copy (`src-tauri/src/lib.rs`), so an
   existing studio's proxies land in the native cache and grids render. All 7
   `media://` literal call sites routed through the seam (PhotoGallery,
   PhotoPicker, ProjectsPage, MapPage, AlbumEditor ×3).
5. [x] **Seam wiring:** `native.ts` gained typed `projects.*` / `photos.*`
   (incl. `onImportProgress` subscription); `backend.ts` routes them into
   `AlbumForgeApi` on the native shell + capability flags.
6. **DoD (partial):** `cargo check`, `npm run typecheck`, `npm test` (101)
   green. Rust unit tests written (schema parity; import rows + proxy files at
   exact bounds; corrupt-file counting; list filters) but **cannot execute on
   the GNU+w64devkit fallback** — the tauri-linked test harness crashes at load
   (`STATUS_ENTRYPOINT_NOT_FOUND` on WebView2Loader); run `cargo test` under
   MSVC or Linux. Live native boot verified with an adopted Electron studio:
   DB + deterministic proxy files present in the native dirs, window up.
   Full “import 2,000 photos in the native shell” click-to-click parity still
   needs Phase-4 dialogs (chooseImages).

### Phase 4 — Service commands (IPC parity) + engine placement — *dialogs, namespaces, engine relocation, service namespaces DONE; seed parity + font-rendering seam open*
1. [x] **Dialogs** (this pass): `tauri-plugin-dialog` registered; five Rust
   commands mirror Electron's `dialog` IPC handlers exactly —
   `choose_images` (multi, Image filter incl. HEIC/TIFF), `choose_save_path`
   (PDF, pre-filled name), `choose_directory`, `choose_feedback` (JSON),
   `choose_assets` (SVG/PNG multi); cancel → `null` in every case, matching
   `AlbumForgeApi`. Parented to the main window like the plugin's own
   commands. Wired through `native.dialogs.*` → `backend.ts` (capability
   flag + real implementations replacing the stubs). **Import is now
   click-to-click under the native shell:** ProjectPage → `chooseImages` →
   `photos.importPhotos` (Phase 3) → grid via the media seam (Phase 3 tail).
2. [~] **Read/write namespace ports** (`core/library.rs` + `core/fonts.rs`):
   - [x] `groups` — full surface incl. `auto` (chronological segmentation,
     Rust port of `engine/grouping.ts` `segmentByTime`, 2700 s default gap),
     list/create/rename/remove/assign/merge/split/clear with Electron SQL
     parity (sort_order semantics, photo_count subquery, Group-N naming).
   - [x] `templates` — list/get reads (style + ordered layouts, JSON
     round-trip, missing row → null). Template *seed data* on a fresh native
     DB still awaits Phase 3 item 2 (seed parity) or the Phase 4 item 3
     engine refactor; an adopted Electron DB already carries the 14 families.
   - [x] `fonts:list` — pure dir scan of `$RESOURCE/fonts` + `data_dir/fonts`
     (`.ttf`, dedupe, sorted). Bundled fonts ship via `bundle.resources`
     (`resources/fonts` → `fonts`); dev copies them next to the debug binary
     in `dev-native.mjs`; asset scope extended with `$RESOURCE/fonts/**`.
     Font *file rendering* (`font://` URLs in CSS/`useFonts`) still needs the
     font URL seam — listed families render with system fallbacks until then.
   - [x] `albums` CRUD — list/get/pages/savePage/addPage/duplicatePage/
     deletePage/reorderPages/versions/snapshot/restoreVersion, byte-identical
     JSON round-trip (client element ids kept stable on save; page idx
     renumbering; layout_json version snapshots rebuilt with fresh ids).
   - Engine-coupled `albums.generate` + `albums.recomposePage` land in item 3
     below; the service namespaces (`exports`/`designs`/`proofs`/`app:*` in
     item 4; `assets`/`recommend`/`stock`/`gen` in item 5) follow.
   Wiring: `native.groups/templates/fonts/albums` → `backend.ts` real impls +
   capability flags. **Verified end-to-end over CDP on the native shell with
   real adopted data**: groups auto (5 photos → 1 group) + full group CRUD;
   14 templates with 10-layout detail; 42 font families; album save→add→
   duplicate→reorder→delete→snapshot→restore round-trips with page counts
   stable and `isSpread` correct (`spread_*` keys). Rust unit tests added
   (segmentation, group lifecycle, page/snapshot round-trip) — compile clean;
   still not runnable under the GNU fallback (see Phase 3 DoD note).
3. [x] **Album generation — renderer drives the pure-TS engine** (this pass):
   - Engine moved `src/main/engine` → `src/shared/engine` (**zero logic
     change**; only import paths updated in `src/main/{generate,ipc,export,
     seed}.ts`). Both shells now compile the same engine files — Electron's
     main process keeps its in-process path, and `engine.test.ts` (26 tests)
     passes from its new home, proving the engine is unchanged.
   - New commands: `photos:records` (parity with `photoRecordsFor`:
     defaults, decimal-string `phash`, epoch-seconds `takenAt`) and
     `albums:saveGenerated` (parity with `persistAlbum` incl. `'generated'`
     status + `{color, pattern}` page background).
   - New `src/renderer/src/lib/albumGen.ts`: `familyFromTemplate` (parity
     with `familyFor`), `generateAlbums` (mirrors `generateAndPersist`:
     records → `selectForMode` → per-variation `generateAlbum` →
     `saveGenerated`) and `recomposePage` (engine `composePage` + `LAYOUT_CATALOG`,
     persisted via the existing `savePage`). Wired into the native shell's
     `albums.generate` / `albums.recomposePage`.
   - **Verified end-to-end over CDP**: 2-variation generate on the adopted
     studio produced two persisted `'generated'` albums (4 pages each:
     cover_front + spread_hero + hero_right + cover_back, correct `isSpread`
     and family `{color, pattern}` background), and a page recomposed to
     `hero_left` persisted. Engine runs in the webview; records + writes go
     through commands; the Node-only middleman is gone for the native shell.
4. [x] **Exports / designs / proofs + `app:*`** (this pass):
   - `exports` — `create`/`get` persist real job rows (Electron `settings`
     JSON parity, status `queued`). The Electron handler fires an in-process
     `runExport` (sharp/pdf-lib); the native runner that completes rows is
     **Phase 5** (`core/export.rs`) — jobs stay `queued` (UI polls `get`)
     until then, which is transparent and correct.
   - `designs` — full list/save/get/remove CRUD (layout JSON round-trip).
   - `proofs` — new `core/proofing.rs` port of `proofing.ts`: `build` writes
     the byte-identical self-contained gallery (index.html + copied thumbs),
     `importFeedback` applies favourites (`selected`) + `photo_notes` upserts,
     `notes` joins. Thumbnail resolution falls back from the stored
     `thumbnail_path` to the deterministic native-cache file — found by E2E:
     adopted Electron rows can point at a legacy cache that no longer exists.
   - `app:*` — `info` (version/author/dirs), `openPath`/`openDataFolder`
     (OS shell), `clearCache` (wipe + recreate, Electron parity). The update
     trio (`checkForUpdates`/`downloadUpdate`/`installUpdate` + events) stays
     stubbed with an explicit Phase 7 message — it needs the packaged app.
   - Wired: `native.exports/designs/proofs/app` → `backend.ts`; capability
     flags on (updates remain off). **CDP-verified on the native shell** over
     the adopted studio: info dirs, export job row (`queued`) + get, designs
     save/list/get/remove, feedback import (1 fav + 1 comment applied, photo
     selected, note listed), and proof gallery build writing all 5 thumbnails
     via the cache fallback.
5. [x] **`assets` + `recommend` + `stock` + `gen`** (this pass — the plan's
   Phase 6 pull-forward, landed early so every namespace on the app seam
   resolves to a real implementation under the native shell):
   - `assets` — full CRUD in `library.rs` (SVG/PNG → data URIs, ≤2 MB gate,
     Electron import semantics incl. failure counting).
   - `recommend` — pure k-means/colour/event rules moved to
     `src/shared/recommend.ts` (single source, unit-tested via the existing
     suite); `src/main/recommend.ts` keeps only the `sharp` sampler + re-
     exports. Native input comes from the new `photos:palettes` command
     (`core/palette.rs`: native decode → fit-inside-64 RGB → base64) and
     `src/renderer/src/lib/recommendGen.ts` runs the shared engine with the
     native font list — Electron parity on both hosts.
   - `stock`/`gen` — native HTTP providers in `core/stock.rs` + `core/gen.rs`
     (reqwest, rustls; no system TLS dep on the GNU fallback). Search honours
     the weekly `stock_search_cache` TTL and persists downloads to
     `cache/stock/` + `stock_assets`; gen (pollinations keyless / BFL FLUX
     with job polling) normalizes to PNG and lands in `assets`. `parseSvg`
     lives in `src/shared/stockParse.ts` and runs in the renderer — native
     downloads return raw SVG text so both hosts share one parser. Provider
     choice + recent terms are the only non-secret state next to the data.
   - Keys (spec's security invariant): `secrets.rs` reads env first (Electron
     names), then the OS keychain (`keyring` 3 — Credential Manager /
     Keychain / Secret Service). `setApiKey` writes **only** the keychain;
     Electron's `userData/*-config.json` plaintext-key habit is never
     replicated. Live E2E: 400-rejection path with a bad env key, cache-hit
     path over adopted rows, live pollinations generation → PNG asset row →
     removal, real-photo palette suggestion (6-colour wedding palette with
     fonts/ornament), SVG parse + assets round-trip over the seam.
6. **DoD:** golden flows (import → groups auto → generate album → edit page →
   snapshot/restore → export/proofs → proofs gallery/feedback) run end-to-end
   in the native shell, plus stock/gen/recommend/assets against live or
   cached data; Electron harness still passes the full suite. Remaining open
   items: export *render* (Phase 5), `photos.segment` mattes + the updater
   (Phase 6/7 decision gates), seed parity on a fresh DB, and the font
   *rendering* seam (`font://` in CSS; listing works, families fall back to
   system fonts until then).

### Phase 5 — Export parity (headless 300/600 DPI)
`core/export.rs` grows from WIP to the print pipeline:
1. Raster spread composite with `image`: same primitive math as `export.ts`
   (normalized coords, crops, blend whitelist, filters, matte `dest-in`),
   originals + embedded profiles loaded only at export.
2. PDF/X-4 assembly (`printpdf`), TrimBox/BleedBox/MediaBox parity, per-spread
   CMYK TIFF manifest (parity target with the current sharp/pdf-lib exporter).
3. **Golden-diff acceptance:** same album exported via Electron (sharp) and
   native; pixel/perceptual-hash diff under threshold across lab presets.
   Until parity gates pass, release builds keep the Electron exporter behind a
   feature flag.
4. **DoD:** `exports:create` native path returns a PDF that passes the golden
   diff; `cargo test` covers crop/filter matrix.

### Phase 6 — AI/network services relocation (recommend / stock / gen / segment)
1. [x] **HTTP providers** — landed early via the Phase-4 pull-forward pass:
   stock Pixabay/Unsplash/Freepik search+download and gen pollinations/BFL
   generate run as reqwest commands in `core/stock.rs` / `core/gen.rs` (the
   sketch of a shared `core/http.rs` dissolved into per-service clients —
   nothing CORS-prone or key-bearing ever runs in the renderer). The
   `recommend` palette sampler (`sharp` → `photos:palettes` + shared TS) is
   included in that pass.
2. [ ] **Segment (U²-Net mattes):** options — `ort` (onnxruntime, same U²-Net
   model) vs keeping the Electron matte output as a cache-only legacy.
   Size/CI cost is the deciding factor; matte *schema* (`subject_mattes`,
   `matte://` semantics) unchanged either way. Decide before this phase
   starts — the matte files themselves are already displayable on the native
   shell via the media seam + legacy-cache adoption.
3. [x] **Keys** — `secrets.rs` reads env first (Electron env-name parity),
   then the OS keychain via `keyring` 3 (Windows Credential Manager / macOS
   Keychain / Linux Secret Service). `stock:setApiKey` / `gen:setApiKey` write
   only the keychain and flip the non-secret provider id. No `secrets:get`
   command exists: writes go through the provider setters and key values
   never cross IPC.
4. [x] **Updater:** `tauri-plugin-updater` is registered (Cargo + `lib.rs`,
   `updater:default` capability, pubkey + GitHub static-feed endpoint in
   `tauri.conf.json`, `createUpdaterArtifacts` on) and the seam mirrors the
   electron-updater lifecycle (`check` → `download` events → `install`,
   SettingsPage-driven, no auto-download). Publishing is the new
   `native-publish` job in `release-on-push.yml`: it builds the signed NSIS
   installer on `windows-latest` and attaches `tauri-update.json`
   (windows-x86_64 {url, signature} = the `.sig` content) to the same v*
   release the Electron installers land on. The job is gated on the two
   signing secrets — Tauri refuses to build updater artifacts unsigned — and
   prints a notice until they exist. electron-updater stays published until
   the Phase 7 cutover gate.

### Phase 7 — Packaging & release switchover
1. `tauri build` targets (nsis/appimage/dmg — already in `tauri.conf.json`);
   swap electron-builder outputs in `release-on-push.yml`; keep the existing
   version-bump step (it already bumps `Cargo.toml` + `tauri.conf.json`).
   Status: the **Windows native installer now publishes alongside Electron**
   (`native-publish` job above). Both installers carry the same version; the
   native one additionally requires two repository secrets before it can sign:
   - `TAURI_SIGNING_PRIVATE_KEY` — content of the updater private key
     (`~/.albumforge-tauri.key`; also keep an offline backup).
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — its passphrase
     (`~/.albumforge-tauri-key-pass.txt`).
   Until those secrets exist the job skips with a notice and no native
   installer/feed is published (safe: no native installs are live yet).
   macOS/Linux native bundles stay behind the cutover gate (Electron covers
   those channels meanwhile).
2. Android/mobile (`mobile/`) is a separate Capacitor stack — untouched.
3. **Cutover gate checklist:** native backend = default shell for 1+ patch
   releases behind the same installer channel; Electron installer still
   published for N releases as rollback; telemetry-free.
4. **DoD:** fresh Windows install → import → generate → export PDF round-trip
   without touching Node at runtime.

### Phase 8 — Canvas / GPU roadmap (product spec layers 2–3)
Not cutover-blocking; design in `NATIVE_BLUEPRINT.md` §8:
virtualized viewport (destroy off-screen pages/textures), snapping/guides as a
pure TS module over the spatial grid, WebGL fragment-shader filter pass on
proxy textures with a CPU fallback, immutable JSON commit model (already the
data contract). Ships after Phase 7.

## 5. Cross-cutting risks

| Risk | Mitigation |
|---|---|
| `sharp`→`image`/`printpdf` feature parity (blend/filters/ICC) | Golden-diff gates in Phase 5; keep Electron exporter until they pass. |
| Data-dir path change (`%APPDATA%/AlbumForge` vs `com.albumforge.app`) | Copy-on-first-run migration shipped in Phase 3 (both legacy dir names probed); asset scope covers both. |
| `cargo test` on the GNU+w64devkit Windows fallback | tauri-linked test harness crashes at load (`STATUS_ENTRYPOINT_NOT_FOUND`, WebView2Loader); use `cargo check` there and run `cargo test` under MSVC or Linux (CI keeps `cargo check`). |
| WebP: `image` 0.25 ships lossless-only; lossy needs C `libwebp` | JPEG q85 proxies (exact Electron parity, see `proxy.rs`); lossy-WebP slot documented in blueprint §7. |
| Engine TS in webview | Engine is pure & tiny; bundling by Vite is trivial; keep `npm test` as the parity harness. |
| onnxruntime/ort native size + CI time | Phase 6 decision gate; matte schema unchanged either way. |
| Windows toolchains (MSVC vs GNU) | `setup-native.mjs` provisions both. Full builds on the GNU fallback need `src-tauri/.cargo/config.toml`'s `--exclude-all-symbols` flag (w64devkit ld overflows auto-exporting the mobile cdylib); MSVC/CI are unaffected — the flag is scoped to the GNU target. |
| Updater contract | electron-updater → tauri-plugin-updater swap is the last step, behind installer channel parity. |

## 6. Rollback strategy
Every phase is a separate merge behind the Phase-2 seam or a feature flag. A
regression in the native path = flip the backend selector back to Electron and
ship; DB changes are additive so downgrades are safe. Never rewrite history or
destructive-migrate user data.
