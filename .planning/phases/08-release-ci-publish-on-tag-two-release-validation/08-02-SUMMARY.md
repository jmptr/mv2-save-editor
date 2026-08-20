---
phase: 08-release-ci-publish-on-tag-two-release-validation
plan: 02
subsystem: infra
tags: [release-ci, electron-updater, auto-update, github-releases, windows, acceptance-gate, sc4]

# Dependency graph
requires:
  - phase: 08-01
    provides: .github/workflows/release.yml (v* tag → windows-latest publish) + static workflow/lockfile test
  - phase: 07-02
    provides: electron/updater.ts seam + app.isPackaged guard (the client that self-updates)
provides:
  - Runtime acceptance PASS — a real v* tag push builds + publishes a draft GitHub Release on windows-latest; an installed client self-updates across two sequential published releases (SC4)
  - End-to-end confirmation of CI-01/CI-02 runtime and the two-release self-update the any-OS static tests cannot observe
affects: [milestone-v1.1-close]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pre-create the GitHub draft release (gh release create --draft) before electron-builder publishes, so parallel asset uploads reuse ONE release instead of racing into duplicate drafts"
    - "Auto-update over GitHub Releases requires a PUBLIC repo (or an embedded token): electron-updater reads releases.atom unauthenticated"

key-files:
  created:
    - .planning/phases/08-release-ci-publish-on-tag-two-release-validation/08-02-SUMMARY.md
  modified:
    - package.json
    - package-lock.json
    - test/packaging.config.test.ts
    - .github/workflows/release.yml

key-decisions:
  - "Repository made PUBLIC to enable auto-update — electron-updater fetches releases.atom without auth, which 404s on a private repo (the observed HttpError 404). This was an unplanned but necessary transport decision for UPD/CI to function end-to-end."
  - "Duplicate-draft race fixed by pre-creating the draft release in the workflow before electron-builder (first publish produced two drafts with split assets)."
  - "Version=Tag invariant enforced by the lockstep 1.1.0→1.1.1 bump across package.json + package-lock.json + both version-coupled sites in test/packaging.config.test.ts, committed together with npm test green."

patterns-established:
  - "Two-release self-update (SC4) is a human Windows gate: it is only observable across two sequential PUBLISHED GitHub Releases with a real installed client."

requirements-completed: [CI-01, CI-02, CI-03]

coverage:
  - id: SC4
    description: "An installed v1.1.0 client detects, downloads, and applies the published v1.1.1 update and relaunches as v1.1.1"
    requirement: "CI-01/CI-02/CI-03 (runtime), auto-update end-to-end"
    verification:
      - kind: manual_procedural
        ref: "updater.log (Windows): 'Found version 1.1.1' → 'update-available 1.1.1' → 'update-downloaded 1.1.1' → 'Auto install update on quit' (silent, --updated /S). Post-relaunch check: 'Update for version 1.1.1 is not available (latest version: 1.1.1)' — the running app is now 1.1.1."
        status: pass
    human_judgment: true
    rationale: "Download+install+relaunch of the packaged Windows app can only be observed on Windows across two real published releases."
  - id: CI-01-runtime
    description: "A real v* tag push runs the workflow on windows-latest and packages after building"
    requirement: "CI-01"
    verification:
      - kind: manual_procedural
        ref: "Actions run #2 (tag v1.1.1, windows-latest): checkout → setup-node 22 → npm ci → build:electron → electron-builder publish, conclusion success. Run #1 did the same for v1.1.0."
        status: pass
    human_judgment: true
    rationale: "Runner OS + real tag trigger are observable only on GitHub Actions, not on the Linux dev host."
  - id: CI-02-runtime
    description: "electron-builder publishes .exe + latest.yml + .blockmap to a GitHub Release using contents:write + GH_TOKEN"
    requirement: "CI-02"
    verification:
      - kind: manual_procedural
        ref: "Published v1.1.1 release assets: MV2-Save-Editor-Setup-1.1.1.exe (103 MB), latest.yml (359 B), MV2-Save-Editor-Setup-1.1.1.exe.blockmap (108 KB). No 403 → contents:write + GH_TOKEN correct."
        status: pass
    human_judgment: true
  - id: CI-03-gate
    description: "The release is created as a DRAFT; a human publishes it (no forced auto-publish)"
    requirement: "CI-03"
    verification:
      - kind: manual_procedural
        ref: "Both v1.1.0 and v1.1.1 were created as drafts by the workflow and manually published by the developer (draft=false observed only after manual Publish)."
        status: pass
    human_judgment: true
    rationale: "The draft→manual-publish gate held. NOTE: the stronger 'updater ignores a DRAFT' micro-proof was inconclusive this run — the repo was private during the draft window, so the client 404'd on the feed regardless of draft state; by the time the repo was public, v1.1.1 was already published."

# Metrics
duration: ~2h (spanning real CI runs, release publishing, and Windows self-update observation)
completed: 2026-08-20
status: complete
---

# Phase 8 / Plan 02: Two-Release Validation (SC4) — Acceptance Gate Summary

**SC4 PASSED end-to-end.** A real `v1.1.1` tag push built and published a draft GitHub Release on `windows-latest`; the installed **v1.1.0** client detected, downloaded, applied, and relaunched as **v1.1.1** — proven by `updater.log`. This closes the runtime half of CI-01/02/03 and the whole reason auto-update lives in Phase 8 (it is only observable across two sequential published releases).

## Accomplishments
- **SC4 (headline):** installed v1.1.0 → published v1.1.1 self-update observed on Windows. Log trace: `Found version 1.1.1` → `update-available 1.1.1` → `update-downloaded 1.1.1` → `Auto install update on quit` (silent `--updated /S`); post-relaunch the app reports current version **1.1.1** (`Update for version 1.1.1 is not available (latest version: 1.1.1)`).
- **CI-01/02 runtime:** two real tag pushes (`v1.1.0`, `v1.1.1`) ran the workflow green on `windows-latest` (checkout → setup-node 22 → `npm ci` → `build:electron` → electron-builder publish), each producing a draft Release with `.exe` + `latest.yml` + `.blockmap`. No 403 → `contents: write` + `GH_TOKEN` correct.
- **CI-03 gate:** both releases were created as drafts and manually published by the developer — nothing auto-published.
- **Version=Tag invariant:** lockstep `1.1.0 → 1.1.1` bump across `package.json`, `package-lock.json`, and **both** version-coupled sites in `test/packaging.config.test.ts` (the `pkg.version` assertion and the hardcoded installer-name literal), committed together with `npm test` green (300) and typecheck clean.

## Task Commits
- `7cf9651` — `chore(release): bump 1.1.0 → 1.1.1 for the second release` (package.json + package-lock.json + test lockstep). Landed on `main` via PR #3.
- `b09d692` — `fix(release): pre-create draft release to stop electron-builder duplicate drafts` (workflow hardening + test). Landed on `main` via PR #2. (Mid-gate fix — see Deviations.)

## Deviations from Plan (mid-gate defects surfaced and resolved)
1. **Duplicate draft releases (electron-builder race).** The first `v1.1.0` publish produced TWO drafts with the assets split across them (consecutive release IDs, one workflow run) — electron-builder races when no release for the tag exists yet. Fixed by adding a pre-create step (`gh release view || gh release create --draft`) before the electron-builder publish so uploads reuse one release. The `v1.1.1` run then produced exactly one clean draft. The pre-existing `v1.1.0` duplicate was consolidated/deleted manually.
2. **Private-repo blocker for auto-update (unplanned architectural finding).** With the repo private, the installed client got `HttpError: 404` on `https://github.com/jmptr/mv2-save-editor/releases.atom` — electron-updater reads that feed unauthenticated. **Resolution: the repository was made public**, after which the update flow worked with no code change. Phase 7/8 planning did not capture that GitHub-Releases auto-update requires a public repo (or an embedded token, which is a leak risk for a distributed app). Recorded as a milestone-level decision.
3. **v1.1.0 blockmap missing → differential fallback.** The v1.1.0 release lacked its `.exe.blockmap` (dropped during the duplicate-draft consolidation), so the v1.1.0→v1.1.1 delta fell back to a **full download** (logged, non-fatal). Future deltas are unaffected: v1.1.1 carries its blockmap.

## Known limitations / follow-ups (candidates for v1.x/v2)
- **Draft-invisibility micro-proof inconclusive** this run (private-repo confound) — the draft→manual-publish gate itself held. A clean proof would cut a throwaway draft on the now-public repo and confirm the client ignores it, then delete it unpublished.
- **Installer filename is hyphenated** (`MV2-Save-Editor-Setup-1.1.1.exe`) as stored on the Release, while `test/packaging.config.test.ts` asserts the spaced form `MV2 Save Editor Setup 1.1.1.exe`. The test is internally consistent (it composes the string itself) but its assumed on-disk name does not match the published asset — cosmetic test-accuracy cleanup.
- **Single launch-time update check** — the client checks once on startup; there is no periodic/in-app "check now". Adequate for the solo workflow; UPDUX items remain deferred.
- **Unsigned installer** — SmartScreen "unknown publisher" click-through accepted (code signing deferred to v2, DIST-03).

## Files Created/Modified
- `.planning/phases/08-release-ci-publish-on-tag-two-release-validation/08-02-SUMMARY.md` — this record.
- `package.json`, `package-lock.json` — version 1.1.0 → 1.1.1.
- `test/packaging.config.test.ts` — both version-coupled sites → 1.1.1.
- `.github/workflows/release.yml` — pre-create-draft hardening step (duplicate-draft fix).

---
