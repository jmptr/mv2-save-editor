# Phase 7: Auto-Update from GitHub Releases - Research

**Researched:** 2026-07-18
**Domain:** Electron self-update — `electron-updater` 6.x + GitHub Releases provider, main-process-only integration behind an `app.isPackaged` guard, esbuild `external` + `dependencies` packaging seam
**Confidence:** HIGH (API surface, defaults, Logger interface, and the node_modules-in-asar mechanic all verified against electron-userland/electron-builder master source this session)

## Summary

This phase adds a single new runtime dependency (`electron-updater`) and a small main-process seam that, in a packaged app only, calls `autoUpdater.checkForUpdatesAndNotify()` once on launch. That one call performs the launch check, background-downloads a newer published GitHub Release, and fires a native OS notification when the download completes; `autoInstallOnAppQuit` (a default) then installs it on quit. Every locked decision (D-01..D-08) is confirmed executable exactly as written — the research surfaced **no** reason to deviate.

Three mechanical facts drive the plan and were all verified against source. (1) `autoDownload`, `autoInstallOnAppQuit`, and `autoRunAppAfterInstall` all default to `true`, so D-08's "no override" is correct [VERIFIED: AppUpdater.ts]. (2) The `Logger` interface electron-updater expects requires `info/warn/error` and an **optional** `debug` — so the zero-dep `fs` logger (D-04) needs exactly those three methods, `debug` optional [VERIFIED: electron-updater/src/types.ts]. (3) The single most load-bearing packaging fact for success criterion 4: electron-builder **always** copies production `dependencies` from `node_modules` (plus `package.json`) into `app.asar`, *regardless* of the restrictive `files: ["dist/**", "package.json"]` glob Phase 6 set — so putting electron-updater in `dependencies` is sufficient for it to be physically present in the asar; the lean `files` config does **not** need changing [VERIFIED: electron.build Application Contents].

**Primary recommendation:** Add `electron-updater@^6.8.9` to `dependencies`; add `'electron-updater'` to esbuild `external[]`; create a small `electron/updater.ts` helper exporting `initAutoUpdater()` that sets a zero-dep `fs` logger, attaches an `error` listener (required — an unhandled `error` event throws), and calls `checkForUpdatesAndNotify().catch(...)`; call it from `electron/main.ts` inside `if (app.isPackaged) { ... }` after `createWindow()`. Add an explicit `publish` block to `electron-builder.json` (`github` / `jmptr` / `mv2-save-editor`) — not strictly required but it removes runtime-feed ambiguity and is reused by Phase 8. No `asarUnpack` is needed (electron-updater and its whole dep tree are pure JS).

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01 (UPD-02):** Use electron-updater's built-in **`checkForUpdatesAndNotify()`** — one call does launch check + background download + native OS notification on download. No custom notification code, no renderer/IPC surface. Generic built-in wording is acceptable.
- **D-02 (UPD-01):** **Launch-only** cadence — check once per run, shortly after the window is ready, called from `app.whenReady().then()` after `createWindow()`, inside the `app.isPackaged` guard. No periodic in-session re-check.
- **D-03:** Update failures are **silent to the user, logged only**. Swallow the `error` event and the `checkForUpdatesAndNotify()` promise rejection to the updater log. Offline / GitHub-down / rate-limited must never interrupt, block, or delay the editor.
- **D-04:** **No new logging dependency.** Set `autoUpdater.logger` to a tiny **zero-dep, `fs`-based file logger** writing to `app.getPath('logs')` (e.g. `updater.log`). `electron-log` was considered and set aside to keep runtime deps minimal.
- **D-05 (UPD-03):** The entire updater seam is guarded by **`app.isPackaged`** — it does not run, register listeners, download, or throw during `npm start` / `electron .`. The guard wraps the whole seam.
- **D-06:** `electron-updater` goes in **`dependencies`** (NOT `devDependencies`) so electron-builder keeps it inside `app.asar`, AND it is added to esbuild's `external` array in `scripts/build.mjs` (`['electron']` → `['electron', 'electron-updater']`) so `dist/main.js` resolves it from `node_modules` at runtime. Exactly ROADMAP success criterion 4 — verify both after packaging.
- **D-07:** electron-updater's GitHub provider derives owner/repo from `package.json` `repository` (`github.com/jmptr/mv2-save-editor`). Researcher confirms whether an explicit `publish` block is required. Producing `latest.yml` + release assets is **Phase 8** — Phase 7 only consumes the feed.
- **D-08:** Keep defaults `autoDownload: true` (background download) and `autoInstallOnAppQuit: true` (install-on-quit) — no override.

### Claude's Discretion
- Whether the seam lives inline in `electron/main.ts` or in a small `electron/updater.ts` helper — separate module is cleaner but not required.
- Exact updater-log filename/format under `app.getPath('logs')`, and whether to log `update-available` / `download-progress` breadcrumbs (diagnostics only, no user surface).
- The exact `electron-updater` version to pin (compatible with electron-builder `26.x`) — researcher picks from current npm.

### Deferred Ideas (OUT OF SCOPE)
- **In-app update UI** — download progress bar / status in renderer, release notes shown to user (UPDUX-01/02). Native OS notification is enough for v1.1.
- **Manual "Check for updates" menu item** (UPDUX-03) — app has no menu; check-on-launch covers it.
- **"Restart now to apply" prompt** (UPDUX-04) — install-on-quit is chosen.
- **Periodic in-session re-check cadence** — set aside in favor of launch-only (D-02).
- **`electron-log`** — set aside for the zero-dep file logger (D-04).
- **CI publish-on-tag** (`latest.yml` + assets, draft-then-publish) — **Phase 8** (CI-01/02/03). Required before auto-update is end-to-end observable.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UPD-01 | On launch, a packaged app checks the GitHub Releases feed and downloads a newer published version in the background | `checkForUpdatesAndNotify()` performs the launch check; `autoDownload=true` (default, verified) drives the background download. GitHub provider resolves from `repository`/`publish`. Called once from `app.whenReady().then()` (D-02). |
| UPD-02 | A downloaded update installs on quit, and the user sees an "update ready" notification beforehand | `checkForUpdatesAndNotify()` fires a native `Notification` when `downloadPromise` resolves (verified in source); `autoInstallOnAppQuit=true` (default, verified) installs on quit. Default notification wording: title "A new update is ready to install". |
| UPD-03 | The updater is inert in dev/unpackaged runs — guarded by `app.isPackaged`, never errors during `npm start` / `electron .` | External `app.isPackaged` guard (D-05) prevents the seam from ever running in dev. Defense-in-depth: electron-updater's own `isUpdaterActive()` also returns false when `!app.isPackaged` and logs a skip message (verified in source), so it is doubly inert. |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Launch update check + background download | Main process (`electron-updater`) | GitHub Releases (feed) | Update orchestration is a Node/main concern; electron-updater owns HTTP, version compare, download, staging |
| "Update ready" user notification | Main process (native `Notification` via electron-updater) | OS notification center | `checkForUpdatesAndNotify()` shows the OS notification directly from main; no renderer/IPC (UI deferred) |
| Install-on-quit | Main process (electron-updater `autoInstallOnAppQuit`) | NSIS updater (`.exe`) | electron-updater hands the staged installer to NSIS on `before-quit`; no app code |
| Dev-inertness | Main process (`app.isPackaged` guard) | electron-updater `isUpdaterActive()` | Guard is app-owned (D-05); electron-updater's internal check is a backstop |
| Failure isolation (silent+logged) | Main process (`error` listener + `.catch`) | zero-dep `fs` logger | An unhandled `error` event throws; the listener + catch keep the editor unaffected (D-03) |
| Feed resolution (owner/repo → `app-update.yml`) | Build config (electron-builder `publish`) | `package.json` `repository` | electron-builder bakes `app-update.yml` into the package from the effective publish config at build time |
| Ship electron-updater physically in asar | Build config (`dependencies` + electron-builder auto-include) | esbuild `external[]` | Production deps are always copied into asar; `external` keeps main.js requiring it at runtime rather than bundling it |

## Project Constraints (from CLAUDE.md)

- **Electron + TypeScript, main-process for Node work** — electron-updater runs only in main (correct tier); no renderer/IPC surface added.
- **Zero-dep ethos** — the updater logger is hand-rolled `node:fs` (matches `scripts/make-icon.mjs`), not `electron-log`. electron-updater is the *only* new runtime dependency this phase adds.
- **esbuild `external` seam** — `scripts/build.mjs` keeps `electron` external; electron-updater joins it so it stays a real `node_modules` resolution at runtime.
- **Do binary/file/privileged work in main, narrow IPC via contextBridge** — updater is entirely main-side; the hardened `BrowserWindow` (contextIsolation/sandbox/no-nodeIntegration, loadFile-only, denied navigation) is untouched.
- **Testing = `node:test` via `tsx`** (`npm test`), NOT Vitest despite CLAUDE.md's stack table — matches the actual repo scripts.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| electron-updater | `6.8.9` (latest; `^6.8.9`) [VERIFIED: npm registry via `npm view`, published 2026-06-05] | Self-update: GitHub provider, background download, install-on-quit, native notification | The auto-update half of the electron-builder project (`electron-userland/electron-builder` monorepo). Consumes the `latest.yml`/`.blockmap`/installer that electron-builder produces. The canonical Electron auto-updater. |
| electron-builder | `26.x` (already devDep `^26.15.3`) [VERIFIED: package.json] | Produces the package + (Phase 8) the `latest.yml` feed; bakes `app-update.yml` into resources | Already the project's packager. electron-updater 6.x is released *from the same monorepo* alongside electron-builder 26.x. |

**Version pairing:** `electron-updater` and `electron-builder` live in **one monorepo** (`git+https://github.com/electron-userland/electron-builder.git` for both) and are versioned independently — electron-builder on `26.x`, electron-updater on `6.x`. `electron-updater@6.8.9` is the current release matching the `electron-builder@26.x` line; they are published together, so pinning `electron-updater@^6.8.9` alongside `electron-builder@^26.15.3` is the compatible, current pairing [VERIFIED: npm registry — matching `repository.url`, both current dist-tag `latest`]. Do **not** take `electron-updater@7.0.0-alpha.4` (`next` dist-tag — pre-release) [VERIFIED: npm dist-tags].

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none) | — | Updater logger is a zero-dep `node:fs` writer (D-04) | Instead of `electron-log`; matches the project's hand-rolled pattern |

**electron-updater's own dependency tree (auto-shipped into asar, informational):** `semver`, `js-yaml`, `fs-extra`, `lazy-val`, `lodash.isequal`, `lodash.escaperegexp`, `tiny-typed-emitter`, `builder-util-runtime@9.7.0` [VERIFIED: `npm view electron-updater dependencies`]. **All are pure JS** — no native `.node` binaries — so **no `asarUnpack` is required**; they resolve fine from inside `app.asar`.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| electron-updater | Electron's built-in `autoUpdater` (Squirrel) | Squirrel.Windows needs a different (signed) packaging path and lacks the GitHub-Releases-`latest.yml` flow; electron-updater is the electron-builder-native choice and already assumed by Phases 6/8. Locked. |
| zero-dep `fs` logger | `electron-log` | electron-log is the common pairing and auto-wires `autoUpdater.logger`, but adds a runtime dep. Set aside by D-04; revisit if diagnostics outgrow a flat file. |
| explicit `publish` block | rely on `repository` inference | Both resolve the feed; explicit block is deterministic and reused by Phase 8 (recommended — see D-07 answer). |

**Installation:**
```bash
npm install --save electron-updater@^6.8.9   # NOTE: --save (dependencies), NOT --save-dev (D-06)
```

**Version verification performed this session** [VERIFIED: `npm view` 2026-07-18]:
- `electron-updater` dist-tags: `latest: 6.8.9`, `next: 7.0.0-alpha.4`. `time.modified: 2026-06-20`. Repo: `github.com/electron-userland/electron-builder`.

## Package Legitimacy Audit

Run this session via `gsd-tools query package-legitimacy check --ecosystem npm electron-updater` + `npm view`.

| Package | Registry | Age (latest publish) | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|----------------------|-----------|-------------|---------|-------------|
| electron-updater | npm | 2026-06-05 (project 8+ yrs old, actively maintained) | seam returned `null` (downloads API blocked by egress policy this session) | github.com/electron-userland/electron-builder | seam: **SUS** (`unknown-downloads` only) → **treated as OK** | Approved — known false positive |

**On the SUS verdict:** identical to the electron-builder false positive documented in Phase 6 research. The only reason is `unknown-downloads` — `api.npmjs.org` is policy-blocked from this session's egress, so the seam can't read the weekly-download count. electron-updater is the canonical auto-updater from the `electron-userland` org (tens of millions of weekly downloads historically), `deprecated: false`, `postinstall: null` (no install scripts) [VERIFIED: seam signals]. This is blocked telemetry, not a risk signal. Proceed.

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** electron-updater (false positive, approved — no postinstall, canonical org). If the planner wants belt-and-suspenders, add one `checkpoint:human-verify` before the first `npm install electron-updater`.

## Architecture Patterns

### System Architecture Diagram

```
  app.whenReady().then()                    [electron/main.ts, ~line 158]
          │
   registerIpcHandlers(); createWindow();
          │
          ▼
   ┌──────────────────────────────────────────────┐
   │  if (app.isPackaged) {                         │   D-05 guard — the WHOLE seam.
   │      initAutoUpdater()   ◄─────────────────────┼── dev run (npm start / electron .):
   │  }                                             │   branch skipped → zero side effects,
   └───────────────┬────────────────────────────────┘   no listeners, no log file, no throw.
                   │ (packaged only)
                   ▼
        electron/updater.ts  initAutoUpdater()
                   │
     ┌─────────────┼───────────────────────────────┐
     ▼             ▼                                ▼
 autoUpdater   autoUpdater.on('error', log)   autoUpdater.checkForUpdatesAndNotify()
 .logger =     (REQUIRED: unhandled 'error'      │        .catch(log)          ── D-03 (silent+logged)
 fsLogger      event would throw)                │
 (D-04)                                          ▼
                                    ┌────────────────────────────┐
                                    │ GitHub Releases feed        │  owner/repo from
                                    │ latest.yml + installer +    │  publish block / repository
                                    │ .blockmap  (PRODUCED Phase 8)│  → read via baked app-update.yml
                                    └─────────────┬───────────────┘
                                                  │ newer version?
                                    ┌─────────────┴───────────────┐
                                 no │                             │ yes → background download
                                    ▼                             ▼   (autoDownload=true, default)
                          resolves "carry on"            'update-downloaded' event
                          (offline/rate-limited too)              │
                                                                  ▼
                                                    native Notification "update ready"
                                                                  │
                                                          on app quit →
                                                    autoInstallOnAppQuit=true (default)
                                                    hands installer to NSIS → installs
```

### Recommended Project Structure
```
mv2-save-editor/
├── electron/
│   ├── main.ts             # +  if (app.isPackaged) initAutoUpdater();  (inside whenReady)
│   ├── updater.ts          # NEW — initAutoUpdater(): logger + error listener + checkForUpdatesAndNotify
│   ├── preload.ts          # UNCHANGED
│   └── renderer.tsx        # UNCHANGED (no renderer surface this phase)
├── scripts/
│   └── build.mjs           # external: ['electron'] → ['electron', 'electron-updater']
├── electron-builder.json   # + publish: [{ provider: github, owner: jmptr, repo: mv2-save-editor }]
└── package.json            # + "electron-updater": "^6.8.9" under dependencies
```

### Pattern 1: `electron/updater.ts` helper (recommended over inline)
**What:** A small module owning the whole updater seam; `main.ts` calls one guarded function.
**When to use:** Here — it keeps the hardened `main.ts` lean, isolates the failure-swallowing, and is independently readable/greppable for the verification tests.
**Example:**
```typescript
// electron/updater.ts — main-process only; imported lazily behind app.isPackaged (see main.ts).
// Source: electron-userland/electron-builder — packages/electron-updater/src/AppUpdater.ts [VERIFIED]
import { app } from 'electron';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { autoUpdater } from 'electron-updater';

/** Zero-dep fs logger satisfying electron-updater's Logger interface (info/warn/error required,
 *  debug optional). Writes to app.getPath('logs')/updater.log. (D-04) */
function createFileLogger() {
  const logPath = join(app.getPath('logs'), 'updater.log');
  const write = (level: string, msg: unknown) => {
    try {
      appendFileSync(logPath, `${new Date().toISOString()} [${level}] ${String(msg)}\n`);
    } catch {
      /* logging must never throw into the updater */
    }
  };
  return {
    info: (m?: unknown) => write('info', m),
    warn: (m?: unknown) => write('warn', m),
    error: (m?: unknown) => write('error', m),
    debug: (m: string) => write('debug', m), // optional; harmless to provide
  };
}

/** Called ONLY when app.isPackaged (D-05). autoDownload / autoInstallOnAppQuit are true by
 *  default (D-08) — no override. Failures are silent to the user, logged only (D-03). */
export function initAutoUpdater(): void {
  autoUpdater.logger = createFileLogger();

  // REQUIRED: an EventEmitter that emits 'error' with no listener THROWS. This listener both
  // logs and prevents that crash. (D-03)
  autoUpdater.on('error', (err) => {
    autoUpdater.logger?.error?.(`updater error: ${err?.stack ?? err}`);
  });

  // Optional diagnostic breadcrumbs (Claude's discretion) — no user surface.
  autoUpdater.on('update-available', (info) => autoUpdater.logger?.info?.(`update-available ${info.version}`));
  autoUpdater.on('update-downloaded', (info) => autoUpdater.logger?.info?.(`update-downloaded ${info.version}`));

  // One launch check. Swallow the promise rejection so an offline/rate-limited run never blocks. (D-02/D-03)
  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    autoUpdater.logger?.error?.(`checkForUpdatesAndNotify rejected: ${err?.stack ?? err}`);
  });
}
```

### Pattern 2: The guard in `main.ts` (D-05)
```typescript
// electron/main.ts — inside app.whenReady().then(), AFTER createWindow()
app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  if (app.isPackaged) {
    // require lazily so the dev/unpackaged run never even loads electron-updater
    const { initAutoUpdater } = require('./updater') as typeof import('./updater');
    initAutoUpdater();
  }

  app.on('activate', () => { /* unchanged */ });
});
```
Using a guarded `require('./updater')` (rather than a top-level `import`) means the dev run never loads the module at all — strictly inert (UPD-03). Because `electron-updater` is in esbuild `external[]`, this `require` stays literal in `dist/main.js` and resolves from `node_modules` inside the asar at runtime.

### Pattern 3: esbuild `external` addition (D-06)
```js
// scripts/build.mjs — common options
external: ['electron', 'electron-updater'],
```
Without this, esbuild would try to bundle electron-updater (and its `fs-extra`/`js-yaml`/`semver` tree) into `main.js`; electron-updater reads `app-update.yml` relative to `process.resourcesPath` and does dynamic requires — bundling risks breaking that. Keeping it external preserves a real runtime `node_modules` resolution.

### Pattern 4: explicit `publish` block (D-07 answer)
```json
// electron-builder.json — add alongside win/nsis
"publish": [
  { "provider": "github", "owner": "jmptr", "repo": "mv2-save-editor" }
]
```

### Anti-Patterns to Avoid
- **No `error` listener:** electron-updater is an EventEmitter; an emitted `error` with no listener **throws an uncaught exception** and can crash the app. Always attach `autoUpdater.on('error', ...)` — this is the real UPD-03/D-03 safety, not just the `.catch`.
- **Top-level `import { autoUpdater } from 'electron-updater'` in `main.ts`:** loads the module even in dev. Prefer the guarded `require` in `updater.ts` so dev is strictly inert.
- **Overriding `autoDownload`/`autoInstallOnAppQuit`:** they are already `true` (defaults). Setting them is redundant noise (D-08).
- **Adding `electron-updater` to `devDependencies`:** electron-builder prunes devDependencies from the asar → the runtime `require` fails in the packaged app. Must be `dependencies` (D-06).
- **Adding `node_modules` globs to `files` to "make sure electron-updater ships":** unnecessary and risky — production deps are auto-included; broadening `files` could re-bloat the asar (re-introduces the Phase 6 Pitfall 5). Leave `files: ["dist/**", "package.json"]` as-is.
- **`asarUnpack` for electron-updater:** not needed (pure-JS tree). Adding it is cargo-culting.
- **Calling `checkForUpdates()` on a timer:** out of scope (launch-only, D-02).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Version comparison + feed polling | Custom semver + GitHub API fetch | `autoUpdater.checkForUpdatesAndNotify()` | Handles version compare, draft-skipping, `.blockmap` differential download, staging |
| "Update ready" notification | Custom `new Notification()` wiring | built-in notification inside `checkForUpdatesAndNotify()` | One call already shows the native OS notification on download (verified in source) |
| Install-on-quit orchestration | `before-quit` + spawn installer | `autoInstallOnAppQuit: true` (default) | electron-updater hands the staged NSIS installer over on quit |
| Feed config file | Hand-written `app-update.yml` | electron-builder `publish` block | electron-builder bakes `app-update.yml` into resources from the publish config at build time |
| Update logging framework | `electron-log` dependency | ~15-line `fs` logger satisfying the `Logger` interface (info/warn/error/debug?) | Zero-dep, matches project ethos; interface is tiny (verified) |

**Key insight:** The entire phase is "wire one call behind a guard + a logger + an error trap." The only thing worth hand-rolling is the throwaway-simple `fs` logger, and only because the alternative is a runtime dependency the project explicitly declined.

## Runtime State Inventory

Not a rename/refactor/migration phase — this is an additive integration. Still, checked each category explicitly:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | **None** — no datastore keys on any new string. The only new persistent artifact is `updater.log` under `app.getPath('logs')` (created at runtime, not migrated). | none |
| Live service config | **None in this phase.** The GitHub Releases feed (`latest.yml` + assets) is *produced by Phase 8*; Phase 7 only consumes it. No service config lives outside git for Phase 7. | none (Phase 8 owns the feed) |
| OS-registered state | The installed app's **AppUserModelID `com.jmptr.mv2-save-editor`** (Phase 6 `appId`) must stay constant for updates to target the same install — verified stable (Phase 6 D-02). electron-updater stages updates under the per-user install dir (`perMachine: false`). | none — appId already locked/stable |
| Secrets/env vars | **None at runtime.** electron-updater needs **no token** to *read* a public GitHub Releases feed. `GH_TOKEN` is only for *publishing* (Phase 8 CI). | none in Phase 7 |
| Build artifacts | electron-builder bakes **`app-update.yml`** into `release/win-unpacked/resources/` from the `publish` config; produced at package time, not committed. New `node_modules/electron-updater` tree ships inside `app.asar`. | none — generated by build |

**The canonical question — after the code lands, what runtime state carries a new string?** Only the runtime-generated `updater.log` and the build-generated `app-update.yml`; neither requires migration.

## Common Pitfalls

### Pitfall 1: Unhandled `error` event crashes the app
**What goes wrong:** electron-updater emits `error` (offline, 404 feed, rate-limited). Node's EventEmitter throws an uncaught exception if `error` is emitted with no listener — the opposite of UPD-03's "never throw."
**Why it happens:** Developers rely only on `checkForUpdatesAndNotify().catch()`, forgetting the event channel is separate.
**How to avoid:** Attach `autoUpdater.on('error', ...)` **and** `.catch()` the promise. Both (D-03).
**Warning signs:** App crashes on launch only when offline / when the feed 404s (pre-Phase-8, the feed *doesn't exist yet* — so this WILL fire).

### Pitfall 2: Feed does not exist until Phase 8 → `error` on every packaged launch
**What goes wrong:** Phase 7 ships before any Release with `latest.yml` exists. Every packaged launch will hit a missing/empty feed and emit `error`.
**Why it happens:** Phase 7 consumes a feed Phase 8 produces — intentional ordering.
**How to avoid:** This is expected and *correct* — the error is swallowed+logged (D-03), the editor runs normally. End-to-end "an update actually installs" is only observable across Phase 8's two published releases. Do not treat a logged feed error in Phase 7 as a failure.
**Warning signs:** `updater.log` shows a 404 / "Cannot find latest.yml" — expected until Phase 8.

### Pitfall 3: electron-updater in `devDependencies` → runtime `require` fails in asar
**What goes wrong:** Packaged app throws `Cannot find module 'electron-updater'` because electron-builder pruned it.
**Why it happens:** `--save-dev` habit; devDependencies are never copied into the asar.
**How to avoid:** `npm install --save electron-updater` (dependencies). Verify with a test asserting `package.json.dependencies['electron-updater']` exists and `devDependencies` does not contain it (D-06).
**Warning signs:** Works with `npm start` (node_modules present) but crashes in the installed app.

### Pitfall 4: Forgetting the esbuild `external` entry → bundled electron-updater misbehaves
**What goes wrong:** esbuild bundles electron-updater into `main.js`; dynamic requires / `app-update.yml` path resolution break, or the bundle balloons.
**Why it happens:** `external` only had `['electron']`.
**How to avoid:** `external: ['electron', 'electron-updater']`. Verify with a test asserting `scripts/build.mjs` (or the resolved config) lists `electron-updater` in `external` (D-06, success criterion 4).
**Warning signs:** `dist/main.js` grows by hundreds of KB; runtime errors about `app-update.yml` or `fs-extra`.

### Pitfall 5: Missing/incorrect `app-update.yml` → updater can't resolve the feed
**What goes wrong:** With no `publish` config and failed repository inference, the baked `app-update.yml` lacks a valid provider; the updater errors at runtime.
**Why it happens:** Relying solely on `repository`-field inference.
**How to avoid:** Add the explicit `publish` block (Pattern 4). Deterministic, and Phase 8 reuses it.
**Warning signs:** `updater.log`: "provider" errors, or checks that never reach GitHub.

### Pitfall 6: Assuming dev inertness needs proving beyond the guard
**What goes wrong:** Over-engineering a "dev mode" branch inside electron-updater.
**Why it happens:** Not knowing electron-updater already self-disables when `!app.isPackaged`.
**How to avoid:** The external `app.isPackaged` guard (D-05) is sufficient and primary; `isUpdaterActive()` returning false in dev is a documented backstop [VERIFIED]. Nothing else needed.

## Code Examples

### The `Logger` interface electron-updater expects (verified — shapes the D-04 logger)
```typescript
// Source: electron-userland/electron-builder — packages/electron-updater/src/types.ts [VERIFIED this session]
export interface Logger {
  info(message?: any): void
  warn(message?: any): void
  error(message?: any): void
  debug?(message: string): void   // OPTIONAL — AppUpdater guards calls with `this._logger.debug != null`
}
```
The zero-dep logger must provide `info`, `warn`, `error`; `debug` is optional. Default when unset is a `NoOpLogger` [VERIFIED: AppUpdater.ts].

### `checkForUpdatesAndNotify()` — what the one call does (verified)
```typescript
// Source: packages/electron-updater/src/AppUpdater.ts [VERIFIED this session]
checkForUpdatesAndNotify(downloadNotification?: DownloadNotification): Promise<UpdateCheckResult | null> {
  return this.checkForUpdates().then(it => {
    if (!it?.downloadPromise) { /* debug-log; return */ return it }
    void it.downloadPromise.then(() => {
      const notificationContent = AppUpdater.formatDownloadNotification(
        it.updateInfo.version, this.app.name, downloadNotification)
      new (require("electron").Notification)(notificationContent).show()   // native OS notification
    })
    return it
  })
}
```
Default notification (no arg): title **"A new update is ready to install"**, body mentioning automatic install on exit — acceptable per D-01.

### Defaults confirmed (no override — D-08)
```typescript
// packages/electron-updater/src/AppUpdater.ts [VERIFIED this session]
autoDownload = true
autoInstallOnAppQuit = true
autoRunAppAfterInstall = true
```

### Dev inertness backstop (verified)
```typescript
// packages/electron-updater/src/AppUpdater.ts [VERIFIED this session]
public isUpdaterActive(): boolean {
  const isEnabled = this.app.isPackaged || this.forceDevUpdateConfig
  if (!isEnabled) {
    this._logger.info("Skip checkForUpdates because application is not packed and dev update config is not forced")
    return false
  }
  return true
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Electron built-in `autoUpdater` + Squirrel.Windows | `electron-updater` + electron-builder NSIS + GitHub Releases `latest.yml` | long-standing for electron-builder apps | The project's chosen path; no Squirrel, no signing required for Windows updates |
| `electron-log` auto-wired as `autoUpdater.logger` | zero-dep `fs` logger (this project) | project choice (D-04) | One fewer runtime dep; tiny interface makes it trivial |
| electron-updater 4.x/5.x | 6.x (pairs with electron-builder 26.x) | 2024→2026 | API used here (`checkForUpdatesAndNotify`, `logger`, defaults) stable across 5→6 |

**Deprecated/outdated:**
- `electron-updater@7.0.0-alpha.4` — pre-release (`next` dist-tag); **do not use**.
- Passing a GitHub `token` to read a **public** feed — unnecessary; tokens are for publishing (Phase 8).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | An explicit `publish` block is *recommended but not strictly required* — repository-field inference can also resolve the GitHub feed | D-07 / Pattern 4 / Pitfall 5 | Low — we recommend adding the explicit block, which removes the ambiguity regardless of inference behavior |
| A2 | electron-updater 6.8.9 pairs cleanly with electron-builder 26.15.x | Standard Stack | Low — same monorepo, both current `latest`; if a mismatch surfaces, bump to the electron-updater release tagged alongside the installed electron-builder |
| A3 | No `asarUnpack` needed because electron-updater's whole dep tree is pure JS | Supporting / Anti-Patterns | Low — dep list verified (semver/js-yaml/fs-extra/lodash/tiny-typed-emitter — all pure JS); confirm by launching the packaged app |
| A4 | The default notification wording is acceptable and shown by the one call | Code Examples / UPD-02 | Low — verified in source; wording is generic but D-01 accepts it |

## Open Questions (RESOLVED)

1. **Is end-to-end auto-update verifiable within Phase 7?** — **RESOLVED:** No, and by design — Phase 7's acceptance excludes the end-to-end proof (deferred to Phase 8's two-release gate).
   - What we know: the feed (`latest.yml` + assets) is produced by **Phase 8**; Phase 7 only consumes it.
   - What's unclear: nothing blocking — this is by design.
   - Recommendation: Phase 7's acceptance is (a) automated static checks (deps placement, external[], guard present, publish block) + (b) a manual packaged-launch check that the app runs normally and writes `updater.log` (a logged "no feed / 404" is expected and correct pre-Phase-8). The "an update actually downloads and installs" proof belongs to Phase 8's two-release validation.

2. **Does producing `app.asar` to assert electron-updater is inside it require Windows/Wine?** — **RESOLVED:** Run the asar-contents assertion on the Windows/CI build host; keep the Linux-host automated gate to static config assertions.
   - What we know (from Phase 6): the NSIS installer + rcedit stamping need Wine on Linux; asar packing itself is cross-platform, but `electron-builder --dir` for a Windows target still invokes rcedit.
   - Recommendation: run the "asar physically contains `node_modules/electron-updater`" assertion on the machine/CI that builds the package (developer's Windows box or Phase 8 `windows-latest`), via `npx asar list release/win-unpacked/resources/app.asar`. On the Linux dev host, keep the automated gate to static config assertions (deps/external/guard/publish).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | build:electron, tests | ✓ | v22.x | — |
| electron-updater | UPD-01/02/03 runtime | ✗ (not installed) | — | `npm i --save electron-updater@^6.8.9` |
| electron (runtime host) | packaged app | devDep pins `43.0.0` (may need `npm ci`) | 43.0.0 | `npm ci` |
| electron-builder | bakes `app-update.yml`; Phase 8 feed | devDep `^26.15.3` | 26.x | `npm ci` |
| GitHub Releases feed (`latest.yml`) | actual update download | ✗ (produced in Phase 8) | — | **None** — expected; Phase 7 tolerates absence (logged, non-blocking) |
| Wine (to produce the Windows `.exe`/`--dir`) | asar-contains-electron-updater physical check | ✗ on Linux host | — | Build/verify on Windows or Phase 8 `windows-latest` |
| GitHub token | reading a **public** feed | not needed | — | none needed (publish token is Phase 8) |

**Missing dependencies with no fallback:**
- The **Releases feed** does not exist until Phase 8 — this is by design; Phase 7 must tolerate its absence (D-03). Not a blocker.
- **Wine** on the Linux host — no fallback for producing/inspecting the actual asar locally; do that physical check on Windows/CI (same structural constraint as Phase 6).

**Missing dependencies with fallback:**
- electron-updater → `npm i --save electron-updater@^6.8.9`.
- electron / electron-builder → `npm ci`.

## Validation Architecture

*(nyquist_validation enabled — key present and `true` in config.json.)*

Much of this phase's correctness is only observable **after packaging** (electron-updater physically in `app.asar`) or **across two published releases** (Phase 8). The strategy splits into cross-platform static assertions (the green gate) and packaged/Windows manual gates.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` run via `tsx` [VERIFIED: package.json `"test": "tsx --test 'test/**/*.test.ts'"`] |
| Config file | none — glob-driven; `c8` for coverage |
| Quick run command | `npm test` |
| Full suite command | `npm test` + `npm run typecheck` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command (any OS) | File Exists? |
|--------|----------|-----------|----------------------------|--------------|
| UPD-03 / D-06 | electron-updater is in `dependencies`, NOT `devDependencies` | unit | assert `require('./package.json').dependencies['electron-updater']` set && not in `devDependencies` | ❌ Wave 0 |
| UPD-01/02 / D-06 | esbuild `external[]` includes `electron-updater` | unit | read `scripts/build.mjs`, assert its `external` array contains `'electron'` and `'electron-updater'` | ❌ Wave 0 |
| UPD-03 / D-05 | updater seam is guarded by `app.isPackaged` and not called at top level | unit | static assert: `electron/main.ts` calls the init only inside an `app.isPackaged` branch (grep/AST); `electron/updater.ts` is not imported at module top of main | ❌ Wave 0 |
| D-03 | an `error` listener is attached (no-throw safety) | unit | static assert `electron/updater.ts` registers `autoUpdater.on('error', …)` and `.catch(` on the check | ❌ Wave 0 |
| D-07 | `electron-builder.json` publish resolves to github/jmptr/mv2-save-editor | unit | parse `electron-builder.json`, assert `publish[0].provider==='github'`, `owner==='jmptr'`, `repo==='mv2-save-editor'` | ❌ Wave 0 |
| D-04 | logger object satisfies the Logger interface (info/warn/error present) | unit | import the logger factory from `electron/updater.ts`; assert it returns `{info,warn,error}` functions (call them against a tmp path, assert file written) | ❌ Wave 0 |
| UPD-03 | dev/unpackaged run is inert — no updater.log, no throw | integration (dev) | run `electron .` (or a harness that sets `app.isPackaged=false`); assert no `updater.log` created and process does not throw | ❌ Wave 0 (may be manual) |
| Success criterion 4 | `electron-updater` physically present inside `app.asar` (not pruned) | **manual / CI (packaged)** | `npx asar list release/win-unpacked/resources/app.asar \| grep node_modules/electron-updater` on the build host | manual gate |
| UPD-01/02 | packaged app launches normally; `updater.log` written; logged feed-miss is non-blocking (pre-Phase-8) | **manual (Windows)** | install/run the app, confirm the editor loop works and `updater.log` exists | manual gate |
| UPD-01/02 (end-to-end) | a newer published release downloads + notifies + installs on quit | **manual — deferred to Phase 8** | Phase 8 two-release validation | Phase 8 gate |

### Sampling Rate
- **Per task commit:** `npm test` (static config/seam assertions run <30s on any OS).
- **Per wave merge:** `npm test` + `npm run typecheck`.
- **Phase gate:** all automated assertions green, **plus** the manual packaged checks (asar-contains-electron-updater; packaged app launches + writes `updater.log`) recorded as a verification note on the build host. End-to-end update download/install is explicitly a Phase 8 gate — Phase 7 is not blocked on it.

### Wave 0 Gaps
- [ ] `test/updater.packaging.test.ts` — asserts electron-updater in `dependencies` (not devDeps); `scripts/build.mjs` `external` includes `electron-updater`; `electron-builder.json` `publish` block correct (covers D-06/D-07, success criterion 4 static slice).
- [ ] `test/updater.seam.test.ts` — static/AST assertions that `main.ts` gates init behind `app.isPackaged`, and `updater.ts` attaches `on('error')` + `.catch` (covers UPD-03/D-03/D-05).
- [ ] `test/updater.logger.test.ts` — imports the logger factory, writes to a tmp `logs` dir, asserts `info/warn/error` produce lines and never throw (covers D-04).
- [ ] Manual gate note in the plan: `npx asar list …/app.asar` on Windows/CI proves electron-updater is in the asar (the packaging analogue of Phase 6's Windows install check).

## Security Domain

*(security_enforcement enabled, ASVS level 1. Main-process-only; the phase adds a **network fetch of a public GitHub feed** and **executes a downloaded installer** — the notable new surface.)*

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V10 Malicious Code / Supply Chain | yes | Pin `electron-updater@^6.8.9` from `electron-userland`; commit lockfile; SUS verdict is blocked-telemetry false positive; no postinstall |
| V1/V14 Config & Build | yes | electron-updater in `dependencies` + esbuild `external`; explicit `publish` block; asar auto-includes prod deps |
| V6 Cryptography (update integrity) | yes | electron-updater verifies the downloaded file's **SHA512** against `latest.yml` before install (built-in). On Windows, unsigned builds skip publisher-signature checks — accepted per REQUIREMENTS Out-of-Scope (no code signing) |
| V9 Communications | yes | Feed + assets fetched over **HTTPS** from GitHub (electron-updater default); no plaintext channel |
| V5 Input Validation | partial | The "input" is the remote `latest.yml` + installer; integrity is the SHA512 check. No user-supplied input crosses into the updater |
| V2/V3/V4 Auth/Session/Access | no | Local tool; reading a public feed needs no auth |

### Known Threat Patterns for electron-updater / GitHub-Releases
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Tampered update binary | Tampering | electron-updater's built-in **SHA512 verification** against `latest.yml` before applying |
| MITM of the feed/asset | Tampering / Info Disclosure | HTTPS-only fetch from GitHub (default); no `setFeedURL` to plaintext |
| Unsigned installer → SmartScreen "unknown publisher" | Spoofing (user trust) | **Accepted & documented** (REQUIREMENTS Out-of-Scope; code signing deferred to v2 DIST-03). Update mechanism itself works unsigned on Windows |
| Malicious/typo'd dependency | Tampering / Elevation | Single canonical dep from `electron-userland`; lockfile pinned; no other npm deps added (logger is in-repo) |
| Updater error crashes/DoSes the editor | Denial of Service | `on('error')` listener + `.catch` swallow failures (D-03); dev fully inert via `app.isPackaged` (D-05) |

The hardened `BrowserWindow` (contextIsolation/sandbox/no-nodeIntegration, loadFile-only, denied navigation) is **untouched** — the updater is entirely main-side with no renderer/IPC surface, so the existing trust boundary is unchanged.

## Sources

### Primary (HIGH confidence)
- `electron-userland/electron-builder` master — `packages/electron-updater/src/AppUpdater.ts` (checkForUpdatesAndNotify body; `autoDownload`/`autoInstallOnAppQuit`/`autoRunAppAfterInstall = true`; `isUpdaterActive()` app.isPackaged skip; NoOpLogger default; event list) [VERIFIED via raw.githubusercontent.com this session]
- `electron-userland/electron-builder` master — `packages/electron-updater/src/types.ts` (exact `Logger` interface; `debug?` optional) [VERIFIED this session]
- `npm view electron-updater` — dist-tags `latest: 6.8.9`, `next: 7.0.0-alpha.4`; deps tree (semver/js-yaml/fs-extra/lodash/tiny-typed-emitter/builder-util-runtime@9.7.0); repo `github.com/electron-userland/electron-builder` [VERIFIED this session]
- [Application Contents — electron-builder](https://www.electron.build/docs/contents/) — `package.json` + `node_modules/**/*` (production only) always included regardless of custom `files` patterns [VERIFIED via WebSearch of the docs page]
- Local repo: `package.json`, `electron-builder.json`, `electron/main.ts`, `scripts/build.mjs`, Phase 6 RESEARCH/CONTEXT, config.json [VERIFIED this session]
- `gsd-tools query package-legitimacy check` — electron-updater signals [VERIFIED this session]

### Secondary (MEDIUM confidence)
- [publish — electron-builder](https://www.electron.build/docs/publish/) — GitHub provider derives owner/repo from `repository`/`.git/config`; explicit block optional (docs site 403s the direct fetcher; via WebSearch)
- [Publishing and Updating — Electron](https://www.electronjs.org/docs/latest/tutorial/tutorial-publishing-updating) — GitHub feed detection from `package.json` repository

### Tertiary (LOW confidence)
- Default notification exact body text — verified as a title string in source; full body wording taken from the `formatDownloadNotification` summary, not a byte-exact quote. Neutralized: D-01 accepts the generic wording.

## Metadata

**Confidence breakdown:**
- Standard stack / version pin: HIGH — electron-updater 6.8.9 + deps verified via npm; monorepo pairing with electron-builder 26.x confirmed by shared repo URL.
- API surface & defaults (checkForUpdatesAndNotify, autoDownload/autoInstallOnAppQuit, Logger interface, isUpdaterActive): HIGH — read directly from electron-updater master source this session.
- node_modules-in-asar mechanic (success criterion 4): HIGH — electron-builder Application Contents docs confirm production deps + package.json are always included regardless of `files`.
- Publish-block necessity (D-07): MEDIUM — inference works but explicit block recommended for determinism (A1).
- Post-package physical asar check: MEDIUM — cross-platform Wine constraint inherited from Phase 6; run on Windows/CI.

**Research date:** 2026-07-18
**Valid until:** ~2026-08-17 (30 days — electron-updater 6.x is stable; re-check if a 7.x stable ships before Phase 8)
