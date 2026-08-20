# Project Research Summary

**Project:** MV2 Save Editor — v1.1 Packaging & Distribution
**Domain:** Unsigned, self-updating Windows Electron app (NSIS installer + electron-updater from GitHub Releases, published by GitHub Actions on version-tag push)
**Researched:** 2026-07-09
**Confidence:** HIGH

## Executive Summary

This milestone adds *distribution only* on top of the already-shipping v1.0 app. The core stack (Electron 43, TypeScript, React 19, a hand-rolled esbuild build via `scripts/build.mjs`) is fixed and untouched. The task is to wrap the existing `dist/` esbuild output in a Windows **NSIS installer** with **electron-builder 26.15.6**, wire **electron-updater 6.8.9** auto-update against **GitHub Releases** (`jmptr/mv2-save-editor`), and publish via **GitHub Actions on `v*` tag push**, shipping **unsigned**. All four researchers converged on the same shape: this is ~10 lines of updater code plus configuration and CI wiring — the effort budget goes to *not breaking the update feed*, not building UI.

The single most important cross-cutting fact, repeated by every researcher: **electron-builder does not run the esbuild build.** It only packages whatever is already in `dist/`. CI must run `npm run build:electron` first, *then* `electron-builder --win --publish`. Two dependency-placement rules are load-bearing and independently flagged by all four files: (1) **electron-updater must be a runtime `dependency`**, never a devDependency (electron-builder prunes devDependencies from the asar → runtime `Cannot find module` crash), and it must also be added to esbuild's `external` array in `scripts/build.mjs` so it resolves from `node_modules` rather than being fragilely inlined; and (2) electron-builder's default `directories.output` is `dist/` — the exact folder esbuild already owns — so it **must be overridden to `release/`** to avoid a collision.

The work is naturally a dependency-ordered 3-phase sequence: **(A)** packaging config + `.ico` icon + a local unsigned NSIS build (this proves the `dist/`→asar layout survives — `preload.js`/`index.html` sibling resolution — which is the highest-risk unknown); **(B)** auto-update wiring in `electron/main.ts` behind an `app.isPackaged` guard; **(C)** GitHub Actions publish-on-tag. Critically, **auto-update is only fully verifiable across TWO sequential published releases** — a single release only ever *installs*, so validation requires publishing v1.1.0, installing it, then publishing v1.1.1 and watching the installed client update. Unsigned auto-update **does** work on Windows/NSIS (the signature-match check is skipped when there is no cert), but SmartScreen "unknown publisher" warnings are permanent at solo scale — the correct response is to document the click-through, not to try to defeat it.

## Key Findings

### Recommended Stack

Additive-only. Two new packages plus CI. electron-builder consumes esbuild's output; electron-updater runs inside the shipped main process. Both share `builder-util-runtime@9.7.0`, so keep the 26.x ↔ 6.x pairing intact.

**Core technologies:**
- **electron-builder `26.15.6`** (devDependency): packages `dist/` into a Windows NSIS `.exe`, generates `latest.yml` + `.blockmap`, and uploads to the GitHub Release. Pin exact — npm's `latest` tag lags at `26.15.3`; `26.15.6` lives under the `v26` dist-tag.
- **electron-updater `6.8.9`** (**runtime dependency**): checks GitHub Releases on launch, downloads a newer NSIS installer, applies on quit. MUST be in `dependencies`, and MUST be added to esbuild `external`.
- **NSIS target** (built into electron-builder): the *only* Windows target that wires into auto-update — it produces `latest.yml` + `.blockmap` and does the in-place silent replace. `portable`/`zip`/`dir` do not.
- **GitHub Actions** (`windows-latest`, Node 22): builds + publishes on `push` tag `v*`. NSIS builds most reliably on a Windows runner.

### Expected Features

This is a personal tool for one tester who both ships and installs. Table stakes are mostly electron-builder/electron-updater **defaults** — configuration, not construction.

**Must have (table stakes):**
- NSIS `oneClick`, per-user installer (`perMachine: false` → no UAC) with Start Menu + desktop shortcut + uninstaller — all NSIS defaults.
- Main-process updater module (`electron/updater.ts`): `checkForUpdatesAndNotify()` after `app.whenReady()`, `autoDownload`/`autoInstallOnAppQuit` defaults, native notification on `update-downloaded`, `error` logged.
- semver bump discipline (`package.json` is the version source of truth; currently `1.0.0` — must move).
- Release asset set (`.exe` + `latest.yml` + `.blockmap`) published (non-draft) to GitHub Releases.
- README note documenting the SmartScreen "More info → Run anyway" click-through.
- App `.ico` (256×256 multi-res) — a real deliverable.

**Should have (competitive, defer to v1.x):**
- Manual "Check for updates" menu item — cheap and genuinely useful for a self-shipping tester.
- "Restart to apply now" prompt (native `dialog` on `update-downloaded`).
- "About" box showing `app.getVersion()`.

**Defer (v2+ / anti-features):**
- Code signing / SmartScreen reputation building (mathematically unreachable at solo scale; explicit milestone decision to ship unsigned).
- Staged rollouts, multi-channel, in-app progress UI, self-hosted feed, macOS/Linux targets, auto-rollback.

### Architecture Approach

Four new "seams" bolt onto the unchanged v1.0 structure: a **package** step (electron-builder reads `dist/`), a **publish** step (CI only, `--publish always`), a **self-update** module (main-process only, native dialogs, no new IPC/preload surface), and a **CI workflow**. The updater stays out of the hardened renderer/preload boundary entirely — `main.ts` gains only a single `initAutoUpdater()` import + call inside its existing `app.whenReady().then(...)` block.

**Major components:**
1. `electron-builder.yml` (or `package.json "build"`) — NEW: appId, productName, `directories.output: release`, `files: [dist/**, package.json]`, `win.target: nsis`, `win.icon`, `publish: github/jmptr/mv2-save-editor`.
2. `electron/updater.ts` — NEW: `initAutoUpdater()` with `app.isPackaged` guard, event wiring, native `dialog` restart prompt.
3. `.github/workflows/release.yml` — NEW: `windows-latest`, tag-`v*` trigger, `checkout → setup-node@22 → npm ci → build:electron → electron-builder --win --publish always`, `permissions: contents: write`, `GH_TOKEN`.
4. `scripts/build.mjs` — MODIFIED (one line): add `'electron-updater'` to esbuild `external[]`.
5. `electron/main.ts` — MODIFIED (2–3 lines): import + call `initAutoUpdater()`.
6. `build/icon.ico` — NEW deliverable. `app-update.yml` is GENERATED by electron-builder — never hand-authored.

### Critical Pitfalls

1. **electron-updater in `devDependencies`** → pruned from the asar → `Cannot find module 'electron-updater'` on the shipped build. Keep it in `dependencies`; verify it physically exists in `app.asar` after packaging.
2. **electron-builder does NOT run esbuild** → packaging a stale/empty `dist/` → white-screen app. Always chain `build:electron` → `electron-builder`, in that order, in one script and in CI.
3. **`directories.output` collision** — default is `dist/` (esbuild's folder). Override to `release/` and git-ignore it.
4. **CI publishes a draft release** → updater sees nothing until a human clicks Publish. Decide and document the release-visibility model; electron-updater ignores draft/prerelease.
5. **GitHub Actions token** — needs `permissions: contents: write` AND `env: GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` on the electron-builder step, or publish 403s / silently skips. Built-in token suffices; no PAT.
6. **esbuild Windows platform binary** — `@esbuild/win32-x64` may be missing from a cross-platform `package-lock.json`, or blocked by the `allowScripts` gate on `windows-latest` → the *first* CI run goes red. Ensure the lockfile carries all optional OS/CPU variants and don't strip optional deps / postinstall.
7. **`files` globs miss renderer/`index.html`/`preload.js`** → silent white screen that still "installs fine." Include `dist/**`; verify asar contents.
8. **Updater fires in dev / `version` vs tag mismatch / one-release validation** — guard with `app.isPackaged`; make the tag `v$npm_package_version`; plan a two-release test.

## Implications for Roadmap

Suggested phase structure (dependency-respecting — each layer is testable before the next depends on it):

### Phase A: Packaging Config + Local Unsigned NSIS Build
**Rationale:** The load-bearing risk is whether the packaged asar finds `preload.js`/`index.html` as siblings of `dist/main.js`. This must be proven before anything else, and it needs no updater or CI.
**Delivers:** `electron-builder` devDep, `electron-builder.yml` (`directories.output: release`, `files: dist/**`, NSIS `oneClick`/`perMachine: false`, `win.icon`), `build/icon.ico`, `package` npm script, `release/` git-ignored, `package.json` version bump off `1.0.0`.
**Addresses:** NSIS oneClick installer + shortcuts + uninstaller (table stakes).
**Avoids:** Pitfalls 2 (build ordering), 3 (output collision), 6/7 (files globs + esbuild binary locally), Windows `.ico` note.
**Verify:** `npm run package` → `release/…Setup X.Y.Z.exe` installs and launches the real v1.0 UI (load→edit→write works from the installed build); `asar list` shows `index.html` + `preload.js` + renderer assets.

### Phase B: Auto-Update Wiring
**Rationale:** The updater can't be meaningfully tested until a package exists (Phase A), and it embeds into that package.
**Delivers:** electron-updater **runtime dependency**, `'electron-updater'` added to esbuild `external` (`build.mjs`), `electron/updater.ts` with `app.isPackaged` guard, one call from `main.ts`, `publish` block so `app-update.yml` is baked in.
**Uses:** electron-updater 6.8.9; native `dialog` (no new IPC surface).
**Implements:** Main-only updater component.
**Avoids:** Pitfalls 1 (dependency placement — an explicit success criterion), the unsigned-update assumptions, and updater-fires-in-dev.
**Verify:** packaged app boots with no updater errors; `npm start` does not throw; electron-updater is present inside `app.asar`.

### Phase C: CI Publish-on-Tag + Two-Release Validation
**Rationale:** CI is a thin automation wrapper over the now-proven local build→package→publish chain, and the full self-update round-trip is only observable once real assets exist on a published GitHub Release.
**Delivers:** `.github/workflows/release.yml` (`windows-latest`, `v*` trigger, `permissions: contents: write`, `GH_TOKEN` env, ordered `npm ci → build:electron → electron-builder --win --publish always`), tag↔version guard, SmartScreen README note.
**Avoids:** Pitfalls 4 (draft release), 5 (token/permissions), 6 (esbuild win binary in CI), version/tag mismatch.
**Verify:** push `vX.Y.Z` → draft release with `.exe` + `latest.yml` + `.blockmap` → publish → **then** publish a second bump (v1.1.1) and confirm an installed v1.1.0 client detects, downloads, and applies it (the two-release test — the only real proof).

### Phase Ordering Rationale
- **A before B:** the updater embeds into a package, so a working package must exist first; and the asar-layout risk is the highest-value thing to de-risk early.
- **B before C:** CI just automates the local chain; wiring CI before the updater/package works only automates an unproven pipeline.
- **Validation lives in C:** auto-update is unobservable with a single release — the two-release test is the milestone acceptance gate, not a Phase-B checkbox.

### Research Flags

Phases with well-documented, standard patterns — **skip `--research-phase`**:
- **Phase A:** electron-builder NSIS config is thoroughly documented; the only unknowns are this repo's specific `dist/` layout, already mapped in ARCHITECTURE.md.
- **Phase B:** electron-updater main-process wiring is ~15 lines with a canonical shape already captured.

Phase warranting extra care during planning (not new web research, but explicit success criteria):
- **Phase C:** the esbuild `@esbuild/win32-x64` / lockfile / `allowScripts` interaction on `windows-latest` is the single most likely first-CI-run failure and is repo-specific — plan a lockfile-coverage check and a "run the same install path that works locally" step.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Both package versions verified live against npm on 2026-07-09; integration mechanics from stable, long-documented electron-builder/electron-updater behavior. |
| Features | HIGH | electron-builder NSIS + electron-updater defaults verified against current official docs; SmartScreen behavior confirmed via Microsoft Learn. |
| Architecture | HIGH | NEW/MODIFIED file list grounded in direct inspection of this repo's `build.mjs`, `main.ts`, `preload.ts`, `package.json`. |
| Pitfalls | HIGH | Behavior verified against official docs + the electron-builder/esbuild issue trackers, grounded in this repo's actual files. |

**Overall confidence:** HIGH

### Gaps to Address
- **Draft-vs-published release model:** electron-builder defaults to draft; the milestone must explicitly choose "leave draft + manual publish step (with a runbook)" vs "auto-publish." Decide during Phase C planning.
- **esbuild lockfile platform coverage:** the actual `package-lock.json` on the Windows runner is unverified — confirm it records `@esbuild/win32-x64` (or regenerate) before the first CI run.
- **`electron-builder.yml` vs `package.json "build"`:** functionally equivalent; pick exactly one (a `"build"` key would override the yml). Cosmetic decision for Phase A.
- **Config nuance:** STACK.md suggests `oneClick: true`; ARCHITECTURE.md example shows `oneClick: false`. Both note per-user (`perMachine: false`). Resolve the oneClick choice in Phase A (recommend `true` for the solo silent-install path).

## Sources

### Primary (HIGH confidence)
- npm registry (verified live 2026-07-09) — `electron-builder@26.15.6` (dist-tag `v26`; `latest` lags at `26.15.3`), `electron-updater@6.8.9`; both depend on `builder-util-runtime@9.7.0`.
- electron-builder docs — Auto Update, NSIS options, Publish, GitHub Actions.
- electron-updater docs / AppUpdater.ts source — `autoDownload`/`autoInstallOnAppQuit` defaults, `app-update.yml` at `process.resourcesPath`.
- Electron — Updating Applications — `app.isPackaged` guard, whenReady wiring.
- Microsoft Learn — SmartScreen reputation — unsigned reputation resets every version.
- esbuild issue #789 — optional-dependency platform binaries; cross-platform lockfile trap.
- In-repo `package.json`, `scripts/build.mjs`, `electron/main.ts`, `electron/preload.ts` — direct inspection of esbuild output layout, `external: ['electron']`, `main: dist/main.js`, `type: commonjs`, `allowScripts` gate, `version: 1.0.0`.

### Secondary (MEDIUM confidence)
- electron-builder issues #4176, #5636, #4701, #1900 — token/permissions, unsigned-update behavior.
- Doyensec — electron-updater signature bypass — integrity-vs-authenticity for unsigned feeds.

---
*Research completed: 2026-07-09*
*Ready for roadmap: yes*
