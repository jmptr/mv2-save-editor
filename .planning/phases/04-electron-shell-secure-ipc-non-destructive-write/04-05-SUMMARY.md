---
phase: 04-electron-shell-secure-ipc-non-destructive-write
plan: 05
subsystem: infra
tags: [electron, esbuild, ipc, contextBridge, sandbox, brotli, non-destructive-write]

requires:
  - phase: 04-electron-shell-secure-ipc-non-destructive-write
    provides: "electron@43.0.0 + esbuild@0.28.1 devDeps (04-01); SessionStore (04-02); ipc-guards + write-service (04-02/04-03); preload + renderer + index.html (04-04)"
provides:
  - "electron/main.ts — hardened BrowserWindow + four save:* ipcMain.handle bodies + toErrorResult"
  - "scripts/build.mjs — esbuild 3 entries → dist/ (main+preload node/CJS, renderer browser) + index.html copy"
  - "package.json main → dist/main.js + build:electron/start scripts"
  - "IO-02 closed end-to-end: renderer write → main → non-destructive new .sav; original byte-unchanged"
affects: [Phase 5 renderer UI, electron packaging, IPC result types]

tech-stack:
  added: []
  patterns:
    - "Thin electron main: wire-only handlers compose pure src/ipc/* modules; zero logic in electron/"
    - "toErrorResult: instanceof-dispatch mapping every typed core error → discriminated IPC { ok:false, kind } (D-04)"
    - "esbuild 3-entry build: platform:node for main/preload (core bundled, electron external), platform:browser for renderer"

key-files:
  created:
    - electron/main.ts
    - scripts/build.mjs
  modified:
    - package.json

key-decisions:
  - "Used SessionStore + requireActive() (pure 04-02 module) rather than a raw module-level session variable; NoActiveSessionError maps to kind:'no-session' in toErrorResult"
  - "esbuild build mechanism (Plan 04-01 OPTION A), NOT the tsc --outDir fallback"
  - "Wrapped dialog.showSaveDialog / fs writeFile in arrow adapters when injecting into performWrite to preserve `this`-binding and match WriteDeps types"

patterns-established:
  - "Discriminated-result IPC boundary: no exception, offset, or bigint ever crosses the bridge — every handler funnels throws through toErrorResult"
  - "Hardened window: contextIsolation+nodeIntegration:false+sandbox+compiled preload, loadFile-only, window-open + will-navigate denied"

requirements-completed: [IO-02]

coverage:
  - id: D1
    description: "electron/main.ts hardens the BrowserWindow (contextIsolation:true, nodeIntegration:false, sandbox:true, compiled preload, loadFile-only, window-open + will-navigate denied)"
    requirement: "IO-02"
    verification:
      - kind: manual_procedural
        ref: "Task 3 UAT step 1-2: npm start launches window; window.saveEditor present; window.require undefined; load.toString() shows no raw fs/ipcRenderer"
        status: pass
    human_judgment: true
    rationale: "Window launch + isolated-world bridge presence cannot be exercised headlessly (WSL2 needs WSLg/X); verified by human UAT reply 'approved'"
  - id: D2
    description: "Four save:* ipcMain.handle channels wire SessionStore + assertEditsPayload/toEdits + patchSave + toWireReport + performWrite; toErrorResult maps each typed core error 1:1 to a discriminated kind"
    requirement: "IO-02"
    verification:
      - kind: automated
        ref: "npx tsc --noEmit (exit 0) with electron/main.ts present; full suite 230/230 green (pure src/ipc/* modules the handlers compose)"
        status: pass
    human_judgment: false
  - id: D3
    description: "build:electron (esbuild, OPTION A) emits dist/{main,preload,renderer}.js + dist/index.html; main → dist/main.js; test/typecheck byte-unchanged; type stays commonjs; dist/ git-ignored"
    requirement: "IO-02"
    verification:
      - kind: automated
        ref: "npm run build:electron (exit 0) + node accessSync of all four dist artifacts; renderer.js has 0 require() calls; git check-ignore dist/main.js"
        status: pass
    human_judgment: false
  - id: D4
    description: "End-to-end non-destructive write (IO-02): load → preview (offset-free report) → write produces a NEW .sav at a distinct path, original byte-unchanged; source-path pick refused (write-invariant)"
    requirement: "IO-02"
    verification:
      - kind: manual_procedural
        ref: "Task 3 UAT steps 3-6: summary renders (GP/SC strings); preview report has no offset; Save-As defaults <base>-edited.sav; new file exists, original size/mtime unchanged; source-path pick refused"
        status: pass
    human_judgment: true
    rationale: "Native Save-As dialog + on-disk original-untouched check require the launched GUI; verified by human UAT reply 'approved'"

duration: 21min
completed: 2026-07-04
status: complete
---

# Phase 04 Plan 05: Electron Main Process + Build + Non-Destructive Write Summary

**Hardened Electron main process (contextIsolation/sandbox, loadFile-only, navigation denied) wiring four `save:*` IPC handlers as thin composition over the tested pure core, plus an esbuild 3-entry build — closing IO-02 end-to-end (renderer write → new `.sav`, original untouched).**

## Performance

- **Duration:** 21 min (execution) + human UAT gate
- **Started:** 2026-07-04T17:20:09Z
- **Completed:** 2026-07-04T17:41:11Z
- **Tasks:** 3 (Task 1 + Task 2 auto; Task 3 resolved via human "approved")
- **Files modified:** 3 (electron/main.ts, scripts/build.mjs, package.json)

## Accomplishments
- `electron/main.ts`: hardened BrowserWindow (`contextIsolation:true`, `nodeIntegration:false`, `sandbox:true`, compiled `preload.js`, `loadFile` only, `setWindowOpenHandler(deny)` + `will-navigate` denied) and four `ipcMain.handle` bodies composing `SessionStore` + `assertEditsPayload`/`toEdits` + `patchSave` + `toWireReport` + `performWrite`.
- `toErrorResult`: instanceof-dispatch mapping `ValidationError`→`validation` (+violations), `ReadOnlyFieldError`→`readonly`, `UnknownFieldError`→`unknown-field`, `ConflictingEditError`→`conflict`, `IpcArgError`→`bad-args`, `WriteInvariantError`→`write-invariant`, `NoActiveSessionError`→`no-session`, else `internal` — no exception/offset/bigint crosses the bridge (D-04).
- `scripts/build.mjs`: esbuild build — main+preload (`platform:node`, CJS, core bundled in, `electron` external) and renderer (`platform:browser`), plus `index.html` copied beside them into `dist/`.
- `package.json`: `main` → `dist/main.js`; added `build:electron` + `start`; `test` (quoted glob) and `typecheck` left byte-unchanged; `type` stays `commonjs`.
- IO-02 closed end-to-end: the human UAT confirmed the launched window's bridge is present with no Node access and a write produces a new `.sav` while the original stays byte-unchanged.

## Task Commits

Each task was committed atomically:

1. **Task 1: main.ts — hardened window + four IPC handlers + error mapping** — `dff4e8e` (feat)
2. **Task 2: build pipeline + package.json entry/scripts** — `8219c2d` (feat)
3. **Task 3: Manual UAT — launch the hardened shell and prove the bridge** — resolved via human decision "approved" (no code commit; manual verification gate)

**Plan metadata:** pending this docs commit.

## Files Created/Modified
- `electron/main.ts` - Hardened BrowserWindow + four `save:*` handlers + `toErrorResult`; thin wiring over the pure `src/ipc/*` core.
- `scripts/build.mjs` - esbuild 3-entry build → `dist/{main,preload,renderer}.js` + `dist/index.html`.
- `package.json` - `main` → `dist/main.js`; `build:electron` + `start` scripts added; `test`/`typecheck` unchanged.

## Decisions Made
- **SessionStore over a raw session variable** — used the pure `SessionStore` from 04-02 (`open`/`getModel`/`requireActive`); `requireActive()` throwing `NoActiveSessionError` is mapped by `toErrorResult` to `kind:'no-session'`, cleaner than the RESEARCH sketch's inline `if(!session)` guard and equivalent in behavior.
- **esbuild mechanism (Plan 04-01 OPTION A)** — the recorded conscious postinstall approval; NOT the tsc `--outDir` fallback.
- **Arrow-wrapped injected deps** — `showSaveDialog: (opts) => dialog.showSaveDialog(opts)` and `writeFile: (path, data) => writeFile(path, data)` preserve `this`-binding and adapt Electron/fs types to the `WriteDeps` interface.

## Deviations from Plan

None - plan executed exactly as written. `.gitignore` already contained `dist` (verified via `git check-ignore`), so no `.gitignore` edit was needed despite Task 2 listing it as a possible file.

## Issues Encountered
None during execution. The only environment prerequisite surfaced at UAT (see below) — not a code issue.

## Checkpoint / UAT Resolution
- **Task 3 (blocking `checkpoint:human-verify`)** was returned to the coordinator after Tasks 1-2 were green; the human ran the manual UAT and replied **"approved"** — window launched, `window.saveEditor` present, `window.require` undefined, and a write produced a new `.sav` leaving the original byte-unchanged (all how-to-verify steps passed).
- **WSL2 runtime-libs prerequisite (environment setup note):** launching Electron on Ubuntu 24.04 WSL2 required installing missing system libraries — `libnss3`, `libnspr4`, `libasound2t64`, plus the GTK stack — before `npm start` could open the window. This is an OS environment fix, not a code change, and is documented here for future launches.

## User Setup Required
None for the code. Environment note for launching on Ubuntu 24.04 WSL2: `sudo apt install libnss3 libnspr4 libasound2t64` plus the GTK runtime stack (installed once per machine) before `npm start`.

## Next Phase Readiness
- **Ready:** `npm start` launches the hardened shell end-to-end; the four narrow IPC methods are the renderer's only privileged surface — Phase 5 can replace the smoke-test renderer with the real UI, importing the discriminated result types.
- **IO-02 complete** — non-destructive new-file write proven end-to-end (already marked Complete in REQUIREMENTS.md).
- No blockers.

## Self-Check: PASSED

- FOUND: electron/main.ts
- FOUND: scripts/build.mjs
- FOUND: commit dff4e8e (Task 1)
- FOUND: commit 8219c2d (Task 2)

---
*Phase: 04-electron-shell-secure-ipc-non-destructive-write*
*Completed: 2026-07-04*
