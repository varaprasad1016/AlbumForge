//! Library services (Phase 4) — port of the Electron IPC handlers for the
//! `groups`, `templates` and `albums` namespaces (`src/main/ipc.ts`).
//!
//! Every function is a pure `&Connection` operation returning DTOs that mirror
//! `src/shared/api.ts` 1:1 (`#[serde(rename_all = "camelCase")]`), so rows are
//! indistinguishable from the Electron IPC responses. JSON columns are
//! round-tripped as `serde_json::Value` — the renderer owns the exact shapes
//! (elements, slots, styles); this module only persists them.
//!
//! Engine-coupled endpoints (`albums:generate`, `albums:recomposePage`) stay in
//! the TS engine (MIGRATION.md Phase 4 item 3) and are NOT ported here.

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::core::db::{new_id, now};
use crate::core::import::ImportResult;

/* ---------- DTOs (mirror src/shared/api.ts) ---------- */

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhotoGroup {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub color: Option<String>,
    pub sort_order: i64,
    pub photo_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateSummary {
    pub id: String,
    pub key: String,
    pub name: String,
    pub description: Option<String>,
    pub is_system: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateLayout {
    pub id: String,
    pub key: String,
    pub name: String,
    pub slots: Value,
    pub weight: f64,
    pub max_photos: i64,
    pub sort_order: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateDetail {
    pub id: String,
    pub key: String,
    pub name: String,
    pub description: Option<String>,
    pub is_system: bool,
    pub style: Value,
    pub layouts: Vec<TemplateLayout>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageSize {
    pub width: f64,
    pub height: f64,
    pub unit: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Album {
    pub id: String,
    pub project_id: String,
    pub template_id: Option<String>,
    pub name: String,
    pub page_size: PageSize,
    pub page_count: i64,
    pub variation_number: i64,
    pub status: String,
    pub created_at: String,
}

/// An element as stored (and returned). `type` keeps its wire name; JSON
/// columns (crop/text/style) pass through untouched.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumElement {
    #[serde(rename = "type")]
    pub el_type: String,
    pub id: String,
    pub z: i64,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub rotation: f64,
    pub photo_id: Option<String>,
    pub crop: Option<Value>,
    pub text: Option<Value>,
    pub style: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumPage {
    pub id: String,
    pub index: i64,
    pub layout_key: Option<String>,
    /// Computed, not stored — tolerate version JSON missing it (`#[serde(default)]`).
    #[serde(default)]
    pub is_spread: bool,
    pub background: Option<Value>,
    pub elements: Vec<AlbumElement>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumVersion {
    pub id: String,
    pub version_number: i64,
    pub created_at: String,
}

/// `PageUpdate` from `src/shared/api.ts` — the renderer's page edit payload.
/// `layout_key`/`background`/`elements` are each optional; `elements` carry a
/// client-owned `id` kept stable across saves (Electron comment: regenerating
/// ids unmounts every Konva node on the next render).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageUpdate {
    pub layout_key: Option<String>,
    pub background: Option<Value>,
    pub elements: Option<Vec<PageElementInput>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageElementInput {
    pub id: Option<String>,
    #[serde(rename = "type")]
    pub el_type: String,
    pub z: Option<i64>,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub rotation: f64,
    pub photo_id: Option<String>,
    pub crop: Option<Value>,
    pub text: Option<Value>,
    pub style: Option<Value>,
}

impl PageElementInput {
    fn into_element(self, index: usize) -> AlbumElement {
        AlbumElement {
            el_type: self.el_type,
            id: self.id.unwrap_or_else(new_id),
            z: self.z.unwrap_or(index as i64),
            x: self.x,
            y: self.y,
            width: self.width,
            height: self.height,
            rotation: self.rotation,
            photo_id: self.photo_id,
            crop: self.crop,
            text: self.text,
            style: self.style,
        }
    }
}

/* ---------- helpers ---------- */

fn parse_json(col: Option<String>) -> Option<Value> {
    col.and_then(|s| serde_json::from_str(&s).ok())
}

fn json_to_db(value: Option<Value>) -> Option<String> {
    value.map(|v| v.to_string())
}

/// `isSpreadLayout` parity (`src/main/engine/layouts.ts`).
fn is_spread_layout(layout_key: Option<&str>) -> bool {
    matches!(layout_key, Some(k) if k.starts_with("spread_"))
}

/// Element columns (no album/page ids) — order must match `element_from_row`.
const ELEMENT_SELECT: &str =
    "id, type, z, x, y, width, height, rotation, photo_id, crop, text, style";

fn element_from_row(row: &Row<'_>) -> rusqlite::Result<AlbumElement> {
    Ok(AlbumElement {
        id: row.get(0)?,
        el_type: row.get(1)?,
        z: row.get(2)?,
        x: row.get(3)?,
        y: row.get(4)?,
        width: row.get(5)?,
        height: row.get(6)?,
        rotation: row.get(7)?,
        photo_id: row.get(8)?,
        crop: parse_json(row.get(9)?),
        text: parse_json(row.get(10)?),
        style: parse_json(row.get(11)?),
    })
}

/// Page columns — order must match `page_from_row`-adjacent reads.
const PAGE_SELECT: &str = "id, album_id, idx, layout_key, background";

/// Album columns — order must match `album_from_row`.
const ALBUM_SELECT: &str =
    "id, project_id, template_id, name, page_size, page_count, variation_number, status, created_at";

fn parse_page_size(raw: Option<String>) -> PageSize {
    raw.and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(PageSize {
            width: 0.0,
            height: 0.0,
            unit: "mm".into(),
        })
}

/* ---------- Groups ---------- */

const GROUP_SELECT: &str = "id, project_id, name, color, sort_order";

fn group_from_row(row: &Row<'_>) -> rusqlite::Result<PhotoGroup> {
    Ok(PhotoGroup {
        id: row.get(0)?,
        project_id: row.get(1)?,
        name: row.get(2)?,
        color: row.get(3)?,
        sort_order: row.get(4)?,
        photo_count: row.get(5)?,
    })
}

/// `groups:list` parity — `photo_count` subquery, ordered by `sort_order`.
pub fn list_groups(conn: &Connection, project_id: &str) -> Result<Vec<PhotoGroup>, String> {
    let sql = format!(
        "SELECT {GROUP_SELECT}, (SELECT COUNT(*) FROM photos p WHERE p.group_id = g.id) AS photo_count \
         FROM photo_groups g WHERE g.project_id = ? ORDER BY g.sort_order"
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project_id], group_from_row)
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

fn insert_group(
    conn: &Connection,
    project_id: &str,
    name: &str,
    sort_order: i64,
) -> Result<String, String> {
    let id = new_id();
    conn.execute(
        "INSERT INTO photo_groups (id, project_id, name, sort_order, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, project_id, name, sort_order, now()],
    )
    .map_err(|e| e.to_string())?;
    Ok(id)
}

fn find_group(conn: &Connection, project_id: &str, id: &str) -> Option<PhotoGroup> {
    list_groups(conn, project_id)
        .ok()?
        .into_iter()
        .find(|g| g.id == id)
}

/// `groups:create` parity — appended at the end of the current sort order.
pub fn create_group(
    conn: &Connection,
    project_id: &str,
    name: &str,
) -> Result<PhotoGroup, String> {
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM photo_groups WHERE project_id = ?",
            params![project_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let id = insert_group(conn, project_id, name, count)?;
    find_group(conn, project_id, &id)
        .ok_or_else(|| format!("group not found: {id}"))
}

/// `groups:rename` parity.
pub fn rename_group(conn: &Connection, group_id: &str, name: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE photo_groups SET name = ? WHERE id = ?",
        params![name, group_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// `groups:remove` parity — photos leave the group (they are not deleted).
pub fn remove_group(conn: &Connection, group_id: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE photos SET group_id = NULL WHERE group_id = ?",
        params![group_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM photo_groups WHERE id = ?", params![group_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// `groups:assign` parity.
pub fn assign_photos(conn: &Connection, group_id: &str, photo_ids: &[String]) -> Result<(), String> {
    let mut stmt = conn
        .prepare("UPDATE photos SET group_id = ? WHERE id = ?")
        .map_err(|e| e.to_string())?;
    for pid in photo_ids {
        stmt.execute(params![group_id, pid])
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// `groups:merge` parity — photos of the source groups move to a fresh group
/// (sort order 0), then the sources are deleted.
pub fn merge_groups(
    conn: &Connection,
    project_id: &str,
    group_ids: &[String],
    name: &str,
) -> Result<PhotoGroup, String> {
    let target = insert_group(conn, project_id, name, 0)?;
    let mut stmt = conn
        .prepare("UPDATE photos SET group_id = ? WHERE group_id = ?")
        .map_err(|e| e.to_string())?;
    for g in group_ids {
        stmt.execute(params![target, g]).map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM photo_groups WHERE id = ?", params![g])
            .map_err(|e| e.to_string())?;
    }
    find_group(conn, project_id, &target)
        .ok_or_else(|| format!("group not found: {target}"))
}

/// `groups:split` parity — the given photos move out of `group_id` into a new
/// group appended after the highest current sort order.
pub fn split_group(
    conn: &Connection,
    project_id: &str,
    group_id: &str,
    photo_ids: &[String],
    name: &str,
) -> Result<PhotoGroup, String> {
    let max_sort: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order), 0) + 1 FROM photo_groups WHERE project_id = ?",
            params![project_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let id = insert_group(conn, project_id, name, max_sort)?;
    assign_photos(conn, &id, photo_ids)?;
    // Split requires the source group to exist; touch it so a bad id fails loudly.
    conn.query_row(
        "SELECT 1 FROM photo_groups WHERE id = ?",
        params![group_id],
        |_| Ok(()),
    )
    .optional()
    .map_err(|e| e.to_string())?
    .ok_or_else(|| format!("group not found: {group_id}"))?;
    find_group(conn, project_id, &id)
        .ok_or_else(|| format!("group not found: {id}"))
}

/// `groups:clear` parity — unassign every photo, drop every group.
pub fn clear_groups(conn: &Connection, project_id: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE photos SET group_id = NULL WHERE project_id = ?",
        params![project_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM photo_groups WHERE project_id = ?",
        params![project_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Time segmentation port of `segmentByTime` (`src/main/engine/grouping.ts`):
/// sort photos by capture time (missing → treated as epoch 0, stable) and cut a
/// new segment whenever the gap to the previous shot exceeds `gap_seconds`
/// (default 2700, matching the Electron call site). Returns photo ids.
fn segment_by_time(
    photos: &[(String, Option<String>)],
    gap_seconds: f64,
) -> Vec<Vec<String>> {
    if photos.is_empty() {
        return Vec::new();
    }
    let epoch = |iso: &Option<String>| -> f64 {
        iso.as_deref()
            .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
            .map(|t| t.timestamp() as f64)
            .unwrap_or(0.0)
    };
    let mut ordered: Vec<(String, f64)> = photos
        .iter()
        .map(|(id, iso)| (id.clone(), epoch(iso)))
        .collect();
    ordered.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));

    let mut segments: Vec<Vec<String>> = Vec::new();
    let mut current: Vec<String> = Vec::new();
    for (i, (id, ts)) in ordered.iter().enumerate() {
        if i > 0 && (ts - ordered[i - 1].1) > gap_seconds {
            segments.push(std::mem::take(&mut current));
        }
        current.push(id.clone());
    }
    if !current.is_empty() {
        segments.push(current);
    }
    segments
}

/// `groups:auto` parity — wipe existing groups, re-segment by capture time and
/// name them `Group 1..n` in chronological order.
pub fn auto_group(conn: &Connection, project_id: &str) -> Result<Vec<PhotoGroup>, String> {
    conn.execute(
        "DELETE FROM photo_groups WHERE project_id = ?",
        params![project_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE photos SET group_id = NULL WHERE project_id = ?",
        params![project_id],
    )
    .map_err(|e| e.to_string())?;

    let rows = {
        let mut stmt = conn
            .prepare("SELECT id, exif_timestamp FROM photos WHERE project_id = ? ORDER BY created_at")
            .map_err(|e| e.to_string())?;
        let mapped = stmt
            .query_map(params![project_id], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?))
            })
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for r in mapped {
            out.push(r.map_err(|e| e.to_string())?);
        }
        out
    };

    let segments = segment_by_time(&rows, 2700.0);
    let mut upd = conn
        .prepare("UPDATE photos SET group_id = ? WHERE id = ?")
        .map_err(|e| e.to_string())?;
    for (i, seg) in segments.iter().enumerate() {
        let gid = insert_group(conn, project_id, &format!("Group {}", i + 1), i as i64)?;
        for pid in seg {
            upd.execute(params![gid, pid]).map_err(|e| e.to_string())?;
        }
    }
    list_groups(conn, project_id)
}

/* ---------- Templates ---------- */

/// `templates:list` parity — summaries ordered system-first then by name.
pub fn list_templates(conn: &Connection) -> Result<Vec<TemplateSummary>, String> {
    let mut stmt = conn
        .prepare("SELECT id, key, name, description, is_system FROM templates ORDER BY is_system DESC, name")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(TemplateSummary {
                id: r.get(0)?,
                key: r.get(1)?,
                name: r.get(2)?,
                description: r.get(3)?,
                is_system: r.get::<_, i64>(4)? != 0,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

/// `templates:get` parity — detail with style + ordered layouts; `None` when
/// the template row does not exist (Electron returns `null`).
pub fn template_detail(conn: &Connection, id: &str) -> Result<Option<TemplateDetail>, String> {
    let row = conn
        .query_row(
            "SELECT id, key, name, description, is_system, style FROM templates WHERE id = ?",
            params![id],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, Option<String>>(3)?,
                    r.get::<_, i64>(4)?,
                    r.get::<_, Option<String>>(5)?,
                ))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let Some((id, key, name, description, is_system, style)) = row else {
        return Ok(None);
    };

    let mut stmt = conn
        .prepare(
            "SELECT id, key, name, slots, weight, max_photos, sort_order \
             FROM template_layouts WHERE template_id = ? ORDER BY sort_order",
        )
        .map_err(|e| e.to_string())?;
    let layouts = stmt
        .query_map(params![id], |r| {
            Ok(TemplateLayout {
                id: r.get(0)?,
                key: r.get(1)?,
                name: r.get(2)?,
                slots: parse_json(r.get(3)?).unwrap_or(Value::Null),
                weight: r.get(4)?,
                max_photos: r.get(5)?,
                sort_order: r.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut layout_out = Vec::new();
    for l in layouts {
        layout_out.push(l.map_err(|e| e.to_string())?);
    }

    Ok(Some(TemplateDetail {
        id,
        key,
        name,
        description,
        is_system: is_system != 0,
        style: parse_json(style).unwrap_or(Value::Null),
        layouts: layout_out,
    }))
}

/* ---------- Albums ---------- */

pub fn album_by_id(conn: &Connection, id: &str) -> Result<Album, String> {
    let row = conn
        .query_row(
            &format!("SELECT {ALBUM_SELECT} FROM albums WHERE id = ?"),
            params![id],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, Option<String>>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, Option<String>>(4)?,
                    r.get::<_, i64>(5)?,
                    r.get::<_, i64>(6)?,
                    r.get::<_, String>(7)?,
                    r.get::<_, String>(8)?,
                ))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("album not found: {id}"))?;
    Ok(Album {
        id: row.0,
        project_id: row.1,
        template_id: row.2,
        name: row.3,
        page_size: parse_page_size(row.4),
        page_count: row.5,
        variation_number: row.6,
        status: row.7,
        created_at: row.8,
    })
}

/// `albums:list` parity — all albums (optionally scoped to a project), newest
/// first, each hydrated via `album_by_id` like the Electron handler.
pub fn list_albums(
    conn: &Connection,
    project_id: Option<&str>,
) -> Result<Vec<Album>, String> {
    let ids: Vec<String> = match project_id {
        Some(pid) => {
            let mut stmt = conn
                .prepare("SELECT id FROM albums WHERE project_id = ? ORDER BY created_at DESC")
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(params![pid], |r| r.get::<_, String>(0))
                .map_err(|e| e.to_string())?;
            rows.filter_map(Result::ok).collect()
        }
        None => {
            let mut stmt = conn
                .prepare("SELECT id FROM albums ORDER BY created_at DESC")
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map([], |r| r.get::<_, String>(0))
                .map_err(|e| e.to_string())?;
            rows.filter_map(Result::ok).collect()
        }
    };
    let mut out = Vec::with_capacity(ids.len());
    for id in ids {
        out.push(album_by_id(conn, &id)?);
    }
    Ok(out)
}

fn elements_for_page(conn: &Connection, page_id: &str) -> Result<Vec<AlbumElement>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {ELEMENT_SELECT} FROM album_elements WHERE page_id = ? ORDER BY z"
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![page_id], element_from_row)
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

/// Raw page tuple `(id, idx, layout_key, background)` — used inside rusqlite
/// row closures (which must return `rusqlite::Result`).
fn page_tuple_from_row(row: &Row<'_>) -> rusqlite::Result<(String, i64, Option<String>, Option<String>)> {
    Ok((row.get(0)?, row.get(2)?, row.get(3)?, row.get(4)?))
}

fn page_from_tuple(
    conn: &Connection,
    (id, index, layout_key, background): (String, i64, Option<String>, Option<String>),
) -> Result<AlbumPage, String> {
    Ok(AlbumPage {
        id: id.clone(),
        index,
        layout_key: layout_key.clone(),
        is_spread: is_spread_layout(layout_key.as_deref()),
        background: parse_json(background),
        elements: elements_for_page(conn, &id)?,
    })
}

fn page_by_id(conn: &Connection, page_id: &str) -> Result<AlbumPage, String> {
    let tuple = conn
        .query_row(
            &format!("SELECT {PAGE_SELECT} FROM album_pages WHERE id = ?"),
            params![page_id],
            page_tuple_from_row,
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("page not found: {page_id}"))?;
    page_from_tuple(conn, tuple)
}

/// `albums:pages` parity — all pages of an album ordered by `idx`, each with
/// its elements ordered by `z`.
pub fn album_pages(conn: &Connection, album_id: &str) -> Result<Vec<AlbumPage>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {PAGE_SELECT} FROM album_pages WHERE album_id = ? ORDER BY idx"
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![album_id], page_tuple_from_row)
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        let tuple = r.map_err(|e| e.to_string())?;
        out.push(page_from_tuple(conn, tuple)?);
    }
    Ok(out)
}

fn insert_element(
    conn: &Connection,
    album_id: &str,
    page_id: &str,
    el: &AlbumElement,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO album_elements
           (id, album_id, page_id, type, z, x, y, width, height, rotation, photo_id, crop, text, style)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        params![
            el.id,
            album_id,
            page_id,
            el.el_type,
            el.z,
            el.x,
            el.y,
            el.width,
            el.height,
            el.rotation,
            el.photo_id,
            json_to_db(el.crop.clone()),
            json_to_db(el.text.clone()),
            json_to_db(el.style.clone()),
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn replace_page_elements(
    conn: &Connection,
    album_id: &str,
    page_id: &str,
    elements: &[AlbumElement],
) -> Result<(), String> {
    conn.execute(
        "DELETE FROM album_elements WHERE page_id = ?",
        params![page_id],
    )
    .map_err(|e| e.to_string())?;
    for el in elements {
        insert_element(conn, album_id, page_id, el)?;
    }
    Ok(())
}

/// `albums:savePage` parity — applies only the present fields of `update` and
/// returns the hydrated page.
pub fn save_page(
    conn: &Connection,
    album_id: &str,
    page_id: &str,
    update: &PageUpdate,
) -> Result<AlbumPage, String> {
    if let Some(key) = update.layout_key.as_deref() {
        conn.execute(
            "UPDATE album_pages SET layout_key = ? WHERE id = ?",
            params![key, page_id],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(background) = update.background.as_ref() {
        conn.execute(
            "UPDATE album_pages SET background = ? WHERE id = ?",
            params![background.to_string(), page_id],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(elements) = update.elements.as_deref() {
        let els: Vec<AlbumElement> = elements
            .iter()
            .cloned()
            .enumerate()
            .map(|(i, e)| e.into_element(i))
            .collect();
        replace_page_elements(conn, album_id, page_id, &els)?;
    }
    page_by_id(conn, page_id)
}

/// `albums:addPage` parity — an empty page appended at the end.
pub fn add_page(conn: &Connection, album_id: &str) -> Result<AlbumPage, String> {
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM album_pages WHERE album_id = ?",
            params![album_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let id = new_id();
    conn.execute(
        "INSERT INTO album_pages (id, album_id, idx) VALUES (?1, ?2, ?3)",
        params![id, album_id, count],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE albums SET page_count = ? WHERE id = ?",
        params![count + 1, album_id],
    )
    .map_err(|e| e.to_string())?;
    page_by_id(conn, &id)
}

/// `albums:duplicatePage` parity — deep copy of the source page (fresh ids,
/// same layout/background/elements) appended at the end.
pub fn duplicate_page(
    conn: &Connection,
    album_id: &str,
    page_id: &str,
) -> Result<AlbumPage, String> {
    let src = conn
        .query_row(
            "SELECT layout_key, background FROM album_pages WHERE id = ?",
            params![page_id],
            |r| {
                Ok((
                    r.get::<_, Option<String>>(0)?,
                    r.get::<_, Option<String>>(1)?,
                ))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Page not found".to_string())?;

    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM album_pages WHERE album_id = ?",
            params![album_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let id = new_id();
    conn.execute(
        "INSERT INTO album_pages (id, album_id, idx, layout_key, background) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, album_id, count, src.0, src.1],
    )
    .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(&format!(
            "SELECT {ELEMENT_SELECT} FROM album_elements WHERE page_id = ? ORDER BY z"
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![page_id], element_from_row)
        .map_err(|e| e.to_string())?;
    let mut copied = Vec::new();
    for r in rows {
        let mut el = r.map_err(|e| e.to_string())?;
        el.id = new_id();
        insert_element(conn, album_id, &id, &el)?;
        copied.push(el);
    }

    conn.execute(
        "UPDATE albums SET page_count = ? WHERE id = ?",
        params![count + 1, album_id],
    )
    .map_err(|e| e.to_string())?;
    page_by_id(conn, &id)
}

/// `albums:deletePage` parity — drop the page, renumber the rest, fix count.
pub fn delete_page(conn: &Connection, album_id: &str, page_id: &str) -> Result<(), String> {
    conn.execute(
        "DELETE FROM album_elements WHERE page_id = ?",
        params![page_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM album_pages WHERE id = ?", params![page_id])
        .map_err(|e| e.to_string())?;
    let remaining: Vec<String> = {
        let mut stmt = conn
            .prepare("SELECT id FROM album_pages WHERE album_id = ? ORDER BY idx")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![album_id], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        rows.filter_map(Result::ok).collect()
    };
    let mut upd = conn
        .prepare("UPDATE album_pages SET idx = ? WHERE id = ?")
        .map_err(|e| e.to_string())?;
    for (i, id) in remaining.iter().enumerate() {
        upd.execute(params![i as i64, id]).map_err(|e| e.to_string())?;
    }
    conn.execute(
        "UPDATE albums SET page_count = ? WHERE id = ?",
        params![remaining.len() as i64, album_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// `albums:reorderPages` parity — page ids in the new order become idx 0..n.
pub fn reorder_pages(conn: &Connection, page_ids: &[String]) -> Result<(), String> {
    let mut upd = conn
        .prepare("UPDATE album_pages SET idx = ? WHERE id = ?")
        .map_err(|e| e.to_string())?;
    for (i, id) in page_ids.iter().enumerate() {
        upd.execute(params![i as i64, id]).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// `albums:versions` parity — newest version first.
pub fn album_versions(conn: &Connection, album_id: &str) -> Result<Vec<AlbumVersion>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, version_number, created_at FROM album_versions \
             WHERE album_id = ? ORDER BY version_number DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![album_id], |r| {
            Ok(AlbumVersion {
                id: r.get(0)?,
                version_number: r.get(1)?,
                created_at: r.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

/// `albums:snapshot` parity — serialize all pages into the next version row.
pub fn snapshot(conn: &Connection, album_id: &str) -> Result<AlbumVersion, String> {
    let next: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(version_number), 0) FROM album_versions WHERE album_id = ?",
            params![album_id],
            |r| r.get::<_, i64>(0),
        )
        .map_err(|e| e.to_string())?
        + 1;
    let pages = album_pages(conn, album_id)?;
    let layout_json = serde_json::json!({ "pages": pages }).to_string();
    let id = new_id();
    let created = now();
    conn.execute(
        "INSERT INTO album_versions (id, album_id, version_number, layout_json, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, album_id, next, layout_json, created],
    )
    .map_err(|e| e.to_string())?;
    Ok(AlbumVersion {
        id,
        version_number: next,
        created_at: created,
    })
}

/// `albums:restoreVersion` parity — rebuild every page (fresh ids, stored idx/
/// layout/background/elements) from the version JSON; returns the album pages.
pub fn restore_version(
    conn: &Connection,
    album_id: &str,
    version_id: &str,
) -> Result<Vec<AlbumPage>, String> {
    let layout_json: String = conn
        .query_row(
            "SELECT layout_json FROM album_versions WHERE id = ?",
            params![version_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Version not found".to_string())?;

    #[derive(Deserialize)]
    struct VersionPayload {
        pages: Vec<AlbumPage>,
    }
    // AlbumPage derives Deserialize: geometry is f64, z/index i64, etc.
    let payload: VersionPayload =
        serde_json::from_str(&layout_json).map_err(|e| format!("version json: {e}"))?;

    conn.execute(
        "DELETE FROM album_pages WHERE album_id = ?",
        params![album_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM album_elements WHERE album_id = ?",
        params![album_id],
    )
    .map_err(|e| e.to_string())?;

    for page in payload.pages {
        let pid = new_id();
        let background = page.background.as_ref().map(|v| v.to_string());
        conn.execute(
            "INSERT INTO album_pages (id, album_id, idx, layout_key, background) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![pid, album_id, page.index, page.layout_key, background],
        )
        .map_err(|e| e.to_string())?;
        for el in page.elements {
            let mut el = el;
            el.id = new_id();
            insert_element(conn, album_id, &pid, &el)?;
        }
    }
    let count = album_pages(conn, album_id)?.len() as i64;
    conn.execute(
        "UPDATE albums SET page_count = ? WHERE id = ?",
        params![count, album_id],
    )
    .map_err(|e| e.to_string())?;
    album_pages(conn, album_id)
}

/* ---------- Designs (reusable page designs) ---------- */

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageDesign {
    pub id: String,
    pub name: String,
    pub created_at: String,
}

/// `designs:list` parity — newest first.
pub fn list_designs(conn: &Connection) -> Result<Vec<PageDesign>, String> {
    let mut stmt = conn
        .prepare("SELECT id, name, created_at FROM designs ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(PageDesign {
                id: r.get(0)?,
                name: r.get(1)?,
                created_at: r.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

/// `designs:save` parity — stores the page JSON as-is; returns the design.
pub fn save_design(conn: &Connection, name: &str, page: &Value) -> Result<PageDesign, String> {
    let id = new_id();
    let created = now();
    conn.execute(
        "INSERT INTO designs (id, name, layout_json, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![id, name, page.to_string(), created],
    )
    .map_err(|e| e.to_string())?;
    Ok(PageDesign {
        id,
        name: name.to_string(),
        created_at: created,
    })
}

/// `designs:get` parity — parsed page data, `None` when the row is missing.
pub fn get_design(conn: &Connection, id: &str) -> Result<Option<Value>, String> {
    let row = conn
        .query_row(
            "SELECT layout_json FROM designs WHERE id = ?",
            params![id],
            |r| r.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(row.and_then(|raw| serde_json::from_str(&raw).ok()))
}

/// `designs:remove` parity.
pub fn remove_design(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM designs WHERE id = ?", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/* ---------- Assets (custom graphics — Electron `assets:*`) ---------- */

/// `DesignAsset` DTO (mirrors `src/shared/api.ts`).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesignAsset {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub data_uri: String,
}

pub fn list_assets(conn: &Connection) -> Result<Vec<DesignAsset>, String> {
    let mut stmt = conn
        .prepare("SELECT id, name, kind, data FROM assets ORDER BY created_at")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(DesignAsset {
                id: row.get(0)?,
                name: row.get(1)?,
                kind: row.get(2)?,
                data_uri: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<_, _>>().map_err(|e| e.to_string())
}

/// JS `encodeURIComponent` parity (used for `data:image/svg+xml;utf8,<…>`
/// data URIs — browsers percent-decode the payload to UTF-8).
fn uri_component(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for &b in s.as_bytes() {
        let keep = b.is_ascii_alphanumeric()
            || matches!(b, b'-' | b'_' | b'.' | b'!' | b'~' | b'*' | b'\'' | b'(' | b')');
        if keep {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

/// `assets:import` parity — read SVG/PNG files (≤2 MB) into `assets` rows as
/// data URIs. Mirrors the Electron handler: ext + size gate, per-file try/catch
/// counting, never fatal. Runs on a blocking thread via `with_db`.
pub fn import_assets(conn: &Connection, paths: &[String]) -> Result<ImportResult, String> {
    use base64::Engine as _;
    let mut imported = 0u32;
    let mut failed = 0u32;
    for p in paths {
        let path = std::path::Path::new(p);
        let ok = (|| -> Result<(), String> {
            let meta = std::fs::metadata(path).map_err(|e| e.to_string())?;
            if meta.len() > 2 * 1024 * 1024 {
                return Err("over 2 MB".into());
            }
            let ext = path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
            let (kind, data_uri) = if ext == "svg" {
                let text = String::from_utf8_lossy(&bytes);
                (
                    "svg",
                    format!("data:image/svg+xml;utf8,{}", uri_component(&text)),
                )
            } else if ext == "png" {
                (
                    "png",
                    format!(
                        "data:image/png;base64,{}",
                        base64::engine::general_purpose::STANDARD.encode(&bytes)
                    ),
                )
            } else {
                return Err("unsupported extension".into());
            };
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("asset")
                .to_string();
            conn.execute(
                "INSERT INTO assets (id, name, kind, data, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![new_id(), name, kind, data_uri, now()],
            )
            .map_err(|e| e.to_string())?;
            Ok(())
        })();
        if ok.is_ok() {
            imported += 1;
        } else {
            failed += 1;
        }
    }
    Ok(ImportResult { imported, failed })
}

pub fn remove_asset(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM assets WHERE id = ?", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/* ---------- Export jobs (Phase 4 shell; runner lands in Phase 5) ---------- */

/// `ExportJob` DTO (mirrors `src/shared/api.ts`).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportJob {
    pub id: String,
    pub album_id: String,
    pub kind: String,
    pub status: String,
    pub file_path: Option<String>,
    pub error: Option<String>,
    pub created_at: String,
}

/// `exports:create` input (mirrors the Electron handler `input`). `target_path`
/// is accepted for API parity but not persisted — the Electron runner consumes
/// it; the native runner (Phase 5) will too.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportCreateInput {
    pub kind: String,
    pub dpi: f64,
    pub bleed_mm: f64,
    pub color_mode: Option<String>,
    pub preset_id: Option<String>,
    pub target_path: Option<String>,
}

fn export_job_by_id(conn: &Connection, id: &str) -> Result<ExportJob, String> {
    conn.query_row(
        "SELECT id, album_id, kind, status, file_path, error, created_at FROM exports WHERE id = ?",
        params![id],
        |r| {
            Ok(ExportJob {
                id: r.get(0)?,
                album_id: r.get(1)?,
                kind: r.get(2)?,
                status: r.get(3)?,
                file_path: r.get(4)?,
                error: r.get(5)?,
                created_at: r.get(6)?,
            })
        },
    )
    .map_err(|e| format!("export job not found: {e}"))
}

/// `exports:create` parity — persist the queued job with the same `settings`
/// JSON Electron writes. NOTE: the Electron handler fires `runExport()` in the
/// background; the native runner that completes the job is the Phase 5 export
/// engine (`core/export.rs`), so rows stay `queued` until then.
pub fn create_export_job(
    conn: &Connection,
    album_id: &str,
    input: &ExportCreateInput,
) -> Result<ExportJob, String> {
    let id = new_id();
    let settings = serde_json::json!({
        "dpi": input.dpi,
        "bleedMm": input.bleed_mm,
        "colorMode": input.color_mode.clone().unwrap_or_else(|| "rgb".into()),
        "presetId": input.preset_id,
    });
    conn.execute(
        "INSERT INTO exports (id, album_id, kind, status, settings, created_at) VALUES (?1, ?2, ?3, 'queued', ?4, ?5)",
        params![id, album_id, input.kind, settings.to_string(), now()],
    )
    .map_err(|e| e.to_string())?;
    export_job_by_id(conn, &id)
}

/// `exports:get` parity.
pub fn get_export_job(conn: &Connection, id: &str) -> Result<ExportJob, String> {
    export_job_by_id(conn, id)
}

/// Raw `settings` JSON of an export job (the Phase 5 runner reads dpi/bleed/
/// colorMode from it without re-deriving the Electron handler's shape).
pub fn export_job_settings(conn: &Connection, id: &str) -> Result<Option<Value>, String> {
    let raw: Option<String> = conn
        .query_row("SELECT settings FROM exports WHERE id = ?", params![id], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    Ok(raw.and_then(|s| serde_json::from_str(&s).ok()))
}

/// Phase 5 runner status write-back: `completed(file_path)` / `failed(error)`.
pub fn update_export_job(
    conn: &Connection,
    id: &str,
    status: &str,
    file_path: Option<&str>,
    error: Option<&str>,
) -> Result<(), String> {
    conn.execute(
        "UPDATE exports SET status = ?1, file_path = ?2, error = ?3 WHERE id = ?4",
        params![status, file_path, error, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/* ---------- Album generation persistence (Phase 4 item 3) ---------- */

/// A composed page produced by the engine (`PageDef` in `engine/types.ts`).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedPage {
    pub layout_key: String,
    pub elements: Vec<GeneratedElement>,
}

/// An engine element (`ElementDef`) — no id; ids are minted on insert, exactly
/// like `persistAlbum` in `src/main/generate.ts`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedElement {
    #[serde(rename = "type")]
    pub el_type: String,
    pub z: i64,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub rotation: f64,
    pub photo_id: Option<String>,
    pub crop: Option<Value>,
    pub text: Option<Value>,
    pub style: Option<Value>,
}

/// `albums:saveGenerated` input — one generated variation to persist. Mirrors
/// the `persistAlbum(db, projectId, templateId, name, pageSize, variation,
/// result, background, pattern)` call the Electron main process makes.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumPersistInput {
    pub project_id: String,
    pub template_id: String,
    pub name: String,
    pub page_size: PageSize,
    pub variation: i64,
    pub background: Option<String>,
    pub pattern: Option<String>,
    pub pages: Vec<GeneratedPage>,
}

/// Persist one engine result as an album (`status = 'generated'`) — parity
/// with `persistAlbum`. Returns the hydrated album.
pub fn save_generated(
    conn: &Connection,
    input: &AlbumPersistInput,
) -> Result<Album, String> {
    let album_id = new_id();
    let page_count = input.pages.len() as i64;
    conn.execute(
        "INSERT INTO albums (id, project_id, template_id, name, page_size, page_count, variation_number, status, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'generated', ?8)",
        params![
            album_id,
            input.project_id,
            input.template_id,
            input.name,
            serde_json::to_string(&input.page_size).map_err(|e| e.to_string())?,
            page_count,
            input.variation,
            now()
        ],
    )
    .map_err(|e| e.to_string())?;

    let background = input
        .background
        .clone()
        .unwrap_or_else(|| "#ffffff".into());
    let page_bg = serde_json::json!({ "color": background, "pattern": input.pattern }).to_string();
    for (i, page) in input.pages.iter().enumerate() {
        let page_id = new_id();
        conn.execute(
            "INSERT INTO album_pages (id, album_id, idx, layout_key, background) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![page_id, album_id, i as i64, page.layout_key, page_bg],
        )
        .map_err(|e| e.to_string())?;
        for el in page.elements.iter() {
            insert_element(
                conn,
                &album_id,
                &page_id,
                &AlbumElement {
                    id: new_id(),
                    el_type: el.el_type.clone(),
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
                },
            )?;
        }
    }
    album_by_id(conn, &album_id)
}

/* ---------- tests ---------- */

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::db::open_db;

    fn conn() -> Connection {
        let dir = std::env::temp_dir().join(format!("af-library-test-{}", new_id()));
        std::fs::create_dir_all(&dir).unwrap();
        let db_path = dir.join("test.db");
        open_db(&db_path).unwrap()
    }

    fn seed_album(conn: &Connection, project_id: &str) -> String {
        let id = new_id();
        conn.execute(
            "INSERT INTO albums (id, project_id, template_id, name, page_size, page_count, variation_number, status, created_at) \
             VALUES (?1, ?2, NULL, ?3, '{\"width\":12,\"height\":18,\"unit\":\"in\"}', 0, 1, 'draft', ?4)",
            params![id, project_id, "Test", now()],
        )
        .unwrap();
        id
    }

    #[test]
    fn segments_by_time_gap() {
        let rows = vec![
            (String::from("a"), Some(String::from("2026-08-01T10:00:00Z"))),
            (String::from("b"), Some(String::from("2026-08-01T10:30:00Z"))),
            // 3h later → new segment
            (String::from("c"), Some(String::from("2026-08-01T13:30:00Z"))),
        ];
        let segs = segment_by_time(&rows, 2700.0);
        assert_eq!(segs.len(), 2);
        assert_eq!(segs[0], vec!["a".to_string(), "b".to_string()]);
        assert_eq!(segs[1], vec!["c".to_string()]);
    }

    #[test]
    fn auto_group_creates_and_lists() {
        let conn = conn();
        let project = new_id();
        let id1 = new_id();
        let id2 = new_id();
        conn.execute(
            "INSERT INTO photos (id, project_id, filename, processing_status, selected, exif_timestamp, created_at) \
             VALUES (?1, ?2, 'a.jpg', 'ready', 0, '2026-08-01T10:00:00Z', ?3)",
            params![id1, project, now()],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO photos (id, project_id, filename, processing_status, selected, exif_timestamp, created_at) \
             VALUES (?1, ?2, 'b.jpg', 'ready', 0, '2026-08-01T11:00:00Z', ?3)",
            params![id2, project, now()],
        )
        .unwrap();

        let groups = auto_group(&conn, &project).unwrap();
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].photo_count, 2);
        assert_eq!(groups[0].name, "Group 1");

        let renamed = {
            rename_group(&conn, &groups[0].id, "Ceremony").unwrap();
            list_groups(&conn, &project).unwrap()
        };
        assert_eq!(renamed[0].name, "Ceremony");

        clear_groups(&conn, &project).unwrap();
        assert!(list_groups(&conn, &project).unwrap().is_empty());
    }

    #[test]
    fn album_page_roundtrip_and_snapshot() {
        let conn = conn();
        let project = new_id();
        let album = seed_album(&conn, &project);

        let page = add_page(&conn, &album).unwrap();
        assert_eq!(page.elements.len(), 0);
        assert_eq!(page.index, 0);

        let mut el = PageElementInput {
            id: Some(String::from("el-1")),
            el_type: String::from("image"),
            z: Some(0),
            x: 0.1,
            y: 0.2,
            width: 0.5,
            height: 0.6,
            rotation: 0.0,
            photo_id: Some(String::from("ph-1")),
            crop: None,
            text: None,
            style: None,
        };
        el.text = Some(serde_json::json!({ "content": "hi" }));
        let update = PageUpdate {
            layout_key: Some(String::from("full_bleed")),
            background: Some(serde_json::json!({ "color": "#fff" })),
            elements: Some(vec![el]),
        };
        let saved = save_page(&conn, &album, &page.id, &update).unwrap();
        assert_eq!(saved.layout_key.as_deref(), Some("full_bleed"));
        assert!(!saved.is_spread);
        assert_eq!(saved.elements.len(), 1);
        assert_eq!(saved.elements[0].id, "el-1"); // client id kept stable

        let ver = snapshot(&conn, &album).unwrap();
        assert_eq!(ver.version_number, 1);
        let dup = duplicate_page(&conn, &album, &page.id).unwrap();
        assert_eq!(dup.index, 1);
        assert_eq!(dup.elements.len(), 1);

        delete_page(&conn, &album, &page.id).unwrap();
        let restored = restore_version(&conn, &album, &ver.id).unwrap();
        assert_eq!(restored.len(), 1);
        assert_eq!(restored[0].elements[0].text.as_ref().unwrap()["content"], "hi");
    }
}
