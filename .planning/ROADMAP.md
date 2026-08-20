# Roadmap: MV2 Save Editor

## Milestones

- ✅ **v1.0 MVP** — Phases 1-5 (shipped 2026-07-05)
- 🚧 **v1.1 Packaging & Distribution** — Phases 6-8 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-5) — SHIPPED 2026-07-05</summary>

Built the save editor inside-out so corruption risk was proven away before any UI existed: a pure-TS format core (primitives + Brotli round-trip, layout parser + fresh-offset FieldTable, same-width patch engine + validation + XP table) — all headless and golden-file tested against a real `.sav` corpus — then a hardened Electron main process with secure IPC + non-destructive new-file write, and finally the React renderer surfacing browse/search/edit/preview/confirm. Every edit's ultimate acceptance was a mandatory manual in-game load.

- [x] Phase 1: Binary Primitives + Brotli Codec (3/3 plans) — completed 2026-07-03
- [x] Phase 2: Format Parser + FieldTable Model (5/5 plans) — completed 2026-07-04
- [x] Phase 3: Patcher + Validation + XP Table (2/2 plans) — completed 2026-07-04
- [x] Phase 4: Electron Shell + Secure IPC + Non-Destructive Write (5/5 plans) — completed 2026-07-04
- [x] Phase 5: Renderer UI — Browse, Search, Edit, Preview (8/8 plans) — completed 2026-07-05

Full detail: `.planning/milestones/v1.0-ROADMAP.md`
Post-ship fix: bank phantom-stack corruption bug root-caused + fixed via explicit tab-walk (`b4ac6c4`), confirmed in-game.

</details>

### 🚧 v1.1 Packaging & Distribution (In Progress)

**Milestone Goal:** Produce a downloadable, self-updating Windows installer for the MV2 Save Editor, published automatically to GitHub Releases — shipped unsigned. The v1.0 app and its esbuild build are untouched; this milestone adds only a package step, a main-process self-update seam, and a CI publish workflow.

**Execution is strictly dependency-ordered:** the updater embeds into a package (so Phase 6 must exist before Phase 7), and CI merely automates the now-proven local build→package→publish chain (so Phase 7 before Phase 8). Auto-update is only *fully* observable across two sequential published releases, so that proof lives in Phase 8.

- [x] **Phase 6: Packaging — Local Windows NSIS Installer** - electron-builder wraps the existing `dist/` into a per-user NSIS `.exe` that installs and runs the full editor loop (completed 2026-07-18)
- [x] **Phase 7: Auto-Update from GitHub Releases** - electron-updater self-updates a packaged app on launch, inert in dev (completed 2026-07-18)
- [ ] **Phase 8: Release CI — Publish-on-Tag + Two-Release Validation** - GitHub Actions builds + publishes the installer on `v*` tag push, proven by an end-to-end self-update

## Phase Details

### Phase 6: Packaging — Local Windows NSIS Installer

**Goal**: A developer can turn the already-built esbuild output into an installable Windows `.exe`, and the installed app runs the full editor identically to the dev build.
**Depends on**: Phase 5 (v1.0 — the built `dist/` this phase packages)
**Requirements**: PKG-01, PKG-02, PKG-03, PKG-04
**Success Criteria** (what must be TRUE):

  1. Running a single npm script (`npm run package`) produces `release/…Setup X.Y.Z.exe` by packaging the existing `dist/` — electron-builder does not rebuild the TypeScript, and its output lands in `release/`, leaving esbuild's `dist/` untouched.
  2. The installed app launches and completes the full load → browse/search → edit → preview → write loop identically to the dev build, because the packaged asar resolves `preload.js` and `index.html` as siblings of `dist/main.js`.
  3. Installing runs per-user with no admin/UAC prompt (`oneClick: true`, `perMachine: false`), creates a Start Menu shortcut, and provides a working uninstaller.
  4. The installed app shows its own application `.ico` icon and carries a set `appId` and product name.

**Plans**: 3/3 plans complete
**Wave 1**

  - [x] 06-01-PLAN.md — Placeholder application icon: zero-dep `.ico` generator + committed `build/icon.ico` + icon-validity test (PKG-04)
  - [x] 06-02-PLAN.md — electron-builder config + identity + version bump + `package` script + config/dist-layout tests (PKG-01/02/03/04, automatable slice)

**Wave 2** *(blocked on Wave 1 completion)*

  - [x] 06-03-PLAN.md — Manual Windows install-and-run acceptance gate (PKG-01/02/03 runtime)

### Phase 7: Auto-Update from GitHub Releases

**Goal**: A packaged app checks GitHub Releases on launch and self-updates in the background, while staying completely inert in dev/unpackaged runs.
**Depends on**: Phase 6 (the updater embeds into a working package)
**Requirements**: UPD-01, UPD-02, UPD-03
**Success Criteria** (what must be TRUE):

  1. On launch, a packaged app checks the GitHub Releases feed and downloads a newer published version in the background.
  2. When a downloaded update is ready, the user sees an "update ready" notification, and the update is installed when the app quits.
  3. In dev/unpackaged runs (`npm start` / `electron .`), the updater is inert — guarded by `app.isPackaged`, it never fires or throws.
  4. electron-updater ships as a runtime dependency that is physically present inside `app.asar` after packaging (not pruned) and is listed in esbuild's `external` array so it resolves from `node_modules`.

**Plans**: 3/3 plans complete
**Wave 1** *(parallel — no file overlap)*

  - [x] 07-01-PLAN.md — electron-updater dependency + esbuild `external` + `publish` block + packaging config test; supply-chain legitimacy gate (UPD-01/02, D-06/D-07, success criterion 4 static slice)
  - [x] 07-02-PLAN.md — main-process updater seam: zero-dep fs logger + guarded `initAutoUpdater()` behind `app.isPackaged` + logger/seam tests (UPD-01/02/03, D-01..D-05/D-08)

**Wave 2** *(blocked on Wave 1 completion)*

  - [x] 07-03-PLAN.md — Manual Windows/CI packaged acceptance gate: electron-updater physically in `app.asar` + app runs + `updater.log` written (UPD-01/02/03 runtime)

### Phase 8: Release CI — Publish-on-Tag + Two-Release Validation

**Goal**: Pushing a version tag builds the Windows installer in CI and publishes the full asset set to a GitHub Release, and an installed client actually self-updates across two sequential releases.
**Depends on**: Phase 7 (CI automates the now-proven local build→package→publish chain, and the updater must work before the round-trip can be validated)
**Requirements**: CI-01, CI-02, CI-03
**Success Criteria** (what must be TRUE):

  1. Pushing a `v*` version tag triggers a GitHub Actions workflow on `windows-latest` (Node 22) that runs `npm run build:electron` before packaging with electron-builder.
  2. The workflow publishes `.exe` + `latest.yml` + `.blockmap` as assets on the matching GitHub Release (`permissions: contents: write`, `GH_TOKEN` passed), so the auto-updater feed resolves.
  3. The release is created as a draft and published manually — the auto-updater ignores it until a human publishes, giving a safe gate.
  4. Two-release proof: after publishing v1.1.0, installing it, then publishing a second bump (v1.1.1), the installed v1.1.0 client detects, downloads, and applies the update.

**Plans**: 1/2 plans executed
**Wave 1**

  - [x] 08-01-PLAN.md — Tag-triggered `release.yml` workflow + zero-dep static workflow/lockfile test (CI-01/02/03 static slice)

**Wave 2** *(blocked on Wave 1 completion)*

  - [ ] 08-02-PLAN.md — Manual Windows/GitHub runtime gate: tag→draft→publish→install, plus the v1.1.1 lockstep bump and the two-release self-update proof (CI-01/02/03 runtime + SC4)

## Progress

**Execution Order:**
Phases execute in numeric order: 6 → 7 → 8

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Binary Primitives + Brotli Codec | v1.0 | 3/3 | Complete | 2026-07-03 |
| 2. Format Parser + FieldTable Model | v1.0 | 5/5 | Complete | 2026-07-04 |
| 3. Patcher + Validation + XP Table | v1.0 | 2/2 | Complete | 2026-07-04 |
| 4. Electron Shell + Secure IPC + Non-Destructive Write | v1.0 | 5/5 | Complete | 2026-07-04 |
| 5. Renderer UI — Browse, Search, Edit, Preview | v1.0 | 8/8 | Complete | 2026-07-05 |
| 6. Packaging — Local Windows NSIS Installer | v1.1 | 3/3 | Complete    | 2026-07-18 |
| 7. Auto-Update from GitHub Releases | v1.1 | 3/3 | Complete   | 2026-07-18 |
| 8. Release CI — Publish-on-Tag + Two-Release Validation | v1.1 | 1/2 | In Progress|  |
