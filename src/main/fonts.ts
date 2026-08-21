/** Local font registry: bundled fonts (resources/fonts) + user-added fonts. */
import { app } from "electron";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";

function bundledFontsDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, "fonts")
    : join(app.getAppPath(), "resources", "fonts");
}

function userFontsDir(): string {
  return join(app.getPath("userData"), "fonts");
}

export interface FontInfo {
  family: string;
  path: string;
}

export function listFonts(): FontInfo[] {
  const dirs = [bundledFontsDir(), userFontsDir()];
  const seen = new Set<string>();
  const out: FontInfo[] = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (!/\.ttf$/i.test(file)) continue;
      const family = file.replace(/\.ttf$/i, "");
      if (seen.has(family)) continue;
      seen.add(family);
      out.push({ family, path: join(dir, file) });
    }
  }
  return out.sort((a, b) => a.family.localeCompare(b.family));
}

export function fontPath(family: string): string | null {
  const f = listFonts().find((x) => x.family === family);
  return f ? f.path : null;
}

export function readFont(family: string): Buffer | null {
  const p = fontPath(family);
  return p ? readFileSync(p) : null;
}
