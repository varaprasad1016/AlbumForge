# AlbumForge — Third-Party Licenses

AlbumForge is proprietary software. This file documents the open-source dependencies and
their licenses. **Re-verify a license before adding a dependency** — do not assume a package
is commercially safe.

## Runtime dependencies (bundled into the app)

| Package | License | Use | Commercial notes |
|---|---|---|---|
| electron | MIT | Desktop shell | Safe |
| react / react-dom | MIT | UI | Safe |
| konva | MIT | Album editor canvas | Safe |
| react-konva | MIT | Konva React bindings | Safe |
| react-window | MIT | Virtualised photo grid | Safe |
| better-sqlite3 | MIT | Embedded local database | Safe. SQLite itself is public domain. |
| sharp | Apache-2.0 | Image processing | Safe. Prebuilt binaries bundle **libvips (LGPL-2.1+)** — shipped as a separate linked library; we do not modify it. Widely used commercially. |
| pdf-lib | MIT | PDF generation | Safe |

## Build-time dependencies (not shipped to end users)

| Package | License | Use |
|---|---|---|
| electron-vite | MIT | Build tooling |
| electron-builder | MIT | Installer packaging |
| vite | MIT | Bundler |
| @vitejs/plugin-react | MIT | React transform |
| tailwindcss | MIT | Styling |
| postcss / autoprefixer | MIT | CSS processing |
| typescript | Apache-2.0 | Compiler |
| vitest | MIT | Engine tests |
| @types/* | MIT | Type stubs |

## Clarification on copyleft

- No GPL/AGPL code is copied into proprietary components.
- The only LGPL component is **libvips**, bundled by `sharp` as an unmodified linked
  library — permissible for proprietary applications.
- The proprietary core (`src/main/engine/`) imports no third-party code; it is pure
  TypeScript.

This document is a living inventory. When adding a dependency, add a row here **and** the
rationale for choosing it.
