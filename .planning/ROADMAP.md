# Roadmap: MV2 Save Editor

## Milestones

- ✅ **v1.0 MVP** — Phases 1-5 (shipped 2026-07-05)
- ✅ **v1.1 Packaging & Distribution** — Phases 6-8 (shipped 2026-08-20)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-5) — SHIPPED 2026-07-05</summary>

Built the save editor inside-out so corruption risk was proven away before any UI existed: a pure-TS format core (primitives + Brotli round-trip, layout parser + fresh-offset FieldTable, same-width patch engine + validation + XP table) — all headless and golden-file tested against a real `.sav` corpus — then a hardened Electron main process with secure IPC + non-destructive new-file write, and finally the React renderer surfacing browse/search/edit/preview/confirm. Every edit's ultimate acceptance was a mandatory manual in-game load.

- [x] Phase 1: Binary Primitives + Brotli Codec (3/3 plans) — completed 2026-07-03
- [x] Phase 2: Format Parser + FieldTable Model (5/5 plans) — completed 2026-07-04
- [x] Phase 3: Patcher + Validation + XP Table (2/2 plans) — completed 2026-07-04
- [x] Phase 4: Electron Shell + Secure IPC + Non-Destructive Write (5/5 plans) — completed 2026-07-04
- [x] Phase 5: Renderer UI — Browse, Search, Edit, Preview (8/8 plans) — completed 2026-07-05

Full detail: `.planning/milestones/v1.0-ROADMAP.md`
Post-ship fix: bank phantom-stack corruption bug root-caused + fixed via explicit tab-walk (`b4ac6c4`), confirmed in-game.

</details>

<details>
<summary>✅ v1.1 Packaging & Distribution (Phases 6-8) — SHIPPED 2026-08-20</summary>

A downloadable, self-updating Windows installer, published automatically to GitHub Releases (unsigned). The v1.0 app and its esbuild build were untouched; this milestone added only a package step, a main-process self-update seam, and a CI publish workflow. Execution was strictly dependency-ordered (updater embeds into a package → CI automates the proven local chain). Proven end-to-end by a live v1.1.0 → v1.1.1 two-release self-update (SC4).

- [x] Phase 6: Packaging — Local Windows NSIS Installer (3/3 plans) — completed 2026-07-18
- [x] Phase 7: Auto-Update from GitHub Releases (3/3 plans) — completed 2026-07-18
- [x] Phase 8: Release CI — Publish-on-Tag + Two-Release Validation (2/2 plans) — completed 2026-08-20

Full detail: `.planning/milestones/v1.1-ROADMAP.md`
Audit: `.planning/milestones/v1.1-MILESTONE-AUDIT.md` (passed — 10/10 requirements, 3/3 phases verified)

</details>

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Binary Primitives + Brotli Codec | v1.0 | 3/3 | Complete | 2026-07-03 |
| 2. Format Parser + FieldTable Model | v1.0 | 5/5 | Complete | 2026-07-04 |
| 3. Patcher + Validation + XP Table | v1.0 | 2/2 | Complete | 2026-07-04 |
| 4. Electron Shell + Secure IPC + Non-Destructive Write | v1.0 | 5/5 | Complete | 2026-07-04 |
| 5. Renderer UI — Browse, Search, Edit, Preview | v1.0 | 8/8 | Complete | 2026-07-05 |
| 6. Packaging — Local Windows NSIS Installer | v1.1 | 3/3 | Complete | 2026-07-18 |
| 7. Auto-Update from GitHub Releases | v1.1 | 3/3 | Complete | 2026-07-18 |
| 8. Release CI — Publish-on-Tag + Two-Release Validation | v1.1 | 2/2 | Complete | 2026-08-20 |
