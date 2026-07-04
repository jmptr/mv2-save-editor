# Phase 5: Renderer UI — Browse, Search, Edit, Preview - Context

**Gathered:** 2026-07-04
**Status:** Ready for planning

<domain>
## Phase Boundary

The user-facing renderer loop that turns the frozen Phase 4 IPC bridge into a real UI:
**load a `.sav` → read a summary → browse & filter bank items and skills → edit values with
inline validation (XP-table-aware level input) → preview old→new → explicitly confirm →
non-destructive new-file write.**

**In scope:** the React renderer that replaces the throwaway `electron/renderer.ts` smoke-test —
a read-only summary bar (BROWSE-01), two virtualized filterable browse lists (BROWSE-02..05),
inline validated edits for GP/Slayer Coins, item quantity, and skill XP/Level (EDIT-01..03,
building on the Phase 3 XP-table coupling EDIT-04), a pending-changes preview with explicit confirm
(SAFE-02), and the write hand-off to the existing `write()` bridge. Plus the build-tooling change
needed to compile React (adding React to the existing esbuild pipeline).

**Out of scope (deferred):** friendly item/skill names (v2 NAME-01 — renderer keeps raw namespaced
IDs), bulk edits (v2 BULK-01/02), timestamped/auto-named output & backup-on-write (v2 OUT-01),
round-trip drift self-check warnings (v2 OUT-02), header/name/gamemode editing (v2 HEADER-01 —
those summary fields stay read-only), packaging/distribution (electron-builder), and any new IPC
surface (the four Phase 4 channels are consumed as-is).

**Locked upstream contracts (NOT re-opened this phase):**
- **`05-UI-SPEC.md` (approved)** — the full visual + interaction design contract: plain-CSS +
  token design system (no framework), spacing/typography/color scales, every copywriting string,
  virtualization (`@tanstack/react-virtual`, fixed 32px rows), and all nine interaction states.
  Visual gray areas are settled there; this CONTEXT only decides renderer *architecture*.
- **Phase 4 IPC contract** — `load` / `getModel` / `preview` / `write`; int64 as decimal strings;
  offsets never cross the bridge; discriminated `{ ok, kind, message, violations? }` results;
  main re-resolves + re-validates every edit against its own FieldTable (SC-4). The UI is a pure
  projection of this bridge and adds no channel.

</domain>

<decisions>
## Implementation Decisions

### Build tooling
- **D-01:** **Extend the existing esbuild pipeline — do NOT adopt electron-vite/Vite/HMR.**
  Add only `react`, `react-dom`, and `@tanstack/react-virtual` as deps and bundle the React
  renderer through `scripts/build.mjs` (a `platform:browser` JSX entry replacing
  `electron/renderer.ts`). Dev loop = esbuild `--watch` + electron reload (no true HMR). The app
  stays CommonJS and the strict CSP (`default-src 'self'; script-src 'self'`) is unchanged — no
  dev-server allowance needed. Rationale: this resolves Phase 4 D-01's deferred scaffold question
  in favor of the lean path; it matches the UI-SPEC's own "bundled by esbuild" wording, every prior
  phase's least-privilege / zero-added-heavy-deps stance, and the strict CSP that would otherwise
  fight a Vite dev server. HMR is a nice-to-have, not worth the Vite + electron-vite + plugin
  supply-chain surface for a solo tool.

### Edit / dirty-state model
- **D-02:** **Single edit accumulator keyed by `fieldKey`.** Each entry is diffed against the
  loaded `ViewModel` value; an entry equal to its loaded value is not dirty and contributes no edit.
  The accumulator produces the `{ fieldKey, newValue }[]` payload for `preview()` / `write()`.
  Wire types per the frozen contract: int64 (`wallet.GoldPieces`, `wallet.SlayerCoins`) crosses as
  a **decimal string**; int32 quantity / double XP / int32 level cross as **numbers**.
- **D-03:** **Skill "Set by level" (EDIT-04) reuses the pure `src/experience-table.ts` in the
  renderer for live level→XP display.** The edit actually sent is the level (`skill.<id>.level`);
  main recomputes XP from the same StandardExperienceTable, writes XP + Level consistently, and
  re-validates (SC-4). The renderer's use of the table is **display-only** (instant feedback as the
  user types a target level), never a trust boundary. The table is pure TS (no Node/fs) and already
  golden-tested, so bundling it into the browser build is safe. "Set XP" mode sends the raw XP.
- **D-04:** **Inline validation is a client-side range *mirror* for instant as-you-type errors;
  main's patcher stays the authority.** The renderer checks int32 `0..2,147,483,647`, int64 range,
  Level `1..levelCap`, finite non-negative XP, and whole-number inputs, surfacing the UI-SPEC's
  inline-error state immediately. Invalid fields show the error and **contribute no edit** to the
  accumulator. Main's patcher remains the authoritative validator (collect-all `Violation[]`) at
  preview/write — the client mirror is UX-only, never the source of truth.

### Layout & currency edit
- **D-05:** **Two side-by-side virtualized list panels** — bank items (left, ~689 stacks) and
  skills (right, ~30), each with its own as-you-type filter box (filter by ID). Both use
  `@tanstack/react-virtual` with the UI-SPEC's fixed 32px row height. No tabs — both lists visible
  at once so edits across items and skills are never hidden behind a mode switch.
- **D-06:** **GP / Slayer Coins are click-to-edit inline in the summary bar.** They render read-only
  (BROWSE-01, the focal anchor) but a click turns the value into an inline int64 input; edited
  currencies get the accent left-bar and feed the same pending-changes accumulator (D-02).
  Name / gamemode / total level stay strictly read-only (header editing is out of scope per
  PROJECT.md). **int64 stays a string end-to-end** — display never coerces GP/SC to a JS number;
  any thousands-grouping must be string-based and reversible, otherwise show the raw decimal string.

### Preview / confirm mechanics
- **D-07:** **Local accumulator drives the badge; `preview()` backs the table.** The local dirty
  accumulator drives the live pending-count badge and enables/disables the "Preview Changes"
  control (disabled at zero pending changes → the UI-SPEC "No pending changes." state). Opening the
  preview calls IPC `preview(edits)` and renders main's authoritative `WireChangeRow[]` (old→new)
  plus any collect-all validation violations — source of truth is main (SC-4), not a locally
  computed diff.
- **D-08:** **Confirm is a modal dialog.** "Preview Changes" opens a modal listing every old→new
  row with the "Write New Save File" CTA and the UI-SPEC confirmation copy
  (`Write {n} pending change(s)?`). Clicking the CTA calls `write(edits)`, which triggers Phase 4's
  native Save-As dialog (04-CONTEXT D-03) for path selection. The modal is the explicit in-app
  review gate SAFE-02 requires (the native OS dialog alone doesn't show the changes).

### Claude's Discretion
Left to research/planning, all within the UI-SPEC's locked visual contract:
- Exact React component tree / file split and state container (`useReducer` vs a tiny store — no
  heavy state lib per CLAUDE.md).
- Filter debounce timing and match semantics (substring vs prefix on the namespaced ID).
- Keyboard focus order and any shortcuts (desktop keyboard-first, but specific bindings open).
- How the non-blocking `unknownVersion` warning banner and the `unresolvedFields` ambiguity are
  surfaced (both non-blocking per the UI-SPEC interaction contract).
- Whether the D-04 client validation mirror is hand-rolled or reuses **Zod** (CLAUDE.md lists it as
  available) — pick the lighter option for a solo tool.
- Row markup / zebra-striping details within the UI-SPEC color + spacing tokens.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Locked design + IPC contracts (read first)
- `.planning/phases/05-renderer-ui-browse-search-edit-preview/05-UI-SPEC.md` — **the approved
  visual + interaction design contract.** Design system (plain CSS + tokens, no framework),
  spacing/typography/color scales, every copywriting string, virtualization + 32px rows, and the
  "Data & Interaction Contract" (bridge methods, ViewModel/WireChangeRow shapes, edit payload,
  error `kind`s, nine interaction states). MUST follow — do not re-derive UI choices.
- `.planning/phases/04-electron-shell-secure-ipc-non-destructive-write/04-CONTEXT.md` — the frozen
  IPC contract this UI consumes: single active session (D-02), native Save-As with
  `<basename>-edited.sav` default + source-path guard (D-03), discriminated results + int64-as-string
  + offset stripping + collect-all violations (D-04).

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — **BROWSE-01..05, EDIT-01..03, SAFE-02** (this phase's pending
  requirements); **EDIT-04 / SAFE-01** already complete in Phase 3 (surfaced here).
- `.planning/ROADMAP.md` §"Phase 5" — the five success criteria (summary; virtualized filterable
  lists; wallet-not-header currency edits with inline validation; preview old→new + explicit
  confirm; new-file write that loads in-game — mandatory manual in-game acceptance).

### Core + shell the renderer consumes
- `src/view-model.ts` — `ViewModel` / `Summary` / `BankItem` / `Skill` / `UnresolvedField`
  (offset-free, int64 as strings) — the exact shapes the UI renders.
- `src/experience-table.ts` — the pure StandardExperienceTable reused in the renderer for live
  level→XP display (D-03). Pure TS, no Node deps.
- `electron/preload.ts` — the `SaveEditorApi` (`window.saveEditor.load/getModel/preview/write`) the
  renderer calls; results are `unknown` here (Phase 5 imports discriminated result types from core).
- `electron/renderer.ts` — the throwaway smoke-test renderer this phase **replaces** with the real
  React UI.
- `electron/index.html` — the strict-CSP host page (`script-src 'self'`); loads the bundled
  `renderer.js` beside it. Keep CSP unchanged (D-01).
- `scripts/build.mjs` — the esbuild build (main + preload + renderer + index.html → `dist/`); D-01
  extends this to bundle React for the renderer entry.

### Background
- `docs/current-skill.md` — authoritative save-format spec (background only; the renderer never
  parses bytes — main owns all parsing).
- `.claude/CLAUDE.md` — stack + "What NOT to Use" (no heavy state libs; do binary/fs/Brotli in main;
  Zod available for validation).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`ViewModel` is render-ready** — offset-free by construction, int64 currencies already strings,
  free `isPlaceholder`/`isLocked` metadata per stack, `entityIds`, and `unresolvedFields` for
  ambiguity display. The UI renders it near-verbatim from `getModel()`.
- **`src/experience-table.ts`** — pure, golden-tested level↔XP; bundle into the renderer for live
  level→XP feedback (D-03) without a Node dependency.
- **`scripts/build.mjs`** — already emits a `platform:browser` renderer bundle + copies the CSP page;
  extending it for React (JSX) is a small, known change (D-01).
- **`SaveEditorApi` (preload)** — the four-method narrow bridge is wired and hardened; the UI just
  imports the discriminated result types and calls the methods.

### Established Patterns
- **Fail-loud, non-destructive, main-authoritative** (Phases 1–4): the renderer must treat main as
  the source of truth — client validation (D-04) and client XP compute (D-03) are UX conveniences;
  preview/write results (violations, change report) are authoritative.
- **Offset-free / int64-as-string boundary** — never coerce GP/SC to a JS number anywhere in the UI
  (D-06); send int64 edits as decimal strings (D-02).
- **Least-privilege / zero-added-heavy-deps** — the whole project's stance; D-01 honors it (esbuild,
  three React-family deps only, no Vite/electron-vite).

### Integration Points
- **Replaces** `electron/renderer.ts` (throwaway) with the real React app; **reuses** `preload.ts`
  (`window.saveEditor.*`) and `index.html` (CSP) unchanged; **extends** `scripts/build.mjs`.
- Data flow: `load()` → `getModel()` → render `ViewModel` → local edit accumulator (D-02) →
  `preview(edits)` for the confirm modal (D-07/D-08) → `write(edits)` → native Save-As.

</code_context>

<specifics>
## Specific Ideas

- Summary bar with click-to-edit GP/SC (a ✎ affordance turning the value into an inline input);
  name/gamemode/total level read-only (D-06).
- Side-by-side layout: `[ summary bar (full width) ]` over `[ bank filter+list | skills filter+list ]`
  over a `[ preview / write ]` bar (D-05).
- Modal confirm listing old→new rows with the UI-SPEC copy `Write {n} pending change(s)?` and the
  `Write New Save File` CTA that opens the native Save-As (D-08).
- Live level→XP echo in "Set by level" mode, e.g. typing `Level 99` shows `XP 13,034,431` before
  write (D-03).

</specifics>

<deferred>
## Deferred Ideas

- **electron-vite + Vite + React + HMR** — considered for build tooling and **rejected** in favor of
  extending esbuild (D-01). Revisit only if dev velocity or eventual distribution makes HMR/packaging
  worth the added deps; not a later-phase commitment.
- **Friendly item/skill names** (v2 NAME-01) — renderer keeps raw namespaced IDs; the `ViewModel`
  member types already leave room for an optional `name?`.
- **Bulk edits** (v2 BULK-01 set-all-filtered, BULK-02 max-all-skills).
- **Timestamped / auto-named output + backup-on-write** (v2 OUT-01).
- **Round-trip drift self-check warning on load** (v2 OUT-02).
- **Header / name / gamemode editing** (v2 HEADER-01) — summary header fields stay read-only.
- **electron-builder packaging / distributable binary** — deferred; dev launch (`npm start`) covers
  the solo workflow.

None of the above are in Phase 5 scope — discussion stayed within the phase boundary.

</deferred>

---

*Phase: 5-Renderer UI — Browse, Search, Edit, Preview*
*Context gathered: 2026-07-04*
