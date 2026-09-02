//! Licensing & seat engine (blueprint §10 / MIGRATION Phase 9 item 1).
//!
//! Keygen.sh-compatible client: binds a license key to a machine fingerprint,
//! validates it against the Keygen API, and caches a **cryptographic offline
//! lease** so the app keeps working for [`LEASE_VALIDITY_SECS`] (7 days)
//! without a network. The lease is only trusted while (a) its Ed25519
//! signature verifies against the account public key, (b) the stored
//! fingerprint matches this machine, and (c) the 7-day window has not lapsed.
//!
//! Security posture (repo invariants):
//! - The account/product configuration and the public key come from the
//!   environment (`ALBUMFORGE_KEYGEN_*`) — never compiled in, never stored.
//! - The renderer never sees the key beyond submitting it once for
//!   activation; every state read goes through typed commands returning the
//!   [`LicenseStatus`] verdict only.
//! - The lease file lives in the app data dir (`license.lease.json`) next to
//!   the DB — user-scoped, not world-readable code paths.
//!
//! The offline verification contract is explicit: Keygen signs a canonical
//! representation of the license JSON; the command layer fetches that signed
//! payload (env-gated real-account integration) and hands `(payload,
//! signature_b64, pubkey_pem)` to [`verify_ed25519`]. This module is pure
//! (no reqwest, no I/O except the lease file) and fully unit-tested.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// Cryptographic offline-lease validity window: 7 days.
pub const LEASE_VALIDITY_SECS: i64 = 7 * 24 * 60 * 60;

/// Lease file name in the app data dir.
pub const LEASE_FILE: &str = "license.lease.json";

// ---------------------------------------------------------------------------
// Configuration (env-injected; see docs above)
// ---------------------------------------------------------------------------

/// Keygen account configuration resolved from the environment. Absent fields
/// mean the corresponding feature is not configured (the UI reports an honest
/// "not configured" state instead of guessing).
#[derive(Debug, Clone, Default)]
pub struct KeygenConfig {
    /// Keygen account id (v1 API: `api.keygen.sh/v1/accounts/{account}/…`).
    pub account: Option<String>,
    /// Product id (not required for a pure `licenses/actions/validate` call).
    pub product: Option<String>,
    /// API base URL. Defaults to `https://api.keygen.sh`.
    pub base_url: String,
    /// Ed25519 public key (PEM) the account signs license files with.
    pub public_key_pem: Option<String>,
}

pub fn keygen_config_from_env() -> KeygenConfig {
    let nonempty = |k: &str| std::env::var(k).ok().filter(|v| !v.trim().is_empty());
    KeygenConfig {
        account: nonempty("ALBUMFORGE_KEYGEN_ACCOUNT"),
        product: nonempty("ALBUMFORGE_KEYGEN_PRODUCT"),
        base_url: nonempty("ALBUMFORGE_KEYGEN_BASE_URL")
            .unwrap_or_else(|| "https://api.keygen.sh".to_string()),
        public_key_pem: nonempty("ALBUMFORGE_KEYGEN_PUBLIC_KEY"),
    }
}

pub fn is_configured(cfg: &KeygenConfig) -> bool {
    cfg.account.is_some() && cfg.public_key_pem.is_some()
}

// ---------------------------------------------------------------------------
// Machine fingerprint (seat binding)
// ---------------------------------------------------------------------------

/// Stable-per-machine seat identifier. v1 provider: SHA-256 of
/// `hostname|username` — deterministic on one machine, cheap, pure-Rust.
/// Documented weakness: not unique across identical cloned VMs (a MAC/TPM or
/// registry `MachineGuid` provider can replace this one function later; the
/// lease schema carries the provider name so a provider bump invalidates
/// seats cleanly).
pub fn machine_fingerprint() -> String {
    use sha2::{Digest, Sha256};
    let host = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "unknown-host".into());
    let user = std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_else(|_| "unknown-user".into());
    let mut h = Sha256::new();
    h.update(host.as_bytes());
    h.update(b"|");
    h.update(user.as_bytes());
    hex(&h.finalize())
}

/// Fingerprint provider tag written into the lease (bump on provider change).
pub const FINGERPRINT_PROVIDER: &str = "v1-host-user";

fn hex(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{b:02x}"));
    }
    s
}

// ---------------------------------------------------------------------------
// Ed25519 verification (Keygen offline signatures)
// ---------------------------------------------------------------------------

/// Strip PEM armour and decode the raw key bytes (32 for Ed25519).
pub fn pem_to_raw_key(pem: &str) -> Option<Vec<u8>> {
    use base64::Engine;
    let body: String = pem
        .lines()
        .filter(|l| !l.starts_with("-----") && !l.trim().is_empty())
        .collect();
    base64::engine::general_purpose::STANDARD
        .decode(body.trim())
        .ok()
        .filter(|v| v.len() == 32)
}

/// Verify an Ed25519 signature over `payload` with a PEM public key.
/// `payload` must be the *exact bytes* Keygen signed (canonical license
/// JSON). Returns false on any malformed input — never panics.
pub fn verify_ed25519(payload: &[u8], signature_b64: &str, public_key_pem: &str) -> bool {
    use base64::Engine;
    use ed25519_dalek::{Signature, Verifier, VerifyingKey};
    let (Some(raw), Ok(sig)) = (
        pem_to_raw_key(public_key_pem),
        base64::engine::general_purpose::STANDARD.decode(signature_b64.trim()),
    ) else {
        return false;
    };
    let Ok(raw): Result<[u8; 32], _> = raw.try_into() else {
        return false;
    };
    let Ok(key) = VerifyingKey::from_bytes(&raw) else {
        return false;
    };
    let Ok(sig) = Signature::from_slice(&sig) else {
        return false;
    };
    key.verify(payload, &sig).is_ok()
}

// ---------------------------------------------------------------------------
// Offline lease cache
// ---------------------------------------------------------------------------

/// What we persist. `signed_payload` is the raw license JSON bytes Keygen
/// signed; the signature is verified on every status read.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeaseRecord {
    pub fingerprint_provider: String,
    pub fingerprint: String,
    /// Unix seconds the lease was validated online.
    pub validated_at: i64,
    /// Unix seconds the license was first activated on this machine.
    pub activated_at: i64,
    /// Raw signed payload (license JSON as returned by Keygen).
    pub signed_payload: String,
    /// Base64 Ed25519 signature over `signed_payload`.
    pub signature_b64: String,
    /// License key id (metadata only — never logged with the key itself).
    pub license_id: String,
}

/// Verdict returned to the renderer. `active` carries the expiry so the UI
/// can show "X days left".
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseStatus {
    pub active: bool,
    pub reason: String,
    /// Unix seconds when the current lease expires (active leases).
    pub expires_at: Option<i64>,
    /// Seconds remaining (active leases).
    pub remaining_seconds: Option<i64>,
    pub fingerprint: Option<String>,
    pub license_id: Option<String>,
}

pub fn lease_path(data_dir: &Path) -> PathBuf {
    data_dir.join(LEASE_FILE)
}

pub fn write_lease(data_dir: &Path, record: &LeaseRecord) -> Result<(), String> {
    let path = lease_path(data_dir);
    let json = serde_json::to_string_pretty(record).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

pub fn read_lease(data_dir: &Path) -> Option<LeaseRecord> {
    let raw = std::fs::read(lease_path(data_dir)).ok()?;
    serde_json::from_slice(&raw).ok()
}

pub fn clear_lease(data_dir: &Path) -> Result<(), String> {
    let path = lease_path(data_dir);
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Evaluate the lease against `now` (unix seconds). Order matters: an
/// unverifiable signature invalidates the lease even inside the window.
pub fn status(data_dir: &Path, now: i64, public_key_pem: Option<&str>) -> LicenseStatus {
    let Some(record) = read_lease(data_dir) else {
        return LicenseStatus {
            active: false,
            reason: "absent".into(),
            expires_at: None,
            remaining_seconds: None,
            fingerprint: None,
            license_id: None,
        };
    };
    // 1. Signature — the cryptographic trust anchor.
    match public_key_pem {
        Some(pem) if !verify_ed25519(record.signed_payload.as_bytes(), &record.signature_b64, pem) => {
            return LicenseStatus {
                active: false,
                reason: "invalid-signature".into(),
                expires_at: None,
                remaining_seconds: None,
                fingerprint: Some(record.fingerprint),
                license_id: Some(record.license_id),
            };
        }
        // No public key configured: the payload is not forgeable-by-key but
        // also not verifiable — treat as absent (never trust blindly).
        _ if public_key_pem.is_none() => {
            return LicenseStatus {
                active: false,
                reason: "not-configured".into(),
                expires_at: None,
                remaining_seconds: None,
                fingerprint: Some(record.fingerprint),
                license_id: Some(record.license_id),
            };
        }
        _ => {}
    }
    // 2. Seat binding.
    if record.fingerprint != machine_fingerprint() {
        return LicenseStatus {
            active: false,
            reason: "fingerprint-mismatch".into(),
            expires_at: None,
            remaining_seconds: None,
            fingerprint: Some(record.fingerprint),
            license_id: Some(record.license_id),
        };
    }
    // 3. The 7-day offline window (last *successful validation* gates it, so
    //    a device that stays offline past the window locks out cleanly).
    let expires_at = record.validated_at + LEASE_VALIDITY_SECS;
    if now >= expires_at {
        return LicenseStatus {
            active: false,
            reason: "expired".into(),
            expires_at: Some(expires_at),
            remaining_seconds: Some(0),
            fingerprint: Some(record.fingerprint),
            license_id: Some(record.license_id),
        };
    }
    LicenseStatus {
        active: true,
        reason: "active".into(),
        expires_at: Some(expires_at),
        remaining_seconds: Some(expires_at - now),
        fingerprint: Some(record.fingerprint),
        license_id: Some(record.license_id),
    }
}

/// Convenience for commands: build a fresh lease record after a successful
/// online validation. `now` injected for deterministic tests.
pub fn new_lease(
    signed_payload: &str,
    signature_b64: &str,
    license_id: &str,
    now: i64,
) -> LeaseRecord {
    LeaseRecord {
        fingerprint_provider: FINGERPRINT_PROVIDER.to_string(),
        fingerprint: machine_fingerprint(),
        validated_at: now,
        activated_at: now,
        signed_payload: signed_payload.to_string(),
        signature_b64: signature_b64.to_string(),
        license_id: license_id.to_string(),
    }
}

// ---------------------------------------------------------------------------
// Online validation (command-layer helper; reqwest lives in the caller so the
// pure module stays I/O-free — mirroring how stock/gen split sync/async).
// ---------------------------------------------------------------------------

/// Shape the Keygen `licenses/actions/validate` request body for a key.
/// `fingerprint` is sent as a custom scope so server-side seat counting can
/// key on it.
pub fn validate_request_body(key: &str, fingerprint: &str) -> serde_json::Value {
    serde_json::json!({
        "meta": {
            "key": key,
            "scope": { "fingerprint": fingerprint }
        }
    })
}

/// Post-parse helper: the Keygen validate response nests the verdict under
/// `meta.valid`; this returns `(valid, license_json)` tolerantly.
pub fn parse_validate_response(body: &serde_json::Value) -> (bool, Option<serde_json::Value>) {
    let valid = body
        .pointer("/meta/valid")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let license = body.get("data").cloned();
    (valid, license)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// RFC 8032 test vector 1 (Ed25519): msg = "", secret = 9d61…, public =
    /// d75a98…, sig = e556… (see rfc-editor.org/rfc/rfc8032#section-7.1), all
    /// base64-encoded.
    const RFC8032_PUB_B64: &str = "11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo=";
    const RFC8032_SIG_B64: &str = concat!(
        "5VZDAMNgrHKQhuLMgG6CioSHfx645dl02HPgZSJJAVVfuIIVkKM7rMYeOXAc",
        "+bRr0lv18FlbviRlUUFDjnoQCw=="
    );

    fn pem_of(raw_b64: &str) -> String {
        format!(
            "-----BEGIN PUBLIC KEY-----\n{}\n-----END PUBLIC KEY-----",
            raw_b64
        )
    }

    #[test]
    fn verifies_rfc8032_vector() {
        let pem = pem_of(RFC8032_PUB_B64);
        assert!(verify_ed25519(b"", RFC8032_SIG_B64, &pem));
        // Tampered payload fails.
        assert!(!verify_ed25519(b"x", RFC8032_SIG_B64, &pem));
        // Tampered signature fails.
        assert!(!verify_ed25519(b"", "AAAA", &pem));
    }

    #[test]
    fn fingerprint_is_stable_hex() {
        let a = machine_fingerprint();
        let b = machine_fingerprint();
        assert_eq!(a, b);
        assert_eq!(a.len(), 64);
        assert!(a.chars().all(|c| c.is_ascii_hexdigit()));
    }

    fn tmp_dir() -> PathBuf {
        let d = std::env::temp_dir().join(format!("af-lease-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn lease_window_math_and_fingerprint_binding() {
        let dir = tmp_dir();
        let pem = pem_of(RFC8032_PUB_B64);
        let now = 1_700_000_000i64;
        let rec = new_lease("{\"id\":\"lic-1\"}", RFC8032_SIG_B64, "lic-1", now);
        // Signature over "" — we signed empty payload in the vector; for this
        // test the signed payload must be empty to verify.
        let rec = LeaseRecord { signed_payload: String::new(), ..rec };
        write_lease(&dir, &rec).unwrap();

        // Fresh lease → active.
        let s = status(&dir, now, Some(&pem));
        assert!(s.active, "fresh lease should be active: {s:?}");
        assert_eq!(s.reason, "active");
        assert_eq!(s.remaining_seconds.unwrap(), LEASE_VALIDITY_SECS);

        // Inside window (6 days) → active.
        let s = status(&dir, now + 6 * 86_400, Some(&pem));
        assert!(s.active);
        assert_eq!(s.remaining_seconds.unwrap(), 86_400);

        // Past window (8 days) → expired, automatic lockout.
        let s = status(&dir, now + 8 * 86_400, Some(&pem));
        assert!(!s.active);
        assert_eq!(s.reason, "expired");

        // Forge a lease for a different machine → fingerprint-mismatch.
        let mut other = rec.clone();
        other.fingerprint = "0".repeat(64);
        write_lease(&dir, &other).unwrap();
        let s = status(&dir, now, Some(&pem));
        assert!(!s.active);
        assert_eq!(s.reason, "fingerprint-mismatch");

        // Tampered payload → invalid-signature even inside the window.
        let mut forged = rec.clone();
        forged.signed_payload = "{\"id\":\"lic-evil\"}".into();
        write_lease(&dir, &forged).unwrap();
        let s = status(&dir, now, Some(&pem));
        assert!(!s.active);
        assert_eq!(s.reason, "invalid-signature");

        // No pubkey configured → never trusted.
        let s = status(&dir, now, None);
        assert!(!s.active);
        assert_eq!(s.reason, "not-configured");

        clear_lease(&dir).unwrap();
        let s = status(&dir, now, Some(&pem));
        assert_eq!(s.reason, "absent");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn validate_request_body_shape() {
        let v = validate_request_body("key-1", "abc");
        assert_eq!(v["meta"]["key"], "key-1");
        assert_eq!(v["meta"]["scope"]["fingerprint"], "abc");
        let (valid, lic) = parse_validate_response(&serde_json::json!({
            "meta": { "valid": true }, "data": { "id": "l1" }
        }));
        assert!(valid);
        assert_eq!(lic.unwrap()["id"], "l1");
    }
}
