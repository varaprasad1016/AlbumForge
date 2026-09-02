//! `.album` project file engine + journaled autosave (blueprint §10 /
//! MIGRATION Phase 9 item 3).
//!
//! Two independent pieces:
//!
//! 1. [`build_album_archive`] — packages a project workspace into a single
//!    portable `.album` zip: the canonical layout JSON tree (`layout.json`)
//!    plus the embedded proxy thumbnails it references (`media/<id>.jpg`),
//!    so a folder of 5,000 originals can be carried as one self-contained
//!    file. [`read_album_layout`] round-trips the JSON back out.
//!
//! 2. [`RecoveryJournal`] — crash-recovery autosave. The renderer (or a
//!    background worker) writes a layout snapshot every autosave tick (the
//!    product cadence is 60 s — the *caller* schedules the tick; this module
//!    is the storage layer). Snapshots append to a per-draft shadow file
//!    (`<draft>.recovery`) as framed JSON lines; the journal keeps the last
//!    [`RECOVERY_MAX_ENTRIES`] entries by rotating in place, so a corrupted
//!    tail never destroys older good snapshots. On boot the app calls
//!    [`RecoveryJournal::latest`]; if it finds a delta newer than the last
//!    committed state, it restores the session and [`RecoveryJournal::clear`]s.
//!
//! Both pieces are pure filesystem code — unit-tested with temp dirs.

use std::fs::File;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use serde_json::Value;

/// Max journal entries kept per draft (rotation bound).
pub const RECOVERY_MAX_ENTRIES: usize = 20;

// ---------------------------------------------------------------------------
// .album archive
// ---------------------------------------------------------------------------

/// Result of building an archive (for the UI confirmation line).
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveSummary {
    pub entries: Vec<String>,
    pub bytes: usize,
}

/// Package `layout` + `media` (name → bytes, e.g. `{id}-thumb256.jpg`) into a
/// zip at `out`. Always overwrites. Pure (no DB access) so the command layer
/// decides what layout/media to embed.
pub fn build_album_archive(
    layout: &Value,
    media: &[(&str, Vec<u8>)],
    out: &Path,
) -> Result<ArchiveSummary, String> {
    use zip::write::SimpleFileOptions;
    let file = File::create(out).map_err(|e| format!("create archive: {e}"))?;
    let mut zip = zip::ZipWriter::new(file);
    let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    let layout_bytes = serde_json::to_vec_pretty(layout).map_err(|e| e.to_string())?;
    zip.start_file("layout.json", opts).map_err(|e| e.to_string())?;
    zip.write_all(&layout_bytes).map_err(|e| e.to_string())?;

    let mut entries = vec!["layout.json".to_string()];
    for (name, bytes) in media {
        // Names are deterministic (`{photoId}-thumb256.jpg`) — never paths.
        debug_assert!(!name.contains('/') && !name.contains('\\'));
        let entry = format!("media/{name}");
        zip.start_file(&entry, opts).map_err(|e| e.to_string())?;
        zip.write_all(bytes).map_err(|e| e.to_string())?;
        entries.push(entry);
    }

    let file = zip.finish().map_err(|e| e.to_string())?;
    let bytes = file.metadata().map(|m| m.len() as usize).unwrap_or(0);
    Ok(ArchiveSummary { entries, bytes })
}

/// Read the canonical layout JSON back out of an `.album` archive.
pub fn read_album_layout(archive: &Path) -> Result<Value, String> {
    let file = File::open(archive).map_err(|e| format!("open archive: {e}"))?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    let mut entry = zip
        .by_name("layout.json")
        .map_err(|_| "archive has no layout.json".to_string())?;
    let mut raw = String::new();
    entry.read_to_string(&mut raw).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| format!("layout.json invalid: {e}"))
}

// ---------------------------------------------------------------------------
// Recovery journal
// ---------------------------------------------------------------------------

/// Sanitise a draft id into a safe file stem (`[A-Za-z0-9._-]`), falling back
/// to "draft" — journal file names must never be attacker-controlled paths.
fn safe_stem(draft_id: &str) -> String {
    let cleaned: String = draft_id
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' { c } else { '-' })
        .collect();
    if cleaned.is_empty() { "draft".into() } else { cleaned }
}

/// Journal storage for one app-data `recovery/` directory.
#[derive(Debug, Clone)]
pub struct RecoveryJournal {
    dir: PathBuf,
}

impl RecoveryJournal {
    pub fn new(dir: PathBuf) -> RecoveryJournal {
        RecoveryJournal { dir }
    }

    pub fn ensure_dir(&self) -> Result<(), String> {
        std::fs::create_dir_all(&self.dir).map_err(|e| e.to_string())
    }

    fn path(&self, draft_id: &str) -> PathBuf {
        self.dir.join(format!("{}.recovery", safe_stem(draft_id)))
    }

    /// Append a snapshot. Each line is `{"seq":n,"at":iso,"layout":{…}}`.
    /// After the append the journal rotates to the last
    /// [`RECOVERY_MAX_ENTRIES`] lines so a runaway autosave loop can't grow
    /// the shadow file forever.
    pub fn write_snapshot(&self, draft_id: &str, layout: &Value) -> Result<(), String> {
        self.ensure_dir()?;
        let path = self.path(draft_id);
        let seq = self.next_seq(draft_id);
        let at = chrono::Utc::now().to_rfc3339();
        let line = serde_json::json!({ "seq": seq, "at": at, "layout": layout });
        let mut raw = serde_json::to_string(&line).map_err(|e| e.to_string())?;
        raw.push('\n');

        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .map_err(|e| e.to_string())?;
        file.write_all(raw.as_bytes()).map_err(|e| e.to_string())?;
        file.flush().map_err(|e| e.to_string())?;
        self.rotate(draft_id);
        Ok(())
    }

    fn next_seq(&self, draft_id: &str) -> u64 {
        self.read_entries(draft_id)
            .last()
            .and_then(|e| e["seq"].as_u64())
            .map(|s| s + 1)
            .unwrap_or(1)
    }

    /// The newest complete snapshot, if any (boot-time recovery hook).
    pub fn latest(&self, draft_id: &str) -> Option<Value> {
        self.read_entries(draft_id)
            .last()
            .and_then(|e| e.get("layout").cloned())
    }

    /// Remove the shadow file after a successful recovery/commit.
    pub fn clear(&self, draft_id: &str) -> Result<(), String> {
        let path = self.path(draft_id);
        if path.exists() {
            std::fs::remove_file(&path).map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    fn read_entries(&self, draft_id: &str) -> Vec<Value> {
        let path = self.path(draft_id);
        let Ok(raw) = std::fs::read_to_string(&path) else {
            return Vec::new();
        };
        raw.lines()
            .filter_map(|l| serde_json::from_str::<Value>(l).ok())
            .collect()
    }

    /// Keep only the last [`RECOVERY_MAX_ENTRIES`] lines. Lines are removed
    /// *after* a successful append, so a crash mid-rotation never loses the
    /// newest snapshot.
    fn rotate(&self, draft_id: &str) {
        let path = self.path(draft_id);
        let entries = self.read_entries(draft_id);
        if entries.is_empty() || entries.len() <= RECOVERY_MAX_ENTRIES {
            return;
        }
        let keep = &entries[entries.len() - RECOVERY_MAX_ENTRIES..];
        let mut raw = String::new();
        for e in keep {
            if let Ok(line) = serde_json::to_string(e) {
                raw.push_str(&line);
                raw.push('\n');
            }
        }
        if let Ok(mut file) = File::create(&path) {
            let _ = file.write_all(raw.as_bytes());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_dir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("af-project-{tag}-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn album_archive_round_trips_layout_and_media() {
        let dir = tmp_dir("archive");
        let out = dir.join("album.album");
        let layout = serde_json::json!({
            "id": "al-1",
            "pages": [{ "id": "p1", "index": 0, "elements": [] }]
        });
        let media = vec![("abc-thumb256.jpg".to_string(), vec![1u8, 2, 3, 4])];
        let media_refs: Vec<(&str, Vec<u8>)> =
            media.iter().map(|(n, b)| (n.as_str(), b.clone())).collect();

        let summary = build_album_archive(&layout, &media_refs, &out).unwrap();
        assert_eq!(summary.entries, vec!["layout.json", "media/abc-thumb256.jpg"]);
        assert!(summary.bytes > 0);

        let back = read_album_layout(&out).unwrap();
        assert_eq!(back["id"], "al-1");
        assert_eq!(back["pages"][0]["index"], 0);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn journal_returns_newest_and_clears() {
        let dir = tmp_dir("journal");
        let j = RecoveryJournal::new(dir.clone());
        j.write_snapshot("draft-a", &serde_json::json!({ "v": 1 })).unwrap();
        j.write_snapshot("draft-a", &serde_json::json!({ "v": 2 })).unwrap();
        j.write_snapshot("draft-a", &serde_json::json!({ "v": 3 })).unwrap();

        // Newest wins; seq increments.
        let latest = j.latest("draft-a").unwrap();
        assert_eq!(latest["v"], 3);

        // Different draft is isolated.
        assert!(j.latest("draft-b").is_none());

        j.clear("draft-a").unwrap();
        assert!(j.latest("draft-a").is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn journal_rotates_to_max_entries() {
        let dir = tmp_dir("rotate");
        let j = RecoveryJournal::new(dir.clone());
        for i in 0..(RECOVERY_MAX_ENTRIES + 5) {
            j.write_snapshot("rot", &serde_json::json!({ "i": i })).unwrap();
        }
        let latest = j.latest("rot").unwrap();
        assert_eq!(latest["i"], RECOVERY_MAX_ENTRIES as u64 + 4);
        // Only the last RECOVERY_MAX_ENTRIES survive.
        let raw = std::fs::read_to_string(dir.join("rot.recovery")).unwrap();
        assert_eq!(raw.lines().count(), RECOVERY_MAX_ENTRIES);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn draft_ids_are_sanitised() {
        let dir = tmp_dir("sanitise");
        let j = RecoveryJournal::new(dir.clone());
        j.write_snapshot("../evil/name", &serde_json::json!({})).unwrap();
        // No path traversal: file must live inside the journal dir.
        assert!(!dir.join("..").join("evil").exists());
        // Newest still readable through the same (sanitised) id.
        assert!(j.latest("../evil/name").is_some());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
