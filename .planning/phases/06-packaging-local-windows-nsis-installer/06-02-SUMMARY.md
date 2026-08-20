---
phase: 06-packaging-local-windows-nsis-installer
plan: 02
subsystem: infra
tags: [electron-builder, nsis, packaging, esbuild, asar, node-test]

# Dependency graph
requires:
  - phase: 06-01-placeholder-icon
    provides: build/icon.ico (256x256 32bpp, zero-dep node:fs writer)
  - phase: 05 (v1.0 dist/)
    provides: esbuild build (scripts/build.mjs) emitting dist/ main.js/preload.js/renderer.js/index.html siblings
provides:
  - electron-builder.json encoding D-01..D-05 packaging config (NSIS, unsigned, one-click)
  - npm run package / package:dir scripts chaining build:electron -> electron-builder
  - electron-builder ^26 devDependency (pinned in package-lock.json)
  - version bump 1.0.0 -> 1.1.0
  - two node:test assertion suites pinning config + dist sibling layout
affects: [06-03 manual Windows build gate, phase-07 auto-update, phase-08 release-ci]

# Tech tracking
tech-stack:
  added: [electron-builder@^26.15.3]
  patterns:
    - "JSON (not YAML) electron-builder config for zero-dep require()-assertability in node:test"
    - "directories.output=release to avoid collision with esbuild-owned dist/"
    - "lean asar via files:[dist/**, package.json] (bundled deps, no node_modules shipped)"

key-files:
  created:
    - electron-builder.json
    - test/packaging.config.test.ts
    - test/packaging.dist-layout.test.ts
  modified:
    - package.json
    - package-lock.json
    - .gitignore

key-decisions:
  - "electron-builder.json in JSON form (not .yml) so node:test can require()-assert every key with zero deps"
  - "No custom artifactName: default NSIS template yields 'MV2 Save Editor Setup 1.1.0.exe' from productName+version"
  - "electron-builder pinned ^26 (26.15.3), never 27.0.0-alpha; lockfile committed for supply-chain integrity"

patterns-established:
  - "Packaging config pinned by node:test assertion suites so it cannot silently drift from the acceptance bar"
  - "release/ output dir gitignored separately (bare `dist` ignore does not cover it)"

requirements-completed: [PKG-01, PKG-02, PKG-03, PKG-04]

coverage:
  - id: D1
    description: "electron-builder.json encodes appId, productName, directories.output=release, win.icon (PKG-04)"
    requirement: PKG-04
    verification:
      - kind: unit
        ref: "test/packaging.config.test.ts#electron-builder.json: appId, productName, output dir (PKG-04)"
        status: pass
    human_judgment: false
  - id: D2
    description: "NSIS installer flags oneClick:true / perMachine:false / createStartMenuShortcut:true (PKG-03)"
    requirement: PKG-03
    verification:
      - kind: unit
        ref: "test/packaging.config.test.ts#electron-builder.json: NSIS installer flags (PKG-03)"
        status: pass
    human_judgment: false
  - id: D3
    description: "files:[dist/**, package.json] preserves preload.js/index.html asar sibling layout (PKG-02)"
    requirement: PKG-02
    verification:
      - kind: unit
        ref: "test/packaging.dist-layout.test.ts#dist/ contains main.js, preload.js, renderer.js, index.html as siblings (PKG-01/02)"
        status: pass
      - kind: unit
        ref: "test/packaging.dist-layout.test.ts#electron-builder files glob ships dist/** to preserve asar sibling layout (PKG-02)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Default artifactName derives 'MV2 Save Editor Setup 1.1.0.exe' from productName + version 1.1.0 (PKG-01)"
    requirement: PKG-01
    verification:
      - kind: unit
        ref: "test/packaging.config.test.ts#default artifactName derives \"MV2 Save Editor Setup 1.1.0.exe\" (PKG-01)"
        status: pass
    human_judgment: false
  - id: D5
    description: "npm run package chains build:electron && electron-builder; version 1.1.0; electron-builder ^26 devDep (D-04/D-05)"
    requirement: PKG-01
    verification:
      - kind: unit
        ref: "test/packaging.config.test.ts#package.json: version 1.1.0, package script chain, electron-builder devDep (D-04/D-05)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Produced installer boots and installs on real Windows (one-click, Start Menu shortcut)"
    verification: []
    human_judgment: true
    rationale: "Actual .exe production + installed-app behavior require a real Windows host with Wine/electron-builder binaries — deferred to the Plan 06-03 manual Windows gate; not verifiable on the Linux host."

# Metrics
duration: 2min
completed: 2026-07-09
status: complete
---

# Phase 6 Plan 02: electron-builder NSIS Packaging Config Summary

**electron-builder.json encoding the locked NSIS one-click packaging config (appId, productName, release/ output, lean asar, build/icon.ico) with the version bump to 1.1.0, the chained `package` script, the electron-builder ^26 devDependency, and two node:test suites pinning config + dist sibling layout.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-07-09T16:38:06Z
- **Completed:** 2026-07-09T16:40:16Z
- **Tasks:** 2 executed (Task 1 legitimacy gate pre-approved by developer)
- **Files modified:** 6 (3 created, 3 modified)

## Accomplishments
- `electron-builder.json` encodes every locked packaging decision D-01..D-05: appId `com.jmptr.mv2-save-editor`, productName `MV2 Save Editor`, `directories.output=release` (no collision with esbuild's `dist/`), `files:[dist/**, package.json]` lean asar, `win.target=nsis` + `win.icon=build/icon.ico`, and `nsis{oneClick:true, perMachine:false, createStartMenuShortcut:true}`.
- `package.json` bumped to `1.1.0`, added `package` + `package:dir` scripts chaining `build:electron -> electron-builder`, and `electron-builder@^26` installed as a devDependency (lockfile committed).
- `release/` added to `.gitignore` (the bare `dist` ignore did not cover it).
- Two node:test suites pin the config values and the dist sibling layout so they cannot silently drift; full chain `build:electron && npm test && typecheck` is green (281 tests pass, typecheck clean).

## Task Commits

1. **Task 2: Create electron-builder.json, bump version, wire scripts, install, ignore release/** - `d80b026` (feat)
2. **Task 3: Config + dist-layout assertion tests** - `364220f` (test)

_Note: Task 1 was a blocking-human package-legitimacy gate for electron-builder — pre-approved by the developer ("approved") and independently re-verified against the live npm registry (electron-userland, 26.15.6 current, MIT, pinned ^26). No new commit; the install landed in the Task 2 commit._

_TDD note: Task 3's config is asserted after Task 2 built it (config-assertion tests). Because the config already existed when the tests were written, they passed on first run rather than progressing through a distinct RED state — the RED gate is inapplicable to config-pinning tests over already-committed declarative config._

## Files Created/Modified
- `electron-builder.json` - NEW: NSIS one-click packaging config (appId, productName, release/ output, lean asar files, win icon, nsis flags)
- `package.json` - MODIFIED: version 1.0.0->1.1.0, +`package`/`package:dir` scripts, +electron-builder devDep
- `package-lock.json` - MODIFIED: electron-builder ^26 + 242 transitive packages pinned
- `.gitignore` - MODIFIED: added `release/` output-dir ignore
- `test/packaging.config.test.ts` - NEW: asserts appId/productName/output/nsis flags/version/devDep + derives installer filename (PKG-01/03/04)
- `test/packaging.dist-layout.test.ts` - NEW: asserts dist/ siblings exist + files ships dist/** (PKG-01/02)

## Decisions Made
- **electron-builder.json (JSON, not YAML):** chosen so node:test can `require()`-assert every key with zero extra deps (RESEARCH Validation Architecture).
- **No custom artifactName:** the electron-builder default NSIS template `${productName} Setup ${version}.exe` already yields `MV2 Save Editor Setup 1.1.0.exe`.
- **electron-builder pinned ^26 (resolved 26.15.3):** never 27.0.0-alpha; lockfile committed for supply-chain integrity (T-06-SC/T-06-01).

## Deviations from Plan

None - plan executed exactly as written. `scripts/build.mjs` and `electron/main.ts` were left unchanged as required; no auto-fixes were needed.

## Issues Encountered
None. The install emitted standard npm deprecation warnings (inflight, rimraf@2, glob@7) from electron-builder's transitive dependency tree; `npm audit` reported 0 vulnerabilities.

## Authentication Gates
None.

## User Setup Required
None - no external service configuration required. The one blocking-human step this plan had (the electron-builder legitimacy gate, Task 1) was resolved before execution.

## Next Phase Readiness
- The packaging config is complete and pinned; ready for the **Plan 06-03 manual Windows build-and-run acceptance** gate (produce the `.exe` on a real Windows host, install it, confirm one-click install + Start Menu shortcut + app boots with intact preload/index.html asar resolution).
- No blockers introduced. The highest-risk unknown (asar sibling resolution of `preload.js`/`index.html`) is proxied here by the dist-layout test + `files:[dist/**]`, but its definitive proof remains the installed Windows build in 06-03.

## Self-Check: PASSED

- FOUND: electron-builder.json
- FOUND: test/packaging.config.test.ts
- FOUND: test/packaging.dist-layout.test.ts
- FOUND: commit d80b026 (Task 2)
- FOUND: commit 364220f (Task 3)

---
*Phase: 06-packaging-local-windows-nsis-installer*
*Completed: 2026-07-09*
