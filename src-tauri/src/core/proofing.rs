//! Local client proofing (Phase 4) — port of Electron's `src/main/proofing.ts`.
//!
//! No server involved: the photographer exports a self-contained folder
//! (thumbnails + `index.html`), the client marks favourites/comments in any
//! browser, sends back a single `feedback.json`, and the app imports it.
//!
//! `PROOF_HTML` is byte-identical to the Electron template so the exported
//! gallery behaves exactly the same in both shells.

use std::path::Path;

use rusqlite::{params, Connection};
use serde::Serialize;
use serde_json::Value;

use crate::core::db::{new_id, now};

const PROOF_HTML: &str = r#"<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Album proof — AlbumForge</title>
<style>
  body { font-family: system-ui, sans-serif; background: #f1f5f9; margin: 0; padding: 16px; color: #0f172a; }
  .bar { position: sticky; top: 0; background: #ffffff; border-radius: 12px; padding: 12px 16px;
         display: flex; align-items: center; gap: 12px; margin-bottom: 16px; box-shadow: 0 1px 4px rgba(15,23,42,.08); }
  .bar h1 { font-size: 16px; margin: 0; flex: 1; }
  button { font-family: inherit; font-size: 13px; font-weight: 600; border: 1px solid #cbd5e1; background: #fff;
           padding: 8px 14px; border-radius: 8px; cursor: pointer; }
  button.primary { background: #6366f1; border-color: #6366f1; color: #fff; }
  button:hover { opacity: .9; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 12px; }
  .cell { background: #fff; border-radius: 12px; overflow: hidden; border: 2px solid transparent; transition: border-color .15s; }
  .cell.fav { border-color: #6366f1; }
  .cell img { width: 100%; height: 210px; object-fit: cover; display: block; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 8px; }
  .name { font-size: 11px; color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .star { background: none; border: none; font-size: 20px; cursor: pointer; color: #cbd5e1; padding: 0 4px; }
  .cell.fav .star { color: #f59e0b; }
  .note { font-size: 11px; color: #6366f1; white-space: nowrap; }
  .count { font-size: 12px; color: #64748b; }
</style>
</head>
<body>
  <div class="bar">
    <h1>Album proof</h1>
    <span class="count" id="count"></span>
    <button id="save" class="primary">Download feedback</button>
  </div>
  <div class="grid" id="grid"></div>
<script>
  var PHOTOS = __PHOTOS__;
  var favs = new Set();
  var comments = {};
  var grid = document.getElementById('grid');
  var count = document.getElementById('count');

  function update() {
    count.textContent = favs.size + ' selected';
    document.querySelectorAll('.cell').forEach(function (c) {
      c.classList.toggle('fav', favs.has(c.dataset.id));
      var n = c.querySelector('.note');
      n.textContent = comments[c.dataset.id] ? 'Noted' : '';
    });
  }

  PHOTOS.forEach(function (p, i) {
    var cell = document.createElement('div');
    cell.className = 'cell';
    cell.dataset.id = p.id;
    cell.innerHTML =
      '<img src="photos/' + p.file + '" loading="lazy">' +
      '<div class="row">' +
        '<span class="name">' + (i + 1) + '. ' + p.name + '</span>' +
        '<span class="note"></span>' +
        '<button class="star" title="Select this photo">&#9734;</button>' +
        '<button class="cmt" title="Leave a comment">&#9998;</button>' +
      '</div>';
    cell.querySelector('.star').onclick = function () {
      if (favs.has(p.id)) favs.delete(p.id); else favs.add(p.id);
      update();
    };
    cell.querySelector('.cmt').onclick = function () {
      var v = prompt('Comment for photo ' + (i + 1) + ':', comments[p.id] || '');
      if (v === null) return;
      if (v.trim()) comments[p.id] = v.trim(); else delete comments[p.id];
      update();
    };
    grid.appendChild(cell);
  });
  update();

  document.getElementById('save').onclick = function () {
    var data = { generatedBy: 'AlbumForge', favorites: Array.from(favs), comments: comments };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'feedback.json';
    a.click();
  };
</script>
</body>
</html>"#;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProofResult {
    pub dir: String,
    pub photos: usize,
}

/// Photos used by an album, in element order — the gallery + feedback target.
fn album_photo_rows(
    conn: &Connection,
    album_id: &str,
) -> Result<Vec<(String, String, Option<String>)>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT DISTINCT e.photo_id, p.filename, p.thumbnail_path
             FROM album_elements e
             JOIN photos p ON p.id = e.photo_id
             WHERE e.album_id = ? AND e.type = 'image' AND e.photo_id IS NOT NULL
             ORDER BY e.z",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![album_id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, Option<String>>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

/// Resolve a photo's thumbnail for copying. The DB row's `thumbnail_path` is
/// authoritative, but rows adopted from a legacy Electron library can point at
/// a cache dir that no longer exists — fall back to the deterministic native
/// cache file (`{cache_dir}/{id}-thumb256.jpg`), the same resolution the media
/// seam (`mediaUrl`) uses so grids and proofs agree.
fn resolve_thumbnail(
    photo_id: &str,
    stored: Option<&str>,
    cache_dir: &Path,
) -> Option<std::path::PathBuf> {
    if let Some(p) = stored {
        let pb = std::path::PathBuf::from(p);
        if pb.is_file() {
            return Some(pb);
        }
    }
    let deterministic = cache_dir.join(format!("{photo_id}-thumb256.jpg"));
    deterministic.is_file().then_some(deterministic)
}

/// `proofs:build` parity — copy each album photo's thumbnail into
/// `targetDir/photos` (missing thumbs skipped) and write the self-contained
/// gallery HTML.
pub fn build_proof_gallery(
    conn: &Connection,
    album_id: &str,
    target_dir: &str,
    cache_dir: &Path,
) -> Result<ProofResult, String> {
    let rows = album_photo_rows(conn, album_id)?;
    let photos_dir = Path::new(target_dir).join("photos");
    std::fs::create_dir_all(&photos_dir).map_err(|e| format!("create photos dir: {e}"))?;

    let mut items: Vec<serde_json::Map<String, Value>> = Vec::new();
    for (i, (photo_id, filename, thumb)) in rows.iter().enumerate() {
        // `get` guards UTF-8 boundaries (ids are ASCII uuids in practice).
        let short = photo_id.get(..photo_id.len().min(8)).unwrap_or(photo_id);
        let safe = format!("{:04}-{short}.jpg", i + 1);
        if let Some(src) = resolve_thumbnail(photo_id, thumb.as_deref(), cache_dir) {
            let _ = std::fs::copy(src, photos_dir.join(&safe));
        }
        let mut item = serde_json::Map::new();
        item.insert("id".into(), Value::String(photo_id.clone()));
        item.insert("name".into(), Value::String(filename.clone()));
        item.insert("file".into(), Value::String(safe));
        items.push(item);
    }

    let html = PROOF_HTML.replace("__PHOTOS__", &serde_json::to_string(&items).unwrap_or_default());
    std::fs::write(Path::new(target_dir).join("index.html"), html)
        .map_err(|e| format!("write index.html: {e}"))?;
    Ok(ProofResult {
        dir: target_dir.to_string(),
        photos: items.len(),
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackResult {
    pub favorited: usize,
    pub commented: usize,
}

/// `proofs:importFeedback` parity — mark `favorites` selected and upsert
/// `comments` into `photo_notes`, scoped to the project's photos.
pub fn import_feedback(
    conn: &Connection,
    project_id: &str,
    file_path: &str,
) -> Result<FeedbackResult, String> {
    let raw = std::fs::read_to_string(file_path).map_err(|e| format!("read feedback: {e}"))?;
    let data: Value = serde_json::from_str(&raw).map_err(|e| format!("feedback json: {e}"))?;

    let mut favorited = 0usize;
    if let Some(favs) = data.get("favorites").and_then(|v| v.as_array()) {
        let mut stmt = conn
            .prepare("UPDATE photos SET selected = 1 WHERE id = ? AND project_id = ?")
            .map_err(|e| e.to_string())?;
        for f in favs {
            if let Some(id) = f.as_str() {
                let changed = stmt
                    .execute(params![id, project_id])
                    .map_err(|e| e.to_string())?;
                favorited += changed;
            }
        }
    }

    let mut commented = 0usize;
    if let Some(comments) = data.get("comments").and_then(|v| v.as_object()) {
        let mut upsert = conn
            .prepare(
                "INSERT INTO photo_notes (id, photo_id, comment, created_at) VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(photo_id) DO UPDATE SET comment = excluded.comment",
            )
            .map_err(|e| e.to_string())?;
        for (photo_id, comment) in comments {
            let Some(comment) = comment.as_str() else {
                continue;
            };
            let trimmed = comment.trim();
            if trimmed.is_empty() {
                continue;
            }
            upsert
                .execute(params![new_id(), photo_id, trimmed, now()])
                .map_err(|e| e.to_string())?;
            commented += 1;
        }
    }
    Ok(FeedbackResult {
        favorited,
        commented,
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhotoNote {
    pub photo_id: String,
    pub filename: String,
    pub comment: String,
}

/// `proofs:notes` parity — project photo comments, newest first.
pub fn photo_notes(conn: &Connection, project_id: &str) -> Result<Vec<PhotoNote>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT n.photo_id, p.filename, n.comment
             FROM photo_notes n JOIN photos p ON p.id = n.photo_id
             WHERE p.project_id = ? ORDER BY n.created_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project_id], |r| {
            Ok(PhotoNote {
                photo_id: r.get(0)?,
                filename: r.get(1)?,
                comment: r.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::db::open_db;

    #[test]
    fn imports_feedback_marks_and_comments() {
        let dir = std::env::temp_dir().join(format!("af-proofing-{}", new_id()));
        std::fs::create_dir_all(&dir).unwrap();
        let db_path = dir.join("test.db");
        let conn = open_db(&db_path).unwrap();
        let project = new_id();
        let photo = new_id();
        conn.execute(
            "INSERT INTO photos (id, project_id, filename, processing_status, selected, created_at) \
             VALUES (?1, ?2, 'a.jpg', 'ready', 0, ?3)",
            params![photo, project, now()],
        )
        .unwrap();
        let feedback = dir.join("feedback.json");
        std::fs::write(
            &feedback,
            format!(r#"{{ "favorites": ["{photo}"], "comments": {{ "{photo}": "  Use this one!  " }} }}"#),
        )
        .unwrap();
        let res = import_feedback(&conn, &project, feedback.to_str().unwrap()).unwrap();
        assert_eq!(res.favorited, 1);
        assert_eq!(res.commented, 1);
        let selected: i64 = conn
            .query_row("SELECT selected FROM photos WHERE id = ?", params![photo], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(selected, 1);
        let notes = photo_notes(&conn, &project).unwrap();
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].comment, "Use this one!");
    }
}
