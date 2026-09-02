//! AI element generation — native port of `src/main/gen.ts`. Turn a text
//! description into a usable PNG graphic.
//!
//! Providers (switchable; the *id* persists in a small non-secret JSON, the
//! BFL key lives in env or the OS keychain behind `core/secrets.rs`):
//!   - `pollinations` (default) — free, no key. GET image.pollinations.ai.
//!   - `bfl` — Black Forest Labs FLUX (paid): POST job, poll, download.
//!
//! Generated images are normalized to PNG and saved into the `assets` table
//! (as a data URI, Electron parity) plus a `cache/gen/<id>.png` file, so they
//! appear in the editor's "your graphics" library automatically.

use std::fs;
use std::io::Cursor;
use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::Duration;

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::core::db::now;
use crate::core::secrets;

const POLLINATIONS_ENDPOINT: &str = "https://image.pollinations.ai/prompt";
const BFL_ENDPOINT: &str = "https://api.bfl.ai/v1/flux-pro-1.1";
const BFL_RESULT_ENDPOINT: &str = "https://api.bfl.ai/v1/get_result";
/// FLUX job polling ceiling (Electron `MAX_POLL_SECONDS` parity).
const MAX_POLL_SECS: u64 = 120;

pub const GEN_PROVIDERS: [&str; 2] = ["pollinations", "bfl"];

fn http() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        // Generation can be slow — a generous cap beats Electron's unbounded
        // fetch while still failing eventually instead of hanging forever.
        reqwest::Client::builder()
            .timeout(Duration::from_secs(240))
            .build()
            .expect("reqwest client")
    })
}

/* ---------- DTOs (mirror src/shared/api.ts `gen.*`) ---------- */

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenAsset {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub data_uri: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenResult {
    pub ok: bool,
    pub asset: Option<GenAsset>,
    pub error: Option<String>,
}

fn ok_result(id: String, name: String, data_uri: String) -> GenResult {
    GenResult {
        ok: true,
        asset: Some(GenAsset { id, name, kind: "png".into(), data_uri }),
        error: None,
    }
}

fn err_result(msg: impl Into<String>) -> GenResult {
    GenResult { ok: false, asset: None, error: Some(msg.into()) }
}

/* ---------- non-secret provider state ---------- */

fn gen_config_path(data_dir: &std::path::Path) -> PathBuf {
    data_dir.join("gen-config.json")
}

/// Active provider id — the file mirrors Electron's `gen-config.json` name but
/// stores only `{ "provider" }` (never the BFL key).
pub fn provider(data_dir: &std::path::Path) -> String {
    let cfg: Value = fs::read_to_string(gen_config_path(data_dir))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(Value::Null);
    match cfg.get("provider").and_then(|v| v.as_str()) {
        Some("bfl") => "bfl".to_string(),
        _ => "pollinations".to_string(),
    }
}

pub fn set_provider(data_dir: &std::path::Path, p: &str) -> bool {
    if !GEN_PROVIDERS.contains(&p) {
        return false;
    }
    let cfg = serde_json::json!({ "provider": p });
    let write = || -> std::io::Result<()> {
        let path = gen_config_path(data_dir);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(path, serde_json::to_vec(&cfg).unwrap_or_default())
    };
    write().is_ok()
}

/// Save the BFL key (keychain only) and switch to BFL (Electron parity).
pub fn set_api_key(data_dir: &std::path::Path, key: &str) -> bool {
    let key = key.trim();
    if key.is_empty() {
        return false;
    }
    if !secrets::write_secret("gen/bfl", key) {
        return false;
    }
    set_provider(data_dir, "bfl")
}

/// True when the active provider can generate right now: pollinations is
/// keyless; bfl needs `BFL_API_KEY` (env) or the OS keychain.
pub fn configured(data_dir: &std::path::Path) -> bool {
    if provider(data_dir) == "pollinations" {
        return true;
    }
    secrets::flux_api_key().is_some()
}

/* ---------- HTTP ---------- */

/// Pollinations GET URL (parity with the pure `pollinationsUrl` helper).
fn pollinations_url(prompt: &str, opts: &Option<GenOpts>) -> String {
    let w = opts.as_ref().and_then(|o| o.width).unwrap_or(768);
    let h = opts.as_ref().and_then(|o| o.height).unwrap_or(768);
    let seed = opts
        .as_ref()
        .and_then(|o| o.seed)
        .unwrap_or_else(|| fastrand_ish() as u32);
    let encoded = urlencoding::encode(prompt);
    format!(
        "{POLLINATIONS_ENDPOINT}/{encoded}?width={w}&height={h}&nologo=true&seed={seed}"
    )
}

/// Cheap non-crypto random seed (Electron used `Math.random()`; any value is
/// fine — only provider-side determinism matters and that is per-seed).
fn fastrand_ish() -> u64 {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.subsec_nanos() as u64)
        .unwrap_or(0);
    let pid = std::process::id() as u64;
    (nanos ^ (pid << 32)) & 0xFFFF_FFFF
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenOpts {
    pub width: Option<u32>,
    pub height: Option<u32>,
    #[serde(default)]
    pub seed: Option<u32>,
}

/// Sniff a buffer's image type from its magic bytes (`sniffImageType` parity).
fn sniff(buf: &[u8]) -> &'static str {
    if buf.len() > 8 && buf[0] == 0x89 && buf[1] == 0x50 && buf[2] == 0x4e && buf[3] == 0x47 {
        "png"
    } else if buf.len() > 3 && buf[0] == 0xff && buf[1] == 0xd8 && buf[2] == 0xff {
        "jpeg"
    } else if buf.len() > 12 && &buf[0..4] == b"RIFF" && &buf[8..12] == b"WEBP" {
        "webp"
    } else {
        "png"
    }
}

/// Normalize to PNG bytes (Electron rasterized non-PNG provider output with
/// sharp; the `image` crate covers JPEG + WebP decode here).
fn to_png(buf: &[u8]) -> Result<Vec<u8>, String> {
    if sniff(buf) == "png" {
        return Ok(buf.to_vec());
    }
    let img = image::load_from_memory(buf).map_err(|e| {
        format!("provider returned {} that the native decoder could not convert — retry (PNG/JPEG responses convert fine): {e}", sniff(buf))
    })?;
    let mut out = Cursor::new(Vec::new());
    img.write_to(&mut out, image::ImageFormat::Png)
        .map_err(|e| format!("PNG encode failed: {e}"))?;
    Ok(out.into_inner())
}

/// Poll a BFL job until Ready and return the sample URL (`pollBflResult` parity).
async fn poll_bfl_result(id: &str, api_key: &str) -> Result<String, String> {
    let started = std::time::Instant::now();
    loop {
        let res = http()
            .get(BFL_RESULT_ENDPOINT)
            .query(&[("id", id)])
            .header("Authorization", format!("Bearer {api_key}"))
            .header("Accept", "application/json")
            .send()
            .await
            .map_err(|e| format!("FLUX status check failed — {e}"))?;
        if !res.status().is_success() {
            return Err(format!("FLUX status check failed ({})", res.status().as_u16()));
        }
        let data: Value = res.json().await.map_err(|e| format!("FLUX status parse — {e}"))?;
        if let Some(err) = data.get("error").and_then(|v| v.as_str()) {
            return Err(err.to_string());
        }
        if data.get("status").and_then(|v| v.as_str()) == Some("Ready") {
            if let Some(sample) = data
                .get("result")
                .and_then(|v| v.get("sample"))
                .and_then(|v| v.as_str())
            {
                return Ok(sample.to_string());
            }
        }
        if started.elapsed().as_secs() > MAX_POLL_SECS {
            return Err("FLUX generation timed out".into());
        }
        // Blocking sleep on a worker thread — keeps the poll loop async while
        // avoiding a direct tokio dependency for one timer.
        let _ = tauri::async_runtime::spawn_blocking(move || std::thread::sleep(Duration::from_millis(1500))).await;
    }
}

/// Fetch image bytes from the active provider (no DB access — callers insert
/// the asset row themselves so the rusqlite connection never crosses `.await`).
async fn fetch_bytes(
    data_dir: &std::path::Path,
    prompt: &str,
    opts: &Option<GenOpts>,
) -> Result<Vec<u8>, String> {
    let provider = provider(data_dir);
    if provider == "pollinations" {
        let res = http()
            .get(pollinations_url(prompt, opts))
            .send()
            .await
            .map_err(|e| format!("Pollinations returned an error — {e}"))?;
        if !res.status().is_success() {
            return Err(format!("Pollinations returned {}", res.status().as_u16()));
        }
        return Ok(res.bytes().await.map_err(|e| e.to_string())?.to_vec());
    }
    // bfl / FLUX
    let key = secrets::flux_api_key().ok_or("Add a Black Forest Labs API key to use FLUX.")?;
    let w = opts.as_ref().and_then(|o| o.width).unwrap_or(1024);
    let h = opts.as_ref().and_then(|o| o.height).unwrap_or(1024);
    let job_res = http()
        .post(BFL_ENDPOINT)
        .header("Authorization", format!("Bearer {key}"))
        .header("Content-Type", "application/json")
        .body(
            serde_json::json!({ "prompt": prompt.trim(), "width": w, "height": h })
                .to_string(),
        )
        .send()
        .await
        .map_err(|e| format!("FLUX request failed — {e}"))?;
    if !job_res.status().is_success() {
        return Err(format!("FLUX request failed ({})", job_res.status().as_u16()));
    }
    let job: Value = job_res.json().await.map_err(|e| format!("FLUX job parse — {e}"))?;
    let id = job
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("FLUX returned no job id")?;
    let sample = poll_bfl_result(id, &key).await?;
    let img_res = http()
        .get(&sample)
        .send()
        .await
        .map_err(|e| format!("FLUX image download failed — {e}"))?;
    if !img_res.status().is_success() {
        return Err(format!("FLUX image download failed ({})", img_res.status().as_u16()));
    }
    Ok(img_res.bytes().await.map_err(|e| e.to_string())?.to_vec())
}

/// Fetch + normalize a generated image (no DB access — the rusqlite
/// connection lives behind a `with_db` sync scope and must never cross
/// `.await`; commands call this async, then hand the PNG to `persist_asset`
/// inside a short DB block). Returns the error string directly so callers can
/// build a `GenResult`.
pub async fn fetch_generated(
    data_dir: &std::path::Path,
    prompt: &str,
    opts: &Option<GenOpts>,
) -> Result<Vec<u8>, String> {
    let clean = prompt.trim();
    if clean.is_empty() {
        return Err("Enter a description first.".into());
    }
    let bytes = fetch_bytes(data_dir, clean, opts).await?;
    if bytes.is_empty() {
        return Err("Empty image received from provider.".into());
    }
    to_png(&bytes)
}

/// Write `<id>.png` into `cache/gen/` + insert the `assets` row (data URI).
/// Mirrors Electron's `GenService.generate` tail exactly.
pub fn persist_asset(
    conn: &Connection,
    cache_dir: &std::path::Path,
    name: &str,
    png: &[u8],
) -> GenResult {
    use base64::Engine as _;
    let id = {
        let millis = chrono::Utc::now().timestamp_millis();
        let salt = &uuid::Uuid::new_v4().simple().to_string()[..6];
        format!("gen-{millis}-{salt}")
    };
    let gen_dir = cache_dir.join("gen");
    if let Err(e) = fs::create_dir_all(&gen_dir) {
        return err_result(format!("gen cache dir: {e}"));
    }
    if let Err(e) = fs::write(gen_dir.join(format!("{id}.png")), png) {
        return err_result(format!("gen cache write: {e}"));
    }
    let data_uri = format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(png)
    );
    let label = name.chars().take(60).collect::<String>();
    if let Err(e) = conn.execute(
        "INSERT INTO assets (id, name, kind, data, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![id, label, "png", data_uri, now()],
    ) {
        return err_result(format!("asset write: {e}"));
    }
    ok_result(id, label, data_uri)
}
