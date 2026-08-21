# AlbumForge — Deployment & Packaging

AlbumForge is distributed as a Windows desktop application. There is no server component to
deploy.

## Build the installer

```bash
npm install
npm run dist
```

This runs `electron-vite build` (bundles main, preload, renderer into `out/`) followed by
`electron-builder --win`. Output:

```
dist/
├── AlbumForge Setup 0.1.0.exe   # NSIS installer
└── win-unpacked/                # portable build (run AlbumForge.exe)
```

## Installer behaviour

- Per-user install with an optional custom install directory.
- Desktop shortcut created.
- Native modules (`better-sqlite3`, `sharp`) are unpacked from `asar` (see
  `electron-builder.yml` → `asarUnpack`) so their native binaries load correctly.

## Updating

`electron-updater` is wired but **opt-in and off by default**. To enable it:

1. Configure a publish provider in `electron-builder.yml` (see the `publish:` placeholder —
   point it at your release server or a GitHub repo).
2. Set `ALBUMFORGE_AUTO_UPDATE=1` when the app runs, or trigger a check from
   **Settings → Check for updates**.

Without a publish provider, update checks report "not configured" and the app continues to
work normally (manual installer distribution).

## Code signing

For production distribution you should sign the build. Set these `electron-builder` options
in `electron-builder.yml` (or via env) and provide a certificate:

```yaml
win:
  certificateFile: cert.pfx
  certificatePassword: <secret>   # from env, not committed
```

Unsigned builds will trigger Windows SmartScreen warnings; sign for a smooth install.

## Distribution checklist

- [ ] Bump `version` in `package.json`.
- [ ] Sign the executable and installer.
- [ ] Test the installer on a clean Windows machine.
- [ ] Confirm originals are referenced (not copied) and exports open correctly.
