//! Ultra-fast local asset scanner.
//!
//! Walks a folder, reads EXIF/metadata with `kamadak-exif`, reads pixel
//! dimensions from image headers (no full decode), and returns a lightweight
//! JSON-friendly vector. All metadata — EXIF timestamps, camera metrics
//! (make/model/ISO), GPS and pixel ratios — is parsed in native code; the
//! walk is parallelised with `rayon`, so a folder of 5,000 images is
//! indexed in milliseconds without ever touching the UI thread.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};

use rayon::prelude::*;
use serde::Serialize;

pub const SUPPORTED_EXTS: &[&str] = &["jpg", "jpeg", "png", "tif", "tiff", "webp"];

/// Lightweight metadata row shipped to the frontend. Never contains file
/// contents — only paths + small numeric/string fields.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannedPhoto {
    pub path: String,
    pub filename: String,
    pub width: u32,
    pub height: u32,
    /// EXIF orientation tag (1 = as-is). Applied by the proxy/export stages.
    pub orientation: u16,
    pub file_size: u64,
    /// EXIF DateTimeOriginal, ISO-8601 when available.
    pub taken_at: Option<String>,
    /// Camera make/model (IFD0 Make/Model tags), for gear-based grouping.
    pub camera_make: Option<String>,
    pub camera_model: Option<String>,
    /// EXIF PhotographicSensitivity (ISO).
    pub iso: Option<u32>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
}

/// Recursively collect supported image files under `dir`.
fn collect_images(dir: &Path) -> Result<Vec<PathBuf>, String> {
    let mut out = Vec::new();
    for entry in walkdir::WalkDir::new(dir)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if !entry.file_type().is_file() {
            continue;
        }
        let ext = entry
            .path()
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase());
        if ext.is_some_and(|e| SUPPORTED_EXTS.contains(&e.as_str())) {
            out.push(entry.into_path());
        }
    }
    out.sort();
    Ok(out)
}

/// Scan `dir`, calling `on_progress(current, total)` as items complete so the
/// frontend can render a live counter. Runs on the global rayon pool.
pub fn scan_directory(
    dir: &Path,
    on_progress: impl Fn(usize, usize) + Sync,
) -> Result<Vec<ScannedPhoto>, String> {
    if !dir.is_dir() {
        return Err(format!("not a directory: {}", dir.display()));
    }
    let files = collect_images(dir)?;
    let total = files.len();
    let done = AtomicUsize::new(0);

    let mut photos: Vec<ScannedPhoto> = files
        .par_iter()
        .inspect(|_| {
            // Count every visited file so progress always reaches `total`,
            // even when a corrupt image yields no metadata row.
            let n = done.fetch_add(1, Ordering::Relaxed) + 1;
            on_progress(n, total);
        })
        .filter_map(|p| inspect_photo(p))
        .collect();

    // Chronological grouping (smart-album source order); untimed photos last.
    photos.sort_by_key(|p| {
        p.taken_at.clone().unwrap_or_else(|| "\u{10FFFF}".to_string())
    });
    Ok(photos)
}

/// Read metadata for a single image file (EXIF optional — never fails the
/// scan on corrupt blocks). Public so the import pipeline reuses the exact
/// same native parse for rows and cache keys.
pub fn inspect_photo(path: &Path) -> Option<ScannedPhoto> {
    let meta = std::fs::metadata(path).ok()?;
    let (width, height) = image::image_dimensions(path).ok()?;
    let filename = path.file_name()?.to_string_lossy().into_owned();

    let mut photo = ScannedPhoto {
        path: path.to_string_lossy().into_owned(),
        filename,
        width,
        height,
        orientation: 1,
        file_size: meta.len(),
        taken_at: None,
        camera_make: None,
        camera_model: None,
        iso: None,
        latitude: None,
        longitude: None,
    };

    // EXIF is optional — a missing or corrupt block must not fail the scan.
    if let Some(exif) = read_exif(path) {
        photo.taken_at = field_string(&exif, exif::Tag::DateTimeOriginal);
        photo.orientation = field_u16(&exif, exif::Tag::Orientation).unwrap_or(1);
        photo.camera_make = field_string(&exif, exif::Tag::Make);
        photo.camera_model = field_string(&exif, exif::Tag::Model);
        photo.iso = field_u32(&exif, exif::Tag::PhotographicSensitivity);
        photo.latitude = gps_degrees(&exif, exif::Tag::GPSLatitude, exif::Tag::GPSLatitudeRef);
        photo.longitude = gps_degrees(&exif, exif::Tag::GPSLongitude, exif::Tag::GPSLongitudeRef);
    }

    Some(photo)
}

fn read_exif(path: &Path) -> Option<exif::Exif> {
    let file = std::fs::File::open(path).ok()?;
    let mut reader = std::io::BufReader::new(file);
    exif::Reader::new().read_from_container(&mut reader).ok()
}

/// Read the EXIF orientation tag (defaults to 1 = as-is). Shared by the
/// proxy and export pipelines so previews match the printed page.
pub fn read_orientation(path: &Path) -> Option<u16> {
    let exif = read_exif(path)?;
    field_u16(&exif, exif::Tag::Orientation).filter(|o| (1..=8).contains(o))
}

fn field_string(exif: &exif::Exif, tag: exif::Tag) -> Option<String> {
    exif.get_field(tag, exif::In::PRIMARY)
        .map(|f| f.value.display_as(f.tag).to_string())
}

fn field_u16(exif: &exif::Exif, tag: exif::Tag) -> Option<u16> {
    exif.get_field(tag, exif::In::PRIMARY).and_then(|f| match f.value {
        exif::Value::Short(ref v) => v.first().copied(),
        _ => None,
    })
}

/// Read an unsigned tag tolerant of the Short/Long encodings different
/// camera vendors write (ISO is often Short, occasionally Long).
fn field_u32(exif: &exif::Exif, tag: exif::Tag) -> Option<u32> {
    exif.get_field(tag, exif::In::PRIMARY).and_then(|f| match f.value {
        exif::Value::Short(ref v) => v.first().map(|x| u32::from(*x)),
        exif::Value::Long(ref v) => v.first().copied(),
        _ => None,
    })
}

/// Convert a GPS rational field + hemisphere ref to decimal degrees.
fn gps_degrees(exif: &exif::Exif, coord: exif::Tag, hemis: exif::Tag) -> Option<f64> {
    let value = exif.get_field(coord, exif::In::PRIMARY)?.value.clone();
    let exif::Value::Rational(rats) = value else {
        return None;
    };
    let d = rats.first()?;
    let m = rats.get(1)?;
    let s = rats.get(2)?;
    let mut deg = d.to_f64() + m.to_f64() / 60.0 + s.to_f64() / 3600.0;
    let neg = exif
        .get_field(hemis, exif::In::PRIMARY)
        .and_then(|f| match f.value {
            exif::Value::Ascii(ref v) => v.first().and_then(|b| b.first().copied()),
            _ => None,
        })
        .is_some_and(|b| b == b'S' || b == b'W');
    if neg {
        deg = -deg;
    }
    Some(deg)
}
