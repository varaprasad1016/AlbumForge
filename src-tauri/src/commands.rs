//! IPC surface (Tauri commands). Thin handlers: validate, delegate to
//! `core::*`, emit progress events. The renderer calls these exclusively
//! through `src/renderer/src/lib/native.ts` — never via raw IPC strings.

use std::path::{Path, PathBuf};

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

use crate::core::db::{self, PhotoListOpts, Project};
use crate::core::errors;
use crate::core::export::{self, ExportJobInput, ExportResult};
use crate::core::fonts;
use crate::core::gen;
use crate::core::license;
use crate::core::print;
use crate::core::project;
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

/// `exports:create` parity — persist the queued job row, then fire the Phase 5
/// native runner in the background: queued → running → completed(filePath) /
/// failed(error). The renderer polls `exports:get` exactly like Electron.
#[tauri::command]
pub async fn exports_create(
    app: AppHandle,
    album_id: String,
    input: ExportCreateInput,
) -> Result<ExportJob, String> {
    let target = input.target_path.clone();
    let id = {
        let album_id = album_id.clone();
        let input = input.clone();
        with_db(&app, move |conn| library::create_export_job(conn, &album_id, &input)).await?
    };
    let job_id = id.id.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = run_export_job(app.clone(), album_id, job_id.clone(), target).await {
            // Surface render failures on the job row (Electron `runExport`
            // catch parity) instead of leaving it queued forever.
            let db = app.state::<AppState>().db.clone();
            let _ = tauri::async_runtime::spawn_blocking(move || {
                let conn = db.lock().map_err(|e| e.to_string())?;
                library::update_export_job(&conn, &job_id, "failed", None, Some(&e))
            })
            .await;
        }
    });
    Ok(id)
}

#[tauri::command]
pub async fn exports_get(app: AppHandle, id: String) -> Result<ExportJob, String> {
    with_db(&app, move |conn| library::get_export_job(conn, &id)).await
}

/// Everything the runner needs, loaded from the DB in one locked scope so the
/// long render never holds the shared connection.
struct ExportSnapshot {
    kind: String,
    target_path: Option<String>,
    dpi: u32,
    bleed_mm: f64,
    color_mode: String,
    album: export::AlbumExport,
    sources: export::RenderSources,
    font_dirs: Vec<PathBuf>,
}

/// Phase 5 background runner — Electron `runExport` parity.
///
/// 1. Snapshot the job settings, album pages and the original-source maps
///    (photos/mattes) under the DB lock; release it before rendering.
/// 2. Render + assemble the package on a blocking thread (300 DPI, spreads,
///    bleed, PDF/X-4 intent when an sRGB profile is on the host).
/// 3. Re-lock to persist `completed(file_path)` or `failed(error)`.
async fn run_export_job(
    app: AppHandle,
    album_id: String,
    export_id: String,
    target_path: Option<String>,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let data_dir = state.data_dir.clone();

    // 1 — snapshot (short locked scope).
    let mut font_dirs: Vec<PathBuf> = Vec::new();
    if let Ok(res) = app.path().resource_dir() {
        font_dirs.push(res.join("fonts"));
    }
    font_dirs.push(data_dir.join("fonts"));

    let loaded = {
        let db = db.clone();
        let album_id = album_id.clone();
        let export_id = export_id.clone();
        tauri::async_runtime::spawn_blocking(move || -> Result<Option<ExportSnapshot>, String> {
            let conn = db.lock().map_err(|e| e.to_string())?;
            let job = library::get_export_job(&conn, &export_id)?;
            if job.status != "queued" {
                return Ok(None); // already completed/failed (or cancelled)
            }
            let settings = library::export_job_settings(&conn, &export_id)?.ok_or("export job has no settings")?;
            let album_row = library::album_by_id(&conn, &album_id)?;
            let pages = library::album_pages(&conn, &album_id)?;

            let (w_mm, h_mm) = if album_row.page_size.unit == "in" {
                (
                    album_row.page_size.width * 25.4,
                    album_row.page_size.height * 25.4,
                )
            } else {
                (album_row.page_size.width, album_row.page_size.height)
            };

            let mut photo_ids: Vec<String> = Vec::new();
            let mut album_pages: Vec<export::AlbumPageDef> = Vec::new();
            for p in &pages {
                let elements: Vec<export::AlbumElementDef> = p
                    .elements
                    .iter()
                    .map(|el| export::AlbumElementDef {
                        kind: el.el_type.clone(),
                        z: el.z,
                        x: el.x,
                        y: el.y,
                        width: el.width,
                        height: el.height,
                        rotation: el.rotation,
                        photo_id: el.photo_id.clone(),
                        crop: el.crop.clone(),
                        text: el.text.clone(),
                        style: el.style.clone(),
                    })
                    .collect();
                for el in &p.elements {
                    if let Some(pid) = &el.photo_id {
                        if !photo_ids.contains(pid) {
                            photo_ids.push(pid.clone());
                        }
                    }
                }
                album_pages.push(export::AlbumPageDef {
                    id: p.id.clone(),
                    layout_key: p.layout_key.clone(),
                    background: p.background.clone(),
                    elements,
                });
            }

            let mut sources = export::RenderSources::default();
            if !photo_ids.is_empty() {
                let marks: Vec<String> = photo_ids.iter().map(|_| "?".to_string()).collect();
                let sql = format!(
                    "SELECT id, file_path, width, height FROM photos WHERE id IN ({})",
                    marks.join(",")
                );
                let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
                let mut rows = stmt
                    .query(rusqlite::params_from_iter(photo_ids.iter()))
                    .map_err(|e| e.to_string())?;
                while let Some(r) = rows.next().map_err(|e| e.to_string())? {
                    let id: String = r.get(0).map_err(|e| e.to_string())?;
                    let path: String = r.get(1).map_err(|e| e.to_string())?;
                    let width: i64 = r.get::<_, Option<i64>>(2).map_err(|e| e.to_string())?.unwrap_or(0);
                    let height: i64 = r.get::<_, Option<i64>>(3).map_err(|e| e.to_string())?.unwrap_or(0);
                    sources.photos.insert(
                        id,
                        export::PhotoSource {
                            path,
                            width: width.clamp(1, i32::MAX as i64) as u32,
                            height: height.clamp(1, i32::MAX as i64) as u32,
                        },
                    );
                }
                let matte_sql = format!(
                    "SELECT photo_id, matte_path FROM subject_mattes WHERE photo_id IN ({})",
                    marks.join(",")
                );
                let mut mstmt = conn.prepare(&matte_sql).map_err(|e| e.to_string())?;
                let mut mrows = mstmt
                    .query(rusqlite::params_from_iter(photo_ids.iter()))
                    .map_err(|e| e.to_string())?;
                while let Some(r) = mrows.next().map_err(|e| e.to_string())? {
                    let id: String = r.get(0).map_err(|e| e.to_string())?;
                    let path: String = r.get(1).map_err(|e| e.to_string())?;
                    sources.mattes.insert(id, path);
                }
            }

            let dpi = settings["dpi"].as_f64().unwrap_or(300.0);
            let color_mode = settings["colorMode"].as_str().unwrap_or("rgb").to_string();
            Ok(Some(ExportSnapshot {
                kind: job.kind.clone(),
                target_path,
                dpi: dpi.clamp(72.0, 2400.0) as u32,
                bleed_mm: settings["bleedMm"].as_f64().unwrap_or(3.0),
                color_mode,
                album: export::AlbumExport {
                    name: album_row.name.clone(),
                    width_mm: w_mm,
                    height_mm: h_mm,
                    pages: album_pages,
                },
                sources,
                font_dirs,
            }))
        })
        .await
        .map_err(|e| e.to_string())??
    };

    let Some(snap) = loaded else { return Ok(()) };

    // 2 — render + assemble off the DB and off the async runtime.
    let opts = export::ExportOptions {
        dpi: snap.dpi,
        bleed_mm: snap.bleed_mm,
        color_mode: snap.color_mode.clone(),
        watermark: if snap.kind == "proof_pdf" { Some("PROOF".to_string()) } else { None },
        font_dirs: snap.font_dirs.clone(),
        lab_package: snap.kind == "lab_package",
    };
    let exports_dir = data_dir.join("exports");
    let target = snap.target_path.clone();
    let is_lab = snap.kind == "lab_package";

    // Lab packages write straight into the chosen folder (Electron
    // `writeLabPackage` parity); PDF exports render into a staging dir and the
    // final PDF is copied to the chosen file (or kept in the staging dir).
    let render_dir: PathBuf = if is_lab {
        match &target {
            Some(t) if !t.trim().is_empty() => PathBuf::from(t),
            _ => exports_dir.join(format!("album-{album_id}")),
        }
    } else {
        exports_dir.join(format!("job-{export_id}"))
    };

    let outcome = {
        let album = snap.album.clone();
        let sources = snap.sources.clone();
        let dir = render_dir.clone();
        tauri::async_runtime::spawn_blocking(move || {
            export::run_export_package(&album, &opts, &sources, &dir)
        })
        .await
        .map_err(|e| e.to_string())?
    }?;

    let file_path: String = if is_lab {
        render_dir.display().to_string()
    } else {
        let staged_pdf = PathBuf::from(&outcome.pdf_path);
        match &target {
            Some(t) if !t.trim().is_empty() => {
                let dest = PathBuf::from(t);
                if let Some(parent) = dest.parent() {
                    std::fs::create_dir_all(parent).map_err(|e| format!("create target dir: {e}"))?;
                }
                std::fs::copy(&staged_pdf, &dest)
                    .map_err(|e| format!("copy pdf to target: {e}"))?;
                std::fs::remove_dir_all(&render_dir).ok();
                dest.display().to_string()
            }
            _ => staged_pdf.display().to_string(),
        }
    };

    // 3 — persist completion.
    {
        let db = db.clone();
        let fp = file_path.clone();
        tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
            let conn = db.lock().map_err(|e| e.to_string())?;
            library::update_export_job(&conn, &export_id, "completed", Some(&fp), None)
        })
        .await
        .map_err(|e| e.to_string())??
    }
    Ok(())
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

/* ===========================================================================
 * Commercial suite (blueprint §10 / MIGRATION Phase 9) — licensing, print
 * fulfilment, .album file engine + crash recovery, error reporting.
 *
 * Security invariants hold here: every credential (Keygen account/public key,
 * Sentry DSN, future lab tokens) is read in Rust from the environment or the
 * OS keychain. The renderer only ever receives verdicts, payloads and file
 * paths — never keys.
 * =========================================================================== */

/// `license:status` — evaluate the cached offline lease (signature, seat
/// binding, 7-day window). Pure local read: never throws for an absent lease,
/// returns a typed verdict the UI renders.
#[tauri::command]
pub fn license_status(app: AppHandle) -> license::LicenseStatus {
    let data_dir = &app.state::<AppState>().data_dir;
    let pem = license::keygen_config_from_env().public_key_pem;
    license::status(data_dir, chrono::Utc::now().timestamp(), pem.as_deref())
}

/// `license:activate` — Keygen online validation, then cache a signed offline
/// lease. A lease is only cached when Keygen returns the account-signed
/// license file (the Ed25519 `Keygen-Signature`); otherwise the validation
/// verdict is returned without caching — an unsigned state is never trusted
/// offline (see `core/license.rs`).
#[tauri::command]
pub async fn license_activate(app: AppHandle, key: String) -> Result<serde_json::Value, String> {
    let data_dir = app.state::<AppState>().data_dir.clone();
    let cfg = license::keygen_config_from_env();
    let Some(account) = cfg.account.clone() else {
        return Err("licensing is not configured — set ALBUMFORGE_KEYGEN_ACCOUNT (see MIGRATION.md Phase 9)".into());
    };
    let Some(pubkey) = cfg.public_key_pem.clone() else {
        return Err("licensing is not configured — set ALBUMFORGE_KEYGEN_PUBLIC_KEY (see MIGRATION.md Phase 9)".into());
    };

    let fingerprint = license::machine_fingerprint();
    let client = reqwest::Client::new();
    let validate_url =
        format!("{}/v1/accounts/{}/licenses/actions/validate", cfg.base_url, account);
    let resp = client
        .post(&validate_url)
        .json(&license::validate_request_body(&key, &fingerprint))
        .send()
        .await
        .map_err(|e| format!("Keygen unreachable: {e}"))?;
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Keygen response unreadable: {e}"))?;
    let (valid, license_json) = license::parse_validate_response(&body);
    if !valid {
        return Ok(serde_json::json!({
            "valid": false,
            "detail": body.pointer("/meta/detail").cloned().unwrap_or(serde_json::Value::Null),
            "offlineLease": false,
        }));
    }
    let Some(license_json) = license_json else {
        return Ok(serde_json::json!({ "valid": true, "detail": "no license body", "offlineLease": false }));
    };
    let license_id = license_json["id"].as_str().unwrap_or("").to_string();

    // Try to arm the offline lease: fetch the account-signed license file.
    // Keygen returns the Ed25519 signature in the `Keygen-Signature` response
    // header; accounts that have not enabled offline signing get no header
    // and simply run without a lease (validated online each launch instead).
    let signed_url = format!(
        "{}/v1/accounts/{}/licenses/{}/file",
        cfg.base_url, account, license_id
    );
    let file_resp = client.get(&signed_url).send().await;
    let leased = match file_resp {
        Ok(r) if r.status().is_success() => {
            let sig = r
                .headers()
                .get("Keygen-Signature")
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string());
            let payload = r.text().await.ok();
            match (sig, payload) {
                (Some(sig), Some(payload))
                    if license::verify_ed25519(payload.as_bytes(), &sig, &pubkey) =>
                {
                    let record = license::new_lease(
                        &payload,
                        &sig,
                        &license_id,
                        chrono::Utc::now().timestamp(),
                    );
                    license::write_lease(&data_dir, &record).ok();
                    Some(true)
                }
                _ => None,
            }
        }
        _ => None,
    };

    Ok(serde_json::json!({
        "valid": true,
        "licenseId": license_id,
        "offlineLease": leased.unwrap_or(false),
    }))
}

/// `license:deactivate` — drop the cached lease (e.g. sign-out / machine
/// release). The Keygen seat is released server-side by the caller's billing
/// flow; locally this just forgets the lease.
#[tauri::command]
pub fn license_deactivate(app: AppHandle) -> Result<(), String> {
    let data_dir = &app.state::<AppState>().data_dir;
    license::clear_lease(data_dir)
}

/// `print:quote` — white-label pricing calculator (integer minor units).
#[tauri::command]
pub fn print_quote(input: print::QuoteInput) -> print::Quote {
    print::quote(input)
}

/// `print:payload` — compile a persisted layout JSON into a normalised print
/// manifest plus the Prodigi and Gelato order payloads (pure; no network).
/// Asset URLs stay `null` until the Phase 5 export stage uploads the 300 DPI
/// files.
#[tauri::command]
pub fn print_payload(
    layout: serde_json::Value,
    spec: print::PrintSpec,
) -> Result<serde_json::Value, String> {
    let manifest = print::manifest_from_layout(&layout, &spec)?;
    let prodigi = print::compile_prodigi_order(&manifest, None, None);
    let gelato = print::compile_gelato_order(&manifest, None, None);
    Ok(serde_json::json!({ "manifest": manifest, "prodigi": prodigi, "gelato": gelato }))
}

/// `project:saveAlbumFile` — package a workspace layout into a portable
/// `.album` archive: `layout.json` + the proxy thumbnails its elements
/// reference (read from the native cache dir by photo id).
#[tauri::command]
pub async fn project_save_album_file(
    app: AppHandle,
    target_path: String,
    layout: serde_json::Value,
) -> Result<project::ArchiveSummary, String> {
    let state = app.state::<AppState>();
    let cache_dir = state.cache_dir.clone();
    let out = Path::new(&target_path).to_path_buf();
    if let Some(parent) = out.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("create target dir: {e}"))?;
    }

    tauri::async_runtime::spawn_blocking(move || {
        let mut media: Vec<(String, Vec<u8>)> = Vec::new();
        for id in collect_photo_ids(&layout) {
            let p = cache_dir.join(format!("{id}-thumb256.jpg"));
            if let Ok(bytes) = std::fs::read(&p) {
                media.push((format!("{id}-thumb256.jpg"), bytes));
            }
        }
        let refs: Vec<(&str, Vec<u8>)> =
            media.iter().map(|(n, b)| (n.as_str(), b.clone())).collect();
        project::build_album_archive(&layout, &refs, &out)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Collect photo ids referenced by an album layout JSON (tolerant walk of
/// `pages[].elements[].photoId` and `elements[].photoId`).
fn collect_photo_ids(value: &serde_json::Value) -> std::collections::BTreeSet<String> {
    use std::collections::BTreeSet;
    let mut out = BTreeSet::new();
    fn walk(v: &serde_json::Value, out: &mut BTreeSet<String>) {
        match v {
            serde_json::Value::Array(items) => {
                for it in items {
                    walk(it, out);
                }
            }
            serde_json::Value::Object(map) => {
                for (k, val) in map {
                    if (k == "photoId" || k == "photo_id") && val.is_string() {
                        if let Some(s) = val.as_str() {
                            if !s.is_empty() {
                                out.insert(s.to_string());
                            }
                        }
                    } else {
                        walk(val, out);
                    }
                }
            }
            _ => {}
        }
    }
    walk(value, &mut out);
    out
}

/// `project:autosave` — append a layout snapshot to the draft's recovery
/// journal (the caller schedules the 60 s tick; this is the storage layer).
#[tauri::command]
pub fn project_autosave(
    app: AppHandle,
    draft_id: String,
    layout: serde_json::Value,
) -> Result<(), String> {
    let data_dir = &app.state::<AppState>().data_dir;
    let journal = project::RecoveryJournal::new(data_dir.join("recovery"));
    journal.write_snapshot(&draft_id, &layout)
}

/// `project:recover` — newest uncommitted snapshot for a draft, if any (boot
/// hook after an unexpected exit).
#[tauri::command]
pub fn project_recover(
    app: AppHandle,
    draft_id: String,
) -> Result<Option<serde_json::Value>, String> {
    let data_dir = &app.state::<AppState>().data_dir;
    let journal = project::RecoveryJournal::new(data_dir.join("recovery"));
    Ok(journal.latest(&draft_id))
}

/// `project:clearRecovery` — drop the shadow file after a successful restore.
#[tauri::command]
pub fn project_clear_recovery(app: AppHandle, draft_id: String) -> Result<(), String> {
    let data_dir = &app.state::<AppState>().data_dir;
    let journal = project::RecoveryJournal::new(data_dir.join("recovery"));
    journal.clear(&draft_id)
}

/// `errors:report` — renderer crash/error hook target (`window.onerror` /
/// `unhandledrejection`); appends sanitised entry + optional Sentry forward.
#[tauri::command]
pub fn errors_report(app: AppHandle, message: String) -> Result<(), String> {
    let data_dir = &app.state::<AppState>().data_dir;
    errors::report(data_dir, &message);
    Ok(())
}

/// `errors:lastCrash` — most recent sanitised crash entry (empty = clean).
#[tauri::command]
pub fn errors_last_crash(app: AppHandle) -> Result<Option<String>, String> {
    let data_dir = &app.state::<AppState>().data_dir;
    Ok(errors::last_crash(data_dir))
}
