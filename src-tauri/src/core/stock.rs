//! Module 7 — external stock asset search & ingestion (native port of
//! `src/main/stock.ts`).
//!
//! All HTTP runs here with reqwest — the renderer never holds provider keys
//! and never does CORS-prone fetches. Keys come from the process environment
//! or the OS keychain (`core/secrets.rs`); the *non-secret* provider choice is
//! the only thing persisted near the app data (a small JSON file, mirroring
//! Electron's `stock-config.json` minus its key fields).
//!
//! Search results cache in `stock_search_cache` (7-day TTL parity) and
//! downloads in `cache/stock/` + the `stock_assets` table, so albums stay
//! self-contained and export offline. Vector SVGs are stored verbatim; the
//! recolourable parse (`parseSvg`) is pure TS in `src/shared/stockParse.ts`
//! and runs in the renderer — this module returns the raw SVG text and lets
//! both hosts share one parser.

use std::fs;
use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::Duration;

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::core::db::now;
use crate::core::secrets;

const PIXABAY_ENDPOINT: &str = "https://pixabay.com/api/";
const UNSPLASH_ENDPOINT: &str = "https://api.unsplash.com/search/photos";
const FREEPIK_ENDPOINT: &str = "https://api.freepik.com/v1/resources";
/// Re-hit the provider API weekly per term (Electron `SEARCH_TTL_MS` parity).
const SEARCH_TTL_SECS: i64 = 7 * 24 * 60 * 60;
const RECENT_CAP: usize = 12;

pub const STOCK_PROVIDERS: [&str; 3] = ["pixabay", "freepik", "unsplash"];

fn http() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(60))
            .build()
            .expect("reqwest client")
    })
}

/* ---------- DTOs (mirror src/shared/api.ts, camelCase) ---------- */

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StockSearchResult {
    pub provider_id: String,
    pub provider: String,
    pub title: String,
    pub kind: String,
    pub preview_url: String,
    pub source_url: String,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub author: Option<String>,
    pub is_premium: bool,
    pub attribution_required: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StockDownloadInput {
    pub source_url: String,
    pub preview_url: Option<String>,
    pub title: Option<String>,
    pub kind: Option<String>,
    pub author: Option<String>,
    pub attribution_required: Option<bool>,
    pub width: Option<f64>,
    pub height: Option<f64>,
}

/// Download result *before* the renderer parses vector paths — `svg` carries
/// the raw SVG text for vector assets so the shared `parseSvg` (pure TS) can
/// run in the renderer exactly as it does in Electron's main process.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StockDownloadRaw {
    pub provider_id: String,
    pub kind: String,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub svg: Option<String>,
    pub title: String,
    pub author: Option<String>,
    pub attribution_required: bool,
    pub from_cache: bool,
}

/* ---------- non-secret provider state + recent terms ---------- */

fn stock_config_path(data_dir: &std::path::Path) -> PathBuf {
    data_dir.join("stock-config.json")
}

fn recent_path(cache_dir: &std::path::Path) -> PathBuf {
    cache_dir.join("stock-recent.json")
}

/// Active provider id — `stock-config.json` holds only `{ "provider" }`
/// (Electron also stored keys there; on the native backend keys never touch
/// that file — see `secrets.rs`).
pub fn provider(data_dir: &std::path::Path) -> String {
    let cfg: Value = fs::read_to_string(stock_config_path(data_dir))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(Value::Null);
    match cfg.get("provider").and_then(|v| v.as_str()) {
        Some(p) if STOCK_PROVIDERS.contains(&p) => p.to_string(),
        _ => "pixabay".to_string(),
    }
}

pub fn set_provider(data_dir: &std::path::Path, p: &str) -> bool {
    if !STOCK_PROVIDERS.contains(&p) {
        return false;
    }
    let cfg = serde_json::json!({ "provider": p });
    let write = || -> std::io::Result<()> {
        let path = stock_config_path(data_dir);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(path, serde_json::to_vec(&cfg).unwrap_or_default())
    };
    write().is_ok()
}

/// Whether the *active* provider has a usable key (env or OS keychain).
pub fn configured(data_dir: &std::path::Path) -> bool {
    secrets::stock_api_key(&provider(data_dir)).is_some()
}

/// Save a key for a provider and make it the active one — keychain only
/// (Electron `stock:setApiKey` also flips `provider`; the provider id itself
/// is non-secret and persists in `stock-config.json`).
pub fn set_api_key(data_dir: &std::path::Path, p: &str, key: &str) -> bool {
    if !STOCK_PROVIDERS.contains(&p) || key.trim().is_empty() {
        return false;
    }
    if !secrets::write_stock_key(p, key) {
        return false;
    }
    set_provider(data_dir, p)
}

pub fn recent(cache_dir: &std::path::Path, limit: usize) -> Vec<String> {
    let terms: Vec<String> = fs::read_to_string(recent_path(cache_dir))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    terms.into_iter().take(limit.max(1)).collect()
}

fn remember(cache_dir: &std::path::Path, term: &str) {
    let t = term.trim();
    if t.is_empty() {
        return;
    }
    let mut terms = recent(cache_dir, RECENT_CAP);
    terms.retain(|x| x != t);
    terms.insert(0, t.to_string());
    terms.truncate(RECENT_CAP);
    let path = recent_path(cache_dir);
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::write(path, serde_json::to_vec(&terms).unwrap_or_default());
}

/* ---------- provider response mappers (parity with stock.ts) ---------- */

fn as_f64(v: &Value) -> Option<f64> {
    v.as_f64()
}

/// Freepik `/v1/resources` item → provider-agnostic shape; premium dropped.
fn map_freepik_resource(r: &Value) -> Option<StockSearchResult> {
    let rec = r.as_object()?;
    let kind = match rec.get("type").and_then(|v| v.as_str()) {
        Some("vector" | "icon") => "vector",
        _ => "bitmap",
    };
    let licenses = rec.get("licenses").and_then(|v| v.as_array());
    let lic = licenses
        .and_then(|l| l.first())
        .and_then(|v| v.as_object());
    let premium = rec.get("is_premium").and_then(|v| v.as_bool()).unwrap_or(false)
        || lic
            .and_then(|l| l.get("is_premium"))
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
    if premium {
        return None;
    }
    let image = rec.get("image").and_then(|v| v.as_object());
    let preview = image.and_then(|i| i.get("preview")).and_then(|v| v.as_object());
    let source = image.and_then(|i| i.get("source")).and_then(|v| v.as_object());
    let author = rec.get("author").and_then(|v| v.as_object());
    let id = rec.get("id").map(|v| v.to_string());
    let w = source.and_then(|s| s.get("width")).and_then(as_f64);
    let h = source.and_then(|s| s.get("height")).and_then(as_f64);
    Some(StockSearchResult {
        provider_id: format!("freepik-{}", id.unwrap_or_default()),
        provider: "freepik".into(),
        title: rec
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("Untitled")
            .to_string(),
        kind: kind.into(),
        preview_url: preview
            .and_then(|p| p.get("url"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        source_url: source
            .and_then(|s| s.get("url"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        width: w.filter(|x| x.is_finite()),
        height: h.filter(|x| x.is_finite()),
        author: author.and_then(|a| a.get("name")).and_then(|v| v.as_str()).map(String::from),
        is_premium: false,
        attribution_required: lic
            .and_then(|l| l.get("attribution_required"))
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
    })
}

/// Pixabay `/api/` hit — everything ingests as a bitmap layer (the CDN serves
/// transparent PNGs, no SVG). No attribution required.
fn map_pixabay_hit(h: &Value) -> Option<StockSearchResult> {
    let obj = h.as_object()?;
    if !obj.contains_key("id") {
        return None;
    }
    let tags = obj.get("tags").and_then(|v| v.as_str()).unwrap_or("");
    let title = tags.split(',').next().unwrap_or("").trim();
    Some(StockSearchResult {
        provider_id: format!("pixabay-{}", obj.get("id")?.to_string()),
        provider: "pixabay".into(),
        title: if title.is_empty() { "Untitled".into() } else { title.into() },
        kind: "bitmap".into(),
        preview_url: obj.get("previewURL").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        source_url: obj.get("largeImageURL").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        width: obj.get("imageWidth").and_then(as_f64),
        height: obj.get("imageHeight").and_then(as_f64),
        author: obj.get("user").and_then(|v| v.as_str()).map(String::from),
        is_premium: false,
        attribution_required: false,
    })
}

/// Unsplash search result — raw URL clamped to print-friendly 2400px JPG.
fn map_unsplash_photo(p: &Value) -> Option<StockSearchResult> {
    let obj = p.as_object()?;
    if !obj.contains_key("id") {
        return None;
    }
    let urls = obj.get("urls").and_then(|v| v.as_object());
    let user = obj.get("user").and_then(|v| v.as_object());
    let raw = urls.and_then(|u| u.get("raw")).and_then(|v| v.as_str()).unwrap_or("");
    let source_url = if !raw.is_empty() {
        let sep = if raw.contains('?') { "&" } else { "?" };
        format!("{raw}{sep}fm=jpg&fit=max&w=2400&q=85")
    } else {
        urls.and_then(|u| u.get("full")).and_then(|v| v.as_str()).unwrap_or("").to_string()
    };
    let alt = obj
        .get("alt_description")
        .and_then(|v| v.as_str())
        .or_else(|| obj.get("description").and_then(|v| v.as_str()))
        .unwrap_or("Unsplash photo");
    Some(StockSearchResult {
        provider_id: format!("unsplash-{}", obj.get("id")?.to_string()),
        provider: "unsplash".into(),
        title: alt.chars().take(80).collect(),
        kind: "bitmap".into(),
        preview_url: urls
            .and_then(|u| u.get("small"))
            .and_then(|v| v.as_str())
            .or_else(|| urls.and_then(|u| u.get("thumb")).and_then(|v| v.as_str()))
            .unwrap_or("")
            .to_string(),
        source_url,
        width: obj.get("width").and_then(as_f64),
        height: obj.get("height").and_then(as_f64),
        author: user.and_then(|u| u.get("name")).and_then(|v| v.as_str()).map(String::from),
        is_premium: false,
        attribution_required: true,
    })
}

/* ---------- search ---------- */

/// True when a `stock_search_cache` row is younger than the weekly TTL.
fn cache_fresh(created_at: &str) -> bool {
    chrono::DateTime::parse_from_rfc3339(created_at)
        .map(|t| {
            chrono::Utc::now()
                .signed_duration_since(t.with_timezone(&chrono::Utc))
                .num_seconds()
                < SEARCH_TTL_SECS
        })
        .unwrap_or(false)
}

fn map_hits(provider: &str, json: &Value) -> Vec<StockSearchResult> {
    let items: Vec<StockSearchResult> = match provider {
        "pixabay" => json
            .get("hits")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(map_pixabay_hit).collect())
            .unwrap_or_default(),
        "unsplash" => json
            .get("results")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(map_unsplash_photo).collect())
            .unwrap_or_default(),
        _ => json
            .get("data")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(map_freepik_resource).collect())
            .unwrap_or_default(),
    };
    items
}

async fn fetch_search(
    provider: &str,
    term: &str,
    kind: &str,
    api_key: &str,
) -> Result<Vec<StockSearchResult>, String> {
    let items = match provider {
        "pixabay" => {
            let image_type = if kind == "vector" { "vector" } else { "photo" };
            let url = format!("{PIXABAY_ENDPOINT}");
            let res = http()
                .get(url)
                .query(&[
                    ("key", api_key),
                    ("q", term),
                    ("image_type", image_type),
                    ("per_page", "30"),
                    ("safesearch", "true"),
                    ("lang", "en"),
                ])
                .send()
                .await
                .map_err(|e| format!("Pixabay search failed — {e}"))?;
            if !res.status().is_success() {
                return Err(format!(
                    "Pixabay search failed ({}) — check your API key.",
                    res.status().as_u16()
                ));
            }
            let json: Value = res
                .json()
                .await
                .map_err(|e| format!("Pixabay search failed — {e}"))?;
            map_hits("pixabay", &json)
        }
        "unsplash" => {
            let res = http()
                .get(UNSPLASH_ENDPOINT)
                .query(&[("query", term), ("per_page", "30")])
                .header("Authorization", format!("Client-ID {api_key}"))
                .send()
                .await
                .map_err(|e| format!("Unsplash search failed — {e}"))?;
            if !res.status().is_success() {
                return Err(format!(
                    "Unsplash search failed ({}) — check your API key.",
                    res.status().as_u16()
                ));
            }
            let json: Value = res
                .json()
                .await
                .map_err(|e| format!("Unsplash search failed — {e}"))?;
            map_hits("unsplash", &json)
        }
        _ => {
            let res = http()
                .get(FREEPIK_ENDPOINT)
                .query(&[
                    ("term", term),
                    ("type", if kind == "vector" { "vector" } else { "photo" }),
                    ("limit", "30"),
                    ("order", "relevance"),
                ])
                .header("Authorization", format!("Bearer {api_key}"))
                .header("Accept-Language", "en-US")
                .send()
                .await
                .map_err(|e| format!("Freepik search failed — {e}"))?;
            if !res.status().is_success() {
                return Err(format!(
                    "Freepik search failed ({}) — check your API key and plan.",
                    res.status().as_u16()
                ));
            }
            let json: Value = res
                .json()
                .await
                .map_err(|e| format!("Freepik search failed — {e}"))?;
            map_hits("freepik", &json)
        }
    };
    Ok(items)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StockSearchOutcome {
    pub items: Vec<StockSearchResult>,
    pub cached: bool,
}

/// `stock:search` cache key — provider + kind + lowercase term (Electron
/// parity; the in-process LRU is intentionally dropped — the SQLite cache
/// already avoids repeated hits and needs no process-lifetime state).
pub fn search_cache_key(data_dir: &std::path::Path, term: &str, kind: &str) -> String {
    format!("{}:{}:{}", provider(data_dir), kind, term.trim().to_lowercase())
}

/// Fresh-cache probe (`stock:search` parity) — `Ok(None)` when no fresh row.
pub fn cached_search(
    conn: &Connection,
    key: &str,
) -> Result<Option<StockSearchOutcome>, String> {
    let row = conn
        .query_row(
            "SELECT payload, created_at FROM stock_search_cache WHERE cache_key = ?1",
            params![key],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
        )
        .optional()
        .map_err(|e| format!("stock cache read: {e}"))?;
    let Some((payload, created_at)) = row else {
        return Ok(None);
    };
    if !cache_fresh(&created_at) {
        return Ok(None);
    }
    let items: Vec<StockSearchResult> =
        serde_json::from_str(&payload).map_err(|e| format!("stock cache parse: {e}"))?;
    Ok(Some(StockSearchOutcome { items, cached: true }))
}

/// Provider fetch + recent-terms update. No DB access — the command stores
/// the cache row in a separate sync `with_db` scope, so the rusqlite
/// connection never crosses an `.await`.
pub async fn search_remote(
    cache_dir: &std::path::Path,
    data_dir: &std::path::Path,
    term: &str,
    kind: &str,
) -> Result<Vec<StockSearchResult>, String> {
    let q = term.trim();
    if q.is_empty() {
        return Ok(Vec::new());
    }
    let provider = provider(data_dir);
    let api_key = secrets::stock_api_key(&provider).ok_or_else(|| match provider.as_str() {
        "pixabay" => "Pixabay API key not configured (free). Add one below or set PIXABAY_API_KEY.",
        "unsplash" => "Unsplash API key not configured (free). Add one below or set UNSPLASH_API_KEY.",
        _ => "Freepik API key not configured. Add one below or set FREEPIK_API_KEY.",
    })?;
    let items = fetch_search(&provider, q, kind, &api_key).await?;
    remember(cache_dir, q);
    Ok(items)
}

/// Persist a fresh search payload (`stock:search` cache-write parity).
pub fn store_search(
    conn: &Connection,
    key: &str,
    items: &[StockSearchResult],
) -> Result<(), String> {
    let payload = serde_json::to_string(items).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO stock_search_cache (cache_key, payload, created_at) VALUES (?1, ?2, ?3)",
        params![key, payload, now()],
    )
    .map_err(|e| format!("stock cache write: {e}"))?;
    Ok(())
}

/* ---------- download ---------- */

struct StockAssetRow {
    kind: String,
    local_path: String,
    title: Option<String>,
    author: Option<String>,
    license: Option<String>,
    width: Option<f64>,
    height: Option<f64>,
}

fn read_row(conn: &Connection, provider_id: &str) -> Result<Option<StockAssetRow>, String> {
    let row = conn
        .query_row(
            "SELECT kind, local_path, title, author, license, width, height \
             FROM stock_assets WHERE provider_id = ?1",
            params![provider_id],
            |r| {
                Ok(StockAssetRow {
                    kind: r.get(0)?,
                    local_path: r.get(1)?,
                    title: r.get(2)?,
                    author: r.get(3)?,
                    license: r.get(4)?,
                    width: r.get(5)?,
                    height: r.get(6)?,
                })
            },
        )
        .optional()
        .map_err(|e| format!("stock asset read: {e}"))?;
    Ok(row)
}

/// Resolve a cached asset file to bytes for vector re-parsing. Adopted
/// Electron rows may carry a legacy cache path that no longer exists — fall
/// back to the deterministic native cache file (`cache/stock/<name>`).
fn resolve_cached_file(cache_dir: &std::path::Path, local_path: &str) -> Option<PathBuf> {
    let p = std::path::Path::new(local_path);
    if p.is_file() {
        return Some(p.to_path_buf());
    }
    let name = p.file_name()?;
    let fallback = cache_dir.join("stock").join(name);
    fallback.is_file().then_some(fallback)
}

/// `stock:download` cache-hit path — row exists locally, no network.
pub fn cached_download(
    conn: &Connection,
    cache_dir: &std::path::Path,
    provider_id: &str,
) -> Result<Option<StockDownloadRaw>, String> {
    let Some(row) = read_row(conn, provider_id)? else {
        return Ok(None);
    };
    let kind = if row.kind == "vector" { "vector" } else { "bitmap" };
    let mut svg = None;
    if kind == "vector" {
        svg = resolve_cached_file(cache_dir, &row.local_path)
            .and_then(|p| fs::read_to_string(p).ok());
    }
    Ok(Some(StockDownloadRaw {
        provider_id: provider_id.to_string(),
        kind: kind.into(),
        width: row.width,
        height: row.height,
        svg,
        title: row.title.unwrap_or_default(),
        author: row.author,
        attribution_required: row.license.as_deref()
            == Some("freepik-free-attribution")
            || row.license.as_deref() == Some("unsplash-free"),
        from_cache: true,
    }))
}

/// Everything the DB row needs once a network download lands. The command
/// performs the async fetch (`remote_download`), then persists this inside a
/// short sync `with_db` scope.
#[derive(Debug, Clone)]
pub struct StockDownloadRecord {
    pub provider_id: String,
    pub kind: String,
    pub local_path: String,
    pub source_url: String,
    pub preview_url: String,
    pub title: String,
    pub author: Option<String>,
    pub license: String,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub svg: Option<String>,
    pub attribution_required: bool,
}

impl StockDownloadRecord {
    pub fn to_raw(&self, from_cache: bool) -> StockDownloadRaw {
        StockDownloadRaw {
            provider_id: self.provider_id.clone(),
            kind: self.kind.clone(),
            width: self.width,
            height: self.height,
            svg: self.svg.clone(),
            title: self.title.clone(),
            author: self.author.clone(),
            attribution_required: self.attribution_required,
            from_cache,
        }
    }
}

/// Network download (Electron `stock:download` parity, minus the DB write —
/// callers persist the record with `store_download`). Provider is inferred
/// from the `providerId` prefix; content is sniffed: real SVG → `kind:
/// vector` with the raw text returned (the renderer parses it with the shared
/// `parseSvg`); anything else → bitmap.
pub async fn remote_download(
    cache_dir: &std::path::Path,
    provider_id: &str,
    input: &StockDownloadInput,
) -> Result<StockDownloadRecord, String> {
    let provider = provider_id.split('-').next().unwrap_or("").to_string();
    if !STOCK_PROVIDERS.contains(&provider.as_str()) {
        return Err(format!("Unknown asset provider: {provider_id}"));
    }
    if input.source_url.is_empty() {
        return Err(format!("No download URL for this {provider} asset."));
    }

    let res = http()
        .get(&input.source_url)
        .send()
        .await
        .map_err(|e| format!("Download failed — {e}"))?;
    if !res.status().is_success() {
        return Err(format!(
            "Download failed ({}) — this asset may not be downloadable with your plan.",
            res.status().as_u16()
        ));
    }
    let ctype = res
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    let buf = res.bytes().await.map_err(|e| format!("Download failed — {e}"))?;
    let head = String::from_utf8_lossy(&buf[..buf.len().min(1024)]).to_string();
    let is_svg = ctype.contains("svg") || head.contains("<svg");

    let ext = if is_svg {
        "svg"
    } else if ctype.contains("jpeg") || ctype.contains("jpg") {
        "jpg"
    } else if ctype.contains("webp") {
        "webp"
    } else {
        "png"
    };

    let stock_dir = cache_dir.join("stock");
    fs::create_dir_all(&stock_dir).map_err(|e| format!("stock cache dir: {e}"))?;
    let local_path = stock_dir.join(format!("{provider_id}.{ext}"));
    fs::write(&local_path, &buf).map_err(|e| format!("stock cache write: {e}"))?;

    let kind = if is_svg { "vector" } else { "bitmap" };
    let svg = if is_svg {
        Some(String::from_utf8_lossy(&buf).to_string())
    } else {
        None
    };
    let license = match provider.as_str() {
        "pixabay" => "pixabay-free",
        "unsplash" => "unsplash-free",
        _ => {
            if input.attribution_required.unwrap_or(false) {
                "freepik-free-attribution"
            } else {
                "freepik-free"
            }
        }
    };
    Ok(StockDownloadRecord {
        provider_id: provider_id.to_string(),
        kind: kind.to_string(),
        local_path: local_path.display().to_string(),
        source_url: input.source_url.clone(),
        preview_url: input.preview_url.clone().unwrap_or_default(),
        title: input.title.clone().unwrap_or_default(),
        author: input.author.clone(),
        license: license.into(),
        width: input.width,
        height: input.height,
        svg,
        attribution_required: (provider == "freepik" || provider == "unsplash")
            && input.attribution_required.unwrap_or(false),
    })
}

/// Persist a downloaded asset row (`stock:download` DB-write parity).
pub fn store_download(conn: &Connection, rec: &StockDownloadRecord) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO stock_assets \
         (provider_id, kind, local_path, source_url, preview_url, title, author, license, width, height, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            rec.provider_id,
            rec.kind,
            rec.local_path,
            rec.source_url,
            rec.preview_url,
            rec.title,
            rec.author,
            rec.license,
            rec.width,
            rec.height,
            now()
        ],
    )
    .map_err(|e| format!("stock asset write: {e}"))?;
    Ok(())
}
