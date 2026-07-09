# Architecture Research

**Domain:** Electron desktop-app packaging, self-update, and CI publishing — integrated into an existing esbuild-built Electron 43 app (MV2 Save Editor)
**Researched:** 2026-07-09
**Confidence:** HIGH

> Integration research for milestone **v1.1 Packaging & Distribution**. Fixed decisions (do not revisit): Windows-only NSIS, electron-updater from GitHub Releases, GitHub Actions publish-on-tag, **unsigned**. This maps the NEW packaging/update/CI pieces onto the *already-built* esbuild + `electron/main.ts` structure. It does **not** redesign the v1.0 app (see git history for the v1.0 core/main/renderer architecture).

---

## Standard Architecture

### System Overview — the four seams v1.1 adds

```
┌──────────────────────────────────────────────────────────────────────┐
│  DEVELOPER MACHINE / CI RUNNER (windows-latest)                       │
│                                                                       │
│   [1] BUILD (existing, unchanged mechanism)                           │
│   npm run build:electron → node scripts/build.mjs                     │
│        esbuild → dist/{main.js, preload.js, renderer.js,              │
│                        renderer.css, *.map} + copy index.html         │
│                        │                                              │
│                        ▼  (dist/ is the INPUT to packaging)           │
│   [2] PACKAGE (NEW)                                                   │
│   electron-builder --win nsis                                         │
│        reads config (electron-builder.yml OR package.json "build")   │
│        files: dist/** + package.json + prod node_modules             │
│        → app.asar (dist/ + package.json + electron-updater)          │
│        → NSIS installer  release/MV2 Save Editor Setup X.Y.Z.exe     │
│        → release/latest.yml   (update feed manifest)                 │
│        → release/*.exe.blockmap (differential-download map)          │
│        → BAKES app-update.yml INTO the asar from publish config      │
│                        │                                              │
│                        ▼  (only when --publish)                      │
│   [3] PUBLISH (NEW, CI only)                                         │
│   electron-builder --publish always  (GH_TOKEN)                     │
│        uploads .exe + latest.yml + .blockmap ────────────┐          │
└───────────────────────────────────────────────────────────┼─────────┘
                                                             ▼
                             ┌─────────────────────────────────────────┐
                             │  GITHUB RELEASE  (tag vX.Y.Z)           │
                             │   • MV2 Save Editor Setup X.Y.Z.exe     │
                             │   • latest.yml   ◄── the update feed    │
                             │   • *.exe.blockmap                      │
                             └─────────────────────────────────────────┘
                                                             ▲
                                                             │ HTTPS poll on launch
┌────────────────────────────────────────────────────────────┼─────────┐
│  USER MACHINE (installed app)                               │         │
│   [4] SELF-UPDATE (NEW)                                     │         │
│   electron/main.ts → autoUpdater (electron-updater)         │         │
│        app.whenReady → checkForUpdatesAndNotify() ──────────┘         │
│        reads bundled app-update.yml → provider=github, owner/repo    │
│        compares installed version vs latest.yml → download → notify  │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| `scripts/build.mjs` (existing, **1 line MODIFIED**) | Compile app source → `dist/`. Must run **before** packaging. Add `electron-updater` to esbuild `external` so it loads from `node_modules`, not the bundle. | esbuild, unchanged mechanism |
| electron-builder config (**NEW**) | Declares appId, product name, NSIS target, `directories.output`, `files` globs, and the `publish` provider (github/jmptr/mv2-save-editor). | `electron-builder.yml` (recommended) or `package.json` `"build"` key |
| Updater module (**NEW**) | Wires `autoUpdater` in the main process: guard on `app.isPackaged`, call after `whenReady`, wire events + native dialogs. | `electron/updater.ts`, imported by `electron/main.ts` |
| `electron/main.ts` (existing, **MODIFIED**) | Add one `initAutoUpdater()` call inside the existing `app.whenReady().then(...)` block. Nothing else changes. | 2–3 line diff |
| `app-update.yml` (**generated, not authored**) | Runtime update feed config read by electron-updater. electron-builder generates it from the `publish` block and bakes it into `resources/`. | Do NOT hand-write |
| `.github/workflows/release.yml` (**NEW**) | On `push` tag `v*`: checkout → setup-node → `npm ci` → `build:electron` → `electron-builder --publish always`. | Single `windows-latest` job |
| `build/icon.ico` (**NEW**) | NSIS installer + app icon. electron-builder auto-discovers `build/icon.ico`. | 256×256 multi-res `.ico` |

---

## Recommended Project Structure

```
mv2-save-editor/
├── electron/
│   ├── main.ts            # MODIFIED: call initAutoUpdater() in whenReady
│   ├── preload.ts         # UNCHANGED for v1 (updater stays main-only)
│   ├── updater.ts         # NEW: autoUpdater wiring + native dialogs
│   ├── renderer.tsx       # UNCHANGED
│   ├── index.html         # UNCHANGED
│   └── ui/                # UNCHANGED
├── scripts/
│   └── build.mjs          # MODIFIED: add 'electron-updater' to external[]
├── build/
│   └── icon.ico           # NEW: installer/app icon (buildResources dir)
├── .github/workflows/
│   └── release.yml        # NEW: publish-on-tag CI
├── electron-builder.yml   # NEW: packaging + publish config
├── dist/                  # esbuild output (git-ignored) — INPUT to packaging
├── release/               # NEW electron-builder output dir (git-ignored)
└── package.json           # MODIFIED: version, deps, scripts
```

### Structure Rationale

- **`electron-builder.yml` over `package.json "build"`:** A dedicated YAML file keeps ~30 lines of packaging config out of the already-busy `package.json`, allows comments, and avoids merge noise on the manifest that also carries `main`/`scripts`/`deps`. Both are functionally equivalent; electron-builder reads either. Chosen for clarity. (If you prefer one-file simplicity, the `"build"` key works identically — pick exactly one; a `"build"` key in package.json would *override* the yml.)
- **`electron/updater.ts` separate from `main.ts`:** `main.ts` is the security-critical IPC trust boundary (documented mitigations T-4-01/07/11). Keeping updater logic in its own module preserves that file's focus; `main.ts` gains only a single import + call.
- **`release/` as the electron-builder output dir (NOT `dist/`):** **Critical integration point.** electron-builder's *default* `directories.output` is `dist/` — the exact folder the esbuild build already owns. Leaving the default makes electron-builder and esbuild fight over `dist/`. Override to `release/` so the stages have disjoint outputs: esbuild writes `dist/` (app code), electron-builder reads `dist/` and writes the installer to `release/`.

---

## Architectural Patterns

### Pattern 1: Build-then-package, two disjoint output dirs

**What:** The esbuild build (`dist/`) is a hard prerequisite of packaging. electron-builder does **not** compile TypeScript — it only copies already-built files into an asar and wraps them in an installer. The npm script chains them: build first, package second.

**When to use:** Any Electron app with a custom (non-electron-builder) bundler. Exactly our case (hand-rolled esbuild; no electron-vite/Forge integration).

**Trade-offs:** You own the ordering (a stale `dist/` silently ships old code). Mitigate by always running `build:electron` immediately before `electron-builder` in the same script and in CI.

**Example:**
```jsonc
// package.json scripts (NEW/MODIFIED)
"build:electron": "node scripts/build.mjs",            // existing, unchanged
"package": "npm run build:electron && electron-builder --win nsis",                    // NEW: local unsigned build
"publish": "npm run build:electron && electron-builder --win nsis --publish always"    // NEW: CI publish
```

### Pattern 2: `files` globs preserve the `dist/` layout; node_modules is automatic

**What:** electron-builder's `files` globs select the *app's own* files into the asar. Production `node_modules` are included **automatically** (electron-builder walks `dependencies` and prunes `devDependencies`). So `files` only needs the app payload; do NOT try to hand-list node_modules.

**When to use:** Always. The globs must reproduce the `dist/` structure exactly, because packaged `main.js` resolves `join(__dirname, 'preload.js')` and `join(__dirname, 'index.html')` — those siblings must exist under `app.asar/dist/`.

**Trade-offs:** Over-broad globs bloat the asar with `src/`, `test/`, `.planning/`. Explicit include keeps it lean; `dist/**` naturally excludes those dirs since they aren't matched.

**Example (`electron-builder.yml`):**
```yaml
appId: com.jmptr.mv2saveeditor
productName: MV2 Save Editor
directories:
  output: release            # NOT dist/ — avoids collision with esbuild output
  buildResources: build      # electron-builder auto-finds build/icon.ico
files:
  - dist/**                  # main.js, preload.js, renderer.js, renderer.css, index.html, *.map
  - package.json             # required: 'main' + version live here
  # production node_modules (incl. electron-updater) are added AUTOMATICALLY
  # src/, test/, .planning/, .github/ are not matched by dist/** so they never enter the asar
win:
  target: nsis
  icon: build/icon.ico
nsis:
  oneClick: false            # allow install-dir choice; set true for a silent one-click installer
  perMachine: false          # per-user install → no UAC elevation (fits unsigned/personal use)
publish:
  provider: github
  owner: jmptr
  repo: mv2-save-editor
  # releaseType defaults to 'draft' — assets upload to a DRAFT release; publish manually
```

**Key dependency rule:** electron-builder auto-prunes `devDependencies`. Therefore **`electron-updater` MUST be a `dependency`**, not a `devDependency` — otherwise it is pruned out of the asar and the app crashes on `require('electron-updater')`. `electron-builder` itself stays a `devDependency`.

### Pattern 3: External the updater, don't bundle it

**What:** The esbuild build currently sets `external: ['electron']`. Add `'electron-updater'`. Then `main.js` keeps a plain `require('electron-updater')` that resolves from the packaged `node_modules` at runtime.

**When to use:** For any Node package that (a) reads its own files at runtime (electron-updater loads `app-update.yml` relative to `process.resourcesPath`) or (b) has a large transitive tree. Bundling electron-updater into `main.js` is *possible* but fragile (its js-yaml/lodash deps, dynamic requires). Externalizing is the canonical path and pairs naturally with electron-builder's automatic node_modules inclusion.

**Trade-offs:** Requires electron-updater present in `node_modules` at package time (guaranteed, since it is a `dependency`). Slightly larger asar than a tree-shaken bundle — irrelevant for a personal tool.

**Example (`scripts/build.mjs`, MODIFIED — one line):**
```js
const common = {
  bundle: true, platform: 'node', format: 'cjs', target: 'node22',
  sourcemap: true,
  external: ['electron', 'electron-updater'],   // <-- add electron-updater
  outdir: 'dist',
};
```

### Pattern 4: Main-only updater with native dialogs (no renderer surface for v1)

**What:** Keep all update logic in the main process. Use Electron's native `dialog` for the "update available / restart to install" prompts — the same `dialog` module `main.ts` already imports. No new preload channels, no renderer UI, no `contextBridge` changes.

**When to use:** v1.1 explicitly. The renderer's IPC surface is a hardened, deliberately narrow four-channel bridge (`save:*`). Adding update-UI channels would widen that boundary for little benefit on a single-user tool. Native dialogs are sufficient.

**Trade-offs:** No in-app download progress bar. Acceptable — updates are small and infrequent. A renderer progress UI (via a new `update:*` IPC channel + preload method) is a clean v1.2 extension if desired.

**Example (`electron/updater.ts`, NEW):**
```ts
import { app, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';

export function initAutoUpdater(): void {
  if (!app.isPackaged) return;         // never run against a missing app-update.yml in dev
  autoUpdater.autoDownload = true;     // download in background
  autoUpdater.on('update-downloaded', async () => {
    const { response } = await dialog.showMessageBox({
      type: 'info', buttons: ['Restart now', 'Later'], defaultId: 0,
      message: 'An update has been downloaded. Restart to apply?',
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });
  autoUpdater.on('error', () => { /* log; never crash the app on update failure */ });
  void autoUpdater.checkForUpdatesAndNotify();
}
```
```ts
// electron/main.ts (MODIFIED) — inside the existing whenReady block
import { initAutoUpdater } from './updater';
app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
  initAutoUpdater();                   // <-- the only functional addition
  app.on('activate', () => { /* unchanged */ });
});
```

---

## Data Flow

### Release / update artifact flow (tag → CI → release → self-update)

```
Developer: bump package.json version X.Y.Z  →  commit  →  git tag vX.Y.Z  →  git push --tags
      │  (tag MUST match package.json version; electron-builder does not auto-bump)
      ▼
GitHub Actions: on push tag 'v*'
      checkout → setup-node@22 → npm ci → npm run build:electron
                                        → electron-builder --win nsis --publish always
      │  env GH_TOKEN = secrets.GITHUB_TOKEN ; permissions: contents: write
      ▼
electron-builder generates + uploads to a DRAFT GitHub Release:
      • MV2 Save Editor Setup X.Y.Z.exe          (NSIS installer)
      • latest.yml                                (version, sha512, path — the update feed)
      • MV2 Save Editor Setup X.Y.Z.exe.blockmap  (differential-download map)
      ▼
Human: review the draft → click Publish release   (draft is invisible to updaters until this)
      ▼
Installed apps (on next launch): autoUpdater fetches latest.yml from the published release,
      compares X.Y.Z > installed → downloads .exe (using .blockmap for delta) → verifies sha512
      → 'update-downloaded' → native dialog → quitAndInstall()
```

### Why draft-first (default) is the right timing for v1

electron-builder's GitHub publisher creates a **draft** release by default, and **electron-updater ignores draft/pre-release** entries (it reads the latest *published* release). This gives a safe gate: CI attaches the artifacts, you sanity-check the installer, then publish to make it live to all clients atomically. Setting `releaseType: release` would auto-publish (faster, less safe) — keep the default draft for v1.1.

### Version-source-of-truth flow

```
package.json "version"  ──►  baked into app  ──►  compared by autoUpdater against latest.yml "version"
        ▲                                                         ▲
        └── same string as the git tag (minus the 'v') ──────────┘   (latest.yml comes from the release)
```
Mismatch between the tag and `package.json.version` is the most common self-update bug — the workflow can add a guard step that fails if `refs/tags/v$VERSION` ≠ `package.json` version.

---

## CI Job Shape

Single job, `windows-latest` (NSIS must be built on Windows for an unsigned personal build; cross-building Windows installers from Linux is possible but adds Wine/mono friction — not worth it here).

```yaml
# .github/workflows/release.yml (NEW)
name: release
on:
  push:
    tags: ['v*']
permissions:
  contents: write            # required for electron-builder to create/upload the Release
jobs:
  build:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22    # matches Electron 43's bundled Node 22 line; satisfies electron-builder 26
          cache: npm
      - run: npm ci
      - run: npm run build:electron        # esbuild → dist/  (MUST precede packaging)
      - run: npx electron-builder --win nsis --publish always
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}   # electron-builder reads GH_TOKEN
```

Notes:
- `secrets.GITHUB_TOKEN` is auto-provided; no PAT needed for same-repo releases. It needs `contents: write`, granted via the job `permissions` block.
- No signing secrets (unsigned v1.1). SmartScreen "unknown publisher" is accepted per milestone decision.
- Node 22 on the runner is for *tooling* (esbuild, electron-builder); it need not byte-match Electron's internal Node, but 22 is the clean, compatible choice.

---

## Anti-Patterns

### Anti-Pattern 1: Letting electron-builder default its output to `dist/`
**What people do:** Omit `directories.output`, so electron-builder writes into `dist/` — the folder esbuild owns.
**Why it's wrong:** The two stages collide; installer artifacts mix with app bundles, and cleaning one wipes the other.
**Do this instead:** Set `directories.output: release` and git-ignore `release/`.

### Anti-Pattern 2: electron-updater as a devDependency
**What people do:** `npm i -D electron-updater` alongside electron-builder.
**Why it's wrong:** electron-builder prunes devDependencies from the asar → runtime `Cannot find module 'electron-updater'` crash.
**Do this instead:** electron-updater is a **runtime `dependency`**; only `electron-builder`, `electron`, esbuild, etc. are devDependencies.

### Anti-Pattern 3: Hand-writing `app-update.yml`
**What people do:** Author an `app-update.yml` and copy it into the build.
**Why it's wrong:** electron-builder generates it from the `publish` block and bakes it into `resources/`. A hand-written one drifts and gets overwritten.
**Do this instead:** Configure `publish: { provider: github, owner, repo }`. Let electron-builder emit `app-update.yml`. Only add a `dev-app-update.yml` if you want to test updates in a non-packaged dev run.

### Anti-Pattern 4: Running `autoUpdater` in dev / without `app.isPackaged`
**What people do:** Call `checkForUpdatesAndNotify()` unconditionally.
**Why it's wrong:** In an unpackaged run there is no `app-update.yml`; electron-updater throws.
**Do this instead:** Guard with `if (!app.isPackaged) return;` (as in `updater.ts` above).

### Anti-Pattern 5: Bundling electron-updater into main.js via esbuild
**What people do:** Leave `electron-updater` out of `external`, so esbuild inlines it.
**Why it's wrong:** Its transitive deps + runtime file reads (`app-update.yml` resolution) make bundling fragile.
**Do this instead:** Add `electron-updater` to esbuild `external`; ship it in node_modules (auto-included by electron-builder).

---

## Integration Points

### NEW vs MODIFIED files (authoritative list for planners)

| File | Status | Change |
|------|--------|--------|
| `electron-builder.yml` | **NEW** | appId, productName, `directories.output: release`, `files` globs, `win.nsis` target, `win.icon`, `publish.github` (jmptr/mv2-save-editor) |
| `electron/updater.ts` | **NEW** | `initAutoUpdater()` — `app.isPackaged` guard, event wiring, native `dialog` restart prompt |
| `.github/workflows/release.yml` | **NEW** | `windows-latest`, tag-`v*` trigger, checkout→setup-node 22→`npm ci`→`build:electron`→`electron-builder --publish always`, `contents: write`, `GH_TOKEN` |
| `build/icon.ico` | **NEW** | 256×256 multi-resolution installer/app icon |
| `package.json` | **MODIFIED** | add `electron-updater` to `dependencies`; add `electron-builder` to `devDependencies`; add `package`/`publish` scripts; version bump per release; keep `main: dist/main.js` unchanged |
| `scripts/build.mjs` | **MODIFIED** | add `'electron-updater'` to esbuild `external` array (one line) |
| `electron/main.ts` | **MODIFIED** | import + call `initAutoUpdater()` inside existing `app.whenReady().then(...)` |
| `.gitignore` | **MODIFIED** | add `release/` (confirm `dist/` already ignored — it is) |
| `electron/preload.ts` | **UNCHANGED** | updater is main-only for v1; no new IPC surface |
| `app-update.yml` | **GENERATED** | produced by electron-builder into the asar; never authored/committed |
| `latest.yml`, `*.exe`, `*.blockmap` | **GENERATED** | build artifacts in `release/`; uploaded to the Release, not committed |

### External services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| GitHub Releases | `publish.provider: github` → electron-builder uploads via `GH_TOKEN`; electron-updater reads published-release `latest.yml` over HTTPS | Draft-by-default; publish manually to go live. Owner/repo `jmptr/mv2-save-editor`. |
| GitHub Actions | `push` tag `v*` trigger; `secrets.GITHUB_TOKEN` + `permissions: contents: write` | Same-repo token; no PAT. Windows runner. |

### Internal boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `build.mjs (dist/)` ↔ `electron-builder` | Filesystem handoff: esbuild writes `dist/`, electron-builder reads it. **Strict ordering.** | Never package a stale `dist/`; chain in one script/CI step. |
| `main.ts` ↔ `updater.ts` | One import + one call in `whenReady` | Keeps the hardened IPC file otherwise untouched. |
| `updater.ts` ↔ GitHub | electron-updater + bundled `app-update.yml` | No preload/renderer involvement for v1. |

---

## Suggested Build Order for Phases (dependency-respecting)

Each layer is testable before the next depends on it:

1. **Phase A — Packaging config + local unsigned build.**
   Add `electron-builder` (dev dep), create `electron-builder.yml` (with `directories.output: release`, `files`, NSIS, icon), add `build/icon.ico`, add the `package` script, ignore `release/`; `main.ts`/build mechanism unchanged. **Verify:** `npm run package` produces `release/…Setup X.Y.Z.exe` that installs and launches the existing v1.0 app (load→edit→write still works from the installed build). This proves the `dist/`→asar layout (preload/index.html sibling resolution) survives packaging — the highest-risk unknown. No updater, no CI yet.

2. **Phase B — Auto-update wiring.**
   Add `electron-updater` (runtime dep), mark it esbuild-external (`build.mjs`), create `electron/updater.ts`, call it from `main.ts`, add the `publish` block so `app-update.yml` is baked in. **Verify:** packaged app boots without updater errors; optionally use `dev-app-update.yml` or a throwaway pre-release to observe an update being detected/downloaded. Depends on A (needs a working package to embed the updater into).

3. **Phase C — CI publish-on-tag.**
   Add `.github/workflows/release.yml`. **Verify:** push a `vX.Y.Z` tag → workflow builds → draft Release appears with `.exe` + `latest.yml` + `.blockmap`. Publish the draft → confirm an already-installed Phase-B build self-updates to it end-to-end. Depends on A+B (CI just automates the same `build`→`package`→`publish` chain, and the update loop is only provable once real assets exist on a published Release).

Ordering rationale: config→local build is the load-bearing risk (does the packaged asar find `preload.js`/`index.html`?); the updater can't be meaningfully tested until a package exists; CI is a thin automation wrapper over the now-proven local `build+package+publish` pipeline, and the full self-update round-trip is only observable with published GitHub assets.

---

## Version / Compatibility Notes

| Package | Version | Notes |
|---------|---------|-------|
| electron-builder | `26.15.x` (latest stable) | Recommend staying on **26.x**. v27 exists but is a breaking major (native-ESM config, Node ≥ 22.12) — no v1.1 benefit and adds ESM friction against this `type: "commonjs"` repo. |
| electron-updater | `6.x` (latest 6.8.x) | Runtime `dependency`. Ships with electron-builder's ecosystem; NSIS auto-update supported out of the box. |
| Electron | `43.0.0` (existing) | Bundles Node 22; `app.isPackaged`, native `dialog`, NSIS updater all supported. |
| Node (CI runner) | `22` | Tooling runtime for esbuild + electron-builder 26. |

---

## Sources

- [electron-builder — Auto Update docs](https://www.electron.build/auto-update) — GitHub provider, `app-update.yml` generation, NSIS updater. HIGH
- [electron-builder — releases / npm](https://www.npmjs.com/package/electron-builder) — latest stable 26.15.x; v27 breaking (ESM, Node ≥ 22.12). HIGH
- [electron-updater (npm) + CHANGELOG](https://github.com/electron-userland/electron-builder/blob/master/packages/electron-updater/CHANGELOG.md) — 6.x; provider config, `checkForUpdatesAndNotify`, `app-update.yml` at `process.resourcesPath`. HIGH
- [Electron — Updating Applications](https://www.electronjs.org/docs/latest/tutorial/updates) — `app.isPackaged` guard, whenReady wiring. HIGH
- In-repo `scripts/build.mjs`, `electron/main.ts`, `electron/preload.ts`, `package.json`, `electron/index.html` — actual esbuild output layout (`dist/{main,preload,renderer}.js`, `renderer.css`, `index.html`), `join(__dirname, …)` sibling resolution, `type: "commonjs"`, `main: dist/main.js`, current `external: ['electron']`. HIGH (direct inspection)

---
*Architecture research for: Electron packaging + self-update + CI publishing integrated with an existing esbuild Electron 43 app*
*Researched: 2026-07-09*
