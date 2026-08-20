---
phase: 07-auto-update-from-github-releases
plan: 02
subsystem: infra
tags: [electron, electron-updater, auto-update, logging, esbuild, node-fs]

# Dependency graph
requires:
  - phase: 07-01
    provides: electron-updater dependency, esbuild external[] entry, github publish block
  - phase: 06-packaging
    provides: electron/main.ts hardened window + IPC seam, esbuild build pipeline, app.isPackaged context
provides:
  - electron/updater.ts — zero-dep fs logger (createFileLogger) + guarded initAutoUpdater()
  - app.isPackaged-guarded lazy-require updater init wired into main.ts app.whenReady()
  - dual-channel (on('error') + .catch) failure isolation for the launch update check
  - two any-OS tests proving logger behavior and dev-inert seam placement
affects: [08-release-ci, auto-update, packaging]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lazy require inside a guard to keep a module dev-inert and unit-testable without Electron"
    - "Zero-dep fs logger with swallow-never-throw write discipline (mirrors scripts/make-icon.mjs)"
    - "Static source-text assertions (readFileSync + assert.match) to prove structural guards any-OS"

key-files:
  created:
    - electron/updater.ts
    - test/updater.logger.test.ts
    - test/updater.seam.test.ts
  modified:
    - electron/main.ts

key-decisions:
  - "electron/updater.ts top-level imports limited to node:fs + node:path; electron/electron-updater obtained via lazy require inside initAutoUpdater() (D-05/UPD-03 dev-inertness + isolated unit test)"
  - "Left autoDownload and autoInstallOnAppQuit at their true defaults (D-08) — no override"
  - "Attached autoUpdater.on('error') AND .catch() as two separate D-03 failure channels (an unhandled error event throws — T-07-04)"
  - "Added optional log-only update-available/update-downloaded breadcrumbs (Claude discretion, no user surface)"

patterns-established:
  - "Guard-then-lazy-require: `if (app.isPackaged) { const { x } = require('./mod'); x(); }` keeps a whole seam out of the dev load path"
  - "Never-throw logger: every appendFileSync wrapped in try/catch with an empty catch body"

requirements-completed: [UPD-01, UPD-02, UPD-03]

coverage:
  - id: D1
    description: "Zero-dep fs logger writes info/warn/error level-tagged lines to updater.log and never throws on write failure (D-04/D-03)"
    requirement: "UPD-01"
    verification:
      - kind: unit
        ref: "test/updater.logger.test.ts#createFileLogger writes level-tagged lines and never throws"
        status: pass
    human_judgment: false
  - id: D2
    description: "Updater seam is guarded by app.isPackaged via a lazy require('./updater') with no top-level import — dev runs never load electron-updater (UPD-03/D-05)"
    requirement: "UPD-03"
    verification:
      - kind: unit
        ref: "test/updater.seam.test.ts#main.ts guards the updater seam behind app.isPackaged"
        status: pass
      - kind: unit
        ref: "test/updater.seam.test.ts#main.ts has NO top-level (module-scope) import/require of ./updater"
        status: pass
    human_judgment: false
  - id: D3
    description: "initAutoUpdater wires both D-03 failure channels (on('error') + .catch) and fires the single checkForUpdatesAndNotify() launch check (UPD-01/UPD-02)"
    requirement: "UPD-02"
    verification:
      - kind: unit
        ref: "test/updater.seam.test.ts#updater.ts wires BOTH D-03 failure channels"
        status: pass
    human_judgment: false
  - id: D4
    description: "Packaged Windows launch performs one real background update check, downloads a newer release, and fires the native 'update ready' notification"
    requirement: "UPD-02"
    verification: []
    human_judgment: true
    rationale: "Runtime auto-update behavior only manifests in a packaged Windows build against a live Releases feed (feed produced in Phase 8); source-level proof only here, runtime gate is Plan 07-03"

# Metrics
duration: 12min
completed: 2026-07-18
status: complete
---

# Phase 7 Plan 02: Main-Process Updater Seam Summary

**Zero-dep fs logger plus an `app.isPackaged`-guarded lazy-require `initAutoUpdater()` that sets the logger, attaches a dual-channel error trap, and fires one `checkForUpdatesAndNotify()` launch check — strictly inert in dev.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-18T17:32:00Z
- **Completed:** 2026-07-18T17:44:00Z
- **Tasks:** 2
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments
- `electron/updater.ts` — a zero-dep (`node:fs` + `node:path` only) `createFileLogger()` satisfying electron-updater's Logger interface (info/warn/error required, debug optional) with a swallow-never-throw write discipline (D-04/D-03), plus `initAutoUpdater()` that lazily requires electron/electron-updater, sets the logger, attaches the REQUIRED `on('error')` listener, logs update breadcrumbs, and fires the single `checkForUpdatesAndNotify().catch()` launch check leaving D-08 defaults untouched.
- `electron/main.ts` — guarded `if (app.isPackaged) { require('./updater').initAutoUpdater(); }` inserted between `createWindow()` and the macOS `activate` handler inside `app.whenReady().then()`, with no top-level import of `./updater` (dev stays inert — UPD-03/D-05).
- Two any-OS, no-Electron tests: `test/updater.logger.test.ts` (behavioral — tmp-dir writes, level tags, never-throws on unwritable path, imports without Electron) and `test/updater.seam.test.ts` (static source assertions — guard present, no top-level `./updater` load, dual failure channels in updater.ts).
- Full suite green (292 tests), typecheck clean, `npm run build:electron` emits `dist/main.js` with `require("electron-updater")` external and the `app.isPackaged` guard intact.

## Task Commits

Each task was committed atomically:

1. **Task 1: Zero-dep fs logger + guarded updater init (electron/updater.ts) + logger test** - `a8d6928` (feat)
2. **Task 2: Guard the init behind app.isPackaged in main.ts + seam test** - `9b29bca` (feat)

_TDD: for each task the test was authored first, confirmed RED (missing module / missing guard), then the implementation drove it GREEN before the single atomic commit._

## Files Created/Modified
- `electron/updater.ts` - Zero-dep fs logger (`createFileLogger`) + guarded `initAutoUpdater()` with lazy electron/electron-updater require and dual-channel error isolation.
- `electron/main.ts` - Added the `app.isPackaged`-guarded lazy-require updater init inside `app.whenReady().then()`.
- `test/updater.logger.test.ts` - Behavioral proof of the logger (writes, level tags, never-throws, Electron-free import).
- `test/updater.seam.test.ts` - Static source proof of the dev-inert guard placement and D-03 dual failure channels.

## Decisions Made
- Kept `electron`/`electron-updater` out of module-top imports (lazy require inside `initAutoUpdater`) so `createFileLogger` is unit-testable with no Electron runtime and the whole seam is dev-inert (D-05/UPD-03).
- Exported a small `FileLogger` interface (info/warn/error/debug) so the return type is explicit and satisfies electron-updater's Logger shape without importing its types at module top.
- Added log-only `update-available`/`update-downloaded` breadcrumbs (permitted diagnostics, no user surface).
- Left `autoDownload`/`autoInstallOnAppQuit` at defaults (D-08) — no override written.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- esbuild inlines the relative `./updater` module into `dist/main.js` (rather than leaving a literal `require('./updater')`), but uses its `__esm` lazy-init wrapper so the module body — including `require("electron-updater")` — executes only when `init_updater()` runs inside the `app.isPackaged` guard. The dev-inertness contract holds: electron-updater is not loaded until the guard fires, and `electron-updater` itself remains external. No change needed.

## User Setup Required

None - no external service configuration required. (The GitHub Releases feed is produced in Phase 8; a logged feed-404 pre-Phase-8 is expected, not a failure — T-07-05.)

## Next Phase Readiness
- Source-level UPD-01/UPD-02/UPD-03 delivered and statically proven. Runtime confirmation (a packaged Windows launch performing a real check + notify) is the manual acceptance gate in Plan 07-03.
- No blockers for Plan 07-03.

## Self-Check: PASSED

---
*Phase: 07-auto-update-from-github-releases*
*Completed: 2026-07-18*
