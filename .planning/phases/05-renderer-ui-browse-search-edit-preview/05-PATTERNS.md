# Phase 05: Renderer UI — Browse, Search, Edit, Preview - Pattern Map

**Mapped:** 2026-07-04
**Files analyzed:** 22 (new + modified)
**Analogs found:** 20 / 22 (2 UI-shape files have partial/no analog — first React surface in the repo)

> This phase layers a **fresh React 19 renderer** onto an existing esbuild/Electron/CommonJS/TypeScript
> codebase (Phases 1–4 complete). There is **no existing React/JSX code** to copy component patterns from,
> so component files (`.tsx`) map their *conventions* (module header comments, `import type` boundary, pure
> logic extraction, test layout) onto the strongest existing analogs, not their JSX. The load-bearing
> analogs are the **build wiring** (`scripts/build.mjs`), the **type boundary** (`src/ipc/ipc-guards.ts`,
> `electron/preload.ts`), the **pure-module + `tsx --test` convention** (`src/experience-table.ts` +
> its test), and the **discriminated-result contract** (`electron/main.ts`).

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `electron/renderer.tsx` (replaces `renderer.ts`) | entry/mount | event-driven | `electron/renderer.ts` | exact (same entry, replaced) |
| `electron/ui/App.tsx` | component/container | request-response | `electron/renderer.ts` (bridge-call orchestration) | role-partial (no React analog) |
| `electron/ui/state/reducer.ts` | store (pure reducer) | transform | `src/patcher.ts` (pure, typed unions, error/validation) | role-match (pure-module convention) |
| `electron/ui/state/selectors.ts` | utility (pure) | transform | `src/ipc/ipc-guards.ts` (`toWireReport` — pure projection) | role-match |
| `electron/ui/lib/validation.ts` | utility (pure) | transform | `src/patcher.ts` `validatePlain` (bounds authority to mirror) | exact (mirrors bounds) |
| `electron/ui/lib/filter.ts` | utility (pure) | transform | `src/experience-table.ts` (small pure `Math`/string module) | role-match |
| `electron/ui/lib/format.ts` | utility (pure) | transform | `src/experience-table.ts` (value-imported by this file, D-03) | exact (reuses `xpForLevel`) |
| `electron/ui/components/SummaryBar.tsx` | component | request-response | `src/view-model.ts` `Summary` (shape it renders) | role-partial (no React analog) |
| `electron/ui/components/VirtualList.tsx` | component | streaming (windowed) | (none — `@tanstack/react-virtual`, new dep) | no analog |
| `electron/ui/components/BankPanel.tsx` | component | CRUD (browse+edit) | `src/view-model.ts` `BankItem` (shape) | role-partial |
| `electron/ui/components/SkillPanel.tsx` | component | CRUD (browse+edit) | `src/view-model.ts` `Skill` + `experience-table.ts` (D-03) | role-partial |
| `electron/ui/components/EditableCell.tsx` | component | event-driven | `validation.ts` (its own new pure module) | role-partial |
| `electron/ui/components/PreviewModal.tsx` | component | request-response | `WireChangeRow` (ipc-guards) + `main.ts` preview handler | role-partial |
| `electron/ui/components/Banner.tsx` | component | event-driven | `main.ts` `toErrorResult` kinds (copy mapping) | role-partial |
| `electron/ui/styles.css` | config (styling) | — | (none — first stylesheet; tokens from UI-SPEC) | no analog |
| `src/ipc/results.ts` | model (type-only) | — | `src/ipc/ipc-guards.ts` + `electron/main.ts` result shapes | exact (extracts existing shapes) |
| `electron/preload.ts` (modify) | middleware (bridge) | request-response | `electron/preload.ts` (self — tighten `unknown`→typed) | exact |
| `electron/index.html` (modify) | config | — | `electron/index.html` (self — add root+stylesheet) | exact |
| `scripts/build.mjs` (modify) | build/config | — | `scripts/build.mjs` (self — extend renderer block) | exact |
| `package.json` (modify) | config | — | `package.json` (self — add 3 deps + 2 dev types) | exact |
| `test/ui/*.test.ts` (4 new) | test | — | `test/experience-table.test.ts` | exact (same runner/layout) |
| `electron/ui/tsconfig.json` (new, optional) | config | — | `tsconfig.json` (root — extend + add `jsx`/DOM) | role-match |

---

## Shared Patterns

### Module header comment convention (apply to EVERY new `.ts`/`.tsx`)
**Source:** every file in `src/` and `electron/` opens with a `//`-block explaining WHAT the module owns,
WHICH decision/requirement (D-xx / SC-x / EDIT-xx) it implements, and the trust boundary. Match this.

`electron/renderer.ts` lines 1-8 (the file being replaced) is the closest template for a renderer file:
```ts
/// <reference lib="dom" />
// electron/renderer.ts — throwaway smoke-test renderer (RESEARCH §Architecture, Open Q 3).
//
// ... touches NO Node/fs/Brotli/offsets, holds NO session handle, and imports nothing from
// `src/*`, `node:`, or `electron` — the renderer's only privileged surface is the four exposed methods.
```
New `.tsx` files must carry the same kind of header. Note the `/// <reference lib="dom" />` triple-slash —
the current renderer pulls DOM in per-file because the root tsconfig is `lib: ES2022`. Phase 5 instead adds
`jsx` + DOM lib via a scoped `electron/ui/tsconfig.json` OR root config (Open Question 1), so `.tsx` files
will NOT each need the triple-slash — but keep the header block.

### `import type` trust-boundary discipline (apply to ALL renderer files touching core types)
**Source:** `src/ipc/ipc-guards.ts` lines 26-27 and `electron/preload.ts` line 14.
```ts
// ipc-guards.ts — type-only imports of core shapes:
import { type Edit, type ChangeReportRow } from '../patcher';
import { type FieldTable } from '../field-table';
```
The renderer bundle (`platform:browser`) must import every wire/core shape via `import type` so esbuild
erases it and pulls NO Node-side runtime into `dist/renderer.js`. The ONLY permitted value-import from
`src/*` is `src/experience-table.ts` (D-03 — pure `Math`, verified browser-safe). This is the single most
important cross-cutting rule; violating it drags `node:fs`/`node:zlib` into the browser build (RESEARCH
Pitfall 3).

### Discriminated `{ ok, kind, message, violations? }` result contract (apply to App bridge-call handling)
**Source:** `electron/main.ts` lines 41-68 (`toErrorResult`) — the authoritative producer of every result
the renderer consumes.
```ts
function toErrorResult(e: unknown): { ok: false; kind: string; message: string; violations?: Violation[] } {
  if (e instanceof ValidationError)   return { ok: false, kind: 'validation',     message: e.message, violations: e.violations };
  if (e instanceof ReadOnlyFieldError) return { ok: false, kind: 'readonly',       message: e.message };
  if (e instanceof UnknownFieldError)  return { ok: false, kind: 'unknown-field',  message: e.message };
  if (e instanceof ConflictingEditError) return { ok: false, kind: 'conflict',     message: e.message };
  if (e instanceof IpcArgError)        return { ok: false, kind: 'bad-args',        message: e.message };
  // ... 'write-invariant' | 'no-session' | 'internal'
}
```
The 8 `kind` strings here are the exhaustive set the renderer's `Banner`/`PreviewModal` map to UI-SPEC copy.
`src/ipc/results.ts` must type `ErrorKind` as the **string-literal union** of exactly these 8 values so the
renderer's `switch (result.kind)` is exhaustively checked (RESEARCH Pattern 4).

### Pure-module + `tsx --test` convention (apply to reducer/selectors/validation/filter/format + their tests)
**Source:** `src/experience-table.ts` (pure, no Node import, JSDoc per export) + `test/experience-table.test.ts`
lines 19-32.
```ts
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { xpForLevel, levelForXp } from '../src/experience-table';
// SC-locked fixtures drive the assertions; no framework, no jsdom.
```
All Phase 5 pure logic (reducer, selectors, validation, filter, format) goes in **DOM-free modules** so it is
unit-testable under the existing `tsx --test` runner with zero new test deps. Tests live in `test/ui/*.test.ts`
mirroring `test/experience-table.test.ts` exactly (`node:test` + `node:assert/strict`, import from the module
under test). `package.json` `test` script `tsx --test 'test/**/*.test.ts'` already globs them in — no script change.

### Error-class naming convention (if any new error types are added)
**Source:** `src/ipc/ipc-guards.ts` lines 34-40 and `src/patcher.ts` lines 90-128.
```ts
export class IpcArgError extends Error {
  constructor(message: string) { super(message); this.name = 'IpcArgError'; }
}
```
Prefer the `FieldResult` discriminated-return style (below) over throwing for client validation, but if a
renderer error type is needed, follow this `extends Error` + `this.name` convention.

---

## Pattern Assignments

### `scripts/build.mjs` (modify — build/config) — MOST LOAD-BEARING CHANGE

**Analog:** `scripts/build.mjs` (self — extend the existing `platform:browser` renderer block, lines 39-44).

**Current renderer block to replace** (lines 39-44):
```js
// renderer runs in Chromium — build for the browser platform (no node builtins; window.saveEditor only).
await build({
  ...common,
  platform: 'browser',
  entryPoints: ['electron/renderer.ts'],
});
```
**Shared `common` (lines 20-29)** — note `format: 'cjs'` is inherited and MUST be overridden for the renderer:
```js
const common = {
  bundle: true, platform: 'node', format: 'cjs', target: 'node22',
  sourcemap: true, external: ['electron'], outdir: 'dist',
};
```
**Deltas to apply** (RESEARCH Pattern 1 — the three React-under-CSP requirements):
- `entryPoints: ['electron/renderer.tsx']` — stays named `renderer` → emits `dist/renderer.js` (Pitfall 1: renaming to `main.tsx`/`app.tsx` clobbers `dist/main.js`).
- `format: 'iife'` — overrides inherited `cjs` (a bare `<script>` has no CommonJS host; Pitfall 2 / anti-pattern).
- `jsx: 'automatic'` — React 19 automatic runtime, no per-file `import React`.
- `define: { 'process.env.NODE_ENV': JSON.stringify(isDev ? 'development' : 'production') }` — MANDATORY, else react-dom throws `process is not defined` (Pitfall 2).
- `minify: !isDev`. Leave the `main.ts` + `preload.ts` node build (lines 34-37) untouched.
- CSS is emitted automatically: `import './ui/styles.css'` from `renderer.tsx` (at `electron/renderer.tsx`; stylesheet at `electron/ui/styles.css`) makes esbuild write `dist/renderer.css`.

Keep the trailing `copyFile('electron/index.html', 'dist/index.html')` (line 47) unchanged.

---

### `src/ipc/results.ts` (new — type-only model)

**Analog:** `src/ipc/ipc-guards.ts` (same directory, exports `WireEdit`/`WireChangeRow`) + `electron/main.ts`
result shapes (lines 41-68, 85-102, 111) + `src/ipc/write-service.ts` line 58.

**Existing wire shapes to re-export/reference** (`src/ipc/ipc-guards.ts` lines 47-68):
```ts
export interface WireEdit { fieldKey: string; newValue: string | number; }
export interface WireChangeRow { fieldKey: string; oldValue: string | number; newValue: string | number; width: number; }
```
**Existing `WriteResult`** (`src/ipc/write-service.ts` line 58):
```ts
export type WriteResult = { ok: true; outputPath: string } | { ok: true; cancelled: true };
```
**Existing `Violation`** (`src/patcher.ts` lines 77-84):
```ts
export interface Violation { fieldKey: string; reason: string; }
```
**Existing load/getModel/preview result shapes** (`electron/main.ts` lines 85-102, 111):
```ts
// load:   { ok: true, summary } | { ok: true, cancelled: true } | { ok:false, kind, message }
// getModel: { ok: true, viewModel } | { ok: false, kind: 'no-session', message }
// preview: { ok: true, changeReport: WireChangeRow[] } | error
```
**Pattern to produce** — a TYPE-ONLY module (zero runtime), all imports via `import type`, per RESEARCH Pattern 4:
```ts
// src/ipc/results.ts — TYPE-ONLY. No runtime code → nothing bundled into either process.
import type { ViewModel, Summary } from '../view-model';
import type { WireChangeRow, WireEdit } from './ipc-guards';
import type { Violation } from '../patcher';

export type ErrorKind =
  | 'validation' | 'readonly' | 'unknown-field' | 'conflict'
  | 'bad-args' | 'write-invariant' | 'no-session' | 'internal';  // exactly main.ts's toErrorResult kinds
export interface ErrResult { ok: false; kind: ErrorKind; message: string; violations?: Violation[]; }
export type LoadResult = { ok: true; summary: Summary } | { ok: true; cancelled: true } | ErrResult;
export type GetModelResult = { ok: true; viewModel: ViewModel } | ErrResult;
export type PreviewResult = { ok: true; changeReport: WireChangeRow[] } | ErrResult;
export type WriteResult = { ok: true; outputPath: string } | { ok: true; cancelled: true } | ErrResult;

export interface SaveEditorApi {
  load(): Promise<LoadResult>;
  getModel(): Promise<GetModelResult>;
  preview(edits: WireEdit[]): Promise<PreviewResult>;
  write(edits: WireEdit[]): Promise<WriteResult>;
}
declare global { interface Window { saveEditor: SaveEditorApi } }
```

---

### `electron/preload.ts` (modify — bridge/middleware)

**Analog:** `electron/preload.ts` (self). Runtime is unchanged; only the type surface tightens from `unknown`
to the shared `SaveEditorApi`.

**Current locally-declared surface to replace** (lines 21-30):
```ts
export interface SaveEditorApi {
  load(): Promise<unknown>;
  getModel(): Promise<unknown>;
  preview(edits: unknown): Promise<unknown>;
  write(edits: unknown): Promise<unknown>;
}
```
**Change:** replace the local interface + `declare global` block (lines 21-37) with
`import type { SaveEditorApi } from '../src/ipc/results';`. The import is erased by esbuild, so the
"preload must not bundle `src/*`" rule (line 12 comment) still holds. Keep the runtime `api` object and
`contextBridge.exposeInMainWorld` (lines 39-47) exactly as-is — the four `ipcRenderer.invoke('save:*')`
bindings do not change.

---

### `electron/renderer.tsx` (new — entry/mount, replaces `electron/renderer.ts`)

**Analog:** `electron/renderer.ts` (the throwaway it replaces — same entry name, same "no Node/fs/offsets"
boundary; delete the `.ts` after).

**Pattern** (RESEARCH Code Examples "Root mount"):
```tsx
// electron/renderer.tsx — real React entry (replaces the smoke-test renderer.ts).
import { createRoot } from 'react-dom/client';   // React 19 createRoot, NOT ReactDOM.render
import { App } from './ui/App';
import './ui/styles.css';                         // → esbuild emits dist/renderer.css (renderer.tsx at electron/, stylesheet at electron/ui/)
const root = document.getElementById('root');
if (root) createRoot(root).render(<App />);
```
Keep the header-comment convention from `renderer.ts` lines 1-8. This file stays the sole browser entry.

---

### `electron/index.html` (modify — config)

**Analog:** `electron/index.html` (self). Keep the strict CSP meta (lines 10-13) **unchanged** (D-01).

**Changes:**
- Add `<link rel="stylesheet" href="renderer.css" />` in `<head>` (same-origin → allowed by `default-src 'self'`).
- Replace the smoke-test `<body>` (h1/p/buttons/`<pre id="output">`, lines 17-29) with a single `<div id="root"></div>`.
- Keep `<script src="renderer.js"></script>` (line 31) — the bundle name is unchanged.
- Update `<title>` off "bridge smoke test".

---

### `electron/ui/lib/validation.ts` (new — pure client validation mirror, D-04)

**Analog:** `src/patcher.ts` `validatePlain` (lines ~213-233) — the AUTHORITY whose bounds this file mirrors
(RESEARCH Pitfall 6). Bounds constants from `src/patcher.ts` lines 34-36:
```ts
const INT32_MAX = 2_147_483_647;
const INT64_MAX = 9_223_372_036_854_775_807n;
```
**Authoritative bounds to mirror EXACTLY** (verified in `patcher.ts` `validatePlain`):
- int64 currency: `0n..9_223_372_036_854_775_807n` (lower bound is **0**, not INT64_MIN).
- int32 quantity: finite integer `0..2_147_483_647`.
- double XP: finite and `>= 0` (skills additionally capped at `xpForLevel(levelCap)`).
- skill level: integer `1..levelCap`.

**Return-style pattern** (discriminated result, mirrors the codebase's `{ ok, ... }` convention rather than
throwing; RESEARCH Code Examples):
```ts
export type FieldResult = { ok: true; value: string | number } | { ok: false; message: string };

export function validateInt64(raw: string): FieldResult {   // GP / Slayer Coins (EDIT-01, D-06)
  const s = raw.trim();
  if (!/^-?\d+$/.test(s)) return { ok: false, message: 'Enter a whole number.' };
  const b = BigInt(s);                                       // NEVER Number() — precision (D-06)
  if (b < 0n || b > 9_223_372_036_854_775_807n) return { ok: false, message: `Value must be between 0 and ...` };
  return { ok: true, value: s };                             // stays a decimal string end-to-end
}
```
Error strings must match the UI-SPEC Copywriting Contract verbatim (`Value must be between {min} and {max}.`,
`Level must be between 1 and {levelCap}.`, `Enter a whole number.`). Keep DOM-free → unit-tested in
`test/ui/validation.test.ts`.

---

### `electron/ui/lib/filter.ts` (new — pure predicate, BROWSE-04/05)

**Analog:** `src/experience-table.ts` (small pure exported function with JSDoc). Pattern (RESEARCH Code Examples):
```ts
export function matches(query: string, id: string): boolean {
  if (query === '') return true;
  return id.toLowerCase().includes(query.toLowerCase());  // NEVER new RegExp(userInput) — ReDoS (Pitfall/security)
}
```
Case-insensitive `String.includes`, no debounce (689 rows × includes = sub-ms). Unit-tested in `test/ui/filter.test.ts`.

---

### `electron/ui/lib/format.ts` (new — pure, D-03 level→XP + int64 grouping)

**Analog + value-import:** `src/experience-table.ts` — this is the **one** `src/*` module the renderer
value-imports (D-03, browser-safe pure `Math`). Reuse its exports directly:
```ts
import { xpForLevel } from '../../../src/experience-table';   // VALUE import (allowed exception) — live level→XP echo
```
`xpForLevel(99)` → `13_034_431`-style echo in "Set by level" mode. int64 thousands-grouping must be
**string-based and reversible** (never `Number(gp)` — D-06 precision). Unit-tested in `test/ui/format.test.ts`
(level→XP echo reuse + grouping reversibility).

---

### `electron/ui/state/reducer.ts` (new — pure store, D-02)

**Analog:** `src/patcher.ts` — the repo's exemplar of a large PURE module with typed discriminated unions,
a typed error taxonomy, and collect-all semantics. Mirror its purity (no React/DOM import → `tsx --test`).

**Pattern** (RESEARCH Pattern 2). All wire/core types via `import type`:
```ts
import type { ViewModel } from '../../../src/view-model';
import type { WireChangeRow, WireEdit } from '../../../src/ipc/ipc-guards';
import type { Violation } from '../../../src/patcher';

export interface EditEntry { raw: string; value: string | number; valid: boolean; }
export interface AppState {
  status: 'empty' | 'loading' | 'populated' | 'load-error';
  viewModel: ViewModel | null;
  edits: Record<string, EditEntry>;                 // keyed by fieldKey (D-02)
  preview: { rows: WireChangeRow[]; violations: Violation[] } | null;
  write: { status: 'idle' | 'writing' | 'success' | 'error'; outputPath?: string; message?: string };
}
export type Action =
  | { t: 'LOAD_START' } | { t: 'LOAD_OK'; viewModel: ViewModel } | { t: 'LOAD_ERR'; kind: string; message: string }
  | { t: 'SET_EDIT'; fieldKey: string; entry: EditEntry } | { t: 'CLEAR_EDIT'; fieldKey: string }
  | { t: 'PREVIEW_OK'; rows: WireChangeRow[]; violations: Violation[] } | { t: 'PREVIEW_CLOSE' }
  | { t: 'WRITE_START' } | { t: 'WRITE_OK'; outputPath: string } | { t: 'WRITE_ERR'; message: string };
```
**Pitfall 5 (verified in `patcher.ts` `ConflictingEditError`):** the `SET_EDIT` reducer path for a skill mode
toggle MUST `CLEAR_EDIT` the sibling key so `skill.<id>.level` and `skill.<id>.xp` are never both present —
else preview/write returns `kind:'conflict'`. Unit-tested in `test/ui/reducer.test.ts`.

---

### `electron/ui/state/selectors.ts` (new — pure projection)

**Analog:** `src/ipc/ipc-guards.ts` `toWireReport` (lines 147-154) — the repo's exemplar of a pure
map-and-project selector.
```ts
export function toWireReport(rows: ChangeReportRow[]): WireChangeRow[] {
  return rows.map((r) => ({ fieldKey: r.fieldKey, oldValue: ..., newValue: ..., width: r.width }));
}
```
`editsToPayload(state)`: for each `EditEntry` that is `valid` AND differs from the loaded ViewModel value,
emit `{ fieldKey, newValue }` (int64 as decimal string, D-02); `dirtyCount = editsToPayload(state).length`
drives the badge (D-07). Dirtiness is DERIVED, not stored. Unit-tested in `test/ui/reducer.test.ts`.

---

### `electron/ui/App.tsx` (new — container/orchestrator)

**Analog:** `electron/renderer.ts` lines 22-41 — the existing bridge-call orchestration pattern (try/catch
around each `window.saveEditor.*` call). App replaces the imperative version with `useReducer` + dispatch.
```ts
// renderer.ts pattern being generalized:
async function run(label, fn) { try { show(label, await fn()); } catch (err) { ...error... } }
document.getElementById('btn-load')?.addEventListener(...)  // → becomes onClick → dispatch(LOAD_START) → await window.saveEditor.load()
```
App owns the single `useReducer(appReducer, initialState)`, calls the four bridge methods, maps each
discriminated result to a dispatch, and passes `dispatch` down via one `AppContext` (RESEARCH Pattern 2 —
no external store, CLAUDE.md). Result-kind handling mirrors `main.ts` `toErrorResult` kinds.

---

### `electron/ui/components/VirtualList.tsx` (new — virtualization wrapper)

**Analog:** NONE (first use of `@tanstack/react-virtual` in the repo). Follow RESEARCH Pattern 3 verbatim:
```tsx
const rowVirtualizer = useVirtualizer({
  count: filtered.length, getScrollElement: () => parentRef.current,
  estimateSize: () => 32,          // --row-h, constant → no measureElement
  overscan: 8,
});
```
Key each row by the **stable item id** (`itemId` / `skill.id`), NOT `virtualItem.index` (Pitfall 4 — stale
values/focus jump on filter). Reset scroll to top on query change. Dynamic `transform: translateY(...)` is set
via React inline `style={{}}` (CSSOM → CSP-safe; static styling stays in `styles.css`).

---

### `electron/ui/components/SummaryBar.tsx` (new — BROWSE-01, D-06)

**Analog:** `src/view-model.ts` `Summary` (lines 60-71) — the exact shape it renders.
```ts
interface Summary { name: string; gamemode: string; totalLevel: number; gp: string; slayerCoins: string; }
```
Render `gp`/`slayerCoins` as **mono int64 strings, never coerced to Number** (D-06). name/gamemode/totalLevel
strictly read-only (header editing out of scope). GP/SC are click-to-edit inline → `validateInt64` →
`SET_EDIT` (decimal string). Render all save-derived strings as React text children (auto-escaped — never
`dangerouslySetInnerHTML`; XSS from crafted save).

---

### `electron/ui/components/BankPanel.tsx` (new — BROWSE-02/04, EDIT-02)

**Analog:** `src/view-model.ts` `BankItem` (lines 25-36) — the shape it lists/edits.
```ts
interface BankItem { itemId: string; quantity: number; isPlaceholder: boolean; isLocked: boolean; }
```
Filter (`lib/filter.ts`) → `useMemo(() => items.filter(i => matches(q, i.itemId)), [items, q])` → `VirtualList`.
Each row's quantity is an `EditableCell` → `validateInt32` → `SET_EDIT`. Keep filter text as local `useState`
(don't route keystrokes through the top reducer; RESEARCH Pattern 2).

---

### `electron/ui/components/SkillPanel.tsx` (new — BROWSE-03/05, EDIT-03, D-03)

**Analog:** `src/view-model.ts` `Skill` (lines 42-52) + `src/experience-table.ts` (D-03 live echo via `format.ts`).
```ts
interface Skill { id: string; xp: number; level: number; levelCap: number; }
```
"Set by level" (sends `skill.<id>.level` as a number) vs "Set XP" (sends `skill.<id>.xp`). Mode toggle MUST
clear the sibling accumulator key (Pitfall 5). Live level→XP echo uses `format.ts`'s reused `xpForLevel`
(display-only, never a trust boundary).

---

### `electron/ui/components/EditableCell.tsx` (new — inline input + client mirror)

**Analog:** its own `lib/validation.ts` (new). Local `useState` for in-progress text; on change → validate →
either `SET_EDIT` (valid) or show the UI-SPEC inline-error state and `CLEAR_EDIT` (invalid contributes no edit,
D-04). Edited rows get the 2px accent left-bar (UI-SPEC Color reserved-list #3).

---

### `electron/ui/components/PreviewModal.tsx` (new — SAFE-02, D-07/D-08)

**Analog:** `src/ipc/ipc-guards.ts` `WireChangeRow` (lines 59-68) + `electron/main.ts` preview handler
(lines 106-115). Renders main's authoritative `changeReport: WireChangeRow[]` (old→new, mono, int64 as string)
+ any `violations[]`. Confirm CTA `Write New Save File` → `write(edits)` → native Save-As. Copy verbatim from
UI-SPEC (`Write {n} pending change(s)?`). Source of truth is main's `preview()`, not a local diff (D-07).

---

### `electron/ui/components/Banner.tsx` (new — warnings + errors)

**Analog:** `electron/main.ts` `toErrorResult` (lines 41-68) — maps each of the 8 `kind` strings to the
UI-SPEC framed error copy (never surface a raw `kind`). Also renders the non-blocking `unknownVersion` warning
(`ViewModel.unknownVersion`) and `unresolvedFields` ambiguity (both non-blocking per UI-SPEC).

---

### `test/ui/{validation,filter,reducer,format}.test.ts` (new — 4 test files)

**Analog:** `test/experience-table.test.ts` (lines 19-32) — copy the harness exactly.
```ts
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { xpForLevel, levelForXp } from '../src/experience-table';   // → import from ../electron/ui/lib/...
```
Same `node:test` + `node:assert/strict`, no framework, no jsdom. `package.json` `test` glob
`'test/**/*.test.ts'` already includes `test/ui/`. Coverage map (RESEARCH Test Map): validation→EDIT-01/02/03
bounds; filter→BROWSE-04/05; reducer→D-02 accumulator + Pitfall 5 + dirtyCount; format→D-03 echo + int64 grouping.

---

### `electron/ui/tsconfig.json` (new, optional — config) + `package.json` (modify)

**Analog:** root `tsconfig.json` (extend it). Root has `lib:["ES2022"]`, `types:["node"]`, no `jsx`, and
`include` does NOT match `.tsx`. A scoped `electron/ui/tsconfig.json` extending root adds `"jsx":"react-jsx"`,
`"lib":["ES2022","DOM","DOM.Iterable"]`, and `@types/react`(-dom) — keeping DOM globals out of Node code
(Open Question 1). Either way, ensure `.tsx` is typechecked and add `electron/**/*.tsx` to an `include`.
`exactOptionalPropertyTypes:true` (root) may force a few explicit `| undefined` in props — minor.

**`package.json`** — add runtime deps `react@19.2.7`, `react-dom@19.2.7`, `@tanstack/react-virtual@3.14.5`
and devDeps `@types/react@19.2.17`, `@types/react-dom@19.2.3` (RESEARCH Standard Stack, legitimacy-audited).
No `test`/`build` script change needed (`build:electron` runs `scripts/build.mjs`; the glob covers `test/ui/`).

---

## No Analog Found

Files with no close match in the codebase (first React surface — use RESEARCH patterns + UI-SPEC):

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `electron/ui/components/VirtualList.tsx` | component | streaming (windowed) | No `@tanstack/react-virtual` usage exists; follow RESEARCH Pattern 3 + Pitfall 4 |
| `electron/ui/styles.css` | config (styling) | — | No stylesheet in the repo; tokens/scales come entirely from 05-UI-SPEC.md (`:root` custom props, 32px `--row-h`) |

The remaining `.tsx` components have **partial** analogs (the ViewModel *shape* they render, plus the shared
conventions above) but no JSX to copy — they are new UI markup governed by the UI-SPEC visual contract.

## Metadata

**Analog search scope:** `src/`, `src/ipc/`, `electron/`, `scripts/`, `test/` (whole non-tooling repo).
**Files scanned:** `electron/renderer.ts`, `electron/preload.ts`, `electron/main.ts`, `electron/index.html`,
`scripts/build.mjs`, `src/view-model.ts`, `src/experience-table.ts`, `src/ipc/ipc-guards.ts`,
`src/ipc/write-service.ts`, `src/patcher.ts` (bounds/errors), `test/experience-table.test.ts`,
`package.json`, `tsconfig.json`.
**Pattern extraction date:** 2026-07-04
