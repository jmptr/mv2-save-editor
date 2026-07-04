---
phase: 04-electron-shell-secure-ipc-non-destructive-write
plan: 03
subsystem: ipc
tags: [electron, ipc, session, brotli, non-destructive-write, dependency-injection, tdd]

# Dependency graph
requires:
  - phase: 01-codec
    provides: "decompress/compress (Brotli codec) + IO-03 length invariant"
  - phase: 02-parser
    provides: "parseSave orchestrator (fieldTable + offset-free viewModel)"
  - phase: 03-patcher
    provides: "patchSave (same-width in-place edits, self-verifying)"
provides:
  - "src/ipc/session.ts — SessionStore + ActiveSession (single in-memory session, D-02)"
  - "src/ipc/write-service.ts — performWrite + defaultOutputPath + WriteInvariantError (IO-02)"
  - "Headless proof of IO-02 (non-destructive new-file write) via injected fs/dialog deps"
affects: [04-04, 04-05, main-process-ipc-wiring, preload-bridge]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure IPC service modules: import only core + node builtins, inject fs/dialog via deps (headless tsx --test)"
    - "Single active session (D-02): one field reassigned on reload, no handle bookkeeping"
    - "Source-path guard via resolve() comparison before any write (D-03)"

key-files:
  created:
    - src/ipc/session.ts
    - src/ipc/write-service.ts
    - test/ipc/session.test.ts
    - test/ipc/write-service.test.ts
  modified: []

key-decisions:
  - "requireActive() throws typed NoActiveSessionError; getModel() returns undefined — main maps to { ok:false, kind:'no-session' }"
  - "Length invariant asserted on the DECOMPRESSED buffer only (Brotli non-canonical — never compare compressed bytes)"
  - "defaultOutputPath normalizes output extension to .sav regardless of source ext"

patterns-established:
  - "Dependency-injected side effects (showSaveDialog/writeFile) keep the write path pure + unit-testable"
  - "Session test feeds RAW compressed fixture (open() decompresses); write-service test uses pre-decompressed loadFixtureBuffer to build ActiveSession directly"

requirements-completed: [IO-02]

coverage:
  - id: D1
    description: "SessionStore holds one freshly-parsed active session, replaced on reload, returning the offset-free viewModel (D-02)"
    requirement: "IO-02"
    verification:
      - kind: unit
        ref: "test/ipc/session.test.ts#SessionStore.open — decompress + parse once, hold one active session (D-02)"
        status: pass
    human_judgment: false
  - id: D2
    description: "performWrite proves IO-02 headlessly — patch + re-parse + length gate, write only to a NEW path, source path rejected, cancel is a no-op, source bytes unchanged"
    requirement: "IO-02"
    verification:
      - kind: unit
        ref: "test/ipc/write-service.test.ts#performWrite — NEW-path write (IO-02)"
        status: pass
      - kind: unit
        ref: "test/ipc/write-service.test.ts#performWrite — source-path guard (D-03 / T-4-04)"
        status: pass
      - kind: unit
        ref: "test/ipc/write-service.test.ts#performWrite — cancel is a clean no-op"
        status: pass
    human_judgment: false

# Metrics
duration: 12min
completed: 2026-07-04
status: complete
---

# Phase 4 Plan 03: Session Store + Non-Destructive Write Summary

**Two pure IPC service modules — a single in-memory active session (D-02) and the non-destructive new-file write path (IO-02) — proven headlessly under `tsx --test` with fs/dialog injected, no Electron runtime.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-04T17:05:00Z
- **Completed:** 2026-07-04T17:17:00Z
- **Tasks:** 2 (both TDD: RED → GREEN)
- **Files created:** 4

## Accomplishments
- `SessionStore` holds exactly ONE `ActiveSession { path, decompressedBuffer, fieldTable, viewModel }`; `open()` decompresses + parses raw bytes once, a second `open()` replaces it (D-02). `getModel()` returns the offset-free viewModel (assertNoOffsets passes); `requireActive()` exposes stable references (main never re-derives state per call, SC-4 / T-4-10).
- `performWrite` chains `patchSave` → fresh `parseSave` (D-02) → decompressed-length gate (IO-02/IO-03, before compress) → native Save-As → source-path guard (D-03 / T-4-04) → `compress` → injected `writeFile` to a NEW path. Cancel is a clean no-op; the source buffer is byte-unchanged.
- Both modules are pure — import only the existing core (`codec`/`save-parser`/`patcher`) + `node:path`, never `electron` or `node:fs` (fs/dialog injected via `deps`). This is where IO-02 is actually proven.
- `NoActiveSessionError` / `WriteInvariantError` give the main handler typed conditions to map to structured IPC results.

## Task Commits

Each task was committed atomically (TDD RED → GREEN):

1. **Task 1: session.ts — single active session store (D-02)**
   - `b8ec6e2` (test — RED)
   - `54b8a97` (feat — GREEN)
2. **Task 2: write-service.ts — non-destructive new-file write (IO-02)**
   - `ee1c1ec` (test — RED)
   - `381de8f` (feat — GREEN)

_TDD tasks have a test commit followed by an implementation commit._

## Files Created/Modified
- `src/ipc/session.ts` - `SessionStore` (single active session, D-02) + `ActiveSession` + `NoActiveSessionError`
- `src/ipc/write-service.ts` - `performWrite` (IO-02) + `defaultOutputPath` + `WriteInvariantError` + `WriteDeps`/`WriteResult`
- `test/ipc/session.test.ts` - 7 tests: open/replace/no-session/offset-free-viewModel/stable-refs
- `test/ipc/write-service.test.ts` - 7 tests: NEW-path write/cancel-noop/source-path-guard/default-name/no-mutation

## Decisions Made
- **No-session signalling:** `requireActive()` throws typed `NoActiveSessionError`; `getModel()` returns `undefined` (not a crash) — the main handler maps either to `{ ok:false, kind:'no-session' }`.
- **Length invariant on decompressed buffer only:** Brotli is not canonical (Node vs .NET emit different-but-equivalent bytes), so the gate asserts `patched.length === input.length` on the decompressed buffer and never compares compressed bytes (RESEARCH Pitfall 6).
- **Output extension normalized:** `defaultOutputPath` strips the source extension and always appends `-edited.sav`.

## Deviations from Plan

None - plan executed exactly as written. Both modules match the plan's action specs and RESEARCH §Pattern 5 body; all acceptance criteria and the `<verification>` block pass.

## Issues Encountered
None. All 230 tests in the suite pass; `tsc --noEmit` clean; grep confirms no `electron`/`node:fs` imports in either module.

## Threat Surface

All plan `<threat_model>` mitigations are covered by tests:
- **T-4-04** (output path tampering) — source-path guard test asserts `WriteInvariantError` + zero writes when the target resolves to the source.
- **T-4-09** (length invariant) — NEW-path write test asserts the round-tripped decompressed length equals the input length; the pre-compress gate throws otherwise.
- **T-4-05** (decompress bomb) — inherited from `codec.decompress` (MAX_DECOMPRESSED_BYTES), invoked by `SessionStore.open`.
- **T-4-10** (main trusting renderer state) — `requireActive()` returns main's own freshly-parsed FieldTable by stable reference; the stable-refs test proves no per-call re-derivation.

No new security-relevant surface beyond the plan's threat register.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `SessionStore` and `performWrite` are ready for the main-process IPC handlers (04-04/04-05) to wire `save:load` → `open`, `save:getModel` → `getModel`, `save:write` → `performWrite` (with Electron `dialog.showSaveDialog` + `fs.promises.writeFile` as the injected deps).
- No blockers.

## Self-Check: PASSED

All 4 created files exist on disk; all 4 task commits (b8ec6e2, 54b8a97, ee1c1ec, 381de8f) are in the git log.

---
*Phase: 04-electron-shell-secure-ipc-non-destructive-write*
*Completed: 2026-07-04*
