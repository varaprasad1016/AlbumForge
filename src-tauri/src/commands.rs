//! IPC surface (Tauri commands). Thin handlers: validate, delegate to
//! `core::*`, emit progress events. The renderer calls these exclusively
//! through `src/renderer/src/lib/native.ts` — never via raw IPC strings.

use std::path::Path;

use tauri::{AppHandle, Emitter};

use crate::core::export::{self, ExportJobInput, ExportResult};
use crate::core::proxy::{self, ProxyInfo};
use crate::core::scanner::{self, ScannedPhoto};

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

/// Generate WebP proxies for the given originals into the app cache.
/// Emits `proxy-progress` events.
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
