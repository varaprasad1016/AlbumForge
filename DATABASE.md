# AlbumForge — Database

A single embedded **SQLite** database (better-sqlite3) stored at
`%APPDATA%/AlbumForge/albumforge.db`, in WAL mode. No server, no network.

All IDs are UUIDs (TEXT). Timestamps are ISO-8601 strings. Flexible blobs (page size,
element crop/text/style, template style/slots, version snapshots) are stored as JSON TEXT.

## Tables

### projects
`id`, `name`, `client_name`, `event_date`, `status`, `created_at`.

### photos
One row per imported original. Stores the **absolute path** (`file_path`) plus analysis
results and generated asset paths.

`id`, `project_id`, `file_path`, `filename`, `width`, `height`, `orientation`,
`file_size`, `mime_type`, `exif_timestamp` (EXIF `DateTimeOriginal`, falling back to file
mtime), `quality_score`,
`blur_score`, `face_count`, `phash` (64-bit dHash as decimal TEXT), `processing_status`
(`ready`/`failed`), `selected` (0/1), `group_id`, `thumbnail_path`, `preview_path`,
`created_at`.

Index: `(project_id)`.

### photo_groups
Assistive grouping. `id`, `project_id`, `name`, `color`, `sort_order`, `created_at`.

### templates
Template families (5 seeded system templates). `id`, `key` (unique), `name`,
`description`, `style` (JSON: margin/gutter/safeArea/chronological), `is_system`.

### template_layouts
Layouts belonging to a family. `id`, `template_id`, `key`, `name`, `slots` (JSON array of
normalized slot rects + orientation hints), `weight`, `min_photos`, `max_photos`,
`sort_order`.

### albums
`id`, `project_id`, `template_id`, `name`, `page_size` (JSON `{width,height,unit}`),
`page_count`, `variation_number`, `status`, `created_at`.

### album_versions
Immutable snapshots. `id`, `album_id`, `version_number`, `layout_json` (JSON of the full
pages+elements tree), `created_at`.

### album_pages
`id`, `album_id`, `idx`, `layout_key`, `background` (JSON). Index: `(album_id)`.

### album_elements
`id`, `album_id`, `page_id`, `type` (`image`/`text`/`background`), `z`, `x`, `y`, `width`,
`height` (all normalized 0..1), `rotation`, `photo_id`, `crop` (JSON `{x,y,width,height}`
normalized to source), `text` (JSON), `style` (JSON). Index: `(page_id)`.

### album_generation_jobs
`id`, `project_id`, `album_id`, `config` (JSON), `status`, `stage`, `progress`, `error`,
`created_at`. (Generation is fast and currently runs inline; the table remains for future
background work.)

### exports
`id`, `album_id`, `kind` (`preview_pdf`/`highres_pdf`), `status`, `file_path`, `settings`
(JSON), `error`, `created_at`.

## Conventions

- Never store photo bytes in the DB — store paths; originals stay where the user put them.
- Normalized coordinates everywhere in `album_elements` (0..1), so export is resolution-
  independent.
- `phash` is a 64-bit value serialized as a decimal string and compared with Hamming
  distance (via BigInt) for duplicate detection and diversity selection.
