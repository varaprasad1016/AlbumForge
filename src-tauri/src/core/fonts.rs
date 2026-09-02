//! Font registry (Phase 4) — port of Electron's `src/main/fonts.ts`.
//!
//! Pure directory scan: bundled fonts (`$RESOURCE/fonts`, shipped via
//! `bundle.resources` in `tauri.conf.json`) + user-added fonts
//! (`data_dir/fonts`), `.ttf` only, family = filename minus extension,
//! first-seen wins across dirs, sorted case-insensitively. The Electron shell
//! additionally serves the files to the renderer over `font://`; the native
//! equivalent (a scoped asset URL seam) is tracked in MIGRATION.md Phase 4 —
//! listing works now, rendering lands with the seam.

use std::path::Path;

/// Font families available on disk (parity with `listFonts()`).
pub fn list_fonts(font_dirs: &[&Path]) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for dir in font_dirs {
        if !dir.is_dir() {
            continue;
        }
        let Ok(entries) = std::fs::read_dir(dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            let lower = name.to_lowercase();
            if !lower.ends_with(".ttf") {
                continue;
            }
            let family = name[..name.len() - 4].to_string();
            if seen.insert(family.clone()) {
                out.push(family);
            }
        }
    }
    out.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_ttf_families_only() {
        let dir = std::env::temp_dir().join(format!("af-fonts-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("Abril Fatface.ttf"), b"x").unwrap();
        std::fs::write(dir.join("notes.txt"), b"x").unwrap();
        std::fs::write(dir.join("cardo.otf"), b"x").unwrap();
        let dirs = [dir.as_path()];
        assert_eq!(list_fonts(&dirs), vec!["Abril Fatface".to_string()]);
    }
}
