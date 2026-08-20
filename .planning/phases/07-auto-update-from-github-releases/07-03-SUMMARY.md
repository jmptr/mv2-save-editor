---
phase: 07-auto-update-from-github-releases
plan: 03
subsystem: infra
tags: [electron-updater, auto-update, windows, packaging, asar, acceptance-gate]

# Dependency graph
requires:
  - phase: 07-01
    provides: electron-updater dependency + esbuild external + github publish block
  - phase: 07-02
    provides: electron/updater.ts seam + app.isPackaged guard in main.ts
provides:
  - Manual Windows acceptance PASS — packaged app produced on native Windows; electron-updater physically present in app.asar; installed app runs the full editor loop; updater.log written with a silent/logged feed miss
  - Runtime confirmation of UPD-01/UPD-02/UPD-03 that the any-OS static tests cannot observe
affects: [08-release-ci]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Manual Windows package-and-run gate as the runtime analogue of the any-OS static seam tests (mirrors 06-03)"
    - "electron-updater ships inside app.asar as a production dependency (not pruned); dev runs stay inert via app.isPackaged"

key-files:
  created:
    - .planning/phases/07-auto-update-from-github-releases/07-03-SUMMARY.md
  modified: []

key-decisions:
  - "End-to-end update download/install is intentionally NOT tested here — it requires two sequential published Releases and is the Phase 8 two-release validation gate"
  - "A logged feed-404 / 'no published versions' on every Phase 7 packaged launch is EXPECTED and CORRECT (the Releases feed does not exist until Phase 8), not a failure (D-03 / Pitfall 2)"

patterns-established:
  - "Windows-only runtime truths (UPD-01/02/03 runtime slice) are verified by a human gate on native Windows (electron-builder needs absent Wine to produce/inspect the .exe/asar on the Linux/WSL2 dev host — constraint inherited from Phase 6)"

requirements-completed: [UPD-01, UPD-02, UPD-03]

coverage:
  - id: D1
    description: "electron-updater is physically present inside app.asar (node_modules/electron-updater/…) after packaging — not pruned (success criterion 4)"
    requirement: "UPD-01"
    verification:
      - kind: manual_procedural
        ref: "Developer ran `npm ci` + `npm run package` on native Windows, then `npx asar list release\\win-unpacked\\resources\\app.asar` — confirmed node_modules/electron-updater/ entries present in the asar (production dependency was not pruned)"
        status: pass
    human_judgment: true
    rationale: "Producing and inspecting the .exe/app.asar requires electron-builder's Windows toolchain (rcedit/makensis need Wine, absent on the Linux/WSL2 dev host) — the asar contents can only be observed on Windows"
  - id: D2
    description: "The installed packaged app launches and runs the full load -> browse/search -> edit -> preview -> write loop identically to the dev build (UPD-01/02 do not break startup)"
    requirement: "UPD-02"
    verification:
      - kind: manual_procedural
        ref: "Developer installed the produced MV2 Save Editor Setup 1.1.0.exe and exercised the full editor loop — app launched with no crash/error dialog; the guarded updater seam did not break startup"
        status: pass
    human_judgment: true
    rationale: "Runtime behavior of the installed, asar-packed app with the live updater seam can only be observed by running it on Windows"
  - id: D3
    description: "updater.log is written under app.getPath('logs'); a feed miss (no Releases feed until Phase 8) is logged silently and does NOT interrupt/block/crash the editor (UPD-03 / D-03)"
    requirement: "UPD-03"
    verification:
      - kind: manual_procedural
        ref: "Developer confirmed updater.log exists under %APPDATA%\\MV2 Save Editor\\logs\\updater.log with a logged update-check attempt and a silent/logged feed error (no published release yet); the editor ran normally throughout"
        status: pass
    human_judgment: true
    rationale: "The updater's launch check, log write, and swallow-feed-miss behavior are runtime observations of the packaged app that cannot be automated on the Linux dev host"

# Metrics
duration: 3min
completed: 2026-07-18
status: complete
---

# Phase 7 / Plan 03: Windows/CI Packaged Acceptance Gate Summary

**Windows acceptance PASSED — a native-Windows `npm run package` produced the installer with `electron-updater` physically inside `app.asar`; the installed app ran the full editor loop and wrote `updater.log`, with the absent-feed error logged silently and non-blockingly.**

## Performance

- **Duration:** ~3 min (result recording; the manual package/install/run was performed by the developer on native Windows)
- **Completed:** 2026-07-18T18:39:33Z
- **Tasks:** 1 (blocking-human Windows/CI acceptance gate)
- **Files modified:** 0 (verification-only plan)

## Accomplishments
- **Success criterion 4 (full runtime proof):** `npx asar list` on the packaged `app.asar` confirmed `node_modules/electron-updater/` is present — the production dependency (07-01) ships inside the asar and was not pruned, so the runtime `require('electron-updater')` inside the guarded seam resolves.
- **UPD-02 runtime:** the installed app launched cleanly and completed the full **load → browse/search → edit → preview → write** loop identically to the dev build — the `app.isPackaged`-guarded updater seam (07-02) did not break startup.
- **UPD-01/UPD-03 runtime:** `updater.log` was written under `app.getPath('logs')`; it recorded a launch update-check whose feed miss (no published Release until Phase 8) was **swallowed and logged**, leaving the editor fully functional — the dual-channel error trap (`on('error')` + `.catch()`) behaved as designed (D-03).
- Confirms the whole Phase 7 chain end-to-end on the target OS: dependency wiring (07-01) + guarded seam (07-02) → a packaged app that self-checks on launch and stays inert-on-failure.

## Task Commits

This plan is verification-only — the developer-attested Windows acceptance result is recorded in this SUMMARY (no code changes were required; the Wave 1 static tests and this runtime gate both passed on the first packaged build).

## Files Created/Modified
- `.planning/phases/07-auto-update-from-github-releases/07-03-SUMMARY.md` — records the Windows acceptance result.

## Decisions Made
- **End-to-end update apply is out of scope here** — proving an update actually downloads + installs requires two sequential published Releases; that is the Phase 8 two-release validation gate.
- **A logged feed-404 / "no published versions" is expected and correct** on every Phase 7 packaged launch — the Releases feed does not exist until Phase 8; the gate verifies the miss is silent + non-blocking, not that an update applies.

## Deviations from Plan

None — the gate passed on the first native-Windows packaged build. No mid-gate defects were surfaced (unlike Phase 6's 06-03, which required the PNG-icon and `--win` fixes; those fixes carried forward, so this package ran clean).

## Supply-chain note

The only new runtime dependency, `electron-updater@^6.8.9`, passed its blocking-human legitimacy gate (07-01 Task 1, developer-approved) before install and is now proven physically present in the shipped asar.

---
