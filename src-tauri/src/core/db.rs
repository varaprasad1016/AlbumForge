//! Local SQLite storage (rusqlite, bundled) — port of the Electron shell's
//! `src/main/db.ts` schema + the Phase-3 query surface.
//!
//! The DDL is kept **byte-identical** to the Electron schema (MIGRATION.md
//! Phase 3: additive-only, so one DB file serves either shell). DTO structs
//! mirror `src/shared/api.ts` 1:1 (`#[serde(rename_all = "camelCase")]`), so
//! rows serialized here are indistinguishable from the Electron IPC DTOs.
//!
//! All functions are pure (no Tauri types) and unit-testable with `cargo test`.

use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::types::Value;
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::Serialize;
use uuid::Uuid;

/// UUID v4 id (parity with `randomUUID()` in `src/main/db.ts`).
pub fn new_id() -> String {
    Uuid::new_v4().to_string()
}

/// UTC ISO-8601 millisecond timestamp (parity with `new Date().toISOString()`).
pub fn now() -> String {
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    chrono::DateTime::from_timestamp_millis(ms)
        .map(|t| t.to_rfc3339_opts(chrono::SecondsFormat::Millis, true))
        .unwrap_or_default()
}

/// Schema ported verbatim from `SCHEMA` in `src/main/db.ts`.
pub const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  client_name TEXT,
  event_date TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  thumbnail_photo_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  orientation TEXT,
  file_size INTEGER,
  mime_type TEXT,
  exif_timestamp TEXT,
  quality_score REAL,
  blur_score REAL,
  face_count INTEGER DEFAULT 0,
  phash TEXT,
  processing_status TEXT NOT NULL DEFAULT 'pending',
  selected INTEGER NOT NULL DEFAULT 0,
  group_id TEXT,
  thumbnail_path TEXT,
  preview_path TEXT,
  latitude REAL,
  longitude REAL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_photos_project ON photos(project_id);

CREATE TABLE IF NOT EXISTS photo_groups (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_photo_groups_project ON photo_groups(project_id);

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  style TEXT,
  is_system INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS template_layouts (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  slots TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1,
  min_photos INTEGER NOT NULL DEFAULT 1,
  max_photos INTEGER NOT NULL DEFAULT 9,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS albums (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  template_id TEXT,
  name TEXT NOT NULL,
  page_size TEXT NOT NULL,
  page_count INTEGER NOT NULL DEFAULT 0,
  variation_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_albums_project ON albums(project_id);

CREATE TABLE IF NOT EXISTS album_versions (
  id TEXT PRIMARY KEY,
  album_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  layout_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS album_pages (
  id TEXT PRIMARY KEY,
  album_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  layout_key TEXT,
  background TEXT
);
CREATE INDEX IF NOT EXISTS idx_album_pages_album ON album_pages(album_id);

CREATE TABLE IF NOT EXISTS album_elements (
  id TEXT PRIMARY KEY,
  album_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  type TEXT NOT NULL,
  z INTEGER NOT NULL DEFAULT 0,
  x REAL NOT NULL DEFAULT 0,
  y REAL NOT NULL DEFAULT 0,
  width REAL NOT NULL DEFAULT 1,
  height REAL NOT NULL DEFAULT 1,
  rotation REAL NOT NULL DEFAULT 0,
  photo_id TEXT,
  crop TEXT,
  text TEXT,
  style TEXT
);
CREATE INDEX IF NOT EXISTS idx_album_elements_page ON album_elements(page_id);

CREATE TABLE IF NOT EXISTS album_generation_jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  album_id TEXT,
  config TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  stage TEXT NOT NULL DEFAULT 'queued',
  progress INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exports (
  id TEXT PRIMARY KEY,
  album_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  file_path TEXT,
  settings TEXT,
  error TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS photo_notes (
  id TEXT PRIMARY KEY,
  photo_id TEXT NOT NULL UNIQUE,
  comment TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subject_mattes (
  photo_id TEXT PRIMARY KEY,
  matte_path TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS designs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  layout_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_search_cache (
  cache_key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_assets (
  provider_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  local_path TEXT NOT NULL,
  source_url TEXT,
  preview_url TEXT,
  title TEXT,
  author TEXT,
  license TEXT,
  width INTEGER,
  height INTEGER,
  created_at TEXT NOT NULL
);
"#;

/// Every table the Electron schema defines — used to assert structural parity.
pub const EXPECTED_TABLES: &[&str] = &[
    "projects",
    "photos",
    "photo_groups",
    "templates",
    "template_layouts",
    "albums",
    "album_versions",
    "album_pages",
    "album_elements",
    "album_generation_jobs",
    "exports",
    "photo_notes",
    "assets",
    "subject_mattes",
    "designs",
    "stock_search_cache",
    "stock_assets",
];

/// Open (creating if needed) the app database with WAL + foreign keys, then
/// run the same additive migrations as `src/main/db.ts`.
pub fn open_db(path: &Path) -> Result<Connection, String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("create db dir: {e}"))?;
    }
    let conn = Connection::open(path).map_err(|e| format!("open db: {e}"))?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| e.to_string())?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|e| e.to_string())?;
    conn.execute_batch(SCHEMA).map_err(|e| format!("schema: {e}"))?;
    migrate(&conn)?;
    Ok(conn)
}

/// Additive migrations mirroring `migrate()` in `src/main/db.ts`.
fn migrate(conn: &Connection) -> Result<(), String> {
    let cols = |conn: &Connection, table: &str| -> Result<Vec<String>, String> {
        let mut stmt = conn
            .prepare(&format!("PRAGMA table_info({table})"))
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| r.get::<_, String>(1))
            .map_err(|e| e.to_string())?;
        Ok(rows.filter_map(Result::ok).collect())
    };
    let project_cols = cols(conn, "projects")?;
    if !project_cols.iter().any(|c| c == "thumbnail_photo_id") {
        conn.execute_batch("ALTER TABLE projects ADD COLUMN thumbnail_photo_id TEXT")
            .map_err(|e| e.to_string())?;
    }
    let photo_cols = cols(conn, "photos")?;
    if !photo_cols.iter().any(|c| c == "latitude") {
        conn.execute_batch("ALTER TABLE photos ADD COLUMN latitude REAL")
            .map_err(|e| e.to_string())?;
    }
    if !photo_cols.iter().any(|c| c == "longitude") {
        conn.execute_batch("ALTER TABLE photos ADD COLUMN longitude REAL")
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/* ---------- DTOs (mirror src/shared/api.ts; camelCase over the wire) ---------- */

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub client_name: Option<String>,
    pub event_date: Option<String>,
    pub status: String,
    pub thumbnail_photo_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Photo {
    pub id: String,
    pub project_id: String,
    pub filename: String,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub orientation: Option<String>,
    pub file_size: Option<i64>,
    pub quality_score: Option<f64>,
    pub blur_score: Option<f64>,
    pub face_count: i64,
    pub processing_status: String,
    pub selected: bool,
    pub group_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhotoListResponse {
    pub items: Vec<Photo>,
    pub total: i64,
}

/// Filters for `photos:list` (mirrors the Electron handler options).
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PhotoListOpts {
    pub offset: i64,
    pub limit: i64,
    pub selected: Option<bool>,
    pub status: Option<String>,
    pub group_id: Option<String>,
    pub query: Option<String>,
    pub sort: Option<String>,
}

fn project_from_row(row: &Row<'_>) -> rusqlite::Result<Project> {
    Ok(Project {
        id: row.get(0)?,
        name: row.get(1)?,
        client_name: row.get(2)?,
        event_date: row.get(3)?,
        status: row.get(4)?,
        thumbnail_photo_id: row.get(5)?,
        created_at: row.get(6)?,
    })
}

fn photo_from_row(row: &Row<'_>) -> rusqlite::Result<Photo> {
    Ok(Photo {
        id: row.get(0)?,
        project_id: row.get(1)?,
        filename: row.get(2)?,
        width: row.get(3)?,
        height: row.get(4)?,
        orientation: row.get(5)?,
        file_size: row.get(6)?,
        quality_score: row.get(7)?,
        blur_score: row.get(8)?,
        face_count: row.get(9)?,
        processing_status: row.get(10)?,
        selected: row.get::<_, i64>(11)? != 0,
        group_id: row.get(12)?,
        created_at: row.get(13)?,
    })
}

/// `SELECT *` column order must match the mappers above.
const PROJECT_SELECT: &str = "id, name, client_name, event_date, status, thumbnail_photo_id, created_at";
const PHOTO_SELECT: &str = "id, project_id, filename, width, height, orientation, file_size, quality_score, blur_score, face_count, processing_status, selected, group_id, created_at";

/* ---------- Projects ---------- */

pub fn project_exists(conn: &Connection, id: &str) -> Result<bool, String> {
    let exists = conn
        .query_row(
            "SELECT 1 FROM projects WHERE id = ?",
            params![id],
            |_| Ok(()),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .is_some();
    Ok(exists)
}

pub fn insert_project(
    conn: &Connection,
    name: &str,
    client_name: Option<&str>,
    event_date: Option<&str>,
) -> Result<Project, String> {
    let id = new_id();
    let created = now();
    conn.execute(
        "INSERT INTO projects (id, name, client_name, event_date, status, created_at) VALUES (?1, ?2, ?3, ?4, 'active', ?5)",
        params![id, name, client_name, event_date, created],
    )
    .map_err(|e| e.to_string())?;
    project_by_id(conn, &id)
}

fn project_by_id(conn: &Connection, id: &str) -> Result<Project, String> {
    conn.query_row(
        &format!("SELECT {PROJECT_SELECT} FROM projects WHERE id = ?"),
        params![id],
        project_from_row,
    )
    .map_err(|e| e.to_string())
}

/// `projects:list` parity — pins a thumbnail when missing: best quality score
/// first, else any photo; clears references to deleted photos.
pub fn list_projects(conn: &Connection) -> Result<Vec<Project>, String> {
    let mut stmt = conn
        .prepare(&format!("SELECT {PROJECT_SELECT} FROM projects ORDER BY created_at DESC"))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], project_from_row)
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        let mut p = row.map_err(|e| e.to_string())?;
        let mut thumb = p.thumbnail_photo_id.clone();
        if let Some(t) = thumb.as_deref() {
            let photo_exists = conn
                .query_row("SELECT 1 FROM photos WHERE id = ?", params![t], |_| Ok(()))
                .optional()
                .map_err(|e| e.to_string())?
                .is_some();
            if !photo_exists {
                thumb = None;
                conn.execute("UPDATE projects SET thumbnail_photo_id = NULL WHERE id = ?", params![p.id])
                    .map_err(|e| e.to_string())?;
            }
        }
        if thumb.is_none() {
            let best: Option<String> = conn
                .query_row(
                    "SELECT id FROM photos WHERE project_id = ? AND quality_score IS NOT NULL ORDER BY quality_score DESC, id ASC LIMIT 1",
                    params![p.id],
                    |r| r.get(0),
                )
                .optional()
                .map_err(|e| e.to_string())?;
            let any: Option<String> = conn
                .query_row(
                    "SELECT id FROM photos WHERE project_id = ? ORDER BY id ASC LIMIT 1",
                    params![p.id],
                    |r| r.get(0),
                )
                .optional()
                .map_err(|e| e.to_string())?;
            thumb = best.or(any);
            if let Some(t) = thumb.as_deref() {
                conn.execute("UPDATE projects SET thumbnail_photo_id = ? WHERE id = ?", params![t, p.id])
                    .map_err(|e| e.to_string())?;
            }
        }
        p.thumbnail_photo_id = thumb;
        out.push(p);
    }
    Ok(out)
}

/* ---------- Photos ---------- */

/// Everything `photos:import` writes per file (columns parity with Electron).
#[derive(Debug, Clone)]
pub struct NewPhoto {
    pub project_id: String,
    pub file_path: String,
    pub filename: String,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub orientation: Option<String>,
    pub file_size: Option<i64>,
    pub mime_type: Option<String>,
    pub exif_timestamp: Option<String>,
    pub thumbnail_path: Option<String>,
    pub preview_path: Option<String>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
}

impl NewPhoto {
    pub fn insert(&self, conn: &Connection) -> Result<String, String> {
        let id = new_id();
        conn.execute(
            "INSERT INTO photos
               (id, project_id, file_path, filename, width, height, orientation, file_size, mime_type,
                exif_timestamp, quality_score, blur_score, face_count, phash, processing_status, selected,
                thumbnail_path, preview_path, latitude, longitude, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, NULL, NULL, 0, NULL, 'ready', 0, ?11, ?12, ?13, ?14, ?15)",
            params![
                id,
                self.project_id,
                self.file_path,
                self.filename,
                self.width,
                self.height,
                self.orientation,
                self.file_size,
                self.mime_type,
                self.exif_timestamp,
                self.thumbnail_path,
                self.preview_path,
                self.latitude,
                self.longitude,
                now(),
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(id)
    }
}

/// `photos:list` parity — same filter/sort semantics as the Electron handler.
pub fn list_photos(
    conn: &Connection,
    project_id: &str,
    opts: &PhotoListOpts,
) -> Result<PhotoListResponse, String> {
    let mut where_clause = "WHERE project_id = ?".to_string();
    let mut args: Vec<Value> = vec![Value::Text(project_id.to_string())];
    if let Some(sel) = opts.selected {
        where_clause.push_str(" AND selected = ?");
        args.push(Value::Integer(if sel { 1 } else { 0 }));
    }
    if let Some(status) = opts.status.as_deref() {
        if !status.is_empty() {
            where_clause.push_str(" AND processing_status = ?");
            args.push(Value::Text(status.to_string()));
        }
    }
    match opts.group_id.as_deref() {
        Some("__none__") => where_clause.push_str(" AND group_id IS NULL"),
        Some(g) if !g.is_empty() => {
            where_clause.push_str(" AND group_id = ?");
            args.push(Value::Text(g.to_string()));
        }
        _ => {}
    }
    if let Some(q) = opts.query.as_deref() {
        let q = q.trim();
        if !q.is_empty() {
            where_clause.push_str(" AND filename LIKE ?");
            args.push(Value::Text(format!("%{q}%")));
        }
    }
    let order_by = if opts.sort.as_deref() == Some("captured") {
        "ORDER BY exif_timestamp IS NULL, exif_timestamp"
    } else {
        "ORDER BY created_at"
    };

    let total: i64 = conn
        .query_row(
            &format!("SELECT COUNT(*) FROM photos {where_clause}"),
            rusqlite::params_from_iter(args.iter()),
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    let sql = format!(
        "SELECT {PHOTO_SELECT} FROM photos {where_clause} {order_by} LIMIT ? OFFSET ?"
    );
    let mut all_args = args;
    all_args.push(Value::Integer(opts.limit));
    all_args.push(Value::Integer(opts.offset));
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params_from_iter(all_args.iter()), photo_from_row)
        .map_err(|e| e.to_string())?;
    let mut items = Vec::new();
    for r in rows {
        items.push(r.map_err(|e| e.to_string())?);
    }
    Ok(PhotoListResponse { items, total })
}

/// Engine-ready photo rows (`photos:records`, Phase 4 item 3) — parity with
/// `photoRecordsFor()` in `src/main/generate.ts`: same SELECT, same defaults
/// (width 3000 / height 2000 / orientation "landscape" / scores 0.5), `phash`
/// as a decimal string (BigInt `.toString()` parity — JSON cannot carry
/// bigint) and `taken_at` as epoch seconds. The renderer rehydrates these into
/// engine `PhotoRecord`s (`BigInt(phash)`, `faceBoxes: []`).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhotoRecord {
    pub id: String,
    pub width: i64,
    pub height: i64,
    pub orientation: String,
    pub quality_score: f64,
    pub blur_score: f64,
    pub phash: String,
    pub taken_at: Option<f64>,
    pub group_id: Option<String>,
}

fn epoch_seconds(iso: Option<String>) -> Option<f64> {
    iso.as_deref()
        .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
        .map(|t| t.timestamp() as f64)
}

pub fn photo_records(
    conn: &Connection,
    project_id: &str,
    mode: &str,
) -> Result<Vec<PhotoRecord>, String> {
    let sql = if mode == "selected" {
        "SELECT id, width, height, orientation, quality_score, blur_score, phash, exif_timestamp, group_id \
         FROM photos WHERE project_id = ? AND selected = 1 ORDER BY created_at"
    } else {
        "SELECT id, width, height, orientation, quality_score, blur_score, phash, exif_timestamp, group_id \
         FROM photos WHERE project_id = ? ORDER BY created_at"
    };
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project_id], |r| {
            Ok(PhotoRecord {
                id: r.get(0)?,
                width: r.get::<_, Option<i64>>(1)?.unwrap_or(3000),
                height: r.get::<_, Option<i64>>(2)?.unwrap_or(2000),
                orientation: r.get::<_, Option<String>>(3)?.unwrap_or_else(|| "landscape".into()),
                quality_score: r.get::<_, Option<f64>>(4)?.unwrap_or(0.5),
                blur_score: r.get::<_, Option<f64>>(5)?.unwrap_or(0.5),
                phash: r.get::<_, Option<String>>(6)?.unwrap_or_else(|| "0".into()),
                taken_at: epoch_seconds(r.get(7)?),
                group_id: r.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}
