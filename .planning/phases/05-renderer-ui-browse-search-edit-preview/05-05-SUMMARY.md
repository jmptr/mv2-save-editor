---
phase: 05-renderer-ui-browse-search-edit-preview
plan: 05
subsystem: ui
tags: [react, tanstack-react-virtual, css-tokens, virtualization, inline-validation, csp]

# Dependency graph
requires:
  - phase: 05-02
    provides: React renderer build target + scoped UI tsconfig (typecheck:ui)
  - phase: 05-03
    provides: lib/validation.ts client-mirror validators (FieldResult + validateInt32/64/level/xp)
provides:
  - electron/ui/styles.css — single bundled UI-SPEC token stylesheet (CSP-safe static styling)
  - electron/ui/components/VirtualList.tsx — generic fixed-size @tanstack/react-virtual wrapper
  - electron/ui/components/EditableCell.tsx — inline input running the client validation mirror (D-04)
affects: [05-06, 05-07, 05-08, SummaryBar, BankPanel, SkillPanel, PreviewModal]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single bundled CSS custom-property token stylesheet (no CSS-in-JS) — CSP-safe static styling"
    - "Generic VirtualList<T> keyed by stable id (not virtual index) with constant estimateSize"
    - "Inline transform via React CSSOM style is the only dynamic style (style-src does not govern it)"
    - "EditableCell holds in-progress text in local useState; only valid values propagate upward"

key-files:
  created:
    - electron/ui/styles.css
    - electron/ui/components/VirtualList.tsx
    - electron/ui/components/EditableCell.tsx
  modified: []

key-decisions:
  - "Edited-row 2px accent left-bar implemented as `box-shadow: inset 2px 0 0` (no layout shift, no extra element) vs a border that would reflow row content"
  - "VirtualList asserts items[vi.index]! non-null — the virtualizer never yields OOB indices under noUncheckedIndexedAccess"
  - "EditableCell renders inline error as a sibling <span> in a fragment (no wrapper div) so it drops into any row/cell layout unchanged"

patterns-established:
  - "Accent (#2563EB) confined to the four UI-SPEC reserved roles (CTA fill, focus ring, edited-row bar, pending badge); all other surfaces neutral"
  - "Row height fixed via --row-h 32px token consumed by both the CSS row class and the virtualizer estimateSize"

requirements-completed: [BROWSE-02, BROWSE-03, EDIT-02]

coverage:
  - id: D1
    description: "UI-SPEC token stylesheet (styles.css): :root spacing/type/color tokens + --row-h 32px, layout/panel/list-row/zebra/edited-bar/input/error/badge/CTA/banner/modal classes"
    requirement: BROWSE-02
    verification:
      - kind: automated
        ref: "npm run typecheck:ui (green) + grep --row-h electron/ui/styles.css"
        status: pass
    human_judgment: true
    rationale: "Visual conformance to the UI-SPEC (60/30/10 color discipline, accent reserved-list, zebra/edited-bar rendering) cannot be confirmed until a Wave 3 panel mounts the stylesheet in the running app."
  - id: D2
    description: "VirtualList<T> generic wrapper: useVirtualizer, constant estimateSize, overscan 8, stable-id keys (not index), inline-CSSOM transform (CSP-safe)"
    requirement: BROWSE-03
    verification:
      - kind: automated
        ref: "npm run typecheck:ui (green) + grep useVirtualizer/getKey electron/ui/components/VirtualList.tsx"
        status: pass
    human_judgment: true
    rationale: "Correct windowing behavior (smooth scroll over 689 rows, no stale value/focus jump on filter — Pitfall 4) requires driving the list with real data in a Wave 3 panel."
  - id: D3
    description: "EditableCell inline input runs the passed validator: onValid on ok, onInvalid + inline UI-SPEC error otherwise (invalid contributes no edit, D-04); no raw-HTML injection API"
    requirement: EDIT-02
    verification:
      - kind: automated
        ref: "npm run typecheck:ui (green) + grep onInvalid + absence of dangerouslySetInnerHTML"
        status: pass
    human_judgment: true
    rationale: "As-you-type validation UX (error appears immediately, edit is withheld while invalid) is a behavioral/interaction contract best confirmed via UAT once the cell is wired into Bank/Skill panels."

# Metrics
duration: 6min
completed: 2026-07-04
status: complete
---

# Phase 05 Plan 05: Shared UI Primitives (stylesheet + VirtualList + EditableCell) Summary

**UI-SPEC design-token stylesheet, a generic `@tanstack/react-virtual` fixed-32px list wrapper keyed by stable id, and an inline `EditableCell` running the client validation mirror — the reusable building blocks the Wave 3 panels consume.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-07-04
- **Completed:** 2026-07-04
- **Tasks:** 2
- **Files modified:** 3 (all created)

## Accomplishments
- `styles.css`: one bundled `:root` token block (spacing xs..3xl, `--row-h:32px`, two font stacks, 4 type roles/2 weights, 60/30/10 color tokens) plus layout, panel/column-header, virtualized list-container/row (zebra alt-row, neutral hover, 2px accent edited-row left-bar), input + inline-error + focus-ring, pending-count badge, primary CTA, banner, and modal/overlay classes. Accent is confined to the four UI-SPEC reserved roles; red reserved strictly for problem states.
- `VirtualList.tsx`: generic `VirtualList<T>` (`{ items, getKey, renderRow, rowHeight? }`) using `useVirtualizer` with constant `estimateSize` (no `measureElement`), `overscan: 8`, rows keyed by the caller's stable id (NOT the virtual index — Pitfall 4), and the per-row `translateY` set via React inline CSSOM (the one dynamic style; CSP-safe).
- `EditableCell.tsx`: inline input keeping in-progress text in local `useState`; on change it runs the passed `validate` and calls `onValid(value, raw)` on success (clearing the error) or shows the validator's UI-SPEC error copy inline and calls `onInvalid()` on failure — an invalid value contributes no edit (D-04). No raw-HTML injection API is used (T-05-09 XSS-safe).
- `npm run typecheck:ui` green after both tasks under the scoped React tsconfig.

## Task Commits

Each task was committed atomically:

1. **Task 1: styles.css token system + VirtualList wrapper** - `f66ba4c` (feat)
2. **Task 2: EditableCell inline input + client-mirror validation (D-04)** - `1007b81` (feat)

**Plan metadata:** (this commit) (docs: complete plan)

## Files Created/Modified
- `electron/ui/styles.css` - The single bundled design-system stylesheet: UI-SPEC custom-property tokens + all static component classes (CSP-safe, no CSS-in-JS).
- `electron/ui/components/VirtualList.tsx` - Generic fixed-size virtualization wrapper backing both side-by-side browse lists (D-05).
- `electron/ui/components/EditableCell.tsx` - Inline editable cell running the client validation mirror; drives SET_EDIT on valid / shows inline error on invalid.

## Decisions Made
- Edited-row 2px accent left-bar uses `box-shadow: inset 2px 0 0 var(--c-accent)` rather than a left border, so marking a row edited never reflows its content.
- `VirtualList` asserts `items[vi.index]!` (non-null) because the virtualizer only yields in-bounds indices; this satisfies the project's `noUncheckedIndexedAccess` without a runtime guard on a hot render path.
- `EditableCell` renders its inline error as a sibling `<span>` inside a fragment (no wrapper element), so it composes into any row/cell layout the Wave 3 panels choose.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Non-null index assertion in VirtualList to satisfy noUncheckedIndexedAccess**
- **Found during:** Task 1 (VirtualList wrapper)
- **Issue:** `items[vi.index]` types as `T | undefined` under the root tsconfig's `noUncheckedIndexedAccess`, failing `typecheck:ui` where `getKey`/`renderRow` require `T`.
- **Fix:** Asserted `items[vi.index]!` with a comment noting the virtualizer never yields OOB indices.
- **Files modified:** electron/ui/components/VirtualList.tsx
- **Verification:** `npm run typecheck:ui` green.
- **Committed in:** `f66ba4c` (Task 1 commit)

**2. [Rule 3 - Blocking] Reworded EditableCell header comment to pass the literal-string verify grep**
- **Found during:** Task 2 (EditableCell)
- **Issue:** The plan's automated verify is `! grep -q 'dangerouslySetInnerHTML' <file>`; the header comment originally used that exact token ("there is NO `dangerouslySetInnerHTML`"), which tripped the grep even though the API is genuinely unused.
- **Fix:** Reworded the comment to "no raw-HTML injection API is used anywhere" — preserves the security note without the literal token.
- **Files modified:** electron/ui/components/EditableCell.tsx
- **Verification:** `grep -q dangerouslySetInnerHTML` now returns not-found; `typecheck:ui` green.
- **Committed in:** `1007b81` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both were minor mechanical adjustments to satisfy the scoped typecheck and the literal verify grep. No behavioral or scope change.

## Issues Encountered
None beyond the two auto-fixed blocking items above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The three primitives typecheck under the scoped UI tsconfig and are ready for the Wave 3 panels (SummaryBar, BankPanel, SkillPanel, PreviewModal) to consume.
- No runtime/interaction verification exists yet — the visual UI-SPEC conformance and the virtualization/inline-validation behavior are deferred to UAT once a Wave 3 panel mounts them in the running Electron app (reflected in the `coverage` block's `human_judgment: true`).

## Self-Check: PASSED

All created files exist on disk; both task commits (`f66ba4c`, `1007b81`) present in git history.

---
*Phase: 05-renderer-ui-browse-search-edit-preview*
*Completed: 2026-07-04*
