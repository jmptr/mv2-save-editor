# Phase 4: Electron Shell + Secure IPC + Non-Destructive Write - Research

**Researched:** 2026-07-04
**Domain:** Electron process model, secure IPC (contextBridge/contextIsolation/sandbox), non-destructive file write, minimal TS build integration into an existing CommonJS core
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01 (build/scaffold):** Add Electron plus a minimal main/preload build only. Do NOT introduce the electron-vite + Vite + React scaffold this phase. Keep the existing CommonJS + `tsx --test` setup and the headless core (Phases 1–3) undisturbed; compile main/preload with `tsc`/esbuild (researcher confirms cleanest integration). Renderer for THIS phase = minimal host (plain HTML/TS or smallest React entry) just enough to exercise load→getModel→preview→write and prove the bridge is wired and hardened. The full electron-vite + React scaffold lands in Phase 5.
- **D-02 (session model):** `load(path)` decompresses + parses once; main holds a single active session `{ path, decompressedBuffer, fieldTable, viewModel }`. `getModel` returns the offset-free `ViewModel`. `preview`/`write` re-run `patchSave` against the held (freshly-parsed) `FieldTable`. `write` re-parses the patched buffer and asserts `output.length === input.length` BEFORE Brotli-recompressing to the new file. Single active save; loading a new file replaces the session; no handle bookkeeping. Main never trusts the renderer's view of state (SC-4 — re-resolve every edit intent against its own FieldTable + re-validate before patching).
- **D-03 (output path & save dialog):** On `write`, main opens Electron `dialog.showSaveDialog`, pre-filling `<basename>-edited.sav` sibling of the source. Native dialog handles overwrite confirmation. The source file's own path is REJECTED as a target (non-destructive guarantee). Cancel = clean no-op cancelled result (no file, no error). Timestamped/auto-named output + backup-on-write deferred to v2 (OUT-01).
- **D-04 (IPC error & preview contract):** Every IPC handler catches core errors and returns a discriminated result `{ ok: true, … }` / `{ ok: false, kind, message, violations?: Violation[] }`. Validation failures surface the FULL collect-all `Violation[]`. `preview(edits)` runs full `patchSave` in memory and returns the `changeReport` with offsets STRIPPED (internal `ChangeReportRow` keeps `offset`; the IPC-facing row omits it); buffer discarded, nothing written. `write(edits)` re-runs and persists. int64 values cross the bridge as STRINGS both directions; main converts to `bigint` for `patchSave`. IPC argument hardening (SC-4): validate the shape of every incoming IPC payload at the main boundary before touching the core.

### Claude's Discretion (resolved in this research — see recommendations below)
- Main/preload build mechanism (tsc vs esbuild vs tsx) → **esbuild** (§Standard Stack, §Pattern 1)
- IPC arg validation mechanism (Zod vs hand-rolled guards) → **hand-rolled type guards** (§Pattern 3)
- Exact channel names & preload API surface → **`save:load` / `save:getModel` / `save:preview` / `save:write`; `window.saveEditor`** (§Pattern 2)
- How the renderer references the loaded session → **no session handle** (§Pattern 2, confirmed)
- Electron version & Node/sandbox interplay → **electron 43.0.0; sandbox:true + contextBridge confirmed** (§Standard Stack, §Pattern 4)

### Deferred Ideas (OUT OF SCOPE)
- Full electron-vite + Vite + React renderer scaffold with HMR (Phase 5)
- Timestamped / auto-named output files + backup-on-write (v2 OUT-01)
- Round-trip drift self-check warning on load (v2 OUT-02)
- electron-builder packaging / distributable binary (deferred)
- Multi-save / handle-based sessions (single active session is enough — D-02)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| IO-02 | User can write edits to a NEW `.sav` file (Brotli-recompressed), leaving the original untouched | The write path (§Pattern 5) chains held-session `patchSave` → re-parse + `output.length === input.length` assertion (reusing the same guarantee the codec/patcher already enforce) → `compress` (existing `src/codec.ts`) → `fs.writeFile` to a `dialog.showSaveDialog` target that is guarded against equalling the source path (D-03). IO-03's length invariant is reused as the pre-recompress gate. All fs/Brotli stays in main. |
</phase_requirements>

## Summary

Phase 4 is **orchestration + hardening**, not new format logic. The entire headless pipeline
(`decompress → parseSave → patchSave → compress`) already exists, is golden-file tested, and is
offset-safe by construction (the `ViewModel` is offset-free; int64 currencies are already strings;
the patcher already re-parses and asserts the length invariant internally). This phase wraps that
core in a hardened Electron **main** process that owns all `fs`/Brotli/offsets, and exposes a narrow
`contextBridge` IPC surface to a locked-down renderer.

The single most consequential technical fact for planning: **a preload script under `sandbox: true`
must be a pre-compiled plain-JS file** — it cannot be run through a TypeScript loader like `tsx`.
That makes a build step unavoidable for at least the preload, which settles the "tsc vs esbuild vs
tsx" question decisively: use **esbuild** to compile `main.ts` and `preload.ts` (and a tiny
`renderer.ts`) to CommonJS `.js`, bundling the core into `main.js`. This is the least-churn option —
it leaves the CommonJS core and its `tsx --test` golden-file suite completely untouched, requires no
ESM migration and no `tsc` project-references restructuring, and keeps `tsc --noEmit` as the pure
typecheck. esbuild is already the engine inside `tsx`, so it is not a new supply-chain surface class.

**Primary recommendation:** electron `43.0.0` + esbuild build (two/three entry points → `dist/`) +
`ipcMain.handle`/`ipcRenderer.invoke` over four namespaced channels (`save:load`, `save:getModel`,
`save:preview`, `save:write`) exposed as `window.saveEditor.*` via `contextBridge`. Harden the
`BrowserWindow` with `contextIsolation:true` / `nodeIntegration:false` / `sandbox:true`, validate
IPC payload SHAPE with small hand-rolled type guards (the core already owns semantic/range
validation — defense in depth), and keep the renderer a throwaway HTML page that just proves the
bridge. Do NOT add Zod, Vite, React, or electron-builder this phase.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| File open/read, Brotli decompress, parse | **Main (Node)** | — | `fs`/`zlib`/offsets must never reach the renderer (SC-1). Sandbox forbids them in preload/renderer by construction. |
| Hold active session (buffer + FieldTable + ViewModel) | **Main (Node)** | — | Buffer + offsets are the crown jewels; single in-memory session (D-02). |
| Patch, self-verify, re-parse, length invariant | **Main (Node)** | — | Reuses `patchSave`; main re-resolves every edit against its own FieldTable (SC-4). |
| Brotli recompress + write new `.sav` | **Main (Node)** | — | IO-02; native `showSaveDialog`; source-path guard (D-03). |
| Narrow IPC bridge (4 methods) | **Preload (isolated)** | — | `contextBridge.exposeInMainWorld` — the ONLY code that may touch `ipcRenderer`. No generic passthrough. |
| Render summary / trigger operations | **Renderer (sandboxed)** | — | Throwaway smoke-test UI this phase; no `fs`/Brotli/offsets, no session handle. |
| IPC arg shape validation | **Main (boundary)** | Preload (light) | SC-4 — reject malformed payloads before the core; main is the trust boundary. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **electron** | `43.0.0` | Desktop shell: hardened `BrowserWindow`, `ipcMain`/`contextBridge`, native `dialog` | Latest stable (published 2026-06-30), one of the newest of the 3 supported majors (41/42/43). Main process is real Node.js → the existing `node:zlib` Brotli + `Buffer` core runs unchanged. `[VERIFIED: npm registry]` `[CITED: electronjs.org/docs/latest/tutorial/security]` |
| **esbuild** | `0.28.1` | Compile/bundle `main.ts`, `preload.ts`, `renderer.ts` → CommonJS `.js` in `dist/` | Fast, zero-config CJS output; bundles the core into `main.js`; already the engine inside `tsx`, so no new supply-chain class. Least churn vs tsc project-refs. `[VERIFIED: npm registry]` |
| **Node `zlib` / `Buffer` / `fs`** | Electron 43 bundled Node (22.x) | Brotli + binary + file I/O, all in MAIN | Already used by `src/codec.ts` (Brotli), `src/patcher.ts` (Buffer). Stable APIs present in Electron's Node. `[VERIFIED: codebase src/codec.ts]` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **@types/node** | `^24.13.2` (already installed) | Types for `fs`/`zlib`/`Buffer`/`path` in main | Already a devDep; no change. Electron ships its OWN types (`electron` package) — no `@types/electron` needed. `[VERIFIED: codebase package.json]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| esbuild build | `tsc` project references | Emits many files, needs `outDir` + a referenced tsconfig for the core, more config churn. esbuild is one command, one `dist/`. |
| esbuild build | `tsx` to run `main.ts` directly | **Does not work for the sandboxed preload** — a sandboxed preload must be a real compiled `.js` (no TS loader). A build step is unavoidable anyway; esbuild covers all three entries consistently. |
| Hand-rolled IPC guards | **Zod** `4.4.3` | Zod is blessed in CLAUDE.md and gives declarative schemas + rich errors, but adds a runtime dep for 4 tiny payloads whose semantic/range validation the core ALREADY owns. "Lighter option for a solo tool" (CONTEXT) → hand-rolled. Zod is the documented fallback if payloads grow. |
| Plain HTML/TS renderer | Smallest React entry | React pulls a bundler/JSX toolchain the phase explicitly defers to Phase 5 (D-01). Plain HTML + one `renderer.ts` proves the bridge with zero framework. |
| Native `dialog` open/save | Renderer-supplied path string | Renderer has no `fs` and should never handle filesystem paths — main owns both dialogs (in-scope per CONTEXT domain). Strengthens the boundary. |

**Installation:**
```bash
npm install --save-dev electron@43.0.0 esbuild@^0.28.1
# Do NOT install: zod, vite, electron-vite, react, react-dom, electron-builder (deferred to Phase 5 / v2)
```

**Version verification (performed this session):**
- `npm view electron version` → `43.0.0` (published 2026-06-30). Supported majors = latest 3 (41/42/43). `[VERIFIED: npm registry]`
- `npm view esbuild version` → `0.28.1` (published 2026-06-11). `[VERIFIED: npm registry]`
- `npm view zod version` → `4.4.3` (only relevant if the Zod fallback is chosen). `[VERIFIED: npm registry]`
- Local `node --version` → `v24.18.0`; Electron 43 bundles its own Node (22.x) for the main process — the core uses only long-stable `zlib`/`Buffer` APIs present in both. `[VERIFIED: Bash node --version]`

## Package Legitimacy Audit

Ran `gsd-tools query package-legitimacy check --ecosystem npm electron esbuild zod`:

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| electron | npm | latest pub 2026-06-30 | ~4.4M/wk | github.com/electron/electron | SUS (`too-new`) | **Approved** — flag is release-cadence only; canonical package, mandated by CLAUDE.md, confirmed via electronjs.org. No postinstall in metadata. |
| esbuild | npm | latest pub 2026-06-11 | ~239M/wk | github.com/evanw/esbuild | SUS (`too-new`) | **Approved** — flag is release-cadence only; canonical package. Has `postinstall: node install.js` (downloads the platform binary — expected for esbuild; same mechanism `tsx` already relies on). See note below. |
| zod | npm | 2026-05-04 | ~213M/wk | github.com/colinhacks/zod | OK | Not installed (fallback only). |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** `electron`, `esbuild` — both flagged solely for `too-new`
(each publishes new patch releases frequently, so "latest" is always days old). Both have huge
download counts, official GitHub repos, and are named in CLAUDE.md's blessed stack. The SUS verdict
here is a false positive of the age heuristic, not a real supply-chain signal.

**esbuild postinstall note (supply-chain, ties to a prior project decision):** STATE.md records that
Plan 01-01 *deliberately did NOT approve the esbuild postinstall* (`npm allow-scripts`) — "tsx works
without it (prebuilt binary); least-privilege supply-chain stance." Installing esbuild as a DIRECT
devDep re-introduces its `postinstall: node install.js` (it downloads the `@esbuild/<platform>`
binary). The planner should decide consciously: either (a) allow the esbuild postinstall for the
build step, or (b) keep the same least-privilege stance and drive esbuild via its JS API / a package
manager that defers scripts. This is the one genuine supply-chain decision in the phase — surface it
as a `checkpoint:human-verify` before install. `[VERIFIED: npm registry + .planning/STATE.md]`

## Architecture Patterns

### System Architecture Diagram

```
  ┌──────────────────────────── RENDERER (sandbox:true, contextIsolation:true) ───────────────────────────┐
  │  index.html + renderer.js  (throwaway smoke-test UI — no fs, no Brotli, no offsets, no session handle) │
  │      │  window.saveEditor.load() / getModel() / preview(edits) / write(edits)                         │
  └──────┼─────────────────────────────────────────────────────────────────────────────────────────────┘
         │  (only the 4 exposed methods exist on window; no raw ipcRenderer)
  ┌──────▼──────────────────────── PRELOAD (isolated world, compiled preload.js) ─────────────────────────┐
  │  contextBridge.exposeInMainWorld('saveEditor', {                                                       │
  │     load:     ()      => ipcRenderer.invoke('save:load'),                                              │
  │     getModel: ()      => ipcRenderer.invoke('save:getModel'),                                          │
  │     preview:  (edits) => ipcRenderer.invoke('save:preview', edits),                                    │
  │     write:    (edits) => ipcRenderer.invoke('save:write',   edits),                                    │
  │  })                          (NO generic invoke(channel,…) passthrough)                                │
  └──────┼──────────────────────────────────────────────────────────────────────────────────────────────┘
         │  ipcRenderer.invoke  ──►  ipcMain.handle   (structured discriminated result comes back)
  ┌──────▼──────────────────────────────── MAIN (Node — owns fs / Brotli / offsets) ──────────────────────┐
  │  ipcMain.handle('save:load')    → showOpenDialog → fs.readFile → decompress → parseSave                │
  │                                   → SET activeSession { path, decompressedBuffer, fieldTable,          │
  │                                                         viewModel }  → return { ok, summary }           │
  │  ipcMain.handle('save:getModel')→ guard: session exists → return { ok, viewModel }                     │
  │  ipcMain.handle('save:preview') → guardEdits(args) → toBigIntEdits → patchSave(buffer, fieldTable)     │
  │                                   → STRIP offsets from changeReport → return { ok, changeReport }       │
  │  ipcMain.handle('save:write')   → guardEdits(args) → patchSave → re-parse + assert length invariant    │
  │                                   → showSaveDialog (default <base>-edited.sav; reject == source path)   │
  │                                   → compress → fs.writeFile(newPath) → return { ok, outputPath }        │
  │                                   (cancel → { ok:true, cancelled:true }; core error → { ok:false,… })   │
  │                                                                                                         │
  │  wraps the UNCHANGED Phases 1–3 core:  src/codec.ts · src/save-parser.ts · src/patcher.ts …            │
  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Trace of the primary use case (IO-02): renderer `write(edits)` → preload `invoke('save:write', edits)`
→ main guards the payload shape → converts int64 strings to `bigint` → `patchSave(session.buffer,
session.fieldTable, edits)` (which itself re-parses + self-verifies) → re-parse patched buffer +
assert `output.length === input.length` → `showSaveDialog` → source-path guard → `compress` →
`fs.writeFile` → `{ ok:true, outputPath }` back to the renderer. Original file bytes never touched.

### Recommended Project Structure
```
electron/
├── main.ts          # app lifecycle, BrowserWindow hardening, ipcMain.handle registration, dialogs
├── preload.ts       # contextBridge.exposeInMainWorld('saveEditor', {load,getModel,preview,write})
├── renderer.ts      # throwaway smoke-test: buttons → window.saveEditor.*, dump results to DOM
└── index.html       # minimal host page + strict CSP meta; loads renderer.js
src/
├── ipc/
│   ├── session.ts       # PURE: SessionStore (load→hold; getModel/preview/write on held session). No electron import.
│   ├── ipc-guards.ts    # PURE: isLoadOk / assertEditsPayload — SHAPE validation + int64-string→bigint. No electron.
│   └── write-service.ts # PURE: patch→re-parse→assert length; output-path guard + default-name derivation. Injected fs/dialog.
├── codec.ts         # UNCHANGED (decompress/compress/roundTrip)
├── save-parser.ts   # UNCHANGED (parseSave → {fieldTable, viewModel})
├── patcher.ts       # UNCHANGED (patchSave → {buffer, changeReport})
└── …                # rest of the core UNCHANGED
dist/                # esbuild output: main.js, preload.js, renderer.js (git-ignored)
```

**Why the `src/ipc/` split:** the pure modules (session, guards, write-service) import NONE of
electron, so they run under `tsx --test` exactly like the existing core. Only `electron/main.ts`,
`preload.ts`, `renderer.ts` touch `electron` and can't be unit-tested without a real Electron
runtime — keep those thin. This is the key to satisfying Nyquist validation without a headless
Electron harness (see §Validation Architecture).

### Pattern 1: esbuild build integrated with the existing CommonJS + tsx core
**What:** One esbuild invocation compiles all three TS entries to CommonJS `.js`, bundling the core
into `main.js`. `electron` is marked external in every entry; only `electron` is external in preload.
**When to use:** This phase (D-01 — minimal build, no Vite).
**Example:**
```jsonc
// package.json additions — CJS core + tsx tests stay exactly as they are.
{
  "main": "dist/main.js",                       // was "index.js" (non-existent); Electron entry
  "scripts": {
    "test": "tsx --test test/**/*.test.ts",     // UNCHANGED — golden-file suite untouched
    "typecheck": "tsc --noEmit",                // UNCHANGED — pure typecheck (extend include to electron/)
    "build:electron": "node scripts/build.mjs", // esbuild: 3 entries → dist/
    "start": "npm run build:electron && electron ."
  }
}
```
```js
// scripts/build.mjs — CommonJS output, core bundled into main.js
import { build } from 'esbuild';
const common = { bundle: true, platform: 'node', format: 'cjs', target: 'node22',
                 sourcemap: true, external: ['electron'], outdir: 'dist' };
await build({ ...common, entryPoints: ['electron/main.ts', 'electron/preload.ts'] });
// renderer runs in Chromium; still CJS/no-node-builtins, and it only calls window.saveEditor
await build({ ...common, platform: 'browser', entryPoints: ['electron/renderer.ts'] });
```
- Core stays CommonJS (`type: "commonjs"` unchanged); no ESM migration. `[VERIFIED: codebase package.json/tsconfig.json]`
- `tsc --noEmit` extended to typecheck `electron/**` (add to `include`); needs `"types": ["node"]` already present, plus electron's bundled types (available once `electron` is installed). `[VERIFIED: codebase tsconfig.json]`

### Pattern 2: Narrow contextBridge surface + no session handle
**What:** Expose exactly four purpose-specific methods; the renderer never sees `ipcRenderer` and
holds no session identifier — main's single active session is implicit (D-02).
**When to use:** Always for this phase.
**Example:**
```typescript
// electron/preload.ts  (compiled to preload.js; runs in the isolated world)
import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('saveEditor', {
  load:     () => ipcRenderer.invoke('save:load'),        // main opens showOpenDialog; no path from renderer
  getModel: () => ipcRenderer.invoke('save:getModel'),
  preview:  (edits: unknown) => ipcRenderer.invoke('save:preview', edits),
  write:    (edits: unknown) => ipcRenderer.invoke('save:write',   edits),
});
// Source pattern: https://www.electronjs.org/docs/latest/api/context-bridge
```
- **No generic `invoke(channel, …)`** — each method binds one fixed channel string. `[CITED: electronjs.org/docs/latest/tutorial/security — "do not expose ipcRenderer directly"]`
- **No session handle:** `load()` sets `activeSession` in main; `getModel/preview/write` operate on it. Renderer passes only `edits`. Loading a new file replaces the session (D-02). `[VERIFIED: CONTEXT.md D-02]`
- **Path lives in main only:** `load()` takes no path from the renderer — main shows `dialog.showOpenDialog`, reads the chosen file, and stores the path internally. The renderer never handles an fs path (stronger boundary; still satisfies D-02's `load(path)` where `path` is main-resolved). `[VERIFIED: CONTEXT.md domain "native file open dialogs" in-scope]`

### Pattern 3: Hand-rolled IPC payload shape guard (SC-4) + int64-string bridging
**What:** A tiny pure guard validates the SHAPE of an incoming payload at the main boundary before
the core runs; the core (`patchSave`) still owns all semantic/range validation (defense in depth).
**When to use:** `preview` and `write` handlers.
**Example:**
```typescript
// src/ipc/ipc-guards.ts  (PURE — no electron import; tsx-testable)
export interface WireEdit { fieldKey: string; newValue: string | number; } // int64 arrives as string
export function assertEditsPayload(raw: unknown): WireEdit[] {
  if (!Array.isArray(raw)) throw new IpcArgError('edits must be an array');
  return raw.map((e, i) => {
    if (typeof e !== 'object' || e === null) throw new IpcArgError(`edits[${i}] not an object`);
    const { fieldKey, newValue } = e as Record<string, unknown>;
    if (typeof fieldKey !== 'string' || fieldKey.length === 0) throw new IpcArgError(`edits[${i}].fieldKey`);
    if (typeof newValue === 'number') { if (!Number.isFinite(newValue)) throw new IpcArgError(`edits[${i}].newValue`); }
    else if (typeof newValue === 'string') { if (!/^-?\d+$/.test(newValue)) throw new IpcArgError(`edits[${i}].newValue int64 string`); }
    else throw new IpcArgError(`edits[${i}].newValue must be number or int64 string`);
    return { fieldKey, newValue };
  });
}
// Bridge int64 strings → bigint for patchSave (main decides by the FieldEntry.kind it resolves).
```
- The guard is SHAPE-only: array/object/non-empty-string/number-finite/int64-string-format. The
  core's `validatePlain` / skill validators enforce ranges, readOnly, kind — so a hand-rolled guard
  is sufficient and adds zero deps. `[VERIFIED: codebase src/patcher.ts validatePlain]`
- **int64 mapping:** main converts a `newValue` string → `BigInt` when the resolved `FieldEntry.kind === 'int64'`; on the way out, `changeReport` int64 `oldValue/newValue` (bigint) → `String(...)`. Matches the existing `Summary.gp/slayerCoins: string` convention. `[VERIFIED: codebase src/view-model.ts, src/patcher.ts]`
- Zod is the documented fallback (CLAUDE.md-blessed) if payloads grow; not warranted for 4 tiny payloads on a solo tool (CONTEXT: "pick the lighter option"). `[ASSUMED — recommendation]`

### Pattern 4: Hardened BrowserWindow (sandbox + contextIsolation + no nodeIntegration)
**What:** Every hardening flag on; preload is a compiled file; renderer loads only a local file.
**Example:**
```typescript
// electron/main.ts
const win = new BrowserWindow({
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,   // isolate preload world from page world
    nodeIntegration: false,   // no Node globals in the renderer
    sandbox: true,            // Chromium OS sandbox; preload gets only electron + a polyfilled subset
  },
});
win.loadFile(path.join(__dirname, 'index.html')); // local only; never loadURL to remote content
// Block navigation / new windows (defense in depth):
win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
```
- Since Electron 20 the renderer sandbox is default-on; setting `sandbox:true` explicitly documents intent. A **sandboxed preload still gets `contextBridge` + `ipcRenderer`** but CANNOT `require('fs')`/`require('zlib')` — which enforces the "fs/Brotli only in main" boundary by construction. `[VERIFIED: WebSearch electronjs.org security/sandbox docs]` `[CITED: electronjs.org/docs/latest/tutorial/sandbox]`
- Add a strict CSP `<meta>` to `index.html` (`default-src 'self'; script-src 'self'`) — no remote resources. `[CITED: electronjs.org/docs/latest/tutorial/security]`

### Pattern 5: Non-destructive write path (IO-02) with pre-recompress length gate
**What:** main patches the held buffer, re-parses + asserts the length invariant, then Save-As's a
new file; the source path is rejected as a target.
**Example (main-side orchestration, fs/dialog injected so the core stays pure):**
```typescript
// src/ipc/write-service.ts  (PURE — inject { showSaveDialog, writeFile }; no electron import)
export async function performWrite(session, edits, deps) {
  const { buffer } = patchSave(session.decompressedBuffer, session.fieldTable, edits); // patcher self-verifies
  const reparsed = parseSave(buffer);                                                  // D-02 "re-parse fresh"
  if (buffer.length !== session.decompressedBuffer.length)                              // IO-02/IO-03 length gate
    throw new WriteInvariantError(`length changed ${session.decompressedBuffer.length}→${buffer.length}`);
  const defaultPath = defaultOutputPath(session.path);          // "<dir>/<base>-edited.sav"
  const picked = await deps.showSaveDialog({ defaultPath });    // native dialog handles overwrite confirm
  if (picked.canceled || !picked.filePath) return { ok: true, cancelled: true };
  if (resolve(picked.filePath) === resolve(session.path))       // D-03 source-path guard
    throw new WriteInvariantError('refusing to overwrite the source file');
  await deps.writeFile(picked.filePath, compress(buffer));      // existing codec.compress → new .sav
  return { ok: true, outputPath: picked.filePath };
}
```
- `patchSave` already re-parses + whole-buffer-diffs internally (its `selfVerify`), so the write path
  adds the top-level length assertion + fresh `parseSave` per D-02, then `compress` (existing). `[VERIFIED: codebase src/patcher.ts selfVerify]`
- `compress` emits standard-parameter Brotli .NET can decode (never large-window). `[VERIFIED: codebase src/codec.ts]`

### Anti-Patterns to Avoid
- **Exposing `ipcRenderer` (or `ipcRenderer.on`) wholesale** through contextBridge — lets the page send/listen to any channel. Expose only the 4 wrapper functions. `[CITED: electronjs.org/docs/latest/tutorial/security]`
- **`nodeIntegration: true` / `contextIsolation: false` / `sandbox: false`** — CLAUDE.md's "What NOT to Use" forbids nodeIntegration in the renderer. Do all binary/Brotli/fs in main. `[VERIFIED: CLAUDE.md]`
- **Running the sandboxed preload through `tsx`/a TS loader** — sandboxed preloads must be pre-compiled `.js`. `[CITED: electronjs.org/docs/latest/tutorial/sandbox]`
- **Letting `offset` cross the bridge** — strip `offset` from the IPC-facing change-report row; the internal `ChangeReportRow` keeps it (D-04, SC-4). `[VERIFIED: CONTEXT.md D-04]`
- **Serializing int64 as a JSON number** — precision loss past 2^53. Cross as strings; `bigint` in main only. `[VERIFIED: codebase src/view-model.ts]`
- **`win.loadURL(remote)` or allowing navigation/new windows** — keep it a local file; deny window-open. `[CITED: electronjs.org/docs/latest/tutorial/security]`
- **Converting the core to ESM to satisfy the Electron build** — unnecessary; esbuild bundles the CJS core into `main.js`. `[VERIFIED: codebase — type:commonjs]`

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Native file open/save dialog | Custom path input / drag-drop file reader | Electron `dialog.showOpenDialog` / `showSaveDialog` | Native OS dialogs; handles overwrite confirmation (D-03); keeps fs paths out of the renderer. |
| Renderer↔main messaging | Custom postMessage/socket bridge | `ipcMain.handle` + `ipcRenderer.invoke` (promise-based) | Built-in request/response with structured cloning; the standard secure pattern. `[CITED: electronjs.org/docs/latest/tutorial/ipc]` |
| Secure API exposure | Attaching functions to `window` from preload directly | `contextBridge.exposeInMainWorld` | The only safe way to cross the isolated-world boundary with contextIsolation on. |
| Brotli in browser | `DecompressionStream` / a WASM brotli in the renderer | Node `zlib` in MAIN (existing `src/codec.ts`) | Browser `DecompressionStream` does NOT support Brotli; keep it in main. `[VERIFIED: CLAUDE.md]` |
| Bundling TS for Electron | Hand-written tsconfig project-refs pipeline | esbuild (one command) | Fewer moving parts; CJS output; bundles the core. |
| Range/type validation of edits | Re-validating ranges in the IPC layer | The existing `patchSave` validators | The core already collects all violations, rejects readOnly, couples skill xp/level. IPC only checks SHAPE. `[VERIFIED: codebase src/patcher.ts]` |

**Key insight:** Nearly everything this phase needs is either already in the core (decompress,
parse, patch, self-verify, length invariant, compress, offset-free ViewModel, int64-as-string) or a
first-class Electron primitive (dialogs, IPC, contextBridge, sandbox). The phase's real work is
*wiring + hardening + the source-path/length guards* — resist re-implementing anything the core or
Electron already provides.

## Runtime State Inventory

Not a rename/refactor/migration phase — this is additive (new `electron/` + `src/ipc/` modules, no
existing string/identifier is being renamed). Section omitted per template guidance. The only
existing-file edit is `package.json` (`main` field + scripts) and `tsconfig.json` `include`; the
Phases 1–3 core `src/*.ts` and its tests are untouched (D-01).

## Common Pitfalls

### Pitfall 1: Sandboxed preload can't load a TS file or use Node builtins
**What goes wrong:** Pointing `webPreferences.preload` at a `.ts`, or expecting `require('fs')` in
preload. Under `sandbox:true` the preload runs in a restricted context and must be pre-compiled JS.
**Why it happens:** Assuming preload is "just Node." It is a limited environment (electron + a
polyfilled subset of `events`/`timers`/`url`), not full Node.
**How to avoid:** Compile `preload.ts` → `dist/preload.js` with esbuild; point `preload` at the `.js`.
Keep preload's only import `{ contextBridge, ipcRenderer } from 'electron'` (external in esbuild).
**Warning signs:** "Unable to load preload script" / "require is not defined" at window creation.
`[CITED: electronjs.org/docs/latest/tutorial/sandbox]`

### Pitfall 2: `__dirname`/path resolution differs after bundling
**What goes wrong:** `loadFile`/`preload` paths break because `__dirname` points at `dist/` not the
source tree after esbuild output.
**Why it happens:** Source-relative paths assumed at runtime.
**How to avoid:** Resolve `index.html`/`preload.js` relative to the compiled `main.js` location
(`path.join(__dirname, 'preload.js')`) and emit all three into the same `dist/`.
**Warning signs:** Blank window; preload silently not applied (bridge undefined on `window`). `[ASSUMED]`

### Pitfall 3: int64 boundary asymmetry
**What goes wrong:** Sending a `bigint` across IPC (not structured-clone-safe in some paths) or
receiving a JSON number for currency and losing precision.
**Why it happens:** Forgetting the string convention on one direction.
**How to avoid:** Strings BOTH ways at the bridge; convert to `bigint` only inside main for
`patchSave`; `String(bigint)` on the way out. Guard rejects non-`/^-?\d+$/` currency strings.
**Warning signs:** `Do not know how to serialize a BigInt`, or GP values off past 2^53. `[VERIFIED: codebase src/view-model.ts / src/patcher.ts]`

### Pitfall 4: Offset leaks through the change report
**What goes wrong:** `preview`/`write` return the internal `ChangeReportRow` verbatim — which
carries `offset` — violating SC-4.
**Why it happens:** The internal and IPC-facing shapes look similar.
**How to avoid:** Map to a distinct IPC row type that omits `offset` (`{fieldKey, oldValue, newValue,
width}`). A test asserting the IPC row has no `offset` key mirrors the core's `assertNoOffsets` guard.
**Warning signs:** `offset` present in the renderer's received report. `[VERIFIED: CONTEXT.md D-04, codebase test/helpers/no-offset-scan.ts]`

### Pitfall 5: esbuild postinstall vs the project's least-privilege stance
**What goes wrong:** Installing esbuild triggers `node install.js` (binary download), which the
project previously chose NOT to auto-approve (STATE.md, Plan 01-01).
**Why it happens:** esbuild ships a postinstall to fetch its platform binary.
**How to avoid:** Decide explicitly — allow the script for the build tool, or run esbuild without the
postinstall (JS API from an already-present copy / a scripts-deferred install). Gate behind a
`checkpoint:human-verify`.
**Warning signs:** `esbuild: command not found` / "you installed esbuild ... postinstall did not run".
`[VERIFIED: .planning/STATE.md]`

### Pitfall 6: Recompressed `.sav` differs byte-wise from the original (expected, not a bug)
**What goes wrong:** A test or check compares the OUTPUT `.sav` bytes to the source `.sav` bytes and
"fails."
**Why it happens:** Brotli isn't canonical across implementations; the codec guarantees
DECOMPRESSED-buffer identity + length, never compressed-byte identity.
**How to avoid:** Assert the invariant on the decompressed buffer (`output.length === input.length`),
not the compressed file. The write path recompresses; the source stays byte-unchanged on disk.
**Warning signs:** False "corruption" alarms comparing compressed files. `[VERIFIED: codebase src/codec.ts header comment]`

## Code Examples

### Registering the four handlers (main)
```typescript
// electron/main.ts (excerpt) — thin electron wiring over the pure SessionStore + guards
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
let session: ActiveSession | null = null;

ipcMain.handle('save:load', async () => {
  const pick = await dialog.showOpenDialog({ filters: [{ name: 'Save', extensions: ['sav'] }], properties: ['openFile'] });
  if (pick.canceled || !pick.filePaths[0]) return { ok: true, cancelled: true };
  try {
    const path = pick.filePaths[0];
    const decompressedBuffer = decompress(await readFile(path));
    const { fieldTable, viewModel } = parseSave(decompressedBuffer);
    session = { path, decompressedBuffer, fieldTable, viewModel };
    return { ok: true, summary: viewModel.summary };
  } catch (e) { return toErrorResult(e); }        // { ok:false, kind, message, violations? }
});

ipcMain.handle('save:getModel', () =>
  session ? { ok: true, viewModel: session.viewModel } : { ok: false, kind: 'no-session', message: 'load a save first' });

ipcMain.handle('save:preview', (_e, raw) => {
  if (!session) return { ok: false, kind: 'no-session', message: 'load a save first' };
  try {
    const edits = toBigIntEdits(assertEditsPayload(raw), session.fieldTable);   // SHAPE guard + int64→bigint
    const { changeReport } = patchSave(session.decompressedBuffer, session.fieldTable, edits);
    return { ok: true, changeReport: toWireReport(changeReport) };              // strips offset; int64→string
  } catch (e) { return toErrorResult(e); }
});
// 'save:write' → same guard + patch, then write-service.performWrite (Pattern 5).
// Source pattern: https://www.electronjs.org/docs/latest/tutorial/ipc (invoke/handle)
```

### Mapping core errors → discriminated result (D-04)
```typescript
function toErrorResult(e: unknown) {
  if (e instanceof ValidationError)   return { ok: false, kind: 'validation', message: e.message, violations: e.violations };
  if (e instanceof ReadOnlyFieldError)return { ok: false, kind: 'readonly',   message: e.message };
  if (e instanceof UnknownFieldError) return { ok: false, kind: 'unknown-field', message: e.message };
  if (e instanceof ConflictingEditError) return { ok: false, kind: 'conflict', message: e.message };
  if (e instanceof IpcArgError)       return { ok: false, kind: 'bad-args',   message: e.message };
  return { ok: false, kind: 'internal', message: e instanceof Error ? e.message : String(e) };
}
// ValidationError.violations is the exact Violation[] D-04 forwards.  [VERIFIED: codebase src/patcher.ts]
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `nodeIntegration:true` in renderer | `contextIsolation:true` + `contextBridge` + sandbox | Electron 5→12→20 | Renderer can't touch Node; expose narrow APIs only. This phase adopts the current model. |
| Renderer sandbox opt-in | Sandbox default-on for renderers | Electron 20 | `sandbox:true` is explicit-but-default; preloads are restricted → forces fs/Brotli into main (desired). |
| `ipcRenderer.send`/`.on` request-response | `ipcRenderer.invoke`/`ipcMain.handle` | Electron 7+ | Promise-based two-way calls; the pattern for all 4 methods. |

**Deprecated/outdated:**
- `remote` module: removed; never use. Use explicit IPC. `[CITED: electronjs.org/docs/latest/tutorial/ipc]`
- `enableRemoteModule`, `worldSafeExecuteJavaScript` (now default): obsolete flags. `[ASSUMED]`

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Hand-rolled guards are preferable to Zod for these 4 small payloads | Standard Stack / Pattern 3 | Low — if payloads grow, swap to Zod (CLAUDE.md-blessed); the guard module is the only change. |
| A2 | `load()` should take no renderer-supplied path (main owns showOpenDialog) rather than accept a path string | Pattern 2 | Low — either satisfies D-02; the no-path variant is a stronger boundary. Planner may confirm the exact `load` signature. |
| A3 | `main` field flip to `dist/main.js` + a `build:electron`/`start` script is the cleanest launch for a CJS project | Pattern 1 | Low — standard Electron entry; no existing consumer of the old `index.js`. |
| A4 | esbuild (vs tsc project-refs) is the least-churn build; core stays CJS | Summary / Pattern 1 | Medium — if the team prefers `tsc`, more config but same outcome; sandbox-preload-must-be-compiled still holds either way. |
| A5 | Electron 43 bundles Node 22.x and the core's zlib/Buffer APIs are present there | Standard Stack | Low — those APIs are long-stable across Node 18–24. |
| A6 | Splitting pure `src/ipc/*` from thin `electron/*` enables tsx unit tests without a headless-Electron harness | Structure / Validation | Low — standard testability split; the electron wiring is smoke-tested in UAT. |

## Open Questions (RESOLVED)

All three recommendations below were incorporated into the phase plans during planning; each is marked `RESOLVED:` with the plan that carries it.

1. **esbuild postinstall approval vs least-privilege stance (STATE.md).**
   - What we know: the project previously declined the esbuild postinstall; esbuild needs its platform binary to run.
   - What's unclear: whether to allow the script now that a real build step exists.
   - Recommendation: `checkpoint:human-verify` before install; if declined, drive esbuild via an already-present binary / scripts-deferred install, or reconsider `tsc --outDir` (no postinstall) as the build.
   - RESOLVED: incorporated into **04-01** as a `checkpoint:human-verify` before the esbuild install (Option A allow-postinstall / Option B `tsc --outDir` fallback recorded in 04-01-SUMMARY and honored by 04-05 Task 2).

2. **Exact `load` signature — path-less (main dialog) vs `load(path)`.**
   - What we know: D-02 says `load(path)`; the renderer has no fs and shouldn't handle paths.
   - What's unclear: whether planning wants the literal `load(path)` (path resolved by a main menu) or the path-less `load()` recommended here.
   - Recommendation: path-less `load()` (main owns showOpenDialog); revisit only if a menu-driven open is wanted.
   - RESOLVED: incorporated into **04-04** — the preload exposes path-less `load: () => ipcRenderer.invoke('save:load')` and main owns `showOpenDialog` (04-05 `save:load` handler).

3. **Does `getModel` also expose `entityIds`/`bankItems`/`skills`, or just `summary` this phase?**
   - What we know: the ViewModel is fully offset-free and IPC-safe already.
   - What's unclear: how much the throwaway renderer needs to display to "prove the bridge."
   - Recommendation: return the whole `viewModel` from `getModel` (it's already safe); the smoke-test renders `summary` + counts. The real browse UI is Phase 5.
   - RESOLVED: incorporated into **04-03** (`SessionStore.getModel()` returns the whole held `viewModel`) and surfaced via **04-05** (`save:getModel` handler returns that viewModel).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js (host, for build + tests) | esbuild build, tsx tests | ✓ | v24.18.0 | — |
| npm | install electron/esbuild | ✓ | (bundled with Node 24) | — |
| electron (to be installed) | app shell | ✗ (not yet) | target 43.0.0 | none — required; `npm install` step |
| esbuild (to be installed) | main/preload/renderer build | ✗ (not yet) | target 0.28.1 | `tsc --outDir dist` (no postinstall) if esbuild script is declined |
| Display / GUI session | launching the Electron window (UAT smoke test) | (WSL2 — needs an X server / WSLg) | — | Headless: unit-test the pure `src/ipc/*` modules; run the window manually where a display exists |

**Missing dependencies with no fallback:** `electron` (must be installed to build/run the shell).
**Missing dependencies with fallback:** `esbuild` → `tsc --outDir` (avoids the postinstall);
GUI display for launch → the pure IPC/session/write logic is unit-tested headlessly, and the window
is smoke-tested manually. Environment note: this is WSL2 (`Linux …-microsoft-standard-WSL2`) — actually
launching the BrowserWindow needs WSLg or an X server; the planner should treat the *visual* smoke
test as a manual step and keep automated coverage on the pure modules.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` runner via `tsx` (`tsx --test`) + `c8` coverage; assertions with `node:assert/strict` |
| Config file | none — `tsconfig.json` only; test glob in `package.json` (`test/**/*.test.ts`) |
| Quick run command | `npx tsx --test test/ipc/*.test.ts` (new pure-module tests only) |
| Full suite command | `npm test` (`tsx --test test/**/*.test.ts` — includes the untouched golden-file core) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| IO-02 | Write produces a NEW `.sav`; source bytes unchanged; length invariant asserted pre-recompress | unit (injected fs/dialog) | `npx tsx --test test/ipc/write-service.test.ts` | ❌ Wave 0 |
| SC-4 | IPC arg guard rejects malformed edits (non-array, bad key, bad int64 string, NaN) | unit | `npx tsx --test test/ipc/ipc-guards.test.ts` | ❌ Wave 0 |
| SC-4 | Change report crossing the bridge carries NO `offset` key | unit | `npx tsx --test test/ipc/wire-shape.test.ts` (reuse `assertNoOffsets`) | ❌ Wave 0 |
| SC-2/D-02 | Session: load holds one session; getModel/preview/write operate on held FieldTable; new load replaces | unit | `npx tsx --test test/ipc/session.test.ts` | ❌ Wave 0 |
| D-03 | Output-path guard rejects the source path; default name = `<base>-edited.sav`; cancel = no-op | unit | `npx tsx --test test/ipc/write-service.test.ts` | ❌ Wave 0 |
| SC-1 (hardening) | `webPreferences` flags contextIsolation/nodeIntegration:false/sandbox present | manual/UAT | launch app; DevTools: `window.saveEditor` exists, `window.require` undefined | ❌ manual |
| — | int64 round-trips as string across the guard/report boundary | unit | `npx tsx --test test/ipc/ipc-guards.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx tsx --test test/ipc/*.test.ts` (fast; pure modules only)
- **Per wave merge:** `npm test` (full suite — proves the Phases 1–3 golden-file tests still pass unchanged)
- **Phase gate:** full suite green + manual launch smoke test (window opens; `window.saveEditor` bridge present; `window.require`/`fs` absent) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/ipc/session.test.ts` — covers D-02 (single active session semantics)
- [ ] `test/ipc/ipc-guards.test.ts` — covers SC-4 (shape rejection) + int64-string bridging
- [ ] `test/ipc/write-service.test.ts` — covers IO-02 + D-03 (length gate, source-path guard, default name, cancel)
- [ ] `test/ipc/wire-shape.test.ts` — covers SC-4 offset-stripping (reuse `test/helpers/no-offset-scan.ts`)
- [ ] Framework: none to install (tsx/c8 already present); add `electron` + `esbuild` devDeps
- [ ] Note: `electron/main.ts` / `preload.ts` / `renderer.ts` are NOT unit-tested (need a real Electron runtime) — keep them thin; verify by manual UAT.

## Security Domain

`security_enforcement: true`, ASVS level 1 — section included.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V1 Architecture | yes | Trust boundary = the IPC layer; renderer is untrusted-privilege; main is sole owner of fs/Brotli/offsets. |
| V2 Authentication | no | Local single-user tool; no accounts. |
| V3 Session Management | no (auth sense) | In-memory app session only (D-02), not a security session. |
| V4 Access Control | partial | Renderer may invoke ONLY the 4 exposed channels (no generic passthrough); main gates every call. |
| V5 Input Validation | yes | IPC arg shape guard (hand-rolled) + core range/type validation (`patchSave`); reject-don't-clamp. |
| V6 Cryptography | no | Format is Brotli-compressed, not encrypted; nothing to defeat (REQUIREMENTS Out of Scope). |
| V12 File Handling | yes | Native dialogs; source-path guard (never overwrite original); decompression-bomb cap already in `codec` (`MAX_DECOMPRESSED_BYTES`). |
| V14 Configuration | yes | `contextIsolation:true`/`nodeIntegration:false`/`sandbox:true`; strict CSP; local `loadFile` only; deny navigation/new-windows; no `remote` module. |

### Known Threat Patterns for Electron + local-file editor

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Renderer escapes to Node (RCE) | Elevation of Privilege | `nodeIntegration:false` + `contextIsolation:true` + `sandbox:true`; narrow contextBridge; no `ipcRenderer` exposure. |
| Malicious/malformed IPC payload | Tampering | Hand-rolled shape guard at main boundary + core re-validates against main's own FieldTable (SC-4). |
| Offsets / raw buffer leak to renderer | Information Disclosure | Buffers never cross; ViewModel offset-free; change-report `offset` stripped at the bridge. |
| Overwriting / corrupting the original save | Tampering / Repudiation | Write to a NEW path; reject source path as target (D-03); patcher self-verify + length invariant. |
| Decompression bomb (crafted `.sav`) | Denial of Service | `decompress` enforces `MAX_DECOMPRESSED_BYTES` (256 MiB) — already in `src/codec.ts`. |
| Large-window Brotli that .NET can't read | Tampering (corrupt output) | `compress` rejects `BROTLI_PARAM_LARGE_WINDOW` — already in `src/codec.ts`. |
| Remote content / navigation hijack | Tampering / Spoofing | `loadFile` local only; strict CSP; `setWindowOpenHandler(() => deny)`; block `will-navigate`. |

## Sources

### Primary (HIGH confidence)
- Codebase: `src/codec.ts`, `src/save-parser.ts`, `src/patcher.ts`, `src/field-table.ts`, `src/view-model.ts`, `package.json`, `tsconfig.json` — exact signatures the IPC handlers call; module system (CommonJS + tsx); existing invariants (length gate, offset-free ViewModel, int64-as-string, bomb cap).
- npm registry (this session): `electron@43.0.0`, `esbuild@0.28.1`, `zod@4.4.3`; `node v24.18.0`; electron dist-tags (supported majors 41/42/43).
- electronjs.org official docs — Security, Context Isolation, Process Sandboxing, contextBridge, IPC (invoke/handle).

### Secondary (MEDIUM confidence)
- WebSearch (electronjs.org security/sandbox pages) confirming `sandbox:true` + `contextBridge` + `ipcRenderer.invoke` is the current safe pattern and preload restrictions under sandbox.

### Tertiary (LOW confidence)
- `.planning/STATE.md` prior-decision note on the esbuild postinstall (project least-privilege stance) — internal, high-trust but project-specific.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified on npm; Electron mandated by CLAUDE.md/ROADMAP; esbuild is the least-churn build and already the tsx engine.
- Architecture: HIGH — the boundary, session model, and write path are grounded in existing code + locked CONTEXT decisions; the sandboxed-preload-must-be-compiled fact settles the build question.
- Pitfalls: HIGH — each is tied to a concrete codebase invariant, an official Electron doc, or a recorded project decision.
- Security: HIGH — controls map directly to existing codec guards + standard Electron hardening.

**Research date:** 2026-07-04
**Valid until:** 2026-08-03 (30 days — Electron patches frequently; re-confirm the exact 43.x patch at install, but the 43 major and the hardening model are stable).
</content>
</invoke>
