//! Photo palette sampling — native input for the renderer-driven `recommend`
//! engine (Phase 4/6 pull-forward).
//!
//! Electron's main process read a 64×64 downscale with `sharp` and ran the
//! pure k-means quantizer in `src/main/recommend.ts`. On the native backend
//! the same pure quantizer lives in `src/shared/recommend.ts` and runs in the
//! renderer — this module only does what a webview cannot: decode the preview
//! file natively, downscale it fit-inside 64px (no enlargement, sharp parity)
//! and return the raw RGB pixels as base64. The renderer decodes → `kMeans`
//! → `merge` → `suggestDesign` with fonts, exactly like Electron.

use std::path::Path;

use base64::Engine as _;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

/// Raw-RGB sample for one photo — base64 of `width*height*3` bytes.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhotoPalette {
    pub id: String,
    pub rgb: String,
}

/// Preview file for a photo row: the stored path when it still exists, else
/// the deterministic native cache file (`{id}-preview1024.jpg` — the media
/// seam's resolution; adopted Electron rows may carry stale legacy paths).
fn resolve_preview(cache_dir: &Path, id: &str, stored: Option<String>) -> Option<std::path::PathBuf> {
    if let Some(p) = stored {
        let pb = Path::new(&p).to_path_buf();
        if pb.is_file() {
            return Some(pb);
        }
    }
    let fallback = cache_dir.join(format!("{id}-preview1024.jpg"));
    fallback.is_file().then_some(fallback)
}

/// Target dims for a fit-inside-64 downscale without enlargement (sharp's
/// `resize(64, 64, { fit: "inside", withoutEnlargement: true })` parity).
fn fit_inside(w: u32, h: u32, max: u32) -> (u32, u32) {
    if w <= max && h <= max {
        return (w.max(1), h.max(1));
    }
    let scale = (max as f32 / (w.max(h)) as f32).min(1.0);
    (((w as f32 * scale).round() as u32).max(1), ((h as f32 * scale).round() as u32).max(1))
}

/// Sample up to one palette per photo id (skips unreadable/missing previews,
/// matching Electron's `suggestForPhotos` which skips files `sharp` can't
/// read). Runs on a blocking thread via `with_db`.
pub fn sample_palettes(
    conn: &Connection,
    cache_dir: &Path,
    photo_ids: &[String],
) -> Result<Vec<PhotoPalette>, String> {
    let mut out = Vec::with_capacity(photo_ids.len());
    for id in photo_ids {
        let stored: Option<String> = conn
            .query_row(
                "SELECT preview_path FROM photos WHERE id = ?1",
                params![id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| format!("palette row read: {e}"))?
            .flatten();
        let Some(file) = resolve_preview(cache_dir, id, stored) else {
            continue;
        };
        let Ok(img) = image::open(&file) else {
            continue;
        };
        let (w, h) = (img.width(), img.height());
        let (nw, nh) = fit_inside(w, h, 64);
        let rgb = if nw == w && nh == h {
            img.to_rgb8()
        } else {
            img.resize(nw, nh, image::imageops::FilterType::Lanczos3).to_rgb8()
        };
        out.push(PhotoPalette {
            id: id.clone(),
            rgb: base64::engine::general_purpose::STANDARD.encode(rgb.as_raw()),
        });
    }
    Ok(out)
}
