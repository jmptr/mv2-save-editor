---
phase: 07-auto-update-from-github-releases
verified: 2026-07-18T19:05:00Z
status: passed
score: 4/4 success criteria verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: none
  gaps_closed: []
  gaps_remaining: []
  regressions: []
human_gate:
  plan: 07-03
  attested_by: developer
  recorded_in: 07-03-SUMMARY.md
  runtime_criteria: [1, 2, "4 (physical-asar half)"]
  result: PASS
---

# Phase 7: Auto-Update from GitHub Releases — Verification Report

**Phase Goal:** A packaged app checks GitHub Releases on launch and self-updates in the background, while staying completely inert in dev/unpackaged runs.
**Verified:** 2026-07-18T19:05:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

Phase 7 splits cleanly into an **any-OS static/wiring slice** (directly verifiable on this Linux host) and a **packaged-Windows runtime slice** (only observable on a native Windows build, covered by the developer-attested Plan 07-03 human acceptance gate). Both slices are satisfied. End-to-end update *apply* is explicitly Phase 8 scope (needs a live feed + two sequential releases) and is correctly out of Phase 7's bar.

### Success Criteria

| # | Criterion | Verdict | Evidence |
|---|-----------|---------|----------|
| 1 | On launch, a packaged app checks the GitHub Releases feed and downloads a newer published version in the background. | met-via-human-gate | Source: `initAutoUpdater()` fires the single `checkForUpdatesAndNotify()` (electron/updater.ts:92) with `autoDownload` left at its `true` default (D-08); wired into `app.whenReady().then()` after `createWindow()` (electron/main.ts:165-168). Runtime: 07-03 D3 human gate — `updater.log` under `app.getPath('logs')` recorded a launch update-check on the packaged Windows build. Downloading a *newer* version requires a live feed (Phase 8); the launch-check + background-download config is present, wired, and runtime-confirmed to fire. |
| 2 | When a downloaded update is ready, the user sees an "update ready" notification, and the update is installed when the app quits. | met-via-human-gate | Source: built-in `checkForUpdatesAndNotify()` provides the native notification (D-01); `autoInstallOnAppQuit` left at `true` default (D-08). Runtime: 07-03 D2 human gate — installed app launched and ran the full editor loop; the guarded seam did not break startup. The notification+install for an *actual* downloaded update is only observable in the Phase 8 two-release validation (no feed exists yet); the mechanism is present and wired. |
| 3 | In dev/unpackaged runs, the updater is inert — guarded by `app.isPackaged`, it never fires or throws. | met | Directly verified any-OS. `electron/main.ts:165` wraps the seam in `if (app.isPackaged)` reaching `./updater` only via a lazy `require('./updater')` (line 166) — no top-level import. `electron/updater.ts` top-level imports are only `node:fs` + `node:path`; `electron`/`electron-updater` obtained via lazy `require` inside `initAutoUpdater()` (lines 71-72). Tests 87 (guard present) and 88 (no top-level `./updater` load) pass. |
| 4 | electron-updater ships as a runtime dependency physically present inside `app.asar` (not pruned) and is listed in esbuild's `external` array. | met | Static (direct): `electron-updater@^6.8.9` under `dependencies`, absent from `devDependencies` (package.json:42); esbuild `external: ['electron', 'electron-updater']` (scripts/build.mjs:33); built `dist/main.js` retains a single literal `require("electron-updater")` (grep confirmed). Tests 83, 85 pass. Physical-asar (human gate): 07-03 D1 — `npx asar list` on the packaged `app.asar` confirmed `node_modules/electron-updater/` entries present (not pruned). |

**Score:** 4/4 success criteria verified (2 directly, 2 met-via-human-gate; the human-gated criteria also have their source-level mechanism present and wired on this host).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `electron/updater.ts` | Zero-dep fs logger + guarded `initAutoUpdater()` | VERIFIED | `createFileLogger()` (node:fs/node:path only, swallow-never-throw); `initAutoUpdater()` lazy-requires electron/electron-updater, sets logger, attaches `on('error')`, fires `checkForUpdatesAndNotify().catch()`. Wired (required by main.ts). |
| `electron/main.ts` | `app.isPackaged`-guarded lazy require, no top-level import | VERIFIED | Guard at line 165; lazy require line 166; no module-scope `./updater` import. |
| `scripts/build.mjs` | electron-updater in esbuild `external[]` | VERIFIED | Line 33 with Pitfall-4 rationale comment. |
| `electron-builder.json` | GitHub publish block, lean files glob | VERIFIED | `publish: [{github, jmptr, mv2-save-editor}]` line 9; `files: ["dist/**","package.json"]` unchanged. |
| `package.json` | electron-updater under dependencies | VERIFIED | Line 42, `^6.8.9`; not in devDependencies. |
| `test/updater.packaging.test.ts` | Drift-pins dep/external/publish/files | VERIFIED | 4 assertions, all pass (tests 83-86). |
| `test/updater.seam.test.ts` | Static proof of guard + dual failure channels | VERIFIED | 3 assertions, all pass (tests 87-89). |
| `test/updater.logger.test.ts` | Behavioral proof of logger | VERIFIED | Level tags, one line/write, never-throws, Electron-free import — pass (test 82). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| electron/main.ts | electron/updater.ts | `require('./updater').initAutoUpdater()` inside `app.isPackaged` | WIRED | Confirmed lines 165-167. |
| initAutoUpdater() | electron-updater | lazy `require('electron-updater')` → `checkForUpdatesAndNotify()` | WIRED | updater.ts:72,92. |
| esbuild build | dist/main.js | `external[]` keeps `require("electron-updater")` literal | WIRED | grep of built dist/main.js = 1 literal require. |
| electron-builder | GitHub feed | `publish` block derives owner/repo | WIRED | electron-builder.json:9. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite | `npm test` | 292 pass / 0 fail | PASS |
| Type safety | `npm run typecheck` | exit 0 | PASS |
| Electron build | `npm run build:electron` | exit 0 | PASS |
| electron-updater stays external in build output | `grep -c 'require("electron-updater")' dist/main.js` | 1 | PASS |
| isPackaged guard survives bundling | `grep -c 'isPackaged' dist/main.js` | 1 | PASS |
| 8 updater tests present + green | test names 82-89 | all `ok` | PASS |

Runtime packaging/install checks were NOT run on this Linux host (electron-builder needs absent Wine — inherited Phase 6 constraint). They are covered by the 07-03 human gate.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| UPD-01 | 07-01, 07-02 | Launch check + background download | SATISFIED | Static wiring + 07-03 runtime attestation (SC1). |
| UPD-02 | 07-01, 07-02 | "Update ready" notify + install-on-quit | SATISFIED | Built-in notify + defaults + 07-03 runtime attestation (SC2). |
| UPD-03 | 07-02 | Inert in dev via `app.isPackaged` | SATISFIED | Directly verified (SC3); tests 87-88. |

### Anti-Patterns Found

None. Scan of electron/updater.ts, electron/main.ts, scripts/build.mjs, and the three test files found no `TBD/FIXME/XXX/HACK/PLACEHOLDER` debt markers. (`T-07-04`/`T-07-05`/`D-xx`/`Pitfall N` references are plan/task/decision identifiers documenting rationale, not debt markers.) No stub returns, no empty implementations. The logger's empty `catch {}` body is intentional and documented (D-03: logging must never throw into the updater).

### Human Verification Required

None outstanding. The runtime slice (SC1, SC2, physical-asar half of SC4) was verified by the Plan 07-03 blocking-human Windows acceptance gate, developer-attested PASS, recorded in 07-03-SUMMARY.md with `manual_procedural` evidence (`npx asar list` confirming electron-updater in the asar; installed app ran the full editor loop; `updater.log` written with a silent/logged feed miss). Per the phase's runtime-constraint design, a properly-recorded human-verify PASS satisfies the Windows-only slice.

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | End-to-end update download + apply across two sequential releases | Phase 8 | ROADMAP Phase 8 SC4: "after publishing v1.1.0... the installed v1.1.0 client detects, downloads, and applies the update." A logged feed-404 in Phase 7 is expected (feed absent until Phase 8), not a gap. |
| 2 | Producing `latest.yml` + installer + `.blockmap` on a Release | Phase 8 | ROADMAP Phase 8 SC2 (CI-01/02/03). Phase 7 only *consumes* the feed. |

### Gaps Summary

No gaps. All four ROADMAP success criteria are met — SC3 and the static half of SC4 verified directly on this host (source + wiring + build output + 8 green tests), and the packaged-Windows runtime slice (SC1, SC2, physical-asar half of SC4) satisfied by the developer-attested 07-03 human acceptance gate. Full suite green (292/292), typecheck clean, build clean. The updater seam is correctly dev-inert (lazy require behind `app.isPackaged`), ships electron-updater as an unpruned runtime dependency kept external by esbuild, and fires a single dual-error-trapped launch check. End-to-end update apply is properly scoped to Phase 8.

---

_Verified: 2026-07-18T19:05:00Z_
_Verifier: Claude (gsd-verifier)_
