---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 01
current_phase_name: binary-primitives-brotli-codec
status: verifying
stopped_at: Phase 01 all plans complete (01-03 closed out); ready for verification
last_updated: "2026-07-03T21:35:26.509Z"
last_activity: 2026-07-03
last_activity_desc: Plan 01-03 closed out (LE primitives; SUMMARY written retroactively)
progress:
  total_phases: 5
  completed_phases: 1
  total_plans: 3
  completed_plans: 3
  percent: 20
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-03)

**Core value:** Turn a fiddly, error-prone manual save-editing process into a fast, safe, repeatable one — the editor must always produce a `.sav` the game can load without corruption.
**Current focus:** Phase 01 — binary-primitives-brotli-codec

## Current Position

Phase: 01 (binary-primitives-brotli-codec) — EXECUTING
Plan: 3 of 3
Status: ready_for_verification (all 3 plans complete)
Last activity: 2026-07-03 — Plan 01-03 closed out (LE primitives; SUMMARY written retroactively)

Progress: [██████████] 100% (Phase 01 plans) · milestone [██░░░░░░░░] 20%

## Performance Metrics

**Velocity:**

- Total plans completed: 2
- Average duration: 22 min
- Total execution time: 0.7 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 P01 | 12min | 3 tasks | 5 files |
| 01 P02 | 32min | 2 tasks | 2 files |

**Recent Trend:**

- Last 5 plans: 01-01 (12min), 01-02 (32min)
- Trend: —

*Updated after each plan completion*
| Phase 01 P03 | 13min | - tasks | - files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Roadmap: Inside-out build order — prove the pure format core byte-exact (Phases 1-3) before any Electron shell (Phases 4-5).
- Roadmap: IO-03 (no-op round-trip + length invariant) anchored in Phase 1 codec layer as the first correctness gate.
- Roadmap: EDIT-04 (XP-table auto-compute) mapped to Phase 3, where the verified StandardExperienceTable lives; Phase 5 surfaces the level input.
- [Phase ?]: Plan 01-01: Added ignoreDeprecations 6.0 to tsconfig — TS 6 deprecated moduleResolution=node10 (TS5107); needed to keep D-06 CJS+node resolution green under TS 6.0.3
- [Phase ?]: Plan 01-01: Added types:[node] to tsconfig — TS 6 no longer auto-includes @types/* by default; required for Buffer/node:test/node:assert/strict to resolve under strict mode
- [Phase ?]: Plan 01-01: Did NOT approve esbuild postinstall (npm allow-scripts) — tsx works without it (prebuilt binary); least-privilege supply-chain stance
- [Phase ?]: Plan 01-01: Did NOT mark IO-03 complete — IO-03 (no-op round-trip + length invariant) is the codec requirement owned by Plan 02; Plan 01-01 only scaffolded the toolchain
- [Phase ?]: Plan 01-02: Brotli param constants via zlib.constants.BROTLI_PARAM_* (named node:zlib export does not exist in Node 24 — used named imports + constants.BROTLI_PARAM_LARGE_WINDOW)
- [Phase ?]: Plan 01-02: Named imports for node:zlib + node:assert/strict (not default) to eliminate esbuild __toESM interop helper and satisfy the D-04 --100 branch gate
- [Phase ?]: Plan 01-02: Targeted /* c8 ignore */ comments suppress the residual esbuild __copyProps defensive arm (NOT codec logic — proven via pure-CJS probe); did NOT lower the --100 threshold
- [Phase ?]: Plan 01-02: IO-03 COMPLETE — codec round-trips the real .sav byte-identical (decompressed-buffer) + length invariant (2,284,747) + large-window rejection (T-1-05) + bomb cap (T-1-03); 100% lines+branches on src/codec.ts

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 2 (Parser/FieldTable) is the only area with real open questions: exact Bank-wallet offset (`Walleta` marker), entity-region boundary detection, and item-stack context-validation heuristics must be pinned against a real fixture corpus.
- Assemble a corpus of real `.sav` fixtures (varied gamemodes, char-name lengths, bank sizes) before Phase 2 so every core phase can test byte-exactly.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-07-03T21:35:08.670Z
Stopped at: Phase 01 all plans complete (01-03 closed out); ready for verification
Resume file: None
