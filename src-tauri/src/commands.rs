//! IPC surface (Tauri commands). Thin handlers: validate, delegate to
//! `core::*`, emit progress events. The renderer calls these exclusively
//! through `src/renderer/src/lib/native.ts` — never via raw IPC strings.

use std::path::Path;

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

use crate::core::db::{self, PhotoListOpts, Project};
use crate::core::export::{self, ExportJobInput, ExportResult};
use crate::core::fonts;
use crate::core::gen;
use crate::core::import::{self, ImportResult};
use crate::core::library::{
    self, AlbumPage, AlbumVersion, DesignAsset, ExportCreateInput, ExportJob, PageDesign, PageUpdate,
    PhotoGroup, TemplateDetail,
};
use crate::core::palette;
use crate::core::proofing;
use crate::core::proxy::{self, ProxyInfo};
use crate::core::scanner::{self, ScannedPhoto};
use crate::core::stock;
use crate::AppState;

/// Run a DB-backed closure on a blocking thread with the shared connection.
/// Keeps the synchronous rusqlite work off the async runtime and the mutex
/// guard out of any `.await`.
async fn with_db<T, F>(app: &AppHandle, f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&Connection) -> Result<T, String> + Send + 'static,
{
    let state = app.state::<AppState>();
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock().map_err(|e| e.to_string())?;
        f(&conn)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Input for `projects:create` (mirrors the Electron handler's `input`).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectInput {
    pub name: String,
    pub client_name: Option<String>,
    pub event_date: Option<String>,
}

/// Directory answers for the media seam. The renderer builds media URLs from
/// `cache_dir` + deterministic filenames (`{id}-thumb256.jpg`, …) — never
/// from raw DB paths or per-image IPC.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppDirs {
    pub cache_dir: String,
    pub data_dir: String,
}

/// Resolve the app cache/data dirs (Phase 3 media seam; called once at boot).
#[tauri::command]
pub fn app_dirs(app: AppHandle) -> AppDirs {
    let state = app.state::<AppState>();
    AppDirs {
        cache_dir: state.cache_dir.display().to_string(),
        data_dir: state.data_dir.display().to_string(),
    }
}

/* ---- app:* services (parity with the Electron `app:*` IPC handlers) ---- */

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    version: String,
    author: String,
    data_path: String,
    cache_path: String,
}

/// `app:info` parity — version/author + the app data/cache dirs.
#[tauri::command]
pub fn app_info(app: AppHandle) -> AppInfo {
    let state = app.state::<AppState>();
    let version = app.package_info().version.to_string();
    AppInfo {
        version,
        author: "Vara".into(),
        data_path: state.data_dir.display().to_string(),
        cache_path: state.cache_dir.display().to_string(),
    }
}

/// Open `path` with the OS default handler (parity with `shell.openPath`).
fn open_with_shell(path: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", path])
            .spawn()
            .map_err(|e| format!("open path: {e}"))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|e| format!("open path: {e}"))?;
    }
    #[cfg(all(not(windows), not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|e| format!("open path: {e}"))?;
    }
    Ok(())
}

/// `app:openPath` parity — reveal/open a path with the default handler.
#[tauri::command]
pub fn app_open_path(path: String) -> Result<(), String> {
    open_with_shell(&path)
}

/// `app:openDataFolder` parity.
#[tauri::command]
pub fn app_open_data_folder(app: AppHandle) -> Result<(), String> {
    let data_dir = app.state::<AppState>().data_dir.clone();
    open_with_shell(&data_dir.display().to_string())
}

/// `app:clearCache` parity — wipe and recreate the cache dir. NOTE: this
/// deletes every rendered proxy (imported studio previews re-render on the
/// next import) — identical to the Electron handler.
#[tauri::command]
pub fn app_clear_cache(app: AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    let cache = &state.cache_dir;
    std::fs::remove_dir_all(cache).map_err(|e| format!("clear cache: {e}"))?;
    std::fs::create_dir_all(cache).map_err(|e| format!("recreate cache: {e}"))?;
    std::fs::create_dir_all(cache.join("proxies")).map_err(|e| format!("recreate proxies dir: {e}"))?;
    Ok(())
}

/* ---- dialogs (Phase 4) — parity with Electron `dialog` IPC handlers ---- */

/// Parent the dialog to the main window where one is available (plugin
/// commands do the same on Windows/macOS).
fn dialog_parent(app: &AppHandle) -> Option<tauri::WebviewWindow> {
    app.get_webview_window("main")
}

/// Multi-select image files for import (Electron `dialogs:chooseImages`).
#[tauri::command]
pub async fn choose_images(app: AppHandle) -> Result<Option<Vec<String>>, String> {
    let mut builder = app.dialog().file();
    if let Some(win) = dialog_parent(&app) {
        builder = builder.set_parent(&win);
    }
    let picked = builder
        .add_filter(
            "Images",
            &["jpg", "jpeg", "png", "webp", "heic", "heif", "tif", "tiff"],
        )
        .blocking_pick_files();
    Ok(picked.map(|files| {
        files
            .into_iter()
            .filter_map(|f| f.into_path().ok().map(|p| p.display().to_string()))
            .collect()
    }))
}

/// Save-dialog for a PDF path (Electron `dialogs:chooseSavePath`).
#[tauri::command]
pub async fn choose_save_path(
    app: AppHandle,
    default_name: String,
) -> Result<Option<String>, String> {
    let mut builder = app.dialog().file();
    if let Some(win) = dialog_parent(&app) {
        builder = builder.set_parent(&win);
    }
    let path = builder
        .add_filter("PDF", &["pdf"])
        .set_file_name(default_name)
        .blocking_save_file();
    Ok(path.and_then(|f| f.into_path().ok().map(|p| p.display().to_string())))
}

/// Folder picker (Electron `dialogs:chooseDirectory`).
#[tauri::command]
pub async fn choose_directory(app: AppHandle) -> Result<Option<String>, String> {
    let mut builder = app.dialog().file();
    if let Some(win) = dialog_parent(&app) {
        builder = builder.set_parent(&win);
    }
    let picked = builder.set_can_create_directories(true).blocking_pick_folder();
    Ok(picked.and_then(|f| f.into_path().ok().map(|p| p.display().to_string())))
}

/// Single-file JSON picker for proof feedback (Electron `dialogs:chooseFeedback`).
#[tauri::command]
pub async fn choose_feedback(app: AppHandle) -> Result<Option<String>, String> {
    let mut builder = app.dialog().file();
    if let Some(win) = dialog_parent(&app) {
        builder = builder.set_parent(&win);
    }
    let picked = builder
        .add_filter("Feedback", &["json"])
        .blocking_pick_file();
    Ok(picked.and_then(|f| f.into_path().ok().map(|p| p.display().to_string())))
}

/// Multi-select SVG/PNG graphics for the asset library (Electron
/// `dialogs:chooseAssets`).
#[tauri::command]
pub async fn choose_assets(app: AppHandle) -> Result<Option<Vec<String>>, String> {
    let mut builder = app.dialog().file();
    if let Some(win) = dialog_parent(&app) {
        builder = builder.set_parent(&win);
    }
    let picked = builder
        .add_filter("Graphics", &["svg", "png"])
        .blocking_pick_files();
    Ok(picked.map(|files| {
        files
            .into_iter()
            .filter_map(|f| f.into_path().ok().map(|p| p.display().to_string()))
            .collect()
    }))
}

/// Scan a local folder and return lightweight photo metadata (EXIF, dims,
/// GPS). Emits `scanner-progress` events while the rayon pool walks the tree.
#[tauri::command]
pub async fn scan_folder(
    app: AppHandle,
    dir: String,
) -> Result<Vec<ScannedPhoto>, String> {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        scanner::scan_directory(Path::new(&dir), |current, total| {
            let _ = app.emit(
                "scanner-progress",
                serde_json::json!({ "current": current, "total": total }),
            );
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Generate editor proxies (JPEG q85, long edge ≤ `max_dim`) for the given
/// originals into the app cache. Runs on the native low-priority background
/// pool; already-cached sources are skipped. Emits `proxy-progress` events.
#[tauri::command]
pub async fn generate_proxies(
    app: AppHandle,
    paths: Vec<String>,
    max_dim: Option<u32>,
) -> Result<Vec<ProxyInfo>, String> {
    let max = max_dim.unwrap_or(proxy::DEFAULT_MAX_DIM);
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || proxy::generate_proxies_parallel(&app, paths, max))
        .await
        .map_err(|e| e.to_string())?
}

/// Resolve the cached proxy path for a source file. The frontend wraps the
/// result with `assetUrl()` (scoped `asset://` protocol) — raw filesystem
/// paths never reach the DOM.
#[tauri::command]
pub fn proxy_path(app: AppHandle, photo_path: String) -> Result<String, String> {
    Ok(proxy::proxy_path(&app, &photo_path).display().to_string())
}

/// Headless 300 DPI export from a JSON layout state. Emits `export-progress`.
#[tauri::command]
pub async fn export_album(
    app: AppHandle,
    job: ExportJobInput,
) -> Result<ExportResult, String> {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _ = app.emit("export-progress", serde_json::json!({ "stage": "started" }));
        export::run_export(job)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Create a project (parity with Electron `projects:create`).
#[tauri::command]
pub async fn projects_create(
    app: AppHandle,
    input: CreateProjectInput,
) -> Result<Project, String> {
    with_db(&app, move |conn| {
        db::insert_project(
            conn,
            &input.name,
            input.client_name.as_deref(),
            input.event_date.as_deref(),
        )
    })
    .await
}

/// List projects with thumbnail pinning (parity with Electron `projects:list`).
#[tauri::command]
pub async fn projects_list(app: AppHandle) -> Result<Vec<Project>, String> {
    with_db(&app, db::list_projects).await
}

/// Import photo files into a project (parity with Electron `photos:import`).
/// Emits `import-progress` events `{ current, total, filename, status }`.
#[tauri::command]
pub async fn photos_import(
    app: AppHandle,
    project_id: String,
    paths: Vec<String>,
) -> Result<ImportResult, String> {
    let state = app.state::<AppState>();
    let cache_dir = state.cache_dir.clone();
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.lock().map_err(|e| e.to_string())?;
        import::import_photos(
            &conn,
            &cache_dir,
            &project_id,
            &paths,
            &mut |current, total, filename, status| {
                let _ = app.emit(
                    "import-progress",
                    serde_json::json!({
                        "current": current,
                        "total": total,
                        "filename": filename,
                        "status": status,
                    }),
                );
            },
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Paginated photo grid (parity with Electron `photos:list` filters/sort).
#[tauri::command]
pub async fn photos_list(
    app: AppHandle,
    project_id: String,
    opts: PhotoListOpts,
) -> Result<db::PhotoListResponse, String> {
    with_db(&app, move |conn| db::list_photos(conn, &project_id, &opts)).await
}

/// Engine-ready photo records for album generation (Phase 4 item 3) — parity
/// with `photoRecordsFor()` in the Electron main process. The renderer runs
/// the pure-TS engine on these (`BigInt(phash)`, `faceBoxes: []`).
#[tauri::command]
pub async fn photos_records(
    app: AppHandle,
    project_id: String,
    mode: String,
) -> Result<Vec<db::PhotoRecord>, String> {
    with_db(&app, move |conn| db::photo_records(conn, &project_id, &mode)).await
}

/* ---- Exports / designs / proofs (parity with Electron IPC) ---- */

/// `exports:create` parity — persist the queued job row. Completion needs the
/// Phase 5 native export runner (`core/export.rs`); Electron's in-process
/// `runExport` (sharp/pdf-lib) cannot execute here.
#[tauri::command]
pub async fn exports_create(
    app: AppHandle,
    album_id: String,
    input: ExportCreateInput,
) -> Result<ExportJob, String> {
    with_db(&app, move |conn| library::create_export_job(conn, &album_id, &input)).await
}

#[tauri::command]
pub async fn exports_get(app: AppHandle, id: String) -> Result<ExportJob, String> {
    with_db(&app, move |conn| library::get_export_job(conn, &id)).await
}

#[tauri::command]
pub async fn designs_list(app: AppHandle) -> Result<Vec<PageDesign>, String> {
    with_db(&app, library::list_designs).await
}

#[tauri::command]
pub async fn designs_save(
    app: AppHandle,
    name: String,
    page: serde_json::Value,
) -> Result<PageDesign, String> {
    with_db(&app, move |conn| library::save_design(conn, &name, &page)).await
}

#[tauri::command]
pub async fn designs_get(
    app: AppHandle,
    id: String,
) -> Result<Option<serde_json::Value>, String> {
    with_db(&app, move |conn| library::get_design(conn, &id)).await
}

#[tauri::command]
pub async fn designs_remove(app: AppHandle, id: String) -> Result<(), String> {
    with_db(&app, move |conn| library::remove_design(conn, &id)).await
}

/// `proofs:build` parity — self-contained gallery folder. Thumbnails resolve
/// via the stored path with a deterministic native-cache fallback (adopted
/// Electron rows may carry stale legacy paths).
#[tauri::command]
pub async fn proofs_build(
    app: AppHandle,
    album_id: String,
    target_dir: String,
) -> Result<proofing::ProofResult, String> {
    let cache_dir = app.state::<AppState>().cache_dir.clone();
    with_db(&app, move |conn| {
        proofing::build_proof_gallery(conn, &album_id, &target_dir, &cache_dir)
    })
    .await
}

/// `proofs:importFeedback` parity.
#[tauri::command]
pub async fn proofs_import_feedback(
    app: AppHandle,
    project_id: String,
    file_path: String,
) -> Result<proofing::FeedbackResult, String> {
    with_db(&app, move |conn| {
        proofing::import_feedback(conn, &project_id, &file_path)
    })
    .await
}

/// `proofs:notes` parity.
#[tauri::command]
pub async fn proofs_notes(
    app: AppHandle,
    project_id: String,
) -> Result<Vec<proofing::PhotoNote>, String> {
    with_db(&app, move |conn| proofing::photo_notes(conn, &project_id)).await
}

/* ---- Groups (parity with Electron `groups:*`) ---- */

#[tauri::command]
pub async fn groups_list(app: AppHandle, project_id: String) -> Result<Vec<PhotoGroup>, String> {
    with_db(&app, move |conn| library::list_groups(conn, &project_id)).await
}

#[tauri::command]
pub async fn groups_auto(app: AppHandle, project_id: String) -> Result<Vec<PhotoGroup>, String> {
    with_db(&app, move |conn| library::auto_group(conn, &project_id)).await
}

#[tauri::command]
pub async fn groups_create(
    app: AppHandle,
    project_id: String,
    name: String,
) -> Result<PhotoGroup, String> {
    with_db(&app, move |conn| library::create_group(conn, &project_id, &name)).await
}

#[tauri::command]
pub async fn groups_rename(
    app: AppHandle,
    group_id: String,
    name: String,
) -> Result<(), String> {
    with_db(&app, move |conn| library::rename_group(conn, &group_id, &name)).await
}

#[tauri::command]
pub async fn groups_remove(app: AppHandle, group_id: String) -> Result<(), String> {
    with_db(&app, move |conn| library::remove_group(conn, &group_id)).await
}

#[tauri::command]
pub async fn groups_assign(
    app: AppHandle,
    group_id: String,
    photo_ids: Vec<String>,
) -> Result<(), String> {
    with_db(&app, move |conn| library::assign_photos(conn, &group_id, &photo_ids)).await
}

#[tauri::command]
pub async fn groups_merge(
    app: AppHandle,
    project_id: String,
    group_ids: Vec<String>,
    name: String,
) -> Result<PhotoGroup, String> {
    with_db(&app, move |conn| library::merge_groups(conn, &project_id, &group_ids, &name)).await
}

#[tauri::command]
pub async fn groups_split(
    app: AppHandle,
    project_id: String,
    group_id: String,
    photo_ids: Vec<String>,
    name: String,
) -> Result<PhotoGroup, String> {
    with_db(&app, move |conn| {
        library::split_group(conn, &project_id, &group_id, &photo_ids, &name)
    })
    .await
}

#[tauri::command]
pub async fn groups_clear(app: AppHandle, project_id: String) -> Result<(), String> {
    with_db(&app, move |conn| library::clear_groups(conn, &project_id)).await
}

/* ---- Templates + fonts ---- */

#[tauri::command]
pub async fn templates_list(app: AppHandle) -> Result<Vec<library::TemplateSummary>, String> {
    with_db(&app, library::list_templates).await
}

#[tauri::command]
pub async fn templates_get(
    app: AppHandle,
    id: String,
) -> Result<Option<TemplateDetail>, String> {
    with_db(&app, move |conn| library::template_detail(conn, &id)).await
}

/// Font families on disk (parity with Electron `fonts:list`): bundled
/// `$RESOURCE/fonts` first, then user fonts in the app data dir.
#[tauri::command]
pub fn fonts_list(app: AppHandle) -> Result<Vec<String>, String> {
    let state = app.state::<AppState>();
    let mut dirs = Vec::new();
    let Ok(resource_dir) = app.path().resource_dir() else {
        return Ok(Vec::new());
    };
    dirs.push(resource_dir.join("fonts"));
    dirs.push(state.data_dir.join("fonts"));
    let refs: Vec<&Path> = dirs.iter().map(|p| p.as_path()).collect();
    Ok(fonts::list_fonts(&refs))
}

/* ---- Albums CRUD (parity with Electron `albums:*`) ---- */

#[tauri::command]
pub async fn albums_list(
    app: AppHandle,
    project_id: Option<String>,
) -> Result<Vec<library::Album>, String> {
    with_db(&app, move |conn| library::list_albums(conn, project_id.as_deref())).await
}

#[tauri::command]
pub async fn albums_get(app: AppHandle, id: String) -> Result<library::Album, String> {
    with_db(&app, move |conn| library::album_by_id(conn, &id)).await
}

#[tauri::command]
pub async fn albums_pages(app: AppHandle, id: String) -> Result<Vec<AlbumPage>, String> {
    with_db(&app, move |conn| library::album_pages(conn, &id)).await
}

/// Persist one engine-generated album (Phase 4 item 3) — parity with
/// `persistAlbum()` in the Electron main process. The renderer drives the
/// pure-TS engine and calls this to store the result.
#[tauri::command]
pub async fn albums_save_generated(
    app: AppHandle,
    input: library::AlbumPersistInput,
) -> Result<library::Album, String> {
    with_db(&app, move |conn| library::save_generated(conn, &input)).await
}

/// Save an edit to a page (`albums:savePage` parity). Returns the page.
#[tauri::command]
pub async fn albums_save_page(
    app: AppHandle,
    album_id: String,
    page_id: String,
    update: PageUpdate,
) -> Result<AlbumPage, String> {
    with_db(&app, move |conn| {
        library::save_page(conn, &album_id, &page_id, &update)
    })
    .await
}

#[tauri::command]
pub async fn albums_add_page(app: AppHandle, album_id: String) -> Result<AlbumPage, String> {
    with_db(&app, move |conn| library::add_page(conn, &album_id)).await
}

#[tauri::command]
pub async fn albums_duplicate_page(
    app: AppHandle,
    album_id: String,
    page_id: String,
) -> Result<AlbumPage, String> {
    with_db(&app, move |conn| library::duplicate_page(conn, &album_id, &page_id)).await
}

#[tauri::command]
pub async fn albums_delete_page(
    app: AppHandle,
    album_id: String,
    page_id: String,
) -> Result<(), String> {
    with_db(&app, move |conn| library::delete_page(conn, &album_id, &page_id)).await
}

#[tauri::command]
pub async fn albums_reorder_pages(
    app: AppHandle,
    _album_id: String,
    page_ids: Vec<String>,
) -> Result<(), String> {
    with_db(&app, move |conn| library::reorder_pages(conn, &page_ids)).await
}

#[tauri::command]
pub async fn albums_versions(
    app: AppHandle,
    album_id: String,
) -> Result<Vec<AlbumVersion>, String> {
    with_db(&app, move |conn| library::album_versions(conn, &album_id)).await
}

#[tauri::command]
pub async fn albums_snapshot(app: AppHandle, album_id: String) -> Result<AlbumVersion, String> {
    with_db(&app, move |conn| library::snapshot(conn, &album_id)).await
}

#[tauri::command]
pub async fn albums_restore_version(
    app: AppHandle,
    album_id: String,
    version_id: String,
) -> Result<Vec<AlbumPage>, String> {
    with_db(&app, move |conn| library::restore_version(conn, &album_id, &version_id)).await
}

/* ---- Assets (custom graphics — Electron `assets:*`) ---- */

#[tauri::command]
pub async fn assets_list(app: AppHandle) -> Result<Vec<DesignAsset>, String> {
    with_db(&app, library::list_assets).await
}

/// `assets:import` parity — file reads happen on the blocking DB thread.
#[tauri::command]
pub async fn assets_import(app: AppHandle, paths: Vec<String>) -> Result<ImportResult, String> {
    with_db(&app, move |conn| library::import_assets(conn, &paths)).await
}

#[tauri::command]
pub async fn assets_remove(app: AppHandle, id: String) -> Result<(), String> {
    with_db(&app, move |conn| library::remove_asset(conn, &id)).await
}

/* ---- Stock (Module 7 — Electron `stock:*`) ---- */

#[tauri::command]
pub fn stock_configured(app: AppHandle) -> Result<bool, String> {
    let dir = app.state::<AppState>().data_dir.clone();
    Ok(stock::configured(&dir))
}

#[tauri::command]
pub fn stock_provider(app: AppHandle) -> Result<String, String> {
    let dir = app.state::<AppState>().data_dir.clone();
    Ok(stock::provider(&dir))
}

#[tauri::command]
pub fn stock_set_provider(app: AppHandle, provider: String) -> Result<bool, String> {
    let dir = app.state::<AppState>().data_dir.clone();
    Ok(stock::set_provider(&dir, &provider))
}

/// `stock:setApiKey` parity — the key goes to the OS keychain only, then the
/// provider switches to it (the non-secret id persists in the config JSON).
#[tauri::command]
pub fn stock_set_api_key(app: AppHandle, provider: String, key: String) -> Result<bool, String> {
    let dir = app.state::<AppState>().data_dir.clone();
    Ok(stock::set_api_key(&dir, &provider, &key))
}

#[tauri::command]
pub fn stock_recent(app: AppHandle, limit: Option<usize>) -> Result<Vec<String>, String> {
    let cache = app.state::<AppState>().cache_dir.clone();
    Ok(stock::recent(&cache, limit.unwrap_or(12)))
}

/// `stock:search` parity — fresh SQLite cache first, then the provider.
/// Cache probe/persist and the network fetch run in separate scopes so the
/// rusqlite connection never crosses an `.await`.
#[tauri::command]
pub async fn stock_search(
    app: AppHandle,
    term: String,
    kind: String,
) -> Result<stock::StockSearchOutcome, String> {
    if term.trim().is_empty() {
        return Ok(stock::StockSearchOutcome { items: Vec::new(), cached: false });
    }
    let state = app.state::<AppState>();
    let cache_dir = state.cache_dir.clone();
    let data_dir = state.data_dir.clone();
    let key = stock::search_cache_key(&data_dir, &term, &kind);
    if let Some(hit) = with_db(&app, {
        let k = key.clone();
        move |conn| stock::cached_search(conn, &k)
    })
    .await?
    {
        return Ok(hit);
    }
    let items = stock::search_remote(&cache_dir, &data_dir, &term, &kind).await?;
    let (k, cached_items) = (key.clone(), items.clone());
    with_db(&app, move |conn| stock::store_search(conn, &k, &cached_items)).await?;
    Ok(stock::StockSearchOutcome { items, cached: false })
}

/// `stock:download` parity — cache row first, then a network fetch persisted
/// in a separate sync scope. Vector SVGs come back as raw text (`svg`); the
/// renderer runs the shared `parseSvg` (see `stockParse.ts`).
#[tauri::command]
pub async fn stock_download(
    app: AppHandle,
    provider_id: String,
    input: Option<stock::StockDownloadInput>,
) -> Result<stock::StockDownloadRaw, String> {
    let state = app.state::<AppState>();
    let cache_dir = state.cache_dir.clone();
    if let Some(raw) = with_db(&app, {
        let cd = cache_dir.clone();
        let pid = provider_id.clone();
        move |conn| stock::cached_download(conn, &cd, &pid)
    })
    .await?
    {
        return Ok(raw);
    }
    let input = input.ok_or_else(|| "No download URL for this stock asset.".to_string())?;
    let rec = stock::remote_download(&cache_dir, &provider_id, &input).await?;
    let raw = rec.to_raw(false);
    with_db(&app, move |conn| stock::store_download(conn, &rec)).await?;
    Ok(raw)
}

/* ---- Gen (AI elements — Electron `gen:*`) ---- */

#[tauri::command]
pub fn gen_configured(app: AppHandle) -> Result<bool, String> {
    let dir = app.state::<AppState>().data_dir.clone();
    Ok(gen::configured(&dir))
}

#[tauri::command]
pub fn gen_provider(app: AppHandle) -> Result<String, String> {
    let dir = app.state::<AppState>().data_dir.clone();
    Ok(gen::provider(&dir))
}

#[tauri::command]
pub fn gen_set_provider(app: AppHandle, provider: String) -> Result<bool, String> {
    let dir = app.state::<AppState>().data_dir.clone();
    Ok(gen::set_provider(&dir, &provider))
}

/// `gen:setApiKey` parity — BFL key to the OS keychain, then switch provider.
#[tauri::command]
pub fn gen_set_api_key(app: AppHandle, key: String) -> Result<bool, String> {
    let dir = app.state::<AppState>().data_dir.clone();
    Ok(gen::set_api_key(&dir, &key))
}

/// `gen:generate` parity — fetch (async, no DB) then persist the PNG asset in
/// a short sync `with_db` scope. Errors surface inside `GenResult.error` like
/// Electron (a failed generation is not an IPC failure).
#[tauri::command]
pub async fn gen_generate(
    app: AppHandle,
    prompt: String,
    opts: Option<gen::GenOpts>,
) -> Result<gen::GenResult, String> {
    let state = app.state::<AppState>();
    let cache_dir = state.cache_dir.clone();
    let data_dir = state.data_dir.clone();
    let png = match gen::fetch_generated(&data_dir, &prompt, &opts).await {
        Ok(b) => b,
        Err(e) => {
            return Ok(gen::GenResult { ok: false, asset: None, error: Some(e) });
        }
    };
    with_db(&app, move |conn| {
        Ok::<_, String>(gen::persist_asset(conn, &cache_dir, &prompt, &png))
    })
    .await
}

/* ---- Recommend palette input (renderer drives the shared TS engine) ---- */

/// `photos:palettes` — raw RGB samples (base64) of the ≤64 px previews for a
/// set of photo ids. The renderer feeds these to `kMeansPalette` from the
/// shared engine (`src/shared/recommend.ts`), replacing Electron's `sharp`
/// sampler. Skipped photos (missing/unreadable previews) are simply absent.
#[tauri::command]
pub async fn photos_palettes(
    app: AppHandle,
    photo_ids: Vec<String>,
) -> Result<Vec<palette::PhotoPalette>, String> {
    let cache_dir = app.state::<AppState>().cache_dir.clone();
    with_db(&app, move |conn| palette::sample_palettes(conn, &cache_dir, &photo_ids)).await
}
