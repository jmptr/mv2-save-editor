# Phase 4: Electron Shell + Secure IPC + Non-Destructive Write - Pattern Map

**Mapped:** 2026-07-04
**Files analyzed:** 12 (9 new source/test + 3 modified config)
**Analogs found:** 8 / 9 (in-repo); 4 files are net-new categories (Electron wiring) with no in-repo analog — patterns come from RESEARCH.md

## Orientation

This phase is **orchestration + hardening**, not new format logic. The headless core
(`src/codec.ts`, `src/save-parser.ts`, `src/patcher.ts`, `src/view-model.ts`, `src/field-table.ts`)
is complete, golden-file tested, and UNCHANGED. New work splits into two groups:

1. **Pure `src/ipc/*` modules** (session, guards, write-service) — import NO electron, run under
   `tsx --test` exactly like the existing core. **These have strong in-repo analogs** and are the
   real testable surface.
2. **Thin `electron/*` wiring** (main, preload, renderer, index.html) + `scripts/build.mjs` — touch
   the `electron` package / build tooling. **No in-repo analog exists** (first Electron code in the
   repo); copy structure from RESEARCH.md §Architecture Patterns / §Code Examples.

The critical rule the planner must carry into every source file: **offsets live ONLY in
`FieldTable` and internal `ChangeReportRow`** — everything crossing the IPC bridge is offset-free,
and int64 crosses as strings.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/ipc/session.ts` | store (in-memory session state) | request-response / state-hold | `src/save-parser.ts` (orchestrator over core) | role-match |
| `src/ipc/ipc-guards.ts` | utility (shape validation + int64 bridging) | transform / validation | `src/patcher.ts` `validatePlain` + error classes | role-match |
| `src/ipc/write-service.ts` | service (patch→verify→write) | file-I/O | `src/codec.ts` `roundTrip` (invariant-gated pipeline) | role-match |
| `test/ipc/session.test.ts` | test | — | `test/codec.test.ts` | exact |
| `test/ipc/ipc-guards.test.ts` | test | — | `test/patcher.test.ts` | exact |
| `test/ipc/write-service.test.ts` | test | — | `test/codec.test.ts` | exact |
| `test/ipc/wire-shape.test.ts` | test | — | `test/helpers/no-offset-scan.ts` (reused directly) | exact |
| `electron/main.ts` | controller (lifecycle + IPC handlers + dialogs) | event-driven / request-response | none (first Electron file) | no-analog → RESEARCH |
| `electron/preload.ts` | provider (contextBridge surface) | request-response | none | no-analog → RESEARCH |
| `electron/renderer.ts` | renderer host (smoke-test) | request-response | none | no-analog → RESEARCH |
| `electron/index.html` | config (host page + CSP) | — | none | no-analog → RESEARCH |
| `scripts/build.mjs` | config (esbuild build) | batch | none | no-analog → RESEARCH |
| `package.json` (modify) | config | — | existing `package.json` | exact |
| `tsconfig.json` (modify) | config | — | existing `tsconfig.json` | exact |

## Pattern Assignments

### `src/ipc/session.ts` (store, state-hold)

**Analog:** `src/save-parser.ts` — the existing orchestrator that composes core functions and
returns `{ fieldTable, viewModel }`. Session holds exactly that result plus the source path/buffer.

**Return-shape pattern to reuse** (`src/save-parser.ts` lines 69-74):
```typescript
export interface ParsedSave {
  /** The sole home of byte offsets (SC-4 boundary). Phase 3 reads this. */
  fieldTable: FieldTable;
  /** The offset-free UI projection (SC-4 by construction). Phase 5 reads this. */
  viewModel: ViewModel;
}
```
The `ActiveSession` type is this shape plus `{ path: string; decompressedBuffer: Buffer }`.
`load` calls `decompress` (`src/codec.ts`) then `parseSave` (`src/save-parser.ts` line 147:
`export function parseSave(buffer: Buffer): ParsedSave`) and stores the result. `getModel` returns
`session.viewModel` verbatim (already offset-free — see Shared Pattern: Offset-Free Boundary).
`preview`/`write` read `session.fieldTable` + `session.decompressedBuffer` and call `patchSave`.

**Purity constraint:** import ONLY from `../codec`, `../save-parser`, `../patcher` — NEVER
`electron`. This is what keeps it `tsx --test`-able (mirrors how every current `src/*.ts` imports
only siblings + `node:` builtins).

---

### `src/ipc/ipc-guards.ts` (utility, transform/validation)

**Analog:** `src/patcher.ts` — both its `validatePlain` (returns a reason string, does not clamp)
and its typed error hierarchy. The guard is SHAPE-only; `patchSave` still owns range/kind/readOnly
validation (defense in depth).

**Edit shape the core expects** (`src/patcher.ts` lines 42-47) — the guard's OUTPUT must produce this:
```typescript
export interface Edit {
  /** The FieldTable key to write (e.g. `wallet.GoldPieces`, `skill.<id>.level`). */
  fieldKey: string;
  /** The new value. `bigint` for int64 currency; `number` for int32/double. */
  newValue: bigint | number;
}
```
The wire form differs: int64 arrives as a **string** (`WireEdit { fieldKey: string; newValue: string | number }`),
and the guard converts a numeric-string → `bigint` only when the resolved `FieldEntry.kind === 'int64'`.

**Error-class pattern to copy** (`src/patcher.ts` lines 90-96 — `PatchError` base; name-setting ctor):
```typescript
export class PatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PatchError';
  }
}
```
Add a sibling `IpcArgError extends Error` (same `this.name = 'IpcArgError'` convention) thrown on
malformed payloads. RESEARCH §Pattern 3 gives the concrete `assertEditsPayload` body: reject
non-array, non-object element, empty/non-string `fieldKey`, non-finite number, and int64 string not
matching `/^-?\d+$/`.

**int64-as-string convention already established** (`src/view-model.ts` lines 60-71): `Summary.gp`
and `Summary.slayerCoins` are `string`. The guard's inbound conversion and the change-report's
outbound `String(bigint)` mirror this exact convention — do not invent a new one.

---

### `src/ipc/write-service.ts` (service, file-I/O)

**Analog:** `src/codec.ts` `roundTrip` (lines 117-123) — an invariant-gated pipeline that composes
core functions and asserts a length/identity invariant before returning. The write path is the same
shape: patch → re-parse → assert length → compress → write.

**Invariant-gate pattern to copy** (`src/codec.ts` lines 117-123):
```typescript
export function roundTrip(decompressed: Buffer): Buffer {
  const recompressed = compress(decompressed);
  const reDecompressed = decompress(recompressed);
  equal(reDecompressed.length, decompressed.length, 'length invariant violated');
  deepStrictEqual(reDecompressed, decompressed, 'round-trip not byte-identical');
  return recompressed;
}
```
`performWrite` applies the SAME `output.length === input.length` gate (D-02 / IO-02 / IO-03) BEFORE
`compress`. RESEARCH §Pattern 5 gives the full body: `patchSave` (self-verifies internally) →
`parseSave(buffer)` (re-parse fresh, D-02) → length assertion → `defaultOutputPath` (`<base>-edited.sav`)
→ injected `showSaveDialog` → source-path guard (`resolve(picked) === resolve(session.path)` rejects)
→ injected `writeFile(path, compress(buffer))`.

**Dependency-injection for testability:** `fs.writeFile` + `dialog.showSaveDialog` are INJECTED
(`deps` param), so the module imports no `electron` and is `tsx --test`-able with fakes. `compress`
comes from `../codec` (line 86: `export function compress(decompressed: Buffer, opts?): Buffer`).

**Note on the length gate source:** `patchSave` already guarantees same-length output (`src/patcher.ts`
`selfVerify` at line 265 + `PatchResult.buffer` "same length as the input — SC-1", lines 70-75). The
write-service adds the top-level assertion as the explicit pre-recompress gate per D-02 — belt-and-suspenders.

---

### `test/ipc/*.test.ts` (tests)

**Analog:** `test/codec.test.ts` and `test/patcher.test.ts` — the established test style.

**Structure to copy** (`test/codec.test.ts` lines 17-27, 41-51):
```typescript
import { describe, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { compress, decompress, roundTrip } from '../src/codec';

describe('IO-03 SC-1: real fixture round-trips decompressed-buffer-identical', () => {
  test('decompress → compress → decompress yields a byte-identical decompressed buffer', () => {
    // arrange / act / assert with assert.deepStrictEqual / assert.throws
  });
});
```
- Runner: `node:test` via `tsx` (`describe`/`test`/`mock` from `node:test`, `assert from 'node:assert/strict'`).
- **Requirement-tagged describe titles** (e.g. `'IO-03 SC-1: …'`, `'SC-4: …'`) — every existing test
  file leads with the requirement ID it proves; new IPC tests do the same (IO-02, SC-4, D-02, D-03).
- **Fixture access** — reuse `test/helpers/fixture.ts` `loadFixtureBuffer()` (lines 28-30) for any
  test needing a real parsed save (session/write-service). Do NOT re-decompress inline.
- `test/ipc/wire-shape.test.ts` **reuses `test/helpers/no-offset-scan.ts` `assertNoOffsets` directly**
  — call it on the IPC-facing change report to prove no `offset` key crosses the bridge (SC-4).

---

### `electron/main.ts`, `preload.ts`, `renderer.ts`, `index.html` (no in-repo analog)

**No analog** — first Electron code in the repo. The planner should copy the concrete skeletons from
RESEARCH.md, which are already tailored to this codebase:
- `main.ts` handler registration + error mapping: RESEARCH §Code Examples (lines 414-458) — the four
  `ipcMain.handle` bodies and `toErrorResult` that maps each `PatchError` subclass → discriminated result.
- `preload.ts` narrow bridge: RESEARCH §Pattern 2 (lines 237-250) — `contextBridge.exposeInMainWorld('saveEditor', {load,getModel,preview,write})`, NO generic `invoke` passthrough.
- `main.ts` hardening: RESEARCH §Pattern 4 (lines 283-298) — `contextIsolation:true` / `nodeIntegration:false` / `sandbox:true` / `setWindowOpenHandler(() => deny)` / `loadFile` only.
- `index.html`: strict CSP `<meta>` (`default-src 'self'; script-src 'self'`), loads `renderer.js`.
- **Keep these THIN** — all logic lives in the pure `src/ipc/*` modules; `electron/*` is wiring only
  (it cannot be unit-tested without a real Electron runtime; verified by manual UAT — RESEARCH
  §Validation Architecture / Wave 0 Gaps).

**Error-mapping table the main handlers depend on** — every `PatchError` subclass already carries
structured data. `toErrorResult` (RESEARCH lines 449-456) maps them by `instanceof`:

| Core error (`src/patcher.ts`) | Line | IPC `kind` | Extra payload |
|-------------------------------|------|-----------|---------------|
| `ValidationError` | 102-116 | `'validation'` | `violations: Violation[]` (line 78-83) |
| `ReadOnlyFieldError` | 122-135 | `'readonly'` | — |
| `UnknownFieldError` | 140-150 | `'unknown-field'` | — |
| `ConflictingEditError` | 157-170 | `'conflict'` | — |
| `UnintendedChangeError` | 178-184 | `'internal'` | — |
| `IpcArgError` (new, `src/ipc/ipc-guards.ts`) | — | `'bad-args'` | — |

---

### `scripts/build.mjs` (no in-repo analog)

**No analog** — no `scripts/` dir exists yet. Copy from RESEARCH §Pattern 1 (lines 221-228): one
esbuild invocation, `platform:'node'`, `format:'cjs'`, `target:'node22'`, `external:['electron']`,
core bundled into `main.js`; renderer built with `platform:'browser'`. NOTE the open supply-chain
decision (esbuild postinstall vs least-privilege stance — RESEARCH Pitfall 5 / Open Question 1):
this needs a `checkpoint:human-verify` before install; fallback is `tsc --outDir dist`.

---

### `package.json` / `tsconfig.json` (modify — analog is the file itself)

- `package.json` (current lines 15-20): change `"main": "index.js"` → `"main": "dist/main.js"`; add
  `build:electron` + `start` scripts; **leave `test` and `typecheck` UNCHANGED** (D-01 — golden-file
  suite untouched). Add `electron@43.0.0` + `esbuild@^0.28.1` to `devDependencies`.
- `tsconfig.json` (current line 17): extend `include` to add `"electron/**/*.ts"` so `tsc --noEmit`
  typechecks the new wiring. Keep `"module": "commonjs"` / `"type": "commonjs"` — NO ESM migration.

## Shared Patterns

### Offset-Free Boundary (SC-4)
**Source:** `src/view-model.ts` (the whole type is offset-free by construction, lines 108-128) +
`test/helpers/no-offset-scan.ts` `assertNoOffsets` (lines 28-51).
**Apply to:** `session.ts` (returns `viewModel` verbatim — safe), `write-service.ts` / `main.ts`
preview handler (MUST strip `offset` from `ChangeReportRow` before it crosses the bridge), and
`test/ipc/wire-shape.test.ts` (asserts via `assertNoOffsets`).
The internal `ChangeReportRow` KEEPS `offset` (`src/patcher.ts` lines 53-64, `offset: number`); the
IPC-facing row omits it (`{ fieldKey, oldValue, newValue, width }`).
```typescript
// src/patcher.ts lines 60-63 — the offset that must NOT cross the bridge:
  /** The byte offset written (from the FieldEntry — SC-4). */
  offset: number;
  /** The byte width written (int32=4, int64=8, double=8). */
  width: number;
```

### int64-as-String at the Bridge
**Source:** `src/view-model.ts` lines 67-70 (`gp`/`slayerCoins: string`); `src/patcher.ts` lines
44-46 (`newValue: bigint | number` internally).
**Apply to:** `ipc-guards.ts` (inbound string → `bigint`), `write-service.ts`/`main.ts` preview
(outbound `bigint` → `String()`). NEVER serialize a `bigint` across IPC; NEVER use a JSON number for
currency (precision loss past 2^53).

### Fail-Loud, Atomic, Non-Destructive
**Source:** `src/codec.ts` `roundTrip` (asserts, throws on violation, lines 117-123); `src/patcher.ts`
`ValidationError` collects ALL violations and writes nothing (lines 98-116).
**Apply to:** all `src/ipc/*` modules and `main.ts` handlers — surface failures as structured
`{ ok:false, kind, message, violations? }` results, never a partial write. The write path writes to
a NEW file only (IO-02); the source path is rejected as a target (D-03).

### Typed Error Class Convention
**Source:** `src/patcher.ts` `PatchError` base (lines 90-96) — `extends Error`, `super(message)`,
`this.name = '<ClassName>'`, `/* c8 ignore next */` on the closing brace.
**Apply to:** the new `IpcArgError` in `ipc-guards.ts` and any `WriteInvariantError` in
`write-service.ts`.

### Module Purity (tsx-testable core)
**Source:** every current `src/*.ts` imports only siblings + `node:` builtins (e.g. `src/codec.ts`
line 23-29 imports `node:zlib` + `node:assert/strict`).
**Apply to:** `src/ipc/session.ts`, `ipc-guards.ts`, `write-service.ts` — import NO `electron`.
Inject `fs`/`dialog` into `write-service`. This is the single constraint that keeps the phase's real
logic under `tsx --test` without a headless-Electron harness.

## No Analog Found

| File | Role | Data Flow | Reason | Pattern Source |
|------|------|-----------|--------|----------------|
| `electron/main.ts` | controller | event-driven | First Electron file in repo | RESEARCH §Code Examples + §Pattern 4 |
| `electron/preload.ts` | provider | request-response | First contextBridge in repo | RESEARCH §Pattern 2 |
| `electron/renderer.ts` | renderer | request-response | First renderer in repo | RESEARCH §Architecture (throwaway smoke-test) |
| `electron/index.html` | config | — | First HTML host in repo | RESEARCH §Pattern 4 (CSP meta) |
| `scripts/build.mjs` | config | batch | No `scripts/` dir yet | RESEARCH §Pattern 1 |

These are thin wiring / tooling — the *logic* they invoke all has in-repo analogs (above), so "no
analog" here is expected and low-risk: the planner copies the Electron/esbuild boilerplate from
RESEARCH and delegates all real behavior to the pure `src/ipc/*` modules.

## Metadata

**Analog search scope:** `src/` (13 modules), `test/` (11 test files + `helpers/` + `fixtures/`),
root config (`package.json`, `tsconfig.json`).
**Files scanned:** `src/codec.ts`, `src/save-parser.ts`, `src/patcher.ts`, `src/view-model.ts`,
`src/field-table.ts` (headers), `test/codec.test.ts`, `test/helpers/no-offset-scan.ts`,
`test/helpers/fixture.ts`, `package.json`, `tsconfig.json`.
**Pattern extraction date:** 2026-07-04
</content>
</invoke>
