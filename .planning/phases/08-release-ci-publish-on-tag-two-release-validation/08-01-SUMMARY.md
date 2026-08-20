---
phase: 08-release-ci-publish-on-tag-two-release-validation
plan: 01
subsystem: infra
tags: [github-actions, electron-builder, ci, release, esbuild, windows, node22, node-test]

# Dependency graph
requires:
  - phase: 06-packaging-local-windows-nsis-installer
    provides: electron-builder.json (win/nsis target, github publish block), `package` script chain
  - phase: 07-auto-update-from-github-releases
    provides: electron-updater wired to the github/jmptr/mv2-save-editor feed (consumes the latest.yml this workflow will publish)
provides:
  - Tag-triggered (`v*`) GitHub Actions release workflow that builds on windows-latest and publishes a DRAFT GitHub Release (CI-01/02/03)
  - Zero-dep node:test static assertions pinning the release.yml contract + @esbuild/win32-x64 lockfile coverage
affects: [08-02, release-procedure, two-release-validation, ci]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "First .github/workflows in the repo — tag-only trigger, least-privilege token, first-party pinned actions"
    - "Static workflow-config test: read release.yml as text (no YAML parser) + typed package-lock.json import"

key-files:
  created:
    - .github/workflows/release.yml
    - test/release.workflow.test.ts
  modified: []

key-decisions:
  - "release.yml mirrors the local `package` chain (build:electron → electron-builder --win --config electron-builder.json), adding only --publish onTagOrDraft and GH_TOKEN env"
  - "Default draft release IS the CI-03 human-publish gate — no releaseType/--publish always override"
  - "Least privilege: permissions contents:write only (no write-all, no PAT); first-party actions/checkout@v4 + actions/setup-node@v4"
  - "Plain `npm ci` (no --omit=optional/--no-optional/--ignore-scripts) + cache: npm (~/.npm only, never node_modules) so @esbuild/win32-x64 resolves on windows-latest"

patterns-established:
  - "Static workflow test idiom: assert.match positive contract + assert.doesNotMatch anti-patterns, all literals confined to regex args"
  - "Lockfile-coverage regression guard: typed import of package-lock.json asserting platform-optional package presence"

requirements-completed: [CI-01, CI-02, CI-03]

coverage:
  - id: D1
    description: "Tag-triggered release workflow: v* push → windows-latest + Node 22 → npm ci → build:electron → electron-builder --publish onTagOrDraft, contents:write, GH_TOKEN via env"
    requirement: "CI-01"
    verification:
      - kind: unit
        ref: "test/release.workflow.test.ts#release workflow triggers only on v* tags, on windows-latest + Node 22 (CI-01)"
        status: pass
      - kind: unit
        ref: "test/release.workflow.test.ts#release workflow installs then builds before packaging (CI-01)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Least-privilege publish: contents:write only, GH_TOKEN from secrets.GITHUB_TOKEN via env, onTagOrDraft, first-party pinned actions"
    requirement: "CI-02"
    verification:
      - kind: unit
        ref: "test/release.workflow.test.ts#release workflow grants least-privilege contents: write and passes GH_TOKEN via env (CI-02)"
        status: pass
      - kind: unit
        ref: "test/release.workflow.test.ts#release workflow uses least privilege and first-party pinned actions (CI-02, T-08-01/02)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Default-draft gate preserved: no releaseType / --publish always / write-all / omit-optional / ignore-scripts / token echo"
    requirement: "CI-03"
    verification:
      - kind: unit
        ref: "test/release.workflow.test.ts#release workflow keeps the default-draft gate — no forced-publish override (CI-03)"
        status: pass
      - kind: unit
        ref: "test/release.workflow.test.ts#release workflow does not strip optional deps or echo the token (CI-01, T-08-03)"
        status: pass
    human_judgment: false
  - id: D4
    description: "@esbuild/win32-x64 lockfile-coverage regression guard (os win32 / cpu x64) for npm ci on windows-latest"
    requirement: "CI-01"
    verification:
      - kind: unit
        ref: "test/release.workflow.test.ts#package-lock.json carries @esbuild/win32-x64 for the windows-latest build (CI-01)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Runtime proof: a real v* tag push produces a draft Release with all 3 assets and the two-release self-update works"
    verification: []
    human_judgment: true
    rationale: "Requires a real Windows runner + published GitHub Release + installed client; cannot run headlessly on Linux. This is the manual gate in Plan 08-02."

# Metrics
duration: 4min
completed: 2026-08-20
status: complete
---

# Phase 8 Plan 01: Release CI — Publish-on-Tag Workflow Summary

**Tag-triggered (`v*`) GitHub Actions release workflow on windows-latest/Node 22 that mirrors the local `build:electron → electron-builder --win` chain and publishes a DRAFT GitHub Release, plus a zero-dep node:test that pins the workflow contract and the @esbuild/win32-x64 lockfile coverage.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-08-20T14:10:23Z
- **Completed:** 2026-08-20T14:14Z
- **Tasks:** 2
- **Files modified:** 2 (both created)

## Accomplishments
- `.github/workflows/release.yml` — the repo's first workflow: `on: push tags: ['v*']` only, top-level `permissions: contents: write`, single `release` job on `windows-latest`, steps `actions/checkout@v4` → `actions/setup-node@v4` (node 22, `cache: npm`) → `npm ci` → `npm run build:electron` → `npx electron-builder --win --config electron-builder.json --publish onTagOrDraft` with `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` on the step env.
- `test/release.workflow.test.ts` — 7 zero-dep `node:test` assertions: positive CI-01 (v* trigger, windows-latest, Node 22, npm ci, build-before-package), positive CI-02 (contents:write, onTagOrDraft, GH_TOKEN env, first-party pinned actions), negative CI-03/T-08 (no releaseType / --publish always / write-all / --omit=optional / --no-optional / --ignore-scripts / token echo), and the typed `@esbuild/win32-x64` lockfile-coverage guard.
- Full suite green: 299 pass / 0 fail (was 292; +7 new). `npm run typecheck` clean.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create .github/workflows/release.yml** - `668bad5` (feat)
2. **Task 2: Create test/release.workflow.test.ts** - `371a527` (test)

**Plan metadata:** committed with this SUMMARY (docs: complete plan)

## Files Created/Modified
- `.github/workflows/release.yml` - Tag-triggered publish-to-GitHub-Release workflow (CI-01/02/03)
- `test/release.workflow.test.ts` - Static assertions pinning the workflow contract + lockfile coverage

## Decisions Made
- Default draft release is the CI-03 human-publish gate — no `releaseType`/`--publish always` override (electron-updater ignores drafts, so a human publishes to complete a release).
- Direct `npx electron-builder … --publish onTagOrDraft` invocation, NOT a third-party marketplace action; only first-party `actions/*` pinned to `@v4`.
- Least privilege: `permissions: contents: write` only with the built-in `GITHUB_TOKEN` (no PAT, no `write-all`).
- Plain `npm ci` + `cache: npm` (caches `~/.npm`, never `node_modules`) so the win32 esbuild binary resolves deterministically on `windows-latest`.

## Deviations from Plan

None - plan executed exactly as written. (Two comment-wording adjustments were made inside `release.yml` so the workflow text does not contain the literal anti-pattern strings `--omit=optional` and `releaseType`, which the Task-1 contract check and Task-2 `assert.doesNotMatch` guards forbid anywhere in the file. These are wording-only and do not change any workflow behavior.)

## Issues Encountered
- The plan's Task-1 verify one-liner and the workflow's own explanatory comments collided: an early comment referenced `--omit=optional` and `releaseType` to explain what the workflow avoids, but the `bad`/`doesNotMatch` guards scan the whole file text, so those literals must not appear even in comments. Reworded the two comments ("plain install…", "defaults to a draft release") — check then passed (exit 0). (Note: the Task-1 verify regexes contain `\$` sequences that bash mangles inside double-quoted `node -e`; ran the check from a small script file to get a faithful result.)

## User Setup Required
None - the workflow uses the auto-provisioned `GITHUB_TOKEN`; no secrets or dashboard configuration needed. Publishing a draft Release at tag time is the manual gate covered in Plan 08-02.

## Next Phase Readiness
- Static, any-OS slice of CI-01/02/03 is complete and locked by tests.
- Remaining (Plan 08-02): the manual Windows/GitHub gate — push a real `v1.1.0` tag, confirm the draft Release carries `.exe` + `latest.yml` + `.blockmap`, publish it, then prove the `v1.1.0 → v1.1.1` two-release self-update. Not provable headlessly here.
- Reminder (Pitfall 1 / Version=Tag invariant): each release bumps `package.json.version` in lockstep with `test/packaging.config.test.ts` before tagging.

## Self-Check: PASSED

- FOUND: `.github/workflows/release.yml`
- FOUND: `test/release.workflow.test.ts`
- FOUND: `.planning/phases/08-release-ci-publish-on-tag-two-release-validation/08-01-SUMMARY.md`
- FOUND commit: `668bad5` (Task 1)
- FOUND commit: `371a527` (Task 2)

---
*Phase: 08-release-ci-publish-on-tag-two-release-validation*
*Completed: 2026-08-20*
