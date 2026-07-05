---
phase: 05-renderer-ui-browse-search-edit-preview
plan: 08
subsystem: ui
tags: [react, react-dom, esbuild, electron, usereducer, csp]

# Dependency graph
requires:
  - phase: 05-01..05-07
    provides: reducer/selectors, IPC bridge contract, SummaryBar/BankPanel/SkillPanel/PreviewModal/Banner components, esbuild renderer build target
  - phase: 04
    provides: hardened Electron main + four save:* IPC handlers (load/getModel/preview/write)
  - phase: 02-03
    provides: parseSave FieldTable/ViewModel + patchSave (the write path exercised in-game)
provides:
  - App orchestrator owning the single useReducer, wiring all five renderer components over the four-channel bridge
  - AppContext carrying dispatch (+ edits) to descendant rows
  - renderer.tsx createRoot mount importing ./ui/styles.css (emits dist/renderer.css); renderer.ts deleted
  - Green full build (dist/renderer.js + dist/renderer.css, no node builtins) + full test suite
  - Manual in-game acceptance PASS — an app-written .sav loads in Melvor Idle 2 with edited values persisting
affects: [milestone-close, v1.0, packaging, future header-editing milestone]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single useReducer(appReducer, initialState) in App; bridge results mapped to dispatches by discriminated result kind"
    - "Preview gated on dirtyCount > 0; write() fires ONLY from the modal confirm (SAFE-02 write gate)"
    - "AppContext provides dispatch + edits (RESEARCH Pattern 2, no external store); renderer touches only window.saveEditor.*"

key-files:
  created:
    - electron/ui/App.tsx
    - electron/ui/AppContext.ts
    - electron/renderer.tsx
  modified:
    - electron/ui/styles.css
  deleted:
    - electron/renderer.ts

key-decisions:
  - "App maps each bridge result to a dispatch (LOAD_OK immediately chains getModel; PREVIEW_OK carries rows+violations; WRITE_OK carries outputPath)"
  - "renderer.tsx imports './ui/styles.css' (not './styles.css') so esbuild resolves and emits dist/renderer.css; React 19 createRoot guarded on non-null #root"
  - "Added .preview-list/.preview-violations/.empty-state/.summary-item CSS so the SAFE-02 old->new preview renders readably over the virtualized absolute-positioned .list-row"

patterns-established:
  - "Pattern 1: bridge-result -> dispatch mapping table centralized in App async handlers; row handlers wrapped in useCallback"
  - "Pattern 2: mirror-coupled currency write — authoritative wallet int64 write expands to also write the header GP/SlayerCoins snapshot in lock-step (acceptance finding, fix 4573e70)"

requirements-completed: [BROWSE-01, BROWSE-02, BROWSE-03, BROWSE-04, BROWSE-05, EDIT-01, EDIT-02, EDIT-03, SAFE-02]

coverage:
  - id: D1
    description: "App orchestrator wires the full load->getModel->render->edit->preview->confirm->write loop over a single useReducer and the four-channel bridge"
    verification:
      - kind: unit
        ref: "npm run typecheck:ui (App wiring all five components; grep useReducer/editsToPayload/window.saveEditor)"
        status: pass
    human_judgment: false
  - id: D2
    description: "renderer.tsx mounts <App/> via createRoot and imports ./ui/styles.css; renderer.ts deleted; clean browser bundle emits dist/renderer.js + dist/renderer.css with no node builtins"
    verification:
      - kind: integration
        ref: "npm run build:electron && test -f dist/renderer.js && test -f dist/renderer.css && ! grep node:(fs|zlib) dist/renderer.js"
        status: pass
      - kind: unit
        ref: "npm run typecheck && npm run typecheck:ui && npm test (full suite green)"
        status: pass
    human_judgment: false
  - id: D3
    description: "An app-written .sav loads in Melvor Idle 2 with the edited GP/quantity/skill values present and persisting after an in-game re-save (ROADMAP §Phase 5 criterion 5)"
    verification:
      - kind: manual_procedural
        ref: "Human in-game acceptance — user response 'approved' (persisted after the header-mirror fix 4573e70)"
        status: pass
    human_judgment: true
    rationale: "The game itself must load the file; this cannot be automated — the one acceptance the phase exists to prove."

# Metrics
duration: 35min
completed: 2026-07-05
status: complete
---

# Phase 5 Plan 8: App Orchestrator + Mount + In-Game Acceptance Summary

**Wired the whole renderer into a single-useReducer App over the four-channel bridge, mounted it with React 19 createRoot, shipped a clean CSP browser bundle, and closed the phase with the mandatory manual in-game acceptance — an app-written .sav loads in Melvor Idle 2 with edits persisting.**

## Performance

- **Duration:** 35 min (includes the manual in-game acceptance round-trip and a core header-mirror fix)
- **Completed:** 2026-07-05
- **Tasks:** 2 automated + 1 manual acceptance checkpoint
- **Files modified:** 4 (3 created, 1 modified, 1 deleted)

## Accomplishments
- `App.tsx` owns the single `useReducer(appReducer, initialState)`, orchestrates `window.saveEditor.load/getModel/preview/write`, and maps each discriminated result to the matching dispatch. Preview is gated on `dirtyCount > 0`; the write fires only from the modal confirm (SAFE-02). Layout is Banner over SummaryBar over BankPanel | SkillPanel over the preview/write bar, with empty/loading/error states.
- `AppContext.ts` carries `dispatch` (+ `edits`) to descendant rows per RESEARCH Pattern 2 — no external store; the renderer references only `window.saveEditor.*` (no Node/fs/offset access).
- `renderer.tsx` mounts `<App/>` with React 19 `createRoot` guarded on a non-null `#root` and imports `./ui/styles.css` so esbuild emits `dist/renderer.css`; the throwaway `renderer.ts` smoke file is deleted.
- Full build green: `npm run build:electron` emits `dist/renderer.js` + `dist/renderer.css` with no node builtins in the browser bundle; `npm run typecheck`, `npm run typecheck:ui`, and `npm test` all pass.
- **Manual in-game acceptance PASSED** (ROADMAP §Phase 5 criterion 5): the app-written `.sav` loads in Melvor Idle 2, the edited GP/quantity/skill values are present, and they persist after an in-game re-save. User response: "approved".

## Task Commits

1. **Task 1: App orchestrator + AppContext (bridge → dispatch)** - `905c122` (feat)
2. **Task 2: renderer.tsx createRoot mount, delete renderer.ts, full build + missing CSS** - `8aaefea` (feat)
3. **Task 3: Manual in-game acceptance** - checkpoint (human-verify), no code commit — user "approved" after acceptance surfaced and confirmed the fix below

**Acceptance-driven core fix (cross-cutting, not a 05-08 task):** `4573e70` (fix)

**Plan metadata:** this docs commit.

## Files Created/Modified
- `electron/ui/App.tsx` - top-level useReducer orchestrator; bridge-result → dispatch mapping; layout + empty/loading/error states; Preview gate + modal confirm → write
- `electron/ui/AppContext.ts` - React context carrying dispatch (+ edits)
- `electron/renderer.tsx` - createRoot mount of `<App/>`, imports `./ui/styles.css`
- `electron/ui/styles.css` - added `.preview-list`, `.preview-violations`, `.empty-state`, `.summary-item` so the modal preview and layout render correctly over the virtualized absolute-positioned rows
- `electron/renderer.ts` - **deleted** (throwaway smoke test superseded by renderer.tsx)

## Decisions Made
- On `LOAD_OK`, App immediately chains `getModel()` and stores the viewModel, so the summary + both panels populate in one user action.
- `renderer.tsx` imports `./ui/styles.css` (relative to `electron/`) — using `./styles.css` would fail esbuild resolution and silently drop `dist/renderer.css`.
- Row-level handlers passed to the virtualized panels are wrapped in `useCallback` to keep the virtualizer rows stable across renders.

## Deviations from Plan

None in the 05-08 task scope — Tasks 1 and 2 executed as written and all automated gates were green (build clean, 264 tests passing).

### Acceptance Finding (cross-cutting core fix, tracked separately)

The mandatory manual acceptance did what it exists to do: it surfaced a real correctness bug in the Phase 2/3 core that no automated round-trip test caught, because the bug only manifests when the game itself loads the file.

**[Acceptance finding — Rule 1 class Bug, cross-cutting] Currency edits were invisible in-game**
- **Found during:** Task 3 (manual in-game acceptance)
- **Issue:** Currency edits (GP / Slayer Coins) were written only to the authoritative Bank Wallet int64. Melvor reads the **header** GP/SlayerCoins int64 **snapshot** on load, so the edited value was invisible in-game until the next in-game save. The prior "cosmetic — updates on next save" note described only the write-back direction, not the load-time read.
- **Fix:** `FieldTable.mirrorsOf(key)` locates a field's header mirror(s); `patchSave` §3.5 expands each authoritative-currency write to also write its mirror to the same value (same byte width, in-place — zero corruption risk, same coupling pattern as the existing skill level↔xp expansion). Direct edits to `header.*` keys remain rejected (`ReadOnlyFieldError`); only the internal coupling writes them. Corrected the disproven docs/comment claims in `docs/current-skill.md`.
- **Files modified:** `src/field-table.ts`, `src/patcher.ts`, `src/wallet-parser.ts`, `docs/current-skill.md`, `test/patcher.test.ts` (+3 regression tests: mirror coupled, non-currency untouched, direct header edit still rejected)
- **Verification:** +3 regression tests pass (suite now 264); user re-ran the in-game acceptance and confirmed "the last change fixed it" — the edit now appears in-game immediately and persists.
- **Committed in:** `4573e70` (committed by the orchestrator; documented here as a Phase 5 acceptance finding / Phase 2-3 dependency, NOT a 05-08 task)

---

**Total deviations:** 0 within 05-08 task scope; 1 cross-cutting core fix surfaced by manual acceptance (documented above).
**Impact on plan:** The plan's own artifacts shipped exactly as written. The acceptance gate proved its value by catching a load-time correctness bug that the automated round-trip suite structurally could not — resolved before sign-off.

## Issues Encountered
- The header GP/SlayerCoins snapshot was previously believed cosmetic; in-game acceptance disproved this. Resolved via the mirror-coupling fix `4573e70` (see acceptance finding above). This is the reason a manual acceptance gate is mandatory for the write path.

## User Setup Required
None - no external service configuration required. (Launching under WSL2 requires libnss3/libnspr4/libasound2t64 + the GTK stack per Plan 04-05, already documented.)

## Next Phase Readiness
- Phase 5 is complete — plan 8 of 8. The full renderer loop (load → browse/filter → edit → preview → confirm → write) runs end-to-end under strict CSP, and an app-written `.sav` is confirmed loadable in-game.
- All phase requirements delivered: BROWSE-01..05, EDIT-01..03, SAFE-02.
- v1.0 milestone editing scope is closed; header-field editing remains deferred to a future milestone by design (PROJECT.md).

## Self-Check: PASSED

- Files verified on disk: App.tsx, AppContext.ts, renderer.tsx, styles.css (renderer.ts confirmed deleted)
- Commits verified: 905c122 (Task 1), 8aaefea (Task 2), 4573e70 (acceptance-finding fix)

---
*Phase: 05-renderer-ui-browse-search-edit-preview*
*Completed: 2026-07-05*
