---
phase: 02-format-parser-fieldtable-model
plan: 05
subsystem: parser
tags: [save-parser, orchestrator, parseSave, viewmodel, projection, offset-free, determinism, version-tolerance, fieldtable, node-test, typescript, strict-ts, c8]

# Dependency graph
requires:
  - phase: 02-01 (FieldTable + ViewModel type contracts + test helpers)
    provides: "FieldTable.add/get/getRequired/addCandidates + FieldEntry discriminated union + ParseError/RequiredFieldMissingError (src/field-table.ts); offset-free ViewModel type (src/view-model.ts); loadFixtureBuffer() (test/helpers/fixture.ts); assertNoOffsets SC-4 guard (test/helpers/no-offset-scan.ts)"
  - phase: 02-02 (structural-walk spine)
    provides: "readVersion (int32@0 + unknownVersion SC-5 flag), parseSaveHeader (summary + readOnly-mirror header.GP/SC FieldEntries + headerEnd), walkEntities (33 opaque {id,start,size} spans), walkComponents (per-entity component list locating Wallet/Inventory/Experience boundaries)"
  - phase: 02-03 (Wallet + Experience parsers)
    provides: "parseWallet (authoritative int64 GoldPieces/SlayerCoins by currency-ID string-keying); parseExperience (component-relative experience.{xp,levelCap,level} entries, re-keyed by the orchestrator to skill.<entityId>.{...})"
  - phase: 02-04 (Inventory parser)
    provides: "findStacks(buf, invStart, invEnd) — bounded marker-search recovering all 689 stacks across tabs; InventoryStack {qtyOffset, itemId, qty, placeholder, locked}; resolveOne D-03 ambiguity contract"
  - phase: 01-02 (Brotli codec)
    provides: "decompress (used by loadFixtureBuffer to produce the 2,284,747-byte decompressed fixture buffer parseSave consumes)"
  - phase: 01-03 (BinaryReader/BinaryWriter)
    provides: "BinaryReader — the stateful LE cursor parseSave threads through the spine"
provides:
  - "src/save-parser.ts: parseSave(buffer) → { fieldTable, viewModel } — the single entry point Phase 3 (patcher, reads the FieldTable) and Phase 5 (UI, reads the ViewModel) consume (IO-01 delivered end-to-end)"
  - "projectViewModel(fieldTable, entityIds, context) — derives the offset-free ViewModel by projection (SC-4 by construction — no byte offset at any depth); int64 currencies rendered as string (JSON/IPC-safe)"
  - "IO-01 COMPLETE: parseSave Brotli-decompresses a .sav (via Phase 1 codec), walks version → SaveHeader → 33-entity list → per-entity component list, dispatches to the region parsers at each boundary, and re-derives offsets fresh on every call (deterministic — SC-4)"
  - "SC-1 (full fixture parse: version 20, summary Bob/Test, 689 bank stacks, skills with Woodcutting xp/cap/level), SC-2 (wallet GP/SC authoritative; header GP/SC readOnly mirrors), SC-4 (offset-free ViewModel + deterministic re-parse), SC-5 (unknown version warns-but-parses) all proven at the whole-parse level"
  - "test/save-parser.test.ts: 5 integration tests (full fixture parse, ViewModel projection + assertNoOffsets, determinism, version tolerance, projectViewModel branch coverage)"
  - "100% line + statement + function + branch coverage on src/save-parser.ts (D-04 gate); wave-merge gate 164 tests pass, 100% on all 10 src files"
affects:
  - "03-patch (Phase 3): consumes parseSave(buffer).fieldTable — reads { offset, kind, width, value } per writable field for same-width in-place edits; the authoritative flag steers currency writes to the wallet (never the header mirror)"
  - "05-browse (Phase 5): consumes parseSave(buffer).viewModel — renders the offset-free summary/bankItems/skills/entityIds; surfaces unresolvedFields (D-03 candidates) to the browse UI if a future plan surfaces any"
  - "04-electron (Phase 4): wraps parseSave in the Electron main process; the FieldTable stays in main (offsets never cross IPC), the ViewModel is the IPC payload (SC-4 boundary enforced by the type system)"

# Tech tracking
tech-stack:
  added: []  # zero new deps — orchestrates Phase 1 + Wave 1/2 modules only
  patterns:
    - "Single-entry orchestrator: parseSave(buffer) is the one function Phase 3/4/5 call. It threads one BinaryReader through the spine, dispatches to region parsers at component boundaries, and returns { fieldTable, viewModel } — the offset-bearing table for the patcher + the offset-free projection for the UI."
    - "Derived ViewModel by projection (SC-4 by construction): projectViewModel maps the parsed data into the UI shape with NO offset at any depth. The FieldTable holds the offset-bearing entries; the ViewModel never sees them. assertNoOffsets(viewModel) is the runtime proof."
    - "Deterministic re-parse (SC-4 / T-02-09): the walk re-derives offsets from reader.offset on every call — nothing cached or persisted. Two parseSave calls on the same buffer yield identical FieldTable entries (same offsets, same values). Offsets never go stale."
    - "Bank located by component NAMES ('Wallet' + 'Inventory'), not a hard-coded entity ID (T-02-05): the fixture has MelvorBase:Layout (not in the docs' Known Entity IDs), so a hard-coded ID would break on a variant save. The generic walk finds the Bank by its component signature."
    - "Skill = any entity with an Experience component (RESEARCH A3): Combat surfaces as an XP-bearing entry alongside Woodcutting etc. The orchestrator re-keys component-relative experience.{xp,levelCap,level} to skill.<entityId>.{...} for FieldTable uniqueness across multiple skills."
    - "int64 as string in the ViewModel: GP/SlayerCoins are bigint in the FieldTable (T-02-06 precision) but rendered as string in the ViewModel — JSON/IPC-safe (a JSON number would lose precision past 2^53)."
    - "exactOptionalPropertyTypes discipline: unresolvedFields is omitted when absent (not set to undefined) — the branch exists for forward compatibility with a future plan that surfaces D-03 candidates."

key-files:
  created:
    - "src/save-parser.ts — parseSave orchestrator (wires spine + 3 region parsers into one FieldTable) + projectViewModel (offset-free ViewModel projection) + ParsedSave/ProjectionContext/SkillInfo types"
  modified: []

key-decisions:
  - "Single-entry orchestrator pattern: parseSave(buffer) → { fieldTable, viewModel } is the one function Phase 3/4/5 consume. No separate load/parse/project steps — one call produces both the offset-bearing FieldTable (patcher) and the offset-free ViewModel (UI)."
  - "ViewModel DERIVED by projection (SC-4 by construction): projectViewModel reads the authoritative wallet currencies FROM the FieldTable (so the ViewModel's summary reflects the wallet, NOT the readOnly header mirrors — SC-2) and maps the parsed data into the UI shape with NO offset at any depth. assertNoOffsets is the runtime proof."
  - "Deterministic re-parse (SC-4 / T-02-09): the walk re-derives offsets from reader.offset on every call — nothing cached or persisted. Two parseSave calls on the same buffer yield deep-equal FieldTables. Offsets never go stale."
  - "Bank located by component NAMES ('Wallet' + 'Inventory'), not a hard-coded entity ID (T-02-05): the fixture has MelvorBase:Layout (not in docs' Known Entity IDs); a hard-coded ID would break on a variant save. The generic walk finds the Bank by its component signature."
  - "Skill = any entity with an Experience component (RESEARCH A3): Combat surfaces as an XP-bearing entry alongside Woodcutting. The orchestrator re-keys component-relative experience.{xp,levelCap,level} to skill.<entityId>.{...} for FieldTable uniqueness across multiple skills (the parser is a pure structural parser; the orchestrator owns entity-level namespacing — 02-03 decision)."
  - "int64 as string in the ViewModel: GP/SlayerCoins are bigint in the FieldTable (T-02-06 precision enforced at type level by the discriminated union) but rendered as string in the ViewModel — JSON/IPC-safe (a JSON number would lose precision past 2^53). Phase 5 parses the string back to bigint for display."
  - "TAIL_BYTES = 36: the trailing 36-byte tail (ActionManager + RNG + SidebarFavouritesOptions + EventLog) the structural walk does NOT model. The entity list consumes exactly to buffer.length − 36 (verified empirically + pinned by 02-02's structural-walk test). Phase 4's round-trip preserves this tail byte-intact."
  - "Inventory stack FieldEntries keyed by bank.inventory.<itemId>@<qtyOffset>{,.placeholder,.locked}: the @<qtyOffset> ensures uniqueness for duplicate item IDs across tabs (D-01 — duplicate stacks are DISTINCT fields, NOT D-03 ambiguity). itemId encoded in the key (no separate string FieldEntry — variable-width, not a v1 edit target)."
  - "IO-01 marked COMPLETE: parseSave delivers the full IO-01 — Brotli-decompress + parse the documented layout (version → SaveHeader → entity list) + re-parse offsets fresh on every load (deterministic). REQUIREMENTS.md checkbox + status table updated."
  - "Carried esbuild-interop /* c8 ignore */ pattern from 01-02/01-03/02-01/02-02/02-03/02-04: header block + module closing brace. 100% coverage on all metrics without lowering the --100 threshold."

patterns-established:
  - "Single-entry orchestrator: one parseSave(buffer) function produces both the offset-bearing FieldTable (for the patcher) and the offset-free ViewModel (for the UI) from a single parse pass. The two artifacts share the parse but never share offsets (SC-4 boundary enforced by the type system)."
  - "Derived projection for the ViewModel: the UI shape is DERIVED from the parsed data, never a second parse. projectViewModel reads authoritative values FROM the FieldTable (so the ViewModel reflects the wallet, not the header mirror — SC-2) and maps the offset-free intermediate data into the UI shape."
  - "Component-name-based entity location: locate entities (Bank, skills) by their component signature, not by hard-coded entity IDs — variant saves with different IDs still parse (T-02-05)."
  - "int64-as-string at the boundary: bigint in the FieldTable (type-level precision), string in the ViewModel (JSON/IPC-safe). The boundary is the projection — Phase 5 parses the string back for display."

requirements-completed: [IO-01]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "parseSave(buffer) → { fieldTable, viewModel } — wires version → SaveHeader → 33-entity list → per-entity component walk, dispatches to parseWallet/findStacks/parseExperience at each boundary, assembles one FieldTable (IO-01, SC-1)"
    requirement: IO-01
    verification:
      - kind: unit
        ref: "test/save-parser.test.ts#parseSave — full fixture integration into one FieldTable (SC-1, SC-2) — version 20, summary Bob/Test, 689 stacks, Woodcutting xp/cap/level, wallet authoritative + header mirrors"
        status: pass
      - kind: automated
        ref: "npx c8 --100 --include 'src/save-parser.ts' --exclude 'test/**' tsx --test test/save-parser.test.ts → 100% lines/statements/functions/branches (D-04 gate)"
        status: pass
      - kind: automated
        ref: "npx tsc --noEmit → exit 0 (strict + noUncheckedIndexedAccess, D-07/D-08)"
        status: pass
    human_judgment: false
  - id: D2
    description: "SC-2: wallet GP/SlayerCoins authoritative (write targets); header GP/SlayerCoins readOnly mirrors in both FieldTable and ViewModel (Phase 3 never targets the header)"
    requirement: IO-01
    verification:
      - kind: unit
        ref: "test/save-parser.test.ts#parseSave — full fixture integration — asserts wallet.GoldPieces authoritative + header.GP readOnly+mirrors='wallet.GoldPieces'"
        status: pass
      - kind: unit
        ref: "test/save-parser.test.ts#parseSave — ViewModel projection — summary.gp reflects the wallet (authoritative), rendered as string"
        status: pass
    human_judgment: false
  - id: D3
    description: "SC-4: ViewModel is offset-free by construction (assertNoOffsets passes) + deterministic re-parse (two parseSave calls yield identical FieldTable offsets, nothing cached/persisted — T-02-09)"
    verification:
      - kind: unit
        ref: "test/save-parser.test.ts#parseSave — ViewModel projection from the full fixture (SC-1, SC-2, SC-4) — assertNoOffsets(viewModel) passes"
        status: pass
      - kind: unit
        ref: "test/save-parser.test.ts#parseSave — determinism: re-parse yields identical FieldTable offsets (SC-4, T-02-09)"
        status: pass
    human_judgment: false
  - id: D4
    description: "SC-5: an unknown/newer version parses with unknownVersion=true surfaced in the ViewModel (warn-but-parse — the walk is version-agnostic, the format is self-describing)"
    verification:
      - kind: unit
        ref: "test/save-parser.test.ts#parseSave — version tolerance: unknown version warns-but-parses (SC-5)"
        status: pass
    human_judgment: false
  - id: D5
    description: "projectViewModel branch coverage — the unresolvedFields forward-compatibility branch (exactOptionalPropertyTypes: omit when absent)"
    verification:
      - kind: unit
        ref: "test/save-parser.test.ts#projectViewModel — focused unit tests for branch coverage (unresolvedFields present + absent branches)"
        status: pass
    human_judgment: false

# Metrics
duration: 18min
completed: 2026-07-04
status: complete
---

# Phase 2 Plan 05: Save-Parser Orchestrator Summary

**parseSave(buffer) → { fieldTable, viewModel } — the single entry point wiring the structural spine + three region parsers into one FieldTable (IO-01 delivered end-to-end), with an offset-free derived ViewModel (SC-4), deterministic re-parse (SC-4/T-02-09), authoritative-vs-mirror currency flags (SC-2), and version tolerance (SC-5) — 100% line+branch coverage gated, 164 tests pass project-wide.**

## Performance

- **Duration:** ~18 min (subagent code execution + inline close-out)
- **Started:** 2026-07-04T03:35Z (subagent dispatch)
- **Completed:** 2026-07-04T03:53Z (inline close-out: SUMMARY + state)
- **Tasks:** 2 (Task 1: parseSave orchestration wiring spine + region parsers; Task 2: offset-free ViewModel projection + SC-4 determinism + SC-5 version tolerance)
- **Files modified:** 2 (src/save-parser.ts [created], test/save-parser.test.ts [created])

## Accomplishments

- **src/save-parser.ts** — `parseSave(buffer)` orchestrates `readVersion` + `parseSaveHeader` + `walkEntities`/`walkComponents` (02-02 spine), then for the Bank entity (located by component names 'Wallet'+'Inventory', not a hard-coded ID — T-02-05) calls `parseWallet` (02-03, authoritative int64 GP/SC) and `findStacks` (02-04, 689 stacks), and for every entity with an 'Experience' component (a skill — RESEARCH A3, Combat included) calls `parseExperience` (02-03, re-keyed to `skill.<entityId>.{xp,levelCap,level}`). Returns `{ fieldTable, viewModel }`.
- **projectViewModel(fieldTable, entityIds, context)** — derives the offset-free ViewModel by projection (SC-4 by construction). Reads authoritative wallet currencies FROM the FieldTable (so the ViewModel's summary reflects the wallet, NOT the readOnly header mirrors — SC-2). int64 GP/SC rendered as string (JSON/IPC-safe). bankItems/skills/entityIds from the offset-free ProjectionContext. `assertNoOffsets(viewModel)` passes.
- **IO-01 COMPLETE**: parseSave Brotli-decompresses a .sav (via Phase 1 codec, called by loadFixtureBuffer), walks the documented layout (version → SaveHeader → 33-entity list → per-entity component list), dispatches to the region parsers at each boundary, and re-derives offsets fresh on every call (deterministic). REQUIREMENTS.md checkbox + status table updated to Complete.
- **SC-1 proven**: full fixture parse — version 20, summary (Bob/Test), 689 bank stacks, skills (Woodcutting xp 7439645.2 / cap 120 / level 93 present), wallet GP/SC.
- **SC-2 proven**: wallet.GoldPieces + wallet.SlayerCoins `authoritative: true`; header.GP + header.SlayerCoins `readOnly: true` + `mirrors: 'wallet.GoldPieces'/'wallet.SlayerCoins'`. Phase 3's patcher reads the authoritative flag and never targets the header.
- **SC-4 proven**: (a) ViewModel is offset-free — `assertNoOffsets(viewModel)` passes; (b) deterministic re-parse — two `parseSave(buf)` calls yield deep-equal FieldTables (identical offsets, nothing cached/persisted — T-02-09).
- **SC-5 proven**: a version-bumped fixture buffer parses with `viewModel.unknownVersion=true` (warn-but-parse — the walk is version-agnostic).
- **D-04 coverage gate satisfied**: `npx c8 --100 --include 'src/save-parser.ts' --exclude 'test/**'` → 100% lines/statements/functions/branches.
- **Wave-merge gate green**: `npx c8 --100 --include 'src/**' --exclude 'test/**' npm test` → 164 tests pass, 100% coverage on all 10 src files (no regressions across Phase 1 codec/primitives + all Wave 1/2 parsers).

## Task Commits

Each task was committed atomically (TDD: RED → GREEN). The subagent completed the code work but returned prematurely before writing the SUMMARY/state; the close-out (SUMMARY + STATE/ROADMAP/REQUIREMENTS + this docs commit) was done inline.

1. **Task 1 RED: add failing parseSave orchestrator test suite** — `7418783` (test) — test/save-parser.test.ts (5 integration tests; src/save-parser.ts absent → MODULE_NOT_FOUND, the expected RED state).
2. **Task 1 GREEN: implement parseSave orchestrator wiring spine + region parsers** — `7556dd1` (feat) — src/save-parser.ts (parseSave + projectViewModel + ParsedSave/ProjectionContext/SkillInfo types); 4/4 Task 1 tests green; tsc clean.
3. **Task 2: add SC-4 determinism + SC-5 version tolerance + projectViewModel tests** — `bdb4c13` (test) — extended test/save-parser.test.ts to 5 tests (full fixture parse, ViewModel projection + assertNoOffsets, determinism, version tolerance, projectViewModel branch coverage); 5/5 green; c8 100% on src/save-parser.ts; wave-merge 164 tests pass.

## Files Created/Modified

- `src/save-parser.ts` (created) — parseSave orchestrator (wires 02-02 spine + 02-03/02-04 region parsers into one FieldTable) + projectViewModel (offset-free ViewModel projection, SC-4 by construction) + ParsedSave/ProjectionContext/SkillInfo types. Named imports; targeted `/* c8 ignore */` for esbuild __copyProps interop arm.
- `test/save-parser.test.ts` (created) — 5 node:test integration cases: full fixture parse (SC-1/SC-2), ViewModel projection + assertNoOffsets (SC-4), determinism (SC-4/T-02-09), version tolerance (SC-5), projectViewModel branch coverage (unresolvedFields forward-compat).

## Decisions Made

- **Single-entry orchestrator pattern** — `parseSave(buffer) → { fieldTable, viewModel }` is the one function Phase 3/4/5 consume. No separate load/parse/project steps — one call produces both the offset-bearing FieldTable (patcher) and the offset-free ViewModel (UI) from a single parse pass.
- **ViewModel DERIVED by projection (SC-4 by construction)** — projectViewModel reads authoritative wallet currencies FROM the FieldTable (so the ViewModel's summary reflects the wallet, NOT the readOnly header mirrors — SC-2) and maps the parsed data into the UI shape with NO offset at any depth. assertNoOffsets is the runtime proof.
- **Deterministic re-parse (SC-4 / T-02-09)** — the walk re-derives offsets from `reader.offset` on every call; nothing cached or persisted. Two parseSave calls on the same buffer yield deep-equal FieldTables. Offsets never go stale.
- **Bank located by component NAMES ('Wallet' + 'Inventory'), not a hard-coded entity ID (T-02-05)** — the fixture has `MelvorBase:Layout` (not in the docs' Known Entity IDs); a hard-coded ID would break on a variant save. The generic walk finds the Bank by its component signature.
- **Skill = any entity with an Experience component (RESEARCH A3)** — Combat surfaces as an XP-bearing entry alongside Woodcutting. The orchestrator re-keys component-relative `experience.{xp,levelCap,level}` to `skill.<entityId>.{...}` for FieldTable uniqueness across multiple skills (the parser is a pure structural parser; the orchestrator owns entity-level namespacing — 02-03 decision).
- **int64 as string in the ViewModel** — GP/SlayerCoins are bigint in the FieldTable (T-02-06 precision enforced at type level by the discriminated union) but rendered as string in the ViewModel — JSON/IPC-safe (a JSON number would lose precision past 2^53).
- **TAIL_BYTES = 36** — the trailing 36-byte tail (ActionManager + RNG + SidebarFavouritesOptions + EventLog) the structural walk does NOT model. The entity list consumes exactly to `buffer.length − 36`. Phase 4's round-trip preserves this tail byte-intact.
- **Inventory stack FieldEntries keyed by `bank.inventory.<itemId>@<qtyOffset>{,.placeholder,.locked}`** — the @<qtyOffset> ensures uniqueness for duplicate item IDs across tabs (D-01 — duplicate stacks are DISTINCT fields, NOT D-03 ambiguity). itemId encoded in the key (no separate string FieldEntry — variable-width, not a v1 edit target).
- **IO-01 marked COMPLETE** — parseSave delivers the full IO-01. REQUIREMENTS.md checkbox + status table updated.
- **Carried esbuild-interop /* c8 ignore */ pattern** — header block + module closing brace. 100% coverage on all metrics without lowering the --100 threshold.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Inline close-out (subagent returned prematurely before SUMMARY/state)**
- **Found during:** Post-subagent spot-check
- **Issue:** The gsd-executor subagent completed all code work (3 commits: RED → GREEN → Task 2 tests, 20 tests pass, c8 100%, tsc clean, git clean) but returned prematurely with the message "Now I'll write the SUMMARY.md and immediately commit it..." — same premature-return pattern observed in 01-03 and 02-04. SUMMARY.md, STATE.md, ROADMAP.md, and REQUIREMENTS.md (IO-01) were not updated.
- **Fix:** Inline close-out (same pattern as 01-03 and 02-04): wrote 02-05-SUMMARY.md from the existing commits + actual test/gate results, updated STATE.md (Plan 5 of 5 complete, Phase 02 complete), updated ROADMAP.md (Phase 02: 5/5 summaries), marked IO-01 Complete in REQUIREMENTS.md (checkbox + status table), and committed. No code changes — only bookkeeping.
- **Files modified:** .planning/phases/02-format-parser-fieldtable-model/02-05-SUMMARY.md (created), .planning/STATE.md, .planning/ROADMAP.md, .planning/REQUIREMENTS.md
- **Verification:** All gates re-verified green (20 save-parser tests, tsc clean, c8 100%, wave-merge 164 tests).
- **Committed in:** this docs commit.

---

**Total deviations:** 1 auto-fixed (1 blocking — Rule 3, inline close-out necessary because the subagent returned prematurely; no scope creep, only bookkeeping)
**Impact on plan:** The auto-fix completes the bookkeeping the subagent skipped. No scope creep — the implementation matches the plan's intent (parseSave + projectViewModel + SC-1/2/4/5). The --100 c8 threshold was NOT lowered.

## Issues Encountered

- **gsd-executor subagent premature return (3rd occurrence today)** — the 02-05 subagent completed all code work but returned before writing the SUMMARY/state (same pattern as 01-03; 02-04 no-op'd entirely). The opencode runtime's Task tool has been unreliable today for the bookkeeping phase (code execution succeeds; the final SUMMARY/state write is skipped). Resolved by inline close-out. This is a known runtime-reliability issue, not a plan issue — the code is fully correct and gated.

## Authentication Gates

None — Phase 2 is a pure local parser library with no auth/session/network surface.

## User Setup Required

None — no external service configuration required. parseSave uses the Phase 1 codec (decompress) + BinaryReader + the Wave 1/2 parsers; the fixture is committed at test/fixtures/test-fixture.sav (D-10).

## Next Phase Readiness

- **Phase 2 is now COMPLETE (5/5 plans, IO-01 delivered)** — parseSave(buffer) → { fieldTable, viewModel } is the single entry point Phase 3 (patcher) and Phase 5 (UI) consume. All 10 src files at 100% coverage, 164 tests passing project-wide.
- **Phase 3 (Patcher + Validation + XP Table)** can consume `parseSave(buffer).fieldTable` — reads `{ offset, kind, width, value }` per writable field for same-width in-place edits. The authoritative flag steers currency writes to the wallet (never the header mirror — SC-2). The offset-keyed inventory stacks (bank.inventory.<itemId>@<qtyOffset>) support independent edits of duplicate items across tabs.
- **Phase 5 (Browse + Edit UI)** can consume `parseSave(buffer).viewModel` — renders the offset-free summary/bankItems/skills/entityIds. int64 currencies are string (JSON/IPC-safe).
- **Phase 4 (Electron Shell)** wraps parseSave in the main process; the FieldTable stays in main (offsets never cross IPC), the ViewModel is the IPC payload (SC-4 boundary enforced by the type system).
- **No blockers.** The inline close-out deviation is stable. Phase 2 is ready for verification (`/gsd-verify-work 02`) and transition to Phase 3.

---
*Phase: 02-format-parser-fieldtable-model*
*Completed: 2026-07-04*

## Self-Check: PASSED

- src/save-parser.ts — FOUND (334 lines)
- test/save-parser.test.ts — FOUND (422 lines, 5 tests)
- .planning/phases/02-format-parser-fieldtable-model/02-05-SUMMARY.md — FOUND
- Commit 7418783 (RED) — FOUND in git log
- Commit 7556dd1 (Task 1 GREEN) — FOUND in git log
- Commit bdb4c13 (Task 2 tests) — FOUND in git log
- SUMMARY frontmatter status: complete — FOUND
- Gates re-verified green: `npx tsx --test test/save-parser.test.ts` (5 pass, 0 fail); `npx tsc --noEmit` (exit 0); `npx c8 --100 --include 'src/save-parser.ts' --exclude 'test/**'` (100% lines/statements/functions/branches, exit 0); wave-merge `npx c8 --100 --include 'src/**' --exclude 'test/**' npm test` (164 tests pass, 100% on all 10 src files)
- IO-01 marked Complete in REQUIREMENTS.md (checkbox + status table)
- SC-1 (full fixture parse), SC-2 (authoritative vs mirror), SC-4 (offset-free ViewModel + deterministic re-parse), SC-5 (version tolerance) all proven and gated
