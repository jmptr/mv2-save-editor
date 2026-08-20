# Stack Research — v1.1 Packaging & Distribution

**Domain:** Electron desktop-app packaging & auto-update distribution (Windows NSIS installer, published to GitHub Releases via CI)
**Researched:** 2026-07-09
**Confidence:** HIGH (both key package versions verified live against the npm registry on 2026-07-09; integration mechanics from stable, long-documented electron-builder/electron-updater behavior)

> Scope note: This milestone (v1.1) adds ONLY distribution capabilities to the already-built v1.0 app.
> The core stack (Electron 43.0.0, TypeScript ^6.0.3, React 19, esbuild build, `node:zlib` Brotli,
> `@tanstack/react-virtual`, `tsx --test` + c8) is fixed and NOT re-researched here. Everything below
> is additive and sits *around* the existing `scripts/build.mjs` esbuild pipeline. The prior v1.0
> stack research lives in CLAUDE.md and PROJECT.md.

---

## Recommended Stack

### Core Technologies (new for v1.1)

| Technology | Version | Dep type | Purpose | Why Recommended |
|------------|---------|----------|---------|-----------------|
| **electron-builder** | `26.15.6` | **devDependency** | Packages the already-built `dist/` into a Windows NSIS installer `.exe`; generates `latest.yml` + `.blockmap`; publishes assets to the GitHub Release | The de-facto standard packager for Electron. It does **not** compile your TypeScript — it consumes the files esbuild already emitted, wraps them in an Electron runtime, and produces the installer. Pairs natively with electron-updater (both share `builder-util-runtime`). Autodetects the bundled Electron version from the installed `electron` devDep (43.0.0). |
| **electron-updater** | `6.8.9` | **runtime dependency** (`dependencies`) | Runs inside the main process; on launch checks the GitHub Releases feed, downloads a newer NSIS installer, and applies it | The companion to electron-builder for the "feed = GitHub Releases" model. Reads the `latest.yml` electron-builder uploads, compares versions with semver, and drives the NSIS silent-update flow. **Must be a runtime dependency, never a devDependency** (see the dedicated note below). |
| **NSIS target** | built into electron-builder | — | The Windows installer format (`win.target: "nsis"`) | NSIS is the **only** Windows target that electron-updater's Windows updater supports end-to-end. It emits the `latest.yml` + `.blockmap` metadata the updater requires and performs the in-place silent replace. `portable`, `zip`, `dir`, and `appx` do **not** wire into the auto-update flow. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| *(none required)* | — | — | No extra runtime libraries are needed. electron-builder pulls its own toolchain (`app-builder-lib`, `nsis`, `dmg-builder`, etc.) transitively; electron-updater pulls `builder-util-runtime`, `js-yaml`, `semver`. Do **not** add `electron-log` unless you specifically want the updater's optional logger — it is optional and deferrable. |

### Development / CI Tools

| Tool | Version | Purpose | Notes |
|------|---------|---------|-------|
| **GitHub Actions** | `windows-latest` runner | CI that builds + publishes on version-tag push | NSIS installers build most reliably on a Windows runner. Trigger on `push` tags matching `v*`. |
| **actions/checkout** | `v4` | Check out the repo in CI | Standard. |
| **actions/setup-node** | `v4` | Provision Node in CI | Pin `node-version: 22` (see Node section). Enable `cache: npm`. |
| **Node.js (CI)** | `22.x` LTS | Runtime that runs esbuild + electron-builder in CI | Matches Electron 43's bundled Node 22 and the existing esbuild `target: 'node22'`. electron-builder itself only needs Node ≥ 14, but 22 keeps CI aligned with the app. |

---

## Installation

```bash
# Packager — DEV dependency (build-time only; never ships inside the app)
npm install -D electron-builder@26.15.6

# Auto-updater — RUNTIME dependency (executes inside the shipped main process)
npm install electron-updater@6.8.9
```

Result in `package.json`:

```jsonc
{
  "devDependencies": {
    "electron-builder": "26.15.6"   // pin exact — see version note below
  },
  "dependencies": {
    "electron-updater": "6.8.9"     // MUST be here, not in devDependencies
  }
}
```

---

## Integration With the Existing esbuild Build (critical — read this)

The single most important fact for the roadmapper: **electron-builder does not build your code.**
It is a packaging step that runs *after* `scripts/build.mjs`. The pipeline is:

```
npm run build:electron   (esbuild → dist/main.js, dist/preload.js, dist/renderer.js, dist/index.html)
        ↓
electron-builder --win   (wraps dist/ + Electron runtime → NSIS installer .exe + latest.yml)
        ↓
--publish always         (uploads installer + latest.yml + .blockmap to the GitHub Release)
```

### `files` / `directories` config (maps esbuild output into the package)

Add a `build` block to `package.json` (or an `electron-builder.yml`). Because esbuild **bundles**
(`bundle: true`) React, react-dom, and `@tanstack/react-virtual` *into* `dist/renderer.js`, and bundles
the core + electron-updater *into* `dist/main.js`, the packaged app needs essentially only `dist/` +
`package.json`. Keep `files` tight:

```jsonc
"build": {
  "appId": "com.jmptr.mv2-save-editor",
  "productName": "MV2 Save Editor",
  "files": [
    "dist/**/*",        // the esbuild output (main, preload, renderer, index.html)
    "package.json"      // Electron reads "main": "dist/main.js" from here
  ],
  "directories": {
    "output": "release",       // ⚠ MUST override — default is "dist", which COLLIDES with esbuild output
    "buildResources": "build"  // where icon.ico lives (build/icon.ico is auto-detected)
  },
  "asar": true
}
```

**Collision warning (concrete pitfall):** electron-builder's default `directories.output` is `dist` —
the *same directory* the esbuild build writes app code into. If left at the default, electron-builder
will write the installer into `dist/` and may try to pack its own output. **Set `directories.output`
to `release/` (or `out/`).** Flag this to the phase planner.

### esbuild + electron-updater interaction (subtle, must be handled)

`scripts/build.mjs` runs esbuild with `platform: 'node'`, `external: ['electron']`, `bundle: true`.
`electron-updater` is **not** in `external`, so esbuild will **inline electron-updater into `dist/main.js`**
at build time. This is fine and even convenient (no `node_modules` resolution needed at runtime), but has
two consequences the planner must know:

1. electron-updater must be **installed** (present in `node_modules`) when `build:electron` runs — which
   is exactly why it belongs in `dependencies` (installed by `npm ci` in CI). Placing it in `dependencies`
   is the canonical, least-surprising choice and future-proofs against ever un-bundling it.
2. If bundling electron-updater ever causes trouble (dynamic requires, `.node` assets), the fallback is
   to add `'electron-updater'` to esbuild's `external` array **and** keep it in `dependencies` so
   electron-builder packs it into the asar from `node_modules`. Start bundled; only externalize if needed.

---

## electron-updater MUST Be a Runtime Dependency (not dev)

This is the classic electron-updater footgun. Two independent reasons it lives in `dependencies`:

- **It executes in the shipped app.** `autoUpdater.checkForUpdatesAndNotify()` runs in the main process
  at runtime on the user's machine. Anything the running app imports must be a production dependency —
  electron-builder prunes devDependencies out of the packaged asar. A devDependency electron-updater =
  `Cannot find module 'electron-updater'` at runtime (unless bundled, per above — but do not rely on that
  as the *reason*).
- **latest.yml handshake.** electron-builder (build side) writes `latest.yml`; electron-updater (runtime
  side) reads it. They must come from the same release lineage so their shared `builder-util-runtime`
  (`9.7.0` for both `electron-builder@26.15.6` and `electron-updater@6.8.9`) agrees on the metadata
  format. Keep electron-builder `26.x` paired with electron-updater `6.x`.

Wiring point in the codebase: the updater is called from `electron/main.ts` (the trusted main process),
inside `app.whenReady().then(...)` alongside `createWindow()` — e.g. `autoUpdater.checkForUpdatesAndNotify()`.
It does not touch the renderer, preload, or the `save:*` IPC surface.

---

## Windows NSIS Target Specifics

Recommended `build.win` + `build.nsis`:

```jsonc
"build": {
  "win": {
    "target": "nsis",
    "icon": "build/icon.ico"        // 256x256 .ico REQUIRED for Windows
  },
  "nsis": {
    "oneClick": true,               // simplest for a solo tester: silent install + auto-launch
    "perMachine": false,            // per-USER install into %LOCALAPPDATA%\Programs — no UAC/admin
    "allowToChangeInstallationDirectory": false,
    "artifactName": "${productName}-${version}-setup.${ext}"
  },
  "publish": {
    "provider": "github",
    "owner": "jmptr",
    "repo": "mv2-save-editor"
  }
}
```

Decision rationale:

- **Why NSIS, not `portable`:** electron-updater's Windows path is built on the NSIS installer. NSIS is
  what produces `latest.yml` + `.blockmap` and performs the in-place silent replace on update. `portable`
  yields a single unmanaged `.exe` with **no** update wiring. NSIS is mandatory given the auto-update
  requirement.
- **`oneClick: true` vs assisted (`oneClick: false`):** For a single early-access tester, one-click is the
  smoothest — no wizard, installs and launches automatically, and matches how electron-updater applies
  updates silently. Choose assisted only if the user wants to pick an install directory.
- **`perMachine: false` (per-user) matters for unsigned auto-update:** per-user installs into
  `%LOCALAPPDATA%\Programs\...`, so the updater can overwrite the app **without admin elevation**. A
  per-machine install would trigger a UAC prompt on every silent update — worse UX, worse still while
  unsigned. Per-user (the default) is the right call here.
- **`artifactName`:** give the installer a stable, predictable name. The default `"${productName} Setup
  ${version}.exe"` contains a space; a hyphenated `-setup` name is cleaner for URLs/logs. Cosmetic.

**Unsigned reality (already an accepted milestone decision):** with no code-signing cert, Windows
SmartScreen shows an "unknown publisher" warning on first run, and updates are unsigned. electron-updater
still works unsigned. Do **not** add `verifyUpdateCodeSignature`/signing config this milestone.

---

## GitHub Actions: Build + Publish on Tag

Workflow shape (`.github/workflows/release.yml`):

```yaml
on:
  push:
    tags: ["v*"]           # build+publish only on version tags (e.g. v1.1.0)

permissions:
  contents: write          # REQUIRED: lets GITHUB_TOKEN create the release & upload assets

jobs:
  release:
    runs-on: windows-latest        # NSIS builds reliably on Windows
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build:electron          # esbuild → dist/  (electron-builder does NOT do this)
      - run: npx electron-builder --win --publish always
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}   # electron-builder reads GH_TOKEN (or GITHUB_TOKEN)
```

Key facts for the planner:

- **Who uploads:** `electron-builder --publish always` does the uploading itself (via the `github`
  publish provider). You do **not** need a separate `softprops/action-gh-release` / upload step. It
  creates/updates the GitHub Release and attaches `MV2 Save Editor-<ver>-setup.exe`, `latest.yml`, and
  the `.blockmap`.
- **Token:** electron-builder authenticates via the `GH_TOKEN` env var (it also accepts `GITHUB_TOKEN`).
  Map it from `secrets.GITHUB_TOKEN` — the auto-provisioned token is sufficient to publish to the same
  repo. No personal access token needed for same-repo publishing.
- **Permissions:** the workflow (or job) must declare `permissions: contents: write`. The default
  `GITHUB_TOKEN` is read-only for `contents` in many repos; without this, asset upload 403s.
- **Draft vs published:** by default electron-builder publishes as a **draft** release you then publish
  manually. electron-updater only sees **non-draft** releases — so for fully automatic updates the tester
  can pull, the release must end up published (either flip it manually, or configure the publish behavior).
  Note this as a config decision in the phase, not a blocker.
- **Build step ordering:** `npm run build:electron` MUST run before `electron-builder`. If `dist/` is
  empty, electron-builder packages an empty app. Optionally add a chained npm script:
  `"dist": "npm run build:electron && electron-builder --win --publish always"`.

---

## App Metadata electron-builder Needs

| Field | Value | Why |
|-------|-------|-----|
| `appId` | `com.jmptr.mv2-save-editor` | Windows Application User Model ID / uninstall identity. Reverse-DNS. electron-builder warns loudly without it. |
| `productName` | `MV2 Save Editor` | Installer name, Start-menu shortcut, install folder. Distinct from `package.json` `name` (`mv2-save-editor`). |
| `build.win.icon` | `build/icon.ico` | **Windows requires a `.ico`** (ideally 256×256, multi-resolution). Without one you get the default Electron icon on the exe, shortcut, and installer. This is a real deliverable — an `.ico` asset must be produced. |
| `directories.output` | `release` | Override the `dist` default to avoid colliding with esbuild output (see integration section). |
| `directories.buildResources` | `build` | Where electron-builder auto-discovers `icon.ico`. |
| `build.publish` | `{provider: github, owner: jmptr, repo: mv2-save-editor}` | Tells both electron-builder (where to upload) and electron-updater (where to poll) the same feed. Baked into the app at build time so the updater knows its feed. |

---

## Node Version (CI)

- **Use Node 22.x LTS in CI.** Electron 43 bundles Node 22, and `scripts/build.mjs` already targets
  `node22`. Matching CI to 22 keeps the esbuild output and any runtime assumptions consistent.
- electron-builder itself only requires Node ≥ 14 (`engines.node: ">=14.0.0"`), so this is about
  alignment, not a hard floor. Do not go below Node 20.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| electron-builder | Electron Forge | Only if you want an integrated build+package+publish framework and are willing to restructure the build. Overkill/disruptive here: Forge would want to own the build, duplicating/replacing the working esbuild script. electron-builder layers cleanly on top of existing output. |
| electron-updater (GitHub provider) | `update-electron-app` + `update.electronjs.org` | That combo is Forge/Squirrel-oriented and routes through Electron's hosted service; electron-updater talks to GitHub Releases directly and is the electron-builder-native path. Stick with electron-updater. |
| NSIS oneClick per-user | NSIS assisted / perMachine | Assisted if the user must choose an install dir; perMachine only if multiple Windows users share one install (not this use case — and it costs a UAC prompt on every update). |
| electron-builder `github` publish in CI | Manual `gh release upload` of the installer | Manual works but you'd have to also hand-craft `latest.yml`/`.blockmap` for the updater — error-prone. Let electron-builder generate + upload them atomically. |

---

## What NOT to Use / NOT to Do

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Adopting **electron-forge** or **electron-vite** | The build already works (esbuild). Swapping build tooling to get packaging is a large, risky, unnecessary migration. | Layer electron-builder on top of the existing esbuild output. |
| electron-updater as a **devDependency** | It runs in the shipped app; devDeps are pruned from the asar → runtime module-not-found. | Keep it in `dependencies`. |
| `win.target: "portable"` (or zip/dir) | No auto-update integration; produces no `latest.yml`/`.blockmap`. | `win.target: "nsis"`. |
| Leaving `directories.output` at the default `dist` | Collides with esbuild's `dist/` output directory. | Set `directories.output: "release"`. |
| A **code-signing** pipeline / certificates | Explicitly out of scope for v1.1 (ship unsigned). Adds cost + complexity. | Ship unsigned; accept the SmartScreen prompt. |
| `perMachine: true` while unsigned + auto-updating | Every silent update triggers a UAC elevation prompt. | `perMachine: false` (per-user). |
| A separate GH-release upload action | electron-builder already uploads via `--publish always`; a second uploader can clobber or duplicate assets. | Let electron-builder publish. |
| `electron-builder@latest` blindly | npm's `latest` dist-tag is held at **26.15.3**, while **26.15.6** (newer, under the `v26` tag) exists. `npm i -D electron-builder` gives you the older one. | Pin `electron-builder@26.15.6` explicitly. |
| macOS/Linux targets this milestone | Windows-only decision; adds signing/notarization concerns and CI matrix cost. | `--win` only. |

---

## Version Compatibility

| Package | Version | Compatible With | Notes |
|---------|---------|-----------------|-------|
| electron-builder | `26.15.6` | Electron `43.0.0` | electron-builder is Electron-version-agnostic; autodetects from the installed `electron` devDep. 26.x handles Electron 43 fine. |
| electron-updater | `6.8.9` | electron-builder `26.x` | Both depend on `builder-util-runtime@9.7.0` — the shared metadata/`latest.yml` contract. Keep 26.x ↔ 6.x paired; do not mix a 27.x builder with a 6.x updater. |
| electron-builder | `26.15.6` | Node ≥ 14 (CI on 22) | `engines.node: ">=14.0.0"`. Run CI on Node 22 to match Electron 43 / esbuild target. |
| esbuild build | `dist/main.js` bundles electron-updater | electron-updater `6.8.9` | electron-updater is CJS and bundles cleanly; if it ever doesn't, externalize it and let electron-builder pack it from node_modules. |

> **Beta channels available but NOT recommended:** `electron-builder@27.0.0-alpha.5` and
> `electron-updater@7.0.0-alpha.4` exist (June 2026). Stay on the stable 26.x / 6.x line for a shipping
> tool.

---

## Sources

- npm registry (verified live 2026-07-09): `electron-builder` latest published `26.15.6` (dist-tag `v26`; `latest` tag lags at `26.15.3`), `next` = `27.0.0-alpha.5`. HIGH
- npm registry (verified live 2026-07-09): `electron-updater` latest `6.8.9` (2026-06-05), `next` = `7.0.0-alpha.4`. HIGH
- npm metadata (verified live): `electron-builder@26.15.6` `engines.node ">=14.0.0"`; both `electron-builder@26.15.6` and `electron-updater@6.8.9` depend on `builder-util-runtime@9.7.0` (the compatibility linchpin). HIGH
- electron-builder docs — NSIS target options (`oneClick`, `perMachine`, `artifactName`), `directories.output` default `dist`, `github` publish provider, `--publish always`, `GH_TOKEN`. HIGH (stable, long-documented behavior; from training knowledge, not re-fetched live — flagged accordingly)
- electron-updater docs — GitHub Releases feed, `latest.yml` handshake, runtime-dependency requirement. HIGH (training knowledge; stable API)
- In-repo `package.json`, `scripts/build.mjs`, `electron/main.ts` — confirmed esbuild output layout (`dist/main.js|preload.js|renderer.js|index.html`), `main: "dist/main.js"`, `type: "commonjs"`, `external: ['electron']`, bundled renderer deps, `app.whenReady()` wiring point. HIGH (direct file read)

---
*Stack research for: Electron packaging & GitHub-Releases auto-update distribution (Windows NSIS) — v1.1*
*Researched: 2026-07-09*
