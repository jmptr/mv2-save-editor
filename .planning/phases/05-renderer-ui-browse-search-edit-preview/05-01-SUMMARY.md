---
phase: 05-renderer-ui-browse-search-edit-preview
plan: 01
subsystem: parser
tags: [view-model, field-table, bank-inventory, edit-02, offset-free, sc-4]

# Dependency graph
requires:
  - phase: 02-save-format-parser
    provides: FieldTable + offset-free ViewModel projection (projectViewModel), bank.inventory keys
  - phase: 03-patcher
    provides: patchSave resolving edits by fieldKey against a fresh FieldTable
provides:
  - "BankItem.fieldKey — an offset-free, stable, per-stack key the renderer sends for an EDIT-02 quantity edit"
  - "Offset-free bank key scheme bank.inventory.<itemId>#<occurrenceIndex> (byte offset stays internal to the FieldEntry)"
  - "Deterministic walk-order occurrence indexing shared by the FieldTable build and the ViewModel projection so main re-resolves the exact key"
affects: [05-02, 05-03, 05-04, renderer bank browse/edit, EDIT-02]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Occurrence-indexed offset-free keys: per-itemId Map counter advanced in deterministic walk order, computed identically in FieldTable build + projection"

key-files:
  created: []
  modified:
    - src/save-parser.ts
    - src/view-model.ts
    - test/save-parser.test.ts
    - test/patcher.test.ts
    - test/field-table.test.ts

key-decisions:
  - "Re-key bank stacks by per-itemId occurrence index (#<n>) instead of byte offset (@<qtyOffset>) — the key string becomes offset-free while the FieldEntry.offset still carries the real qtyOffset (stronger SC-4, no offset leaks to the renderer)"
  - "Compute the occurrence index in BOTH parseSave (FieldTable) and projectViewModel over the same context.bankStacks walk order so BankItem.fieldKey is byte-identical to its FieldTable key"

patterns-established:
  - "Offset-free renderer-facing keys: uniqueness for duplicate itemIds comes from a deterministic occurrence counter, not the byte offset"

requirements-completed: [EDIT-02]

coverage:
  - id: D1
    description: "Bank FieldTable keys are offset-free (bank.inventory.<itemId>#<occurrenceIndex>); the FieldEntry.offset still holds the real qtyOffset internally"
    requirement: "EDIT-02"
    verification:
      - kind: unit
        ref: "test/save-parser.test.ts#FieldTable: bank inventory stack present (qty + placeholder + locked) (SC-1)"
        status: pass
    human_judgment: false
  - id: D2
    description: "BankItem.fieldKey is set (offset-free) and equals the FieldTable key; every stack's fieldKey resolves to its quantity, and duplicate itemIds get distinct #0/#1 keys"
    requirement: "EDIT-02"
    verification:
      - kind: unit
        ref: "test/save-parser.test.ts#duplicate itemIds get distinct #<n> keys and every fieldKey resolves to its qty (EDIT-02, T-05-01/T-05-03)"
        status: pass
    human_judgment: false
  - id: D3
    description: "ViewModel remains offset-free at any depth with the new key (SC-4 preserved) and full parser/patcher suite stays green"
    verification:
      - kind: unit
        ref: "test/save-parser.test.ts#assertNoOffsets(viewModel) passes — no byte offset leaks into the view model (SC-4 runtime)"
        status: pass
      - kind: unit
        ref: "npm test (231 tests, 0 fail)"
        status: pass
    human_judgment: false

# Metrics
duration: 12min
completed: 2026-07-04
status: complete
---

# Phase 5 Plan 01: Offset-free bank keys + BankItem.fieldKey Summary

**Re-keyed bank stacks from `bank.inventory.<itemId>@<qtyOffset>` to the offset-free `bank.inventory.<itemId>#<occurrenceIndex>` and surfaced that exact key on `BankItem.fieldKey`, unblocking EDIT-02 renderer addressing while strengthening SC-4.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-04
- **Completed:** 2026-07-04
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Bank stacks now keyed by a deterministic per-itemId occurrence index (`#<n>`) instead of the byte offset — the key string carries no offset, so nothing offset-bearing can reach the renderer via a key (T-05-03).
- Added `BankItem.fieldKey: string` (offset-free), set in `projectViewModel` to the byte-identical FieldTable key by re-walking the same `context.bankStacks` order (T-05-01 deterministic re-resolution on preview/write).
- The FieldEntry `offset` still carries the real `qtyOffset` internally — the patcher is unchanged and continues to write at the correct byte (only the key STRING changed).
- Full suite green (231 tests): 689-stack count, no-offset scan, and Phase 1–4 golden/round-trip tests all still pass; added a duplicate-itemId + fieldKey round-trip assertion.

## Task Commits

Each task was committed atomically:

1. **Task 1: Re-key bank stacks offset-free and expose BankItem.fieldKey** - `1f5adfc` (feat)
2. **Task 2: Update core tests to the offset-free bank key + fieldKey projection** - `3881c37` (test)

**Plan metadata:** (docs: complete plan — this commit)

## Files Created/Modified
- `src/save-parser.ts` - Bank key construction now `bank.inventory.${itemId}#${n}` via a per-itemId `Map` counter; `projectViewModel` sets `BankItem.fieldKey` using the same walk-order counter. Module comment updated to describe the `#<occurrenceIndex>` scheme.
- `src/view-model.ts` - Added `fieldKey: string` to the `BankItem` interface (with a note that there is intentionally NO `offset` member).
- `test/save-parser.test.ts` - Re-pointed NormalLog assertions to `#0`; added a duplicate-itemId (distinct `#0`/`#1`) + fieldKey↔FieldTable round-trip test over all 689 stacks; refreshed stale comments.
- `test/patcher.test.ts` - Updated `BANK_QTY_KEY` and header comments to the offset-free scheme.
- `test/field-table.test.ts` - Added the now-required `fieldKey` to a `BankItem` literal (typecheck fix).

## Decisions Made
- Kept the real byte offset in `FieldEntry.offset` and changed only the key string — this satisfies EDIT-02 addressing without touching the patcher and strictly improves SC-4 (no offset in any renderer-visible key).
- Chose per-itemId occurrence indexing (rather than a global stack index) so the key is stable and human-legible (`NormalLog#0`, `NormalLog#1`), and computed it identically in both the FieldTable build and the projection to guarantee byte-identical keys.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `fieldKey` to a BankItem literal in test/field-table.test.ts**
- **Found during:** Task 1 (typecheck verification)
- **Issue:** Making `fieldKey` a required member of `BankItem` broke `test/field-table.test.ts`, which constructs a `BankItem` object literal without it — `npm run typecheck` (Task 1's verify gate) failed.
- **Fix:** Added `fieldKey: 'bank.inventory.MelvorBase:NormalLog#0'` to that literal.
- **Files modified:** test/field-table.test.ts
- **Verification:** `npm run typecheck` green; `npm test` green.
- **Committed in:** `1f5adfc` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The fix was required to satisfy Task 1's own typecheck gate. The plan's task-2 file list only named the two test files with bank-key assertions; `field-table.test.ts` also constructs a `BankItem` and therefore had to accept the new required field. No scope creep — mechanical field addition only.

## Issues Encountered
- Discovered `MelvorBase:NormalLog` itself appears twice in the fixture (a real duplicate itemId). This was fortuitous: the duplicate-key test uses `NormalLog#0` / `NormalLog#1` directly against the fixture rather than needing a synthetic duplicate.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The renderer can now construct an EDIT-02 quantity-edit payload from `BankItem.fieldKey` with no offset knowledge; main resolves it against a fresh FieldTable.
- No blockers. Remaining Phase 5 plans (browse/search/edit/preview UI) can consume `BankItem.fieldKey` directly.

## Self-Check: PASSED

All modified files exist on disk; both task commits (`1f5adfc`, `3881c37`) are present in git history.

---
*Phase: 05-renderer-ui-browse-search-edit-preview*
*Completed: 2026-07-04*
