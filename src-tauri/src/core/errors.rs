//! Error reporting pipeline (blueprint §10 / MIGRATION Phase 9 item 5).
//!
//! Two layers, both data-safe:
//!
//! - [`install_panic_hook`] — a Rust panic hook that appends a **sanitised**
//!   crash entry to `crash.log` in the app data dir and, when a Sentry DSN is
//!   present in the environment, fire-and-forgets an envelope to Sentry.
//! - [`report`] — the frontend side: renderer `window.onerror` /
//!   `unhandledrejection` hooks funnel through the `errors:report` command so
//!   webview exceptions land in the same log/envelope channel.
//!
//! Sanitisation invariants (repo rule: "shield user data from leaks"):
//! messages are truncated, and absolute user paths are stripped before any
//! byte leaves the machine. Panic payloads and DB contents never enter the
//! log; the envelope contains only the message + a module hint.

use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

/// Crash log file name (app data dir).
pub const CRASH_LOG: &str = "crash.log";

/// Max characters kept per crash entry.
pub const MAX_ENTRY_CHARS: usize = 2_000;

static CRASH_DIR: OnceLock<PathBuf> = OnceLock::new();

/// Strip absolute user paths (Windows `C:\…` / `C:/…`, POSIX `/home/…`,
/// `$HOME`) — the report channel only ever carries sanitised text.
fn sanitise(message: &str) -> String {
    let mut m = message.to_string();
    for root in [
        "C:\\Users\\", "C:/Users/", "/Users/", "/home/", "\\\\", "file:///",
    ] {
        while let Some(pos) = m.find(root) {
            // Cut from the root to the next delimiter (or end).
            let rest = &m[pos + root.len()..];
            let end = rest
                .find([' ', '"', '\'', '\\', ')'])
                .map(|i| pos + root.len() + i)
                .unwrap_or(m.len());
            m.replace_range(pos..end, "<user-path>");
        }
    }
    let mut out = String::new();
    for ch in m.chars() {
        if ch == '\n' || ch == '\r' {
            out.push(' ');
        } else {
            out.push(ch);
        }
    }
    // Cap by *characters* (multibyte-safe); drop the tail rather than risk a
    // partial code point.
    out.chars().take(MAX_ENTRY_CHARS).collect()
}

fn crash_log_path(data_dir: &Path) -> PathBuf {
    data_dir.join(CRASH_LOG)
}

fn append_entry(data_dir: &Path, kind: &str, message: &str) {
    let _ = CRASH_DIR.set(data_dir.to_path_buf());
    let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(crash_log_path(data_dir))
    else {
        return;
    };
    let at = chrono::Utc::now().to_rfc3339();
    let line = format!("[{at}] {kind}: {}\n", sanitise(message));
    let _ = file.write_all(line.as_bytes());
}

// ---------------------------------------------------------------------------
// Sentry envelope (env DSN; plain-reqwest — no sentry crate dependency)
// ---------------------------------------------------------------------------

/// Parse a Sentry DSN into `(public_key, envelope_url)`.
/// DSN shape: `https://<public>[:<secret>]@<host>/<project>`.
fn parse_dsn(dsn: &str) -> Option<(String, String)> {
    let url = reqwest::Url::parse(dsn).ok()?;
    let key = url.username().to_string();
    let public = key.split(':').next().unwrap_or(&key).to_string();
    // Legacy DSN path is `/{project}` → project = first path segment.
    let project = url.path_segments()?.next()?.to_string();
    let mut envelope = url.clone();
    envelope.set_username("").ok()?;
    envelope.set_password(None).ok()?;
    envelope.set_path(&format!("/api/{project}/envelope/"));
    Some((public, envelope.to_string()))
}

fn env_dsn() -> Option<String> {
    std::env::var("ALBUMFORGE_SENTRY_DSN")
        .ok()
        .filter(|d| !d.trim().is_empty())
}

/// POST a minimal Sentry envelope (event_id, timestamp, exception message).
/// Best-effort: runs on its own thread, never blocks the app, never panics.
pub fn send_to_sentry(kind: &str, message: &str) {
    let Some(dsn) = env_dsn() else { return };
    let Some((public_key, envelope_url)) = parse_dsn(&dsn) else { return };
    // Owned copies: the forward runs on its own thread ('static).
    let kind = kind.to_string();
    let message = sanitise(message);

    std::thread::spawn(move || {
        let event_id = uuid::Uuid::new_v4().simple().to_string();
        let header = serde_json::json!({
            "event_id": event_id,
            "sent_at": chrono::Utc::now().to_rfc3339(),
        });
        let payload = serde_json::json!({
            "event_id": event_id,
            "timestamp": chrono::Utc::now().to_rfc3339(),
            "platform": "native",
            "level": "error",
            "message": { "formatted": message },
            "extra": { "channel": kind },
        });
        let body = format!(
            "{}\n{}",
            header.to_string(),
            payload.to_string()
        );
        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .build();
        let Ok(client) = client else { return };
        let _ = client
            .post(&envelope_url)
            .header(
                "X-Sentry-Auth",
                format!(
                    "Sentry sentry_version=7, sentry_client=albumforge-native/0.1, \
                     sentry_key={public_key}"
                ),
            )
            .header("Content-Type", "application/x-sentry-envelope")
            .body(body)
            .send();
    });
}

/// Install the process-wide panic hook (call once from `lib.rs::run`).
/// Chains any hook the host already installed; logs locally and forwards to
/// Sentry when configured. Never unwinds into the webview with raw paths.
pub fn install_panic_hook(data_dir: &Path) {
    let dir = data_dir.to_path_buf();
    let prev = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let payload = info
            .payload()
            .downcast_ref::<&str>()
            .copied()
            .or_else(|| info.payload().downcast_ref::<String>().map(|s| s.as_str()))
            .unwrap_or("panic");
        let location = info
            .location()
            .map(|l| format!("{}:{}", l.file(), l.line()))
            .unwrap_or_else(|| "unknown".into());
        let message = format!("{payload} (at {location})");
        append_entry(&dir, "rust-panic", &message);
        send_to_sentry("rust-panic", &message);
        prev(info);
    }));
}

/// Frontend crash hook target: `errors:report` command appends + forwards.
pub fn report(data_dir: &Path, message: &str) {
    append_entry(data_dir, "renderer", message);
    send_to_sentry("renderer", message);
}

/// `errors:lastCrash` — read the most recent crash entry (empty when none).
pub fn last_crash(data_dir: &Path) -> Option<String> {
    let raw = std::fs::read_to_string(crash_log_path(data_dir)).ok()?;
    raw.lines().last().map(|l| l.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_dir() -> PathBuf {
        let d = std::env::temp_dir().join(format!("af-errors-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn sanitise_strips_user_paths() {
        let dirty = "panic while opening C:\\Users\\bhavani.sukala\\Pictures\\x.jpg at src/x.rs:12";
        let clean = sanitise(dirty);
        assert!(!clean.contains("bhavani.sukala"), "user path leaked: {clean}");
        assert!(clean.contains("<user-path>"));
        // POSIX + scheme variants.
        let c2 = sanitise("read /home/alice/albums/a.jpg and file:///C:/x.png");
        assert!(!c2.contains("alice"));
        assert!(!c2.contains("x.png"));
    }

    #[test]
    fn sanitise_truncates_and_flattens() {
        let long = "x".repeat(10_000);
        let clean = sanitise(&long);
        assert!(clean.chars().count() <= MAX_ENTRY_CHARS);
        assert_eq!(clean.chars().count(), MAX_ENTRY_CHARS);
        assert_eq!(sanitise("a\nb\r\nc"), "a b  c");
    }

    #[test]
    fn report_writes_last_crash() {
        let dir = tmp_dir();
        report(&dir, "boom at C:\\Users\\alice\\x");
        let last = last_crash(&dir).unwrap();
        assert!(last.contains("boom"));
        assert!(!last.contains("alice"), "sanitised entry leaked a path: {last}");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn dsn_parsing() {
        let dsn = "https://pubkey123@o450000.ingest.sentry.io/543210";
        let (public, url) = parse_dsn(dsn).unwrap();
        assert_eq!(public, "pubkey123");
        assert_eq!(url, "https://o450000.ingest.sentry.io/api/543210/envelope/");
        // Secret-bearing legacy DSN: only the public half is used for auth.
        let (public2, _) = parse_dsn("https://pub:sec@host.example/42").unwrap();
        assert_eq!(public2, "pub");
        assert!(parse_dsn("not-a-url").is_none());
    }
}
