---
phase: 05-renderer-ui-browse-search-edit-preview
plan: 06
subsystem: ui
tags: [react, tanstack-react-virtual, int64, bigint, virtualization, useReducer]

# Dependency graph
requires:
  - phase: 05-01
    provides: BankItem.fieldKey (offset-free per-itemId occurrence key) + Summary projection
  - phase: 05-03
    provides: matches() filter predicate + validateInt32/validateInt64 client mirror
  - phase: 05-04
    provides: appReducer + SET_EDIT/CLEAR_EDIT actions + EditEntry accumulator
  - phase: 05-05
    provides: EditableCell + VirtualList shared primitives
provides:
  - SummaryBar.tsx — read-only name/gamemode/totalLevel + click-to-edit int64 GP/SC (BROWSE-01, EDIT-01, D-06)
  - BankPanel.tsx — filterable virtualized bank list with inline int32 quantity edits (BROWSE-02/04, EDIT-02)
affects: [05-07, 05-08, App integration, preview/write wiring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "int64 currency string end-to-end: display, EditableCell seed, and SET_EDIT payload never touch Number (D-06)"
    - "Filter text as LOCAL useState + useMemo slice; keystrokes never route through the top reducer (RESEARCH Pattern 2)"
    - "VirtualList remount via key={q} to reset scroll to top on query change (Pitfall 4)"
    - "Seed EditableCell from edits[fieldKey]?.raw ?? loaded value so in-progress edits survive row remount"

key-files:
  created:
    - electron/ui/components/SummaryBar.tsx
    - electron/ui/components/BankPanel.tsx
  modified: []

key-decisions:
  - "Seed each EditableCell from the accumulator's raw text (edits[fieldKey]?.raw) falling back to the loaded value, so a pending edit re-displays after a virtualized row unmounts/remounts on scroll"
  - "Reset bank list scroll to top on query change via VirtualList key={q} remount (BankPanel cannot reach VirtualList's internal scroll ref)"
  - "onInvalid dispatches CLEAR_EDIT for both currencies and quantities so an invalid value drops any prior valid entry (D-04), consistent with EditableCell's no-edit-on-invalid contract"
  - "Reused existing list-row--edited class for the summary edited-currency accent left-bar rather than adding a new CSS class (styles.css out of plan scope)"

patterns-established:
  - "Click-to-edit affordance: read-only mono value + ✎ Unicode button toggling local editing state into an inline EditableCell (no icon dependency)"
  - "Metadata flags (isPlaceholder/isLocked) render as conditional muted column-header labels inside a virtualized row"

requirements-completed: [BROWSE-01, BROWSE-02, BROWSE-04, EDIT-01, EDIT-02]

coverage:
  - id: D1
    description: "SummaryBar renders read-only name/gamemode/totalLevel and click-to-edit int64 GP/SC dispatching SET_EDIT (wallet.GoldPieces/wallet.SlayerCoins) via validateInt64, int64 never coerced to Number"
    requirement: "BROWSE-01"
    verification:
      - kind: unit
        ref: "npm run typecheck:ui (tsc --noEmit -p electron/ui/tsconfig.json)"
        status: pass
      - kind: other
        ref: "grep 'wallet.GoldPieces' && grep 'wallet.SlayerCoins' electron/ui/components/SummaryBar.tsx"
        status: pass
    human_judgment: true
    rationale: "Visual click-to-edit affordance, focal-point styling, and the int64-never-Number behavior across the live edit loop need a human to exercise in the running renderer (no rendering test harness exists yet — arrives in 05-07/08)"
  - id: D2
    description: "BankPanel virtualizes filtered bank stacks keyed by BankItem.fieldKey, filters as-you-type via matches, edits quantity inline via validateInt32 (SET_EDIT/CLEAR_EDIT by fieldKey), and shows the UI-SPEC 'No matches' empty copy"
    requirement: "BROWSE-02"
    verification:
      - kind: unit
        ref: "npm run typecheck:ui (tsc --noEmit -p electron/ui/tsconfig.json)"
        status: pass
      - kind: other
        ref: "grep 'useMemo' && grep 'fieldKey' && grep 'validateInt32' electron/ui/components/BankPanel.tsx"
        status: pass
    human_judgment: true
    rationale: "As-you-type filtering, virtualized scroll-reset, inline quantity editing, and the filtered-empty state need a human to drive in the running renderer; no component test harness exists in this phase yet"

# Metrics
duration: 2min
completed: 2026-07-04
status: complete
---

# Phase 05 Plan 06: SummaryBar + BankPanel Summary

**Read-only summary bar with click-to-edit int64 GP/Slayer Coins (string end-to-end) and a filterable, virtualized bank panel with inline int32 quantity edits addressed by offset-free BankItem.fieldKey.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-07-04T22:52:52Z
- **Completed:** 2026-07-04T22:54:09Z
- **Tasks:** 2
- **Files modified:** 2 (both created)

## Accomplishments
- `SummaryBar.tsx` renders name/gamemode/totalLevel strictly read-only (BROWSE-01) and GP/Slayer Coins as click-to-edit int64 decimal strings — validated by `validateInt64`, dispatched via `SET_EDIT` (`wallet.GoldPieces`/`wallet.SlayerCoins`), never coerced through `Number` (EDIT-01, D-06).
- `BankPanel.tsx` virtualizes all bank stacks keyed by the offset-free `BankItem.fieldKey` (BROWSE-02), filters as-you-type via `matches` with a local-`useState` query + memoised slice (BROWSE-04), and edits each quantity inline via `validateInt32` dispatching `SET_EDIT`/`CLEAR_EDIT` by `fieldKey` (EDIT-02).
- Filtered-empty state renders the UI-SPEC `No matches` copy; the list scroll resets to top on query change via a `key={q}` remount (Pitfall 4).

## Task Commits

Each task was committed atomically:

1. **Task 1: SummaryBar — read-only summary + click-to-edit int64 GP/SC (D-06)** - `6f01186` (feat)
2. **Task 2: BankPanel — filter + virtualized list + inline quantity edit** - `ba4c419` (feat)

**Plan metadata:** (this commit) (docs: complete plan)

## Files Created/Modified
- `electron/ui/components/SummaryBar.tsx` - Read-only summary + click-to-edit int64 currencies; internal `CurrencyField` toggles an inline EditableCell; edited currency shows the accent left-bar.
- `electron/ui/components/BankPanel.tsx` - Heading + local-state filter input + memoised `matches` slice + VirtualList keyed by `fieldKey`; per-row mono itemId, placeholder/locked flags, and int32 quantity EditableCell.

## Decisions Made
- Seed each EditableCell from `edits[fieldKey]?.raw ?? loaded` so a pending edit re-displays after a virtualized row unmounts/remounts on scroll (committed edits already live in the reducer; this keeps the display consistent).
- Reset the bank list scroll on query change with `VirtualList key={q}` — BankPanel cannot reach VirtualList's internal scroll ref, and a key-driven remount is the cleanest CSP-safe reset.
- `onInvalid` dispatches `CLEAR_EDIT` (not just "no-op") for both currencies and quantities, so an invalid entry drops any prior valid edit for that key (D-04).
- Reused the existing `list-row--edited` class for the summary edited-currency accent bar instead of adding CSS (styles.css was out of this plan's file scope).

## Deviations from Plan

None - plan executed exactly as written. Both files were created using only the shared primitives and reducer actions delivered by prior waves; no auto-fixes (Rules 1-3) or architectural changes (Rule 4) were required. `npm run typecheck:ui` passed on the first run for each task.

## Issues Encountered
None.

## Known Stubs
None. Both components are fully wired to real data sources: SummaryBar renders the live `Summary` projection and dispatches into the accumulator; BankPanel filters/edits the live `bankItems` list. App-level composition (mounting these panels + wiring the preview/write loop) is owned by downstream plans 05-07/08, not stubbed here.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SummaryBar and BankPanel are ready to be composed into the App layout (left column) alongside the SkillPanel and preview/write bar in the remaining Phase 05 plans.
- Both consume the shared `edits`/`dispatch` contract, so App-level wiring is a straight prop hand-off; no new state plumbing needed.
- No blockers.

## Self-Check: PASSED

- FOUND: electron/ui/components/SummaryBar.tsx
- FOUND: electron/ui/components/BankPanel.tsx
- FOUND: commit 6f01186 (Task 1)
- FOUND: commit ba4c419 (Task 2)

---
*Phase: 05-renderer-ui-browse-search-edit-preview*
*Completed: 2026-07-04*
