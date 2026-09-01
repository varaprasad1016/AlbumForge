//! Automated WebP proxy pipeline.
//!
//! Generates small, optimised WebP thumbnails (default max 1000 px on the
//! long edge, quality 80) into the app cache directory, so the frontend never
//! loads raw 50 MB originals. Work is parallelised with `rayon` and progress
//! events are emitted so the UI can show a live counter.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};

use rayon::prelude::*;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::AppState;
use crate::core::scanner;

pub const DEFAULT_MAX_DIM: u32 = 1000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyInfo {
    /// Absolute path of the original source file.
    pub photo_path: String,
    /// Absolute path of the generated WebP proxy in the app cache.
    pub proxy_path: String,
    pub width: u32,
    pub height: u32,
}

/// Deterministic proxy filename for a source path (stable FNV-1a hash), so
/// re-scans reuse cached proxies instead of regenerating them.
pub fn proxy_file_name(src: &str) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for b in src.bytes() {
        hash ^= u64::from(b);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{hash:016x}.webp")
}

/// Absolute path of the cached proxy for `src`.
pub fn proxy_path(app: &AppHandle, src: &str) -> PathBuf {
    let state = app.state::<AppState>();
    state.cache_dir.join("proxies").join(proxy_file_name(src))
}

/// Generate one WebP proxy: decode, apply EXIF orientation, downscale the
/// long edge to `max_dim`, encode as lossy WebP.
pub fn generate_proxy(src: &Path, dest: &Path, max_dim: u32) -> Result<ProxyInfo, String> {
    let img = image::open(src).map_err(|e| format!("decode {}: {e}", src.display()))?;
    let oriented = apply_orientation(img, src);
    let (w, h) = (oriented.width(), oriented.height());

    let scale = (max_dim as f32 / w.max(h) as f32).min(1.0);
    let rgba = if scale < 1.0 {
        image::imageops::resize(
            &oriented.to_rgba8(),
            ((w as f32) * scale).round().max(1.0) as u32,
            ((h as f32) * scale).round().max(1.0) as u32,
            image::imageops::FilterType::Lanczos3,
        )
    } else {
        oriented.to_rgba8()
    };

    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    // WebPEncoder::new_lossy(quality) is the knob to tune once image 0.25.x
    // settles; save_with_format uses the crate defaults (lossy, ~75).
    image::DynamicImage::ImageRgba8(rgba.clone())
        .save_with_format(dest, image::ImageFormat::WebP)
        .map_err(|e| e.to_string())?;

    Ok(ProxyInfo {
        photo_path: src.to_string_lossy().into_owned(),
        proxy_path: dest.to_string_lossy().into_owned(),
        width: rgba.width(),
        height: rgba.height(),
    })
}

/// Generate proxies for many sources in parallel, emitting progress events.
/// Returns the successful proxies; hard failures (undecodable file) are
/// collected into the error string so one corrupt file cannot block a shoot.
pub fn generate_proxies_parallel(
    app: &AppHandle,
    paths: Vec<String>,
    max_dim: u32,
) -> Result<Vec<ProxyInfo>, String> {
    let total = paths.len();
    let done = AtomicUsize::new(0);

    let results: Vec<Result<ProxyInfo, String>> = paths
        .par_iter()
        .map(|src| {
            let n = done.fetch_add(1, Ordering::Relaxed) + 1;
            let _ = app.emit(
                "proxy-progress",
                serde_json::json!({ "current": n, "total": total, "filename": src }),
            );
            let dest = proxy_path(app, src);
            generate_proxy(Path::new(src), &dest, max_dim)
        })
        .collect();

    let mut infos = Vec::new();
    let mut errs = Vec::new();
    for r in results {
        match r {
            Ok(i) => infos.push(i),
            Err(e) => errs.push(e),
        }
    }
    if errs.is_empty() {
        Ok(infos)
    } else {
        Err(format!("{} of {total} proxies failed: {}", errs.len(), errs.join("; ")))
    }
}

/// Apply the EXIF orientation tag so proxies match how the photo was shot.
fn apply_orientation(mut img: image::DynamicImage, src: &Path) -> image::DynamicImage {
    let orientation = scanner::read_orientation(src).unwrap_or(1);
    match orientation {
        3 => img.rotate180(),
        6 => img.rotate90(),
        8 => img.rotate270(),
        _ => img,
    }
}
