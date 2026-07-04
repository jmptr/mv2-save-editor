---
phase: 05-renderer-ui-browse-search-edit-preview
plan: 07
subsystem: ui
tags: [react, tsx, virtualization, preview, banner, skills, edit-modes]

# Dependency graph
requires:
  - phase: 05-02
    provides: React build target + type-only IPC result contract (SaveEditorApi, ErrorKind, WireChangeRow)
  - phase: 05-03
    provides: client validation mirror (validateLevel/validateXp) + format helpers (levelToXpDisplay)
  - phase: 05-04
    provides: pure reducer with SET_EDIT/CLEAR_EDIT + Pitfall 5 sibling-clear
  - phase: 05-05
    provides: VirtualList + EditableCell shared primitives
provides:
  - SkillPanel — virtualized, filterable skill list with per-skill Set-by-level XOR Set-XP editing + live level→XP echo
  - PreviewModal — SAFE-02 confirm gate rendering main's authoritative WireChangeRow[] old→new + violations
  - Banner — ErrorKind→UI-SPEC copy mapping (never raw kind) + non-blocking unknownVersion/unresolvedFields notices
affects: [05-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Panel-level per-row mode map survives virtualizer row remount (SkillPanel modes state)"
    - "Component maps discriminated ErrorKind to framed copy via exhaustive switch with never-default"

key-files:
  created:
    - electron/ui/components/SkillPanel.tsx
    - electron/ui/components/PreviewModal.tsx
    - electron/ui/components/Banner.tsx
  modified: []

key-decisions:
  - "SkillPanel per-skill mode held in a panel-level Record<id,mode> (not row-local) so it survives the virtualizer unmounting a row on scroll; default mode derives from a pending xp edit else 'level'."
  - "PreviewModal Write CTA is disabled when there are zero rows or any violation — the SAFE-02 gate refuses a write that main's preview flagged."
  - "Banner.errorCopy buckets the 8 ErrorKinds into two UI-SPEC strings (write-path → 'Write failed…'; all others → load/parse copy) via an exhaustive switch so a new kind is a compile error."

patterns-established:
  - "Live display-only echo (levelToXpDisplay) reads from the committed-valid accumulator entry, updating on each valid keystroke without becoming a trust boundary (D-03)."

requirements-completed: [BROWSE-03, BROWSE-05, EDIT-03, SAFE-02]

coverage:
  - id: D1
    description: "SkillPanel lists skills virtualized + as-you-type filter (BROWSE-03/05), per-skill Set-by-level XOR Set-XP with live level→XP echo (EDIT-03), sibling-clear on mode switch (Pitfall 5)"
    requirement: "EDIT-03"
    verification:
      - kind: unit
        ref: "npm run typecheck:ui"
        status: pass
      - kind: manual_procedural
        ref: "Load a save, filter skills, toggle Set by level/Set XP per skill, confirm echo updates and only one of level/xp is pending"
        status: unknown
    human_judgment: true
    rationale: "Interactive filter/toggle/echo behavior in the rendered renderer requires a human to exercise the live UI; typecheck proves wiring/copy but not runtime interaction."
  - id: D2
    description: "PreviewModal renders main's authoritative WireChangeRow[] old→new + violations and gates the write behind an explicit Write New Save File confirm (SAFE-02, D-07)"
    requirement: "SAFE-02"
    verification:
      - kind: unit
        ref: "npm run typecheck:ui"
        status: pass
      - kind: manual_procedural
        ref: "Make an edit, open Preview, confirm rows show old→new and Write New Save File triggers a write only on confirm"
        status: unknown
    human_judgment: true
    rationale: "The confirm-gate safety behavior (no write without confirm) is a runtime interaction the verifier must exercise end-to-end in the app."
  - id: D3
    description: "Banner maps every ErrorKind to framed UI-SPEC copy (never a raw kind) and shows the non-blocking unknownVersion warning + unresolvedFields notice"
    requirement: "BROWSE-05"
    verification:
      - kind: unit
        ref: "npm run typecheck:ui"
        status: pass
    human_judgment: false

# Metrics
duration: 5min
completed: 2026-07-04
status: complete
---

# Phase 05 Plan 07: Skill Panel, Preview Modal, and Banner Summary

**Skill edit surfaces (Set-by-level XOR Set-XP with live level→XP echo), the SAFE-02 preview/confirm modal rendering main's authoritative old→new rows, and a Banner that maps every ErrorKind to safe copy plus non-blocking version warnings.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-07-04T22:56:37Z
- **Completed:** 2026-07-04T23:01:20Z
- **Tasks:** 2
- **Files modified:** 3 (all created)

## Accomplishments
- `SkillPanel.tsx` — virtualized + as-you-type filtered skill list (BROWSE-03/05) with a per-skill `Set by level` / `Set XP` mode toggle; Set-by-level dispatches `skill.<id>.level` and shows a live `levelToXpDisplay` echo, Set-XP dispatches `skill.<id>.xp`, and switching modes CLEAR_EDITs the sibling so level and xp are never both pending (EDIT-03, Pitfall 5).
- `PreviewModal.tsx` — the SAFE-02 review gate rendering main's authoritative `WireChangeRow[]` old→new rows (int64 as strings, never through Number) plus any violations; the `Write New Save File` CTA calls `onConfirm` and is disabled with no rows or any violation (D-07/D-08).
- `Banner.tsx` — `errorCopy` maps all 8 `ErrorKind`s to framed UI-SPEC copy via an exhaustive `never`-guarded switch (raw kind never surfaced), plus the non-blocking `unknownVersion` warning, an `unresolvedFields` ambiguity notice, and a neutral ✓ write-success line (no green token).

## Task Commits

Each task was committed atomically:

1. **Task 1: SkillPanel — filter/list + Set-by-level XOR Set-XP with live echo** - `cadaf66` (feat)
2. **Task 2: PreviewModal (SAFE-02) + Banner (kind→copy + warnings)** - `c29133c` (feat)

## Files Created/Modified
- `electron/ui/components/SkillPanel.tsx` - Skill browse/filter panel with mutually-exclusive level/xp edit modes + live XP echo.
- `electron/ui/components/PreviewModal.tsx` - Pending-changes preview + write-confirm gate over main's authoritative change report.
- `electron/ui/components/Banner.tsx` - ErrorKind→copy mapping + non-blocking unknownVersion/unresolvedFields notices + neutral write-success line.

## Decisions Made
- SkillPanel per-skill mode lives in a panel-level `Record<id, mode>` (not row-local `useState`) so it survives the virtualizer unmounting/remounting a row on scroll; default mode derives from a pending xp edit, else `level`.
- PreviewModal `Write New Save File` is disabled when there are zero change rows or any violation — the SAFE-02 gate never lets a write proceed on a report main flagged.
- Banner buckets the 8 ErrorKinds into the two UI-SPEC strings via an exhaustive switch with a `never` default, so a newly-added kind in main is a compile error rather than a leaked raw kind.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All three components typecheck under `electron/ui/tsconfig.json` and expose clean props for the container to wire.
- 05-08 (the App container / orchestrator) can now mount SummaryBar + BankPanel + SkillPanel + PreviewModal + Banner and wire the load/preview/write bridge calls. New CSS classes referenced here (`.preview-list`, `.preview-violations`, `.empty-state`) are cosmetic and owned by the styles/App plan — components render (unstyled) without them.

## Self-Check: PASSED

---
*Phase: 05-renderer-ui-browse-search-edit-preview*
*Completed: 2026-07-04*
