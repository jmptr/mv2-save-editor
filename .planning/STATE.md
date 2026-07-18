---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Packaging & Distribution
current_phase: 8
current_phase_name: Release CI — Publish-on-Tag + Two-Release Validation
status: planned
stopped_at: Phase 8 planned (2 plans, ready to execute)
last_updated: "2026-07-18T20:57:27.005Z"
last_activity: 2026-07-18
last_activity_desc: Phase 8 planning complete (2 plans, 2 waves)
progress:
  total_phases: 3
  completed_phases: 2
  total_plans: 6
  completed_plans: 6
  percent: 67
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-09)

**Core value:** Turn a fiddly, error-prone manual save-editing process into a fast, safe, repeatable one — the editor must always produce a `.sav` the game can load without corruption.
**Current focus:** Phase 8 — Release CI (planned, ready to execute)

## Current Position

Phase: 8 — Release CI — Publish-on-Tag + Two-Release Validation
Plan: 2 plans ready (2 waves)
Status: Planned — ready to execute
Last activity: 2026-07-18 — Phase 8 planning complete (2 plans)

Progress (v1.1): [██████░░░░] 67% (2 of 3 phases; Phase 8 planned)

## Roadmap (v1.1)

| Phase | Requirements | Depends on | Status |
|-------|--------------|------------|--------|
| 6. Packaging — Local Windows NSIS Installer | PKG-01..04 | Phase 5 (v1.0 dist/) | ✅ Complete (3/3) |
| 7. Auto-Update from GitHub Releases | UPD-01..03 | Phase 6 | ✅ Complete (3/3) |
| 8. Release CI — Publish-on-Tag + Two-Release Validation | CI-01..03 | Phase 7 | Planned (2 plans) |

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

### Pending Todos

None yet.

### Blockers/Concerns

- **Phase 6:** asar sibling resolution of `preload.js` / `index.html` (relative to `dist/main.js`) is the highest-risk unknown — prove it with an installed build before anything else depends on it.
- **Phase 8:** the esbuild `@esbuild/win32-x64` platform-binary / `package-lock.json` / `allowScripts` interaction on `windows-latest` is the most likely first-CI-run failure — plan a lockfile-coverage check and mirror the local install path.
- **Phase 8:** electron-builder defaults to a draft release; decide + document draft-then-manual-publish vs auto-publish during Phase 8 planning.

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

## Session Continuity

Last session: 2026-07-18T20:57Z
Stopped at: Phase 8 planned (2 plans, 2 waves; plan-checker PASS after 1 revision) — pushed to claude/gsd-execute-phase-6-caly71
Resume file: .planning/phases/08-release-ci-publish-on-tag-two-release-validation/08-01-PLAN.md

## Operator Next Steps

- Execute the phase with `/gsd-execute-phase 8` (Wave 1: 08-01 release.yml + static workflow/lockfile test — automatable, any-OS; Wave 2: 08-02 two blocking human-verify gates — real tag→draft→publish→install + v1.1.0→v1.1.1 two-release self-update proof on Windows).
- Working defaults recorded in the plans as explicit assumptions (no discuss-phase was run): draft-then-manual publish; direct `electron-builder --publish onTagOrDraft`; SC4 two-release proof as a manual Windows gate. Confirm/override at execute time.
- Version=tag invariant: bumping `package.json.version` for a release is a lockstep edit with `test/packaging.config.test.ts` (both the version assertion AND the installer-name literal).
