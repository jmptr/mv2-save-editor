---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 02
current_phase_name: format-parser-fieldtable-model
status: executing
stopped_at: Completed 02-02-PLAN.md (structural walk spine)
last_updated: "2026-07-04T01:32:56.497Z"
last_activity: 2026-07-04
last_activity_desc: Phase 02 execution started
progress:
  total_phases: 5
  completed_phases: 1
  total_plans: 8
  completed_plans: 5
  percent: 20
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-03)

**Core value:** Turn a fiddly, error-prone manual save-editing process into a fast, safe, repeatable one — the editor must always produce a `.sav` the game can load without corruption.
**Current focus:** Phase 02 — format-parser-fieldtable-model

## Current Position

Phase: 02 (format-parser-fieldtable-model) — EXECUTING
Plan: 3 of 5
Status: Ready to execute
Last activity: 2026-07-04 — Phase 02 execution started

Progress: milestone [██░░░░░░░░] 20% (1 of 5 phases complete)

## Performance Metrics

**Velocity:**

- Total plans completed: 3
- Average duration: 22 min
- Total execution time: 0.7 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 P01 | 12min | 3 tasks | 5 files |
| 01 P02 | 32min | 2 tasks | 2 files |
| 01 | 3 | - | - |

**Recent Trend:**

- Last 5 plans: 01-01 (12min), 01-02 (32min)
- Trend: —

*Updated after each plan completion*
| Phase 01 P03 | 13min | - tasks | - files |
| Phase 02 P01 | 11min | 2 tasks | 5 files |
| Phase 02 P02 | 11min | 2 tasks | 3 files |

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
- [Phase ?]: Plan 02-01: ViewCandidate (offset-free) in ViewModel vs FieldCandidate (offset-bearing) in FieldTable — only interpretation consistent with 'unresolvedFields has candidates' + 'no offset key at any depth' (SC-4)
- [Phase ?]: Plan 02-01: int64 precision enforced at type level via discriminated union (Int64FieldEntry.value: bigint) — tsc rejects value: number for kind 'int64' (T-02-06); no runtime guard (type-level sufficient for v1)
- [Phase ?]: Plan 02-01: Carried esbuild-interop /* c8 ignore */ pattern from 01-02/01-03 to src/field-table.ts — 100% coverage on all metrics without lowering --100 threshold
- [Phase ?]: Plan 02-01: FIXTURE_BUFFER cached at module load in test/helpers/fixture.ts (decompressed once, returned by reference) — matches primitives.test.ts pattern
- [Phase ?]: Plan 02-01: Did NOT mark IO-01 complete — IO-01 (parse the layout) is owned by plans 02-02..02-05; Plan 02-01 only establishes type contracts + test harness
- [Phase 02]: Plan 02-02: Typed-error split — ParseError for explicit region-bound violations (count pre-check, negative size, region overrun, delta-0 mismatch); BinaryReader native RangeError propagated for OOB / malformed-7-bit-prefix (T-02-02, never swallowed)
- [Phase 02]: Plan 02-02: Count pre-check bounds the int32 count against the enclosing region (count*MIN_ITEM_FRAMING=5 > remaining → ParseError) BEFORE looping — a giant count (2^31-1) throws before any iteration/allocation (T-02-01)
- [Phase 02]: Plan 02-02: parseSaveHeader emits ONLY header.GP + header.SlayerCoins as FieldEntries (readOnly + mirrors 'wallet.GoldPieces'/'wallet.SlayerCoins', SC-2); TotalLevel/name/gamemode are summary-only (PROJECT.md defers header editing to a later milestone)
- [Phase 02]: Plan 02-02: Did NOT mark IO-01 complete (mirrors 02-01) — 02-02 delivers the structural skeleton (version→SaveHeader→entity list→component boundaries) but full IO-01 (bank 02-04 + skills 02-03 + orchestrator 02-05) ships across Phase 2; IO-01 marked complete by 02-05

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

Last session: 2026-07-04T01:31:32.273Z
Stopped at: Completed 02-02-PLAN.md (structural walk spine)
Resume file: None
