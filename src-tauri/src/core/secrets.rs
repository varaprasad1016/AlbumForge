//! Secret access — never stored in the repo, never compiled in, never logged.
//!
//! Keys are read from the process environment first (mirroring the legacy
//! Electron shell, which used `process.env.*`), then from the OS keychain via
//! the `keyring` crate (Windows Credential Manager / macOS Keychain / Linux
//! Secret Service). `write_secret` stores *only* in the OS keychain — the
//! legacy Electron habit of persisting keys next to the DB in a
//! `*-config.json` is never replicated on the native backend (the spec's
//! security invariant). Every keychain operation is best-effort: on any
//! platform/keyring failure the lookup falls back to env-only rather than
//! failing the caller, so an unlocked/broken keychain never bricks a search.

/// Keychain service name (grouping label in Credential Manager / Keychain).
const KEYRING_SERVICE: &str = "com.albumforge.app";

/// Open the keychain entry for `user`. `None` on any platform failure.
fn keyring_entry(user: &str) -> Option<keyring::Entry> {
    keyring::Entry::new(KEYRING_SERVICE, user).ok()
}

/// Env-first read with a keychain fallback under credential `user`.
fn read_secret(env_var: &str, user: &str) -> Option<String> {
    let from_env = std::env::var(env_var).ok().filter(|k| !k.trim().is_empty());
    if from_env.is_some() {
        return from_env;
    }
    keyring_entry(user)
        .and_then(|e| e.get_password().ok())
        .filter(|k| !k.trim().is_empty())
}

/// Store `key` in the OS keychain under credential `user`. Never touches disk
/// outside the OS credential store. Returns false on any failure (callers can
/// surface "could not reach the OS keychain" without leaking the key).
pub fn write_secret(user: &str, key: &str) -> bool {
    let Some(entry) = keyring_entry(user) else {
        return false;
    };
    let key = key.trim();
    if key.is_empty() {
        return false;
    }
    entry.set_password(key).is_ok()
}

/// Black Forest Labs FLUX key (provider id: `"bfl"`; env `BFL_API_KEY`).
pub fn flux_api_key() -> Option<String> {
    read_secret("BFL_API_KEY", "gen/bfl")
}

/// Same key as [`flux_api_key`] — `gen:setApiKey("bfl", …)` lands here.
pub fn gen_api_key() -> Option<String> {
    flux_api_key()
}

/// Stock provider keys, matching the legacy env var names in `src/main/stock.ts`.
/// Env-first, then the OS keychain under credential `stock/<provider>`.
pub fn stock_api_key(provider: &str) -> Option<String> {
    let (var, user) = match provider {
        "pixabay" => ("PIXABAY_API_KEY", "stock/pixabay"),
        "freepik" => ("FREEPIK_API_KEY", "stock/freepik"),
        "unsplash" => ("UNSPLASH_API_KEY", "stock/unsplash"),
        _ => return None,
    };
    read_secret(var, user)
}

/// Persist a stock provider key in the OS keychain (`stock:setApiKey` parity —
/// Electron wrote `userData/stock-config.json`; the native backend keeps the
/// key out of the repo-adjacent data dir entirely).
pub fn write_stock_key(provider: &str, key: &str) -> bool {
    let user = match provider {
        "pixabay" => "stock/pixabay",
        "freepik" => "stock/freepik",
        "unsplash" => "stock/unsplash",
        _ => return false,
    };
    write_secret(user, key)
}
