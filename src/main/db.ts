/** Local SQLite storage (better-sqlite3). All data stays on the user's machine. */
import Database from "better-sqlite3";
import { randomUUID } from "crypto";

export type DB = Database.Database;

export function newId(): string {
  return randomUUID();
}

export function now(): string {
  return new Date().toISOString();
}

const SCHEMA = `
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
`;

export function initDatabase(dbPath: string): DB {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

function migrate(db: DB): void {
  const cols = db.prepare("PRAGMA table_info(projects)").all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === "thumbnail_photo_id")) {
    db.exec("ALTER TABLE projects ADD COLUMN thumbnail_photo_id TEXT");
  }
  const photoCols = db.prepare("PRAGMA table_info(photos)").all() as Array<{ name: string }>;
  if (!photoCols.some((c) => c.name === "latitude")) {
    db.exec("ALTER TABLE photos ADD COLUMN latitude REAL");
  }
  if (!photoCols.some((c) => c.name === "longitude")) {
    db.exec("ALTER TABLE photos ADD COLUMN longitude REAL");
  }
}
