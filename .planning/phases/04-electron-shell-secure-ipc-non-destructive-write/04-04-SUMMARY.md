---
phase: 04-electron-shell-secure-ipc-non-destructive-write
plan: 04
subsystem: electron-shell
tags: [electron, preload, contextBridge, csp, renderer, ipc, security, typecheck]

# Dependency graph
requires:
  - phase: 04-01
    provides: "electron@43.0.0 devDependency (its own types resolve the 'electron' import)"
provides:
  - "electron/preload.ts — narrow contextBridge surface (window.saveEditor: load/getModel/preview/write over save:* channels)"
  - "electron/index.html — CSP-locked host page loading local renderer.js only"
  - "electron/renderer.ts — throwaway smoke-test driving all four bridge methods"
  - "Window['saveEditor'] global augmentation (shared preload/renderer/Phase-5-UI type contract)"
  - "tsc --noEmit now typechecks electron/** under the unchanged CommonJS config"
affects: [04-05, main-process-ipc-wiring, phase-5-real-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Narrow contextBridge: exactly four fixed-channel wrappers on window.saveEditor; no ipcRenderer/generic-invoke passthrough (T-4-01 / SC-2)"
    - "Strict CSP meta (default-src 'self'; script-src 'self') + local-only <script src> — no inline/remote code (T-4-07)"
    - "Per-file /// <reference lib=\"dom\" /> gives the renderer DOM types without touching the Node-only tsconfig lib"
    - "declare global { interface Window } in preload shares the bridge type with the renderer with zero imports"

key-files:
  created:
    - electron/preload.ts
    - electron/index.html
    - electron/renderer.ts
  modified:
    - tsconfig.json

key-decisions:
  - "SaveEditorApi methods typed as Promise<unknown> in preload to avoid importing src/* into the sandboxed bundle (Phase 5's UI imports the discriminated result types)"
  - "Window['saveEditor'] augmentation lives inline in preload.ts (a module) rather than a separate .d.ts — keeps files-modified to the plan's set and needs no import in renderer.ts"
  - "Renderer gets DOM types via a per-file triple-slash /// <reference lib=\"dom\" /> instead of adding \"dom\" to tsconfig lib — leaves the CommonJS/Node config fully unchanged per Task 3 acceptance"

metrics:
  duration: 6 min
  completed: 2026-07-04
  tasks: 3
  files: 4

status: complete
---

# Phase 04 Plan 04: Renderer-Side Electron Shell (preload + CSP host + smoke test) Summary

Built the renderer-side half of the Electron shell: a narrow `contextBridge` preload exposing
exactly four fixed-channel methods on `window.saveEditor`, a CSP-locked host page that loads only the
local renderer bundle, and a throwaway smoke-test renderer that drives all four bridge methods — with
`tsc --noEmit` extended to typecheck `electron/**` under the unchanged CommonJS config.

## What Was Built

- **electron/preload.ts** — imports only `{ contextBridge, ipcRenderer }` from `electron` and calls
  `contextBridge.exposeInMainWorld('saveEditor', { load, getModel, preview, write })`. Each method
  binds one fixed channel (`save:load` / `save:getModel` / `save:preview` / `save:write`); `load`
  takes no path (main owns the open dialog), preview/write forward an opaque `edits` payload. No bare
  `ipcRenderer`, `.on`, or generic-channel passthrough crosses the bridge (T-4-01 / SC-2). A
  `declare global { interface Window { saveEditor: SaveEditorApi } }` shares the surface type with the
  renderer.
- **electron/index.html** — minimal host with a strict CSP meta
  (`default-src 'self'; script-src 'self'`), four buttons + an output `<pre>`, and a single
  `<script src="renderer.js">`. No inline script body, no remote resources (T-4-07).
- **electron/renderer.ts** — throwaway harness wiring each button to the matching
  `window.saveEditor.*` method, awaiting the result and JSON-dumping it into the `<pre>`;
  Preview/Write send a small hard-coded `edits` sample (int64 currency as a string). Imports nothing
  from `src/`, `node:`, or `electron`; holds no session handle, no fs path, no offsets (SC-1 / T-4-03).
  DOM types come from a per-file `/// <reference lib="dom" />`.
- **tsconfig.json** — `include` extended with `"electron/**/*.ts"`; `module`, `moduleResolution`,
  `target`, `strict`, and every other compiler option left untouched.

## Task-by-Task

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | preload.ts — narrow contextBridge surface (4 channels) | babdaed | electron/preload.ts |
| 2 | index.html + renderer.ts — CSP-locked smoke-test host | e3d5c87 | electron/index.html, electron/renderer.ts |
| 3 | tsconfig include — typecheck electron/** without ESM migration | 781994f | tsconfig.json |

## Verification

- `grep -c "ipcRenderer.invoke('save:" electron/preload.ts` → **4** (exactly the four channels).
- `grep -c "Content-Security-Policy" electron/index.html` → **1** (strict CSP present).
- `npx tsc --noEmit` → **clean (exit 0)** with `electron/**` typechecked against electron's own types
  under the CommonJS config.
- Manual `window.saveEditor` / `window.require === undefined` check is deferred to Plan 04-05's
  phase-gate UAT (needs the main process + BrowserWindow, which 04-05 wires up).

## Threat Mitigations Applied

- **T-4-01 (Elevation of Privilege)** — only four purpose-specific wrappers on `window.saveEditor`;
  no `ipcRenderer`/`.on`/generic-invoke passthrough.
- **T-4-07 (Tampering/Spoofing)** — strict CSP, no inline scripts, local `renderer.js` only.
- **T-4-03 (Information Disclosure)** — renderer holds no fs path, no buffer, no offset, no session
  handle; it only calls the four methods and renders their offset-free results.

## Deviations from Plan

None — plan executed exactly as written. The `Window['saveEditor']` type was placed inline in
`preload.ts` (an option the plan explicitly offered) rather than a separate `.d.ts`, keeping the
changed-file set identical to the plan's `files_modified`.

## Known Stubs

`electron/renderer.ts` is an intentional throwaway smoke-test (documented in the plan objective and
Task 2). It uses a hard-coded `sampleEdits` array and is explicitly slated for replacement by the real
UI in Phase 5. This is a planned stub, not an incomplete deliverable — the four bridge methods it
exercises are the real, permanent surface.

## Notes for Plan 04-05

- 04-05 supplies `electron/main.ts` with `ipcMain.handle('save:load'|'save:getModel'|'save:preview'|'save:write')`
  and a hardened `BrowserWindow` (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`,
  `preload: …/preload.js`, `loadFile(index.html)`, `setWindowOpenHandler(deny)`).
- The esbuild build (04-05) must emit `dist/renderer.js` beside `index.html` (the `<script src>` name)
  and compile the preload to a `.js` (sandboxed preloads cannot run through a TS loader).
- The preload's `Window['saveEditor']` augmentation and `SaveEditorApi` are the type contract Phase 5's
  real UI will consume (swapping `Promise<unknown>` for the core's discriminated result types).

## Self-Check: PASSED
