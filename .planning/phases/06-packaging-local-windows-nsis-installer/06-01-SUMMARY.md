---
phase: 06-packaging-local-windows-nsis-installer
plan: 01
subsystem: infra
tags: [electron-builder, icon, ico, packaging, node-test, binary]

# Dependency graph
requires:
  - phase: 05
    provides: Electron dist/ build (scripts/build.mjs) that electron-builder will package
provides:
  - Committed placeholder application icon build/icon.ico (256x256 32bpp, clears electron-builder Windows floor)
  - Zero-dependency regenerator scripts/make-icon.mjs (pure node:fs, deterministic)
  - Binary-parse gate test/packaging.icon.test.ts proving the >=256x256 icon floor
affects: [06-02-electron-builder-config, packaging, PKG-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Zero-dep binary asset generator (node:fs only) mirroring scripts/build.mjs conventions"
    - "ICO header parse-and-assert test using checked reads (readUInt8/readUInt16LE), no raw indexing"

key-files:
  created:
    - scripts/make-icon.mjs
    - build/icon.ico
    - test/packaging.icon.test.ts
  modified: []

key-decisions:
  - "Placeholder icon is a single 256x256 32bpp entry — the minimum that clears electron-builder's Windows floor (RESEARCH Pitfall 3); multi-size not needed for a throwaway monogram (D-03)."
  - "Zero-dep pure-Node ICO writer instead of png-to-ico/sharp — avoids SUS-flagged supply-chain surface (threat T-06-01)."

patterns-established:
  - "Committed regenerable binary asset: generator script + committed output + test gate, swappable by replacing one file."
  - "ICO validity proven by parsing on-disk bytes with checked reads only (noUncheckedIndexedAccess-safe)."

requirements-completed: [PKG-04]

coverage:
  - id: D1
    description: "build/icon.ico is a valid Windows ICO whose largest entry is >=256x256 (clears electron-builder Windows icon floor)"
    requirement: "PKG-04"
    verification:
      - kind: unit
        ref: "test/packaging.icon.test.ts#at least one ICONDIRENTRY is >= 256x256 (0-byte dimension means 256)"
        status: pass
    human_judgment: false
  - id: D2
    description: "scripts/make-icon.mjs regenerates build/icon.ico deterministically with zero npm dependencies"
    requirement: "PKG-04"
    verification:
      - kind: unit
        ref: "node scripts/make-icon.mjs (re-run produces byte-identical sha256; imports only node:fs)"
        status: pass
    human_judgment: false
  - id: D3
    description: "build/icon.ico is committed (not gitignored) so packaging on any machine finds it"
    requirement: "PKG-04"
    verification:
      - kind: unit
        ref: "git check-ignore build/icon.ico (not ignored); committed in 86441e9"
        status: pass
    human_judgment: false

# Metrics
duration: 4min
completed: 2026-07-09
status: complete
---

# Phase 6 Plan 01: Committed Placeholder Icon Summary

**Zero-dependency pure-Node ICO writer producing a committed 256x256 build/icon.ico that clears electron-builder's Windows icon floor, gated by a binary-parse test (PKG-04).**

## Performance

- **Duration:** 4 min
- **Started:** 2026-07-09T16:29:49Z
- **Completed:** 2026-07-09T16:33:03Z
- **Tasks:** 2
- **Files modified:** 3 (all created)

## Accomplishments
- `test/packaging.icon.test.ts` parses the ICONDIR + ICONDIRENTRY records with checked reads and asserts a >=256x256 entry — the PKG-04 icon-floor gate.
- `scripts/make-icon.mjs` writes a valid 256x256 32bpp Windows `.ico` using only `node:fs` (zero npm deps), deterministic across re-runs (byte-identical sha256).
- `build/icon.ico` (270,398 bytes) is generated, confirmed valid by `file` ("MS Windows icon resource - 1 icon, 256x256, 32 bits/pixel"), and committed (not gitignored — `.gitignore` only covers `build/Release`).
- Full suite green: 274 pass / 0 fail; `npm run typecheck` clean under `noUncheckedIndexedAccess`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write the failing icon-validity test (TDD RED)** - `4f51914` (test)
2. **Task 2: Generate and commit build/icon.ico via a zero-dep writer (GREEN)** - `86441e9` (feat)

_TDD flow: RED (`4f51914`, test fails ENOENT — no icon) → GREEN (`86441e9`, icon created, test passes)._

## Files Created/Modified
- `test/packaging.icon.test.ts` - Reads `build/icon.ico`, validates ICONDIR header (reserved 0, type 1, count >=1) and asserts at least one ICONDIRENTRY is >=256x256 (0-byte dimension normalized to 256).
- `scripts/make-icon.mjs` - Zero-dep ESM writer: BGRA XOR bitmap + all-zero AND mask + 40-byte BITMAPINFOHEADER + 6-byte ICONDIR + 16-byte ICONDIRENTRY; `mkdirSync('build')` then writes `build/icon.ico`.
- `build/icon.ico` - Committed placeholder icon asset (256x256 32bpp), regenerable, swappable by replacing the single file (D-03).

## Decisions Made
- Single 256x256 entry (not multi-size) — sufficient for the throwaway placeholder and clears the electron-builder floor; matches D-03's "swap later by replacing one file."
- Copied the verified writer from 06-RESEARCH.md verbatim; imports only `node:fs`, deliberately avoiding png-to-ico/sharp (threat T-06-01, no new supply-chain surface).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Restored uninstalled project dependencies**
- **Found during:** Task 1 (typecheck of the new test file)
- **Issue:** `node_modules/` was absent, so `npm run typecheck` failed with `TS2688: Cannot find type definition file for 'node'` and `tsx`/test runner were unavailable — blocking verification of both tasks.
- **Fix:** Ran `npm ci` to restore the already-declared dependencies from the committed `package-lock.json` (no new packages added; not a package-legitimacy checkpoint).
- **Files modified:** None committed (only populated `node_modules/`, which is gitignored).
- **Verification:** `npm run typecheck` clean; `npm test` runs the full suite (274 pass).
- **Committed in:** N/A (no tracked files changed)

---

**Total deviations:** 1 auto-fixed (1 blocking — dependency restore, no new packages)
**Impact on plan:** Environment restore only; no source or scope changes. Both tasks executed exactly as written.

## Issues Encountered
- None beyond the dependency restore above. RED→GREEN proceeded as designed.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `build/icon.ico` exists and is committed at the path Plan 06-02 will reference as `win.icon` (`build/icon.ico`) — asset location and forthcoming config reference agree.
- The runtime "icon shows on the installed Windows app" check remains the manual Windows gate in Plan 06-03 (cannot be verified cross-platform on this Linux host — RESEARCH Pitfall 4).

## Self-Check: PASSED

- FOUND: test/packaging.icon.test.ts
- FOUND: scripts/make-icon.mjs
- FOUND: build/icon.ico
- FOUND commit: 4f51914 (test, RED)
- FOUND commit: 86441e9 (feat, GREEN)

---
*Phase: 06-packaging-local-windows-nsis-installer*
*Completed: 2026-07-09*
