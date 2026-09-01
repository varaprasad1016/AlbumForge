//! AlbumForge native backend (Tauri 2).
//!
//! The renderer is a pure presentation layer. Every heavy operation — folder
//! scans, EXIF reads, WebP proxy generation, and the 300 DPI export pipeline
//! — lives in `core/` and is exposed through thin, typed commands in
//! `commands/`. Secrets are never compiled in and never logged; see
//! `core/secrets.rs`.

mod commands;
mod core;

use std::path::PathBuf;

use tauri::Manager;

/// Process-wide state handed to commands.
pub struct AppState {
    /// Directory where generated WebP proxies and export jobs live.
    pub cache_dir: PathBuf,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let cache_dir = app.path().app_cache_dir()?;
            std::fs::create_dir_all(&cache_dir)?;
            std::fs::create_dir_all(cache_dir.join("proxies"))?;
            app.manage(AppState { cache_dir });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::scan_folder,
            commands::generate_proxies,
            commands::proxy_path,
            commands::export_album,
        ])
        .run(tauri::generate_context!())
        .expect("error while running AlbumForge");
}
