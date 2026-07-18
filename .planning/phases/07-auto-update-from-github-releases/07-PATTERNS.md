# Phase 7: Auto-Update from GitHub Releases - Pattern Map

**Mapped:** 2026-07-18
**Files analyzed:** 8 (2 new source, 3 modified config/source, 3 new tests)
**Analogs found:** 8 / 8

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `electron/updater.ts` | service (main-process helper) | event-driven | `scripts/make-icon.mjs` (zero-dep `fs` writer) + `electron/main.ts` (module/import style) | role-match |
| `electron/main.ts` | main (lifecycle wiring) | event-driven | `electron/main.ts` itself — existing `app.whenReady().then()` block (lines 158-168) | exact (same file, in-place) |
| `scripts/build.mjs` | config (build) | transform | `scripts/build.mjs` itself — existing `external: ['electron']` (line 30) | exact (same file, in-place) |
| `package.json` | config (manifest) | — | `package.json` itself — existing `dependencies`/`devDependencies` split (lines 26-45) | exact (same file, in-place) |
| `electron-builder.json` | config (packaging) | — | `electron-builder.json` itself — existing win/nsis blocks (Phase 6, lines 9-17) | exact (same file, in-place) |
| `test/updater.packaging.test.ts` | test | request-response (static config assert) | `test/packaging.config.test.ts` | exact |
| `test/updater.seam.test.ts` | test | transform (static source/AST assert) | `test/packaging.dist-layout.test.ts` (existsSync/fs reads) + `test/packaging.config.test.ts` | role-match |
| `test/updater.logger.test.ts` | test | file-I/O (factory + tmp write) | `test/packaging.icon.test.ts` (fs read + assertion) + `test/packaging.config.test.ts` | role-match |

## Pattern Assignments

### `electron/updater.ts` (service, event-driven) — NEW

**Analog A — zero-dep `fs` writer idiom:** `scripts/make-icon.mjs`

The updater's file logger is the direct descendant of the icon writer's zero-dep ethos: import only `node:fs` (and `node:path`), no new runtime dep. Note the import style and the swallow-on-failure discipline.

`scripts/make-icon.mjs` lines 26-27 (node-builtin-only imports):
```javascript
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
```

The logger uses the same "named import from a `node:` builtin, no dependency" shape, but with `appendFileSync` (append, not overwrite) and a try/catch that never throws (RESEARCH Pattern 1, lines 185-200). The header-comment convention in `make-icon.mjs` (lines 1-24: purpose, why-zero-dep, what-it-covers) should be replicated at the top of `updater.ts`.

**Analog B — main-process module + import conventions:** `electron/main.ts`

`electron/main.ts` lines 16-19 (electron + node:builtin import ordering; blank line between electron/node and local imports):
```typescript
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
```

`updater.ts` mirrors this: `import { app } from 'electron';` then `node:fs` / `node:path`, then `import { autoUpdater } from 'electron-updater';`. Uses `commonjs` module type (package.json line 15) and the same JSDoc-block-per-exported-function style seen on `toErrorResult` / `registerIpcHandlers` (main.ts lines 34-40, 71-74).

**Core pattern (from RESEARCH.md Pattern 1, verified against electron-updater source):**
- `createFileLogger()` → `{ info, warn, error, debug }` writing to `join(app.getPath('logs'), 'updater.log')`, each write wrapped in try/catch (D-04).
- `initAutoUpdater()` sets `autoUpdater.logger`, attaches `autoUpdater.on('error', ...)` (REQUIRED — unhandled `error` event throws, D-03), optional `update-available`/`update-downloaded` breadcrumbs, then `autoUpdater.checkForUpdatesAndNotify().catch(...)`.
- No override of `autoDownload` / `autoInstallOnAppQuit` (D-08 — already `true`).

---

### `electron/main.ts` (main, event-driven) — MODIFIED

**Analog:** the file's own `app.whenReady().then()` block.

`electron/main.ts` lines 158-168 (the exact insertion seam — add the guarded init after `createWindow()`):
```typescript
app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  // macOS: re-create a window when the dock icon is clicked and none are open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
```

**Change to make (RESEARCH Pattern 2, lines 226-240):** insert between `createWindow();` (line 160) and the `app.on('activate', ...)` block a guarded lazy require so dev never loads the module:
```typescript
  if (app.isPackaged) {
    // require lazily so the dev/unpackaged run never even loads electron-updater
    const { initAutoUpdater } = require('./updater') as typeof import('./updater');
    initAutoUpdater();
  }
```
Use `require('./updater')` (NOT a top-level `import`) so the dev run is strictly inert (D-05); `electron-updater` being in esbuild `external[]` keeps this literal in `dist/main.js`. `app` is already imported (line 16) — no import change needed.

---

### `scripts/build.mjs` (config, transform) — MODIFIED

**Analog:** the file's own `common` options object.

`scripts/build.mjs` line 30 (inside `common`, lines 24-32):
```javascript
  external: ['electron'],
```

**Change (RESEARCH Pattern 3, D-06):**
```javascript
  external: ['electron', 'electron-updater'],
```
Single-line edit to the array literal. Preserve the existing inline-comment style (line 8 already documents why `electron` stays external — add a parallel note for `electron-updater`: dynamic requires + `app-update.yml` path resolution).

---

### `package.json` (config, manifest) — MODIFIED

**Analog:** the file's own `dependencies` block (lines 40-44) vs `devDependencies` (lines 26-36).

Existing runtime deps (lines 40-44):
```json
  "dependencies": {
    "@tanstack/react-virtual": "^3.14.5",
    "react": "^19.2.7",
    "react-dom": "^19.2.7"
  }
```

**Change (D-06):** add `"electron-updater": "^6.8.9"` under `dependencies` (NOT `devDependencies` — devDeps are pruned from `app.asar`). Install via `npm install --save electron-updater@^6.8.9`. Note: `electron-builder` stays in `devDependencies` (line 32); the `repository` field (lines 9-12) already supplies owner/repo. Alpha-sort within the block to match the existing ordering (`electron-updater` sits before `react`).

---

### `electron-builder.json` (config, packaging) — MODIFIED

**Analog:** the Phase-6 win/nsis blocks in the same file.

`electron-builder.json` lines 9-17 (the config to extend, sibling of these blocks):
```json
  "win": {
    "target": "nsis",
    "icon": "build/icon.png"
  },
  "nsis": {
    "oneClick": true,
    "perMachine": false,
    "createStartMenuShortcut": true
  }
```

**Change (RESEARCH Pattern 4, D-07):** add a top-level `publish` array alongside `win`/`nsis`:
```json
  "publish": [
    { "provider": "github", "owner": "jmptr", "repo": "mv2-save-editor" }
  ]
```
Do NOT touch `files: ["dist/**", "package.json"]` (line 8) — production deps are auto-included in the asar; broadening `files` re-bloats it (RESEARCH Anti-Patterns).

---

### `test/updater.packaging.test.ts` (test) — NEW

**Analog:** `test/packaging.config.test.ts` (near-identical purpose: pin JSON config against acceptance bar).

`test/packaging.config.test.ts` lines 11-14 (import style — `node:test` + strict assert + JSON config imports):
```typescript
import test from 'node:test';
import assert from 'node:assert/strict';

import builderConfig from '../electron-builder.json';
import pkg from '../package.json';
```

`test/packaging.config.test.ts` lines 38-54 (dependency-placement + config-drift assertion idiom to copy):
```typescript
test('package.json: version 1.1.0, package script chain, electron-builder devDep (D-04/D-05)', () => {
  assert.equal(pkg.version, '1.1.0');
  ...
  assert.ok(
    pkg.devDependencies['electron-builder'],
    'electron-builder must be a devDependency',
  );
});
```

**Assertions to write (RESEARCH Test Map D-06/D-07 + success criterion 4 static slice):**
- `pkg.dependencies['electron-updater']` is set AND `pkg.devDependencies['electron-updater']` is undefined (D-06 / Pitfall 3).
- `builderConfig.publish[0]` equals `{ provider: 'github', owner: 'jmptr', repo: 'mv2-save-editor' }` (D-07 / Pitfall 5).
- (esbuild `external` assertion may live here or in the seam test — see below.)

Header-comment convention: replicate lines 1-9 (what it covers, which requirement IDs, why pinned).

---

### `test/updater.seam.test.ts` (test) — NEW

**Analog:** `test/packaging.dist-layout.test.ts` (reads on-disk artifacts with `node:fs` + `node:path` and asserts) combined with `test/packaging.config.test.ts` import style.

`test/packaging.dist-layout.test.ts` lines 12-19 (fs + path import + `join(__dirname, '..', ...)` root-resolution idiom for reading repo source):
```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import builderConfig from '../electron-builder.json';

const distDir = join(__dirname, '..', 'dist');
```

**Assertions to write (RESEARCH Test Map UPD-03/D-03/D-05):** read `electron/main.ts` and `electron/updater.ts` as text via `readFileSync(join(__dirname, '..', 'electron', ...), 'utf8')` and static/regex-assert:
- `main.ts` calls the init only inside an `app.isPackaged` branch, and does NOT `import`/`require('./updater')` at module top.
- `updater.ts` registers `autoUpdater.on('error'` AND has `.catch(` on the check call (D-03).
- `scripts/build.mjs` source contains `'electron-updater'` inside the `external` array (D-06, success criterion 4 static slice) — read as text, or import is not possible (`.mjs` config), so use `readFileSync` + regex.

Use the `assert.match(text, /regex/)` idiom already used in `packaging.config.test.ts` lines 43-48.

---

### `test/updater.logger.test.ts` (test) — NEW

**Analog:** `test/packaging.icon.test.ts` (imports/reads a produced artifact, asserts structural correctness with `node:fs`) + `test/packaging.config.test.ts` import header.

`test/packaging.icon.test.ts` lines 20-25 (describe/test + fs read of a produced artifact):
```typescript
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ICON: Buffer = readFileSync('build/icon.png');
```

**Assertions to write (RESEARCH Test Map D-04):**
- Import the logger factory from `electron/updater.ts` (export `createFileLogger` so it is unit-testable without importing `electron-updater`; note: importing `updater.ts` may pull `electron`/`electron-updater` — keep the factory importable in isolation, e.g. accept the log dir as a param, or guard the electron import).
- Assert the returned object has `info`/`warn`/`error` as functions (`debug` optional per RESEARCH Logger interface, lines 334-339).
- Call each against a tmp dir (use `os.tmpdir()` + `node:fs`), assert a line is appended and that a write failure never throws (D-03/D-04).

Use `mkdtempSync`/`rmSync` from `node:fs` for tmp isolation (new idiom — no existing analog does tmp dirs, but the fs-read pattern from `packaging.icon.test.ts` is the base).

---

## Shared Patterns

### Zero-dep `node:fs` writer (project ethos)
**Source:** `scripts/make-icon.mjs` lines 26-27 (imports), 42-57 (pure-JS helpers), plus the swallow-never-throw discipline.
**Apply to:** `electron/updater.ts` file logger.
```javascript
import { writeFileSync, mkdirSync } from 'node:fs';
```
The updater logger is the second instance of this pattern: node-builtin `fs` only, no runtime dependency (D-04). Icon uses `writeFileSync`; logger uses `appendFileSync` wrapped in try/catch.

### `node:test` via `tsx` (NOT Vitest)
**Source:** every `test/**/*.test.ts`; canonical header `test/packaging.config.test.ts` lines 11-12.
**Apply to:** all three new test files.
```typescript
import test from 'node:test';           // or: import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
```
Run via `npm test` (`tsx --test 'test/**/*.test.ts'`, package.json line 18). Config is imported directly as JSON (`import pkg from '../package.json'`); source files are read as text via `readFileSync(join(__dirname, '..', ...))`.

### JSON-config assertion + drift-pinning
**Source:** `test/packaging.config.test.ts` lines 17-54.
**Apply to:** `test/updater.packaging.test.ts`.
Import the config as a module, assert exact values with `assert.equal` / `assert.ok`, each `test()` tagged with the requirement ID(s) it covers in the title string.

### Guarded-before-side-effects wiring in `whenReady`
**Source:** `electron/main.ts` lines 158-168 (`app.whenReady().then()` + `app.on('activate', ...)`).
**Apply to:** the `if (app.isPackaged) { ... }` updater init insertion.

### esbuild `external[]` seam
**Source:** `scripts/build.mjs` line 30 (`external: ['electron']`) inside the shared `common` object.
**Apply to:** append `'electron-updater'` (D-06); both `main.ts` and `preload.ts` inherit `common`.

## No Analog Found

None. Every file this phase touches maps to an existing analog — the phase is deliberately additive over established Phase 4 (main-process wiring), Phase 5 (esbuild build), and Phase 6 (packaging config + static config tests + zero-dep icon writer) patterns.

## Metadata

**Analog search scope:** `electron/`, `scripts/`, `test/`, repo-root config (`package.json`, `electron-builder.json`)
**Files scanned:** `scripts/make-icon.mjs`, `scripts/build.mjs`, `electron/main.ts`, `package.json`, `electron-builder.json`, `test/packaging.config.test.ts`, `test/packaging.dist-layout.test.ts`, `test/packaging.icon.test.ts`, plus the full `test/**/*.test.ts` inventory (23 files)
**Pattern extraction date:** 2026-07-18
</content>
</invoke>
