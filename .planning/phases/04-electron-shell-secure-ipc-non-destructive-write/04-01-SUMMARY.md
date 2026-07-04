---
phase: 04-electron-shell-secure-ipc-non-destructive-write
plan: 01
subsystem: infra
tags: [electron, esbuild, devDependencies, supply-chain, npm]

requires:
  - phase: 01-foundation
    provides: CommonJS package.json toolchain (tsx, typescript, c8, @types/node)
provides:
  - electron@43.0.0 devDependency (desktop shell for Plans 04-04/04-05)
  - esbuild@0.28.1 devDependency with native binary (build tool for Plan 05)
  - Recorded supply-chain decision (OPTION A — allow esbuild postinstall)
affects: [04-05 build pipeline, 04-04 electron main/preload, electron shell, esbuild build]

tech-stack:
  added: [electron@43.0.0, esbuild@0.28.1]
  patterns:
    - "Blocking-human supply-chain checkpoint before installing SUS-flagged packages"
    - "allowScripts allowlist in package.json records conscious postinstall approval"

key-files:
  created:
    - .planning/phases/04-electron-shell-secure-ipc-non-destructive-write/04-01-SUMMARY.md
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "Plan 04-01: OPTION A (allow esbuild postinstall) chosen by human — conscious build-tool-only reversal of Plan 01-01 least-privilege default; Plan 05 selects the esbuild build mechanism (NOT the tsc fallback)"
  - "Plan 04-01: electron pinned EXACTLY at 43.0.0 (no caret) since Electron minors can break; esbuild kept at ^0.28.1 caret per plan spec"
  - "Plan 04-01: esbuild postinstall approval persisted via package.json allowScripts { esbuild@0.28.1: true } — auditable record of the OPTION A decision"

patterns-established:
  - "Supply-chain checkpoint: SUS too-new packages get human legitimacy review + explicit postinstall decision before any script runs"

requirements-completed: []

coverage:
  - id: D1
    description: "electron@43.0.0 present as devDependency and resolvable by the toolchain"
    requirement: "IO-02"
    verification:
      - kind: automated
        ref: "node -e \"require.resolve('electron')\" (exit 0); npm ls electron -> electron@43.0.0"
        status: pass
    human_judgment: false
  - id: D2
    description: "esbuild@0.28.1 present as devDependency with native binary fetched (OPTION A postinstall approved)"
    requirement: "IO-02"
    verification:
      - kind: automated
        ref: "npx esbuild --version -> 0.28.1; esbuild --bundle smoke build produces output"
        status: pass
    human_judgment: false
  - id: D3
    description: "Supply-chain postinstall decision made consciously by developer (OPTION A) and recorded for Plan 05"
    requirement: "IO-02"
    verification:
      - kind: manual_procedural
        ref: "checkpoint_resolution: approved: option-a; package.json allowScripts records esbuild@0.28.1: true"
        status: pass
    human_judgment: false

duration: 3min
completed: 2026-07-04
status: complete
---

# Phase 04 Plan 01: Electron + esbuild devDependency Install Summary

**electron@43.0.0 and esbuild@0.28.1 added as devDependencies with the esbuild postinstall consciously approved (OPTION A), unblocking the Electron shell and Plan 05's esbuild build pipeline.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-07-04T16:56:17Z
- **Completed:** 2026-07-04T16:59:00Z
- **Tasks:** 2 (Task 1 resolved via human decision; Task 2 executed)
- **Files modified:** 2 (package.json, package-lock.json)

## Accomplishments
- Task 1 supply-chain checkpoint resolved by human as **"approved: option-a"** — legitimacy of electron@43.0.0 (github.com/electron/electron) and esbuild@0.28.1 (github.com/evanw/esbuild) verified; both SUS `too-new` false-positives endorsed by CLAUDE.md's blessed stack.
- Installed `electron@43.0.0` (exact pin) and `esbuild@^0.28.1` as devDependencies, allowing esbuild's `node install.js` postinstall to fetch the native `@esbuild/<platform>` binary.
- Recorded the OPTION A decision persistently in `package.json` via `allowScripts { "esbuild@0.28.1": true }` and in this SUMMARY so **Plan 05 selects the esbuild build mechanism** (not the tsc `--outDir` fallback).

## Task Commits

1. **Task 1: Supply-chain checkpoint (verify legitimacy + decide esbuild postinstall)** — resolved via human decision "approved: option-a" (no separate commit; decision recorded in this SUMMARY and in Task 2 commit)
2. **Task 2: Install approved devDependencies and verify resolution** — `40ba32c` (chore)

**Plan metadata:** pending final docs commit.

## Files Created/Modified
- `package.json` - Added `electron: "43.0.0"` and `esbuild: "^0.28.1"` to devDependencies; added `allowScripts` block recording the approved esbuild postinstall.
- `package-lock.json` - Locked electron@43.0.0, esbuild@0.28.1, and 8 transitive packages.

## Decisions Made
- **OPTION A (allow-postinstall) chosen by the developer** — a conscious, build-tool-only reversal of the Plan 01-01 least-privilege default that had declined the esbuild postinstall. Plan 05 must build via esbuild (3 entries → `dist/`), NOT the tsc fallback.
- **electron pinned exactly at `43.0.0`** (no caret) — Electron minor releases can introduce breaking changes; the plan spec wrote `electron@43.0.0` (exact) vs `esbuild@^0.28.1` (caret) as a deliberate distinction. npm's default caret was corrected to an exact pin.
- **esbuild approval persisted via `allowScripts`** — `npm approve-scripts esbuild` wrote `allowScripts { "esbuild@0.28.1": true }` to package.json, giving an auditable record of the OPTION A postinstall approval.

## Deviations from Plan

**1. [Rule 3 - Blocking] Explicitly approved esbuild postinstall via `npm approve-scripts`**
- **Found during:** Task 2 (Install approved devDependencies)
- **Issue:** The initial `npm install --save-dev` deferred esbuild's postinstall (`npm warn allow-scripts ... not yet covered by allowScripts`), so under OPTION A the native binary approval was not yet recorded persistently.
- **Fix:** Ran `npm approve-scripts esbuild` to run/approve the postinstall and persist the `allowScripts` allowlist — the correct realization of the human's OPTION A choice.
- **Files modified:** package.json (allowScripts block), package-lock.json
- **Verification:** `npx esbuild --version` → 0.28.1; esbuild `--bundle` smoke build produces output.
- **Committed in:** `40ba32c` (Task 2 commit)

**2. [Rule 2 - Correctness] Pinned electron exactly at 43.0.0**
- **Found during:** Task 2
- **Issue:** `npm install electron@43.0.0` recorded `^43.0.0` (caret) by default; the plan spec deliberately wrote electron without a caret (unlike esbuild), and Electron minors can break.
- **Fix:** Edited package.json to `"electron": "43.0.0"` and re-ran `npm install` to sync the lockfile.
- **Files modified:** package.json, package-lock.json
- **Verification:** `npm ls electron` → electron@43.0.0.
- **Committed in:** `40ba32c` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 correctness)
**Impact on plan:** Both aligned execution with the human's OPTION A decision and the plan's exact-pin intent. No scope creep — zod, vite, electron-vite, react, react-dom, and electron-builder remain deferred per D-01.

## Issues Encountered
None — install and verification succeeded on first pass; the deferred-postinstall warning was resolved by the explicit approve step.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- **Ready:** electron@43.0.0 resolves (`require.resolve('electron')` exit 0) — Plans 04-04/04-05 can compile and launch the shell.
- **Ready:** esbuild@0.28.1 native binary works (`npx esbuild --version`, real bundle smoke build pass) — Plan 05 wires `scripts/build.mjs` (3 entries → `dist/`) on the esbuild mechanism.
- **Note for Plan 05:** OPTION A recorded — use esbuild, NOT the tsc `--outDir` fallback. `test`/`typecheck` scripts, `main`, and `type` fields were left byte-unchanged (they change in Plan 05).
- No blockers.

## Self-Check: PASSED

- FOUND: package.json (electron@43.0.0, esbuild@^0.28.1 in devDependencies)
- FOUND: commit 40ba32c (Task 2 install)

---
*Phase: 04-electron-shell-secure-ipc-non-destructive-write*
*Completed: 2026-07-04*
