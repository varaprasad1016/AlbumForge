//! Photo import pipeline (Async Data Core) — native port of the Electron
//! `photos:import` handler in `src/main/ipc.ts`.
//!
//! Per file: read metadata natively (`scanner::inspect_photo`), render the
//! two editor proxies (`<id>-thumb256.jpg` / `<id>-preview1024.jpg` — cache
//! layout parity with Electron's sharp pass, decoded once per original via
//! `proxy::render_proxy_sizes`), then insert a `'ready'` photo row. Progress
//! is pushed through a callback so the Tauri command layer can emit
//! `import-progress` events; failures are counted per file so one corrupt
//! image never aborts a shoot.
//!
//! Pure (no Tauri types) → unit-tested with real generated images in
//! `cargo test`.

use std::path::{Path, PathBuf};

use rusqlite::Connection;
use serde::Serialize;

use crate::core::db::{self, NewPhoto};
use crate::core::proxy::{self, PREVIEW_MAX_DIM, THUMB_MAX_DIM};
use crate::core::scanner;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub imported: u32,
    pub failed: u32,
}

/// MIME map mirroring `MIME_BY_EXT` in `src/main/ipc.ts`.
pub fn mime_for_ext(path: &Path) -> Option<&'static str> {
    let ext = path.extension()?.to_str()?.to_ascii_lowercase();
    match ext.as_str() {
        "jpg" | "jpeg" => Some("image/jpeg"),
        "png" => Some("image/png"),
        "webp" => Some("image/webp"),
        "heic" => Some("image/heic"),
        "heif" => Some("image/heif"),
        "tif" | "tiff" => Some("image/tiff"),
        _ => None,
    }
}

/// Import `paths` into `project_id`. `on_progress` fires per file; hard
/// errors (missing project) return `Err`, per-file failures are counted.
pub fn import_photos(
    conn: &Connection,
    cache_dir: &Path,
    project_id: &str,
    paths: &[String],
    on_progress: &mut dyn FnMut(usize, usize, &str, &str),
) -> Result<ImportResult, String> {
    if !db::project_exists(conn, project_id)? {
        return Err(format!("project not found: {project_id}"));
    }
    let total = paths.len();
    let mut imported: u32 = 0;
    let mut failed: u32 = 0;

    for (i, raw) in paths.iter().enumerate() {
        let path = Path::new(raw);
        let filename = path
            .file_name()
            .map(|f| f.to_string_lossy().into_owned())
            .unwrap_or_else(|| raw.clone());
        let n = i + 1;

        on_progress(n, total, &filename, "analyzing");

        let meta = scanner::inspect_photo(path);
        let mime = mime_for_ext(path).unwrap_or("image/jpeg");
        match meta {
            None => {
                failed += 1;
                on_progress(n, total, &filename, "error");
            }
            Some(info) => {
                // Electron cache parity: files named by photo id, next to the
                // thumbnail/preview columns the media layer reads.
                let id = db::new_id();
                let thumb_dest: PathBuf = cache_dir.join(format!("{id}-thumb256.jpg"));
                let preview_dest: PathBuf = cache_dir.join(format!("{id}-preview1024.jpg"));
                let rendered = proxy::render_proxy_sizes(
                    path,
                    &[(thumb_dest.clone(), THUMB_MAX_DIM), (preview_dest.clone(), PREVIEW_MAX_DIM)],
                );
                match rendered {
                    Err(_) => {
                        failed += 1;
                        on_progress(n, total, &filename, "error");
                    }
                    Ok(_) => {
                        let row = NewPhoto {
                            project_id: project_id.to_string(),
                            file_path: raw.clone(),
                            filename: filename.clone(),
                            width: Some(i64::from(info.width)),
                            height: Some(i64::from(info.height)),
                            orientation: Some(info.orientation.to_string()),
                            file_size: Some(info.file_size as i64),
                            mime_type: Some(mime.to_string()),
                            exif_timestamp: info.taken_at,
                            thumbnail_path: Some(thumb_dest.to_string_lossy().into_owned()),
                            preview_path: Some(preview_dest.to_string_lossy().into_owned()),
                            latitude: info.latitude,
                            longitude: info.longitude,
                        };
                        match row.insert(conn) {
                            Ok(_) => {
                                imported += 1;
                                on_progress(n, total, &filename, "done");
                            }
                            Err(_) => {
                                failed += 1;
                                on_progress(n, total, &filename, "error");
                            }
                        }
                    }
                }
            }
        }
    }
    Ok(ImportResult { imported, failed })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::db;
    use image::ImageEncoder;
    use std::io::Write;

    fn tmp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "af-core-test-{tag}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// Write a solid-colour JPEG fixture of the given dimensions.
    fn fixture_jpeg(path: &Path, w: u32, h: u32) {
        let img = image::RgbImage::from_pixel(w, h, image::Rgb([182, 138, 94]));
        let file = std::fs::File::create(path).unwrap();
        let mut writer = std::io::BufWriter::new(file);
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut writer, 85)
            .write_image(img.as_raw(), w, h, image::ExtendedColorType::Rgb8)
            .unwrap();
        writer.flush().unwrap();
    }

    #[test]
    fn schema_parity_with_electron() {
        let dir = tmp_dir("schema");
        let conn = db::open_db(&dir.join("albumforge.db")).unwrap();
        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
            .unwrap();
        let tables: Vec<String> = stmt
            .query_map([], |r| r.get(0))
            .unwrap()
            .filter_map(Result::ok)
            .collect();
        for expected in db::EXPECTED_TABLES {
            assert!(
                tables.iter().any(|t| t == expected),
                "missing table: {expected} (got {tables:?})"
            );
        }
        // WAL enabled (parity with Electron pragma).
        let mode: String = conn.query_row("PRAGMA journal_mode", [], |r| r.get(0)).unwrap();
        assert_eq!(mode, "wal");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn import_writes_rows_and_proxies() {
        let dir = tmp_dir("import");
        let cache_dir = dir.join("cache");
        std::fs::create_dir_all(&cache_dir).unwrap();

        let conn = db::open_db(&dir.join("albumforge.db")).unwrap();
        let project = db::insert_project(&conn, "Wedding", None, None).unwrap();

        // 2048×1024 original → preview must land at 1024 (bound), thumb at 256.
        let src = dir.join("DSC_0001.jpg");
        fixture_jpeg(&src, 2048, 1024);

        let mut events: Vec<String> = Vec::new();
        let result = import_photos(
            &conn,
            &cache_dir,
            &project.id,
            &[src.to_string_lossy().into_owned()],
            &mut |n, total, filename, status| {
                events.push(format!("{n}/{total} {filename} {status}"));
            },
        )
        .unwrap();
        assert_eq!(result.imported, 1);
        assert_eq!(result.failed, 0);

        let list = db::list_photos(
            &conn,
            &project.id,
            &db::PhotoListOpts {
                offset: 0,
                limit: 10,
                selected: None,
                status: None,
                group_id: None,
                query: None,
                sort: None,
            },
        )
        .unwrap();
        assert_eq!(list.total, 1);
        let photo = &list.items[0];
        assert_eq!(photo.filename, "DSC_0001.jpg");
        assert_eq!(photo.processing_status, "ready");
        assert_eq!(photo.width, Some(2048));
        assert_eq!(photo.height, Some(1024));
        assert!(!photo.selected);
        assert_eq!(photo.project_id, project.id);

        // Proxies exist with the Electron cache names + correct bounds.
        let thumb = cache_dir.join(format!("{}-thumb256.jpg", photo.id));
        let preview = cache_dir.join(format!("{}-preview1024.jpg", photo.id));
        assert!(thumb.is_file(), "thumbnail missing: {}", thumb.display());
        assert!(preview.is_file(), "preview missing: {}", preview.display());
        let (tw, th) = image::image_dimensions(&thumb).unwrap();
        assert_eq!((tw, th), (256, 128));
        let (pw, ph) = image::image_dimensions(&preview).unwrap();
        assert_eq!((pw, ph), (1024, 512));

        // Project list pins the new photo as the thumbnail.
        let projects = db::list_projects(&conn).unwrap();
        assert_eq!(projects[0].thumbnail_photo_id.as_deref(), Some(photo.id.as_str()));

        // Corrupt file is counted, not fatal.
        let bad = dir.join("broken.jpg");
        std::fs::write(&bad, b"not an image at all").unwrap();
        let result2 = import_photos(
            &conn,
            &cache_dir,
            &project.id,
            &[bad.to_string_lossy().into_owned()],
            &mut |_n, _t, _f, _s| {},
        )
        .unwrap();
        assert_eq!(result2.imported, 0);
        assert_eq!(result2.failed, 1);
        let list2 = db::list_photos(&conn, &project.id, &db::PhotoListOpts {
            offset: 0,
            limit: 10,
            selected: None,
            status: None,
            group_id: None,
            query: None,
            sort: None,
        })
        .unwrap();
        assert_eq!(list2.total, 1);

        // Missing project → hard error.
        let err = import_photos(
            &conn,
            &cache_dir,
            "does-not-exist",
            &[],
            &mut |_n, _t, _f, _s| {},
        )
        .unwrap_err();
        assert!(err.contains("project not found"));

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn list_filters_match_electron_semantics() {
        let dir = tmp_dir("listfilters");
        let conn = db::open_db(&dir.join("albumforge.db")).unwrap();
        let project = db::insert_project(&conn, "Filter", Some("Acme"), Some("2026-09-01")).unwrap();

        for name in ["b.jpg", "a.jpg", "c.jpg"] {
            let src = dir.join(name);
            fixture_jpeg(&src, 64, 64);
            import_photos(
                &conn,
                &dir,
                &project.id,
                &[src.to_string_lossy().into_owned()],
                &mut |_n, _t, _f, _s| {},
            )
            .unwrap();
        }
        // Query filter + sort by captured (no EXIF → created fallback order).
        let opts = db::PhotoListOpts {
            offset: 0,
            limit: 10,
            selected: None,
            status: None,
            group_id: None,
            query: Some("a.".into()),
            sort: None,
        };
        let list = db::list_photos(&conn, &project.id, &opts).unwrap();
        assert_eq!(list.total, 1);
        assert_eq!(list.items[0].filename, "a.jpg");

        // Offset/limit pagination.
        let page = db::list_photos(
            &conn,
            &project.id,
            &db::PhotoListOpts { offset: 1, limit: 1, selected: None, status: None, group_id: None, query: None, sort: None },
        )
        .unwrap();
        assert_eq!(page.total, 3);
        assert_eq!(page.items.len(), 1);

        // Project DTO carries client name / event date.
        assert_eq!(project.client_name.as_deref(), Some("Acme"));
        assert_eq!(project.event_date.as_deref(), Some("2026-09-01"));

        std::fs::remove_dir_all(&dir).ok();
    }
}
