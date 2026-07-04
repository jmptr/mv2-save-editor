# Phase 5: Renderer UI — Browse, Search, Edit, Preview - Research

**Researched:** 2026-07-04
**Domain:** React 19 renderer for a hardened Electron app under strict CSP (esbuild-bundled, no Vite/HMR), consuming a frozen Phase 4 IPC bridge
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Extend the existing esbuild pipeline — do NOT adopt electron-vite/Vite/HMR. Add only `react`, `react-dom`, `@tanstack/react-virtual`. Bundle the React renderer through `scripts/build.mjs` (a `platform:browser` JSX entry replacing `electron/renderer.ts`). Dev loop = esbuild `--watch` + electron reload (no true HMR). App stays CommonJS; strict CSP (`default-src 'self'; script-src 'self'`) unchanged — no dev-server allowance.
- **D-02:** Single edit accumulator keyed by `fieldKey`. Each entry diffed against the loaded `ViewModel` value; an entry equal to its loaded value is not dirty and contributes no edit. Produces the `{ fieldKey, newValue }[]` payload for `preview()`/`write()`. int64 (`wallet.GoldPieces`, `wallet.SlayerCoins`) crosses as a **decimal string**; int32 quantity / double XP / int32 level cross as **numbers**.
- **D-03:** Skill "Set by level" (EDIT-04) reuses the pure `src/experience-table.ts` in the renderer for live level→XP display. The edit sent is the level (`skill.<id>.level`); main recomputes XP and re-validates. Renderer's table use is **display-only**, never a trust boundary. "Set XP" mode sends the raw XP.
- **D-04:** Inline validation is a client-side range *mirror* for instant as-you-type errors; main's patcher stays the authority. Renderer checks int32 `0..2,147,483,647`, int64 range, Level `1..levelCap`, finite non-negative XP, whole-number inputs. Invalid fields show the error and **contribute no edit**. Main's collect-all `Violation[]` at preview/write is authoritative.
- **D-05:** Two side-by-side virtualized list panels — bank items (left, ~689 stacks) and skills (right, ~30), each with its own as-you-type filter box (filter by ID). Both use `@tanstack/react-virtual` with the UI-SPEC fixed 32px row height. No tabs.
- **D-06:** GP / Slayer Coins are click-to-edit inline in the summary bar. Render read-only (BROWSE-01), click turns the value into an inline int64 input; edited currencies get the accent left-bar and feed the same accumulator (D-02). Name / gamemode / total level stay read-only. **int64 stays a string end-to-end** — display never coerces to a JS number.
- **D-07:** Local accumulator drives the badge; `preview()` backs the table. The local dirty accumulator drives the live pending-count badge and enables/disables "Preview Changes" (disabled at zero pending changes). Opening the preview calls IPC `preview(edits)` and renders main's authoritative `WireChangeRow[]` + violations.
- **D-08:** Confirm is a modal dialog. "Preview Changes" opens a modal listing every old→new row with the "Write New Save File" CTA and confirmation copy (`Write {n} pending change(s)?`). Clicking calls `write(edits)` → Phase 4's native Save-As.

### Claude's Discretion
- Exact React component tree / file split and state container (`useReducer` vs a tiny store — no heavy state lib per CLAUDE.md).
- Filter debounce timing and match semantics (substring vs prefix on the namespaced ID).
- Keyboard focus order and any shortcuts (desktop keyboard-first; specific bindings open).
- How the non-blocking `unknownVersion` warning banner and `unresolvedFields` ambiguity are surfaced (both non-blocking).
- Whether the D-04 client validation mirror is hand-rolled or reuses **Zod** (available) — pick the lighter option for a solo tool.
- Row markup / zebra-striping details within the UI-SPEC color + spacing tokens.

### Deferred Ideas (OUT OF SCOPE)
- electron-vite + Vite + React + HMR (rejected in favor of esbuild, D-01).
- Friendly item/skill names (v2 NAME-01) — renderer keeps raw namespaced IDs.
- Bulk edits (v2 BULK-01/02).
- Timestamped / auto-named output + backup-on-write (v2 OUT-01).
- Round-trip drift self-check warning on load (v2 OUT-02).
- Header / name / gamemode editing (v2 HEADER-01) — summary header fields stay read-only.
- electron-builder packaging / distributable binary.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BROWSE-01 | Read-only summary (name, gamemode, GP, Slayer Coins, total level) | SummaryBar renders `viewModel.summary` verbatim; GP/SC as mono int64 strings (D-06). |
| BROWSE-02 | Browse all bank items with quantities | `@tanstack/react-virtual` list over `viewModel.bankItems` (fixed 32px rows). |
| BROWSE-03 | Browse all skills with XP + level | Second virtualized list over `viewModel.skills`. |
| BROWSE-04 | Filter bank items as-you-type (by ID) | Pure case-insensitive `String.includes` predicate; no debounce needed at 689 rows. |
| BROWSE-05 | Filter skills as-you-type | Same predicate on `skill.id`. |
| EDIT-01 | Edit GP + Slayer Coins (int64) | Click-to-edit int64 string input in summary (D-06); accumulator sends decimal string. |
| EDIT-02 | Edit bank item quantity (int32) | Inline `EditableCell` in the bank list; client mirror `0..2,147,483,647`. |
| EDIT-03 | Edit skill XP (double) + Level (int32) consistently | Set-by-level (sends level) or Set-XP (sends xp); main writes the coupled pair. Per-skill mutual exclusion enforced (see Pitfall 5). |
| SAFE-02 | Pending-changes preview (field, old→new) + explicit confirm | `preview(edits)` → `WireChangeRow[]` in the confirm modal (D-07/D-08). |
</phase_requirements>

## Summary

This phase replaces the throwaway `electron/renderer.ts` smoke test with the real React 19 UI, bundled by the **existing esbuild pipeline** (no Vite). The stack is fully settled by CLAUDE.md and this phase's locked decisions: `react` + `react-dom` + `@tanstack/react-virtual`, plain-CSS tokens (per the approved UI-SPEC), and a `useReducer`-based state container. Every hard problem in this phase is a *known* problem with a *known* answer — the corruption-critical logic already lives in main (Phases 1–4, golden-tested), so the renderer is a pure projection of the frozen IPC bridge plus a UX-only client validation mirror.

The three genuinely load-bearing technical details are: (1) the **esbuild config deltas** needed to bundle React 19 under strict CSP — `jsx: 'automatic'`, `format: 'iife'`, and a mandatory `define` of `process.env.NODE_ENV` (without it react-dom crashes in the browser on `process is not defined`); (2) keeping the **renderer entry named `renderer`** so its output stays `dist/renderer.js` and does not collide with the main-process `dist/main.js`; and (3) importing the Phase 4 wire types into the browser build via **`import type` only** (erased by esbuild) so no Node-side core code is pulled into the renderer bundle — except `src/experience-table.ts`, which is a deliberate pure value-import (D-03).

**Primary recommendation:** Rename the renderer entry to `electron/renderer.tsx`, add `jsx: 'automatic'` / `format: 'iife'` / `define: {'process.env.NODE_ENV': ...}` to the browser build in `scripts/build.mjs`, drive all state from one top-level `useReducer` with a `fieldKey`-keyed accumulator, hand-roll the ~30-line client validation mirror (Zod cannot represent int64 without a custom string refine — it adds no leverage here), and surface all four bridge result types through a new **type-only** `src/ipc/results.ts` shared by preload and renderer.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Parse / decompress / patch / write bytes | Electron main | — | Frozen Phase 4 boundary; renderer never touches fs/Brotli/offsets. |
| Authoritative range/type/readonly validation | Electron main (patcher) | — | SC-4; collect-all `Violation[]` is the source of truth. |
| Rendering the ViewModel (summary, lists) | Renderer (React) | — | Pure projection of `getModel()`. |
| Client validation mirror (instant UX errors) | Renderer | Electron main (authority) | D-04 — UX convenience only; never a trust boundary. |
| Level→XP live display (set-by-level) | Renderer (bundled `experience-table.ts`) | Electron main (recomputes + writes) | D-03 — display-only; main owns the on-disk coupling. |
| Edit accumulation + preview/confirm | Renderer | Electron main (`preview`/`write`) | D-02/D-07/D-08 — local badge, main-backed table. |
| List virtualization | Renderer (`@tanstack/react-virtual`) | — | 689 rows; headless, fixed 32px. |
| Output path selection + Save-As dialog | Electron main | — | Phase 4 D-03 native dialog; renderer only triggers `write()`. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react | `19.2.7` | Renderer UI framework | CLAUDE.md-blessed; largest ecosystem for virtualized lists + controlled inputs. `[VERIFIED: npm registry]` |
| react-dom | `19.2.7` | DOM renderer (`react-dom/client` `createRoot`) | Pairs with React 19; `createRoot` is the modern mount API. `[VERIFIED: npm registry]` |
| @tanstack/react-virtual | `3.14.5` | Headless list/row virtualization | CLAUDE.md-blessed; headless (you own markup), fixed-size mode needs no measurement. `[VERIFIED: npm registry]` |

### Supporting (dev / types)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/react | `19.2.17` | React types for `tsc --noEmit` | Required for typed `.tsx`. `[VERIFIED: npm registry]` |
| @types/react-dom | `19.2.3` | react-dom types | Required for `react-dom/client`. `[VERIFIED: npm registry]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| useReducer + Context | Zustand / Jotai / Redux | Forbidden by CLAUDE.md ("no heavy state libs"); overkill for one window. |
| Hand-rolled validation | Zod | Zod's `number` can't hold int64 (precision loss) — you'd write a custom string `.refine()` anyway; adds a dep for ~5 trivial checks. Reject. |
| @tanstack/react-virtual | react-window / react-virtuoso | CLAUDE.md already picked TanStack; no reason to deviate. |
| Plain CSS tokens | Tailwind / shadcn / CSS-in-JS | UI-SPEC locked `Tool: none`; strict CSP blocks runtime `<style>` injection. |

**Installation:**
```bash
npm install react@19.2.7 react-dom@19.2.7 @tanstack/react-virtual@3.14.5
npm install -D @types/react@19.2.17 @types/react-dom@19.2.3
```

**Version verification (run 2026-07-04):** All five confirmed present on the npm registry at the versions above (`npm view <pkg> version`). React/react-dom published 2026-06-01; react-virtual 3.14.5 published 2026-06-30; @types/react published 2026-06-05.

## Package Legitimacy Audit

| Package | Registry | Age (latest publish) | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|----------------------|-----------|-------------|---------|-------------|
| react | npm | 2026-06-01 | ~145M/wk | github.com/facebook/react | OK | Approved |
| react-dom | npm | 2026-06-01 | ~137M/wk | github.com/facebook/react | OK | Approved |
| @tanstack/react-virtual | npm | 2026-06-30 | ~16.7M/wk | github.com/TanStack/virtual | SUS (`too-new`) | Approved — false positive |
| @types/react | npm | 2026-06-05 | ~128M/wk | github.com/DefinitelyTyped/DefinitelyTyped | SUS (`too-new`) | Approved — false positive |
| @types/react-dom | npm | 2025-11-12 | ~103M/wk | github.com/DefinitelyTyped/DefinitelyTyped | OK | Approved |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** `@tanstack/react-virtual`, `@types/react` — both flagged solely on the `too-new` signal, which fired because their *latest minor* was published within the seam's freshness window. Both are canonical, high-trust packages (16.7M / 128M weekly downloads, official TanStack / DefinitelyTyped repos, no postinstall scripts, CLAUDE.md-blessed). The `too-new` flag here is a recency false-positive on a routine version bump of a long-established package, **not** a slopsquat signal. No `checkpoint:human-verify` is warranted; installs may proceed at the pinned versions. `npm view <pkg> scripts.postinstall` returned empty for all three runtime packages.

## Architecture Patterns

### System Architecture Diagram

```
                         Electron main (trusted — Phases 1–4, unchanged)
                         fs · Brotli · FieldTable(offsets) · patcher · SessionStore
                                        ▲   (save:load / getModel / preview / write)
                                        │   discriminated results · int64 as strings · no offsets
                          preload.ts (contextBridge → window.saveEditor)
                                        ▲
════════════════════════════════════════│═══ CSP boundary (default-src 'self'; script-src 'self') ═══
                                        │
   ┌───────────────────────── Renderer (React 19, dist/renderer.js) ─────────────────────────┐
   │                                                                                          │
   │   main.tsx ──createRoot(#root)──► <App/>                                                 │
   │                                     │  useReducer(appReducer, init)                      │
   │                                     ▼                                                    │
   │   load()/getModel() ──► [ ViewModel in state ]                                           │
   │        │                         │                                                       │
   │        ▼                         ├──► <SummaryBar>  (BROWSE-01, D-06 click-to-edit GP/SC)│
   │   loading/error banners          ├──► <BankPanel>   filter► includes ► useVirtualizer ►  │
   │                                  │       rows ► <EditableCell> ► validate() ► dispatch    │
   │                                  ├──► <SkillPanel>  filter/virtualize + Set-by-level/XP   │
   │                                  │       (live level→XP via bundled experience-table)     │
   │                                  ▼                                                        │
   │              edit accumulator  { [fieldKey]: EditEntry }  (D-02)                          │
   │                                  │  dirty count ► badge; enables "Preview Changes"        │
   │                                  ▼                                                        │
   │   "Preview Changes" ─preview(edits)─► <PreviewModal> WireChangeRow[] + Violation[] (D-07) │
   │                                  │                                                        │
   │   "Write New Save File" ─write(edits)─► (main opens native Save-As) ─► success/error copy │
   └──────────────────────────────────────────────────────────────────────────────────────────┘
```

Trace the primary use case: user clicks Open → `load()` → `getModel()` populates the ViewModel in reducer state → user filters/edits → each valid edit is diffed against the loaded value and stored in the accumulator → the dirty count enables Preview → `preview()` returns main's authoritative old→new rows in the modal → confirm calls `write()` → main's native Save-As writes a new file.

### Recommended Project Structure

Entry filename is load-bearing (see Pitfall 1) — the React entry **must** stay named `renderer` so esbuild emits `dist/renderer.js` (referenced by `index.html`) and does not collide with `dist/main.js`.

```
electron/
├── renderer.tsx          # ENTRY (replaces renderer.ts) — createRoot(#root).render(<App/>); imports styles.css
├── main.ts               # unchanged
├── preload.ts            # unchanged runtime; type import updated to results.ts (import type)
├── index.html            # add <link rel="stylesheet" href="renderer.css"> + <div id="root">
└── ui/
    ├── App.tsx           # useReducer; orchestrates bridge calls; top-level layout
    ├── state/
    │   ├── reducer.ts    # PURE appReducer + AppState + Action union + initialState  ← UNIT TESTED
    │   └── selectors.ts  # PURE: dirtyCount, editsToPayload(state) → {fieldKey,newValue}[]  ← UNIT TESTED
    ├── lib/
    │   ├── validation.ts # PURE client mirror (int32/int64-string/level/xp/whole-number) ← UNIT TESTED
    │   ├── filter.ts     # PURE case-insensitive substring predicate ← UNIT TESTED
    │   └── format.ts     # PURE int64 string grouping (reversible) + level→XP display (reuses experience-table)
    ├── components/
    │   ├── SummaryBar.tsx     # BROWSE-01 + D-06
    │   ├── VirtualList.tsx    # shared @tanstack/react-virtual wrapper (fixed 32px)
    │   ├── BankPanel.tsx      # BROWSE-02/04, EDIT-02
    │   ├── SkillPanel.tsx     # BROWSE-03/05, EDIT-03, D-03
    │   ├── EditableCell.tsx   # inline input + client validation + error state
    │   ├── PreviewModal.tsx   # D-07/D-08
    │   └── Banner.tsx         # unknownVersion warning + load/write error banners
    └── styles.css        # tokens (:root) + all styling (bundled → dist/renderer.css)
src/ipc/
└── results.ts            # NEW — TYPE-ONLY discriminated result unions + SaveEditorApi + Window aug
```

### Pattern 1: esbuild React bundle under strict CSP
**What:** Extend the `platform:browser` build in `scripts/build.mjs` with the three React deltas.
**When to use:** The renderer build only. Leave the main/preload node build untouched.
```js
// scripts/build.mjs — renderer build (replaces the current renderer.ts block)
// [ASSUMED] esbuild config — verify `jsx: 'automatic'` against esbuild 0.28 docs at plan time.
const isDev = process.env.NODE_ENV === 'development';
await build({
  ...common,
  platform: 'browser',
  format: 'iife',                         // NOT cjs — a <script> tag has no CommonJS host (Pitfall 2)
  entryPoints: ['electron/renderer.tsx'], // stays "renderer" → dist/renderer.js (Pitfall 1)
  jsx: 'automatic',                       // React 19 automatic runtime — no `import React` per file
  // jsxDev: isDev,                        // optional: better runtime error frames in dev
  define: {                               // MANDATORY — react-dom reads process.env.NODE_ENV;
    'process.env.NODE_ENV': JSON.stringify(isDev ? 'development' : 'production'),
  },                                       // without this: "process is not defined" crash in browser
  minify: !isDev,
});
```
- CSS is emitted automatically: `import './styles.css'` from `renderer.tsx` makes esbuild write `dist/renderer.css`. Add `<link rel="stylesheet" href="renderer.css">` to `index.html` (same-origin → allowed by `default-src 'self'`). `[CITED: esbuild.github.io/content-types/#css]`
- **CSP safety:** neither esbuild output nor React's prod/dev build uses `eval`/`new Function`, so `script-src 'self'` is satisfied with no change. React inline `style={{}}` props set the CSSOM directly (not the `style` HTML attribute) and are **not** governed by `style-src`, so dynamic per-row `transform`/`height` from the virtualizer work under the strict CSP. Static styling still goes through the external stylesheet per the UI-SPEC. `[ASSUMED]` (CSP CSSOM behavior — well established but not re-verified this session)

### Pattern 2: One top-level `useReducer` + fieldKey-keyed accumulator (D-02)
**What:** All app state in a single reducer at `App`; the accumulator is `Record<fieldKey, EditEntry>`.
**When to use:** The whole app. No external store (CLAUDE.md).
```tsx
// electron/ui/state/reducer.ts — PURE, unit-testable under tsx --test (no React/DOM import)
export interface EditEntry { raw: string; value: string | number; valid: boolean; } // raw = input text
export interface AppState {
  status: 'empty' | 'loading' | 'populated' | 'load-error';
  errorKind?: string; errorMessage?: string;
  viewModel: ViewModel | null;              // import type only
  edits: Record<string, EditEntry>;         // keyed by fieldKey (D-02)
  preview: { rows: WireChangeRow[]; violations: Violation[] } | null; // open when non-null
  write: { status: 'idle' | 'writing' | 'success' | 'error'; outputPath?: string; message?: string };
}
export type Action =
  | { t: 'LOAD_START' } | { t: 'LOAD_OK'; viewModel: ViewModel } | { t: 'LOAD_CANCELLED' }
  | { t: 'LOAD_ERR'; kind: string; message: string }
  | { t: 'SET_EDIT'; fieldKey: string; entry: EditEntry } | { t: 'CLEAR_EDIT'; fieldKey: string }
  | { t: 'PREVIEW_OK'; rows: WireChangeRow[]; violations: Violation[] } | { t: 'PREVIEW_CLOSE' }
  | { t: 'WRITE_START' } | { t: 'WRITE_OK'; outputPath: string } | { t: 'WRITE_CANCELLED' }
  | { t: 'WRITE_ERR'; message: string };
```
- **Dirtiness is derived, not stored:** an accumulator entry equal to its loaded ViewModel value contributes no edit (D-02). Compute `editsToPayload(state)` in a pure selector: for each entry that is `valid` AND differs from the loaded value, emit `{ fieldKey, newValue }`. `dirtyCount = editsToPayload(state).length` drives the badge (D-07).
- **Keep filter text and in-progress input text as local `useState`** in the panel/cell components — do not route every keystroke through the top-level reducer. Only commit a completed, validated edit to the accumulator (on change is fine; React batches). This keeps re-renders cheap; virtualization already caps rendered rows.
- **Pass `dispatch` via one `AppContext`** (or prop-drill for a small tree). Avoid re-creating callbacks that break virtual-row memoization; wrap row-level handlers in `useCallback`.

### Pattern 3: `@tanstack/react-virtual` fixed-size list
**What:** `useVirtualizer` with a constant `estimateSize` (32px per UI-SPEC) — no dynamic measurement.
```tsx
// electron/ui/components/VirtualList.tsx
// Source: TanStack Virtual v3 fixed-size pattern [CITED: tanstack.com/virtual/latest/docs/api/virtualizer]
const parentRef = useRef<HTMLDivElement>(null);
const rowVirtualizer = useVirtualizer({
  count: filtered.length,               // filtered array length (BROWSE-04/05)
  getScrollElement: () => parentRef.current,
  estimateSize: () => 32,               // --row-h; constant → exact, no measureElement
  overscan: 8,
});
// parentRef: position:relative; overflow:auto; fixed panel height (via className/CSS)
// inner spacer height = rowVirtualizer.getTotalSize()
// each row: position:absolute; top:0; left:0; width:100%; height:32px;
//           style={{ transform: `translateY(${vi.start}px)` }}  ← CSSOM, CSP-safe
// key each row by the STABLE item id (itemId / skill.id), NOT vi.index
```
- **Filter+virtualize interaction:** derive `filtered = useMemo(() => items.filter(pred(query)), [items, query])`; feed `filtered.length` as `count`. On query change, reset scroll to top (`parentRef.current.scrollTop = 0` or `rowVirtualizer.scrollToIndex(0)`) so results start at the top.
- **Skills (~30 rows):** virtualization is optional at that size, but reuse the same `VirtualList` for one code path and UI-SPEC consistency.

### Pattern 4: Shared type-only wire contract (renderer ↔ main)
**What:** A new `src/ipc/results.ts` that contains **only** types (zero runtime), imported via `import type` by both preload and renderer. Closes the `unknown` gap the CONTEXT flagged.
```ts
// src/ipc/results.ts — TYPE-ONLY. No runtime code → nothing bundled into either process.
import type { ViewModel, Summary } from '../view-model';
import type { WireChangeRow } from './ipc-guards';
import type { Violation } from '../patcher';

export type ErrorKind =
  | 'validation' | 'readonly' | 'unknown-field' | 'conflict'
  | 'bad-args' | 'write-invariant' | 'no-session' | 'internal';
export interface ErrResult { ok: false; kind: ErrorKind; message: string; violations?: Violation[]; }
export type LoadResult = { ok: true; summary: Summary } | { ok: true; cancelled: true } | ErrResult;
export type GetModelResult = { ok: true; viewModel: ViewModel } | ErrResult;
export type PreviewResult = { ok: true; changeReport: WireChangeRow[] } | ErrResult;
export type WriteResult = { ok: true; outputPath: string } | { ok: true; cancelled: true } | ErrResult;

export interface SaveEditorApi {
  load(): Promise<LoadResult>;
  getModel(): Promise<GetModelResult>;
  preview(edits: { fieldKey: string; newValue: string | number }[]): Promise<PreviewResult>;
  write(edits: { fieldKey: string; newValue: string | number }[]): Promise<WriteResult>;
}
declare global { interface Window { saveEditor: SaveEditorApi } }
```
- Renderer: `import type { GetModelResult, WireChangeRow, ViewModel } from '../../src/ipc/results'` — erased by esbuild, so **no core runtime enters the browser bundle**. `[CITED: esbuild.github.io/content-types/#typescript-caveats]` (type-only imports are dropped).
- Update `electron/preload.ts` to `import type { SaveEditorApi } from '../src/ipc/results'` (replacing its locally-declared `Promise<unknown>` surface). Runtime of preload is unchanged; the import is erased, so the "preload must not bundle `src/*`" rule still holds.
- Make `ErrorKind` a **string-literal union** (above) so the renderer's `switch (result.kind)` mapping to UI-SPEC copy is exhaustively checked. Optionally tighten `main.ts`'s `toErrorResult` return type to `ErrResult` (currently `kind: string`).
- **Only value-import** `src/experience-table.ts` (D-03) — it is pure (`Math` only, verified) and safe in a browser bundle.

### Anti-Patterns to Avoid
- **Renaming the entry to `main.tsx`/`app.tsx`** → esbuild emits `dist/main.js` and clobbers the electron main bundle. Keep it `renderer.tsx`.
- **`format: 'cjs'` for the renderer** (inherited from `common`) → CommonJS output in a bare `<script>`. Use `format: 'iife'`.
- **Value-importing `patcher.ts` / `ipc-guards.ts` / `field-table.ts`** into the renderer → pulls Node-side core (and its imports) into the browser bundle. Use `import type`.
- **`new RegExp(query)` for filtering** → ReDoS / injection from user input; also over-featured. Use `String.prototype.includes` on lowercased strings.
- **Coercing GP/SC to `Number`** anywhere (display, grouping, compare) → precision loss past 2^53 (D-06). Keep int64 a decimal string; group with a string-based reversible formatter or show the raw digits.
- **`dangerouslySetInnerHTML`** for any save-derived string (itemId, name, gamemode) → XSS from a crafted save. Render as React text children (auto-escaped).
- **Storing both `skill.<id>.level` and `skill.<id>.xp`** in the accumulator → main rejects the batch with `ConflictingEditError` (Pitfall 5).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| List virtualization | Manual scroll windowing / slice-on-scroll | `@tanstack/react-virtual` `useVirtualizer` | Overscan, total-size spacer, scroll sync are subtly bug-prone. |
| Range/type/readonly authority | A renderer-side "final" validator | Main's `patchSave` (already authoritative, collect-all) | SC-4; the client mirror is UX-only (D-04). |
| Level↔XP mapping | Reimplement the XP formula in the UI | Bundle `src/experience-table.ts` (D-03) | Already golden-tested; a second copy would drift. |
| int64 handling | `Number(gp)` / bigint-in-JSON | Decimal string end-to-end (D-02/D-06) | JSON has no int64; `Number` loses precision. |
| App state | Redux/Zustand/Jotai | `useReducer` + Context | CLAUDE.md forbids heavy state libs; one window. |
| Input schema validation | Zod for int64 | Hand-rolled `validation.ts` | Zod's `number` can't hold int64; you'd custom-refine a string regardless. |

**Key insight:** The only irreversible operation (writing bytes) lives entirely in main and is already proven. The renderer's job is projection + UX; everything corruption-adjacent is re-checked by main on `preview`/`write`. Do not duplicate authority in the renderer — mirror it for instant feedback and let main reject.

## Common Pitfalls

### Pitfall 1: Renderer entry filename collides with `dist/main.js`
**What goes wrong:** Naming the React entry `main.tsx`/`app.tsx` makes esbuild emit `dist/main.js`, overwriting the electron main-process bundle; the app then loads renderer code as `main` and fails to boot.
**Why it happens:** esbuild derives output names from entry basenames into a shared `outdir: 'dist'`.
**How to avoid:** Keep the entry `electron/renderer.tsx` → `dist/renderer.js`. `index.html` already references `renderer.js`.
**Warning signs:** `dist/main.js` suddenly contains React; Electron main crashes on launch.

### Pitfall 2: `process is not defined` at renderer runtime
**What goes wrong:** react-dom reads `process.env.NODE_ENV`; in a browser bundle without a `define`, `process` is undefined → the renderer throws immediately (white window).
**Why it happens:** esbuild does not inject `process.env.NODE_ENV` automatically; the node `common` config being spread does not help the browser bundle.
**How to avoid:** Add `define: { 'process.env.NODE_ENV': JSON.stringify(...) }` to the renderer build (Pattern 1). Also set `format: 'iife'`.
**Warning signs:** Blank window; devtools console `ReferenceError: process is not defined`.

### Pitfall 3: Type imports dragging core runtime into the browser bundle
**What goes wrong:** A value import (`import { WireChangeRow }`) of a module that also has runtime code bundles that runtime (and its transitive Node-touching imports) into `renderer.js`, bloating it and risking node-builtin references.
**Why it happens:** esbuild only erases *type-only* imports; a normal named import of an interface still loads the module if it also exports runtime.
**How to avoid:** Use `import type { ... }` for all wire shapes; keep `src/ipc/results.ts` type-only; value-import only `experience-table.ts`.
**Warning signs:** `renderer.js` size jumps; esbuild warns about a node builtin (`node:fs`, `node:zlib`) in the browser build.

### Pitfall 4: Filtering re-keys virtual rows by index
**What goes wrong:** Keying rows by `virtualItem.index` while filtering reuses DOM nodes across different logical items → inputs show stale values, focus jumps.
**Why it happens:** After a filter change the index→item mapping changes but React reconciles by key.
**How to avoid:** Key each row by the stable item id (`itemId` / `skill.id`); reset scroll to top on query change.
**Warning signs:** An inline edit's text appears on the wrong row after typing in the filter.

### Pitfall 5: Sending both level and xp for one skill
**What goes wrong:** The patcher rejects a batch that sets BOTH `skill.<id>.level` and `skill.<id>.xp` for the same skill with `ConflictingEditError` (`kind:'conflict'`) — the whole preview/write fails. (Verified in `src/patcher.ts`: a batch may set EITHER level OR xp, not both.)
**Why it happens:** The accumulator is keyed by fieldKey; a naive Set-by-level then Set-XP leaves both keys present.
**How to avoid:** On skill edit-mode toggle (`Set by level` ↔ `Set XP`), `CLEAR_EDIT` the other key for that skill so at most one of the pair is ever in the accumulator.
**Warning signs:** Preview returns `kind:'conflict'` mentioning a skill id.

### Pitfall 6: Client mirror bounds diverging from main
**What goes wrong:** If the renderer's range checks disagree with the patcher, the UI either blocks a value main would accept or accepts one main rejects (surprise violation at preview).
**Why it happens:** Bounds guessed instead of mirrored. Confirmed authoritative bounds in `src/patcher.ts`: **int64 currency `0n..9,223,372,036,854,775,807n`** (lower bound is 0, not INT64_MIN); **int32 quantity integer `0..2,147,483,647`**; **double XP finite and `>= 0`** (skills additionally capped at `xpForLevel(levelCap)`); **skill level integer `1..levelCap`**.
**How to avoid:** Encode exactly those bounds in `validation.ts`; for the skill "Set XP" upper bound, optionally reuse the bundled `xpForLevel(levelCap)` for instant feedback, else let main surface it. Map errors to the exact UI-SPEC copy strings.
**Warning signs:** Preview shows a `validation` violation for a field the UI marked valid.

## Runtime State Inventory

> This phase replaces `electron/renderer.ts` (a throwaway smoke test) and adds new UI modules — it does not rename or migrate any stored/runtime state. No data migration is involved.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — the renderer reads the ViewModel from main; it persists nothing. | None. |
| Live service config | None — no external services; single local window. | None. |
| OS-registered state | None. | None. |
| Secrets/env vars | None. Build reads `process.env.NODE_ENV` only to pick React dev/prod mode. | None (set in the build/dev script). |
| Build artifacts | `dist/renderer.js` is regenerated; adding `dist/renderer.css` is new. `electron/renderer.ts` is replaced by `electron/renderer.tsx` (delete the `.ts`). | Delete stale `electron/renderer.ts`; ensure `dist/` rebuild. |

**Nothing found:** verified by inspecting `electron/renderer.ts` (dumps bridge results into a `<pre>`, holds no state) and the ViewModel shape (offset-free projection, no persistence).

## Code Examples

### Pure client validation mirror (D-04) — hand-rolled, unit-testable
```ts
// electron/ui/lib/validation.ts — bounds mirror src/patcher.ts (main is the authority).
// Error strings match the UI-SPEC Copywriting Contract verbatim.
const INT32_MAX = 2_147_483_647;
const INT64_MAX = 9_223_372_036_854_775_807n;

export type FieldResult = { ok: true; value: string | number } | { ok: false; message: string };

export function validateInt32(raw: string): FieldResult {          // quantity (EDIT-02)
  if (!/^-?\d+$/.test(raw.trim())) return { ok: false, message: 'Enter a whole number.' };
  const n = Number(raw.trim());
  if (!Number.isInteger(n) || n < 0 || n > INT32_MAX)
    return { ok: false, message: `Value must be between 0 and ${INT32_MAX}.` };
  return { ok: true, value: n };
}

export function validateInt64(raw: string): FieldResult {          // GP / Slayer Coins (EDIT-01, D-06)
  const s = raw.trim();
  if (!/^-?\d+$/.test(s)) return { ok: false, message: 'Enter a whole number.' };
  const b = BigInt(s);                                            // never Number() — precision (D-06)
  if (b < 0n || b > INT64_MAX)
    return { ok: false, message: `Value must be between 0 and ${INT64_MAX}.` };
  return { ok: true, value: s };                                  // stays a decimal string end-to-end
}

export function validateLevel(raw: string, levelCap: number): FieldResult { // EDIT-03 set-by-level
  if (!/^-?\d+$/.test(raw.trim())) return { ok: false, message: 'Enter a whole number.' };
  const n = Number(raw.trim());
  if (!Number.isInteger(n) || n < 1 || n > levelCap)
    return { ok: false, message: `Level must be between 1 and ${levelCap}.` };
  return { ok: true, value: n };
}

export function validateXp(raw: string): FieldResult {            // EDIT-03 set-XP (double)
  const n = Number(raw.trim());
  if (raw.trim() === '' || !Number.isFinite(n) || n < 0)
    return { ok: false, message: `Value must be between 0 and ${Number.MAX_SAFE_INTEGER}.` };
  return { ok: true, value: n };
}
```

### Pure filter predicate (BROWSE-04/05) — no debounce, no regex
```ts
// electron/ui/lib/filter.ts — case-insensitive substring on the namespaced ID.
export function matches(query: string, id: string): boolean {
  if (query === '') return true;
  return id.toLowerCase().includes(query.toLowerCase());
}
// Usage: useMemo(() => items.filter(i => matches(q, i.itemId)), [items, q])
// 689 items × includes = sub-millisecond; filtering synchronously per keystroke is fine (no debounce).
```

### Root mount (React 19)
```tsx
// electron/renderer.tsx
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './styles.css';                               // → dist/renderer.css
const root = document.getElementById('root');
if (root) createRoot(root).render(<App />);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `ReactDOM.render` | `createRoot(...).render` (`react-dom/client`) | React 18 | Use `createRoot`; `render` is removed in React 19. |
| Classic JSX (`import React`) | Automatic runtime (`jsx: 'automatic'`) | React 17+ | No per-file `import React`; esbuild injects the runtime import. |
| `react-window` measured lists | `@tanstack/react-virtual` headless | 2022+ | Headless, fixed-size mode needs no `measureElement`. |

**Deprecated/outdated:**
- `ReactDOM.render` / `ReactDOM.hydrate` — removed in React 19; use `createRoot`/`hydrateRoot`.
- Classic-runtime JSX pragma comments — unnecessary with `jsx: 'automatic'`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | esbuild 0.28 accepts `jsx: 'automatic'` + `jsxDev` and emits `dist/renderer.css` from a CSS import | Pattern 1 | Low — these are stable esbuild options; verify option names against installed 0.28 at plan time (`npx esbuild --help`). |
| A2 | React inline `style={{}}` (CSSOM) is not blocked by `style-src` under the strict CSP | Pattern 1 | Low — well-established React-under-CSP behavior; if wrong, add `style-src 'unsafe-inline'` (avoid) or move all dynamic styles to classes (virtualizer transform is the only dynamic style). |
| A3 | Skill "Set XP" upper bound is `xpForLevel(levelCap)` in main | Pitfall 6 | Low — confirmed pattern in `patcher.ts` (`X > maxXp` reject); client can rely on main for this edge. |
| A4 | Adding DOM lib to typecheck won't destabilize the Node-side `tsc --noEmit` | Validation Architecture | Low — use a scoped UI tsconfig or add `DOM` to `lib`; Node globals remain via `types:["node"]`. |

**Note:** No `[ASSUMED]` claim touches the corruption-critical write path — all byte-level bounds were **verified against `src/patcher.ts`** this session (Pitfall 6). The assumptions above are build-config and CSS-behavior details with cheap, non-destructive fallbacks.

## Open Questions

1. **tsconfig strategy for `.tsx` + DOM lib**
   - What we know: root `tsconfig.json` has `lib:["ES2022"]`, `types:["node"]`, `include:["electron/**/*.ts", ...]` (does NOT match `.tsx`), no `jsx` option. `exactOptionalPropertyTypes:true` is on.
   - What's unclear: single shared tsconfig (add `jsx:"react-jsx"`, `"DOM","DOM.Iterable"` to lib, `electron/**/*.tsx` to include) vs a scoped `electron/ui/tsconfig.json` extending root.
   - Recommendation: a small scoped UI tsconfig keeps DOM globals out of Node code; if that is churn, add the three keys to the root config (harmless — the renderer already opted into DOM via a `/// <reference lib="dom" />`). Either way, add `electron/**/*.tsx` to `include` and `@types/react`(-dom) to devDeps. `exactOptionalPropertyTypes` may require a few explicit `| undefined` in props — minor.

2. **Dev-loop ergonomics (esbuild watch + electron reload)**
   - What we know: D-01 accepts "esbuild `--watch` + electron reload (no HMR)."
   - What's unclear: exact scripts. Recommendation: add a `dev` script that runs `esbuild.context()` + `ctx.watch()` (renderer + main) and launches `electron .`; renderer edits need a window reload (Ctrl/Cmd+R reloads `renderer.js`), main edits need an electron restart. No extra deps.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | build + tests | ✓ | (repo runs `tsx`/esbuild already) | — |
| esbuild | renderer/main bundling | ✓ | `^0.28.1` (devDep) | — |
| electron | run the app | ✓ | `43.0.0` (devDep) | — |
| tsx | `tsx --test` unit tests | ✓ | `^4.23.0` (devDep) | — |
| react / react-dom / @tanstack/react-virtual | renderer UI | ✗ (to install) | 19.2.7 / 19.2.7 / 3.14.5 | none — required; `npm install` per Standard Stack |

**Missing dependencies with no fallback:** the three React-family runtime deps (+ two type packages) — install them (verified on npm, Package Legitimacy Audit above).
**Missing dependencies with fallback:** none.

## Validation Architecture

> nyquist_validation is enabled (config.json). Renderer visual/interaction behavior is manual-UAT; the corruption-relevant and logic-relevant pieces are extracted as **pure functions** and unit-tested under the existing `tsx --test` runner — no new test deps (no jsdom / testing-library), consistent with the lean stance.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` via `tsx --test` (already in use) |
| Config file | none — `package.json` `"test": "tsx --test 'test/**/*.test.ts'"` |
| Quick run command | `npx tsx --test 'test/ui/*.test.ts'` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EDIT-01/02/03 | Client mirror accepts/rejects at exact main bounds; int64 stays string | unit | `npx tsx --test 'test/ui/validation.test.ts'` | ❌ Wave 0 |
| BROWSE-04/05 | Case-insensitive substring filter predicate | unit | `npx tsx --test 'test/ui/filter.test.ts'` | ❌ Wave 0 |
| D-02 / SAFE-02 | Accumulator: equal-to-loaded contributes no edit; `editsToPayload` shape + int64 string; dirtyCount | unit | `npx tsx --test 'test/ui/reducer.test.ts'` | ❌ Wave 0 |
| EDIT-03 (Pitfall 5) | Mode toggle clears the other skill key (no level+xp conflict) | unit | `npx tsx --test 'test/ui/reducer.test.ts'` | ❌ Wave 0 |
| EDIT-04 / D-03 | Level→XP display echoes `xpForLevel` (reuse of bundled table) | unit | `npx tsx --test 'test/ui/format.test.ts'` | ❌ Wave 0 |
| BROWSE-01/02/03, D-05/06/07/08 | Summary/list rendering, virtualization, click-to-edit, preview modal, native Save-As | manual UAT | — (in-app; plus mandatory in-game load of the written `.sav`) | n/a |

### Sampling Rate
- **Per task commit:** `npx tsx --test 'test/ui/<touched>.test.ts'` (pure module under edit).
- **Per wave merge:** `npm test` (whole suite — includes Phases 1–4 golden/round-trip tests).
- **Phase gate:** full suite green + manual UAT: load a real `.sav`, edit GP/quantity/skill, preview old→new, write a new file, and **load it in-game** (the mandatory acceptance from ROADMAP §Phase 5).

### Wave 0 Gaps
- [ ] `test/ui/validation.test.ts` — covers EDIT-01/02/03 bounds (mirror of `patcher.ts`)
- [ ] `test/ui/filter.test.ts` — covers BROWSE-04/05
- [ ] `test/ui/reducer.test.ts` — covers D-02 accumulator + Pitfall 5 mutual exclusion + dirtyCount
- [ ] `test/ui/format.test.ts` — covers D-03 level→XP echo + int64 string grouping reversibility
- [ ] No framework install needed (`tsx --test` already present). Keep UI logic in pure modules so it is testable without a DOM.

## Security Domain

> security_enforcement enabled, ASVS L1. This phase is a renderer over the already-hardened Phase 4 bridge (contextIsolation + sandbox + strict CSP, all unchanged). No new IPC surface, no new privilege.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Single-user local tool; no accounts. |
| V3 Session Management | no | No sessions beyond main's single in-memory active save. |
| V4 Access Control | no | No multi-user boundary. |
| V5 Input Validation | yes | Client mirror (`validation.ts`, UX) + main's authoritative `patchSave` (SC-4). Filter uses `String.includes`, never `new RegExp(userInput)`. IPC `edits` re-guarded in main (`assertEditsPayload`, existing). |
| V6 Cryptography | no | Save is Brotli-compressed, not encrypted (REQUIREMENTS out-of-scope). |
| V14 Config (CSP) | yes | `default-src 'self'; script-src 'self'` unchanged; renderer loaded via `loadFile` (local only); external same-origin CSS only. |

### Known Threat Patterns for React-renderer + user-supplied-file
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via crafted save strings (itemId / name / gamemode rendered into DOM) | Tampering / Info Disclosure | Render all save-derived strings as React text children (auto-escaped); never `dangerouslySetInnerHTML`; strict CSP blocks injected script even on escape mistakes. |
| ReDoS / injection via filter query | DoS / Tampering | Plain `String.includes` on lowercased strings — no `RegExp` from user input. |
| Precision-loss corruption of int64 currency | Tampering (data integrity) | int64 stays a decimal string end-to-end (D-06); `BigInt` for bounds; never `Number()`. Main re-validates. |
| Malformed edits payload crossing the bridge | Tampering | Existing `assertEditsPayload` SHAPE-guard in main (Phase 4); renderer sends only well-formed `{fieldKey,newValue}`. |
| Remote resource load / navigation escape | Elevation | Unchanged Phase 4 controls: `setWindowOpenHandler(deny)`, `will-navigate` prevented, CSP `default-src 'self'`, no remote URLs; React/CSS bundled locally. |

**Untrusted-input note:** the ViewModel content originates from a user-supplied `.sav` and must be treated as data — escaped on render, never `eval`'d, never used to build a `RegExp` or DOM HTML. The *edits* the renderer sends are themselves treated as untrusted by main (re-guarded + re-validated); the client mirror never becomes the authority.

## Sources

### Primary (HIGH confidence)
- Repo files (read this session): `src/view-model.ts`, `src/experience-table.ts`, `src/patcher.ts` (verified int32/int64/level/xp bounds + conflict rule), `src/ipc/ipc-guards.ts` (`WireEdit`/`WireChangeRow`/`assertEditsPayload`), `src/ipc/write-service.ts` (`WriteResult`), `electron/main.ts` (result kinds), `electron/preload.ts`, `electron/renderer.ts`, `electron/index.html`, `scripts/build.mjs`, `package.json`, `tsconfig.json`.
- npm registry (`npm view`, 2026-07-04): react 19.2.7, react-dom 19.2.7, @tanstack/react-virtual 3.14.5, @types/react 19.2.17, @types/react-dom 19.2.3; peer ranges + no postinstall scripts confirmed.
- gsd-tools `package-legitimacy check` — verdicts recorded in the Package Legitimacy Audit.
- `05-UI-SPEC.md`, `05-CONTEXT.md`, `04-CONTEXT.md`, `REQUIREMENTS.md` (locked contracts).

### Secondary (MEDIUM confidence)
- TanStack Virtual v3 fixed-size `useVirtualizer` pattern `[CITED: tanstack.com/virtual/latest/docs/api/virtualizer]`.
- esbuild JSX / CSS / TS type-erasure behavior `[CITED: esbuild.github.io/content-types]`.

### Tertiary (LOW confidence)
- esbuild `jsx:'automatic'`/`jsxDev` exact option names and CSP CSSOM style behavior — `[ASSUMED]`, verify against installed esbuild 0.28 at plan time (cheap, non-destructive).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — npm-verified versions, CLAUDE.md-blessed, legitimacy-checked.
- Architecture: HIGH — grounded in the actual repo files and locked D-01..D-08 + UI-SPEC.
- Pitfalls: HIGH — bounds/conflict rule verified in `patcher.ts`; build pitfalls verified against `scripts/build.mjs` + `package.json`.
- Build-config specifics (esbuild option names, CSP CSSOM): MEDIUM/LOW — flagged in Assumptions Log with fallbacks.

**Research date:** 2026-07-04
**Valid until:** 2026-08-03 (stable stack; re-pin exact patch versions at install time).
