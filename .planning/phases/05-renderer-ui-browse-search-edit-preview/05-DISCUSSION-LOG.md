# Phase 5: Renderer UI — Browse, Search, Edit, Preview - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-04
**Phase:** 5-renderer-ui-browse-search-edit-preview
**Areas discussed:** Build tooling, Edit/dirty-state model, Layout & currency edit, Preview/confirm mechanics

---

## Build tooling

| Option | Description | Selected |
|--------|-------------|----------|
| Extend esbuild (Recommended) | Add only react + react-dom + @tanstack/react-virtual; bundle via existing scripts/build.mjs; dev = esbuild --watch + electron reload (no HMR); CSP unchanged. Consistent with UI-SPEC "bundled by esbuild", CJS setup, strict CSP, prior least-privilege stance. | ✓ |
| electron-vite + Vite | electron-vite + Vite + React + HMR; best dev velocity but adds Vite/electron-vite/plugins, restructures the build, needs CSP dev-server handling, larger supply-chain surface. | |

**User's choice:** Extend esbuild
**Notes:** Resolves Phase 4 D-01's deferred scaffold decision. No Vite/electron-vite/HMR.

---

## Edit / dirty-state model

### 2a — Skill "Set by level" live XP feedback (EDIT-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse experience-table.ts (Recommended) | Bundle pure src/experience-table.ts into the renderer to compute level→XP instantly for inline display; main recomputes + validates authoritatively (SC-4). Display-only reuse, not a trust boundary. | ✓ |
| Round-trip via preview() | Renderer sends only the level edit and calls preview() to learn the resulting XP; zero duplication but async lag / deferred XP display. | |

**User's choice:** Reuse experience-table.ts

### 2b — Inline validation source

| Option | Description | Selected |
|--------|-------------|----------|
| Client mirror + main authority (Recommended) | Renderer runs lightweight range checks for instant inline errors; invalid fields contribute no edit; main's patcher stays the authoritative validator (collect-all Violation[]) at preview/write. | ✓ |
| Rely on preview() only | No client checks; violations surface only from main's preview()/write() responses; conflicts with UI-SPEC as-you-type error state. | |

**User's choice:** Client mirror + main authority
**Notes:** Single accumulator keyed by fieldKey, diffed vs loaded ViewModel, locked as the default shape (not separately asked).

---

## Layout & currency edit

### 3a — Browse list arrangement

| Option | Description | Selected |
|--------|-------------|----------|
| Side-by-side panels (Recommended) | Two virtualized panels at once (bank left ~689, skills right ~30), each with its own filter; matches UI-SPEC "two list panels" + lg gap; no mode switching. | ✓ |
| Tabbed | One panel with Bank/Skills tabs; more vertical room but a pending edit in the hidden tab is out of sight. | |

**User's choice:** Side-by-side panels

### 3b — Currency edit placement

| Option | Description | Selected |
|--------|-------------|----------|
| Click-to-edit in summary (Recommended) | GP/SC read-only in summary; clicking a value turns it into an inline int64 input; edited values get the accent bar + feed the pending accumulator; name/gamemode/total level stay read-only. | ✓ |
| Separate currency edit control | Summary fully read-only; GP/SC editing lives in a dedicated field group elsewhere. | |

**User's choice:** Click-to-edit in summary
**Notes:** int64 stays a string end-to-end; display never coerces to a JS number (UI-SPEC compliance flagged into CONTEXT).

---

## Preview / confirm mechanics

### 4a — Pending-changes source

| Option | Description | Selected |
|--------|-------------|----------|
| Local badge + preview() table (Recommended) | Local dirty accumulator drives the live pending-count badge + enables the Preview control; opening the preview calls preview(edits) and renders main's authoritative WireChangeRow[] old→new + violations (source of truth = main, SC-4). | ✓ |
| Fully local change list | Compute old→new entirely in the renderer; simpler but misses main-side violations until write(). | |

**User's choice:** Local badge + preview() table

### 4b — Confirm presentation

| Option | Description | Selected |
|--------|-------------|----------|
| Modal confirm dialog (Recommended) | "Preview Changes" opens a modal listing every old→new row with the "Write New Save File" CTA + confirmation copy; clicking it calls write() → native Save-As. Clean review-before-write gate (SAFE-02). | ✓ |
| Docked side/bottom panel | Persistent docked panel; less interruptive but a softer confirm gate before the native Save-As. | |

**User's choice:** Modal confirm dialog

---

## Claude's Discretion

- Exact React component tree / file split and state container (useReducer vs tiny store).
- Filter debounce timing and match semantics (substring vs prefix on the namespaced ID).
- Keyboard focus order and any shortcuts.
- How the non-blocking unknownVersion banner and unresolvedFields ambiguity are surfaced.
- Whether the client validation mirror is hand-rolled or reuses Zod (pick the lighter option).
- Row markup / zebra-striping within the UI-SPEC color + spacing tokens.

## Deferred Ideas

- electron-vite + Vite + React + HMR — considered and rejected (chose esbuild); revisit only if HMR/packaging becomes worth the deps.
- Friendly item/skill names (v2 NAME-01).
- Bulk edits (v2 BULK-01/02).
- Timestamped / auto-named output + backup-on-write (v2 OUT-01).
- Round-trip drift self-check warning on load (v2 OUT-02).
- Header / name / gamemode editing (v2 HEADER-01).
- electron-builder packaging / distributable binary.
