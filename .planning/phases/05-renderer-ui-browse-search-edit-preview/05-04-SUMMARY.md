---
phase: 05-renderer-ui-browse-search-edit-preview
plan: 04
subsystem: ui
tags: [react, reducer, state, useReducer, selectors, int64, view-model]

# Dependency graph
requires:
  - phase: 02-parser-fieldtable
    provides: ViewModel (offset-free projection; BankItem.fieldKey, Skill.id, Summary.gp/slayerCoins strings)
  - phase: 04-electron-shell-ipc
    provides: WireEdit / WireChangeRow IPC contract (int64 as string, no offsets across the bridge)
  - phase: 05-renderer-ui-browse-search-edit-preview
    provides: "Plan 05-01 stable BankItem.fieldKey (bank.inventory.<itemId>#<n>); Plan 05-02 React build target + type-only IPC contract"
provides:
  - "electron/ui/state/reducer.ts — pure appReducer, AppState/EditEntry/Action union, initialState"
  - "electron/ui/state/selectors.ts — editsToPayload(state), dirtyCount(state)"
  - "D-02 edit accumulator with DERIVED dirtiness and Pitfall 5 skill xp/level mutual exclusion"
affects: [05-05, 05-06, 05-07, 05-08, App.tsx, preview, write]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single top-level useReducer store (RESEARCH Pattern 2) — pure, DOM-free, tsx --test-able"
    - "Dirtiness derived by a pure selector, never stored in the accumulator (D-02)"
    - "int64 currency stays a decimal string end-to-end (accumulator → editsToPayload → wire)"

key-files:
  created:
    - electron/ui/state/reducer.ts
    - electron/ui/state/selectors.ts
    - test/ui/reducer.test.ts
  modified: []

key-decisions:
  - "String()-normalized equality in editsToPayload so the string(int64)/number(int32) split never yields a false diff"
  - "Unresolvable fieldKey (loaded === undefined) is treated as changed (emits) — fail-open so an edit is never silently dropped"
  - "Kept the comment-terminator sequence out of JSDoc block comments (LOAD_*/WRITE_* had prematurely closed a comment) — reworded to prose"

patterns-established:
  - "Pattern 1: pure reducer mirrors src/patcher.ts (typed discriminated union + exhaustiveness never-guard, no mutation)"
  - "Pattern 2: selectors mirror src/ipc/ipc-guards.ts toWireReport (pure map-and-project)"

requirements-completed: [SAFE-02, EDIT-03]

coverage:
  - id: D1
    description: "Pure appReducer with the D-02 edit accumulator; SET_EDIT/CLEAR_EDIT/LOAD/PREVIEW/WRITE transitions are non-mutating"
    requirement: "EDIT-03"
    verification:
      - kind: unit
        ref: "test/ui/reducer.test.ts#SET_EDIT skill xp then the same skill level leaves ONLY the level key; one skill edit"
        status: pass
      - kind: unit
        ref: "npm run typecheck (tsc --noEmit)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Pitfall 5 mutual exclusion — setting a skill xp|level key clears the sibling so level+xp never both cross (avoids ConflictingEditError)"
    requirement: "SAFE-02"
    verification:
      - kind: unit
        ref: "test/ui/reducer.test.ts#SET_EDIT skill xp then the same skill level leaves ONLY the level key; one skill edit"
        status: pass
    human_judgment: false
  - id: D3
    description: "editsToPayload derives dirty edits (valid AND changed); int64 currency emitted as a decimal string; dirtyCount === payload length"
    requirement: "EDIT-03"
    verification:
      - kind: unit
        ref: "test/ui/reducer.test.ts#a changed valid int64 gp edit emits a decimal STRING (T-4-08); dirtyCount 1"
        status: pass
      - kind: unit
        ref: "test/ui/reducer.test.ts#an entry equal to its loaded value contributes no edit; dirtyCount 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "Duplicate-itemId bank stacks with distinct fieldKeys are independently editable (T-05-02)"
    requirement: "EDIT-03"
    verification:
      - kind: unit
        ref: "test/ui/reducer.test.ts#two NormalLog stacks with distinct fieldKeys both emit"
        status: pass
    human_judgment: false

# Metrics
duration: 8min
completed: 2026-07-04
status: complete
---

# Phase 5 Plan 4: Renderer State Reducer + Selectors Summary

**Pure top-level `useReducer` store (D-02 fieldKey-keyed edit accumulator) with derived dirtiness, int64-as-string payload projection, and Pitfall 5 skill xp/level mutual exclusion — all proven under `tsx --test`.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-04T22:34:00Z
- **Completed:** 2026-07-04T22:41:59Z
- **Tasks:** 2
- **Files modified:** 3 (created)

## Accomplishments
- `appReducer` — a pure, DOM-free reducer (AppState / EditEntry / 12-variant Action union / initialState) that centralizes every renderer state transition, mirroring `src/patcher.ts`'s typed-union + exhaustiveness-guard convention.
- Pitfall 5 mutual exclusion: `SET_EDIT` of a `skill.<id>.xp` key clears any `skill.<id>.level` entry (and vice-versa), so the renderer can never send both and trip the main-process `ConflictingEditError`.
- `editsToPayload` / `dirtyCount` selectors: dirtiness is DERIVED (an entry equal to its loaded ViewModel value emits nothing; an invalid entry emits nothing); int64 currency (`wallet.GoldPieces`/`wallet.SlayerCoins`) crosses as a decimal string, int32/double/level as numbers.
- Bank stacks resolved by offset-free `BankItem.fieldKey`, so duplicate-itemId stacks are addressed and edited distinctly (T-05-02).

## Task Commits

Each task was committed atomically:

1. **Task 1: appReducer + AppState/Action + initialState (D-02, Pitfall 5)** — `1a56ff9` (feat)
2. **Task 2: selectors (editsToPayload, dirtyCount) + reducer/selectors tests** — `5d89515` (feat)

**Plan metadata:** _(final docs commit)_

_Note: this plan's tasks were `tdd="true"`, but per the plan's own task structure the reducer (Task 1) is gated by `npm run typecheck` and the test file lands with the selectors (Task 2); the RED/GREEN split is not expressed as separate commits here._

## Files Created/Modified
- `electron/ui/state/reducer.ts` — pure `appReducer`, `AppState`, `EditEntry`, `Action` union, `initialState`; ViewModel/WireChangeRow/Violation via `import type` only.
- `electron/ui/state/selectors.ts` — `editsToPayload(state)` (derived dirty payload, int64 as string) and `dirtyCount(state)`.
- `test/ui/reducer.test.ts` — 5 assertions across 3 suites (D-02 derivation, int64-as-string, invalid-skip, Pitfall 5, duplicate-itemId addressing).

## Decisions Made
- **String-normalized equality** in `editsToPayload` (`String(loaded) === String(entry.value)`) so the string(int64)/number(int32) representation split never produces a false "changed" verdict.
- **Fail-open on unresolvable keys**: when a fieldKey resolves to nothing in the ViewModel (`loaded === undefined`), the entry is treated as changed and emitted, rather than silently dropped.
- **exactOptionalPropertyTypes-safe state construction**: optional keys (`errorKind`, `errorMessage`, `write.outputPath`, `write.message`) are OMITTED rather than assigned `undefined`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- **JSDoc premature-close bug (self-corrected during Task 1):** the substring `LOAD_*/WRITE_*` inside a `/** ... */` block comment contains `*/`, which closed the comment early and produced a cascade of `tsc` parse errors. Reworded the comment to prose (`The LOAD and WRITE actions ...`); typecheck then passed. This was fixed before the Task 1 commit, so it is a within-task correction, not a plan deviation.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The single pure store + payload projection are ready for `App.tsx` (Plan 05-05+) to wire into `useReducer` and dispatch against the four IPC bridge methods.
- `editsToPayload` output is exactly the `WireEdit[]` the preview/write IPC handlers expect; `dirtyCount` is ready to drive the Preview badge (D-07).
- No blockers.

## Self-Check: PASSED

- FOUND: electron/ui/state/reducer.ts
- FOUND: electron/ui/state/selectors.ts
- FOUND: test/ui/reducer.test.ts
- FOUND: .planning/phases/05-renderer-ui-browse-search-edit-preview/05-04-SUMMARY.md
- FOUND commit: 1a56ff9 (Task 1)
- FOUND commit: 5d89515 (Task 2)

---
*Phase: 05-renderer-ui-browse-search-edit-preview*
*Completed: 2026-07-04*
