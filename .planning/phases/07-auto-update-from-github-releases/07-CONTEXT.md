# Phase 7: Auto-Update from GitHub Releases - Context

**Gathered:** 2026-07-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire `electron-updater` into the packaged app so that, on launch, it checks the GitHub Releases
feed for `jmptr/mv2-save-editor`, downloads a newer published version in the background, notifies the
user it is ready, and installs it on quit — while staying completely inert in dev/unpackaged runs.
This phase adds only the main-process updater seam (init + guard + logger), the `electron-updater`
runtime dependency, and the esbuild `external` wiring that keeps it resolvable inside `app.asar`.

**In scope:** electron-updater runtime dependency; a main-process updater seam called on launch behind
an `app.isPackaged` guard; native "update ready" notification; silent+logged failure handling; a
zero-dep updater log file; the esbuild `external[]` + `dependencies` wiring so electron-updater ships
physically inside `app.asar` (not pruned) and resolves at runtime.

**Out of scope (later phases / milestone):** the CI workflow that actually publishes `latest.yml` +
installer + `.blockmap` to a Release (Phase 8 — Phase 7 only *consumes* the feed); in-app update UI
(progress bar, release notes — UPDUX-01/02); a manual "Check for updates" menu (UPDUX-03); a "Restart
now" prompt (UPDUX-04); code signing; macOS/Linux.
</domain>

<decisions>
## Implementation Decisions

### Update-Ready Notification (UPD-02)
- **D-01:** Use electron-updater's built-in **`checkForUpdatesAndNotify()`** — a single call performs
  the launch check, background-downloads a newer version, and fires a **native OS notification** when
  the update is downloaded. No custom notification code and no renderer/IPC surface (in-app UI stays
  deferred). The generic built-in wording ("A new version is ready") is acceptable for a solo tester.

### Check Cadence (UPD-01)
- **D-02:** **Launch-only** — check once per run, shortly after the window is ready (call the updater
  from `app.whenReady().then()` after `createWindow()`, inside the `app.isPackaged` guard). No periodic
  in-session re-check: the save editor is opened briefly to make edits, so a per-launch check catches
  updates in practice with the least machinery.

### Failure Handling
- **D-03:** Update failures are **silent to the user, logged only**. Swallow the updater `error` event
  and the `checkForUpdatesAndNotify()` promise rejection, writing them to the updater log. A failed or
  impossible check (offline, GitHub down/rate-limited) must never interrupt, block, or delay the
  editor — it resolves to "no update, carry on."

### Update Logging / Diagnostics
- **D-04:** **No new logging dependency.** Set `autoUpdater.logger` to a tiny **zero-dep, `fs`-based
  file logger** writing to `app.getPath('logs')` (e.g. `updater.log`). This yields a diagnosable log on
  the user's machine (packaged-app console output is invisible) while matching this project's
  established zero-dep pattern (the hand-rolled icon writer). `electron-log` was considered and set
  aside to keep runtime dependencies minimal — electron-updater is the only new runtime dep this phase
  adds.

### Dev Safety (locked by UPD-03)
- **D-05:** The entire updater seam is guarded by **`app.isPackaged`** — it does not run, register
  listeners, download, or throw during `npm start` / `electron .`. The guard wraps the whole seam so
  an unpackaged run has zero updater side effects.

### Packaging Integration (locked mechanical constraints — for researcher/planner)
- **D-06:** `electron-updater` goes in **`dependencies`** (NOT `devDependencies`) so electron-builder
  keeps it physically inside `app.asar` (devDependencies are pruned), AND it is added to esbuild's
  `external` array in `scripts/build.mjs` (`['electron']` → `['electron', 'electron-updater']`) so
  `dist/main.js` resolves it from `node_modules` at runtime instead of bundling it. This is exactly
  ROADMAP success criterion 4 — verify both facts after packaging (present in asar + listed in
  external).
- **D-07:** electron-updater's GitHub provider derives owner/repo from the existing `package.json`
  `repository` field (`github.com/jmptr/mv2-save-editor`); electron-builder generates the
  `latest.yml`/publish config from it. Researcher/planner confirms whether an explicit `publish` block
  in `electron-builder.json` is required for the updater feed to resolve. Producing `latest.yml` + the
  release assets is **Phase 8** — Phase 7 only consumes the feed.
- **D-08:** Keep electron-updater's defaults `autoDownload: true` (background download — UPD-01) and
  `autoInstallOnAppQuit: true` (install-on-quit — UPD-02); they already match the required behavior, so
  no override.

### Claude's Discretion
- Whether the seam lives inline in `electron/main.ts` or in a small `electron/updater.ts` helper — a
  separate module is cleaner but not required.
- Exact updater-log filename/format under `app.getPath('logs')`, and whether to log
  `update-available` / `download-progress` breadcrumbs (diagnostics only, no user surface).
- The exact `electron-updater` version to pin (compatible with electron-builder `26.x`) — researcher
  picks from current npm.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase requirements & success criteria
- `.planning/ROADMAP.md` § "Phase 7: Auto-Update from GitHub Releases" — the goal + 4 success criteria
  (launch check + background download; "update ready" notification + install-on-quit; inert in dev via
  `app.isPackaged`; electron-updater physically in `app.asar` + in esbuild `external[]`). The acceptance bar.
- `.planning/REQUIREMENTS.md` § "Auto-Update (UPD)" — UPD-01/02/03, plus the v1.1 Out-of-Scope table
  (native notification is enough; no in-app UI; no manual check menu; no delta/multi-channel).

### The package this updater embeds into (Phase 6 output)
- `.planning/phases/06-packaging-local-windows-nsis-installer/06-CONTEXT.md` — locked appId
  `com.jmptr.mv2-save-editor` (stable across releases, needed by the updater), version 1.1.0 base for
  the two-release validation.
- `electron-builder.json` — the packaging config the updater builds on (win/nsis block); may need a
  `publish` block for the GitHub provider.
- `package.json` — `repository` field (GitHub provider source), `main: dist/main.js`, version 1.1.0,
  `type: commonjs`; electron-updater must be added under `dependencies`.

### The code the seam hooks into
- `electron/main.ts` — `app.whenReady().then(() => { createWindow(); ... })` at line ~158 is where the
  guarded updater init is called; `app.isPackaged` is the guard.
- `scripts/build.mjs` — `external: ['electron']` at line ~30; add `electron-updater` so main.js resolves
  it from node_modules inside the asar rather than bundling it.

### External (researcher fetches current docs)
- electron-updater docs — `autoUpdater` API, `checkForUpdatesAndNotify()`, `autoUpdater.logger`,
  `autoDownload`/`autoInstallOnAppQuit` defaults, the GitHub provider, and the `app.isPackaged` guard
  pattern. Pin a version compatible with electron-builder `26.x`.
- electron-builder publish / GitHub provider + `latest.yml` format — how the feed the updater reads is
  shaped (the producing side is Phase 8, but the format constrains Phase 7's provider config).

**Note:** `docs/current-skill.md` (the save-format spec) is NOT relevant — auto-update does not touch parsing/writing.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `electron/main.ts` `app.whenReady().then()` block (line ~158) is the natural, single seam for the
  guarded updater init — no new lifecycle wiring needed.
- `app.getPath('logs')` (Electron built-in) is the log destination for the zero-dep file logger — no
  new dependency required.
- `package.json` `repository` already points at `github.com/jmptr/mv2-save-editor`, so the GitHub
  updater provider resolves owner/repo with no extra config.

### Established Patterns
- **Zero-dep ethos:** the icon was hand-rolled (`scripts/make-icon.mjs`, `node:fs`+`node:zlib`) to
  avoid a dependency — the updater logger follows the same pattern (tiny `fs` writer, no electron-log).
- **esbuild `external` seam:** `scripts/build.mjs` already keeps `electron` external and bundles the
  core into `main.js`; electron-updater joins `external` so it stays a real `node_modules` resolution
  at runtime (required for the asar to load it).
- **Guard-before-side-effects:** the app already branches on environment in places; `app.isPackaged`
  wrapping the whole updater seam keeps dev runs inert (UPD-03).

### Integration Points
- Updater init is invoked from `app.whenReady().then()` after `createWindow()`, entirely inside the
  `app.isPackaged` guard.
- `electron-updater` is added to `package.json` `dependencies` AND `scripts/build.mjs` `external[]` —
  both are required for it to ship inside `app.asar` and resolve at runtime (success criterion 4).
- The GitHub Releases feed (owner/repo from `repository`) is consumed here; the assets/`latest.yml` on
  that feed are produced by Phase 8 CI — so end-to-end auto-update is only fully observable across two
  published releases (Phase 8's two-release validation).
</code_context>

<specifics>
## Specific Ideas

- The built-in `checkForUpdatesAndNotify()` native notification is acceptable as-is — no custom wording
  or dialog for v1.1.
- Updater log is a plain `updater.log` under `app.getPath('logs')`, written by a small `fs`-based
  logger set as `autoUpdater.logger`.
</specifics>

<deferred>
## Deferred Ideas

- **In-app update UI** — download progress bar / status in the renderer, release notes shown to the
  user (UPDUX-01/02). Deferred to v1.x/v2; native OS notification is enough for v1.1.
- **Manual "Check for updates" menu item** (UPDUX-03) — the app has no menu yet; check-on-launch covers
  the need. Deferred.
- **"Restart now to apply" prompt** (UPDUX-04) — install-on-quit is the chosen behavior for v1.1.
- **Periodic in-session re-check cadence** — considered during discussion; set aside in favor of
  launch-only (D-02).
- **`electron-log`** — considered as the updater logger; set aside to keep runtime deps minimal in
  favor of a zero-dep file logger (D-04). Revisit if update diagnostics outgrow a plain log file.
- **CI publish-on-tag** (`latest.yml` + assets on the Release, draft-then-publish gate) — Phase 8
  (CI-01/02/03). Required before auto-update is end-to-end observable.

### Reviewed Todos (not folded)
None — no pending todos matched this phase.
</deferred>

---

*Phase: 7-Auto-Update from GitHub Releases*
*Context gathered: 2026-07-18*
