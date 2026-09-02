//! Automated local proxy generation engine.
//!
//! Downscales originals into small, colour-friendly editor proxies inside the
//! secure app cache so the frontend never loads raw 50 MB files — a shoot of
//! 5,000 images becomes a fast, bounded background job instead of a UI stall.
//!
//! Encoding: lossy **JPEG q85**, the exact codec/quality the legacy Electron
//! pipeline produced via sharp (parity keeps cache migration and `media://`
//! rendering identical). Note: the pinned pure-Rust `image` 0.25 crate only
//! ships a *lossless* WebP encoder (VP8L) — lossless WebP is 3–10× larger
//! than q85 JPEG on photographic content and would blow up a 5,000-image
//! cache, so lossy WebP via the C-backed `webp` crate is deliberately not
//! wired in yet (see NATIVE_BLUEPRINT.md "Codec roadmap").
//!
//! Concurrency: encode work runs on a dedicated, size-capped rayon pool
//! (`background_pool`) rather than the global pool, so a proxy batch never
//! saturates every core on the machine and the UI thread keeps breathing
//! room. Caching is idempotent: re-scans reuse the deterministic per-source
//! file instead of regenerating.

use std::num::NonZeroUsize;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::OnceLock;

use rayon::prelude::*;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::AppState;
use crate::core::scanner;

/// Long-edge bound for editor proxies (2048 px per the native architecture).
pub const DEFAULT_MAX_DIM: u32 = 2048;
/// Encode quality, matching the legacy sharp `.jpeg({ quality: 85 })` pass.
pub const PROXY_QUALITY: u8 = 85;
/// Import thumbnail bound — Electron cache parity (`<id>-thumb256.jpg`).
pub const THUMB_MAX_DIM: u32 = 256;
/// Import preview bound — Electron cache parity (`<id>-preview1024.jpg`).
pub const PREVIEW_MAX_DIM: u32 = 1024;
/// File extension of generated proxies. Kept in one place so the cache-key
/// scheme (which embeds the codec) can never drift from the written bytes.
const PROXY_EXT: &str = "jpg";

/// Cache key namespace. Bump `CACHE_SCHEMA` to invalidate every cached proxy
/// (e.g. when the codec, default bound or colour pipeline changes).
const CACHE_SCHEMA: &str = "jpeg-v1";

/// Id of the source as a cache filename. The hash is FNV-1a over
/// `schema|max_dim|src`, so changing any knob produces a fresh file instead
/// of silently serving a stale proxy; old files are simply orphaned until
/// the user clears the cache.
fn proxy_file_name(src: &str, max_dim: u32) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for b in format!("{CACHE_SCHEMA}|{max_dim}|{src}").bytes() {
        hash ^= u64::from(b);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{hash:016x}.{PROXY_EXT}")
}

/// Absolute path of the cached proxy for `src` at the default bound.
pub fn proxy_path(app: &AppHandle, src: &str) -> PathBuf {
    proxy_path_for(app, src, DEFAULT_MAX_DIM)
}

/// Absolute path of the cached proxy for `src` at an explicit bound.
pub fn proxy_path_for(app: &AppHandle, src: &str, max_dim: u32) -> PathBuf {
    let state = app.state::<AppState>();
    state
        .cache_dir
        .join("proxies")
        .join(proxy_file_name(src, max_dim))
}

/// Dedicated, size-capped background pool for decode/encode work.
///
/// Half the logical cores (clamped to 2–6) keeps the webview's compositor,
/// event loop and any concurrent scan responsive while a large batch churns.
/// Rayon threads cannot be OS-niced portably; bounding the pool is the
/// portable equivalent, and the queue is FIFO so nothing starves.
fn background_pool() -> &'static rayon::ThreadPool {
    static POOL: OnceLock<rayon::ThreadPool> = OnceLock::new();
    POOL.get_or_init(|| {
        let cpus = std::thread::available_parallelism()
            .map(NonZeroUsize::get)
            .unwrap_or(4);
        let threads = (cpus / 2).clamp(2, 6);
        rayon::ThreadPoolBuilder::new()
            .num_threads(threads)
            .thread_name(|i| format!("af-proxy-{i}"))
            .build()
            .expect("failed to build the background proxy pool")
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyInfo {
    /// Absolute path of the original source file.
    pub photo_path: String,
    /// Absolute path of the generated proxy in the app cache.
    pub proxy_path: String,
    pub width: u32,
    pub height: u32,
}

/// Downscale-or-keep `img`, then encode as lossy JPEG q85 into `dest`.
/// Returns the encoded pixel dimensions. 1.0 scale = "already fits" — small
/// originals are never upscaled.
fn write_jpeg(img: &image::DynamicImage, dest: &Path, max_dim: u32) -> Result<(u32, u32), String> {
    let (w, h) = (img.width(), img.height());
    let scale = (max_dim as f32 / w.max(h) as f32).min(1.0);
    let rgb = if scale < 1.0 {
        image::imageops::resize(
            &img.to_rgb8(),
            ((w as f32) * scale).round().max(1.0) as u32,
            ((h as f32) * scale).round().max(1.0) as u32,
            image::imageops::FilterType::Lanczos3,
        )
    } else {
        img.to_rgb8()
    };

    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let file = std::fs::File::create(dest).map_err(|e| e.to_string())?;
    image::codecs::jpeg::JpegEncoder::new_with_quality(file, PROXY_QUALITY)
        .encode(rgb.as_raw(), rgb.width(), rgb.height(), image::ExtendedColorType::Rgb8)
        .map_err(|e| format!("encode {}: {e}", dest.display()))?;
    Ok((rgb.width(), rgb.height()))
}

/// Decode `src` **once** and render several size bounds (thumbnail + preview)
/// into the given destinations, applying EXIF orientation a single time.
/// Used by the photo-import pipeline for `<id>-thumb256.jpg` /
/// `<id>-preview1024.jpg` cache parity with the Electron shell.
pub fn render_proxy_sizes(
    src: &Path,
    sizes: &[(std::path::PathBuf, u32)],
) -> Result<Vec<(u32, u32)>, String> {
    let img = image::open(src).map_err(|e| format!("decode {}: {e}", src.display()))?;
    let oriented = apply_orientation(img, src);
    sizes
        .iter()
        .map(|(dest, max_dim)| write_jpeg(&oriented, dest, *max_dim))
        .collect()
}

/// Generate one proxy: decode, apply EXIF orientation, downscale the long
/// edge to `max_dim`, encode as lossy JPEG q85.
pub fn generate_proxy(src: &Path, dest: &Path, max_dim: u32) -> Result<ProxyInfo, String> {
    let img = image::open(src).map_err(|e| format!("decode {}: {e}", src.display()))?;
    let oriented = apply_orientation(img, src);
    let (w, h) = write_jpeg(&oriented, dest, max_dim)?;
    Ok(ProxyInfo {
        photo_path: src.to_string_lossy().into_owned(),
        proxy_path: dest.to_string_lossy().into_owned(),
        width: w,
        height: h,
    })
}

/// Generate proxies for many sources on the background pool, emitting
/// progress events. Hard failures (undecodable file) are collected into the
/// returned error string so one corrupt file cannot block a shoot.
pub fn generate_proxies_parallel(
    app: &AppHandle,
    paths: Vec<String>,
    max_dim: u32,
) -> Result<Vec<ProxyInfo>, String> {
    background_pool().install(|| {
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
                let dest = proxy_path_for(app, src, max_dim);
                // Idempotent cache: reuse a proxy that already exists (e.g.
                // on a re-import or after a scan) instead of re-decoding the
                // original. Dimensions come from the cached header, which is
                // cheap; a header we cannot read means a corrupt file → regen.
                if dest.is_file() {
                    if let Ok((width, height)) = image::image_dimensions(&dest) {
                        return Ok(ProxyInfo {
                            photo_path: src.clone(),
                            proxy_path: dest.to_string_lossy().into_owned(),
                            width,
                            height,
                        });
                    }
                }
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
            Err(format!(
                "{} of {total} proxies failed: {}",
                errs.len(),
                errs.join("; ")
            ))
        }
    })
}

/// Apply the EXIF orientation tag so proxies match how the photo was shot.
fn apply_orientation(img: image::DynamicImage, src: &Path) -> image::DynamicImage {
    let orientation = scanner::read_orientation(src).unwrap_or(1);
    match orientation {
        3 => img.rotate180(),
        6 => img.rotate90(),
        8 => img.rotate270(),
        _ => img,
    }
}
