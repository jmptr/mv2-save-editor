---
phase: 07-auto-update-from-github-releases
plan: 01
subsystem: infra
tags: [electron-updater, electron-builder, esbuild, packaging, github-releases, auto-update]

# Dependency graph
requires:
  - phase: 06-packaging-windows-installer
    provides: electron-builder ^26 devDependency, NSIS config, lean files glob (["dist/**","package.json"]), esbuild build (scripts/build.mjs)
provides:
  - electron-updater@^6.8.9 as a production dependency (ships inside app.asar)
  - electron-updater kept external in the esbuild build (dynamic requires + app-update.yml path resolution preserved)
  - deterministic GitHub-Releases publish block (github/jmptr/mv2-save-editor) in electron-builder.json
  - static-config drift test (test/updater.packaging.test.ts) pinning the packaging wiring
affects: [07-02-runtime-updater-seam, 07-03-windows-acceptance, phase-08]

# Tech tracking
tech-stack:
  added: [electron-updater@^6.8.9]
  patterns:
    - "New runtime deps go under dependencies (not devDependencies) so electron-builder ships them in app.asar"
    - "Packages with dynamic requires / runtime path resolution stay in esbuild external[]"
    - "Static-config tests read .mjs configs as text and assert against the array literal to pin drift"

key-files:
  created:
    - test/updater.packaging.test.ts
  modified:
    - package.json
    - package-lock.json
    - scripts/build.mjs
    - electron-builder.json

key-decisions:
  - "electron-updater placed in dependencies (D-06 / Pitfall 3) — devDeps are pruned from app.asar"
  - "electron-updater kept external in esbuild (D-06 / Pitfall 4) — bundling breaks dynamic requires + app-update.yml resolution"
  - "Explicit github publish block (D-07) — deterministic feed resolution, reused by Phase 8"
  - "files glob left untouched — production deps auto-included in asar; broadening re-bloats it"

patterns-established:
  - "Supply-chain legitimacy gate before adding a new runtime dependency (T-07-SC blocking-human checkpoint)"
  - "Drift-pinning static test co-located with the config it guards"

requirements-completed: [UPD-01, UPD-02]

coverage:
  - id: D1
    description: "electron-updater is a production dependency (not devDependencies) so it ships inside app.asar"
    requirement: UPD-01
    verification:
      - kind: unit
        ref: "test/updater.packaging.test.ts#electron-updater is a production dependency, not a devDependency (D-06 / Pitfall 3)"
        status: pass
    human_judgment: false
  - id: D2
    description: "electron-updater kept external in the esbuild build so dynamic requires + app-update.yml resolution survive"
    requirement: UPD-01
    verification:
      - kind: unit
        ref: "test/updater.packaging.test.ts#scripts/build.mjs keeps electron-updater external in esbuild (D-06 / success criterion 4)"
        status: pass
      - kind: other
        ref: "npm run build:electron (exit 0)"
        status: pass
    human_judgment: false
  - id: D3
    description: "GitHub-Releases publish provider resolves deterministically to github/jmptr/mv2-save-editor"
    requirement: UPD-02
    verification:
      - kind: unit
        ref: "test/updater.packaging.test.ts#electron-builder.json publish block pins the GitHub feed (D-07 / Pitfall 5)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Supply-chain legitimacy of electron-updater verified before install (T-07-SC)"
    verification: []
    human_judgment: true
    rationale: "Blocking-human supply-chain gate — legitimacy of a new runtime dependency that executes a downloaded installer requires human sign-off; not automatable."

# Metrics
duration: 8min
completed: 2026-07-18
status: complete
---

# Phase 7 Plan 01: electron-updater Packaging Wiring Summary

**electron-updater@^6.8.9 wired as a production dependency kept external by esbuild, with a deterministic github/jmptr/mv2-save-editor publish block and a static drift-pinning test.**

## Performance

- **Duration:** ~8 min
- **Tasks:** 3 (Task 1 gate pre-approved; Tasks 2-3 executed)
- **Files modified:** 4 (1 created, 3 modified + lockfile)

## Accomplishments
- Installed `electron-updater@^6.8.9` into `dependencies` (alpha-sorted before `react`), lockfile synced, no postinstall executed
- Extended esbuild `external` from `['electron']` to `['electron', 'electron-updater']` with an inline Pitfall-4 rationale comment
- Added a top-level `publish` block to `electron-builder.json`: `[{provider:'github', owner:'jmptr', repo:'mv2-save-editor'}]`
- Created `test/updater.packaging.test.ts` (4 assertions) drift-pinning all three edits; left the `files` glob untouched
- Full suite green: 285 tests pass, typecheck clean, `npm run build:electron` exits 0

## Task Commits

1. **Task 1: Supply-chain legitimacy gate (T-07-SC)** — no commit (blocking-human gate, pre-approved by developer)
2. **Task 2: Add electron-updater dep + esbuild external + publish block** — `6d3ab75` (feat)
3. **Task 3: Static-config test pinning the packaging wiring** — `b7254a4` (test)

## Files Created/Modified
- `package.json` — `dependencies["electron-updater"] = "^6.8.9"`
- `package-lock.json` — lockfile sync (5 packages added, 0 vulnerabilities)
- `scripts/build.mjs` — `external: ['electron', 'electron-updater']` + Pitfall-4 comment
- `electron-builder.json` — added top-level `publish` array; `files` glob unchanged
- `test/updater.packaging.test.ts` — NEW static-config drift test (4 tests)

## Decisions Made
- Followed the plan's locked decisions (D-06, D-07) exactly. No new decisions introduced.

## Supply-Chain Gate Outcome (T-07-SC)
Task 1 was a `checkpoint:human-verify` gate="blocking-human" — never auto-approvable. The developer
**approved** electron-updater's legitimacy before install: latest stable 6.8.9, published by the
`electron-userland` org (same monorepo as electron-builder, approved in Phase 6), not deprecated, no
install/postinstall script, target range `^6.8.9` (dist-tag `latest`, NOT the `7.0.0-alpha.4` `next`
tag). The RESEARCH "SUS" legitimacy grade was a documented false positive (the npm downloads API was
egress-blocked, yielding an `unknown-downloads` signal only — identical to the electron-builder false
positive approved in Phase 6). Install confirmed no postinstall ran.

## Deviations from Plan

None - plan executed exactly as written.

The plan's Task 3 example used `join(__dirname, ...)` to read build.mjs as text. Under the project's
CommonJS tsconfig (`module: commonjs`), `__dirname` is a native global, so the test uses it directly —
an initial `import.meta.url` shim was removed because tsc rejects `import.meta` under commonjs. This
matches the plan's stated idiom and required no functional change.

## Issues Encountered
- First typecheck failed with TS1343 (`import.meta` not allowed under `module: commonjs`). Resolved by
  using the native CommonJS `__dirname` global directly (as the plan specified) instead of an
  `import.meta.url` shim. Typecheck then passed.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Packaging precondition satisfied: electron-updater is in the asar and external, feed provider pinned.
- Ready for Plan 07-02 (runtime updater seam) and Plan 07-03 (Windows acceptance gate).

---
*Phase: 07-auto-update-from-github-releases*
*Completed: 2026-07-18*
