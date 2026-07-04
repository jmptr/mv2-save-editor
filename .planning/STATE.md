---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 5
current_phase_name: Renderer UI — Browse, Search, Edit, Preview
status: executing
stopped_at: Phase 5 context gathered
last_updated: "2026-07-04T22:09:03.974Z"
last_activity: 2026-07-04
last_activity_desc: Phase 04 complete, transitioned to Phase 5
progress:
  total_phases: 5
  completed_phases: 4
  total_plans: 15
  completed_plans: 15
  percent: 80
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-04)

**Core value:** Turn a fiddly, error-prone manual save-editing process into a fast, safe, repeatable one — the editor must always produce a `.sav` the game can load without corruption.
**Current focus:** Phase 04 — electron-shell-secure-ipc-non-destructive-write

## Current Position

Phase: 5 — Renderer UI — Browse, Search, Edit, Preview
Plan: Not started
Status: Ready to execute
Last activity: 2026-07-04 — Phase 04 complete, transitioned to Phase 5

Progress: milestone [██████░░░░] 60% (3 of 5 phases complete)

## Performance Metrics

**Velocity:**

- Total plans completed: 15
- Average duration: 22 min
- Total execution time: 0.7 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 P01 | 12min | 3 tasks | 5 files |
| 01 P02 | 32min | 2 tasks | 2 files |
| 01 | 3 | - | - |
| 02 | 5 | - | - |
| 03 | 2 | - | - |
| 04 | 5 | - | - |

**Recent Trend:**

- Last 5 plans: 01-01 (12min), 01-02 (32min)
- Trend: —

*Updated after each plan completion*
| Phase 01 P03 | 13min | - tasks | - files |
| Phase 02 P01 | 11min | 2 tasks | 5 files |
| Phase 02 P02 | 11min | 2 tasks | 3 files |
| Phase 02 P03 | 12min | 2 tasks | 4 files |
| Phase 02 P04 | 15min | 2 tasks | 2 files |
| Phase 02 P05 | 18min | 2 tasks | 2 files |
| Phase 04 P01 | 3 | 2 tasks | 2 files |
| Phase 04 P02 | 3min | 2 tasks | 3 files |
| Phase 04 P03 | 12 | 2 tasks | 4 files |
| Phase 04 P04 | 6min | 3 tasks | 4 files |
| Phase 04 P05 | 21min | 3 tasks | 3 files |

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
- [Phase ?]: [Phase 02]: Plan 02-03: Currency-by-ID (not by order) — fixture wallet [GoldPieces, PrayerPoints, SlayerCoins] has PrayerPoints BETWEEN GP and SC; string-keying (MelvorBase:GoldPieces/SlayerCoins) is the decisive correctness fix (RESEARCH Pattern 2)
- [Phase ?]: [Phase 02]: Plan 02-03: RequiredFieldMissingError for missing GP uses Plan 01 class with fieldKey=wallet.GoldPieces (actionable); SlayerCoins authoritative but NOT required; Experience keys component-relative (experience.xp/levelCap/level), 02-05 re-keys per skill; LevelCap readOnly (Pitfall 5); SC-3 bounds 1<=cap<=200 1<=level<=cap XP finite>=0 size>=16; did NOT mark IO-01 complete (deferred to 02-05)
- [Phase 02]: Plan 02-04: Bounded marker-search (NOT contiguous walk) — scans 'MelvorBase:' across the whole Inventory region [710,20496), recovers all 689 stacks across every tab (a contiguous walk stops at ~296 at the first tab boundary — RESEARCH §Pitfall 1, T-02-01)
- [Phase 02]: Plan 02-04: '6-bytes-before-the-length-prefix' recipe — marker hit H → 7-bit prefix at H-1 → stack header [int32 qty][bool placeholder][bool locked] at H-7 (RESEARCH §Pattern 3)
- [Phase 02]: Plan 02-04: Raw-byte boolean validation (NOT readBool) — placeholder/locked must be genuine booleans (raw byte 0 or 1); readBool would swallow byte>1 as true, masking false matches (SC-3, T-02-05)
- [Phase 02]: Plan 02-04: Duplicate item IDs across tabs are DISTINCT offset-keyed fields (D-01, NOT D-03 ambiguity — RESEARCH Open Q 3); resolveOne(stacks, matchFn) implements D-03 (resolved/candidates/notFound, never auto-picks — T-02-08) for the DIFFERENT case of a single logical field resolving to >1 offset
- [Phase 02]: Plan 02-04: Did NOT mark IO-01 complete (mirrors 02-01/02-02/02-03) — 02-04 delivers the bank-item-stack half of IO-01 (SC-1 all 689 stacks + SC-3 context-validation), but full IO-01 (orchestrator parseSave wiring) ships in 02-05
- [Phase 02]: Plan 02-05: Single-entry orchestrator — parseSave(buffer) → { fieldTable, viewModel } is the one function Phase 3/4/5 consume; one parse pass produces both the offset-bearing FieldTable (patcher) and the offset-free ViewModel (UI)
- [Phase 02]: Plan 02-05: ViewModel DERIVED by projection (SC-4 by construction) — projectViewModel reads authoritative wallet currencies FROM the FieldTable (so summary reflects the wallet, NOT the readOnly header mirrors — SC-2); int64 GP/SC as string in the ViewModel (JSON/IPC-safe); assertNoOffsets passes
- [Phase 02]: Plan 02-05: Deterministic re-parse (SC-4/T-02-09) — walk re-derives offsets from reader.offset on every call; nothing cached/persisted; two parseSave calls yield identical FieldTables
- [Phase 02]: Plan 02-05: Bank located by component NAMES ('Wallet'+'Inventory'), not hard-coded entity ID (T-02-05 — fixture has MelvorBase:Layout not in docs' Known Entity IDs); Skill = any entity with an Experience component (RESEARCH A3, Combat included); re-keys experience.{xp,levelCap,level} → skill.<entityId>.{...}
- [Phase 02]: Plan 02-05: IO-01 COMPLETE — parseSave delivers the full IO-01 (Brotli-decompress + parse documented layout + re-parse offsets fresh every load); REQUIREMENTS.md updated
- [Phase ?]: Plan 04-01: OPTION A (allow esbuild postinstall) chosen by human — build-tool-only reversal of Plan 01-01 least-privilege default; Plan 05 uses esbuild build mechanism not tsc fallback
- [Phase ?]: Plan 04-01: electron pinned EXACTLY at 43.0.0 (no caret) since Electron minors can break; esbuild ^0.28.1; postinstall approval persisted via package.json allowScripts esbuild@0.28.1:true
- [Phase ?]: Plan 04-05: main.ts wires four save:* IPC handlers as thin composition over pure src/ipc/* (SessionStore/ipc-guards/write-service); toErrorResult maps every typed core error to a discriminated { ok:false, kind } — no exception/offset/bigint crosses the bridge (D-04)
- [Phase ?]: Plan 04-05: built via esbuild (04-01 OPTION A), 3 entries to dist/ (main+preload node/CJS core-bundled electron-external; renderer browser); main to dist/main.js; test/typecheck byte-unchanged
- [Phase ?]: Plan 04-05: IO-02 closed end-to-end — human UAT approved confirmed hardened window bridge (no Node access) + non-destructive new .sav with original byte-unchanged; WSL2 needs libnss3/libnspr4/libasound2t64 + GTK stack to launch

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

Last session: 2026-07-04T21:13:28.660Z
Stopped at: Phase 5 context gathered
Resume file: .planning/phases/05-renderer-ui-browse-search-edit-preview/05-CONTEXT.md
