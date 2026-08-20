---
phase: 06-packaging-local-windows-nsis-installer
plan: 03
subsystem: infra
tags: [electron-builder, nsis, windows, packaging, installer, icon, wsl2]

# Dependency graph
requires:
  - phase: 06-01
    provides: build/icon.png source icon (win.icon)
  - phase: 06-02
    provides: electron-builder.json config, package script, electron-builder devDependency
provides:
  - Manual Windows acceptance PASS — installer produced on native Windows; installed app runs the full editor loop
  - Confirmed the packed app.asar resolves preload.js/index.html as siblings of main.js (highest-risk unknown cleared)
affects: [07-auto-update, 08-release-ci]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Manual Windows build-and-run gate as the packaging analogue of v1.0's in-game load check"
    - "package script pins --win so the Windows NSIS target is built regardless of host OS (v1.1 is Windows-only)"

key-files:
  created:
    - .planning/phases/06-packaging-local-windows-nsis-installer/06-03-SUMMARY.md
  modified: []

key-decisions:
  - "Icon source switched from .ico to .png (ec7f5ab) — electron-builder 26.15's icon tool rejects .ico as input; the Windows .ico is generated from the PNG at package time"
  - "package/package:dir scripts pin --win (8aaa260) — without it, electron-builder defaults to the host platform and built Linux snap/AppImage under WSL2 instead of the .exe"

patterns-established:
  - "Windows-only runtime truths (PKG-01/02/03) are verified by a human gate on native Windows (electron-builder needs absent Wine for rcedit/makensis on the Linux/WSL2 dev host)"

requirements-completed: [PKG-01, PKG-02, PKG-03]

coverage:
  - id: D1
    description: "npm run package on native Windows produces release/MV2 Save Editor Setup 1.1.0.exe with NSIS oneClick/perMachine:false (PKG-01)"
    requirement: "PKG-01"
    verification:
      - kind: manual_procedural
        ref: "Native Windows build log (os=10.0.26200, platform=win32): 'building target=nsis file=release\\MV2 Save Editor Setup 1.1.0.exe archs=x64 oneClick=true perMachine=false'; uninstaller + block map produced"
        status: pass
    human_judgment: true
    rationale: "electron-builder needs Wine (absent) to run rcedit + makensis on the Linux/WSL2 host — the .exe can only be produced on Windows; confirmed by the developer's native-Windows build"
  - id: D2
    description: "Installed app runs the full load -> browse/search -> edit -> preview -> write loop; output .sav is not corrupt (PKG-02)"
    requirement: "PKG-02"
    verification:
      - kind: manual_procedural
        ref: "Developer installed the .exe and exercised the full editor loop; asar sibling resolution (preload.js/index.html) confirmed working; written .sav round-trips"
        status: pass
    human_judgment: true
    rationale: "Runtime behavior of the installed, asar-packed app can only be observed by running it on Windows — the core-value corruption check requires a real .sav round-trip"
  - id: D3
    description: "Install is per-user with no UAC, Start Menu shortcut, working uninstaller, and shows the app icon (PKG-03 + PKG-04 runtime)"
    requirement: "PKG-03"
    verification:
      - kind: manual_procedural
        ref: "Developer confirmed per-user install (no admin prompt), Start Menu shortcut, clean uninstall, and the app icon on the installed app"
        status: pass
    human_judgment: true
    rationale: "NSIS install/uninstall behavior and the taskbar/window icon are Windows shell observations that cannot be automated on the Linux/WSL2 dev host"

# Metrics
duration: 2min
completed: 2026-07-18
status: complete
---

# Phase 6 / Plan 03: Manual Windows Build-and-Run Acceptance Summary

**Windows acceptance PASSED — a native-Windows `npm run package` produced `MV2 Save Editor Setup 1.1.0.exe`, and the installed app ran the full editor loop, after two mid-gate fixes (PNG icon source + `--win` target).**

## Performance

- **Duration:** ~2 min (result recording; the manual build/install/test was run by the developer on native Windows)
- **Completed:** 2026-07-18T11:38:26Z
- **Tasks:** 1 (blocking-human Windows acceptance gate)
- **Files modified:** 0 (verification-only plan; the two defects it surfaced were fixed under the phase)

## Accomplishments
- Developer produced `release\MV2 Save Editor Setup 1.1.0.exe` on native Windows (`os=10.0.26200`, `platform=win32`) — the build reached `building target=nsis … oneClick=true perMachine=false` and built the uninstaller + block map (PKG-01, PKG-03 flags).
- The icon step (`icons-bundle.tar.gz`) passed on the real Windows build with no `.ico` error — the PNG source fix holds end-to-end (PKG-04).
- Developer confirmed the runtime acceptance: per-user install (no UAC) + Start Menu shortcut, the installed app shows its icon, the full **load → browse/search → edit → preview → write** loop works and the written `.sav` is not corrupt, and the uninstaller removes the install cleanly (PKG-02/03/04 runtime).
- The single highest-risk unknown — whether the packed `app.asar` resolves `preload.js`/`index.html` as siblings of `main.js` — is **confirmed working** (the installed app ran; no blank window / "not found").

## Task Commits

This plan is verification-only. The two defects it surfaced were fixed under the phase:

1. **Icon-format gap fix** — `ec7f5ab` (fix): switch `win.icon` from `.ico` to a generated-from-PNG source so electron-builder 26.15 can package.
2. **Package-target gap fix** — `8aaa260` (fix): pin `--win` in the `package`/`package:dir` scripts so the Windows NSIS installer is built regardless of host OS (WSL2 was silently building Linux artifacts).

**Plan metadata:** this SUMMARY (docs: complete plan).

## Files Created/Modified
- `.planning/phases/06-packaging-local-windows-nsis-installer/06-03-SUMMARY.md` — records the Windows acceptance result.

## Decisions Made
- **Icon source is a PNG, not a `.ico`** (ec7f5ab): electron-builder 26.15's icon tool only accepts `.png`/`.svg`/`.icns` as input. `scripts/make-icon.mjs` emits a zero-dep 512×512 RGBA `build/icon.png`; electron-builder generates the Windows `.ico` from it at package time.
- **`package` pins `--win`** (8aaa260): electron-builder defaults to the host platform, so under WSL2 the un-flagged script built Linux snap/AppImage. `--win` forces the intended Windows-only target (v1.1 scope; mac/Linux deferred to v2).

## Deviations from Plan

### Auto-fixed Issues

**1. [Manual-gate defect] electron-builder rejected the committed `.ico` at package time**
- **Found during:** Task 1 (manual Windows `npm run package`)
- **Issue:** electron-builder 26.15's icon tool only accepts `.png`/`.svg`/`.icns`; the committed `build/icon.ico` failed the build.
- **Fix:** Regenerated the icon as `build/icon.png` (zero-dep), pointed `win.icon` at it, removed the `.ico`, updated the icon + config tests.
- **Files modified:** scripts/make-icon.mjs, build/icon.png (new), build/icon.ico (removed), electron-builder.json, test/packaging.icon.test.ts, test/packaging.config.test.ts
- **Verification:** build:electron + npm test (281 pass) + typecheck clean; native-Windows build cleared the icon step.
- **Committed in:** ec7f5ab

**2. [Manual-gate defect] `npm run package` built Linux artifacts under WSL2 instead of the Windows installer**
- **Found during:** Task 1 (manual `npm run package` in WSL2)
- **Issue:** No `--win` flag → electron-builder defaulted to the host platform (Linux/WSL2) and built snap + AppImage, not the `.exe`.
- **Fix:** Pinned `--win` in `package` and `package:dir`; added a config-test assertion that the package script contains `--win`.
- **Files modified:** package.json, test/packaging.config.test.ts
- **Verification:** npm test (281 pass) + typecheck clean; native-Windows run then produced `MV2 Save Editor Setup 1.1.0.exe`.
- **Committed in:** 8aaa260

---

**Total deviations:** 2 (both manual-gate defects, fixed under the phase).
**Impact on plan:** Both fixes were required for PKG-01 packaging to work. No scope creep — the icon remains a throwaway placeholder (D-03), swappable by replacing one file.

## Issues Encountered
- The `.exe` could not be produced on the Linux/WSL2 dev host (electron-builder needs absent Wine for rcedit/makensis), so this gate ran on native Windows as designed.
- Observation (non-blocking): electron-builder invoked `signtool.exe` on the exe/uninstaller. v1.1 accepts an unsigned build (SmartScreen "unknown publisher" click-through documented); actual signing, if a cert is configured on the dev machine, is a bonus, not a requirement.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Phase 6 packaging is proven end-to-end on native Windows: a single `npm run package` yields a working per-user NSIS installer whose installed app behaves identically to dev.
- Ready for **Phase 7 (Auto-Update from GitHub Releases)** — the produced installer + `productName`/`appId`/version 1.1.0 foundation is the substrate electron-updater builds on.

---
*Phase: 06-packaging-local-windows-nsis-installer*
*Completed: 2026-07-18*
