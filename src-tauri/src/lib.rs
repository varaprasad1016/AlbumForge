//! AlbumForge native backend (Tauri 2).
//!
//! The renderer is a pure presentation layer. Every heavy operation — folder
//! scans, EXIF reads, proxy generation, the SQLite storage, and the 300 DPI
//! export pipeline — lives in `core/` and is exposed through thin, typed
//! commands in `commands/`. Secrets are never compiled in and never logged;
//! see `core/secrets.rs`.

mod commands;
mod core;

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use rusqlite::Connection;
use tauri::Manager;

/// Process-wide state handed to commands.
pub struct AppState {
    /// Directory where generated editor proxies and export jobs live.
    pub cache_dir: PathBuf,
    /// App data directory holding `albumforge.db` (parity with Electron's
    /// `%APPDATA%` user-data dir; the DB file name is identical).
    pub data_dir: PathBuf,
    /// Shared SQLite connection (rusqlite `Connection` is `Send`, not `Sync`,
    /// so commands take the mutex inside `spawn_blocking`).
    pub db: Arc<Mutex<Connection>>,
}

/// Legacy Electron data dirs to copy the DB from on first native run
/// (Windows: `%APPDATA%/AlbumForge` or `%APPDATA%/albumforge`). The schema is
/// shared, so an existing studio library carries over untouched.
#[cfg(windows)]
fn legacy_electron_db_candidates() -> Vec<PathBuf> {
    let Some(appdata) = std::env::var_os("APPDATA") else {
        return Vec::new();
    };
    let base = Path::new(&appdata);
    ["AlbumForge", "albumforge"]
        .iter()
        .map(|dir| base.join(dir).join("albumforge.db"))
        .collect()
}

#[cfg(not(windows))]
fn legacy_electron_db_candidates() -> Vec<PathBuf> {
    Vec::new()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        // Auto-update from GitHub Releases (electron-updater parity — the
        // renderer drives it through the typed `updates` seam in native.ts).
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let cache_dir = app.path().app_cache_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            std::fs::create_dir_all(&cache_dir)?;
            std::fs::create_dir_all(cache_dir.join("proxies"))?;

            // First native run: adopt the Electron DB if it exists and we
            // have none yet (same schema — no migration needed).
            let db_path = data_dir.join("albumforge.db");
            if !db_path.exists() {
                for legacy in legacy_electron_db_candidates() {
                    if legacy.is_file() {
                        std::fs::copy(&legacy, &db_path)?;
                        // Adopt the legacy proxy cache too: photo rows point at
                        // deterministic files (`{id}-thumb256.jpg`, `{id}-preview1024.jpg`,
                        // `{id}-matte.png`), so copying them into the native cache dir
                        // makes an existing studio's grids render under the native media
                        // seam. Files are copied only when missing — native proxies
                        // already rendered for the same id win.
                        if let Some(legacy_data) = legacy.parent() {
                            let legacy_cache = legacy_data.join("cache");
                            if legacy_cache.is_dir() {
                                if let Ok(entries) = std::fs::read_dir(&legacy_cache) {
                                    for entry in entries.flatten() {
                                        let src = entry.path();
                                        let is_image = matches!(
                                            src.extension().and_then(|e| e.to_str()),
                                            Some("jpg" | "jpeg" | "png" | "webp")
                                        );
                                        if !is_image {
                                            continue;
                                        }
                                        let Some(name) = src.file_name() else {
                                            continue;
                                        };
                                        let dest = cache_dir.join(name);
                                        if !dest.exists() {
                                            let _ = std::fs::copy(&src, &dest);
                                        }
                                    }
                                }
                            }
                        }
                        break;
                    }
                }
            }

            let db = Arc::new(Mutex::new(core::db::open_db(&db_path)?));
            app.manage(AppState { cache_dir, data_dir, db });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_dirs,
            commands::choose_images,
            commands::choose_save_path,
            commands::choose_directory,
            commands::choose_feedback,
            commands::choose_assets,
            commands::scan_folder,
            commands::generate_proxies,
            commands::proxy_path,
            commands::export_album,
            commands::projects_create,
            commands::projects_list,
            commands::photos_import,
            commands::photos_list,
            commands::photos_records,
            commands::groups_list,
            commands::groups_auto,
            commands::groups_create,
            commands::groups_rename,
            commands::groups_remove,
            commands::groups_assign,
            commands::groups_merge,
            commands::groups_split,
            commands::groups_clear,
            commands::templates_list,
            commands::templates_get,
            commands::fonts_list,
            commands::albums_list,
            commands::albums_get,
            commands::albums_pages,
            commands::albums_save_generated,
            commands::albums_save_page,
            commands::albums_add_page,
            commands::albums_duplicate_page,
            commands::albums_delete_page,
            commands::albums_reorder_pages,
            commands::albums_versions,
            commands::albums_snapshot,
            commands::albums_restore_version,
            commands::exports_create,
            commands::exports_get,
            commands::designs_list,
            commands::designs_save,
            commands::designs_get,
            commands::designs_remove,
            commands::proofs_build,
            commands::proofs_import_feedback,
            commands::proofs_notes,
            commands::app_info,
            commands::app_open_path,
            commands::app_open_data_folder,
            commands::app_clear_cache,
            commands::assets_list,
            commands::assets_import,
            commands::assets_remove,
            commands::stock_configured,
            commands::stock_provider,
            commands::stock_set_provider,
            commands::stock_set_api_key,
            commands::stock_recent,
            commands::stock_search,
            commands::stock_download,
            commands::gen_configured,
            commands::gen_provider,
            commands::gen_set_provider,
            commands::gen_set_api_key,
            commands::gen_generate,
            commands::photos_palettes,
        ])
        .run(tauri::generate_context!())
        .expect("error while running AlbumForge");
}
