//! Native backend core: pure, host-independent logic (testable without Tauri).

pub mod db;
pub mod errors;
pub mod export;
pub mod fonts;
pub mod icc;
pub mod license;
pub mod print;
pub mod project;
pub mod gen;
pub mod import;
pub mod library;
pub mod palette;
pub mod proofing;
pub mod proxy;
pub mod scanner;
pub mod secrets;
pub mod stock;
