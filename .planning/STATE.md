---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Packaging & Distribution
current_phase: 08
current_phase_name: release-ci-publish-on-tag-two-release-validation
status: complete
stopped_at: Phase 8 complete (2/2 plans); v1.1 milestone complete — SC4 two-release self-update proven
last_updated: "2026-08-20T16:58:03.027Z"
last_activity: 2026-08-20
last_activity_desc: Phase 8 complete — SC4 self-update (v1.1.0 → v1.1.1) proven on Windows
progress:
  total_phases: 3
  completed_phases: 3
  total_plans: 8
  completed_plans: 8
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-09)

**Core value:** Turn a fiddly, error-prone manual save-editing process into a fast, safe, repeatable one — the editor must always produce a `.sav` the game can load without corruption.
**Current focus:** v1.1 milestone COMPLETE — Phase 8 (Release CI + two-release validation) done; SC4 self-update proven.

## Current Position

Phase: 08 (release-ci-publish-on-tag-two-release-validation) — ✅ COMPLETE (2/2 plans)
Plan: 2 of 2 complete
Status: v1.1 milestone complete (3/3 phases)
Last activity: 2026-08-20 — SC4 two-release self-update (v1.1.0 → v1.1.1) observed on Windows

Progress (v1.1): [██████████] 100% (3 of 3 phases; 8 of 8 plans)

## Roadmap (v1.1)

| Phase | Requirements | Depends on | Status |
|-------|--------------|------------|--------|
| 6. Packaging — Local Windows NSIS Installer | PKG-01..04 | Phase 5 (v1.0 dist/) | ✅ Complete (3/3) |
| 7. Auto-Update from GitHub Releases | UPD-01..03 | Phase 6 | ✅ Complete (3/3) |
| 8. Release CI — Publish-on-Tag + Two-Release Validation | CI-01..03 | Phase 7 | ✅ Complete (2/2) |

## Performance Metrics

**Velocity (v1.0, shipped):**

- Total plans completed: 23 (across Phases 1-5)
- Milestone timeline: 2026-07-03 → 2026-07-05 (3 days)

**v1.1:** no plans executed yet.

*Updated after each plan completion*

## Accumulated Context

### Decisions

Full decision log lives in PROJECT.md Key Decisions table. Decisions shaping v1.1:

- v1.1 is distribution-only: the v1.0 Electron/esbuild build is untouched — add a package step, a main-process updater seam, and a CI workflow, nothing more.
- Ship **unsigned** for v1.1: SmartScreen "unknown publisher" click-through is documented, not defeated (reputation is unreachable at solo scale).
- electron-builder packages the existing `dist/`; it does NOT rebuild TS — CI must run `build:electron` first, then package. Override `directories.output` to `release/` to avoid colliding with esbuild's `dist/`.
- electron-updater is a **runtime dependency** (else pruned from the asar) and must be added to esbuild's `external[]`; the updater is guarded by `app.isPackaged`.
- Auto-update is only fully verifiable across TWO sequential published releases — the two-release test is the Phase 8 acceptance gate, not a Phase 7 checkbox.
- [Phase ?]: Phase 6 icon: single 256x256 32bpp entry via zero-dep node:fs writer (scripts/make-icon.mjs); avoids png-to-ico/sharp supply-chain surface (T-06-01).
- [Phase ?]: Phase 6 P02: electron-builder.json in JSON (not YAML) for zero-dep require()-assertability in node:test; no custom artifactName (default template yields MV2 Save Editor Setup 1.1.0.exe); electron-builder pinned ^26
- [Phase 07]: 07-02: updater.ts stays dev-inert via lazy require of electron/electron-updater inside app.isPackaged guard; zero-dep fs logger swallows write failures (D-04/D-05/UPD-03)
- [Phase 08]: 08-01: release.yml mirrors the local package chain adding only --publish onTagOrDraft + GH_TOKEN env; default draft is the CI-03 human-publish gate; contents:write only (no PAT/write-all/marketplace action); @esbuild/win32-x64 lockfile coverage guarded by a zero-dep static test
- [Phase 08]: 08-02: **repo made PUBLIC** to enable GitHub-Releases auto-update — electron-updater reads releases.atom unauthenticated (private repo → HttpError 404). Unplanned but necessary transport decision; the alternative (embedded token) is a leak risk for a distributed app.
- [Phase 08]: 08-02: electron-builder races into DUPLICATE draft releases on first publish (no release exists yet) — mitigated by pre-creating the draft (`gh release view || gh release create --draft`) before electron-builder so uploads reuse one release.
- [Phase 08]: 08-02: SC4 PROVEN — installed v1.1.0 self-updated to published v1.1.1 (updater.log: found → available → downloaded → install-on-quit → relaunch reports 1.1.1). v1.1 milestone complete.

### Pending Todos

- [v1.x/v2] Clean draft-invisibility proof was inconclusive (private-repo confound during the draft window) — optionally cut a throwaway draft on the now-public repo to confirm the client ignores it.
- [v1.x/v2] test/packaging.config.test.ts asserts the SPACED installer name; the published asset is HYPHENATED (MV2-Save-Editor-Setup-1.1.1.exe) — cosmetic test-accuracy cleanup.
- [v1.x/v2] v1.1.0 release is missing its .exe.blockmap (lost in duplicate-draft consolidation) → v1.1.0→v1.1.1 delta fell back to full download; future releases carry the blockmap.

### Blockers/Concerns

- **Phase 6:** asar sibling resolution of `preload.js` / `index.html` (relative to `dist/main.js`) is the highest-risk unknown — prove it with an installed build before anything else depends on it.
- ~~**Phase 8:** the esbuild `@esbuild/win32-x64` platform-binary interaction on `windows-latest`~~ — RESOLVED: `npm ci` resolved the win32 binary cleanly on both CI runs; lockfile-coverage guard in place.
- ~~**Phase 8:** draft-then-manual-publish vs auto-publish~~ — RESOLVED: default-draft + manual publish confirmed working across both releases (CI-03 gate held).
- **NEW (v1.1 close):** GitHub-Releases auto-update requires a PUBLIC repo (or embedded token). Repo is now public. If it ever returns to private, auto-update breaks (releases.atom 404) — revisit transport before then.

## Deferred Items

Items acknowledged and carried forward:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Distribution | macOS/Linux packaging, code signing (DIST-01/02/03) | Deferred to v2 | v1.1 start |
| Update UX | In-app update UI, release notes, manual check, restart-now (UPDUX-01..04) | Deferred to v1.x/v2 | v1.1 start |
| Editing | Human-readable names (NAME-01), bulk edits (BULK-01/02), timestamped output + load-time round-trip check (OUT-01/02), header/character editing (HEADER-01) | Deferred beyond v1.1 | v1.0 close |
| Phase 6 P01 | 4min | 2 tasks | 3 files |
| Phase 06 P02 | 2min | 2 tasks | 6 files |
| Phase 07 P01 | 8min | 3 tasks | 5 files |
| Phase 07 P02 | 12min | 2 tasks | 4 files |
| Phase 08 P01 | 4min | 2 tasks | 2 files |

## Session Continuity

Last session: 2026-08-20T14:14:28.768Z
Stopped at: Completed 08-01-PLAN.md
Resume file: .planning/phases/08-release-ci-publish-on-tag-two-release-validation/08-01-PLAN.md

## Operator Next Steps

- Execute the phase with `/gsd-execute-phase 8` (Wave 1: 08-01 release.yml + static workflow/lockfile test — automatable, any-OS; Wave 2: 08-02 two blocking human-verify gates — real tag→draft→publish→install + v1.1.0→v1.1.1 two-release self-update proof on Windows).
- Working defaults recorded in the plans as explicit assumptions (no discuss-phase was run): draft-then-manual publish; direct `electron-builder --publish onTagOrDraft`; SC4 two-release proof as a manual Windows gate. Confirm/override at execute time.
- Version=tag invariant: bumping `package.json.version` for a release is a lockstep edit with `test/packaging.config.test.ts` (both the version assertion AND the installer-name literal).
