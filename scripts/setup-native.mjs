#!/usr/bin/env node
/**
 * Bootstrap the native (Rust/Tauri) toolchain for the backend rewrite.
 *
 * Usage:
 *   node scripts/setup-native.mjs           # install missing tools, then cargo check
 *   node scripts/setup-native.mjs --check   # report only; exit 1 when missing
 *
 * What it ensures:
 *  - rustup + stable Rust (rustup-init.exe on Windows, rustup-init.sh otherwise)
 *  - Windows without MSVC C++ Build Tools: falls back to the GNU toolchain
 *    (stable-x86_64-pc-windows-gnu) plus a portable MinGW (w64devkit), with the
 *    documented empty-libgcc_eh.a stub so Rust links cleanly.
 *  - Linux: warns when Tauri's webkit2gtk/gtk system deps are missing.
 *  - Then runs `cargo check` in src-tauri so a broken native backend is caught
 *    right after an update pull.
 *
 * Nothing here touches .env / config.json / credentials.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TAURI_DIR = join(ROOT, "src-tauri");
const CHECK_ONLY = process.argv.includes("--check");
const IS_WIN = process.platform === "win32";
const PATH_SEP = IS_WIN ? ";" : ":";
const NPM = IS_WIN ? "npm.cmd" : "npm";

const cargoBin = join(homedir(), ".cargo", "bin");
// Make ~/.cargo/bin visible in this process tree right after an install.
process.env.PATH = `${cargoBin}${PATH_SEP}${process.env.PATH ?? ""}`;

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  return r.status ?? 1;
}

const has = (cmd) => spawnSync(cmd, ["--version"], { stdio: "ignore" }).status === 0;

function hasMsvcTools() {
  const vswhere =
    "C:/Program Files (x86)/Microsoft Visual Studio/Installer/vswhere.exe";
  if (!existsSync(vswhere)) return false;
  const r = spawnSync(
    vswhere,
    [
      "-products",
      "*",
      "-requires",
      "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
      "-property",
      "installationPath",
    ],
    { encoding: "utf8" },
  );
  return r.status === 0 && r.stdout.trim().length > 0;
}

const hasCargo = has("cargo");
const hasRustc = has("rustc");

let useGnu = false;

if (hasCargo && hasRustc) {
  console.log("✔ Rust toolchain already installed");
  if (IS_WIN && !hasMsvcTools() && !has("gcc")) useGnu = true;
} else if (CHECK_ONLY) {
  console.error(
    "✖ Rust toolchain missing (cargo/rustc not found). Run: npm run setup:native",
  );
  process.exit(1);
} else {
  console.log(`Installing Rust toolchain via rustup on ${process.platform}…`);
  if (IS_WIN) {
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
  if (IS_WIN && !hasMsvcTools()) useGnu = true;
}

// ---- Windows fallback: GNU toolchain + portable MinGW (w64devkit) ----
if (useGnu && !CHECK_ONLY) {
  const gnuHost = "stable-x86_64-pc-windows-gnu";
  console.log("MSVC C++ Build Tools not found — setting up GNU toolchain…");
  if (run("rustup", ["toolchain", "install", gnuHost, "--profile", "minimal"]) !== 0) {
    process.exit(1);
  }

  const devkit = join(homedir(), "w64devkit");
  const gcc = join(devkit, "w64devkit", "bin", "gcc.exe");
  if (!existsSync(gcc)) {
    console.log("Downloading portable MinGW (w64devkit)…");
    const zip = join(homedir(), "w64devkit.zip");
    // v1.23.0 is the last plain-.zip release (v2+ are 7z self-extractors).
    if (
      run("curl", [
        "-sL",
        "-o",
        zip,
        "https://github.com/skeeto/w64devkit/releases/download/v1.23.0/w64devkit-1.23.0.zip",
      ]) !== 0
    ) {
      console.error("✖ failed to download w64devkit");
      process.exit(1);
    }
    const extract =
      run("unzip", ["-q", zip, "-d", devkit]) === 0 ||
      run("tar", ["-xf", zip, "-C", devkit]) === 0 ||
      run("powershell", ["-NoProfile", "-Command", `Expand-Archive -Force ${zip} ${devkit}`]) === 0;
    if (!extract) {
      console.error("✖ failed to extract w64devkit");
      process.exit(1);
    }
  }
  process.env.PATH = `${join(devkit, "w64devkit", "bin")}${PATH_SEP}${process.env.PATH}`;

  // Rust needs libgcc_eh.a which w64devkit deliberately omits; an empty
  // archive in the toolchain lib dir is the documented workaround.
  const stub = join(devkit, "w64devkit", "x86_64-w64-mingw32", "lib", "libgcc_eh.a");
  if (!existsSync(stub)) {
    run(join(devkit, "w64devkit", "bin", "ar.exe"), ["-rcs", stub]);
  }
  console.log("✔ GNU toolchain + MinGW ready");
}

// ---- Linux system deps hint ----
if (process.platform === "linux") {
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

// ---- Verify the native backend compiles ----
if (existsSync(join(TAURI_DIR, "Cargo.toml"))) {
  console.log("Building renderer (required by the Tauri build context)…");
  // npm on Windows is npm.cmd — spawnSync needs `shell: true` to launch it.
  if (run(NPM, ["run", "build"], { cwd: ROOT, shell: true }) !== 0) {
    console.error("✖ renderer build failed");
    process.exit(1);
  }
  console.log("Running cargo check in src-tauri…");
  const toolchain = useGnu ? "+stable-x86_64-pc-windows-gnu" : null;
  const args = toolchain
    ? [toolchain, "check", "--manifest-path", join(TAURI_DIR, "Cargo.toml")]
    : ["check", "--manifest-path", join(TAURI_DIR, "Cargo.toml")];
  if (run("cargo", args) !== 0) {
    console.error("✖ native backend failed to compile");
    process.exit(1);
  }
  console.log("✔ native backend compiles");
}
