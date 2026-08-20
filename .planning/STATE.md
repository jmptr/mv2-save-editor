---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Packaging & Distribution
current_phase: 1
status: Awaiting next milestone
stopped_at: Completed 08-01-PLAN.md
last_updated: "2026-08-20T18:31:06.000Z"
last_activity: 2026-08-20
last_activity_desc: Milestone v1.1 completed and archived
progress:
  total_phases: 3
  completed_phases: 3
  total_plans: 8
  completed_plans: 8
  percent: 100
current_phase_name: release-ci-publish-on-tag-two-release-validation
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-09)

**Core value:** Turn a fiddly, error-prone manual save-editing process into a fast, safe, repeatable one — the editor must always produce a `.sav` the game can load without corruption.
**Current focus:** v1.1 milestone COMPLETE — Phase 8 (Release CI + two-release validation) done; SC4 self-update proven.

## Current Position

Phase: Milestone v1.1 complete
Plan: —
Status: Awaiting next milestone
Last activity: 2026-08-20 — Milestone v1.1 completed and archived

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

**Velocity (v1.1, shipped):**

- Total plans completed: 8 (across Phases 6-8), 13 code commits
- Milestone timeline: 2026-07-09 → 2026-08-20

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

Last session: 2026-08-20T18:31Z
Stopped at: v1.1 milestone completed and archived (audit passed 10/10; SC4 proven)
Resume file: — (start next milestone with /gsd-new-milestone)

## Operator Next Steps

- Start the next milestone with /gsd-new-milestone
