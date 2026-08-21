/** SQLite (WASM via sql.js) storage for the mobile app. Persisted to the app sandbox. */
import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { Directory, Filesystem } from "@capacitor/filesystem";

let SQL: any = null;
let db: any = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, client_name TEXT, event_date TEXT,
  status TEXT NOT NULL DEFAULT 'active', thumbnail_photo_id TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, file_path TEXT NOT NULL, filename TEXT NOT NULL,
  width INTEGER, height INTEGER, orientation TEXT, file_size INTEGER, mime_type TEXT,
  exif_timestamp TEXT, quality_score REAL, blur_score REAL, face_count INTEGER DEFAULT 0,
  phash TEXT, processing_status TEXT NOT NULL DEFAULT 'ready', selected INTEGER NOT NULL DEFAULT 0,
  group_id TEXT, thumbnail_path TEXT, preview_path TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_photos_project ON photos(project_id);
CREATE TABLE IF NOT EXISTS photo_groups (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY, key TEXT NOT NULL UNIQUE, name TEXT NOT NULL, description TEXT,
  style TEXT, is_system INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS template_layouts (
  id TEXT PRIMARY KEY, template_id TEXT NOT NULL, key TEXT NOT NULL, name TEXT NOT NULL,
  slots TEXT NOT NULL, weight REAL NOT NULL DEFAULT 1, min_photos INTEGER NOT NULL DEFAULT 1,
  max_photos INTEGER NOT NULL DEFAULT 9, sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS albums (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, template_id TEXT, name TEXT NOT NULL,
  page_size TEXT NOT NULL, page_count INTEGER NOT NULL DEFAULT 0,
  variation_number INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'draft', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS album_versions (
  id TEXT PRIMARY KEY, album_id TEXT NOT NULL, version_number INTEGER NOT NULL,
  layout_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS album_pages (
  id TEXT PRIMARY KEY, album_id TEXT NOT NULL, idx INTEGER NOT NULL, layout_key TEXT, background TEXT
);
CREATE TABLE IF NOT EXISTS album_elements (
  id TEXT PRIMARY KEY, album_id TEXT NOT NULL, page_id TEXT NOT NULL, type TEXT NOT NULL,
  z INTEGER NOT NULL DEFAULT 0, x REAL NOT NULL DEFAULT 0, y REAL NOT NULL DEFAULT 0,
  width REAL NOT NULL DEFAULT 1, height REAL NOT NULL DEFAULT 1, rotation REAL NOT NULL DEFAULT 0,
  photo_id TEXT, crop TEXT, text TEXT, style TEXT
);
CREATE TABLE IF NOT EXISTS exports (
  id TEXT PRIMARY KEY, album_id TEXT NOT NULL, kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued', file_path TEXT, settings TEXT, error TEXT, created_at TEXT NOT NULL
);
`;

export async function initDb(): Promise<void> {
  if (db) return;
  SQL = await initSqlJs({ locateFile: () => wasmUrl });
  let loaded: Uint8Array | null = null;
  try {
    const res = await Filesystem.readFile({ path: "albumforge.sqlite", directory: Directory.Data });
    loaded = base64ToBytes(res.data as string);
  } catch {
    /* fresh database */
  }
  db = loaded ? new SQL.Database(loaded) : new SQL.Database();
  db.run(SCHEMA);
  try {
    db.run("ALTER TABLE projects ADD COLUMN thumbnail_photo_id TEXT");
  } catch {
    /* already present */
  }
}

export function getDb(): any {
  return db;
}

export function newId(): string {
  return crypto.randomUUID();
}

export function now(): string {
  return new Date().toISOString();
}

export function all(sql: string, params: any[] = []): any[] {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows: any[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

export function get(sql: string, params: any[] = []): any {
  const rows = all(sql, params);
  return rows[0] ?? null;
}

export function run(sql: string, params: any[] = []): void {
  db.run(sql, params);
}

export async function persistDb(): Promise<void> {
  await Filesystem.writeFile({
    path: "albumforge.sqlite",
    data: bytesToBase64(db.export()),
    directory: Directory.Data,
  });
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as unknown as number[]);
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function writeDataFile(path: string, data: string): Promise<void> {
  await Filesystem.writeFile({ path, data, directory: Directory.Data, recursive: true });
}

export async function readDataFile(path: string): Promise<string | null> {
  try {
    const res = await Filesystem.readFile({ path, directory: Directory.Data });
    return res.data as string;
  } catch {
    return null;
  }
}
