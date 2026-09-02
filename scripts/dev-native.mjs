#!/usr/bin/env node
/**
 * Launch the Tauri (Rust) dev shell: `npm run dev:native`.
 *
 * Runs `tauri dev` with the Rust toolchain the machine can actually build
 * with, mirroring setup-native.mjs:
 *  - makes ~/.cargo/bin visible (fresh rustup installs);
 *  - on Windows without MSVC C++ Build Tools, switches to the GNU toolchain
 *    (stable-x86_64-pc-windows-gnu) and puts the portable w64devkit MinGW on
 *    PATH so linking works — exactly the environment `npm run setup:native`
 *    provisions;
 *  - otherwise leaves the default toolchain untouched.
 *
 * `tauri dev` itself runs the `beforeDevCommand` (`npm run dev:renderer`, the
 * Vite dev server on :5173) and opens the app window pointed at it. Hot
 * reload for the renderer comes from Vite; Rust edits require a rebuild which
 * tauri watches and triggers automatically.
 *
 * Screens that call `window.albumforge.*` (the Electron preload bridge) will
 * show errors under this shell until the Phase-2 Backend adapter lands —
 * that is expected during the migration.
 */

import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const IS_WIN = process.platform === "win32";
const PATH_SEP = IS_WIN ? ";" : ":";

const cargoBin = join(homedir(), ".cargo", "bin");
if (existsSync(cargoBin)) {
  process.env.PATH = `${cargoBin}${PATH_SEP}${process.env.PATH ?? ""}`;
}

function hasMsvcTools() {
  if (!IS_WIN) return true; // non-Windows uses the default toolchain
  const vswhere = "C:/Program Files (x86)/Microsoft Visual Studio/Installer/vswhere.exe";
  if (!existsSync(vswhere)) return false;
  const r = spawnSync(
    vswhere,
    ["-products", "*", "-requires", "Microsoft.VisualStudio.Component.VC.Tools.x86.x64", "-property", "installationPath"],
    { encoding: "utf8" },
  );
  return r.status === 0 && r.stdout.trim().length > 0;
}

if (IS_WIN && !hasMsvcTools()) {
  const gnu = "stable-x86_64-pc-windows-gnu";
  const toolchainDir = join(homedir(), ".rustup", "toolchains", gnu);
  const devkit = join(homedir(), "w64devkit", "w64devkit", "bin");
  if (!existsSync(toolchainDir)) {
    console.warn(`⚠ GNU toolchain (${gnu}) not found — run \`npm run setup:native\` once if the build fails.`);
  } else {
    process.env.RUSTUP_TOOLCHAIN = gnu;
    console.log(`Using Rust GNU toolchain: ${gnu}`);
  }
  if (existsSync(devkit)) {
    process.env.PATH = `${devkit}${PATH_SEP}${process.env.PATH ?? ""}`;
  }
}

// Mirror the bundled fonts next to the dev binary: `app.resource_dir()` in dev
// is the executable's own directory, and `fonts:list` reads `$RESOURCE/fonts`.
// Packaged builds get the same files via `bundle.resources` in tauri.conf.json.
const fontsSrc = join(process.cwd(), "resources", "fonts");
const fontsDest = join(process.cwd(), "src-tauri", "target", "debug", "fonts");
if (existsSync(fontsSrc) && !existsSync(fontsDest)) {
  mkdirSync(fontsDest, { recursive: true });
  for (const f of readdirSync(fontsSrc)) {
    const src = join(fontsSrc, f);
    const dest = join(fontsDest, f);
    if (!existsSync(dest)) copyFileSync(src, dest);
  }
}

console.log("Starting Tauri dev shell…");
const child = spawn("npx tauri dev", { stdio: "inherit", shell: true, env: process.env });

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => child.kill(sig));
}
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
