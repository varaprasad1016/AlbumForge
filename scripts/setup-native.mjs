#!/usr/bin/env node
/**
 * Bootstrap the native (Rust/Tauri) toolchain for the backend rewrite.
 *
 * Usage:
 *   node scripts/setup-native.mjs           # install Rust if missing, then cargo check
 *   node scripts/setup-native.mjs --check   # report only; exit 1 when missing
 *
 * When cargo/rustc are absent it installs rustup + the stable toolchain
 * (rustup-init.exe on Windows, rustup-init.sh on macOS/Linux), then runs
 * `cargo check` in src-tauri so a broken native backend is caught right after
 * an update pull. Nothing here touches .env / config.json / credentials.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TAURI_DIR = join(ROOT, "src-tauri");
const CHECK_ONLY = process.argv.includes("--check");
const PATH_SEP = process.platform === "win32" ? ";" : ":";

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  return r.status ?? 1;
}

const has = (cmd) => spawnSync(cmd, ["--version"], { stdio: "ignore" }).status === 0;

const cargoBin = join(homedir(), ".cargo", "bin");
// Make ~/.cargo/bin visible in this process tree right after an install.
process.env.PATH = `${cargoBin}${PATH_SEP}${process.env.PATH ?? ""}`;

const hasCargo = has("cargo");
const hasRustc = has("rustc");

if (hasCargo && hasRustc) {
  console.log("✔ Rust toolchain already installed");
} else if (CHECK_ONLY) {
  console.error(
    "✖ Rust toolchain missing (cargo/rustc not found). Run: npm run setup:native",
  );
  process.exit(1);
} else {
  console.log(`Installing Rust toolchain via rustup on ${process.platform}…`);
  if (process.platform === "win32") {
    const exe = join(process.env.TEMP ?? ".", "rustup-init.exe");
    if (
      run("powershell", [
        "-NoProfile",
        "-Command",
        `Invoke-WebRequest -Uri https://win.rustup.rs/x86_64 -OutFile ${exe}`,
      ]) !== 0
    ) {
      console.error("✖ failed to download rustup-init.exe");
      process.exit(1);
    }
    if (run(exe, ["-y", "--default-toolchain", "stable"]) !== 0) process.exit(1);
  } else {
    if (
      run("sh", [
        "-c",
        "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable",
      ]) !== 0
    ) {
      console.error("✖ failed to install rustup");
      process.exit(1);
    }
  }
  if (!has("cargo")) {
    console.error("✖ cargo still not found after install — restart your shell");
    process.exit(1);
  }
  console.log("✔ Rust toolchain installed");
}

if (process.platform === "linux") {
  // Tauri 2 links against webkit2gtk/gtk; gobject-sys needs gobject-2.0.pc.
  const hasGobject =
    spawnSync("pkg-config", ["--exists", "gobject-2.0"], { stdio: "ignore" }).status === 0;
  if (!hasGobject) {
    const hint =
      "sudo apt-get update && sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev";
    console.error("✖ Tauri Linux system dependencies missing (gobject-2.0). Install with:");
    console.error("  " + hint);
    if (CHECK_ONLY) process.exit(1);
  }
}

if (existsSync(join(TAURI_DIR, "Cargo.toml"))) {
  console.log("Building renderer (required by the Tauri build context)…");
  if (run("npm", ["run", "build"], { cwd: ROOT }) !== 0) {
    console.error("✖ renderer build failed");
    process.exit(1);
  }
  console.log("Running cargo check in src-tauri…");
  if (
    run("cargo", ["check", "--manifest-path", join(TAURI_DIR, "Cargo.toml")]) !== 0
  ) {
    console.error("✖ native backend failed to compile");
    process.exit(1);
  }
  console.log("✔ native backend compiles");
}
