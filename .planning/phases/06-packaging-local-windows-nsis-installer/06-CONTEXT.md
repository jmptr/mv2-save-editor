# Phase 6: Packaging — Local Windows NSIS Installer - Context

**Gathered:** 2026-07-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Wrap the already-built esbuild `dist/` into a per-user Windows NSIS `.exe` using electron-builder,
so the installed app runs the full load → browse/search → edit → preview → write loop identically to
the dev build. This phase adds only a package step (electron-builder + config + npm script), an
application icon asset, and distribution metadata (appId, product name, version). It does **not**
touch the v1.0 Electron/esbuild source or build — electron-builder consumes `dist/` as-is and never
recompiles TypeScript.

**In scope:** electron-builder dependency + config, NSIS per-user installer, app icon, appId/product
name/version, `npm run package` script, output to `release/`.

**Out of scope (later phases / milestone):** auto-update wiring (Phase 7), CI publish-on-tag
(Phase 8), code signing, macOS/Linux packaging, in-app update UI.
</domain>

<decisions>
## Implementation Decisions

### App Identity
- **D-01:** Product name is **`MV2 Save Editor`** — becomes the installer filename
  (`MV2 Save Editor Setup 1.1.0.exe`), the Start Menu shortcut label, and the install-folder name.
- **D-02:** appId is **`com.jmptr.mv2-save-editor`** — reverse-DNS from the GitHub owner (`jmptr`).
  This is the Windows AppUserModelID and is reused by the electron-updater seam in Phase 7, so it
  must stay stable across releases.

### Application Icon
- **D-03:** No icon asset exists in the repo today. Generate a **simple placeholder `.ico`** (an
  "MV2" monogram / glyph-based mark) as a multi-size Windows `.ico`, committed to the repo, and wire
  it as the electron-builder `win.icon` (and, where it helps, the `BrowserWindow` `icon`). This
  satisfies PKG-04 now; a nicer icon can be dropped in later by replacing the single file — no config
  change needed. Store it at a stable path (e.g. `build/icon.ico` — electron-builder's default
  `buildResources` location; confirm exact path in planning).

### Version
- **D-04:** Bump `package.json` version from `1.0.0` to **`1.1.0`** in this phase. Rationale: the
  installer name embeds the version, and the entire Phase 7/8 updater chain (two-release validation
  `1.1.0` → `1.1.1`) needs a clean, milestone-aligned base to start from. Doing the bump here keeps
  the version story coherent from the first packaged artifact.

### Package Script Ergonomics
- **D-05:** `npm run package` chains **`build:electron && electron-builder`** so a single command
  always produces a working installer, even from a clean checkout. This does not violate "package the
  existing `dist/`" — esbuild (via `build:electron`) does the TS compile, then electron-builder wraps
  the resulting `dist/` without recompiling anything itself. (If planning finds value in also exposing
  a bare `electron-builder`-only script for CI reuse in Phase 8, that's fine as an additional script,
  but the primary `package` script is the chained convenience form.)

### Claude's Discretion
- Where the electron-builder config lives (a `build` key in `package.json` vs a standalone
  `electron-builder.yml`/`.json`) — researcher/planner picks the idiomatic option for a small solo
  project. Both are acceptable.
- The exact `files` globs, asar on/off, and how `directories.output` / `directories.buildResources`
  are set — mechanical config. Constraints that ARE locked: output must land in `release/` (not the
  esbuild-owned `dist/`), and the packaged asar must resolve `preload.js` + `index.html` as siblings
  of `dist/main.js` (already true given `scripts/build.mjs` emits them side-by-side).
- Whether `release/` is added to `.gitignore` (it currently is not) — recommended yes; planner's call.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase requirements & success criteria
- `.planning/ROADMAP.md` § "Phase 6: Packaging — Local Windows NSIS Installer" — the 4 success
  criteria (single `npm run package` → `release/…Setup X.Y.Z.exe`; installed app runs the full loop;
  per-user `oneClick`/`perMachine:false` install with Start Menu shortcut + uninstaller; app icon +
  appId + product name). These are the acceptance bar.
- `.planning/REQUIREMENTS.md` § "Packaging (PKG)" — PKG-01..04, plus the v1.1 Out-of-Scope table
  (unsigned is accepted; no macOS/Linux; no in-app update UI).

### The build this phase wraps
- `scripts/build.mjs` — the esbuild build that emits `dist/{main,preload,renderer}.js` + `index.html`
  as siblings. electron-builder packages this output; do not modify the build.
- `package.json` — `main: dist/main.js`, current version `1.0.0` (→ bump to `1.1.0`), scripts
  (`build:electron`, `start`); no `electron-builder` dep yet, no `package` script yet.
- `electron/main.ts` — the main process / `BrowserWindow` (line ~137); currently sets no `icon`,
  `productName`, or `appId`.

### External (researcher fetches current docs)
- electron-builder Windows/NSIS configuration — the authoritative source for `nsis` options
  (`oneClick`, `perMachine`, `createStartMenuShortcut`), `win.icon`, `appId`, `productName`,
  `directories.output`, and `files`. Pin against electron-builder `26.x` (per PROJECT.md stack note).

**Note:** `docs/current-skill.md` (the save-format spec) is NOT relevant to this phase — packaging
does not touch parsing/writing.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/build.mjs` produces a package-ready `dist/` with all runtime files as siblings — no build
  changes needed; electron-builder just consumes it.
- `package.json` already has `homepage`/`repository`/`bugs` pointing at `github.com/jmptr/mv2-save-editor`,
  which electron-builder can reuse for the `publish` block that Phase 7/8 will need (out of scope now,
  but the repo metadata is already correct).

### Established Patterns
- Renderer deps (`react`, `react-dom`, `@tanstack/react-virtual`) are **bundled into `dist/renderer.js`
  by esbuild**, so they do not need to ship in `node_modules` inside the asar — the `files` set can be
  lean (`dist/**` + `package.json`). `electron` stays external as the runtime host.
- App is CommonJS (`type: "commonjs"`), Electron 43 (bundles Node 22). electron-builder `26.x` targets
  this cleanly.

### Integration Points
- electron-builder reads `main: dist/main.js` from `package.json` as the app entry — already set.
- `main.ts`'s `path.join(__dirname, 'preload.js' | 'index.html')` resolution (RESEARCH Pitfall 2 from
  Phase 4) is what makes the asar work; the sibling layout in `dist/` preserves it. Verify PKG-02 by
  actually launching the installed app through the full loop.
</code_context>

<specifics>
## Specific Ideas

- Installer artifact name should read `MV2 Save Editor Setup 1.1.0.exe` in `release/`.
- Placeholder icon: an "MV2" monogram is fine for now — intentionally a throwaway to unblock PKG-04,
  explicitly swappable later by replacing one file.
</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Auto-update, CI publish, and code signing were raised
only as the reason appId/version must be chosen carefully now; they remain Phase 7/8 and v2 work.)
</deferred>

---

*Phase: 6-Packaging — Local Windows NSIS Installer*
*Context gathered: 2026-07-09*
