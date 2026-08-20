---
phase: 08-release-ci-publish-on-tag-two-release-validation
verified: 2026-08-20T17:40:00Z
status: passed
score: 4/4 success criteria verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: none
  gaps_closed: []
  gaps_remaining: []
  regressions: []
human_gate:
  plan: 08-02
  attested_by: developer
  recorded_in: 08-02-SUMMARY.md
  runtime_criteria: ["CI-01", "CI-02", "CI-03", "SC4"]
  result: PASS
---

# Phase 8: Release CI — Publish-on-Tag + Two-Release Validation — Verification Report

**Phase Goal:** A `v*` tag push builds the Windows installer on CI and publishes it (draft) to GitHub Releases, and an installed client self-updates across two sequential published releases.
**Verified:** 2026-08-20T17:40:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

Phase 8 splits into an **any-OS static slice** (release.yml contract + lockfile coverage, directly verifiable on this Linux host) and a **runtime slice** (real tag pushes, published releases, and the two-release self-update — observable only on real GitHub + Windows, covered by the developer-attested Plan 08-02 human acceptance gate). Both slices are satisfied. Unlike a typical human gate, the runtime slice here was proven **empirically end-to-end**: an installed v1.1.0 client actually self-updated to a published v1.1.1.

### Success Criteria

| # | Criterion | Verdict | Evidence |
|---|-----------|---------|----------|
| CI-01 | A `v*` tag push builds on `windows-latest` (Node 22, `build:electron` before packaging). | met | Static: `.github/workflows/release.yml` — `on: push tags: ['v*']`, `runs-on: windows-latest`, `node-version: 22`, `npm ci` → `npm run build:electron` → electron-builder; pinned by `test/release.workflow.test.ts`. Runtime: Actions runs #1 (`v1.1.0`) and #2 (`v1.1.1`) both completed **success** on windows-latest (08-02-SUMMARY.md). |
| CI-02 | The workflow publishes `.exe` + `latest.yml` + `.blockmap` with `contents: write` + `GH_TOKEN`. | met | Static: `permissions: contents: write`, `--publish onTagOrDraft`, `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` via env; asserted by the static test. Runtime: published `v1.1.1` Release carries `MV2-Save-Editor-Setup-1.1.1.exe` (103 MB), `latest.yml` (359 B), `.exe.blockmap` (108 KB); no 403 → token + permission correct. |
| CI-03 | The release is created as a draft and published manually (updater ignores drafts). | met | Static: no `releaseType`/`--publish always` override → electron-builder default draft; asserted by the test. Runtime: both `v1.1.0` and `v1.1.1` were created as drafts and manually published (draft=false only after manual Publish). NOTE: the draft-invisibility micro-proof was inconclusive (repo private during the draft window → client 404'd regardless); the draft→manual-publish gate itself held. |
| SC4 | An installed v1.1.0 client detects, downloads, and applies the published v1.1.1 update and relaunches as v1.1.1. | met-via-human-gate | Runtime (live, 08-02-SUMMARY.md): updater.log shows `Found version 1.1.1` → `update-available 1.1.1` → `update-downloaded 1.1.1` → `Auto install update on quit` (silent `--updated /S`); post-relaunch `Update for version 1.1.1 is not available (latest version: 1.1.1)` confirms the running app is 1.1.1. Full tag→CI→publish→auto-update loop proven end-to-end. |

**Score:** 4/4 success criteria verified (CI-01/CI-02/CI-03 static + runtime; SC4 via live runtime proof).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.github/workflows/release.yml` | v* tag → windows-latest publish, contents:write, GH_TOKEN, default draft | VERIFIED | Present; contract check passes; includes the pre-create-draft hardening step. |
| `test/release.workflow.test.ts` | Static contract + @esbuild/win32-x64 lockfile coverage | VERIFIED | Zero-dep node:test assertions (CI-01/02 positive, CI-03/anti-pattern negative, lockfile guard, pre-create step). |
| `package.json` / `package-lock.json` | version 1.1.1 (Version=Tag invariant) | VERIFIED | Both root version fields = 1.1.1. |
| `test/packaging.config.test.ts` | Both version-coupled sites = 1.1.1 | VERIFIED | pkg.version assertion + installer-name literal both 1.1.1; suite green. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| release.yml | electron-builder (dist/) | `build:electron` before `electron-builder --publish onTagOrDraft` | WIRED | Confirmed; build precedes package. |
| release.yml | GitHub Release | `contents: write` + `GH_TOKEN` env | WIRED | Runtime: assets published, no 403. |
| electron-builder publish block | electron-updater feed | shared `github/jmptr/mv2-save-editor` → app-update.yml | WIRED | Runtime: client fetched from this repo and updated (SC4). |
| pre-create draft step | electron-builder | `gh release create --draft` before publish | WIRED | Runtime: v1.1.1 produced ONE clean draft (no duplicate). |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite | `npm test` | 300 pass / 0 fail | PASS |
| Type safety | `npm run typecheck` | exit 0 | PASS |
| release.yml contract | node contract check | all positive regexes match, no anti-patterns, no token echo | PASS |
| Real CI run (v1.1.0) | Actions run #1 | success (windows-latest) | PASS |
| Real CI run (v1.1.1) | Actions run #2 | success; one clean draft | PASS |
| Two-release self-update | updater.log (Windows) | v1.1.0 → v1.1.1 applied + relaunched | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CI-01 | 08-01, 08-02 | v* tag → windows-latest build before package | SATISFIED | Static contract + two green Actions runs. |
| CI-02 | 08-01, 08-02 | Publish .exe + latest.yml + .blockmap (contents:write + GH_TOKEN) | SATISFIED | Static + published v1.1.1 asset list; no 403. |
| CI-03 | 08-01, 08-02 | Default draft, manual publish | SATISFIED | Static (no forced publish) + both releases drafted then manually published. |

### Anti-Patterns Found

None. release.yml carries no `write-all`/PAT/marketplace-action/forced-publish/omit-optional and never echoes the token (asserted by test/release.workflow.test.ts). Anti-pattern literals appear only inside `assert.doesNotMatch` regex args, which is correct.

### Human Verification Required

None outstanding. The runtime slice (CI-01/02/03 runtime + SC4) was verified by the Plan 08-02 blocking-human gate, developer-attested PASS, recorded in 08-02-SUMMARY.md with updater.log evidence.

### Deviations / Findings (resolved during the gate)

| # | Finding | Resolution |
|---|---------|-----------|
| 1 | electron-builder created duplicate draft releases on first publish (race, no pre-existing release) | Added `gh release create --draft` pre-create step; v1.1.1 produced one clean draft. |
| 2 | Auto-update 404'd on `releases.atom` — repo was private (electron-updater reads it unauthenticated) | Repo made public; auto-update then worked with no code change. Recorded as a milestone decision. |
| 3 | v1.1.0 release missing `.exe.blockmap` (lost in duplicate-draft consolidation) | Non-fatal — updater fell back to full download; v1.1.1 carries its blockmap so future deltas are fine. |

### Gaps Summary

No functional gaps. All three requirements (CI-01/02/03) and SC4 are met — the static slice verified directly on this host (contract + lockfile + 300 green tests) and the runtime slice proven live end-to-end (two real releases + observed self-update). Carried-forward non-blocking items: draft-invisibility micro-proof inconclusive (private-repo confound at the time); the spaced-vs-hyphenated installer-name test cosmetic; and the public-repo requirement for auto-update.

---

_Verified: 2026-08-20T17:40:00Z_
_Verifier: Claude (gsd-verifier) — generated from the Plan 08-02 SC4 acceptance evidence_
