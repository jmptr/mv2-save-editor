---
phase: 05-renderer-ui-browse-search-edit-preview
plan: 03
subsystem: ui
tags: [validation, filter, format, bigint, int64, experience-table, react-renderer, tdd]

# Dependency graph
requires:
  - phase: 05-02
    provides: React renderer build target + type-only IPC contract (electron/ui scaffold, tsconfig)
  - phase: 03
    provides: golden-tested StandardExperienceTable (src/experience-table.ts xpForLevel/levelForXp)
  - phase: 04
    provides: patcher bounds (src/patcher.ts INT32_MAX/INT64_MAX) the client mirror copies
provides:
  - Client validation mirror (validateInt32/Int64/Level/Xp -> FieldResult) with patcher-matched bounds
  - Filter predicate matches(query, id) — case-insensitive substring, no user-input pattern (ReDoS-safe)
  - Format helpers: levelToXpDisplay (reuses xpForLevel) + reversible string-based int64 grouping
affects: [EditableCell, SkillPanel, BankPanel, SummaryBar, App reducer, PreviewModal]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure DOM-free renderer-logic modules under electron/ui/lib, unit-tested via tsx --test (no new deps)"
    - "int64 handled as a decimal string end-to-end via BigInt — never coerced through Number (D-06)"
    - "format.ts is the sole renderer module that value-imports src/experience-table.ts (D-03)"

key-files:
  created:
    - electron/ui/lib/validation.ts
    - electron/ui/lib/filter.ts
    - electron/ui/lib/format.ts
    - test/ui/validation.test.ts
    - test/ui/filter.test.ts
    - test/ui/format.test.ts
  modified: []

key-decisions:
  - "Client mirror is hand-rolled (~30 lines), not Zod — Zod's number can't hold int64 without a custom string refine (RESEARCH)."
  - "int64 grouping uses a pure string regex (\\B(?=(\\d{3})+(?!\\d))), so ungroupInt64(groupInt64(d)) === d for any digit string — no numeric coercion."
  - "validateXp error copy reuses the 'Value must be between 0 and N.' Copywriting shape (N = Number.MAX_SAFE_INTEGER) — consistent with the int32/int64 contract."

patterns-established:
  - "Renderer client-logic modules stay pure/DOM-free so they run under the existing node:test + tsx runner with zero new test deps."
  - "Bounds that mirror an authoritative main-process module carry a header comment pointing at the authority and MUST stay in lockstep."

requirements-completed: [EDIT-01, EDIT-02, EDIT-03, BROWSE-04, BROWSE-05]

coverage:
  - id: D1
    description: "Client validation mirror: validateInt32/Int64/Level/Xp accept/reject at exactly the patcher bounds; int64 stays a decimal string (never Number)."
    requirement: "EDIT-01"
    verification:
      - kind: unit
        ref: "test/ui/validation.test.ts (15 assertions across int32/int64/level/xp)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Bank quantity (int32) and skill level (int32) client validation with UI-SPEC error copy."
    requirement: "EDIT-02"
    verification:
      - kind: unit
        ref: "test/ui/validation.test.ts#validateInt32 / validateLevel"
        status: pass
    human_judgment: false
  - id: D3
    description: "Skill XP (double) + level→XP live echo reusing the golden experience-table."
    requirement: "EDIT-03"
    verification:
      - kind: unit
        ref: "test/ui/validation.test.ts#validateXp; test/ui/format.test.ts#levelToXpDisplay"
        status: pass
    human_judgment: false
  - id: D4
    description: "Filter predicate matches(query, id): case-insensitive substring, empty matches all, regex-metachar matches literally (no ReDoS)."
    requirement: "BROWSE-04"
    verification:
      - kind: unit
        ref: "test/ui/filter.test.ts (5 assertions)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Same filter predicate applies to the skills list (BROWSE-05) — one shared pure module."
    requirement: "BROWSE-05"
    verification:
      - kind: unit
        ref: "test/ui/filter.test.ts (shared predicate)"
        status: pass
    human_judgment: false

# Metrics
duration: 3min
completed: 2026-07-04
status: complete
---

# Phase 5 Plan 03: Client-Logic Modules (validation / filter / format) Summary

**Three pure, DOM-free renderer modules — a patcher-mirrored validation layer that keeps int64 a decimal string, a ReDoS-safe substring filter, and a level→XP/int64-grouping formatter reusing the golden experience-table — all TDD-proven under the existing tsx runner with zero new deps.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-07-04T22:32:23Z
- **Completed:** 2026-07-04T22:35:34Z
- **Tasks:** 2 completed (both TDD: RED → GREEN)
- **Files modified:** 6 created

## Accomplishments
- Client validation mirror (`validation.ts`) accepts/rejects at EXACTLY the patcher bounds (INT32_MAX=2_147_483_647, INT64_MAX=9_223_372_036_854_775_807n, lower bound 0); int64 parses via BigInt and returns the unchanged decimal string so values above 2^53 round-trip byte-exactly.
- Filter predicate (`filter.ts`) is a plain case-insensitive `String.includes` — empty query matches all, regex metacharacters match literally, and no pattern is ever compiled from user input (mitigates T-05-06).
- Format helpers (`format.ts`) reuse the golden `xpForLevel` for the live level→XP echo and provide a reversible string-only int64 thousands-grouping (`ungroupInt64(groupInt64(d)) === d` for any digit string, no numeric coercion — mitigates T-05-07).
- All three modules unit-green (25 new assertions); full suite 256 tests pass; `typecheck` and `typecheck:ui` clean.

## Task Commits

Each task was committed atomically (TDD RED → GREEN):

1. **Task 1: validation.ts client mirror + tests** - `c335759` (test RED) → `b1ba78d` (feat GREEN)
2. **Task 2: filter.ts + format.ts + tests** - `5115dfb` (test RED) → `171f405` (feat GREEN)

_TDD tasks have two commits each (failing test → implementation). No REFACTOR commit was needed._

## Files Created/Modified
- `electron/ui/lib/validation.ts` - Client validation mirror; four validators → `FieldResult`; bounds copied from src/patcher.ts; int64 via BigInt only.
- `electron/ui/lib/filter.ts` - `matches(query, id)` case-insensitive substring predicate; never builds a pattern from user input.
- `electron/ui/lib/format.ts` - `levelToXpDisplay` (value-imports `xpForLevel`, the sole allowed src/* value-import) + `groupInt64`/`ungroupInt64` reversible string grouping.
- `test/ui/validation.test.ts` - 15 assertions: int32/int64 boundaries, int64 string round-trip past 2^53, level/xp copy.
- `test/ui/filter.test.ts` - 5 assertions: case-insensitivity, empty-matches-all, literal metachar match.
- `test/ui/format.test.ts` - level→XP echo reuse + int64 grouping reversibility above 2^53.

## Decisions Made
- Kept the hand-rolled mirror over Zod (Zod's `number` cannot represent int64 without a custom string refine — no leverage, per RESEARCH).
- int64 grouping is a pure string transform (regex separator insert/strip), guaranteeing exact reversibility with no `Number` on the value.
- `validateXp` reuses the `Value must be between 0 and {max}.` copy shape (max = `Number.MAX_SAFE_INTEGER`), consistent with the int32/int64 Copywriting Contract entries.

## Deviations from Plan

None - plan executed exactly as written. (During GREEN, two acceptance-grep false positives — the tokens `RegExp` and `Number(` appearing only inside doc comments — were reworded so the literal acceptance greps pass; no behavior change.)

## Issues Encountered
- Acceptance criteria are literal greps (`grep -q 'RegExp'`, `Number(`). The initial doc comments contained those tokens, tripping the greps despite no actual usage. Reworded the comments ("pattern" / "numeric coercion") so the greps are clean while preserving the security rationale. Tests unaffected.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `validation.ts`, `filter.ts`, `format.ts` are ready for consumption by the downstream renderer plans: `EditableCell` (validateInt32/Int64/Level/Xp), `BankPanel`/`SkillPanel` (`matches`), `SummaryBar`/`SkillPanel` (`groupInt64`/`levelToXpDisplay`).
- No blockers. All bounds are in lockstep with src/patcher.ts; main stays the authority (client mirror is UX-only).

## Self-Check: PASSED

All 6 created files present on disk; all 4 task commits (c335759, b1ba78d, 5115dfb, 171f405) found in git history.

---
*Phase: 05-renderer-ui-browse-search-edit-preview*
*Completed: 2026-07-04*
