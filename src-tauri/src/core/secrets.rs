//! Secret access — never stored in the repo, never compiled in, never logged.
//!
//! Keys are read solely from the process environment (mirroring the legacy
//! Electron shell, which used `process.env.*`) or from the OS keychain via
//! the `keyring` crate once the Settings UI migration lands. Nothing in this
//! file persists secrets to disk. The `.env` / `.gitignore` / `config.json`
//! files are untouched by the rewrite.

/// Black Forest Labs FLUX key (provider id: `"bfl"`).
pub fn flux_api_key() -> Option<String> {
    std::env::var("BFL_API_KEY")
        .ok()
        .filter(|k| !k.trim().is_empty())
}

/// Stock provider keys, matching the legacy env var names in `src/main/stock.ts`.
pub fn stock_api_key(provider: &str) -> Option<String> {
    let var = match provider {
        "pixabay" => "PIXABAY_API_KEY",
        "freepik" => "FREEPIK_API_KEY",
        "unsplash" => "UNSPLASH_API_KEY",
        _ => return None,
    };
    std::env::var(var)
        .ok()
        .filter(|k| !k.trim().is_empty())
}
