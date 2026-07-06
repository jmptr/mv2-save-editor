# Roadmap: MV2 Save Editor

## Milestones

- ✅ **v1.0 MVP** — Phases 1-5 (shipped 2026-07-05)

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

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Binary Primitives + Brotli Codec | v1.0 | 3/3 | Complete | 2026-07-03 |
| 2. Format Parser + FieldTable Model | v1.0 | 5/5 | Complete | 2026-07-04 |
| 3. Patcher + Validation + XP Table | v1.0 | 2/2 | Complete | 2026-07-04 |
| 4. Electron Shell + Secure IPC + Non-Destructive Write | v1.0 | 5/5 | Complete | 2026-07-04 |
| 5. Renderer UI — Browse, Search, Edit, Preview | v1.0 | 8/8 | Complete | 2026-07-05 |
