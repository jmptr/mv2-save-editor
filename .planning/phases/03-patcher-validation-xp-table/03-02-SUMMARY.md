---
phase: 03-patcher-validation-xp-table
plan: 02
subsystem: patcher
tags: [patcher, validation, in-place-write, bigint, xp-coupling, self-verify, tdd, melvor]

# Dependency graph
requires:
  - phase: 02-parser
    provides: FieldTable ({offset,kind,width,value,readOnly}) + parseSave — the offset source + re-parse used by self-verify
  - phase: 03-patcher-validation-xp-table
    plan: 01
    provides: experience-table (xpForLevel / levelForXp) — the XP<->Level coupling for skill edits
provides:
  - src/patcher.ts — patchSave(buffer, fieldTable, edits) -> { buffer, changeReport } same-width in-place patch engine
  - PatchError hierarchy (ValidationError/ReadOnlyFieldError/UnknownFieldError/ConflictingEditError/UnintendedChangeError)
affects: [write-pipeline, preview-model, UI-edit-flow, SAFE-01, EDIT-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Collect-all-then-write batch validation (inverse of the parsers' throw-on-first): accumulate every violation, throw one aggregate ValidationError, write nothing on any failure"
    - "Same-width at-offset write on a Buffer.from(input) copy via writeBigInt64LE/writeInt32LE/writeDoubleLE — length-neutral by construction, input never mutated"
    - "Self-verify by whole-buffer diff + verbatim parseSave re-parse — only intended [offset,offset+width) ranges may change"
    - "Fail-loud typed-error hierarchy mirroring field-table.ts ParseError (constructor sets this.name; subclasses carry actionable fields)"

key-files:
  created:
    - src/patcher.ts
    - test/patcher.test.ts
  modified: []

key-decisions:
  - "Resolution errors (unknown key / readOnly target) and the level+xp conflict are fail-loud typed errors thrown BEFORE range validation; only value out-of-range/type failures aggregate into ValidationError (D-01 collect-all applies to value violations, matching the plan's per-error-type assertions)"
  - "Skill level validated to 1..cap BEFORE deriving xpForLevel(L) — the table has no entry past the cap, so an unvalidated level would compute an undefined XP and corrupt the write"
  - "Skill XP upper-bounded by xpForLevel(levelCap) — over-cap XP is REJECTED, never clamped (A1); levelForXp already clamps the derived level to cap"
  - "int64 currency is bigint end-to-end (writeBigInt64LE); a number value for an int64 field is itself a validation violation (T-03-04 precision continuity)"

patterns-established:
  - "Batch patch engine: resolve → detect conflict → validate+expand (collect-all) → copy+write → self-verify"
  - "Coupled-field expansion: one skill level/xp edit yields two change-report rows (edited field + its experience-table counterpart); LevelCap never appears"

requirements-completed: [SAFE-01, EDIT-04]

coverage:
  - id: SC-1
    description: "Each field written at its declared width (int64=8B, int32=4B, double=8B); out.length === input.length after every patch; input buffer never mutated (D-04)"
    requirement: "SAFE-01"
    verification:
      - kind: unit
        ref: "test/patcher.test.ts#patchSave — SC-1 width/length + D-04 non-mutation"
        status: pass
    human_judgment: false
  - id: SC-2
    description: "Every out-of-range / readOnly / unknown / conflicting edit is rejected before any byte is written, all violations collected (SAFE-01, D-01) — fail-loud, never clamp"
    requirement: "SAFE-01"
    verification:
      - kind: unit
        ref: "test/patcher.test.ts#patchSave — SAFE-01 negatives rejected before write; D-01 collect-all"
        status: pass
    human_judgment: false
  - id: SC-3
    description: "skill.<id>.level=L writes Level=L AND XP=xpForLevel(L); skill.<id>.xp=X writes XP=X AND Level=levelForXp(X,cap); LevelCap is never written (EDIT-04, D-02)"
    requirement: "EDIT-04"
    verification:
      - kind: unit
        ref: "test/patcher.test.ts#patchSave — EDIT-04 XP<->Level coupling (D-02)"
        status: pass
    human_judgment: false
  - id: SC-4
    description: "Self-verify re-parses the patched buffer and whole-buffer-diffs it against the input; only intended [offset,offset+width) ranges may change, and a codec round-trip reads the edited value back (D-03)"
    requirement: "SAFE-01"
    verification:
      - kind: unit
        ref: "test/patcher.test.ts#patchSave — SC-4 diff + re-parse + round-trip"
        status: pass
    human_judgment: false
  - id: MANUAL-load-in-game
    description: "Apply an edit, recompress via codec, load the resulting .sav in Melvor Idle 2 — the edited value persists and the save is not rejected"
    requirement: "SAFE-01"
    verification:
      - kind: manual
        ref: "03-VALIDATION.md §Manual-Only Verifications — out-of-process, not an automated gate"
        status: pending
    human_judgment: true

# Metrics
duration: 4min
completed: 2026-07-04
status: complete
---

# Phase 03 Plan 02: Patcher + Validation Engine Summary

**Same-width, in-place patch engine (`src/patcher.ts`) — `patchSave` resolves each edit to its FieldTable entry, validates the whole batch reject-never-clamp (SAFE-01), expands skill level/xp edits into their coupled pair via the StandardExperienceTable (EDIT-04), writes onto a Buffer copy at the declared width, and self-verifies by whole-buffer diff + verbatim re-parse so only intended byte ranges can change (SC-4).**

## Performance

- **Duration:** ~4 min
- **Completed:** 2026-07-04
- **Tasks:** 2 (TDD: RED + GREEN)
- **Files created:** 2 (`src/patcher.ts`, `test/patcher.test.ts`)

## Accomplishments
- `patchSave(buffer, fieldTable, edits) -> { buffer, changeReport }` writes each field at its declared width (int64 GP=8B, int32 qty/level=4B, double XP=8B); `output.length === input.length` holds by construction and the input buffer is never mutated (SC-1, D-04).
- Collect-all-then-write validation: out-of-range int32/int64, level outside 1..cap, non-finite/negative/over-cap XP, readOnly targets (LevelCap + header GP/SC mirrors), unknown keys, and level+xp conflicts are all rejected before any byte is written; a batch of N bad value edits throws one `ValidationError` carrying N violations (SC-2, SAFE-01, D-01).
- Skill edits stay consistent on disk: `level=L` also writes `XP=xpForLevel(L)`; `xp=X` also writes `Level=levelForXp(X,cap)`; `LevelCap` never appears in the change report (SC-3, EDIT-04, D-02).
- Self-verify re-parses the patched buffer with the verbatim `parseSave` and whole-buffer-diffs it; any byte outside an intended `[offset,offset+width)` range throws `UnintendedChangeError` (SC-4, D-03). A codec round-trip (compress→decompress→parseSave) reads the edited value back.
- 22 new assertions green; full suite 196/196 (+22 from 174); `tsc --noEmit` exit 0; `c8` reports 100% lines/branches/functions/statements on `src/patcher.ts`.

## Task Commits

Each task was committed atomically (TDD RED → GREEN):

1. **Task 1: RED — failing patchSave suite** — `b85b1d6` (test)
2. **Task 2: GREEN — implement src/patcher.ts** — `893596f` (feat)

_No REFACTOR commit: the GREEN implementation already matched the established module-header + fail-loud-typed-error pattern; no cleanup was warranted._

## Files Created/Modified
- `src/patcher.ts` — the patch engine: `Edit` / `ChangeReportRow` / `PatchResult` interfaces, the `PatchError` hierarchy (`ValidationError` carrying the full violations list, `ReadOnlyFieldError`, `UnknownFieldError`, `ConflictingEditError`, `UnintendedChangeError`), and `patchSave` (resolve → conflict-check → validate+expand collect-all → copy+write → self-verify).
- `test/patcher.test.ts` — node:test suite over the committed fixture: SC-1 width/length + non-mutation, all SAFE-01 negatives, D-01 collect-all, EDIT-04/D-02 coupling, the level+xp conflict, and SC-4 (diff + re-parse + codec round-trip). Field keys derived from `parseSave(FIXTURE)` with fixture-drift guards.

## Decisions Made
- **Typed resolution errors precede aggregate validation.** Unknown-key and readOnly-target edits throw their specific typed error (`UnknownFieldError` / `ReadOnlyFieldError`), and a same-skill level+xp batch throws `ConflictingEditError`, all before range validation. Only value out-of-range/type failures aggregate into `ValidationError`. This satisfies both the plan's per-error-type `instanceof` assertions and the D-01 collect-all contract (which the plan exercises with multiple bad *value* edits).
- **Validate level before deriving XP.** `xpForLevel(L)` is undefined past the 120-entry table, so a level edit is range-checked to `1..cap` first; only a valid level is expanded to its coupled XP write. This prevents an out-of-range level from computing an `undefined` XP and corrupting the double write.
- **Over-cap XP rejected, not clamped (A1).** Skill XP is upper-bounded by `xpForLevel(levelCap)`; `levelForXp` already clamps the *derived* level to the cap, but the XP value itself is rejected if it exceeds the cap's XP.
- **int64 currency is bigint end-to-end.** A `number` supplied for an int64 field is itself a validation violation; the write path uses `writeBigInt64LE` exclusively (never `writeDoubleLE`), preserving precision above 2^53 (T-03-04).

## Deviations from Plan
None — plan executed exactly as written. (One in-test fix during GREEN, not a plan deviation: the D-01 collect-all batch initially set both `xp` and `level` of the same skill, which correctly tripped `ConflictingEditError` before validation; the batch was changed to three non-conflicting bad edits — negative qty, negative currency, over-cap level — to exercise the aggregate `ValidationError` path as intended.)

## Issues Encountered
- **D-01 test batch collided with conflict detection.** The first draft of the collect-all test used `xp<0` + `level>cap` for the same skill, so `ConflictingEditError` fired before value validation and the batch never reached `ValidationError`. Resolved by using three independent bad edits (bank qty, wallet GP, skill level) so exactly three value violations are collected. Caught by the GREEN test run before commit.

## Verification Notes
- `npx tsx --test test/patcher.test.ts` → 22/22 pass (SC-1..SC-4, SAFE-01 negatives, D-01 collect-all, EDIT-04/D-02 coupling, conflict rejection).
- `npx tsx --test test/**/*.test.ts` → 196/196 pass (no Phase 1/2 regression; +22 over the prior 174).
- `npx tsc --noEmit` → exit 0 (strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes).
- **Coverage (c8 `--100`):** ran `c8 --check-coverage --lines 100 --branches 100 --functions 100 --statements 100` scoped to `src/patcher.ts` against the patcher suite → 100% on all four metrics (the two `default:` arms and export-interop braces carry justified `/* c8 ignore */`).
- **MANUAL (out-of-process, pending):** apply an edit, recompress via codec, load the `.sav` in Melvor Idle 2 to confirm the edited value persists and the save loads — the project's ultimate acceptance (03-VALIDATION.md §Manual-Only Verifications). Not an automated gate.

## Known Stubs
None.

## TDD Gate Compliance
- RED gate present: `b85b1d6` (`test(03-02): add failing patchSave suite …`) — verified module-not-found for `../src/patcher` before implementation.
- GREEN gate present: `893596f` (`feat(03-02): implement patchSave …`) — suite green after implementation.
- Sequence RED → GREEN confirmed in git log.

## Threat Flags
None — no new security surface introduced. All files are pure in-repo Node-core modules; the threat register dispositions (T-03-02..T-03-06 mitigate, T-03-SC accept) are all satisfied in `src/patcher.ts` and covered by the test suite.

## Next Phase Readiness
- `patchSave` is ready for the write pipeline / preview UI to consume: it returns a fresh buffer + a change report (fieldKey, old→new, offset, width) suitable for a preview/confirm step, and the codec `compress` produces the `.sav` to write to a new file (non-destructive write).
- No blockers. The only outstanding item is the out-of-process manual in-game load verification.

## Self-Check: PASSED
- src/patcher.ts — FOUND
- test/patcher.test.ts — FOUND
- .planning/phases/03-patcher-validation-xp-table/03-02-SUMMARY.md — FOUND
- Commit b85b1d6 (RED) — FOUND
- Commit 893596f (GREEN) — FOUND

---
*Phase: 03-patcher-validation-xp-table*
*Completed: 2026-07-04*
