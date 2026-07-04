---
phase: 05-renderer-ui-browse-search-edit-preview
plan: 02
subsystem: renderer-build-and-ipc-contract
tags: [esbuild, react, ipc, types, csp, electron]
status: complete
requires:
  - "Plan 04-05: hardened BrowserWindow + four save:* IPC handlers + esbuild build mechanism"
  - "Plan 05-01: bank fieldKey re-keying (ViewModel/FieldTable parity)"
provides:
  - "src/ipc/results.ts: shared type-only IPC result contract (ErrorKind, Load/GetModel/Preview/Write, SaveEditorApi, Window aug)"
  - "scripts/build.mjs renderer block: React JSX target (iife, jsx automatic, NODE_ENV define) → dist/renderer.js"
  - "electron/ui/tsconfig.json + npm typecheck:ui: scoped .tsx typecheck"
  - "electron/index.html #root + renderer.css (React mount point)"
affects:
  - "All downstream Phase 5 renderer plans (05-03..05-08): compiling build target + typed bridge"
tech-stack:
  added:
    - "react@19.2.7, react-dom@19.2.7, @tanstack/react-virtual@3.14.5"
    - "@types/react@19.2.17, @types/react-dom@19.2.3 (dev)"
  patterns:
    - "type-only IPC contract erased by esbuild (no src/* runtime in preload/renderer)"
    - "esbuild iife + jsx automatic + NODE_ENV define for CSP-safe React (no Vite/HMR)"
key-files:
  created:
    - src/ipc/results.ts
    - electron/ui/tsconfig.json
    - electron/ui/globals.d.ts
  modified:
    - package.json
    - package-lock.json
    - scripts/build.mjs
    - electron/preload.ts
    - electron/index.html
  deleted:
    - electron/renderer.ts
decisions:
  - "Retired throwaway electron/renderer.ts (smoke test) — orphaned by the renderer.tsx entry rename + tightened SaveEditorApi; index.html #root replaces its smoke DOM"
  - "Did NOT mark BROWSE-01 / SAFE-02 complete — this plan scaffolds the build target + typed bridge only; the requirements are satisfied by downstream renderer plans (project precedent: defer requirement completion until actually delivered)"
metrics:
  duration_min: 4
  tasks: 2
  files_changed: 8
  completed: 2026-07-04
---

# Phase 05 Plan 02: Renderer Build Target + Type-Only IPC Contract Summary

Extended the existing esbuild pipeline to compile a React 19 JSX renderer under the unchanged strict CSP (no Vite/HMR) and established `src/ipc/results.ts` — the shared, type-only discriminated IPC result contract that preload, main, and every downstream renderer plan now agree on.

## What Was Built

**Task 1 — React deps + esbuild renderer deltas + scoped UI tsconfig** (commit `2839f01`)
- Installed `react@19.2.7`, `react-dom@19.2.7`, `@tanstack/react-virtual@3.14.5` (deps) and `@types/react@19.2.17`, `@types/react-dom@19.2.3` (devDeps) at pinned versions per RESEARCH Standard Stack. No new postinstall scripts (`allowScripts` unchanged).
- Rewrote the renderer `build({...})` block in `scripts/build.mjs`: entry `electron/renderer.tsx` (kept named `renderer` → `dist/renderer.js`, Pitfall 1), `format:'iife'` overriding inherited `cjs` (Pitfall 2), `jsx:'automatic'` (React 19 runtime), `define` for `process.env.NODE_ENV` (mandatory — react-dom reads it), and `minify:!isDev`. Main/preload node build and index.html copy untouched.
- Added `electron/ui/tsconfig.json` (extends root; `jsx:react-jsx`, DOM libs, react/react-dom types, glob include so absent `.tsx` files are not errors) + `electron/ui/globals.d.ts` (`declare module '*.css'`) + `typecheck:ui` npm script.

**Task 2 — Type-only results contract + preload tightening + index.html root** (commit `d808453`)
- Created `src/ipc/results.ts` (TYPE-ONLY — every import is `import type`): `ErrorKind` as the exhaustive 8-member union matching main's `toErrorResult`, `ErrResult`, `LoadResult`, `GetModelResult`, `PreviewResult`, `WriteResult`, `SaveEditorApi` (typed `WireEdit[]` params + discriminated result returns), and the `Window.saveEditor` global augmentation.
- Tightened `electron/preload.ts`: deleted the local `SaveEditorApi` interface + `declare global`, replaced with `import type { SaveEditorApi } from '../src/ipc/results'`. Runtime `api` object + `contextBridge.exposeInMainWorld` unchanged.
- Updated `electron/index.html`: single `<div id="root">`, `<link rel="stylesheet" href="renderer.css">`, plain title. CSP meta and `<script src="renderer.js">` byte-unchanged.

## Verification

- `npm run typecheck` (root config) — green with results.ts + tightened preload.
- `npm run typecheck:ui` (scoped .tsx config) — green (tolerates not-yet-created `renderer.tsx`).
- `node --check scripts/build.mjs` — parses; renderer block sets iife + jsx automatic + NODE_ENV define + `renderer.tsx` entry.
- `npm ls` — all five packages at pinned versions.
- CSP meta `default-src 'self'; script-src 'self'` byte-unchanged; `#root` div + `renderer.css` link present.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Retired orphaned smoke-test `electron/renderer.ts`**
- **Found during:** Task 2 (root typecheck failed with TS2345)
- **Issue:** Changing the build entry to `renderer.tsx` and tightening `SaveEditorApi` (params `unknown` → `WireEdit[]`) orphaned the throwaway smoke-test `electron/renderer.ts`: it passed a `readonly` sample-edits array (no longer assignable to `WireEdit[]`) and drove `#output`/`#btn-*` DOM elements this plan removed from index.html. This broke `npm run typecheck` — the Task 2 verification gate.
- **Fix:** `git rm electron/renderer.ts`. The file was explicitly labelled throwaway ("Phase 5 replaces this with the real UI"), is referenced nowhere else, and is superseded by the `renderer.tsx` entry + `#root` mount. Deletion is intentional and documented.
- **Files modified:** electron/renderer.ts (deleted)
- **Commit:** d808453

## Threat Surface

No new security-relevant surface beyond the plan's `<threat_model>`. All three registered threats mitigated as planned: supply-chain installs vetted at pinned versions with no postinstall (T-05-SC); CSP meta byte-unchanged, stylesheet same-origin (T-05-04); preload uses `import type` erased by esbuild (T-05-05).

## Self-Check: PASSED

- FOUND: src/ipc/results.ts, electron/ui/tsconfig.json, electron/ui/globals.d.ts
- FOUND: commit 2839f01 (Task 1), commit d808453 (Task 2)
