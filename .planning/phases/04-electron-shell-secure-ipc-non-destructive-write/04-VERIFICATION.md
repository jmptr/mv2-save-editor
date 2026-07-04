---
phase: 04-electron-shell-secure-ipc-non-destructive-write
verified: 2026-07-04T17:46:24Z
status: passed
score: 4/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  # none — initial verification
---

# Phase 4: Electron Shell + Secure IPC + Non-Destructive Write — Verification Report

**Phase Goal:** A secure Electron main process hosts the core and owns all fs/Brotli/offsets, exposing a narrow IPC bridge that loads a save and writes edits to a NEW file — raw bytes and offsets never crossing to the renderer, the original never overwritten.
**Verified:** 2026-07-04T17:46:24Z
**Status:** passed
**Re-verification:** No — initial verification
**Requirement closed:** IO-02 (non-destructive new-file save)

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
| --- | ------- | ---------- | -------------- |
| 1 | Renderer runs with `contextIsolation:true`, `nodeIntegration:false`, `sandbox:true`, no fs/Brotli access; all I/O + parsing in main | ✓ VERIFIED | `electron/main.ts:140-145` sets all three flags literally; compiled `preload.js`; `loadFile` (`:149`), never `loadURL`; `setWindowOpenHandler(deny)` (`:152`) + `will-navigate` `preventDefault` (`:153-155`). Renderer (`renderer.ts`) imports nothing from `src/*`/`node:`/`electron`; preload imports only `electron`. Runtime window launch is manual UAT (already human-approved per phase context; cannot run headlessly under WSL2). |
| 2 | Preload exposes only narrow load/getModel/preview/write; raw buffers/offsets never cross; int64 serialized as strings | ✓ VERIFIED | `preload.ts:39-47` — exactly 4 `contextBridge.exposeInMainWorld('saveEditor', …)` methods, each binding one fixed `save:*` channel; no generic `ipcRenderer`/`invoke(channel,…)` passthrough. `toWireReport` (`ipc-guards.ts:147-154`) strips `offset` + stringifies bigint. Tests: `wire-shape.test.ts` — assertNoOffsets passes, int64 old/new are BigInt-round-tripping strings. |
| 3 | Writing edits produces a NEW recompressed `.sav` at a distinct path; source stays byte-unchanged; re-parse + length invariant asserted before recompress [IO-02] | ✓ VERIFIED (behavioral) | `write-service.ts:87-124` — `patchSave` → `parseSave` (fresh re-parse) → length gate `buffer.length !== decompressedBuffer.length` throws BEFORE `compress` → source-path guard (resolved-path compare) → injected `writeFile` is the only write. Behavioral test `write-service.test.ts` (runs in the 230-test suite): writes to NEW path, roundtrips to patched buffer with edit applied + length preserved, source buffer byte-unchanged, source-path (incl. non-canonical) rejected with 0 writes, cancel/empty-pick clean no-op. |
| 4 | main re-resolves edits against its own freshly-parsed FieldTable + re-validates; malformed IPC args rejected | ✓ VERIFIED | `main.ts:106-129` preview/write both call `store.requireActive()` then `toEdits(assertEditsPayload(raw), session.fieldTable)` — resolves against main's own held FieldTable, never a renderer model. `assertEditsPayload` (`ipc-guards.ts:83-108`) shape-guards before core. Tests: `ipc-guards.test.ts` rejects non-array/non-object/empty-fieldKey/non-finite/non-integer-string; `session.test.ts` confirms single active session, replace-on-reopen, same-reference (no re-derive), no-session throw. |

**Score:** 4/4 truths verified (0 present, behavior-unverified)

### Plan-Level Must-Have Truths (all confirmed)

- 04-01: `electron@43.0.0` + `esbuild@^0.28.1` present as devDependencies (verified in `package.json`), resolvable — `build:electron` succeeds.
- 04-02: malformed payload rejected pre-core; int64 string↔bigint bridged by resolved kind; wire report offset-free + int64-as-string. All covered by passing `ipc-guards.test.ts` / `wire-shape.test.ts`.
- 04-03: single active session held/replaced; getModel returns offset-free viewModel; write path re-parses + length gate + new-path/source-path guard. Covered by passing `session.test.ts` / `write-service.test.ts`.
- 04-04: preload 4 narrow methods; throwaway renderer touches only `window.saveEditor.*`; strict CSP (`index.html:10-13` `default-src 'self'; script-src 'self'`); tsconfig includes `electron/**/*.ts` (typecheck green).
- 04-05: hardened window + 4 `ipcMain.handle` channels wiring pure modules; `toErrorResult` maps every typed core error 1:1; `build:electron` emits `dist/{main,preload,renderer}.js` + `index.html`; `main` field → `dist/main.js`.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | ----------- | ------ | ------- |
| `electron/main.ts` | Hardened window + 4 handlers + toErrorResult | ✓ VERIFIED | 176 lines; imports + uses `SessionStore`, `assertEditsPayload`/`toEdits`/`toWireReport`, `performWrite`, `patchSave` + all PatchError subclasses. |
| `electron/preload.ts` | Narrow contextBridge (4 channels) | ✓ VERIFIED | Imports only `electron`; exposes exactly 4 methods. |
| `electron/renderer.ts` | Smoke-test → window.saveEditor.* only | ✓ VERIFIED | No node/fs/electron/src imports; DOM lib via triple-slash ref. |
| `electron/index.html` | Host page + strict CSP | ✓ VERIFIED | CSP meta present; loads only local `renderer.js`. |
| `src/ipc/ipc-guards.ts` | Shape guard + int64 bridge + offset-strip | ✓ VERIFIED | No electron import; exports IpcArgError/WireEdit/assertEditsPayload/toEdits/WireChangeRow/toWireReport. |
| `src/ipc/session.ts` | ActiveSession + SessionStore | ✓ VERIFIED | No electron/fs import; single active session (D-02). |
| `src/ipc/write-service.ts` | WriteInvariantError/defaultOutputPath/performWrite | ✓ VERIFIED | Pure; fs/dialog injected; only write is to picked NEW path. |
| `scripts/build.mjs` | esbuild 3 entries → dist/ | ✓ VERIFIED | Build succeeds; core bundled into main.js, electron external. |
| `package.json` main | → dist/main.js + build:electron + start | ✓ VERIFIED | `main: dist/main.js`; scripts present. |

### Key Link Verification

| From | To | Via | Status |
| ---- | --- | --- | ------ |
| `preload` contextBridge | `save:*` channels | `ipcRenderer.invoke('save:load'|'save:getModel'|'save:preview'|'save:write')` | ✓ WIRED |
| `main` save:write | `performWrite` → new .sav | `assertEditsPayload → toEdits → performWrite(session, edits, {showSaveDialog, writeFile})` | ✓ WIRED |
| `SessionStore.open` | held ActiveSession | `decompress (codec) → parseSave (save-parser)` | ✓ WIRED |
| `performWrite` | new file | `patchSave → parseSave(fresh) → length gate → source-path guard → compress → writeFile` | ✓ WIRED |
| `toErrorResult` | IPC kind | maps Validation/ReadOnly/UnknownField/ConflictingEdit/IpcArg/WriteInvariant/NoActiveSession → distinct kind | ✓ WIRED |
| `build:electron` | `dist/{main,preload,renderer}.js` | esbuild | ✓ WIRED (build ran, artifacts emitted) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Full test suite (golden-file + IPC) | `npm test` | tests 230 / pass 230 / fail 0 | ✓ PASS |
| Strict typecheck | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Electron build | `npm run build:electron` | exit 0; `dist/main.js` (35.5KB, core bundled), `preload.js`, `renderer.js`, `index.html` | ✓ PASS |
| IO-02 non-destructive write | `write-service.test.ts` (in suite) | new-path write + source unchanged + length gate + source-path reject + cancel no-op all pass | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| IO-02 | 04-01…04-05 | Write edits to a NEW `.sav`, leaving the original untouched | ✓ SATISFIED | `performWrite` new-path-only + source-path guard + length invariant; behaviorally tested; original buffer never mutated. |

No orphaned requirements: REQUIREMENTS.md maps only IO-02 to Phase 4.

### Anti-Patterns Found

None. No TODO/FIXME/XXX/HACK/PLACEHOLDER/"not yet implemented" markers in any phase-modified file. No fs/ipcRenderer/src leakage into the renderer; no src/fs imports in preload. The quoted test glob (`'test/**/*.test.ts'`) is the intended fix (per phase context), not a defect.

### Human Verification Required

None outstanding. The one item that cannot be verified headlessly — the actual Electron window enforcing `sandbox`/`contextIsolation` at runtime — is a manual UAT already approved by the human (per phase context; WSL2 lacks WSLg/X libs for headless launch). All other hardening is confirmed by static inspection of `electron/main.ts` + `electron/preload.ts` + `electron/index.html`.

### Gaps Summary

No gaps. The phase goal is achieved: the trusted main process owns fs/Brotli/offsets; a narrow 4-method contextBridge is the only renderer surface; offsets never cross (stripped in `toWireReport`, tested via assertNoOffsets); int64 crosses as strings; every handler returns a discriminated `{ ok:false, kind, … }` via `toErrorResult` with no exception crossing the bridge; and IO-02's non-destructive new-file write — new path only, source rejected, length invariant asserted before recompress, original never opened for write — is proven by a passing behavioral test. 230/230 tests pass, `tsc --noEmit` is clean, and `build:electron` emits the full `dist/` bundle set.

---

_Verified: 2026-07-04T17:46:24Z_
_Verifier: Claude (gsd-verifier)_
